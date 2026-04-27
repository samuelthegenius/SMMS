-- ============================================================================
-- MIGRATION: Add RLS policy for admins to view all profiles
-- ============================================================================
-- This fixes the issue where the technician reassignment dropdown
-- couldn't populate because admins couldn't read other users' profiles
-- ============================================================================

-- First ensure is_admin() function exists (reads from JWT to avoid recursion)
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
    RETURN COALESCE(jwt_role = 'admin', false);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- First ensure RLS is enabled on profiles
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Drop potentially problematic old policies
DROP POLICY IF EXISTS "Admins can view all profiles" ON profiles;
DROP POLICY IF EXISTS "Admins view all profiles via function" ON profiles;

-- Create comprehensive SELECT policy that always allows users to see own profile
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'profiles' AND policyname = 'Users and admins view profiles'
    ) THEN
        CREATE POLICY "Users and admins view profiles"
            ON profiles FOR SELECT
            TO authenticated
            USING (
                id = auth.uid()  -- Users can always see their own profile
                OR is_admin()     -- Admins can see all profiles
            );
    END IF;
END $$;

-- Ensure users can insert their own profile (registration)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'profiles' AND policyname = 'Users insert own profile'
    ) THEN
        CREATE POLICY "Users insert own profile"
            ON profiles FOR INSERT
            TO authenticated
            WITH CHECK (id = auth.uid());
    END IF;
END $$;

-- Ensure users can update their own profile
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'profiles' AND policyname = 'Users update own profile'
    ) THEN
        CREATE POLICY "Users update own profile"
            ON profiles FOR UPDATE
            TO authenticated
            USING (id = auth.uid())
            WITH CHECK (id = auth.uid());
    END IF;
END $$;

-- Service role bypass for edge functions
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'profiles' AND policyname = 'Service role bypass'
    ) THEN
        CREATE POLICY "Service role bypass"
            ON profiles FOR ALL
            TO service_role
            USING (true)
            WITH CHECK (true);
    END IF;
END $$;

-- Grant permissions
GRANT SELECT, INSERT, UPDATE ON profiles TO authenticated;
GRANT ALL ON profiles TO service_role;
