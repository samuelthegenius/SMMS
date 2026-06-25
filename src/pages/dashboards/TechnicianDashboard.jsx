import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/useAuth';
import { CheckCircle, MapPin, AlertTriangle, Play, CheckSquare, Clock, User, Plus, MessageSquare, Eye, Star, TrendingUp, Award, Wrench as WrenchIcon, Upload, X, Image } from 'lucide-react';
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

    console.log('[TECH_DBG] Init:', { 
        userId: user?.id, 
        role: profile?.role, 
        isPorter, isTechnician, isSRC, isStaff, 
        department: userDepartment,
        profileId: profile?.id 
    });
    // Staff verify tickets in their department, SRC verifies all, Porters verify hostel
    const canVerify = isPorter || isSRC || isStaff;
    const [selectedTicket, setSelectedTicket] = useState(null);
    const [modalTab, setModalTab] = useState('details');
    const [activeTab, setActiveTab] = useState('assigned'); // 'assigned' | 'reported' | 'completed'
    const [timeframe, setTimeframe] = useState('All Time');
    const [resolvingTicket, setResolvingTicket] = useState(null);
    const [proofFile, setProofFile] = useState(null);
    const [proofPreview, setProofPreview] = useState(null);
    const [isUploadingProof, setIsUploadingProof] = useState(false);
    
    // Satisfaction metrics state for technicians
    const [satisfactionMetrics, setSatisfactionMetrics] = useState(null);
    const [showMetrics, setShowMetrics] = useState(false);

    // Helper to fetch reporter profile for a ticket
    const fetchReporterProfile = async (userId) => {
        if (!userId) return null;
        try {
            const { data } = await supabase
                .from('profiles')
                .select('full_name, email, department')
                .eq('id', userId)
                .maybeSingle();
            return data;
        } catch {
            return null;
        }
    };

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
                created_by
            `);

        if (isPorter) {
            query = query
                .eq('facility_type', 'Hostel')
                .eq('status', 'Open');
        } else if (isSRC) {
            query = query
                .eq('status', 'Open');
        } else if (isStaff && userDepartment) {
            query = query
                .eq('department', userDepartment)
                .eq('status', 'Open');
        } else {
            query = query
                .eq('assigned_to', user.id)
                .neq('status', 'Resolved');
        }

        console.log('[TECH_DBG] fetchJobs sending query, userId:', user?.id, 'role:', profile?.role);
        const { data, error } = await query.order('priority', { ascending: false });
        console.log('[TECH_DBG] fetchJobs result:', { dataLength: data?.length, error, firstRow: data?.[0] });
        if (error) throw error;
        const enriched = await Promise.all(data.map(async (ticket) => ({
            ...ticket,
            reporter: await fetchReporterProfile(ticket.created_by)
        })));
        console.log('[TECH_DBG] fetchJobs enriched:', enriched.length, 'tickets');
        return enriched;
    };

    // Fetch tickets that the current user has reported (for staff/technicians/porters who also report issues)
    const fetchReportedTickets = async () => {
        console.log('[TECH_DBG] fetchReportedTickets, userId:', user?.id);
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
                created_by
            `)
            .eq('created_by', user.id)
            .order('created_at', { ascending: false });
        console.log('[TECH_DBG] fetchReportedTickets result:', { dataLength: data?.length, error });
        if (error) throw error;
        const enriched = await Promise.all(data.map(async (ticket) => ({
            ...ticket,
            technician: await fetchReporterProfile(ticket.assigned_to)
        })));
        return enriched;
    };

    // Fetch completed/resolved jobs for technicians
    const fetchCompletedJobs = async () => {
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
                created_by
            `)
            .eq('assigned_to', user.id)
            .eq('status', 'Resolved')
            .order('created_at', { ascending: false });
        if (error) throw error;
        const enriched = await Promise.all(data.map(async (ticket) => ({
            ...ticket,
            reporter: await fetchReporterProfile(ticket.created_by)
        })));
        return enriched;
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
    const { data: jobs = [], mutate, isLoading, error: jobsError } = useSWR(
        swrKey,
        fetchJobs,
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

    // Fetch reported tickets for staff/technicians/porters
    const { data: reportedTickets = [], mutate: mutateReported, error: reportedError } = useSWR(
        user ? ['reported_tickets', user.id] : null,
        fetchReportedTickets,
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

    const { data: completedJobs = [], mutate: mutateCompleted, error: completedError } = useSWR(
        user && isTechnician ? ['completed_jobs', user.id] : null,
        fetchCompletedJobs,
        {
            revalidateOnFocus: false,
            revalidateOnMount: true,
            revalidateOnReconnect: true,
            dedupingInterval: 30000,
            errorRetryCount: 2,
            refreshInterval: 0,
            suspense: false
        }
    );

    const mutateAll = () => {
        mutate();
        mutateReported();
        mutateCompleted();
    };

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

    const activeList = activeTab === 'assigned' ? jobs : activeTab === 'completed' ? completedJobs : reportedTickets;
    const displayedJobs = activeList.filter(job => isWithinTimeframe(job.created_at, timeframe));

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

        let timeoutId = null;
        const subscription = supabase
            .channel(channelName)
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'tickets',
                filter: filter
            }, () => {
                if (timeoutId) clearTimeout(timeoutId);
                timeoutId = setTimeout(() => {
                    mutateAll();
                    toast.info('List updated');
                }, 1000);
            })
            .subscribe();

        return () => {
            if (timeoutId) clearTimeout(timeoutId);
            subscription.unsubscribe();
        };
    }, [user, mutate, mutateReported, mutateCompleted, isPorter, isSRC, isStaff, userDepartment]);

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

    const handleStatusUpdate = async (ticketId, newStatus, proofUrl = null) => {
        const previousJobs = [...jobs];
        
        // Optimistic update
        let updatedJobs;
        if (proofUrl) {
            updatedJobs = jobs.map(j => j.id === ticketId ? { ...j, status: newStatus, resolution_proof_url: proofUrl } : j);
        } else {
            updatedJobs = jobs.map(j => j.id === ticketId ? { ...j, status: newStatus } : j);
        }
        mutate(updatedJobs, false);

        try {
            const updates = { status: newStatus };
            if (proofUrl) updates.resolution_proof_url = proofUrl;

            const { error, data } = await supabase
                .from('tickets')
                .update(updates)
                .eq('id', ticketId)
                .select(); // Select to ensure RLS doesn't silently fail by returning 0 rows

            if (error) throw error;
            if (!data || data.length === 0) throw new Error('Update failed. You might not have permission, or the ticket was not found.');

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
            mutate(updatedJobs); // Optimistic jobs update + revalidate
            mutateReported();
            mutateCompleted();
        } catch (error) {
            console.error('handleStatusUpdate error:', error);
            toast.error(error.message || 'Failed to update status');
            mutate(previousJobs, false); // Rollback
        }
    };

    const handleProofChange = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        if (file.size > 5 * 1024 * 1024) {
            toast.error('File size must be less than 5MB');
            e.target.value = '';
            return;
        }
        setProofFile(file);
        setProofPreview(URL.createObjectURL(file));
    };

    const submitResolution = async () => {
        if (!resolvingTicket) return;
        setIsUploadingProof(true);
        try {
            let proofUrl = null;
            if (proofFile) {
                const fileExt = proofFile.name.split('.').pop();
                const fileName = `${Date.now()}_${Math.random().toString(36).substring(2)}.${fileExt}`;
                const { error: uploadError } = await supabase.storage
                    .from('ticket-images')
                    .upload(fileName, proofFile);
                if (uploadError) throw uploadError;
                const { data: { publicUrl } } = supabase.storage
                    .from('ticket-images')
                    .getPublicUrl(fileName);
                proofUrl = publicUrl;
            }
            await handleStatusUpdate(resolvingTicket.id, 'Pending Verification', proofUrl);
            setResolvingTicket(null);
            setProofFile(null);
            if (proofPreview) URL.revokeObjectURL(proofPreview);
            setProofPreview(null);
        } catch (err) {
            toast.error('Failed to submit resolution');
        } finally {
            setIsUploadingProof(false);
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
                // Valid complaint - mark as Assigned so the technician still clicks "Start Job"
                const { error } = await supabase
                    .from('tickets')
                    .update({
                        status: 'Assigned',
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
            mutateAll(); // Revalidate all lists
        } catch {
            toast.error('Failed to verify complaint');
            mutate(previousJobs, false); // Rollback
        }
    };

    // Debug: log state changes
    console.log('[TECH_DBG] Render state:', { 
        jobsCount: jobs?.length, 
        reportedCount: reportedTickets?.length, 
        isLoading,
        jobsErr: jobsError?.message,
        reportedErr: reportedError?.message,
        activeTab
    });

    if (isLoading && !jobs.length && !reportedTickets.length) return <Loader variant="technician" />;

    const hasReportedTickets = reportedTickets.length > 0;
    const fetchError = jobsError || reportedError || completedError;

    return (
        <div className="space-y-8">
            <div>
                <h1 className="text-3xl font-bold text-surface-900 tracking-tight">
                    {activeTab === 'completed'
                        ? 'Completed Jobs'
                        : activeTab === 'assigned'
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
                    {activeTab === 'completed'
                        ? 'All jobs you have successfully resolved'
                        : activeTab === 'assigned'
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

            {/* Timeframe Filter */}
            <div className="flex items-center gap-3 bg-white p-3 rounded-2xl border border-surface-200 shadow-sm hover:shadow-md transition-shadow w-fit">
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

            {/* Error banner */}
            {fetchError && (
                <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4 flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-rose-600 mt-0.5 shrink-0" />
                    <div>
                        <p className="font-semibold text-rose-800">Failed to load tickets</p>
                        <p className="text-sm text-rose-600 mt-1">
                            {fetchError?.message || 'Could not fetch your assigned tickets. The database may have a configuration issue.'}
                        </p>
                        <button
                            onClick={() => mutate()}
                            className="mt-2 text-sm font-medium text-rose-700 hover:text-rose-800 underline"
                        >
                            Retry
                        </button>
                    </div>
                </div>
            )}

            {/* Tab Navigation */}
            {(hasReportedTickets || isTechnician) && (
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
                    {isTechnician && (
                        <button
                            onClick={() => setActiveTab('completed')}
                            className={`px-5 py-2.5 rounded-xl font-semibold transition-all duration-200 ${
                                activeTab === 'completed'
                                    ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/25'
                                    : 'text-surface-600 hover:bg-white hover:shadow-sm'
                            }`}
                        >
                            Completed ({completedJobs.filter(j => isWithinTimeframe(j.created_at, timeframe)).length})
                        </button>
                    )}
                    {hasReportedTickets && (
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
                    )}
                </div>
            )}

            <div className="space-y-6">
                {displayedJobs.map((job) => (
                    <Card key={job.id} className="hover:shadow-lg transition-all duration-300 border-surface-200 group cursor-pointer" onClick={() => { setSelectedTicket(job); setModalTab('details'); }}>
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
                                            {job.priority} Severity
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
                                            setModalTab('details');
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
                                            setModalTab('chat');
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
                                                onClick={(e) => { e.stopPropagation(); handleVerifyComplaint(job.id, true); }}
                                                className="bg-emerald-600 hover:bg-emerald-700 w-full"
                                            >
                                                <CheckCircle className="w-4 h-4 mr-2" />
                                                Verify - Valid
                                            </Button>
                                            <Button
                                                onClick={(e) => { e.stopPropagation(); handleVerifyComplaint(job.id, false); }}
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
                                            onClick={(e) => { e.stopPropagation(); handleStatusUpdate(job.id, 'In Progress'); }}
                                            className="bg-blue-600 hover:bg-blue-700 w-full"
                                        >
                                            <Play className="w-4 h-4 mr-2" />
                                            Start Job
                                        </Button>
                                    )}

                                    {isTechnician && job.status === 'In Progress' && (
                                        <Button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setResolvingTicket(job);
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

                        </CardContent>
                    </Card>
                ))}

            {/* Ticket Details Modal with Chat */}
            {selectedTicket && (
                <TicketDetails
                    ticket={selectedTicket}
                    initialTab={modalTab}
                    onClose={() => setSelectedTicket(null)}
                    onUpdate={() => {
                        setSelectedTicket(null);
                        mutateAll();
                    }}
                    onReassign={() => {
                        setSelectedTicket(null);
                        mutateAll();
                        toast.success('Ticket updated successfully');
                    }}
                />
            )}

            {/* Resolution Modal */}
            {resolvingTicket && (
                <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
                    <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-xl font-bold text-slate-900">Mark as Done</h3>
                            <button onClick={() => {
                                setResolvingTicket(null);
                                setProofFile(null);
                                setProofPreview(null);
                            }} className="p-2 hover:bg-slate-100 rounded-full">
                                <X className="w-5 h-5 text-slate-500" />
                            </button>
                        </div>
                        <p className="text-slate-600 mb-6 text-sm">
                            Upload a photo as proof of your work (optional). This helps the student verify the fix.
                        </p>
                        
                        <div className={`mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-dashed rounded-md transition-colors ${proofPreview ? 'border-indigo-300 bg-indigo-50' : 'border-slate-300 hover:bg-slate-50'} mb-6`}>
                            <div className="space-y-1 text-center">
                                {proofPreview ? (
                                    <div className="relative inline-block">
                                        <img src={proofPreview} alt="Preview" className="max-h-48 rounded-lg shadow-sm border border-slate-200" />
                                        <button type="button" onClick={() => { setProofFile(null); setProofPreview(null); }} className="absolute -top-2 -right-2 bg-rose-500 text-white p-1 rounded-full shadow hover:bg-rose-600">
                                            <X className="w-4 h-4" />
                                        </button>
                                    </div>
                                ) : (
                                    <>
                                        <Upload className="mx-auto h-12 w-12 text-slate-400" />
                                        <div className="flex text-sm text-slate-600 justify-center">
                                            <label className="relative cursor-pointer rounded-md font-medium text-indigo-600 hover:text-indigo-500">
                                                <span>Upload proof</span>
                                                <input type="file" className="sr-only" accept="image/jpeg,image/png,image/webp" onChange={handleProofChange} />
                                            </label>
                                        </div>
                                        <p className="text-xs text-slate-500 mt-1">PNG, JPG up to 5MB</p>
                                    </>
                                )}
                            </div>
                        </div>

                        <div className="flex gap-3 justify-end">
                            <Button variant="outline" onClick={() => { setResolvingTicket(null); setProofFile(null); setProofPreview(null); }}>
                                Cancel
                            </Button>
                            <Button onClick={submitResolution} disabled={isUploadingProof} className="bg-emerald-600 hover:bg-emerald-700">
                                {isUploadingProof ? 'Submitting...' : 'Confirm Done'}
                            </Button>
                        </div>
                    </div>
                </div>
            )}

                {displayedJobs.length === 0 && activeTab === 'assigned' && (
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

                {displayedJobs.length === 0 && activeTab === 'completed' && (
                    <Card className="border-dashed">
                        <CardContent className="py-16 text-center">
                            <div className="mx-auto h-12 w-12 text-slate-300 mb-3">
                                <CheckCircle className="h-12 w-12" />
                            </div>
                            <h3 className="text-lg font-medium text-slate-900">No completed jobs yet</h3>
                            <p className="text-slate-500">Jobs you resolve will appear here.</p>
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
