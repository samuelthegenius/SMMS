import { useState } from 'react';
import useSWR from 'swr';
import { useLocation } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/useAuth';
import { Clock, CheckCircle, AlertCircle, MapPin, Calendar, Activity, ThumbsUp, ThumbsDown, X, Wrench as WrenchIcon } from 'lucide-react';
import { toast } from 'sonner';
import clsx from 'clsx';
import Loader from '../../components/Loader';
import { Card, CardContent } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';

const STATUS_STYLES = {
    'Open': { bg: 'bg-amber-50', text: 'text-amber-700', icon: Clock, border: 'border-amber-200' },
    'In Progress': { bg: 'bg-secondary-50', text: 'text-secondary-700', icon: WrenchIcon, border: 'border-secondary-200' },
    'Pending Verification': { bg: 'bg-primary-50', text: 'text-primary-700', icon: Clock, border: 'border-primary-200' },
    'Escalated': { bg: 'bg-rose-50', text: 'text-rose-700', icon: AlertCircle, border: 'border-rose-200' },
    'Resolved': { bg: 'bg-emerald-50', text: 'text-emerald-700', icon: CheckCircle, border: 'border-emerald-200' },
    'Closed': { bg: 'bg-surface-50', text: 'text-surface-700', icon: CheckCircle, border: 'border-surface-200' },
    // Additional statuses used by the backend but not always shown to users
    'Pending': { bg: 'bg-amber-50', text: 'text-amber-700', icon: Clock, border: 'border-amber-200' },
    'Assigned': { bg: 'bg-primary-50', text: 'text-primary-700', icon: WrenchIcon, border: 'border-primary-200' },
    'Completed': { bg: 'bg-emerald-50', text: 'text-emerald-700', icon: CheckCircle, border: 'border-emerald-200' },
};

const ACTIVE_STATUSES = ['Open', 'In Progress', 'Escalated', 'Pending Verification'];
const COMPLETED_STATUSES = ['Resolved', 'Closed'];

export default function UserDashboard() {
    const { user } = useAuth();
    const location = useLocation();
    const [rejectingId, setRejectingId] = useState(null);
    const [rejectionReason, setRejectionReason] = useState('');

    const isHistoryView = location.pathname === '/history';
    const viewTitle = isHistoryView ? 'History' : 'Dashboard';
    const viewDescription = isHistoryView
        ? 'View your completed maintenance requests'
        : 'Track the status of your active maintenance requests';

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
                image_url,
                technician:assigned_to(full_name, email, department)
            `)
            .eq('created_by', user.id)
            .order('created_at', { ascending: false });
        if (error) throw error;
        return data;
    };

    const { data: tickets = [], mutate, isLoading } = useSWR(
        user ? ['user_tickets', user.id] : null, 
        fetchTickets,
        {
            revalidateOnFocus: false,
            revalidateOnReconnect: true,
            dedupingInterval: 30000, // 30 seconds for better performance
            errorRetryCount: 2,
            errorRetryInterval: 5000,
            refreshInterval: 0,
            suspense: false
        }
    );

    const handleVerification = async (ticketId, isApproved, reason = null) => {
        const previousTickets = [...tickets];
        const updates = {
            status: isApproved ? 'Resolved' : 'In Progress',
            rejection_reason: reason
        };
        const updatedTickets = tickets.map(t => t.id === ticketId ? { ...t, ...updates } : t);

        // Optimistic update
        mutate(updatedTickets, false);

        try {
            // Authorization check: ensure user owns this ticket
            const { data: ticketCheck } = await supabase
                .from('tickets')
                .select('created_by')
                .eq('id', ticketId)
                .single();

            if (!ticketCheck || ticketCheck.created_by !== user.id) {
                throw new Error('Unauthorized: You can only modify your own tickets');
            }

            const { error } = await supabase
                .from('tickets')
                .update(updates)
                .eq('id', ticketId)
                .eq('created_by', user.id); // Double-ensure ownership

            if (error) throw error;

            toast.success(isApproved ? 'Fix confirmed! Ticket completed.' : 'Issue reported. Technician notified.');

            if (!isApproved) {
                setRejectingId(null);
                setRejectionReason('');
            }
            mutate(); // Revalidate
        } catch {
            toast.error('Failed to update status');
            mutate(previousTickets, false); // Rollback
        }
    };

    if (isLoading && !tickets.length) return <Loader variant="user" />;

    // Filter tickets based on view mode
    const filteredTickets = tickets.filter(ticket =>
        isHistoryView
            ? COMPLETED_STATUSES.includes(ticket.status)
            : ACTIVE_STATUSES.includes(ticket.status)
    );

    return (
        <div className="space-y-8">
            <div>
                <h1 className="text-3xl font-bold text-surface-900 tracking-tight">
                    {viewTitle}
                </h1>
                <p className="text-surface-500 mt-2 text-lg">
                    {viewDescription}
                </p>
            </div>

            {filteredTickets.length === 0 ? (
                <Card className="border-dashed border-surface-300 bg-surface-50/50">
                    <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                        <div className="mx-auto h-14 w-14 bg-primary-50 rounded-2xl flex items-center justify-center mb-4">
                            <AlertCircle className="h-7 w-7 text-primary-500" />
                        </div>
                        <h3 className="text-lg font-bold text-surface-900">
                            {isHistoryView ? 'No completed tickets yet' : 'No active tickets'}
                        </h3>
                        <p className="mt-2 text-surface-500 max-w-sm">
                            {isHistoryView
                                ? 'Completed tickets will appear here once they are resolved.'
                                : 'Get started by creating a new maintenance request using the "New Ticket" button.'}
                        </p>
                    </CardContent>
                </Card>
            ) : (
                <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                    {filteredTickets.map((ticket) => {
                        const statusStyle = STATUS_STYLES[ticket.status] ?? STATUS_STYLES['Open'];
                        const StatusIcon = statusStyle.icon;

                        return (
                            <Card key={ticket.id} className="hover:shadow-xl transition-all duration-300 border-surface-200 group">
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
                                        <span className="text-xs font-medium text-surface-400 flex items-center gap-1">
                                            <Calendar className="w-3.5 h-3.5" />
                                            {new Date(ticket.created_at).toLocaleDateString()}
                                        </span>
                                    </div>

                                    <h3 className="text-lg font-bold text-surface-900 mb-2 line-clamp-1 group-hover:text-primary-600 transition-colors">
                                        {ticket.title}
                                    </h3>
                                    <p className="text-sm text-surface-600 mb-6 line-clamp-2 flex-1 leading-relaxed">
                                        {ticket.description}
                                    </p>

                                    <div className="pt-4 border-t border-surface-100 mt-auto space-y-3">
                                        <div className="flex items-center gap-2 text-sm text-surface-500 font-medium">
                                            <MapPin className="w-4 h-4 text-surface-400" />
                                            <span className="truncate">{ticket.facility_type} • {ticket.specific_location}</span>
                                        </div>

                                        {/* Technician Information */}
                                        <div className="flex items-center gap-2 text-sm">
                                            <span className="flex items-center gap-1.5 font-medium text-secondary-700 bg-secondary-50 px-2.5 py-1.5 rounded-lg border border-secondary-200">
                                                <WrenchIcon className="w-3.5 h-3.5" />
                                                {ticket.technician?.full_name || 'Unassigned'}
                                            </span>
                                            {ticket.technician?.department && (
                                                <span className="text-xs text-secondary-600">
                                                    ({ticket.technician.department})
                                                </span>
                                            )}
                                        </div>

                                        {ticket.status === 'Pending Verification' && (
                                            <div className="bg-surface-50 p-4 rounded-xl border border-surface-200 animate-in fade-in zoom-in-95 duration-200">
                                                {rejectingId === ticket.id ? (
                                                    <div className="space-y-3">
                                                        <textarea
                                                            value={rejectionReason}
                                                            onChange={(e) => setRejectionReason(e.target.value)}
                                                            placeholder="Why is the issue not resolved?"
                                                            className="w-full text-sm p-3 rounded-lg border-surface-300 focus:ring-2 focus:ring-rose-500 focus:border-rose-500 bg-white"
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
                                                                className="px-3"
                                                            >
                                                                <X className="w-4 h-4" />
                                                            </Button>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <div className="space-y-3">
                                                        <p className="text-sm font-semibold text-surface-700">Evaluate Fix:</p>
                                                        <div className="flex gap-2">
                                                            <Button
                                                                onClick={() => handleVerification(ticket.id, true)}
                                                                className="bg-emerald-600 hover:bg-emerald-700 flex-1 text-sm h-10"
                                                            >
                                                                <ThumbsUp className="w-4 h-4 mr-2" />
                                                                Confirm Fix
                                                            </Button>
                                                            <Button
                                                                onClick={() => setRejectingId(ticket.id)}
                                                                variant="outline"
                                                                className="text-rose-600 border-rose-200 hover:bg-rose-50 hover:border-rose-300 flex-1 text-sm h-10"
                                                            >
                                                                <ThumbsDown className="w-4 h-4 mr-2" />
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
