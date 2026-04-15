import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/useAuth';
import { Bell, Check } from 'lucide-react';
import { toast } from 'sonner';

export default function NotificationBell() {
    const { user } = useAuth();
    const [notifications, setNotifications] = useState([]);
    const [unreadCount, setUnreadCount] = useState(0);
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef(null);

    const fetchNotifications = useCallback(async () => {
        if (!user?.id) return;
        
        try {
            const { data, error } = await supabase
                .from('notifications')
                .select('*')
                .eq('user_id', user.id)
                .order('created_at', { ascending: false })
                .limit(10);

            if (error) throw error;

            setNotifications(data);

            // Count all unread (not just the fetched ones if possible, but distinct count helps)
            // For simple UI, we assume correct sync. To be precise with count:
            const { count } = await supabase
                .from('notifications')
                .select('*', { count: 'exact', head: true })
                .eq('user_id', user.id)
                .eq('is_read', false);

            setUnreadCount(count || 0);

        } catch (error) {
          if (import.meta.env.DEV) {
            console.error('Error fetching notifications:', error);
          }
        }
    }, [user?.id]);

    // Keep a stable ref to the active channel so we can safely unsubscribe
    const channelRef = useRef(null);
    // Track whether WE created this channel so cleanup only removes ones we own
    const channelOwnedRef = useRef(false);

    useEffect(() => {
        if (!user?.id) return;

        fetchNotifications();

        const channelName = `notifications:${user.id}`;

        // supabase.removeChannel() is async — it sends a LEAVE over WebSocket
        // but resolves asynchronously. If React re-runs this effect before the
        // previous cleanup finishes, supabase.channel(name) returns the SAME
        // still-subscribed instance, and calling .on() on it throws:
        //   "cannot add postgres_changes callbacks after subscribe()"
        //
        // Guard: check whether this channel already exists in the client registry.
        // If it does, reuse it without calling .on() — the listener is still active.
        const existing = supabase
            .getChannels()
            .find(ch => ch.topic === `realtime:${channelName}`);

        if (existing) {
            channelRef.current = existing;
            channelOwnedRef.current = false; // don't remove on cleanup — we didn't create it
        } else {
            try {
                const channel = supabase
                    .channel(channelName)
                    .on(
                        'postgres_changes',
                        {
                            event: 'INSERT',
                            schema: 'public',
                            table: 'notifications',
                            filter: `user_id=eq.${user.id}`,
                        },
                        (payload) => {
                            const newNotification = payload.new;
                            setNotifications((prev) => [newNotification, ...prev]);
                            setUnreadCount((prev) => prev + 1);
                            toast.info('New Notification: ' + newNotification.message);
                        }
                    )
                    .subscribe();

                channelRef.current = channel;
                channelOwnedRef.current = true;
            } catch (err) {
                if (import.meta.env.DEV) {
                    console.error('NotificationBell: failed to subscribe to realtime channel:', err);
                }
            }
        }

        function handleClickOutside(event) {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
                setIsOpen(false);
            }
        }
        document.addEventListener('mousedown', handleClickOutside);

        return () => {
            // Only remove channels we explicitly created — not ones inherited from
            // a previous render that hasn't cleaned up yet.
            if (channelRef.current && channelOwnedRef.current) {
                supabase.removeChannel(channelRef.current);
                channelRef.current = null;
                channelOwnedRef.current = false;
            }
            document.removeEventListener('mousedown', handleClickOutside);
        };
    // Only re-subscribe when the user ID actually changes
    }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps


    const handleToggle = async () => {
        const newIsOpen = !isOpen;
        setIsOpen(newIsOpen);

        if (newIsOpen && unreadCount > 0) {
            await markAllAsRead();
        }
    };

    const markAllAsRead = async () => {
        try {
            // Optimistic update
            setUnreadCount(0);

            // Visual update: mark currently loaded list as read too
            setNotifications(notifications.map(n => ({ ...n, is_read: true })));

            const { error } = await supabase
                .from('notifications')
                .update({ is_read: true })
                .eq('user_id', user.id)
                .eq('is_read', false);

            if (error) throw error;
        } catch (error) {
          if (import.meta.env.DEV) {
            console.error('Failed to mark notifications as read', error);
          }
            // Revert on error? Or just silently fail as it's not critical data loss
        }
    }

    return (
        <div className="relative" ref={dropdownRef}>
            <button
                onClick={handleToggle}
                className="relative p-2.5 rounded-xl hover:bg-slate-100 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-accent/50 active:scale-95"
            >
                <Bell className="w-5 h-5 text-slate-600" />
                {unreadCount > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white shadow-md shadow-red-500/30 ring-2 ring-white animate-bounce-soft">
                        {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                )}
            </button>

            {isOpen && (
                <div className="absolute right-0 mt-3 w-80 bg-white rounded-2xl shadow-2xl shadow-slate-900/10 border border-slate-100 py-2 z-50 animate-scale-in origin-top-right overflow-hidden">
                    <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-slate-50/50">
                        <h3 className="font-bold text-slate-900">Notifications</h3>
                        {unreadCount > 0 && (
                            <span className="text-xs font-medium text-accent bg-accent/10 px-2 py-1 rounded-full">
                                {unreadCount} new
                            </span>
                        )}
                    </div>

                    <div className="max-h-[320px] overflow-y-auto">
                        {notifications.length === 0 ? (
                            <div className="p-8 text-center">
                                <div className="mx-auto h-12 w-12 bg-slate-100 rounded-full flex items-center justify-center mb-3">
                                    <Bell className="h-6 w-6 text-slate-400" />
                                </div>
                                <p className="text-slate-500 text-sm">No notifications yet</p>
                            </div>
                        ) : (
                            <div className="divide-y divide-slate-50">
                                {notifications.map((notification) => (
                                    <div
                                        key={notification.id}
                                        className={`p-4 transition-all duration-200 cursor-pointer ${!notification.is_read ? 'bg-accent/5 border-l-2 border-l-accent' : 'hover:bg-slate-50 border-l-2 border-l-transparent'}`}
                                    >
                                        <div className="flex gap-3 items-start">
                                            <div className="flex-1 space-y-1">
                                                <p className={`text-sm ${!notification.is_read ? 'font-semibold text-slate-900' : 'text-slate-600'}`}>
                                                    {notification.message}
                                                </p>
                                                <p className="text-xs text-slate-400 font-medium">
                                                    {new Date(notification.created_at).toLocaleString()}
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
