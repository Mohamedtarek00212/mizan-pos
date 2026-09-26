import request from 'supertest';
import { createApp } from '../src/app';
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

describe('Role-based authorization', () => {
  it('rejects an unauthorized role from an Admin-only endpoint (GET /api/roles)', async () => {
    const admin = await loginAs(app, BOOTSTRAP_ADMIN.username, BOOTSTRAP_ADMIN.password);
    const cashierUsername = uniqueUsername('rbac_cashier');
    const cashierPassword = 'Password123!';

    await request(app).post('/api/users').set('Authorization', `Bearer ${admin.token}`).send({
      username: cashierUsername,
      password: cashierPassword,
      full_name: 'RBAC Cashier',
      role: 'CASHIER',
    });
    const cashier = await loginAs(app, cashierUsername, cashierPassword);

    const res = await request(app)
      .get('/api/roles')
      .set('Authorization', `Bearer ${cashier.token}`);
    expect(res.status).toBe(403);
    expect(res.body.error_code).toBe('AUTHORIZATION_ERROR');
  });

  it('allows an authorized role through the same endpoint (Admin)', async () => {
    const admin = await loginAs(app, BOOTSTRAP_ADMIN.username, BOOTSTRAP_ADMIN.password);
    const res = await request(app).get('/api/roles').set('Authorization', `Bearer ${admin.token}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.roles)).toBe(true);
    expect(res.body.roles.map((r: { name: string }) => r.name)).toEqual(
      expect.arrayContaining(['ADMIN', 'MANAGER', 'CASHIER', 'INVENTORY_STAFF']),
    );
  });

  it('immediately blocks a deactivated user from an already-open session token (UP-06)', async () => {
    const admin = await loginAs(app, BOOTSTRAP_ADMIN.username, BOOTSTRAP_ADMIN.password);
    const username = uniqueUsername('live_deactivate');
    const password = 'Password123!';

    const createRes = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ username, password, full_name: 'Live Deactivate', role: 'CASHIER' });
    const userId = createRes.body.id;

    // Token issued while still active.
    const user = await loginAs(app, username, password);

    // Deactivate via a separate admin request (simulating a change mid-session).
    await request(app)
      .patch(`/api/users/${userId}`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ is_active: false });

    // The already-issued token must be rejected on the very next request,
    // because authMiddleware re-checks live `is_active` on every call.
    const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${user.token}`);
    expect(res.status).toBe(401);
  });
});
