import { pool } from '../../db/pool';
import { ListUsersFilters, UserRow } from './users.types';

const BASE_SELECT = `
  SELECT u.id, u.role_id, u.username, u.password_hash, u.full_name, u.is_active,
         u.created_at, u.deactivated_at, r.name AS role_name
  FROM users u
  JOIN roles r ON r.id = u.role_id
`;

/**
 * Data-access layer for user accounts (Step 5 A6).
 */
export const usersRepository = {
  async findByUsername(username: string): Promise<UserRow | null> {
    const result = await pool.query<UserRow>(`${BASE_SELECT} WHERE u.username = $1`, [username]);
    return result.rows[0] ?? null;
  },

  async findById(id: number): Promise<UserRow | null> {
    const result = await pool.query<UserRow>(`${BASE_SELECT} WHERE u.id = $1`, [id]);
    return result.rows[0] ?? null;
  },

  async list(filters: ListUsersFilters): Promise<UserRow[]> {
    const conditions: string[] = [];
    const values: unknown[] = [];

    if (filters.role) {
      values.push(filters.role);
      conditions.push(`r.name = $${values.length}`);
    }
    if (filters.roleIn && filters.roleIn.length > 0) {
      values.push(filters.roleIn);
      conditions.push(`r.name = ANY($${values.length})`);
    }
    if (filters.isActive !== undefined) {
      values.push(filters.isActive);
      conditions.push(`u.is_active = $${values.length}`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const result = await pool.query<UserRow>(`${BASE_SELECT} ${whereClause} ORDER BY u.id`, values);
    return result.rows;
  },

  async insert(input: {
    roleId: number;
    username: string;
    passwordHash: string;
    fullName: string;
  }): Promise<UserRow> {
    const result = await pool.query<{ id: number }>(
      `INSERT INTO users (role_id, username, password_hash, full_name, is_active)
       VALUES ($1, $2, $3, $4, true)
       RETURNING id`,
      [input.roleId, input.username, input.passwordHash, input.fullName],
    );
    return this.findById(result.rows[0].id) as Promise<UserRow>;
  },

  async update(
    id: number,
    fields: {
      roleId?: number;
      fullName?: string;
      isActive?: boolean;
      passwordHash?: string;
      deactivatedAt?: Date | null;
    },
  ): Promise<UserRow | null> {
    const setClauses: string[] = [];
    const values: unknown[] = [];

    if (fields.roleId !== undefined) {
      values.push(fields.roleId);
      setClauses.push(`role_id = $${values.length}`);
    }
    if (fields.fullName !== undefined) {
      values.push(fields.fullName);
      setClauses.push(`full_name = $${values.length}`);
    }
    if (fields.isActive !== undefined) {
      values.push(fields.isActive);
      setClauses.push(`is_active = $${values.length}`);
    }
    if (fields.passwordHash !== undefined) {
      values.push(fields.passwordHash);
      setClauses.push(`password_hash = $${values.length}`);
    }
    if (fields.deactivatedAt !== undefined) {
      values.push(fields.deactivatedAt);
      setClauses.push(`deactivated_at = $${values.length}`);
    }

    if (setClauses.length === 0) {
      return this.findById(id);
    }

    values.push(id);
    await pool.query(
      `UPDATE users SET ${setClauses.join(', ')} WHERE id = $${values.length}`,
      values,
    );
    return this.findById(id);
  },
};
