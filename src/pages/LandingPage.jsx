/**
 * @file src/pages/LandingPage.jsx
 * @description Public-facing landing page for the SMMS application.
 * 
 * Key Features:
 * - Conversion Funnel: Directs different user types (Students vs. Staff) to appropriate entry points.
 * - Responsive Design: Uses Tailwind's grid system to adapt layout from mobile to desktop.
 * - Brand Messaging: Highlights key value propositions (Speed, Efficiency, Intelligence).
 */
import { Link } from 'react-router-dom';
import { Wrench, Clock, Sparkles, ArrowRight, CheckCircle, User } from 'lucide-react';

export default function LandingPage() {
    return (
        <div className="min-h-screen flex flex-col bg-white">
            {/* Navigation */}
            <nav className="bg-slate-900 border-b border-slate-800">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex justify-between h-16 items-center">
                        <div className="flex items-center gap-3">
                            <div className="bg-white/10 p-2 rounded-lg backdrop-blur-sm">
                                <Wrench className="h-6 w-6 text-amber-500" />
                            </div>
                            <div>
                                <h1 className="text-xl font-bold text-white tracking-tight">MTU Smart Maintenance</h1>
                                <p className="text-xs text-slate-400 font-medium tracking-wide uppercase">Campus Facility Management</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-4">
                            {/* UX Routing: Primary Calls to Action */}
                            <Link
                                to="/login"
                                className="text-sm font-medium text-slate-300 hover:text-white transition-colors"
                            >
                                Sign In
                            </Link>
                            <Link
                                to="/signup"
                                className="inline-flex items-center justify-center px-4 py-2 border border-transparent text-sm font-bold rounded-lg text-slate-900 bg-amber-500 hover:bg-amber-400 transition-all shadow-lg shadow-amber-900/20"
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
            <div className="relative bg-slate-900 pt-16 pb-32 overflow-hidden">
                <div className="absolute inset-0">
                    <div className="absolute inset-0 bg-gradient-to-br from-blue-900/20 to-slate-900" />
                    <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-slate-700 to-transparent" />
                </div>

                <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-900/30 border border-blue-800 text-blue-300 text-xs font-semibold uppercase tracking-wider mb-8">
                        <span className="flex h-2 w-2 rounded-full bg-blue-400 animate-pulse"></span>
                        Now Live for 2025 Academic Session
                    </div>

                    <h1 className="text-4xl md:text-6xl font-extrabold text-white tracking-tight mb-6 leading-tight">
                        Efficient Campus Maintenance <br />
                        <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-orange-500">
                            for Everyone
                        </span>
                    </h1>

                    <p className="mt-4 max-w-2xl mx-auto text-xl text-slate-400 mb-10 leading-relaxed">
                        Report faults, track repairs, and improve campus facilities in real-time.
                        A smarter way to manage Mountain Top University's infrastructure.
                    </p>

                    <div className="flex flex-col sm:flex-row justify-center gap-4">
                        <Link
                            to="/signup"
                            className="inline-flex items-center justify-center px-8 py-4 border border-transparent text-base font-bold rounded-xl text-slate-900 bg-amber-500 hover:bg-amber-400 md:text-lg transition-all shadow-xl shadow-amber-900/20 hover:scale-105"
                        >
                            Get Started
                            <ArrowRight className="ml-2 h-5 w-5" />
                        </Link>
                        <Link
                            to="/login"
                            className="inline-flex items-center justify-center px-8 py-4 border border-slate-700 text-base font-bold rounded-xl text-white hover:bg-slate-800 md:text-lg transition-all hover:border-slate-600"
                        >
                            Sign In
                        </Link>
                    </div>
                </div>
            </div>

            {/* Features Grid */}
            <div className="py-24 bg-slate-50">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="text-center mb-16">
                        <h2 className="text-3xl font-bold text-slate-900">Why use MTU Smart Maintenance?</h2>
                        <p className="mt-4 text-lg text-slate-600">Streamlining operations for students, staff, and technicians.</p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                        {/* Feature 1 */}
                        <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-200 hover:shadow-md transition-shadow">
                            <div className="h-12 w-12 bg-blue-100 rounded-xl flex items-center justify-center text-blue-600 mb-6">
                                <User className="h-6 w-6" />
                            </div>
                            <h3 className="text-xl font-bold text-slate-900 mb-3">Instant Reporting</h3>
                            <p className="text-slate-600 leading-relaxed">
                                Easily report maintenance issues from anywhere on campus. Upload details and track status in real-time.
                            </p>
                        </div>

                        {/* Feature 2 */}
                        <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-200 hover:shadow-md transition-shadow">
                            <div className="h-12 w-12 bg-amber-100 rounded-xl flex items-center justify-center text-amber-600 mb-6">
                                <Clock className="h-6 w-6" />
                            </div>
                            <h3 className="text-xl font-bold text-slate-900 mb-3">Real-time Tracking</h3>
                            <p className="text-slate-600 leading-relaxed">
                                Stay updated with live notifications as your request moves from pending to assigned and resolved.
                            </p>
                        </div>

                        {/* Feature 3 */}
                        <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-200 hover:shadow-md transition-shadow">
                            <div className="h-12 w-12 bg-purple-100 rounded-xl flex items-center justify-center text-purple-600 mb-6">
                                <Sparkles className="h-6 w-6" />
                            </div>
                            <h3 className="text-xl font-bold text-slate-900 mb-3">Smart Assignment</h3>
                            <p className="text-slate-600 leading-relaxed">
                                Intelligent system automatically categorizes and assigns tasks to the right technicians for faster resolution.
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Footer */}
            <footer className="bg-white border-t border-slate-200 mt-auto">
                <div className="max-w-7xl mx-auto py-12 px-4 sm:px-6 lg:px-8">
                    <div className="flex flex-col md:flex-row justify-between items-center gap-6">
                        <div className="flex items-center gap-2">
                            <Wrench className="h-5 w-5 text-slate-400" />
                            <span className="text-slate-500 font-medium">MTU Smart Maintenance</span>
                        </div>
                        <p className="text-slate-400 text-sm">
                            &copy; 2025 Mountain Top University. All rights reserved.
                        </p>
                    </div>
                </div>
            </footer>
        </div>
    );
}
