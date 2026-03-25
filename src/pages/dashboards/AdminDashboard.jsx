import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
// import { sendEmailNotification } from '../../utils/emailService'; // Deprecated in favor of Edge Function
import { Filter, AlertCircle, Clock, Wrench, CheckCircle, Eye, Shield, BarChart3, Users, User, Wrench as WrenchIcon } from 'lucide-react';
import clsx from 'clsx';
import Loader from '../../components/Loader';
import TicketDetails from '../../components/TicketDetails';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import ReassignTechnician from '../../components/ReassignTechnician';
import SecurityDashboard from './SecurityDashboard';

const FACILITY_TYPES = [
    'All', 'Hostel', 'Lecture Hall', 'Laboratory', 'Office',
    'Sports Complex', 'Chapel', 'Other'
];

import useSWR from 'swr';
import { useAuth } from '../../contexts/AuthContext';

export default function AdminDashboard() {
    const { profile, loading } = useAuth();
    const [filter, setFilter] = useState('All');
    const [selectedTicket, setSelectedTicket] = useState(null);
    const [activeTab, setActiveTab] = useState('tickets'); // 'tickets' or 'security'

    // SWR Fetcher - Use RPC function to get all admin tickets
    const fetchTickets = async () => {
        const { data, error } = await supabase.rpc('get_admin_tickets');
        
        if (error) {
            // Log error without sensitive details
            console.error('Admin tickets fetch failed:', error.message);
            // Fallback to direct query with joins
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
        return data.map(ticket => ({
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
    };

    // Use SWR for caching with proper loading state handling
    const { data: tickets = [], mutate, isLoading: swrLoading, error } = useSWR(
        profile?.role === 'admin' ? 'admin_tickets' : null, 
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

    useEffect(() => {
        if (!profile || profile.role !== 'admin') return;
        
        const subscription = supabase
            .channel(`admin_tickets_${profile.id}`)
            .on('postgres_changes', 
                { 
                    event: '*', 
                    schema: 'public', 
                    table: 'tickets',
                    filter: `created_at=gt.${new Date(Date.now() - 60000).toISOString()}` // Only listen for recent changes
                }, 
                () => {
                    // Debounce rapid mutations
                    const timeoutId = setTimeout(() => {
                        mutate();
                    }, 1000);
                    
                    return () => clearTimeout(timeoutId);
                }
            )
            .subscribe();

        return () => {
            subscription.unsubscribe();
        };
    }, [mutate, profile?.id]);

    const filteredTickets = filter === 'All'
        ? tickets
        : tickets.filter(t => t.facility_type === filter);

    const stats = {
        total: tickets.length,
        pending: tickets.filter(t => t.status === 'Open').length,
        resolved: tickets.filter(t => t.status === 'Resolved').length,
        inProgress: tickets.filter(t => t.status === 'In Progress').length,
    };

    // Show loader only during initial auth loading or SWR loading with no data
    if (loading || (swrLoading && !tickets.length && !error)) return <Loader />;

    // Handle SWR errors gracefully
    if (error) {
        console.error('Failed to fetch tickets:', error);
        return (
            <div className="text-red-500 text-center mt-10">
                <p className="text-lg font-medium">Error loading tickets</p>
                <p className="text-sm mt-2">Please try refreshing the page</p>
            </div>
        );
    }

    if (profile && profile.role !== 'admin') {
        return <div className="text-red-500 text-center mt-10">Access Denied: You are not an admin.</div>;
    }

    if (!profile) {
        return <div className="text-red-500 text-center mt-10">No user profile found. Please log in.</div>;
    }

    return (
        <div className="space-y-8">
            {/* Header with Tabs */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Admin Dashboard</h1>
                    <p className="text-slate-500 mt-2 text-lg">Manage maintenance and security</p>
                </div>

                {/* Tab Navigation */}
                <div className="flex items-center gap-2 bg-white p-1 rounded-xl border border-slate-200 shadow-sm">
                    <button
                        onClick={() => setActiveTab('tickets')}
                        className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                            activeTab === 'tickets'
                                ? 'bg-indigo-600 text-white'
                                : 'text-slate-600 hover:bg-slate-100'
                        }`}
                    >
                        <div className="flex items-center gap-2">
                            <BarChart3 className="w-4 h-4" />
                            Tickets
                        </div>
                    </button>
                    <button
                        onClick={() => setActiveTab('security')}
                        className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                            activeTab === 'security'
                                ? 'bg-indigo-600 text-white'
                                : 'text-slate-600 hover:bg-slate-100'
                        }`}
                    >
                        <div className="flex items-center gap-2">
                            <Shield className="w-4 h-4" />
                            Security
                        </div>
                    </button>
                </div>
            </div>

            {/* Tab Content */}
            {activeTab === 'tickets' ? (
                <>
                    {/* Filter for tickets tab */}
                    <div className="flex items-center gap-3 bg-white p-2 rounded-xl border border-slate-200 shadow-sm">
                        <Filter className="w-5 h-5 text-slate-400 ml-2" />
                        <select
                            value={filter}
                            onChange={(e) => setFilter(e.target.value)}
                            className="border-none focus:ring-0 text-sm text-slate-700 bg-transparent font-medium cursor-pointer outline-none min-w-[150px]"
                        >
                            {FACILITY_TYPES.map(type => (
                                <option key={type} value={type}>{type === 'All' ? 'All Facilities' : type}</option>
                            ))}
                        </select>
                    </div>

                    {/* Stats Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                        {[
                            { label: 'Total Tickets', value: stats.total, icon: AlertCircle, color: 'text-blue-600', bg: 'bg-blue-50' },
                            { label: 'Pending', value: stats.pending, icon: Clock, color: 'text-amber-600', bg: 'bg-amber-50' },
                            { label: 'In Progress', value: stats.inProgress, icon: Wrench, color: 'text-indigo-600', bg: 'bg-indigo-50' },
                            { label: 'Resolved', value: stats.resolved, icon: CheckCircle, color: 'text-emerald-600', bg: 'bg-emerald-50' },
                        ].map((stat, idx) => (
                            <Card key={idx} className="hover:shadow-md transition-shadow">
                                <CardContent className="p-6 flex justify-between items-start">
                                    <div>
                                        <p className="text-sm font-medium text-slate-500">{stat.label}</p>
                                        <p className="text-3xl font-bold text-slate-900 mt-2">{stat.value}</p>
                                    </div>
                                    <div className={clsx("p-3 rounded-xl", stat.bg)}>
                                        <stat.icon className={clsx("w-6 h-6", stat.color)} />
                                    </div>
                                </CardContent>
                            </Card>
                        ))}
                    </div>

                    {/* Tickets Grid */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {filteredTickets.map((ticket) => (
                            <Card key={ticket.id} className="hover:shadow-md transition-all cursor-pointer" onClick={() => setSelectedTicket(ticket)}>
                                <CardContent className="p-6">
                                    <div className="flex justify-between items-start mb-4">
                                        <div>
                                            <h3 className="font-semibold text-slate-900 text-lg">{ticket.title}</h3>
                                            <p className="text-slate-500 text-sm">{ticket.facility_type} • {ticket.specific_location}</p>
                                        </div>
                                        <span className={clsx(
                                            "px-3 py-1 rounded-full text-xs font-medium",
                                            ticket.priority === 'high' ? "bg-red-100 text-red-700" :
                                            ticket.priority === 'medium' ? "bg-amber-100 text-amber-700" :
                                            ticket.priority === 'low' ? "bg-green-100 text-green-700" :
                                            "bg-slate-100 text-slate-700"
                                        )}>
                                            {ticket.priority?.toUpperCase()}
                                        </span>
                                    </div>

                                    <div className="flex items-center justify-between">
                                        <div className="space-y-2">
                                            {/* Reporter Information */}
                                            <div className="flex items-center gap-4 text-sm text-slate-500">
                                                <span className="flex items-center gap-1">
                                                    <User className="w-4 h-4 text-blue-500" />
                                                    {ticket.reporter?.full_name || 'Unknown Reporter'}
                                                </span>
                                                <span className="flex items-center gap-1">
                                                    <Clock className="w-4 h-4" />
                                                    {new Date(ticket.created_at).toLocaleDateString()}
                                                </span>
                                            </div>
                                            
                                            {/* Technician Information */}
                                            <div className="flex items-center gap-2 text-sm">
                                                <span className="flex items-center gap-1">
                                                    <WrenchIcon className="w-4 h-4 text-green-500" />
                                                    {ticket.technician?.full_name || 'Unassigned'}
                                                </span>
                                                {ticket.technician?.department && (
                                                    <span className="text-slate-400 text-xs">
                                                        ({ticket.technician.department})
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                        <Eye className="w-5 h-5 text-slate-400" />
                                    </div>
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                </>
            ) : (
                <SecurityDashboard />
            )}

            {/* Ticket Details Modal */}
            {selectedTicket && (
                <TicketDetails
                    ticket={selectedTicket}
                    onClose={() => setSelectedTicket(null)}
                    onUpdate={() => {
                        setSelectedTicket(null);
                        mutate();
                    }}
                    onReassign={(technicianId) => {
                        setSelectedTicket(null);
                        mutate();
                        toast.success('Ticket reassigned successfully');
                    }}
                />
            )}
        </div>
    );
}
