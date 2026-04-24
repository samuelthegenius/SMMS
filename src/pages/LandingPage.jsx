/**
 * @file src/pages/LandingPage.jsx
 * @description Public-facing landing page for the MTU Maintenance Portal.
 * 
 * Key Features:
 * - Conversion Funnel: Directs different user types (Students vs. Staff) to appropriate entry points.
 * - Responsive Design: Uses Tailwind's grid system to adapt layout from mobile to desktop.
 * - Brand Messaging: Highlights key value propositions (Speed, Efficiency, Intelligence).
 */
import { Link, Navigate } from 'react-router-dom';
import { Clock, Sparkles, ArrowRight, CheckCircle, User, Building2, Shield } from 'lucide-react';
import Loader from '../components/Loader';
import { useAuth } from '../contexts/useAuth';

export default function LandingPage() {
    const { user, initializing } = useAuth();

    if (initializing) {
        return <Loader variant="landing" />;
    }

    if (user) {
        return <Navigate to="/dashboard" replace />;
    }

    return (
        <div className="min-h-screen flex flex-col bg-white">
            {/* Navigation */}
            <nav className="bg-gradient-to-r from-primary-500 to-primary-600 border-b border-primary-400">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex justify-between h-16 items-center">
                        <div className="flex items-center gap-3">
                            <div className="bg-white/15 p-2 rounded-lg backdrop-blur-sm border border-white/10">
                                <img 
                                    src="/mtulogo.jpg" 
                                    alt="MTU Logo" 
                                    className="h-8 w-8 object-contain rounded"
                                />
                            </div>
                            <div>
                                <h1 className="text-xl font-bold text-white tracking-tight hidden md:block">MTU Maintenance Portal</h1>
                                <h1 className="text-xl font-bold text-white tracking-tight md:hidden">MTU</h1>
                                <p className="text-xs text-white/70 font-medium tracking-wide uppercase">Mountain Top University</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-4">
                            {/* UX Routing: Primary Calls to Action */}
                            <Link
                                to="/login"
                                className="text-sm font-medium text-white/80 hover:text-white transition-colors"
                            >
                                Sign In
                            </Link>
                            <Link
                                to="/signup"
                                className="inline-flex items-center justify-center px-4 py-2 border border-transparent text-sm font-bold rounded-lg text-primary-500 bg-white hover:bg-white/90 transition-all shadow-lg shadow-black/20"
                            >
                                Get Started
                            </Link>
                        </div>
                    </div>
                </div>
            </nav>

            {/* Hero Section:
                Designed for high impact with a clear value proposition.
                Responsive: Stacks vertically on mobile, expands to centered layout on desktop.
            */}
            <div className="relative bg-gradient-to-br from-primary-500 via-primary-600 to-primary-700 pt-16 pb-32 overflow-hidden">
                <div className="absolute inset-0">
                    <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-secondary-500/20 via-transparent to-transparent" />
                    <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
                </div>

                <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
                    <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/10 border border-white/20 text-white text-xs font-semibold uppercase tracking-wider mb-8 backdrop-blur-sm">
                        <span className="flex h-2 w-2 rounded-full bg-accent-400 animate-pulse"></span>
                        Management • Maintenance • Monitoring
                    </div>

                    <h1 className="text-4xl md:text-6xl font-extrabold text-white tracking-tight mb-6 leading-tight">
                        Smart Campus Operations <br />
                        <span className="text-transparent bg-clip-text bg-gradient-to-r from-accent-300 to-accent-500">
                            Made Simple
                        </span>
                    </h1>

                    <p className="mt-4 max-w-2xl mx-auto text-xl text-white/80 mb-10 leading-relaxed">
                        Report issues, track resolutions, and manage facilities in real-time.
                        The comprehensive tracking system for Mountain Top University.
                    </p>

                    <div className="flex flex-col sm:flex-row justify-center gap-4">
                        <Link
                            to="/signup"
                            className="inline-flex items-center justify-center px-8 py-4 border border-transparent text-base font-bold rounded-xl text-primary-600 bg-white hover:bg-white/90 md:text-lg transition-all shadow-xl shadow-black/20 hover:scale-105"
                        >
                            Get Started
                            <ArrowRight className="ml-2 h-5 w-5" />
                        </Link>
                        <Link
                            to="/login"
                            className="inline-flex items-center justify-center px-8 py-4 border-2 border-white/30 text-base font-bold rounded-xl text-white hover:bg-white/10 md:text-lg transition-all hover:border-white/50"
                        >
                            Sign In
                        </Link>
                    </div>
                </div>
            </div>

            {/* Features Grid - Bento Style */}
            <div className="py-24 bg-surface-50">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="text-center mb-16">
                        <h2 className="text-3xl md:text-4xl font-bold text-surface-900">Why use MTU Maintenance Portal?</h2>
                        <p className="mt-4 text-lg text-surface-600 max-w-2xl mx-auto">A unified platform for students, staff, and administrators to streamline campus operations.</p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                        {/* Feature 1 - Large Card */}
                        <div className="lg:col-span-2 bg-white p-8 rounded-3xl shadow-sm border border-surface-200 hover:shadow-lg transition-all duration-300 group">
                            <div className="h-14 w-14 bg-primary-100 rounded-2xl flex items-center justify-center text-primary-600 mb-6 group-hover:scale-110 transition-transform">
                                <Building2 className="h-7 w-7" />
                            </div>
                            <h3 className="text-2xl font-bold text-surface-900 mb-3">Facility Management</h3>
                            <p className="text-surface-600 leading-relaxed">
                                Report maintenance issues from anywhere on campus. Upload photos, describe problems, and track resolution progress in real-time. Covers classrooms, hostels, offices, and all university facilities.
                            </p>
                        </div>

                        {/* Feature 2 */}
                        <div className="bg-white p-6 rounded-3xl shadow-sm border border-surface-200 hover:shadow-lg transition-all duration-300 group">
                            <div className="h-12 w-12 bg-secondary-100 rounded-2xl flex items-center justify-center text-secondary-600 mb-5 group-hover:scale-110 transition-transform">
                                <Clock className="h-6 w-6" />
                            </div>
                            <h3 className="text-xl font-bold text-surface-900 mb-2">Real-time Tracking</h3>
                            <p className="text-surface-600 text-sm leading-relaxed">
                                Live notifications as requests move from pending to assigned and resolved.
                            </p>
                        </div>

                        {/* Feature 3 */}
                        <div className="bg-white p-6 rounded-3xl shadow-sm border border-surface-200 hover:shadow-lg transition-all duration-300 group">
                            <div className="h-12 w-12 bg-accent-100 rounded-2xl flex items-center justify-center text-accent-600 mb-5 group-hover:scale-110 transition-transform">
                                <Sparkles className="h-6 w-6" />
                            </div>
                            <h3 className="text-xl font-bold text-surface-900 mb-2">Smart Assignment</h3>
                            <p className="text-surface-600 text-sm leading-relaxed">
                                AI-assisted categorization assigns tasks to the right department automatically.
                            </p>
                        </div>

                        {/* Feature 4 */}
                        <div className="bg-white p-6 rounded-3xl shadow-sm border border-surface-200 hover:shadow-lg transition-all duration-300 group">
                            <div className="h-12 w-12 bg-primary-100 rounded-2xl flex items-center justify-center text-primary-600 mb-5 group-hover:scale-110 transition-transform">
                                <Shield className="h-6 w-6" />
                            </div>
                            <h3 className="text-xl font-bold text-surface-900 mb-2">Secure & Reliable</h3>
                            <p className="text-surface-600 text-sm leading-relaxed">
                                Enterprise-grade security with role-based access control for all users.
                            </p>
                        </div>

                        {/* Feature 5 */}
                        <div className="lg:col-span-3 bg-gradient-to-r from-primary-500 to-primary-600 p-6 rounded-3xl shadow-lg text-white">
                            <div className="flex items-center gap-4">
                                <div className="h-12 w-12 bg-white/20 rounded-2xl flex items-center justify-center">
                                    <CheckCircle className="h-6 w-6" />
                                </div>
                                <div>
                                    <h3 className="text-xl font-bold mb-1">Ready for 2025 Academic Session</h3>
                                    <p className="text-white/80 text-sm">Join thousands of students and staff already using MTU Maintenance Portal.</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Footer */}
            <footer className="bg-white border-t border-surface-200 mt-auto">
                <div className="max-w-7xl mx-auto py-12 px-4 sm:px-6 lg:px-8">
                    <div className="flex flex-col md:flex-row justify-between items-center gap-6">
                        <div className="flex items-center gap-3">
                            <img 
                                src="/mtulogo.jpg" 
                                alt="MTU Logo" 
                                className="h-8 w-8 object-contain rounded"
                            />
                            <div className="flex flex-col">
                                <span className="text-surface-700 font-semibold">MTU Maintenance Portal</span>
                                <span className="text-surface-500 text-xs">Management • Maintenance • Monitoring</span>
                            </div>
                        </div>
                        <p className="text-surface-400 text-sm">
                            &copy; {new Date().getFullYear()} Mountain Top University. All rights reserved.
                        </p>
                    </div>
                </div>
            </footer>
        </div>
    );
}
