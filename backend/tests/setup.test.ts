import request from 'supertest';
import { createApp } from '../src/app';
import { closeTestPool } from './testUtils';

const app = createApp();

afterAll(closeTestPool);

describe('first-run setup', () => {
  it('reports an existing installation as initialized without exposing sensitive data', async () => {
    const response = await request(app).get('/api/setup/status');
    expect(response.status).toBe(200);
    expect(response.body.initialized).toBe(true);
    expect(response.body).not.toHaveProperty('admin_username');
    expect(response.body).not.toHaveProperty('password');
  });

  it('permanently rejects re-running initialization', async () => {
    const response = await request(app).post('/api/setup/initialize').send({
      store_name: 'Should Not Replace Existing Store',
      admin_full_name: 'Replacement Admin',
      admin_username: 'replacement-admin',
      admin_password: 'StrongPass123',
      register_code: 'REG-NEW',
      register_name: 'Main register',
      tax_rate_pct: 14,
    });
    expect(response.status).toBe(409);
    expect(response.body.error_code).toBe('CONFLICT');
  });

  it('validates setup input before attempting initialization', async () => {
    const response = await request(app).post('/api/setup/initialize').send({
      store_name: '',
    });
    expect(response.status).toBe(400);
    expect(response.body.error_code).toBe('VALIDATION_ERROR');
  });
});
