import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/useAuth';
import { Bot, CheckCircle, MapPin, AlertTriangle, Play, CheckSquare, Clock, User, Plus, MessageSquare, Eye, Star, TrendingUp, Award, Wrench as WrenchIcon } from 'lucide-react';
import clsx from 'clsx';
import Loader from '../../components/Loader';
import { toast } from 'sonner';
import { Button } from '../../components/ui/Button';
import { Card, CardContent } from '../../components/ui/Card';
import TicketDetails from '../../components/TicketDetails';

import useSWR from 'swr';

export default function TechnicianDashboard() {
    const { user, profile } = useAuth();
    const isPorter = profile?.role === 'porter';
    const isTechnician = profile?.role === 'technician';
    const isSRC = profile?.role === 'src';
    const isStaff = profile?.role === 'staff';
    const userDepartment = profile?.department;
    // Staff verify tickets in their department, SRC verifies all, Porters verify hostel
    const canVerify = isPorter || isSRC || isStaff;
    const [aiSuggestion, setAiSuggestion] = useState({ ticketId: null, data: null, loading: false });
    const [selectedTicket, setSelectedTicket] = useState(null);
    const [activeTab, setActiveTab] = useState('assigned'); // 'assigned' | 'reported'
    
    // Satisfaction metrics state for technicians
    const [satisfactionMetrics, setSatisfactionMetrics] = useState(null);
    const [showMetrics, setShowMetrics] = useState(false);

    // SWR Fetcher - Only fetch necessary fields
    // Porters see Open hostel tickets pending verification, Technicians see their assigned jobs
    const fetchJobs = async () => {
        let query = supabase
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
                assigned_to,
                image_url,
                reporter:created_by(full_name, email, department)
            `);

        if (isPorter) {
            // Porters see Open hostel tickets that need verification
            query = query
                .eq('facility_type', 'Hostel')
                .eq('status', 'Open');
        } else if (isSRC) {
            // SRC sees ALL Open tickets school-wide that need verification
            query = query
                .eq('status', 'Open');
        } else if (isStaff && userDepartment) {
            // Staff see Open tickets in their department that need verification
            query = query
                .eq('department', userDepartment)
                .eq('status', 'Open');
        } else {
            // Technicians see their assigned non-resolved tickets
            query = query
                .eq('assigned_to', user.id)
                .neq('status', 'Resolved');
        }

        const { data, error } = await query.order('priority', { ascending: false });
        if (error) throw error;
        return data;
    };

    // Fetch tickets that the current user has reported (for staff/technicians/porters who also report issues)
    const fetchReportedTickets = async () => {
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
                assigned_to,
                image_url,
                technician:assigned_to(full_name, email, department)
            `)
            .eq('created_by', user.id)
            .order('created_at', { ascending: false });
        if (error) throw error;
        return data;
    };

    // Use SWR
    // Use different cache key for each role
    const getSWRKey = () => {
        if (!user) return null;
        if (isPorter) return ['porter_verifications', user.id];
        if (isSRC) return ['src_verifications', user.id];
        if (isStaff) return ['staff_verifications', userDepartment, user.id];
        return ['technician_jobs', user.id];
    };
    const swrKey = getSWRKey();
    const { data: jobs = [], mutate, isLoading } = useSWR(
        swrKey,
        fetchJobs,
        {
            revalidateOnFocus: false,
            revalidateOnReconnect: true,
            dedupingInterval: 30000,
            errorRetryCount: 2,
            errorRetryInterval: 5000,
            refreshInterval: 0,
            suspense: false
        }
    );

    // Fetch reported tickets for staff/technicians/porters
    const { data: reportedTickets = [] } = useSWR(
        user ? ['reported_tickets', user.id] : null,
        fetchReportedTickets,
        {
            revalidateOnFocus: false,
            revalidateOnReconnect: true,
            dedupingInterval: 30000,
            errorRetryCount: 2,
            errorRetryInterval: 5000,
            refreshInterval: 0,
            suspense: false
        }
    );

    const displayedJobs = activeTab === 'assigned' ? jobs : reportedTickets;

    useEffect(() => {
        if (!user) return;

        // Use different channel and filter for each role
        let channelName;
        let filter;

        if (isPorter) {
            channelName = 'porter_verifications';
            filter = `facility_type=eq.Hostel`; // Porters listen to hostel tickets
        } else if (isSRC) {
            channelName = 'src_verifications';
            filter = undefined; // SRC listens to ALL tickets (no filter)
        } else if (isStaff && userDepartment) {
            channelName = 'staff_verifications';
            filter = `department=eq.${userDepartment}`; // Staff listen to their department tickets
        } else {
            channelName = 'technician_jobs';
            filter = `assigned_to=eq.${user.id}`; // Technicians listen to their assigned tickets
        }

        const subscription = supabase
            .channel(channelName)
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'tickets',
                filter: filter
            }, () => {
                // Debounce rapid mutations
                const timeoutId = setTimeout(() => {
                    mutate();
                    toast.info('List updated');
                }, 1000);

                return () => clearTimeout(timeoutId);
            })
            .subscribe();

        return () => {
            subscription.unsubscribe();
        };
    }, [user, mutate, isPorter, isSRC, isStaff, userDepartment]);

    // Fetch satisfaction metrics for technicians
    useEffect(() => {
        if (!user || !isTechnician) return;

        const fetchMetrics = async () => {
            try {
                const { data, error } = await supabase
                    .rpc('get_technician_satisfaction_metrics', {
                        p_technician_id: user.id
                    });
                
                if (error) throw error;
                setSatisfactionMetrics(data?.[0] || null);
            } catch {
                // Silently fail - metrics are optional
            }
        };

        fetchMetrics();
    }, [user, isTechnician]);

    const handleStatusUpdate = async (ticketId, newStatus) => {
        const previousJobs = [...jobs];
        const updatedJobs = jobs.map(j => j.id === ticketId ? { ...j, status: newStatus } : j);

        // Optimistic update
        mutate(updatedJobs, false);

        try {
            const { error } = await supabase
                .from('tickets')
                .update({ status: newStatus })
                .eq('id', ticketId);

            if (error) throw error;

            // Trigger Email Notification on Completion
            if (newStatus === 'Resolved') {
                const job = jobs.find(j => j.id === ticketId);
                if (job?.reporter?.email) {
                    await supabase.functions.invoke('send-email', {
                        body: {
                            type: 'ticket_completed',
                            ticket_title: job.title,
                            student_email: job.reporter.email
                        }
                    });
                }
            }

            toast.success(`Ticket marked as ${newStatus}`);
            mutate(); // Revalidate to ensure consistency
        } catch {
            toast.error('Failed to update status');
            mutate(previousJobs, false); // Rollback
        }
    };

    // Verify complaint - Porter, SRC, or Staff validates a student complaint
    const handleVerifyComplaint = async (ticketId, isValid) => {
        if (!canVerify) return;

        // Determine verifier name based on role
        let verifierName;
        if (isPorter) verifierName = 'porter';
        else if (isSRC) verifierName = 'SRC';
        else if (isStaff) verifierName = `staff (${userDepartment})`;
        else verifierName = 'verifier';

        const previousJobs = [...jobs];
        // Remove verified ticket from list (it will disappear from verifier's view)
        const updatedJobs = jobs.filter(j => j.id !== ticketId);

        // Optimistic update
        mutate(updatedJobs, false);

        try {
            // Get the ticket to find the student who created it
            const { data: ticket, error: fetchError } = await supabase
                .from('tickets')
                .select('id, title, created_by')
                .eq('id', ticketId)
                .single();

            if (fetchError) throw fetchError;

            if (isValid) {
                // Valid complaint - mark as In Progress (ready for technician assignment)
                const { error } = await supabase
                    .from('tickets')
                    .update({
                        status: 'In Progress',
                        updated_at: new Date().toISOString(),
                        rejection_reason: `Verified by ${verifierName} - ready for technician assignment`
                    })
                    .eq('id', ticketId);

                if (error) throw error;

                // Notify the student that their ticket was approved
                if (ticket?.created_by) {
                    await supabase
                        .from('notifications')
                        .insert({
                            user_id: ticket.created_by,
                            ticket_id: ticketId,
                            message: `Your ticket "${ticket.title}" was verified by ${verifierName.toUpperCase()} and is now being assigned to a technician.`
                        });
                }

                toast.success(`Complaint verified by ${verifierName.toUpperCase()} - technician will be assigned`);
            } else {
                // Invalid complaint - close/reject the ticket
                const { error } = await supabase
                    .from('tickets')
                    .update({
                        status: 'Closed',
                        updated_at: new Date().toISOString(),
                        rejection_reason: `Invalid complaint - verified by ${verifierName}`
                    })
                    .eq('id', ticketId);

                if (error) throw error;

                // Notify the student that their ticket was rejected
                if (ticket?.created_by) {
                    await supabase
                        .from('notifications')
                        .insert({
                            user_id: ticket.created_by,
                            ticket_id: ticketId,
                            message: `Your ticket "${ticket.title}" was rejected by ${verifierName.toUpperCase()}. Reason: Invalid complaint.`
                        });
                }

                toast.success(`Invalid complaint rejected by ${verifierName.toUpperCase()}`);
            }
            mutate(); // Revalidate
        } catch {
            toast.error('Failed to verify complaint');
            mutate(previousJobs, false); // Rollback
        }
    };

    const getAiHelp = async (ticket) => {
        if (aiSuggestion.ticketId === ticket.id && aiSuggestion.data) {
            setAiSuggestion({ ticketId: null, data: null, loading: false }); // Toggle off
            return;
        }

        setAiSuggestion({ ticketId: ticket.id, data: null, loading: true });
        try {
            // Securely Call Supabase Edge Function
            const { data, error } = await supabase.functions.invoke('suggest-fix', {
                body: {
                    ticketDescription: ticket.description,
                    ticketCategory: ticket.category
                }
            });

            if (error) throw error;

            // Store structured data for rendering
            let suggestionData = null;
            if (data.technical_diagnosis && data.tools_required && data.safety_precaution) {
                suggestionData = {
                    technical_diagnosis: data.technical_diagnosis,
                    tools_required: data.tools_required,
                    safety_precaution: data.safety_precaution
                };
            } else if (data.error) {
                suggestionData = { error: data.error };
            } else {
                suggestionData = { error: 'AI response format error. Please try again.' };
            }

            setAiSuggestion({
                ticketId: ticket.id,
                data: suggestionData,
                loading: false
            });
        } catch {
            toast.error('Could not get AI suggestion');
            setAiSuggestion({
                ticketId: ticket.id,
                data: { error: 'Failed to access AI service. Please try again.' },
                loading: false
            });
        }
    };

    if (isLoading && !jobs.length && !reportedTickets.length) return <Loader variant="technician" />;

    const hasReportedTickets = reportedTickets.length > 0;

    return (
        <div className="space-y-8">
            <div>
                <h1 className="text-3xl font-bold text-surface-900 tracking-tight">
                    {activeTab === 'assigned'
                        ? (canVerify
                            ? (isPorter
                                ? 'Verify Hostel Complaints'
                                : isStaff
                                    ? `Verify ${userDepartment} Complaints`
                                    : 'Verify Student Complaints')
                            : 'Assigned Jobs')
                        : 'My Reported Tickets'}
                </h1>
                <p className="text-surface-500 mt-2 text-lg">
                    {activeTab === 'assigned'
                        ? (canVerify
                            ? (isPorter
                                ? 'Validate hostel complaints before technician assignment'
                                : isStaff
                                    ? `Validate ${userDepartment} complaints before technician assignment`
                                    : 'Validate all student complaints school-wide before technician assignment')
                            : 'Manage and resolve your maintenance tasks')
                        : 'Track tickets you have reported and chat with assigned technicians'}
                </p>
            </div>

            {/* Satisfaction Metrics - Only for technicians with completed jobs */}
            {isTechnician && satisfactionMetrics && satisfactionMetrics.total_completed > 0 && (
                <div className="bg-gradient-to-r from-primary-50 to-secondary-50 rounded-2xl p-6 border border-primary-100">
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-2">
                            <Award className="w-5 h-5 text-primary-600" />
                            <h3 className="text-lg font-bold text-surface-900">Performance Metrics</h3>
                        </div>
                        <button
                            onClick={() => setShowMetrics(!showMetrics)}
                            className="text-sm text-primary-600 hover:text-primary-700 font-medium"
                        >
                            {showMetrics ? 'Hide Details' : 'View Details'}
                        </button>
                    </div>
                    
                    <div className="grid grid-cols-3 gap-4">
                        <div className="text-center p-3 bg-white rounded-xl border border-primary-100">
                            <div className="text-3xl font-bold text-primary-600">
                                {satisfactionMetrics.avg_rating || '-'}
                            </div>
                            <div className="flex justify-center gap-0.5 my-1">
                                {[1, 2, 3, 4, 5].map((star) => (
                                    <Star
                                        key={star}
                                        className={`w-4 h-4 ${
                                            star <= Math.round(satisfactionMetrics.avg_rating || 0)
                                                ? 'fill-amber-400 text-amber-400'
                                                : 'text-surface-300'
                                        }`}
                                    />
                                ))}
                            </div>
                            <p className="text-xs text-surface-500">Average Rating</p>
                        </div>
                        
                        <div className="text-center p-3 bg-white rounded-xl border border-primary-100">
                            <div className="text-3xl font-bold text-emerald-600">
                                {satisfactionMetrics.satisfaction_rate || 0}%
                            </div>
                            <div className="flex items-center justify-center gap-1 mt-1">
                                <TrendingUp className="w-4 h-4 text-emerald-500" />
                            </div>
                            <p className="text-xs text-surface-500">Satisfaction Rate</p>
                        </div>
                        
                        <div className="text-center p-3 bg-white rounded-xl border border-primary-100">
                            <div className="text-3xl font-bold text-secondary-600">
                                {satisfactionMetrics.total_completed}
                            </div>
                            <p className="text-xs text-surface-500 mt-1">Completed Jobs</p>
                        </div>
                    </div>
                    
                    {/* Expanded Metrics */}
                    {showMetrics && (
                        <div className="mt-4 pt-4 border-t border-primary-100 grid grid-cols-5 gap-2">
                            <div className="text-center">
                                <div className="flex items-center justify-center gap-1">
                                    <Star className="w-4 h-4 fill-amber-400 text-amber-400" />
                                    <span className="text-lg font-bold text-surface-700">{satisfactionMetrics.rating_5_count}</span>
                                </div>
                                <p className="text-xs text-surface-500">5-Star</p>
                            </div>
                            <div className="text-center">
                                <div className="flex items-center justify-center gap-1">
                                    <Star className="w-4 h-4 fill-amber-300 text-amber-300" />
                                    <span className="text-lg font-bold text-surface-700">{satisfactionMetrics.rating_4_count}</span>
                                </div>
                                <p className="text-xs text-surface-500">4-Star</p>
                            </div>
                            <div className="text-center">
                                <div className="flex items-center justify-center gap-1">
                                    <Star className="w-4 h-4 fill-yellow-300 text-yellow-300" />
                                    <span className="text-lg font-bold text-surface-700">{satisfactionMetrics.rating_3_count}</span>
                                </div>
                                <p className="text-xs text-surface-500">3-Star</p>
                            </div>
                            <div className="text-center">
                                <div className="flex items-center justify-center gap-1">
                                    <Star className="w-4 h-4 fill-orange-300 text-orange-300" />
                                    <span className="text-lg font-bold text-surface-700">{satisfactionMetrics.rating_2_count}</span>
                                </div>
                                <p className="text-xs text-surface-500">2-Star</p>
                            </div>
                            <div className="text-center">
                                <div className="flex items-center justify-center gap-1">
                                    <Star className="w-4 h-4 fill-rose-300 text-rose-300" />
                                    <span className="text-lg font-bold text-surface-700">{satisfactionMetrics.rating_1_count}</span>
                                </div>
                                <p className="text-xs text-surface-500">1-Star</p>
                            </div>
                        </div>
                    )}
                    
                    {satisfactionMetrics.total_rejections > 0 && (
                        <div className="mt-4 p-3 bg-amber-50 rounded-lg border border-amber-200 flex items-center gap-2">
                            <AlertTriangle className="w-4 h-4 text-amber-600" />
                            <p className="text-sm text-amber-700">
                                Total reworks needed: <span className="font-bold">{satisfactionMetrics.total_rejections}</span>
                            </p>
                        </div>
                    )}
                </div>
            )}

            {/* Tab Navigation - Show only if user has reported tickets */}
            {hasReportedTickets && (
                <div className="flex items-center gap-1 bg-surface-100 p-1.5 rounded-2xl w-fit">
                    <button
                        onClick={() => setActiveTab('assigned')}
                        className={`px-5 py-2.5 rounded-xl font-semibold transition-all duration-200 ${
                            activeTab === 'assigned'
                                ? 'bg-primary-500 text-white shadow-lg shadow-primary-500/25'
                                : 'text-surface-600 hover:bg-white hover:shadow-sm'
                        }`}
                    >
                        {canVerify ? 'To Verify' : 'My Jobs'}
                    </button>
                    <button
                        onClick={() => setActiveTab('reported')}
                        className={`px-5 py-2.5 rounded-xl font-semibold transition-all duration-200 ${
                            activeTab === 'reported'
                                ? 'bg-primary-500 text-white shadow-lg shadow-primary-500/25'
                                : 'text-surface-600 hover:bg-white hover:shadow-sm'
                        }`}
                    >
                        My Reports ({reportedTickets.length})
                    </button>
                </div>
            )}

            <div className="space-y-6">
                {displayedJobs.map((job) => (
                    <Card key={job.id} className="hover:shadow-lg transition-all duration-300 border-surface-200 group cursor-pointer" onClick={() => setSelectedTicket(job)}>
                        <CardContent className="p-6">
                            <div className="flex flex-col md:flex-row justify-between items-start gap-6">
                                <div className="flex-1 space-y-4">
                                    <div className="flex items-center gap-3 flex-wrap">
                                        <span className={clsx(
                                            'px-3 py-1.5 text-xs font-bold rounded-full flex items-center gap-1.5 uppercase tracking-wide border',
                                            job.priority === 'High'
                                                ? 'bg-rose-50 text-rose-700 border-rose-200'
                                                : 'bg-surface-50 text-surface-700 border-surface-200'
                                        )}>
                                            {job.priority === 'High' && <AlertTriangle className="w-3 h-3" />}
                                            {job.priority} Priority
                                        </span>
                                        <span className="text-xs font-semibold text-surface-500 bg-primary-50 px-2.5 py-1.5 rounded-lg border border-primary-100">
                                            {job.category}
                                        </span>
                                        {/* Show pending verification badge to verifiers */}
                                        {canVerify && job.status === 'Open' && (
                                            <span className="text-xs font-semibold text-amber-700 bg-amber-50 px-2.5 py-1.5 rounded-lg border border-amber-200 animate-pulse">
                                                {isPorter ? 'Hostel - Pending Verification' : 'Pending Verification'}
                                            </span>
                                        )}
                                    </div>

                                    <div>
                                        <h3 className="text-xl font-bold text-surface-900 group-hover:text-primary-600 transition-colors">{job.title}</h3>
                                        <p className="text-surface-600 mt-2 leading-relaxed">{job.description}</p>
                                    </div>

                                    <div className="inline-flex items-center gap-2 text-sm text-surface-500 font-medium bg-surface-50 px-3 py-1.5 rounded-xl border border-surface-200">
                                        <MapPin className="w-4 h-4 text-surface-400" />
                                        <span>{job.facility_type} • {job.specific_location}</span>
                                    </div>

                                    {/* Reporter Information (only show for assigned jobs, not my reported tickets) */}
                                    {activeTab === 'assigned' && (
                                        <div className="inline-flex items-center gap-2 text-sm text-primary-700 font-medium bg-primary-50 px-3 py-1.5 rounded-xl border border-primary-100">
                                            <User className="w-4 h-4 text-primary-500" />
                                            <span>{job.reporter?.full_name || 'Unknown Reporter'}</span>
                                            {job.reporter?.department && (
                                                <span className="text-primary-500 text-xs">
                                                    ({job.reporter.department})
                                                </span>
                                            )}
                                        </div>
                                    )}

                                    {/* Technician Information (show for reported tickets) */}
                                    {activeTab === 'reported' && (
                                        <div className="flex items-center gap-2 text-sm">
                                            <span className="flex items-center gap-1.5 font-medium text-secondary-700 bg-secondary-50 px-2.5 py-1.5 rounded-lg border border-secondary-200">
                                                <WrenchIcon className="w-3.5 h-3.5" />
                                                {job.technician?.full_name || 'Unassigned'}
                                            </span>
                                            {job.technician?.department && (
                                                <span className="text-xs text-secondary-600">
                                                    ({job.technician.department})
                                                </span>
                                            )}
                                        </div>
                                    )}
                                </div>

                                <div className="flex flex-col gap-3 w-full md:w-auto min-w-[160px]">
                                    {/* View Details & Chat Button */}
                                    <Button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setSelectedTicket(job);
                                        }}
                                        variant="outline"
                                        className="w-full"
                                    >
                                        <Eye className="w-4 h-4 mr-2" />
                                        View Details
                                    </Button>

                                    {/* Chat Button */}
                                    <Button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setSelectedTicket(job);
                                        }}
                                        variant="outline"
                                        className="w-full border-primary-200 text-primary-700 hover:bg-primary-50"
                                    >
                                        <MessageSquare className="w-4 h-4 mr-2" />
                                        Chat with Reporter
                                    </Button>

                                    {/* Verification buttons - show for porters (hostel only) and SRC (all tickets) */}
                                    {canVerify && job.status === 'Open' && (
                                        <>
                                            <Button
                                                onClick={() => handleVerifyComplaint(job.id, true)}
                                                className="bg-emerald-600 hover:bg-emerald-700 w-full"
                                            >
                                                <CheckCircle className="w-4 h-4 mr-2" />
                                                Verify - Valid
                                            </Button>
                                            <Button
                                                onClick={() => handleVerifyComplaint(job.id, false)}
                                                variant="outline"
                                                className="border-rose-300 text-rose-700 hover:bg-rose-50 w-full"
                                            >
                                                <AlertTriangle className="w-4 h-4 mr-2" />
                                                Invalid / Reject
                                            </Button>
                                        </>
                                    )}

                                    {/* Technician buttons - only for technicians */}
                                    {isTechnician && (job.status === 'Open' || job.status === 'Assigned' || job.status === 'Pending') && (
                                        <Button
                                            onClick={() => handleStatusUpdate(job.id, 'In Progress')}
                                            className="bg-blue-600 hover:bg-blue-700 w-full"
                                        >
                                            <Play className="w-4 h-4 mr-2" />
                                            Start Job
                                        </Button>
                                    )}

                                    {job.status === 'In Progress' && (
                                        <Button
                                            onClick={() => {
                                                handleStatusUpdate(job.id, 'Pending Verification');
                                                toast.success('Job submitted for verification');
                                            }}
                                            className="bg-emerald-600 hover:bg-emerald-700 w-full"
                                        >
                                            <CheckSquare className="w-4 h-4 mr-2" />
                                            Mark Done
                                        </Button>
                                    )}

                                    {job.status === 'Pending Verification' && (
                                        <div className="flex items-center justify-center p-2 bg-amber-50 text-amber-700 rounded-lg border border-amber-100 font-medium text-sm">
                                            <Clock className="w-4 h-4 mr-2" />
                                            Verifying...
                                        </div>
                                    )}

                                    {(job.status === 'Completed' || job.status === 'Resolved') && (
                                        <div className="flex items-center justify-center p-2 bg-emerald-50 text-emerald-700 rounded-lg border border-emerald-100 font-medium">
                                            <CheckCircle className="w-5 h-5 mr-2" />
                                            Completed
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="mt-6 pt-6 border-t border-surface-100">
                                <button
                                    onClick={() => getAiHelp(job)}
                                    className="flex items-center gap-2 text-primary-600 text-sm font-bold hover:text-primary-700 transition-colors group/ai"
                                >
                                    <div className="p-1.5 bg-primary-50 rounded-lg group-hover/ai:bg-primary-100 transition-colors">
                                        <Bot className="w-4 h-4" />
                                    </div>
                                    {aiSuggestion.ticketId === job.id ? 'Close AI Suggestion' : 'Ask AI for Repair Guide'}
                                </button>

                                {aiSuggestion.ticketId === job.id && (
                                    <div className="mt-4 p-5 bg-primary-50/30 rounded-xl border border-primary-100 text-sm text-surface-900 shadow-sm animate-in fade-in slide-in-from-top-2">
                                        {aiSuggestion.loading ? (
                                            <div className="flex items-center gap-3">
                                                <div className="animate-spin rounded-full h-4 w-4 border-2 border-primary-600 border-t-transparent"></div>
                                                <span className="font-medium">Analyzing ticket details...</span>
                                            </div>
                                        ) : aiSuggestion.data?.error ? (
                                            <div className="text-rose-600 font-medium">
                                                Error: {aiSuggestion.data.error}
                                            </div>
                                        ) : (
                                            <div className="space-y-4">
                                                <div>
                                                    <h3 className="font-semibold text-surface-900 mb-2 flex items-center gap-2">
                                                        <svg className="w-4 h-4 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9.75 17L9 20l-1 1h8l-1-1v-7.686a3 3 0 1 0-5.828 0M4.75 12a3.25 3.25 0 1 0 6.5 0 3.25 3.25 0 0 0-6.5 0M12 17.25h.008"></path>
                                                        </svg>
                                                        Technical Diagnosis
                                                    </h3>
                                                    <p className="text-surface-700 leading-relaxed bg-primary-50 p-3 rounded-lg border border-primary-100">
                                                        {aiSuggestion.data?.technical_diagnosis}
                                                    </p>
                                                </div>
                                                
                                                <div>
                                                    <h3 className="font-semibold text-surface-900 mb-2 flex items-center gap-2">
                                                        <svg className="w-4 h-4 text-secondary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14.121 14.121L19 19m-7-7l-7 7m-7-7l7 7m6.5-3.5a2.121 2.121 0 0 1 3 3L12 15l3-3m6.5-3.5a2.121 2.121 0 0 1 3 3L12 15l3-3"></path>
                                                        </svg>
                                                        Tools Required
                                                    </h3>
                                                    <ul className="space-y-1 bg-secondary-50 p-3 rounded-lg border border-secondary-100">
                                                        {(aiSuggestion.data?.tools_required || []).map((tool, i) => (
                                                            <li key={i} className="flex items-center gap-2 text-surface-700">
                                                                <span className="w-2 h-2 bg-secondary-500 rounded-full"></span>
                                                                {tool}
                                                            </li>
                                                        ))}
                                                    </ul>
                                                </div>
                                                
                                                <div>
                                                    <h3 className="font-semibold text-surface-900 mb-2 flex items-center gap-2">
                                                        <svg className="w-4 h-4 text-rose-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 2.502-3.181V8c0-1.51-1.963-2.58-3.181-2.581A2.25 2.25 0 0 0 11.938 6H8.062a2.25 2.25 0 0 0-2.181 2.419C5.62 8.62 4 9.629 4 11v2.5c0 1.514 1.962 2.58 3.181 2.581h5.876c1.54 0 2.502-1.667 2.502-3.181Z"></path>
                                                        </svg>
                                                        Safety Precaution
                                                    </h3>
                                                    <div className="bg-rose-50 border border-rose-200 text-rose-800 p-3 rounded-lg font-medium">
                                                        {aiSuggestion.data?.safety_precaution}
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </CardContent>
                    </Card>
                ))}

            {/* Ticket Details Modal with Chat */}
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
                        toast.success('Ticket updated successfully');
                    }}
                />
            )}

                {jobs.length === 0 && (
                    <Card className="border-dashed">
                        <CardContent className="py-16 text-center">
                            <div className="mx-auto h-12 w-12 text-slate-300 mb-3">
                                <CheckCircle className="h-12 w-12" />
                            </div>
                            <h3 className="text-lg font-medium text-slate-900">
                                {canVerify
                                    ? (isPorter
                                        ? 'No pending hostel verifications'
                                        : isStaff
                                            ? `No pending ${userDepartment} verifications`
                                            : 'No pending verifications')
                                    : 'All caught up!'}
                            </h3>
                            <p className="text-slate-500">
                                {canVerify
                                    ? (isPorter
                                        ? 'All hostel complaints have been verified. Great work!'
                                        : isStaff
                                            ? `All ${userDepartment} complaints have been verified. Great work!`
                                            : 'All student complaints have been verified. Great work!')
                                    : 'No active jobs assigned to you at the moment.'}
                            </p>
                        </CardContent>
                    </Card>
                )}

                {displayedJobs.length === 0 && activeTab === 'reported' && (
                    <Card className="border-dashed">
                        <CardContent className="py-16 text-center">
                            <div className="mx-auto h-12 w-12 text-slate-300 mb-3">
                                <MessageSquare className="h-12 w-12" />
                            </div>
                            <h3 className="text-lg font-medium text-slate-900">
                                No reported tickets
                            </h3>
                            <p className="text-slate-500">
                                You haven't reported any maintenance issues yet.
                            </p>
                        </CardContent>
                    </Card>
                )}
            </div>
        </div>
    );
}
