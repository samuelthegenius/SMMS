/**
 * @file src/pages/AnalyticsPage.jsx
 * @description Dedicated Analytics View for Facility Managers and IT Admin.
 * @author System Administrator
 * 
 * Key Features:
 * - Strategic Insights: focus on high-level data visualization.
 * - Separation of Concerns: keeps operational dashboard focused on ticket management.
 * - Access Control: Restricted to IT Admin, Facility Managers, Maintenance Supervisors, and SRC.
 */
import { useState, useMemo, lazy, Suspense } from 'react';
import useSWR from 'swr';
import { toast } from 'sonner';
import { supabase } from '../lib/supabase';
import Loader from '../components/Loader';
import { Card, CardContent } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Select } from '../components/ui/Select';
import { BarChart3, FileSpreadsheet, FileText, ShieldAlert, AlertTriangle, RefreshCw } from 'lucide-react';
import { useAuth } from '../contexts/useAuth';

// Lazy load AnalyticsSummary to avoid loading heavy recharts library on initial load
const AnalyticsSummary = lazy(() => import('../components/AnalyticsSummary'));
import { generateTicketReport, generateTicketCSV } from '../utils/generateReport';

export default function AnalyticsPage() {
    const { profile, loading: authLoading } = useAuth();
    const [reportTimeframe, setReportTimeframe] = useState('all');

    const hasAdminAccess = profile?.role === 'it_admin' || profile?.department === 'Student Affairs' || profile?.role === 'src' || profile?.role === 'manager' || profile?.role === 'supervisor';

    const swrKey = profile && hasAdminAccess
        ? ['analytics_tickets', profile.role]
        : null;

    const fetchTickets = async () => {
        const isITAdminOnly = profile?.role === 'it_admin';
        const rpcFunction = isITAdminOnly ? 'get_it_admin_tickets' : 'get_supervisor_all_tickets';
        const { data, error } = await supabase.rpc(rpcFunction);
        if (!error) return data || [];

        // Fallback to direct query
        const { data: fallbackData, error: fallbackError } = await supabase
            .from('tickets')
            .select(`
                id, title, category, facility_type, specific_location,
                status, priority, created_at, updated_at, resolved_at,
                profiles!tickets_creator_id_fkey (full_name, role)
            `)
            .order('created_at', { ascending: false });
        if (fallbackError) throw new Error('Failed to load analytics data. Please try again.');
        return fallbackData || [];
    };

    const { data: tickets = [], isLoading, error, mutate } = useSWR(
        swrKey,
        fetchTickets,
        {
            revalidateOnMount: true,
            revalidateOnFocus: false,
            revalidateOnReconnect: true,
            dedupingInterval: 0,
        }
    );

    const memoizedTickets = useMemo(() => tickets, [tickets]);

    const handleDownloadCSV = () => {
        let filteredTickets = tickets;
        if (reportTimeframe !== 'all') {
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - parseInt(reportTimeframe, 10));
            filteredTickets = tickets.filter(t => new Date(t.created_at) >= cutoffDate);
        }
        if (filteredTickets.length === 0) {
            toast.error('No tickets found for the selected timeframe.');
            return;
        }
        generateTicketCSV(filteredTickets, reportTimeframe);
    };

    const handleDownloadReport = () => {
        let filteredTickets = tickets;

        if (reportTimeframe !== 'all') {
            const daysToSubtract = parseInt(reportTimeframe, 10);
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - daysToSubtract);
            
            filteredTickets = tickets.filter(ticket => {
                const ticketDate = new Date(ticket.created_at);
                return ticketDate >= cutoffDate;
            });
        }

        if (filteredTickets.length === 0) {
            toast.error('No tickets found for the selected timeframe.');
            return;
        }

        generateTicketReport(filteredTickets, reportTimeframe);
    };

    if (authLoading || (isLoading && !tickets.length)) return <Loader variant="analytics" />;

    if (error) {
        return (
            <Card className="border-destructive-200 bg-destructive-50/50 max-w-lg mx-auto mt-10">
                <CardContent className="flex flex-col items-center text-center gap-3 py-10">
                    <div className="w-12 h-12 rounded-2xl bg-destructive-100 flex items-center justify-center">
                        <AlertTriangle className="w-6 h-6 text-destructive-600" />
                    </div>
                    <p className="text-lg font-semibold text-surface-900">Error loading analytics</p>
                    <p className="text-sm text-surface-600">{error.message || 'Failed to load analytics data.'}</p>
                    <Button variant="outline" size="sm" onClick={() => mutate()} className="mt-2 gap-2">
                        <RefreshCw className="w-4 h-4" />
                        Retry
                    </Button>
                </CardContent>
            </Card>
        );
    }

    // Handle users without analytics access
    if (profile && !hasAdminAccess) {
        return (
            <Card className="border-surface-200 max-w-lg mx-auto mt-10">
                <CardContent className="flex flex-col items-center text-center gap-3 py-10">
                    <div className="w-12 h-12 rounded-2xl bg-destructive-100 flex items-center justify-center">
                        <ShieldAlert className="w-6 h-6 text-destructive-600" />
                    </div>
                    <p className="text-lg font-semibold text-surface-900">Access Denied</p>
                    <p className="text-sm text-surface-600">You need IT Admin, Facility Manager, Maintenance Supervisor, or SRC privileges to view analytics.</p>
                </CardContent>
            </Card>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-surface-900 flex items-center gap-2">
                        <BarChart3 className="w-7 h-7 text-primary-600" />
                        Analytics Dashboard
                    </h1>
                    <p className="text-surface-500 mt-1">Strategic insights and system performance metrics.</p>
                </div>

                <div className="flex items-center gap-3">
                    <Select
                        value={reportTimeframe}
                        onChange={(e) => setReportTimeframe(e.target.value)}
                        className="h-10 w-auto min-w-[10rem] bg-white"
                    >
                        <option value="all">All Time</option>
                        <option value="7">Last 7 Days</option>
                        <option value="30">Last 30 Days</option>
                        <option value="90">Last 90 Days</option>
                    </Select>
                    <Button
                        variant="secondary"
                        className="gap-2"
                        onClick={handleDownloadCSV}
                        disabled={tickets.length === 0}
                    >
                        <FileSpreadsheet className="w-4 h-4" />
                        Export CSV
                    </Button>
                    <Button
                        className="gap-2"
                        onClick={handleDownloadReport}
                        disabled={tickets.length === 0}
                    >
                        <FileText className="w-4 h-4" />
                        Download Official Report
                    </Button>
                </div>
            </div>

            <Card className="border-surface-200">
                <CardContent className="p-6">
                    <h2 className="text-lg font-semibold text-surface-800 mb-6 border-b border-surface-100 pb-3">
                        System Overview
                    </h2>

                    <Suspense fallback={<div className="h-64 flex items-center justify-center"><Loader variant="analytics" /></div>}>
                        <AnalyticsSummary key="analytics-summary" tickets={memoizedTickets} />
                    </Suspense>
                </CardContent>
            </Card>
        </div>
    );
}
