import { Outlet, Link } from 'react-router-dom';
import { useState } from 'react';
import { Menu, X } from 'lucide-react';
import { useAuth } from '../contexts/useAuth';
import Sidebar from './Sidebar';
import NotificationBell from './NotificationBell';

export default function Layout() {
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const { user } = useAuth();
    const homePath = user ? '/dashboard' : '/';

    return (
        <div className="min-h-screen bg-background flex overflow-hidden">
            {/* Mobile Header - Visible only on small screens */}
            <div className="md:hidden fixed top-0 left-0 right-0 bg-gradient-to-r from-primary-500 to-primary-600 text-white p-4 flex items-center justify-between z-50 shadow-lg">
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                        className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                    >
                        {isMobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
                    </button>
                    <Link to={homePath} className="flex items-center gap-3 font-bold text-lg cursor-pointer">
                        <img
                            src="/mtulogo.jpg"
                            alt="MTU Logo"
                            className="w-8 h-8 object-contain rounded bg-white/10 p-1"
                        />
                        <div className="flex flex-col">
                            <span className="tracking-tight text-sm">MTU SMMS</span>
                            <span className="text-[10px] font-normal text-white/70">Smart Maintenance System</span>
                        </div>
                    </Link>
                </div>
                <NotificationBell />
            </div>

            {/* Main Navigation Sidebar */}
            <Sidebar isOpen={isMobileMenuOpen} onClose={() => setIsMobileMenuOpen(false)} />

            {/* Main Content Area */}
            <main className="flex-1 md:ml-0 pt-24 md:pt-0 h-screen overflow-y-auto overflow-x-hidden relative flex flex-col">
                {/* Desktop Notification Bell */}
                <div className="hidden md:flex justify-end px-8 pt-6 shrink-0 z-10">
                    <NotificationBell />
                </div>

                <div className="p-4 md:p-8 max-w-7xl mx-auto min-h-full w-full">
                    {/* No key prop here — a key forces full remount on every route change */}
                    <div className="h-full">
                        <Outlet />
                    </div>
                </div>
            </main>
        </div>
    );
}
