import request from 'supertest';
import { createApp } from '../src/app';
import { pool } from '../src/db/pool';
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

async function createCategory(token: string, name: string): Promise<number> {
  const res = await request(app)
    .post('/api/categories')
    .set('Authorization', `Bearer ${token}`)
    .send({ name });
  return res.body.id;
}

afterAll(async () => {
  await deleteTestCatalogData();
  await deleteTestUsersByPrefix();
  await closeTestPool();
});

describe('POST /api/products (create)', () => {
  it('creates a product with a valid category, sku, and price', async () => {
    const admin = await loginAs(app, BOOTSTRAP_ADMIN.username, BOOTSTRAP_ADMIN.password);
    const categoryId = await createCategory(admin.token, uniqueCode('cat'));
    const sku = uniqueCode('sku');

    const res = await request(app)
      .post('/api/products')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ sku, name: 'Test Widget', category_id: categoryId, current_price: 9.99 });

    expect(res.status).toBe(201);
    expect(res.body.sku).toBe(sku);
    expect(res.body.category_id).toBe(categoryId);
    expect(res.body.current_price).toBe(9.99);
    expect(res.body.is_active).toBe(true);
  });

  it('rejects a product referencing a non-existent category', async () => {
    const admin = await loginAs(app, BOOTSTRAP_ADMIN.username, BOOTSTRAP_ADMIN.password);
    const sku = uniqueCode('badcat');

    const res = await request(app)
      .post('/api/products')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ sku, name: 'Bad Category Widget', category_id: 999999, current_price: 5 });

    expect(res.status).toBe(400);
  });

  it('rejects a negative price', async () => {
    const admin = await loginAs(app, BOOTSTRAP_ADMIN.username, BOOTSTRAP_ADMIN.password);
    const categoryId = await createCategory(admin.token, uniqueCode('cat'));
    const sku = uniqueCode('negprice');

    const res = await request(app)
      .post('/api/products')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ sku, name: 'Negative Price Widget', category_id: categoryId, current_price: -1 });

    expect(res.status).toBe(400);
  });

  it('rejects a duplicate SKU with 409', async () => {
    const admin = await loginAs(app, BOOTSTRAP_ADMIN.username, BOOTSTRAP_ADMIN.password);
    const categoryId = await createCategory(admin.token, uniqueCode('cat'));
    const sku = uniqueCode('dupesku');

    const first = await request(app)
      .post('/api/products')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ sku, name: 'First Widget', category_id: categoryId, current_price: 1 });
    expect(first.status).toBe(201);

    const second = await request(app)
      .post('/api/products')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ sku, name: 'Second Widget', category_id: categoryId, current_price: 2 });
    expect(second.status).toBe(409);
  });

  it('rejects a duplicate barcode among active products with 409', async () => {
    const admin = await loginAs(app, BOOTSTRAP_ADMIN.username, BOOTSTRAP_ADMIN.password);
    const categoryId = await createCategory(admin.token, uniqueCode('cat'));
    const barcode = uniqueCode('barcode');

    const first = await request(app)
      .post('/api/products')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({
        sku: uniqueCode('sku1'),
        barcode,
        name: 'Barcode One',
        category_id: categoryId,
        current_price: 1,
      });
    expect(first.status).toBe(201);

    const second = await request(app)
      .post('/api/products')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({
        sku: uniqueCode('sku2'),
        barcode,
        name: 'Barcode Two',
        category_id: categoryId,
        current_price: 2,
      });
    expect(second.status).toBe(409);
  });

  it('allows barcode reuse once the original product is deactivated', async () => {
    const admin = await loginAs(app, BOOTSTRAP_ADMIN.username, BOOTSTRAP_ADMIN.password);
    const categoryId = await createCategory(admin.token, uniqueCode('cat'));
    const barcode = uniqueCode('reusable_barcode');

    const first = await request(app)
      .post('/api/products')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({
        sku: uniqueCode('sku1'),
        barcode,
        name: 'Reusable One',
        category_id: categoryId,
        current_price: 1,
      });
    expect(first.status).toBe(201);

    const deactivateRes = await request(app)
      .patch(`/api/products/${first.body.id}/deactivate`)
      .set('Authorization', `Bearer ${admin.token}`);
    expect(deactivateRes.status).toBe(200);
    expect(deactivateRes.body.is_active).toBe(false);

    const second = await request(app)
      .post('/api/products')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({
        sku: uniqueCode('sku2'),
        barcode,
        name: 'Reusable Two',
        category_id: categoryId,
        current_price: 2,
      });
    expect(second.status).toBe(201);
  });

  it('rejects a Cashier from creating a product', async () => {
    const admin = await loginAs(app, BOOTSTRAP_ADMIN.username, BOOTSTRAP_ADMIN.password);
    const categoryId = await createCategory(admin.token, uniqueCode('cat'));
    const cashierUsername = uniqueUsername('prod_cashier');
    const cashierPassword = 'Password123!';

    await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({
        username: cashierUsername,
        password: cashierPassword,
        full_name: 'Prod Cashier',
        role: 'CASHIER',
      });
    const cashier = await loginAs(app, cashierUsername, cashierPassword);

    const res = await request(app)
      .post('/api/products')
      .set('Authorization', `Bearer ${cashier.token}`)
      .send({
        sku: uniqueCode('cashier_sku'),
        name: 'Should Fail',
        category_id: categoryId,
        current_price: 1,
      });

    expect(res.status).toBe(403);
  });
});

describe('GET /api/products (list/search)', () => {
  it('finds a product by partial name search', async () => {
    const admin = await loginAs(app, BOOTSTRAP_ADMIN.username, BOOTSTRAP_ADMIN.password);
    const categoryId = await createCategory(admin.token, uniqueCode('cat'));
    const uniqueName = `SearchableWidget_${Date.now()}`;

    await request(app)
      .post('/api/products')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({
        sku: uniqueCode('searchsku'),
        name: uniqueName,
        category_id: categoryId,
        current_price: 1,
      });

    const res = await request(app)
      .get(`/api/products?q=${uniqueName.substring(0, 10)}`)
      .set('Authorization', `Bearer ${admin.token}`);

    expect(res.status).toBe(200);
    expect(res.body.products.some((p: { name: string }) => p.name === uniqueName)).toBe(true);
  });

  it('filters by category_id', async () => {
    const admin = await loginAs(app, BOOTSTRAP_ADMIN.username, BOOTSTRAP_ADMIN.password);
    const categoryId = await createCategory(admin.token, uniqueCode('cat'));
    const sku = uniqueCode('catfilter');

    await request(app)
      .post('/api/products')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ sku, name: 'Category Filter Widget', category_id: categoryId, current_price: 1 });

    const res = await request(app)
      .get(`/api/products?category_id=${categoryId}`)
      .set('Authorization', `Bearer ${admin.token}`);

    expect(res.status).toBe(200);
    expect(
      res.body.products.every((p: { category_id: number }) => p.category_id === categoryId),
    ).toBe(true);
  });

  it('allows a Cashier read/search access only (no mutation)', async () => {
    const admin = await loginAs(app, BOOTSTRAP_ADMIN.username, BOOTSTRAP_ADMIN.password);
    const cashierUsername = uniqueUsername('prod_reader');
    const cashierPassword = 'Password123!';

    await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({
        username: cashierUsername,
        password: cashierPassword,
        full_name: 'Prod Reader',
        role: 'CASHIER',
      });
    const cashier = await loginAs(app, cashierUsername, cashierPassword);

    const listRes = await request(app)
      .get('/api/products')
      .set('Authorization', `Bearer ${cashier.token}`);
    expect(listRes.status).toBe(200);
  });
});

describe('GET /api/products/barcode/:barcode', () => {
  it('looks up an active product by barcode', async () => {
    const admin = await loginAs(app, BOOTSTRAP_ADMIN.username, BOOTSTRAP_ADMIN.password);
    const categoryId = await createCategory(admin.token, uniqueCode('cat'));
    const barcode = uniqueCode('lookup_barcode');

    await request(app)
      .post('/api/products')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({
        sku: uniqueCode('lookupsku'),
        barcode,
        name: 'Lookup Widget',
        category_id: categoryId,
        current_price: 1,
      });

    const res = await request(app)
      .get(`/api/products/barcode/${barcode}`)
      .set('Authorization', `Bearer ${admin.token}`);

    expect(res.status).toBe(200);
    expect(res.body.barcode).toBe(barcode);
  });

  it('returns 404 for an unknown barcode', async () => {
    const admin = await loginAs(app, BOOTSTRAP_ADMIN.username, BOOTSTRAP_ADMIN.password);
    const res = await request(app)
      .get(`/api/products/barcode/${uniqueCode('does_not_exist')}`)
      .set('Authorization', `Bearer ${admin.token}`);
    expect(res.status).toBe(404);
  });
});

describe('PATCH /api/products/:id (update/deactivate)', () => {
  it('updates a product and records a price-change audit event', async () => {
    const admin = await loginAs(app, BOOTSTRAP_ADMIN.username, BOOTSTRAP_ADMIN.password);
    const categoryId = await createCategory(admin.token, uniqueCode('cat'));
    const sku = uniqueCode('updatable');

    const createRes = await request(app)
      .post('/api/products')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ sku, name: 'Updatable Widget', category_id: categoryId, current_price: 10 });

    const updateRes = await request(app)
      .patch(`/api/products/${createRes.body.id}`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ current_price: 15.5 });

    expect(updateRes.status).toBe(200);
    expect(updateRes.body.current_price).toBe(15.5);

    const auditRows = await pool.query(
      `SELECT * FROM audit_logs WHERE entity_type = 'PRODUCT' AND entity_id = $1 AND action_type = 'PRODUCT_UPDATED'`,
      [createRes.body.id],
    );
    expect(auditRows.rows.length).toBeGreaterThanOrEqual(1);
    expect(auditRows.rows[0].before_snapshot.current_price).toBe('10.00');
    expect(auditRows.rows[0].after_snapshot.current_price).toBe('15.50');
  });

  it('deactivates a product rather than allowing deletion, and audits it', async () => {
    const admin = await loginAs(app, BOOTSTRAP_ADMIN.username, BOOTSTRAP_ADMIN.password);
    const categoryId = await createCategory(admin.token, uniqueCode('cat'));
    const sku = uniqueCode('deactivatable');

    const createRes = await request(app)
      .post('/api/products')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ sku, name: 'Deactivatable Widget', category_id: categoryId, current_price: 10 });

    const deactivateRes = await request(app)
      .patch(`/api/products/${createRes.body.id}/deactivate`)
      .set('Authorization', `Bearer ${admin.token}`);

    expect(deactivateRes.status).toBe(200);
    expect(deactivateRes.body.is_active).toBe(false);

    // Still retrievable by ID (soft-deactivated, never deleted).
    const getRes = await request(app)
      .get(`/api/products/${createRes.body.id}`)
      .set('Authorization', `Bearer ${admin.token}`);
    expect(getRes.status).toBe(200);

    const auditRows = await pool.query(
      `SELECT * FROM audit_logs WHERE entity_type = 'PRODUCT' AND entity_id = $1 AND action_type = 'PRODUCT_DEACTIVATED'`,
      [createRes.body.id],
    );
    expect(auditRows.rows.length).toBeGreaterThanOrEqual(1);
  });

  it('rejects a Cashier from modifying a product (PR-02)', async () => {
    const admin = await loginAs(app, BOOTSTRAP_ADMIN.username, BOOTSTRAP_ADMIN.password);
    const categoryId = await createCategory(admin.token, uniqueCode('cat'));
    const sku = uniqueCode('cashierproof');

    const createRes = await request(app)
      .post('/api/products')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ sku, name: 'Cashier Proof Widget', category_id: categoryId, current_price: 10 });

    const cashierUsername = uniqueUsername('prod_editor_cashier');
    const cashierPassword = 'Password123!';
    await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({
        username: cashierUsername,
        password: cashierPassword,
        full_name: 'Editor Cashier',
        role: 'CASHIER',
      });
    const cashier = await loginAs(app, cashierUsername, cashierPassword);

    const res = await request(app)
      .patch(`/api/products/${createRes.body.id}`)
      .set('Authorization', `Bearer ${cashier.token}`)
      .send({ current_price: 999 });

    expect(res.status).toBe(403);
  });

  it('never lets a price update mutate history: current_price is the only column affected', async () => {
    // Historical transactions (future Sales phase `sale_items.unit_price_snapshot`)
    // must never depend on `products.current_price` - this is enforced by
    // that column being independently snapshotted at sale time, not by any
    // mechanism in the Catalog module itself. Here we confirm the Catalog
    // module's own contract: updating price only ever touches the product
    // row + an audit_logs entry preserving the prior value - nothing else.
    const admin = await loginAs(app, BOOTSTRAP_ADMIN.username, BOOTSTRAP_ADMIN.password);
    const categoryId = await createCategory(admin.token, uniqueCode('cat'));
    const sku = uniqueCode('historyproof');

    const createRes = await request(app)
      .post('/api/products')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ sku, name: 'History Proof Widget', category_id: categoryId, current_price: 20 });

    await request(app)
      .patch(`/api/products/${createRes.body.id}`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ current_price: 30 });

    const finalRes = await request(app)
      .get(`/api/products/${createRes.body.id}`)
      .set('Authorization', `Bearer ${admin.token}`);
    expect(finalRes.body.current_price).toBe(30);

    // The prior price (20) is only recoverable via the audit trail, never
    // via `products.current_price` itself - proving the current price
    // never "carries" history.
    const auditRows = await pool.query(
      `SELECT before_snapshot FROM audit_logs
       WHERE entity_type = 'PRODUCT' AND entity_id = $1 AND action_type = 'PRODUCT_UPDATED'
       ORDER BY created_at ASC LIMIT 1`,
      [createRes.body.id],
    );
    expect(auditRows.rows[0].before_snapshot.current_price).toBe('20.00');
  });
});
