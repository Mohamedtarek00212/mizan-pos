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

async function setup() {
  const admin = await loginAs(app, BOOTSTRAP_ADMIN.username, BOOTSTRAP_ADMIN.password);
  const username = uniqueUsername('return_cashier');
  const password = 'Password123!';
  await request(app)
    .post('/api/users')
    .set('Authorization', `Bearer ${admin.token}`)
    .send({ username, password, full_name: 'Return Cashier', role: 'CASHIER' });
  const cashier = { username, password, ...(await loginAs(app, username, password)) };
  const category = await request(app)
    .post('/api/categories')
    .set('Authorization', `Bearer ${admin.token}`)
    .send({ name: uniqueCode('RETURN_CAT') });
  const product = await request(app)
    .post('/api/products')
    .set('Authorization', `Bearer ${admin.token}`)
    .send({
      sku: uniqueCode('RETURN_SKU'),
      name: 'Return Product',
      category_id: category.body.id,
      current_price: 40,
      initial_stock: 10,
      reorder_threshold: 1,
    });
  const register = await pool.query<{ id: number }>(
    'INSERT INTO registers (code) VALUES ($1) RETURNING id',
    [uniqueCode('RR').slice(0, 20)],
  );
  const session = await request(app)
    .post(`/api/registers/${register.rows[0].id}/sessions`)
    .set('Authorization', `Bearer ${cashier.token}`)
    .send({ starting_cash: 100 });
  return { admin, cashier, product: product.body, session: session.body };
}

async function completedSale(
  fixture: Awaited<ReturnType<typeof setup>>,
  quantity: number,
  method: 'cash' | 'card' = 'cash',
) {
  const created = await request(app)
    .post('/api/sales')
    .set('Authorization', `Bearer ${fixture.cashier.token}`)
    .send({ register_session_id: fixture.session.id });
  const withItem = await request(app)
    .post(`/api/sales/${created.body.id}/items`)
    .set('Authorization', `Bearer ${fixture.cashier.token}`)
    .send({ product_id: fixture.product.id, quantity });
  await request(app)
    .post(`/api/sales/${created.body.id}/payments/${method}`)
    .set('Authorization', `Bearer ${fixture.cashier.token}`)
    .send({ amount: withItem.body.total_amount });
  const completed = await request(app)
    .post(`/api/sales/${created.body.id}/complete`)
    .set('Authorization', `Bearer ${fixture.cashier.token}`)
    .send({});
  return completed.body;
}

afterAll(async () => {
  await deleteTestRegisterSessions();
  await deleteTestCatalogData();
  await deleteTestUsersByPrefix();
  await pool.query(`DELETE FROM registers WHERE code LIKE 'TEST_%'`);
  await closeTestPool();
});

it('refunds an eligible receipted return at original line value and restocks it', async () => {
  const fixture = await setup();
  const sale = await completedSale(fixture, 2);
  const result = await request(app)
    .post('/api/returns')
    .set('Authorization', `Bearer ${fixture.cashier.token}`)
    .send({
      sale_id: sale.id,
      reason: 'Customer changed mind',
      items: [{ sale_item_id: sale.items[0].id, quantity: 1, resellable: true }],
    });
  expect(result.status).toBe(201);
  expect(result.body.approval_pending).toBe(false);
  expect(result.body.return.status).toBe('REFUNDED');
  expect(result.body.return.total_refund_amount).toBe(40);
  expect(result.body.return.refunds[0]).toMatchObject({
    method: 'CASH',
    amount: 40,
    status: 'COMPLETED',
  });
  const stock = await pool.query<{ current_stock: number }>(
    'SELECT current_stock FROM products WHERE id = $1',
    [fixture.product.id],
  );
  expect(stock.rows[0].current_stock).toBe(9);
});

it('rejects a second return that exceeds the remaining quantity', async () => {
  const fixture = await setup();
  const sale = await completedSale(fixture, 1);
  const requestBody = {
    sale_id: sale.id,
    reason: 'Return',
    items: [{ sale_item_id: sale.items[0].id, quantity: 1, resellable: false }],
  };
  expect(
    (
      await request(app)
        .post('/api/returns')
        .set('Authorization', `Bearer ${fixture.cashier.token}`)
        .send(requestBody)
    ).status,
  ).toBe(201);
  const duplicate = await request(app)
    .post('/api/returns')
    .set('Authorization', `Bearer ${fixture.cashier.token}`)
    .send(requestBody);
  expect(duplicate.status).toBe(409);
});

it('requires inline Manager approval for no-receipt returns and refunds them in cash', async () => {
  const fixture = await setup();
  const managerUsername = uniqueUsername('return_manager');
  const managerPassword = 'Password123!';
  await request(app).post('/api/users').set('Authorization', `Bearer ${fixture.admin.token}`).send({
    username: managerUsername,
    password: managerPassword,
    full_name: 'Return Manager',
    role: 'MANAGER',
  });

  const requested = await request(app)
    .post('/api/returns')
    .set('Authorization', `Bearer ${fixture.cashier.token}`)
    .send({
      reason: 'No receipt',
      items: [{ product_id: fixture.product.id, quantity: 1, resellable: true }],
    });
  expect(requested.status).toBe(202);
  expect(requested.body.return.status).toBe('REQUESTED');

  const decided = await request(app)
    .post(`/api/approvals/${requested.body.approval_id}/inline-decision`)
    .set('Authorization', `Bearer ${fixture.cashier.token}`)
    .send({
      manager_username: managerUsername,
      manager_password: managerPassword,
      decision: 'APPROVE',
    });
  expect(decided.status).toBe(200);
  expect(decided.body.return.status).toBe('REFUNDED');
  expect(decided.body.return.refunds[0]).toMatchObject({ method: 'CASH', amount: 40 });
});

it('leaves a failed card reversal visible for Manager retry', async () => {
  const fixture = await setup();
  const sale = await completedSale(fixture, 1, 'card');
  process.env.CARD_REFUND_MODE = 'fail';
  const returned = await request(app)
    .post('/api/returns')
    .set('Authorization', `Bearer ${fixture.cashier.token}`)
    .send({
      sale_id: sale.id,
      reason: 'Card return',
      items: [{ sale_item_id: sale.items[0].id, quantity: 1, resellable: false }],
    });
  expect(returned.body.return.status).toBe('APPROVED');
  expect(returned.body.return.refunds[0].status).toBe('FAILED');
  delete process.env.CARD_REFUND_MODE;
  const retried = await request(app)
    .post(`/api/returns/${returned.body.return.id}/refunds/retry`)
    .set('Authorization', `Bearer ${fixture.admin.token}`)
    .send({});
  expect(retried.status).toBe(200);
  expect(retried.body.status).toBe('REFUNDED');
});

it('rejects receipted returns after the seven-calendar-day window', async () => {
  const fixture = await setup();
  const sale = await completedSale(fixture, 1);
  await pool.query("UPDATE sales SET completed_at = now() - interval '8 days' WHERE id = $1", [
    sale.id,
  ]);
  const result = await request(app)
    .post('/api/returns')
    .set('Authorization', `Bearer ${fixture.cashier.token}`)
    .send({
      sale_id: sale.id,
      reason: 'Too late',
      items: [{ sale_item_id: sale.items[0].id, quantity: 1, resellable: true }],
    });
  expect(result.status).toBe(409);
});

it('splits a refund proportionally across the original cash and card payments', async () => {
  const fixture = await setup();
  const created = await request(app)
    .post('/api/sales')
    .set('Authorization', `Bearer ${fixture.cashier.token}`)
    .send({ register_session_id: fixture.session.id });
  const withItem = await request(app)
    .post(`/api/sales/${created.body.id}/items`)
    .set('Authorization', `Bearer ${fixture.cashier.token}`)
    .send({ product_id: fixture.product.id, quantity: 1 });
  await request(app)
    .post(`/api/sales/${created.body.id}/payments/cash`)
    .set('Authorization', `Bearer ${fixture.cashier.token}`)
    .send({ amount: 10 });
  await request(app)
    .post(`/api/sales/${created.body.id}/payments/card`)
    .set('Authorization', `Bearer ${fixture.cashier.token}`)
    .send({ amount: 30 });
  const sale = (
    await request(app)
      .post(`/api/sales/${created.body.id}/complete`)
      .set('Authorization', `Bearer ${fixture.cashier.token}`)
      .send({})
  ).body;

  const result = await request(app)
    .post('/api/returns')
    .set('Authorization', `Bearer ${fixture.cashier.token}`)
    .send({
      sale_id: sale.id,
      reason: 'Split refund',
      items: [{ sale_item_id: withItem.body.items[0].id, quantity: 1, resellable: false }],
    });
  expect(result.status).toBe(201);
  expect(result.body.return.refunds).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ method: 'CASH', amount: 10 }),
      expect.objectContaining({ method: 'CARD', amount: 30 }),
    ]),
  );
});
