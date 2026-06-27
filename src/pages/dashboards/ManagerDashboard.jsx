import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import useSWR from 'swr';
import { supabase } from '../../lib/supabase';
import { Filter, AlertCircle, Clock, Wrench, CheckCircle, Eye, BarChart3, User, PlusCircle, Search, X } from 'lucide-react';
import clsx from 'clsx';
import TicketDetails from '../../components/TicketDetails';
import { toast } from 'sonner';
import { Card, CardContent } from '../../components/ui/Card';
import { Select } from '../../components/ui/Select';
import { StatsCardSkeleton, CardSkeleton } from '../../components/SkeletonLoader';
import { useAuth } from '../../contexts/useAuth';

const FACILITY_TYPES = [
    'All', 'Hostel', 'Lecture Hall', 'Laboratory', 'Office',
    'Sports Complex', 'Chapel', 'Other'
];

export default function ManagerDashboard() {
    const { profile } = useAuth();
    const navigate = useNavigate();
    const [filter, setFilter] = useState('All');
    const [timeframe, setTimeframe] = useState('All Time');
    const [search, setSearch] = useState('');
    const [selectedTicket, setSelectedTicket] = useState(null);

    const fetchTickets = async () => {
        const { data, error } = await supabase.rpc('get_supervisor_all_tickets');

        if (error) {
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

        const mappedData = data.map(ticket => ({
            ...ticket,
            id: ticket.ticket_id,
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
        'supervisor_all_tickets',
        fetchTickets,
        {
            revalidateOnFocus: false,
            revalidateOnMount: true,
            revalidateOnReconnect: true,
            dedupingInterval: 0,
            errorRetryCount: 2,
            errorRetryInterval: 5000,
            refreshInterval: 0,
            suspense: false
        }
    );

    useEffect(() => {
        if (!profile) return;

        let timeoutId = null;

        const subscription = supabase
            .channel(`manager_tickets_${profile.id}`)
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
    }, [mutate, profile?.id, profile]);

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
        pending: filteredTickets.filter(t => t.status === 'Open' || t.status === 'Assigned').length,
        resolved: filteredTickets.filter(t => t.status === 'Resolved' || t.status === 'Completed' || t.status === 'Closed').length,
        inProgress: filteredTickets.filter(t => t.status === 'In Progress').length,
    };

    if (error) {
        return (
            <div className="text-red-500 text-center mt-10">
                <p className="text-lg font-medium">Error loading tickets</p>
                <p className="text-sm mt-2">Please try refreshing the page</p>
            </div>
        );
    }

    return (
        <div className="space-y-8">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-surface-900 tracking-tight">Facility Management Dashboard</h1>
                    <p className="text-surface-500 mt-2 text-lg">Oversee all facility tickets and maintenance operations</p>
                </div>
                <button
                    onClick={() => navigate('/new-ticket')}
                    className="flex items-center gap-2 px-5 py-2.5 bg-primary-600 text-white rounded-xl hover:bg-primary-700 transition-colors font-semibold text-sm shadow-md"
                >
                    <PlusCircle className="w-4 h-4" />
                    New Ticket
                </button>
            </div>

            {/* Filters */}
            <div className="flex flex-wrap items-center gap-4 bg-white p-3 rounded-2xl border border-surface-200 shadow-sm hover:shadow-md transition-shadow">
                <div className="flex items-center gap-3 bg-surface-50 p-1.5 rounded-xl border border-surface-100">
                    <div className="bg-white p-1.5 rounded-lg shadow-sm">
                        <Filter className="w-4 h-4 text-surface-500" />
                    </div>
                    <Select
                        value={filter}
                        onChange={(e) => setFilter(e.target.value)}
                        className="h-auto border-none shadow-none bg-transparent font-medium min-w-[140px] pl-2"
                    >
                        {FACILITY_TYPES.map(type => (
                            <option key={type} value={type}>{type === 'All' ? 'All Facilities' : type}</option>
                        ))}
                    </Select>
                </div>

                <div className="flex items-center gap-3 bg-surface-50 p-1.5 rounded-xl border border-surface-100">
                    <div className="bg-white p-1.5 rounded-lg shadow-sm">
                        <Clock className="w-4 h-4 text-surface-500" />
                    </div>
                    <Select
                        value={timeframe}
                        onChange={(e) => setTimeframe(e.target.value)}
                        className="h-auto border-none shadow-none bg-transparent font-medium min-w-[120px] pl-2"
                    >
                        {['Today', 'Last 7 Days', 'Last 30 Days', 'All Time'].map(t => (
                            <option key={t} value={t}>{t}</option>
                        ))}
                    </Select>
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

            {/* Stats Cards */}
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
                                <div className={clsx("w-fit p-2.5 rounded-xl", stat.bg)}>
                                    <stat.icon className={clsx("w-5 h-5", stat.color)} />
                                </div>
                                <p className="text-3xl font-extrabold text-surface-900 leading-none">{stat.value}</p>
                                <p className="text-sm font-semibold text-surface-500">{stat.label}</p>
                            </CardContent>
                        </Card>
                    ))
                )}
            </div>

            {/* Tickets Grid */}
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
                                        <div className="flex items-center gap-2 text-sm">
                                            <span className="flex items-center gap-1.5">
                                                <div className="bg-secondary-50 p-1 rounded">
                                                    <Wrench className="w-3.5 h-3.5 text-secondary-600" />
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
