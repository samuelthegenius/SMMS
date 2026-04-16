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
    const [_isPending, startTransition] = useTransition();
    const [backendUnreachable, setBackendUnreachable] = useState(false);
    
    // Critical: Render children immediately, auth loads in background
    const [authReady, setAuthReady] = useState(false);

    const userIdRef = useRef(null);
    const profileCacheRef = useRef(new Map());
    const fetchingProfileRef = useRef(null); // Guard: track in-flight user ID

    const fetchProfile = useCallback(async (userId, currentUser, retryCount = 0) => {
        const cache = profileCacheRef.current;
        const cached = cache.get(userId);
        
        if (cached && (Date.now() - cached.timestamp) < 300000) {
            startTransition(() => setProfile(cached.data));
            return;
        }

        // Guard against concurrent fetches for the same user (e.g. SIGNED_IN + TOKEN_REFRESHED)
        if (retryCount === 0 && fetchingProfileRef.current === userId) return;
        fetchingProfileRef.current = userId;

        try {
            const timeoutPromise = new Promise((_, reject) => 
                setTimeout(() => reject(new Error('timeout')), 5000)
            );
            
            const fetchPromise = supabase
                .from('profiles')
                .select('*')
                .eq('id', userId)
                .maybeSingle();

            const { data, error } = await Promise.race([fetchPromise, timeoutPromise]);

            if (!error && data) {
                // Profile found — use it
                startTransition(() => setProfile(data));
                cache.set(userId, { data, timestamp: Date.now() });
            } else if (!error && !data) {
                // maybeSingle() returns null data (no error) when no row is found.
                // Build a fallback from auth user_metadata so the app doesn't hang.
                const defaultProfile = {
                    id: userId,
                    email: currentUser?.email || '',
                    role: currentUser?.user_metadata?.role || 'student',
                    full_name: currentUser?.user_metadata?.full_name || 'Unknown User',
                    department: currentUser?.user_metadata?.department || '',
                };
                startTransition(() => setProfile(defaultProfile));
                cache.set(userId, { data: defaultProfile, timestamp: Date.now() });
            } else if (error && error.code !== 'PGRST116') {
                // Actual DB error — don't swallow it; let retry handle it
                throw error;
            }
        } catch {
            if (retryCount < 1) {
                await new Promise(r => setTimeout(r, 1000));
                return fetchProfile(userId, currentUser, retryCount + 1);
            }
            // After retries, build minimal fallback so the UI doesn't hang forever
            const fallback = {
                id: userId,
                email: currentUser?.email || '',
                role: currentUser?.user_metadata?.role || 'student',
                full_name: currentUser?.user_metadata?.full_name || 'Unknown User',
                department: currentUser?.user_metadata?.department || '',
            };
            startTransition(() => setProfile(fallback));
        } finally {
            if (fetchingProfileRef.current === userId) {
                fetchingProfileRef.current = null;
            }
        }
    }, [startTransition]);

	useEffect(() => {
		let mounted = true;
		let authInitialized = false;

		// Non-blocking auth initialization
		const initializeAuth = async () => {
			if (authInitialized) return;
			authInitialized = true;

			try {
				const { data: { session }, error } = await supabase.auth.getSession();

				if (error) {
					// AuthRetryableFetchError means Supabase is unreachable (paused project / no network)
					const isNetworkErr =
						error.name === 'AuthRetryableFetchError' ||
						error.message?.includes('Failed to fetch');
					if (isNetworkErr && mounted) {
						startTransition(() => setBackendUnreachable(true));
					}
				}

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
			authInitialized = false;
			subscription.unsubscribe();
		};
	}, [fetchProfile, startTransition]);

    const value = {
        user,
        profile,
        // Note: do NOT include isPending here. isPending from useTransition is
        // an internal React scheduling hint that briefly becomes true on every
        // startTransition call (every auth update). Exposing it as `loading`
        // causes consumers to see loading=true transiently, triggering remounts.
        loading,
        initializing: !authReady,
        backendUnreachable,
        isAdmin: profile?.role === 'admin',
        isTechnician: profile?.role === 'technician',
        isStaff: profile?.role === 'staff',
        isStudent: profile?.role === 'student',
    };

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
};
