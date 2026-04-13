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
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { useAuth } from './contexts/useAuth';
import Layout from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';
import Loader from './components/Loader';
import InstallPrompt from './components/InstallPrompt';
import { Toaster } from 'sonner';
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

// Lazy load admin-specific components
const SecurityDashboard = lazy(() => import('./pages/dashboards/SecurityDashboard'));
const ReassignTechnician = lazy(() => import('./components/ReassignTechnician'));

/**
 * @function GlobalLoader
 * @description Context-aware top-level loader for the global Suspense boundary.
 * Maps the current URL route to the appropriate loader shape.
 */
function GlobalLoader() {
  const location = useLocation();
  const path = location.pathname;
  const { profile, initialRoleHint } = useAuth();

  if (path === '/login') return <Loader variant="auth-login" />;
  if (path === '/signup') return <Loader variant="auth-signup" />;
  
  // Specific fullPage dashboards with real sidebars
  if (path.startsWith('/dashboard')) {
    const activeRole = profile?.role || initialRoleHint;
    if (activeRole === 'admin') return <Loader variant="admin" fullPage />;
    if (activeRole === 'technician') return <Loader variant="technician" fullPage />;
    if (activeRole === 'student' || activeRole === 'staff') return <Loader variant="user" fullPage />;
    return <Loader variant="generic" fullPage />;
  }
  
  if (path.startsWith('/new-ticket')) return <Loader variant="ticket-form" fullPage />;
  if (path.startsWith('/analytics')) return <Loader variant="analytics" fullPage />;
  if (path.startsWith('/history')) return <Loader variant="user" fullPage />;
  if (path.startsWith('/jobs')) return <Loader variant="technician" fullPage />;

  // Default to landing page skeleton for root and unknown routes
  return <Loader variant="landing" />;
}

/**
 * @function DashboardRouter
 * @description Role-Based Access Control (RBAC) Switcher.
 * Dynamically renders the appropriate dashboard component based on the authenticated user's role.
 */
function DashboardRouter() {
  const { profile, initialRoleHint } = useAuth();
  
  const activeRole = profile?.role || initialRoleHint;

  if (!activeRole) {
    return <Loader variant="simple" />;
  }

  switch (activeRole) {
    case 'admin':
      return (
        <Suspense fallback={<Loader variant="admin" />}>
          <AdminDashboard />
        </Suspense>
      );
    case 'technician':
      return (
        <Suspense fallback={<Loader variant="technician" />}>
          <TechnicianDashboard />
        </Suspense>
      );
    // ROUTING SECURITY: Staff and Students share the "Reporter" view.
    // Technicians and Admins get the "Resolver" view.
    case 'student':
    case 'staff':
    default:
      return (
        <Suspense fallback={<Loader variant="user" />}>
          <UserDashboard />
        </Suspense>
      );
  }
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
        <Suspense fallback={<GlobalLoader />}>
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
