-- Fix admin tickets view with proper creator join
-- Creates a SECURITY DEFINER function that bypasses RLS for admin access

-- Drop existing function if it exists
DROP FUNCTION IF EXISTS get_admin_tickets() CASCADE;

-- Create SECURITY DEFINER function for admin tickets with creator join
CREATE OR REPLACE FUNCTION get_admin_tickets()
RETURNS TABLE (
    id uuid,
    title text,
    description text,
    category text,
    facility_type text,
    specific_location text,
    status text,
    priority text,
    created_at timestamptz,
    updated_at timestamptz,
    assigned_to uuid,
    created_by uuid,
    creator_full_name text,
    creator_role text
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
    
    -- Return tickets with creator info (bypasses RLS via SECURITY DEFINER)
    RETURN QUERY
    SELECT 
        t.id,
        t.title,
        t.description,
        t.category,
        t.facility_type,
        t.specific_location,
        t.status,
        t.priority,
        t.created_at,
        t.updated_at,
        t.assigned_to,
        t.created_by,
        p.full_name as creator_full_name,
        p.role as creator_role
    FROM tickets t
    LEFT JOIN profiles p ON t.created_by = p.id
    ORDER BY t.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION get_admin_tickets() TO authenticated;
GRANT EXECUTE ON FUNCTION get_admin_tickets() TO service_role;

-- Add comment
COMMENT ON FUNCTION get_admin_tickets() IS 'Admin tickets function with creator join - runs with elevated privileges but checks admin role';
