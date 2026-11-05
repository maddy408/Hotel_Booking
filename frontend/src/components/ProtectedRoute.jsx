import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

export default function ProtectedRoute({ children, roles }) {
  const { status, user } = useAuth();
  const location = useLocation();

  if (status === 'loading') {
    return (
      <div className="loginwrap">
        <div className="skel" style={{ width: 220, height: 24 }} />
      </div>
    );
  }
  if (status === 'guest') {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }
  if (roles && !roles.includes(user?.role)) {
    return (
      <main className="gut">
        <div className="inner">
          <div className="panel empty">You do not have permission to view this page.</div>
        </div>
      </main>
    );
  }
  return children;
}
