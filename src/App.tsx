import { Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth, type CurrentUser } from './auth-context';
import LoginPage from './pages/LoginPage';
import SupplierTendersPage from './pages/SupplierTendersPage';
import SupplierTenderDetailPage from './pages/SupplierTenderDetailPage';
import AdminTendersPage from './pages/AdminTendersPage';
import AdminTenderNewPage from './pages/AdminTenderNewPage';
import AdminTenderDetailPage from './pages/AdminTenderDetailPage';
import AdminUsersPage from './pages/AdminUsersPage';

type Role = CurrentUser['role'];

function Protected({
  role,
  children,
}: {
  role?: Role | Role[];
  children: React.ReactNode;
}) {
  const { user, loading } = useAuth();
  if (loading) return <div className="p-6 text-muted-foreground">加载中…</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (role) {
    const allowed = Array.isArray(role) ? role : [role];
    if (!allowed.includes(user.role)) {
      return <Navigate to={user.role === 'admin' || user.role === 'procurement' ? '/admin' : '/'} replace />;
    }
  }
  return <>{children}</>;
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/"
          element={
            <Protected role="supplier">
              <SupplierTendersPage />
            </Protected>
          }
        />
        <Route
          path="/tenders/:id"
          element={
            <Protected role="supplier">
              <SupplierTenderDetailPage />
            </Protected>
          }
        />
        <Route
          path="/admin"
          element={
            <Protected role={['admin', 'procurement']}>
              <AdminTendersPage />
            </Protected>
          }
        />
        <Route
          path="/admin/tenders/new"
          element={
            <Protected role={['admin', 'procurement']}>
              <AdminTenderNewPage />
            </Protected>
          }
        />
        <Route
          path="/admin/tenders/:id"
          element={
            <Protected role={['admin', 'procurement']}>
              <AdminTenderDetailPage />
            </Protected>
          }
        />
        <Route
          path="/admin/users"
          element={
            <Protected role={['admin', 'procurement']}>
              <AdminUsersPage />
            </Protected>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  );
}
