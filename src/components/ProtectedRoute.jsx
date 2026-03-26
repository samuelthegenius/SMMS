/**
 * @file src/components/ProtectedRoute.jsx
 * @description Higher-Order Component (HOC) for Route Security.
 * 
 * Key Features:
 * - Authentication Guard: Redirects unauthenticated users to the Login page.
 * - Loading State: Prevents "flash of unauthenticated content" by showing a loader while checking session.
 * - Centralized Logic: Wraps protected routes in App.jsx to enforce security policies globally.
 */
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../contexts/useAuth';
import Loader from './Loader';

export default function ProtectedRoute({ children }) {
    const { user, profile, loading } = useAuth();

    // 1. Authentication Check:
    // If no user is logged in, redirect to login.
    if (!user && !loading) return <Navigate to="/login" replace />;

    // 2. Loading State:
    // Show loader only if we're checking authentication for the first time
    if (loading && !user) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-slate-50">
                <div className="text-center">
                    <Loader />
                    <p className="mt-4 text-slate-500 font-medium">Loading...</p>
                </div>
            </div>
        );
    }

    // 3. Profile Check:
    // If user exists but no profile yet, show a brief loader
    if (user && !profile) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-slate-50">
                <div className="text-center">
                    <Loader />
                    <p className="mt-4 text-slate-500 font-medium">Loading Profile...</p>
                </div>
            </div>
        );
    }

    // 4. Render Content:
    // If used as a wrapper <ProtectedRoute><Component /></ProtectedRoute>, render children.
    // If used as a Layout Route <Route element={<ProtectedRoute />}>, render <Outlet />.
    return children ? children : <Outlet />;
}
