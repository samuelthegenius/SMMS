-- Debug guide for edge function invocation issues

-- =====================================================
-- STEP 1: Check if configuration is set
-- =====================================================

-- Check current settings
SELECT 
    current_setting('app.settings.supabase_url', true) as supabase_url,
    current_setting('app.settings.service_role_key', true) as service_role_key_set,
    CASE 
        WHEN current_setting('app.settings.service_role_key', true) IS NOT NULL 
        THEN 'Yes (length: ' || length(current_setting('app.settings.service_role_key', true)) || ')'
        ELSE 'No'
    END as has_service_key;

-- =====================================================
-- STEP 2: Test configuration manually
-- =====================================================

-- Try to read the settings in a DO block
DO $$
DECLARE
    v_url text;
    v_key text;
BEGIN
    v_url := current_setting('app.settings.supabase_url', true);
    v_key := current_setting('app.settings.service_role_key', true);
    
    RAISE NOTICE 'Supabase URL: %', v_url;
    RAISE NOTICE 'Service Key Present: %', CASE WHEN v_key IS NOT NULL THEN 'Yes' ELSE 'No' END;
    
    IF v_url IS NULL THEN
        RAISE EXCEPTION 'ERROR: app.settings.supabase_url is not set!';
    END IF;
    
    IF v_key IS NULL THEN
        RAISE EXCEPTION 'ERROR: app.settings.service_role_key is not set!';
    END IF;
    
    RAISE NOTICE 'Configuration OK!';
END;
$$;

-- =====================================================
-- STEP 3: Test invoke function with error handling
-- =====================================================

-- Test escalation monitor with full error details
CREATE OR REPLACE FUNCTION test_escalation_invoke()
RETURNS TABLE (
    step text,
    result text,
    error_detail text
) AS $$
DECLARE
    v_url text;
    v_key text;
    v_result_id bigint;
BEGIN
    -- Step 1: Read config
    RETURN QUERY SELECT '1. Reading config'::text, 'OK'::text, ''::text;
    
    BEGIN
        v_url := current_setting('app.settings.supabase_url', true);
        v_key := current_setting('app.settings.service_role_key', true);
        
        IF v_url IS NULL THEN
            RETURN QUERY SELECT '1. Config'::text, 'FAILED'::text, 'supabase_url is NULL'::text;
            RETURN;
        END IF;
        
        IF v_key IS NULL THEN
            RETURN QUERY SELECT '1. Config'::text, 'FAILED'::text, 'service_role_key is NULL'::text;
            RETURN;
        END IF;
        
        RETURN QUERY SELECT '1. Config'::text, 'OK'::text, format('URL: %s', v_url)::text;
    EXCEPTION WHEN OTHERS THEN
        RETURN QUERY SELECT '1. Config'::text, 'ERROR'::text, SQLERRM::text;
        RETURN;
    END;
    
    -- Step 2: Test pg_net availability
    RETURN QUERY SELECT '2. pg_net check'::text, 'OK'::text, ''::text;
    
    -- Step 3: Try HTTP call
    BEGIN
        SELECT net.http_post(
            url := v_url || '/functions/v1/escalation-monitor',
            headers := jsonb_build_object(
                'Authorization', 'Bearer ' || v_key,
                'Content-Type', 'application/json'
            ),
            body := '{}'::jsonb,
            timeout_milliseconds := 10000
        ) INTO v_result_id;
        
        RETURN QUERY SELECT '3. HTTP Request'::text, 'SENT'::text, format('Request ID: %s', v_result_id)::text;
    EXCEPTION WHEN OTHERS THEN
        RETURN QUERY SELECT '3. HTTP Request'::text, 'FAILED'::text, SQLERRM::text;
        RETURN;
    END;
END;
$$ LANGUAGE plpgsql;

-- Run the test
SELECT * FROM test_escalation_invoke();

-- =====================================================
-- STEP 4: Check cron job status
-- =====================================================

-- List all cron jobs
SELECT 
    jobid,
    jobname,
    schedule,
    active,
    CASE WHEN jobname LIKE '%escalation%' OR jobname LIKE '%notification%' THEN '⚡ Edge Function' ELSE 'Other' END as type
FROM cron.job;

-- =====================================================
-- STEP 5: Check pg_net request history
-- =====================================================

-- See recent HTTP requests
SELECT 
    id,
    status_code,
    content::text as response_preview,
    created_at
FROM net._http_response 
ORDER BY created_at DESC 
LIMIT 10;

-- =====================================================
-- STEP 6: Check cron job logs
-- =====================================================

SELECT 
    job_name,
    status,
    details,
    created_at
FROM cron_job_logs
ORDER BY created_at DESC
LIMIT 10;

-- =====================================================
-- FIX: Set configuration properly
-- =====================================================

-- Uncomment and run these with YOUR actual values:
--
-- ALTER DATABASE postgres SET "app.settings.supabase_url" = 'https://your-project.supabase.co';
-- ALTER DATABASE postgres SET "app.settings.service_role_key" = 'eyJhbGciOiJIUzI1NiIs...your-key-here';
--
-- -- Verify they were set
-- SELECT 
--     current_setting('app.settings.supabase_url', true) as url,
--     current_setting('app.settings.service_role_key', true) is not null as has_key;

-- =====================================================
-- ALTERNATIVE: Test without config (hardcoded for testing)
-- =====================================================

-- If you want to test immediately without setting database config,
-- replace the invoke function with this hardcoded version:
/*
CREATE OR REPLACE FUNCTION invoke_escalation_monitor()
RETURNS text AS $$
DECLARE
    v_result_id bigint;
    v_url text := 'https://your-project.supabase.co';  -- REPLACE THIS
    v_key text := 'your-service-role-key';              -- REPLACE THIS
BEGIN
    SELECT net.http_post(
        url := v_url || '/functions/v1/escalation-monitor',
        headers := jsonb_build_object(
            'Authorization', 'Bearer ' || v_key,
            'Content-Type', 'application/json'
        ),
        body := '{}'::jsonb,
        timeout_milliseconds := 25000
    ) INTO v_result_id;
    
    RETURN format('Invoked (request_id: %s)', v_result_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Test it
SELECT invoke_escalation_monitor();
*/
