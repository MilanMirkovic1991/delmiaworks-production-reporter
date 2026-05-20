import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import nock from 'nock';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createDwClient } from '../../src/dwClient/index.js';

const BASE = 'http://dw.test:8080/WebAPI';
const soFx = JSON.parse(readFileSync(resolve(__dirname, '../fixtures/dw/salesOrder.json'), 'utf8'));
const relFx = JSON.parse(readFileSync(resolve(__dirname, '../fixtures/dw/salesOrderReleases.json'), 'utf8'));

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
});
