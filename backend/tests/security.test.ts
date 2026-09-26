import request from 'supertest';
import { createApp } from '../src/app';
import { env } from '../src/config/env';
import { resetLoginRateLimitsForTests } from '../src/middleware/loginRateLimit';

describe('production security controls', () => {
  beforeEach(() => resetLoginRateLimitsForTests());

  it('sets security headers and hides the Express signature', async () => {
    const response = await request(createApp()).get('/api/health/live');
    expect(response.status).toBe(200);
    expect(response.headers['x-powered-by']).toBeUndefined();
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['content-security-policy']).toBeDefined();
  });

  it('rejects origins outside the explicit CORS allowlist', async () => {
    const response = await request(createApp())
      .get('/api/health/live')
      .set('Origin', 'https://attacker.invalid');
    expect(response.status).toBe(403);
    expect(response.body.error_code).toBe('AUTHORIZATION_ERROR');
  });

  it('limits repeated login attempts from one address', async () => {
    const app = createApp();
    for (let index = 0; index < env.loginRateLimitMax; index += 1) {
      const response = await request(app).post('/api/auth/login').send({});
      expect(response.status).toBe(400);
    }
    const blocked = await request(app).post('/api/auth/login').send({});
    expect(blocked.status).toBe(429);
    expect(blocked.body.error_code).toBe('RATE_LIMITED');
    expect(blocked.headers['retry-after']).toBeDefined();
  });

  it('rejects oversized JSON bodies with a bounded response', async () => {
    const response = await request(createApp())
      .post('/api/auth/login')
      .send({ username: 'x'.repeat(300_000), password: 'x' });
    expect(response.status).toBe(413);
    expect(response.body.error_code).toBe('PAYLOAD_TOO_LARGE');
  });
});
