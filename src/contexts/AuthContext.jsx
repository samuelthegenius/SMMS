/**
 * @file src/contexts/AuthContext.jsx
 * @description Non-blocking Authentication Provider using React 18 Concurrent Features.
 */
import { createContext, useEffect, useState, useRef, useCallback, useTransition } from 'react';
import { supabase } from '../lib/supabase';

const AuthContext = createContext({});
export { AuthContext };

export function AuthProvider({ children }) {
    const [user, setUser] = useState(null);
    const [profile, setProfile] = useState(null);
    const [loading, setLoading] = useState(false);
    const [isPending, startTransition] = useTransition();
    
    // Critical: Render children immediately, auth loads in background
    const [authReady, setAuthReady] = useState(false);

    const userIdRef = useRef(null);
    const profileCacheRef = useRef(new Map());

    const fetchProfile = useCallback(async (userId, currentUser, retryCount = 0) => {
        const cache = profileCacheRef.current;
        const cached = cache.get(userId);
        
        if (cached && (Date.now() - cached.timestamp) < 300000) {
            startTransition(() => setProfile(cached.data));
            return;
        }

        try {
            const timeoutPromise = new Promise((_, reject) => 
                setTimeout(() => reject(new Error('timeout')), 3000)
            );
            
            const fetchPromise = supabase
                .from('profiles')
                .select('*')
                .eq('id', userId)
                .maybeSingle();

            const { data, error } = await Promise.race([fetchPromise, timeoutPromise]);

            if (!error && data) {
                startTransition(() => setProfile(data));
                cache.set(userId, { data, timestamp: Date.now() });
            } else if (error?.code === 'PGRST116') {
                const defaultProfile = {
                    id: userId,
                    email: currentUser?.email || 'unknown@example.com',
                    role: 'student',
                    full_name: currentUser?.user_metadata?.full_name || 'Unknown User'
                };
                startTransition(() => setProfile(defaultProfile));
                cache.set(userId, { data: defaultProfile, timestamp: Date.now() });
            }
        } catch {
            if (retryCount < 1) {
                await new Promise(r => setTimeout(r, 1000));
                return fetchProfile(userId, currentUser, retryCount + 1);
            }
        }
    }, [startTransition]);

    useEffect(() => {
        let mounted = true;
        
        // Non-blocking auth initialization
        const initializeAuth = async () => {
            try {
                // Fast session check with lower timeout
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 1500);
                
                const { data: { session } } = await supabase.auth.getSession();
                clearTimeout(timeoutId);
                
                if (mounted && session?.user) {
                    userIdRef.current = session.user.id;
                    startTransition(() => setUser(session.user));
                    fetchProfile(session.user.id, session.user);
                }
            } catch {
                // Silent fail - app works without auth
            } finally {
                if (mounted) {
                    startTransition(() => setAuthReady(true));
                }
            }
        };

        // Use requestIdleCallback for non-critical auth check
        if ('requestIdleCallback' in window) {
            requestIdleCallback(() => initializeAuth(), { timeout: 2000 });
        } else {
            setTimeout(initializeAuth, 100);
        }

        const { data: { subscription } } = supabase.auth.onAuthStateChange(
            async (event, session) => {
                if (!mounted) return;
                
                if (event === 'TOKEN_REFRESHED' && session?.user) {
                    startTransition(() => {
                        setUser(session.user);
                        setLoading(false);
                    });
                    return;
                }

                if (session?.user) {
                    const currentId = userIdRef.current;
                    const newId = session.user.id;
                    
                    if (currentId !== newId) {
                        userIdRef.current = newId;
                        startTransition(() => setUser(session.user));
                        fetchProfile(newId, session.user);
                    } else {
                        startTransition(() => setUser(session.user));
                    }
                } else {
                    userIdRef.current = null;
                    startTransition(() => {
                        setUser(null);
                        setProfile(null);
                    });
                }
            }
        );

        return () => {
            mounted = false;
            subscription.unsubscribe();
        };
    }, [fetchProfile, startTransition]);

    const value = {
        user,
        profile,
        loading: loading || isPending,
        initializing: !authReady,
        isAdmin: profile?.role === 'admin',
        isTechnician: profile?.role === 'technician',
        isStaff: profile?.role === 'staff_member',
        isStudent: profile?.role === 'student',
    };

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
};
