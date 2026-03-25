import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { Bot, CheckCircle, MapPin, AlertTriangle, Play, CheckSquare, Clock, User } from 'lucide-react';
import clsx from 'clsx';
import Loader from '../../components/Loader';
import { toast } from 'sonner';
import { Button } from '../../components/ui/Button';
import { Card, CardContent } from '../../components/ui/Card';

import useSWR from 'swr';

export default function TechnicianDashboard() {
    const { user } = useAuth();
    const [aiSuggestion, setAiSuggestion] = useState({ ticketId: null, text: '', loading: false });

    // SWR Fetcher - Only fetch necessary fields
    const fetchJobs = async () => {
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
                reporter:created_by(full_name, email, department)
            `)
            .eq('assigned_to', user.id)
            .neq('status', 'Resolved')
            .order('priority', { ascending: false });
        if (error) throw error;
        return data;
    };

    // Use SWR
    const { data: jobs = [], mutate, isLoading } = useSWR(
        user ? ['technician_jobs', user.id] : null, 
        fetchJobs,
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

    useEffect(() => {
        if (!user) return;

        const subscription = supabase
            .channel('technician_jobs')
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'tickets',
                filter: `assigned_to=eq.${user.id}`
            }, () => {
                // Debounce rapid mutations
                const timeoutId = setTimeout(() => {
                    mutate();
                    toast.info('Job list updated');
                }, 1000);
                
                return () => clearTimeout(timeoutId);
            })
            .subscribe();

        return () => {
            subscription.unsubscribe();
        };
    }, [user, mutate]);

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
        } catch (error) {
            console.error('Error updating status:', error);
            toast.error('Failed to update status');
            mutate(previousJobs, false); // Rollback
        }
    };

    const getAiHelp = async (ticket) => {
        if (aiSuggestion.ticketId === ticket.id && aiSuggestion.text) {
            setAiSuggestion({ ticketId: null, text: '', loading: false }); // Toggle off
            return;
        }

        setAiSuggestion({ ticketId: ticket.id, text: '', loading: true });
        try {
            // Securely Call Supabase Edge Function
            const { data, error } = await supabase.functions.invoke('suggest-fix', {
                body: {
                    ticketDescription: ticket.description,
                    ticketCategory: ticket.category
                }
            });

            if (error) throw error;

            // Format the AI response for display
            if (data.technical_diagnosis && data.tools_required && data.safety_precaution) {
                // Normal mode - format structured response with proper styling
                formattedSuggestion = `
<div class="space-y-4">
    <div>
        <h3 class="font-semibold text-slate-900 mb-2 flex items-center gap-2">
            <svg class="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.75 17L9 20l-1 1h8l-1-1v-7.686a3 3 0 1 0-5.828 0M4.75 12a3.25 3.25 0 1 0 6.5 0 3.25 3.25 0 0 0-6.5 0M12 17.25h.008"></path>
            </svg>
            Technical Diagnosis
        </h3>
        <p class="text-slate-700 leading-relaxed bg-blue-50 p-3 rounded-lg border border-blue-100">${data.technical_diagnosis}</p>
    </div>
    
    <div>
        <h3 class="font-semibold text-slate-900 mb-2 flex items-center gap-2">
            <svg class="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.121 14.121L19 19m-7-7l-7 7m-7-7l7 7m6.5-3.5a2.121 2.121 0 0 1 3 3L12 15l3-3m6.5-3.5a2.121 2.121 0 0 1 3 3L12 15l3-3"></path>
            </svg>
            Tools Required
        </h3>
        <ul class="space-y-1 bg-green-50 p-3 rounded-lg border border-green-100">
            ${(data.tools_required || []).map(tool => `
                <li class="flex items-center gap-2 text-slate-700">
                    <span class="w-2 h-2 bg-green-500 rounded-full"></span>
                    ${tool}
                </li>
            `).join('')}
        </ul>
    </div>
    
    <div>
        <h3 class="font-semibold text-slate-900 mb-2 flex items-center gap-2">
            <svg class="w-4 h-4 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 2.502-3.181V8c0-1.51-1.963-2.58-3.181-2.581A2.25 2.25 0 0 0 11.938 6H8.062a2.25 2.25 0 0 0-2.181 2.419C5.62 8.62 4 9.629 4 11v2.5c0 1.514 1.962 2.58 3.181 2.581h5.876c1.54 0 2.502-1.667 2.502-3.181Z"></path>
            </svg>
            Safety Precaution
        </h3>
        <div class="bg-red-50 border border-red-200 text-red-800 p-3 rounded-lg font-medium">
            ${data.safety_precaution}
        </div>
    </div>
</div>
                `.trim();
            } else if (data.error) {
                formattedSuggestion = `Error: ${data.error}`;
            } else {
                formattedSuggestion = 'AI response format error. Please try again.';
            }

            setAiSuggestion({
                ticketId: ticket.id,
                text: formattedSuggestion,
                loading: false
            });
        } catch (error) {
            toast.error('Could not get AI suggestion');
            setAiSuggestion({
                ticketId: ticket.id,
                text: `Failed to access AI service. Error: ${error.message || 'Unknown error'}`,
                loading: false
            });
        }
    };

    if (isLoading && !jobs.length) return <Loader />;

    return (
        <div className="space-y-8">
            <div>
                <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Assigned Jobs</h1>
                <p className="text-slate-500 mt-2 text-lg">Manage and resolve your maintenance tasks</p>
            </div>

            <div className="space-y-6">
                {jobs.map((job) => (
                    <Card key={job.id} className="hover:shadow-md transition-shadow border-slate-200">
                        <CardContent className="p-6">
                            <div className="flex flex-col md:flex-row justify-between items-start gap-6">
                                <div className="flex-1 space-y-4">
                                    <div className="flex items-center gap-3">
                                        <span className={clsx(
                                            'px-2.5 py-1 text-xs font-bold rounded-full flex items-center gap-1.5 uppercase tracking-wide border',
                                            job.priority === 'High'
                                                ? 'bg-rose-50 text-rose-700 border-rose-100'
                                                : 'bg-slate-50 text-slate-700 border-slate-200'
                                        )}>
                                            {job.priority === 'High' && <AlertTriangle className="w-3 h-3" />}
                                            {job.priority} Priority
                                        </span>
                                        <span className="text-xs font-semibold text-slate-500 bg-slate-50 px-2 py-1 rounded-md border border-slate-100">
                                            {job.category}
                                        </span>
                                    </div>

                                    <div>
                                        <h3 className="text-xl font-bold text-slate-900">{job.title}</h3>
                                        <p className="text-slate-600 mt-2 leading-relaxed">{job.description}</p>
                                    </div>

                                    <div className="inline-flex items-center gap-2 text-sm text-slate-500 font-medium bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-100/50">
                                        <MapPin className="w-4 h-4 text-slate-400" />
                                        <span>{job.facility_type} • {job.specific_location}</span>
                                    </div>

                                    {/* Reporter Information */}
                                    <div className="inline-flex items-center gap-2 text-sm text-slate-500 font-medium bg-blue-50 px-3 py-1.5 rounded-lg border border-blue-100/50">
                                        <User className="w-4 h-4 text-blue-500" />
                                        <span>{job.reporter?.full_name || 'Unknown Reporter'}</span>
                                        {job.reporter?.department && (
                                            <span className="text-blue-400 text-xs">
                                                ({job.reporter.department})
                                            </span>
                                        )}
                                    </div>
                                </div>

                                <div className="flex flex-col gap-3 w-full md:w-auto min-w-[160px]">
                                    {(job.status === 'Open' || job.status === 'Assigned' || job.status === 'Pending') && (
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

                            <div className="mt-6 pt-6 border-t border-slate-100">
                                <button
                                    onClick={() => getAiHelp(job)}
                                    className="flex items-center gap-2 text-indigo-600 text-sm font-bold hover:text-indigo-800 transition-colors group"
                                >
                                    <div className="p-1.5 bg-indigo-50 rounded-lg group-hover:bg-indigo-100 transition-colors">
                                        <Bot className="w-4 h-4" />
                                    </div>
                                    {aiSuggestion.ticketId === job.id ? 'Close AI Suggestion' : 'Ask AI for Repair Guide'}
                                </button>

                                {aiSuggestion.ticketId === job.id && (
                                    <div className="mt-4 p-5 bg-indigo-50/50 rounded-xl border border-indigo-100 text-sm text-indigo-900 shadow-sm animate-in fade-in slide-in-from-top-2">
                                        {aiSuggestion.loading ? (
                                            <div className="flex items-center gap-3">
                                                <div className="animate-spin rounded-full h-4 w-4 border-2 border-indigo-600 border-t-transparent"></div>
                                                <span className="font-medium">Analyzing ticket details...</span>
                                            </div>
                                        ) : (
                                            <div className="prose prose-sm prose-indigo max-w-none whitespace-pre-wrap">
                                                {aiSuggestion.text}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </CardContent>
                    </Card>
                ))}

                {jobs.length === 0 && (
                    <Card className="border-dashed">
                        <CardContent className="py-16 text-center">
                            <div className="mx-auto h-12 w-12 text-slate-300 mb-3">
                                <CheckCircle className="h-12 w-12" />
                            </div>
                            <h3 className="text-lg font-medium text-slate-900">All caught up!</h3>
                            <p className="text-slate-500">No active jobs assigned to you at the moment.</p>
                        </CardContent>
                    </Card>
                )}
            </div>
        </div>
    );
}
