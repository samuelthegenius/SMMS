/**
 * @file src/pages/dashboards/AdminDashboard.jsx
 * @description Central Command Center for Facility Managers (Admins).
 * @author System Administrator
 * 
 * Key Features:
 * - Real-Time Overview: Monitors ongoing maintenance requests across the campus.
 * - Resource Allocation: Allows admins to dispatch technicians to specific tickets.
 * - Data Visualization: Provides high-level metrics (Total, Pending, Resolved).
 */
import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { sendEmailNotification } from '../../utils/emailService';
import { Filter, AlertCircle, Clock, Wrench, CheckCircle, Eye } from 'lucide-react';
import clsx from 'clsx';
import Loader from '../../components/Loader';
import TicketDetails from '../../components/TicketDetails';

const FACILITY_TYPES = [
    'All', 'Hostel', 'Lecture Hall', 'Laboratory', 'Office',
    'Sports Complex', 'Chapel', 'Other'
];

export default function AdminDashboard() {
    // State Management:
    // 'tickets': Stores the live snapshot of maintenance requests.
    // 'technicians': Stores available staff for assignment.
    const [tickets, setTickets] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState('All');
    const [profile, setProfile] = useState(null);

    const [technicians, setTechnicians] = useState([]);
    const [assigning, setAssigning] = useState(null);
    const [selectedTicket, setSelectedTicket] = useState(null);

    useEffect(() => {
        checkUser();
        fetchTickets();
        fetchTechnicians();

        // Real-Time Subscription:
        // Establishes a WebSocket connection to Supabase to listen for INSERT/UPDATE events on the 'tickets' table.
        // This ensures the dashboard always reflects the latest state without manual refreshing.
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

    // Data Fetching Strategy:
    // Performs a joined query to pull ticket data along with the requester's details (using foreign key 'user_id').
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

    const fetchTechnicians = async () => {
        try {
            const { data, error } = await supabase
                .from('profiles')
                .select('*')
                .eq('role', 'technician');

            if (error) throw error;
            setTechnicians(data || []);
        } catch (error) {
            console.error('Error fetching technicians:', error);
        }
    };

    // Manual Assignment Workflow:
    // 1. Updates functionality: Maps the ticket to a technician via 'assigned_to'.
    // 2. Notification: Triggers an email to the technician to alert them of the new task.
    // 3. Status Update: Automatically moves the ticket from 'Pending' to 'Assigned'.
    const handleAssign = async (ticketId, technicianId) => {
        if (!technicianId) return;
        setAssigning(ticketId);

        try {
            // 1. Atomic Update Transaction
            const { error } = await supabase
                .from('tickets')
                .update({
                    assigned_to: technicianId,
                    status: 'Assigned' // Or 'In Progress' depending on flow, usually 'Assigned' first
                })
                .eq('id', ticketId);

            if (error) throw error;

            // 2. Asynchronous Notification (Fire-and-Forget)
            const technician = technicians.find(t => t.id === technicianId);
            const ticket = tickets.find(t => t.id === ticketId);

            if (technician?.email) {
                await sendEmailNotification({
                    to: technician.email,
                    subject: `New Assignment: Ticket #${ticketId}`,
                    html: `<p>You have been assigned a new task.</p><p><strong>Task:</strong> ${ticket.title}</p><p><strong>Location:</strong> ${ticket.specific_location}</p><p>Please check your dashboard.</p>`
                });
            }

            alert("Technician assigned successfully!");
            fetchTickets(); // Refresh local state to reflect changes
        } catch (error) {
            console.error("Error assigning ticket:", error);
            alert("Failed to assign ticket.");
        } finally {
            setAssigning(null);
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
                                <th scope="col" className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Assigned To</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Actions</th>
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
                                                    ticket.status === 'Assigned' ? 'bg-blue-100 text-blue-700' :
                                                        'bg-amber-100 text-amber-700'
                                        )}>
                                            {ticket.status}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <div className="text-sm text-slate-900">{ticket.profiles?.full_name}</div>
                                        <div className="text-xs text-slate-500 capitalize">{ticket.profiles?.role?.replace('_', ' ')}</div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <select
                                            className="text-sm border-slate-300 rounded-md shadow-sm focus:border-blue-500 focus:ring-blue-500"
                                            value={ticket.assigned_to || ''}
                                            onChange={(e) => handleAssign(ticket.id, e.target.value)}
                                            disabled={assigning === ticket.id}
                                        >
                                            <option value="">Unassigned</option>
                                            {technicians.map(tech => (
                                                <option key={tech.id} value={tech.id}>{tech.full_name}</option>
                                            ))}
                                        </select>
                                        {assigning === ticket.id && <span className="ml-2 text-xs text-blue-500">Saving...</span>}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">
                                        <button
                                            onClick={() => setSelectedTicket(ticket)}
                                            className="text-indigo-600 hover:text-indigo-900 flex items-center gap-1"
                                        >
                                            <Eye className="w-4 h-4" />
                                            View
                                        </button>
                                    </td>
                                </tr>
                            ))}
                            {filteredTickets.length === 0 && (
                                <tr>
                                    <td colSpan="6" className="px-6 py-12 text-center text-slate-500">
                                        <div className="flex flex-col items-center justify-center">
                                            <p className="text-lg font-medium text-slate-900 mb-2">No pending tickets</p>
                                            <p className="text-slate-500 mb-6">Waiting for reports from Students, Staff, or Operations.</p>
                                            {/* Usability Feature: Allows Facility Managers to log issues they observe during inspections. */}
                                            <button
                                                onClick={() => window.location.href = '/new-ticket'}
                                                className="px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
                                            >
                                                Log a New Fault
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {selectedTicket && (
                <TicketDetails
                    ticket={selectedTicket}
                    onClose={() => setSelectedTicket(null)}
                />
            )}
        </div>
    );
}
