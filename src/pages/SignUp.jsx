import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Wrench, Loader2, HardHat, Building, IdCard } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '../components/ui/Card';
import { cn } from '../lib/utils';
import { MAINTENANCE_CATEGORIES } from '../utils/constants';

export default function SignUp() {
    const [formData, setFormData] = useState({
        fullName: '',
        email: '',
        password: '',
        role: 'student',
        accessCode: '',
        specialization: '',
        idNumber: '', // identification_number
        department: '' // department
    });
    const [loading, setLoading] = useState(false);
    const navigate = useNavigate();

    const handleSignUp = async (e) => {
        e.preventDefault();
        console.log("DEBUG: handleSignUp called - v3 (Array Fix)"); // Debug log to confirm new code

        // Security Verification Logic
        if (formData.role !== 'student') {
            let expectedSecret = '';

            switch (formData.role) {
                case 'staff':
                    expectedSecret = import.meta.env.VITE_STAFF_SECRET;
                    break;
                case 'technician':
                    expectedSecret = import.meta.env.VITE_TECH_SECRET;
                    break;
                default:
                    break;
            }

            // Only validate if a secret is expected (i.e. not student)
            if (expectedSecret && formData.accessCode !== expectedSecret) {
                toast.error(`Invalid Access Code for ${formData.role.replace('_', ' ')}`);
                return;
            }
        }

        // Validate Specialization for Technician
        if (formData.role === 'technician' && !formData.specialization) {
            toast.error('Please select a specialization');
            return;
        }

        setLoading(true);

        try {
            // 1. Sign Up the User
            const { data: authData, error: authError } = await supabase.auth.signUp({
                email: formData.email,
                password: formData.password,
                options: {
                    data: {
                        full_name: formData.fullName,
                        role: formData.role,
                        department: formData.role === 'technician' ? 'Works Department' : formData.department,
                    },
                },
            });

            if (authError) throw authError;

            // 2. Insert into Profiles Table manually matching the schema
            // Use upsert to handle cases where a trigger might have already created the row
            if (authData?.user) {
                const skillsPayload = formData.role === 'technician' && formData.specialization ? [formData.specialization] : null;
                console.log("DEBUG: Inserting Profile with skills:", skillsPayload); // Log payload

                const { error: profileError } = await supabase
                    .from('profiles')
                    .upsert([
                        {
                            id: authData.user.id,
                            full_name: formData.fullName,
                            email: formData.email,
                            role: formData.role,
                            identification_number: formData.idNumber,
                            department: formData.role === 'technician' ? 'Works Department' : formData.department,
                            skills: formData.role === 'technician' ?
                                (Array.isArray(formData.specialization) ? formData.specialization[0] : formData.specialization)
                                : null,
                        },
                    ], { onConflict: 'id' });

                if (profileError) {
                    console.error('Profile creation error object:', profileError);
                    console.error('Profile creation error message:', profileError.message);
                    console.error('Profile creation error details:', profileError.details);
                    throw new Error(`Profile setup failed (DB): ${profileError.message}`);
                }
            }

            toast.success('Account created successfully! Please sign in.');
            navigate('/login');
        } catch (error) {
            console.error("SignUp Catch Error:", error);
            toast.error(error.message || 'Failed to create account');
        } finally {
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
                                    placeholder="user@mtu.edu.ng"
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
                            {formData.role !== 'student' && (
                                <div className="space-y-2 animate-in fade-in slide-in-from-top-1 duration-200">
                                    <label className="text-sm font-medium leading-none text-indigo-600" htmlFor="accessCode">
                                        Access Code (Required for {formData.role.replace('_', ' ')})
                                    </label>
                                    <Input
                                        id="accessCode"
                                        name="accessCode"
                                        type="password"
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
