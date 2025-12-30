import { Outlet, useLocation } from 'react-router-dom';
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Wrench, Menu, X } from 'lucide-react';
import Sidebar from './Sidebar';
import NotificationBell from './NotificationBell';

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
            <main className="flex-1 md:ml-0 pt-20 md:pt-0 h-screen overflow-y-auto overflow-x-hidden relative flex flex-col">
                {/* Desktop Notification Bell */}
                <div className="hidden md:flex justify-end px-8 pt-6 shrink-0 z-10">
                    <NotificationBell />
                </div>

                <div className="p-4 md:p-8 max-w-7xl mx-auto min-h-full w-full">
                    <AnimatePresence mode="wait">
                        <motion.div
                            key={location.pathname}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -20 }}
                            transition={{ duration: 0.3, ease: "easeOut" }}
                            className="h-full"
                        >
                            <Outlet />
                        </motion.div>
                    </AnimatePresence>
                </div>
            </main>
        </div>
    );
}
