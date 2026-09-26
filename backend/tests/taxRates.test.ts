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

describe('Tax rates (Admin-controlled configuration)', () => {
  it('allows Admin to create a new global tax rate version', async () => {
    const admin = await loginAs(app, BOOTSTRAP_ADMIN.username, BOOTSTRAP_ADMIN.password);

    const res = await request(app)
      .post('/api/tax-rates')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ category_id: null, rate_pct: 14 });

    expect(res.status).toBe(201);
    expect(res.body.rate_pct).toBe(14);
    expect(res.body.category_id).toBeNull();
  });

  it('rejects a negative rate_pct', async () => {
    const admin = await loginAs(app, BOOTSTRAP_ADMIN.username, BOOTSTRAP_ADMIN.password);
    const res = await request(app)
      .post('/api/tax-rates')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ category_id: null, rate_pct: -5 });

    expect(res.status).toBe(400);
  });

  it('rejects a tax rate referencing a non-existent category', async () => {
    const admin = await loginAs(app, BOOTSTRAP_ADMIN.username, BOOTSTRAP_ADMIN.password);
    const res = await request(app)
      .post('/api/tax-rates')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ category_id: 999999, rate_pct: 5 });

    expect(res.status).toBe(400);
  });

  it('allows Manager to view current rates but not create new ones', async () => {
    const admin = await loginAs(app, BOOTSTRAP_ADMIN.username, BOOTSTRAP_ADMIN.password);
    const managerUsername = uniqueUsername('tax_mgr');
    const managerPassword = 'Password123!';

    await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({
        username: managerUsername,
        password: managerPassword,
        full_name: 'Tax Manager',
        role: 'MANAGER',
      });
    const manager = await loginAs(app, managerUsername, managerPassword);

    const viewRes = await request(app)
      .get('/api/tax-rates')
      .set('Authorization', `Bearer ${manager.token}`);
    expect(viewRes.status).toBe(200);

    const createRes = await request(app)
      .post('/api/tax-rates')
      .set('Authorization', `Bearer ${manager.token}`)
      .send({ category_id: null, rate_pct: 10 });
    expect(createRes.status).toBe(403);
  });

  it('rejects a Cashier from viewing tax rates at all', async () => {
    const admin = await loginAs(app, BOOTSTRAP_ADMIN.username, BOOTSTRAP_ADMIN.password);
    const cashierUsername = uniqueUsername('tax_cashier');
    const cashierPassword = 'Password123!';

    await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({
        username: cashierUsername,
        password: cashierPassword,
        full_name: 'Tax Cashier',
        role: 'CASHIER',
      });
    const cashier = await loginAs(app, cashierUsername, cashierPassword);

    const res = await request(app)
      .get('/api/tax-rates')
      .set('Authorization', `Bearer ${cashier.token}`);
    expect(res.status).toBe(403);
  });

  it('restricts full history to Admin only', async () => {
    const admin = await loginAs(app, BOOTSTRAP_ADMIN.username, BOOTSTRAP_ADMIN.password);
    const managerUsername = uniqueUsername('tax_hist_mgr');
    const managerPassword = 'Password123!';

    await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({
        username: managerUsername,
        password: managerPassword,
        full_name: 'History Manager',
        role: 'MANAGER',
      });
    const manager = await loginAs(app, managerUsername, managerPassword);

    const managerRes = await request(app)
      .get('/api/tax-rates/history')
      .set('Authorization', `Bearer ${manager.token}`);
    expect(managerRes.status).toBe(403);

    const adminRes = await request(app)
      .get('/api/tax-rates/history')
      .set('Authorization', `Bearer ${admin.token}`);
    expect(adminRes.status).toBe(200);
    expect(Array.isArray(adminRes.body.tax_rates)).toBe(true);
  });

  it("resolves a product's effective tax rate from its category's configured rate", async () => {
    const admin = await loginAs(app, BOOTSTRAP_ADMIN.username, BOOTSTRAP_ADMIN.password);
    const categoryName = uniqueCode('taxed_cat');

    const categoryRes = await request(app)
      .post('/api/categories')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ name: categoryName });
    const categoryId = categoryRes.body.id;

    await request(app)
      .post('/api/tax-rates')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ category_id: categoryId, rate_pct: 8.5 });

    const productRes = await request(app)
      .post('/api/products')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({
        sku: uniqueCode('taxedsku'),
        name: 'Taxed Widget',
        category_id: categoryId,
        current_price: 100,
      });

    expect(productRes.status).toBe(201);
    expect(productRes.body.effective_tax_rate_pct).toBe(8.5);
  });
});
