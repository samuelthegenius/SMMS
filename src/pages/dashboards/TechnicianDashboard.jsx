import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { Bot, CheckCircle, MapPin, AlertTriangle, Play, CheckSquare, Clock } from 'lucide-react';
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
                student:created_by(email)
            `)
            .eq('assigned_to', user.id)
            .neq('status', 'Resolved')
            .order('priority', { ascending: false });
        if (error) throw error;
        return data;
    };

    // Use SWR
    const { data: jobs = [], mutate, isLoading } = useSWR(user ? ['technician_jobs', user.id] : null, fetchJobs);

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
                mutate();
                toast.info('Job list updated');
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
                if (job?.student?.email) {
                    await supabase.functions.invoke('send-email', {
                        body: {
                            type: 'ticket_completed',
                            ticket_title: job.title,
                            student_email: job.student.email
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
            const formattedSuggestion = `
Technical Diagnosis: ${data.technical_diagnosis}

Tools Required:
${data.tools_required.map(tool => `• ${tool}`).join('\n')}

Safety Precaution:
${data.safety_precaution}
            `.trim();

            setAiSuggestion({
                ticketId: ticket.id,
                text: formattedSuggestion,
                loading: false
            });
        } catch (error) {
            console.error('AI Error:', error);
            toast.error('Could not get AI suggestion');
            setAiSuggestion({
                ticketId: ticket.id,
                text: 'Failed to access AI service. ' + (error.message || ''),
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
                                            <div className="prose prose-sm prose-indigo max-w-none">
                                                <div className="whitespace-pre-wrap leading-relaxed">{aiSuggestion.text}</div>
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
