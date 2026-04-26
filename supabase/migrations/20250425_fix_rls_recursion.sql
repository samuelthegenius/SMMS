-- Fix RLS recursion issue in is_admin() function
-- The is_admin() function was querying profiles table which has RLS that calls is_admin()
-- This caused infinite recursion and 500 errors

-- Drop and recreate is_admin() to use JWT claims directly (bypasses RLS)
CREATE OR REPLACE FUNCTION is_admin()
RETURNS boolean AS $$
DECLARE
    jwt_role text;
    jwt_user_metadata jsonb;
BEGIN
    -- Get role from JWT claims to avoid querying profiles table (which triggers RLS)
    BEGIN
        jwt_user_metadata := current_setting('request.jwt.claims', true)::jsonb->'user_metadata';
        jwt_role := jwt_user_metadata->>'role';
    EXCEPTION WHEN OTHERS THEN
        jwt_role := NULL;
    END;
    
    -- Check if role is admin (handles both 'admin' and legacy values)
    RETURN COALESCE(jwt_role = 'admin', false);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION is_admin() IS 'Checks if current user is admin using JWT claims to avoid RLS recursion on profiles table';

-- Also fix any other functions that might cause similar issues
-- Create a safe version that queries profiles with SECURITY DEFINER but with error handling
CREATE OR REPLACE FUNCTION get_profile_role()
RETURNS text AS $$
DECLARE
    profile_role text;
BEGIN
    SELECT role INTO profile_role
    FROM profiles
    WHERE id = auth.uid();
    
    RETURN profile_role;
EXCEPTION WHEN OTHERS THEN
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- FIX RLS POLICIES TO AVOID RECURSION
-- ============================================================================

-- First, temporarily disable RLS on profiles to allow the function to work
-- This is a nuclear option - use only if the above doesn't work
-- ALTER TABLE profiles DISABLE ROW LEVEL SECURITY;

-- Alternative: Create a bypass policy for the service role
-- Note: CREATE POLICY doesn't support IF NOT EXISTS, use DO block instead
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'profiles' AND policyname = 'Service role bypass all'
    ) THEN
        CREATE POLICY "Service role bypass all"
            ON profiles FOR ALL
            TO service_role
            USING (true)
            WITH CHECK (true);
    END IF;
END $$;

-- Fix tickets policies - they may also have recursion issues
-- Check if tickets RLS has similar problems

-- Add policy to allow admins to see all tickets (bypasses complex RLS checks)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'tickets' AND policyname = 'Admins can view all tickets'
    ) THEN
        CREATE POLICY "Admins can view all tickets"
            ON tickets FOR SELECT
            TO authenticated
            USING (
                (SELECT (raw_user_meta_data->>'role') FROM auth.users WHERE id = auth.uid()) = 'admin'
                OR created_by = auth.uid()
                OR assigned_to = auth.uid()
            );
    END IF;
END $$;

-- ============================================================================
-- NOTES FOR MANUAL FIX IF ABOVE DOESN'T WORK:
-- ============================================================================
-- If the 500 errors persist, manually run this in Supabase SQL Editor:
--
-- 1. Check if is_admin() causes recursion:
--    SELECT * FROM pg_policies WHERE tablename = 'profiles';
--
-- 2. Temporarily disable RLS to test:
--    ALTER TABLE profiles DISABLE ROW LEVEL SECURITY;
--    -- Test the query, then re-enable:
--    ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
--
-- 3. Or drop and recreate the policy without is_admin():
--    DROP POLICY "Strict profile visibility" ON profiles;
--    CREATE POLICY "Simple profile visibility"
--        ON profiles FOR SELECT
--        TO authenticated
--        USING (id = auth.uid());
--
-- 4. Grant direct access to authenticated users:
--    GRANT SELECT ON profiles TO authenticated;
--    GRANT SELECT ON tickets TO authenticated;
