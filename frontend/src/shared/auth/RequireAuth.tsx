import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { Spinner } from '../ui/primitives';

/**
 * Route guard (Step 6 §11 - "Permission Handling").
 * UX convenience only - redirects an unauthenticated user to /login.
 * The actual security boundary is always the backend's live checks
 * (Step 5 A4/A17), never this component alone.
 */
export function RequireAuth({ children }: { children: React.ReactElement }): React.ReactElement {
  const { isAuthenticated, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div style={{ display: 'grid', placeItems: 'center', minHeight: '50vh' }}>
        <Spinner />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return children;
}
