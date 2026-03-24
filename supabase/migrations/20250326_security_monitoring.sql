-- Security Monitoring Database Setup
-- Creates tables and functions for security monitoring

-- Security logs table
CREATE TABLE IF NOT EXISTS security_logs (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    type text NOT NULL,
    severity text NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
    timestamp timestamptz DEFAULT now(),
    user_agent text,
    url text,
    ip text,
    user_id text,
    session_id text,
    details jsonb,
    created_at timestamptz DEFAULT now()
);

-- Security alerts table
CREATE TABLE IF NOT EXISTS security_alerts (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    type text NOT NULL,
    message text NOT NULL,
    severity text NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
    details jsonb,
    resolved boolean DEFAULT false,
    created_at timestamptz DEFAULT now(),
    resolved_at timestamptz,
    resolved_by uuid REFERENCES profiles(id)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_security_logs_timestamp ON security_logs(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_security_logs_type ON security_logs(type);
CREATE INDEX IF NOT EXISTS idx_security_logs_severity ON security_logs(severity);
CREATE INDEX IF NOT EXISTS idx_security_logs_user_id ON security_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_security_logs_ip ON security_logs(ip);

CREATE INDEX IF NOT EXISTS idx_security_alerts_created_at ON security_alerts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_security_alerts_severity ON security_alerts(severity);
CREATE INDEX IF NOT EXISTS idx_security_alerts_resolved ON security_alerts(resolved);

-- Enable RLS
ALTER TABLE security_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE security_alerts ENABLE ROW LEVEL SECURITY;

-- Security logs policies (admin only)
CREATE POLICY "Security logs viewable by admins" ON security_logs
    FOR SELECT TO authenticated
    USING (EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid() AND role = 'admin'
    ));

CREATE POLICY "Security logs manageable by admins" ON security_logs
    FOR ALL TO authenticated
    USING (EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid() AND role = 'admin'
    ));

-- Security alerts policies (admin only)
CREATE POLICY "Security alerts viewable by admins" ON security_alerts
    FOR SELECT TO authenticated
    USING (EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid() AND role = 'admin'
    ));

CREATE POLICY "Security alerts manageable by admins" ON security_alerts
    FOR ALL TO authenticated
    USING (EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid() AND role = 'admin'
    ));

-- Function to log security events
CREATE OR REPLACE FUNCTION log_security_events(events jsonb)
RETURNS void AS $$
BEGIN
    INSERT INTO security_logs (type, severity, timestamp, user_agent, url, ip, user_id, session_id, details)
    SELECT 
        event->>'type',
        event->>'severity',
        event->>'timestamp',
        event->>'userAgent',
        event->>'url',
        event->>'ip',
        event->>'userId',
        event->>'sessionId',
        event->>'details'
    FROM jsonb_array_elements(events) AS event;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get recent security events for dashboard
CREATE OR REPLACE FUNCTION get_security_events_dashboard(limit_count integer DEFAULT 50)
RETURNS TABLE (
    id uuid,
    type text,
    severity text,
    event_timestamp timestamptz,
    ip text,
    details jsonb
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        id, type, severity, timestamp as event_timestamp, ip, details
    FROM security_logs
    ORDER BY timestamp DESC
    LIMIT limit_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get security metrics
CREATE OR REPLACE FUNCTION get_security_metrics()
RETURNS jsonb AS $$
DECLARE
    metrics jsonb;
BEGIN
    SELECT jsonb_build_object(
        'total_events', (SELECT COUNT(*) FROM security_logs WHERE timestamp >= now() - '24 hours'),
        'failed_logins', (SELECT COUNT(*) FROM security_logs WHERE type = 'login_failure' AND timestamp >= now() - '24 hours'),
        'suspicious_activities', (SELECT COUNT(*) FROM security_logs WHERE severity IN ('high', 'critical') AND timestamp >= now() - '24 hours'),
        'unique_ips', (SELECT COUNT(DISTINCT ip) FROM security_logs WHERE timestamp >= now() - '24 hours'),
        'active_alerts', (SELECT COUNT(*) FROM security_alerts WHERE resolved = false)
    ) INTO metrics;
    
    RETURN metrics;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant necessary permissions
GRANT EXECUTE ON FUNCTION log_security_events TO authenticated;
GRANT EXECUTE ON FUNCTION get_security_events_dashboard TO authenticated;
GRANT EXECUTE ON FUNCTION get_security_metrics TO authenticated;
