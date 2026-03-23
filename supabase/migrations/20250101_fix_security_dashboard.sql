-- Fix security_dashboard view
-- This migration addresses the Supabase error about security_dashboard view

-- First, drop the view if it exists to avoid conflicts
DROP VIEW IF EXISTS public.security_dashboard CASCADE;

-- Create the security_dashboard view with proper permissions
CREATE OR REPLACE VIEW public.security_dashboard AS
SELECT 
    -- Ticket statistics
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
    
    -- Recent activity
    (SELECT COUNT(*) FROM notifications WHERE created_at > NOW() - INTERVAL '1 hour' AND is_read = false) as unread_notifications,
    (SELECT COUNT(*) FROM tickets WHERE assigned_to IS NULL AND status = 'Open') as unassigned_tickets;

-- Set proper ownership
ALTER VIEW public.security_dashboard OWNER TO postgres;

-- Grant appropriate permissions
GRANT SELECT ON public.security_dashboard TO authenticated;
GRANT SELECT ON public.security_dashboard TO service_role;

-- Create a security definer function for accessing the dashboard if needed
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
BEGIN
    RETURN QUERY SELECT * FROM public.security_dashboard;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions on the function
GRANT EXECUTE ON FUNCTION get_security_dashboard() TO authenticated;
GRANT EXECUTE ON FUNCTION get_security_dashboard() TO service_role;

-- Create RLS policy for the view (if needed)
-- Note: Views don't directly support RLS, but we can control access through the function

-- Add comment for documentation
COMMENT ON VIEW public.security_dashboard IS 'Security dashboard view showing system statistics and metrics';
COMMENT ON FUNCTION get_security_dashboard() IS 'Security definer function to access security dashboard data';
