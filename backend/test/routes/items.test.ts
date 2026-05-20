import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import nock from 'nock';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createApp } from '../../src/server.js';

const BASE = 'http://dw.test:8080/WebAPI';
const listFx = JSON.parse(readFileSync(resolve(__dirname, '../fixtures/dw/inventoryList.json'), 'utf8'));

async function login(app: ReturnType<typeof createApp>) {
  nock(BASE).post('/User/Login').reply(200, { AuthToken: 'tok', UserName: 'u' });
  const res = await request(app).post('/api/auth/login').send({
    baseUrl: BASE, username: 'u', password: 'p', database: 'db', eplantId: 1,
  });
  return res.headers['set-cookie'];
}

describe('GET /api/items', () => {
  beforeEach(() => {
    nock.disableNetConnect();
    nock.enableNetConnect('127.0.0.1');
  });
  afterEach(() => { nock.cleanAll(); nock.enableNetConnect(); });

  it('requires authentication', async () => {
    const app = createApp();
    const res = await request(app).get('/api/items?q=PART');
    expect(res.status).toBe(401);
  });

  it('returns items list when authenticated', async () => {
    const app = createApp();
    const cookies = await login(app);
    nock(BASE).get('/Manufacturing/Inventory/InventoryList/0').query(true).reply(200, listFx);
    const res = await request(app).get('/api/items?q=PART').set('Cookie', cookies!);
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(2);
    expect(res.body.items[0].itemNumber).toBe('PART-A');
  });
});
