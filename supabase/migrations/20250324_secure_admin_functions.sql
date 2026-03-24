-- Secure admin ticket access function
CREATE OR REPLACE FUNCTION get_admin_tickets()
RETURNS TABLE (
    ticket_id uuid,
    title text,
    description text,
    category text,
    facility_type text,
    specific_location text,
    priority text,
    status text,
    created_at timestamptz,
    updated_at timestamptz,
    created_by uuid,
    assigned_to uuid,
    rejection_reason text,
    image_url text,
    creator_full_name text,
    creator_role text
) AS $$
BEGIN
    -- Verify user is admin
    IF NOT EXISTS (
        SELECT 1 FROM profiles 
        WHERE id = auth.uid() AND role = 'admin'
    ) THEN
        RAISE EXCEPTION 'Unauthorized access: Admin role required';
    END IF;
    
    -- Return all tickets with creator information
    RETURN QUERY
    SELECT 
        t.id,
        t.title,
        t.description,
        t.category,
        t.facility_type,
        t.specific_location,
        t.priority,
        t.status,
        t.created_at,
        t.updated_at,
        t.created_by,
        t.assigned_to,
        t.rejection_reason,
        t.image_url,
        p.full_name as creator_full_name,
        p.role as creator_role
    FROM tickets t
    LEFT JOIN profiles p ON t.created_by = p.id
    ORDER BY t.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

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
    RETURN COALESCE(current_setting('request.headers'), 'unknown');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
