import { useState, useRef } from 'react';
import { useNavigate, Link, Navigate } from 'react-router-dom';
import { Loader2, HardHat, Building, IdCard } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '../components/ui/Card';
import { cn } from '../lib/utils';
import { MAINTENANCE_CATEGORIES, ACADEMIC_DEPARTMENTS, SERVICE_DEPARTMENTS } from '../utils/constants';
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
        if ((formData.role === 'technician' || formData.role === 'team_lead') && !formData.specialization) {
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
        <div className="min-h-screen bg-surface-50 flex flex-col items-center p-4 relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-primary-500/5 via-secondary-500/5 to-accent-500/5 pointer-events-none" />
            <div className="absolute top-0 right-0 w-96 h-96 bg-primary-400/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
            <div className="absolute bottom-0 left-0 w-96 h-96 bg-secondary-400/10 rounded-full blur-3xl translate-y-1/2 -translate-x-1/2" />

            <div className="w-full max-w-md my-auto flex flex-col relative z-10">
                <Card className="w-full border-surface-200/60 shadow-2xl bg-white/80 backdrop-blur-sm">
                    <CardHeader className="space-y-3 text-center pb-8 border-b-0">
                        <Link to="/" className="mx-auto w-16 h-16 bg-gradient-to-br from-primary-500 to-primary-600 rounded-2xl flex items-center justify-center mb-2 shadow-lg shadow-primary-500/25 p-2 cursor-pointer hover:scale-105 transition-transform">
                            <img 
                                src="/mtulogo.jpg" 
                                alt="MTU Logo" 
                                className="w-12 h-12 object-contain rounded"
                            />
                        </Link>
                        <CardTitle className="text-2xl font-bold text-surface-900">Create Account</CardTitle>
                        <CardDescription className="text-base text-surface-600">
                            Join MTU SMMS<br/>
                            <span className="text-xs text-surface-400">Smart Maintenance Management System</span>
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <form onSubmit={handleSignUp} className="space-y-4">
                            <div className="space-y-2">
                                <label className="text-sm font-semibold text-surface-700 leading-none" htmlFor="fullName">Full Name</label>
                                <Input
                                    id="fullName"
                                    name="fullName"
                                    type="text"
                                    placeholder="John Doe"
                                    value={formData.fullName}
                                    onChange={handleChange}
                                    required
                                    className="bg-surface-50"
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
                                    className="bg-surface-50"
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-medium leading-none" htmlFor="role">Role</label>
                                <select
                                    id="role"
                                    name="role"
                                    value={formData.role}
                                    onChange={handleChange}
                                    className={cn(inputClasses, "bg-surface-50 cursor-pointer")}
                                >
                                    {[
                                        { label: 'Student', value: 'student' },
                                        { label: 'Staff', value: 'staff' },
                                        { label: 'Facility Manager', value: 'facility_manager' },
                                        { label: 'Maintenance Supervisor', value: 'maintenance_supervisor' },
                                        { label: 'Team Lead', value: 'team_lead' },
                                        { label: 'Technician', value: 'technician' },
                                        { label: 'SRC', value: 'src' },
                                        { label: 'Hostel Porter', value: 'porter' }
                                    ].map(role => (
                                        <option key={role.value} value={role.value}>
                                            {role.label}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            {/* ID Number - Shown for everyone (Student ID or Staff ID) */}
                            <div className="space-y-2 animate-in fade-in slide-in-from-top-1 duration-200">
                                <label className="text-sm font-semibold text-surface-700 leading-none" htmlFor="idNumber">
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
                                        className="pl-10 bg-surface-50"
                                    />
                                </div>
                            </div>

                            {/* Department - Shown for Student and Staff Only (Facility Management roles are auto-assigned to Works Department) */}
                            {formData.role !== 'technician' && formData.role !== 'team_lead' && formData.role !== 'facility_manager' && formData.role !== 'maintenance_supervisor' && (
                                <div className="space-y-2 animate-in fade-in slide-in-from-top-1 duration-200">
                                    <label className="text-sm font-semibold text-surface-700 leading-none" htmlFor="department">
                                        Department
                                    </label>
                                    <div className="relative">
                                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                            <Building className="h-4 w-4 text-slate-400" />
                                        </div>
                                        <select
                                            id="department"
                                            name="department"
                                            value={formData.department}
                                            onChange={handleChange}
                                            required
                                            className={cn("flex h-10 w-full rounded-md border border-surface-200 bg-surface-50 px-3 py-2 text-sm pl-10 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent", "bg-surface-50")}
                                        >
                                            <option value="">Select your department</option>
                                            {formData.role === 'student'
                                            ? ACADEMIC_DEPARTMENTS.map((dept) => (
                                                <option key={dept} value={dept}>
                                                    {dept}
                                                </option>
                                            ))
                                            : SERVICE_DEPARTMENTS.map((dept) => (
                                                <option key={dept} value={dept}>
                                                    {dept}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                </div>
                            )}

                            {/* Specialization Dropdown for Technicians and Team Leads */}
                            {(formData.role === 'technician' || formData.role === 'team_lead') && (
                                <div className="space-y-2 animate-in fade-in slide-in-from-top-1 duration-200">
                                    <label className="text-sm font-semibold text-surface-700 leading-none" htmlFor="specialization">
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
                                            className={cn("flex h-10 w-full rounded-md border border-surface-200 bg-surface-50 pl-10 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent", "bg-surface-50")}
                                        >
                                            <option value="">Select maintenance category</option>
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
                                        Access Code (Required for {formData.role === 'student' ? 'Student' : formData.role === 'staff' ? 'Staff' : formData.role === 'src' ? 'SRC' : formData.role.charAt(0).toUpperCase() + formData.role.slice(1)})
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
                                <label className="text-sm font-semibold text-surface-700 leading-none" htmlFor="password">Password</label>
                                <Input
                                    id="password"
                                    name="password"
                                    type="password"
                                    value={formData.password}
                                    onChange={handleChange}
                                    required
                                    className="bg-surface-50"
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
                                <span className="w-full border-t border-surface-200" />
                            </div>
                            <div className="relative flex justify-center text-xs uppercase">
                                <span className="bg-white px-2 text-surface-500">Or</span>
                            </div>
                        </div>
                        <div className="text-surface-600">
                            Already have an account?{' '}
                            <Link to="/login" className="text-primary-600 font-semibold hover:text-primary-700 transition-colors">
                                Sign In
                            </Link>
                        </div>
                    </CardFooter>
                </Card>

                <div className="mt-8 text-center text-xs text-surface-400">
                    &copy; {new Date().getFullYear()} Mountain Top University. All rights reserved.
                </div>
            </div>
        </div>
    );
}
