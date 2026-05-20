import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import nock from 'nock';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createApp } from '../../src/server.js';

const BASE = 'http://dw.test:8080/WebAPI';
const fxRoot = JSON.parse(readFileSync(resolve(__dirname, '../fixtures/dw/bom_two_level_root.json'), 'utf8'));
const fxSub = JSON.parse(readFileSync(resolve(__dirname, '../fixtures/dw/bom_two_level_sub.json'), 'utf8'));
const listFx = JSON.parse(readFileSync(resolve(__dirname, '../fixtures/dw/inventoryList.json'), 'utf8'));

async function login(app: ReturnType<typeof createApp>) {
  nock(BASE).post('/User/Login').reply(200, { AuthToken: 'tok', UserName: 'u' });
  const res = await request(app).post('/api/auth/login').send({
    baseUrl: BASE, username: 'u', password: 'p', database: 'db', eplantId: 1,
  });
  return res.headers['set-cookie'];
}

describe('GET /api/bom-tree', () => {
  beforeEach(() => {
    nock.disableNetConnect();
    nock.enableNetConnect('127.0.0.1');
  });
  afterEach(() => { nock.cleanAll(); nock.enableNetConnect(); });

  it('rejects qty <= 0', async () => {
    const app = createApp();
    const cookies = await login(app);
    const res = await request(app).get('/api/bom-tree?itemId=100&qty=0').set('Cookie', cookies!);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('INVALID_QTY');
  });

  it('returns tree with stats and reason NO_BOM when empty', async () => {
    const app = createApp();
    const cookies = await login(app);
    // Root item lookup
    nock(BASE).get('/Manufacturing/Inventory/InventoryList/0').query(true).reply(200, listFx);
    // Empty BOM
    nock(BASE).get('/Manufacturing/Inventory/MaterialsForItem/0').query(true).reply(200, { data: [] });
    const res = await request(app).get('/api/bom-tree?itemId=100&qty=10').set('Cookie', cookies!);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ tree: null, reason: 'NO_BOM' });
  });

  it('builds 2-level tree end-to-end', async () => {
    const app = createApp();
    const cookies = await login(app);
    nock(BASE).get('/Manufacturing/Inventory/InventoryList/0').query(true).reply(200, listFx);
    nock(BASE).get('/Manufacturing/Inventory/MaterialsForItem/0')
      .query(q => q.arinvtId === '100' && q.qty === '10').reply(200, fxRoot);
    nock(BASE).get('/Manufacturing/Inventory/MaterialsForItem/0')
      .query(q => q.arinvtId === '200' && q.qty === '20').reply(200, fxSub);
    const res = await request(app).get('/api/bom-tree?itemId=100&qty=10').set('Cookie', cookies!);
    expect(res.status).toBe(200);
    expect(res.body.tree.itemNumber).toBe('PART-A');
    expect(res.body.tree.children).toHaveLength(2);
    expect(res.body.stats.nodeCount).toBe(4);
  });
});
