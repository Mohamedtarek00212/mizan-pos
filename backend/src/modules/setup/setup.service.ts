import bcrypt from 'bcryptjs';
import { ConflictError } from '../../common/errors';
import { pool } from '../../db/pool';
import { setupRepository } from './setup.repository';
import { SetupInput, SetupStatus } from './setup.types';

const ROLES = ['ADMIN', 'MANAGER', 'CASHIER', 'INVENTORY_STAFF'] as const;
const ROLE_PERMISSIONS: Record<(typeof ROLES)[number], string[]> = {
  ADMIN: ['manage_users', 'manage_roles', 'manage_thresholds', 'approve_override', 'edit_price'],
  MANAGER: ['manage_users', 'approve_override'],
  CASHIER: [],
  INVENTORY_STAFF: ['edit_price'],
};
const THRESHOLDS: Record<(typeof ROLES)[number], [number, number, number]> = {
  ADMIN: [100, 999999, 0],
  MANAGER: [20, 500, 50],
  CASHIER: [5, 50, 0],
  INVENTORY_STAFF: [0, 0, 0],
};

export const setupService = {
  status(): Promise<SetupStatus> {
    return setupRepository.status();
  },

  async initialize(input: SetupInput): Promise<SetupStatus> {
    // Hash before holding the database lock; bcrypt is intentionally expensive.
    const passwordHash = await bcrypt.hash(input.adminPassword, 12);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await setupRepository.lock(client);
      if (await setupRepository.isInitialized(client)) {
        throw new ConflictError('Mizan setup has already been completed');
      }

      const roleIds = new Map<string, number>();
      for (const roleName of ROLES) {
        const role = await client.query<{ id: number }>(
          'INSERT INTO roles (name) VALUES ($1) RETURNING id',
          [roleName],
        );
        roleIds.set(roleName, role.rows[0].id);
      }

      const admin = await client.query<{ id: number }>(
        `INSERT INTO users (role_id, username, password_hash, full_name, is_active)
         VALUES ($1, $2, $3, $4, true) RETURNING id`,
        [roleIds.get('ADMIN'), input.adminUsername, passwordHash, input.adminFullName],
      );
      const adminId = admin.rows[0].id;

      for (const roleName of ROLES) {
        const roleId = roleIds.get(roleName)!;
        for (const permission of ROLE_PERMISSIONS[roleName]) {
          await client.query(
            'INSERT INTO role_permissions (role_id, permission_key) VALUES ($1, $2)',
            [roleId, permission],
          );
        }
        const [discount, refund, variance] = THRESHOLDS[roleName];
        await client.query(
          `INSERT INTO approval_thresholds
             (role_id, max_self_discount_pct, max_self_refund_amt,
              register_variance_alert_threshold, effective_from, created_by)
           VALUES ($1, $2, $3, $4, now(), $5)`,
          [roleId, discount, refund, variance, adminId],
        );
      }

      await client.query(
        'INSERT INTO registers (code, display_name, is_active) VALUES ($1, $2, true)',
        [input.registerCode, input.registerName],
      );
      await client.query(
        `INSERT INTO tax_rates (category_id, rate_pct, effective_from, created_by)
         VALUES (NULL, $1, now(), $2)`,
        [input.taxRatePct, adminId],
      );
      await client.query(
        `INSERT INTO store_settings (id, store_name, currency_code)
         VALUES (1, $1, 'EGP')`,
        [input.storeName],
      );
      await client.query(
        `INSERT INTO audit_logs
           (actor_id, action_type, entity_type, entity_id, after_snapshot)
         VALUES ($1, 'SYSTEM_INITIALIZED', 'STORE', 1, $2::jsonb)`,
        [adminId, JSON.stringify({
          store_name: input.storeName,
          register_code: input.registerCode,
          register_name: input.registerName,
          tax_rate_pct: input.taxRatePct,
        })],
      );
      await client.query('COMMIT');
      return { initialized: true, store_name: input.storeName, currency_code: 'EGP' };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  },
};
