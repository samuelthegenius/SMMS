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
import { supabase } from '../lib/supabase';
import Loader from '../components/Loader';
import { BarChart, PieChart } from 'lucide-react';
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
            alert('No tickets found for the selected timeframe.');
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
            alert('No tickets found for the selected timeframe.');
            return;
        }

        generateTicketReport(filteredTickets, reportTimeframe);
    };

    if (authLoading || (isLoading && !tickets.length)) return <Loader variant="analytics" />;

    if (error) {
        return (
            <div className="text-red-500 text-center mt-10">
                <p className="text-lg font-medium">Error loading analytics</p>
                <p className="text-sm mt-2">{error.message || 'Failed to load analytics data.'}</p>
                <button onClick={() => mutate()} className="mt-3 text-sm underline text-red-600">Retry</button>
            </div>
        );
    }

    // Handle users without analytics access
    if (profile && !hasAdminAccess) {
        return (
            <div className="text-red-500 text-center mt-10">
                <p className="text-lg font-medium">Access Denied</p>
                <p className="text-sm mt-2">You need IT Admin, Facility Manager, Maintenance Supervisor, or SRC privileges to view analytics.</p>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
                        <BarChart className="w-8 h-8 text-blue-600" />
                        Analytics Dashboard
                    </h1>
                    <p className="text-slate-500 mt-1">Strategic insights and system performance metrics.</p>
                </div>

                <div className="flex items-center gap-3">
                    <select
                        value={reportTimeframe}
                        onChange={(e) => setReportTimeframe(e.target.value)}
                        className="px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm"
                    >
                        <option value="all">All Time</option>
                        <option value="7">Last 7 Days</option>
                        <option value="30">Last 30 Days</option>
                        <option value="90">Last 90 Days</option>
                    </select>
                    <button
                        onClick={handleDownloadCSV}
                        disabled={tickets.length === 0}
                        className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <span>📊</span>
                        Export CSV
                    </button>
                    <button
                        onClick={handleDownloadReport}
                        disabled={tickets.length === 0}
                        className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <span>📄</span>
                        Download Official Report
                    </button>
                </div>
            </div>

            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                <h2 className="text-lg font-semibold text-slate-800 mb-6 border-b border-slate-100 pb-2">
                    System Overview
                </h2>

                <Suspense fallback={<div className="h-64 flex items-center justify-center"><Loader variant="analytics" /></div>}>
                    <AnalyticsSummary key="analytics-summary" tickets={memoizedTickets} />
                </Suspense>
            </div>
        </div>
    );
}
