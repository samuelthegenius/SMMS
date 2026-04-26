-- ============================================================================
-- AI-Assisted Categorization & Department Assignment
-- Adds department field to tickets and sets up department routing
-- ============================================================================

-- Ensure departments table exists with proper values
INSERT INTO departments (name) VALUES
    ('Electrical Services'),
    ('Plumbing & Waterworks'),
    ('HVAC & Climate Control'),
    ('Carpentry & Joinery'),
    ('IT Support & Infrastructure'),
    ('General Facilities'),
    ('Decorative & Painting Services'),
    ('Civil Engineering & Construction'),
    ('Appliance & Equipment Services'),
    ('Janitorial & Cleaning')
ON CONFLICT (name) DO NOTHING;

-- Add department column to tickets if not exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'tickets' AND column_name = 'department'
    ) THEN
        ALTER TABLE tickets ADD COLUMN department text;
        
        -- Add foreign key constraint
        ALTER TABLE tickets 
        ADD CONSTRAINT fk_tickets_department 
        FOREIGN KEY (department) REFERENCES departments(name) 
        ON DELETE SET NULL;
        
        -- Create index for department lookups
        CREATE INDEX idx_tickets_department ON tickets(department);
    END IF;
END $$;

-- Update existing tickets to set department based on category
UPDATE tickets t
SET department = CASE t.category
    WHEN 'Electrical' THEN 'Electrical Services'
    WHEN 'Plumbing' THEN 'Plumbing & Waterworks'
    WHEN 'HVAC (Air Conditioning)' THEN 'HVAC & Climate Control'
    WHEN 'Carpentry & Furniture' THEN 'Carpentry & Joinery'
    WHEN 'IT & Networking' THEN 'IT Support & Infrastructure'
    WHEN 'General Maintenance' THEN 'General Facilities'
    WHEN 'Painting' THEN 'Decorative & Painting Services'
    WHEN 'Civil Works' THEN 'Civil Engineering & Construction'
    WHEN 'Appliance Repair' THEN 'Appliance & Equipment Services'
    WHEN 'Cleaning Services' THEN 'Janitorial & Cleaning'
    ELSE 'General Facilities'
END
WHERE t.department IS NULL;

-- Update auto-assignment function to consider department
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
        
        INSERT INTO notifications (user_id, ticket_id, message)
        VALUES (
            selected_tech_id,
            NEW.id,
            'New Task Assigned: ' || NEW.title || ' at ' || COALESCE(NEW.specific_location, 'Unknown') || 
            CASE WHEN NEW.department IS NOT NULL THEN ' [' || NEW.department || ']' ELSE '' END
        );
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add comment explaining AI categorization
COMMENT ON COLUMN tickets.department IS 'Department automatically assigned by AI based on category';
