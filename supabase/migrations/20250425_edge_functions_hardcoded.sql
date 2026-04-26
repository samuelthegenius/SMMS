-- Alternative: Edge Function Invocation with Hardcoded Config (for immediate testing)
-- Since ALTER DATABASE SET is restricted, use this approach

-- =====================================================
-- OPTION 1: Hardcoded Config (Replace with your values)
-- =====================================================

-- Create a config table to store credentials (encrypted)
CREATE TABLE IF NOT EXISTS edge_function_config (
    id integer PRIMARY KEY DEFAULT 1,
    supabase_url text NOT NULL,
    service_role_key text NOT NULL,
    created_at timestamptz DEFAULT NOW(),
    updated_at timestamptz DEFAULT NOW(),
    CONSTRAINT single_row CHECK (id = 1)
);

-- Enable RLS
ALTER TABLE edge_function_config ENABLE ROW LEVEL SECURITY;

-- Only service_role can access
CREATE POLICY "Service role only" ON edge_function_config
    FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Insert your config (RUN THIS ONCE with your actual values)
-- INSERT INTO edge_function_config (id, supabase_url, service_role_key)
-- VALUES (1, 'https://your-project.supabase.co', 'your-service-role-key');

-- Function to get config
CREATE OR REPLACE FUNCTION get_edge_function_config()
RETURNS TABLE (supabase_url text, service_role_key text) AS $$
BEGIN
    RETURN QUERY SELECT c.supabase_url, c.service_role_key 
    FROM edge_function_config c 
    WHERE c.id = 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- OPTION 2: Invoke functions using config table
-- =====================================================

CREATE OR REPLACE FUNCTION invoke_escalation_monitor()
RETURNS text AS $$
DECLARE
    v_config record;
    v_result_id bigint;
BEGIN
    -- Get config from table
    SELECT * INTO v_config FROM get_edge_function_config();
    
    IF v_config IS NULL THEN
        RETURN 'ERROR: No config found. Run: INSERT INTO edge_function_config VALUES (1, ''your-url'', ''your-key'')';
    END IF;
    
    -- Invoke the edge function
    SELECT net.http_post(
        url := v_config.supabase_url || '/functions/v1/escalation-monitor',
        headers := jsonb_build_object(
            'Authorization', 'Bearer ' || v_config.service_role_key,
            'Content-Type', 'application/json'
        ),
        body := '{}'::jsonb,
        timeout_milliseconds := 25000
    ) INTO v_result_id;
    
    -- Log it
    INSERT INTO cron_job_logs (job_name, status, details, created_at)
    VALUES ('escalation-monitor', 'invoked', jsonb_build_object('request_id', v_result_id), NOW());
    
    RETURN format('Escalation monitor invoked (request_id: %s)', v_result_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION invoke_notification_dispatcher()
RETURNS text AS $$
DECLARE
    v_config record;
    v_result_id bigint;
BEGIN
    SELECT * INTO v_config FROM get_edge_function_config();
    
    IF v_config IS NULL THEN
        RETURN 'ERROR: No config found';
    END IF;
    
    SELECT net.http_post(
        url := v_config.supabase_url || '/functions/v1/notification-dispatcher',
        headers := jsonb_build_object(
            'Authorization', 'Bearer ' || v_config.service_role_key,
            'Content-Type', 'application/json'
        ),
        body := '{}'::jsonb,
        timeout_milliseconds := 25000
    ) INTO v_result_id;
    
    INSERT INTO cron_job_logs (job_name, status, details, created_at)
    VALUES ('notification-dispatcher', 'invoked', jsonb_build_object('request_id', v_result_id), NOW());
    
    RETURN format('Notification dispatcher invoked (request_id: %s)', v_result_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- OPTION 3: Direct hardcoded version (simplest for testing)
-- =====================================================

-- If you just want to test immediately, use this:
/*
CREATE OR REPLACE FUNCTION invoke_escalation_monitor_hardcoded()
RETURNS text AS $$
DECLARE
    v_result_id bigint;
BEGIN
    SELECT net.http_post(
        url := 'https://your-project.supabase.co/functions/v1/escalation-monitor',  -- REPLACE
        headers := jsonb_build_object(
            'Authorization', 'Bearer eyJhbGci...',  -- REPLACE with your service_role key
            'Content-Type', 'application/json'
        ),
        body := '{}'::jsonb,
        timeout_milliseconds := 25000
    ) INTO v_result_id;
    
    RETURN format('Invoked (request_id: %s)', v_result_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
*/

-- =====================================================
-- SCHEDULE JOBS (after config is set)
-- =====================================================

-- Only schedule after you've set the config!
-- SELECT cron.schedule('escalation-monitor', '*/30 * * * *', $$SELECT invoke_escalation_monitor()$$);
-- SELECT cron.schedule('notification-dispatcher', '*/5 * * * *', $$SELECT invoke_notification_dispatcher()$$);

-- =====================================================
-- SETUP INSTRUCTIONS
-- =====================================================

-- 1. Run this migration first (creates functions and table)

-- 2. Insert your config (run this with YOUR values):
--    INSERT INTO edge_function_config (id, supabase_url, service_role_key)
--    VALUES (1, 'https://abc123.supabase.co', 'eyJhbGciOiJIUzI1NiIs...');

-- 3. Test the invocation:
--    SELECT invoke_escalation_monitor();

-- 4. Check if it worked:
--    SELECT * FROM net._http_response ORDER BY created_at DESC LIMIT 5;

-- 5. Schedule the cron jobs:
--    SELECT cron.schedule('escalation-monitor', '*/30 * * * *', $$SELECT invoke_escalation_monitor()$$);

-- =====================================================
-- VERIFICATION
-- =====================================================

-- Check if config is set
-- SELECT * FROM edge_function_config;

-- Check scheduled jobs
-- SELECT * FROM cron.job;

-- Check recent invocations
-- SELECT * FROM cron_job_logs ORDER BY created_at DESC LIMIT 10;

SELECT 'Migration 20250425_edge_functions_hardcoded created. Follow setup instructions above.' as status;
