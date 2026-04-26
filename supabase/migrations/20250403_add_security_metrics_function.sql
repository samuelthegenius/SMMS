-- Create security_events table and related functions for security monitoring

-- Drop existing functions if they exist (to avoid return type conflicts)
DROP FUNCTION IF EXISTS get_security_metrics();
DROP FUNCTION IF EXISTS get_security_events_dashboard(integer);

-- Create security_events table if it doesn't exist
CREATE TABLE IF NOT EXISTS security_events (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    event_type text NOT NULL,
    severity text DEFAULT 'low' CHECK (severity IN ('low', 'medium', 'high', 'critical')),
    ip_address text,
    user_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
    details jsonb DEFAULT '{}',
    event_timestamp timestamptz DEFAULT now(),
    user_agent text,
    resolved_at timestamptz,
    created_at timestamptz DEFAULT now()
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_security_events_timestamp ON security_events(event_timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_security_events_type ON security_events(event_type);
CREATE INDEX IF NOT EXISTS idx_security_events_severity ON security_events(severity);

-- Enable RLS
ALTER TABLE security_events ENABLE ROW LEVEL SECURITY;

-- RLS policy - only admins can view security events
DROP POLICY IF EXISTS "Security events viewable by admins only" ON security_events;
CREATE POLICY "Security events viewable by admins only"
    ON security_events FOR SELECT
    TO authenticated
    USING (EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid() AND role = 'admin'
    ));

-- Create get_security_metrics function for security dashboard
-- This function provides security event statistics for the dashboard

CREATE OR REPLACE FUNCTION get_security_metrics()
RETURNS TABLE (
    total_events bigint,
    failed_logins bigint,
    suspicious_activities bigint,
    unique_ips bigint,
    active_alerts bigint
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        -- Total events in last 24 hours
        (SELECT COUNT(*)::bigint 
         FROM security_events 
         WHERE event_timestamp > NOW() - INTERVAL '24 hours') as total_events,
        
        -- Failed logins in last 24 hours
        (SELECT COUNT(*)::bigint 
         FROM security_events 
         WHERE event_type = 'login_failure' 
           AND event_timestamp > NOW() - INTERVAL '24 hours') as failed_logins,
        
        -- Suspicious activities in last 24 hours
        (SELECT COUNT(*)::bigint 
         FROM security_events 
         WHERE severity IN ('high', 'critical')
           AND event_timestamp > NOW() - INTERVAL '24 hours') as suspicious_activities,
        
        -- Unique IPs in last 24 hours
        (SELECT COUNT(DISTINCT ip_address)::bigint 
         FROM security_events 
         WHERE event_timestamp > NOW() - INTERVAL '24 hours') as unique_ips,
        
        -- Active alerts (high/critical severity not resolved)
        (SELECT COUNT(*)::bigint 
         FROM security_events 
         WHERE severity IN ('high', 'critical')
           AND (resolved_at IS NULL OR resolved_at > NOW() - INTERVAL '24 hours')) as active_alerts;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION get_security_metrics() TO authenticated;
GRANT EXECUTE ON FUNCTION get_security_metrics() TO service_role;

-- Also create get_security_events_dashboard function if it doesn't exist
CREATE OR REPLACE FUNCTION get_security_events_dashboard(limit_count integer DEFAULT 20)
RETURNS TABLE (
    id uuid,
    event_type text,
    severity text,
    ip_address text,
    details jsonb,
    event_timestamp timestamptz,
    user_agent text
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        se.id,
        se.event_type,
        se.severity,
        se.ip_address,
        se.details,
        se.event_timestamp,
        se.user_agent
    FROM security_events se
    WHERE se.event_timestamp > NOW() - INTERVAL '24 hours'
    ORDER BY se.event_timestamp DESC
    LIMIT limit_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION get_security_events_dashboard(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION get_security_events_dashboard(integer) TO service_role;
