/**
 * @file src/contexts/AuthContext.jsx
 * @description Global Authentication Provider using React Context API.
 * 
 * Key Features:
 * - Session Management: Persists user login state across page reloads.
 * - RBAC (Role-Based Access Control): Fetches and exposes user roles to protected routes.
 * - Real-time Sync: Listens for Supabase Auth events (LOGIN, SIGNOUT).
 */
import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import Loader from '../components/Loader';

const AuthContext = createContext({});

export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }) {
    const [user, setUser] = useState(null);
    const [profile, setProfile] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        // 1. Initial Session Check:
        // Retrieves the current active session from local storage (if any).
        supabase.auth.getSession().then(({ data: { session } }) => {
            setUser(session?.user ?? null);
            if (session?.user) fetchProfile(session.user.id);
            else setLoading(false);
        });

        // 2. Auth State Listener:
        // Subscribes to auth changes to handle dynamic logouts or token refreshes.
        const { data: { subscription } } = supabase.auth.onAuthStateChange(
            (event, session) => {
                // Only trigger global loading if we are essentially logging in from a logged-out state.
                // If we already have a user and get a TOKEN_REFRESHED, we don't want to show the spinner.

                if (session?.user) {
                    // If the user ID has changed (login) OR we don't have a profile yet, fetch it.
                    if (user?.id !== session.user.id || !profile) {
                        // Only show spinner if completely switching users
                        if (user?.id !== session.user.id) setLoading(true);

                        setUser(session.user);
                        fetchProfile(session.user.id);
                    } else {
                        // Silent update (e.g. access token refresh) - Do NOT set loading=true
                        setUser(session.user);
                    }
                } else {
                    // Logic for SIGNED_OUT
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
        isStaff: profile?.role === 'staff',
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
