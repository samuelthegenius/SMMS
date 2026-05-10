-- ============================================================================
-- MIGRATION: Rename admin role to it_admin
-- ============================================================================
-- This migration renames the 'admin' role to 'it_admin' to clarify that
-- this role is for IT administration only, not facility management.
-- Facility management now has: facility_manager, maintenance_supervisor, team_lead
-- ============================================================================

-- Step 1: Update the profiles table role constraint to include it_admin instead of admin
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;

ALTER TABLE profiles ADD CONSTRAINT profiles_role_check 
    CHECK (role IN (
        'student', 
        'staff',
        'facility_manager',       -- Head of Works Department
        'maintenance_supervisor', -- Oversees all technicians
        'team_lead',             -- Team leader (electrical, plumbing, etc.)
        'technician', 
        'src', 
        'porter',
        'it_admin'               -- IT Administrator (renamed from admin)
    ));

-- Step 2: Migrate existing data - rename all 'admin' roles to 'it_admin'
UPDATE profiles SET role = 'it_admin' WHERE role = 'admin';

-- Step 3: Update role_access_codes - rename admin entry to it_admin
UPDATE role_access_codes SET role = 'it_admin' WHERE role = 'admin';

-- If no it_admin entry exists, create one (you'll need to manually set the code)
INSERT INTO role_access_codes (role, code) 
SELECT 'it_admin', 'ITADMIN2026!'
WHERE NOT EXISTS (SELECT 1 FROM role_access_codes WHERE role = 'it_admin');

-- Step 4: Update all functions that reference the admin role

-- Update is_admin() function to check for it_admin
CREATE OR REPLACE FUNCTION is_admin()
RETURNS boolean AS $$
BEGIN
    RETURN EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'it_admin');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION is_admin() IS 'Check if user is IT admin (role = it_admin). Kept for backward compatibility.';

-- Create new is_it_admin() function for clarity
CREATE OR REPLACE FUNCTION is_it_admin()
RETURNS boolean AS $$
BEGIN
    RETURN EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'it_admin');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION is_it_admin() IS 'Check if user is IT admin (role = it_admin). Preferred over is_admin().';

-- Step 5: Update validate_access_code function
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
        'facility_manager', 'maintenance_supervisor', 'team_lead', 'it_admin'
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

-- Step 6: Update register_secure_user function
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
BEGIN
    -- Rate limit
    IF NOT check_rate_limit('signup_' || p_email, 'signup', 3, 900) THEN
        RAISE EXCEPTION 'Too many signup attempts. Please try again later.';
    END IF;

    -- Validate role (prevent it_admin registration through public API)
    IF p_role NOT IN (
        'student', 'staff', 'technician', 'src', 'porter',
        'facility_manager', 'maintenance_supervisor', 'team_lead'
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

    -- Auto-assign department for facility management roles
    INSERT INTO profiles (id, email, full_name, role, identification_number, department, is_on_duty, created_at)
    VALUES (
        p_id, 
        p_email, 
        p_full_name, 
        p_role, 
        p_id_number, 
        CASE 
            WHEN p_role IN ('facility_manager', 'maintenance_supervisor', 'team_lead', 'technician') 
                THEN 'Works Department'
            ELSE p_department 
        END, 
        true, 
        now()
    )
    ON CONFLICT (id) DO UPDATE SET
        full_name = EXCLUDED.full_name,
        role = EXCLUDED.role,
        identification_number = EXCLUDED.identification_number,
        department = EXCLUDED.department;

    -- Add skills for technician and team_lead roles
    IF p_skills IS NOT NULL AND array_length(p_skills, 1) > 0 THEN
        INSERT INTO technician_skills (profile_id, skill)
        SELECT p_id, unnest(p_skills)
        ON CONFLICT (profile_id, skill) DO NOTHING;
    END IF;

    RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Step 7: Update can_manage_technicians (admin/it_admin excluded)
CREATE OR REPLACE FUNCTION can_manage_technicians(p_user_id uuid)
RETURNS boolean AS $$
DECLARE
    v_role text;
BEGIN
    SELECT role INTO v_role
    FROM profiles
    WHERE id = p_user_id;
    
    -- Facility management roles only - it_admin is IT, not facilities
    RETURN v_role IN ('facility_manager', 'maintenance_supervisor', 'team_lead');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Step 8: Update can_reassign_technicians (admin/it_admin excluded)
CREATE OR REPLACE FUNCTION can_reassign_technicians(p_user_id uuid)
RETURNS boolean AS $$
DECLARE
    v_role text;
BEGIN
    SELECT role INTO v_role
    FROM profiles
    WHERE id = p_user_id;
    
    -- Senior facility management only
    RETURN v_role IN ('facility_manager', 'maintenance_supervisor');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Step 9: Update verify_access_code to reference it_admin
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
        'facility_manager', 'maintenance_supervisor', 'team_lead', 'it_admin'
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

-- Step 10: Rename get_admin_tickets to get_it_admin_tickets
DROP FUNCTION IF EXISTS get_admin_tickets() CASCADE;

CREATE OR REPLACE FUNCTION get_it_admin_tickets()
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
    creator_role text,
    technician_full_name text,
    technician_email text,
    technician_department text
) AS $$
DECLARE
    v_user_role text;
BEGIN
    -- Verify it_admin role
    SELECT role INTO v_user_role 
    FROM profiles 
    WHERE id = auth.uid();
    
    IF v_user_role != 'it_admin' THEN
        RAISE EXCEPTION 'Access denied. IT Admin role required.';
    END IF;
    
    -- Return only IT & Networking tickets
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
        creator.role as creator_role,
        technician.full_name as technician_full_name,
        technician.email as technician_email,
        technician.department as technician_department
    FROM tickets t
    LEFT JOIN profiles creator ON t.created_by = creator.id
    LEFT JOIN profiles technician ON t.assigned_to = technician.id
    WHERE t.category = 'IT & Networking'
    ORDER BY t.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION get_it_admin_tickets() TO authenticated;
GRANT EXECUTE ON FUNCTION get_it_admin_tickets() TO service_role;

COMMENT ON FUNCTION get_it_admin_tickets() IS 'IT Admin tickets function - scoped to IT & Networking category only.';

-- Step 11: Update get_supervisor_all_tickets to exclude it_admin
DROP FUNCTION IF EXISTS get_supervisor_all_tickets() CASCADE;

CREATE OR REPLACE FUNCTION get_supervisor_all_tickets()
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
    creator_role text,
    technician_full_name text,
    technician_email text,
    technician_department text
) AS $$
DECLARE
    v_user_role text;
BEGIN
    -- Verify supervisor/manager role (it_admin excluded - they use get_it_admin_tickets)
    SELECT role INTO v_user_role 
    FROM profiles 
    WHERE id = auth.uid();
    
    IF v_user_role NOT IN ('facility_manager', 'maintenance_supervisor', 'team_lead', 'src') THEN
        RAISE EXCEPTION 'Access denied. Supervisor role required.';
    END IF;
    
    -- Return all tickets for facility management oversight
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
        creator.role as creator_role,
        technician.full_name as technician_full_name,
        technician.email as technician_email,
        technician.department as technician_department
    FROM tickets t
    LEFT JOIN profiles creator ON t.created_by = creator.id
    LEFT JOIN profiles technician ON t.assigned_to = technician.id
    ORDER BY t.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION get_supervisor_all_tickets() TO authenticated;
GRANT EXECUTE ON FUNCTION get_supervisor_all_tickets() TO service_role;

COMMENT ON FUNCTION get_supervisor_all_tickets() IS 'Supervisor tickets function - facility management roles can view all tickets for oversight. it_admin excluded.';

-- Step 12: Update RLS policies to use it_admin

-- Drop old admin policies
DROP POLICY IF EXISTS "Admins can view all tickets" ON tickets;
DROP POLICY IF EXISTS "Admins have full access to tickets" ON tickets;
DROP POLICY IF EXISTS "Admins can view IT tickets" ON tickets;
DROP POLICY IF EXISTS "Admins have full access to IT tickets" ON tickets;

-- Create new it_admin policies
CREATE POLICY "IT Admins can view IT tickets"
    ON tickets FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE id = auth.uid() AND role = 'it_admin'
        )
        AND category = 'IT & Networking'
    );

CREATE POLICY "IT Admins have full access to IT tickets"
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

-- Update profiles policies
DROP POLICY IF EXISTS "Admins can update all profiles" ON profiles;
DROP POLICY IF EXISTS "Strict profile visibility" ON profiles;

CREATE POLICY "IT Admins can update all profiles"
    ON profiles FOR UPDATE
    TO authenticated
    USING (is_it_admin());

-- Recreate profile visibility with it_admin
CREATE POLICY "Strict profile visibility"
    ON profiles FOR SELECT
    TO authenticated
    USING (
        id = auth.uid() 
        OR is_it_admin()
        OR id IN (
            SELECT assigned_to FROM tickets 
            WHERE created_by = auth.uid() AND assigned_to IS NOT NULL
        )
        OR id IN (
            SELECT created_by FROM tickets 
            WHERE assigned_to = auth.uid()
        )
    );

-- Update other table policies
DROP POLICY IF EXISTS "Departments manageable by admins" ON departments;
DROP POLICY IF EXISTS "Facility types manageable by admins" ON facility_types;
DROP POLICY IF EXISTS "Categories manageable by admins" ON maintenance_categories;
DROP POLICY IF EXISTS "Access codes viewable by admins" ON role_access_codes;
DROP POLICY IF EXISTS "Access codes manageable by admins" ON role_access_codes;
DROP POLICY IF EXISTS "Security events viewable by admins only" ON security_events;

CREATE POLICY "Departments manageable by IT admins" ON departments
    FOR ALL TO authenticated USING (is_it_admin());

CREATE POLICY "Facility types manageable by IT admins" ON facility_types
    FOR ALL TO authenticated USING (is_it_admin());

CREATE POLICY "Categories manageable by IT admins" ON maintenance_categories
    FOR ALL TO authenticated USING (is_it_admin());

CREATE POLICY "Access codes viewable by IT admins" ON role_access_codes
    FOR SELECT TO authenticated USING (is_it_admin());

CREATE POLICY "Access codes manageable by IT admins" ON role_access_codes
    FOR ALL TO authenticated USING (is_it_admin()) WITH CHECK (is_it_admin());

CREATE POLICY "Security events viewable by IT admins only" ON security_events
    FOR SELECT TO authenticated USING (is_it_admin());

-- Update technician_skills policy
DROP POLICY IF EXISTS "Users can insert own skills" ON technician_skills;
DROP POLICY IF EXISTS "Users can delete own skills" ON technician_skills;

CREATE POLICY "Users can insert own skills"
    ON technician_skills FOR INSERT
    TO authenticated
    WITH CHECK (
        auth.uid() = profile_id OR
        is_it_admin()
    );

CREATE POLICY "Users can delete own skills"
    ON technician_skills FOR DELETE
    TO authenticated
    USING (
        auth.uid() = profile_id OR
        is_it_admin()
    );

-- Step 13: Update other functions that reference admin role

-- Update handle_satisfaction_feedback to reference it_admin
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

-- Step 14: Create can_manage_it_tickets function
CREATE OR REPLACE FUNCTION can_manage_it_tickets(p_user_id uuid)
RETURNS boolean AS $$
DECLARE
    v_role text;
BEGIN
    SELECT role INTO v_role
    FROM profiles
    WHERE id = p_user_id;
    
    RETURN v_role = 'it_admin';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION can_manage_it_tickets(uuid) TO authenticated;

-- Step 15: Grant permissions for new functions
GRANT EXECUTE ON FUNCTION is_it_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION can_manage_technicians(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION can_reassign_technicians(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION get_supervisor_all_tickets() TO authenticated;

-- Add comments
COMMENT ON FUNCTION is_admin IS 'Backward compatibility - checks for it_admin role. Use is_it_admin() for new code.';
COMMENT ON FUNCTION is_it_admin IS 'Check if current user has it_admin role (IT Administrator)';
COMMENT ON FUNCTION can_manage_technicians IS 'Check if user can manage technicians (facility_manager, maintenance_supervisor, team_lead). it_admin excluded - they manage IT, not facilities.';
COMMENT ON FUNCTION can_reassign_technicians IS 'Check if user can reassign technicians (facility_manager, maintenance_supervisor). it_admin excluded.';
COMMENT ON FUNCTION get_supervisor_tickets IS 'Get tickets for a department - requires facility_manager, maintenance_supervisor, or team_lead role. it_admin excluded - use get_it_admin_tickets for IT scope.';

-- Migration complete
SELECT 'Migration: Renamed admin to it_admin successfully' as status;
