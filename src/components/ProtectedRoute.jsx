/**
 * @file src/components/ProtectedRoute.jsx
 * @description Route Protection - blocks during initial auth check, then non-blocking for updates.
 */
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../contexts/useAuth';
import Loader from './Loader';

export default function ProtectedRoute({ children }) {
    const { user, initializing } = useAuth();

    // Block during initial auth check to prevent flash/redirect loops
    if (initializing) {
        return <Loader variant="simple" />;
    }

    // Only redirect if we've confirmed there's no user
    if (!user) {
        return <Navigate to="/login" replace />;
    }

    // Auth confirmed - render the protected content
    return children ? children : <Outlet />;
}
