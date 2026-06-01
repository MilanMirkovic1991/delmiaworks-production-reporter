import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import nock from 'nock';
import { createDwClient } from '../../src/dwClient/index.js';

const BASE = 'http://dw.test:8080/WebAPI';

describe('dwClient.po.retryReceipt', () => {
  beforeEach(() => nock.disableNetConnect());
  afterEach(() => { nock.cleanAll(); nock.enableNetConnect(); });

  it('fresh: runs all three steps when there is no prior poReceiptId', async () => {
    nock(BASE).get('/Manufacturing/Inventory/LocationsForItem/100').reply(200, { data: [{ LotNo: '4' }] });
    nock(BASE).get('/Labels/PrintLabel/MasterLabels/0').reply(200, { data: [{ Serial: '0000010' }] });
    nock(BASE).post('/POReceiving/PO/CreatePOReceipt/0')
      .query(q => Number(q.poDetailId) === 5001 && Number(q.poReleaseId) === 7001 && Number(q.qtyReceived) === 5)
      .reply(200, { data: { Id: 9001 } });
    nock(BASE).post('/POReceiving/PO/CreatePoReceiptsLabelsPlan/0', (b) => {
      const o = b as { POReceiptsId?: number; Serial?: string; Qty?: number };
      return o.POReceiptsId === 9001 && o.Serial === '0000011' && o.Qty === 5;
    }).reply(200, { data: {} });
    nock(BASE).post('/POReceiving/PO/PostPOReceiptAndUpdateMasterLabel/0', (b) => (b as { LotNo?: string }).LotNo === '5')
      .query(q => Number(q.poReceiptId) === 9001)
      .reply(200, { data: { FgMultiId: 4001, MasterLabelId: 8001 } });

    const client = createDwClient({ baseUrl: BASE });
    client.setAuthToken('t');
    const r = await client.po.retryReceipt({
      poDetailId: 5001, poReleaseId: 7001, arInvtId: 100, itemNumber: 'PART-A',
      qtyReceived: 5, username: 'IQMS',
    });
    expect(r).toMatchObject({
      success: true, poReceiptId: 9001, lotNo: 5, serialNo: '0000011',
      fgMultiId: 4001, masterLabelId: 8001,
    });
  });

  it('fromLabels: skips CreatePOReceipt, redoes LabelsPlan + Post', async () => {
    // NOTE: no CreatePOReceipt nock is registered. If retryReceipt called it,
    // nock(disableNetConnect) would throw and fail this test — that is the assertion.
    nock(BASE).get('/Manufacturing/Inventory/LocationsForItem/100').reply(200, { data: [] });
    nock(BASE).get('/Labels/PrintLabel/MasterLabels/0').reply(200, { data: [{ Serial: '0000099' }] });
    nock(BASE).post('/POReceiving/PO/CreatePoReceiptsLabelsPlan/0', (b) => {
      const o = b as { POReceiptsId?: number; Serial?: string };
      return o.POReceiptsId === 9001 && o.Serial === '0000100';
    }).reply(200, { data: {} });
    nock(BASE).post('/POReceiving/PO/PostPOReceiptAndUpdateMasterLabel/0', (b) => (b as { LotNo?: string }).LotNo === '1')
      .query(q => Number(q.poReceiptId) === 9001)
      .reply(200, { data: { FgMultiId: 4002 } });

    const client = createDwClient({ baseUrl: BASE });
    client.setAuthToken('t');
    const r = await client.po.retryReceipt({
      poDetailId: 5001, poReleaseId: 7001, arInvtId: 100, itemNumber: 'PART-A',
      qtyReceived: 5, username: 'IQMS',
      poReceiptId: 9001, priorError: 'CreatePoReceiptsLabelsPlan failed: boom',
    });
    expect(r.success).toBe(true);
    expect(r.poReceiptId).toBe(9001);
    expect(r.lotNo).toBe(1);
    expect(r.serialNo).toBe('0000100');
    expect(r.fgMultiId).toBe(4002);
  });

  it('fromPost: only re-posts (no CreatePOReceipt, no LabelsPlan)', async () => {
    // Only LocationsForItem + Post are registered. CreatePOReceipt and LabelsPlan
    // are intentionally NOT registered — calling them would fail the test.
    nock(BASE).get('/Manufacturing/Inventory/LocationsForItem/100').reply(200, { data: [] });
    nock(BASE).post('/POReceiving/PO/PostPOReceiptAndUpdateMasterLabel/0', (b) => (b as { LotNo?: string }).LotNo === '1')
      .query(q => Number(q.poReceiptId) === 9001)
      .reply(200, { data: { FgMultiId: 4003, MasterLabelId: 8003 } });

    const client = createDwClient({ baseUrl: BASE });
    client.setAuthToken('t');
    const r = await client.po.retryReceipt({
      poDetailId: 5001, poReleaseId: 7001, arInvtId: 100, itemNumber: 'PART-A',
      qtyReceived: 5, username: 'IQMS',
      poReceiptId: 9001, priorError: 'PostPOReceiptAndUpdateMasterLabel failed: cannot post',
    });
    expect(r.success).toBe(true);
    expect(r.poReceiptId).toBe(9001);
    expect(r.lotNo).toBe(1);
    expect(r.fgMultiId).toBe(4003);
    expect(r.masterLabelId).toBe(8003);
    expect(r.serialNo).toBeUndefined();   // serial was consumed in the prior attempt
  });

  it('returns success:false (preserving poReceiptId) when the Post step fails again', async () => {
    nock(BASE).get('/Manufacturing/Inventory/LocationsForItem/100').reply(200, { data: [] });
    nock(BASE).post('/POReceiving/PO/PostPOReceiptAndUpdateMasterLabel/0')
      .query(q => Number(q.poReceiptId) === 9001)
      .reply(500, 'still broken');

    const client = createDwClient({ baseUrl: BASE });
    client.setAuthToken('t');
    const r = await client.po.retryReceipt({
      poDetailId: 5001, poReleaseId: 7001, arInvtId: 100, itemNumber: 'PART-A',
      qtyReceived: 5, username: 'IQMS',
      poReceiptId: 9001, priorError: 'PostPOReceiptAndUpdateMasterLabel failed: cannot post',
    });
    expect(r.success).toBe(false);
    expect(r.poReceiptId).toBe(9001);
    expect(r.error).toMatch(/PostPOReceiptAndUpdateMasterLabel failed/);
  });
});
