-- Fix security_dashboard view security issue
-- The view should not be SECURITY DEFINER, but the function should be

-- Drop the existing view and function
DROP VIEW IF EXISTS public.security_dashboard CASCADE;
DROP FUNCTION IF EXISTS get_security_dashboard() CASCADE;

-- Create the view without SECURITY DEFINER (views can't have this)
CREATE VIEW public.security_dashboard AS
SELECT 
    -- Ticket statistics
    (SELECT COUNT(*) FROM tickets WHERE status = 'Open') as open_tickets,
    (SELECT COUNT(*) FROM tickets WHERE status = 'In Progress') as in_progress_tickets,
    (SELECT COUNT(*) FROM tickets WHERE status = 'Resolved') as resolved_tickets,
    (SELECT COUNT(*) FROM tickets WHERE status = 'Closed') as closed_tickets,
    (SELECT COUNT(*) FROM tickets WHERE status = 'Escalated') as escalated_tickets,
    (SELECT COUNT(*) FROM tickets WHERE priority = 'High' AND status IN ('Open', 'In Progress')) as high_priority_tickets,
    (SELECT COUNT(*) FROM tickets WHERE created_at >= CURRENT_DATE) as tickets_today,
    (SELECT COUNT(*) FROM tickets WHERE created_at >= CURRENT_DATE - INTERVAL '7 days') as tickets_this_week,
    (SELECT COUNT(*) FROM tickets WHERE created_at >= CURRENT_DATE - INTERVAL '30 days') as tickets_this_month,
    (SELECT COUNT(*) FROM profiles WHERE role = 'technician' AND is_on_duty = true) as active_technicians,
    (SELECT COUNT(*) FROM profiles WHERE role = 'technician') as total_technicians,
    (SELECT COUNT(*) FROM tickets WHERE assigned_to IS NULL AND status = 'Open') as unassigned_tickets;

-- Set proper ownership
ALTER VIEW public.security_dashboard OWNER TO postgres;

-- Grant appropriate permissions to the view
GRANT SELECT ON public.security_dashboard TO authenticated;
GRANT SELECT ON public.security_dashboard TO service_role;

-- Create the SECURITY DEFINER function for safe access
CREATE OR REPLACE FUNCTION get_security_dashboard()
RETURNS TABLE (
    open_tickets bigint,
    in_progress_tickets bigint,
    resolved_tickets bigint,
    closed_tickets bigint,
    escalated_tickets bigint,
    high_priority_tickets bigint,
    tickets_today bigint,
    tickets_this_week bigint,
    tickets_this_month bigint,
    active_technicians bigint,
    total_technicians bigint,
    unassigned_tickets bigint
) AS $$
BEGIN
    -- This function runs with SECURITY DEFINER, bypassing RLS
    -- Only grant access to trusted roles
    RETURN QUERY SELECT * FROM public.security_dashboard;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions only to appropriate roles
GRANT EXECUTE ON FUNCTION get_security_dashboard() TO authenticated;
GRANT EXECUTE ON FUNCTION get_security_dashboard() TO service_role;

-- Add comments for clarity
COMMENT ON VIEW public.security_dashboard IS 'Security dashboard view showing system statistics and metrics';
COMMENT ON FUNCTION get_security_dashboard() IS 'Security definer function to access security dashboard data - runs with elevated privileges';

-- Alternative: Create a role-restricted function that only admins can use
CREATE OR REPLACE FUNCTION get_admin_security_dashboard()
RETURNS TABLE (
    open_tickets bigint,
    in_progress_tickets bigint,
    resolved_tickets bigint,
    closed_tickets bigint,
    escalated_tickets bigint,
    high_priority_tickets bigint,
    tickets_today bigint,
    tickets_this_week bigint,
    tickets_this_month bigint,
    active_technicians bigint,
    total_technicians bigint,
    unassigned_tickets bigint
) AS $$
BEGIN
    -- Check if user is admin
    IF NOT EXISTS (
        SELECT 1 FROM profiles 
        WHERE id = auth.uid() AND role = 'admin'
    ) THEN
        RAISE EXCEPTION 'Access denied. Admin role required.';
    END IF;
    
    RETURN QUERY SELECT * FROM public.security_dashboard;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute only to authenticated (function will check admin role)
GRANT EXECUTE ON FUNCTION get_admin_security_dashboard() TO authenticated;

COMMENT ON FUNCTION get_admin_security_dashboard() IS 'Admin-only security dashboard function with role verification';
