-- Final security functions deployment
-- Migration for remaining security functions

-- Function to check if auth user exists (for signup validation)
CREATE OR REPLACE FUNCTION check_auth_user_exists(p_email text)
RETURNS boolean AS $$
BEGIN
    -- Rate limiting check is handled in the calling function
    RETURN EXISTS (
        SELECT 1 FROM auth.users 
        WHERE email = p_email
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to cleanup orphaned auth users
CREATE OR REPLACE FUNCTION cleanup_orphaned_auth_user(p_email text)
RETURNS void AS $$
BEGIN
    -- Only allow admins or system to cleanup
    IF NOT EXISTS (
        SELECT 1 FROM profiles 
        WHERE id = auth.uid() AND role = 'admin'
    ) THEN
        RAISE EXCEPTION 'Unauthorized: Admin role required';
    END IF;
    
    DELETE FROM auth.users WHERE email = p_email;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get client IP (for security logging)
CREATE OR REPLACE FUNCTION get_client_ip()
RETURNS text AS $$
BEGIN
    -- This would typically be set by middleware
    -- For now, return a placeholder
    RETURN COALESCE(current_setting('request.headers', true), 'unknown');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
