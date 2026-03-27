/**
 * @file src/components/ProtectedRoute.jsx
 * @description Non-blocking Route Protection - shows content immediately, redirects only if definitely unauthenticated.
 */
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../contexts/useAuth';

export default function ProtectedRoute({ children }) {
    const { user, initializing } = useAuth();

    // Only redirect if we've confirmed there's no user (not during initial load)
    if (!user && !initializing) {
        return <Navigate to="/login" replace />;
    }

    // Render children immediately - let them handle loading states internally
    // This prevents the "white screen" blocking loader
    return children ? children : <Outlet />;
}
