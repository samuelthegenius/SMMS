import { Outlet, Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import {
    LayoutDashboard,
    PlusCircle,
    LogOut,
    User,
    Settings,
    Wrench,
    History,
    Menu,
    X
} from 'lucide-react';
import clsx from 'clsx';
import { useState } from 'react';

export default function Layout() {
    const { profile } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

    const handleLogout = async () => {
        await supabase.auth.signOut();
        navigate('/login');
    };

    const navItems = [
        { label: 'Dashboard', path: '/dashboard', icon: LayoutDashboard },
        { label: 'New Ticket', path: '/new-ticket', icon: PlusCircle, roles: ['student', 'staff_member'] },
        { label: 'My History', path: '/history', icon: History, roles: ['student', 'staff_member'] },
        { label: 'Jobs', path: '/jobs', icon: Wrench, roles: ['technician'] },
    ];

    const filteredNavItems = navItems.filter(item =>
        !item.roles || item.roles.includes(profile?.role)
    );

    const toggleMobileMenu = () => setIsMobileMenuOpen(!isMobileMenuOpen);

    return (
        <div className="min-h-screen bg-slate-50 flex">
            {/* Mobile Header */}
            <div className="md:hidden fixed top-0 left-0 right-0 bg-primary text-white p-4 flex items-center justify-between z-50 shadow-md">
                <div className="flex items-center gap-2 font-bold text-lg">
                    <Wrench className="w-6 h-6 text-secondary" />
                    MTU Smart Maintenance
                </div>
                <button onClick={toggleMobileMenu} className="p-2 hover:bg-white/10 rounded-lg">
                    {isMobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
                </button>
            </div>

            {/* Sidebar */}
            <aside className={clsx(
                "fixed inset-y-0 left-0 z-40 w-64 bg-primary text-white transform transition-transform duration-300 ease-in-out md:translate-x-0 md:static md:flex flex-col shadow-xl",
                isMobileMenuOpen ? "translate-x-0" : "-translate-x-full"
            )}>
                <div className="p-6 border-b border-white/10 hidden md:block">
                    <div className="flex items-center gap-3 mb-1">
                        <div className="bg-white/10 p-2 rounded-lg">
                            <Wrench className="w-6 h-6 text-secondary" />
                        </div>
                        <h1 className="text-lg font-bold leading-tight">
                            MTU Smart <br /> Maintenance
                        </h1>
                    </div>
                    <p className="text-xs text-slate-400 font-medium tracking-wide uppercase pl-1">Campus Facility Management</p>
                </div>

                <div className="flex-1 overflow-y-auto py-6 px-4 space-y-2">
                    <p className="px-4 text-xs font-semibold text-slate-400 uppercase tracking-wider mb-4">Menu</p>
                    {filteredNavItems.map((item) => {
                        const Icon = item.icon;
                        const isActive = location.pathname === item.path;
                        return (
                            <Link
                                key={item.path}
                                to={item.path}
                                onClick={() => setIsMobileMenuOpen(false)}
                                className={clsx(
                                    'flex items-center gap-3 px-4 py-3 text-sm font-medium rounded-xl transition-all duration-200',
                                    isActive
                                        ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/20'
                                        : 'text-slate-300 hover:bg-white/10 hover:text-white'
                                )}
                            >
                                <Icon className={clsx("w-5 h-5", isActive ? "text-white" : "text-slate-400 group-hover:text-white")} />
                                {item.label}
                            </Link>
                        );
                    })}
                </div>

                <div className="p-4 border-t border-white/10 bg-slate-900/50">
                    <div className="flex items-center gap-3 px-4 py-3 mb-4 rounded-xl bg-white/5">
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-bold shadow-md border-2 border-white/10">
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
                    <button
                        onClick={handleLogout}
                        className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-rose-300 hover:bg-rose-500/10 hover:text-rose-200 rounded-xl transition-colors"
                    >
                        <LogOut className="w-4 h-4" />
                        Sign Out
                    </button>
                </div>
            </aside>

            {/* Main Content */}
            <main className="flex-1 md:ml-0 pt-16 md:pt-0 min-h-screen transition-all duration-300">
                <div className="p-6 md:p-8 max-w-7xl mx-auto">
                    <Outlet />
                </div>
            </main>

            {/* Overlay for mobile */}
            {isMobileMenuOpen && (
                <div
                    className="fixed inset-0 bg-slate-900/50 z-30 md:hidden backdrop-blur-sm"
                    onClick={() => setIsMobileMenuOpen(false)}
                />
            )}
        </div>
    );
}
