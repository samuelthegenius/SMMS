import { useState } from 'react';
import { useNavigate, Link, Navigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { toast } from 'sonner';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '../components/ui/Card';
import Loader from '../components/Loader';
import { useAuth } from '../contexts/useAuth';

// Rate limiting constants
const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 5 * 60 * 1000; // 5 minutes
const STORAGE_KEY = 'login_attempts';

/** Returns true if the error is a pure network/connectivity failure (not a wrong-creds error) */
const isNetworkFailure = (error) => {
    const name = error?.name || '';
    const msg  = error?.message || '';
    return (
        name === 'AuthRetryableFetchError' ||
        msg.includes('Failed to fetch') ||
        msg.includes('ERR_CONNECTION') ||
        msg.includes('ERR_NETWORK') ||
        msg.includes('ERR_QUIC') ||
        msg.includes('NetworkError')
    );
};

export default function Login() {
    const { user, initializing } = useAuth();
    const [identifier, setIdentifier] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const navigate = useNavigate();

    if (initializing) {
        return <Loader variant="auth-login" />;
    }

    if (user) {
        return <Navigate to="/dashboard" replace />;
    }

    // Check rate limit before allowing login attempt
    const checkRateLimit = () => {
        const now = Date.now();
        const stored = localStorage.getItem(STORAGE_KEY);
        
        if (stored) {
            const { attempts, lockoutTime } = JSON.parse(stored);
            
            // If in lockout period
            if (lockoutTime && now < lockoutTime) {
                const minutesLeft = Math.ceil((lockoutTime - now) / 60000);
                throw new Error(`Too many failed attempts. Please try again in ${minutesLeft} minute(s).`);
            }
            
            // If lockout expired, reset
            if (lockoutTime && now >= lockoutTime) {
                localStorage.setItem(STORAGE_KEY, JSON.stringify({ attempts: 0, lockoutTime: null }));
                return true;
            }
            
            // Check if max attempts reached
            if (attempts >= MAX_LOGIN_ATTEMPTS) {
                const lockoutTime = now + LOCKOUT_DURATION_MS;
                localStorage.setItem(STORAGE_KEY, JSON.stringify({ attempts, lockoutTime }));
                throw new Error(`Too many failed attempts. Account locked for 5 minutes.`);
            }
        }
        return true;
    };

    // Record failed login attempt
    const recordFailedAttempt = () => {
        const now = Date.now();
        const stored = localStorage.getItem(STORAGE_KEY);
        const { attempts = 0 } = stored ? JSON.parse(stored) : { attempts: 0 };
        
        const newAttempts = attempts + 1;
        localStorage.setItem(
            STORAGE_KEY,
            JSON.stringify({
                attempts: newAttempts,
                lockoutTime: newAttempts >= MAX_LOGIN_ATTEMPTS ? now + LOCKOUT_DURATION_MS : null
            })
        );
        
        return MAX_LOGIN_ATTEMPTS - newAttempts;
    };

    // Reset on successful login
    const resetRateLimit = () => {
        localStorage.removeItem(STORAGE_KEY);
    };

    const handleLogin = async (e) => {
        e.preventDefault();
        
        // Client-side rate limit check
        try {
            checkRateLimit();
        } catch (error) {
            toast.error(error.message);
            return;
        }

        setLoading(true);

        try {
            let emailToUse = identifier;

            // Step A: Check if input is Email or ID
            const isEmail = identifier.includes('@');

            // Step C: If ID Number (no @), look it up with timing protection
            if (!isEmail) {
                // Validate ID format (basic validation)
                if (identifier.length < 5) {
                    // Add artificial delay to prevent timing attacks
                    await new Promise(resolve => setTimeout(resolve, 200 + Math.random() * 100));
                    throw new Error('Invalid ID Number or password');
                }

                // Use secure RPC function to look up email
                const startTime = Date.now();
                const { data: resolvedEmail, error } = await supabase
                    .rpc('get_email_by_id', { lookup_id: identifier.trim() });
                
                // Add constant-time delay to prevent timing attacks
                const elapsed = Date.now() - startTime;
                const minDelay = 300; // Minimum 300ms
                if (elapsed < minDelay) {
                    await new Promise(resolve => setTimeout(resolve, minDelay - elapsed));
                }

                if (error) {
                    // Handle rate limit errors from server
                    if (error.message?.includes('Too many attempts')) {
                        throw new Error(error.message);
                    }
                    recordFailedAttempt();
                    throw new Error('Invalid ID Number or password');
                }

                if (!resolvedEmail) {
                    recordFailedAttempt();
                    throw new Error('Invalid ID Number or password');
                }

                emailToUse = resolvedEmail;
            }

            // Step B: Proceed with standard Auth (using resolved email)
            const { error: authError } = await supabase.auth.signInWithPassword({
                email: emailToUse,
                password,
            });

            if (authError) {
                recordFailedAttempt();
                // Generic error message to prevent user enumeration
                if (authError.message.includes('Invalid login credentials')) {
                    throw new Error('Invalid ID Number or password');
                }
                throw authError;
            }

            // Success - reset rate limit
            resetRateLimit();
            toast.success('Welcome back!');
            
            // Navigate to dashboard - the routing system will handle the auth state
            navigate('/dashboard');
        } catch (error) {
            // Network failure — the server is unreachable, not a bad password
            if (isNetworkFailure(error)) {
                toast.error(
                    'Cannot connect to the server. Please check your internet connection or try again later.',
                    { duration: 6000 }
                );
                return; // Do NOT record a failed attempt for infrastructure issues
            }

            // Don't expose specific errors to prevent user enumeration
            const remaining = MAX_LOGIN_ATTEMPTS - (JSON.parse(localStorage.getItem(STORAGE_KEY) || '{"attempts":0}').attempts);
            if (remaining <= 0) {
                toast.error('Account locked. Please try again later.');
            } else {
                toast.error('Invalid ID Number or password');
            }
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-surface-50 flex flex-col items-center p-4 relative overflow-hidden">
            {/* Decorative Background */}
            <div className="absolute inset-0 bg-gradient-to-br from-primary-500/5 via-secondary-500/5 to-accent-500/5 pointer-events-none" />
            <div className="absolute top-0 right-0 w-96 h-96 bg-primary-400/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
            <div className="absolute bottom-0 left-0 w-96 h-96 bg-secondary-400/10 rounded-full blur-3xl translate-y-1/2 -translate-x-1/2" />

            <div className="w-full max-w-md my-auto flex flex-col relative z-10">
                <Card className="w-full border-surface-200/60 shadow-2xl bg-white/80 backdrop-blur-sm">
                    <CardHeader className="space-y-3 text-center pb-8 border-b-0">
                        <Link to={user ? "/dashboard" : "/"} className="mx-auto w-16 h-16 bg-gradient-to-br from-primary-500 to-primary-600 rounded-2xl flex items-center justify-center mb-2 shadow-lg shadow-primary-500/25 p-2 cursor-pointer hover:scale-105 transition-transform">
                            <img 
                                src="/mtulogo.jpg" 
                                alt="MTU Logo" 
                                className="w-12 h-12 object-contain rounded"
                            />
                        </Link>
                        <CardTitle className="text-2xl font-bold text-surface-900">Welcome Back</CardTitle>
                        <CardDescription className="text-base text-surface-600">
                            Sign in to MTU SMMS<br/>
                            <span className="text-xs text-surface-400">Smart Maintenance Management System</span>
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <form onSubmit={handleLogin} className="space-y-4">
                            <div className="space-y-2">
                                <label className="text-sm font-semibold text-surface-700 leading-none" htmlFor="identifier">
                                    Email or ID Number
                                </label>
                                <Input
                                    id="identifier"
                                    type="text"
                                    placeholder="your@email.com or ID Number"
                                    value={identifier}
                                    onChange={(e) => setIdentifier(e.target.value)}
                                    required
                                    className="bg-surface-50"
                                    autoComplete="username"
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-semibold text-surface-700 leading-none" htmlFor="password">
                                    Password
                                </label>
                                <Input
                                    id="password"
                                    type="password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    required
                                    className="bg-surface-50"
                                    autoComplete="current-password"
                                />
                            </div>
                            <Button className="w-full mt-4" type="submit" isLoading={loading} disabled={loading}>
                                Sign In
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
                            Don't have an account?{' '}
                            <Link to="/signup" className="text-primary-600 font-semibold hover:text-primary-700 transition-colors">
                                Create Account
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
