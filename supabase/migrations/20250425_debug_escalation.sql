-- Debug escalation email issues
-- Run these queries to diagnose why admin emails aren't being sent

-- 1. Check if admin has notification preferences
SELECT 
    p.id, 
    p.email, 
    p.role,
    np.escalate_email,
    np.escalate_push,
    np.escalate_sms
FROM profiles p
LEFT JOIN notification_preferences np ON np.user_id = p.id
WHERE p.role = 'admin';

-- 2. Check if notification_logs has pending email entries
SELECT 
    nl.id,
    nl.ticket_id,
    nl.user_id,
    p.email as user_email,
    nl.channel,
    nl.status,
    nl.message,
    nl.created_at
FROM notification_logs nl
JOIN profiles p ON p.id = nl.user_id
WHERE nl.channel = 'email'
  AND nl.status = 'pending'
ORDER BY nl.created_at DESC
LIMIT 10;

-- 3. Test get_notification_recipients for a specific ticket
-- Replace with an actual ticket ID
-- SELECT * FROM get_notification_recipients('YOUR_TICKET_ID_HERE', 'escalation');

-- 4. Test get_pending_notifications function directly
SELECT * FROM get_pending_notifications('email', 10);

-- 5. Check if escalate_stale_ticket_multi_channel creates email logs
-- Look at the most recent escalations and their channels
SELECT 
    nl.ticket_id,
    nl.user_id,
    nl.channel,
    nl.status,
    nl.created_at
FROM notification_logs nl
WHERE nl.created_at > NOW() - INTERVAL '1 hour'
ORDER BY nl.created_at DESC
LIMIT 20;

-- 6. Check if admins exist and have valid emails
SELECT id, email, full_name, role, department 
FROM profiles 
WHERE role = 'admin';

-- 7. Fix missing notification preferences for admins (if needed)
-- This will create default preferences for any admin that doesn't have them
INSERT INTO notification_preferences (user_id, escalate_email, escalate_push, escalate_sms)
SELECT id, true, true, false
FROM profiles
WHERE role = 'admin'
  AND id NOT IN (SELECT user_id FROM notification_preferences)
ON CONFLICT (user_id) DO NOTHING;
