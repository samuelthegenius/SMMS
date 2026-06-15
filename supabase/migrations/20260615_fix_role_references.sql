-- ============================================================================
-- FIX ROLE REFERENCES: Replace all stale 'admin'/'facility_manager'/
-- 'maintenance_supervisor' role checks with current role names, and add
-- missing RLS policies for manager, supervisor, team_lead, staff, and dean.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. DROP BROKEN TICKET POLICIES (wrong role names from old migrations)
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Admins can view all tickets" ON tickets;
DROP POLICY IF EXISTS "Admins have full access to tickets" ON tickets;
DROP POLICY IF EXISTS "Admins can view IT tickets" ON tickets;
DROP POLICY IF EXISTS "Admins have full access to IT tickets" ON tickets;
DROP POLICY IF EXISTS "Facility managers can view all tickets" ON tickets;
DROP POLICY IF EXISTS "Maintenance supervisors can view all tickets" ON tickets;
DROP POLICY IF EXISTS "Managers can view all tickets" ON tickets;
DROP POLICY IF EXISTS "Managers can update all tickets" ON tickets;
DROP POLICY IF EXISTS "Staff can view department tickets" ON tickets;
DROP POLICY IF EXISTS "Student Affairs staff can view all tickets" ON tickets;
DROP POLICY IF EXISTS "Dean can view all tickets" ON tickets;

-- ----------------------------------------------------------------------------
-- 2. RECREATE TICKET POLICIES WITH CORRECT ROLE NAMES
-- ----------------------------------------------------------------------------

-- IT Admin sees only IT & Networking tickets (scoped by design)
CREATE POLICY "Admins can view IT tickets"
    ON tickets FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE id = auth.uid() AND role = 'it_admin'
        )
        AND category = 'IT & Networking'
    );

CREATE POLICY "Admins have full access to IT tickets"
    ON tickets FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE id = auth.uid() AND role = 'it_admin'
        )
        AND category = 'IT & Networking'
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE id = auth.uid() AND role = 'it_admin'
        )
        AND category = 'IT & Networking'
    );

-- Managers, supervisors, and team leads have full oversight of all tickets
CREATE POLICY "Managers can view all tickets"
    ON tickets FOR SELECT
    TO authenticated
    USING (EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid() AND role IN ('manager', 'supervisor', 'team_lead')
    ));

CREATE POLICY "Managers can update all tickets"
    ON tickets FOR UPDATE
    TO authenticated
    USING (EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid() AND role IN ('manager', 'supervisor', 'team_lead')
    ))
    WITH CHECK (EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid() AND role IN ('manager', 'supervisor', 'team_lead')
    ));

-- Staff can view tickets in their own department
CREATE POLICY "Staff can view department tickets"
    ON tickets FOR SELECT
    TO authenticated
    USING (EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid()
          AND role = 'staff'
          AND department = tickets.department
    ));

-- Student Affairs staff have university-wide oversight
CREATE POLICY "Student Affairs staff can view all tickets"
    ON tickets FOR SELECT
    TO authenticated
    USING (EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid() AND role = 'staff' AND department = 'Student Affairs'
    ));

-- Dean has university-wide oversight
CREATE POLICY "Dean can view all tickets"
    ON tickets FOR SELECT
    TO authenticated
    USING (EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid() AND role = 'dean'
    ));

-- ----------------------------------------------------------------------------
-- 3. FIX BROKEN SUPPORT-TABLE POLICIES
-- ----------------------------------------------------------------------------

-- Departments
DROP POLICY IF EXISTS "Departments manageable by admins" ON departments;
CREATE POLICY "Departments manageable by admins"
    ON departments FOR ALL
    TO authenticated
    USING (EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid() AND role = 'it_admin'
    ));

-- Facility types
DROP POLICY IF EXISTS "Facility types manageable by admins" ON facility_types;
CREATE POLICY "Facility types manageable by admins"
    ON facility_types FOR ALL
    TO authenticated
    USING (EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid() AND role = 'it_admin'
    ));

-- Maintenance categories
DROP POLICY IF EXISTS "Categories manageable by admins" ON maintenance_categories;
CREATE POLICY "Categories manageable by admins"
    ON maintenance_categories FOR ALL
    TO authenticated
    USING (EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid() AND role = 'it_admin'
    ));

-- Access codes (security critical)
DROP POLICY IF EXISTS "Access codes viewable by admins" ON role_access_codes;
DROP POLICY IF EXISTS "Access codes manageable by admins" ON role_access_codes;

CREATE POLICY "Access codes viewable by admins"
    ON role_access_codes FOR SELECT
    TO authenticated
    USING (EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid() AND role = 'it_admin'
    ));

CREATE POLICY "Access codes manageable by admins"
    ON role_access_codes FOR ALL
    TO authenticated
    USING (EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid() AND role = 'it_admin'
    ))
    WITH CHECK (EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid() AND role = 'it_admin'
    ));

-- Technician skills
DROP POLICY IF EXISTS "Users can insert own skills" ON technician_skills;
DROP POLICY IF EXISTS "Users can delete own skills" ON technician_skills;

CREATE POLICY "Users can insert own skills"
    ON technician_skills FOR INSERT
    TO authenticated
    WITH CHECK (
        auth.uid() = profile_id OR
        EXISTS (
            SELECT 1 FROM profiles
            WHERE id = auth.uid() AND role = 'it_admin'
        )
    );

CREATE POLICY "Users can delete own skills"
    ON technician_skills FOR DELETE
    TO authenticated
    USING (
        auth.uid() = profile_id OR
        EXISTS (
            SELECT 1 FROM profiles
            WHERE id = auth.uid() AND role = 'it_admin'
        )
    );

-- Security events
DROP POLICY IF EXISTS "Security events viewable by admins only" ON security_events;
CREATE POLICY "Security events viewable by admins only"
    ON security_events FOR SELECT
    TO authenticated
    USING (EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid() AND role = 'it_admin'
    ));

-- ----------------------------------------------------------------------------
-- 4. FIX HELPER FUNCTIONS
-- ----------------------------------------------------------------------------

DROP FUNCTION IF EXISTS can_manage_it_tickets(uuid);
DROP FUNCTION IF EXISTS can_manage_technicians(uuid);
DROP FUNCTION IF EXISTS can_reassign_technicians(uuid);

CREATE OR REPLACE FUNCTION can_manage_it_tickets(p_user_id uuid)
RETURNS boolean AS $$
DECLARE
    v_role text;
BEGIN
    SELECT role INTO v_role FROM profiles WHERE id = p_user_id;
    RETURN v_role = 'it_admin';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION can_manage_technicians(p_user_id uuid)
RETURNS boolean AS $$
DECLARE
    v_role text;
BEGIN
    SELECT role INTO v_role FROM profiles WHERE id = p_user_id;
    RETURN v_role IN ('manager', 'supervisor', 'team_lead', 'it_admin');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION can_reassign_technicians(p_user_id uuid)
RETURNS boolean AS $$
DECLARE
    v_role text;
BEGIN
    SELECT role INTO v_role FROM profiles WHERE id = p_user_id;
    RETURN v_role IN ('manager', 'supervisor', 'it_admin');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ----------------------------------------------------------------------------
-- 5. FIX TRIGGER FUNCTIONS
-- ----------------------------------------------------------------------------

-- Fix enforce_ticket_update_rules: it_admin, manager, supervisor bypass all rules
CREATE OR REPLACE FUNCTION enforce_ticket_update_rules()
RETURNS trigger AS $$
DECLARE
    v_user_role text;
    v_uid uuid := auth.uid();
BEGIN
    IF v_uid IS NULL THEN RETURN NEW; END IF;
    SELECT role INTO v_user_role FROM profiles WHERE id = v_uid;
    -- Privileged roles bypass all update restrictions
    IF v_user_role IN ('it_admin', 'manager', 'supervisor') THEN RETURN NEW; END IF;

    IF OLD.created_by = v_uid AND v_user_role IN ('student', 'staff') THEN
        IF NEW.assigned_to IS DISTINCT FROM OLD.assigned_to THEN
            RAISE EXCEPTION 'Creators cannot reassign tickets.';
        END IF;
        IF NEW.status IS DISTINCT FROM OLD.status THEN
            IF NOT (OLD.status = 'Pending Verification' AND NEW.status IN ('Resolved', 'In Progress', 'Open')) THEN
                RAISE EXCEPTION 'Creators cannot arbitrarily change ticket status.';
            END IF;
        END IF;
    END IF;

    IF OLD.assigned_to = v_uid AND v_user_role = 'technician' THEN
        IF NEW.created_by IS DISTINCT FROM OLD.created_by THEN
            RAISE EXCEPTION 'Technicians cannot change the ticket creator.';
        END IF;
        IF NEW.title IS DISTINCT FROM OLD.title THEN
            RAISE EXCEPTION 'Technicians cannot change the ticket title.';
        END IF;
        IF NEW.description IS DISTINCT FROM OLD.description THEN
            RAISE EXCEPTION 'Technicians cannot change the ticket description.';
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Fix handle_satisfaction_feedback: notify it_admin instead of non-existent 'admin'
CREATE OR REPLACE FUNCTION handle_satisfaction_feedback()
RETURNS trigger AS $$
DECLARE
    v_rejection_threshold integer := 3;
    v_src_user_id uuid;
BEGIN
    IF NEW.satisfaction_status IS DISTINCT FROM OLD.satisfaction_status AND NEW.satisfaction_status IS NOT NULL THEN
        IF NEW.satisfaction_status = 'unsatisfied' THEN
            NEW.rejection_count := COALESCE(OLD.rejection_count, 0) + 1;

            IF NEW.rejection_count >= v_rejection_threshold THEN
                NEW.status := 'Escalated';
                NEW.priority := 'Critical';
                NEW.updated_at := NOW();

                SELECT id INTO v_src_user_id
                FROM profiles WHERE role = 'src' LIMIT 1;

                IF v_src_user_id IS NOT NULL THEN
                    INSERT INTO notifications (user_id, ticket_id, message)
                    VALUES (v_src_user_id, NEW.id,
                        'ESCALATION: Ticket "' || NEW.title || '" rejected ' ||
                        NEW.rejection_count || ' times. Requires intervention.');
                END IF;

                -- Notify it_admin about escalation
                INSERT INTO notifications (user_id, ticket_id, message)
                SELECT id, NEW.id, 'ESCALATION: High-priority ticket requires intervention'
                FROM profiles WHERE role = 'it_admin' LIMIT 1;

                INSERT INTO notifications (user_id, ticket_id, message)
                VALUES (NEW.created_by, NEW.id,
                    'Your ticket "' || NEW.title || '" has been escalated to SRC due to multiple unsatisfactory resolutions. An administrator will now handle your case.');
            ELSE
                IF NEW.assigned_to IS NOT NULL THEN
                    INSERT INTO notifications (user_id, ticket_id, message)
                    VALUES (NEW.assigned_to, NEW.id,
                        'REWORK NEEDED: "' || NEW.title || '" rejected (#' ||
                        NEW.rejection_count || '). ' ||
                        COALESCE(LEFT(NEW.customer_feedback, 50), 'No feedback'));
                END IF;

                INSERT INTO notifications (user_id, ticket_id, message)
                VALUES (NEW.created_by, NEW.id,
                    'Your ticket "' || NEW.title || '" has been returned for rework (attempt ' ||
                    NEW.rejection_count || ' of ' || v_rejection_threshold || '). The technician will address your concerns.');
            END IF;

        ELSIF NEW.satisfaction_status = 'satisfied' THEN
            NEW.status := 'Resolved';
            NEW.updated_at := NOW();

            IF NEW.assigned_to IS NOT NULL AND NEW.rating IS NOT NULL THEN
                INSERT INTO notifications (user_id, ticket_id, message)
                VALUES (NEW.assigned_to, NEW.id,
                    'Positive feedback! Rating: ' || NEW.rating || '/5 stars');
            END IF;
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

SELECT 'Migration: Fixed all role references (admin→it_admin, facility_manager→manager, maintenance_supervisor→supervisor)' AS status;
