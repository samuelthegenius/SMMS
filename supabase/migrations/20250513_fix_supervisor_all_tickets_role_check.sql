-- ============================================================================
-- MIGRATION: Fix get_supervisor_all_tickets role check for unified hierarchy
-- ============================================================================
-- The 20250509_unified_role_hierarchy migration renamed:
--   facility_manager -> manager
--   maintenance_supervisor -> supervisor
-- But get_supervisor_all_tickets() still checks for the old names.
-- This migration updates it to recognize the new role names.
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
BEGIN
    -- Verify supervisor/manager role (it_admin excluded - they use get_it_admin_tickets)
    SELECT role INTO v_user_role 
    FROM profiles 
    WHERE id = auth.uid();
    
    IF v_user_role NOT IN ('manager', 'supervisor', 'team_lead', 'src') THEN
        RAISE EXCEPTION 'Access denied. Supervisor role required.';
    END IF;
    
    -- Return all tickets for facility management oversight
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

COMMENT ON FUNCTION get_supervisor_all_tickets() IS 'Supervisor tickets function - facility management roles (manager, supervisor, team_lead, src) can view all tickets for oversight. it_admin excluded.';

-- Migration complete
SELECT 'Migration: Fixed get_supervisor_all_tickets role check for unified hierarchy' as status;
