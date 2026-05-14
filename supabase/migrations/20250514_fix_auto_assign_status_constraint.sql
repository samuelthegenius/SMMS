-- Fix auto-assignment functions setting invalid status 'Assigned'
-- The status CHECK constraint only allows: Open, In Progress, Resolved, Closed, Escalated, Pending Verification
-- Both auto_assign_logic (INSERT) and auto_assign_on_verification (UPDATE) were trying to set status = 'Assigned'
-- which violates the constraint, causing the entire operation to fail silently.

-- 1. Fix the INSERT trigger (auto_assign_logic)
CREATE OR REPLACE FUNCTION auto_assign_logic()
RETURNS trigger AS $$
DECLARE
    selected_tech_id uuid;
BEGIN
    IF NEW.assigned_to IS NOT NULL THEN
        RETURN NEW;
    END IF;

    -- Find technician with matching skill and lowest workload
    SELECT id INTO selected_tech_id
    FROM profiles p
    WHERE p.role = 'technician'
      AND (NEW.category = ANY(
            SELECT skill FROM technician_skills WHERE profile_id = p.id
          ))
    ORDER BY (
        SELECT COUNT(*)
        FROM tickets t
        WHERE t.assigned_to = p.id
          AND t.status IN ('Open', 'In Progress', 'Pending Verification')
    ) ASC
    LIMIT 1;

    IF selected_tech_id IS NOT NULL THEN
        NEW.assigned_to := selected_tech_id;
        -- Status remains as set by the caller (default 'Open' on INSERT)

        INSERT INTO notifications (user_id, ticket_id, message)
        VALUES (
            selected_tech_id,
            NEW.id,
            'New Task Assigned: ' || NEW.title || ' at ' || COALESCE(NEW.specific_location, 'Unknown')
        );
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Fix the UPDATE trigger (auto_assign_on_verification)
CREATE OR REPLACE FUNCTION auto_assign_on_verification()
RETURNS trigger AS $$
DECLARE
    selected_tech_id uuid;
BEGIN
    -- Only run when status changes from Open to In Progress and no technician assigned
    IF OLD.status = 'Open' AND NEW.status = 'In Progress' AND NEW.assigned_to IS NULL THEN
        -- Find technician with matching skill and lowest workload
        SELECT id INTO selected_tech_id
        FROM profiles p
        WHERE p.role = 'technician'
          AND (NEW.category = ANY(
                SELECT skill FROM technician_skills WHERE profile_id = p.id
              ))
        ORDER BY (
            SELECT COUNT(*)
            FROM tickets t
            WHERE t.assigned_to = p.id
              AND t.status IN ('Open', 'In Progress', 'Pending Verification')
        ) ASC
        LIMIT 1;

        IF selected_tech_id IS NOT NULL THEN
            NEW.assigned_to := selected_tech_id;
            -- Status remains 'In Progress' (set by the verifier), which is a valid status

            INSERT INTO notifications (user_id, ticket_id, message)
            VALUES (
                selected_tech_id,
                NEW.id,
                'New Task Assigned: ' || NEW.title || ' at ' || COALESCE(NEW.specific_location, 'Unknown')
            );
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Restore missing RLS policy: "Technicians can view assigned tickets"
-- This was DROPPED by 20250425_fix_rls_nuclear.sql (which dropped ALL tickets policies)
-- but was never recreated, leaving only the "Users see own tickets" (created_by) policy.
-- Without this, technicians cannot see tickets assigned to them.
DROP POLICY IF EXISTS "Technicians can view assigned tickets" ON tickets;
CREATE POLICY "Technicians can view assigned tickets"
    ON tickets FOR SELECT
    TO authenticated
    USING (assigned_to = auth.uid());

-- 4. Restore profiles RLS for ticket-based access 
-- The nuclear migration reduced profiles to "see own profile" only, which blocks
-- technicians from viewing the reporter's (student's) profile on assigned tickets.
-- Recreate the composite policy that allows ticket-creator and ticket-assignee access.
DROP POLICY IF EXISTS "Users see own profile" ON profiles;
DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
CREATE POLICY "Users can view own profile"
    ON profiles FOR SELECT
    TO authenticated
    USING (
        auth.uid() = id
        OR id IN (
            SELECT assigned_to FROM tickets 
            WHERE created_by = auth.uid() AND assigned_to IS NOT NULL
        )
        OR id IN (
            SELECT created_by FROM tickets 
            WHERE assigned_to = auth.uid()
        )
    );
