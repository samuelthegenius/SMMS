-- Migration: Add verified ticket escalation alerts
-- Created: 2025-04-25
-- Purpose: Send constant alerts when verified tickets are not attended to after some time

-- 1. Add escalation tracking columns to tickets table
ALTER TABLE tickets 
ADD COLUMN IF NOT EXISTS last_escalation_at timestamptz,
ADD COLUMN IF NOT EXISTS escalation_count integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS verified_at timestamptz;

-- 2. Create index for efficient stale ticket queries
CREATE INDEX IF NOT EXISTS idx_tickets_verified_at ON tickets(verified_at) 
WHERE status IN ('In Progress', 'Assigned');

CREATE INDEX IF NOT EXISTS idx_tickets_escalation ON tickets(last_escalation_at, escalation_count) 
WHERE escalation_count > 0;

-- 3. Function to track when a ticket is verified (status changes to In Progress/Assigned)
CREATE OR REPLACE FUNCTION track_ticket_verification()
RETURNS TRIGGER AS $$
BEGIN
    -- Set verified_at when status changes from Open to In Progress or Assigned
    IF OLD.status = 'Open' AND NEW.status IN ('In Progress', 'Assigned') THEN
        NEW.verified_at := NOW();
    END IF;
    
    -- Reset escalation tracking if ticket is resolved/closed
    IF NEW.status IN ('Resolved', 'Closed') THEN
        NEW.last_escalation_at := NULL;
        NEW.escalation_count := 0;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for tracking verification
DROP TRIGGER IF EXISTS on_ticket_verification_track ON tickets;
CREATE TRIGGER on_ticket_verification_track
    BEFORE UPDATE ON tickets
    FOR EACH ROW
    EXECUTE FUNCTION track_ticket_verification();

-- 4. RPC Function: Get stale tickets (verified but not attended to)
-- Returns tickets that have been verified but not resolved after a threshold time
CREATE OR REPLACE FUNCTION get_stale_tickets(
    p_hours_threshold integer DEFAULT 2  -- Default: 2 hours after verification
)
RETURNS TABLE (
    ticket_id uuid,
    title text,
    status text,
    priority text,
    verified_at timestamptz,
    hours_since_verified numeric,
    assigned_to uuid,
    assigned_to_email text,
    assigned_to_name text,
    department text,
    specific_location text,
    created_by uuid,
    creator_email text,
    escalation_count integer,
    last_escalation_at timestamptz,
    hours_since_last_escalation numeric
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        t.id as ticket_id,
        t.title,
        t.status,
        t.priority,
        t.verified_at,
        ROUND(EXTRACT(EPOCH FROM (NOW() - t.verified_at))/3600, 2) as hours_since_verified,
        t.assigned_to,
        COALESCE(tech.email, 'N/A') as assigned_to_email,
        COALESCE(tech.full_name, 'Unassigned') as assigned_to_name,
        t.department,
        t.specific_location,
        t.created_by,
        COALESCE(creator.email, 'N/A') as creator_email,
        COALESCE(t.escalation_count, 0) as escalation_count,
        t.last_escalation_at,
        CASE 
            WHEN t.last_escalation_at IS NOT NULL 
            THEN ROUND(EXTRACT(EPOCH FROM (NOW() - t.last_escalation_at))/3600, 2)
            ELSE NULL 
        END as hours_since_last_escalation
    FROM tickets t
    LEFT JOIN profiles tech ON tech.id = t.assigned_to
    LEFT JOIN profiles creator ON creator.id = t.created_by
    WHERE t.status IN ('In Progress', 'Assigned')
      AND t.verified_at IS NOT NULL
      AND EXTRACT(EPOCH FROM (NOW() - t.verified_at)) > (p_hours_threshold * 3600)
      AND (t.last_escalation_at IS NULL 
           OR EXTRACT(EPOCH FROM (NOW() - t.last_escalation_at)) > 3600) -- At least 1 hour between escalations
    ORDER BY 
        CASE t.priority 
            WHEN 'High' THEN 1 
            WHEN 'Medium' THEN 2 
            WHEN 'Low' THEN 3 
        END,
        t.verified_at ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION get_stale_tickets(integer) IS 
'Returns tickets verified but not resolved after threshold hours. Used by escalation monitor.';

-- 5. Function to get admin and department head emails for escalation
CREATE OR REPLACE FUNCTION get_escalation_recipients(
    p_department text DEFAULT NULL
)
RETURNS TABLE (
    user_id uuid,
    email text,
    full_name text,
    role text,
    department text,
    is_department_head boolean
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        p.id as user_id,
        p.email,
        p.full_name,
        p.role,
        p.department,
        CASE 
            WHEN p.role = 'admin' THEN true
            WHEN p.department = 'Student Affairs' AND p.role = 'staff' THEN true
            WHEN p.department = p_department AND p.role = 'staff' THEN true
            ELSE false
        END as is_department_head
    FROM profiles p
    WHERE p.role = 'admin'
       OR (p.department = 'Student Affairs' AND p.role = 'staff')
       OR (p_department IS NOT NULL AND p.department = p_department AND p.role IN ('staff', 'src'));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. Function to record escalation and send notifications
CREATE OR REPLACE FUNCTION escalate_stale_ticket(
    p_ticket_id uuid,
    p_message text DEFAULT NULL
)
RETURNS boolean AS $$
DECLARE
    v_ticket_record record;
    v_default_message text;
BEGIN
    -- Get ticket details
    SELECT t.*, tech.email as tech_email, tech.full_name as tech_name,
           creator.email as creator_email
    INTO v_ticket_record
    FROM tickets t
    LEFT JOIN profiles tech ON tech.id = t.assigned_to
    LEFT JOIN profiles creator ON creator.id = t.created_by
    WHERE t.id = p_ticket_id;
    
    IF v_ticket_record IS NULL THEN
        RETURN false;
    END IF;
    
    -- Update escalation tracking
    UPDATE tickets 
    SET escalation_count = COALESCE(escalation_count, 0) + 1,
        last_escalation_at = NOW()
    WHERE id = p_ticket_id;
    
    -- Create default message if none provided
    v_default_message := COALESCE(p_message, 
        format('ESCALATION #%s: Ticket "%s" at %s has been %s for %s hours without resolution. Priority: %s',
            COALESCE(v_ticket_record.escalation_count, 0) + 1,
            v_ticket_record.title,
            COALESCE(v_ticket_record.specific_location, 'Unknown'),
            v_ticket_record.status,
            ROUND(EXTRACT(EPOCH FROM (NOW() - v_ticket_record.verified_at))/3600)::text,
            v_ticket_record.priority
        )
    );
    
    -- Notify assigned technician (if any)
    IF v_ticket_record.assigned_to IS NOT NULL THEN
        INSERT INTO notifications (user_id, ticket_id, message)
        VALUES (
            v_ticket_record.assigned_to,
            p_ticket_id,
            'URGENT: ' || v_default_message
        );
    END IF;
    
    -- Notify ticket creator (student/staff)
    INSERT INTO notifications (user_id, ticket_id, message)
    VALUES (
        v_ticket_record.created_by,
        p_ticket_id,
        'Your ticket is taking longer than expected. Management has been notified.'
    );
    
    -- Notify admins and department heads
    INSERT INTO notifications (user_id, ticket_id, message)
    SELECT 
        er.user_id,
        p_ticket_id,
        CASE 
            WHEN er.role = 'admin' THEN 'ADMIN ESCALATION: ' || v_default_message
            WHEN er.is_department_head THEN 'DEPT ESCALATION: ' || v_default_message
            ELSE 'ESCALATION: ' || v_default_message
        END
    FROM get_escalation_recipients(v_ticket_record.department) er
    WHERE er.user_id != v_ticket_record.assigned_to  -- Don't duplicate notify technician
      AND er.user_id != v_ticket_record.created_by;  -- Don't duplicate notify creator
    
    RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7. Function to get escalation summary for dashboard
CREATE OR REPLACE FUNCTION get_escalation_summary()
RETURNS TABLE (
    total_stale_tickets bigint,
    high_priority_stale bigint,
    avg_hours_pending numeric,
    max_escalation_count integer
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        COUNT(*)::bigint as total_stale_tickets,
        COUNT(*) FILTER (WHERE priority = 'High')::bigint as high_priority_stale,
        ROUND(AVG(EXTRACT(EPOCH FROM (NOW() - verified_at))/3600), 2) as avg_hours_pending,
        COALESCE(MAX(escalation_count), 0) as max_escalation_count
    FROM tickets
    WHERE status IN ('In Progress', 'Assigned')
      AND verified_at IS NOT NULL
      AND EXTRACT(EPOCH FROM (NOW() - verified_at)) > (2 * 3600); -- 2 hours threshold
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 8. Backfill verified_at for existing tickets (set to updated_at if status is In Progress/Assigned)
UPDATE tickets 
SET verified_at = COALESCE(updated_at, created_at)
WHERE status IN ('In Progress', 'Assigned')
  AND verified_at IS NULL;

-- Migration complete
SELECT 'Migration 20250425_add_verified_ticket_escalation completed successfully' as status;
