import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import nock from 'nock';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createApp } from '../../src/server.js';

const BASE = 'http://dw.test:8080/WebAPI';
const woFx = JSON.parse(readFileSync(resolve(__dirname, '../fixtures/dw/workOrdersForPart.json'), 'utf8'));

async function login(app: ReturnType<typeof createApp>) {
  nock(BASE).post('/User/Login').reply(200, { AuthToken: 'tok', UserName: 'u' });
  const res = await request(app).post('/api/auth/login').send({
    baseUrl: BASE, username: 'u', password: 'p', database: 'db', eplantId: 1,
  });
  return res.headers['set-cookie'];
}

describe('GET /api/work-orders', () => {
  beforeEach(() => {
    nock.disableNetConnect();
    nock.enableNetConnect('127.0.0.1');
  });
  afterEach(() => { nock.cleanAll(); nock.enableNetConnect(); });

  it('requires authentication', async () => {
    const app = createApp();
    const res = await request(app).get('/api/work-orders?arInvtId=100');
    expect(res.status).toBe(401);
  });

  it('returns work orders array filtered by eplantId', async () => {
    const app = createApp();
    const cookies = await login(app);
    nock(BASE)
      .get('/Manufacturing/WorkOrders/WorkOrdersForPart/0')
      .query(q => q.arInvtId === '100')
      .reply(200, woFx);
    const res = await request(app).get('/api/work-orders?arInvtId=100').set('Cookie', cookies!);
    expect(res.status).toBe(200);
    // fixture has 2 rows: EplantID=1 (kept), EplantID=99 (filtered out)
    expect(res.body.workOrders).toHaveLength(1);
    expect(res.body.workOrders[0].mfgNumber).toBe('WO-501');
  });

  it('returns 400 when arInvtId is missing or invalid', async () => {
    const app = createApp();
    const cookies = await login(app);
    const res = await request(app).get('/api/work-orders').set('Cookie', cookies!);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('INVALID_ARINVTID');
  });
});
