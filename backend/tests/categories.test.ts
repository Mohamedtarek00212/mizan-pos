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

describe('Categories CRUD', () => {
  it('allows Inventory Staff/Manager/Admin to create a category', async () => {
    const admin = await loginAs(app, BOOTSTRAP_ADMIN.username, BOOTSTRAP_ADMIN.password);
    const name = uniqueCode('cat');

    const res = await request(app)
      .post('/api/categories')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ name });

    expect(res.status).toBe(201);
    expect(res.body.name).toBe(name);
  });

  it('rejects a duplicate category name with 409', async () => {
    const admin = await loginAs(app, BOOTSTRAP_ADMIN.username, BOOTSTRAP_ADMIN.password);
    const name = uniqueCode('dupe_cat');

    const first = await request(app)
      .post('/api/categories')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ name });
    expect(first.status).toBe(201);

    const second = await request(app)
      .post('/api/categories')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ name });
    expect(second.status).toBe(409);
  });

  it('lists and gets categories (any authenticated role)', async () => {
    const admin = await loginAs(app, BOOTSTRAP_ADMIN.username, BOOTSTRAP_ADMIN.password);
    const name = uniqueCode('listable');

    const createRes = await request(app)
      .post('/api/categories')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ name });

    const listRes = await request(app)
      .get('/api/categories')
      .set('Authorization', `Bearer ${admin.token}`);
    expect(listRes.status).toBe(200);
    expect(listRes.body.categories.some((c: { id: number }) => c.id === createRes.body.id)).toBe(
      true,
    );

    const getRes = await request(app)
      .get(`/api/categories/${createRes.body.id}`)
      .set('Authorization', `Bearer ${admin.token}`);
    expect(getRes.status).toBe(200);
    expect(getRes.body.name).toBe(name);
  });

  it('allows renaming a category and records an audit event', async () => {
    const admin = await loginAs(app, BOOTSTRAP_ADMIN.username, BOOTSTRAP_ADMIN.password);
    const name = uniqueCode('renameme');
    const newName = uniqueCode('renamed');

    const createRes = await request(app)
      .post('/api/categories')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ name });

    const renameRes = await request(app)
      .patch(`/api/categories/${createRes.body.id}`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ name: newName });

    expect(renameRes.status).toBe(200);
    expect(renameRes.body.name).toBe(newName);
  });

  it('rejects a Cashier from creating a category (unauthorized mutation)', async () => {
    const admin = await loginAs(app, BOOTSTRAP_ADMIN.username, BOOTSTRAP_ADMIN.password);
    const cashierUsername = uniqueUsername('cat_cashier');
    const cashierPassword = 'Password123!';

    await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({
        username: cashierUsername,
        password: cashierPassword,
        full_name: 'Cat Cashier',
        role: 'CASHIER',
      });
    const cashier = await loginAs(app, cashierUsername, cashierPassword);

    const res = await request(app)
      .post('/api/categories')
      .set('Authorization', `Bearer ${cashier.token}`)
      .send({ name: uniqueCode('should_fail') });

    expect(res.status).toBe(403);
  });

  it('allows a Cashier to read categories (read-only access)', async () => {
    const admin = await loginAs(app, BOOTSTRAP_ADMIN.username, BOOTSTRAP_ADMIN.password);
    const cashierUsername = uniqueUsername('cat_reader');
    const cashierPassword = 'Password123!';

    await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({
        username: cashierUsername,
        password: cashierPassword,
        full_name: 'Cat Reader',
        role: 'CASHIER',
      });
    const cashier = await loginAs(app, cashierUsername, cashierPassword);

    const res = await request(app)
      .get('/api/categories')
      .set('Authorization', `Bearer ${cashier.token}`);
    expect(res.status).toBe(200);
  });
});
