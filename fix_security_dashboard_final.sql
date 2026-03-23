-- Fix security_dashboard RLS bypass issue
-- Handles existing functions properly

-- First, drop all existing dashboard objects in correct order
DROP VIEW IF EXISTS public.security_dashboard CASCADE;
DROP FUNCTION IF EXISTS get_admin_security_dashboard() CASCADE;
DROP FUNCTION IF EXISTS get_security_dashboard() CASCADE;

-- Create a SECURITY DEFINER function that properly handles access control
CREATE OR REPLACE FUNCTION get_security_dashboard()
RETURNS TABLE (
    open_tickets bigint,
    in_progress_tickets bigint,
    resolved_tickets bigint,
    high_priority_tickets bigint,
    tickets_today bigint,
    tickets_this_week bigint,
    active_technicians bigint,
    total_students bigint,
    total_staff bigint,
    unread_notifications bigint,
    unassigned_tickets bigint
) AS $$
DECLARE
    v_user_role text;
BEGIN
    -- Get current user's role
    SELECT role INTO v_user_role 
    FROM profiles 
    WHERE id = auth.uid();
    
    -- Only allow admins and technicians to access dashboard
    IF v_user_role NOT IN ('admin', 'technician') THEN
        RAISE EXCEPTION 'Access denied. Dashboard access requires admin or technician role.';
    END IF;
    
    -- Return dashboard data with SECURITY DEFINER (bypasses RLS for this function)
    RETURN QUERY
    SELECT 
        -- Ticket statistics (bypass RLS via SECURITY DEFINER)
        (SELECT COUNT(*) FROM tickets WHERE status = 'Open') as open_tickets,
        (SELECT COUNT(*) FROM tickets WHERE status = 'In Progress') as in_progress_tickets,
        (SELECT COUNT(*) FROM tickets WHERE status = 'Resolved') as resolved_tickets,
        (SELECT COUNT(*) FROM tickets WHERE priority = 'High' AND status != 'Resolved') as high_priority_tickets,
        (SELECT COUNT(*) FROM tickets WHERE created_at > NOW() - INTERVAL '24 hours') as tickets_today,
        (SELECT COUNT(*) FROM tickets WHERE created_at > NOW() - INTERVAL '7 days') as tickets_this_week,
        
        -- User statistics
        (SELECT COUNT(*) FROM profiles WHERE role = 'technician' AND is_on_duty = true) as active_technicians,
        (SELECT COUNT(*) FROM profiles WHERE role = 'student') as total_students,
        (SELECT COUNT(*) FROM profiles WHERE role = 'staff_member') as total_staff,
        
        -- Recent activity (only user's own notifications)
        (SELECT COUNT(*) FROM notifications WHERE user_id = auth.uid() AND created_at > NOW() - INTERVAL '1 hour' AND is_read = false) as unread_notifications,
        (SELECT COUNT(*) FROM tickets WHERE assigned_to IS NULL AND status = 'Open') as unassigned_tickets;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions to authenticated users (function will check roles)
GRANT EXECUTE ON FUNCTION get_security_dashboard() TO authenticated;

-- Create a separate admin-only function for full system access
CREATE OR REPLACE FUNCTION get_admin_security_dashboard()
RETURNS TABLE (
    open_tickets bigint,
    in_progress_tickets bigint,
    resolved_tickets bigint,
    high_priority_tickets bigint,
    tickets_today bigint,
    tickets_this_week bigint,
    active_technicians bigint,
    total_students bigint,
    total_staff bigint,
    unread_notifications_all bigint,
    unassigned_tickets bigint
) AS $$
DECLARE
    v_user_role text;
BEGIN
    -- Verify admin role
    SELECT role INTO v_user_role 
    FROM profiles 
    WHERE id = auth.uid();
    
    IF v_user_role != 'admin' THEN
        RAISE EXCEPTION 'Access denied. Admin role required.';
    END IF;
    
    -- Return full dashboard data for admins
    RETURN QUERY
    SELECT 
        (SELECT COUNT(*) FROM tickets WHERE status = 'Open') as open_tickets,
        (SELECT COUNT(*) FROM tickets WHERE status = 'In Progress') as in_progress_tickets,
        (SELECT COUNT(*) FROM tickets WHERE status = 'Resolved') as resolved_tickets,
        (SELECT COUNT(*) FROM tickets WHERE priority = 'High' AND status != 'Resolved') as high_priority_tickets,
        (SELECT COUNT(*) FROM tickets WHERE created_at > NOW() - INTERVAL '24 hours') as tickets_today,
        (SELECT COUNT(*) FROM tickets WHERE created_at > NOW() - INTERVAL '7 days') as tickets_this_week,
        
        (SELECT COUNT(*) FROM profiles WHERE role = 'technician' AND is_on_duty = true) as active_technicians,
        (SELECT COUNT(*) FROM profiles WHERE role = 'student') as total_students,
        (SELECT COUNT(*) FROM profiles WHERE role = 'staff_member') as total_staff,
        
        -- Admin can see all unread notifications
        (SELECT COUNT(*) FROM notifications WHERE created_at > NOW() - INTERVAL '1 hour' AND is_read = false) as unread_notifications_all,
        (SELECT COUNT(*) FROM tickets WHERE assigned_to IS NULL AND status = 'Open') as unassigned_tickets;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions to authenticated (function will verify admin role)
GRANT EXECUTE ON FUNCTION get_admin_security_dashboard() TO authenticated;

-- Add comments
COMMENT ON FUNCTION get_security_dashboard() IS 'Security dashboard for technicians and admins - runs with elevated privileges but checks user roles';
COMMENT ON FUNCTION get_admin_security_dashboard() IS 'Admin-only security dashboard with full system access';

-- Optional: Create a simple view that calls the function (for backward compatibility)
-- This view will work because it calls the SECURITY DEFINER function internally
CREATE OR REPLACE VIEW public.security_dashboard AS
SELECT * FROM get_security_dashboard();

-- Set view ownership and permissions
ALTER VIEW public.security_dashboard OWNER TO postgres;
GRANT SELECT ON public.security_dashboard TO authenticated;
GRANT SELECT ON public.security_dashboard TO service_role;

COMMENT ON VIEW public.security_dashboard IS 'Security dashboard view - uses SECURITY DEFINER function internally';
