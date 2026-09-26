import bcrypt from 'bcryptjs';
import request from 'supertest';
import { createApp } from '../src/app';
import { pool } from '../src/db/pool';
import {
  BOOTSTRAP_ADMIN,
  closeTestPool,
  deleteTestUsersByPrefix,
  loginAs,
  uniqueUsername,
} from './testUtils';

const app = createApp();

afterAll(async () => {
  await deleteTestUsersByPrefix();
  await closeTestPool();
});

describe('POST /api/users (create)', () => {
  it('allows Admin to create a user of any role', async () => {
    const admin = await loginAs(app, BOOTSTRAP_ADMIN.username, BOOTSTRAP_ADMIN.password);
    const username = uniqueUsername('mgr');

    const res = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ username, password: 'Password123!', full_name: 'Test Manager', role: 'MANAGER' });

    expect(res.status).toBe(201);
    expect(res.body.role).toBe('MANAGER');
    expect(res.body).not.toHaveProperty('password_hash');
    expect(res.body).not.toHaveProperty('password');
  });

  it('allows Manager to create a Cashier account (UP-03)', async () => {
    const admin = await loginAs(app, BOOTSTRAP_ADMIN.username, BOOTSTRAP_ADMIN.password);
    const managerUsername = uniqueUsername('mgr2');
    const managerPassword = 'Password123!';

    const createManagerRes = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({
        username: managerUsername,
        password: managerPassword,
        full_name: 'Scoped Manager',
        role: 'MANAGER',
      });
    expect(createManagerRes.status).toBe(201);

    const manager = await loginAs(app, managerUsername, managerPassword);
    const cashierUsername = uniqueUsername('cashier');

    const res = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${manager.token}`)
      .send({
        username: cashierUsername,
        password: 'Password123!',
        full_name: 'Test Cashier',
        role: 'CASHIER',
      });

    expect(res.status).toBe(201);
    expect(res.body.role).toBe('CASHIER');
  });

  it('rejects a Manager attempting to create a Manager account (UP-03)', async () => {
    const admin = await loginAs(app, BOOTSTRAP_ADMIN.username, BOOTSTRAP_ADMIN.password);
    const managerUsername = uniqueUsername('mgr3');
    const managerPassword = 'Password123!';

    await request(app).post('/api/users').set('Authorization', `Bearer ${admin.token}`).send({
      username: managerUsername,
      password: managerPassword,
      full_name: 'Boundary Manager',
      role: 'MANAGER',
    });

    const manager = await loginAs(app, managerUsername, managerPassword);

    const res = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${manager.token}`)
      .send({
        username: uniqueUsername('should_fail'),
        password: 'Password123!',
        full_name: 'Should Fail',
        role: 'MANAGER',
      });

    expect(res.status).toBe(403);
    expect(res.body.error_code).toBe('AUTHORIZATION_ERROR');
  });

  it('rejects a Cashier attempting to create any user (unauthorized role)', async () => {
    const admin = await loginAs(app, BOOTSTRAP_ADMIN.username, BOOTSTRAP_ADMIN.password);
    const cashierUsername = uniqueUsername('cashier_noauth');
    const cashierPassword = 'Password123!';

    await request(app).post('/api/users').set('Authorization', `Bearer ${admin.token}`).send({
      username: cashierUsername,
      password: cashierPassword,
      full_name: 'No Auth Cashier',
      role: 'CASHIER',
    });

    const cashier = await loginAs(app, cashierUsername, cashierPassword);

    const res = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${cashier.token}`)
      .send({
        username: uniqueUsername('should_fail2'),
        password: 'Password123!',
        full_name: 'Should Fail',
        role: 'CASHIER',
      });

    expect(res.status).toBe(403);
  });

  it('rejects a duplicate username with 409', async () => {
    const admin = await loginAs(app, BOOTSTRAP_ADMIN.username, BOOTSTRAP_ADMIN.password);
    const username = uniqueUsername('dupe');

    const first = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ username, password: 'Password123!', full_name: 'First', role: 'CASHIER' });
    expect(first.status).toBe(201);

    const second = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ username, password: 'Password123!', full_name: 'Second', role: 'CASHIER' });

    expect(second.status).toBe(409);
  });

  it('hashes the password - never stores it in plaintext', async () => {
    const admin = await loginAs(app, BOOTSTRAP_ADMIN.username, BOOTSTRAP_ADMIN.password);
    const username = uniqueUsername('hashcheck');
    const password = 'PlaintextCheck123!';

    const res = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ username, password, full_name: 'Hash Check', role: 'CASHIER' });
    expect(res.status).toBe(201);

    const dbRow = await pool.query('SELECT password_hash FROM users WHERE username = $1', [
      username,
    ]);
    const storedHash: string = dbRow.rows[0].password_hash;

    expect(storedHash).not.toBe(password);
    expect(storedHash.startsWith('$2')).toBe(true); // bcrypt hash prefix
    expect(await bcrypt.compare(password, storedHash)).toBe(true);
  });
});

describe('GET /api/users', () => {
  it('scopes a Manager listing to Cashier/Inventory Staff only', async () => {
    const admin = await loginAs(app, BOOTSTRAP_ADMIN.username, BOOTSTRAP_ADMIN.password);
    const managerUsername = uniqueUsername('mgr_list');
    const managerPassword = 'Password123!';

    await request(app).post('/api/users').set('Authorization', `Bearer ${admin.token}`).send({
      username: managerUsername,
      password: managerPassword,
      full_name: 'Listing Manager',
      role: 'MANAGER',
    });

    const manager = await loginAs(app, managerUsername, managerPassword);
    const res = await request(app)
      .get('/api/users')
      .set('Authorization', `Bearer ${manager.token}`);

    expect(res.status).toBe(200);
    const roles = res.body.users.map((u: { role: string }) => u.role);
    expect(roles).not.toContain('ADMIN');
    expect(roles).not.toContain('MANAGER');
  });

  it('rejects an unauthenticated request', async () => {
    const res = await request(app).get('/api/users');
    expect(res.status).toBe(401);
  });
});

describe('PATCH /api/users/:id (deactivate/activate)', () => {
  it('lets an Admin reset a cashier password without exposing either password', async () => {
    const admin = await loginAs(app, BOOTSTRAP_ADMIN.username, BOOTSTRAP_ADMIN.password);
    const username = uniqueUsername('password_reset');
    const oldPassword = 'OldPassword123!';
    const newPassword = 'NewPassword456!';
    const createRes = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ username, password: oldPassword, full_name: 'Password Reset Cashier', role: 'CASHIER' });

    const resetRes = await request(app)
      .patch(`/api/users/${createRes.body.id}`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ password: newPassword });

    expect(resetRes.status).toBe(200);
    expect(resetRes.body).not.toHaveProperty('password');
    expect(resetRes.body).not.toHaveProperty('password_hash');

    const oldLogin = await request(app)
      .post('/api/auth/login')
      .send({ username, password: oldPassword });
    expect(oldLogin.status).toBe(401);
    const newLogin = await request(app)
      .post('/api/auth/login')
      .send({ username, password: newPassword });
    expect(newLogin.status).toBe(200);

    const audit = await pool.query(
      `SELECT before_snapshot, after_snapshot FROM audit_logs
       WHERE entity_type = 'USER' AND entity_id = $1 AND action_type = 'USER_UPDATED'
       ORDER BY id DESC LIMIT 1`,
      [createRes.body.id],
    );
    expect(audit.rows[0].before_snapshot).not.toHaveProperty('password');
    expect(audit.rows[0].after_snapshot).not.toHaveProperty('password');
  });

  it('allows Admin to deactivate and reactivate a user, recording audit events', async () => {
    const admin = await loginAs(app, BOOTSTRAP_ADMIN.username, BOOTSTRAP_ADMIN.password);
    const username = uniqueUsername('togglable');

    const createRes = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ username, password: 'Password123!', full_name: 'Togglable', role: 'CASHIER' });
    const userId = createRes.body.id;

    const deactivateRes = await request(app)
      .patch(`/api/users/${userId}`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ is_active: false });
    expect(deactivateRes.status).toBe(200);
    expect(deactivateRes.body.is_active).toBe(false);
    expect(deactivateRes.body.deactivated_at).not.toBeNull();

    const deactivatedAudit = await pool.query(
      `SELECT * FROM audit_logs WHERE entity_type = 'USER' AND entity_id = $1 AND action_type = 'USER_DEACTIVATED'`,
      [userId],
    );
    expect(deactivatedAudit.rows.length).toBeGreaterThanOrEqual(1);

    const activateRes = await request(app)
      .patch(`/api/users/${userId}`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ is_active: true });
    expect(activateRes.status).toBe(200);
    expect(activateRes.body.is_active).toBe(true);
    expect(activateRes.body.deactivated_at).toBeNull();

    const activatedAudit = await pool.query(
      `SELECT * FROM audit_logs WHERE entity_type = 'USER' AND entity_id = $1 AND action_type = 'USER_ACTIVATED'`,
      [userId],
    );
    expect(activatedAudit.rows.length).toBeGreaterThanOrEqual(1);
  });

  it('rejects a Manager attempting to modify a Manager/Admin account', async () => {
    const admin = await loginAs(app, BOOTSTRAP_ADMIN.username, BOOTSTRAP_ADMIN.password);
    const managerUsername = uniqueUsername('mgr_boundary');
    const managerPassword = 'Password123!';

    const targetManagerRes = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({
        username: managerUsername,
        password: managerPassword,
        full_name: 'Target Manager',
        role: 'MANAGER',
      });

    const actingManagerUsername = uniqueUsername('mgr_acting');
    const actingManagerPassword = 'Password123!';
    await request(app).post('/api/users').set('Authorization', `Bearer ${admin.token}`).send({
      username: actingManagerUsername,
      password: actingManagerPassword,
      full_name: 'Acting Manager',
      role: 'MANAGER',
    });
    const actingManager = await loginAs(app, actingManagerUsername, actingManagerPassword);

    const res = await request(app)
      .patch(`/api/users/${targetManagerRes.body.id}`)
      .set('Authorization', `Bearer ${actingManager.token}`)
      .send({ is_active: false });

    expect(res.status).toBe(403);
  });
});
