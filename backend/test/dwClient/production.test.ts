import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import nock from 'nock';
import { createDwClient } from '../../src/dwClient/index.js';

const BASE = 'http://dw.test:8080/WebAPI';

function client() {
  const c = createDwClient({ baseUrl: BASE });
  c.setAuthToken('t');
  return c;
}

describe('dwClient.production', () => {
  beforeEach(() => nock.disableNetConnect());
  afterEach(() => { nock.cleanAll(); nock.enableNetConnect(); });

  it('getWorkOrderEx reads standard ProductionHours for a work order', async () => {
    nock(BASE)
      .get('/Manufacturing/WorkOrders/WorkOrderEx/500')
      .reply(200, { data: { Id: 500, StandardID: 42, ProductionHours: 8.5, CyclesRequired: 3, BatchSize: 4, MfgNumber: 'WO-500' } });
    const std = await client().production.getWorkOrderEx(500);
    expect(std).toMatchObject({ workOrderId: 500, standardId: 42, productionHours: 8.5, cyclesRequired: 3, batchSize: 4, mfgNumber: 'WO-500' });
  });

  it('getReportWorkOrder reads Quantity for a work order under the eplant', async () => {
    nock(BASE)
      .get('/Manufacturing/ReportProductionByWorkOrder/WorkOrder/13')
      .query(q => q.workOrderId === '500')
      .reply(200, { data: { Id: 500, Quantity: 120, RemainingQuantity: 30, QuantityReported: 90, Completed: false, ItemNumber: 'PART-A', MfgNumber: 'WO-500' } });
    const r = await client().production.getReportWorkOrder({ eplantId: 13, workOrderId: 500 });
    expect(r).toMatchObject({ workOrderId: 500, quantity: 120, remainingQuantity: 30, quantityReported: 90, completed: false, itemNumber: 'PART-A' });
  });

  it('reportGoodParts POSTs goodPartsQty + productionHours + lotNo as query params', async () => {
    let seen: Record<string, string> = {};
    nock(BASE)
      .post('/Manufacturing/ReportProductionByWorkOrder/GoodPartsQuantityDisposition/13')
      .query(actual => { seen = actual as Record<string, string>; return true; })
      .reply(200, { data: { success: true } });
    const res = await client().production.reportGoodParts({
      eplantId: 13, workOrderId: 500, goodPartsQty: 120, productionHours: 9.1, lotNo: '',
    });
    expect(res.ok).toBe(true);
    expect(seen).toMatchObject({ workOrderId: '500', goodPartsQty: '120', productionHours: '9.1', lotNo: '' });
  });

  it('reportGoodParts defaults lotNo to empty string when omitted', async () => {
    let seen: Record<string, string> = {};
    nock(BASE)
      .post('/Manufacturing/ReportProductionByWorkOrder/GoodPartsQuantityDisposition/13')
      .query(actual => { seen = actual as Record<string, string>; return true; })
      .reply(200, {});
    await client().production.reportGoodParts({ eplantId: 13, workOrderId: 7, goodPartsQty: 1, productionHours: 2 });
    expect(seen.lotNo).toBe('');
  });
});
