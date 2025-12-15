import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { Clock, CheckCircle, AlertCircle, MapPin, Calendar, ArrowRight } from 'lucide-react';
import clsx from 'clsx';
import Loader from '../../components/Loader';

const STATUS_STYLES = {
    'Pending': { bg: 'bg-amber-50', text: 'text-amber-700', icon: Clock, border: 'border-amber-100' },
    'Assigned': { bg: 'bg-blue-50', text: 'text-blue-700', icon: AlertCircle, border: 'border-blue-100' },
    'In Progress': { bg: 'bg-indigo-50', text: 'text-indigo-700', icon: AlertCircle, border: 'border-indigo-100' },
    'Resolved': { bg: 'bg-emerald-50', text: 'text-emerald-700', icon: CheckCircle, border: 'border-emerald-100' },
};

export default function StudentDashboard() {
    const { user } = useAuth();
    const [tickets, setTickets] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchTickets = async () => {
            try {
                const { data, error } = await supabase
                    .from('tickets')
                    .select('*')
                    .eq('user_id', user.id)
                    .order('created_at', { ascending: false });

                if (error) throw error;
                setTickets(data);
            } catch (error) {
                console.error('Error fetching tickets:', error);
            } finally {
                setLoading(false);
            }
        };

        fetchTickets();
    }, [user.id]);

    if (loading) return <Loader />;

    return (
        <div className="space-y-8">
            <div>
                <h1 className="text-2xl font-bold text-slate-900">My Reports</h1>
                <p className="text-slate-500 mt-1">Track the status of your maintenance requests</p>
            </div>

            {tickets.length === 0 ? (
                <div className="text-center py-16 bg-white rounded-2xl shadow-sm border border-slate-200">
                    <div className="mx-auto h-12 w-12 text-slate-400">
                        <AlertCircle className="h-12 w-12" />
                    </div>
                    <h3 className="mt-2 text-sm font-medium text-slate-900">No tickets yet</h3>
                    <p className="mt-1 text-sm text-slate-500">Get started by creating a new maintenance request.</p>
                </div>
            ) : (
                <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                    {tickets.map((ticket) => {
                        const statusStyle = STATUS_STYLES[ticket.status] || STATUS_STYLES['Pending'];
                        const StatusIcon = statusStyle.icon;

                        return (
                            <div key={ticket.id} className="bg-white shadow-sm hover:shadow-md transition-shadow rounded-xl p-6 border border-slate-200 flex flex-col h-full">
                                <div className="flex justify-between items-start mb-4">
                                    <span className={clsx(
                                        'px-3 py-1 text-xs font-semibold rounded-full flex items-center gap-1.5',
                                        statusStyle.bg,
                                        statusStyle.text,
                                        statusStyle.border,
                                        "border"
                                    )}>
                                        <StatusIcon className="w-3.5 h-3.5" />
                                        {ticket.status}
                                    </span>
                                    <span className="text-xs font-medium text-slate-400 flex items-center gap-1">
                                        <Calendar className="w-3.5 h-3.5" />
                                        {new Date(ticket.created_at).toLocaleDateString()}
                                    </span>
                                </div>

                                <h3 className="text-lg font-bold text-slate-900 mb-2 line-clamp-1">{ticket.title}</h3>
                                <p className="text-sm text-slate-600 mb-6 line-clamp-2 flex-1">{ticket.description}</p>

                                <div className="pt-4 border-t border-slate-100 mt-auto">
                                    <div className="flex items-center gap-2 text-sm text-slate-500 font-medium">
                                        <MapPin className="w-4 h-4 text-slate-400" />
                                        <span className="truncate">{ticket.facility_type} • {ticket.specific_location}</span>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
