import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Wrench } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '../components/ui/Card';

// Rate limiting constants
const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 5 * 60 * 1000; // 5 minutes
const STORAGE_KEY = 'login_attempts';

export default function Login() {
    const [identifier, setIdentifier] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const navigate = useNavigate();

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

            // Step C: If ID Number (no @), look it up
            if (!isEmail) {
                // Validate ID format (basic validation)
                if (identifier.length < 5) {
                    throw new Error('Invalid ID Number format');
                }

                // Use the secure RPC function to look up the email
                const { data: resolvedEmail, error } = await supabase
                    .rpc('get_email_by_id', { lookup_id: identifier.trim() });

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
            navigate('/dashboard');
        } catch (error) {
            console.error('Login error:', error);
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
                                    placeholder="your@email.com or ID Number"
                                    value={identifier}
                                    onChange={(e) => setIdentifier(e.target.value)}
                                    required
                                    className="bg-slate-50/50"
                                    autoComplete="username"
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
