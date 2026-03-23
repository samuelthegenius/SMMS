-- Fix the ambiguous column error in the RPC function

-- Drop existing function
DROP FUNCTION IF EXISTS get_admin_tickets() CASCADE;

-- Create function with proper column aliases
CREATE OR REPLACE FUNCTION get_admin_tickets()
RETURNS TABLE (
    ticket_id uuid,
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
BEGIN
    -- Return all tickets with creator info (SECURITY DEFINER bypasses RLS)
    RETURN QUERY
    SELECT 
        t.id as ticket_id,
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

-- Grant permissions
GRANT EXECUTE ON FUNCTION get_admin_tickets() TO authenticated;
GRANT EXECUTE ON FUNCTION get_admin_tickets() TO service_role;
