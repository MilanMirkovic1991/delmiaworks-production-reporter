import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import nock from 'nock';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createApp } from '../../src/server.js';

const BASE = 'http://dw.test:8080/WebAPI';
const soFx = JSON.parse(readFileSync(resolve(__dirname, '../fixtures/dw/salesOrder.json'), 'utf8'));
const relFx = JSON.parse(readFileSync(resolve(__dirname, '../fixtures/dw/salesOrderReleases.json'), 'utf8'));
const soMultiFx = JSON.parse(readFileSync(resolve(__dirname, '../fixtures/dw/salesOrderMulti.json'), 'utf8'));

async function login(app: ReturnType<typeof createApp>) {
  nock(BASE).post('/User/Login').reply(200, { AuthToken: 'tok', UserName: 'u' });
  const res = await request(app).post('/api/auth/login').send({
    baseUrl: BASE, username: 'u', password: 'p', database: 'db', eplantId: 1,
  });
  return res.headers['set-cookie'];
}

describe('GET /api/items/:arInvtId/sales-orders', () => {
  beforeEach(() => {
    nock.disableNetConnect();
    nock.enableNetConnect('127.0.0.1');
  });
  afterEach(() => { nock.cleanAll(); nock.enableNetConnect(); });

  it('returns sales orders for item', async () => {
    const app = createApp();
    const cookies = await login(app);
    nock(BASE).get('/SalesDistribution/SalesOrder/SalesOrder/0').query(true).reply(200, soFx);
    const res = await request(app).get('/api/items/100/sales-orders').set('Cookie', cookies!);
    expect(res.status).toBe(200);
    expect(res.body.salesOrders).toHaveLength(2);
    expect(res.body.salesOrders[0].remaining).toBe(400);
  });
});

describe('GET /api/sales-orders/:ordDetailId/releases', () => {
  beforeEach(() => {
    nock.disableNetConnect();
    nock.enableNetConnect('127.0.0.1');
  });
  afterEach(() => { nock.cleanAll(); nock.enableNetConnect(); });

  it('returns releases for SO detail', async () => {
    const app = createApp();
    const cookies = await login(app);
    nock(BASE).get('/SalesDistribution/SalesOrder/SalesOrderReleases/0').query(true).reply(200, relFx);
    const res = await request(app).get('/api/sales-orders/11/releases').set('Cookie', cookies!);
    expect(res.status).toBe(200);
    expect(res.body.releases).toHaveLength(2);
    expect(res.body.releases[0].qty).toBe(200);
  });
});

describe('GET /api/sales-orders', () => {
  beforeEach(() => {
    nock.disableNetConnect();
    nock.enableNetConnect('127.0.0.1');
  });
  afterEach(() => { nock.cleanAll(); nock.enableNetConnect(); });

  it('returns sales order summaries aggregated by SO header Id', async () => {
    const app = createApp();
    const cookies = await login(app);
    // soMultiFx has 4 rows belonging to 2 SOs (Id=10 with 3 lines, Id=20 with 1 line)
    nock(BASE).get('/SalesDistribution/SalesOrder/SalesOrder/0').query(true).reply(200, soMultiFx);
    const res = await request(app).get('/api/sales-orders').set('Cookie', cookies!);
    expect(res.status).toBe(200);
    expect(res.body.salesOrders).toHaveLength(2);
    const so10 = res.body.salesOrders.find((s: { salesOrderId: number }) => s.salesOrderId === 10);
    expect(so10).toBeDefined();
    expect(so10.lineCount).toBe(3);
    expect(so10.totalOrdered).toBe(375);
  });

  it('requires authentication', async () => {
    const app = createApp();
    const res = await request(app).get('/api/sales-orders');
    expect(res.status).toBe(401);
  });
});

describe('GET /api/sales-orders/:salesOrderId/line-items', () => {
  beforeEach(() => {
    nock.disableNetConnect();
    nock.enableNetConnect('127.0.0.1');
  });
  afterEach(() => { nock.cleanAll(); nock.enableNetConnect(); });

  it('returns line items for a sales order header', async () => {
    const app = createApp();
    const cookies = await login(app);
    nock(BASE).get('/SalesDistribution/SalesOrder/SalesOrder/0').query(true).reply(200, soMultiFx);
    const res = await request(app).get('/api/sales-orders/10/line-items').set('Cookie', cookies!);
    expect(res.status).toBe(200);
    expect(res.body.lineItems).toHaveLength(3);
    expect(res.body.lineItems[0]).toMatchObject({ ordDetailId: 11, itemNumber: 'PART-A' });
  });
});
