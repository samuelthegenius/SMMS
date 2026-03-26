-- Fix register_secure_user function to handle skills correctly
-- This migration fixes the issue where skills column doesn't exist in profiles table

-- First, drop all existing versions of the function
DROP FUNCTION IF EXISTS register_secure_user CASCADE;

-- Create the corrected version of register_secure_user
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
        AND action = 'signup'
        AND last_attempt > NOW() - INTERVAL '15 minutes'
        AND count >= 3
    ) THEN
        RAISE EXCEPTION 'Too many signup attempts. Please try again later.';
    END IF;

    -- Log this attempt
    INSERT INTO rate_limits (identifier, action, count, last_attempt)
    VALUES ('signup_' || p_email, 'signup', 1, NOW())
    ON CONFLICT (identifier, action) 
    DO UPDATE SET count = rate_limits.count + 1, last_attempt = NOW();

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
        department
    ) VALUES (
        p_id,
        p_email,
        p_full_name,
        p_role,
        p_id_number,
        p_department
    )
    ON CONFLICT (id) DO UPDATE SET
        email = EXCLUDED.email,
        full_name = EXCLUDED.full_name,
        role = EXCLUDED.role,
        identification_number = EXCLUDED.identification_number,
        department = EXCLUDED.department;

    -- Handle technician skills if provided
    IF p_skills IS NOT NULL AND array_length(p_skills, 1) > 0 AND p_role = 'technician' THEN
        -- Remove existing skills for this technician
        DELETE FROM technician_skills WHERE profile_id = p_id;
        
        -- Insert new skills
        INSERT INTO technician_skills (profile_id, skill)
        SELECT p_id, unnest(p_skills)
        ON CONFLICT (profile_id, skill) DO NOTHING;
    END IF;
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION register_secure_user TO authenticated;
GRANT EXECUTE ON FUNCTION register_secure_user TO service_role;
