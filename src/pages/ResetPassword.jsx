import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { toast } from 'sonner';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '../components/ui/Card';

export default function ResetPassword() {
    const [password, setPassword] = useState('');
    const [confirm, setConfirm] = useState('');
    const [loading, setLoading] = useState(false);
    const [ready, setReady] = useState(false);
    const navigate = useNavigate();

    useEffect(() => {
        // Supabase fires PASSWORD_RECOVERY when the reset link is opened
        const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
            if (event === 'PASSWORD_RECOVERY') {
                setReady(true);
            }
        });
        return () => subscription.unsubscribe();
    }, []);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (password !== confirm) {
            toast.error('Passwords do not match.');
            return;
        }
        if (password.length < 8) {
            toast.error('Password must be at least 8 characters.');
            return;
        }
        setLoading(true);
        try {
            const { error } = await supabase.auth.updateUser({ password });
            if (error) throw error;
            toast.success('Password updated! Please sign in with your new password.');
            navigate('/login');
        } catch (error) {
            toast.error(error.message || 'Failed to update password. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-surface-50 flex flex-col items-center p-4 relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-primary-500/5 via-secondary-500/5 to-accent-500/5 pointer-events-none" />
            <div className="absolute top-0 right-0 w-96 h-96 bg-primary-400/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
            <div className="absolute bottom-0 left-0 w-96 h-96 bg-secondary-400/10 rounded-full blur-3xl translate-y-1/2 -translate-x-1/2" />

            <div className="w-full max-w-md my-auto flex flex-col relative z-10">
                <Card className="w-full border-surface-200/60 shadow-2xl bg-white/80 backdrop-blur-sm">
                    <CardHeader className="space-y-3 text-center pb-8 border-b-0">
                        <Link to="/" className="mx-auto w-16 h-16 bg-gradient-to-br from-primary-500 to-primary-600 rounded-2xl flex items-center justify-center mb-2 shadow-lg shadow-primary-500/25 p-2 cursor-pointer hover:scale-105 transition-transform">
                            <img src="/mtulogo.jpg" alt="MTU Logo" className="w-12 h-12 object-contain rounded" />
                        </Link>
                        <CardTitle className="text-2xl font-bold text-surface-900">Set New Password</CardTitle>
                        <CardDescription className="text-base text-surface-600">
                            {ready
                                ? 'Choose a new password for your account.'
                                : 'Verifying your reset link…'}
                        </CardDescription>
                    </CardHeader>

                    {ready && (
                        <CardContent>
                            <form onSubmit={handleSubmit} className="space-y-4">
                                <div className="space-y-2">
                                    <label className="text-sm font-semibold text-surface-700 leading-none" htmlFor="password">
                                        New Password
                                    </label>
                                    <Input
                                        id="password"
                                        type="password"
                                        placeholder="At least 8 characters"
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        required
                                        className="bg-surface-50"
                                        autoComplete="new-password"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-sm font-semibold text-surface-700 leading-none" htmlFor="confirm">
                                        Confirm Password
                                    </label>
                                    <Input
                                        id="confirm"
                                        type="password"
                                        placeholder="Repeat your new password"
                                        value={confirm}
                                        onChange={(e) => setConfirm(e.target.value)}
                                        required
                                        className="bg-surface-50"
                                        autoComplete="new-password"
                                    />
                                </div>
                                <Button className="w-full mt-4" type="submit" isLoading={loading} disabled={loading}>
                                    Update Password
                                </Button>
                            </form>
                        </CardContent>
                    )}

                    <CardFooter className="flex flex-col space-y-4 text-center text-sm pt-4">
                        <Link to="/login" className="text-primary-600 font-semibold hover:text-primary-700 transition-colors">
                            Back to Sign In
                        </Link>
                    </CardFooter>
                </Card>

                <div className="mt-8 text-center text-xs text-surface-400">
                    &copy; {new Date().getFullYear()} Mountain Top University. All rights reserved.
                </div>
            </div>
        </div>
    );
}
