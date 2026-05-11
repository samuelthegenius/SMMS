import { useState, useEffect } from 'react';
import { X, Sparkles, Wrench, AlertTriangle, Loader2, ClipboardList, User, Wrench as WrenchIcon, MessageSquare, Info, Clock, Star } from 'lucide-react';
import { 
    updateTicketCategory, 
    updateTicketPriority, 
    updateTicketStatus,
    getAICategorizationSuggestion,
    getAIStatusSuggestion,
    getAIPrioritySuggestion
} from '../services/ai';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/useAuth';
import { Button } from './ui/Button';
import ReassignTechnician from './ReassignTechnician';
import TicketChat from './TicketChat';
import { toast } from 'sonner';

export default function TicketDetails({ ticket, onClose, onReassign }) {
    const { profile } = useAuth();
    const [loading, setLoading] = useState(false);
    const [aiSuggestion, setAiSuggestion] = useState(null);
    const [error, setError] = useState(null);
    const [activeTab, setActiveTab] = useState('details'); // 'details' | 'chat'
    const [managementAction, setManagementAction] = useState(null);
    const [managementLoading, setManagementLoading] = useState(false);
    const [aiTyping, setAiTyping] = useState(false);
    const [aiMgmtSuggestion, setAiMgmtSuggestion] = useState(null);

    const isTechnicianOrAdmin = profile?.role === 'technician' || profile?.role === 'it_admin' || 
                                 profile?.role === 'manager' || profile?.role === 'supervisor' || 
                                 profile?.role === 'team_lead';
    const isITAdmin = profile?.role === 'it_admin';
    // For IT tickets, admin can reassign; for other tickets, only department management
    const canReassignThisTicket = (isITAdmin && ticket?.category === 'IT & Networking') || 
                                   profile?.role === 'manager' || 
                                   profile?.role === 'supervisor';

    // Use pre-fetched reporter and technician info from ticket prop
    // Dashboards already fetch this data via joins or RPC functions
    const reporterInfo = ticket?.reporter || null;
    const technicianInfo = ticket?.technician || null;

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
            setAiSuggestion(data);
        } catch {
            setError('Failed to load AI suggestion. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    // Handle ticket management actions
    const handleManagementAction = async (action, value, reason = '') => {
        setManagementLoading(true);
        try {
            let actionText;

            switch (action) {
                case 'recategorize':
                    await updateTicketCategory(ticket.id, value, reason);
                    actionText = `recategorized to ${value}`;
                    break;
                case 'reprioritize':
                    await updateTicketPriority(ticket.id, value, reason);
                    actionText = `reprioritized to ${value}`;
                    break;
                case 'change_status':
                    await updateTicketStatus(ticket.id, value, reason);
                    actionText = `status changed to ${value}`;
                    break;
                default:
                    throw new Error('Invalid action');
            }

            toast.success(`Ticket ${actionText}`);
            setManagementAction(null);

            // Refresh parent component if needed
            if (onReassign) onReassign();

        } catch (err) {
            toast.error(err.message || 'Failed to update ticket');
        } finally {
            setManagementLoading(false);
        }
    };

    // Get AI suggestion for management action - stores for inline display
    const handleGetAISuggestion = async (action) => {
        setAiTyping(true);
        try {
            let suggestion;
            
            if (action === 'recategorize') {
                suggestion = await getAICategorizationSuggestion(ticket.id);
            } else if (action === 'change_status') {
                suggestion = await getAIStatusSuggestion(ticket.id);
            } else if (action === 'reprioritize') {
                suggestion = await getAIPrioritySuggestion(ticket.id);
            }

            if (suggestion) {
                setAiMgmtSuggestion(suggestion);
            }

        } catch {
            toast.error('Failed to get AI suggestion');
        } finally {
            setAiTyping(false);
        }
    };

    // Auto-trigger AI when management action is opened
    useEffect(() => {
        if ((managementAction === 'recategorize' || managementAction === 'change_status' || managementAction === 'reprioritize') && !aiMgmtSuggestion) {
            handleGetAISuggestion(managementAction);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [managementAction, aiMgmtSuggestion]);

    if (!ticket) return null;

    return (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden border border-slate-200 flex flex-col">
                <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-white/90 backdrop-blur-sm z-10">
                    <div className="flex items-center gap-4">
                        <div>
                            <h2 className="text-xl font-bold text-slate-900">Ticket Details</h2>
                            <p className="text-sm text-slate-500">#{ticket.id} • {ticket.category}</p>
                        </div>
                        
                        {/* Tab Navigation */}
                        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl ml-4">
                            <button
                                onClick={() => setActiveTab('details')}
                                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                                    activeTab === 'details'
                                        ? 'bg-white text-slate-900 shadow-sm'
                                        : 'text-slate-600 hover:text-slate-900'
                                }`}
                            >
                                <div className="flex items-center gap-1.5">
                                    <Info className="w-4 h-4" />
                                    Details
                                </div>
                            </button>
                            <button
                                onClick={() => setActiveTab('chat')}
                                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                                    activeTab === 'chat'
                                        ? 'bg-white text-slate-900 shadow-sm'
                                        : 'text-slate-600 hover:text-slate-900'
                                }`}
                            >
                                <div className="flex items-center gap-1.5">
                                    <MessageSquare className="w-4 h-4" />
                                    Chat
                                </div>
                            </button>
                        </div>
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

                <div className="flex-1 overflow-hidden">
                    {activeTab === 'details' ? (
                        <div className="p-6 space-y-8 overflow-y-auto max-h-[calc(90vh-80px)]">
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
                            <div>
                                <span className="text-slate-500 block mb-1">Priority</span>
                                <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                    ticket.priority === 'high' ? 'bg-red-100 text-red-700 border border-red-200' :
                                    ticket.priority === 'medium' ? 'bg-amber-100 text-amber-700 border border-amber-200' :
                                    'bg-emerald-100 text-emerald-700 border border-emerald-200'
                                }`}>
                                    {ticket.priority?.toUpperCase() || 'MEDIUM'}
                                </span>
                            </div>
                            <div>
                                <span className="text-slate-500 block mb-1">Created</span>
                                <span className="font-medium text-slate-900">
                                    {ticket.created_at ? new Date(ticket.created_at).toLocaleString() : 'N/A'}
                                </span>
                            </div>
                        </div>

                        {/* Escalation Warning - Show for Escalated tickets */}
                        {ticket.status === 'Escalated' && (
                            <div className="bg-rose-50 border border-rose-200 rounded-xl p-4">
                                <div className="flex items-center gap-2 mb-2">
                                    <AlertTriangle className="w-5 h-5 text-rose-600" />
                                    <span className="text-sm font-semibold text-rose-800">
                                        Ticket Escalated to SRC
                                    </span>
                                </div>
                                <p className="text-sm text-rose-700 mb-2">
                                    This ticket has been escalated to the Student Representative Council due to multiple unsatisfactory resolutions.
                                </p>
                                <div className="flex items-center gap-2 text-xs text-rose-600 bg-rose-100 p-2 rounded">
                                    <span>⚠️ Rejection count: {ticket.rejection_count || 0}</span>
                                    <span className="text-rose-400">|</span>
                                    <span>Priority: {ticket.priority?.toUpperCase() || 'HIGH'}</span>
                                </div>
                                <p className="text-xs text-rose-600 mt-2">
                                    An administrator will now personally handle your case. You will be notified of any updates.
                                </p>
                            </div>
                        )}

                        {/* Rework in Progress - Show for tickets in rework (unsatisfied but not yet escalated) */}
                        {ticket.status === 'In Progress' && ticket.satisfaction_status === 'unsatisfied' && ticket.rejection_count > 0 && (
                            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                                <div className="flex items-center gap-2 mb-2">
                                    <Clock className="w-5 h-5 text-amber-600" />
                                    <span className="text-sm font-semibold text-amber-800">
                                        Rework in Progress
                                    </span>
                                </div>
                                <p className="text-sm text-amber-700 mb-2">
                                    Your ticket has been returned to the technician for rework based on your feedback.
                                </p>
                                <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-100 p-2 rounded">
                                    <span>⚠️ Rework attempt: {ticket.rejection_count} of 2</span>
                                    <span className="text-amber-400">|</span>
                                    <span>Status: {ticket.rejection_count >= 2 ? 'Will be escalated if unresolved' : '1 more attempt before escalation'}</span>
                                </div>
                                {ticket.customer_feedback && (
                                    <p className="text-xs text-amber-600 mt-2">
                                        Your feedback: "{ticket.customer_feedback}"
                                    </p>
                                )}
                                <p className="text-xs text-amber-600 mt-2">
                                    The technician will address your concerns. You will be notified when the work is complete for your review.
                                </p>
                            </div>
                        )}

                        {/* Rejection Reason - Show for Closed tickets with rejection reason */}
                        {ticket.status === 'Closed' && ticket.rejection_reason && (
                            <div className="bg-rose-50 border border-rose-200 rounded-xl p-4">
                                <div className="flex items-center gap-2 mb-2">
                                    <AlertTriangle className="w-4 h-4 text-rose-600" />
                                    <span className="text-sm font-semibold text-rose-800">
                                        {ticket.rejection_reason.includes('Invalid complaint') ? 'Ticket Rejected' : 'Ticket Status Update'}
                                    </span>
                                </div>
                                <p className="text-sm text-rose-700">
                                    {ticket.rejection_reason}
                                </p>
                            </div>
                        )}

                        {/* Ticket Management Panel - Only for staff */}
                        {isTechnicianOrAdmin && (
                            <div className="border-t border-slate-100 pt-6">
                                <div className="flex items-center gap-2 mb-4">
                                    <Wrench className="w-4 h-4 text-blue-600" />
                                    <h4 className="text-sm font-semibold text-slate-900">Manage Ticket</h4>
                                </div>
                                
                                {!managementAction ? (
                                    <div className="flex gap-2 flex-wrap">
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            onClick={() => {
                                                setAiMgmtSuggestion(null);
                                                setManagementAction('change_status');
                                            }}
                                            className="text-xs border-blue-200 text-blue-700 hover:bg-blue-100"
                                        >
                                            <Clock className="w-3 h-3 mr-1" />
                                            Change Status
                                        </Button>
                                        {(isTechnicianOrAdmin) && (
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                onClick={() => {
                                                    setAiMgmtSuggestion(null);
                                                    setManagementAction('recategorize');
                                                }}
                                                className="text-xs border-blue-200 text-blue-700 hover:bg-blue-100"
                                            >
                                                <Wrench className="w-3 h-3 mr-1" />
                                                Change Category
                                            </Button>
                                        )}
                                        {(isITAdmin && ticket?.category === 'IT & Networking') && (
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                onClick={() => {
                                                    setAiMgmtSuggestion(null);
                                                    setManagementAction('reprioritize');
                                                }}
                                                className="text-xs border-blue-200 text-blue-700 hover:bg-blue-100"
                                            >
                                                <AlertTriangle className="w-3 h-3 mr-1" />
                                                Change Priority
                                            </Button>
                                        )}
                                    </div>
                                ) : (
                                    <ManagementActionForm
                                        action={managementAction}
                                        ticket={ticket}
                                        onCancel={() => {
                                            setAiMgmtSuggestion(null);
                                            setManagementAction(null);
                                        }}
                                        onSubmit={handleManagementAction}
                                        onGetAISuggestion={handleGetAISuggestion}
                                        loading={managementLoading}
                                        aiTyping={aiTyping}
                                        aiSuggestion={aiMgmtSuggestion}
                                    />
                                )}
                            </div>
                        )}

                        {/* Satisfaction Feedback - Show for Resolved/Closed tickets */}
                        {(ticket.status === 'Resolved' || ticket.status === 'Closed') && ticket.satisfaction_status && (
                            <div className="border-t border-slate-100 pt-6">
                                <h4 className="text-sm font-semibold text-slate-900 mb-4 flex items-center gap-2">
                                    <Star className="w-4 h-4 text-amber-500" />
                                    Satisfaction Feedback
                                </h4>
                                <div className={`rounded-xl p-4 border ${
                                    ticket.satisfaction_status === 'satisfied' 
                                        ? 'bg-emerald-50 border-emerald-200' 
                                        : 'bg-rose-50 border-rose-200'
                                }`}>
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-3">
                                            <div className="flex">
                                                {ticket.rating ? (
                                                    [1, 2, 3, 4, 5].map((star) => (
                                                        <Star
                                                            key={star}
                                                            className={`w-5 h-5 ${
                                                                star <= ticket.rating
                                                                    ? 'fill-amber-400 text-amber-400'
                                                                    : 'text-slate-300'
                                                            }`}
                                                        />
                                                    ))
                                                ) : (
                                                    <span className="text-sm text-slate-500">No rating provided</span>
                                                )}
                                            </div>
                                            {ticket.rating && (
                                                <span className="text-sm font-bold text-slate-700">
                                                    {ticket.rating}/5
                                                </span>
                                            )}
                                        </div>
                                        <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${
                                            ticket.satisfaction_status === 'satisfied'
                                                ? 'bg-emerald-100 text-emerald-700'
                                                : 'bg-rose-100 text-rose-700'
                                        }`}>
                                            {ticket.satisfaction_status === 'satisfied' ? 'Satisfied' : 'Unsatisfied'}
                                        </span>
                                    </div>
                                    
                                    {ticket.rejection_count > 0 && (
                                        <div className="mt-3 flex items-center gap-2">
                                            <span className="text-xs text-amber-700 bg-amber-100 px-2 py-1 rounded">
                                                ⚠️ Rework attempts: {ticket.rejection_count}
                                            </span>
                                        </div>
                                    )}
                                    
                                    {ticket.customer_feedback && (
                                        <div className="mt-3 pt-3 border-t border-slate-200">
                                            <p className="text-xs text-slate-500 mb-1">Feedback:</p>
                                            <p className={`text-sm ${
                                                ticket.satisfaction_status === 'satisfied'
                                                    ? 'text-emerald-700'
                                                    : 'text-rose-700'
                                            }`}>
                                                {ticket.customer_feedback}
                                            </p>
                                        </div>
                                    )}
                                    
                                    {ticket.satisfaction_submitted_at && (
                                        <p className="text-xs text-slate-400 mt-3">
                                            Submitted: {new Date(ticket.satisfaction_submitted_at).toLocaleString()}
                                        </p>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Reporter and Technician Information */}
                        <div className="border-t border-slate-100 pt-6">
                            <h4 className="text-sm font-semibold text-slate-900 mb-4">People Involved</h4>
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
                                                {canReassignThisTicket && (
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
                                                {canReassignThisTicket && (
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
            ) : (
                    <div className="h-[calc(90vh-80px)] p-4">
                        <TicketChat
                            ticket={ticket}
                            isOpen={activeTab === 'chat'}
                            onClose={() => setActiveTab('details')}
                        />
                    </div>
                )}
            </div>
        </div>
    </div>
    );
}

// Management Action Form Component
function ManagementActionForm({ action, ticket, onCancel, onSubmit, onGetAISuggestion, loading, aiTyping, aiSuggestion }) {
    const [value, setValue] = useState('');
    const [reason, setReason] = useState('');

    const categories = [
        'Electrical', 'Plumbing', 'HVAC (Air Conditioning)', 'Carpentry & Furniture',
        'IT & Networking', 'General Maintenance', 'Painting', 'Civil Works',
        'Appliance Repair', 'Cleaning Services'
    ];
    
    const priorities = ['Low', 'Medium', 'High'];
    const statuses = ['Open', 'In Progress', 'Resolved', 'Closed', 'Escalated', 'Pending Verification'];

    const getOptions = () => {
        switch (action) {
            case 'recategorize':
                return categories;
            case 'reprioritize':
                return priorities;
            case 'change_status':
                return statuses;
            default:
                return [];
        }
    };

    const getCurrentValue = () => {
        switch (action) {
            case 'recategorize':
                return ticket.category;
            case 'reprioritize':
                return ticket.priority;
            case 'change_status':
                return ticket.status;
            default:
                return '';
        }
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        if (!value) return;
        onSubmit(action, value, reason);
    };

    const handleGetAISuggestion = () => {
        onGetAISuggestion(action);
    };

    const handleAcceptAISuggestion = () => {
        if (aiSuggestion?.suggested_value) {
            setValue(aiSuggestion.suggested_value);
            if (aiSuggestion.reasoning) {
                setReason(`AI: ${aiSuggestion.reasoning}`);
            }
        }
    };

    // Parse AI suggestion value from various formats
    const getAISuggestedValue = () => {
        if (!aiSuggestion) return null;
        // Handle different response formats from edge function
        if (aiSuggestion.suggested_value) return aiSuggestion.suggested_value;
        if (aiSuggestion.category) return aiSuggestion.category;
        if (aiSuggestion.status) return aiSuggestion.status;
        if (aiSuggestion.action_type) return aiSuggestion.action_type;
        return null;
    };

    const aiSuggestedValue = getAISuggestedValue();
    const isAIRecommended = aiSuggestedValue && aiSuggestedValue !== getCurrentValue();

    return (
        <form onSubmit={handleSubmit} className="bg-blue-50/50 rounded-xl p-4 border border-blue-100 space-y-3">
            <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-blue-700 capitalize">
                    {action.replace('_', ' ')} Ticket
                </span>
                <button
                    type="button"
                    onClick={onCancel}
                    className="text-xs text-blue-600 hover:text-blue-800"
                >
                    Cancel
                </button>
            </div>

            <div>
                <label className="block text-xs font-medium text-blue-700 mb-1">
                    New {action.replace('_', ' ')}
                </label>
                <select
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-blue-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
                    required
                >
                    <option value="">Select {action.replace('_', ' ')}</option>
                    {getOptions().map(opt => (
                        <option key={opt} value={opt} disabled={opt === getCurrentValue()}>
                            {opt} {opt === getCurrentValue() ? ' (current)' : ''}
                        </option>
                    ))}
                </select>
            </div>

            {/* AI Suggestion Display */}
            {aiSuggestion && (
                <div className="bg-gradient-to-r from-violet-50 to-purple-50 border border-violet-200 rounded-lg p-3 space-y-2">
                    <div className="flex items-center gap-2">
                        <Sparkles className="w-4 h-4 text-violet-600" />
                        <span className="text-xs font-semibold text-violet-900">AI Recommendation</span>
                        {aiSuggestion.confidence && (
                            <span className="text-[10px] bg-violet-200 text-violet-800 px-1.5 py-0.5 rounded-full">
                                {Math.round(aiSuggestion.confidence * 100)}% confidence
                            </span>
                        )}
                    </div>
                    
                    {aiSuggestedValue && (
                        <div className="text-sm">
                            <span className="text-violet-700 font-medium">Suggested: </span>
                            <span className="text-violet-900 font-semibold">{aiSuggestedValue}</span>
                        </div>
                    )}
                    
                    {aiSuggestion.reasoning && (
                        <p className="text-xs text-violet-700 leading-relaxed">
                            {aiSuggestion.reasoning}
                        </p>
                    )}
                    
                    {isAIRecommended && (
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={handleAcceptAISuggestion}
                            className="w-full border-violet-300 text-violet-700 hover:bg-violet-100 text-xs"
                        >
                            <Sparkles className="w-3 h-3 mr-1" />
                            Accept AI Suggestion
                        </Button>
                    )}
                </div>
            )}

            <div>
                <label className="block text-xs font-medium text-blue-700 mb-1">
                    Reason (optional)
                </label>
                <textarea
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="Why is this change needed?"
                    className="w-full px-3 py-2 text-sm border border-blue-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none bg-white"
                    rows={2}
                />
            </div>

            <div className="flex gap-2">
                <Button
                    type="submit"
                    disabled={loading || !value || value === getCurrentValue()}
                    isLoading={loading}
                    size="sm"
                    className="flex-1 bg-blue-600 hover:bg-blue-700 text-white"
                >
                    Update {action.replace('_', ' ')}
                </Button>
                
                {(action === 'recategorize' || action === 'change_status' || action === 'reprioritize') && (
                    <Button
                        type="button"
                        variant="outline"
                        onClick={handleGetAISuggestion}
                        disabled={loading || aiTyping}
                        size="sm"
                        className="border-blue-200 text-blue-700 hover:bg-blue-50"
                    >
                        {aiTyping ? (
                            <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                        ) : (
                            <Sparkles className="w-3 h-3 mr-1" />
                        )}
                        {aiSuggestion ? 'Refresh AI' : 'AI Suggest'}
                    </Button>
                )}
            </div>
        </form>
    );
}
