import { Role } from '../auth/auth.types';

/** Valid permission keys (Step 4 §4.1 role_permissions comment). */
export const VALID_PERMISSION_KEYS = [
  'apply_discount',
  'approve_override',
  'edit_price',
  'manage_users',
  'manage_roles',
  'manage_thresholds',
] as const;

export type PermissionKey = (typeof VALID_PERMISSION_KEYS)[number];

export interface RoleWithPermissions {
  id: number;
  name: Role;
  permissions: string[];
}
