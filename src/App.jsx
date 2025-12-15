import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import Layout from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';
import Login from './pages/Login';
import SignUp from './pages/SignUp';
import TicketForm from './pages/TicketForm';
import StudentDashboard from './pages/dashboards/StudentDashboard';
import TechnicianDashboard from './pages/dashboards/TechnicianDashboard';
import AdminDashboard from './pages/dashboards/AdminDashboard';
import LandingPage from './pages/LandingPage';
import Loader from './components/Loader';

function DashboardRouter() {
  const { profile } = useAuth();

  if (!profile) return <Loader />;

  switch (profile.role) {
    case 'admin':
      return <AdminDashboard />;
    case 'technician':
      return <TechnicianDashboard />;
    case 'student':
    case 'staff_member':
    default:
      return <StudentDashboard />;
  }
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          {/* Public Routes */}
          <Route path="/" element={<LandingPage />} />
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<SignUp />} />

          {/* Protected Routes */}
          <Route element={<ProtectedRoute />}>
            <Route element={<Layout />}>
              <Route path="/dashboard" element={<DashboardRouter />} />
              <Route path="/new-ticket" element={<TicketForm />} />
              <Route path="/history" element={<StudentDashboard />} />
              <Route path="/jobs" element={<TechnicianDashboard />} />
            </Route>
          </Route>

          {/* Catch all - redirect to landing page */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
