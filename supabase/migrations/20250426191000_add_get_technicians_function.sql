-- ============================================================================
-- MIGRATION: Add RPC function to fetch technicians
-- ============================================================================
-- This function uses SECURITY DEFINER to bypass RLS and return all technicians
-- This is more reliable than relying on complex RLS policies
-- ============================================================================

-- Drop existing function if exists
DROP FUNCTION IF EXISTS get_technicians() CASCADE;

-- Create function to fetch all technician profiles
CREATE OR REPLACE FUNCTION get_technicians()
RETURNS TABLE (
    id uuid,
    full_name text,
    email text,
    role text,
    department text,
    is_on_duty boolean
) AS $$
BEGIN
    -- Return all technician profiles (SECURITY DEFINER bypasses RLS)
    RETURN QUERY
    SELECT 
        p.id,
        p.full_name,
        p.email,
        p.role,
        p.department,
        p.is_on_duty
    FROM profiles p
    WHERE p.role = 'technician'
    ORDER BY p.full_name ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant permissions
GRANT EXECUTE ON FUNCTION get_technicians() TO authenticated;
GRANT EXECUTE ON FUNCTION get_technicians() TO service_role;

-- Add comment
COMMENT ON FUNCTION get_technicians() IS 'Fetch all technician profiles - runs with elevated privileges to bypass RLS';

-- Also create a function for admins to get all users if needed
DROP FUNCTION IF EXISTS get_all_profiles() CASCADE;

CREATE OR REPLACE FUNCTION get_all_profiles()
RETURNS TABLE (
    id uuid,
    full_name text,
    email text,
    role text,
    department text
) AS $$
BEGIN
    -- Only allow admins to fetch all profiles
    IF NOT is_admin() THEN
        RAISE EXCEPTION 'Only admins can fetch all profiles';
    END IF;

    RETURN QUERY
    SELECT 
        p.id,
        p.full_name,
        p.email,
        p.role,
        p.department
    FROM profiles p
    ORDER BY p.role, p.full_name;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION get_all_profiles() TO authenticated;
GRANT EXECUTE ON FUNCTION get_all_profiles() TO service_role;

COMMENT ON FUNCTION get_all_profiles() IS 'Admin only: Fetch all user profiles - requires admin role';

-- ============================================================================
-- MIGRATION: Add RPC function to fetch technicians filtered by category
-- ============================================================================
-- This function returns only technicians whose skills match the given category
-- ============================================================================

-- Drop existing function if exists
DROP FUNCTION IF EXISTS get_technicians_by_category(text) CASCADE;

-- Create function to fetch technicians by category
CREATE OR REPLACE FUNCTION get_technicians_by_category(p_category text)
RETURNS TABLE (
    id uuid,
    full_name text,
    email text,
    role text,
    department text,
    is_on_duty boolean
) AS $$
BEGIN
    -- Return technicians whose skills match the given category
    RETURN QUERY
    SELECT 
        p.id,
        p.full_name,
        p.email,
        p.role,
        p.department,
        p.is_on_duty
    FROM profiles p
    INNER JOIN technician_skills ts ON p.id = ts.profile_id
    WHERE p.role = 'technician'
      AND ts.skill = p_category
    ORDER BY p.full_name ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant permissions
GRANT EXECUTE ON FUNCTION get_technicians_by_category(text) TO authenticated;
GRANT EXECUTE ON FUNCTION get_technicians_by_category(text) TO service_role;

-- Add comment
COMMENT ON FUNCTION get_technicians_by_category(text) IS 'Fetch technicians filtered by category/skill - runs with elevated privileges to bypass RLS';
