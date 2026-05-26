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
      /**
       * PR_EMP badge number to use for ApprovedBy. Must reference a valid employee record
       * (DW enforces FK_PO_REF_11839_PR_EMP). Defaults to '001' if empty.
       */
      approverBadge: string;
    }): Promise<CreatePOResult> {
      // 1. Create the PO header
      const createRes = await http.post(`/POReceiving/PO/CreatePO/0?vendorId=${input.vendorId}`, {});
      const poCreateBody = createRes.data?.data ?? createRes.data;
      const poId = Number(poCreateBody?.Id ?? poCreateBody?.ID ?? 0);
      const poNo = poCreateBody?.PONo ? String(poCreateBody.PONo) : null;
      if (!Number.isFinite(poId) || poId <= 0) {
        throw new Error(`CreatePO returned no Id: ${JSON.stringify(poCreateBody)}`);
      }
      logger.info({ poId, poNo, vendorId: input.vendorId, itemCount: input.items.length }, 'PO header created — adding lines sequentially');

      const requestDate = todayIso();
      const promiseDate = requestDate;

      // 2. SEQUENTIAL line item + release creation.
      // Parallel triggered ORA-00001 on UNQ_PO_DETAIL_SEQ in this DW install,
      // so we serialise to let DW allocate sequence numbers safely.
      const lineResults: POLineItemResult[] = [];
      for (const it of input.items) {
        try {
          const lineUrl = `/POReceiving/PO/CreatePOLineItem/0?arinvtId=${it.arInvtId}&poId=${poId}&quantity=${it.quantity}`;
          const lineRes = await http.post(lineUrl, {});
          const lineBody = lineRes.data?.data ?? lineRes.data;
          const poDetailId = Number(lineBody?.Id ?? lineBody?.ID ?? 0);
          if (!Number.isFinite(poDetailId) || poDetailId <= 0) {
            lineResults.push({
              arInvtId: it.arInvtId, quantity: it.quantity, success: false,
              error: `CreatePOLineItem returned no Id. Body: ${JSON.stringify(lineBody)}`,
            });
            continue;
          }

          // Release item right after the line item — also sequential to keep semantics simple.
          try {
            const releaseUrl = `/POReceiving/PO/CreatePOReleaseItem/0?poDetailId=${poDetailId}&quantity=${it.quantity}&requestDate=${encodeURIComponent(requestDate)}&promiseDate=${encodeURIComponent(promiseDate)}`;
            const releaseRes = await http.post(releaseUrl, {});
            const releaseBody = releaseRes.data?.data ?? releaseRes.data;
            const releaseId = Number(releaseBody?.Id ?? releaseBody?.ID ?? 0);
            if (!Number.isFinite(releaseId) || releaseId <= 0) {
              lineResults.push({
                arInvtId: it.arInvtId, quantity: it.quantity, success: false,
                poDetailId,
                error: `CreatePOReleaseItem returned no Id. Body: ${JSON.stringify(releaseBody)}`,
              });
              continue;
            }
            lineResults.push({
              arInvtId: it.arInvtId, quantity: it.quantity, success: true,
              poDetailId, releaseId,
            });
          } catch (releaseErr: unknown) {
            const msg = (releaseErr && typeof releaseErr === 'object' && 'message' in releaseErr) ? String((releaseErr as { message: unknown }).message) : 'unknown';
            lineResults.push({
              arInvtId: it.arInvtId, quantity: it.quantity, success: false,
              poDetailId,
              error: `Line item OK (id=${poDetailId}) but CreatePOReleaseItem threw: ${msg}`,
            });
          }
        } catch (lineErr: unknown) {
          const msg = (lineErr && typeof lineErr === 'object' && 'message' in lineErr) ? String((lineErr as { message: unknown }).message) : 'unknown error';
          lineResults.push({ arInvtId: it.arInvtId, quantity: it.quantity, success: false, error: msg });
        }
      }

      const successCount = lineResults.filter(l => l.success).length;
      logger.info({ poId, successCount, totalCount: lineResults.length }, 'PO line items + releases done');

      // 3. Approval: GET PO body, set ApprovedBy (= valid PR_EMP badge), POST UpdatePO.
      // The badge must reference a real employee or DW rejects with ORA-02291 on FK_PO_REF_11839_PR_EMP.
      const badge = (input.approverBadge ?? '').trim() || '001';
      let approved = false;
      let approvalError: string | undefined;
      try {
        const getRes = await http.get(`/POReceiving/PO/PO/${poId}`);
        const poBody = getRes.data?.data ?? getRes.data;
        if (poBody && typeof poBody === 'object') {
          const updated = { ...poBody, ApprovedBy: badge };
          await http.post(`/POReceiving/PO/UpdatePO/${poId}`, updated);
          approved = true;
          logger.info({ poId, approverBadge: badge }, 'PO approved');
        } else {
          approvalError = `GET PO/${poId} returned no body`;
        }
      } catch (e: unknown) {
        approvalError = (e && typeof e === 'object' && 'message' in e) ? String((e as { message: unknown }).message) : 'unknown';
        logger.error({ poId, approvalError, approverBadge: badge }, 'PO approval failed — leaving as requisition');
      }

      return { poId, poNo, approved, approvalError, lineItems: lineResults };
    },
  };
}
