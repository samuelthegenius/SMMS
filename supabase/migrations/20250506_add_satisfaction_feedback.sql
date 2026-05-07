-- ============================================================================
-- Add Satisfaction Feedback System
-- ============================================================================
-- This migration adds satisfaction tracking, ratings, and auto-escalation
-- for repeated rejections
-- ============================================================================

-- ============================================================================
-- 1. ADD NEW COLUMNS TO TICKETS TABLE
-- ============================================================================
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS satisfaction_status TEXT 
    CHECK (satisfaction_status IN ('satisfied', 'unsatisfied', 'pending', null));

ALTER TABLE tickets ADD COLUMN IF NOT EXISTS rating INTEGER 
    CHECK (rating >= 1 AND rating <= 5);

ALTER TABLE tickets ADD COLUMN IF NOT EXISTS rejection_count INTEGER DEFAULT 0;

-- feedback_text already exists as rejection_reason, but we'll add a dedicated feedback column
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS customer_feedback TEXT;

-- Add satisfaction_submitted_at timestamp
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS satisfaction_submitted_at TIMESTAMPTZ;

-- ============================================================================
-- 2. CREATE INDEXES FOR PERFORMANCE
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_tickets_satisfaction_status ON tickets(satisfaction_status);
CREATE INDEX IF NOT EXISTS idx_tickets_rating ON tickets(rating);
CREATE INDEX IF NOT EXISTS idx_tickets_rejection_count ON tickets(rejection_count);
CREATE INDEX IF NOT EXISTS idx_tickets_assigned_to_rating ON tickets(assigned_to, rating);

-- ============================================================================
-- 3. CREATE FUNCTION TO HANDLE SATISFACTION SUBMISSION
-- ============================================================================
CREATE OR REPLACE FUNCTION handle_satisfaction_feedback()
RETURNS TRIGGER AS $$
DECLARE
    v_rejection_threshold INTEGER := 2; -- Escalate after 2 rejections
    v_technician_id UUID;
    v_src_user_id UUID;
BEGIN
    -- Only process when satisfaction_status is being updated
    IF OLD.satisfaction_status IS DISTINCT FROM NEW.satisfaction_status THEN
        -- Set the timestamp when feedback is submitted
        NEW.satisfaction_submitted_at := NOW();
        
        -- Handle unsatisfied feedback
        IF NEW.satisfaction_status = 'unsatisfied' THEN
            -- Increment rejection count
            NEW.rejection_count := COALESCE(OLD.rejection_count, 0) + 1;
            
            -- Move back to In Progress for rework
            NEW.status := 'In Progress';
            
            -- Check if we need to escalate
            IF NEW.rejection_count >= v_rejection_threshold THEN
                -- Escalate ticket
                NEW.status := 'Escalated';
                NEW.priority := 'High';
                
                -- Find an SRC member to notify
                SELECT id INTO v_src_user_id
                FROM profiles
                WHERE role = 'src'
                LIMIT 1;
                
                -- Notify SRC if found
                IF v_src_user_id IS NOT NULL THEN
                    INSERT INTO notifications (user_id, ticket_id, message)
                    VALUES (
                        v_src_user_id,
                        NEW.id,
                        'ESCALATION: Ticket "' || NEW.title || '" has been rejected ' || 
                        NEW.rejection_count || ' times. Requires intervention.'
                    );
                END IF;
                
                -- Notify admin
                INSERT INTO notifications (user_id, ticket_id, message)
                SELECT 
                    id,
                    NEW.id,
                    'ESCALATION: High-priority ticket requires supervisor intervention after ' ||
                    NEW.rejection_count || ' rejections'
                FROM profiles
                WHERE role = 'admin'
                LIMIT 1;
                
                -- Log the escalation event
                INSERT INTO security_events (event_type, severity, details)
                VALUES (
                    'ticket_escalation',
                    'high',
                    jsonb_build_object(
                        'ticket_id', NEW.id,
                        'rejection_count', NEW.rejection_count,
                        'technician_id', NEW.assigned_to,
                        'reason', NEW.customer_feedback
                    )
                );
            ELSE
                -- Normal notification to technician for rework
                IF NEW.assigned_to IS NOT NULL THEN
                    INSERT INTO notifications (user_id, ticket_id, message)
                    VALUES (
                        NEW.assigned_to,
                        NEW.id,
                        'REWORK NEEDED: Ticket "' || NEW.title || '" rejected (Attempt #' || 
                        NEW.rejection_count || '). Feedback: ' || 
                        COALESCE(LEFT(NEW.customer_feedback, 50), 'No feedback provided') || '...'
                    );
                END IF;
            END IF;
            
        -- Handle satisfied feedback
        ELSIF NEW.satisfaction_status = 'satisfied' THEN
            -- Move to Resolved
            NEW.status := 'Resolved';
            NEW.updated_at := NOW();
            
            -- Notify technician of positive feedback
            IF NEW.assigned_to IS NOT NULL AND NEW.rating IS NOT NULL THEN
                INSERT INTO notifications (user_id, ticket_id, message)
                VALUES (
                    NEW.assigned_to,
                    NEW.id,
                    'Positive feedback received! Rating: ' || NEW.rating || '/5 stars'
                );
            END IF;
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 4. CREATE TRIGGER FOR SATISFACTION HANDLING
-- ============================================================================
DROP TRIGGER IF EXISTS on_satisfaction_feedback ON tickets;
CREATE TRIGGER on_satisfaction_feedback
    BEFORE UPDATE ON tickets
    FOR EACH ROW
    EXECUTE FUNCTION handle_satisfaction_feedback();

-- ============================================================================
-- 5. CREATE FUNCTION TO GET TECHNICIAN SATISFACTION METRICS
-- ============================================================================
CREATE OR REPLACE FUNCTION get_technician_satisfaction_metrics(p_technician_id UUID)
RETURNS TABLE (
    total_completed BIGINT,
    avg_rating NUMERIC,
    satisfaction_rate NUMERIC,
    total_rejections BIGINT,
    rating_5_count BIGINT,
    rating_4_count BIGINT,
    rating_3_count BIGINT,
    rating_2_count BIGINT,
    rating_1_count BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        COUNT(*)::BIGINT as total_completed,
        ROUND(AVG(rating)::NUMERIC, 2) as avg_rating,
        ROUND(
            (COUNT(*) FILTER (WHERE satisfaction_status = 'satisfied')::NUMERIC / 
            NULLIF(COUNT(*) FILTER (WHERE satisfaction_status IS NOT NULL), 0)) * 100, 
            2
        ) as satisfaction_rate,
        SUM(rejection_count)::BIGINT as total_rejections,
        COUNT(*) FILTER (WHERE rating = 5)::BIGINT as rating_5_count,
        COUNT(*) FILTER (WHERE rating = 4)::BIGINT as rating_4_count,
        COUNT(*) FILTER (WHERE rating = 3)::BIGINT as rating_3_count,
        COUNT(*) FILTER (WHERE rating = 2)::BIGINT as rating_2_count,
        COUNT(*) FILTER (WHERE rating = 1)::BIGINT as rating_1_count
    FROM tickets
    WHERE assigned_to = p_technician_id
      AND status IN ('Resolved', 'Closed')
      AND satisfaction_status IS NOT NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 6. CREATE FUNCTION TO GET DEPARTMENT SATISFACTION ANALYTICS
-- ============================================================================
CREATE OR REPLACE FUNCTION get_department_satisfaction_analytics()
RETURNS TABLE (
    department_name TEXT,
    total_tickets BIGINT,
    avg_rating NUMERIC,
    satisfaction_rate NUMERIC,
    avg_rejections NUMERIC
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        COALESCE(t.department, 'Unassigned') as department_name,
        COUNT(*)::BIGINT as total_tickets,
        ROUND(AVG(t.rating)::NUMERIC, 2) as avg_rating,
        ROUND(
            (COUNT(*) FILTER (WHERE t.satisfaction_status = 'satisfied')::NUMERIC / 
            NULLIF(COUNT(*) FILTER (WHERE t.satisfaction_status IS NOT NULL), 0)) * 100, 
            2
        ) as satisfaction_rate,
        ROUND(AVG(t.rejection_count)::NUMERIC, 2) as avg_rejections
    FROM tickets t
    WHERE t.status IN ('Resolved', 'Closed')
      AND t.satisfaction_status IS NOT NULL
    GROUP BY t.department;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 7. CREATE FUNCTION TO GET ESCALATED TICKETS (FOR ADMIN/SRC DASHBOARD)
-- ============================================================================
CREATE OR REPLACE FUNCTION get_escalated_tickets()
RETURNS TABLE (
    id UUID,
    title TEXT,
    rejection_count INTEGER,
    customer_feedback TEXT,
    technician_name TEXT,
    reporter_name TEXT,
    department TEXT,
    created_at TIMESTAMPTZ,
    last_updated TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        t.id,
        t.title,
        t.rejection_count,
        t.customer_feedback,
        COALESCE(tech.full_name, 'Unassigned') as technician_name,
        COALESCE(rep.full_name, 'Unknown') as reporter_name,
        t.department,
        t.created_at,
        t.updated_at as last_updated
    FROM tickets t
    LEFT JOIN profiles tech ON t.assigned_to = tech.id
    LEFT JOIN profiles rep ON t.created_by = rep.id
    WHERE t.status = 'Escalated'
       OR (t.rejection_count >= 2 AND t.status != 'Resolved')
    ORDER BY t.rejection_count DESC, t.updated_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 8. UPDATE RLS POLICIES FOR NEW FIELDS
-- ============================================================================
-- Users can update satisfaction fields on their own tickets when pending verification
CREATE POLICY "Users can submit satisfaction feedback"
    ON tickets FOR UPDATE
    TO authenticated
    USING (
        created_by = auth.uid() 
        AND status = 'Pending Verification'
    )
    WITH CHECK (
        created_by = auth.uid()
        AND (
            satisfaction_status IN ('satisfied', 'unsatisfied', 'pending')
            OR satisfaction_status IS NULL
        )
        AND (rating IS NULL OR (rating >= 1 AND rating <= 5))
    );

-- ============================================================================
-- 9. ADD CATEGORY-LEVEL SATISFACTION METRICS FUNCTION
-- ============================================================================
CREATE OR REPLACE FUNCTION get_category_satisfaction_analytics()
RETURNS TABLE (
    category_name TEXT,
    total_tickets BIGINT,
    avg_rating NUMERIC,
    satisfaction_rate NUMERIC,
    total_rejections BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        COALESCE(t.category, 'Uncategorized') as category_name,
        COUNT(*)::BIGINT as total_tickets,
        ROUND(AVG(t.rating)::NUMERIC, 2) as avg_rating,
        ROUND(
            (COUNT(*) FILTER (WHERE t.satisfaction_status = 'satisfied')::NUMERIC / 
            NULLIF(COUNT(*) FILTER (WHERE t.satisfaction_status IS NOT NULL), 0)) * 100, 
            2
        ) as satisfaction_rate,
        SUM(t.rejection_count)::BIGINT as total_rejections
    FROM tickets t
    WHERE t.status IN ('Resolved', 'Closed')
      AND t.satisfaction_status IS NOT NULL
    GROUP BY t.category
    ORDER BY avg_rating DESC NULLS LAST;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 10. CREATE VIEW FOR TECHNICIAN PERFORMANCE DASHBOARD
-- ============================================================================
CREATE OR REPLACE VIEW technician_performance_summary AS
SELECT 
    p.id as technician_id,
    p.full_name as technician_name,
    p.department,
    COUNT(t.id) FILTER (WHERE t.status IN ('Resolved', 'Closed')) as total_completed_jobs,
    COUNT(t.id) FILTER (WHERE t.satisfaction_status IS NOT NULL) as rated_jobs,
    ROUND(AVG(t.rating) FILTER (WHERE t.rating IS NOT NULL)::NUMERIC, 2) as avg_rating,
    ROUND(
        (COUNT(*) FILTER (WHERE t.satisfaction_status = 'satisfied')::NUMERIC / 
        NULLIF(COUNT(*) FILTER (WHERE t.satisfaction_status IS NOT NULL), 0)) * 100, 
        2
    ) as satisfaction_rate,
    SUM(t.rejection_count) as total_rejections,
    COUNT(t.id) FILTER (WHERE t.rejection_count >= 2) as escalated_tickets
FROM profiles p
LEFT JOIN tickets t ON t.assigned_to = p.id
WHERE p.role = 'technician'
GROUP BY p.id, p.full_name, p.department;

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================
