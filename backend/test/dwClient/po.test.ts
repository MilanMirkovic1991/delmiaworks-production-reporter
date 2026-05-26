import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import nock from 'nock';
import { createDwClient } from '../../src/dwClient/index.js';

const BASE = 'http://dw.test:8080/WebAPI';

describe('dwClient.po', () => {
  beforeEach(() => nock.disableNetConnect());
  afterEach(() => { nock.cleanAll(); nock.enableNetConnect(); });

  it('creates PO header, sequentially adds line items + releases, then approves with badge', async () => {
    nock(BASE).post('/POReceiving/PO/CreatePO/0').query({ vendorId: '61465' })
      .reply(200, { data: { Id: 999, PONo: 'PO-TEST-1' } });
    nock(BASE).post('/POReceiving/PO/CreatePOLineItem/0').query(q => Number(q.arinvtId) === 100)
      .reply(200, { data: { Id: 5001 } });
    nock(BASE).post('/POReceiving/PO/CreatePOReleaseItem/0').query(q => Number(q.poDetailId) === 5001)
      .reply(200, { data: { Id: 7001 } });
    nock(BASE).post('/POReceiving/PO/CreatePOLineItem/0').query(q => Number(q.arinvtId) === 101)
      .reply(200, { data: { Id: 5002 } });
    nock(BASE).post('/POReceiving/PO/CreatePOReleaseItem/0').query(q => Number(q.poDetailId) === 5002)
      .reply(200, { data: { Id: 7002 } });
    // Approval flow: GET PO body, then UpdatePO with ApprovedBy='001'
    nock(BASE).get('/POReceiving/PO/PO/999')
      .reply(200, { data: { Id: 999, PONo: 'PO-TEST-1', ApprovedBy: '' } });
    let capturedUpdateBody: unknown = null;
    nock(BASE).post('/POReceiving/PO/UpdatePO/999', (body) => {
      capturedUpdateBody = body;
      return true;
    }).reply(200, { data: {} });

    const client = createDwClient({ baseUrl: BASE });
    client.setAuthToken('t');
    const result = await client.po.createPurchaseOrder({
      vendorId: 61465,
      items: [{ arInvtId: 100, quantity: 5 }, { arInvtId: 101, quantity: 10 }],
      approverBadge: '001',
    });
    expect(result.poId).toBe(999);
    expect(result.poNo).toBe('PO-TEST-1');
    expect(result.approved).toBe(true);
    expect(result.approvalError).toBeUndefined();
    expect(result.lineItems).toHaveLength(2);
    expect(result.lineItems.every(l => l.success)).toBe(true);
    expect(result.lineItems[0]!.poDetailId).toBe(5001);
    expect(result.lineItems[0]!.releaseId).toBe(7001);
    expect(result.lineItems[1]!.poDetailId).toBe(5002);
    expect(result.lineItems[1]!.releaseId).toBe(7002);
    // The PO body passed back to UpdatePO must carry ApprovedBy='001'
    expect((capturedUpdateBody as { ApprovedBy?: string } | null)?.ApprovedBy).toBe('001');
  });

  it('reports line-item failures but still returns the PO (and still approves header)', async () => {
    nock(BASE).post('/POReceiving/PO/CreatePO/0').query({ vendorId: '61465' })
      .reply(200, { data: { Id: 1000, PONo: 'PO-TEST-2' } });
    nock(BASE).post('/POReceiving/PO/CreatePOLineItem/0').query(true)
      .reply(500, 'bad');
    nock(BASE).get('/POReceiving/PO/PO/1000').reply(200, { data: { Id: 1000 } });
    nock(BASE).post('/POReceiving/PO/UpdatePO/1000').reply(200, { data: {} });

    const client = createDwClient({ baseUrl: BASE });
    client.setAuthToken('t');
    const result = await client.po.createPurchaseOrder({
      vendorId: 61465,
      items: [{ arInvtId: 100, quantity: 5 }],
      approverBadge: '001',
    });
    expect(result.poId).toBe(1000);
    expect(result.approved).toBe(true);
    expect(result.lineItems[0]!.success).toBe(false);
    expect(result.lineItems[0]!.error).toBeTruthy();
  });

  it('reports release-creation failure as partial success (line OK, release threw)', async () => {
    nock(BASE).post('/POReceiving/PO/CreatePO/0').query({ vendorId: '61465' })
      .reply(200, { data: { Id: 1001, PONo: 'PO-3' } });
    nock(BASE).post('/POReceiving/PO/CreatePOLineItem/0').query(true)
      .reply(200, { data: { Id: 5050 } });
    nock(BASE).post('/POReceiving/PO/CreatePOReleaseItem/0').query(true)
      .reply(500, 'release failed');
    nock(BASE).get('/POReceiving/PO/PO/1001').reply(200, { data: { Id: 1001 } });
    nock(BASE).post('/POReceiving/PO/UpdatePO/1001').reply(200, { data: {} });

    const client = createDwClient({ baseUrl: BASE });
    client.setAuthToken('t');
    const result = await client.po.createPurchaseOrder({
      vendorId: 61465,
      items: [{ arInvtId: 100, quantity: 5 }],
      approverBadge: '001',
    });
    expect(result.poId).toBe(1001);
    expect(result.approved).toBe(true);
    expect(result.lineItems[0]!.success).toBe(false);
    expect(result.lineItems[0]!.poDetailId).toBe(5050);
    expect(result.lineItems[0]!.error).toMatch(/CreatePOReleaseItem threw/);
  });

  it('throws if CreatePO returns no Id', async () => {
    nock(BASE).post('/POReceiving/PO/CreatePO/0').query({ vendorId: '61465' })
      .reply(200, { data: {} });

    const client = createDwClient({ baseUrl: BASE });
    client.setAuthToken('t');
    await expect(
      client.po.createPurchaseOrder({ vendorId: 61465, items: [{ arInvtId: 100, quantity: 1 }], approverBadge: '001' }),
    ).rejects.toThrow('CreatePO returned no Id');
  });

  it('marks release as failure when DW returns 200 with no Id', async () => {
    nock(BASE).post('/POReceiving/PO/CreatePO/0').query({ vendorId: '61465' })
      .reply(200, { data: { Id: 1000, PONo: 'PO-X' } });
    nock(BASE).post('/POReceiving/PO/CreatePOLineItem/0').query(true)
      .reply(200, { data: { Id: 5050 } });
    nock(BASE).post('/POReceiving/PO/CreatePOReleaseItem/0').query(true)
      .reply(200, { data: { something: 'unexpected' } });   // 200 but no Id
    nock(BASE).get('/POReceiving/PO/PO/1000').reply(200, { data: { Id: 1000 } });
    nock(BASE).post('/POReceiving/PO/UpdatePO/1000').reply(200, { data: {} });

    const client = createDwClient({ baseUrl: BASE });
    client.setAuthToken('t');
    const result = await client.po.createPurchaseOrder({
      vendorId: 61465,
      items: [{ arInvtId: 100, quantity: 5 }],
      approverBadge: '001',
    });
    expect(result.poId).toBe(1000);
    expect(result.approved).toBe(true);
    expect(result.lineItems[0]!.success).toBe(false);
    expect(result.lineItems[0]!.poDetailId).toBe(5050);
    expect(result.lineItems[0]!.error).toMatch(/no Id/);
  });

  it('returns approved=false with approvalError when UpdatePO fails (FK or other)', async () => {
    nock(BASE).post('/POReceiving/PO/CreatePO/0').query({ vendorId: '61465' })
      .reply(200, { data: { Id: 2000, PONo: 'PO-Y' } });
    nock(BASE).post('/POReceiving/PO/CreatePOLineItem/0').query(true)
      .reply(200, { data: { Id: 6001 } });
    nock(BASE).post('/POReceiving/PO/CreatePOReleaseItem/0').query(true)
      .reply(200, { data: { Id: 8001 } });
    nock(BASE).get('/POReceiving/PO/PO/2000').reply(200, { data: { Id: 2000 } });
    nock(BASE).post('/POReceiving/PO/UpdatePO/2000').reply(500, 'approval failed');

    const client = createDwClient({ baseUrl: BASE });
    client.setAuthToken('t');
    const result = await client.po.createPurchaseOrder({
      vendorId: 61465,
      items: [{ arInvtId: 100, quantity: 5 }],
      approverBadge: '001',
    });
    expect(result.poId).toBe(2000);
    expect(result.approved).toBe(false);
    expect(result.approvalError).toBeTruthy();
    expect(result.lineItems[0]!.success).toBe(true);
  });
});
