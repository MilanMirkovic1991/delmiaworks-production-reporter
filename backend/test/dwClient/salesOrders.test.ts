import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import nock from 'nock';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createDwClient } from '../../src/dwClient/index.js';

const BASE = 'http://dw.test:8080/WebAPI';
const soFx = JSON.parse(readFileSync(resolve(__dirname, '../fixtures/dw/salesOrder.json'), 'utf8'));
const relFx = JSON.parse(readFileSync(resolve(__dirname, '../fixtures/dw/salesOrderReleases.json'), 'utf8'));
const soMultiFx = JSON.parse(readFileSync(resolve(__dirname, '../fixtures/dw/salesOrderMulti.json'), 'utf8'));

describe('dwClient.salesOrders', () => {
  beforeEach(() => nock.disableNetConnect());
  afterEach(() => { nock.cleanAll(); nock.enableNetConnect(); });

  it('listForItem returns SO grouped by ordDetailId, filtered by ArInvtId+Active+EPlant', async () => {
    nock(BASE)
      .get('/SalesDistribution/SalesOrder/SalesOrder/0')
      .query(q => typeof q.filter === 'string' &&
        q.filter.includes('ArInvtId.eq~100~') &&
        q.filter.includes('Status.eq~Active~') &&
        q.filter.includes('EPlantId.eq~1~'))
      .reply(200, soFx);
    const client = createDwClient({ baseUrl: BASE });
    client.setAuthToken('t');
    const sos = await client.salesOrders.listForItem({ arInvtId: 100, eplantId: 1 });
    expect(sos).toHaveLength(2);
    expect(sos[0]).toMatchObject({
      ordDetailId: 11,
      orderNumber: 'SO1001',
      company: 'Acme',
      poNumber: 'PO-77',
      totalOrdered: 500,
      cummShipped: 100,
      remaining: 400,
    });
  });

  it('getReleases queries SalesOrderReleases by detailId', async () => {
    nock(BASE)
      .get('/SalesDistribution/SalesOrder/SalesOrderReleases/0')
      .query(q => q.salesOrderDetailId === '11')
      .reply(200, relFx);
    const client = createDwClient({ baseUrl: BASE });
    client.setAuthToken('t');
    const rels = await client.salesOrders.getReleases({ ordDetailId: 11 });
    expect(rels).toHaveLength(2);
    expect(rels[0]).toMatchObject({ releaseId: 901, seq: 1, qty: 200 });
  });

  it('listActive aggregates rows by header Id, sums quantities, returns one summary per SO', async () => {
    nock(BASE)
      .get('/SalesDistribution/SalesOrder/SalesOrder/0')
      .query(q => typeof q.filter === 'string' &&
        q.filter.includes('Status.eq~Active~') &&
        q.filter.includes('EPlantId.eq~1~'))
      .reply(200, soMultiFx);
    const client = createDwClient({ baseUrl: BASE });
    client.setAuthToken('t');
    const summaries = await client.salesOrders.listActive({ eplantId: 1 });
    expect(summaries).toHaveLength(2);
    // SO id=10 has 3 lines: OrdDetailId 11, 12, 13
    const so10 = summaries.find(s => s.salesOrderId === 10)!;
    expect(so10).toBeDefined();
    expect(so10.lineCount).toBe(3);
    expect(so10.totalOrdered).toBe(375); // 100 + 200 + 75
    expect(so10.totalShipped).toBe(85);  // 10 + 50 + 25
    expect(so10.totalRemaining).toBe(290);
    expect(so10.orderNumber).toBe('SO2001');
    // SO id=20 has 1 line
    const so20 = summaries.find(s => s.salesOrderId === 20)!;
    expect(so20).toBeDefined();
    expect(so20.lineCount).toBe(1);
    expect(so20.totalOrdered).toBe(50);
  });

  it('getLineItems returns per-line rows with ItemNumber for a given SO header Id', async () => {
    nock(BASE)
      .get('/SalesDistribution/SalesOrder/SalesOrder/0')
      .query(q => typeof q.filter === 'string' && q.filter.includes('Id.eq~10~'))
      .reply(200, soMultiFx);
    const client = createDwClient({ baseUrl: BASE });
    client.setAuthToken('t');
    const lines = await client.salesOrders.getLineItems({ salesOrderId: 10 });
    // soMultiFx has 3 rows with Id=10 (OrdDetailId 11, 12, 13)
    expect(lines).toHaveLength(3);
    expect(lines[0]).toMatchObject({
      ordDetailId: 11,
      itemNumber: 'PART-A',
      description: 'Part Alpha',
      totalOrdered: 100,
    });
  });
});
