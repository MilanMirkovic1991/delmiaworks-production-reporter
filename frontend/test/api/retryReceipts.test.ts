import { describe, it, expect, vi, afterEach } from 'vitest';
import { api } from '../../src/api/client.js';

describe('api.retryReceipts', () => {
  afterEach(() => { vi.restoreAllMocks(); });

  it('POSTs the rows to the receive-retry path and returns the parsed body', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ poId: 999, receipts: [{ poDetailId: 5001, poReleaseId: 7001, arInvtId: 100, itemNumber: 'A', qtyReceived: 5, success: true }] }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }),
    );

    const rows = [{ poDetailId: 5001, poReleaseId: 7001, arInvtId: 100, itemNumber: 'A', qtyReceived: 5, poReceiptId: 9001, priorError: 'PostPOReceiptAndUpdateMasterLabel failed: x' }];
    const out = await api.retryReceipts(999, rows);

    expect(out.poId).toBe(999);
    expect(out.receipts[0]!.success).toBe(true);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('/api/po/999/receive-retry');
    expect(init!.method).toBe('POST');
    expect(JSON.parse(init!.body as string)).toEqual({ rows });
  });
});
