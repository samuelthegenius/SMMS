/**
 * @file src/App.jsx
 * @description Root Component and Routing Configuration.
 * 
 * Architecture:
 * - Routing Strategy: Uses 'react-router-dom' for client-side routing.
 * - Dependency Injection: Wraps the entire tree in context providers (AuthProvider) for global state access.
 * - Security Layer: Implements ProtectedRoute middleware to guard sensitive pages.
 */
import { Suspense, useEffect, lazy, useCallback } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { useAuth } from './contexts/useAuth';
import Layout from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';
import Loader from './components/Loader';
import InstallPrompt from './components/InstallPrompt';
import { Toaster, toast } from 'sonner';
// Eagerly load public pages for immediate render (homepage SEO + previews)
import LandingPage from './pages/LandingPage';
import Login from './pages/Login';
import SignUp from './pages/SignUp';

// Lazy load protected pages for code splitting
const TicketForm = lazy(() => import('./pages/TicketForm'));
const UserDashboard = lazy(() => import('./pages/dashboards/UserDashboard'));
const TechnicianDashboard = lazy(() => import('./pages/dashboards/TechnicianDashboard'));
const AdminDashboard = lazy(() => import('./pages/dashboards/AdminDashboard'));
const AnalyticsPage = lazy(() => import('./pages/AnalyticsPage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));

// Lazy load admin-specific components
const SecurityDashboard = lazy(() => import('./pages/dashboards/SecurityDashboard'));

/**
 * @function DashboardRouter
 * @description Role-Based Access Control (RBAC) Switcher.
 * Dynamically renders the appropriate dashboard component based on the authenticated user's role.
 */
function DashboardRouter() {
  const { profile } = useAuth();
  
  const activeRole = profile?.role;
  const department = profile?.department;
  // Student Affairs department members get admin-level access
  const isStudentAffairs = department === 'Student Affairs';

  if (!profile) return <Loader variant="simple" />;

  // Admin, Student Affairs staff, and SRC get admin dashboard
  if (activeRole === 'admin' || isStudentAffairs || activeRole === 'src') {
    return (
      <Suspense fallback={<Loader variant="admin" />}>
        <AdminDashboard />
      </Suspense>
    );
  }

  switch (activeRole) {
    // Staff verify tickets in their department
    case 'staff':
    case 'technician':
    case 'porter':
      return (
        <Suspense fallback={<Loader variant="technician" />}>
          <TechnicianDashboard />
        </Suspense>
      );
    case 'student':
    default:
      return (
        <Suspense fallback={<Loader variant="user" />}>
          <UserDashboard />
        </Suspense>
      );
  }
}

/**
 * Service Worker Update Listener
 * Shows a toast when a new app version is available, letting users control when to update
 */
function SWUpdateListener() {
  const handleUpdateAvailable = useCallback((event) => {
    const { applyUpdate } = event.detail;

    toast.info('New version available', {
      description: 'A new version of the app is ready. Click to update now or continue using the current version.',
      duration: 0, // Don't auto-dismiss
      action: {
        label: 'Update Now',
        onClick: () => {
          applyUpdate();
          // The page will reload when the new service worker activates
          window.location.reload();
        }
      },
      cancel: {
        label: 'Later',
        onClick: () => {
          // User chose to defer - toast dismissed, update will apply on next visit
        }
      }
    });
  }, []);

  useEffect(() => {
    window.addEventListener('sw:update-available', handleUpdateAvailable);
    return () => window.removeEventListener('sw:update-available', handleUpdateAvailable);
  }, [handleUpdateAvailable]);

  return null;
}

export default function App() {
  useEffect(() => {
    // Initialize non-critical features after app mounts
    const init = async () => {
      // Parallel imports for faster loading
      const [{ initPerformanceMonitoring }, { initializeSecurityMonitoring }] = await Promise.all([
        import('./utils/performanceMonitoring.js'),
        import('./utils/securityMonitoring.js')
      ]);

      initPerformanceMonitoring();
      setTimeout(() => initPerformanceMonitoring?.logPerformanceWarnings?.(), 5000);
      initializeSecurityMonitoring();

      // Register service worker
      import('./utils/registerSW.js');
    };

    // Small delay to prioritize initial render
    requestIdleCallback?.(init) || setTimeout(init, 100);
  }, []);

  return (
    <BrowserRouter>
      {/* 
          Global Context Provider:
          Injects authentication state (user, session, RBAC profile) into all child components.
      */}
      <AuthProvider>
        <Routes>
          {/* Public Routes: Eagerly loaded, no Suspense needed */}
          <Route path="/" element={<LandingPage />} />
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<SignUp />} />

          {/*
            Protected Routes:
            Each route wrapped in Suspense for code-split pages,
            ProtectedRoute for auth, and Layout for consistent UI.
          */}
          <Route element={<ProtectedRoute />}>
            <Route element={<Layout />}>
              <Route path="/dashboard" element={
                <Suspense fallback={<Loader variant="simple" />}>
                  <DashboardRouter />
                </Suspense>
              } />
              <Route path="/new-ticket" element={
                <Suspense fallback={<Loader variant="ticket-form" />}>
                  <TicketForm />
                </Suspense>
              } />
              <Route path="/analytics" element={
                <Suspense fallback={<Loader variant="analytics" />}>
                  <AnalyticsPage />
                </Suspense>
              } />
              <Route path="/history" element={
                <Suspense fallback={<Loader variant="user" />}>
                  <UserDashboard />
                </Suspense>
              } />
              <Route path="/jobs" element={
                <Suspense fallback={<Loader variant="technician" />}>
                  <TechnicianDashboard />
                </Suspense>
              } />
              <Route path="/settings" element={
                <Suspense fallback={<Loader variant="simple" />}>
                  <SettingsPage />
                </Suspense>
              } />
            </Route>
          </Route>

          {/* Catch-all Redirect */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
      <InstallPrompt />
      <SWUpdateListener />
      <Toaster position="top-right" richColors closeButton />
    </BrowserRouter>
  );
}
