import { useState, useRef } from 'react';
import { useNavigate, Link, Navigate } from 'react-router-dom';
import { Wrench, Loader2, HardHat, Building, IdCard } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '../components/ui/Card';
import { cn } from '../lib/utils';
import { MAINTENANCE_CATEGORIES } from '../utils/constants';
import Loader from '../components/Loader';
import { useAuth } from '../contexts/useAuth';

// Rate limiting for signup
const SIGNUP_STORAGE_KEY = 'signup_attempts';
const MAX_SIGNUP_ATTEMPTS = 3;
const SIGNUP_LOCKOUT_MS = 10 * 60 * 1000; // 10 minutes

// Password validation regex (min 8 chars, 1 uppercase, 1 lowercase, 1 number)
const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;

// Email validation for institutional emails
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function SignUp() {
    const { user, initializing } = useAuth();
    const [formData, setFormData] = useState({
        fullName: '',
        email: '',
        password: '',
        role: 'student',
        accessCode: '',
        specialization: '',
        idNumber: '',
        department: ''
    });
    const [loading, setLoading] = useState(false);
    // Tracks when we are mid-submission so that the session created by
    // supabase.auth.signUp() doesn't trigger the user-guard redirect before
    // profile creation has finished (or been rolled back on failure).
    const signingUpRef = useRef(false);
    const navigate = useNavigate();

    if (initializing) {
        return <Loader variant="auth-signup" />;
    }

    // Skip the redirect while the form is actively submitting — the auth
    // session fires immediately (if email confirmation is disabled) but we
    // still need to finish profile creation or clean up on failure.
    if (user && !signingUpRef.current) {
        return <Navigate to="/dashboard" replace />;
    }

    // Check rate limit
    const checkRateLimit = () => {
        const now = Date.now();
        const stored = localStorage.getItem(SIGNUP_STORAGE_KEY);
        
        if (stored) {
            const { attempts, lockoutTime } = JSON.parse(stored);
            
            if (lockoutTime && now < lockoutTime) {
                const minutesLeft = Math.ceil((lockoutTime - now) / 60000);
                throw new Error(`Too many signup attempts. Try again in ${minutesLeft} minute(s).`);
            }
            
            if (attempts >= MAX_SIGNUP_ATTEMPTS && lockoutTime && now < lockoutTime) {
                throw new Error('Signup temporarily disabled. Please try again later.');
            }
        }
        return true;
    };

    const _recordFailedAttempt = () => {
        const now = Date.now();
        const stored = localStorage.getItem(SIGNUP_STORAGE_KEY);
        const { attempts = 0 } = stored ? JSON.parse(stored) : { attempts: 0 };
        const newAttempts = attempts + 1;
        
        localStorage.setItem(
            SIGNUP_STORAGE_KEY,
            JSON.stringify({
                attempts: newAttempts,
                lockoutTime: newAttempts >= MAX_SIGNUP_ATTEMPTS ? now + SIGNUP_LOCKOUT_MS : null
            })
        );
    };

    const resetRateLimit = () => {
        localStorage.removeItem(SIGNUP_STORAGE_KEY);
    };

    const handleSignUp = async (e) => {
        e.preventDefault();

        // Validate password strength
        if (!PASSWORD_REGEX.test(formData.password)) {
            toast.error('Password must be at least 8 characters with uppercase, lowercase, and number');
            return;
        }

        // Validate email format
        if (!EMAIL_REGEX.test(formData.email)) {
            toast.error('Please enter a valid email address');
            return;
        }

        // Validate ID number format
        if (formData.idNumber.length < 5) {
            toast.error('Invalid ID number format');
            return;
        }

        // Check rate limit
        try {
            checkRateLimit();
        } catch (error) {
            toast.error(error.message);
            return;
        }

        // Validate Access Code for all roles
        if (formData.accessCode.length < 4) {
            toast.error('Invalid access code format');
            return;
        }
        if (formData.role === 'technician' && !formData.specialization) {
            toast.error('Please select a specialization');
            return;
        }
        if (formData.role === 'admin') {
            toast.error('Admin registration is not allowed via public signup.');
            return;
        }



        setLoading(true);
        signingUpRef.current = true;

        try {
            // All validation + auth user creation + profile creation happen atomically
            // on the server using the service role key. If the profile insert fails,
            // the server deletes the auth user so no ghost row is left behind.
            const res = await fetch('/api/auth/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email:          formData.email,
                    password:       formData.password,
                    fullName:       formData.fullName,
                    role:           formData.role,
                    idNumber:       formData.idNumber,
                    department:     formData.department,
                    specialization: formData.specialization,
                    accessCode:     formData.accessCode,
                }),
            });

            const json = await res.json().catch(() => ({}));

            if (!res.ok) {
                throw new Error(json.error || 'Failed to create account. Please try again.');
            }

            resetRateLimit();
            toast.success('Account created successfully! Please check your email to verify your account.');
            navigate('/login');
        } catch (error) {
            if (import.meta.env.DEV) console.error('SignUp Error:', error);
            toast.error(error.message || 'Failed to create account. Please try again.');
        } finally {
            signingUpRef.current = false;
            setLoading(false);
        }
    };


    const handleChange = (e) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const inputClasses = "flex h-10 w-full rounded-md border-0 ring-1 ring-slate-200 bg-white px-3 py-2 text-sm ring-offset-background placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 transition-all duration-200";

    return (
        <div className="min-h-screen bg-slate-50 flex flex-col items-center p-4">
            <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-accent/5 pointer-events-none" />

            <div className="w-full max-w-md my-auto flex flex-col">
                <Card className="w-full relative z-10 border-slate-200/60 shadow-xl">
                    <CardHeader className="space-y-2 text-center pb-8 border-b-0">
                        <div className="mx-auto w-12 h-12 bg-primary rounded-xl flex items-center justify-center mb-2 shadow-lg shadow-primary/20">
                            <Wrench className="w-6 h-6 text-accent" />
                        </div>
                        <CardTitle className="text-2xl font-bold text-slate-900">Create Account</CardTitle>
                        <CardDescription className="text-base">
                            Join the Smart Maintenance System
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <form onSubmit={handleSignUp} className="space-y-4">
                            <div className="space-y-2">
                                <label className="text-sm font-medium leading-none" htmlFor="fullName">Full Name</label>
                                <Input
                                    id="fullName"
                                    name="fullName"
                                    type="text"
                                    placeholder="John Doe"
                                    value={formData.fullName}
                                    onChange={handleChange}
                                    required
                                    className="bg-slate-50/50"
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-medium leading-none" htmlFor="email">Email Address</label>
                                <Input
                                    id="email"
                                    name="email"
                                    type="email"
                                    placeholder="your@email.com"
                                    value={formData.email}
                                    onChange={handleChange}
                                    required
                                    className="bg-slate-50/50"
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-medium leading-none" htmlFor="role">Role</label>
                                <select
                                    id="role"
                                    name="role"
                                    value={formData.role}
                                    onChange={handleChange}
                                    className={cn(inputClasses, "bg-slate-50/50 cursor-pointer")}
                                >
                                    {[
                                        { label: 'Student', value: 'student' },
                                        { label: 'Staff', value: 'staff' },
                                        { label: 'Technician', value: 'technician' }
                                    ].map(role => (
                                        <option key={role.value} value={role.value}>
                                            {role.label}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            {/* ID Number - Shown for everyone (Student ID or Staff ID) */}
                            <div className="space-y-2 animate-in fade-in slide-in-from-top-1 duration-200">
                                <label className="text-sm font-medium leading-none" htmlFor="idNumber">
                                    {formData.role === 'student' ? 'Student ID / Matric No' : 'Staff ID / File No'}
                                </label>
                                <div className="relative">
                                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                        <IdCard className="h-4 w-4 text-slate-400" />
                                    </div>
                                    <Input
                                        id="idNumber"
                                        name="idNumber"
                                        type="text"
                                        placeholder={formData.role === 'student' ? "e.g., 210102030" : "e.g., SP/2332"}
                                        value={formData.idNumber}
                                        onChange={handleChange}
                                        required
                                        className="pl-10 bg-slate-50/50"
                                    />
                                </div>
                            </div>

                            {/* Department - Shown for Student and Staff Only (Technicians are auto-assigned) */}
                            {formData.role !== 'technician' && (
                                <div className="space-y-2 animate-in fade-in slide-in-from-top-1 duration-200">
                                    <label className="text-sm font-medium leading-none" htmlFor="department">
                                        Department
                                    </label>
                                    <div className="relative">
                                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                            <Building className="h-4 w-4 text-slate-400" />
                                        </div>
                                        <Input
                                            id="department"
                                            name="department"
                                            type="text"
                                            placeholder="e.g., Computer Science"
                                            value={formData.department}
                                            onChange={handleChange}
                                            required
                                            className="pl-10 bg-slate-50/50"
                                        />
                                    </div>
                                </div>
                            )}

                            {/* Specialization Dropdown for Technicians */}
                            {formData.role === 'technician' && (
                                <div className="space-y-2 animate-in fade-in slide-in-from-top-1 duration-200">
                                    <label className="text-sm font-medium leading-none text-slate-700" htmlFor="specialization">
                                        Specialization
                                    </label>
                                    <div className="relative">
                                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                            <HardHat className="h-4 w-4 text-slate-400" />
                                        </div>
                                        <select
                                            id="specialization"
                                            name="specialization"
                                            value={formData.specialization}
                                            onChange={handleChange}
                                            required
                                            className={cn(inputClasses, "pl-10 bg-slate-50/50 cursor-pointer")}
                                        >
                                            <option value="" disabled>Select a Trade</option>
                                            {MAINTENANCE_CATEGORIES.map((category) => (
                                                <option key={category} value={category}>
                                                    {category}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                </div>
                            )}

                            {/* Conditional Access Code Input */}
                            {formData.role && (
                                <div className="space-y-2 animate-in fade-in slide-in-from-top-1 duration-200">
                                    <label className="text-sm font-medium leading-none text-indigo-600" htmlFor="accessCode">
                                        Access Code (Required for {formData.role === 'student' ? 'Student' : formData.role === 'staff' ? 'Staff' : formData.role.charAt(0).toUpperCase() + formData.role.slice(1)})
                                    </label>
                                    <Input
                                        id="accessCode"
                                        name="accessCode"
                                        type="text"
                                        placeholder="Enter role verification code"
                                        value={formData.accessCode}
                                        onChange={handleChange}
                                        required
                                        className="bg-indigo-50/50 border-indigo-100 focus-visible:ring-indigo-500"
                                    />
                                </div>
                            )}

                            <div className="space-y-2">
                                <label className="text-sm font-medium leading-none" htmlFor="password">Password</label>
                                <Input
                                    id="password"
                                    name="password"
                                    type="password"
                                    value={formData.password}
                                    onChange={handleChange}
                                    required
                                    className="bg-slate-50/50"
                                />
                            </div>
                            <Button className="w-full mt-4" type="submit" isLoading={loading}>
                                Create Account
                            </Button>
                        </form>
                    </CardContent>
                    <CardFooter className="flex flex-col space-y-4 text-center text-sm pt-0">
                        <div className="relative w-full">
                            <div className="absolute inset-0 flex items-center">
                                <span className="w-full border-t border-slate-200" />
                            </div>
                            <div className="relative flex justify-center text-xs uppercase">
                                <span className="bg-white px-2 text-slate-500">Or</span>
                            </div>
                        </div>
                        <div className="text-slate-500">
                            Already have an account?{' '}
                            <Link to="/login" className="text-primary font-semibold hover:text-accent transition-colors">
                                Sign In
                            </Link>
                        </div>
                    </CardFooter>
                </Card>

                <div className="mt-8 text-center text-xs text-slate-400">
                    &copy; {new Date().getFullYear()} Mountain Top University. All rights reserved.
                </div>
            </div>
        </div>
    );
}
