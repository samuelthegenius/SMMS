import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/useAuth';
import { Button } from './ui/Button';
import { toast } from 'sonner';
import {
    Send,
    Bot,
    User,
    Wrench,
    Shield,
    MoreVertical,
    Trash2,
    Pencil,
    Check,
    Sparkles,
    Clock,
    CornerDownRight,
    Loader2,
    MessageSquare,
    X
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import ReactMarkdown from 'react-markdown';

/**
 * TicketChat Component
 * 
 * Provides per-ticket chat functionality with:
 * - Real-time messaging between users, technicians, and admins
 * - AI assistant integration for troubleshooting and ticket management
 * - Internal notes for staff
 * - Threaded replies
 * - Message editing (within time limit)
 * - AI-powered ticket management (recategorize, reprioritize, status change)
 */

export default function TicketChat({ ticket, onClose, isOpen }) {
    const { user, profile } = useAuth();
    const [messages, setMessages] = useState([]);
    const [newMessage, setNewMessage] = useState('');
    const [loading, setLoading] = useState(false);
    const [sending, setSending] = useState(false);
    const [aiTyping, setAiTyping] = useState(false);
    const [isInternal, setIsInternal] = useState(false);
    const [replyingTo, setReplyingTo] = useState(null);
    const [showAiPanel, setShowAiPanel] = useState(false);
    const [editingMessage, setEditingMessage] = useState(null);
    const [editText, setEditText] = useState('');
    const messagesEndRef = useRef(null);
    const inputRef = useRef(null);

    const isStaff = profile?.role === 'technician' || profile?.role === 'admin';
    const isAdmin = profile?.role === 'admin';

    // Determine user role in context of this ticket
    const getUserContext = () => {
        if (ticket.created_by === user?.id) return 'creator';
        if (ticket.assigned_to === user?.id) return 'assignee';
        if (isAdmin) return 'admin';
        return 'viewer';
    };

    const userContext = getUserContext();

    // Fetch messages
    const fetchMessages = useCallback(async () => {
        if (!ticket?.id) return;

        setLoading(true);
        try {
            const { data, error } = await supabase
                .rpc('get_ticket_chat', {
                    p_ticket_id: ticket.id,
                    p_include_internal: isStaff
                });

            if (error) throw error;
            setMessages(data || []);
        } catch {
            toast.error('Failed to load chat messages');
        } finally {
            setLoading(false);
        }
    }, [ticket?.id, isStaff]);

    // Initial fetch
    useEffect(() => {
        if (isOpen) {
            fetchMessages();
        }
    }, [isOpen, fetchMessages]);

    // Subscribe to real-time updates
    useEffect(() => {
        if (!ticket?.id || !isOpen) return;

        const channel = supabase
            .channel(`ticket_chat_${ticket.id}`)
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'ticket_messages',
                filter: `ticket_id=eq.${ticket.id}`,
            }, (payload) => {
                // Add new message if not from current user
                if (payload.new.sender_id !== user?.id) {
                    setMessages(prev => [...prev, payload.new]);
                    scrollToBottom();
                }
            })
            .on('postgres_changes', {
                event: 'UPDATE',
                schema: 'public',
                table: 'ticket_messages',
                filter: `ticket_id=eq.${ticket.id}`,
            }, (payload) => {
                // Update existing message
                setMessages(prev =>
                    prev.map(m => m.id === payload.new.id ? payload.new : m)
                );
            })
            .subscribe();

        return () => {
            channel.unsubscribe();
        };
    }, [ticket?.id, isOpen, user?.id]);

    // Auto-scroll to bottom
    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages, aiTyping]);

    // Send message
    const handleSendMessage = async (e) => {
        e?.preventDefault();
        if (!newMessage.trim() || sending) return;

        const messageText = newMessage.trim();
        setNewMessage('');
        setSending(true);

        // Optimistically add message
        const optimisticMessage = {
            id: `temp-${Date.now()}`,
            ticket_id: ticket.id,
            sender_id: user.id,
            sender_type: userContext === 'assignee' ? 'technician' : userContext === 'admin' ? 'admin' : 'user',
            sender_name: profile?.full_name || 'You',
            sender_role: profile?.role,
            message: messageText,
            message_type: 'text',
            is_internal: isInternal,
            parent_message_id: replyingTo?.id || null,
            created_at: new Date().toISOString(),
            pending: true,
        };

        setMessages(prev => [...prev, optimisticMessage]);
        setReplyingTo(null);

        try {
            const { data, error } = await supabase
                .from('ticket_messages')
                .insert({
                    ticket_id: ticket.id,
                    sender_id: user.id,
                    sender_type: optimisticMessage.sender_type,
                    message: messageText,
                    message_type: 'text',
                    is_internal: isInternal,
                    parent_message_id: replyingTo?.id || null,
                })
                .select(`
                    id,
                    ticket_id,
                    sender_id,
                    sender_type,
                    message,
                    message_type,
                    is_internal,
                    parent_message_id,
                    created_at,
                    edited_at,
                    sender:sender_id(full_name, role)
                `)
                .single();

            if (error) throw error;

            // Replace optimistic message with real one
            setMessages(prev =>
                prev.map(m =>
                    m.id === optimisticMessage.id
                        ? { ...data, sender_name: data.sender?.full_name, sender_role: data.sender?.role }
                        : m
                )
            );

        } catch {
            toast.error('Failed to send message');
            // Remove optimistic message
            setMessages(prev => prev.filter(m => m.id !== optimisticMessage.id));
        } finally {
            setSending(false);
        }
    };

    // Delete message (soft delete)
    const handleDeleteMessage = async (messageId) => {
        if (!user?.id) {
            toast.error('Authentication required');
            return;
        }
        try {
            const updateData = {
                is_deleted: true,
                deleted_at: new Date().toISOString(),
                deleted_by: user.id,
            };

            let query = supabase
                .from('ticket_messages')
                .update(updateData)
                .eq('id', messageId);

            // Non-admins can only delete their own messages (enforced in RLS too)
            if (!isAdmin) {
                query = query.eq('sender_id', user.id);
            }

            const { error } = await query;

            if (error) {
                console.error('Delete message error:', error);
                throw error;
            }

            setMessages(prev =>
                prev.map(m =>
                    m.id === messageId
                        ? { ...m, is_deleted: true, deleted_at: new Date().toISOString(), deleted_by: user.id }
                        : m
                )
            );
            toast.success('Message deleted');
        } catch (err) {
            console.error('Failed to delete message:', err);
            toast.error('Failed to delete message: ' + (err.message || 'Unknown error'));
        }
    };

    // Get AI assistance
    const handleAskAI = async () => {
        if (!newMessage.trim()) {
            toast.info('Type a question for the AI assistant');
            return;
        }

        const question = newMessage.trim();
        setNewMessage('');
        setAiTyping(true);

        // Add user message
        const userMessage = {
            id: `temp-${Date.now()}`,
            ticket_id: ticket.id,
            sender_id: user.id,
            sender_type: userContext === 'assignee' ? 'technician' : 'user',
            sender_name: profile?.full_name || 'You',
            sender_role: profile?.role,
            message: question,
            message_type: 'text',
            is_internal: false,
            created_at: new Date().toISOString(),
        };
        setMessages(prev => [...prev, userMessage]);

        try {
            const { data, error } = await supabase.functions.invoke('ai-chat-assistant', {
                body: {
                    ticket_id: ticket.id,
                    message: question,
                    chat_history: messages.slice(-10),
                    action: 'chat',
                },
            });

            if (error) throw error;

            // AI response will come through real-time subscription
            // But we can show it immediately for better UX
            const aiMessage = {
                id: data.message_id || `ai-${Date.now()}`,
                ticket_id: ticket.id,
                sender_id: null,
                sender_type: 'ai',
                sender_name: 'AI Assistant',
                sender_role: 'ai',
                message: data.response,
                message_type: 'ai_suggestion',
                ai_context: data.context,
                is_internal: false,
                created_at: new Date().toISOString(),
            };

            setMessages(prev => [...prev, aiMessage]);

        } catch {
            toast.error('AI assistant temporarily unavailable');
        } finally {
            setAiTyping(false);
        }
    };

    // Get AI fix suggestion
    const handleGetFixSuggestion = async () => {
        setAiTyping(true);
        try {
            const { data, error } = await supabase.functions.invoke('ai-chat-assistant', {
                body: {
                    ticket_id: ticket.id,
                    message: 'suggest_fix',
                    action: 'suggest_fix',
                },
            });

            if (error) throw error;

            const aiMessage = {
                id: `ai-${Date.now()}`,
                ticket_id: ticket.id,
                sender_id: null,
                sender_type: 'ai',
                sender_name: 'AI Assistant',
                sender_role: 'ai',
                message: data.suggestion,
                message_type: 'ai_suggestion',
                is_internal: false,
                created_at: new Date().toISOString(),
            };

            setMessages(prev => [...prev, aiMessage]);
            toast.success('AI fix suggestion generated');

        } catch (err) {
            toast.error('Failed to get AI suggestion');
        } finally {
            setAiTyping(false);
        }
    };

    // Get sender icon based on role
    const getSenderIcon = (senderType) => {
        switch (senderType) {
            case 'ai':
                return <Bot className="w-4 h-4" />;
            case 'technician':
                return <Wrench className="w-4 h-4" />;
            case 'admin':
                return <Shield className="w-4 h-4" />;
            default:
                return <User className="w-4 h-4" />;
        }
    };

    // Get sender color based on role
    const getSenderColor = (senderType) => {
        switch (senderType) {
            case 'ai':
                return 'bg-gradient-to-r from-violet-500 to-purple-600 text-white';
            case 'technician':
                return 'bg-emerald-100 text-emerald-700';
            case 'admin':
                return 'bg-blue-100 text-blue-700';
            default:
                return 'bg-slate-100 text-slate-700';
        }
    };

    // Check if message can be deleted/edited
    const canModify = (msg) => {
        if (msg.is_deleted) return false; // Deleted messages cannot be modified
        if (msg.sender_type === 'ai' || msg.sender_type === 'system') return false;
        // Admins can edit/delete any message, regardless of time or sender
        if (isAdmin) return true;
        // Non-admins can only edit their own messages within 5 minutes
        if (msg.sender_id !== user?.id) return false;
        const fiveMinutes = 5 * 60 * 1000;
        return new Date() - new Date(msg.created_at) < fiveMinutes;
    };

    // Get display message content (handles deleted messages)
    const getDisplayMessage = (msg) => {
        if (msg.is_deleted) return '[Message deleted]';
        return msg.message;
    };

    // Start editing a message
    const handleStartEdit = (msg) => {
        if (msg.is_deleted) return; // Cannot edit deleted messages
        setEditingMessage(msg.id);
        setEditText(msg.message);
    };

    // Cancel editing
    const handleCancelEdit = () => {
        setEditingMessage(null);
        setEditText('');
    };

    // Save edited message
    const handleSaveEdit = async (messageId) => {
        if (!editText.trim()) return;
        if (!user?.id) {
            toast.error('Authentication required');
            return;
        }
        try {
            const updateData = {
                message: editText.trim(),
                edited_at: new Date().toISOString(),
            };

            let query = supabase
                .from('ticket_messages')
                .update(updateData)
                .eq('id', messageId);

            // Non-admins can only edit their own messages (enforced in RLS too)
            if (!isAdmin) {
                query = query.eq('sender_id', user.id);
            }

            const { error } = await query;

            if (error) {
                console.error('Edit message error:', error);
                throw error;
            }

            setMessages(prev =>
                prev.map(m =>
                    m.id === messageId
                        ? { ...m, message: editText.trim(), edited_at: new Date().toISOString() }
                        : m
                )
            );
            setEditingMessage(null);
            setEditText('');
        } catch (err) {
            console.error('Failed to edit message:', err);
            toast.error('Failed to edit message: ' + (err.message || 'Unknown error'));
        }
    };

    if (!isOpen) return null;

    return (
        <div className="flex flex-col h-full bg-white rounded-xl border border-slate-200 shadow-lg overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 bg-slate-50 border-b border-slate-200">
                <div className="flex items-center gap-2">
                    <div className="p-1.5 bg-primary-100 rounded-lg">
                        <MessageSquare className="w-4 h-4 text-primary-600" />
                    </div>
                    <div>
                        <h3 className="font-semibold text-slate-900 text-sm">Ticket Chat</h3>
                        <p className="text-xs text-slate-500">
                            {messages.length} {messages.length === 1 ? 'message' : 'messages'}
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    {isStaff && (
                        <button
                            onClick={() => setShowAiPanel(!showAiPanel)}
                            className={`p-2 rounded-lg transition-colors ${
                                showAiPanel ? 'bg-violet-100 text-violet-600' : 'hover:bg-slate-200 text-slate-500'
                            }`}
                            title="AI Assistant"
                        >
                            <Sparkles className="w-4 h-4" />
                        </button>
                    )}
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-slate-200 rounded-lg text-slate-500 transition-colors"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>
            </div>

            {/* AI Assistant Panel */}
            {showAiPanel && isStaff && (
                <div className="bg-gradient-to-r from-violet-50 to-purple-50 border-b border-violet-100 p-3">
                    <div className="flex items-center gap-2 mb-2">
                        <Bot className="w-4 h-4 text-violet-600" />
                        <span className="text-sm font-medium text-violet-900">AI Assistant</span>
                    </div>
                    <div className="flex gap-2 flex-wrap">
                        <Button
                            size="sm"
                            variant="outline"
                            onClick={handleGetFixSuggestion}
                            disabled={aiTyping}
                            className="text-xs border-violet-200 text-violet-700 hover:bg-violet-100"
                        >
                            {aiTyping ? (
                                <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                            ) : (
                                <Wrench className="w-3 h-3 mr-1" />
                            )}
                            Get Fix Suggestion
                        </Button>
                        <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                                setNewMessage('What tools do I need for this repair?');
                                inputRef.current?.focus();
                            }}
                            className="text-xs border-violet-200 text-violet-700 hover:bg-violet-100"
                        >
                            <Sparkles className="w-3 h-3 mr-1" />
                            Ask for Tools
                        </Button>
                    </div>
                </div>
            )}

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50/50">
                {loading ? (
                    <div className="flex items-center justify-center h-32">
                        <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
                    </div>
                ) : messages.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-32 text-slate-400">
                        <MessageSquare className="w-8 h-8 mb-2 opacity-50" />
                        <p className="text-sm">No messages yet</p>
                        <p className="text-xs">Start the conversation</p>
                    </div>
                ) : (
                    messages.map((msg, index) => {
                        const isOwn = msg.sender_id === user?.id;
                        const showHeader = index === 0 || messages[index - 1].sender_id !== msg.sender_id;

                        return (
                            <div
                                key={msg.id}
                                className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}
                            >
                                <div className={`max-w-[85%] ${isOwn ? 'order-2' : 'order-1'}`}>
                                    {/* Sender header */}
                                    {showHeader && (
                                        <div className={`flex items-center gap-1.5 mb-1 ${isOwn ? 'justify-end' : ''}`}>
                                            <div className={`p-1 rounded ${getSenderColor(msg.sender_type)}`}>
                                                {getSenderIcon(msg.sender_type)}
                                            </div>
                                            <span className="text-xs font-medium text-slate-600">
                                                {msg.sender_name || 'Unknown'}
                                            </span>
                                            {msg.is_internal && (
                                                <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">
                                                    Internal
                                                </span>
                                            )}
                                        </div>
                                    )}

                                    {/* Message content */}
                                    <div
                                        className={`relative group rounded-2xl px-4 py-2.5 text-sm ${
                                            isOwn
                                                ? 'bg-primary-500 text-white rounded-br-md'
                                                : msg.sender_type === 'ai'
                                                ? 'bg-gradient-to-r from-violet-50 to-purple-50 text-violet-900 border border-violet-100 rounded-bl-md'
                                                : msg.sender_type === 'system'
                                                ? 'bg-slate-100 text-slate-500 italic rounded-bl-md'
                                                : 'bg-white text-slate-700 border border-slate-200 rounded-bl-md'
                                        }`}
                                    >
                                        {/* Reply indicator */}
                                        {msg.parent_message_id && (
                                            <div className="flex items-center gap-1 mb-1 text-xs opacity-70">
                                                <CornerDownRight className="w-3 h-3" />
                                                <span>Replying</span>
                                            </div>
                                        )}

                                        {editingMessage === msg.id ? (
                                            <div className="flex flex-col gap-2">
                                                <input
                                                    type="text"
                                                    value={editText}
                                                    onChange={(e) => setEditText(e.target.value)}
                                                    onKeyDown={(e) => {
                                                        if (e.key === 'Enter') handleSaveEdit(msg.id);
                                                        if (e.key === 'Escape') handleCancelEdit();
                                                    }}
                                                    className="px-2 py-1 bg-white/20 rounded text-sm focus:outline-none focus:ring-1 focus:ring-white/50"
                                                    autoFocus
                                                />
                                                <div className="flex gap-1">
                                                    <button
                                                        onClick={() => handleSaveEdit(msg.id)}
                                                        className="p-1 bg-white/20 rounded hover:bg-white/30"
                                                        title="Save"
                                                    >
                                                        <Check className="w-3 h-3" />
                                                    </button>
                                                    <button
                                                        onClick={handleCancelEdit}
                                                        className="p-1 bg-white/20 rounded hover:bg-white/30"
                                                        title="Cancel"
                                                    >
                                                        <X className="w-3 h-3" />
                                                    </button>
                                                </div>
                                            </div>
                                        ) : msg.sender_type === 'ai' ? (
                                            <div className="ai-markdown">
                                                <ReactMarkdown>{getDisplayMessage(msg)}</ReactMarkdown>
                                            </div>
                                        ) : (
                                            <div className={`whitespace-pre-wrap ${msg.is_deleted ? 'italic opacity-60' : ''}`}>
                                                {getDisplayMessage(msg)}
                                            </div>
                                        )}

                                        {/* Timestamp and actions */}
                                        <div className={`flex items-center gap-2 mt-1 text-[10px] ${
                                            isOwn ? 'text-primary-200' : 'text-slate-400'
                                        }`}>
                                            <span className="flex items-center gap-0.5">
                                                <Clock className="w-3 h-3" />
                                                {formatDistanceToNow(new Date(msg.created_at), { addSuffix: true })}
                                            </span>
                                            {msg.edited_at && <span>(edited)</span>}

                                            {/* Actions */}
                                            <div className={`flex items-center gap-1 ${isOwn ? 'ml-2' : 'ml-auto'}`}>
                                                {canModify(msg) && editingMessage !== msg.id && (
                                                    <>
                                                        <button
                                                            onClick={() => handleStartEdit(msg)}
                                                            className="opacity-0 group-hover:opacity-100 p-1 hover:bg-white/20 rounded transition-all"
                                                            title="Edit"
                                                        >
                                                            <Pencil className="w-3 h-3" />
                                                        </button>
                                                        <button
                                                            onClick={() => handleDeleteMessage(msg.id)}
                                                            className="opacity-0 group-hover:opacity-100 p-1 hover:bg-white/20 rounded transition-all"
                                                            title="Delete"
                                                        >
                                                            <Trash2 className="w-3 h-3" />
                                                        </button>
                                                    </>
                                                )}
                                                <button
                                                    onClick={() => setReplyingTo(msg)}
                                                    className="opacity-0 group-hover:opacity-100 p-1 hover:bg-white/20 rounded transition-all"
                                                    title="Reply"
                                                >
                                                    <CornerDownRight className="w-3 h-3" />
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        );
                    })
                )}

                {/* AI typing indicator */}
                {aiTyping && (
                    <div className="flex justify-start">
                        <div className="bg-violet-50 border border-violet-100 rounded-2xl rounded-bl-md px-4 py-3">
                            <div className="flex items-center gap-2 text-violet-600">
                                <Bot className="w-4 h-4" />
                                <div className="flex gap-1">
                                    <span className="w-1.5 h-1.5 bg-violet-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                                    <span className="w-1.5 h-1.5 bg-violet-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                                    <span className="w-1.5 h-1.5 bg-violet-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                <div ref={messagesEndRef} />
            </div>

            {/* Reply indicator */}
            {replyingTo && (
                <div className="px-4 py-2 bg-slate-100 border-y border-slate-200 flex items-center justify-between">
                    <div className="flex items-center gap-2 text-xs text-slate-600">
                        <CornerDownRight className="w-3 h-3" />
                        <span>Replying to {replyingTo.sender_name || 'message'}</span>
                    </div>
                    <button
                        onClick={() => setReplyingTo(null)}
                        className="p-1 hover:bg-slate-200 rounded text-slate-500"
                    >
                        <X className="w-3 h-3" />
                    </button>
                </div>
            )}

            {/* Input area */}
            <form onSubmit={handleSendMessage} className="p-3 bg-white border-t border-slate-200">
                {isStaff && (
                    <div className="flex items-center gap-2 mb-2">
                        <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={isInternal}
                                onChange={(e) => setIsInternal(e.target.checked)}
                                className="rounded border-slate-300 text-primary-600 focus:ring-primary-500"
                            />
                            <span>Internal note (staff only)</span>
                        </label>
                    </div>
                )}

                <div className="flex gap-2">
                    <input
                        ref={inputRef}
                        type="text"
                        value={newMessage}
                        onChange={(e) => setNewMessage(e.target.value)}
                        placeholder={isInternal ? "Add internal note..." : "Type a message..."}
                        disabled={sending}
                        className="flex-1 px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent disabled:opacity-50"
                    />

                    {isStaff && (
                        <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            onClick={handleAskAI}
                            disabled={sending || !newMessage.trim()}
                            className="shrink-0 border-violet-200 text-violet-600 hover:bg-violet-50"
                            title="Ask AI"
                        >
                            <Sparkles className="w-4 h-4" />
                        </Button>
                    )}

                    <Button
                        type="submit"
                        disabled={sending || !newMessage.trim()}
                        isLoading={sending}
                        size="icon"
                        className="shrink-0"
                    >
                        <Send className="w-4 h-4" />
                    </Button>
                </div>
            </form>
        </div>
    );
}

