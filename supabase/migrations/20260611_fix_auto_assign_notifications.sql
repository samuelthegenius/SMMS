-- ============================================================================
-- Fix 409 Conflict during ticket creation (Foreign Key Violation)
-- ============================================================================
-- The previous auto_assign_logic trigger was a BEFORE INSERT trigger that 
-- tried to insert into the notifications table using NEW.id. Since the ticket 
-- was not yet inserted, this violated the foreign key constraint on ticket_id,
-- causing a 409 Conflict in Supabase.
--
-- The fix moves notification insertion entirely to the AFTER trigger
-- (handle_ticket_notifications) where NEW.id safely exists in the database.
-- ============================================================================

-- 1. Fix auto_assign_logic: Remove notification insertion
CREATE OR REPLACE FUNCTION auto_assign_logic()
RETURNS trigger AS $$
DECLARE
    selected_tech_id uuid;
    tech_department_match boolean;
BEGIN
    IF NEW.assigned_to IS NOT NULL THEN
        RETURN NEW;
    END IF;

    -- First try: Find technician with matching skill AND department alignment
    SELECT id INTO selected_tech_id
    FROM profiles p
    WHERE p.role = 'technician'
      AND p.is_on_duty = true
      AND (NEW.category = ANY(
            SELECT skill FROM technician_skills WHERE profile_id = p.id
          ))
      AND (
          -- Check if technician's department matches ticket's department
          NEW.department IS NULL 
          OR p.department = NEW.department
          OR p.department IS NULL
      )
    ORDER BY (
        SELECT COUNT(*)
        FROM tickets t
        WHERE t.assigned_to = p.id
          AND t.status IN ('Open', 'In Progress', 'Pending Verification')
    ) ASC
    LIMIT 1;

    -- Second try: Any technician with matching skill (if department match failed)
    IF selected_tech_id IS NULL THEN
        SELECT id INTO selected_tech_id
        FROM profiles p
        WHERE p.role = 'technician'
          AND p.is_on_duty = true
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
    END IF;

    IF selected_tech_id IS NOT NULL THEN
        NEW.assigned_to := selected_tech_id;
        -- DO NOT insert into notifications here to avoid 409 FK violations!
        -- It is handled by handle_ticket_notifications below.
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 2. Fix auto_assign_on_verification: Remove notification insertion to prevent duplicates
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
            -- DO NOT insert into notifications here!
            -- It is handled by handle_ticket_notifications since OLD.assigned_to != NEW.assigned_to
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 3. Update handle_ticket_notifications (AFTER trigger) to handle auto-assignments on INSERT
CREATE OR REPLACE FUNCTION handle_ticket_notifications()
RETURNS trigger AS $$
BEGIN
    IF (TG_OP = 'INSERT') THEN
        -- Notify creator
        INSERT INTO notifications (user_id, ticket_id, message)
        VALUES (NEW.created_by, NEW.id, 'Ticket Received: ' || NEW.title);

        -- Technician auto-assigned on creation
        IF NEW.assigned_to IS NOT NULL THEN
            INSERT INTO notifications (user_id, ticket_id, message)
            VALUES (
                NEW.assigned_to,
                NEW.id,
                'New Task Assigned: ' || NEW.title || ' at ' || COALESCE(NEW.specific_location, 'Unknown') || 
                CASE WHEN NEW.department IS NOT NULL THEN ' [' || NEW.department || ']' ELSE '' END
            );
        END IF;

    ELSIF (TG_OP = 'UPDATE') THEN
        -- Technician assigned
        IF (OLD.assigned_to IS DISTINCT FROM NEW.assigned_to) AND NEW.assigned_to IS NOT NULL THEN
            INSERT INTO notifications (user_id, ticket_id, message)
            VALUES (
                NEW.assigned_to,
                NEW.id,
                'New Assignment: ' || NEW.title || ' at ' || COALESCE(NEW.specific_location, 'Unknown') || 
                CASE WHEN NEW.department IS NOT NULL THEN ' [' || NEW.department || ']' ELSE '' END
            );
            INSERT INTO notifications (user_id, ticket_id, message)
            VALUES (
                NEW.created_by,
                NEW.id,
                'Technician assigned to your ticket'
            );
        END IF;

        -- Status changed
        IF OLD.status IS DISTINCT FROM NEW.status THEN
            INSERT INTO notifications (user_id, ticket_id, message)
            VALUES (
                NEW.created_by,
                NEW.id,
                'Status Update: ' || NEW.status
            );
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
