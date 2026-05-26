import { AxiosInstance } from 'axios';
import { logger } from '../logger.js';

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
  approved: boolean;
  approvalError?: string;
  lineItems: POLineItemResult[];
};

function todayIso(): string {
  // ISO datetime with zero time component - DW accepts both date-only and full
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}T00:00:00`;
}

export function makePOApi(http: AxiosInstance) {
  return {
    async createPurchaseOrder(input: {
      vendorId: number;
      items: Array<{ arInvtId: number; quantity: number }>;
      approverUsername: string;
    }): Promise<CreatePOResult> {
      // 1. Create the PO header
      const createRes = await http.post(`/POReceiving/PO/CreatePO/0?vendorId=${input.vendorId}`, {});
      const poCreateBody = createRes.data?.data ?? createRes.data;
      const poId = Number(poCreateBody?.Id ?? poCreateBody?.ID ?? 0);
      const poNo = poCreateBody?.PONo ? String(poCreateBody.PONo) : null;
      if (!Number.isFinite(poId) || poId <= 0) {
        throw new Error(`CreatePO returned no Id: ${JSON.stringify(poCreateBody)}`);
      }
      logger.info({ poId, poNo, vendorId: input.vendorId }, 'PO header created');

      const requestDate = todayIso();
      const promiseDate = requestDate;

      // 2. For each item: create line item, then release item
      const lineResults = await Promise.all(input.items.map(async (it): Promise<POLineItemResult> => {
        try {
          const lineUrl = `/POReceiving/PO/CreatePOLineItem/0?arinvtId=${it.arInvtId}&poId=${poId}&quantity=${it.quantity}`;
          const lineRes = await http.post(lineUrl, {});
          const lineBody = lineRes.data?.data ?? lineRes.data;
          const poDetailId = Number(lineBody?.Id ?? lineBody?.ID ?? 0);
          if (!Number.isFinite(poDetailId) || poDetailId <= 0) {
            return {
              arInvtId: it.arInvtId, quantity: it.quantity, success: false,
              error: `CreatePOLineItem returned no Id. Body: ${JSON.stringify(lineBody)}`,
            };
          }
          logger.info({ poDetailId, arInvtId: it.arInvtId, quantity: it.quantity }, 'PO line item created');

          // Strict release creation
          try {
            const releaseUrl = `/POReceiving/PO/CreatePOReleaseItem/0?poDetailId=${poDetailId}&quantity=${it.quantity}&requestDate=${encodeURIComponent(requestDate)}&promiseDate=${encodeURIComponent(promiseDate)}`;
            const releaseRes = await http.post(releaseUrl, {});
            const releaseBody = releaseRes.data?.data ?? releaseRes.data;
            const releaseId = Number(releaseBody?.Id ?? releaseBody?.ID ?? 0);
            logger.info({ poDetailId, releaseBody }, 'CreatePOReleaseItem response');
            if (!Number.isFinite(releaseId) || releaseId <= 0) {
              return {
                arInvtId: it.arInvtId, quantity: it.quantity, success: false,
                poDetailId,
                error: `CreatePOReleaseItem returned no Id. Body: ${JSON.stringify(releaseBody)}`,
              };
            }
            return {
              arInvtId: it.arInvtId, quantity: it.quantity, success: true,
              poDetailId, releaseId,
            };
          } catch (releaseErr: unknown) {
            const msg = (releaseErr && typeof releaseErr === 'object' && 'message' in releaseErr) ? String((releaseErr as { message: unknown }).message) : 'unknown';
            return {
              arInvtId: it.arInvtId, quantity: it.quantity, success: false,
              poDetailId,
              error: `Line item OK (id=${poDetailId}) but CreatePOReleaseItem threw: ${msg}`,
            };
          }
        } catch (lineErr: unknown) {
          const msg = (lineErr && typeof lineErr === 'object' && 'message' in lineErr) ? String((lineErr as { message: unknown }).message) : 'unknown error';
          return { arInvtId: it.arInvtId, quantity: it.quantity, success: false, error: msg };
        }
      }));

      // 3. Approve the PO: fetch full body, set ApprovedBy, update.
      let approved = false;
      let approvalError: string | undefined;
      try {
        const getRes = await http.get(`/POReceiving/PO/PO/${poId}`);
        const poBody = getRes.data?.data ?? getRes.data;
        if (poBody && typeof poBody === 'object') {
          const updated = { ...poBody, ApprovedBy: input.approverUsername };
          await http.post(`/POReceiving/PO/UpdatePO/${poId}`, updated);
          approved = true;
          logger.info({ poId, approver: input.approverUsername }, 'PO approved');
        } else {
          approvalError = `GET PO/${poId} returned no body`;
        }
      } catch (e: unknown) {
        approvalError = (e && typeof e === 'object' && 'message' in e) ? String((e as { message: unknown }).message) : 'unknown';
        logger.error({ poId, approvalError }, 'PO approval failed');
      }

      return { poId, poNo, approved, approvalError, lineItems: lineResults };
    },
  };
}
