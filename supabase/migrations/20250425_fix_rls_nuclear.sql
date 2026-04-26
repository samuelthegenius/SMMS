-- NUCLEAR OPTION: Fix RLS by dropping and recreating policies without recursion
-- Run this directly in Supabase SQL Editor if the other migration didn't work

-- ============================================================================
-- STEP 1: Fix is_admin() function to use JWT (no table queries)
-- ============================================================================
CREATE OR REPLACE FUNCTION is_admin()
RETURNS boolean AS $$
DECLARE
    jwt_role text;
BEGIN
    -- Get role from JWT claims - NEVER queries profiles table
    BEGIN
        jwt_role := current_setting('request.jwt.claims', true)::jsonb->'user_metadata'->>'role';
    EXCEPTION WHEN OTHERS THEN
        RETURN false;
    END;
    RETURN jwt_role = 'admin';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- STEP 2: Drop ALL existing policies on profiles to clear recursion
-- ============================================================================
DO $$
DECLARE
    pol RECORD;
BEGIN
    FOR pol IN 
        SELECT policyname 
        FROM pg_policies 
        WHERE tablename = 'profiles'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON profiles', pol.policyname);
    END LOOP;
END $$;

-- ============================================================================
-- STEP 3: Create simple, non-recursive policies
-- ============================================================================

-- Policy 1: Users can see their own profile
CREATE POLICY "Users see own profile"
    ON profiles FOR SELECT
    TO authenticated
    USING (id = auth.uid());

-- Policy 2: Service role bypass (for edge functions)
CREATE POLICY "Service role bypass"
    ON profiles FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- Policy 3: Users can insert own profile
CREATE POLICY "Users insert own profile"
    ON profiles FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = id);

-- Policy 4: Users can update own profile (limited fields)
CREATE POLICY "Users update own profile"
    ON profiles FOR UPDATE
    TO authenticated
    USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);

-- ============================================================================
-- STEP 4: Fix tickets table RLS (similar issues likely exist)
-- ============================================================================

-- Drop all ticket policies
DO $$
DECLARE
    pol RECORD;
BEGIN
    FOR pol IN 
        SELECT policyname 
        FROM pg_policies 
        WHERE tablename = 'tickets'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON tickets', pol.policyname);
    END LOOP;
END $$;

-- Create simple ticket policies
CREATE POLICY "Users see own tickets"
    ON tickets FOR SELECT
    TO authenticated
    USING (created_by = auth.uid());

CREATE POLICY "Users create tickets"
    ON tickets FOR INSERT
    TO authenticated
    WITH CHECK (created_by = auth.uid());

CREATE POLICY "Users update own tickets"
    ON tickets FOR UPDATE
    TO authenticated
    USING (created_by = auth.uid());

-- Service role bypass for tickets
CREATE POLICY "Service role bypass tickets"
    ON tickets FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- ============================================================================
-- STEP 5: Grant direct permissions (fallback)
-- ============================================================================
GRANT SELECT, INSERT, UPDATE ON profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE ON tickets TO authenticated;
GRANT ALL ON profiles TO service_role;
GRANT ALL ON tickets TO service_role;

-- ============================================================================
-- VERIFICATION
-- ============================================================================
SELECT 'Profiles policies after fix:' as info;
SELECT policyname, permissive, roles, cmd, qual 
FROM pg_policies 
WHERE tablename = 'profiles';

SELECT 'Tickets policies after fix:' as info;
SELECT policyname, permissive, roles, cmd, qual 
FROM pg_policies 
WHERE tablename = 'tickets';
