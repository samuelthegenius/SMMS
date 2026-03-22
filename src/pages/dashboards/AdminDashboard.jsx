import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
// import { sendEmailNotification } from '../../utils/emailService'; // Deprecated in favor of Edge Function
import { Filter, AlertCircle, Clock, Wrench, CheckCircle, Eye } from 'lucide-react';
import clsx from 'clsx';
import Loader from '../../components/Loader';
import TicketDetails from '../../components/TicketDetails';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import ReassignTechnician from '../../components/ReassignTechnician';

const FACILITY_TYPES = [
    'All', 'Hostel', 'Lecture Hall', 'Laboratory', 'Office',
    'Sports Complex', 'Chapel', 'Other'
];

import useSWR from 'swr';
import { useAuth } from '../../contexts/AuthContext';

export default function AdminDashboard() {
    const { profile } = useAuth();
    const [filter, setFilter] = useState('All');
    const [selectedTicket, setSelectedTicket] = useState(null);

    // SWR Fetcher - Only fetch necessary fields for privacy
    const fetchTickets = async () => {
        const { data, error } = await supabase
            .from('tickets')
            .select(`
                id,
                title,
                description,
                category,
                facility_type,
                specific_location,
                status,
                priority,
                created_at,
                updated_at,
                assigned_to,
                created_by,
                creator:created_by (
                    full_name,
                    role
                )
            `)
            .order('created_at', { ascending: false });
        if (error) throw error;
        return data;
    };

    // Use SWR for caching (dedupingInterval: 5000 is default, we can keep it)
    const { data: tickets = [], mutate, isLoading } = useSWR('admin_tickets', fetchTickets);

    useEffect(() => {
        const subscription = supabase
            .channel('admin_tickets')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'tickets' }, () => {
                mutate();
                toast.info('Dashboard updated');
            })
            .subscribe();

        return () => {
            subscription.unsubscribe();
        };
    }, [mutate]);



    const filteredTickets = filter === 'All'
        ? tickets
        : tickets.filter(t => t.facility_type === filter);

    const stats = {
        total: tickets.length,
        pending: tickets.filter(t => t.status === 'Pending').length,
        resolved: tickets.filter(t => t.status === 'Resolved').length,
        inProgress: tickets.filter(t => t.status === 'In Progress').length,
    };

    if (isLoading && !tickets.length) return <Loader />;

    if (profile && profile.role !== 'admin') {
        return <div className="text-red-500 text-center mt-10">Access Denied: You are not an admin.</div>;
    }

    return (
        <div className="space-y-8">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Facility Manager Dashboard</h1>
                    <p className="text-slate-500 mt-2 text-lg">Overview of all maintenance requests</p>
                </div>

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

            {/* Ticket Table */}
            <Card className="overflow-hidden border-slate-200 shadow-sm">
                <CardHeader className="bg-slate-50/50 border-b border-slate-100 p-4">
                    <CardTitle className="text-base font-semibold text-slate-700">Recent Requests</CardTitle>
                </CardHeader>
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-slate-200">
                        <thead className="bg-slate-50/50">
                            <tr>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Ticket Details</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Location</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Reported By</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Assigned To</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-slate-200">
                            {filteredTickets.map((ticket) => (
                                <tr key={ticket.id} className="hover:bg-slate-50/50 transition-colors">
                                    <td className="px-6 py-4">
                                        <div className="text-sm font-medium text-slate-900 line-clamp-1">{ticket.title}</div>
                                        <div className="text-xs text-slate-500 mt-0.5 line-clamp-1">{ticket.description}</div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <div className="text-sm text-slate-900">{ticket.facility_type}</div>
                                        <div className="text-xs text-slate-500">{ticket.specific_location}</div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <span className={clsx(
                                            'px-2.5 py-1 inline-flex text-xs leading-5 font-semibold rounded-full border',
                                            ticket.status === 'Resolved' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' :
                                                ticket.status === 'In Progress' ? 'bg-indigo-50 text-indigo-700 border-indigo-100' :
                                                    ticket.status === 'Assigned' ? 'bg-blue-50 text-blue-700 border-blue-100' :
                                                        'bg-amber-50 text-amber-700 border-amber-100'
                                        )}>
                                            {ticket.status}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <div className="text-sm text-slate-900">{ticket.creator?.full_name}</div>
                                        <div className="text-xs text-slate-500 capitalize">{ticket.creator?.role?.replace('_', ' ')}</div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <ReassignTechnician
                                            ticket={ticket}
                                            onReassign={() => mutate()}
                                        />
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => setSelectedTicket(ticket)}
                                            className="text-indigo-600 hover:text-indigo-900 hover:bg-indigo-50"
                                        >
                                            <Eye className="w-4 h-4 mr-1" />
                                            View
                                        </Button>
                                    </td>
                                </tr>
                            ))}
                            {filteredTickets.length === 0 && (
                                <tr>
                                    <td colSpan="6" className="px-6 py-12 text-center text-slate-500">
                                        <div className="flex flex-col items-center justify-center">
                                            <p className="text-lg font-medium text-slate-900 mb-2">No pending tickets</p>
                                            <p className="text-slate-500 mb-6">Waiting for reports from Students, Staff, or Operations.</p>
                                            <Button
                                                onClick={() => window.location.href = '/new-ticket'}
                                            >
                                                Log a New Fault
                                            </Button>
                                        </div>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </Card>

            {selectedTicket && (
                <TicketDetails
                    ticket={selectedTicket}
                    onClose={() => setSelectedTicket(null)}
                />
            )}
        </div>
    );
}
