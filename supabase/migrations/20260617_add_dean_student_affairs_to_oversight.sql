-- ============================================================================
-- MIGRATION: Grant Dean and Student Affairs full ticket oversight
-- ============================================================================
-- SRC, Dean of Student Affairs, and all Student Affairs department staff
-- should be able to see ALL tickets (not just IT tickets).
-- This updates get_supervisor_all_tickets() to allow those roles/department.
-- ============================================================================

DROP FUNCTION IF EXISTS get_supervisor_all_tickets() CASCADE;

CREATE OR REPLACE FUNCTION get_supervisor_all_tickets()
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
DECLARE
    v_user_role text;
    v_user_department text;
BEGIN
    SELECT role, department INTO v_user_role, v_user_department
    FROM profiles
    WHERE id = auth.uid();

    -- Allow: managers, supervisors, team leads, SRC, Dean, and Student Affairs staff
    IF v_user_role NOT IN ('manager', 'supervisor', 'team_lead', 'src', 'dean')
       AND v_user_department <> 'Student Affairs' THEN
        RAISE EXCEPTION 'Access denied. Oversight role required.';
    END IF;

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

GRANT EXECUTE ON FUNCTION get_supervisor_all_tickets() TO authenticated;
GRANT EXECUTE ON FUNCTION get_supervisor_all_tickets() TO service_role;

COMMENT ON FUNCTION get_supervisor_all_tickets() IS 'Oversight tickets function - managers, supervisors, team leads, SRC, Dean, and Student Affairs staff can view all tickets.';

SELECT 'Migration: Added Dean and Student Affairs oversight to get_supervisor_all_tickets' as status;
