/**
 * @file src/contexts/AuthContext.jsx
 * @description Global Authentication Provider using React Context API.
 * 
 * Key Features:
 * - Session Management: Persists user login state across page reloads.
 * - RBAC (Role-Based Access Control): Fetches and exposes user roles to protected routes.
 * - Real-time Sync: Listens for Supabase Auth events (LOGIN, SIGNOUT).
 */
import { createContext, useEffect, useState, useRef, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import Loader from '../components/Loader';

const AuthContext = createContext({});

export { AuthContext };

export function AuthProvider({ children }) {
    const [user, setUser] = useState(null);
    const [profile, setProfile] = useState(null);
    const [loading, setLoading] = useState(true);
    const [initialLoad, setInitialLoad] = useState(true);

    // Use a ref to track the current ID to avoid stale closure issues
    const userIdRef = useRef(null);
    // Cache profile to avoid unnecessary refetches
    const profileCacheRef = useRef(new Map());

    // Fetches the extended user profile (role, department) from the 'profiles' table.
    // This separation of 'auth.users' (credentials) and 'public.profiles' (metadata) 
    // is a standard security practice in Supabase.
    const fetchProfile = useCallback(async (userId, currentUser, retryCount = 0) => {
        // Check cache first
        const cache = profileCacheRef.current;
        const cached = cache.get(userId);
        
        // Use cached data if it's less than 5 minutes old
        if (cached && (Date.now() - cached.timestamp) < 300000) {
            setProfile(cached.data);
            setLoading(false);
            return;
        }

        try {
            // Add timeout to prevent hanging - reduced to 5 seconds
            const timeoutPromise = new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Profile fetch timeout after 5 seconds')), 5000)
            );
            
            const fetchPromise = supabase
                .from('profiles')
                .select('*')
                .eq('id', userId)
                .maybeSingle();

            const { data, error } = await Promise.race([fetchPromise, timeoutPromise]);

            if (!error && data) {
                setProfile(data);
                // Cache the result with timestamp
                cache.set(userId, { data, timestamp: Date.now() });
            } else if (error) {
                if (import.meta.env.DEV) {
                    console.error('Profile fetch error:', error);
                }
                // Retry logic for network errors
                if (retryCount < 2 && (error.message?.includes('timeout') || error.message?.includes('network'))) {
                    if (import.meta.env.DEV) {
                        console.log(`Retrying profile fetch (${retryCount + 1}/3)...`);
                    }
                    await new Promise(resolve => setTimeout(resolve, 1000));
                    return fetchProfile(userId, currentUser, retryCount + 1);
                }
                // Set a default profile if user exists but no profile record
                if (error.code === 'PGRST116') { // No rows returned
                    if (import.meta.env.DEV) {
                        console.warn('No profile found for user, setting default profile');
                    }
                    const defaultProfile = {
                        id: userId,
                        email: currentUser?.email || 'unknown@example.com',
                        role: 'student', // Default role
                        full_name: currentUser?.user_metadata?.full_name || 'Unknown User'
                    };
                    setProfile(defaultProfile);
                    cache.set(userId, { data: defaultProfile, timestamp: Date.now() });
                }
            }
        } catch (error) {
            if (import.meta.env.DEV) {
                console.error('Error fetching profile:', error.message);
            }
            // Retry logic for timeout errors
            if (retryCount < 2 && error.message?.includes('timeout')) {
                if (import.meta.env.DEV) {
                    console.log(`Retrying profile fetch after timeout (${retryCount + 1}/3)...`);
                }
                await new Promise(resolve => setTimeout(resolve, 2000));
                return fetchProfile(userId, currentUser, retryCount + 1);
            }
        } finally {
            setLoading(false);
            setInitialLoad(false);
        }
    }, []);

    useEffect(() => {
        let mounted = true;
        
        // 1. Initial Session Check:
        const initializeAuth = async () => {
            try {
                const { data: { session } } = await supabase.auth.getSession();
                if (mounted && session?.user) {
                    userIdRef.current = session.user.id;
                    setUser(session.user);
                    await fetchProfile(session.user.id, session.user);
                } else if (mounted) {
                    setLoading(false);
                    setInitialLoad(false);
                }
            } catch (error) {
                if (import.meta.env.DEV) {
                    console.error('Auth initialization error:', error);
                }
                if (mounted) {
                    setLoading(false);
                    setInitialLoad(false);
                }
            }
        };

        initializeAuth();

        // 2. Auth State Listener:
        const { data: { subscription } } = supabase.auth.onAuthStateChange(
            async (event, session) => {
                if (!mounted) return;
                
                const currentId = userIdRef.current;
                const newId = session?.user?.id;

                // Priority Check: If it's just a token refresh, NEVER show loader.
                if (event === 'TOKEN_REFRESHED' && session?.user) {
                    setUser(session.user);
                    setLoading(false);
                    return;
                }

                if (session?.user) {
                    // For SIGNED_IN or other events, verify if ID actually changed
                    if (currentId !== newId) {
                        // Don't show loading state after initial load
                        if (!initialLoad) {
                            setLoading(false);
                        }
                        userIdRef.current = newId;
                        setUser(session.user);
                        await fetchProfile(newId, session.user);
                    } else {
                        // Same user, different event (e.g. recovered session)
                        setUser(session.user);
                        if (!initialLoad) {
                            setLoading(false);
                        }
                    }
                } else {
                    // Logic for SIGNED_OUT
                    userIdRef.current = null;
                    setUser(null);
                    setProfile(null);
                    if (!initialLoad) {
                        setLoading(false);
                    }
                }
            }
        );

        return () => {
            mounted = false;
            subscription.unsubscribe();
        };
    }, [fetchProfile, initialLoad]);

    const value = {
        user,
        profile,
        loading,
        isAdmin: profile?.role === 'admin',
        isTechnician: profile?.role === 'technician',
        isStaff: profile?.role === 'staff_member',
        isStudent: profile?.role === 'student',
    };

    return (
        <AuthContext.Provider value={value}>
            {initialLoad ? (
                <div className="flex items-center justify-center min-h-screen bg-slate-50">
                    <Loader />
                </div>
            ) : (
                children
            )}
        </AuthContext.Provider>
    );
};
