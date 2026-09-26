import request from 'supertest';
import { createApp } from '../src/app';
import {
  BOOTSTRAP_ADMIN,
  closeTestPool,
  deleteTestCatalogData,
  deleteTestUsersByPrefix,
  loginAs,
  uniqueCode,
  uniqueUsername,
} from './testUtils';

const app = createApp();

afterAll(async () => {
  await deleteTestCatalogData();
  await deleteTestUsersByPrefix();
  await closeTestPool();
});

describe('reports and audit review', () => {
  it('returns all four report shapes for an Admin', async () => {
    const admin = await loginAs(app, BOOTSTRAP_ADMIN.username, BOOTSTRAP_ADMIN.password);
    for (const path of [
      'sales-summary',
      'cash-reconciliation',
      'inventory-status',
      'returns-refunds',
    ]) {
      const response = await request(app)
        .get(`/api/reports/${path}`)
        .set('Authorization', `Bearer ${admin.token}`);
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ summary: expect.any(Object), rows: expect.any(Array) });
    }
  });

  it('filters immutable audit entries and exposes snapshot detail', async () => {
    const admin = await loginAs(app, BOOTSTRAP_ADMIN.username, BOOTSTRAP_ADMIN.password);
    const category = await request(app)
      .post('/api/categories')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ name: uniqueCode('audit_category') });
    expect(category.status).toBe(201);

    const list = await request(app)
      .get(`/api/audit-logs?entity_type=CATEGORY&entity_id=${category.body.id}`)
      .set('Authorization', `Bearer ${admin.token}`);
    expect(list.status).toBe(200);
    expect(list.body.total).toBeGreaterThanOrEqual(1);
    expect(list.body.logs[0]).toMatchObject({
      action_type: 'CATEGORY_CREATED',
      entity_type: 'CATEGORY',
      entity_id: category.body.id,
      actor_username: BOOTSTRAP_ADMIN.username,
    });

    const detail = await request(app)
      .get(`/api/audit-logs/${list.body.logs[0].id}`)
      .set('Authorization', `Bearer ${admin.token}`);
    expect(detail.status).toBe(200);
    expect(detail.body.after_snapshot).toEqual(
      expect.objectContaining({ name: category.body.name }),
    );
  });

  it('forbids Cashiers from reports and audit logs', async () => {
    const admin = await loginAs(app, BOOTSTRAP_ADMIN.username, BOOTSTRAP_ADMIN.password);
    const username = uniqueUsername('report_cashier');
    const password = 'Cashier123!';
    await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ username, password, full_name: 'Report Cashier', role: 'CASHIER' });
    const cashier = await loginAs(app, username, password);

    for (const path of ['/api/reports/sales-summary', '/api/audit-logs']) {
      const response = await request(app).get(path).set('Authorization', `Bearer ${cashier.token}`);
      expect(response.status).toBe(403);
    }
  });
});
