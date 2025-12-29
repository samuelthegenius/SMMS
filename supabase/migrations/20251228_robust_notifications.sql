-- Robust Notification System Trigger
-- Handles INSERT (Creation) and UPDATE (Assignment, Status Change, Escalation)

CREATE OR REPLACE FUNCTION handle_ticket_updates()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  admin_cursor RECORD;
  tech_record RECORD;
BEGIN
  -- Scenario 1: New Ticket Created (INSERT)
  IF (TG_OP = 'INSERT') THEN
    -- Notify all Admins and Technicians
    -- We can do this in a single set-based insert for efficiency
    INSERT INTO notifications (user_id, message, created_at)
    SELECT id, 'New Request: ' || NEW.title || ' in ' || NEW.specific_location, NOW()
    FROM profiles
    WHERE role IN ('admin', 'technician');
    
  ELSIF (TG_OP = 'UPDATE') THEN
    
    -- Scenario 2: Technician Assigned
    IF (NEW.assigned_to IS DISTINCT FROM OLD.assigned_to) AND (NEW.assigned_to IS NOT NULL) THEN
      INSERT INTO notifications (user_id, message, created_at)
      VALUES (NEW.assigned_to, 'You have been assigned to Ticket #' || NEW.id || '. Location: ' || NEW.specific_location, NOW());
    END IF;

    -- Scenario 3: Job Done / Pending Verification
    -- Notifying the Student (Creator)
    IF (NEW.status = 'Pending Verification') AND (OLD.status IS DISTINCT FROM 'Pending Verification') THEN
      INSERT INTO notifications (user_id, message, created_at)
      VALUES (NEW.user_id, 'Technician has finished Ticket #' || NEW.id || '. Please verify the fix.', NOW());
    END IF;

    -- Scenario 4: Ticket Escalated
    -- Trigger on High Priority change (assuming this signifies escalation)
    -- OR if you had a specific status 'Escalated', add: OR (NEW.status = 'Escalated' AND ...)
    IF (NEW.priority = 'High') AND (OLD.priority IS DISTINCT FROM 'High') THEN
      -- Notify all Admins
      INSERT INTO notifications (user_id, message, created_at)
      SELECT id, 'URGENT: Ticket #' || NEW.id || ' has been Escalated!', NOW()
      FROM profiles
      WHERE role = 'admin';
    END IF;

  END IF;

  RETURN NEW;
END;
$$;

-- Recreate the trigger to include INSERT
DROP TRIGGER IF EXISTS on_ticket_status_change ON tickets;

CREATE TRIGGER on_ticket_status_change
  AFTER INSERT OR UPDATE ON tickets
  FOR EACH ROW
  EXECUTE PROCEDURE handle_ticket_updates();
