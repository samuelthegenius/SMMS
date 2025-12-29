-- Admin Notifications for Dispatch and Verification
-- Updates handle_ticket_updates to include Admin alerts for assignment and rejections

CREATE OR REPLACE FUNCTION handle_ticket_updates()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  reporter_name TEXT;
  reporter_first_name TEXT;
  tech_name TEXT;
BEGIN
  -- 1. Fetch Reporter Name (The User who created the ticket)
  SELECT full_name INTO reporter_name FROM profiles WHERE id = NEW.user_id;
  
  -- Fallback if name is missing
  IF reporter_name IS NULL THEN
    reporter_name := 'Unknown User';
  END IF;

  -- Get first name for friendly messages
  reporter_first_name := split_part(reporter_name, ' ', 1);

  -- Scenario 1: New Ticket Created (INSERT)
  IF (TG_OP = 'INSERT') THEN
    -- Notify all Admins and Technicians
    INSERT INTO notifications (user_id, message, created_at)
    SELECT id, 'New Report from ' || reporter_name || ': ' || NEW.category || ' issue in ' || NEW.specific_location, NOW()
    FROM profiles
    WHERE role IN ('admin', 'technician');
    
  ELSIF (TG_OP = 'UPDATE') THEN
    
    -- Scenario 2: Technician Assigned
    IF (NEW.assigned_to IS DISTINCT FROM OLD.assigned_to) AND (NEW.assigned_to IS NOT NULL) THEN
      
      -- A. Notify the Technician
      INSERT INTO notifications (user_id, message, created_at)
      VALUES (NEW.assigned_to, 'You have been assigned to Ticket #' || NEW.id || '. Location: ' || NEW.specific_location, NOW());

      -- B. Dispatch Confirmation: Notify ALL Admins
      -- Fetch Technician Name
      SELECT full_name INTO tech_name FROM profiles WHERE id = NEW.assigned_to;
      IF tech_name IS NULL THEN tech_name := 'Unknown Technician'; END IF;

      INSERT INTO notifications (user_id, message, created_at)
      SELECT id, 'Dispatch Config: Ticket #' || NEW.id || ' assigned to ' || tech_name, NOW()
      FROM profiles
      WHERE role = 'admin';

    END IF;

    -- Scenario 3: Job Done / Pending Verification
    IF (NEW.status = 'Pending Verification') AND (OLD.status IS DISTINCT FROM 'Pending Verification') THEN
      INSERT INTO notifications (user_id, message, created_at)
      VALUES (NEW.user_id, 'Hello ' || reporter_first_name || ', the maintenance request for ' || NEW.specific_location || ' is marked resolved. Please verify the fix.', NOW());
    END IF;

    -- Scenario 4: Rejection (Fix Rejected by Reporter)
    IF (NEW.rejection_reason IS DISTINCT FROM OLD.rejection_reason) AND (NEW.rejection_reason IS NOT NULL) THEN
       
       -- A. Notify the Technician (if assigned)
       IF (NEW.assigned_to IS NOT NULL) THEN
         INSERT INTO notifications (user_id, message, created_at)
         VALUES (NEW.assigned_to, 'Alert: Your fix for ' || NEW.specific_location || ' was rejected by the reporter. Reason: ' || NEW.rejection_reason, NOW());
       END IF;

       -- B. Verification Alert: Notify ALL Admins
       INSERT INTO notifications (user_id, message, created_at)
       SELECT id, 'ALERT: Fix for Ticket #' || NEW.id || ' REJECTED by user. Reason: ' || NEW.rejection_reason, NOW()
       FROM profiles
       WHERE role = 'admin';

    END IF;

    -- Scenario 5: Ticket Escalated (High Priority)
    IF (NEW.priority = 'High') AND (OLD.priority IS DISTINCT FROM 'High') THEN
      INSERT INTO notifications (user_id, message, created_at)
      SELECT id, 'URGENT: Ticket #' || NEW.id || ' has been Escalated!', NOW()
      FROM profiles
      WHERE role = 'admin';
    END IF;

  END IF;

  RETURN NEW;
END;
$$;

-- Ensure Trigger exists (Re-runnable)
DROP TRIGGER IF EXISTS on_ticket_status_change ON tickets;

CREATE TRIGGER on_ticket_status_change
  AFTER INSERT OR UPDATE ON tickets
  FOR EACH ROW
  EXECUTE PROCEDURE handle_ticket_updates();
