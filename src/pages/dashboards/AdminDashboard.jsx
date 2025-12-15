import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { Filter, Search, CheckCircle, Clock, AlertCircle, Wrench } from 'lucide-react';
import clsx from 'clsx';
import Loader from '../../components/Loader';

const FACILITY_TYPES = [
    'All', 'Hostel', 'Lecture Hall', 'Laboratory', 'Office',
    'Sports Complex', 'Chapel', 'Other'
];

export default function AdminDashboard() {
    const [tickets, setTickets] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState('All');
    const [profile, setProfile] = useState(null);

    useEffect(() => {
        checkUser();
        fetchTickets();

        const subscription = supabase
            .channel('admin_tickets')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'tickets' }, () => {
                fetchTickets();
            })
            .subscribe();

        return () => {
            subscription.unsubscribe();
        };
    }, []);

    const checkUser = async () => {
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (user) {
                const { data: profileData, error } = await supabase
                    .from('profiles')
                    .select('*')
                    .eq('id', user.id)
                    .single();

                if (error) {
                    console.error("Error fetching profile:", error);
                } else {
                    console.log("Current User Role:", profileData?.role);
                    setProfile(profileData);
                }
            }
        } catch (error) {
            console.error("Error checking user:", error);
        }
    };

    const fetchTickets = async () => {
        try {
            const { data, error } = await supabase
                .from('tickets')
                .select(`
          *,
          profiles:user_id (full_name, identification_number, role)
        `)
                .order('created_at', { ascending: false, foreignTable: '' });

            if (error) {
                console.error("Error fetching tickets:", error);
                alert("Error: " + error.message);
            } else {
                console.log("Tickets loaded:", data);
                setTickets(data || []);
            }
        } catch (error) {
            console.error('Error fetching tickets:', error);
            alert("Error: " + error.message);
        } finally {
            setLoading(false);
        }
    };

    const filteredTickets = filter === 'All'
        ? tickets
        : tickets.filter(t => t.facility_type === filter);

    const stats = {
        total: tickets.length,
        pending: tickets.filter(t => t.status === 'Pending').length,
        resolved: tickets.filter(t => t.status === 'Resolved').length,
        inProgress: tickets.filter(t => t.status === 'In Progress').length,
    };

    if (loading) return <Loader />;

    if (profile && profile.role !== 'admin') {
        return <div className="text-red-500 text-center mt-10">Access Denied: You are logged in as {profile.role}, not 'admin'.</div>;
    }

    return (
        <div className="space-y-8">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">Facility Manager Dashboard</h1>
                    <p className="text-slate-500 mt-1">Overview of all maintenance requests</p>
                </div>

                <div className="flex items-center gap-3 bg-white p-2 rounded-xl border border-slate-200 shadow-sm">
                    <Filter className="w-5 h-5 text-slate-400 ml-2" />
                    <select
                        value={filter}
                        onChange={(e) => setFilter(e.target.value)}
                        className="border-none focus:ring-0 text-sm text-slate-700 bg-transparent font-medium cursor-pointer outline-none"
                    >
                        {FACILITY_TYPES.map(type => (
                            <option key={type} value={type}>{type === 'All' ? 'All Facilities' : type}</option>
                        ))}
                    </select>
                </div>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm relative overflow-hidden">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-sm font-medium text-slate-500">Total Tickets</p>
                            <p className="text-3xl font-bold text-slate-900 mt-2">{stats.total}</p>
                        </div>
                        <div className="p-2 bg-blue-50 rounded-full">
                            <AlertCircle className="w-6 h-6 text-blue-600" />
                        </div>
                    </div>
                </div>
                <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm relative overflow-hidden">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-sm font-medium text-slate-500">Pending</p>
                            <p className="text-3xl font-bold text-slate-900 mt-2">{stats.pending}</p>
                        </div>
                        <div className="p-2 bg-amber-50 rounded-full">
                            <Clock className="w-6 h-6 text-amber-600" />
                        </div>
                    </div>
                </div>
                <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm relative overflow-hidden">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-sm font-medium text-slate-500">In Progress</p>
                            <p className="text-3xl font-bold text-slate-900 mt-2">{stats.inProgress}</p>
                        </div>
                        <div className="p-2 bg-indigo-50 rounded-full">
                            <Wrench className="w-6 h-6 text-indigo-600" />
                        </div>
                    </div>
                </div>
                <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm relative overflow-hidden">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-sm font-medium text-slate-500">Resolved</p>
                            <p className="text-3xl font-bold text-slate-900 mt-2">{stats.resolved}</p>
                        </div>
                        <div className="p-2 bg-emerald-50 rounded-full">
                            <CheckCircle className="w-6 h-6 text-emerald-600" />
                        </div>
                    </div>
                </div>
            </div>

            {/* Ticket Table */}
            <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-slate-200">
                        <thead className="bg-slate-50">
                            <tr>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Ticket Details</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Location</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Reported By</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Date</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-slate-200">
                            {filteredTickets.map((ticket) => (
                                <tr key={ticket.id} className="hover:bg-slate-50 transition-colors">
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <div className="text-sm font-medium text-slate-900">{ticket.title}</div>
                                        <div className="text-xs text-slate-500 mt-0.5 max-w-xs truncate">{ticket.description}</div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <div className="text-sm text-slate-900">{ticket.facility_type}</div>
                                        <div className="text-xs text-slate-500">{ticket.specific_location}</div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <span className={clsx(
                                            'px-3 py-1 inline-flex text-xs leading-5 font-semibold rounded-full',
                                            ticket.status === 'Resolved' ? 'bg-emerald-100 text-emerald-700' :
                                                ticket.status === 'In Progress' ? 'bg-indigo-100 text-indigo-700' :
                                                    'bg-amber-100 text-amber-700'
                                        )}>
                                            {ticket.status}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <div className="text-sm text-slate-900">{ticket.profiles?.full_name}</div>
                                        <div className="text-xs text-slate-500 capitalize">{ticket.profiles?.role?.replace('_', ' ')}</div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">
                                        {new Date(ticket.created_at).toLocaleDateString()}
                                    </td>
                                </tr>
                            ))}
                            {filteredTickets.length === 0 && (
                                <tr>
                                    <td colSpan="5" className="px-6 py-12 text-center text-slate-500">
                                        <div className="flex flex-col items-center justify-center">
                                            <p className="text-lg font-medium text-slate-900 mb-2">No tickets found</p>
                                            <p className="text-slate-500 mb-6">Log in as a Student to create a ticket.</p>
                                        </div>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
