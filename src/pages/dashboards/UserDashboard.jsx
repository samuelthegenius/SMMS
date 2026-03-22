import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { Clock, CheckCircle, AlertCircle, MapPin, Calendar, Activity, ThumbsUp, ThumbsDown, X } from 'lucide-react';
import { toast } from 'sonner';
import clsx from 'clsx';
import Loader from '../../components/Loader';
import { Card, CardContent } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';

const STATUS_STYLES = {
    'Pending': { bg: 'bg-amber-50', text: 'text-amber-700', icon: Clock, border: 'border-amber-100' },
    'Assigned': { bg: 'bg-blue-50', text: 'text-blue-700', icon: Activity, border: 'border-blue-100' },
    'In Progress': { bg: 'bg-indigo-50', text: 'text-indigo-700', icon: WrenchIcon, border: 'border-indigo-100' },
    'Pending Verification': { bg: 'bg-purple-50', text: 'text-purple-700', icon: Clock, border: 'border-purple-100' },
    'Resolved': { bg: 'bg-emerald-50', text: 'text-emerald-700', icon: CheckCircle, border: 'border-emerald-100' },
    'Completed': { bg: 'bg-teal-50', text: 'text-teal-700', icon: CheckCircle, border: 'border-teal-100' },
};

function WrenchIcon(props) {
    return <Activity {...props} />; // Fallback icon
}

import useSWR from 'swr';

export default function UserDashboard() {
    const { user, profile } = useAuth();
    const [rejectingId, setRejectingId] = useState(null);
    const [rejectionReason, setRejectionReason] = useState('');

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
                rejection_reason,
                image_url
            `)
            .eq('created_by', user.id)
            .order('created_at', { ascending: false });
        if (error) throw error;
        return data;
    };

    const { data: tickets = [], mutate, isLoading } = useSWR(user ? ['user_tickets', user.id] : null, fetchTickets);

    const handleVerification = async (ticketId, isApproved, reason = null) => {
        const previousTickets = [...tickets];
        const updates = {
            status: isApproved ? 'Completed' : 'In Progress',
            rejection_reason: reason
        };
        const updatedTickets = tickets.map(t => t.id === ticketId ? { ...t, ...updates } : t);

        // Optimistic update
        mutate(updatedTickets, false);

        try {
            const { error } = await supabase
                .from('tickets')
                .update(updates)
                .eq('id', ticketId);

            if (error) throw error;

            toast.success(isApproved ? 'Fix confirmed! Ticket completed.' : 'Issue reported. Technician notified.');

            if (!isApproved) {
                setRejectingId(null);
                setRejectionReason('');
            }
            mutate(); // Revalidate
        } catch (error) {
            console.error('Error updating status:', error);
            toast.error('Failed to update status');
            mutate(previousTickets, false); // Rollback
        }
    };

    if (isLoading && !tickets.length) return <Loader />;

    const displayRole = profile?.role === 'staff_member' ? 'Staff' : 'Student';

    return (
        <div className="space-y-8">
            <div>
                <h1 className="text-3xl font-bold text-slate-900 tracking-tight">
                    Welcome, {profile?.full_name?.split(' ')[0] || 'User'}
                </h1>
                <p className="text-slate-500 mt-2 text-lg">
                    Track the status of your maintenance requests
                </p>
            </div>

            {tickets.length === 0 ? (
                <Card className="border-dashed">
                    <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                        <div className="mx-auto h-12 w-12 bg-slate-50 rounded-full flex items-center justify-center mb-4">
                            <AlertCircle className="h-6 w-6 text-slate-400" />
                        </div>
                        <h3 className="text-lg font-semibold text-slate-900">No tickets yet</h3>
                        <p className="mt-2 text-slate-500 max-w-sm">
                            Get started by creating a new maintenance request using the "New Ticket" button.
                        </p>
                    </CardContent>
                </Card>
            ) : (
                <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                    {tickets.map((ticket) => {
                        const statusStyle = STATUS_STYLES[ticket.status] || STATUS_STYLES['Pending'];
                        const StatusIcon = statusStyle.icon;

                        return (
                            <Card key={ticket.id} className="hover:shadow-xl transition-shadow duration-300 border-slate-200/60">
                                <CardContent className="p-6 h-full flex flex-col">
                                    <div className="flex justify-between items-start mb-4">
                                        <span className={clsx(
                                            'px-3 py-1 text-xs font-semibold rounded-full flex items-center gap-1.5 border',
                                            statusStyle.bg,
                                            statusStyle.text,
                                            statusStyle.border
                                        )}>
                                            <StatusIcon className="w-3.5 h-3.5" />
                                            {ticket.status}
                                        </span>
                                        <span className="text-xs font-medium text-slate-400 flex items-center gap-1">
                                            <Calendar className="w-3.5 h-3.5" />
                                            {new Date(ticket.created_at).toLocaleDateString()}
                                        </span>
                                    </div>

                                    <h3 className="text-lg font-bold text-slate-900 mb-2 line-clamp-1">
                                        {ticket.title}
                                    </h3>
                                    <p className="text-sm text-slate-600 mb-6 line-clamp-2 flex-1 leading-relaxed">
                                        {ticket.description}
                                    </p>

                                    <div className="pt-4 border-t border-slate-100 mt-auto space-y-3">
                                        <div className="flex items-center gap-2 text-sm text-slate-500 font-medium">
                                            <MapPin className="w-4 h-4 text-slate-400" />
                                            <span className="truncate">{ticket.facility_type} • {ticket.specific_location}</span>
                                        </div>

                                        {ticket.status === 'Pending Verification' && (
                                            <div className="bg-slate-50 p-3 rounded-lg border border-slate-100 animate-in fade-in zoom-in-95 duration-200">
                                                {rejectingId === ticket.id ? (
                                                    <div className="space-y-3">
                                                        <textarea
                                                            value={rejectionReason}
                                                            onChange={(e) => setRejectionReason(e.target.value)}
                                                            placeholder="Why is the issue not resolved?"
                                                            className="w-full text-sm p-2 rounded-md border-slate-200 focus:ring-rose-500 focus:border-rose-500"
                                                            rows={2}
                                                            autoFocus
                                                        />
                                                        <div className="flex gap-2">
                                                            <Button
                                                                size="sm"
                                                                onClick={() => handleVerification(ticket.id, false, rejectionReason)}
                                                                className="bg-rose-600 hover:bg-rose-700 text-white flex-1"
                                                                disabled={!rejectionReason.trim()}
                                                            >
                                                                Submit Report
                                                            </Button>
                                                            <Button
                                                                size="sm"
                                                                variant="outline"
                                                                onClick={() => {
                                                                    setRejectingId(null);
                                                                    setRejectionReason('');
                                                                }}
                                                                className="px-2"
                                                            >
                                                                <X className="w-4 h-4" />
                                                            </Button>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <div className="space-y-2">
                                                        <p className="text-sm font-medium text-slate-700">Evaluate Fix:</p>
                                                        <div className="flex gap-2">
                                                            <Button
                                                                onClick={() => handleVerification(ticket.id, true)}
                                                                className="bg-emerald-600 hover:bg-emerald-700 flex-1 text-sm h-9"
                                                            >
                                                                <ThumbsUp className="w-3.5 h-3.5 mr-1.5" />
                                                                Confirm Fix
                                                            </Button>
                                                            <Button
                                                                onClick={() => setRejectingId(ticket.id)}
                                                                className="bg-white hover:bg-rose-50 text-rose-600 border border-rose-200 hover:border-rose-300 flex-1 text-sm h-9"
                                                            >
                                                                <ThumbsDown className="w-3.5 h-3.5 mr-1.5" />
                                                                Reject
                                                            </Button>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </CardContent>
                            </Card>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
