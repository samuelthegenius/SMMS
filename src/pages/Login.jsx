import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Wrench } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '../components/ui/Card';

export default function Login() {
    const [identifier, setIdentifier] = useState(''); // Can be email or ID number
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const navigate = useNavigate();

    const handleLogin = async (e) => {
        e.preventDefault();
        setLoading(true);

        try {
            let emailToUse = identifier;

            // Step A: Check if input is Email or ID
            const isEmail = identifier.includes('@');

            // Step C: If ID Number (no @), look it up
            if (!isEmail) {
                // Use the secure RPC function to look up the email
                // This bypasses the RLS issue where an unauthenticated user can't search the profiles table
                const { data: resolvedEmail, error } = await supabase
                    .rpc('get_email_by_id', { lookup_id: identifier });

                if (error || !resolvedEmail) {
                    throw new Error('Invalid ID Number');
                }

                emailToUse = resolvedEmail;
            }

            // Step B: Proceed with standard Auth (using resolved email)
            const { error: authError } = await supabase.auth.signInWithPassword({
                email: emailToUse,
                password,
            });

            if (authError) throw authError;

            toast.success('Welcome back!');
            navigate('/dashboard');
        } catch (error) {
            toast.error(error.message || 'Failed to sign in');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-slate-50 flex flex-col items-center p-4">
            {/* Decorative Background */}
            <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-accent/5 pointer-events-none" />

            <div className="w-full max-w-md my-auto flex flex-col">
                <Card className="w-full relative z-10 border-slate-200/60 shadow-xl">
                    <CardHeader className="space-y-2 text-center pb-8 border-b-0">
                        <div className="mx-auto w-12 h-12 bg-primary rounded-xl flex items-center justify-center mb-2 shadow-lg shadow-primary/20">
                            <Wrench className="w-6 h-6 text-accent" />
                        </div>
                        <CardTitle className="text-2xl font-bold text-slate-900">Welcome Back</CardTitle>
                        <CardDescription className="text-base">
                            Sign in to the Smart Maintenance System
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <form onSubmit={handleLogin} className="space-y-4">
                            <div className="space-y-2">
                                <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70" htmlFor="identifier">
                                    Email or ID Number
                                </label>
                                <Input
                                    id="identifier"
                                    type="text"
                                    placeholder="student@mtu.edu.ng or U/2021/004"
                                    value={identifier}
                                    onChange={(e) => setIdentifier(e.target.value)}
                                    required
                                    className="bg-slate-50/50"
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70" htmlFor="password">
                                    Password
                                </label>
                                <Input
                                    id="password"
                                    type="password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    required
                                    className="bg-slate-50/50"
                                />
                            </div>
                            <Button className="w-full mt-4" type="submit" isLoading={loading}>
                                Sign In
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
                            Don't have an account?{' '}
                            <Link to="/signup" className="text-primary font-semibold hover:text-accent transition-colors">
                                Create Account
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
