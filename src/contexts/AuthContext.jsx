/**
 * @file src/contexts/AuthContext.jsx
 * @description Global Authentication Provider using React Context API.
 * 
 * Key Features:
 * - Session Management: Persists user login state across page reloads.
 * - RBAC (Role-Based Access Control): Fetches and exposes user roles to protected routes.
 * - Real-time Sync: Listens for Supabase Auth events (LOGIN, SIGNOUT).
 */
import { createContext, useContext, useEffect, useState, useRef } from 'react';
import { supabase } from '../lib/supabase';
import Loader from '../components/Loader';

const AuthContext = createContext({});

export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }) {
    const [user, setUser] = useState(null);
    const [profile, setProfile] = useState(null);
    const [loading, setLoading] = useState(true);

    // Use a ref to track the current ID to avoid stale closure issues
    const userIdRef = useRef(null);

    useEffect(() => {
        // 1. Initial Session Check:
        supabase.auth.getSession().then(({ data: { session } }) => {
            if (session?.user) {
                userIdRef.current = session.user.id;
                setUser(session.user);
                fetchProfile(session.user.id);
            } else {
                setLoading(false);
            }
        });

        // 2. Auth State Listener:
        const { data: { subscription } } = supabase.auth.onAuthStateChange(
            (event, session) => {
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
                        setLoading(true);
                        userIdRef.current = newId;
                        setUser(session.user);
                        fetchProfile(newId);
                    } else {
                        // Same user, different event (e.g. recovered session)
                        setUser(session.user);
                        setLoading(false);
                    }
                } else {
                    // Logic for SIGNED_OUT
                    userIdRef.current = null;
                    setUser(null);
                    setProfile(null);
                    setLoading(false);
                }
            }
        );

        return () => subscription.unsubscribe();
    }, []);

    // Fetches the extended user profile (role, department) from the 'profiles' table.
    // This separation of 'auth.users' (credentials) and 'public.profiles' (metadata) 
    // is a standard security practice in Supabase.
    const fetchProfile = async (userId) => {
        try {
            const { data, error } = await supabase
                .from('profiles')
                .select('*')
                .eq('id', userId)
                .maybeSingle();

            if (!error && data) setProfile(data);
        } catch (error) {
            console.error('Error fetching profile:', error);
        } finally {
            setLoading(false);
        }
    };

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
            {loading ? (
                <div className="flex items-center justify-center min-h-screen bg-slate-50">
                    <Loader />
                </div>
            ) : (
                children
            )}
        </AuthContext.Provider>
    );
};
