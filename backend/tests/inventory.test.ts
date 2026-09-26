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

async function createProduct(token: string, stock = 4, threshold = 5) {
  const category = await request(app)
    .post('/api/categories')
    .set('Authorization', `Bearer ${token}`)
    .send({ name: uniqueCode('inventory_cat') });
  const product = await request(app)
    .post('/api/products')
    .set('Authorization', `Bearer ${token}`)
    .send({
      sku: uniqueCode('inventory_sku'),
      name: 'Inventory Test Product',
      category_id: category.body.id,
      current_price: 12.5,
      initial_stock: stock,
      reorder_threshold: threshold,
    });
  expect(product.status).toBe(201);
  return product.body;
}

beforeEach(async () => {
  await deleteTestRegisterSessions();
  await deleteTestCatalogData();
  await deleteTestUsersByPrefix();
});

afterAll(async () => {
  await deleteTestRegisterSessions();
  await deleteTestCatalogData();
  await deleteTestUsersByPrefix();
  await closeTestPool();
});

describe('inventory operations', () => {
  it('restocks atomically and records the movement', async () => {
    const admin = await loginAs(app, BOOTSTRAP_ADMIN.username, BOOTSTRAP_ADMIN.password);
    const product = await createProduct(admin.token);

    const add = await request(app)
      .post(`/api/products/${product.id}/stock/add`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ quantity: 6, reason: 'Supplier delivery' });

    expect(add.status).toBe(201);
    expect(add.body.product.current_stock).toBe(10);
    expect(add.body.movement).toMatchObject({
      movement_type: 'MANUAL_ADD',
      quantity_delta: 6,
      resulting_stock: 10,
      reason: 'Supplier delivery',
    });

    const history = await request(app)
      .get(`/api/products/${product.id}/stock/movements`)
      .set('Authorization', `Bearer ${admin.token}`);
    expect(history.status).toBe(200);
    expect(
      history.body.movements.map((row: { movement_type: string }) => row.movement_type),
    ).toEqual(expect.arrayContaining(['MANUAL_ADD']));
  });

  it('allows a reasoned signed correction but rejects negative resulting stock', async () => {
    const admin = await loginAs(app, BOOTSTRAP_ADMIN.username, BOOTSTRAP_ADMIN.password);
    const product = await createProduct(admin.token, 4);

    const adjust = await request(app)
      .post(`/api/products/${product.id}/stock/adjust`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ quantity_delta: -2, reason: 'Damaged units' });
    expect(adjust.status).toBe(201);
    expect(adjust.body.product.current_stock).toBe(2);

    const rejected = await request(app)
      .post(`/api/products/${product.id}/stock/adjust`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ quantity_delta: -3, reason: 'Bad count' });
    expect(rejected.status).toBe(409);

    const current = await pool.query('SELECT current_stock FROM products WHERE id = $1', [
      product.id,
    ]);
    expect(current.rows[0].current_stock).toBe(2);
  });

  it('lists low and out-of-stock products with OUT first', async () => {
    const admin = await loginAs(app, BOOTSTRAP_ADMIN.username, BOOTSTRAP_ADMIN.password);
    const low = await createProduct(admin.token, 3, 5);
    const out = await createProduct(admin.token, 0, 5);

    const response = await request(app)
      .get('/api/inventory/low-stock')
      .set('Authorization', `Bearer ${admin.token}`);
    expect(response.status).toBe(200);
    const ids = response.body.products.map((product: { id: number }) => product.id);
    expect(ids).toEqual(expect.arrayContaining([low.id, out.id]));
    expect(
      response.body.products.find((product: { id: number }) => product.id === out.id).stock_status,
    ).toBe('OUT');
    expect(ids.indexOf(out.id)).toBeLessThan(ids.indexOf(low.id));
  });

  it('forbids cashiers from inventory management', async () => {
    const admin = await loginAs(app, BOOTSTRAP_ADMIN.username, BOOTSTRAP_ADMIN.password);
    const product = await createProduct(admin.token);
    const username = uniqueUsername('inventory_cashier');
    const password = 'Cashier123!';
    await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ username, password, full_name: 'Inventory Cashier', role: 'CASHIER' });
    const cashier = await loginAs(app, username, password);

    const response = await request(app)
      .post(`/api/products/${product.id}/stock/add`)
      .set('Authorization', `Bearer ${cashier.token}`)
      .send({ quantity: 1 });
    expect(response.status).toBe(403);
  });
});
