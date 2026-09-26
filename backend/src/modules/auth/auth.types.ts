/**
 * Shared auth/RBAC types (Step 5 A4). Kept minimal for Phase 0 - the
 * full set of roles mirrors Step 4's `roles` table (fixed MVP set).
 */
export type Role = 'CASHIER' | 'MANAGER' | 'INVENTORY_STAFF' | 'ADMIN';

export interface JwtPayload {
  userId: number;
  role: Role;
}

export interface AuthenticatedUser {
  id: number;
  username: string;
  fullName: string;
  role: Role;
  roleId: number;
  isActive: boolean;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}
