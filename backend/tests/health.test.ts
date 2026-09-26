import request from 'supertest';
import { createApp } from '../src/app';

describe('GET /api/health', () => {
  it('responds with a status field (ok or degraded depending on DB availability)', async () => {
    const app = createApp();
    const res = await request(app).get('/api/health');

    expect([200, 503]).toContain(res.status);
    expect(res.body).toHaveProperty('status');
    expect(res.body).toHaveProperty('database');
    expect(res.body).toHaveProperty('timestamp');
  });
});

describe('404 handler', () => {
  it('returns a structured error for unknown routes', async () => {
    const app = createApp();
    const res = await request(app).get('/api/does-not-exist');

    expect(res.status).toBe(404);
    expect(res.body.error_code).toBe('NOT_FOUND');
  });
});
