-- ============================================================================
-- CREATE MISSING register_secure_user FUNCTION
-- Run this in Supabase SQL Editor to fix signup errors
-- ============================================================================

-- Create the function if it doesn't exist
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
    -- Rate limit: 3 signups per 15 minutes per email
    IF NOT check_rate_limit('signup_' || p_email, 'signup', 3, 900) THEN
        RAISE EXCEPTION 'Too many signup attempts. Please try again later.';
    END IF;

    -- Validate role
    IF p_role NOT IN ('student', 'staff_member', 'technician', 'admin') THEN
        RAISE EXCEPTION 'Invalid role specified';
    END IF;

    -- Check access code for staff_member/technician
    IF p_role IN ('staff_member', 'technician') THEN
        SELECT code INTO expected_code
        FROM role_access_codes
        WHERE role = p_role;

        IF expected_code IS NULL OR p_access_code <> expected_code THEN
            RAISE EXCEPTION 'Invalid access code';
        END IF;
    END IF;

    -- Check for duplicate ID number
    IF EXISTS (SELECT 1 FROM profiles WHERE identification_number = p_id_number) THEN
        RAISE EXCEPTION 'Identification number already registered';
    END IF;

    -- Insert or update profile
    INSERT INTO profiles (id, email, full_name, role, identification_number, department)
    VALUES (p_id, p_email, p_full_name, p_role, p_id_number, p_department)
    ON CONFLICT (id) DO UPDATE SET
        full_name = EXCLUDED.full_name,
        role = EXCLUDED.role,
        identification_number = EXCLUDED.identification_number,
        department = EXCLUDED.department;

    -- Insert skills if provided
    IF p_skills IS NOT NULL AND array_length(p_skills, 1) > 0 THEN
        INSERT INTO technician_skills (profile_id, skill)
        SELECT p_id, unnest(p_skills)
        ON CONFLICT (profile_id, skill) DO NOTHING;
    END IF;

    RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Verify function exists
SELECT '✅ register_secure_user function created!' as status;
