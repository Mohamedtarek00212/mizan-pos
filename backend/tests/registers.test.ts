import request from 'supertest';
import { createApp } from '../src/app';
import { pool } from '../src/db/pool';
import {
  BOOTSTRAP_ADMIN,
  closeTestPool,
  deleteTestRegisterSessions,
  deleteTestUsersByPrefix,
  loginAs,
  uniqueUsername,
} from './testUtils';

const app = createApp();

/**
 * Registers/Register Sessions integration tests (Phase 3). Uses
 * dedicated, uniquely-coded test registers (inserted directly, mirroring
 * how seed.ts provisions the fixed set) rather than the shared seeded
 * REG-1/REG-2 rows, so these tests never race with each other or with a
 * developer's local seeded registers.
 */

async function createTestRegister(): Promise<number> {
  // `registers.code` is VARCHAR(20) - keep well under that limit while
  // staying collision-safe and easily identifiable/cleanable as test data.
  const code = `TR${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`.slice(0, 20);
  const result = await pool.query<{ id: number }>(
    `INSERT INTO registers (code) VALUES ($1) RETURNING id`,
    [code],
  );
  return result.rows[0].id;
}

async function createCashier(admin: { token: string }): Promise<{ token: string; userId: number }> {
  const username = uniqueUsername('reg_cashier');
  const password = 'Password123!';
  await request(app)
    .post('/api/users')
    .set('Authorization', `Bearer ${admin.token}`)
    .send({ username, password, full_name: 'Register Cashier', role: 'CASHIER' });
  const cashier = await loginAs(app, username, password);
  return { token: cashier.token, userId: cashier.userId };
}

afterAll(async () => {
  await deleteTestRegisterSessions();
  await deleteTestUsersByPrefix();
  await pool.query(`DELETE FROM registers WHERE code LIKE 'TR%'`);
  await closeTestPool();
});

describe('GET /api/registers', () => {
  it('lists registers with their current session status', async () => {
    const admin = await loginAs(app, BOOTSTRAP_ADMIN.username, BOOTSTRAP_ADMIN.password);
    const registerId = await createTestRegister();

    const res = await request(app)
      .get('/api/registers')
      .set('Authorization', `Bearer ${admin.token}`);
    expect(res.status).toBe(200);
    const found = res.body.registers.find((r: { id: number }) => r.id === registerId);
    expect(found).toBeDefined();
    expect(found.current_session_status).toBe('CLOSED');
  });
});

describe('POST /api/registers/:id/sessions (open)', () => {
  it('allows a Cashier to open a session, recording starting cash', async () => {
    const admin = await loginAs(app, BOOTSTRAP_ADMIN.username, BOOTSTRAP_ADMIN.password);
    const registerId = await createTestRegister();
    const cashier = await createCashier(admin);

    const res = await request(app)
      .post(`/api/registers/${registerId}/sessions`)
      .set('Authorization', `Bearer ${cashier.token}`)
      .send({ starting_cash: 200 });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe('OPEN');
    expect(res.body.starting_cash).toBe(200);
    expect(res.body.register_id).toBe(registerId);

    const auditRows = await pool.query(
      `SELECT * FROM audit_logs WHERE entity_type = 'REGISTER_SESSION' AND entity_id = $1 AND action_type = 'REGISTER_OPENED'`,
      [res.body.id],
    );
    expect(auditRows.rows.length).toBe(1);
  });

  it('rejects opening a second session on an already-open register (CR-01)', async () => {
    const admin = await loginAs(app, BOOTSTRAP_ADMIN.username, BOOTSTRAP_ADMIN.password);
    const registerId = await createTestRegister();
    const cashier1 = await createCashier(admin);
    const cashier2 = await createCashier(admin);

    const first = await request(app)
      .post(`/api/registers/${registerId}/sessions`)
      .set('Authorization', `Bearer ${cashier1.token}`)
      .send({ starting_cash: 100 });
    expect(first.status).toBe(201);

    const second = await request(app)
      .post(`/api/registers/${registerId}/sessions`)
      .set('Authorization', `Bearer ${cashier2.token}`)
      .send({ starting_cash: 100 });
    expect(second.status).toBe(409);
  });

  it('rejects a Cashier opening a second session on a different register while already having one open', async () => {
    const admin = await loginAs(app, BOOTSTRAP_ADMIN.username, BOOTSTRAP_ADMIN.password);
    const registerA = await createTestRegister();
    const registerB = await createTestRegister();
    const cashier = await createCashier(admin);

    const first = await request(app)
      .post(`/api/registers/${registerA}/sessions`)
      .set('Authorization', `Bearer ${cashier.token}`)
      .send({ starting_cash: 100 });
    expect(first.status).toBe(201);

    const second = await request(app)
      .post(`/api/registers/${registerB}/sessions`)
      .set('Authorization', `Bearer ${cashier.token}`)
      .send({ starting_cash: 100 });
    expect(second.status).toBe(409);
  });

  it('rejects a negative starting_cash', async () => {
    const admin = await loginAs(app, BOOTSTRAP_ADMIN.username, BOOTSTRAP_ADMIN.password);
    const registerId = await createTestRegister();
    const cashier = await createCashier(admin);

    const res = await request(app)
      .post(`/api/registers/${registerId}/sessions`)
      .set('Authorization', `Bearer ${cashier.token}`)
      .send({ starting_cash: -50 });
    expect(res.status).toBe(400);
  });

  it('rejects Manager/Admin from opening a session (Cashier-only per Step 5 B7)', async () => {
    const admin = await loginAs(app, BOOTSTRAP_ADMIN.username, BOOTSTRAP_ADMIN.password);
    const registerId = await createTestRegister();

    const res = await request(app)
      .post(`/api/registers/${registerId}/sessions`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ starting_cash: 100 });
    expect(res.status).toBe(403);
  });

  it('rejects a deactivated user from opening a new session', async () => {
    const admin = await loginAs(app, BOOTSTRAP_ADMIN.username, BOOTSTRAP_ADMIN.password);
    const registerId = await createTestRegister();
    const cashier = await createCashier(admin);

    await request(app)
      .patch(`/api/users/${cashier.userId}`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ is_active: false });

    const res = await request(app)
      .post(`/api/registers/${registerId}/sessions`)
      .set('Authorization', `Bearer ${cashier.token}`)
      .send({ starting_cash: 100 });
    expect(res.status).toBe(401);
  });
});

describe('GET /api/registers/:id/sessions/current', () => {
  it('returns 404 when the register has no open session', async () => {
    const admin = await loginAs(app, BOOTSTRAP_ADMIN.username, BOOTSTRAP_ADMIN.password);
    const registerId = await createTestRegister();

    const res = await request(app)
      .get(`/api/registers/${registerId}/sessions/current`)
      .set('Authorization', `Bearer ${admin.token}`);
    expect(res.status).toBe(404);
  });

  it('returns the open session when one exists', async () => {
    const admin = await loginAs(app, BOOTSTRAP_ADMIN.username, BOOTSTRAP_ADMIN.password);
    const registerId = await createTestRegister();
    const cashier = await createCashier(admin);

    await request(app)
      .post(`/api/registers/${registerId}/sessions`)
      .set('Authorization', `Bearer ${cashier.token}`)
      .send({ starting_cash: 150 });

    const res = await request(app)
      .get(`/api/registers/${registerId}/sessions/current`)
      .set('Authorization', `Bearer ${cashier.token}`);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('OPEN');
    expect(res.body.starting_cash).toBe(150);
  });
});

describe('GET /api/registers/sessions/current', () => {
  it('returns the current open session for the authenticated cashier', async () => {
    const admin = await loginAs(app, BOOTSTRAP_ADMIN.username, BOOTSTRAP_ADMIN.password);
    const registerId = await createTestRegister();
    const cashier = await createCashier(admin);

    await request(app)
      .post(`/api/registers/${registerId}/sessions`)
      .set('Authorization', `Bearer ${cashier.token}`)
      .send({ starting_cash: 200 });

    const res = await request(app)
      .get('/api/registers/sessions/current')
      .set('Authorization', `Bearer ${cashier.token}`);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('OPEN');
    expect(res.body.starting_cash).toBe(200);
    expect(res.body.register_id).toBe(registerId);
  });

  it('returns 404 when the cashier has no open session', async () => {
    const admin = await loginAs(app, BOOTSTRAP_ADMIN.username, BOOTSTRAP_ADMIN.password);
    const cashier = await createCashier(admin);

    const res = await request(app)
      .get('/api/registers/sessions/current')
      .set('Authorization', `Bearer ${cashier.token}`);
    expect(res.status).toBe(404);
  });
});

describe('POST /api/registers/:id/sessions/:sessionId/close', () => {
  it('closes a session with matching counted cash, recording zero variance', async () => {
    const admin = await loginAs(app, BOOTSTRAP_ADMIN.username, BOOTSTRAP_ADMIN.password);
    const registerId = await createTestRegister();
    const cashier = await createCashier(admin);

    const openRes = await request(app)
      .post(`/api/registers/${registerId}/sessions`)
      .set('Authorization', `Bearer ${cashier.token}`)
      .send({ starting_cash: 100 });
    const sessionId = openRes.body.id;

    const closeRes = await request(app)
      .post(`/api/registers/${registerId}/sessions/${sessionId}/close`)
      .set('Authorization', `Bearer ${cashier.token}`)
      .send({ counted_cash: 100 });

    expect(closeRes.status).toBe(200);
    expect(closeRes.body.status).toBe('CLOSED');
    expect(closeRes.body.expected_cash).toBe(100);
    expect(closeRes.body.counted_cash).toBe(100);
    expect(closeRes.body.variance).toBe(0);

    const auditRows = await pool.query(
      `SELECT * FROM audit_logs WHERE entity_type = 'REGISTER_SESSION' AND entity_id = $1 AND action_type = 'REGISTER_CLOSED'`,
      [sessionId],
    );
    expect(auditRows.rows.length).toBe(1);
  });

  it('computes a positive variance when counted cash exceeds expected cash', async () => {
    const admin = await loginAs(app, BOOTSTRAP_ADMIN.username, BOOTSTRAP_ADMIN.password);
    const registerId = await createTestRegister();
    const cashier = await createCashier(admin);

    const openRes = await request(app)
      .post(`/api/registers/${registerId}/sessions`)
      .set('Authorization', `Bearer ${cashier.token}`)
      .send({ starting_cash: 100 });

    const closeRes = await request(app)
      .post(`/api/registers/${registerId}/sessions/${openRes.body.id}/close`)
      .set('Authorization', `Bearer ${cashier.token}`)
      .send({ counted_cash: 120 });

    expect(closeRes.status).toBe(200);
    expect(closeRes.body.expected_cash).toBe(100);
    expect(closeRes.body.variance).toBe(20);
  });

  it('flags and audits a variance exceeding the configured threshold', async () => {
    const admin = await loginAs(app, BOOTSTRAP_ADMIN.username, BOOTSTRAP_ADMIN.password);
    const registerId = await createTestRegister();
    const cashier = await createCashier(admin);

    const openRes = await request(app)
      .post(`/api/registers/${registerId}/sessions`)
      .set('Authorization', `Bearer ${cashier.token}`)
      .send({ starting_cash: 100 });

    // Seeded CASHIER threshold is registerVarianceAlertThreshold: 0 (see
    // db/seed.ts DEFAULT_THRESHOLDS), so any non-zero variance exceeds it.
    const closeRes = await request(app)
      .post(`/api/registers/${registerId}/sessions/${openRes.body.id}/close`)
      .set('Authorization', `Bearer ${cashier.token}`)
      .send({ counted_cash: 150 });

    expect(closeRes.status).toBe(200);
    expect(closeRes.body.variance).toBe(50);
    expect(closeRes.body.variance_threshold_snapshot).toBe(0);
    expect(closeRes.body.exceeds_variance_threshold).toBe(true);

    const auditRows = await pool.query(
      `SELECT * FROM audit_logs WHERE entity_type = 'REGISTER_SESSION' AND entity_id = $1 AND action_type = 'REGISTER_VARIANCE_EXCEEDED'`,
      [openRes.body.id],
    );
    expect(auditRows.rows.length).toBe(1);
  });

  it('rejects closing an already-closed session (invalid state transition)', async () => {
    const admin = await loginAs(app, BOOTSTRAP_ADMIN.username, BOOTSTRAP_ADMIN.password);
    const registerId = await createTestRegister();
    const cashier = await createCashier(admin);

    const openRes = await request(app)
      .post(`/api/registers/${registerId}/sessions`)
      .set('Authorization', `Bearer ${cashier.token}`)
      .send({ starting_cash: 100 });

    await request(app)
      .post(`/api/registers/${registerId}/sessions/${openRes.body.id}/close`)
      .set('Authorization', `Bearer ${cashier.token}`)
      .send({ counted_cash: 100 });

    const secondClose = await request(app)
      .post(`/api/registers/${registerId}/sessions/${openRes.body.id}/close`)
      .set('Authorization', `Bearer ${cashier.token}`)
      .send({ counted_cash: 100 });

    expect(secondClose.status).toBe(409);
  });

  it("rejects a Cashier closing another Cashier's session", async () => {
    const admin = await loginAs(app, BOOTSTRAP_ADMIN.username, BOOTSTRAP_ADMIN.password);
    const registerId = await createTestRegister();
    const owner = await createCashier(admin);
    const otherCashier = await createCashier(admin);

    const openRes = await request(app)
      .post(`/api/registers/${registerId}/sessions`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ starting_cash: 100 });

    const res = await request(app)
      .post(`/api/registers/${registerId}/sessions/${openRes.body.id}/close`)
      .set('Authorization', `Bearer ${otherCashier.token}`)
      .send({ counted_cash: 100 });

    expect(res.status).toBe(403);
  });

  it('allows a Manager to force-close another Cashier session', async () => {
    const admin = await loginAs(app, BOOTSTRAP_ADMIN.username, BOOTSTRAP_ADMIN.password);
    const registerId = await createTestRegister();
    const cashier = await createCashier(admin);

    const managerUsername = uniqueUsername('reg_manager');
    const managerPassword = 'Password123!';
    await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({
        username: managerUsername,
        password: managerPassword,
        full_name: 'Force Close Manager',
        role: 'MANAGER',
      });
    const manager = await loginAs(app, managerUsername, managerPassword);

    const openRes = await request(app)
      .post(`/api/registers/${registerId}/sessions`)
      .set('Authorization', `Bearer ${cashier.token}`)
      .send({ starting_cash: 100 });

    const closeRes = await request(app)
      .post(`/api/registers/${registerId}/sessions/${openRes.body.id}/close`)
      .set('Authorization', `Bearer ${manager.token}`)
      .send({ counted_cash: 100 });

    expect(closeRes.status).toBe(200);
    expect(closeRes.body.closed_by).toBe(manager.userId);
  });

  it('rejects closing with a negative counted_cash', async () => {
    const admin = await loginAs(app, BOOTSTRAP_ADMIN.username, BOOTSTRAP_ADMIN.password);
    const registerId = await createTestRegister();
    const cashier = await createCashier(admin);

    const openRes = await request(app)
      .post(`/api/registers/${registerId}/sessions`)
      .set('Authorization', `Bearer ${cashier.token}`)
      .send({ starting_cash: 100 });

    const res = await request(app)
      .post(`/api/registers/${registerId}/sessions/${openRes.body.id}/close`)
      .set('Authorization', `Bearer ${cashier.token}`)
      .send({ counted_cash: -1 });
    expect(res.status).toBe(400);
  });
});
