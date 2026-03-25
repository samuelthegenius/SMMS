-- Add technician information to get_admin_tickets function

-- Drop existing function
DROP FUNCTION IF EXISTS get_admin_tickets() CASCADE;

-- Create function with both creator and technician joins
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
    creator_email text,
    creator_department text,
    creator_role text,
    technician_full_name text,
    technician_email text,
    technician_department text
) AS $$
BEGIN
    -- Return all tickets with creator and technician info (SECURITY DEFINER bypasses RLS)
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
        creator.full_name as creator_full_name,
        creator.email as creator_email,
        creator.department as creator_department,
        creator.role as creator_role,
        technician.full_name as technician_full_name,
        technician.email as technician_email,
        technician.department as technician_department
    FROM tickets t
    LEFT JOIN profiles creator ON t.created_by = creator.id
    LEFT JOIN profiles technician ON t.assigned_to = technician.id
    ORDER BY t.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant permissions
GRANT EXECUTE ON FUNCTION get_admin_tickets() TO authenticated;
GRANT EXECUTE ON FUNCTION get_admin_tickets() TO service_role;

-- Add comment
COMMENT ON FUNCTION get_admin_tickets() IS 'Admin tickets function with creator and technician joins - runs with elevated privileges';
