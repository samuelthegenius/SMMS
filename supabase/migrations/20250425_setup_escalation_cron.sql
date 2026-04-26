-- Migration: Set up Supabase Cron Job for ticket escalation with email support
-- Created: 2025-04-25
-- Purpose: Schedule automatic escalation checks using pg_cron + pg_net for HTTP calls

-- Enable required extensions
-- Note: pg_cron and pg_net are already enabled on Supabase hosted projects

-- Create a function that processes escalations and triggers emails via pg_net
CREATE OR REPLACE FUNCTION process_escalation_queue()
RETURNS text AS $$
DECLARE
    v_stale_ticket record;
    v_processed_count integer := 0;
    v_error_count integer := 0;
    v_result text;
    v_supabase_url text := current_setting('app.settings.supabase_url', true);
    v_service_role_key text := current_setting('app.settings.service_role_key', true);
    v_admin_email text;
BEGIN
    -- Get first admin email for escalation notifications
    SELECT email INTO v_admin_email 
    FROM profiles 
    WHERE role = 'admin' 
    LIMIT 1;
    
    -- Process stale tickets
    FOR v_stale_ticket IN 
        SELECT ticket_id, title, hours_since_verified, escalation_count, 
               assigned_to_email, assigned_to_name, department, specific_location, priority
        FROM get_stale_tickets(2)  -- 2 hour threshold
        LIMIT 10  -- Prevent timeout
    LOOP
        BEGIN
            -- Record the escalation in database (creates notifications)
            PERFORM escalate_stale_ticket(
                v_stale_ticket.ticket_id, 
                NULL  -- Use default message
            );
            
            -- Queue email via pg_net HTTP request to Edge Function
            -- pg_net is async - it fires and forgets, response handled separately
            IF v_supabase_url IS NOT NULL AND v_service_role_key IS NOT NULL THEN
                PERFORM net.http_post(
                    url := v_supabase_url || '/functions/v1/send-email',
                    headers := jsonb_build_object(
                        'Authorization', 'Bearer ' || v_service_role_key,
                        'Content-Type', 'application/json'
                    ),
                    body := jsonb_build_object(
                        'type', 'ticket_escalation',
                        'ticket_title', v_stale_ticket.title,
                        'ticket_location', v_stale_ticket.specific_location,
                        'ticket_priority', v_stale_ticket.priority,
                        'technician_email', v_stale_ticket.assigned_to_email,
                        'technician_name', v_stale_ticket.assigned_to_name,
                        'admin_email', v_admin_email,
                        'hours_pending', v_stale_ticket.hours_since_verified,
                        'escalation_count', v_stale_ticket.escalation_count
                    )
                );
            END IF;
            
            v_processed_count := v_processed_count + 1;
            
        EXCEPTION WHEN OTHERS THEN
            v_error_count := v_error_count + 1;
            RAISE WARNING 'Failed to escalate ticket %: %', v_stale_ticket.ticket_id, SQLERRM;
        END;
    END LOOP;
    
    -- Log the run
    INSERT INTO cron_job_logs (job_name, status, details, created_at)
    VALUES (
        'escalation-monitor', 
        CASE WHEN v_error_count = 0 THEN 'success' ELSE 'partial_error' END,
        jsonb_build_object(
            'processed', v_processed_count,
            'errors', v_error_count,
            'timestamp', NOW()
        ),
        NOW()
    );
    
    v_result := format('Processed %s tickets, %s errors', v_processed_count, v_error_count);
    RAISE NOTICE '[Escalation Cron] %', v_result;
    
    RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create table to track cron job execution (if not exists)
CREATE TABLE IF NOT EXISTS cron_job_logs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    job_name text NOT NULL,
    status text NOT NULL,  -- 'success', 'error', 'partial_error'
    details jsonb,
    created_at timestamptz DEFAULT NOW()
);

-- Index for querying recent logs
CREATE INDEX IF NOT EXISTS idx_cron_job_logs_job_created 
ON cron_job_logs(job_name, created_at DESC);

-- Auto-delete old logs after 30 days
CREATE OR REPLACE FUNCTION cleanup_old_cron_logs()
RETURNS void AS $$
BEGIN
    DELETE FROM cron_job_logs WHERE created_at < NOW() - INTERVAL '30 days';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- CONFIGURATION REQUIRED
-- =====================================================
-- Set these secrets before running the cron:
--
-- ALTER DATABASE postgres SET "app.settings.supabase_url" = 'https://your-project.supabase.co';
-- ALTER DATABASE postgres SET "app.settings.service_role_key" = 'eyJ...';
-- 
-- Or set per-session (for testing):
-- SET app.settings.supabase_url = 'https://your-project.supabase.co';
-- SET app.settings.service_role_key = 'eyJ...';
-- =====================================================

-- Schedule the escalation job (every 30 minutes)
-- This runs in UTC. 0,30 * * * * means at minute 0 and 30 of every hour
SELECT cron.schedule(
    'escalation-monitor',     -- job name
    '0,30 * * * *',          -- every 30 minutes
    $$SELECT process_escalation_queue()$$  -- SQL to execute
);

-- Schedule log cleanup (daily at 3 AM UTC)
SELECT cron.schedule(
    'cleanup-cron-logs',
    '0 3 * * *',
    $$SELECT cleanup_old_cron_logs()$$
);

-- View existing cron jobs
-- SELECT * FROM cron.job;

-- View pending pg_net requests (for debugging)
-- SELECT * FROM net._http_response ORDER BY created_at DESC LIMIT 10;

-- To unschedule if needed:
-- SELECT cron.unschedule('escalation-monitor');
-- SELECT cron.unschedule('cleanup-cron-logs');

-- Migration complete
SELECT 'Migration 20250425_setup_escalation_cron completed successfully' as status;
