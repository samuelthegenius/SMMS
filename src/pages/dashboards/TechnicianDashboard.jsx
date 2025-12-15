import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { Bot, CheckCircle, Clock, MapPin, AlertTriangle, Play, CheckSquare } from 'lucide-react';
import clsx from 'clsx';
import Loader from '../../components/Loader';

export default function TechnicianDashboard() {
    const { user } = useAuth();
    const [jobs, setJobs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [aiSuggestion, setAiSuggestion] = useState({ ticketId: null, text: '', loading: false });

    useEffect(() => {
        fetchJobs();

        // Realtime subscription
        const subscription = supabase
            .channel('technician_jobs')
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'tickets',
                filter: `assigned_to=eq.${user.id}`
            }, () => {
                fetchJobs();
            })
            .subscribe();

        return () => {
            subscription.unsubscribe();
        };
    }, [user.id]);

    const fetchJobs = async () => {
        try {
            const { data, error } = await supabase
                .from('tickets')
                .select('*')
                .eq('assigned_to', user.id)
                .neq('status', 'Resolved')
                .order('priority', { ascending: false }); // High priority first

            if (error) throw error;
            setJobs(data);
        } catch (error) {
            console.error('Error fetching jobs:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleStatusUpdate = async (ticketId, newStatus) => {
        try {
            const { error } = await supabase
                .from('tickets')
                .update({ status: newStatus })
                .eq('id', ticketId);

            if (error) throw error;
            // Optimistic update or wait for realtime
            setJobs(jobs.map(j => j.id === ticketId ? { ...j, status: newStatus } : j));
        } catch (error) {
            console.error('Error updating status:', error);
        }
    };

    const getAiHelp = async (ticket) => {
        setAiSuggestion({ ticketId: ticket.id, text: '', loading: true });
        try {
            const response = await fetch('/api/suggest-fix', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    description: ticket.description,
                    category: ticket.category,
                    facility_type: ticket.facility_type
                }),
            });

            const data = await response.json();
            setAiSuggestion({
                ticketId: ticket.id,
                text: data.suggestion,
                loading: false
            });
        } catch (error) {
            console.error('AI Error:', error);
            setAiSuggestion({
                ticketId: ticket.id,
                text: 'Failed to get AI suggestion.',
                loading: false
            });
        }
    };

    if (loading) return <Loader />;

    return (
        <div className="space-y-8">
            <div>
                <h1 className="text-2xl font-bold text-slate-900">Assigned Jobs</h1>
                <p className="text-slate-500 mt-1">Manage and resolve your assigned maintenance tasks</p>
            </div>

            <div className="space-y-6">
                {jobs.map((job) => (
                    <div key={job.id} className="bg-white shadow-sm hover:shadow-md transition-shadow rounded-xl p-6 border border-slate-200">
                        <div className="flex flex-col md:flex-row justify-between items-start gap-6">
                            <div className="flex-1">
                                <div className="flex items-center gap-3 mb-3">
                                    <span className={clsx(
                                        'px-2.5 py-1 text-xs font-bold rounded-full flex items-center gap-1.5 uppercase tracking-wide',
                                        job.priority === 'High'
                                            ? 'bg-rose-50 text-rose-700 border border-rose-100'
                                            : 'bg-slate-100 text-slate-700 border border-slate-200'
                                    )}>
                                        {job.priority === 'High' && <AlertTriangle className="w-3 h-3" />}
                                        {job.priority} Priority
                                    </span>
                                    <span className="text-xs font-semibold text-slate-500 bg-slate-50 px-2 py-1 rounded-md border border-slate-100">
                                        {job.category}
                                    </span>
                                </div>

                                <h3 className="text-xl font-bold text-slate-900">{job.title}</h3>
                                <p className="text-slate-600 mt-2 leading-relaxed">{job.description}</p>

                                <div className="inline-flex items-center gap-2 text-sm text-slate-500 mt-4 font-medium bg-slate-50 px-3 py-1.5 rounded-lg">
                                    <MapPin className="w-4 h-4 text-slate-400" />
                                    <span>{job.facility_type} • {job.specific_location}</span>
                                </div>
                            </div>

                            <div className="flex flex-col gap-3 w-full md:w-auto min-w-[160px]">
                                {job.status !== 'In Progress' && (
                                    <button
                                        onClick={() => handleStatusUpdate(job.id, 'In Progress')}
                                        className="flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 text-white text-sm font-bold rounded-xl hover:bg-blue-700 shadow-sm transition-all active:scale-[0.98]"
                                    >
                                        <Play className="w-4 h-4" />
                                        Start Job
                                    </button>
                                )}
                                <button
                                    onClick={() => handleStatusUpdate(job.id, 'Resolved')}
                                    className="flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-600 text-white text-sm font-bold rounded-xl hover:bg-emerald-700 shadow-sm transition-all active:scale-[0.98]"
                                >
                                    <CheckSquare className="w-4 h-4" />
                                    Mark Resolved
                                </button>
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
                                {aiSuggestion.ticketId === job.id ? 'Refresh AI Suggestion' : 'Ask AI for Repair Guide'}
                            </button>

                            {aiSuggestion.ticketId === job.id && (
                                <div className="mt-4 p-5 bg-indigo-50/50 rounded-xl border border-indigo-100 text-sm text-indigo-900 shadow-sm">
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
                    </div>
                ))}

                {jobs.length === 0 && (
                    <div className="text-center py-16 bg-white rounded-2xl shadow-sm border border-slate-200">
                        <div className="mx-auto h-12 w-12 text-slate-400 mb-3">
                            <CheckCircle className="h-12 w-12" />
                        </div>
                        <h3 className="text-lg font-medium text-slate-900">All caught up!</h3>
                        <p className="text-slate-500">No active jobs assigned to you at the moment.</p>
                    </div>
                )}
            </div>
        </div>
    );
}
