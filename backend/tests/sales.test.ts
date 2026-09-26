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

async function createTestCashier(admin: { token: string }, role = 'CASHIER') {
  const username = uniqueUsername('sale_cashier');
  const password = 'Password123!';
  await request(app)
    .post('/api/users')
    .set('Authorization', `Bearer ${admin.token}`)
    .send({ username, password, full_name: 'Sales Cashier', role });
  return loginAs(app, username, password);
}

async function createTestProduct(
  admin: { token: string },
  overrides: Partial<{ price: number; stock: number; barcode: string }> = {},
) {
  const categoryName = uniqueCode('SALE_CAT');
  const categoryRes = await request(app)
    .post('/api/categories')
    .set('Authorization', `Bearer ${admin.token}`)
    .send({ name: categoryName });
  const categoryId = categoryRes.body.id;

  const sku = uniqueCode('SALE_SKU');
  const productRes = await request(app)
    .post('/api/products')
    .set('Authorization', `Bearer ${admin.token}`)
    .send({
      sku,
      barcode: overrides.barcode ?? null,
      name: `Test Product ${sku}`,
      category_id: categoryId,
      current_price: overrides.price ?? 100,
      initial_stock: overrides.stock ?? 10,
      reorder_threshold: 2,
    });
  return {
    productId: productRes.body.id,
    categoryId,
    price: overrides.price ?? 100,
    stock: overrides.stock ?? 10,
  };
}

async function createTestRegister() {
  const code = `SR${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`.slice(0, 20);
  const result = await pool.query<{ id: number }>(
    `INSERT INTO registers (code) VALUES ($1) RETURNING id`,
    [code],
  );
  return result.rows[0].id;
}

async function openSession(cashier: { token: string }, registerId: number) {
  const res = await request(app)
    .post(`/api/registers/${registerId}/sessions`)
    .set('Authorization', `Bearer ${cashier.token}`)
    .send({ starting_cash: 100 });
  return res.body.id;
}

afterAll(async () => {
  await deleteTestRegisterSessions();
  await deleteTestCatalogData();
  await deleteTestUsersByPrefix();
  await pool.query(`DELETE FROM registers WHERE code LIKE 'TEST_%' OR code LIKE 'SR%'`);
  await closeTestPool();
});

describe('POST /api/sales', () => {
  it('creates a draft sale on an open register session', async () => {
    const admin = await loginAs(app, BOOTSTRAP_ADMIN.username, BOOTSTRAP_ADMIN.password);
    const cashier = await createTestCashier(admin);
    const registerId = await createTestRegister();
    const sessionId = await openSession(cashier, registerId);

    const res = await request(app)
      .post('/api/sales')
      .set('Authorization', `Bearer ${cashier.token}`)
      .send({ register_session_id: sessionId });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe('DRAFT');
    expect(res.body.register_session_id).toBe(sessionId);
    expect(res.body.cashier_id).toBe(cashier.userId);
  });

  it('rejects creating a sale on a closed session', async () => {
    const admin = await loginAs(app, BOOTSTRAP_ADMIN.username, BOOTSTRAP_ADMIN.password);
    const cashier = await createTestCashier(admin);
    const registerId = await createTestRegister();
    const sessionId = await openSession(cashier, registerId);
    await request(app)
      .post(`/api/registers/${registerId}/sessions/${sessionId}/close`)
      .set('Authorization', `Bearer ${cashier.token}`)
      .send({ counted_cash: 100 });

    const res = await request(app)
      .post('/api/sales')
      .set('Authorization', `Bearer ${cashier.token}`)
      .send({ register_session_id: sessionId });

    expect(res.status).toBe(409);
  });

  it('rejects creating a sale on another cashiers session', async () => {
    const admin = await loginAs(app, BOOTSTRAP_ADMIN.username, BOOTSTRAP_ADMIN.password);
    const owner = await createTestCashier(admin);
    const other = await createTestCashier(admin);
    const registerId = await createTestRegister();
    const sessionId = await openSession(owner, registerId);

    const res = await request(app)
      .post('/api/sales')
      .set('Authorization', `Bearer ${other.token}`)
      .send({ register_session_id: sessionId });

    expect(res.status).toBe(409);
  });
});

describe('POST /api/sales/:saleId/items', () => {
  it('adds an item and recalculates sale totals', async () => {
    const admin = await loginAs(app, BOOTSTRAP_ADMIN.username, BOOTSTRAP_ADMIN.password);
    const cashier = await createTestCashier(admin);
    const registerId = await createTestRegister();
    const sessionId = await openSession(cashier, registerId);
    const { productId, price } = await createTestProduct(admin, { price: 100, stock: 10 });
    const saleRes = await request(app)
      .post('/api/sales')
      .set('Authorization', `Bearer ${cashier.token}`)
      .send({ register_session_id: sessionId });
    const saleId = saleRes.body.id;

    const res = await request(app)
      .post(`/api/sales/${saleId}/items`)
      .set('Authorization', `Bearer ${cashier.token}`)
      .send({ product_id: productId, quantity: 2 });

    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.subtotal_amount).toBe(round2(price * 2));
    expect(res.body.total_amount).toBe(round2(price * 2));
  });

  it('rejects adding an item when stock is insufficient', async () => {
    const admin = await loginAs(app, BOOTSTRAP_ADMIN.username, BOOTSTRAP_ADMIN.password);
    const cashier = await createTestCashier(admin);
    const registerId = await createTestRegister();
    const sessionId = await openSession(cashier, registerId);
    const { productId } = await createTestProduct(admin, { price: 100, stock: 1 });
    const saleRes = await request(app)
      .post('/api/sales')
      .set('Authorization', `Bearer ${cashier.token}`)
      .send({ register_session_id: sessionId });
    const saleId = saleRes.body.id;

    const res = await request(app)
      .post(`/api/sales/${saleId}/items`)
      .set('Authorization', `Bearer ${cashier.token}`)
      .send({ product_id: productId, quantity: 5 });

    expect(res.status).toBe(409);
  });
});

describe('PATCH /api/sales/:saleId/items/:itemId', () => {
  it('updates item quantity and removes item when quantity is zero', async () => {
    const admin = await loginAs(app, BOOTSTRAP_ADMIN.username, BOOTSTRAP_ADMIN.password);
    const cashier = await createTestCashier(admin);
    const registerId = await createTestRegister();
    const sessionId = await openSession(cashier, registerId);
    const { productId } = await createTestProduct(admin, { price: 100, stock: 10 });
    const saleRes = await request(app)
      .post('/api/sales')
      .set('Authorization', `Bearer ${cashier.token}`)
      .send({ register_session_id: sessionId });
    const saleId = saleRes.body.id;

    const itemRes = await request(app)
      .post(`/api/sales/${saleId}/items`)
      .set('Authorization', `Bearer ${cashier.token}`)
      .send({ product_id: productId, quantity: 3 });
    const itemId = itemRes.body.items[0].id;

    const updateRes = await request(app)
      .patch(`/api/sales/${saleId}/items/${itemId}`)
      .set('Authorization', `Bearer ${cashier.token}`)
      .send({ quantity: 2 });
    expect(updateRes.status).toBe(200);
    expect(updateRes.body.items[0].quantity).toBe(2);

    const removeRes = await request(app)
      .patch(`/api/sales/${saleId}/items/${itemId}`)
      .set('Authorization', `Bearer ${cashier.token}`)
      .send({ quantity: 0 });
    expect(removeRes.status).toBe(200);
    expect(removeRes.body.items).toHaveLength(0);
  });
});

describe('POST /api/sales/:saleId/payments/cash', () => {
  it('records a cash payment and leaves sale awaiting explicit completion', async () => {
    const admin = await loginAs(app, BOOTSTRAP_ADMIN.username, BOOTSTRAP_ADMIN.password);
    const cashier = await createTestCashier(admin);
    const registerId = await createTestRegister();
    const sessionId = await openSession(cashier, registerId);
    const { productId } = await createTestProduct(admin, { price: 100, stock: 5 });
    const saleRes = await request(app)
      .post('/api/sales')
      .set('Authorization', `Bearer ${cashier.token}`)
      .send({ register_session_id: sessionId });
    const saleId = saleRes.body.id;
    await request(app)
      .post(`/api/sales/${saleId}/items`)
      .set('Authorization', `Bearer ${cashier.token}`)
      .send({ product_id: productId, quantity: 2 });

    const res = await request(app)
      .post(`/api/sales/${saleId}/payments/cash`)
      .set('Authorization', `Bearer ${cashier.token}`)
      .send({ amount: 200 });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('PAYMENT_PENDING');
    expect(res.body.total_paid).toBe(200);
    expect(res.body.remaining_balance).toBe(0);
    const drawerAudit = await pool.query(
      `SELECT action_type, entity_id, after_snapshot
         FROM audit_logs
        WHERE action_type = 'CASH_DRAWER_OPEN_REQUESTED' AND entity_id = $1
        ORDER BY id DESC LIMIT 1`,
      [saleId],
    );
    expect(drawerAudit.rows[0]).toMatchObject({
      action_type: 'CASH_DRAWER_OPEN_REQUESTED',
      entity_id: saleId,
      after_snapshot: { trigger: 'CASH_PAYMENT', amount: 200 },
    });
  });

  it('leaves sale as PAYMENT_PENDING when partially paid', async () => {
    const admin = await loginAs(app, BOOTSTRAP_ADMIN.username, BOOTSTRAP_ADMIN.password);
    const cashier = await createTestCashier(admin);
    const registerId = await createTestRegister();
    const sessionId = await openSession(cashier, registerId);
    const { productId } = await createTestProduct(admin, { price: 100, stock: 5 });
    const saleRes = await request(app)
      .post('/api/sales')
      .set('Authorization', `Bearer ${cashier.token}`)
      .send({ register_session_id: sessionId });
    const saleId = saleRes.body.id;
    await request(app)
      .post(`/api/sales/${saleId}/items`)
      .set('Authorization', `Bearer ${cashier.token}`)
      .send({ product_id: productId, quantity: 2 });

    const res = await request(app)
      .post(`/api/sales/${saleId}/payments/cash`)
      .set('Authorization', `Bearer ${cashier.token}`)
      .send({ amount: 50 });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('PAYMENT_PENDING');
    expect(res.body.total_paid).toBe(50);
    expect(res.body.remaining_balance).toBe(150);
  });
});

describe('held sale lifecycle', () => {
  it('holds, lists, and resumes a draft sale without losing its cart', async () => {
    const admin = await loginAs(app, BOOTSTRAP_ADMIN.username, BOOTSTRAP_ADMIN.password);
    const cashier = await createTestCashier(admin);
    const registerId = await createTestRegister();
    const sessionId = await openSession(cashier, registerId);
    const { productId } = await createTestProduct(admin, { price: 75, stock: 5 });
    const created = await request(app)
      .post('/api/sales')
      .set('Authorization', `Bearer ${cashier.token}`)
      .send({ register_session_id: sessionId });
    const saleId = created.body.id;
    await request(app)
      .post(`/api/sales/${saleId}/items`)
      .set('Authorization', `Bearer ${cashier.token}`)
      .send({ product_id: productId, quantity: 2 });

    const held = await request(app)
      .post(`/api/sales/${saleId}/hold`)
      .set('Authorization', `Bearer ${cashier.token}`)
      .send({});
    expect(held.status).toBe(200);
    expect(held.body.held_at).toBeTruthy();

    const listed = await request(app)
      .get(`/api/sales/held?register_session_id=${sessionId}`)
      .set('Authorization', `Bearer ${cashier.token}`);
    expect(listed.status).toBe(200);
    expect(listed.body.sales.map((sale: { id: number }) => sale.id)).toContain(saleId);

    const resumed = await request(app)
      .post(`/api/sales/${saleId}/resume`)
      .set('Authorization', `Bearer ${cashier.token}`)
      .send({});
    expect(resumed.status).toBe(200);
    expect(resumed.body.held_at).toBeNull();
    expect(resumed.body.items).toHaveLength(1);
  });
});

describe('card gateway outcomes', () => {
  it('rejects a card payment that exceeds the remaining balance', async () => {
    const admin = await loginAs(app, BOOTSTRAP_ADMIN.username, BOOTSTRAP_ADMIN.password);
    const cashier = await createTestCashier(admin);
    const registerId = await createTestRegister();
    const sessionId = await openSession(cashier, registerId);
    const { productId } = await createTestProduct(admin, { price: 100, stock: 5 });
    const created = await request(app)
      .post('/api/sales')
      .set('Authorization', `Bearer ${cashier.token}`)
      .send({ register_session_id: sessionId });
    await request(app)
      .post(`/api/sales/${created.body.id}/items`)
      .set('Authorization', `Bearer ${cashier.token}`)
      .send({ product_id: productId, quantity: 1 });

    const result = await request(app)
      .post(`/api/sales/${created.body.id}/payments/card`)
      .set('Authorization', `Bearer ${cashier.token}`)
      .send({ amount: 101 });

    expect(result.status).toBe(400);
    expect(result.body.message).toBe('Card payment cannot exceed the remaining balance');
    const payments = await pool.query('SELECT id FROM payments WHERE sale_id = $1', [created.body.id]);
    expect(payments.rowCount).toBe(0);
  });

  it.each([
    ['decline', 402, 'CARD_DECLINED', 'DECLINED'],
    ['ambiguous', 409, 'CARD_PAYMENT_UNCERTAIN', 'AMBIGUOUS'],
  ])(
    'records %s safely and returns a specific error',
    async (mode, expectedStatus, expectedCode, failureCode) => {
      const admin = await loginAs(app, BOOTSTRAP_ADMIN.username, BOOTSTRAP_ADMIN.password);
      const cashier = await createTestCashier(admin);
      const registerId = await createTestRegister();
      const sessionId = await openSession(cashier, registerId);
      const { productId } = await createTestProduct(admin, { price: 100, stock: 5 });
      const created = await request(app)
        .post('/api/sales')
        .set('Authorization', `Bearer ${cashier.token}`)
        .send({ register_session_id: sessionId });
      const saleId = created.body.id;
      await request(app)
        .post(`/api/sales/${saleId}/items`)
        .set('Authorization', `Bearer ${cashier.token}`)
        .send({ product_id: productId, quantity: 1 });

      process.env.CARD_GATEWAY_MODE = mode;
      const result = await request(app)
        .post(`/api/sales/${saleId}/payments/card`)
        .set('Authorization', `Bearer ${cashier.token}`)
        .send({ amount: 100 });
      delete process.env.CARD_GATEWAY_MODE;

      expect(result.status).toBe(expectedStatus);
      expect(result.body.error_code).toBe(expectedCode);
      const payment = await pool.query(
        `SELECT status, failure_code FROM payments WHERE sale_id = $1`,
        [saleId],
      );
      expect(payment.rows[0]).toMatchObject({ status: 'FAILED', failure_code: failureCode });
      if (mode === 'ambiguous') {
        const detail = await request(app)
          .get(`/api/sales/${saleId}`)
          .set('Authorization', `Bearer ${cashier.token}`);
        expect(detail.body.payment_reconciliation_required).toBe(true);
        process.env.CARD_GATEWAY_MODE = 'capture';
        const retry = await request(app)
          .post(`/api/sales/${saleId}/payments/card`)
          .set('Authorization', `Bearer ${cashier.token}`)
          .send({ amount: 100 });
        delete process.env.CARD_GATEWAY_MODE;
        expect(retry.status).toBe(409);
        expect(retry.body.error_code).toBe('CARD_PAYMENT_UNCERTAIN');
      }
    },
  );
});

describe('POST /api/sales/:saleId/complete', () => {
  it('completes a fully paid sale and decrements stock', async () => {
    const admin = await loginAs(app, BOOTSTRAP_ADMIN.username, BOOTSTRAP_ADMIN.password);
    const cashier = await createTestCashier(admin);
    const registerId = await createTestRegister();
    const sessionId = await openSession(cashier, registerId);
    const { productId } = await createTestProduct(admin, { price: 50, stock: 5 });
    const saleRes = await request(app)
      .post('/api/sales')
      .set('Authorization', `Bearer ${cashier.token}`)
      .send({ register_session_id: sessionId });
    const saleId = saleRes.body.id;
    await request(app)
      .post(`/api/sales/${saleId}/items`)
      .set('Authorization', `Bearer ${cashier.token}`)
      .send({ product_id: productId, quantity: 2 });
    await request(app)
      .post(`/api/sales/${saleId}/payments/cash`)
      .set('Authorization', `Bearer ${cashier.token}`)
      .send({ amount: 100 });

    const beforeStock = await getStock(productId);

    const res = await request(app)
      .post(`/api/sales/${saleId}/complete`)
      .set('Authorization', `Bearer ${cashier.token}`)
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('COMPLETED');

    const afterStock = await getStock(productId);
    expect(afterStock).toBe(beforeStock - 2);
  });

  it('rejects completing a sale that is not fully paid', async () => {
    const admin = await loginAs(app, BOOTSTRAP_ADMIN.username, BOOTSTRAP_ADMIN.password);
    const cashier = await createTestCashier(admin);
    const registerId = await createTestRegister();
    const sessionId = await openSession(cashier, registerId);
    const { productId } = await createTestProduct(admin, { price: 100, stock: 5 });
    const saleRes = await request(app)
      .post('/api/sales')
      .set('Authorization', `Bearer ${cashier.token}`)
      .send({ register_session_id: sessionId });
    const saleId = saleRes.body.id;
    await request(app)
      .post(`/api/sales/${saleId}/items`)
      .set('Authorization', `Bearer ${cashier.token}`)
      .send({ product_id: productId, quantity: 1 });

    const res = await request(app)
      .post(`/api/sales/${saleId}/complete`)
      .set('Authorization', `Bearer ${cashier.token}`)
      .send({});

    expect(res.status).toBe(409);
  });
});

describe('POST /api/sales/:saleId/void', () => {
  it('voids a draft sale', async () => {
    const admin = await loginAs(app, BOOTSTRAP_ADMIN.username, BOOTSTRAP_ADMIN.password);
    const cashier = await createTestCashier(admin);
    const registerId = await createTestRegister();
    const sessionId = await openSession(cashier, registerId);
    const { productId } = await createTestProduct(admin, { price: 100, stock: 5 });
    const saleRes = await request(app)
      .post('/api/sales')
      .set('Authorization', `Bearer ${cashier.token}`)
      .send({ register_session_id: sessionId });
    const saleId = saleRes.body.id;
    await request(app)
      .post(`/api/sales/${saleId}/items`)
      .set('Authorization', `Bearer ${cashier.token}`)
      .send({ product_id: productId, quantity: 1 });

    const res = await request(app)
      .post(`/api/sales/${saleId}/void`)
      .set('Authorization', `Bearer ${cashier.token}`)
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('VOIDED');
  });

  it('reverses a captured payment when voiding a payment-pending sale', async () => {
    const admin = await loginAs(app, BOOTSTRAP_ADMIN.username, BOOTSTRAP_ADMIN.password);
    const cashier = await createTestCashier(admin);
    const registerId = await createTestRegister();
    const sessionId = await openSession(cashier, registerId);
    const { productId } = await createTestProduct(admin, { price: 100, stock: 5 });
    const saleRes = await request(app)
      .post('/api/sales')
      .set('Authorization', `Bearer ${cashier.token}`)
      .send({ register_session_id: sessionId });
    const saleId = saleRes.body.id;
    await request(app)
      .post(`/api/sales/${saleId}/items`)
      .set('Authorization', `Bearer ${cashier.token}`)
      .send({ product_id: productId, quantity: 2 });
    await request(app)
      .post(`/api/sales/${saleId}/payments/cash`)
      .set('Authorization', `Bearer ${cashier.token}`)
      .send({ amount: 50 });

    const res = await request(app)
      .post(`/api/sales/${saleId}/void`)
      .set('Authorization', `Bearer ${cashier.token}`)
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('VOIDED');

    const payments = await pool.query(`SELECT * FROM payments WHERE sale_id = $1`, [saleId]);
    expect(payments.rows[0].status).toBe('REVERSED');
  });

  it('rejects voiding a completed sale', async () => {
    const admin = await loginAs(app, BOOTSTRAP_ADMIN.username, BOOTSTRAP_ADMIN.password);
    const cashier = await createTestCashier(admin);
    const registerId = await createTestRegister();
    const sessionId = await openSession(cashier, registerId);
    const { productId } = await createTestProduct(admin, { price: 100, stock: 5 });
    const saleRes = await request(app)
      .post('/api/sales')
      .set('Authorization', `Bearer ${cashier.token}`)
      .send({ register_session_id: sessionId });
    const saleId = saleRes.body.id;
    await request(app)
      .post(`/api/sales/${saleId}/items`)
      .set('Authorization', `Bearer ${cashier.token}`)
      .send({ product_id: productId, quantity: 1 });
    await request(app)
      .post(`/api/sales/${saleId}/payments/cash`)
      .set('Authorization', `Bearer ${cashier.token}`)
      .send({ amount: 100 });
    await request(app)
      .post(`/api/sales/${saleId}/complete`)
      .set('Authorization', `Bearer ${cashier.token}`)
      .send({});

    const res = await request(app)
      .post(`/api/sales/${saleId}/void`)
      .set('Authorization', `Bearer ${cashier.token}`)
      .send({});

    expect(res.status).toBe(409);
  });
});

describe('GET /api/sales/:saleId', () => {
  it('returns sale details with items and payments', async () => {
    const admin = await loginAs(app, BOOTSTRAP_ADMIN.username, BOOTSTRAP_ADMIN.password);
    const cashier = await createTestCashier(admin);
    const registerId = await createTestRegister();
    const sessionId = await openSession(cashier, registerId);
    const { productId } = await createTestProduct(admin, { price: 100, stock: 5 });
    const saleRes = await request(app)
      .post('/api/sales')
      .set('Authorization', `Bearer ${cashier.token}`)
      .send({ register_session_id: sessionId });
    const saleId = saleRes.body.id;
    await request(app)
      .post(`/api/sales/${saleId}/items`)
      .set('Authorization', `Bearer ${cashier.token}`)
      .send({ product_id: productId, quantity: 1 });
    await request(app)
      .post(`/api/sales/${saleId}/payments/cash`)
      .set('Authorization', `Bearer ${cashier.token}`)
      .send({ amount: 100 });

    const res = await request(app)
      .get(`/api/sales/${saleId}`)
      .set('Authorization', `Bearer ${cashier.token}`);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(saleId);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.total_paid).toBe(100);
  });
});

describe('Register close with sales', () => {
  it('computes expected cash including cash sales', async () => {
    const admin = await loginAs(app, BOOTSTRAP_ADMIN.username, BOOTSTRAP_ADMIN.password);
    const cashier = await createTestCashier(admin);
    const registerId = await createTestRegister();
    const sessionId = await openSession(cashier, registerId);
    const { productId } = await createTestProduct(admin, { price: 50, stock: 10 });

    const saleRes = await request(app)
      .post('/api/sales')
      .set('Authorization', `Bearer ${cashier.token}`)
      .send({ register_session_id: sessionId });
    await request(app)
      .post(`/api/sales/${saleRes.body.id}/items`)
      .set('Authorization', `Bearer ${cashier.token}`)
      .send({ product_id: productId, quantity: 1 });
    await request(app)
      .post(`/api/sales/${saleRes.body.id}/payments/cash`)
      .set('Authorization', `Bearer ${cashier.token}`)
      .send({ amount: 50 });
    await request(app)
      .post(`/api/sales/${saleRes.body.id}/complete`)
      .set('Authorization', `Bearer ${cashier.token}`)
      .send({});

    const closeRes = await request(app)
      .post(`/api/registers/${registerId}/sessions/${sessionId}/close`)
      .set('Authorization', `Bearer ${cashier.token}`)
      .send({ counted_cash: 150 });

    expect(closeRes.status).toBe(200);
    expect(closeRes.body.expected_cash).toBe(150); // starting 100 + 50 cash sale
    expect(closeRes.body.variance).toBe(0);
  });

  it('returns change without inflating live or closing expected cash', async () => {
    const admin = await loginAs(app, BOOTSTRAP_ADMIN.username, BOOTSTRAP_ADMIN.password);
    const cashier = await createTestCashier(admin);
    const registerId = await createTestRegister();
    const sessionId = await openSession(cashier, registerId);
    const { productId } = await createTestProduct(admin, { price: 10, stock: 10 });

    const saleRes = await request(app)
      .post('/api/sales')
      .set('Authorization', `Bearer ${cashier.token}`)
      .send({ register_session_id: sessionId });
    await request(app)
      .post(`/api/sales/${saleRes.body.id}/items`)
      .set('Authorization', `Bearer ${cashier.token}`)
      .send({ product_id: productId, quantity: 1 });
    const paid = await request(app)
      .post(`/api/sales/${saleRes.body.id}/payments/cash`)
      .set('Authorization', `Bearer ${cashier.token}`)
      .send({ amount: 20 });
    expect(paid.body.cash_change_due).toBe(10);
    await request(app)
      .post(`/api/sales/${saleRes.body.id}/complete`)
      .set('Authorization', `Bearer ${cashier.token}`)
      .send({});

    const liveSession = await request(app)
      .get(`/api/registers/${registerId}/sessions/current`)
      .set('Authorization', `Bearer ${cashier.token}`);
    expect(liveSession.body.expected_cash).toBe(110);

    const closeRes = await request(app)
      .post(`/api/registers/${registerId}/sessions/${sessionId}/close`)
      .set('Authorization', `Bearer ${cashier.token}`)
      .send({ counted_cash: 110 });
    expect(closeRes.body.expected_cash).toBe(110);
    expect(closeRes.body.variance).toBe(0);
  });

  it('rejects closing a session with a draft sale still open', async () => {
    const admin = await loginAs(app, BOOTSTRAP_ADMIN.username, BOOTSTRAP_ADMIN.password);
    const cashier = await createTestCashier(admin);
    const registerId = await createTestRegister();
    const sessionId = await openSession(cashier, registerId);
    const { productId } = await createTestProduct(admin, { price: 50, stock: 10 });

    const saleRes = await request(app)
      .post('/api/sales')
      .set('Authorization', `Bearer ${cashier.token}`)
      .send({ register_session_id: sessionId });
    await request(app)
      .post(`/api/sales/${saleRes.body.id}/items`)
      .set('Authorization', `Bearer ${cashier.token}`)
      .send({ product_id: productId, quantity: 1 });

    const closeRes = await request(app)
      .post(`/api/registers/${registerId}/sessions/${sessionId}/close`)
      .set('Authorization', `Bearer ${cashier.token}`)
      .send({ counted_cash: 100 });

    expect(closeRes.status).toBe(409);
  });
});

async function getStock(productId: number): Promise<number> {
  const result = await pool.query<{ current_stock: number }>(
    'SELECT current_stock FROM products WHERE id = $1',
    [productId],
  );
  return result.rows[0]?.current_stock ?? 0;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
