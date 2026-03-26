import React, { useState, useEffect } from 'react';
import { X, Sparkles, Wrench, AlertTriangle, Loader2, ClipboardList, User, Wrench as WrenchIcon } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Button } from './ui/Button';
import ReassignTechnician from './ReassignTechnician';
import { toast } from 'sonner';

export default function TicketDetails({ ticket, onClose, onReassign }) {
    const { profile } = useAuth();
    const [loading, setLoading] = useState(false);
    const [aiSuggestion, setAiSuggestion] = useState(null);
    const [error, setError] = useState(null);
    const [reporterInfo, setReporterInfo] = useState(null);
    const [technicianInfo, setTechnicianInfo] = useState(null);
    const [userInfoLoading, setUserInfoLoading] = useState(true);

    const isTechnicianOrAdmin = profile?.role === 'technician' || profile?.role === 'admin';
    const isAdmin = profile?.role === 'admin';

    // Fetch reporter and technician information
    useEffect(() => {
        const fetchUserInfo = async () => {
            if (!ticket) return;
            
            setUserInfoLoading(true);
            try {
                // Fetch reporter information
                const { data: reporterData } = await supabase
                    .from('profiles')
                    .select('full_name, email, department, identification_number')
                    .eq('id', ticket.created_by)
                    .single();
                
                setReporterInfo(reporterData);

                // Fetch technician information if assigned
                if (ticket.assigned_to) {
                    const { data: technicianData } = await supabase
                        .from('profiles')
                        .select('full_name, email, department, identification_number')
                        .eq('id', ticket.assigned_to)
                        .single();
                    
                    setTechnicianInfo(technicianData);
                } else {
                    setTechnicianInfo(null);
                }
            } catch (err) {
                console.error('Error fetching user information:', err);
            } finally {
                setUserInfoLoading(false);
            }
        };

        fetchUserInfo();
    }, [ticket]);

    const handleAskAI = async () => {
        setLoading(true);
        setError(null);
        try {
            // Using Supabase Edge Function directly
            const { data, error } = await supabase.functions.invoke('suggest-fix', {
                body: {
                    ticketDescription: ticket.description,
                    ticketCategory: ticket.category,
                }
            });

            if (error) throw error;
            // The updated edge function now returns { suggestion: ... } or the raw JSON directly depending on implementation.
            // Based on my edit, it returns the JSON object directly (technical_diagnosis, etc)
            // or wrapped in suggestion key if I followed the plan strictly.
            // Let's check my previous edit: I returned `JSON.stringify(jsonResponse)` 
            // So `data` will be the actual JSON object.

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

                        {/* Reporter and Technician Information */}
                        <div className="border-t border-slate-100 pt-6">
                            <h4 className="text-sm font-semibold text-slate-900 mb-4">People Involved</h4>
                            
                            {userInfoLoading ? (
                                <div className="flex items-center justify-center py-4">
                                    <Loader2 className="w-4 h-4 animate-spin text-slate-400 mr-2" />
                                    <span className="text-sm text-slate-500">Loading user information...</span>
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    {/* Reporter Information */}
                                    <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
                                        <div className="flex items-center gap-2 mb-2">
                                            <User className="w-4 h-4 text-blue-500" />
                                            <span className="text-sm font-semibold text-slate-900">Reporter</span>
                                        </div>
                                        {reporterInfo ? (
                                            <div className="space-y-1">
                                                <p className="text-sm font-medium text-slate-800">{reporterInfo.full_name || 'Unknown'}</p>
                                                <p className="text-xs text-slate-600">{reporterInfo.email}</p>
                                                <div className="flex gap-4 text-xs text-slate-500">
                                                    {reporterInfo.department && (
                                                        <span>Dept: {reporterInfo.department}</span>
                                                    )}
                                                    {reporterInfo.identification_number && (
                                                        <span>ID: {reporterInfo.identification_number}</span>
                                                    )}
                                                </div>
                                            </div>
                                        ) : (
                                            <p className="text-sm text-slate-500">Reporter information not available</p>
                                        )}
                                    </div>

                                    {/* Technician Information */}
                                    <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
                                        <div className="flex items-center gap-2 mb-2">
                                            <WrenchIcon className="w-4 h-4 text-green-500" />
                                            <span className="text-sm font-semibold text-slate-900">Assigned Technician</span>
                                        </div>
                                        {technicianInfo ? (
                                            <div className="space-y-3">
                                                <div className="space-y-1">
                                                    <p className="text-sm font-medium text-slate-800">{technicianInfo.full_name || 'Unknown'}</p>
                                                    <p className="text-xs text-slate-600">{technicianInfo.email}</p>
                                                    <div className="flex gap-4 text-xs text-slate-500">
                                                        {technicianInfo.department && (
                                                            <span>Dept: {technicianInfo.department}</span>
                                                        )}
                                                        {technicianInfo.identification_number && (
                                                            <span>ID: {technicianInfo.identification_number}</span>
                                                        )}
                                                    </div>
                                                </div>
                                                {isAdmin && (
                                                    <div className="pt-2 border-t border-slate-200">
                                                        <ReassignTechnician 
                                                            ticket={ticket} 
                                                            onReassign={() => {
                                                                if (onReassign) onReassign();
                                                                toast.success('Technician reassigned successfully');
                                                            }}
                                                        />
                                                    </div>
                                                )}
                                            </div>
                                        ) : (
                                            <div className="space-y-3">
                                                <p className="text-sm text-slate-500">No technician assigned yet</p>
                                                {isAdmin && (
                                                    <ReassignTechnician 
                                                        ticket={ticket} 
                                                        onReassign={() => {
                                                            if (onReassign) onReassign();
                                                            toast.success('Technician assigned successfully');
                                                        }}
                                                    />
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}
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
