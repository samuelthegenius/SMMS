-- Migration: Add Multi-Channel Notification System
-- Created: 2025-04-25
-- Purpose: Support push notifications, SMS, and in-app alerts beyond email

-- 1. Push Notification Subscriptions Table
CREATE TABLE IF NOT EXISTS push_subscriptions (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    subscription_json jsonb NOT NULL, -- Web Push subscription object
    device_info text, -- Browser/device identifier
    is_active boolean DEFAULT true,
    created_at timestamptz DEFAULT now(),
    last_used_at timestamptz,
    CONSTRAINT unique_user_device UNIQUE (user_id, device_info)
);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user ON push_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_active ON push_subscriptions(is_active) WHERE is_active = true;

-- 2. SMS/Phone Contact Table (for critical alerts)
CREATE TABLE IF NOT EXISTS user_contacts (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    contact_type text NOT NULL CHECK (contact_type IN ('sms', 'whatsapp', 'phone')),
    contact_value text NOT NULL, -- phone number
    is_verified boolean DEFAULT false,
    is_primary boolean DEFAULT false,
    verification_code text,
    verification_sent_at timestamptz,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_contacts_user ON user_contacts(user_id);
CREATE INDEX IF NOT EXISTS idx_user_contacts_primary ON user_contacts(user_id, is_primary) WHERE is_primary = true;

-- 3. Notification Log Table (tracks all notification attempts across channels)
CREATE TABLE IF NOT EXISTS notification_logs (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    ticket_id uuid REFERENCES tickets(id) ON DELETE SET NULL,
    user_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
    notification_type text NOT NULL CHECK (notification_type IN ('escalation', 'assignment', 'status_change', 'reminder')),
    channel text NOT NULL CHECK (channel IN ('in_app', 'email', 'push', 'sms')),
    message text NOT NULL,
    status text NOT NULL CHECK (status IN ('pending', 'sent', 'delivered', 'failed', 'read')),
    error_message text,
    metadata jsonb DEFAULT '{}', -- Additional data like push subscription ID, email message ID
    sent_at timestamptz,
    created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notification_logs_ticket ON notification_logs(ticket_id);
CREATE INDEX IF NOT EXISTS idx_notification_logs_user ON notification_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_notification_logs_status ON notification_logs(status);
CREATE INDEX IF NOT EXISTS idx_notification_logs_created ON notification_logs(created_at DESC);

-- 4. User Notification Preferences
CREATE TABLE IF NOT EXISTS notification_preferences (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    -- Escalation alerts
    escalate_email boolean DEFAULT true,
    escalate_push boolean DEFAULT true,
    escalate_sms boolean DEFAULT false, -- SMS only for critical
    -- Assignment alerts
    assign_email boolean DEFAULT true,
    assign_push boolean DEFAULT true,
    assign_sms boolean DEFAULT false,
    -- Status updates
    status_email boolean DEFAULT false,
    status_push boolean DEFAULT true,
    status_sms boolean DEFAULT false,
    -- Quiet hours (optional)
    quiet_hours_start time,
    quiet_hours_end time,
    timezone text DEFAULT 'Africa/Lagos',
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    CONSTRAINT unique_user_prefs UNIQUE (user_id)
);

-- 5. Function to get notification recipients with their preferred channels
DROP FUNCTION IF EXISTS get_notification_recipients(uuid,text);
CREATE OR REPLACE FUNCTION get_notification_recipients(
    p_ticket_id uuid,
    p_notification_type text
)
RETURNS TABLE (
    recipient_id uuid,
    email text,
    full_name text,
    role text,
    department text,
    channels text[], -- array of preferred channels
    push_subscription jsonb,
    phone_number text
) AS $$
BEGIN
    RETURN QUERY
    WITH ticket_info AS (
        SELECT t.*, 
               tech.email as tech_email, tech.full_name as tech_name,
               creator.email as creator_email, creator.full_name as creator_name,
               creator.id as creator_id, tech.id as tech_id
        FROM tickets t
        LEFT JOIN profiles tech ON tech.id = t.assigned_to
        LEFT JOIN profiles creator ON creator.id = t.created_by
        WHERE t.id = p_ticket_id
    ),
    escalation_recipients AS (
        -- Get admins and department heads for escalations
        SELECT 
            p.id,
            p.email,
            p.full_name,
            p.role,
            p.department
        FROM profiles p
        WHERE p.role = 'admin'
           OR (p.department = 'Student Affairs' AND p.role = 'staff')
           OR (p.department = (SELECT ti.department FROM ticket_info ti) 
               AND p.role IN ('staff', 'src', 'porter'))
    )
    SELECT 
        er.id as recipient_id,
        er.email,
        er.full_name,
        er.role,
        er.department,
        CASE 
            WHEN p_notification_type = 'escalation' THEN
                ARRAY[
                    CASE WHEN COALESCE(np.escalate_email, true) THEN 'email' END,
                    CASE WHEN COALESCE(np.escalate_push, true) THEN 'push' END,
                    CASE WHEN COALESCE(np.escalate_sms, false) THEN 'sms' END
                ]
            WHEN p_notification_type = 'assignment' THEN
                ARRAY[
                    CASE WHEN COALESCE(np.assign_email, true) THEN 'email' END,
                    CASE WHEN COALESCE(np.assign_push, true) THEN 'push' END,
                    CASE WHEN COALESCE(np.assign_sms, false) THEN 'sms' END
                ]
            ELSE
                ARRAY['email', 'push']
        END as channels,
        (SELECT ps.subscription_json FROM push_subscriptions ps
         WHERE ps.user_id = er.id AND ps.is_active = true 
         ORDER BY ps.last_used_at DESC NULLS LAST LIMIT 1) as push_subscription,
        (SELECT uc.contact_value FROM user_contacts uc
         WHERE uc.user_id = er.id AND uc.contact_type = 'sms' AND uc.is_verified = true AND uc.is_primary = true
         LIMIT 1) as phone_number
    FROM escalation_recipients er
    LEFT JOIN notification_preferences np ON np.user_id = er.id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. Enhanced escalation function that logs to notification_logs
DROP FUNCTION IF EXISTS escalate_stale_ticket_multi_channel(uuid,text);
CREATE OR REPLACE FUNCTION escalate_stale_ticket_multi_channel(
    p_ticket_id uuid,
    p_message text DEFAULT NULL
)
RETURNS TABLE (
    success boolean,
    notifications_created integer,
    channels_used text[]
) AS $$
DECLARE
    v_ticket_record record;
    v_default_message text;
    v_channels_used text[] := ARRAY[]::text[];
    v_count integer := 0;
    v_recipient record;
BEGIN
    -- Get ticket details
    SELECT t.*, tech.email as tech_email, tech.full_name as tech_name,
           creator.email as creator_email, creator.full_name as creator_name,
           creator.id as creator_id
    INTO v_ticket_record
    FROM tickets t
    LEFT JOIN profiles tech ON tech.id = t.assigned_to
    LEFT JOIN profiles creator ON creator.id = t.created_by
    WHERE t.id = p_ticket_id;
    
    IF v_ticket_record IS NULL THEN
        RETURN QUERY SELECT false, 0, v_channels_used;
        RETURN;
    END IF;
    
    -- Update escalation tracking
    UPDATE tickets 
    SET escalation_count = COALESCE(escalation_count, 0) + 1,
        last_escalation_at = NOW()
    WHERE id = p_ticket_id;
    
    -- Create default message
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
    
    -- Get all recipients with their preferred channels
    FOR v_recipient IN 
        SELECT * FROM get_notification_recipients(p_ticket_id, 'escalation')
    LOOP
        -- Create in-app notification (always)
        INSERT INTO notifications (user_id, ticket_id, message)
        VALUES (
            v_recipient.recipient_id,
            p_ticket_id,
            CASE 
                WHEN v_recipient.role = 'admin' THEN 'ADMIN ' || v_default_message
                WHEN v_recipient.department = 'Student Affairs' THEN 'DEPT ' || v_default_message
                WHEN v_recipient.role = 'src' THEN 'DEPT ' || v_default_message
                ELSE v_default_message
            END
        );
        
        v_count := v_count + 1;
        
        -- Log notification attempt
        INSERT INTO notification_logs (
            ticket_id, user_id, notification_type, channel, message, status
        ) VALUES (
            p_ticket_id, v_recipient.recipient_id, 'escalation', 'in_app', v_default_message, 'sent'
        );
        
        -- Track channels for summary
        IF NOT ('in_app' = ANY(v_channels_used)) THEN
            v_channels_used := array_append(v_channels_used, 'in_app');
        END IF;
        
        -- Log pending notifications for other channels
        -- Email (will be processed by edge function)
        IF 'email' = ANY(v_recipient.channels) THEN
            INSERT INTO notification_logs (
                ticket_id, user_id, notification_type, channel, message, status
            ) VALUES (
                p_ticket_id, v_recipient.recipient_id, 'escalation', 'email', v_default_message, 'pending'
            );
            IF NOT ('email' = ANY(v_channels_used)) THEN
                v_channels_used := array_append(v_channels_used, 'email');
            END IF;
        END IF;
        
        -- Push notification
        IF 'push' = ANY(v_recipient.channels) AND v_recipient.push_subscription IS NOT NULL THEN
            INSERT INTO notification_logs (
                ticket_id, user_id, notification_type, channel, message, status, metadata
            ) VALUES (
                p_ticket_id, v_recipient.recipient_id, 'escalation', 'push', v_default_message, 'pending',
                jsonb_build_object('subscription', v_recipient.push_subscription)
            );
            IF NOT ('push' = ANY(v_channels_used)) THEN
                v_channels_used := array_append(v_channels_used, 'push');
            END IF;
        END IF;
        
        -- SMS (only for critical - escalation count >= 3 or high priority with > 4 hours)
        IF 'sms' = ANY(v_recipient.channels) 
           AND v_recipient.phone_number IS NOT NULL
           AND (COALESCE(v_ticket_record.escalation_count, 0) >= 3 
                OR (v_ticket_record.priority = 'High' 
                    AND EXTRACT(EPOCH FROM (NOW() - v_ticket_record.verified_at))/3600 > 4)) THEN
            INSERT INTO notification_logs (
                ticket_id, user_id, notification_type, channel, message, status, metadata
            ) VALUES (
                p_ticket_id, v_recipient.recipient_id, 'escalation', 'sms', v_default_message, 'pending',
                jsonb_build_object('phone', v_recipient.phone_number)
            );
            IF NOT ('sms' = ANY(v_channels_used)) THEN
                v_channels_used := array_append(v_channels_used, 'sms');
            END IF;
        END IF;
    END LOOP;
    
    -- Also notify the creator
    INSERT INTO notifications (user_id, ticket_id, message)
    VALUES (
        v_ticket_record.created_by,
        p_ticket_id,
        'Your ticket is taking longer than expected. Management has been notified.'
    );
    
    RETURN QUERY SELECT true, v_count, v_channels_used;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7. Function to process pending notifications (called by edge function)
CREATE OR REPLACE FUNCTION get_pending_notifications(
    p_channel text,
    p_limit integer DEFAULT 50
)
RETURNS TABLE (
    log_id uuid,
    ticket_id uuid,
    user_id uuid,
    user_email text,
    message text,
    metadata jsonb,
    created_at timestamptz
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        nl.id as log_id,
        nl.ticket_id,
        nl.user_id,
        p.email as user_email,
        nl.message,
        nl.metadata,
        nl.created_at
    FROM notification_logs nl
    JOIN profiles p ON p.id = nl.user_id
    WHERE nl.channel = p_channel
      AND nl.status = 'pending'
    ORDER BY nl.created_at ASC
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 8. Function to update notification status
CREATE OR REPLACE FUNCTION update_notification_status(
    p_log_id uuid,
    p_status text,
    p_error_message text DEFAULT NULL
)
RETURNS void AS $$
BEGIN
    UPDATE notification_logs 
    SET status = p_status,
        error_message = p_error_message,
        sent_at = CASE WHEN p_status IN ('sent', 'delivered') THEN NOW() ELSE sent_at END
    WHERE id = p_log_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 9. RLS Policies for new tables
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;

-- Users can only manage their own push subscriptions
DROP POLICY IF EXISTS "Users manage own push subscriptions" ON push_subscriptions;
CREATE POLICY "Users manage own push subscriptions"
    ON push_subscriptions FOR ALL
    TO authenticated
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

-- Users can only manage their own contacts
DROP POLICY IF EXISTS "Users manage own contacts" ON user_contacts;
CREATE POLICY "Users manage own contacts"
    ON user_contacts FOR ALL
    TO authenticated
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

-- Users can only view their own notification logs
DROP POLICY IF EXISTS "Users view own notification logs" ON notification_logs;
CREATE POLICY "Users view own notification logs"
    ON notification_logs FOR SELECT
    TO authenticated
    USING (user_id = auth.uid());

-- System can insert notification logs
DROP POLICY IF EXISTS "System can create notification logs" ON notification_logs;
CREATE POLICY "System can create notification logs"
    ON notification_logs FOR INSERT
    TO authenticated
    WITH CHECK (true);

-- Service role bypass for edge functions
DROP POLICY IF EXISTS "Service role bypass notification logs" ON notification_logs;
CREATE POLICY "Service role bypass notification logs"
    ON notification_logs FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- Users can only manage their own preferences
DROP POLICY IF EXISTS "Users manage own notification preferences" ON notification_preferences;
CREATE POLICY "Users manage own notification preferences"
    ON notification_preferences FOR ALL
    TO authenticated
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

-- 10. Create default notification preferences for existing users
INSERT INTO notification_preferences (user_id)
SELECT id FROM profiles
ON CONFLICT (user_id) DO NOTHING;

-- 10. Add channel 'local' to notification_logs channel enum
-- (Adding via check constraint modification)
ALTER TABLE notification_logs 
DROP CONSTRAINT IF EXISTS notification_logs_channel_check;

ALTER TABLE notification_logs 
ADD CONSTRAINT notification_logs_channel_check 
CHECK (channel IN ('in_app', 'email', 'push', 'sms', 'local'));

-- 11. Function to get pending escalations for local notification polling
CREATE OR REPLACE FUNCTION get_pending_escalations_for_user(
    p_user_id uuid
)
RETURNS TABLE (
    id uuid,
    ticket_id uuid,
    ticket_title text,
    message text,
    priority text,
    hours_pending numeric,
    escalation_count integer,
    created_at timestamptz
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        nl.id,
        nl.ticket_id,
        t.title as ticket_title,
        nl.message,
        t.priority,
        ROUND(EXTRACT(EPOCH FROM (NOW() - t.verified_at))/3600, 1) as hours_pending,
        COALESCE(t.escalation_count, 0) as escalation_count,
        nl.created_at
    FROM notification_logs nl
    JOIN tickets t ON t.id = nl.ticket_id
    WHERE nl.user_id = p_user_id
      AND nl.channel = 'local'
      AND nl.status = 'pending'
      AND nl.notification_type = 'escalation'
    ORDER BY 
        CASE t.priority WHEN 'High' THEN 1 WHEN 'Medium' THEN 2 ELSE 3 END,
        t.verified_at ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 12. Function to acknowledge local notification
CREATE OR REPLACE FUNCTION acknowledge_escalation_notification(
    p_escalation_id uuid,
    p_channel text DEFAULT 'local'
)
RETURNS void AS $$
BEGIN
    UPDATE notification_logs 
    SET status = 'delivered',
        sent_at = NOW(),
        metadata = jsonb_build_object(
            'acknowledged_at', NOW(),
            'channel', p_channel
        )
    WHERE id = p_escalation_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 13. Update escalate_stale_ticket_multi_channel to include 'local' channel
DROP FUNCTION IF EXISTS escalate_stale_ticket_multi_channel(uuid,text);
CREATE OR REPLACE FUNCTION escalate_stale_ticket_multi_channel(
    p_ticket_id uuid,
    p_message text DEFAULT NULL
)
RETURNS TABLE (
    success boolean,
    notifications_created integer,
    channels_used text[]
) AS $$
DECLARE
    v_ticket_record record;
    v_default_message text;
    v_channels_used text[] := ARRAY[]::text[];
    v_count integer := 0;
    v_recipient record;
BEGIN
    -- Get ticket details
    SELECT t.*, tech.email as tech_email, tech.full_name as tech_name,
           creator.email as creator_email, creator.full_name as creator_name,
           creator.id as creator_id
    INTO v_ticket_record
    FROM tickets t
    LEFT JOIN profiles tech ON tech.id = t.assigned_to
    LEFT JOIN profiles creator ON creator.id = t.created_by
    WHERE t.id = p_ticket_id;
    
    IF v_ticket_record IS NULL THEN
        RETURN QUERY SELECT false, 0, v_channels_used;
        RETURN;
    END IF;
    
    -- Update escalation tracking
    UPDATE tickets 
    SET escalation_count = COALESCE(escalation_count, 0) + 1,
        last_escalation_at = NOW()
    WHERE id = p_ticket_id;
    
    -- Calculate hours pending and determine urgency styling
    DECLARE
        v_hours_pending numeric := ROUND(EXTRACT(EPOCH FROM (NOW() - v_ticket_record.verified_at))/3600, 1);
        v_urgency_level text;
        v_urgency_color text;
        v_urgency_icon text;
        v_priority_color text;
        v_priority_badge text;
    BEGIN
        -- Determine urgency level based on hours and escalation count
        IF v_hours_pending >= 8 OR COALESCE(v_ticket_record.escalation_count, 0) >= 6 THEN
            v_urgency_level := 'CRITICAL';
            v_urgency_color := '#DC2626';
            v_urgency_icon := '🚨';
        ELSIF v_hours_pending >= 4 OR COALESCE(v_ticket_record.escalation_count, 0) >= 3 THEN
            v_urgency_level := 'URGENT';
            v_urgency_color := '#EA580C';
            v_urgency_icon := '⚠️';
        ELSIF COALESCE(v_ticket_record.escalation_count, 0) >= 1 THEN
            v_urgency_level := 'FOLLOW-UP';
            v_urgency_color := '#D97706';
            v_urgency_icon := '⏰';
        ELSE
            v_urgency_level := 'INITIAL';
            v_urgency_color := '#059669';
            v_urgency_icon := '📋';
        END IF;
        
        -- Determine priority styling
        CASE v_ticket_record.priority
            WHEN 'High' THEN 
                v_priority_color := '#DC2626';
                v_priority_badge := 'HIGH';
            WHEN 'Medium' THEN 
                v_priority_color := '#D97706';
                v_priority_badge := 'MEDIUM';
            ELSE 
                v_priority_color := '#059669';
                v_priority_badge := 'NORMAL';
        END CASE;
        
        -- Create formatted message for SMS and simple channels
        v_default_message := format('%s %s ESCALATION #%s: "%s" at %s • %.1f hours pending • %s priority',
            v_urgency_icon,
            v_urgency_level,
            COALESCE(v_ticket_record.escalation_count, 0),
            v_ticket_record.title,
            COALESCE(v_ticket_record.specific_location, 'Unknown Location'),
            v_hours_pending,
            v_priority_badge
        );
    END;
    
    -- Get all recipients with their preferred channels
    FOR v_recipient IN 
        SELECT * FROM get_notification_recipients(p_ticket_id, 'escalation')
    LOOP
        -- Create in-app notification (always) - with role prefix for clarity
        INSERT INTO notifications (user_id, ticket_id, message)
        VALUES (
            v_recipient.recipient_id,
            p_ticket_id,
            CASE 
                WHEN v_recipient.role = 'admin' THEN '[ADMIN ALERT] ' || v_default_message
                WHEN v_recipient.department = 'Student Affairs' THEN '[DEPT HEAD] ' || v_default_message
                WHEN v_recipient.role = 'src' THEN '[DEPT SRC] ' || v_default_message
                ELSE v_default_message
            END
        );
        
        v_count := v_count + 1;
        
        -- Log notification as 'local' for PWA background sync polling
        INSERT INTO notification_logs (
            ticket_id, user_id, notification_type, channel, message, status
        ) VALUES (
            p_ticket_id, v_recipient.recipient_id, 'escalation', 'local', v_default_message, 'pending'
        );
        
        IF NOT ('local' = ANY(v_channels_used)) THEN
            v_channels_used := array_append(v_channels_used, 'local');
        END IF;
        
        -- Log email (will be processed by edge function if configured)
        -- Admins always get emails regardless of preferences
        IF 'email' = ANY(v_recipient.channels) OR v_recipient.role = 'admin' THEN
            INSERT INTO notification_logs (
                ticket_id, user_id, notification_type, channel, message, status
            ) VALUES (
                p_ticket_id, v_recipient.recipient_id, 'escalation', 'email', v_default_message, 'pending'
            );
            IF NOT ('email' = ANY(v_channels_used)) THEN
                v_channels_used := array_append(v_channels_used, 'email');
            END IF;
        END IF;
        
        -- Push notification (if configured with VAPID)
        IF 'push' = ANY(v_recipient.channels) AND v_recipient.push_subscription IS NOT NULL THEN
            INSERT INTO notification_logs (
                ticket_id, user_id, notification_type, channel, message, status, metadata
            ) VALUES (
                p_ticket_id, v_recipient.recipient_id, 'escalation', 'push', v_default_message, 'pending',
                jsonb_build_object('subscription', v_recipient.push_subscription)
            );
            IF NOT ('push' = ANY(v_channels_used)) THEN
                v_channels_used := array_append(v_channels_used, 'push');
            END IF;
        END IF;
        
        -- SMS (only for critical)
        IF 'sms' = ANY(v_recipient.channels) 
           AND v_recipient.phone_number IS NOT NULL
           AND (COALESCE(v_ticket_record.escalation_count, 0) >= 3 
                OR (v_ticket_record.priority = 'High' 
                    AND EXTRACT(EPOCH FROM (NOW() - v_ticket_record.verified_at))/3600 > 4)) THEN
            INSERT INTO notification_logs (
                ticket_id, user_id, notification_type, channel, message, status, metadata
            ) VALUES (
                p_ticket_id, v_recipient.recipient_id, 'escalation', 'sms', v_default_message, 'pending',
                jsonb_build_object('phone', v_recipient.phone_number)
            );
            IF NOT ('sms' = ANY(v_channels_used)) THEN
                v_channels_used := array_append(v_channels_used, 'sms');
            END IF;
        END IF;
    END LOOP;
    
    -- Also notify the creator
    INSERT INTO notifications (user_id, ticket_id, message)
    VALUES (
        v_ticket_record.created_by,
        p_ticket_id,
        'Your ticket is taking longer than expected. Management has been notified.'
    );
    
    RETURN QUERY SELECT true, v_count, v_channels_used;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Migration complete
SELECT 'Migration 20250425_add_multi_channel_notifications completed successfully' as status;
