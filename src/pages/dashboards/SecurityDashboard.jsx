import { useEffect, useState, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { Shield, AlertTriangle, Activity, Users, Clock, Eye, TrendingUp, Lock, Database } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import Loader from '../../components/Loader';

export default function SecurityDashboard() {
    const [metrics, setMetrics] = useState(null);
    const [recentEvents, setRecentEvents] = useState([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState(null);
    const initialLoadDone = useRef(false);

    // Fetch security metrics
    useEffect(() => {
        const fetchSecurityData = async () => {
            // Only show the full-page spinner on the very first load.
            // Background interval refreshes update data silently.
            const isInitial = !initialLoadDone.current;
            if (isInitial) setLoading(true);

            try {
                // Get security metrics
                const { data: metricsData, error: metricsError } = await supabase
                    .rpc('get_security_metrics');
                
                if (metricsError) throw metricsError;
                
                // Get recent security events
                const { data: eventsData, error: eventsError } = await supabase
                    .rpc('get_security_events_dashboard', { limit_count: 20 });
                
                if (eventsError) throw eventsError;
                
                setMetrics(metricsData);
                setRecentEvents(eventsData || []);
                                setLoadError(null);
            } catch (error) {
                                setLoadError('Could not refresh security data. Showing last known values.');
              if (import.meta.env.DEV) {
                console.error('Error fetching security data:', error);
              }
            } finally {
                if (isInitial) {
                    initialLoadDone.current = true;
                    setLoading(false);
                }
            }
        };

        fetchSecurityData();
        
        // Refresh data every 30 seconds (silently — no spinner)
        const interval = setInterval(fetchSecurityData, 30000);
        return () => clearInterval(interval);
    }, []);

    const getSeverityColor = (severity) => {
        switch (severity) {
            case 'critical': return 'text-red-600 bg-red-50';
            case 'high': return 'text-orange-600 bg-orange-50';
            case 'medium': return 'text-yellow-600 bg-yellow-50';
            case 'low': return 'text-green-600 bg-green-50';
            default: return 'text-gray-600 bg-gray-50';
        }
    };

    const getEventIcon = (type) => {
        switch (type) {
            case 'login_failure': return <Lock className="w-4 h-4" />;
            case 'suspicious_input': return <AlertTriangle className="w-4 h-4" />;
            case 'xss_attempt': return <Shield className="w-4 h-4" />;
            case 'unauthorized_access': return <Eye className="w-4 h-4" />;
            case 'brute_force_detected': return <Activity className="w-4 h-4" />;
            default: return <Clock className="w-4 h-4" />;
        }
    };

    if (loading) {
        return <Loader variant="security" />;
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Security Dashboard</h1>
                    <p className="text-gray-600">Real-time security monitoring and threat detection</p>
                </div>
                <div className="flex items-center space-x-2">
                    <Shield className="w-6 h-6 text-indigo-600" />
                    <span className="text-sm font-medium text-gray-600">
                        Protected by SMMS Security
                    </span>
                </div>
            </div>

            {loadError && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                    {loadError}
                </div>
            )}

            {/* Security Metrics */}
            {metrics && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">Total Events</CardTitle>
                            <Activity className="h-4 w-4 text-muted-foreground" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">{metrics.total_events || 0}</div>
                            <p className="text-xs text-muted-foreground">Last 24 hours</p>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">Failed Logins</CardTitle>
                            <Lock className="h-4 w-4 text-red-500" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold text-red-600">{metrics.failed_logins || 0}</div>
                            <p className="text-xs text-muted-foreground">Last 24 hours</p>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">Suspicious Activity</CardTitle>
                            <AlertTriangle className="h-4 w-4 text-orange-500" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold text-orange-600">{metrics.suspicious_activities || 0}</div>
                            <p className="text-xs text-muted-foreground">Last 24 hours</p>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">Unique IPs</CardTitle>
                            <Users className="h-4 w-4 text-blue-500" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold text-blue-600">{metrics.unique_ips || 0}</div>
                            <p className="text-xs text-muted-foreground">Last 24 hours</p>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">Active Alerts</CardTitle>
                            <TrendingUp className="h-4 w-4 text-purple-500" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold text-purple-600">{metrics.active_alerts || 0}</div>
                            <p className="text-xs text-muted-foreground">Need attention</p>
                        </CardContent>
                    </Card>
                </div>
            )}

            {/* Recent Security Events */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center space-x-2">
                        <Clock className="w-5 h-5" />
                        <span>Recent Security Events</span>
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {recentEvents.length === 0 ? (
                        <div className="text-center py-8">
                            <Shield className="mx-auto h-12 w-12 text-gray-400 mb-4" />
                            <h3 className="text-lg font-medium text-gray-900 mb-2">No Security Events</h3>
                            <p className="text-gray-600">Your application is secure. No security events detected in the last 24 hours.</p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {recentEvents.map((event, index) => (
                                <div
                                    key={event.id || index}
                                    className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200"
                                >
                                    <div className="flex items-center space-x-3">
                                        <div className={`p-2 rounded-full ${getSeverityColor(event.severity)}`}>
                                            {getEventIcon(event.type)}
                                        </div>
                                        <div>
                                            <div className="font-medium text-gray-900 capitalize">
                                                {event.type.replace(/_/g, ' ')}
                                            </div>
                                            <div className="text-sm text-gray-600">
                                                {event.ip && `IP: ${event.ip}`}
                                                {event.details?.userAgent && ` • ${event.details.userAgent.split(' ')[0]}`}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <div className={`text-xs font-medium px-2 py-1 rounded-full ${getSeverityColor(event.severity)}`}>
                                            {event.severity?.toUpperCase()}
                                        </div>
                                        <div className="text-xs text-gray-500 mt-1">
                                            {new Date(event.event_timestamp).toLocaleTimeString()}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Security Status Summary */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card className="border-green-200 bg-green-50">
                    <CardContent className="pt-6">
                        <div className="flex items-center space-x-3">
                            <div className="p-2 bg-green-100 rounded-full">
                                <Shield className="h-6 w-6 text-green-600" />
                            </div>
                            <div>
                                <div className="font-medium text-green-900">Firewall Active</div>
                                <div className="text-sm text-green-700">All security measures operational</div>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card className="border-blue-200 bg-blue-50">
                    <CardContent className="pt-6">
                        <div className="flex items-center space-x-3">
                            <div className="p-2 bg-blue-100 rounded-full">
                                <Database className="h-6 w-6 text-blue-600" />
                            </div>
                            <div>
                                <div className="font-medium text-blue-900">Monitoring Enabled</div>
                                <div className="text-sm text-blue-700">Real-time threat detection active</div>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card className="border-purple-200 bg-purple-50">
                    <CardContent className="pt-6">
                        <div className="flex items-center space-x-3">
                            <div className="p-2 bg-purple-100 rounded-full">
                                <Lock className="h-6 w-6 text-purple-600" />
                            </div>
                            <div>
                                <div className="font-medium text-purple-900">CSRF Protection</div>
                                <div className="text-sm text-purple-700">Cross-site request forgery prevention</div>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
