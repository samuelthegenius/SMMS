import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/useAuth';
import { supabase } from '../lib/supabase';
import {
    LayoutDashboard,
    PlusCircle,
    LogOut,
    History,
    BarChart,
    Settings,
    Wrench,
    Users
} from 'lucide-react';
import clsx from 'clsx';
import { Button } from './ui/Button';

export default function Sidebar({ isOpen, onClose }) {
    const { profile, user } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();
    const homePath = user ? '/dashboard' : '/';

    const handleLogout = async () => {
        await supabase.auth.signOut();
        navigate('/login');
    };

    const navItems = [
        { label: 'Dashboard', path: '/dashboard', icon: LayoutDashboard },
        { label: 'Analytics', path: '/analytics', icon: BarChart, roles: ['it_admin', 'src', 'staff', 'manager', 'supervisor'], departmentAccess: 'Student Affairs' },
        { label: 'New Ticket', path: '/new-ticket', icon: PlusCircle, roles: ['student', 'staff', 'it_admin', 'src', 'porter', 'manager', 'supervisor'] },
        { label: 'My History', path: '/history', icon: History, roles: ['student', 'staff', 'src'] },
        { label: 'Jobs', path: '/jobs', icon: Wrench, roles: ['technician'] },
        { label: 'Verify Complaints', path: '/jobs', icon: Wrench, roles: ['porter', 'src', 'staff'] },
    ];

    const filteredNavItems = navItems.filter(item => {
        if (!item.roles) return true;
        // Check role OR department access
        const hasRoleAccess = item.roles.includes(profile?.role);
        const hasDeptAccess = item.departmentAccess && profile?.department === item.departmentAccess;
        return hasRoleAccess || hasDeptAccess;
    });

    return (
        <>
            {/* Sidebar Container */}
            <aside className={clsx(
                "fixed inset-y-0 left-0 z-40 w-64 bg-gradient-to-b from-primary-500 to-primary-700 text-white transform transition-transform duration-300 ease-in-out md:translate-x-0 md:static md:flex flex-col shadow-2xl pt-24 md:pt-0",
                isOpen ? "translate-x-0" : "-translate-x-full"
            )}>
                {/* Header */}
                <div className="p-6 border-b border-white/10 hidden md:block">
                    <Link to={homePath} className="flex items-center gap-3 cursor-pointer">
                        <div className="bg-white/10 p-2 rounded-xl backdrop-blur-sm">
                            <img 
                                src="/mtulogo.jpg" 
                                alt="MTU Logo" 
                                className="w-8 h-8 object-contain rounded"
                            />
                        </div>
                        <div>
                            <h1 className="text-lg font-bold leading-none tracking-tight">MTU SMMS</h1>
                            <p className="text-xs text-white/70 mt-1">Smart Maintenance System</p>
                        </div>
                    </Link>
                </div>

                {/* Navigation */}
                <div className="flex-1 overflow-y-auto py-6 px-4 space-y-1">
                    <p className="px-4 text-xs font-semibold text-white/50 uppercase tracking-wider mb-4">Menu</p>
                    {filteredNavItems.map((item) => {
                        const Icon = item.icon;
                        const isActive = location.pathname === item.path;
                        return (
                            <Link
                                key={item.label}
                                to={item.path}
                                onClick={onClose}
                                className={clsx(
                                    'flex items-center gap-3 px-4 py-3 text-sm font-medium rounded-xl transition-all duration-200 group relative overflow-hidden',
                                    isActive
                                        ? 'text-white bg-white/15 shadow-lg shadow-black/10 border-l-4 border-accent-400'
                                        : 'text-white/70 hover:text-white hover:bg-white/10'
                                )}
                            >
                                {isActive && <div className="absolute left-0 top-0 bottom-0 w-1 bg-accent rounded-r-full" />}
                                <Icon className={clsx("w-5 h-5 transition-colors", isActive ? "text-accent-400" : "text-white/50 group-hover:text-accent-400")} />
                                {item.label}
                            </Link>
                        );
                    })}
                </div>

                {/* User Profile & Logout */}
                <div className="p-4 border-t border-white/10 bg-primary-600/50 backdrop-blur-sm">
                    <div className="flex items-center gap-3 px-4 py-3 mb-4 rounded-xl bg-white/10 border border-white/10">
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-secondary-400 to-secondary-600 flex items-center justify-center text-white font-bold shadow-md">
                            {profile?.full_name?.[0] || 'U'}
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-white truncate">
                                {profile?.full_name}
                            </p>
                            <p className="text-xs text-white/60 truncate capitalize">
                                {profile?.role?.replace('_', ' ')}
                            </p>
                        </div>
                    </div>
                    <Link
                        to="/settings"
                        onClick={onClose}
                        className={clsx(
                            'flex items-center gap-3 px-4 py-3 mb-2 text-sm font-medium rounded-xl transition-all duration-200',
                            location.pathname === '/settings'
                                ? 'text-white bg-white/15 shadow-lg'
                                : 'text-white/70 hover:text-white hover:bg-white/10'
                        )}
                    >
                        <Settings className="w-4 h-4" />
                        Settings
                    </Link>
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
                    className="fixed inset-0 bg-primary-900/60 z-30 md:hidden backdrop-blur-sm transition-opacity"
                    onClick={onClose}
                />
            )}
        </>
    );
}
