-- Migration: Add department column to tickets for department-based routing
-- Created: 2026-04-25

-- 1. Add department column to tickets table
ALTER TABLE tickets 
ADD COLUMN IF NOT EXISTS department text REFERENCES departments(name) ON DELETE SET NULL;

-- Add comment explaining the column
COMMENT ON COLUMN tickets.department IS 'AI-derived or manually assigned department for ticket routing';

-- 2. Create index for performance
CREATE INDEX IF NOT EXISTS idx_tickets_department ON tickets(department);

-- 3. Update existing tickets with default department based on facility_type
UPDATE tickets 
SET department = CASE 
    WHEN facility_type = 'Hostel' THEN 'Student Affairs'
    WHEN facility_type IN ('Lecture Hall', 'Laboratory', 'Library') THEN 'Academic'
    WHEN facility_type IN ('Office', 'Administration') THEN 'Administration'
    ELSE 'Works Department'
END
WHERE department IS NULL;

-- 4. RLS Policy: Staff can verify tickets in their department
-- (Future enhancement - currently SRC and Porters handle verification)

-- 5. Function to auto-assign department based on facility_type if not provided
CREATE OR REPLACE FUNCTION auto_assign_department()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.department IS NULL AND NEW.facility_type IS NOT NULL THEN
        NEW.department := CASE 
            WHEN NEW.facility_type = 'Hostel' THEN 'Student Affairs'
            WHEN NEW.facility_type IN ('Lecture Hall', 'Laboratory', 'Library') THEN 'Academic'
            WHEN NEW.facility_type IN ('Office', 'Administration') THEN 'Administration'
            ELSE 'Works Department'
        END;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for auto-assigning department on insert
DROP TRIGGER IF EXISTS on_ticket_assign_department ON tickets;
CREATE TRIGGER on_ticket_assign_department
    BEFORE INSERT ON tickets
    FOR EACH ROW
    EXECUTE FUNCTION auto_assign_department();

-- 6. Auto-assign technician when ticket is verified (status Open -> In Progress)
-- This handles both SRC and Porter verifications
CREATE OR REPLACE FUNCTION auto_assign_on_verification()
RETURNS TRIGGER AS $$
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
              AND t.status IN ('Open', 'Assigned', 'In Progress', 'Pending Verification')
        ) ASC
        LIMIT 1;

        IF selected_tech_id IS NOT NULL THEN
            NEW.assigned_to := selected_tech_id;
            NEW.status := 'Assigned';

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

-- Create trigger for auto-assignment on verification
DROP TRIGGER IF EXISTS on_ticket_verified ON tickets;
CREATE TRIGGER on_ticket_verified
    BEFORE UPDATE ON tickets
    FOR EACH ROW
    EXECUTE FUNCTION auto_assign_on_verification();

-- 7. Ensure RLS policies exist for verification workflow

-- Policy: SRC can view all tickets (for verification and analytics)
DROP POLICY IF EXISTS "SRC can view all tickets" ON tickets;
CREATE POLICY "SRC can view all tickets"
    ON tickets FOR SELECT
    TO authenticated
    USING (EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid() AND role = 'src'
    ));

-- Policy: SRC can escalate/verify tickets (update status)
DROP POLICY IF EXISTS "SRC can escalate tickets" ON tickets;
CREATE POLICY "SRC can escalate tickets"
    ON tickets FOR UPDATE
    TO authenticated
    USING (EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid() AND role = 'src'
    ))
    WITH CHECK (EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid() AND role = 'src'
    ));

-- Policy: Porters can view hostel tickets
DROP POLICY IF EXISTS "Porters can view hostel tickets" ON tickets;
CREATE POLICY "Porters can view hostel tickets"
    ON tickets FOR SELECT
    TO authenticated
    USING (
        facility_type = 'Hostel'
        AND EXISTS (
            SELECT 1 FROM profiles
            WHERE id = auth.uid() AND role = 'porter'
        )
    );

-- Policy: Porters can update hostel tickets (for verification)
DROP POLICY IF EXISTS "Porters can update hostel tickets" ON tickets;
CREATE POLICY "Porters can update hostel tickets"
    ON tickets FOR UPDATE
    TO authenticated
    USING (
        facility_type = 'Hostel'
        AND EXISTS (
            SELECT 1 FROM profiles
            WHERE id = auth.uid() AND role = 'porter'
        )
    )
    WITH CHECK (
        facility_type = 'Hostel'
        AND EXISTS (
            SELECT 1 FROM profiles
            WHERE id = auth.uid() AND role = 'porter'
        )
    );

-- Policy: Staff can view tickets in their department (for verification)
DROP POLICY IF EXISTS "Staff can view department tickets" ON tickets;
CREATE POLICY "Staff can view department tickets"
    ON tickets FOR SELECT
    TO authenticated
    USING (
        department = (
            SELECT department FROM profiles WHERE id = auth.uid() AND role = 'staff'
        )
        AND EXISTS (
            SELECT 1 FROM profiles
            WHERE id = auth.uid() AND role = 'staff'
        )
    );

-- Policy: Staff can update tickets in their department (for verification)
DROP POLICY IF EXISTS "Staff can update department tickets" ON tickets;
CREATE POLICY "Staff can update department tickets"
    ON tickets FOR UPDATE
    TO authenticated
    USING (
        department = (
            SELECT department FROM profiles WHERE id = auth.uid() AND role = 'staff'
        )
        AND EXISTS (
            SELECT 1 FROM profiles
            WHERE id = auth.uid() AND role = 'staff'
        )
    )
    WITH CHECK (
        department = (
            SELECT department FROM profiles WHERE id = auth.uid() AND role = 'staff'
        )
        AND EXISTS (
            SELECT 1 FROM profiles
            WHERE id = auth.uid() AND role = 'staff'
        )
    );

-- Migration complete
SELECT 'Migration 001_add_ticket_department completed successfully' as status;
