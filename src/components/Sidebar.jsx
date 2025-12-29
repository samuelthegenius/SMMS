import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import {
    LayoutDashboard,
    PlusCircle,
    LogOut,
    Wrench,
    History,
    BarChart,
    Settings
} from 'lucide-react';
import clsx from 'clsx';
import { Button } from './ui/Button';

export default function Sidebar({ isOpen, onClose }) {
    const { profile } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();

    const handleLogout = async () => {
        await supabase.auth.signOut();
        navigate('/login');
    };

    const navItems = [
        { label: 'Dashboard', path: '/dashboard', icon: LayoutDashboard },
        { label: 'Analytics', path: '/analytics', icon: BarChart, roles: ['admin'] },
        { label: 'New Ticket', path: '/new-ticket', icon: PlusCircle, roles: ['student', 'staff', 'admin'] },
        { label: 'My History', path: '/history', icon: History, roles: ['student', 'staff'] },
        { label: 'Jobs', path: '/jobs', icon: Wrench, roles: ['technician'] },
    ];

    const filteredNavItems = navItems.filter(item =>
        !item.roles || item.roles.includes(profile?.role)
    );

    return (
        <>
            {/* Sidebar Container */}
            <aside className={clsx(
                "fixed inset-y-0 left-0 z-40 w-64 bg-gradient-to-b from-primary to-slate-900 text-white transform transition-transform duration-300 ease-in-out md:translate-x-0 md:static md:flex flex-col shadow-2xl",
                isOpen ? "translate-x-0" : "-translate-x-full"
            )}>
                {/* Header */}
                <div className="p-6 border-b border-white/10 hidden md:block">
                    <div className="flex items-center gap-3">
                        <div className="bg-white/10 p-2 rounded-xl backdrop-blur-sm">
                            <Wrench className="w-6 h-6 text-accent" />
                        </div>
                        <div>
                            <h1 className="text-lg font-bold leading-none tracking-tight">SMMS</h1>
                            <p className="text-xs text-slate-400 mt-1">Mountain Top Univ.</p>
                        </div>
                    </div>
                </div>

                {/* Navigation */}
                <div className="flex-1 overflow-y-auto py-6 px-4 space-y-1">
                    <p className="px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider mb-4">Menu</p>
                    {filteredNavItems.map((item) => {
                        const Icon = item.icon;
                        const isActive = location.pathname === item.path;
                        return (
                            <Link
                                key={item.path}
                                to={item.path}
                                onClick={onClose}
                                className={clsx(
                                    'flex items-center gap-3 px-4 py-3 text-sm font-medium rounded-xl transition-all duration-200 group relative overflow-hidden',
                                    isActive
                                        ? 'text-white bg-white/10 shadow-lg shadow-black/10'
                                        : 'text-slate-400 hover:text-white hover:bg-white/5'
                                )}
                            >
                                {isActive && <div className="absolute left-0 top-0 bottom-0 w-1 bg-accent rounded-r-full" />}
                                <Icon className={clsx("w-5 h-5 transition-colors", isActive ? "text-accent" : "text-slate-500 group-hover:text-accent")} />
                                {item.label}
                            </Link>
                        );
                    })}
                </div>

                {/* User Profile & Logout */}
                <div className="p-4 border-t border-white/10 bg-black/20 backdrop-blur-sm">
                    <div className="flex items-center gap-3 px-4 py-3 mb-4 rounded-xl bg-white/5 border border-white/5">
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-accent to-orange-600 flex items-center justify-center text-white font-bold shadow-md">
                            {profile?.full_name?.[0] || 'U'}
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-white truncate">
                                {profile?.full_name}
                            </p>
                            <p className="text-xs text-slate-400 truncate capitalize">
                                {profile?.role?.replace('_', ' ')}
                            </p>
                        </div>
                    </div>
                    <Button
                        onClick={handleLogout}
                        variant="ghost"
                        className="w-full justify-start text-rose-300 hover:text-rose-200 hover:bg-rose-500/10"
                    >
                        <LogOut className="w-4 h-4 mr-2" />
                        Sign Out
                    </Button>
                </div>
            </aside>

            {/* Mobile Overlay */}
            {isOpen && (
                <div
                    className="fixed inset-0 bg-slate-900/60 z-30 md:hidden backdrop-blur-sm transition-opacity"
                    onClick={onClose}
                />
            )}
        </>
    );
}
