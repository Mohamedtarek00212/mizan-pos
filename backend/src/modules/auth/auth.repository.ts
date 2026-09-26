import { pool } from '../../db/pool';
import { AuthenticatedUser, Role } from './auth.types';

/**
 * Data-access layer for authentication (Step 5 A6), against the
 * `users`/`roles` tables migrated in Phase 1 (see backend/migrations).
 */

interface UserRow {
  id: number;
  role_id: number;
  username: string;
  full_name: string;
  password_hash: string;
  is_active: boolean;
  role_name: Role;
}

export const authRepository = {
  async findActiveUserByUsername(username: string): Promise<UserRow | null> {
    const result = await pool.query<UserRow>(
      `SELECT u.id, u.role_id, u.username, u.full_name, u.password_hash, u.is_active, r.name AS role_name
       FROM users u
       JOIN roles r ON r.id = u.role_id
       WHERE u.username = $1`,
      [username],
    );
    return result.rows[0] ?? null;
  },

  async findAuthenticatedUserById(userId: number): Promise<AuthenticatedUser | null> {
    const result = await pool.query<UserRow>(
      `SELECT u.id, u.role_id, u.username, u.full_name, u.is_active, r.name AS role_name
       FROM users u
       JOIN roles r ON r.id = u.role_id
       WHERE u.id = $1`,
      [userId],
    );
    const row = result.rows[0];
    if (!row) return null;
    return {
      id: row.id,
      username: row.username,
      fullName: row.full_name,
      role: row.role_name,
      roleId: row.role_id,
      isActive: row.is_active,
    };
  },
};
