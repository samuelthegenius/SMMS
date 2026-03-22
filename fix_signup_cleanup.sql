-- Fix for sign-up cleanup: Create a function to check if auth user exists
-- This will be used to prevent duplicate auth user creation

CREATE OR REPLACE FUNCTION check_auth_user_exists(p_email text)
RETURNS boolean AS $$
DECLARE
    user_exists boolean := false;
BEGIN
    -- Check if user exists in auth.users by attempting to get their metadata
    -- This is a safe way to check without requiring admin privileges
    BEGIN
        PERFORM 1 FROM auth.users WHERE email = p_email LIMIT 1;
        user_exists := FOUND;
    EXCEPTION WHEN OTHERS THEN
        -- If we can't access auth.users directly, return false
        -- The client-side check will handle the duplicate detection
        user_exists := false;
    END;
    
    RETURN user_exists;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Also create a function to safely cleanup orphaned auth users
CREATE OR REPLACE FUNCTION cleanup_orphaned_auth_user(p_email text)
RETURNS void AS $$
BEGIN
    -- This function would require admin privileges to delete auth users
    -- For now, we'll just log this for manual cleanup
    RAISE LOG 'Orphaned auth user detected for email: %', p_email;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant necessary permissions
GRANT EXECUTE ON FUNCTION check_auth_user_exists(text) TO authenticated;
GRANT EXECUTE ON FUNCTION cleanup_orphaned_auth_user(text) TO authenticated;
