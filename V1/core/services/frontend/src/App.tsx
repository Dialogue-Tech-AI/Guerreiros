import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { LoginPage } from './pages/Auth/LoginPage';
import { SellerDashboard } from './pages/Seller/DashboardPage';
import { SupervisorDashboard } from './pages/Supervisor/DashboardPage';
import { AdminDashboard } from './pages/Admin/DashboardPage';
import { SuperAdminDashboard } from './pages/SuperAdmin/DashboardPage';
import { useAuthStore } from './store/auth.store';
import { NotificationProvider } from './contexts/NotificationContext';

function App() {
  return (
    <BrowserRouter
      future={{
        v7_startTransition: true,
        v7_relativeSplatPath: true,
      }}
    >
      <Toaster position="top-right" />
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/seller/*" element={<PrivateRoute role="SELLER"><NotificationProvider><SellerDashboard /></NotificationProvider></PrivateRoute>} />
        <Route path="/supervisor/*" element={<PrivateRoute role="SUPERVISOR"><NotificationProvider><SupervisorDashboard /></NotificationProvider></PrivateRoute>} />
        <Route path="/admin/*" element={<PrivateRoute role="ADMIN_GENERAL"><NotificationProvider><AdminDashboard /></NotificationProvider></PrivateRoute>} />
        <Route path="/super-admin/*" element={<PrivateRoute role="SUPER_ADMIN"><NotificationProvider><SuperAdminDashboard /></NotificationProvider></PrivateRoute>} />
        <Route path="/" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

function PrivateRoute({ children, role }: { children: React.ReactNode; role: string }) {
  const { user, isAuthenticated } = useAuthStore();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (user?.role !== role) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

export default App;
