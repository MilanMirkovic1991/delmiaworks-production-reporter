import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import nock from 'nock';
import { createApp } from '../../src/server.js';

const BASE = 'http://dw.test:8080/WebAPI';

async function login(app: ReturnType<typeof createApp>) {
  nock(BASE).post('/User/Login').reply(200, { AuthToken: 'tok', UserName: 'u' });
  const res = await request(app).post('/api/auth/login').send({
    baseUrl: BASE, username: 'u', password: 'p', database: 'db', eplantId: 1,
  });
  return res.headers['set-cookie'];
}

describe('POST /api/po/:poId/receive-validate', () => {
  beforeEach(() => { nock.disableNetConnect(); nock.enableNetConnect('127.0.0.1'); });
  afterEach(() => { nock.cleanAll(); nock.enableNetConnect(); });

  it('requires authentication', async () => {
    const app = createApp();
    const res = await request(app).post('/api/po/999/receive-validate').send({ items: [] });
    expect(res.status).toBe(401);
  });

  it('returns 400 when no valid items are provided', async () => {
    const app = createApp();
    const cookies = await login(app);
    const res = await request(app).post('/api/po/999/receive-validate').set('Cookie', cookies!).send({ items: [] });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('NO_VALID_ITEMS');
  });

  it('returns grouped warnings for the provided items', async () => {
    const app = createApp();
    const cookies = await login(app);
    nock(BASE).get('/Manufacturing/Inventory/InventoryItem/100')
      .reply(200, { data: { Id: 100, ItemNumber: 'P-100', RecipeExists: false } });
    nock(BASE).get('/Labels/PrintLabel/MasterLabels/0').reply(200, { data: [] });

    const res = await request(app).post('/api/po/999/receive-validate').set('Cookie', cookies!).send({
      items: [{ arInvtId: 100, itemNumber: 'P-100', quantity: 5 }],
    });
    expect(res.status).toBe(200);
    expect(res.body.poId).toBe(999);
    expect(res.body.warnings.find((w: { kind: string }) => w.kind === 'NO_RECIPE')).toBeTruthy();
  });
});
