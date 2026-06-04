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

function item(id: number, itemNo: string, cls = 'MFG') {
  return { ID: id, ItemNo: itemNo, Description: itemNo, Rev: '1', ItemClass: cls };
}

describe('POST /api/production/report-cascade', () => {
  beforeEach(() => { nock.disableNetConnect(); nock.enableNetConnect('127.0.0.1'); });
  afterEach(() => { nock.cleanAll(); nock.enableNetConnect(); });

  it('requires authentication', async () => {
    const app = createApp();
    const res = await request(app).post('/api/production/report-cascade').send({ arInvtId: 100, qty: 10 });
    expect(res.status).toBe(401);
  });

  it('reports the whole subtree bottom-up: full Quantity, jittered hours, per-WO results', async () => {
    const app = createApp();
    const cookies = await login(app);

    // --- tree build: root 100 (MFG) -> child 200 (MFG), each with one WO ---
    nock(BASE).get('/Manufacturing/Inventory/InventoryItem/100').times(2).reply(200, item(100, 'PART-A'));
    nock(BASE).get('/Manufacturing/Inventory/InventoryItem/200').reply(200, item(200, 'SUB'));
    nock(BASE).get('/Manufacturing/Inventory/MaterialsForItem/0').query(q => q.arinvtId === '100')
      .reply(200, { data: [{ Id: 200, ItemNumber: 'SUB', InventoryClass: 'MFG', Qty: 2, PtsPer: 2, Unit: 'ea' }] });
    nock(BASE).get('/Manufacturing/Inventory/MaterialsForItem/0').query(q => q.arinvtId === '200').reply(200, { data: [] });
    nock(BASE).get('/Manufacturing/WorkOrders/WorkOrdersForPart/0').query(q => q.arInvtId === '100')
      .reply(200, { data: [{ Id: 501, MfgNumber: 'WO-501', EplantID: 1 }] });
    nock(BASE).get('/Manufacturing/WorkOrders/WorkOrdersForPart/0').query(q => q.arInvtId === '200')
      .reply(200, { data: [{ Id: 601, MfgNumber: 'WO-601', EplantID: 1 }] });

    // --- per-WO production reads + report (child 601 first, then root 501) ---
    // 601 (child / SUB): standard 4h, full qty 50
    nock(BASE).get('/Manufacturing/ReportProductionByWorkOrder/WorkOrder/1').query(q => q.workOrderId === '601')
      .reply(200, { data: { Id: 601, Quantity: 50, RemainingQuantity: 50, ItemNumber: 'SUB' } });
    nock(BASE).get('/Manufacturing/WorkOrders/WorkOrderEx/601').reply(200, { data: { Id: 601, ProductionHours: 4 } });
    let post601: Record<string, string> = {};
    nock(BASE).post('/Manufacturing/ReportProductionByWorkOrder/GoodPartsQuantityDisposition/1')
      .query(actual => { if (actual.workOrderId === '601') { post601 = actual as Record<string, string>; return true; } return false; })
      .reply(200, { data: { ok: true } });
    // 501 (root / PART-A): standard 8h, full qty 120
    nock(BASE).get('/Manufacturing/ReportProductionByWorkOrder/WorkOrder/1').query(q => q.workOrderId === '501')
      .reply(200, { data: { Id: 501, Quantity: 120, RemainingQuantity: 120, ItemNumber: 'PART-A' } });
    nock(BASE).get('/Manufacturing/WorkOrders/WorkOrderEx/501').reply(200, { data: { Id: 501, ProductionHours: 8 } });
    let post501: Record<string, string> = {};
    nock(BASE).post('/Manufacturing/ReportProductionByWorkOrder/GoodPartsQuantityDisposition/1')
      .query(actual => { if (actual.workOrderId === '501') { post501 = actual as Record<string, string>; return true; } return false; })
      .reply(200, { data: { ok: true } });

    const res = await request(app).post('/api/production/report-cascade').send({ arInvtId: 100, qty: 10 }).set('Cookie', cookies!);
    expect(res.status).toBe(200);

    const body = res.body;
    expect(body.total).toBe(2);
    expect(body.succeeded).toBe(2);
    expect(body.failed).toBe(0);
    expect(body.stoppedOnAuth).toBe(false);
    // bottom-up: child 601 before root 501
    expect(body.results.map((r: { workOrderId: number }) => r.workOrderId)).toEqual([601, 501]);
    // full WO quantity reported as goodPartsQty
    expect(post601.goodPartsQty).toBe('50');
    expect(post501.goodPartsQty).toBe('120');
    // jittered hours within ±15% of the standard
    expect(Number(post601.productionHours)).toBeGreaterThanOrEqual(4 * 0.85 - 1e-6);
    expect(Number(post601.productionHours)).toBeLessThanOrEqual(4 * 1.15 + 1e-6);
    expect(Number(post501.productionHours)).toBeGreaterThanOrEqual(8 * 0.85 - 1e-6);
    expect(Number(post501.productionHours)).toBeLessThanOrEqual(8 * 1.15 + 1e-6);
    // lotNo left empty for DW to assign
    expect(post601.lotNo).toBe('');
  });

  it('stops the cascade when DW returns an auth error mid-run', async () => {
    const app = createApp();
    const cookies = await login(app);

    // single-node tree: root 100, one WO, no children
    nock(BASE).get('/Manufacturing/Inventory/InventoryItem/100').times(2).reply(200, item(100, 'PART-A'));
    nock(BASE).get('/Manufacturing/Inventory/MaterialsForItem/0').query(q => q.arinvtId === '100').reply(200, { data: [] });
    nock(BASE).get('/Manufacturing/WorkOrders/WorkOrdersForPart/0').query(q => q.arInvtId === '100')
      .reply(200, { data: [{ Id: 501, MfgNumber: 'WO-501', EplantID: 1 }] });
    // the first production read for WO 501 returns 401 -> cascade stops
    nock(BASE).get('/Manufacturing/ReportProductionByWorkOrder/WorkOrder/1').query(q => q.workOrderId === '501').reply(401, 'expired');

    const res = await request(app).post('/api/production/report-cascade').send({ arInvtId: 100, qty: 10 }).set('Cookie', cookies!);
    expect(res.status).toBe(200);
    expect(res.body.stoppedOnAuth).toBe(true);
    expect(res.body.total).toBe(1);
    expect(res.body.succeeded).toBe(0);
    expect(res.body.results).toEqual([]);
  });
});
