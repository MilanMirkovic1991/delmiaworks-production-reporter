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

describe('POST /api/po/:poId/receive-retry', () => {
  beforeEach(() => { nock.disableNetConnect(); nock.enableNetConnect('127.0.0.1'); });
  afterEach(() => { nock.cleanAll(); nock.enableNetConnect(); });

  it('requires authentication', async () => {
    const app = createApp();
    const res = await request(app).post('/api/po/999/receive-retry').send({ rows: [] });
    expect(res.status).toBe(401);
  });

  it('returns 400 when no valid rows are provided', async () => {
    const app = createApp();
    const cookies = await login(app);
    const res = await request(app).post('/api/po/999/receive-retry').set('Cookie', cookies!).send({ rows: [] });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('NO_VALID_ROWS');
  });

  it('retries a single fresh row and returns its result', async () => {
    const app = createApp();
    const cookies = await login(app);
    // retryReceipt call order for a 'fresh' row:
    //   1. readNextLot  → GET LocationsForItem/{arInvtId}
    //   2. CreatePOReceipt → POST CreatePOReceipt/0
    //   3. readNextSerial → GET MasterLabels/0
    //   4. CreatePoReceiptsLabelsPlan → POST CreatePoReceiptsLabelsPlan/0
    //   5. PostPOReceiptAndUpdateMasterLabel → POST PostPOReceiptAndUpdateMasterLabel/0
    nock(BASE).get('/Manufacturing/Inventory/LocationsForItem/100').reply(200, { data: [] });
    nock(BASE).post('/POReceiving/PO/CreatePOReceipt/0').query(true).reply(200, { data: { Id: 9001 } });
    nock(BASE).get('/Labels/PrintLabel/MasterLabels/0').reply(200, { data: [] });
    nock(BASE).post('/POReceiving/PO/CreatePoReceiptsLabelsPlan/0').reply(200, { data: {} });
    nock(BASE).post('/POReceiving/PO/PostPOReceiptAndUpdateMasterLabel/0').query(true)
      .reply(200, { data: { FgMultiId: 4001, MasterLabelId: 8001 } });

    const res = await request(app).post('/api/po/999/receive-retry').set('Cookie', cookies!).send({
      rows: [{ poDetailId: 5001, poReleaseId: 7001, arInvtId: 100, itemNumber: 'PART-A', qtyReceived: 5 }],
    });
    expect(res.status).toBe(200);
    expect(res.body.poId).toBe(999);
    expect(res.body.receipts).toHaveLength(1);
    expect(res.body.receipts[0]).toMatchObject({ success: true, poReceiptId: 9001, fgMultiId: 4001 });
  });

  it('stops early on a session/auth error and returns only the processed rows', async () => {
    const app = createApp();
    const cookies = await login(app);
    // Row 1: retryReceipt calls readNextLot first, then CreatePOReceipt which gets 401.
    //   The MasterLabels GET is NOT reached because CreatePOReceipt fails before readNextSerial.
    // Row 2 has NO nocks — if the loop fails to stop, the test errors on an unmatched request.
    nock(BASE).get('/Manufacturing/Inventory/LocationsForItem/100').reply(200, { data: [] });
    nock(BASE).post('/POReceiving/PO/CreatePOReceipt/0').query(true).reply(401, 'Unauthorized');

    const res = await request(app).post('/api/po/999/receive-retry').set('Cookie', cookies!).send({
      rows: [
        { poDetailId: 5001, poReleaseId: 7001, arInvtId: 100, itemNumber: 'A', qtyReceived: 5 },
        { poDetailId: 5002, poReleaseId: 7002, arInvtId: 101, itemNumber: 'B', qtyReceived: 5 },
      ],
    });
    expect(res.status).toBe(200);
    expect(res.body.receipts).toHaveLength(1);
    expect(res.body.receipts[0].success).toBe(false);
  });
});
