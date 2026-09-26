import request from 'supertest';
import { createApp } from '../src/app';
import { pool } from '../src/db/pool';
import {
  BOOTSTRAP_ADMIN,
  closeTestPool,
  deleteTestCatalogData,
  deleteTestRegisterSessions,
  deleteTestUsersByPrefix,
  loginAs,
  uniqueCode,
  uniqueUsername,
} from './testUtils';

const app = createApp();

async function createUser(adminToken: string, role: 'CASHIER' | 'MANAGER') {
  const username = uniqueUsername(role.toLowerCase());
  const password = 'Password123!';
  await request(app)
    .post('/api/users')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ username, password, full_name: `Test ${role}`, role });
  return { username, password, ...(await loginAs(app, username, password)) };
}

async function saleFixture(adminToken: string, cashier: { token: string }) {
  const category = await request(app)
    .post('/api/categories')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ name: uniqueCode('DISC_CAT') });
  const product = await request(app)
    .post('/api/products')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({
      sku: uniqueCode('DISC_SKU'),
      name: 'Discount Product',
      category_id: category.body.id,
      current_price: 100,
      initial_stock: 10,
      reorder_threshold: 1,
    });
  const register = await pool.query<{ id: number }>(
    'INSERT INTO registers (code) VALUES ($1) RETURNING id',
    [uniqueCode('DR').slice(0, 20)],
  );
  const session = await request(app)
    .post(`/api/registers/${register.rows[0].id}/sessions`)
    .set('Authorization', `Bearer ${cashier.token}`)
    .send({ starting_cash: 0 });
  const sale = await request(app)
    .post('/api/sales')
    .set('Authorization', `Bearer ${cashier.token}`)
    .send({ register_session_id: session.body.id });
  const withItem = await request(app)
    .post(`/api/sales/${sale.body.id}/items`)
    .set('Authorization', `Bearer ${cashier.token}`)
    .send({ product_id: product.body.id, quantity: 1 });
  return {
    saleId: sale.body.id,
    itemId: withItem.body.items[0].id,
    productId: product.body.id,
    categoryId: category.body.id,
  };
}

afterAll(async () => {
  await deleteTestRegisterSessions();
  await deleteTestCatalogData();
  await deleteTestUsersByPrefix();
  await pool.query(`DELETE FROM registers WHERE code LIKE 'TEST_%'`);
  await closeTestPool();
});

it('applies a manual discount immediately when it is within the Cashier threshold', async () => {
  const admin = await loginAs(app, BOOTSTRAP_ADMIN.username, BOOTSTRAP_ADMIN.password);
  const cashier = await createUser(admin.token, 'CASHIER');
  const fixture = await saleFixture(admin.token, cashier);
  const result = await request(app)
    .post(`/api/sales/${fixture.saleId}/discounts`)
    .set('Authorization', `Bearer ${cashier.token}`)
    .send({
      scope: 'ITEM',
      item_id: fixture.itemId,
      discount_type: 'PERCENT',
      value: 5,
      reason: 'Loyal customer',
    });
  expect(result.status).toBe(200);
  expect(result.body.approval_pending).toBe(false);
  expect(result.body.sale.discount_amount).toBe(5);
  expect(result.body.sale.items[0].discount_source).toBe('MANUAL');
});

it('requires and applies an inline Manager approval above the Cashier threshold', async () => {
  const admin = await loginAs(app, BOOTSTRAP_ADMIN.username, BOOTSTRAP_ADMIN.password);
  const cashier = await createUser(admin.token, 'CASHIER');
  const manager = await createUser(admin.token, 'MANAGER');
  const fixture = await saleFixture(admin.token, cashier);
  const requested = await request(app)
    .post(`/api/sales/${fixture.saleId}/discounts`)
    .set('Authorization', `Bearer ${cashier.token}`)
    .send({
      scope: 'SALE',
      discount_type: 'PERCENT',
      value: 10,
      reason: 'Damaged package',
    });
  expect(requested.status).toBe(202);
  expect(requested.body.approval_pending).toBe(true);

  const decided = await request(app)
    .post(`/api/approvals/${requested.body.approval_id}/inline-decision`)
    .set('Authorization', `Bearer ${cashier.token}`)
    .send({
      manager_username: manager.username,
      manager_password: manager.password,
      decision: 'APPROVE',
      note: 'Approved at register',
    });
  expect(decided.status).toBe(200);
  expect(decided.body.approval.status).toBe('APPROVED');
  expect(decided.body.sale.discount_amount).toBe(10);
  expect(decided.body.sale.items[0].discount_reference_id).toBe(requested.body.approval_id);
});

it('lets a signed-in Manager decide a pending approval from the approvals queue', async () => {
  const admin = await loginAs(app, BOOTSTRAP_ADMIN.username, BOOTSTRAP_ADMIN.password);
  const cashier = await createUser(admin.token, 'CASHIER');
  const manager = await createUser(admin.token, 'MANAGER');
  const fixture = await saleFixture(admin.token, cashier);
  const requested = await request(app)
    .post(`/api/sales/${fixture.saleId}/discounts`)
    .set('Authorization', `Bearer ${cashier.token}`)
    .send({
      scope: 'SALE',
      discount_type: 'PERCENT',
      value: 10,
    });

  const decided = await request(app)
    .post(`/api/approvals/${requested.body.approval_id}/decision`)
    .set('Authorization', `Bearer ${manager.token}`)
    .send({ decision: 'APPROVE' });
  expect(decided.status).toBe(200);
  expect(decided.body.approval.status).toBe('APPROVED');
  expect(decided.body.sale.discount_amount).toBe(10);
});

it('enforces the approving Managers own configured ceiling', async () => {
  const admin = await loginAs(app, BOOTSTRAP_ADMIN.username, BOOTSTRAP_ADMIN.password);
  const cashier = await createUser(admin.token, 'CASHIER');
  const manager = await createUser(admin.token, 'MANAGER');
  const fixture = await saleFixture(admin.token, cashier);
  const requested = await request(app)
    .post(`/api/sales/${fixture.saleId}/discounts`)
    .set('Authorization', `Bearer ${cashier.token}`)
    .send({ scope: 'SALE', discount_type: 'PERCENT', value: 25 });
  const decided = await request(app)
    .post(`/api/approvals/${requested.body.approval_id}/inline-decision`)
    .set('Authorization', `Bearer ${cashier.token}`)
    .send({
      manager_username: manager.username,
      manager_password: manager.password,
      decision: 'APPROVE',
    });
  expect(decided.status).toBe(403);
});

it('applies the product promotion ahead of a more valuable general promotion', async () => {
  const admin = await loginAs(app, BOOTSTRAP_ADMIN.username, BOOTSTRAP_ADMIN.password);
  const cashier = await createUser(admin.token, 'CASHIER');
  const fixture = await saleFixture(admin.token, cashier);
  const starts = new Date(Date.now() - 60_000).toISOString();
  const ends = new Date(Date.now() + 3_600_000).toISOString();
  await request(app)
    .post('/api/promotions')
    .set('Authorization', `Bearer ${admin.token}`)
    .send({
      name: uniqueCode('GENERAL'),
      scope: 'GENERAL',
      discount_type: 'FIXED',
      discount_value: 50,
      starts_at: starts,
      ends_at: ends,
    });
  const productPromotion = await request(app)
    .post('/api/promotions')
    .set('Authorization', `Bearer ${admin.token}`)
    .send({
      name: uniqueCode('PRODUCT'),
      scope: 'PRODUCT',
      product_id: fixture.productId,
      discount_type: 'PERCENT',
      discount_value: 10,
      starts_at: starts,
      ends_at: ends,
    });

  const applied = await request(app)
    .post(`/api/sales/${fixture.saleId}/promotions/apply`)
    .set('Authorization', `Bearer ${cashier.token}`)
    .send({});
  expect(applied.status).toBe(200);
  expect(applied.body.discount_amount).toBe(10);
  expect(applied.body.items[0].discount_reference_id).toBe(productPromotion.body.id);
});
