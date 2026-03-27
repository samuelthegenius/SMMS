import { Outlet, useLocation } from 'react-router-dom';
import { useState, lazy, Suspense } from 'react';
import { Wrench, Menu, X } from 'lucide-react';
import Sidebar from './Sidebar';
import NotificationBell from './NotificationBell';

// Lazy load framer-motion to prevent it from blocking initial render
const AnimatePresence = lazy(() => 
  import('framer-motion').then(m => ({ default: m.AnimatePresence }))
);

// Simple fallback wrapper that doesn't block render
const MotionFallback = ({ children }) => <>{children}</>;

export default function Layout() {
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const location = useLocation();

    return (
        <div className="min-h-screen bg-background flex overflow-hidden">
            {/* Mobile Header - Visible only on small screens */}
            <div className="md:hidden fixed top-0 left-0 right-0 bg-primary text-white p-4 flex items-center justify-between z-50 shadow-md">
                <div className="flex items-center gap-2 font-bold text-lg">
                    <Wrench className="w-6 h-6 text-accent" />
                    <span className="tracking-tight">SMMS</span>
                </div>
                <div className="flex items-center gap-2">
                    <NotificationBell />
                    <button
                        onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                        className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                    >
                        {isMobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
                    </button>
                </div>
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
                    <Suspense fallback={<MotionFallback />}>
                        <AnimatePresence mode="wait">
                            <div
                                key={location.pathname}
                                className="h-full"
                            >
                                <Outlet />
                            </div>
                        </AnimatePresence>
                    </Suspense>
                </div>
            </main>
        </div>
    );
}
