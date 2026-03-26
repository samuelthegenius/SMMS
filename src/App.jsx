/**
 * @file src/App.jsx
 * @description Root Component and Routing Configuration.
 * 
 * Architecture:
 * - Routing Strategy: Uses 'react-router-dom' for client-side routing.
 * - Dependency Injection: Wraps the entire tree in context providers (AuthProvider) for global state access.
 * - Security Layer: Implements ProtectedRoute middleware to guard sensitive pages.
 */
import { Suspense, useEffect, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { useAuth } from './contexts/useAuth';
import Layout from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';
import Loader from './components/Loader';
import InstallPrompt from './components/InstallPrompt';
import { Toaster } from 'sonner';

import Login from './pages/Login';
import SignUp from './pages/SignUp';
import TicketForm from './pages/TicketForm';

// Lazy load heavy components
const UserDashboard = lazy(() => import('./pages/dashboards/UserDashboard'));
const TechnicianDashboard = lazy(() => import('./pages/dashboards/TechnicianDashboard'));
const AdminDashboard = lazy(() => import('./pages/dashboards/AdminDashboard'));
const AnalyticsPage = lazy(() => import('./pages/AnalyticsPage'));
const LandingPage = lazy(() => import('./pages/LandingPage'));

// Lazy load admin-specific components
const SecurityDashboard = lazy(() => import('./pages/dashboards/SecurityDashboard'));
const ReassignTechnician = lazy(() => import('./components/ReassignTechnician'));

/**
 * @function DashboardRouter
 * @description Role-Based Access Control (RBAC) Switcher.
 * Dynamically renders the appropriate dashboard component based on the authenticated user's role.
 */
function DashboardRouter() {
  const { profile } = useAuth();

  if (!profile) return <Loader />;

  switch (profile.role) {
    case 'admin':
      return <AdminDashboard />;
    case 'technician':
      return <TechnicianDashboard />;
    // ROUTING SECURITY: Staff and Students share the "Reporter" view.
    // Technicians and Admins get the "Resolver" view.
    case 'student':
    case 'staff':
    default:
      return <UserDashboard />;
  }
}

export default function App() {
  useEffect(() => {
    // Defer non-critical monitoring to improve initial load
    const deferMonitoring = async () => {
      // Wait for initial render before starting monitoring
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Initialize performance monitoring
      import('./utils/performanceMonitoring.js').then(({ initPerformanceMonitoring, logPerformanceWarnings }) => {
        initPerformanceMonitoring();
        // Log warnings after 5 seconds
        setTimeout(logPerformanceWarnings, 5000);
      });

      // Initialize security monitoring after app mounts
      import('./utils/securityMonitoring.js').then(({ initializeSecurityMonitoring }) => {
        initializeSecurityMonitoring();
      });

      // Register service worker
      import('./utils/registerSW.js').then(() => {
        // Service worker registered
      });
    };

    // Run in background to not block initial render
    deferMonitoring();
  }, []);

  return (
    <BrowserRouter>
      {/* 
          Global Context Provider:
          Injects authentication state (user, session, RBAC profile) into all child components.
      */}
      <AuthProvider>
        <Suspense fallback={<Loader />}>
          <Routes>
            {/* Public Routes: Accessible without authentication */}
            <Route path="/" element={<LandingPage />} />
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<SignUp />} />

            {/* 
              Protected Routes:
              Wrapped in ProtectedRoute to ensure only authenticated users can access.
              Nested inside Layout for consistent UI (Sidebar/Navbar).
          */}
            <Route element={<ProtectedRoute />}>
              <Route element={<Layout />}>
                <Route path="/dashboard" element={<DashboardRouter />} />
                <Route path="/new-ticket" element={<TicketForm />} />
                <Route path="/analytics" element={<AnalyticsPage />} />
                <Route path="/history" element={<UserDashboard />} />
                <Route path="/jobs" element={<TechnicianDashboard />} />
              </Route>
            </Route>

            {/* Catch-all Redirect: Handles 404s by sending users back to the landing page */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </AuthProvider>
      <InstallPrompt />
      <Toaster position="top-right" richColors closeButton />
    </BrowserRouter>
  );
}
