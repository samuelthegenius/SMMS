import React, { useState } from 'react';
import { X, Sparkles, Wrench, AlertTriangle, Loader2, ClipboardList } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { Button } from './ui/Button';

export default function TicketDetails({ ticket, onClose }) {
    const { profile } = useAuth();
    const [loading, setLoading] = useState(false);
    const [aiSuggestion, setAiSuggestion] = useState(null);
    const [error, setError] = useState(null);

    const isTechnicianOrAdmin = profile?.role === 'technician' || profile?.role === 'admin';

    const handleAskAI = async () => {
        setLoading(true);
        setError(null);
        try {
            const response = await fetch('/api/suggest-fix', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ticketDescription: ticket.description,
                    category: ticket.category,
                }),
            });

            if (!response.ok) throw new Error('Failed to get AI suggestion');

            const data = await response.json();
            setAiSuggestion(data);
        } catch (err) {
            console.error(err);
            setError('Failed to load AI suggestion. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    if (!ticket) return null;

    return (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto border border-slate-200">
                <div className="p-6 border-b border-slate-100 flex justify-between items-center sticky top-0 bg-white/90 backdrop-blur-sm z-10">
                    <div>
                        <h2 className="text-xl font-bold text-slate-900">Ticket Details</h2>
                        <p className="text-sm text-slate-500">#{ticket.id} • {ticket.category}</p>
                    </div>
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={onClose}
                        className="rounded-full"
                    >
                        <X className="w-5 h-5" />
                    </Button>
                </div>

                <div className="p-6 space-y-8">
                    <div className="space-y-4">
                        <h3 className="text-lg font-semibold text-slate-900">{ticket.title}</h3>
                        <p className="text-slate-600 leading-relaxed bg-slate-50 p-4 rounded-xl border border-slate-100">
                            {ticket.description}
                        </p>

                        <div className="grid grid-cols-2 gap-4 text-sm">
                            <div>
                                <span className="text-slate-500 block mb-1">Location</span>
                                <span className="font-medium text-slate-900">{ticket.facility_type} - {ticket.specific_location}</span>
                            </div>
                            <div>
                                <span className="text-slate-500 block mb-1">Status</span>
                                <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-800 border border-slate-200`}>
                                    {ticket.status}
                                </span>
                            </div>
                        </div>
                    </div>

                    {isTechnicianOrAdmin && (
                        <div className="border-t border-slate-100 pt-8">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                                    <Sparkles className="w-5 h-5 text-indigo-500" />
                                    Technician Support Assistant
                                </h3>
                                {!aiSuggestion && !loading && (
                                    <Button
                                        onClick={handleAskAI}
                                        className="bg-indigo-50 text-indigo-600 hover:bg-indigo-100 border-indigo-100"
                                    >
                                        <Sparkles className="w-4 h-4 mr-2" />
                                        Generate Repair Guide
                                    </Button>
                                )}
                            </div>

                            {loading && (
                                <div className="flex flex-col items-center justify-center py-12 text-slate-400">
                                    <Loader2 className="w-8 h-8 animate-spin mb-2 text-indigo-500" />
                                    <p className="text-sm">Generating job prep checklist...</p>
                                </div>
                            )}

                            {error && (
                                <div className="p-4 bg-red-50 text-red-600 rounded-xl text-sm border border-red-100">
                                    {error}
                                </div>
                            )}

                            {aiSuggestion && (
                                <div className="bg-gradient-to-br from-indigo-50 to-blue-50 rounded-2xl p-6 border border-indigo-100/50 shadow-sm space-y-6">
                                    <div>
                                        <h4 className="text-sm font-bold text-indigo-900 uppercase tracking-wider mb-2 flex items-center gap-2">
                                            <ClipboardList className="w-4 h-4" />
                                            Job Prep Checklist
                                        </h4>
                                        <div className="bg-white/60 p-4 rounded-xl backdrop-blur-sm border border-indigo-100 mb-4">
                                            <span className="block text-xs font-semibold text-indigo-500 mb-1 uppercase">Possible Fault</span>
                                            <p className="text-indigo-900 leading-relaxed font-medium">
                                                {aiSuggestion.technical_diagnosis}
                                            </p>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div className="bg-white/60 p-4 rounded-xl backdrop-blur-sm border border-indigo-100">
                                            <div className="flex items-center gap-2 mb-2 text-indigo-900 font-semibold text-sm">
                                                <AlertTriangle className="w-4 h-4 text-amber-500" />
                                                Safety Warning
                                            </div>
                                            <div className="text-amber-700 text-sm font-medium">
                                                {aiSuggestion.safety_precaution}
                                            </div>
                                        </div>

                                        <div className="bg-white/60 p-4 rounded-xl backdrop-blur-sm border border-indigo-100">
                                            <div className="flex items-center gap-2 mb-2 text-indigo-900 font-semibold text-sm">
                                                <Wrench className="w-4 h-4" />
                                                Required Tools
                                            </div>
                                            <div className="flex flex-wrap gap-2">
                                                {aiSuggestion.tools_required?.map((tool, i) => (
                                                    <span key={i} className="px-2 py-1 bg-white rounded-md text-xs font-medium text-indigo-600 border border-indigo-50">
                                                        {tool}
                                                    </span>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
