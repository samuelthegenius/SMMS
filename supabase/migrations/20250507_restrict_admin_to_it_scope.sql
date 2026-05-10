-- ============================================================================
-- MIGRATION: Restrict admin role to IT scope only
-- ============================================================================
-- This migration scopes the 'admin' role to IT-specific functions only,
-- removing facility management access since those roles now exist:
-- - facility_manager: Head of Works Department (full oversight)
-- - maintenance_supervisor: Oversees all technicians
-- - team_lead: Leads specific maintenance teams
-- ============================================================================

-- Step 1: Update get_admin_tickets to only return IT & Networking tickets
-- Admin should only oversee IT infrastructure tickets, not plumbing/carpentry
DROP FUNCTION IF EXISTS get_admin_tickets() CASCADE;

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
    
    -- Return only IT & Networking tickets (bypasses RLS via SECURITY DEFINER)
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
    WHERE t.category = 'IT & Networking'
    ORDER BY t.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant permissions
GRANT EXECUTE ON FUNCTION get_admin_tickets() TO authenticated;
GRANT EXECUTE ON FUNCTION get_admin_tickets() TO service_role;

COMMENT ON FUNCTION get_admin_tickets() IS 'Admin tickets function - scoped to IT & Networking category only. Admin role is for IT administration, not facility management.';

-- Step 2: Create function for supervisors to view all tickets (they need full oversight)
-- This replaces the broad admin access with proper facility management access
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
    -- Verify supervisor/manager role
    SELECT role INTO v_user_role 
    FROM profiles 
    WHERE id = auth.uid();
    
    IF v_user_role NOT IN ('facility_manager', 'maintenance_supervisor', 'team_lead', 'src') THEN
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

COMMENT ON FUNCTION get_supervisor_all_tickets() IS 'Supervisor tickets function - facility management roles can view all tickets for oversight.';

-- Step 3: Create helper function to check if user can manage IT tickets
CREATE OR REPLACE FUNCTION can_manage_it_tickets(p_user_id uuid)
RETURNS boolean AS $$
DECLARE
    v_role text;
BEGIN
    SELECT role INTO v_role
    FROM profiles
    WHERE id = p_user_id;
    
    -- Only admin (IT admin) can manage IT tickets across the board
    RETURN v_role = 'admin';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION can_manage_it_tickets(uuid) TO authenticated;

COMMENT ON FUNCTION can_manage_it_tickets IS 'Check if user can manage IT & Networking tickets (admin role only)';

-- Step 4: Update can_manage_technicians to exclude admin (facility management only)
CREATE OR REPLACE FUNCTION can_manage_technicians(p_user_id uuid)
RETURNS boolean AS $$
DECLARE
    v_role text;
BEGIN
    SELECT role INTO v_role
    FROM profiles
    WHERE id = p_user_id;
    
    -- Facility management roles only - admin is IT, not facilities
    RETURN v_role IN ('facility_manager', 'maintenance_supervisor', 'team_lead');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION can_manage_technicians(uuid) TO authenticated;

COMMENT ON FUNCTION can_manage_technicians IS 'Check if user can manage technicians (facility_manager, maintenance_supervisor, team_lead). Admin role excluded - it is for IT, not facilities.';

-- Step 5: Update can_reassign_technicians similarly
CREATE OR REPLACE FUNCTION can_reassign_technicians(p_user_id uuid)
RETURNS boolean AS $$
DECLARE
    v_role text;
BEGIN
    SELECT role INTO v_role
    FROM profiles
    WHERE id = p_user_id;
    
    -- Senior facility management only
    RETURN v_role IN ('facility_manager', 'maintenance_supervisor');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION can_reassign_technicians(uuid) TO authenticated;

COMMENT ON FUNCTION can_reassign_technicians IS 'Check if user can reassign technicians (facility_manager, maintenance_supervisor). Admin excluded.';

-- Step 6: Update RLS policies - remove admin from facility management access
-- Recreate the tickets policies to exclude admin from facility oversight

-- Drop existing facility-related policies that incorrectly include admin
DROP POLICY IF EXISTS "Admins can view all tickets" ON tickets;
DROP POLICY IF EXISTS "Admins have full access to tickets" ON tickets;

-- Create new admin policy scoped to IT only
CREATE POLICY "Admins can view IT tickets"
    ON tickets FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE id = auth.uid() AND role = 'admin'
        )
        AND category = 'IT & Networking'
    );

CREATE POLICY "Admins have full access to IT tickets"
    ON tickets FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE id = auth.uid() AND role = 'admin'
        )
        AND category = 'IT & Networking'
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE id = auth.uid() AND role = 'admin'
        )
        AND category = 'IT & Networking'
    );

-- Create policy for facility managers to view all tickets (they need full oversight)
CREATE POLICY "Facility managers can view all tickets"
    ON tickets FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE id = auth.uid() AND role = 'facility_manager'
        )
    );

-- Create policy for maintenance supervisors to view all tickets
CREATE POLICY "Maintenance supervisors can view all tickets"
    ON tickets FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE id = auth.uid() AND role = 'maintenance_supervisor'
        )
    );

-- Step 7: Add comments explaining role purposes
COMMENT ON FUNCTION get_supervisor_tickets IS 'Get all tickets for a department - requires facility_manager, maintenance_supervisor, or team_lead role. Admin role excluded - use get_admin_tickets for IT scope.';

-- Migration complete
SELECT 'Migration: Restricted admin role to IT scope successfully' as status;
