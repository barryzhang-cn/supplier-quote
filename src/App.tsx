import { Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth-context';
import LoginPage from './pages/LoginPage';
import SupplierTendersPage from './pages/SupplierTendersPage';
import SupplierTenderDetailPage from './pages/SupplierTenderDetailPage';
import AdminTendersPage from './pages/AdminTendersPage';
import AdminTenderNewPage from './pages/AdminTenderNewPage';
import AdminTenderDetailPage from './pages/AdminTenderDetailPage';
import AdminUsersPage from './pages/AdminUsersPage';

function Protected({
  role,
  children,
}: {
  role?: 'admin' | 'supplier';
  children: React.ReactNode;
}) {
  const { user, loading } = useAuth();
  if (loading) return <div className="p-6 text-muted-foreground">加载中…</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (role && user.role !== role)
    return <Navigate to={user.role === 'admin' ? '/admin' : '/'} replace />;
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
            <Protected role="admin">
              <AdminTendersPage />
            </Protected>
          }
        />
        <Route
          path="/admin/tenders/new"
          element={
            <Protected role="admin">
              <AdminTenderNewPage />
            </Protected>
          }
        />
        <Route
          path="/admin/tenders/:id"
          element={
            <Protected role="admin">
              <AdminTenderDetailPage />
            </Protected>
          }
        />
        <Route
          path="/admin/users"
          element={
            <Protected role="admin">
              <AdminUsersPage />
            </Protected>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  );
}
