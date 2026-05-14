-- ============================================================================
-- FIX: RLS infinite recursion on profiles table
-- ============================================================================
-- Root cause: is_it_admin() and is_admin() query the profiles table,
-- but the "Strict profile visibility" RLS policy calls is_it_admin(),
-- causing infinite recursion when any profile SELECT is executed.
--
-- Fix: Rewrite both functions to read role from JWT claims instead of
-- querying the profiles table. Also drop the recursive policy.
-- ============================================================================

-- 0. Drop the 1-param overload that still queries profiles (from 20250509)
DROP FUNCTION IF EXISTS is_it_admin(uuid) CASCADE;

-- 1. Fix is_it_admin() to use JWT claims (no table query)
CREATE OR REPLACE FUNCTION is_it_admin()
RETURNS boolean AS $$
DECLARE
    jwt_role text;
BEGIN
    BEGIN
        jwt_role := current_setting('request.jwt.claims', true)::jsonb->'user_metadata'->>'role';
    EXCEPTION WHEN OTHERS THEN
        RETURN false;
    END;
    RETURN COALESCE(jwt_role = 'it_admin', false);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Fix is_admin() to use JWT claims (backward compat)
CREATE OR REPLACE FUNCTION is_admin()
RETURNS boolean AS $$
DECLARE
    jwt_role text;
BEGIN
    BEGIN
        jwt_role := current_setting('request.jwt.claims', true)::jsonb->'user_metadata'->>'role';
    EXCEPTION WHEN OTHERS THEN
        RETURN false;
    END;
    RETURN COALESCE(jwt_role = 'it_admin', false);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Drop the recursive "Strict profile visibility" policy
DROP POLICY IF EXISTS "Strict profile visibility" ON profiles;

-- 4. Reload PostgREST schema cache so it picks up the changes immediately
NOTIFY pgrst, 'reload schema';

-- 5. Re-grant execute (DROP CASCADE may have removed them)
GRANT EXECUTE ON FUNCTION is_it_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION is_admin() TO authenticated;

COMMENT ON FUNCTION is_it_admin() IS 'Checks if current user is it_admin using JWT claims (safe for RLS)';
COMMENT ON FUNCTION is_admin() IS 'Backward compatible - checks it_admin via JWT claims (safe for RLS)';

SELECT 'RLS recursion fix applied: is_it_admin() and is_admin() now use JWT claims' as status;
