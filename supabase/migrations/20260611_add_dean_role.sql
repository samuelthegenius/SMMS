-- ============================================================================
-- MIGRATION: Add Dean of Student Affairs role
-- ============================================================================

-- STEP 1: Temporarily drop constraint to allow adding new role
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;

-- STEP 2: Add new role constraint
ALTER TABLE profiles ADD CONSTRAINT profiles_role_check 
    CHECK (role IN (
        'student', 
        'staff',
        'manager',
        'supervisor',
        'team_lead',
        'technician',
        'it_admin',
        'src', 
        'porter',
        'dean'
    ));

-- STEP 3: Add Dean to role_access_codes
INSERT INTO role_access_codes (role, code) VALUES ('dean', 'DEAN2026!')
ON CONFLICT (role) DO UPDATE SET code = EXCLUDED.code;

-- STEP 4: Update register_secure_user to allow dean role
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

    -- Validate role (prevent it_admin registration through public API)
    IF p_role NOT IN (
        'student', 'staff', 'technician', 'src', 'porter',
        'supervisor', 'team_lead', 'manager', 'dean'
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
        
        -- Dean: defaults to Student Affairs
        WHEN p_role = 'dean' THEN
            'Student Affairs'
        
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

-- STEP 5: Update verify_access_code
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
        'manager', 'supervisor', 'team_lead', 'dean'
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

-- STEP 6: Update validate_access_code
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
        'manager', 'supervisor', 'team_lead', 'dean'
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
