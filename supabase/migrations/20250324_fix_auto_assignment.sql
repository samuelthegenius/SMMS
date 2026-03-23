-- Fix auto-assignment trigger status mismatch
-- Only update the function without touching policies

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
