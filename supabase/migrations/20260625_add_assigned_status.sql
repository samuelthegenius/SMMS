-- Add 'Assigned' back to the tickets status CHECK constraint.
-- It was inadvertently removed; the frontend and technician dashboard
-- rely on it as the intermediate state between Open and In Progress
-- (technician must click "Start Job" to move it to In Progress).

ALTER TABLE tickets DROP CONSTRAINT IF EXISTS tickets_status_check;

ALTER TABLE tickets
    ADD CONSTRAINT tickets_status_check
    CHECK (status IN ('Open', 'Assigned', 'In Progress', 'Resolved', 'Closed', 'Escalated', 'Pending Verification'));

-- Also update workload-counting queries in auto-assign functions to treat
-- 'Assigned' tickets as active (so they count against a technician's load).
CREATE OR REPLACE FUNCTION auto_assign_logic()
RETURNS trigger AS $$
DECLARE
    selected_tech_id uuid;
BEGIN
    IF NEW.assigned_to IS NOT NULL THEN
        RETURN NEW;
    END IF;

    SELECT id INTO selected_tech_id
    FROM profiles p
    WHERE p.role = 'technician'
      AND p.is_on_duty = true
      AND (NEW.category = ANY(SELECT skill FROM technician_skills WHERE profile_id = p.id))
      AND (NEW.department IS NULL OR p.department = NEW.department OR p.department IS NULL)
    ORDER BY (
        SELECT COUNT(*) FROM tickets t
        WHERE t.assigned_to = p.id AND t.status IN ('Open', 'Assigned', 'In Progress', 'Pending Verification')
    ) ASC LIMIT 1;

    IF selected_tech_id IS NULL THEN
        SELECT id INTO selected_tech_id
        FROM profiles p
        WHERE p.role = 'technician' AND p.is_on_duty = true
          AND (NEW.category = ANY(SELECT skill FROM technician_skills WHERE profile_id = p.id))
        ORDER BY (
            SELECT COUNT(*) FROM tickets t
            WHERE t.assigned_to = p.id AND t.status IN ('Open', 'Assigned', 'In Progress', 'Pending Verification')
        ) ASC LIMIT 1;
    END IF;

    IF selected_tech_id IS NOT NULL THEN
        NEW.assigned_to := selected_tech_id;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


CREATE OR REPLACE FUNCTION auto_assign_on_verification()
RETURNS trigger AS $$
DECLARE
    selected_tech_id uuid;
BEGIN
    IF OLD.status = 'Open' AND NEW.status = 'In Progress' AND NEW.assigned_to IS NULL THEN
        SELECT id INTO selected_tech_id
        FROM profiles p
        WHERE p.role = 'technician'
          AND (NEW.category = ANY(SELECT skill FROM technician_skills WHERE profile_id = p.id))
        ORDER BY (
            SELECT COUNT(*) FROM tickets t
            WHERE t.assigned_to = p.id AND t.status IN ('Open', 'Assigned', 'In Progress', 'Pending Verification')
        ) ASC LIMIT 1;

        IF selected_tech_id IS NOT NULL THEN
            NEW.assigned_to := selected_tech_id;
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
