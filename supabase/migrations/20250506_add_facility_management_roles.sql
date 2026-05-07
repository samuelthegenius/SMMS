-- ============================================================================
-- MIGRATION: Add Facility Management Supervisor Roles
-- ============================================================================
-- This migration adds new roles for facility management hierarchy:
-- - facility_manager: Head of Works Department (full oversight)
-- - maintenance_supervisor: Oversees all technicians
-- - team_lead: Leads specific maintenance teams (electrical, plumbing, etc.)
-- ============================================================================

-- Step 1: Update the profiles table role constraint
-- First, we need to drop the existing constraint and recreate it with new roles
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;

-- Add the new constraint with expanded roles
ALTER TABLE profiles ADD CONSTRAINT profiles_role_check 
    CHECK (role IN (
        'student', 
        'staff',
        'facility_manager',       -- NEW: Head of Works Department
        'maintenance_supervisor', -- NEW: Oversees all technicians
        'team_lead',             -- NEW: Team leader (electrical, plumbing, etc.)
        'technician', 
        'src', 
        'porter',
        'admin'
    ));

-- Step 2: Create role_access_codes for new roles
INSERT INTO role_access_codes (role, code) VALUES
    ('facility_manager', 'FAC2026!'),
    ('maintenance_supervisor', 'SUPER2026!'),
    ('team_lead', 'LEAD2026!')
ON CONFLICT (role) DO UPDATE SET code = EXCLUDED.code;

-- Step 3: Create function to check if user can manage technicians
CREATE OR REPLACE FUNCTION can_manage_technicians(p_user_id uuid)
RETURNS boolean AS $$
DECLARE
    v_role text;
    v_department text;
BEGIN
    SELECT role, department INTO v_role, v_department
    FROM profiles
    WHERE id = p_user_id;
    
    RETURN v_role IN ('admin', 'facility_manager', 'maintenance_supervisor', 'team_lead');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Step 4: Create function to check if user can reassign technicians
CREATE OR REPLACE FUNCTION can_reassign_technicians(p_user_id uuid)
RETURNS boolean AS $$
DECLARE
    v_role text;
BEGIN
    SELECT role INTO v_role
    FROM profiles
    WHERE id = p_user_id;
    
    RETURN v_role IN ('admin', 'facility_manager', 'maintenance_supervisor');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Step 5: Update verify_access_code function to include new roles
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
        'facility_manager', 'maintenance_supervisor', 'team_lead'
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

-- Step 6: Update register_secure_user function to include new roles
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

    -- Validate role (prevent admin registration through public API, but allow new facility roles)
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

-- Step 7: Create RPC function for supervisors to get all department tickets
CREATE OR REPLACE FUNCTION get_supervisor_tickets(p_department text DEFAULT 'Works Department')
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
BEGIN
    v_user_id := auth.uid();
    
    -- Check if user has supervisor/manager role
    SELECT role INTO v_user_role
    FROM profiles
    WHERE id = v_user_id;
    
    IF v_user_role NOT IN ('admin', 'facility_manager', 'maintenance_supervisor', 'team_lead') THEN
        RAISE EXCEPTION 'Access denied. Supervisor role required.';
    END IF;

    -- Return tickets with full details
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
    WHERE t.department = p_department
    ORDER BY 
        CASE t.priority 
            WHEN 'High' THEN 1 
            WHEN 'Medium' THEN 2 
            ELSE 3 
        END,
        t.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant permissions
GRANT EXECUTE ON FUNCTION can_manage_technicians(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION can_reassign_technicians(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION get_supervisor_tickets(text) TO authenticated;

-- Add comments
COMMENT ON FUNCTION can_manage_technicians IS 'Check if user can manage technicians (admin, facility_manager, maintenance_supervisor, team_lead)';
COMMENT ON FUNCTION can_reassign_technicians IS 'Check if user can reassign technicians (admin, facility_manager, maintenance_supervisor)';
COMMENT ON FUNCTION get_supervisor_tickets IS 'Get all tickets for a department - requires supervisor/manager role';

-- Migration complete
SELECT 'Migration: Added facility management roles successfully' as status;
