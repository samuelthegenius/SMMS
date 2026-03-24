-- Security Monitoring Database Functions - Part 2
-- Additional security monitoring features

-- Function to get recent security events for dashboard
CREATE OR REPLACE FUNCTION get_security_events_dashboard(limit_count integer DEFAULT 50)
RETURNS TABLE (
    id uuid,
    type text,
    severity text,
    timestamp timestamptz,
    ip text,
    details jsonb
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        id, type, severity, timestamp, ip, details
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

-- Function to automatically resolve old alerts
CREATE OR REPLACE FUNCTION auto_resolve_alerts(days_old integer DEFAULT 7)
RETURNS integer AS $$
DECLARE
    resolved_count integer;
BEGIN
    UPDATE security_alerts 
    SET resolved = true, resolved_at = now()
    WHERE resolved = false 
      AND created_at < now() - (days_old || ' days')::interval;
    
    GET DIAGNOSTICS resolved_count = ROW_COUNT;
    RETURN resolved_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_security_logs_timestamp_type ON security_logs(timestamp DESC, type);
CREATE INDEX IF NOT EXISTS idx_security_logs_severity_timestamp ON security_logs(severity, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_security_alerts_created_resolved ON security_alerts(created_at DESC, resolved);

-- Add RLS policies for new functions
CREATE POLICY "Security dashboard viewable by admins" ON security_logs
    FOR SELECT TO authenticated
    USING (EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid() AND role = 'admin'
    ));

-- Grant necessary permissions
GRANT EXECUTE ON FUNCTION get_security_events_dashboard TO authenticated;
GRANT EXECUTE ON FUNCTION get_security_metrics TO authenticated;
GRANT EXECUTE ON FUNCTION auto_resolve_alerts TO authenticated;
