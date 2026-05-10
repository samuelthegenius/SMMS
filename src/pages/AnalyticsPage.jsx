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
import { useEffect, useState, useCallback, useRef, useMemo, lazy, Suspense } from 'react';
import { supabase } from '../lib/supabase';
import Loader from '../components/Loader';
import { BarChart, PieChart } from 'lucide-react';
import { useAuth } from '../contexts/useAuth';

// Lazy load AnalyticsSummary to avoid loading heavy recharts library on initial load
const AnalyticsSummary = lazy(() => import('../components/AnalyticsSummary')); 
import { generateTicketReport } from '../utils/generateReport';

export default function AnalyticsPage() {
    const { profile, loading: authLoading } = useAuth();
    // State Management:
    // 'tickets': Holds the raw data for visualization.
    const [tickets, setTickets] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const hasFetched = useRef(false);
    const ticketsRef = useRef([]);
    const fetchedProfileId = useRef(null);

    // Memoize tickets to prevent unnecessary re-renders
    const memoizedTickets = useMemo(() => tickets, [tickets]);

    // Data Fetching:
    // Pulls all tickets to generate comprehensive statistics.
    // Uses role-appropriate RPC: admin (IT) gets IT tickets, supervisors get all tickets
    const fetchTickets = useCallback(async () => {
        try {
            // Choose appropriate RPC based on role
            // IT Admin only sees IT & Networking tickets
            // Facility managers and supervisors see all tickets for oversight
            const isITAdmin = profile?.role === 'it_admin';
            const rpcFunction = isITAdmin ? 'get_it_admin_tickets' : 'get_supervisor_all_tickets';
            const { data, error } = await supabase.rpc(rpcFunction);
            
            if (error) {
                // Fallback to direct query with proper joins
                const { data: fallbackData, error: fallbackError } = await supabase
                    .from('tickets')
                    .select(`
                        id,
                        title,
                        category,
                        facility_type,
                        specific_location,
                        status,
                        priority,
                        created_at,
                        updated_at,
                        resolved_at,
                        profiles!tickets_creator_id_fkey (
                            full_name,
                            role
                        )
                    `)
                    .order('created_at', { ascending: false });
                
                if (fallbackError) {
                    setError('Failed to load analytics data. Please try again.');
                } else {
                    const newTickets = fallbackData || [];
                    if (JSON.stringify(newTickets) !== JSON.stringify(ticketsRef.current)) {
                        ticketsRef.current = newTickets;
                        setTickets(newTickets);
                    }
                }
            } else {
                // RPC data already has the correct structure, no transformation needed
                const newTickets = data || [];
                if (JSON.stringify(newTickets) !== JSON.stringify(ticketsRef.current)) {
                    ticketsRef.current = newTickets;
                    setTickets(newTickets);
                }
            }
        } catch {
            setError('Failed to load analytics data. Please try again.');
        } finally {
            setLoading(false);
        }
    }, []);

    const hasAdminAccess = profile?.role === 'it_admin' || profile?.department === 'Student Affairs' || profile?.role === 'src';

    useEffect(() => {
        // Only fetch data if user has admin access and we haven't fetched for this profile yet
        if (hasAdminAccess && profile.id !== fetchedProfileId.current) {
            fetchedProfileId.current = profile.id;
            hasFetched.current = true;
            fetchTickets();
        } else if (profile && !hasAdminAccess && !loading) {
            setError('Access denied: Admin role required');
            setLoading(false);
        } else if (!authLoading && !profile && !loading) {
            setError('Please log in to access analytics');
            setLoading(false);
        }
    }, [profile, authLoading, fetchTickets, loading, hasAdminAccess]);

    // Show loader during authentication or data loading
    if (authLoading || loading) return <Loader variant="analytics" />;

    // Handle access denied
    if (error) {
        return (
            <div className="text-red-500 text-center mt-10">
                <p className="text-lg font-medium">Error loading analytics</p>
                <p className="text-sm mt-2">{error}</p>
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

                <button
                    onClick={() => generateTicketReport(tickets)}
                    disabled={tickets.length === 0}
                    className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    <span>📄</span>
                    Download Official Report
                </button>
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
