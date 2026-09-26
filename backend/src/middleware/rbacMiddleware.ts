import { NextFunction, Request, Response } from 'express';
import { AuthenticationError, AuthorizationError } from '../common/errors';
import { Role } from '../modules/auth/auth.types';
import { rolesRepository } from '../modules/roles/roles.repository';

/**
 * Role-based access control middleware (Step 5 A4/A17).
 *
 * Usage: router.get('/path', authenticate, authorize('MANAGER', 'ADMIN'), handler)
 *
 * This is the server-side enforcement boundary. The frontend's role-based
 * nav/route hiding (Step 6 §3) is UX convenience only - this middleware is
 * the actual security boundary and must never be bypassed.
 */
export function authorize(...allowedRoles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(new AuthenticationError());
      return;
    }
    if (!allowedRoles.includes(req.user.role)) {
      next(new AuthorizationError());
      return;
    }
    next();
  };
}

/**
 * Permission-key based authorization (Step 5 A4 - "...role against the
 * endpoint's required role(s)/permission key (from `role_permissions`)").
 * Checks the caller's LIVE role's grant set, resolved fresh on each
 * request (never cached in the JWT), so a permission revoked mid-session
 * takes effect immediately (UP-05).
 *
 * Usage: router.post('/path', authenticate, requirePermission('manage_users'), handler)
 */
export function requirePermission(permissionKey: string) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        next(new AuthenticationError());
        return;
      }
      const granted = await rolesRepository.hasPermission(req.user.roleId, permissionKey);
      if (!granted) {
        next(new AuthorizationError(`Missing required permission: ${permissionKey}`));
        return;
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}
