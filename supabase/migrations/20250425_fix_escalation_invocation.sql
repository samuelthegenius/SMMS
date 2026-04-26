-- Fix escalation function invocation issues
-- This ensures both cron and edge function approaches work

-- =====================================================
-- OPTION 1: Fix the Cron Job (for pg_cron approach)
-- =====================================================

-- Set the required database settings for pg_net HTTP calls
-- Run these with your actual values:
--
-- ALTER DATABASE postgres SET "app.settings.supabase_url" = 'https://your-project.supabase.co';
-- ALTER DATABASE postgres SET "app.settings.service_role_key" = 'your-service-role-key';

-- Verify cron job exists
-- SELECT * FROM cron.job WHERE jobname = 'escalation-monitor';

-- If missing, reschedule it:
-- SELECT cron.unschedule('escalation-monitor');
-- SELECT cron.schedule(
--     'escalation-monitor',
--     '0,30 * * * *',
--     $$SELECT process_escalation_queue()$$
-- );

-- =====================================================
-- OPTION 2: Create HTTP-triggered escalation function
-- =====================================================

-- Update process_escalation_queue to also work as HTTP trigger
CREATE OR REPLACE FUNCTION trigger_escalation_monitor()
RETURNS jsonb AS $$
DECLARE
    v_result text;
    v_http_result jsonb;
BEGIN
    -- Call the existing queue processor
    v_result := process_escalation_queue();
    
    RETURN jsonb_build_object(
        'success', true,
        'result', v_result,
        'timestamp', NOW()
    );
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'success', false,
        'error', SQLERRM,
        'timestamp', NOW()
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant access to the function
GRANT EXECUTE ON FUNCTION trigger_escalation_monitor() TO authenticated;
GRANT EXECUTE ON FUNCTION trigger_escalation_monitor() TO service_role;

-- =====================================================
-- OPTION 3: Direct email escalation for testing
-- =====================================================

-- Function to immediately escalate a specific ticket and send email
CREATE OR REPLACE FUNCTION escalate_and_notify(
    p_ticket_id uuid
)
RETURNS jsonb AS $$
DECLARE
    v_ticket record;
    v_admin_email text;
    v_escalation_result record;
BEGIN
    -- Get admin email
    SELECT email INTO v_admin_email 
    FROM profiles 
    WHERE role = 'admin' 
    LIMIT 1;
    
    -- Get ticket info
    SELECT * INTO v_ticket
    FROM tickets
    WHERE id = p_ticket_id;
    
    IF v_ticket IS NULL THEN
        RETURN jsonb_build_object('error', 'Ticket not found');
    END IF;
    
    -- Call the multi-channel escalation (returns one row)
    SELECT * INTO v_escalation_result
    FROM escalate_stale_ticket_multi_channel(p_ticket_id);
    
    -- Return result
    RETURN jsonb_build_object(
        'ticket_id', p_ticket_id,
        'title', v_ticket.title,
        'admin_email', v_admin_email,
        'success', v_escalation_result.success,
        'notifications_created', v_escalation_result.notifications_created,
        'channels_used', v_escalation_result.channels_used,
        'escalation_time', NOW()
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- VERIFICATION QUERIES
-- =====================================================

-- Check if cron jobs are scheduled (columns vary by pg_cron version)
SELECT * FROM cron.job
WHERE jobname LIKE '%escalation%' OR jobname LIKE '%cleanup%';

-- Check recent cron execution logs
SELECT 
    job_name,
    status,
    details,
    created_at
FROM cron_job_logs
ORDER BY created_at DESC
LIMIT 10;

-- Check for pending notifications
SELECT 
    channel,
    status,
    COUNT(*) as count
FROM notification_logs
WHERE created_at > NOW() - INTERVAL '1 hour'
GROUP BY channel, status;

-- =====================================================
-- MANUAL TEST: Trigger escalation for a stale ticket
-- =====================================================
-- Find a stale ticket first:
-- SELECT ticket_id, title, hours_since_verified 
-- FROM get_stale_tickets(2) 
-- LIMIT 1;

-- Then escalate it:
-- SELECT escalate_and_notify('YOUR_TICKET_ID_HERE');

-- Check notification logs after:
-- SELECT * FROM notification_logs 
-- WHERE created_at > NOW() - INTERVAL '5 minutes' 
-- ORDER BY created_at DESC;
