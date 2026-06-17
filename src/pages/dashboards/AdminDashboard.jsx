import { useEffect, useState, lazy, Suspense } from 'react';
import useSWR from 'swr';
import { supabase } from '../../lib/supabase';
import { Filter, AlertCircle, Clock, Wrench, CheckCircle, Eye, Shield, BarChart3, Users, User, Wrench as WrenchIcon, Search, X } from 'lucide-react';
import clsx from 'clsx';
import Loader from '../../components/Loader';
import TicketDetails from '../../components/TicketDetails';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { DashboardSkeleton, CardSkeleton, StatsCardSkeleton } from '../../components/SkeletonLoader';
import { useAuth } from '../../contexts/useAuth';

// Lazy load security dashboard and user management only when needed
const SecurityDashboard = lazy(() => import('./SecurityDashboard'));
const UserManagement = lazy(() => import('../../components/UserManagement'));

const FACILITY_TYPES = [
    'All', 'Hostel', 'Lecture Hall', 'Laboratory', 'Office',
    'Sports Complex', 'Chapel', 'Other'
];

export default function AdminDashboard() {
    // Note: Do NOT destructure `loading` from useAuth here.
    // AuthContext's `loading` is `loading || isPending` from useTransition.
    // Every startTransition call briefly sets isPending=true, which would make
    // AdminDashboard early-return a <Loader>, unmounting SecurityDashboard.
    // DashboardRouter already ensures we only render when profile is set.
    const { profile } = useAuth();
    const [filter, setFilter] = useState('All');
    const [timeframe, setTimeframe] = useState('Last 30 Days');
    const [search, setSearch] = useState('');
    const [selectedTicket, setSelectedTicket] = useState(null);
    const [activeTab, setActiveTab] = useState('tickets'); // 'tickets', 'security', or 'users'

    // SWR Fetcher - Use role-appropriate RPC function
    // IT Admin gets IT & Networking tickets only
    // SRC, Dean, and Student Affairs get all tickets for oversight
    const isOversightRole = profile?.role === 'src' || profile?.role === 'dean' || profile?.department === 'Student Affairs';
    const fetchTickets = async () => {
        const rpcFunction = isOversightRole ? 'get_supervisor_all_tickets' : 'get_it_admin_tickets';
        const { data, error } = await supabase.rpc(rpcFunction);
        
        if (error) {
            // Fallback to direct query with joins (will be filtered by RLS)
            const { data: fallbackData, error: fallbackError } = await supabase
                .from('tickets')
                .select(`
                    *,
                    reporter:created_by(full_name, email, department),
                    technician:assigned_to(full_name, email, department)
                `)
                .order('created_at', { ascending: false });
            
            if (fallbackError) throw fallbackError;
            return fallbackData || [];
        }
        
        // Transform RPC data to match expected structure
        const mappedData = data.map(ticket => ({
            ...ticket,
            id: ticket.ticket_id, // Map ticket_id back to id
            reporter: ticket.creator_full_name ? {
                full_name: ticket.creator_full_name,
                email: ticket.creator_email,
                department: ticket.creator_department
            } : null,
            technician: ticket.technician_full_name ? {
                full_name: ticket.technician_full_name,
                email: ticket.technician_email,
                department: ticket.technician_department
            } : null
        }));
        
        return mappedData.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    };

    const { data: tickets = [], mutate, isLoading: swrLoading, error } = useSWR(
        isOversightRole ? 'oversight_all_tickets' : 'it_admin_tickets',
        fetchTickets,
        {
            revalidateOnFocus: false,
            revalidateOnReconnect: true,
            dedupingInterval: 30000, // 30 seconds - increased for better performance
            errorRetryCount: 2, // Reduced retry attempts
            errorRetryInterval: 5000, // 5 seconds between retries
            refreshInterval: 0, // Disable auto-refresh for better performance
            suspense: false // Disable suspense to prevent waterfall loading
        }
    );

	const hasAdminAccess = profile?.role === 'it_admin' || profile?.department === 'Student Affairs' || profile?.role === 'src';

	useEffect(() => {
		if (!profile || !hasAdminAccess) return;

		let timeoutId = null;

		const subscription = supabase
			.channel(`admin_tickets_${profile.id}`)
			.on('postgres_changes',
				{
					event: '*',
					schema: 'public',
					table: 'tickets',
				},
				() => {
					if (timeoutId) clearTimeout(timeoutId);
					timeoutId = setTimeout(() => {
						mutate();
					}, 1000);
				}
			)
			.subscribe();

		return () => {
			if (timeoutId) clearTimeout(timeoutId);
			subscription.unsubscribe();
		};
	}, [mutate, profile?.id, profile, hasAdminAccess]);

    const isWithinTimeframe = (dateString, timeframeSelection) => {
        if (timeframeSelection === 'All Time') return true;
        const date = new Date(dateString);
        const now = new Date();
        const diffTime = Math.abs(now - date);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
        
        if (timeframeSelection === 'Today') return diffDays <= 1;
        if (timeframeSelection === 'Last 7 Days') return diffDays <= 7;
        if (timeframeSelection === 'Last 30 Days') return diffDays <= 30;
        return true;
    };

    const searchLower = search.trim().toLowerCase();
    const filteredTickets = tickets.filter(t => {
        const matchesFacility = filter === 'All' || t.facility_type === filter;
        const matchesTime = isWithinTimeframe(t.created_at, timeframe);
        if (!matchesFacility || !matchesTime) return false;
        if (!searchLower) return true;
        return (
            t.title?.toLowerCase().includes(searchLower) ||
            t.description?.toLowerCase().includes(searchLower) ||
            t.specific_location?.toLowerCase().includes(searchLower) ||
            t.reporter?.full_name?.toLowerCase().includes(searchLower) ||
            t.category?.toLowerCase().includes(searchLower)
        );
    });

    const stats = {
        total: filteredTickets.length,
        pending: filteredTickets.filter(t => t.status === 'Open').length,
        resolved: filteredTickets.filter(t => t.status === 'Resolved').length,
        inProgress: filteredTickets.filter(t => t.status === 'In Progress').length,
    };

    // Safety guards — these CAN early-return because AdminDashboard
    // (and SecurityDashboard inside it) shouldn't render in these states.
    // DashboardRouter already ensures profile is set before rendering us,
    // so these are belt-and-suspenders catches only.
    if (profile && !hasAdminAccess) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
                <div className="w-16 h-16 bg-red-100 rounded-2xl flex items-center justify-center mb-4">
                    <Shield className="w-8 h-8 text-red-500" />
                </div>
                <h2 className="text-xl font-bold text-surface-900 mb-2">Access Denied</h2>
                <p className="text-surface-500 max-w-sm">You don't have permission to view this dashboard. Contact your administrator if you believe this is a mistake.</p>
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
                <div className="w-16 h-16 bg-amber-100 rounded-2xl flex items-center justify-center mb-4">
                    <AlertCircle className="w-8 h-8 text-amber-500" />
                </div>
                <h2 className="text-xl font-bold text-surface-900 mb-2">Error loading tickets</h2>
                <p className="text-surface-500 mb-4">Something went wrong. Please try refreshing the page.</p>
                <button onClick={() => mutate()} className="px-4 py-2 bg-primary-500 text-white rounded-xl text-sm font-semibold hover:bg-primary-600 transition-colors">
                    Retry
                </button>
            </div>
        );
    }

    // Do NOT add any loading-based early returns here.
    // The ticket panel already shows inline StatsCardSkeleton / CardSkeleton
    // while swrLoading is true. An early return would unmount SecurityDashboard.

    return (
        <div className="space-y-8">
            {/* Header with Tabs - Bento Style */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-surface-900 tracking-tight">
                        {profile?.role === 'it_admin' ? 'IT Admin Dashboard' : 'Admin Dashboard'}
                    </h1>
                    <p className="text-surface-500 mt-2 text-lg">
                        {profile?.role === 'it_admin'
                            ? 'Manage IT & Networking tickets and system security'
                            : 'System-wide ticket oversight and management'}
                    </p>
                </div>

                {/* Tab Navigation - Modern Pill Style */}
                <div className="flex items-center gap-1 bg-surface-100 p-1.5 rounded-2xl">
                    <button
                        onClick={() => setActiveTab('tickets')}
                        className={`px-5 py-2.5 rounded-xl font-semibold transition-all duration-200 ${
                            activeTab === 'tickets'
                                ? 'bg-primary-500 text-white shadow-lg shadow-primary-500/25'
                                : 'text-surface-600 hover:bg-white hover:shadow-sm'
                        }`}
                    >
                        <div className="flex items-center gap-2">
                            <BarChart3 className="w-4 h-4" />
                            Tickets
                        </div>
                    </button>
                    <button
                        onClick={() => setActiveTab('security')}
                        className={`px-5 py-2.5 rounded-xl font-semibold transition-all duration-200 ${
                            activeTab === 'security'
                                ? 'bg-primary-500 text-white shadow-lg shadow-primary-500/25'
                                : 'text-surface-600 hover:bg-white hover:shadow-sm'
                        }`}
                    >
                        <div className="flex items-center gap-2">
                            <Shield className="w-4 h-4" />
                            Security
                        </div>
                    </button>
                    <button
                        onClick={() => setActiveTab('users')}
                        className={`px-5 py-2.5 rounded-xl font-semibold transition-all duration-200 ${
                            activeTab === 'users'
                                ? 'bg-primary-500 text-white shadow-lg shadow-primary-500/25'
                                : 'text-surface-600 hover:bg-white hover:shadow-sm'
                        }`}
                    >
                        <div className="flex items-center gap-2">
                            <Users className="w-4 h-4" />
                            Users
                        </div>
                    </button>
                </div>
            </div>

            {/* Tab Content — both panels are always mounted; CSS hides the inactive one
                 so SecurityDashboard never unmounts and avoids spurious reloads. */}

            {/* Tickets panel */}
            <div className={activeTab === 'tickets' ? undefined : 'hidden'}>
                {/* Filters for tickets tab - Modern Style */}
                <div className="flex flex-wrap items-center gap-4 bg-white p-3 rounded-2xl border border-surface-200 shadow-sm hover:shadow-md transition-shadow">
                    <div className="flex items-center gap-3 bg-surface-50 p-1.5 rounded-xl border border-surface-100">
                        <div className="bg-white p-1.5 rounded-lg shadow-sm">
                            <Filter className="w-4 h-4 text-surface-500" />
                        </div>
                        <select
                            value={filter}
                            onChange={(e) => setFilter(e.target.value)}
                            className="border-none focus:ring-0 text-sm text-surface-700 bg-transparent font-medium cursor-pointer outline-none min-w-[140px]"
                        >
                            {FACILITY_TYPES.map(type => (
                                <option key={type} value={type}>{type === 'All' ? 'All Facilities' : type}</option>
                            ))}
                        </select>
                    </div>

                    <div className="flex items-center gap-3 bg-surface-50 p-1.5 rounded-xl border border-surface-100">
                        <div className="bg-white p-1.5 rounded-lg shadow-sm">
                            <Clock className="w-4 h-4 text-surface-500" />
                        </div>
                        <select
                            value={timeframe}
                            onChange={(e) => setTimeframe(e.target.value)}
                            className="border-none focus:ring-0 text-sm text-surface-700 bg-transparent font-medium cursor-pointer outline-none min-w-[120px]"
                        >
                            {['Today', 'Last 7 Days', 'Last 30 Days', 'All Time'].map(t => (
                                <option key={t} value={t}>{t}</option>
                            ))}
                        </select>
                    </div>

                    <div className="flex items-center gap-2 bg-surface-50 p-1.5 rounded-xl border border-surface-100 flex-1 min-w-[200px]">
                        <div className="bg-white p-1.5 rounded-lg shadow-sm shrink-0">
                            <Search className="w-4 h-4 text-surface-500" />
                        </div>
                        <input
                            type="text"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Search tickets..."
                            className="border-none focus:ring-0 text-sm text-surface-700 bg-transparent font-medium outline-none flex-1 min-w-0"
                        />
                        {search && (
                            <button onClick={() => setSearch('')} className="shrink-0 text-surface-400 hover:text-surface-600">
                                <X className="w-4 h-4" />
                            </button>
                        )}
                    </div>
                </div>

                {/* Stats Cards - Bento Grid Style */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 md:gap-5 mt-6">
                    {swrLoading && !tickets.length ? (
                        Array.from({ length: 4 }).map((_, idx) => <StatsCardSkeleton key={idx} />)
                    ) : (
                        [
                            { label: 'Total Tickets', value: stats.total, icon: AlertCircle, color: 'text-primary-600', bg: 'bg-primary-50', border: 'border-primary-100' },
                            { label: 'Pending', value: stats.pending, icon: Clock, color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-100' },
                            { label: 'In Progress', value: stats.inProgress, icon: Wrench, color: 'text-secondary-600', bg: 'bg-secondary-50', border: 'border-secondary-100' },
                            { label: 'Resolved', value: stats.resolved, icon: CheckCircle, color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-100' },
                        ].map((stat, idx) => (
                            <Card key={idx} className={clsx("hover:shadow-lg transition-all duration-300 border", stat.border)}>
                                <CardContent className="p-5 flex flex-col gap-3">
                                    {/* Icon badge */}
                                    <div className={clsx("w-fit p-2.5 rounded-xl", stat.bg)}>
                                        <stat.icon className={clsx("w-5 h-5", stat.color)} />
                                    </div>
                                    {/* Number */}
                                    <p className="text-3xl font-extrabold text-surface-900 leading-none">{stat.value}</p>
                                    {/* Label */}
                                    <p className="text-sm font-semibold text-surface-500">{stat.label}</p>
                                </CardContent>
                            </Card>
                        ))
                    )}
                </div>

                {/* Tickets Grid - Modern Card Style */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mt-6">
                    {swrLoading && !tickets.length ? (
                        Array.from({ length: 4 }).map((_, idx) => <CardSkeleton key={idx} />)
                    ) : filteredTickets.length === 0 ? (
                        <div className="col-span-2 text-center py-16 text-surface-400">
                            <Search className="w-10 h-10 mx-auto mb-3 opacity-40" />
                            <p className="font-medium">{search ? `No tickets match "${search}"` : 'No tickets found'}</p>
                            {search && <button onClick={() => setSearch('')} className="mt-2 text-sm text-primary-600 hover:underline">Clear search</button>}
                        </div>
                    ) : (
                        filteredTickets.map((ticket) => (
                            <Card key={ticket.id} className="hover:shadow-xl transition-all duration-300 cursor-pointer group border-surface-200" onClick={() => setSelectedTicket(ticket)}>
                                <CardContent className="p-6">
                                    <div className="flex justify-between items-start mb-4">
                                        <div className="flex-1 min-w-0 mr-4">
                                            <h3 className="font-bold text-surface-900 text-lg leading-tight mb-1 group-hover:text-primary-600 transition-colors">{ticket.title}</h3>
                                            <p className="text-surface-500 text-sm">{ticket.facility_type} • {ticket.specific_location}</p>
                                        </div>
                                        <span className={clsx(
                                            "px-3 py-1.5 rounded-full text-xs font-bold shrink-0",
                                            ticket.priority === 'high' ? "bg-red-100 text-red-700 border border-red-200" :
                                            ticket.priority === 'medium' ? "bg-amber-100 text-amber-700 border border-amber-200" :
                                            ticket.priority === 'low' ? "bg-emerald-100 text-emerald-700 border border-emerald-200" :
                                            "bg-surface-100 text-surface-700 border border-surface-200"
                                        )}>
                                            {ticket.priority?.toUpperCase()}
                                        </span>
                                    </div>

                                    <div className="flex items-center justify-between pt-4 border-t border-surface-100">
                                        <div className="space-y-2">
                                            {/* Reporter Information */}
                                            <div className="flex items-center gap-4 text-sm text-surface-500">
                                                <span className="flex items-center gap-1.5">
                                                    <div className="bg-primary-50 p-1 rounded">
                                                        <User className="w-3.5 h-3.5 text-primary-600" />
                                                    </div>
                                                    {ticket.reporter?.full_name || 'Unknown Reporter'}
                                                </span>
                                                <span className="flex items-center gap-1.5">
                                                    <Clock className="w-3.5 h-3.5 text-surface-400" />
                                                    {new Date(ticket.created_at).toLocaleDateString()}
                                                </span>
                                            </div>
                                            
                                            {/* Technician Information */}
                                            <div className="flex items-center gap-2 text-sm">
                                                <span className="flex items-center gap-1.5">
                                                    <div className="bg-secondary-50 p-1 rounded">
                                                        <WrenchIcon className="w-3.5 h-3.5 text-secondary-600" />
                                                    </div>
                                                    <span className="text-secondary-700 font-medium">
                                                        {ticket.technician?.full_name || 'Unassigned'}
                                                    </span>
                                                </span>
                                                {ticket.technician?.department && (
                                                    <span className="text-surface-400 text-xs">
                                                        ({ticket.technician.department})
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                        <div className="bg-surface-50 p-2 rounded-lg group-hover:bg-primary-50 transition-colors">
                                            <Eye className="w-5 h-5 text-surface-400 group-hover:text-primary-500" />
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        ))
                    )}
                </div>
            </div>

            {/* Security panel — always mounted, hidden when tickets tab is active */}
            <div className={activeTab === 'security' ? undefined : 'hidden'}>
                <Suspense fallback={<Loader variant="security" />}>
                    <SecurityDashboard />
                </Suspense>
            </div>

            {/* Users panel — always mounted, hidden when tickets/security tab is active */}
            <div className={activeTab === 'users' ? undefined : 'hidden'}>
                <Suspense fallback={<Loader variant="admin" />}>
                    <UserManagement />
                </Suspense>
            </div>

            {/* Ticket Details Modal */}
            {selectedTicket && (
                <TicketDetails
                    ticket={selectedTicket}
                    onClose={() => setSelectedTicket(null)}
                    onUpdate={() => {
                        setSelectedTicket(null);
                        mutate();
                    }}
                    onReassign={() => {
                        setSelectedTicket(null);
                        mutate();
                        toast.success('Ticket reassigned successfully');
                    }}
                />
            )}
        </div>
    );
}
