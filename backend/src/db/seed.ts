import bcrypt from 'bcryptjs';
import { pool } from './pool';
import { logger } from '../config/logger';

/**
 * Idempotent seed script (Phase 1 scope):
 *  - the 4 fixed MVP roles (UP-01)
 *  - a minimal role_permissions set demonstrating the mechanism (UP-02)
 *  - an initial effective-dated approval_thresholds version per role
 *  - one bootstrap ADMIN account, since the system is otherwise
 *    unbootstrappable (no user can call POST /users without first being
 *    authenticated as someone with user-management rights)
 *
 * NOTE: exact business threshold values were an explicit Open Question in
 * Step 1 (§ "what are the approval thresholds for discounts/refunds/voids")
 * - the values below are reasonable placeholders, editable by Admin at
 * runtime via the approval-thresholds endpoints once seeded.
 */

const ROLES = ['ADMIN', 'MANAGER', 'CASHIER', 'INVENTORY_STAFF'] as const;

const ROLE_PERMISSIONS: Record<string, string[]> = {
  ADMIN: ['manage_users', 'manage_roles', 'manage_thresholds', 'approve_override', 'edit_price'],
  MANAGER: ['manage_users', 'approve_override'],
  CASHIER: [],
  INVENTORY_STAFF: ['edit_price'],
};

const DEFAULT_THRESHOLDS: Record<
  string,
  { maxSelfDiscountPct: number; maxSelfRefundAmt: number; registerVarianceAlertThreshold: number }
> = {
  ADMIN: { maxSelfDiscountPct: 100, maxSelfRefundAmt: 999999, registerVarianceAlertThreshold: 0 },
  MANAGER: { maxSelfDiscountPct: 20, maxSelfRefundAmt: 500, registerVarianceAlertThreshold: 50 },
  CASHIER: { maxSelfDiscountPct: 5, maxSelfRefundAmt: 50, registerVarianceAlertThreshold: 0 },
  INVENTORY_STAFF: {
    maxSelfDiscountPct: 0,
    maxSelfRefundAmt: 0,
    registerVarianceAlertThreshold: 0,
  },
};

const BOOTSTRAP_ADMIN = {
  username: 'admin',
  password: 'Admin123!', // dev-only default - change immediately after first login
  fullName: 'System Administrator',
};

const DEMO_USERS = [
  { role: 'MANAGER', username: 'manager', password: 'Manager123!', fullName: 'Demo Manager' },
  { role: 'CASHIER', username: 'cashier', password: 'Cashier123!', fullName: 'Demo Cashier' },
  {
    role: 'INVENTORY_STAFF',
    username: 'inventory',
    password: 'Inventory123!',
    fullName: 'Demo Inventory Staff',
  },
] as const;

async function seedDemoUsers(roleIds: Map<string, number>): Promise<void> {
  for (const user of DEMO_USERS) {
    const passwordHash = await bcrypt.hash(user.password, 10);
    await pool.query(
      `INSERT INTO users (role_id, username, password_hash, full_name, is_active)
       VALUES ($1, $2, $3, $4, true) ON CONFLICT (username) DO NOTHING`,
      [roleIds.get(user.role), user.username, passwordHash, user.fullName],
    );
  }
}

async function seedRoles(): Promise<Map<string, number>> {
  const roleIds = new Map<string, number>();
  for (const name of ROLES) {
    const result = await pool.query<{ id: number }>(
      `INSERT INTO roles (name) VALUES ($1)
       ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
       RETURNING id`,
      [name],
    );
    roleIds.set(name, result.rows[0].id);
  }
  return roleIds;
}

async function seedBootstrapAdmin(adminRoleId: number): Promise<number> {
  const existing = await pool.query<{ id: number }>('SELECT id FROM users WHERE username = $1', [
    BOOTSTRAP_ADMIN.username,
  ]);
  if (existing.rows[0]) {
    return existing.rows[0].id;
  }
  const passwordHash = await bcrypt.hash(BOOTSTRAP_ADMIN.password, 10);
  const result = await pool.query<{ id: number }>(
    `INSERT INTO users (role_id, username, password_hash, full_name, is_active)
     VALUES ($1, $2, $3, $4, true)
     RETURNING id`,
    [adminRoleId, BOOTSTRAP_ADMIN.username, passwordHash, BOOTSTRAP_ADMIN.fullName],
  );
  logger.info(
    `Bootstrap admin created: username="${BOOTSTRAP_ADMIN.username}" password="${BOOTSTRAP_ADMIN.password}" (change after first login)`,
  );
  return result.rows[0].id;
}

async function seedRolePermissions(roleIds: Map<string, number>): Promise<void> {
  for (const [roleName, keys] of Object.entries(ROLE_PERMISSIONS)) {
    const roleId = roleIds.get(roleName);
    if (!roleId) continue;
    for (const key of keys) {
      await pool.query(
        `INSERT INTO role_permissions (role_id, permission_key)
         VALUES ($1, $2)
         ON CONFLICT (role_id, permission_key) DO NOTHING`,
        [roleId, key],
      );
    }
  }
}

const REGISTERS = ['REG-1', 'REG-2'];

async function seedRegisters(): Promise<void> {
  for (const code of REGISTERS) {
    await pool.query(`INSERT INTO registers (code) VALUES ($1) ON CONFLICT (code) DO NOTHING`, [
      code,
    ]);
  }
}

const DEMO_PRODUCTS = [
  {
    category: 'مشروبات / Beverages',
    sku: 'DEMO-WATER-1L',
    name: 'مياه 1 لتر / Water 1L',
    price: 10,
    stock: 30,
    threshold: 10,
  },
  {
    category: 'ألبان / Dairy',
    sku: 'DEMO-MILK-1L',
    name: 'حليب 1 لتر / Milk 1L',
    price: 42.5,
    stock: 4,
    threshold: 5,
  },
  {
    category: 'بقالة / Grocery',
    sku: 'DEMO-RICE-1K',
    name: 'أرز 1 كجم / Rice 1kg',
    price: 38,
    stock: 0,
    threshold: 8,
  },
] as const;

async function seedDemoCatalog(createdBy: number): Promise<void> {
  for (const item of DEMO_PRODUCTS) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const category = await client.query<{ id: number }>(
        `INSERT INTO categories (name) VALUES ($1)
         ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
        [item.category],
      );
      const product = await client.query<{ id: number }>(
        `INSERT INTO products
          (category_id, sku, name, current_price, current_stock, reorder_threshold)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (sku) DO NOTHING RETURNING id`,
        [category.rows[0].id, item.sku, item.name, item.price, item.stock, item.threshold],
      );
      if (product.rows[0] && item.stock > 0) {
        await client.query(
          `INSERT INTO stock_movements
            (product_id, movement_type, quantity_delta, resulting_stock, reference_type, reason, performed_by)
           VALUES ($1, 'MANUAL_ADD', $2, $2, 'MANUAL', 'Initial demo stock', $3)`,
          [product.rows[0].id, item.stock, createdBy],
        );
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }
}

async function seedApprovalThresholds(
  roleIds: Map<string, number>,
  createdBy: number,
): Promise<void> {
  for (const [roleName, values] of Object.entries(DEFAULT_THRESHOLDS)) {
    const roleId = roleIds.get(roleName);
    if (!roleId) continue;

    const existing = await pool.query(
      `SELECT id FROM approval_thresholds WHERE role_id = $1 AND effective_to IS NULL`,
      [roleId],
    );
    if (existing.rows[0]) continue;

    await pool.query(
      `INSERT INTO approval_thresholds
        (role_id, max_self_discount_pct, max_self_refund_amt, register_variance_alert_threshold, effective_from, created_by)
       VALUES ($1, $2, $3, $4, now(), $5)`,
      [
        roleId,
        values.maxSelfDiscountPct,
        values.maxSelfRefundAmt,
        values.registerVarianceAlertThreshold,
        createdBy,
      ],
    );
  }
}

export async function runSeed(): Promise<void> {
  const roleIds = await seedRoles();
  const adminId = await seedBootstrapAdmin(roleIds.get('ADMIN')!);
  await seedDemoUsers(roleIds);
  await seedRolePermissions(roleIds);
  await seedApprovalThresholds(roleIds, adminId);
  await seedRegisters();
  await seedDemoCatalog(adminId);
  logger.info(
    'Seed complete: roles, permissions, thresholds, registers, demo users/catalog, bootstrap admin',
  );
}

if (require.main === module) {
  runSeed()
    .then(() => pool.end())
    .catch((err) => {
      logger.error({ err }, 'Seed run failed');
      process.exit(1);
    });
}
