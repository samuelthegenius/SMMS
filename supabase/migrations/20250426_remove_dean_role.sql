-- ============================================================================
-- MIGRATION: Remove dean role and migrate existing dean users to staff
-- ============================================================================
-- This migration:
-- 1. Converts existing 'dean' role users to 'staff' with 'Student Affairs' department
-- 2. Removes 'dean' from allowed roles in all functions
-- ============================================================================

-- Step 1: Convert existing dean users to staff with Student Affairs department
UPDATE profiles 
SET 
    role = 'staff',
    department = 'Student Affairs'
WHERE role = 'dean';

-- Step 2: Remove dean from role_access_codes
DELETE FROM role_access_codes WHERE role = 'dean';

-- Step 3: Update the verify_access_code function to remove dean
CREATE OR REPLACE FUNCTION verify_access_code(
    p_role text,
    p_code text
)
RETURNS boolean AS $$
DECLARE
    expected_code text;
BEGIN
    IF p_role NOT IN ('student', 'staff', 'technician', 'src', 'porter') THEN
        RETURN false;
    END IF;

    SELECT code INTO expected_code
    FROM role_access_codes
    WHERE role = p_role;

    IF expected_code IS NULL THEN RETURN false; END IF;
    RETURN p_code = expected_code;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Step 4: Update register_secure_user function to remove dean
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

    -- Validate role (explicitly prevent admin registration through public API)
    IF p_role NOT IN ('student', 'staff', 'technician', 'src', 'porter') THEN
        RAISE EXCEPTION 'Role % registration is not permitted', p_role;
    END IF;

    -- Check access code for ALL allowed roles
    SELECT code INTO expected_code
    FROM role_access_codes
    WHERE role = p_role;

    IF expected_code IS NULL OR expected_code != p_access_code THEN
        RAISE EXCEPTION 'Invalid access code';
    END IF;

    -- Insert profile
    INSERT INTO profiles (id, email, full_name, role, identification_number, department, is_on_duty, created_at)
    VALUES (p_id, p_email, p_full_name, p_role, p_id_number, 
            CASE WHEN p_role = 'technician' THEN 'Works Department' ELSE p_department END, 
            true, now());

    -- Add skills if technician
    IF p_role = 'technician' AND p_skills IS NOT NULL THEN
        INSERT INTO technician_skills (profile_id, skill)
        SELECT p_id, unnest(p_skills);
    END IF;

    RETURN true;
EXCEPTION WHEN OTHERS THEN
    RAISE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Step 5: Add Student Affairs to departments if not exists
INSERT INTO departments (name) 
VALUES ('Student Affairs')
ON CONFLICT (name) DO NOTHING;
