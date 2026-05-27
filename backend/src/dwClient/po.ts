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

export type ReceiptResult = {
  poDetailId: number;
  poReleaseId: number;
  arInvtId: number;
  itemNumber: string;
  qtyReceived: number;
  lotNo?: number;
  success: boolean;
  poReceiptId?: number;
  fgMultiId?: number;
  masterLabelId?: number;
  error?: string;
};

export type ReceivePOResult = {
  poId: number;
  receipts: ReceiptResult[];
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

    /**
     * Receives all line items of a PO at full release quantity onto the default
     * receiving location. For every (lineItem, release) pair we:
     *   1. POST CreatePOReceipt        — creates the PO_RECEIPTS row
     *   2. POST PostPOReceiptAndUpdateMasterLabel — posts the receipt, creates FGMULTI,
     *      and writes the FgMultiId back into MASTER_LABEL (DW handles the linkage).
     *
     * Sequential, like createPurchaseOrder, to avoid Oracle SEQ races on receipt IDs.
     */
    async receivePO(input: { poId: number; username: string }): Promise<ReceivePOResult> {
      // 1. Fetch PO header to get PoNo (needed by UpdatePoReceiptsLabelsPlan)
      let poNo = '';
      try {
        const r = await http.get(`/POReceiving/PO/PO/${input.poId}`);
        const body = r.data?.data ?? r.data ?? {};
        poNo = String((body as Record<string, unknown>).PoNo ?? (body as Record<string, unknown>).PONo ?? (body as Record<string, unknown>).PoNumber ?? '');
      } catch {
        // non-fatal; some DW configs don't require PoNo in the label plan
      }

      // 2. Fetch all PO line items
      const linesRes = await http.get(`/POReceiving/PO/POLineItems/${input.poId}`);
      const lineRows = (linesRes.data?.data ?? linesRes.data ?? []) as Record<string, unknown>[];
      const lines = (Array.isArray(lineRows) ? lineRows : []).map(r => ({
        poDetailId: Number(r.Id ?? r.ID ?? 0),
        arInvtId: Number(r.ArInvtId ?? r.ARInvtId ?? r.ArinvtId ?? 0),
        itemNumber: String(r.ItemNumber ?? r.ItemNo ?? ''),
        quantity: Number(r.Quantity ?? r.Qty ?? 0),
      })).filter(l => l.poDetailId > 0);

      logger.info({ poId: input.poId, poNo, lineCount: lines.length }, 'receivePO: fetched header + line items');

      const receipts: ReceiptResult[] = [];
      const dateReceived = todayIso();
      const comment = `Automatski prijem na default lokaciju`;

      // 3. For each (line, release) pair:
      //    a. Compute next lot (max+1 across existing FGMULTI rows for this arInvtId)
      //    b. CreatePOReceipt
      //    c. UpdatePoReceiptsLabelsPlan with lot
      //    d. PostPOReceiptAndUpdateMasterLabel
      for (const line of lines) {
        // Compute max lot used so far across all FGMULTI rows for this arInvtId.
        // Lot numbers in this app are pure integers, per user spec ("redni broj prijema").
        let maxLot = 0;
        try {
          const r = await http.get(`/Manufacturing/Inventory/LocationsForItem/${line.arInvtId}`);
          const data = r.data?.data ?? r.data ?? [];
          const rows = Array.isArray(data) ? data : [];
          for (const lr of rows) {
            const raw = String((lr as Record<string, unknown>).LotNo ?? '').trim();
            const n = Number.parseInt(raw, 10);
            if (Number.isFinite(n) && n > maxLot) maxLot = n;
          }
        } catch {
          // No existing locations or fetch failed: treat as 0 → first lot is 1
        }

        let releaseRows: Record<string, unknown>[] = [];
        try {
          const r = await http.get(`/POReceiving/PO/POReleaseItems/0`, {
            params: { poLineItemId: line.poDetailId },
          });
          const data = r.data?.data ?? r.data ?? [];
          releaseRows = Array.isArray(data) ? data : [];
        } catch (e: unknown) {
          const msg = (e && typeof e === 'object' && 'message' in e) ? String((e as { message: unknown }).message) : 'unknown';
          receipts.push({
            poDetailId: line.poDetailId, poReleaseId: 0, arInvtId: line.arInvtId,
            itemNumber: line.itemNumber, qtyReceived: 0, success: false,
            error: `POReleaseItems fetch failed: ${msg}`,
          });
          continue;
        }

        for (const rr of releaseRows) {
          const poReleaseId = Number(rr.Id ?? rr.ID ?? 0);
          const qty = Number(rr.Qty ?? rr.Quantity ?? 0);
          if (poReleaseId <= 0 || qty <= 0) continue;

          const lotNo = maxLot + 1;

          // a. CreatePOReceipt
          let poReceiptId = 0;
          try {
            const createUrl = `/POReceiving/PO/CreatePOReceipt/0?poDetailId=${line.poDetailId}&poReleaseId=${poReleaseId}&qtyReceived=${qty}&dateReceived=${encodeURIComponent(dateReceived)}&comment=${encodeURIComponent(comment)}&username=${encodeURIComponent(input.username)}`;
            const cRes = await http.post(createUrl, {});
            const body = cRes.data?.data ?? cRes.data;
            poReceiptId = Number(body?.Id ?? body?.ID ?? 0);
            if (!Number.isFinite(poReceiptId) || poReceiptId <= 0) {
              receipts.push({
                poDetailId: line.poDetailId, poReleaseId, arInvtId: line.arInvtId,
                itemNumber: line.itemNumber, qtyReceived: qty, lotNo, success: false,
                error: `CreatePOReceipt returned no Id. Body: ${JSON.stringify(body)}`,
              });
              continue;
            }
          } catch (e: unknown) {
            const msg = (e && typeof e === 'object' && 'message' in e) ? String((e as { message: unknown }).message) : 'unknown';
            receipts.push({
              poDetailId: line.poDetailId, poReleaseId, arInvtId: line.arInvtId,
              itemNumber: line.itemNumber, qtyReceived: qty, lotNo, success: false,
              error: `CreatePOReceipt failed: ${msg}`,
            });
            continue;
          }

          // b. "Prepare for Multiple Labels" — CreatePoReceiptsLabelsPlan inserts the label-plan
          //    row for this receipt. Required for Serialized Inventory Control items.
          //    URL uses {id}=0 (Oracle assigns the row Id); the BODY carries all the actual data,
          //    most importantly PoReceiptId — otherwise DW throws FK_PO_RECEI_REF_22293_PO_RECEI.
          //    LmLabelsId hardcoded to 14 per user spec (ARINVT.LM_LABELS_ID is null for all items
          //    in this install).
          try {
            const prepBody = {
              PoReceiptId: poReceiptId,
              ArInvtId: line.arInvtId,
              LotNo: String(lotNo),
              LabelCount: 1,         // one bulk label per receipt, NOT one per unit
              Qty: qty,
              Serial: true,          // Serialized Inventory Control
              LmLabelsId: 14,        // label template id when ARINVT.LM_LABELS_ID is null
            };
            await http.post(`/POReceiving/PO/CreatePoReceiptsLabelsPlan/0`, prepBody);
          } catch (e: unknown) {
            const msg = (e && typeof e === 'object' && 'message' in e) ? String((e as { message: unknown }).message) : 'unknown';
            receipts.push({
              poDetailId: line.poDetailId, poReleaseId, arInvtId: line.arInvtId,
              itemNumber: line.itemNumber, qtyReceived: qty, lotNo, success: false,
              poReceiptId,
              error: `CreatePoReceiptsLabelsPlan failed: ${msg}`,
            });
            continue;
          }

          // c. PostPOReceiptAndUpdateMasterLabel — creates FGMULTI + writes FgMultiId into MASTER_LABEL
          try {
            const postUrl = `/POReceiving/PO/PostPOReceiptAndUpdateMasterLabel/0?poReceiptId=${poReceiptId}`;
            const pRes = await http.post(postUrl, {});
            const body = pRes.data?.data ?? pRes.data;
            const fgMultiId = Number(body?.FgMultiId ?? body?.FGMultiId ?? body?.fgMultiId ?? 0) || undefined;
            const masterLabelId = Number(body?.MasterLabelId ?? body?.MasterLabel?.Id ?? body?.masterLabelId ?? 0) || undefined;
            receipts.push({
              poDetailId: line.poDetailId, poReleaseId, arInvtId: line.arInvtId,
              itemNumber: line.itemNumber, qtyReceived: qty, lotNo, success: true,
              poReceiptId, fgMultiId, masterLabelId,
            });
            // Only increment lot after a fully successful receipt — failed attempts shouldn't burn a lot number
            maxLot = lotNo;
          } catch (e: unknown) {
            const msg = (e && typeof e === 'object' && 'message' in e) ? String((e as { message: unknown }).message) : 'unknown';
            receipts.push({
              poDetailId: line.poDetailId, poReleaseId, arInvtId: line.arInvtId,
              itemNumber: line.itemNumber, qtyReceived: qty, lotNo, success: false,
              poReceiptId,
              error: `PostPOReceiptAndUpdateMasterLabel failed: ${msg}`,
            });
          }
        }
      }

      const successCount = receipts.filter(r => r.success).length;
      logger.info({ poId: input.poId, successCount, totalCount: receipts.length }, 'receivePO done');

      return { poId: input.poId, receipts };
    },
  };
}
