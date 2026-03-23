-- Remove the problematic security_dashboard view completely
-- The issue: Views bypass RLS when aggregating data from protected tables
-- Solution: Remove the view and use only the SECURITY DEFINER function

-- Drop the problematic view
DROP VIEW IF EXISTS public.security_dashboard CASCADE;

-- Keep only the SECURITY DEFINER function (this is the correct approach)
-- The function should already exist, but let's ensure it's properly defined

-- First drop and recreate to ensure clean state
DROP FUNCTION IF EXISTS get_security_dashboard() CASCADE;

-- Create the SECURITY DEFINER function (this is the correct way)
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

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION get_security_dashboard() TO authenticated;
GRANT EXECUTE ON FUNCTION get_security_dashboard() TO service_role;

-- Add comment
COMMENT ON FUNCTION get_security_dashboard() IS 'Security dashboard function - runs with elevated privileges but checks user roles';

-- DO NOT recreate the view - this is what causes the RLS bypass issue
-- Applications should call the function directly: SELECT * FROM get_security_dashboard();
