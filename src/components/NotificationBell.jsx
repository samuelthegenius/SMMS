/**
 * @file src/components/NotificationBell.jsx
 * @description Real-time Notification Component.
 * 
 * Key Features:
 * - Real-time Subscription: Listens for INSERT events on the 'notifications' table.
 * - Interactive UI: Dropdown menu for viewing and clearing alerts.
 * - Persistence: Recent alerts are fetched on mount to ensure offline updates are seen.
 */
import { useState, useEffect, useRef } from 'react';
import { Bell } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import clsx from 'clsx';

export default function NotificationBell() {
    const { user } = useAuth();
    const [notifications, setNotifications] = useState([]);
    const [unreadCount, setUnreadCount] = useState(0);
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef(null);

    // Close dropdown when clicking outside
    useEffect(() => {
        function handleClickOutside(event) {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
                setIsOpen(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, [dropdownRef]);

    useEffect(() => {
        if (!user) return;

        // 1. Initial Fetch
        const fetchNotifications = async () => {
            const { data } = await supabase
                .from('notifications')
                .select('*')
                .eq('user_id', user.id)
                .order('created_at', { ascending: false })
                .limit(10);

            if (data) {
                setNotifications(data);
                setUnreadCount(data.filter(n => !n.is_read).length);
            }
        };

        fetchNotifications();

        // 2. Real-time Subscription
        const subscription = supabase
            .channel('public:notifications')
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'notifications',
                filter: `user_id=eq.${user.id}`
            }, (payload) => {
                // Optimistic Update: Prepend new notification
                const newNotification = payload.new;
                setNotifications(prev => [newNotification, ...prev]);
                setUnreadCount(prev => prev + 1);
            })
            .subscribe();

        return () => {
            subscription.unsubscribe();
        };
    }, [user]);

    const handleMarkAsRead = async () => {
        if (unreadCount === 0) return;

        // Optimistic UI update
        setUnreadCount(0);
        setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));

        // Batch update in background
        await supabase
            .from('notifications')
            .update({ is_read: true })
            .eq('user_id', user.id)
            .eq('is_read', false);
    };

    const toggleDropdown = () => {
        if (!isOpen) {
            handleMarkAsRead(); // Auto-read when opening
        }
        setIsOpen(!isOpen);
    };

    return (
        <div className="relative" ref={dropdownRef}>
            {/* Bell Icon Trigger */}
            <button
                onClick={toggleDropdown}
                className="relative p-2 text-slate-400 hover:text-white transition-colors rounded-full hover:bg-white/10"
            >
                <Bell className="w-6 h-6" />
                {unreadCount > 0 && (
                    <span className="absolute top-1 right-1 flex h-4 w-4 items-center justify-center rounded-full bg-rose-500 text-[10px] font-bold text-white ring-2 ring-slate-900">
                        {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                )}
            </button>

            {/* Dropdown Menu */}
            {isOpen && (
                <div className="absolute left-0 mt-3 w-80 bg-white rounded-xl shadow-lg border border-slate-100 ring-1 ring-black/5 z-50 overflow-hidden origin-top-left">
                    <div className="p-4 border-b border-slate-50 bg-slate-50/50 flex justify-between items-center">
                        <h3 className="font-semibold text-slate-900">Notifications</h3>
                        <span className="text-xs text-slate-500">{notifications.length} recent</span>
                    </div>

                    <div className="max-h-[300px] overflow-y-auto">
                        {notifications.length === 0 ? (
                            <div className="p-8 text-center text-slate-500 text-sm">
                                No notifications yet.
                            </div>
                        ) : (
                            <ul className="divide-y divide-slate-50">
                                {notifications.map((notification) => (
                                    <li key={notification.id} className={clsx(
                                        "p-4 hover:bg-slate-50 transition-colors",
                                        !notification.is_read ? "bg-blue-50/30" : ""
                                    )}>
                                        <p className="text-sm text-slate-800 leading-relaxed">
                                            {notification.message}
                                        </p>
                                        <p className="text-xs text-slate-400 mt-1.5 font-medium">
                                            {new Date(notification.created_at).toLocaleString()}
                                        </p>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
