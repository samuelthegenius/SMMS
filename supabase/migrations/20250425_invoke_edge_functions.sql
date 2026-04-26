-- Migration: Invoke Supabase Edge Functions via pg_cron + pg_net
-- Created: 2025-04-25
-- Purpose: Schedule automatic calls to escalation-monitor and notification-dispatcher edge functions

-- =====================================================
-- CONFIGURATION REQUIRED
-- =====================================================
-- Set these secrets BEFORE running the cron schedule:
--
-- ALTER DATABASE postgres SET "app.settings.supabase_url" = 'https://your-project.supabase.co';
-- ALTER DATABASE postgres SET "app.settings.service_role_key" = 'your-service-role-key';
-- 
-- Or set per-session for testing:
-- SET app.settings.supabase_url = 'https://your-project.supabase.co';
-- SET app.settings.service_role_key = 'your-service-role-key';
-- =====================================================

-- Create a function that invokes the escalation-monitor edge function
CREATE OR REPLACE FUNCTION invoke_escalation_monitor()
RETURNS text AS $$
DECLARE
    v_supabase_url text := current_setting('app.settings.supabase_url', true);
    v_service_role_key text := current_setting('app.settings.service_role_key', true);
    v_result_id bigint;
BEGIN
    -- Check if config is set
    IF v_supabase_url IS NULL OR v_service_role_key IS NULL THEN
        RAISE EXCEPTION 'Missing configuration: app.settings.supabase_url or app.settings.service_role_key';
    END IF;
    
    -- Invoke the escalation-monitor edge function via pg_net
    -- pg_net is async - returns immediately, runs in background
    SELECT net.http_post(
        url := v_supabase_url || '/functions/v1/escalation-monitor',
        headers := jsonb_build_object(
            'Authorization', 'Bearer ' || v_service_role_key,
            'Content-Type', 'application/json'
        ),
        body := '{}'::jsonb,
        timeout_milliseconds := 25000  -- 25 second timeout
    ) INTO v_result_id;
    
    -- Log the invocation
    INSERT INTO cron_job_logs (job_name, status, details, created_at)
    VALUES (
        'escalation-monitor-invoke', 
        'invoked',
        jsonb_build_object(
            'pg_net_request_id', v_result_id,
            'timestamp', NOW()
        ),
        NOW()
    );
    
    RETURN format('Escalation monitor invoked (request_id: %s)', v_result_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create a function that invokes the notification-dispatcher edge function
CREATE OR REPLACE FUNCTION invoke_notification_dispatcher()
RETURNS text AS $$
DECLARE
    v_supabase_url text := current_setting('app.settings.supabase_url', true);
    v_service_role_key text := current_setting('app.settings.service_role_key', true);
    v_result_id bigint;
BEGIN
    IF v_supabase_url IS NULL OR v_service_role_key IS NULL THEN
        RAISE EXCEPTION 'Missing configuration';
    END IF;
    
    SELECT net.http_post(
        url := v_supabase_url || '/functions/v1/notification-dispatcher',
        headers := jsonb_build_object(
            'Authorization', 'Bearer ' || v_service_role_key,
            'Content-Type', 'application/json'
        ),
        body := '{}'::jsonb,
        timeout_milliseconds := 25000
    ) INTO v_result_id;
    
    INSERT INTO cron_job_logs (job_name, status, details, created_at)
    VALUES (
        'notification-dispatcher-invoke', 
        'invoked',
        jsonb_build_object('pg_net_request_id', v_result_id, 'timestamp', NOW()),
        NOW()
    );
    
    RETURN format('Notification dispatcher invoked (request_id: %s)', v_result_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- SCHEDULE THE JOBS
-- =====================================================

-- Schedule escalation-monitor to run every 30 minutes
-- Note: If jobs already exist, you'll get an error - that's OK, just means they're already scheduled
SELECT cron.schedule(
    'escalation-monitor-edge',
    '*/30 * * * *',
    $$SELECT invoke_escalation_monitor()$$
);

-- Schedule notification-dispatcher to run every 5 minutes (to process pending notifications)
SELECT cron.schedule(
    'notification-dispatcher-edge',
    '*/5 * * * *',
    $$SELECT invoke_notification_dispatcher()$$
);

-- =====================================================
-- VERIFICATION QUERIES
-- =====================================================

-- Check scheduled jobs
SELECT * FROM cron.job;

-- Check pg_net request history
-- SELECT * FROM net._http_response ORDER BY created_at DESC LIMIT 10;

-- Check cron logs
-- SELECT * FROM cron_job_logs ORDER BY created_at DESC LIMIT 10;

-- =====================================================
-- MANUAL TEST: Invoke edge functions directly
-- =====================================================

-- Test escalation monitor manually:
-- SELECT invoke_escalation_monitor();

-- Test notification dispatcher manually:
-- SELECT invoke_notification_dispatcher();

-- Check pending notifications:
-- SELECT channel, status, COUNT(*) FROM notification_logs WHERE status = 'pending' GROUP BY channel, status;

-- Migration complete
SELECT 'Migration 20250425_invoke_edge_functions completed successfully' as status;
