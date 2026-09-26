import { Navigate } from 'react-router-dom';
import { Role, useAuth } from './AuthContext';

/**
 * Role-aware route guard (Step 6 §11 - "Permission Handling").
 * UX convenience only - the backend's RBAC middleware (authorize/
 * requirePermission) is the actual security boundary and is always
 * re-checked server-side regardless of what this component allows.
 */
export function RequireRole({
  allowedRoles,
  children,
}: {
  allowedRoles: Role[];
  children: React.ReactElement;
}): React.ReactElement {
  const { user } = useAuth();

  if (!user || !allowedRoles.includes(user.role)) {
    return <Navigate to="/" replace />;
  }

  return children;
}
