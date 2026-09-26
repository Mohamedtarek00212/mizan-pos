import { pool } from '../../db/pool';
import { Role } from '../auth/auth.types';

/**
 * Data-access layer for roles/role_permissions (Step 5 A6).
 */
interface RoleRow {
  id: number;
  name: Role;
}

export const rolesRepository = {
  async findAll(): Promise<RoleRow[]> {
    const result = await pool.query<RoleRow>('SELECT id, name FROM roles ORDER BY id');
    return result.rows;
  },

  async findByName(name: string): Promise<RoleRow | null> {
    const result = await pool.query<RoleRow>('SELECT id, name FROM roles WHERE name = $1', [name]);
    return result.rows[0] ?? null;
  },

  async findById(id: number): Promise<RoleRow | null> {
    const result = await pool.query<RoleRow>('SELECT id, name FROM roles WHERE id = $1', [id]);
    return result.rows[0] ?? null;
  },

  async getPermissions(roleId: number): Promise<string[]> {
    const result = await pool.query<{ permission_key: string }>(
      'SELECT permission_key FROM role_permissions WHERE role_id = $1 ORDER BY permission_key',
      [roleId],
    );
    return result.rows.map((r) => r.permission_key);
  },

  async hasPermission(roleId: number, permissionKey: string): Promise<boolean> {
    const result = await pool.query(
      'SELECT 1 FROM role_permissions WHERE role_id = $1 AND permission_key = $2',
      [roleId, permissionKey],
    );
    return result.rows.length > 0;
  },

  /** Replace-all semantics within a single transaction. */
  async setPermissions(roleId: number, permissionKeys: string[]): Promise<void> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM role_permissions WHERE role_id = $1', [roleId]);
      for (const key of permissionKeys) {
        await client.query(
          'INSERT INTO role_permissions (role_id, permission_key) VALUES ($1, $2)',
          [roleId, key],
        );
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  },
};
