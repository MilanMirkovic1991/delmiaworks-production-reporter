import { AxiosInstance } from 'axios';

export type CreatedPO = {
  poId: number;
  poNo: string | null;
};

export type POLineItemResult = {
  arInvtId: number;
  quantity: number;
  success: boolean;
  poDetailId?: number;
  error?: string;
};

export type CreatePOResult = {
  poId: number;
  poNo: string | null;
  lineItems: POLineItemResult[];
};

export function makePOApi(http: AxiosInstance) {
  return {
    /**
     * Creates a single PO header for the given vendor, then adds each item
     * as a line item. Returns the PO ID/number and per-item success status.
     * All items go onto ONE PO.
     */
    async createPurchaseOrder(input: {
      vendorId: number;
      items: Array<{ arInvtId: number; quantity: number }>;
    }): Promise<CreatePOResult> {
      // Step 1: Create the PO header
      const createRes = await http.post(
        `/POReceiving/PO/CreatePO/0?vendorId=${input.vendorId}`,
        {},
      );
      const poBody = createRes.data?.data ?? createRes.data;
      const poId = Number(poBody?.Id ?? poBody?.ID ?? 0);
      const poNo = poBody?.PONo ? String(poBody.PONo) : null;
      if (!Number.isFinite(poId) || poId <= 0) {
        throw new Error(`CreatePO returned no Id: ${JSON.stringify(poBody)}`);
      }

      // Step 2: Add each line item in parallel
      const lineResults = await Promise.all(input.items.map(async (it): Promise<POLineItemResult> => {
        try {
          const url = `/POReceiving/PO/CreatePOLineItem/0?arinvtId=${it.arInvtId}&poId=${poId}&quantity=${it.quantity}`;
          const res = await http.post(url, {});
          const body = res.data?.data ?? res.data;
          const poDetailId = Number(body?.Id ?? body?.ID ?? 0);
          return { arInvtId: it.arInvtId, quantity: it.quantity, success: true, poDetailId };
        } catch (e: unknown) {
          const msg = (e && typeof e === 'object' && 'message' in e) ? String((e as { message: unknown }).message) : 'unknown error';
          return { arInvtId: it.arInvtId, quantity: it.quantity, success: false, error: msg };
        }
      }));

      return { poId, poNo, lineItems: lineResults };
    },
  };
}
