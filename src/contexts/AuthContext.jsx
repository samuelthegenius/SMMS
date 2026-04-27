/**
 * @file src/contexts/AuthContext.jsx
 * @description Non-blocking Authentication Provider using React 18 Concurrent Features.
 */
import { createContext, useEffect, useState, useRef, useCallback, useTransition, useMemo } from 'react';
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

        // Helper to check if error is network-related (retryable)
        const isNetworkError = (err) => {
            if (!err) return false;
            const networkErrorCodes = ['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'ECONNREFUSED'];
            const networkErrorMessages = ['Failed to fetch', 'NetworkError', 'timeout', 'aborted'];
            return (
                networkErrorCodes.includes(err.code) ||
                networkErrorMessages.some(msg => err.message?.includes(msg)) ||
                err.name === 'TypeError' // Usually indicates network failure
            );
        };

        // Helper to create fallback profile (only when row is confirmed missing)
        const createFallbackProfile = (reason) => {
            const rawRole = currentUser?.user_metadata?.role || 'student';
            const normalizedRole = rawRole === 'staff_member' ? 'staff' : rawRole;
            return {
                id: userId,
                email: currentUser?.email || '',
                role: normalizedRole,
                full_name: currentUser?.user_metadata?.full_name || 'Unknown User',
                department: currentUser?.user_metadata?.department || '',
                _isFallback: true,
                _fallbackReason: reason,
            };
        };

        try {
            const timeoutPromise = new Promise((_, reject) =>
                setTimeout(() => reject(new Error('timeout')), 8000)
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
                // Confirmed: profile row is missing from database (not a network error)
                // This is a permanent condition - use fallback
                const fallback = createFallbackProfile('missing_row');
                startTransition(() => setProfile(fallback));
                cache.set(userId, { data: fallback, timestamp: Date.now() });
            } else {
                // Got an error from Supabase - throw to retry logic
                throw error;
            }
        } catch (err) {
            // Check if this is a network error that we should retry
            const isRetryable = isNetworkError(err) || (err?.code && err.code.startsWith('PGRST'));

            if (isRetryable && retryCount < 3) {
                // Exponential backoff: 1s, 2s, 4s
                const backoffMs = Math.min(1000 * Math.pow(2, retryCount), 4000);
                await new Promise(r => setTimeout(r, backoffMs));
                return fetchProfile(userId, currentUser, retryCount + 1);
            }

            // Max retries reached or non-retryable error
            // Check if this is a confirmed "row not found" case (PGRST116 = no rows)
            if (err?.code === 'PGRST116') {
                const fallback = createFallbackProfile('missing_row');
                startTransition(() => setProfile(fallback));
                cache.set(userId, { data: fallback, timestamp: Date.now() });
            } else {
                // Network or other error - don't fall back, keep loading state
                // The UI will show a loader until profile is fetched
                // Don't set any profile - let the UI continue showing loading state
                // The user can refresh the page to retry
            }
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
					// Clear cache on sign out to prevent stale profile data
					profileCacheRef.current.clear();
					fetchingProfileRef.current = null;
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

    const value = useMemo(() => ({
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
        isSRC: profile?.role === 'src',
        isPorter: profile?.role === 'porter',
        // Department-based admin access
        hasAdminAccess: profile?.role === 'admin' || profile?.department === 'Student Affairs' || profile?.role === 'src',
    }), [user, profile, loading, authReady, backendUnreachable]);

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
};
