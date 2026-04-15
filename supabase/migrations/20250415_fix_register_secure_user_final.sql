-- ============================================================================
-- Fix register_secure_user function
-- Errors fixed:
--   1. rate_limits INSERT used wrong column names (action_type/attempt_count)
--      → actual columns are 'action' and 'count'
--   2. profiles INSERT included updated_at which doesn't exist in the table
--   3. Grants EXECUTE to anon so the function can be called before session exists
-- ============================================================================

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
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    expected_code text;
BEGIN
    -- Rate limit check (uses correct column names: action, count)
    IF NOT check_rate_limit('signup_' || p_email, 'signup', 3, 900) THEN
        RAISE EXCEPTION 'Too many signup attempts. Please try again later.';
    END IF;

    -- Prevent admin registration via public API
    IF p_role NOT IN ('student', 'staff', 'technician') THEN
        RAISE EXCEPTION 'Role % registration is not permitted', p_role;
    END IF;

    -- Validate access code
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

    -- Insert profile (no updated_at — column does not exist in this table)
    INSERT INTO profiles (id, email, full_name, role, identification_number, department, created_at)
    VALUES (p_id, p_email, p_full_name, p_role, p_id_number, p_department, NOW())
    ON CONFLICT (id) DO UPDATE SET
        full_name             = EXCLUDED.full_name,
        role                  = EXCLUDED.role,
        identification_number = EXCLUDED.identification_number,
        department            = EXCLUDED.department;

    -- Insert skills if provided (technicians only)
    IF p_skills IS NOT NULL AND array_length(p_skills, 1) > 0 THEN
        INSERT INTO technician_skills (profile_id, skill)
        SELECT p_id, unnest(p_skills)
        ON CONFLICT (profile_id, skill) DO NOTHING;
    END IF;

    RETURN true;
END;
$$;

-- Grant execute to authenticated users (newly signed-up users have a JWT)
GRANT EXECUTE ON FUNCTION register_secure_user TO authenticated;
GRANT EXECUTE ON FUNCTION register_secure_user TO service_role;
