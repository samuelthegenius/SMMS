/**
 * @file src/pages/Login.jsx
 * @description Authentication Entry Point.
 * 
 * Key Features:
 * - Secure Authentication: Uses Supabase Auth (JWT-based) to verify user credentials.
 * - Error Handling: Provides user-friendly feedback for invalid credentials or network issues.
 * - Redirect Logic: Routes users to the Dashboard upon successful login.
 */
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Wrench, Mail, Lock, Loader2, ArrowRight, AlertCircle } from 'lucide-react';
import clsx from 'clsx';

export default function Login() {
    const navigate = useNavigate();
    const { user } = useAuth();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    // State definitions
    const [role, setRole] = useState('student'); // Controls visual toggle
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');

    // UX Optimization: Automatically redirect if session already exists.
    useEffect(() => {
        if (user) {
            navigate('/dashboard');
        }
    }, [user, navigate]);

    const handleLogin = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        try {
            // Authentication Request:
            const { error: authError } = await supabase.auth.signInWithPassword({
                email,
                password,
            });

            if (authError) throw authError;
            navigate('/dashboard');
        } catch (error) {
            console.error(error);
            setError('Invalid credentials. Please check your email and password.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-slate-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
            <div className="sm:mx-auto sm:w-full sm:max-w-md">
                <div className="bg-white shadow-xl shadow-slate-200/50 rounded-2xl overflow-hidden border border-slate-100">
                    {/* Dark Header */}
                    <div className="bg-slate-900 px-8 py-6 text-center">
                        <Link to="/" className="block group hover:text-blue-200 transition-colors cursor-pointer">
                            <div className="flex justify-center mb-4">
                                <div className="h-12 w-12 rounded-xl bg-white/10 flex items-center justify-center text-secondary backdrop-blur-sm group-hover:bg-white/20 transition-colors">
                                    <Wrench className="h-7 w-7" />
                                </div>
                            </div>
                            <h2 className="text-2xl font-bold text-white group-hover:text-blue-200 transition-colors">MTU Smart Maintenance</h2>
                        </Link>
                        <p className="text-slate-400 text-sm mt-1">Campus Facility Management System</p>
                    </div>

                    <div className="px-8 py-8">
                        {/* Segmented Control: Visual Indicator Only */}
                        <div className="mb-8 bg-slate-100 p-1 rounded-xl flex">
                            <button
                                type="button"
                                onClick={() => setRole('student')}
                                className={clsx(
                                    "flex-1 py-2 text-sm font-semibold rounded-lg transition-all duration-200",
                                    role === 'student'
                                        ? "bg-white text-slate-900 shadow-sm"
                                        : "text-slate-500 hover:text-slate-700"
                                )}
                            >
                                Student
                            </button>
                            <button
                                type="button"
                                onClick={() => setRole('staff_member')}
                                className={clsx(
                                    "flex-1 py-2 text-sm font-semibold rounded-lg transition-all duration-200",
                                    role === 'staff_member'
                                        ? "bg-white text-slate-900 shadow-sm"
                                        : "text-slate-500 hover:text-slate-700"
                                )}
                            >
                                Staff Member
                            </button>
                        </div>

                        <form className="space-y-6" onSubmit={handleLogin}>
                            {error && (
                                <div className="bg-rose-50 border border-rose-200 text-rose-600 px-4 py-3 rounded-xl text-sm flex items-center gap-2">
                                    <AlertCircle className="w-5 h-5" />
                                    {error}
                                </div>
                            )}

                            <div>
                                <label htmlFor="email" className="block text-sm font-medium text-slate-700 mb-1">
                                    Email Address
                                </label>
                                <div className="relative">
                                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                        <Mail className="h-5 w-5 text-slate-400" />
                                    </div>
                                    <input
                                        id="email"
                                        name="email"
                                        type="email"
                                        autoComplete="email"
                                        required
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        className="block w-full pl-10 pr-3 py-3 border border-slate-300 rounded-xl shadow-sm placeholder-slate-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm transition-colors"
                                        placeholder="you@mtu.edu.ng"
                                    />
                                </div>
                            </div>

                            <div>
                                <label htmlFor="password" className="block text-sm font-medium text-slate-700 mb-1">
                                    Password
                                </label>
                                <div className="relative">
                                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                        <Lock className="h-5 w-5 text-slate-400" />
                                    </div>
                                    <input
                                        id="password"
                                        name="password"
                                        type="password"
                                        autoComplete="current-password"
                                        required
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        className="block w-full pl-10 pr-3 py-3 border border-slate-300 rounded-xl shadow-sm placeholder-slate-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm transition-colors"
                                        placeholder="••••••••"
                                    />
                                </div>
                            </div>

                            <div>
                                <button
                                    type="submit"
                                    disabled={loading}
                                    className="w-full flex justify-center items-center gap-2 py-3 px-4 border border-transparent rounded-xl shadow-lg text-sm font-bold text-white bg-slate-900 hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-slate-900 disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-[0.98]"
                                >
                                    {loading ? 'Signing in...' : (
                                        <>
                                            Sign in
                                            <ArrowRight className="w-4 h-4" />
                                        </>
                                    )}
                                </button>
                            </div>
                        </form>

                        <div className="mt-6">
                            <div className="relative">
                                <div className="absolute inset-0 flex items-center">
                                    <div className="w-full border-t border-slate-200" />
                                </div>
                                <div className="relative flex justify-center text-sm">
                                    <span className="px-2 bg-white text-slate-500">
                                        Don't have an account?
                                    </span>
                                </div>
                            </div>

                            <div className="mt-6 text-center">
                                <Link to="/signup" className="font-medium text-blue-600 hover:text-blue-500 transition-colors">
                                    Create an account
                                </Link>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
