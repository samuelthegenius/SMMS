import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Wrench, User, Mail, Lock, CreditCard, Building, ArrowRight, AlertCircle, Key } from 'lucide-react';
import clsx from 'clsx';


export default function SignUp() {
    const navigate = useNavigate();
    const [role, setRole] = useState('student');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [formData, setFormData] = useState({
        email: '',
        password: '',
        fullName: '',
        identificationNumber: '',
        department: '',
        staffAccessCode: '',
    });

    const handleChange = (e) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const handleSignUp = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        try {
            // 1. Validate Staff Access Code
            if (role === 'staff_member' && formData.staffAccessCode !== import.meta.env.VITE_STAFF_SECRET_KEY) {
                throw new Error('Invalid Staff Access Code. Please contact IT.');
            }

            // 2. Sign up with Supabase Auth
            const { data: { user }, error: authError } = await supabase.auth.signUp({
                email: formData.email,
                password: formData.password,
                options: {
                    data: {
                        full_name: formData.fullName,
                        role: role,
                        identification_number: formData.identificationNumber,
                        department: role === 'staff_member' ? formData.department : null,
                    }
                }
            });

            if (authError) throw authError;

            if (user) {
                alert("Account created successfully! Please sign in.");
                const roleParam = role === 'staff_member' ? 'staff' : 'student';
                navigate(`/login?role=${roleParam}`);
            }
        } catch (error) {
            setError(error.message);
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
                        {/* Segmented Control */}
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

                        <form className="space-y-5" onSubmit={handleSignUp}>
                            {error && (
                                <div className="bg-rose-50 border border-rose-200 text-rose-600 px-4 py-3 rounded-xl text-sm flex items-center gap-2">
                                    <AlertCircle className="w-5 h-5" />
                                    {error}
                                </div>
                            )}

                            <div>
                                <label htmlFor="fullName" className="block text-sm font-medium text-slate-700 mb-1">
                                    Full Name
                                </label>
                                <div className="relative">
                                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                        <User className="h-5 w-5 text-slate-400" />
                                    </div>
                                    <input
                                        id="fullName"
                                        name="fullName"
                                        type="text"
                                        required
                                        value={formData.fullName}
                                        onChange={handleChange}
                                        className="block w-full pl-10 pr-3 py-2.5 border border-slate-300 rounded-xl shadow-sm placeholder-slate-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm transition-colors"
                                        placeholder="John Doe"
                                    />
                                </div>
                            </div>

                            <div>
                                <label htmlFor="email" className="block text-sm font-medium text-slate-700 mb-1">
                                    Email address
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
                                        value={formData.email}
                                        onChange={handleChange}
                                        className="block w-full pl-10 pr-3 py-2.5 border border-slate-300 rounded-xl shadow-sm placeholder-slate-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm transition-colors"
                                        placeholder="you@mtu.edu.ng"
                                    />
                                </div>
                            </div>

                            <div>
                                <label htmlFor="identificationNumber" className="block text-sm font-medium text-slate-700 mb-1">
                                    {role === 'student' ? 'Matric Number' : 'Staff ID'}
                                </label>
                                <div className="relative">
                                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                        <CreditCard className="h-5 w-5 text-slate-400" />
                                    </div>
                                    <input
                                        id="identificationNumber"
                                        name="identificationNumber"
                                        type="text"
                                        required
                                        value={formData.identificationNumber}
                                        onChange={handleChange}
                                        className="block w-full pl-10 pr-3 py-2.5 border border-slate-300 rounded-xl shadow-sm placeholder-slate-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm transition-colors"
                                        placeholder={role === 'student' ? '190102034' : 'STF/001'}
                                    />
                                </div>
                            </div>

                            {role === 'staff_member' && (
                                <>
                                    <div>
                                        <label htmlFor="department" className="block text-sm font-medium text-slate-700 mb-1">
                                            Department
                                        </label>
                                        <div className="relative">
                                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                                <Building className="h-5 w-5 text-slate-400" />
                                            </div>
                                            <input
                                                id="department"
                                                name="department"
                                                type="text"
                                                required
                                                value={formData.department}
                                                onChange={handleChange}
                                                className="block w-full pl-10 pr-3 py-2.5 border border-slate-300 rounded-xl shadow-sm placeholder-slate-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm transition-colors"
                                                placeholder="Computer Science"
                                            />
                                        </div>
                                    </div>

                                    <div>
                                        <label htmlFor="staffAccessCode" className="block text-sm font-medium text-slate-700 mb-1">
                                            Staff Access Code
                                        </label>
                                        <div className="relative">
                                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                                <Key className="h-5 w-5 text-slate-400" />
                                            </div>
                                            <input
                                                id="staffAccessCode"
                                                name="staffAccessCode"
                                                type="password"
                                                required
                                                value={formData.staffAccessCode}
                                                onChange={handleChange}
                                                className="block w-full pl-10 pr-3 py-2.5 border border-slate-300 rounded-xl shadow-sm placeholder-slate-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm transition-colors"
                                                placeholder="Enter admin provided code"
                                            />
                                        </div>
                                    </div>
                                </>
                            )}

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
                                        required
                                        value={formData.password}
                                        onChange={handleChange}
                                        className="block w-full pl-10 pr-3 py-2.5 border border-slate-300 rounded-xl shadow-sm placeholder-slate-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm transition-colors"
                                        placeholder="••••••••"
                                    />
                                </div>
                            </div>

                            <div>
                                <button
                                    type="submit"
                                    disabled={loading}
                                    className="w-full flex justify-center items-center gap-2 bg-slate-900 text-white py-3 rounded-lg font-bold hover:bg-slate-800 transition-transform active:scale-95 shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {loading ? 'Creating account...' : (
                                        <>
                                            Create Account
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
                                        Already have an account?
                                    </span>
                                </div>
                            </div>

                            <div className="mt-6 text-center">
                                <Link to="/login" className="font-medium text-blue-600 hover:text-blue-500 transition-colors">
                                    Sign in instead
                                </Link>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
