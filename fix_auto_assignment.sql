-- Fix auto-assignment trigger status mismatch
-- The trigger was looking for 'Assigned' status which doesn't exist in the schema

-- Drop the existing trigger
DROP TRIGGER IF EXISTS on_ticket_created ON tickets;

-- Fix the auto-assignment function
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
          AND t.status IN ('Open', 'In Progress', 'Pending Verification')  -- Fixed: removed 'Assigned'
    ) ASC
    LIMIT 1;

    IF selected_tech_id IS NOT NULL THEN
        NEW.assigned_to := selected_tech_id;
        -- Keep status as 'Open' since 'Assigned' is not a valid status
        -- NEW.status := 'Assigned';  -- Removed this line

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

-- Recreate the trigger
CREATE TRIGGER on_ticket_created
    BEFORE INSERT ON tickets
    FOR EACH ROW
    EXECUTE FUNCTION auto_assign_logic();
