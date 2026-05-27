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

  it('receivePO: writes lot=max+1 per item via CreatePoReceiptsLabelsPlan body before posting receipt', async () => {
    // PO 999 has 2 line items, each with 1 release.
    nock(BASE).get('/POReceiving/PO/PO/999')
      .reply(200, { data: { Id: 999, PoNo: 'PO-TEST-1' } });
    nock(BASE).get('/POReceiving/PO/POLineItems/999')
      .reply(200, { data: [
        { Id: 5001, ArInvtId: 100, ItemNumber: 'PART-A', Quantity: 5 },
        { Id: 5002, ArInvtId: 101, ItemNumber: 'PART-B', Quantity: 10 },
      ]});
    // PART-A has 2 existing locations with lots 3 and 5 → next is 6
    nock(BASE).get('/Manufacturing/Inventory/LocationsForItem/100')
      .reply(200, { data: [{ LotNo: '3' }, { LotNo: '5' }] });
    // PART-B has no existing locations → next is 1
    nock(BASE).get('/Manufacturing/Inventory/LocationsForItem/101')
      .reply(200, { data: [] });
    nock(BASE).get('/POReceiving/PO/POReleaseItems/0')
      .query(q => Number(q.poLineItemId) === 5001)
      .reply(200, { data: [{ Id: 7001, PoDetailId: 5001, Qty: 5 }] });
    nock(BASE).get('/POReceiving/PO/POReleaseItems/0')
      .query(q => Number(q.poLineItemId) === 5002)
      .reply(200, { data: [{ Id: 7002, PoDetailId: 5002, Qty: 10 }] });
    // CreatePOReceipt per release
    nock(BASE).post('/POReceiving/PO/CreatePOReceipt/0')
      .query(q => Number(q.poDetailId) === 5001 && Number(q.poReleaseId) === 7001 && Number(q.qtyReceived) === 5)
      .reply(200, { data: { Id: 9001 } });
    nock(BASE).post('/POReceiving/PO/CreatePOReceipt/0')
      .query(q => Number(q.poDetailId) === 5002 && Number(q.poReleaseId) === 7002 && Number(q.qtyReceived) === 10)
      .reply(200, { data: { Id: 9002 } });
    // CreatePoReceiptsLabelsPlan with full body (PoReceiptId in body, NOT in URL).
    // URL uses /0; body carries PoReceiptId, ArInvtId, LotNo, LabelCount=1, Qty, Serial=true,
    // LmLabelsId=14 (default when ARINVT.LM_LABELS_ID null).
    nock(BASE).post('/POReceiving/PO/CreatePoReceiptsLabelsPlan/0', (body) => {
      const b = body as { PoReceiptId?: number; ArInvtId?: number; LotNo?: string; LabelCount?: number; Qty?: number; Serial?: boolean; LmLabelsId?: number };
      return b.PoReceiptId === 9001 && b.ArInvtId === 100 && b.LotNo === '6' && b.LabelCount === 1 && b.Qty === 5 && b.Serial === true && b.LmLabelsId === 14;
    }).reply(200, { data: {} });
    nock(BASE).post('/POReceiving/PO/CreatePoReceiptsLabelsPlan/0', (body) => {
      const b = body as { PoReceiptId?: number; ArInvtId?: number; LotNo?: string; Qty?: number };
      return b.PoReceiptId === 9002 && b.ArInvtId === 101 && b.LotNo === '1' && b.Qty === 10;
    }).reply(200, { data: {} });
    // Post + master label per receipt
    nock(BASE).post('/POReceiving/PO/PostPOReceiptAndUpdateMasterLabel/0')
      .query(q => Number(q.poReceiptId) === 9001)
      .reply(200, { data: { FgMultiId: 4001, MasterLabelId: 8001 } });
    nock(BASE).post('/POReceiving/PO/PostPOReceiptAndUpdateMasterLabel/0')
      .query(q => Number(q.poReceiptId) === 9002)
      .reply(200, { data: { FgMultiId: 4002, MasterLabelId: 8002 } });

    const client = createDwClient({ baseUrl: BASE });
    client.setAuthToken('t');
    const result = await client.po.receivePO({ poId: 999, username: 'IQMS' });
    expect(result.poId).toBe(999);
    expect(result.receipts).toHaveLength(2);
    expect(result.receipts.every(r => r.success)).toBe(true);
    expect(result.receipts[0]).toMatchObject({
      poDetailId: 5001, poReleaseId: 7001, qtyReceived: 5, lotNo: 6,
      poReceiptId: 9001, fgMultiId: 4001, masterLabelId: 8001,
    });
    expect(result.receipts[1]).toMatchObject({
      poDetailId: 5002, poReleaseId: 7002, qtyReceived: 10, lotNo: 1,
      poReceiptId: 9002, fgMultiId: 4002, masterLabelId: 8002,
    });
  });

  it('receivePO: multiple releases for the same item get successive lot numbers (1, 2, 3...)', async () => {
    nock(BASE).get('/POReceiving/PO/PO/1004').reply(200, { data: { Id: 1004, PoNo: 'PO-LOT' } });
    nock(BASE).get('/POReceiving/PO/POLineItems/1004')
      .reply(200, { data: [{ Id: 5001, ArInvtId: 100, ItemNumber: 'PART-A', Quantity: 30 }] });
    // No prior locations → start at lot 1
    nock(BASE).get('/Manufacturing/Inventory/LocationsForItem/100').reply(200, { data: [] });
    // Three releases for the same line
    nock(BASE).get('/POReceiving/PO/POReleaseItems/0').query(true)
      .reply(200, { data: [
        { Id: 7001, PoDetailId: 5001, Qty: 10 },
        { Id: 7002, PoDetailId: 5001, Qty: 10 },
        { Id: 7003, PoDetailId: 5001, Qty: 10 },
      ]});
    nock(BASE).post('/POReceiving/PO/CreatePOReceipt/0').query(q => Number(q.poReleaseId) === 7001).reply(200, { data: { Id: 9001 } });
    nock(BASE).post('/POReceiving/PO/CreatePOReceipt/0').query(q => Number(q.poReleaseId) === 7002).reply(200, { data: { Id: 9002 } });
    nock(BASE).post('/POReceiving/PO/CreatePOReceipt/0').query(q => Number(q.poReleaseId) === 7003).reply(200, { data: { Id: 9003 } });
    // Lot numbers should be 1, 2, 3 across the three releases
    nock(BASE).post('/POReceiving/PO/CreatePoReceiptsLabelsPlan/0', (b) => (b as { PoReceiptId?: number; LotNo?: string }).PoReceiptId === 9001 && (b as { LotNo?: string }).LotNo === '1').reply(200, { data: {} });
    nock(BASE).post('/POReceiving/PO/CreatePoReceiptsLabelsPlan/0', (b) => (b as { PoReceiptId?: number; LotNo?: string }).PoReceiptId === 9002 && (b as { LotNo?: string }).LotNo === '2').reply(200, { data: {} });
    nock(BASE).post('/POReceiving/PO/CreatePoReceiptsLabelsPlan/0', (b) => (b as { PoReceiptId?: number; LotNo?: string }).PoReceiptId === 9003 && (b as { LotNo?: string }).LotNo === '3').reply(200, { data: {} });
    nock(BASE).post('/POReceiving/PO/PostPOReceiptAndUpdateMasterLabel/0').query(q => Number(q.poReceiptId) === 9001).reply(200, { data: { FgMultiId: 4001 } });
    nock(BASE).post('/POReceiving/PO/PostPOReceiptAndUpdateMasterLabel/0').query(q => Number(q.poReceiptId) === 9002).reply(200, { data: { FgMultiId: 4002 } });
    nock(BASE).post('/POReceiving/PO/PostPOReceiptAndUpdateMasterLabel/0').query(q => Number(q.poReceiptId) === 9003).reply(200, { data: { FgMultiId: 4003 } });

    const client = createDwClient({ baseUrl: BASE });
    client.setAuthToken('t');
    const result = await client.po.receivePO({ poId: 1004, username: 'IQMS' });
    expect(result.receipts.map(r => r.lotNo)).toEqual([1, 2, 3]);
  });

  it('receivePO: failed Post does not burn a lot number (next release reuses it)', async () => {
    nock(BASE).get('/POReceiving/PO/PO/1005').reply(200, { data: { Id: 1005, PoNo: 'PO-X' } });
    nock(BASE).get('/POReceiving/PO/POLineItems/1005')
      .reply(200, { data: [{ Id: 5001, ArInvtId: 100, ItemNumber: 'PART-A', Quantity: 20 }] });
    nock(BASE).get('/Manufacturing/Inventory/LocationsForItem/100').reply(200, { data: [] });
    nock(BASE).get('/POReceiving/PO/POReleaseItems/0').query(true)
      .reply(200, { data: [
        { Id: 7001, PoDetailId: 5001, Qty: 10 },
        { Id: 7002, PoDetailId: 5001, Qty: 10 },
      ]});
    nock(BASE).post('/POReceiving/PO/CreatePOReceipt/0').query(q => Number(q.poReleaseId) === 7001).reply(200, { data: { Id: 9001 } });
    nock(BASE).post('/POReceiving/PO/CreatePOReceipt/0').query(q => Number(q.poReleaseId) === 7002).reply(200, { data: { Id: 9002 } });
    nock(BASE).post('/POReceiving/PO/CreatePoReceiptsLabelsPlan/0', (b) => (b as { PoReceiptId?: number; LotNo?: string }).PoReceiptId === 9001 && (b as { LotNo?: string }).LotNo === '1').reply(200, { data: {} });
    nock(BASE).post('/POReceiving/PO/CreatePoReceiptsLabelsPlan/0', (b) => (b as { PoReceiptId?: number; LotNo?: string }).PoReceiptId === 9002 && (b as { LotNo?: string }).LotNo === '1').reply(200, { data: {} });
    // First Post fails — lot 1 should NOT be considered used
    nock(BASE).post('/POReceiving/PO/PostPOReceiptAndUpdateMasterLabel/0').query(q => Number(q.poReceiptId) === 9001).reply(500, 'boom');
    // Second Post succeeds — should still get lot 1, not 2
    nock(BASE).post('/POReceiving/PO/PostPOReceiptAndUpdateMasterLabel/0').query(q => Number(q.poReceiptId) === 9002).reply(200, { data: { FgMultiId: 4002 } });

    const client = createDwClient({ baseUrl: BASE });
    client.setAuthToken('t');
    const result = await client.po.receivePO({ poId: 1005, username: 'IQMS' });
    expect(result.receipts).toHaveLength(2);
    expect(result.receipts[0]!.success).toBe(false);
    expect(result.receipts[0]!.lotNo).toBe(1);
    expect(result.receipts[1]!.success).toBe(true);
    expect(result.receipts[1]!.lotNo).toBe(1);
  });

  it('receivePO: records failure when CreatePOReceipt 500s, continues with rest', async () => {
    nock(BASE).get('/POReceiving/PO/PO/1000').reply(200, { data: { Id: 1000, PoNo: 'PO-2' } });
    nock(BASE).get('/POReceiving/PO/POLineItems/1000')
      .reply(200, { data: [
        { Id: 5001, ArInvtId: 100, ItemNumber: 'PART-A', Quantity: 5 },
        { Id: 5002, ArInvtId: 101, ItemNumber: 'PART-B', Quantity: 10 },
      ]});
    nock(BASE).get('/Manufacturing/Inventory/LocationsForItem/100').reply(200, { data: [] });
    nock(BASE).get('/Manufacturing/Inventory/LocationsForItem/101').reply(200, { data: [] });
    nock(BASE).get('/POReceiving/PO/POReleaseItems/0').query(q => Number(q.poLineItemId) === 5001)
      .reply(200, { data: [{ Id: 7001, PoDetailId: 5001, Qty: 5 }] });
    nock(BASE).get('/POReceiving/PO/POReleaseItems/0').query(q => Number(q.poLineItemId) === 5002)
      .reply(200, { data: [{ Id: 7002, PoDetailId: 5002, Qty: 10 }] });
    nock(BASE).post('/POReceiving/PO/CreatePOReceipt/0').query(q => Number(q.poReleaseId) === 7001)
      .reply(500, 'something broke');
    nock(BASE).post('/POReceiving/PO/CreatePOReceipt/0').query(q => Number(q.poReleaseId) === 7002)
      .reply(200, { data: { Id: 9002 } });
    nock(BASE).post('/POReceiving/PO/CreatePoReceiptsLabelsPlan/0', (b) => (b as { PoReceiptId?: number }).PoReceiptId === 9002).reply(200, { data: {} });
    nock(BASE).post('/POReceiving/PO/PostPOReceiptAndUpdateMasterLabel/0').query(q => Number(q.poReceiptId) === 9002)
      .reply(200, { data: { FgMultiId: 4002, MasterLabelId: 8002 } });

    const client = createDwClient({ baseUrl: BASE });
    client.setAuthToken('t');
    const result = await client.po.receivePO({ poId: 1000, username: 'IQMS' });
    expect(result.receipts).toHaveLength(2);
    expect(result.receipts[0]!.success).toBe(false);
    expect(result.receipts[0]!.error).toBeTruthy();
    expect(result.receipts[1]!.success).toBe(true);
    expect(result.receipts[1]!.poReceiptId).toBe(9002);
  });

  it('receivePO: records partial success when PostPOReceipt fails (receipt created but not posted)', async () => {
    nock(BASE).get('/POReceiving/PO/PO/1001').reply(200, { data: { Id: 1001, PoNo: 'PO-3' } });
    nock(BASE).get('/POReceiving/PO/POLineItems/1001')
      .reply(200, { data: [{ Id: 5001, ArInvtId: 100, ItemNumber: 'PART-A', Quantity: 5 }] });
    nock(BASE).get('/Manufacturing/Inventory/LocationsForItem/100').reply(200, { data: [] });
    nock(BASE).get('/POReceiving/PO/POReleaseItems/0').query(true)
      .reply(200, { data: [{ Id: 7001, PoDetailId: 5001, Qty: 5 }] });
    nock(BASE).post('/POReceiving/PO/CreatePOReceipt/0').query(true)
      .reply(200, { data: { Id: 9001 } });
    nock(BASE).post('/POReceiving/PO/CreatePoReceiptsLabelsPlan/0', (b) => (b as { PoReceiptId?: number }).PoReceiptId === 9001).reply(200, { data: {} });
    nock(BASE).post('/POReceiving/PO/PostPOReceiptAndUpdateMasterLabel/0').query(true)
      .reply(500, 'cannot post');

    const client = createDwClient({ baseUrl: BASE });
    client.setAuthToken('t');
    const result = await client.po.receivePO({ poId: 1001, username: 'IQMS' });
    expect(result.receipts[0]!.success).toBe(false);
    expect(result.receipts[0]!.poReceiptId).toBe(9001); // receipt WAS created
    expect(result.receipts[0]!.fgMultiId).toBeUndefined();
    expect(result.receipts[0]!.error).toMatch(/PostPOReceipt/);
  });

  it('receivePO: returns empty list when PO has no line items', async () => {
    nock(BASE).get('/POReceiving/PO/PO/1002').reply(200, { data: { Id: 1002, PoNo: '' } });
    nock(BASE).get('/POReceiving/PO/POLineItems/1002').reply(200, { data: [] });

    const client = createDwClient({ baseUrl: BASE });
    client.setAuthToken('t');
    const result = await client.po.receivePO({ poId: 1002, username: 'IQMS' });
    expect(result.poId).toBe(1002);
    expect(result.receipts).toEqual([]);
  });

  it('receivePO: handles line item with multiple releases (creates a receipt per release)', async () => {
    nock(BASE).get('/POReceiving/PO/PO/1003').reply(200, { data: { Id: 1003, PoNo: 'PO-MR' } });
    nock(BASE).get('/POReceiving/PO/POLineItems/1003')
      .reply(200, { data: [{ Id: 5001, ArInvtId: 100, ItemNumber: 'PART-A', Quantity: 15 }] });
    nock(BASE).get('/Manufacturing/Inventory/LocationsForItem/100').reply(200, { data: [] });
    nock(BASE).get('/POReceiving/PO/POReleaseItems/0').query(true)
      .reply(200, { data: [
        { Id: 7001, PoDetailId: 5001, Qty: 5 },
        { Id: 7002, PoDetailId: 5001, Qty: 10 },
      ]});
    nock(BASE).post('/POReceiving/PO/CreatePOReceipt/0').query(q => Number(q.poReleaseId) === 7001 && Number(q.qtyReceived) === 5)
      .reply(200, { data: { Id: 9001 } });
    nock(BASE).post('/POReceiving/PO/CreatePOReceipt/0').query(q => Number(q.poReleaseId) === 7002 && Number(q.qtyReceived) === 10)
      .reply(200, { data: { Id: 9002 } });
    nock(BASE).post('/POReceiving/PO/CreatePoReceiptsLabelsPlan/0', (b) => (b as { PoReceiptId?: number }).PoReceiptId === 9001).reply(200, { data: {} });
    nock(BASE).post('/POReceiving/PO/CreatePoReceiptsLabelsPlan/0', (b) => (b as { PoReceiptId?: number }).PoReceiptId === 9002).reply(200, { data: {} });
    nock(BASE).post('/POReceiving/PO/PostPOReceiptAndUpdateMasterLabel/0').query(q => Number(q.poReceiptId) === 9001)
      .reply(200, { data: { FgMultiId: 4001 } });
    nock(BASE).post('/POReceiving/PO/PostPOReceiptAndUpdateMasterLabel/0').query(q => Number(q.poReceiptId) === 9002)
      .reply(200, { data: { FgMultiId: 4002 } });

    const client = createDwClient({ baseUrl: BASE });
    client.setAuthToken('t');
    const result = await client.po.receivePO({ poId: 1003, username: 'IQMS' });
    expect(result.receipts).toHaveLength(2);
    expect(result.receipts[0]!.qtyReceived).toBe(5);
    expect(result.receipts[1]!.qtyReceived).toBe(10);
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
