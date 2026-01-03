/**
 * @file src/App.jsx
 * @description Root Component and Routing Configuration.
 * 
 * Architecture:
 * - Routing Strategy: Uses 'react-router-dom' for client-side routing.
 * - Dependency Injection: Wraps the entire tree in context providers (AuthProvider) for global state access.
 * - Security Layer: Implements ProtectedRoute middleware to guard sensitive pages.
 */
import { Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import Layout from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';
import Loader from './components/Loader';
import InstallPrompt from './components/InstallPrompt';
import { Toaster } from 'sonner';

import { lazyWithRetry } from './utils/lazyWithRetry';

// Lazy Load Pages for Code Splitting (with automatic retry on 404)
const Login = lazyWithRetry(() => import('./pages/Login'), 'Login');
const SignUp = lazyWithRetry(() => import('./pages/SignUp'), 'SignUp');
const TicketForm = lazyWithRetry(() => import('./pages/TicketForm'), 'TicketForm');
const UserDashboard = lazyWithRetry(() => import('./pages/dashboards/UserDashboard'), 'UserDashboard');
const TechnicianDashboard = lazyWithRetry(() => import('./pages/dashboards/TechnicianDashboard'), 'TechnicianDashboard');
const AdminDashboard = lazyWithRetry(() => import('./pages/dashboards/AdminDashboard'), 'AdminDashboard');
const AnalyticsPage = lazyWithRetry(() => import('./pages/AnalyticsPage'), 'AnalyticsPage');
const LandingPage = lazyWithRetry(() => import('./pages/LandingPage'), 'LandingPage');

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
    case 'staff_member':
    default:
      return <UserDashboard />;
  }
}

export default function App() {
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
