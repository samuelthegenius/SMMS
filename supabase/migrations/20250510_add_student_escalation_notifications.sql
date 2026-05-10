-- Migration: Add student notifications for ticket escalation and rework
-- Created: 2026-05-10
-- Purpose: Update handle_satisfaction_feedback to notify students when tickets are escalated or sent for rework

-- ============================================================================
-- UPDATED: Handle satisfaction feedback with student notifications
-- ============================================================================

-- Drop and recreate the function with student notification support
CREATE OR REPLACE FUNCTION handle_satisfaction_feedback()
RETURNS TRIGGER AS $$
DECLARE
    v_rejection_threshold INTEGER := 2;
    v_src_user_id UUID;
BEGIN
    IF OLD.satisfaction_status IS DISTINCT FROM NEW.satisfaction_status THEN
        NEW.satisfaction_submitted_at := NOW();
        
        IF NEW.satisfaction_status = 'unsatisfied' THEN
            NEW.rejection_count := COALESCE(OLD.rejection_count, 0) + 1;
            NEW.status := 'In Progress';
            
            IF NEW.rejection_count >= v_rejection_threshold THEN
                NEW.status := 'Escalated';
                NEW.priority := 'High';
                
                SELECT id INTO v_src_user_id
                FROM profiles WHERE role = 'src' LIMIT 1;
                
                -- Notify SRC about escalation
                IF v_src_user_id IS NOT NULL THEN
                    INSERT INTO notifications (user_id, ticket_id, message)
                    VALUES (v_src_user_id, NEW.id,
                        'ESCALATION: Ticket "' || NEW.title || '" rejected ' || 
                        NEW.rejection_count || ' times. Requires intervention.');
                END IF;
                
                -- Notify admin about escalation
                INSERT INTO notifications (user_id, ticket_id, message)
                SELECT id, NEW.id, 'ESCALATION: High-priority ticket requires intervention'
                FROM profiles WHERE role = 'admin' LIMIT 1;
                
                -- Notify student that their ticket has been escalated
                INSERT INTO notifications (user_id, ticket_id, message)
                VALUES (NEW.created_by, NEW.id,
                    'Your ticket "' || NEW.title || '" has been escalated to SRC due to multiple unsatisfactory resolutions. An administrator will now handle your case.');
            ELSE
                -- Notify assigned technician about rework needed
                IF NEW.assigned_to IS NOT NULL THEN
                    INSERT INTO notifications (user_id, ticket_id, message)
                    VALUES (NEW.assigned_to, NEW.id,
                        'REWORK NEEDED: "' || NEW.title || '" rejected (#' || 
                        NEW.rejection_count || '). ' || 
                        COALESCE(LEFT(NEW.customer_feedback, 50), 'No feedback'));
                END IF;
                
                -- Notify student about rework status
                INSERT INTO notifications (user_id, ticket_id, message)
                VALUES (NEW.created_by, NEW.id,
                    'Your ticket "' || NEW.title || '" has been returned for rework (attempt ' || 
                    NEW.rejection_count || ' of ' || v_rejection_threshold || '). The technician will address your concerns.');
            END IF;
            
        ELSIF NEW.satisfaction_status = 'satisfied' THEN
            NEW.status := 'Resolved';
            NEW.updated_at := NOW();
            
            IF NEW.assigned_to IS NOT NULL AND NEW.rating IS NOT NULL THEN
                INSERT INTO notifications (user_id, ticket_id, message)
                VALUES (NEW.assigned_to, NEW.id,
                    'Positive feedback! Rating: ' || NEW.rating || '/5 stars');
            END IF;
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Ensure the trigger exists
DROP TRIGGER IF EXISTS on_satisfaction_feedback ON tickets;
CREATE TRIGGER on_satisfaction_feedback
    BEFORE UPDATE ON tickets
    FOR EACH ROW
    EXECUTE FUNCTION handle_satisfaction_feedback();

-- Migration complete
SELECT 'Migration 20250510_add_student_escalation_notifications completed successfully' as status;
