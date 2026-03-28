-- ============================================================================
-- Migration: Rename staff_member to staff
-- ============================================================================
-- This migration updates the database to use 'staff' instead of 'staff_member'

-- Update existing profiles
UPDATE profiles SET role = 'staff' WHERE role = 'staff_member';

-- Update role_access_codes
UPDATE role_access_codes SET role = 'staff' WHERE role = 'staff_member';

-- Drop and recreate the CHECK constraint on profiles
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_role_check 
    CHECK (role IN ('student', 'staff', 'technician', 'admin'));

-- Update register_secure_user function to use 'staff'
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
    -- Rate limit
    IF NOT EXISTS (
        SELECT 1 FROM rate_limits 
        WHERE identifier = 'signup_' || p_email 
        AND action_type = 'signup'
        AND created_at > NOW() - INTERVAL '15 minutes'
        AND attempt_count >= 3
    ) THEN
        -- Log this attempt
        INSERT INTO rate_limits (identifier, action_type, attempt_count, created_at)
        VALUES ('signup_' || p_email, 'signup', 1, NOW())
        ON CONFLICT (identifier, action_type) 
        DO UPDATE SET attempt_count = rate_limits.attempt_count + 1, created_at = NOW();
    ELSE
        RAISE EXCEPTION 'Too many signup attempts. Please try again later.';
    END IF;

    -- Validate role (updated to use 'staff')
    IF p_role NOT IN ('student', 'staff', 'technician', 'admin') THEN
        RAISE EXCEPTION 'Invalid role specified';
    END IF;

    -- Check access code for student/staff/technician (updated to use 'staff')
    IF p_role IN ('student', 'staff', 'technician') THEN
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
    ) THEN
        RAISE EXCEPTION 'ID number already registered';
    END IF;

    -- Insert the profile
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
    );
END;
$$;
