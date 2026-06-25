import { useState, useEffect } from 'react';
import useSWR from 'swr';
import { useLocation } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/useAuth';
import { Clock, CheckCircle, AlertCircle, MapPin, Calendar, Activity, ThumbsUp, ThumbsDown, X, Wrench as WrenchIcon, MessageSquare, Star } from 'lucide-react';
import { toast } from 'sonner';
import clsx from 'clsx';
import Loader from '../../components/Loader';
import { Card, CardContent } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import TicketDetails from '../../components/TicketDetails';

const STATUS_STYLES = {
    'Open': { bg: 'bg-amber-50', text: 'text-amber-700', icon: Clock, border: 'border-amber-200' },
    'In Progress': { bg: 'bg-secondary-50', text: 'text-secondary-700', icon: WrenchIcon, border: 'border-secondary-200' },
    'Pending Verification': { bg: 'bg-primary-50', text: 'text-primary-700', icon: Clock, border: 'border-primary-200' },
    'Escalated': { bg: 'bg-rose-50', text: 'text-rose-700', icon: AlertCircle, border: 'border-rose-200' },
    'Resolved': { bg: 'bg-emerald-50', text: 'text-emerald-700', icon: CheckCircle, border: 'border-emerald-200' },
    'Closed': { bg: 'bg-surface-50', text: 'text-surface-700', icon: CheckCircle, border: 'border-surface-200' },
    'Rejected': { bg: 'bg-rose-50', text: 'text-rose-700', icon: AlertCircle, border: 'border-rose-200' },
    // Additional statuses used by the backend but not always shown to users
    'Pending': { bg: 'bg-amber-50', text: 'text-amber-700', icon: Clock, border: 'border-amber-200' },
    'Assigned': { bg: 'bg-primary-50', text: 'text-primary-700', icon: WrenchIcon, border: 'border-primary-200' },
    'Completed': { bg: 'bg-emerald-50', text: 'text-emerald-700', icon: CheckCircle, border: 'border-emerald-200' },
};

const ACTIVE_STATUSES = ['Open', 'Assigned', 'In Progress', 'Escalated', 'Pending Verification'];
const COMPLETED_STATUSES = ['Resolved', 'Closed', 'Rejected'];

export default function UserDashboard() {
    const { user } = useAuth();
    const location = useLocation();
    const [rejectingId, setRejectingId] = useState(null);
    const [rejectionReason, setRejectionReason] = useState('');
    const [rating, setRating] = useState(0);
    const [hoverRating, setHoverRating] = useState(0);
    const [timeframe, setTimeframe] = useState('All Time');

    const isHistoryView = location.pathname === '/history';
    const viewTitle = isHistoryView ? 'History' : 'Dashboard';
    const viewDescription = isHistoryView
        ? 'View your completed and rejected maintenance requests'
        : 'Track the status of your active maintenance requests';

    const [selectedTicket, setSelectedTicket] = useState(null);
    const [modalTab, setModalTab] = useState('details');

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
                created_by,
                assigned_to,
                rejection_reason,
                image_url,
                resolution_proof_url,
                satisfaction_status,
                rating,
                rejection_count,
                customer_feedback,
                technician:assigned_to(full_name, email, department),
                reporter:created_by(full_name, email, department, identification_number)
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
            revalidateOnMount: true,
            revalidateOnReconnect: true,
            dedupingInterval: 30000,
            errorRetryCount: 2,
            errorRetryInterval: 5000,
            refreshInterval: 0,
            suspense: false
        }
    );

    useEffect(() => {
        if (location.state?.refreshTickets) {
            mutate();
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        if (!user) return;
        let timeoutId = null;
        const subscription = supabase
            .channel(`user_tickets_${user.id}`)
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'tickets',
                filter: `created_by=eq.${user.id}`
            }, () => {
                if (timeoutId) clearTimeout(timeoutId);
                timeoutId = setTimeout(() => mutate(), 1000);
            })
            .subscribe();
        return () => {
            if (timeoutId) clearTimeout(timeoutId);
            subscription.unsubscribe();
        };
    }, [user, mutate]);

    const handleVerification = async (ticketId, isApproved, reason = null) => {
        const previousTickets = [...tickets];
        
        // Authorization check first so we can compute rejection_count before building updates
        let ticketCheck;
        try {
            const { data, error: fetchErr } = await supabase
                .from('tickets')
                .select('created_by, rejection_count')
                .eq('id', ticketId)
                .single();
            if (fetchErr || !data || data.created_by !== user.id) {
                toast.error('Unauthorized: You can only modify your own tickets');
                return;
            }
            ticketCheck = data;
        } catch {
            toast.error('Failed to verify ticket ownership');
            return;
        }

        const newRejectionCount = !isApproved ? (ticketCheck.rejection_count || 0) + 1 : ticketCheck.rejection_count;

        const updates = {
            satisfaction_status: isApproved ? 'satisfied' : 'unsatisfied',
            rating: isApproved && rating > 0 ? rating : null,
            customer_feedback: reason,
            status: isApproved ? 'Resolved' : 'In Progress',
            ...(!isApproved && { rejection_count: newRejectionCount }),
        };

        const updatedTickets = tickets.map(t => t.id === ticketId ? { ...t, ...updates } : t);

        // Optimistic update
        mutate(updatedTickets, false);

        try {
            const { error } = await supabase
                .from('tickets')
                .update(updates)
                .eq('id', ticketId)
                .eq('created_by', user.id);

            if (error) throw error;

            if (isApproved) {
                toast.success('Fix confirmed! Thank you for your feedback.');
            } else {
                if (newRejectionCount >= 2) {
                    toast.warning('Issue reported. This ticket will be escalated to SRC for immediate intervention.', {
                        duration: 5000
                    });
                } else {
                    toast.info('Issue reported. Technician will rework. You have 1 more rework request before escalation.', {
                        duration: 4000
                    });
                }
            }

            // Reset form states
            if (!isApproved) {
                setRejectingId(null);
                setRejectionReason('');
            }
            setRating(0);
            setHoverRating(0);
            mutate(); // Revalidate
        } catch (err) {
            toast.error(err.message || 'Failed to update status');
            mutate(previousTickets, false); // Rollback
        }
    };

    if (isLoading && !tickets.length) return <Loader variant="user" />;

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

    // Filter tickets based on view mode and timeframe
    const filteredTickets = tickets.filter(ticket => {
        const matchesView = isHistoryView
            ? COMPLETED_STATUSES.includes(ticket.status)
            : ACTIVE_STATUSES.includes(ticket.status);
            
        return matchesView && isWithinTimeframe(ticket.created_at, timeframe);
    });

    return (
        <div className="space-y-8">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-surface-900 tracking-tight">
                        {viewTitle}
                    </h1>
                    <p className="text-surface-500 mt-2 text-lg">
                        {viewDescription}
                    </p>
                </div>
                
                {/* Timeframe Filter */}
                <div className="flex items-center gap-3 bg-white p-3 rounded-2xl border border-surface-200 shadow-sm hover:shadow-md transition-shadow">
                    <div className="bg-surface-50 p-2 rounded-xl border border-surface-100">
                        <Clock className="w-5 h-5 text-surface-500" />
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
            </div>

            {filteredTickets.length === 0 ? (
                <Card className="border-dashed border-surface-300 bg-surface-50/50">
                    <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                        <div className="mx-auto h-14 w-14 bg-primary-50 rounded-2xl flex items-center justify-center mb-4">
                            <AlertCircle className="h-7 w-7 text-primary-500" />
                        </div>
                        <h3 className="text-lg font-bold text-surface-900">
                            {isHistoryView ? 'No completed or rejected tickets yet' : 'No active tickets'}
                        </h3>
                        <p className="mt-2 text-surface-500 max-w-sm">
                            {isHistoryView
                                ? 'Resolved and rejected tickets will appear here.'
                                : 'Get started by creating a new maintenance request using the "New Ticket" button.'}
                        </p>
                    </CardContent>
                </Card>
            ) : (
                <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                    {filteredTickets.map((ticket) => {
                        // Show 'Rejected' status for closed tickets with 'Invalid complaint' reason
                        const isRejected = ticket.status === 'Closed' && ticket.rejection_reason?.includes('Invalid complaint');
                        const displayStatus = isRejected ? 'Rejected' : ticket.status;
                        const statusStyle = STATUS_STYLES[displayStatus] ?? STATUS_STYLES['Open'];
                        const StatusIcon = statusStyle.icon;

                        return (
                            <Card key={ticket.id} className="hover:shadow-xl transition-all duration-300 border-surface-200 group cursor-pointer" onClick={() => { setSelectedTicket(ticket); setModalTab('details'); }}>
                                <CardContent className="p-6 h-full flex flex-col">
                                    <div className="flex justify-between items-start mb-4">
                                        <span className={clsx(
                                            'px-3 py-1 text-xs font-semibold rounded-full flex items-center gap-1.5 border',
                                            statusStyle.bg,
                                            statusStyle.text,
                                            statusStyle.border
                                        )}>
                                            <StatusIcon className="w-3.5 h-3.5" />
                                            {displayStatus}
                                        </span>
                                        <span className="text-xs font-medium text-surface-400 flex items-center gap-1">
                                            <Calendar className="w-3.5 h-3.5" />
                                            {new Date(ticket.created_at).toLocaleDateString()}
                                        </span>
                                    </div>

                                    <h3 className="text-lg font-bold text-surface-900 mb-2 line-clamp-1 group-hover:text-primary-600 transition-colors">
                                        {ticket.title}
                                    </h3>
                                    <p className="text-sm text-surface-600 mb-4 line-clamp-2 flex-1 leading-relaxed">
                                        {ticket.description}
                                    </p>

                                    {/* Chat Button */}
                                    <button
                                        onClick={(e) => { e.stopPropagation(); setSelectedTicket(ticket); setModalTab('chat'); }}
                                        className="flex items-center gap-2 text-sm text-primary-600 hover:text-primary-700 font-medium mb-2"
                                    >
                                        <MessageSquare className="w-4 h-4" />
                                        Open Chat
                                    </button>

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
                                                {ticket.resolution_proof_url && (
                                                    <div className="mb-4">
                                                        <span className="text-sm font-semibold text-slate-700 block mb-2">Technician's Proof of Fix:</span>
                                                        <a href={ticket.resolution_proof_url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>
                                                            <img 
                                                                src={ticket.resolution_proof_url} 
                                                                alt="Proof of Fix" 
                                                                className="max-h-48 rounded-lg shadow-sm border border-slate-200 hover:opacity-90 transition-opacity"
                                                            />
                                                        </a>
                                                    </div>
                                                )}
                                                {rejectingId === ticket.id ? (
                                                    <div className="space-y-3">
                                                        <div className="flex items-center gap-2 text-rose-600 mb-2">
                                                            <ThumbsDown className="w-4 h-4" />
                                                            <span className="text-sm font-semibold">Report Unsatisfactory Work</span>
                                                        </div>
                                                        <textarea
                                                            value={rejectionReason}
                                                            onChange={(e) => setRejectionReason(e.target.value)}
                                                            onClick={(e) => e.stopPropagation()}
                                                            placeholder="Please describe what was not resolved or needs improvement..."
                                                            className="w-full text-sm p-3 rounded-lg border-surface-300 focus:ring-2 focus:ring-rose-500 focus:border-rose-500 bg-white"
                                                            rows={3}
                                                            autoFocus
                                                        />
                                                        {ticket.rejection_count > 0 && (
                                                            <p className="text-xs text-amber-600 bg-amber-50 p-2 rounded">
                                                                ⚠️ Previous rejection count: {ticket.rejection_count}. 
                                                                {ticket.rejection_count >= 1 && ' Multiple rejections may trigger escalation.'}
                                                            </p>
                                                        )}
                                                        <div className="flex gap-2">
                                                            <Button
                                                                size="sm"
                                                                onClick={(e) => { e.stopPropagation(); handleVerification(ticket.id, false, rejectionReason); }}
                                                                className="bg-rose-600 hover:bg-rose-700 text-white flex-1"
                                                                disabled={!rejectionReason.trim()}
                                                            >
                                                                Submit Report
                                                            </Button>
                                                            <Button
                                                                size="sm"
                                                                variant="outline"
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
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
                                                    <div className="space-y-4">
                                                        <div className="text-center">
                                                            <p className="text-sm font-semibold text-surface-700 mb-2">Rate the technician's work:</p>
                                                            {/* Star Rating Component */}
                                                            <div className="flex justify-center gap-1">
                                                                {[1, 2, 3, 4, 5].map((star) => (
                                                                    <button
                                                                        key={star}
                                                                        onClick={(e) => { e.stopPropagation(); setRating(star); }}
                                                                        onMouseEnter={() => setHoverRating(star)}
                                                                        onMouseLeave={() => setHoverRating(0)}
                                                                        className="p-1 transition-all duration-150 hover:scale-110 focus:outline-none"
                                                                        type="button"
                                                                    >
                                                                        <Star
                                                                            className={`w-8 h-8 ${
                                                                                star <= (hoverRating || rating)
                                                                                    ? 'fill-amber-400 text-amber-400'
                                                                                    : 'text-surface-300'
                                                                            }`}
                                                                        />
                                                                    </button>
                                                                ))}
                                                            </div>
                                                            <p className="text-xs text-surface-500 mt-1">
                                                                {rating > 0 ? (
                                                                    rating >= 4 ? 'Excellent!' : 
                                                                    rating >= 3 ? 'Good' : 
                                                                    rating >= 2 ? 'Fair' : 'Poor'
                                                                ) : 'Click a star to rate'}
                                                            </p>
                                                        </div>
                                                        
                                                        <div className="flex gap-2">
                                                            <Button
                                                                onClick={(e) => { e.stopPropagation(); handleVerification(ticket.id, true); }}
                                                                className="bg-emerald-600 hover:bg-emerald-700 flex-1 text-sm h-10"
                                                                disabled={rating === 0}
                                                            >
                                                                <ThumbsUp className="w-4 h-4 mr-2" />
                                                                {rating >= 4 ? 'Excellent Work!' : 'Confirm Fix'}
                                                            </Button>
                                                            <Button
                                                                onClick={(e) => { e.stopPropagation(); setRejectingId(ticket.id); }}
                                                                variant="outline"
                                                                className="text-rose-600 border-rose-200 hover:bg-rose-50 hover:border-rose-300 flex-1 text-sm h-10"
                                                            >
                                                                <ThumbsDown className="w-4 h-4 mr-2" />
                                                                Needs Rework
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

            {/* Ticket Details Modal with Chat */}
            {selectedTicket && (
                <TicketDetails
                    ticket={selectedTicket}
                    initialTab={modalTab}
                    onClose={() => setSelectedTicket(null)}
                    onUpdate={() => {
                        setSelectedTicket(null);
                        mutate();
                    }}
                />
            )}
        </div>
    );
}
