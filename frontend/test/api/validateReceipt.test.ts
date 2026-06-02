import { describe, it, expect, vi, afterEach } from 'vitest';
import { api } from '../../src/api/client.js';

describe('api.validateReceipt', () => {
  afterEach(() => { vi.restoreAllMocks(); });

  it('POSTs the items to the receive-validate path and returns the parsed body', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ poId: 999, warnings: [{ kind: 'NO_RECIPE', message: 'x', items: [{ arInvtId: 100, itemNumber: 'P-100' }] }] }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }),
    );

    const items = [{ arInvtId: 100, itemNumber: 'P-100', quantity: 5 }];
    const out = await api.validateReceipt(999, items);

    expect(out.poId).toBe(999);
    expect(out.warnings[0]!.kind).toBe('NO_RECIPE');
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('/api/po/999/receive-validate');
    expect(init!.method).toBe('POST');
    expect(JSON.parse(init!.body as string)).toEqual({ items });
  });
});
