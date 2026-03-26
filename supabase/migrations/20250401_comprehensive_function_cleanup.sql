-- Comprehensive cleanup of register_secure_user function
-- This migration removes ALL existing versions and creates a single definitive version

-- First, drop the function with different parameter signatures
DROP FUNCTION IF EXISTS register_secure_user CASCADE;

-- Also drop any versions that might exist with different parameter orders
DROP FUNCTION IF EXISTS register_secure_user(uuid, text, text, text, text, text, text[], text) CASCADE;
DROP FUNCTION IF EXISTS register_secure_user(uuid, text, text, text, text, text, text[], text, boolean) CASCADE;
DROP FUNCTION IF EXISTS register_secure_user(uuid, text, text, text, text, text, text) CASCADE;

-- Create the definitive version of register_secure_user
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
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    expected_code text;
BEGIN
    -- Rate limiting check
    IF EXISTS (
        SELECT 1 FROM rate_limits 
        WHERE identifier = 'signup_' || p_email 
        AND action_type = 'signup'
        AND created_at > NOW() - INTERVAL '15 minutes'
        AND attempt_count >= 3
    ) THEN
        RAISE EXCEPTION 'Too many signup attempts. Please try again later.';
    END IF;

    -- Log this attempt
    INSERT INTO rate_limits (identifier, action_type, attempt_count, created_at)
    VALUES ('signup_' || p_email, 'signup', 1, NOW())
    ON CONFLICT (identifier, action_type) 
    DO UPDATE SET attempt_count = rate_limits.attempt_count + 1, created_at = NOW();

    -- Validate role
    IF p_role NOT IN ('student', 'staff_member', 'technician', 'admin') THEN
        RAISE EXCEPTION 'Invalid role specified: %', p_role;
    END IF;

    -- Check access code for student/staff/technician
    IF p_role IN ('student', 'staff_member', 'technician') THEN
        SELECT code INTO expected_code
        FROM role_access_codes
        WHERE role = p_role;

        IF expected_code IS NULL OR p_access_code <> expected_code THEN
            RAISE EXCEPTION 'Invalid access code for role: %', p_role;
        END IF;
    END IF;

    -- Check for duplicate ID number
    IF EXISTS (
        SELECT 1 FROM profiles 
        WHERE identification_number = p_id_number
        AND id != p_id  -- Exclude current user if updating
    ) THEN
        RAISE EXCEPTION 'ID number already registered';
    END IF;

    -- Insert or update the profile
    INSERT INTO profiles (
        id, 
        email, 
        full_name, 
        role, 
        identification_number, 
        department, 
        skills,
        created_at,
        updated_at
    ) VALUES (
        p_id,
        p_email,
        p_full_name,
        p_role,
        p_id_number,
        p_department,
        p_skills,
        NOW(),
        NOW()
    )
    ON CONFLICT (id) DO UPDATE SET
        email = EXCLUDED.email,
        full_name = EXCLUDED.full_name,
        role = EXCLUDED.role,
        identification_number = EXCLUDED.identification_number,
        department = EXCLUDED.department,
        skills = EXCLUDED.skills,
        updated_at = NOW();
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION register_secure_user TO authenticated;
GRANT EXECUTE ON FUNCTION register_secure_user TO service_role;
