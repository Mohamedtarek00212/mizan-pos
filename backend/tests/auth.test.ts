import jwt from 'jsonwebtoken';
import request from 'supertest';
import { createApp } from '../src/app';
import { env } from '../src/config/env';
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

describe('POST /api/auth/login', () => {
  it('succeeds with correct credentials and returns a JWT + role', async () => {
    const res = await request(app).post('/api/auth/login').send(BOOTSTRAP_ADMIN);

    expect(res.status).toBe(200);
    expect(typeof res.body.access_token).toBe('string');
    expect(res.body.role).toBe('ADMIN');
    expect(res.body).not.toHaveProperty('password_hash');
    expect(JSON.stringify(res.body)).not.toContain(BOOTSTRAP_ADMIN.password);
  });

  it('rejects invalid credentials with 401', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: BOOTSTRAP_ADMIN.username, password: 'wrong-password' });

    expect(res.status).toBe(401);
    expect(res.body.error_code).toBe('AUTHENTICATION_ERROR');
  });

  it('rejects login for a deactivated user', async () => {
    const admin = await loginAs(app, BOOTSTRAP_ADMIN.username, BOOTSTRAP_ADMIN.password);
    const username = uniqueUsername('deactivated');
    const password = 'Password123!';

    const createRes = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ username, password, full_name: 'Deactivated User', role: 'CASHIER' });
    expect(createRes.status).toBe(201);

    const deactivateRes = await request(app)
      .patch(`/api/users/${createRes.body.id}`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ is_active: false });
    expect(deactivateRes.status).toBe(200);
    expect(deactivateRes.body.is_active).toBe(false);

    const loginRes = await request(app).post('/api/auth/login').send({ username, password });
    expect(loginRes.status).toBe(401);
  });
});

describe('GET /api/auth/me', () => {
  it('returns the authenticated user identity for a valid token', async () => {
    const admin = await loginAs(app, BOOTSTRAP_ADMIN.username, BOOTSTRAP_ADMIN.password);

    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${admin.token}`);

    expect(res.status).toBe(200);
    expect(res.body.username).toBe(BOOTSTRAP_ADMIN.username);
    expect(res.body.role).toBe('ADMIN');
    expect(res.body).not.toHaveProperty('password_hash');
  });

  it('rejects a request with no token', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });

  it('rejects an invalid/malformed token', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', 'Bearer not-a-real-token');
    expect(res.status).toBe(401);
    expect(res.body.error_code).toBe('AUTHENTICATION_ERROR');
  });

  it('rejects an expired token', async () => {
    const expiredToken = jwt.sign({ userId: 1, role: 'ADMIN' }, env.jwtSecret, { expiresIn: -10 });

    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${expiredToken}`);

    expect(res.status).toBe(401);
  });
});

describe('POST /api/auth/logout', () => {
  it('acknowledges logout for an authenticated caller', async () => {
    const admin = await loginAs(app, BOOTSTRAP_ADMIN.username, BOOTSTRAP_ADMIN.password);
    const res = await request(app)
      .post('/api/auth/logout')
      .set('Authorization', `Bearer ${admin.token}`);
    expect(res.status).toBe(204);
  });
});
