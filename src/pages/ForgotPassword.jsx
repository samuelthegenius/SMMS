import { useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { toast } from 'sonner';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '../components/ui/Card';

export default function ForgotPassword() {
    const [email, setEmail] = useState('');
    const [loading, setLoading] = useState(false);
    const [sent, setSent] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
            const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
                redirectTo: `${window.location.origin}/reset-password`,
            });
            if (error) throw error;
            setSent(true);
        } catch (error) {
            toast.error(error.message || 'Failed to send reset email. Please try again.');
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
                        <CardTitle className="text-2xl font-bold text-surface-900">Reset Password</CardTitle>
                        <CardDescription className="text-base text-surface-600">
                            {sent
                                ? 'Check your email for a reset link.'
                                : 'Enter your email and we\'ll send you a reset link.'}
                        </CardDescription>
                    </CardHeader>

                    {!sent && (
                        <CardContent>
                            <form onSubmit={handleSubmit} className="space-y-4">
                                <div className="space-y-2">
                                    <label className="text-sm font-semibold text-surface-700 leading-none" htmlFor="email">
                                        Email Address
                                    </label>
                                    <Input
                                        id="email"
                                        type="email"
                                        placeholder="your@email.com"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        required
                                        className="bg-surface-50"
                                        autoComplete="email"
                                    />
                                </div>
                                <Button className="w-full mt-4" type="submit" isLoading={loading} disabled={loading}>
                                    Send Reset Link
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
