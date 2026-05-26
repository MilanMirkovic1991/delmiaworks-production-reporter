import { AxiosInstance } from 'axios';

export type POLineItemResult = {
  arInvtId: number;
  quantity: number;
  success: boolean;
  poDetailId?: number;
  releaseId?: number;
  error?: string;
};

export type CreatePOResult = {
  poId: number;
  poNo: string | null;
  lineItems: POLineItemResult[];
};

function todayIso(): string {
  // YYYY-MM-DD with no time component is accepted by DW's date parser
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export function makePOApi(http: AxiosInstance) {
  return {
    async createPurchaseOrder(input: {
      vendorId: number;
      items: Array<{ arInvtId: number; quantity: number }>;
    }): Promise<CreatePOResult> {
      // 1. Create the PO header
      const createRes = await http.post(`/POReceiving/PO/CreatePO/0?vendorId=${input.vendorId}`, {});
      const poBody = createRes.data?.data ?? createRes.data;
      const poId = Number(poBody?.Id ?? poBody?.ID ?? 0);
      const poNo = poBody?.PONo ? String(poBody.PONo) : null;
      if (!Number.isFinite(poId) || poId <= 0) {
        throw new Error(`CreatePO returned no Id: ${JSON.stringify(poBody)}`);
      }

      const requestDate = todayIso();
      const promiseDate = requestDate;

      // 2. For each item: create line item, then release item with full qty and today's date
      const lineResults = await Promise.all(input.items.map(async (it): Promise<POLineItemResult> => {
        try {
          const lineUrl = `/POReceiving/PO/CreatePOLineItem/0?arinvtId=${it.arInvtId}&poId=${poId}&quantity=${it.quantity}`;
          const lineRes = await http.post(lineUrl, {});
          const lineBody = lineRes.data?.data ?? lineRes.data;
          const poDetailId = Number(lineBody?.Id ?? lineBody?.ID ?? 0);
          if (!Number.isFinite(poDetailId) || poDetailId <= 0) {
            return {
              arInvtId: it.arInvtId, quantity: it.quantity, success: false,
              error: `CreatePOLineItem returned no Id: ${JSON.stringify(lineBody)}`,
            };
          }

          // Create release row in PO_RELEASES with the full quantity and today's dates
          try {
            const releaseUrl = `/POReceiving/PO/CreatePOReleaseItem/0?poDetailId=${poDetailId}&quantity=${it.quantity}&requestDate=${encodeURIComponent(requestDate)}&promiseDate=${encodeURIComponent(promiseDate)}`;
            const releaseRes = await http.post(releaseUrl, {});
            const releaseBody = releaseRes.data?.data ?? releaseRes.data;
            const releaseId = Number(releaseBody?.Id ?? releaseBody?.ID ?? 0);
            return {
              arInvtId: it.arInvtId, quantity: it.quantity, success: true,
              poDetailId,
              releaseId: Number.isFinite(releaseId) && releaseId > 0 ? releaseId : undefined,
            };
          } catch (releaseErr: unknown) {
            const releaseMsg = (releaseErr && typeof releaseErr === 'object' && 'message' in releaseErr) ? String((releaseErr as { message: unknown }).message) : 'unknown';
            // Line item created, but release failed - partial success
            return {
              arInvtId: it.arInvtId, quantity: it.quantity, success: false,
              poDetailId,
              error: `Line item OK (id=${poDetailId}) but PO_RELEASES creation failed: ${releaseMsg}`,
            };
          }
        } catch (lineErr: unknown) {
          const msg = (lineErr && typeof lineErr === 'object' && 'message' in lineErr) ? String((lineErr as { message: unknown }).message) : 'unknown error';
          return { arInvtId: it.arInvtId, quantity: it.quantity, success: false, error: msg };
        }
      }));

      return { poId, poNo, lineItems: lineResults };
    },
  };
}
