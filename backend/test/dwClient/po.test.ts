import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import nock from 'nock';
import { createDwClient } from '../../src/dwClient/index.js';

const BASE = 'http://dw.test:8080/WebAPI';

describe('dwClient.po', () => {
  beforeEach(() => nock.disableNetConnect());
  afterEach(() => { nock.cleanAll(); nock.enableNetConnect(); });

  it('createPurchaseOrder posts header, then line items, then release items', async () => {
    nock(BASE).post('/POReceiving/PO/CreatePO/0').query({ vendorId: '61465' })
      .reply(200, { data: { Id: 999, PONo: 'PO-TEST-1' } });
    nock(BASE).post('/POReceiving/PO/CreatePOLineItem/0').query(true)
      .reply(200, { data: { Id: 5001 } });
    nock(BASE).post('/POReceiving/PO/CreatePOLineItem/0').query(true)
      .reply(200, { data: { Id: 5002 } });
    nock(BASE).post('/POReceiving/PO/CreatePOReleaseItem/0').query(true)
      .reply(200, { data: { Id: 7001 } });
    nock(BASE).post('/POReceiving/PO/CreatePOReleaseItem/0').query(true)
      .reply(200, { data: { Id: 7002 } });

    const client = createDwClient({ baseUrl: BASE });
    client.setAuthToken('t');
    const result = await client.po.createPurchaseOrder({
      vendorId: 61465,
      items: [
        { arInvtId: 100, quantity: 5 },
        { arInvtId: 101, quantity: 10 },
      ],
    });
    expect(result.poId).toBe(999);
    expect(result.poNo).toBe('PO-TEST-1');
    expect(result.lineItems).toHaveLength(2);
    expect(result.lineItems.every(l => l.success)).toBe(true);
    expect(result.lineItems[0]!.poDetailId).toBeGreaterThan(0);
    expect(result.lineItems[0]!.releaseId).toBeGreaterThan(0);
  });

  it('reports line-item failures but still returns the PO', async () => {
    nock(BASE).post('/POReceiving/PO/CreatePO/0').query({ vendorId: '61465' })
      .reply(200, { data: { Id: 1000, PONo: 'PO-TEST-2' } });
    nock(BASE).post('/POReceiving/PO/CreatePOLineItem/0').query(true)
      .reply(500, 'bad');

    const client = createDwClient({ baseUrl: BASE });
    client.setAuthToken('t');
    const result = await client.po.createPurchaseOrder({
      vendorId: 61465,
      items: [{ arInvtId: 100, quantity: 5 }],
    });
    expect(result.poId).toBe(1000);
    expect(result.lineItems[0]!.success).toBe(false);
    expect(result.lineItems[0]!.error).toBeTruthy();
  });

  it('reports release-creation failure as partial success (line OK, release missing)', async () => {
    nock(BASE).post('/POReceiving/PO/CreatePO/0').query({ vendorId: '61465' })
      .reply(200, { data: { Id: 1001, PONo: 'PO-3' } });
    nock(BASE).post('/POReceiving/PO/CreatePOLineItem/0').query(true)
      .reply(200, { data: { Id: 5050 } });
    nock(BASE).post('/POReceiving/PO/CreatePOReleaseItem/0').query(true)
      .reply(500, 'release failed');

    const client = createDwClient({ baseUrl: BASE });
    client.setAuthToken('t');
    const result = await client.po.createPurchaseOrder({
      vendorId: 61465,
      items: [{ arInvtId: 100, quantity: 5 }],
    });
    expect(result.poId).toBe(1001);
    expect(result.lineItems[0]!.success).toBe(false);
    expect(result.lineItems[0]!.poDetailId).toBe(5050);
    expect(result.lineItems[0]!.error).toMatch(/PO_RELEASES/);
  });

  it('throws if CreatePO returns no Id', async () => {
    nock(BASE).post('/POReceiving/PO/CreatePO/0').query({ vendorId: '61465' })
      .reply(200, { data: {} });

    const client = createDwClient({ baseUrl: BASE });
    client.setAuthToken('t');
    await expect(
      client.po.createPurchaseOrder({ vendorId: 61465, items: [{ arInvtId: 100, quantity: 1 }] }),
    ).rejects.toThrow('CreatePO returned no Id');
  });
});
