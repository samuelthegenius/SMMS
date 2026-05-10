-- ============================================================================
-- MIGRATION: Unified Role Hierarchy with Department-Aware Assignment
-- ============================================================================
-- This migration restructures roles into a unified hierarchy:
-- - manager: Department head (facility_manager -> manager + Works)
-- - supervisor: Senior oversight (maintenance_supervisor -> supervisor + Works)
-- - team_lead: Team leader with skill-based department assignment
-- - technician: Worker with skill-based department assignment
-- - it_admin: IT system administration (separate from operational hierarchy)
-- - staff: General staff (academic/administrative departments)
-- - student, src, porter: Unchanged
-- ============================================================================

-- ============================================================================
-- STEP 1: Temporarily drop constraint to allow data migration
-- ============================================================================

ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;

-- ============================================================================
-- STEP 2: Migrate existing data to new role structure
-- ============================================================================

-- Handle all legacy role values that need migration
-- admin -> it_admin (from previous migrations that may have been missed)
UPDATE profiles 
SET role = 'it_admin', 
    department = COALESCE(department, 'IT Support & Infrastructure')
WHERE role = 'admin';

-- facility_manager -> manager with Works Department
UPDATE profiles 
SET role = 'manager', 
    department = COALESCE(department, 'Works Department')
WHERE role = 'facility_manager';

-- maintenance_supervisor -> supervisor with Works Department
UPDATE profiles 
SET role = 'supervisor', 
    department = COALESCE(department, 'Works Department')
WHERE role = 'maintenance_supervisor';

-- dean -> staff (deprecated role, convert to staff)
UPDATE profiles 
SET role = 'staff'
WHERE role = 'dean';

-- Handle any NULL roles (set to student as default)
UPDATE profiles 
SET role = 'student'
WHERE role IS NULL;

-- ============================================================================
-- STEP 3: Add new role constraint (after data is migrated)
-- ============================================================================

ALTER TABLE profiles ADD CONSTRAINT profiles_role_check 
    CHECK (role IN (
        'student', 
        'staff',
        'manager',          -- Department head (replaces facility_manager)
        'supervisor',       -- Senior oversight (replaces maintenance_supervisor)
        'team_lead',        -- Team leader (skill determines department)
        'technician',       -- Worker (skill determines department)
        'it_admin',         -- IT system administration
        'src', 
        'porter'
    ));

-- ============================================================================
-- STEP 4: Create department lookup from skills
-- ============================================================================

-- Create a function to determine department from skills
CREATE OR REPLACE FUNCTION get_department_from_skills(p_skills text[])
RETURNS text AS $$
BEGIN
    IF p_skills IS NULL OR array_length(p_skills, 1) = 0 THEN
        RETURN 'Works Department';
    END IF;
    
    -- Check for IT-related skills
    IF p_skills && ARRAY['IT & Networking', 'IT Support', 'Network Administration', 'System Administration'] THEN
        RETURN 'IT Support & Infrastructure';
    END IF;
    
    -- Default for all other technical skills
    RETURN 'Works Department';
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ============================================================================
-- STEP 5: Create unified register_secure_user function
-- ============================================================================

DROP FUNCTION IF EXISTS register_secure_user(
    uuid, text, text, text, text, text, text[], text
);

CREATE OR REPLACE FUNCTION register_secure_user(
    p_id uuid,
    p_email text,
    p_full_name text,
    p_role text,
    p_id_number text,
    p_department text,
    p_skills text[],
    p_access_code text
)
RETURNS boolean AS $$
DECLARE
    expected_code text;
    v_department text;
BEGIN
    -- Rate limit
    IF NOT check_rate_limit('signup_' || p_email, 'signup', 3, 900) THEN
        RAISE EXCEPTION 'Too many signup attempts. Please try again later.';
    END IF;

    -- Validate role (prevent it_admin and manager registration through public API)
    IF p_role NOT IN (
        'student', 'staff', 'technician', 'src', 'porter',
        'supervisor', 'team_lead'
    ) THEN
        RAISE EXCEPTION 'Role % registration is not permitted', p_role;
    END IF;

    -- Check access code for ALL allowed roles
    SELECT code INTO expected_code
    FROM role_access_codes
    WHERE role = p_role;

    IF expected_code IS NULL OR p_access_code IS NULL OR p_access_code <> expected_code THEN
        RAISE EXCEPTION 'Invalid access code';
    END IF;

    -- Check for duplicate ID number
    IF EXISTS (SELECT 1 FROM profiles WHERE identification_number = p_id_number) THEN
        RAISE EXCEPTION 'Identification number already registered';
    END IF;

    -- Determine department based on role and skills
    v_department := CASE 
        -- Manager/Supervisor: use provided department or default to Works
        WHEN p_role IN ('manager', 'supervisor') THEN
            COALESCE(p_department, 'Works Department')
        
        -- Team Lead and Technician: derive from skills
        WHEN p_role IN ('team_lead', 'technician') THEN
            get_department_from_skills(p_skills)
        
        -- All other roles: use provided department
        ELSE COALESCE(p_department, 'Unassigned')
    END;

    -- Insert or update profile
    INSERT INTO profiles (id, email, full_name, role, identification_number, department, is_on_duty, created_at)
    VALUES (p_id, p_email, p_full_name, p_role, p_id_number, v_department, true, now())
    ON CONFLICT (id) DO UPDATE SET
        full_name = EXCLUDED.full_name,
        role = EXCLUDED.role,
        identification_number = EXCLUDED.identification_number,
        department = EXCLUDED.department;

    -- Add skills for team_lead and technician roles
    IF p_skills IS NOT NULL AND array_length(p_skills, 1) > 0 THEN
        INSERT INTO technician_skills (profile_id, skill)
        SELECT p_id, unnest(p_skills)
        ON CONFLICT (profile_id, skill) DO NOTHING;
    END IF;

    RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- STEP 6: Update role_access_codes for new hierarchy
-- ============================================================================

-- Migrate existing codes
UPDATE role_access_codes SET role = 'manager' WHERE role = 'facility_manager';
UPDATE role_access_codes SET role = 'supervisor' WHERE role = 'maintenance_supervisor';

-- Ensure codes exist for all roles
INSERT INTO role_access_codes (role, code) VALUES
    ('manager', 'MGR2026!'),
    ('supervisor', 'SUP2026!'),
    ('team_lead', 'LEAD2026!'),
    ('technician', 'TECH2026!'),
    ('it_admin', 'ITADMIN2026!'),
    ('student', 'STU2026!'),
    ('staff', 'STAFF2026!'),
    ('src', 'SRC2026!'),
    ('porter', 'PORT2026!')
ON CONFLICT (role) DO UPDATE SET code = EXCLUDED.code;

-- ============================================================================
-- STEP 7: Update permission functions for unified hierarchy
-- ============================================================================

-- Check if user is at manager level (can manage entire department)
CREATE OR REPLACE FUNCTION is_department_manager(p_user_id uuid DEFAULT auth.uid())
RETURNS boolean AS $$
DECLARE
    v_role text;
BEGIN
    SELECT role INTO v_role
    FROM profiles
    WHERE id = p_user_id;
    
    RETURN v_role IN ('manager', 'it_admin');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Check if user can manage technicians (supervisor level and above)
CREATE OR REPLACE FUNCTION can_manage_technicians(p_user_id uuid DEFAULT auth.uid())
RETURNS boolean AS $$
DECLARE
    v_role text;
BEGIN
    SELECT role INTO v_role
    FROM profiles
    WHERE id = p_user_id;
    
    RETURN v_role IN ('manager', 'supervisor', 'team_lead', 'it_admin');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Check if user can reassign technicians (senior level only)
CREATE OR REPLACE FUNCTION can_reassign_technicians(p_user_id uuid DEFAULT auth.uid())
RETURNS boolean AS $$
DECLARE
    v_role text;
BEGIN
    SELECT role INTO v_role
    FROM profiles
    WHERE id = p_user_id;
    
    RETURN v_role IN ('manager', 'supervisor', 'it_admin');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Check if user is IT admin
CREATE OR REPLACE FUNCTION is_it_admin(p_user_id uuid DEFAULT auth.uid())
RETURNS boolean AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM profiles 
        WHERE id = p_user_id AND role = 'it_admin'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get user's department
CREATE OR REPLACE FUNCTION get_user_department(p_user_id uuid DEFAULT auth.uid())
RETURNS text AS $$
DECLARE
    v_department text;
BEGIN
    SELECT department INTO v_department
    FROM profiles
    WHERE id = p_user_id;
    
    RETURN v_department;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- STEP 8: Update verify_access_code function
-- ============================================================================

CREATE OR REPLACE FUNCTION verify_access_code(
    p_role text,
    p_code text
)
RETURNS boolean AS $$
DECLARE
    expected_code text;
BEGIN
    IF p_role NOT IN (
        'student', 'staff', 'technician', 'src', 'porter',
        'manager', 'supervisor', 'team_lead', 'it_admin'
    ) THEN
        RETURN false;
    END IF;

    SELECT code INTO expected_code
    FROM role_access_codes
    WHERE role = p_role;

    IF expected_code IS NULL THEN RETURN false; END IF;
    RETURN p_code = expected_code;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- STEP 9: Update validate_access_code function
-- ============================================================================

CREATE OR REPLACE FUNCTION validate_access_code(
    p_role text,
    p_code text
)
RETURNS boolean AS $$
DECLARE
    expected_code text;
BEGIN
    IF p_role NOT IN (
        'student', 'staff', 'technician', 'src', 'porter',
        'manager', 'supervisor', 'team_lead', 'it_admin'
    ) THEN
        RETURN false;
    END IF;

    SELECT code INTO expected_code
    FROM role_access_codes
    WHERE role = p_role;

    IF expected_code IS NULL THEN RETURN false; END IF;
    RETURN p_code = expected_code;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- STEP 10: Update get_supervisor_tickets to use unified hierarchy
-- ============================================================================

DROP FUNCTION IF EXISTS get_supervisor_tickets(text);

CREATE OR REPLACE FUNCTION get_department_tickets(
    p_department text DEFAULT NULL
)
RETURNS TABLE (
    ticket_id uuid,
    title text,
    description text,
    category text,
    facility_type text,
    specific_location text,
    status text,
    priority text,
    created_at timestamptz,
    updated_at timestamptz,
    assigned_to uuid,
    created_by uuid,
    creator_full_name text,
    creator_email text,
    creator_department text,
    technician_full_name text,
    technician_email text,
    technician_department text
) AS $$
DECLARE
    v_user_role text;
    v_user_id uuid;
    v_user_department text;
BEGIN
    v_user_id := auth.uid();
    
    -- Get user info
    SELECT role, department INTO v_user_role, v_user_department
    FROM profiles
    WHERE id = v_user_id;
    
    -- Check permissions
    IF v_user_role NOT IN ('manager', 'supervisor', 'team_lead', 'it_admin') THEN
        RAISE EXCEPTION 'Access denied. Supervisor role required.';
    END IF;

    -- Use provided department or fall back to user's department
    v_user_department := COALESCE(p_department, v_user_department);

    -- Return tickets for the department
    RETURN QUERY
    SELECT 
        t.id as ticket_id,
        t.title,
        t.description,
        t.category,
        t.facility_type,
        t.specific_location,
        t.status,
        t.priority,
        t.created_at,
        t.updated_at,
        t.assigned_to,
        t.created_by,
        creator.full_name as creator_full_name,
        creator.email as creator_email,
        creator.department as creator_department,
        tech.full_name as technician_full_name,
        tech.email as technician_email,
        tech.department as technician_department
    FROM tickets t
    LEFT JOIN profiles creator ON t.created_by = creator.id
    LEFT JOIN profiles tech ON t.assigned_to = tech.id
    WHERE 
        -- For IT admin: show IT tickets regardless of department
        (v_user_role = 'it_admin' AND t.category = 'IT & Networking')
        OR
        -- For others: show tickets matching their department or category
        (v_user_role != 'it_admin' AND 
         (t.department = v_user_department OR 
          t.category = ANY(
              SELECT ts.skill FROM technician_skills ts 
              WHERE ts.profile_id = v_user_id
          )))
    ORDER BY 
        CASE t.priority 
            WHEN 'High' THEN 1 
            WHEN 'Medium' THEN 2 
            ELSE 3 
        END,
        t.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- STEP 11: Create function to get team members (for team leads)
-- ============================================================================

CREATE OR REPLACE FUNCTION get_team_members()
RETURNS TABLE (
    member_id uuid,
    full_name text,
    email text,
    role text,
    skills text[],
    is_on_duty boolean,
    current_workload bigint
) AS $$
DECLARE
    v_user_id uuid;
    v_user_role text;
    v_user_department text;
    v_user_skills text[];
BEGIN
    v_user_id := auth.uid();
    
    -- Get current user's info
    SELECT p.role, p.department, array_agg(ts.skill)
    INTO v_user_role, v_user_department, v_user_skills
    FROM profiles p
    LEFT JOIN technician_skills ts ON p.id = ts.profile_id
    WHERE p.id = v_user_id
    GROUP BY p.id, p.role, p.department;
    
    -- Only team leads, supervisors, and managers can view team members
    IF v_user_role NOT IN ('manager', 'supervisor', 'team_lead') THEN
        RAISE EXCEPTION 'Access denied. Leadership role required.';
    END IF;

    -- Return team members
    RETURN QUERY
    SELECT 
        p.id as member_id,
        p.full_name,
        p.email,
        p.role,
        array_agg(ts.skill) as skills,
        p.is_on_duty,
        COUNT(t.id) as current_workload
    FROM profiles p
    LEFT JOIN technician_skills ts ON p.id = ts.profile_id
    LEFT JOIN tickets t ON p.id = t.assigned_to AND t.status IN ('Open', 'In Progress')
    WHERE 
        -- Same department for managers/supervisors
        (v_user_role IN ('manager', 'supervisor') AND p.department = v_user_department)
        OR
        -- Matching skills for team leads
        (v_user_role = 'team_lead' AND ts.skill = ANY(v_user_skills))
    GROUP BY p.id, p.full_name, p.email, p.role, p.is_on_duty
    ORDER BY current_workload ASC, p.full_name;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- STEP 12: Update RLS policies
-- ============================================================================

-- Update tickets policies
DROP POLICY IF EXISTS "IT Admins can view IT tickets" ON tickets;
DROP POLICY IF EXISTS "IT Admins have full access to IT tickets" ON tickets;

-- Managers and supervisors can view all tickets in their department
CREATE POLICY "Department managers can view all department tickets"
    ON tickets FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE id = auth.uid() 
            AND role IN ('manager', 'supervisor')
            AND department = tickets.department
        )
    );

-- Team leads can view tickets matching their skills
CREATE POLICY "Team leads can view matching category tickets"
    ON tickets FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM profiles p
            JOIN technician_skills ts ON p.id = ts.profile_id
            WHERE p.id = auth.uid() 
            AND p.role = 'team_lead'
            AND ts.skill = tickets.category
        )
    );

-- IT admins can manage IT tickets
CREATE POLICY "IT admins can manage IT tickets"
    ON tickets FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE id = auth.uid() AND role = 'it_admin'
        )
        AND category = 'IT & Networking'
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE id = auth.uid() AND role = 'it_admin'
        )
        AND category = 'IT & Networking'
    );

-- ============================================================================
-- STEP 13: Update other functions to use new hierarchy
-- ============================================================================

-- Update handle_satisfaction_feedback to use it_admin
CREATE OR REPLACE FUNCTION handle_satisfaction_feedback()
RETURNS TRIGGER AS $$
DECLARE
    v_rejection_threshold INTEGER := 2;
    v_src_user_id UUID;
BEGIN
    IF OLD.satisfaction_status IS DISTINCT FROM NEW.satisfaction_status THEN
        NEW.satisfaction_submitted_at := NOW();
        
        IF NEW.satisfaction_status = 'unsatisfied' THEN
            NEW.rejection_count := COALESCE(OLD.rejection_count, 0) + 1;
            NEW.status := 'In Progress';
            
            IF NEW.rejection_count >= v_rejection_threshold THEN
                NEW.status := 'Escalated';
                NEW.priority := 'High';
                
                SELECT id INTO v_src_user_id
                FROM profiles WHERE role = 'src' LIMIT 1;
                
                IF v_src_user_id IS NOT NULL THEN
                    INSERT INTO notifications (user_id, ticket_id, message)
                    VALUES (v_src_user_id, NEW.id,
                        'ESCALATION: Ticket "' || NEW.title || '" rejected ' || 
                        NEW.rejection_count || ' times. Requires intervention.');
                END IF;
                
                INSERT INTO notifications (user_id, ticket_id, message)
                SELECT id, NEW.id, 'ESCALATION: High-priority ticket requires intervention'
                FROM profiles WHERE role = 'it_admin' LIMIT 1;
            ELSE
                IF NEW.assigned_to IS NOT NULL THEN
                    INSERT INTO notifications (user_id, ticket_id, message)
                    VALUES (NEW.assigned_to, NEW.id,
                        'REWORK NEEDED: "' || NEW.title || '" rejected (#' || 
                        NEW.rejection_count || '). ' || 
                        COALESCE(LEFT(NEW.customer_feedback, 50), 'No feedback'));
                END IF;
            END IF;
            
        ELSIF NEW.satisfaction_status = 'satisfied' THEN
            NEW.status := 'Resolved';
            NEW.updated_at := NOW();
            
            IF NEW.assigned_to IS NOT NULL AND NEW.rating IS NOT NULL THEN
                INSERT INTO notifications (user_id, ticket_id, message)
                VALUES (NEW.assigned_to, NEW.id,
                    'Positive feedback! Rating: ' || NEW.rating || '/5 stars');
            END IF;
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- STEP 14: Grant permissions
-- ============================================================================

GRANT EXECUTE ON FUNCTION is_department_manager(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION can_manage_technicians(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION can_reassign_technicians(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION is_it_admin(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION get_user_department(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION get_department_tickets(text) TO authenticated;
GRANT EXECUTE ON FUNCTION get_team_members() TO authenticated;
GRANT EXECUTE ON FUNCTION get_department_from_skills(text[]) TO authenticated;

-- ============================================================================
-- STEP 15: Add comments
-- ============================================================================

COMMENT ON FUNCTION is_department_manager IS 'Check if user is a department manager (manager or it_admin role)';
COMMENT ON FUNCTION can_manage_technicians IS 'Check if user can manage technicians (manager, supervisor, team_lead, or it_admin)';
COMMENT ON FUNCTION can_reassign_technicians IS 'Check if user can reassign technicians (manager, supervisor, or it_admin)';
COMMENT ON FUNCTION is_it_admin IS 'Check if user is IT admin';
COMMENT ON FUNCTION get_user_department IS 'Get the department of a user';
COMMENT ON FUNCTION get_department_tickets IS 'Get tickets for a department - requires manager, supervisor, team_lead, or it_admin role';
COMMENT ON FUNCTION get_team_members IS 'Get team members for leadership roles';
COMMENT ON FUNCTION get_department_from_skills IS 'Determine department based on technician skills array';

COMMENT ON FUNCTION register_secure_user IS 'Register a new user with unified role hierarchy and skill-based department assignment';

-- ============================================================================
-- STEP 16: Seed IT Support & Infrastructure department if not exists
-- ============================================================================

INSERT INTO departments (name) VALUES ('IT Support & Infrastructure')
ON CONFLICT (name) DO NOTHING;

-- ============================================================================
-- Migration complete
-- ============================================================================
SELECT 'Migration: Unified role hierarchy with department-aware assignment completed successfully' as status;
