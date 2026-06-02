import { AxiosInstance } from 'axios';
import { logger } from '../logger.js';
import { makeInventoryApi } from './inventory.js';

export type POLineItemResult = {
  arInvtId: number;
  quantity: number;
  success: boolean;
  poDetailId?: number;
  releaseId?: number;
  /**
   * Sequence number within this PO, counted per arInvtId (1, 2, 3...).
   * Set via a follow-up UpdatePOReleaseItem call right after CreatePOReleaseItem,
   * because CreatePOReleaseItem doesn't accept Seq as a query parameter.
   * Undefined if the Update call failed (release still exists, just lacks Seq).
   */
  seq?: number;
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
  /** MASTER_LABEL.SERIALNO value sent to DW (7-digit zero-padded, derived from poReceiptId). */
  serialNo?: string;
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

/** Identifies a single failed receipt row to retry, carrying how far the prior attempt got. */
export type RetryReceiptInput = {
  poDetailId: number;
  poReleaseId: number;
  arInvtId: number;
  itemNumber: string;
  qtyReceived: number;
  username: string;
  /** Set iff CreatePOReceipt already succeeded in the prior attempt. */
  poReceiptId?: number;
  /** Error message from the prior attempt; its prefix tells us which step failed. */
  priorError?: string;
};

export type ResumeStage = 'fresh' | 'fromLabels' | 'fromPost';

/**
 * Decides where a retry should resume, using ONLY data carried on the failed row:
 *  - no poReceiptId  → CreatePOReceipt never succeeded → start fresh (all 3 steps)
 *  - poReceiptId set + error from the Post step → receipt + label already exist → only re-Post
 *  - poReceiptId set + anything else (label-plan step failed, or unknown) → re-do LabelsPlan + Post
 * This avoids creating a duplicate PO_RECEIPTS row (the orphan problem) without a
 * separate DW "does a receipt exist" query.
 */
export function resolveResumeStage(input: { poReceiptId?: number; priorError?: string }): ResumeStage {
  if (!input.poReceiptId || input.poReceiptId <= 0) return 'fresh';
  const err = input.priorError ?? '';
  if (err.startsWith('PostPOReceiptAndUpdateMasterLabel')) return 'fromPost';
  return 'fromLabels';
}

function todayIso(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}T00:00:00`;
}

/** Compact error-message extractor used by retryReceipt. */
function errMsg(e: unknown): string {
  return (e && typeof e === 'object' && 'message' in e) ? String((e as { message: unknown }).message) : 'unknown';
}

/**
 * Next Serial integer = max existing MASTER_LABEL.Serial + 1.
 * Mirrors the inline logic in receivePO; kept separate so receivePO stays untouched.
 */
async function readNextSerial(http: AxiosInstance): Promise<number> {
  let maxSerial = 0;
  try {
    const r = await http.get(`/Labels/PrintLabel/MasterLabels/0`);
    const data = r.data?.data ?? r.data ?? [];
    const rows = Array.isArray(data) ? data : [];
    for (const ml of rows) {
      const n = Number.parseInt(String((ml as Record<string, unknown>).Serial ?? '').trim(), 10);
      if (Number.isFinite(n) && n > maxSerial) maxSerial = n;
    }
  } catch { /* no labels yet → first serial is 1 */ }
  return maxSerial + 1;
}

/** Next lot integer for an item = max existing FGMULTI/Location LotNo + 1. */
async function readNextLot(http: AxiosInstance, arInvtId: number): Promise<number> {
  let maxLot = 0;
  try {
    const r = await http.get(`/Manufacturing/Inventory/LocationsForItem/${arInvtId}`);
    const data = r.data?.data ?? r.data ?? [];
    const rows = Array.isArray(data) ? data : [];
    for (const lr of rows) {
      const n = Number.parseInt(String((lr as Record<string, unknown>).LotNo ?? '').trim(), 10);
      if (Number.isFinite(n) && n > maxLot) maxLot = n;
    }
  } catch { /* none → first lot is 1 */ }
  return maxLot + 1;
}

/** One PO line to validate before receiving (group A/C inputs). */
export type ValidateItemInput = { arInvtId: number; itemNumber: string; quantity: number };

export type WarningKind = 'NO_RECIPE' | 'RECIPE_UNRELIABLE' | 'ORPHAN_LABEL' | 'SERIAL_FRACTIONAL';

/** A grouped pre-receive warning: one kind, a Serbian summary, and the affected items. */
export type ReceiptWarning = {
  kind: WarningKind;
  message: string;
  items: Array<{ arInvtId: number; itemNumber: string }>;
};

export type ValidateResult = { warnings: ReceiptWarning[] };

export function makePOApi(http: AxiosInstance) {
  // Reused by validateReceipt for per-item recipe/serial reads. receivePO is untouched.
  const inventory = makeInventoryApi(http);
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
      //
      // PO_RELEASES.Seq (the "redni broj" the user wants on each release) cannot
      // be passed to CreatePOReleaseItem — its signature is
      //   id_poDetailId_quantity_requestDate_promiseDate
      // (no Seq), confirmed via /Help/Api. So we set Seq via a follow-up
      // UpdatePOReleaseItem call. Seq counts per arInvtId within this PO:
      // first release for arInvtId X → 1, second → 2, etc.
      const lineResults: POLineItemResult[] = [];
      const seqByArInvt = new Map<number, number>();
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

            // Compute and persist Seq (redni broj) for this release.
            // Per-arInvtId counter starts at 1 the first time we see an arInvtId.
            const nextSeq = (seqByArInvt.get(it.arInvtId) ?? 0) + 1;
            seqByArInvt.set(it.arInvtId, nextSeq);
            let seqStored: number | undefined;
            try {
              await http.post(
                `/POReceiving/PO/UpdatePOReleaseItem/${releaseId}`,
                { ...(releaseBody as Record<string, unknown>), Seq: nextSeq },
              );
              seqStored = nextSeq;
            } catch (seqErr: unknown) {
              // Non-fatal: PO_RELEASES row exists, just without its sequence number.
              // The receive flow doesn't depend on Seq, so we log + continue.
              const msg = (seqErr && typeof seqErr === 'object' && 'message' in seqErr) ? String((seqErr as { message: unknown }).message) : 'unknown';
              logger.warn({ poId, releaseId, arInvtId: it.arInvtId, attemptedSeq: nextSeq, err: msg }, 'UpdatePOReleaseItem (Seq) failed — release row exists without Seq');
            }

            lineResults.push({
              arInvtId: it.arInvtId, quantity: it.quantity, success: true,
              poDetailId, releaseId, seq: seqStored,
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

      // 2.5. Find current max MASTER_LABEL.SERIALNO so we can allocate the next
      //      Serial value monotonically forward (user spec: 7-digit zero-padded,
      //      strictly sequential, never duplicates). DW enforces a unique constraint
      //      on AK_MASTER_LABEL_SERIAL — sending the same Serial twice = ORA-00001.
      //      /Labels/PrintLabel/MasterLabels/0 returns every MASTER_LABEL row in
      //      the system with a `Serial` field; we take the max numeric value as
      //      the high-water mark and increment from there.
      let serialCounter = 0;
      try {
        const r = await http.get(`/Labels/PrintLabel/MasterLabels/0`);
        const data = r.data?.data ?? r.data ?? [];
        const rows = Array.isArray(data) ? data : [];
        for (const ml of rows) {
          const raw = String((ml as Record<string, unknown>).Serial ?? '').trim();
          const n = Number.parseInt(raw, 10);
          if (Number.isFinite(n) && n > serialCounter) serialCounter = n;
        }
        logger.info({ poId: input.poId, currentMaxSerial: serialCounter, masterLabelCount: rows.length }, 'receivePO: read current max SERIALNO');
      } catch (e: unknown) {
        const msg = (e && typeof e === 'object' && 'message' in e) ? String((e as { message: unknown }).message) : 'unknown';
        logger.warn({ poId: input.poId, err: msg }, 'receivePO: could not read MASTER_LABEL max Serial — starting from 0');
      }

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

          // b. "Prepare for Multiple Labels" — CreatePoReceiptsLabelsPlan inserts a row
          //    in PO_RECEIPTS_LABEL_PLAN linking the receipt to a label slot.
          //    Per the actual DTO schema (POReceiptsLabelsPlan):
          //      - POReceiptsId (NOT PoReceiptId — that was the source of FK_PO_RECEI_REF_22293_PO_RECEI)
          //      - LabelsCount  (NOT LabelCount)
          //      - Qty
          //      - Serial is a string, NOT a boolean
          //    LotNo, ArInvtId, LmLabelsId are NOT part of this DTO; they live elsewhere.
          //
          //    Serial becomes MASTER_LABEL.SERIALNO. DW enforces AK_MASTER_LABEL_SERIAL
          //    (unique). Per user spec: 7-digit zero-padded, strictly sequential,
          //    counts forward indefinitely across all receipts. We picked up the
          //    current max from /Labels/PrintLabel/MasterLabels above; allocate the
          //    next value here and increment for the next release.
          //    Sending Serial='1' for every receipt (old code) was the cause of
          //    "ORA-00001: unique constraint (IQMS.AK_MASTER_LABEL_SERIAL) violated"
          //    on every receipt after the first.
          serialCounter++;
          const serialNo = String(serialCounter).padStart(7, '0');
          try {
            const prepBody = {
              POReceiptsId: poReceiptId,
              LabelsCount: 1,        // one bulk label per receipt
              Qty: qty,
              Serial: serialNo,      // 7-digit padded, globally unique
            };
            await http.post(`/POReceiving/PO/CreatePoReceiptsLabelsPlan/0`, prepBody);
          } catch (e: unknown) {
            const msg = (e && typeof e === 'object' && 'message' in e) ? String((e as { message: unknown }).message) : 'unknown';
            receipts.push({
              poDetailId: line.poDetailId, poReleaseId, arInvtId: line.arInvtId,
              itemNumber: line.itemNumber, qtyReceived: qty, lotNo, serialNo, success: false,
              poReceiptId,
              error: `CreatePoReceiptsLabelsPlan failed: ${msg}`,
            });
            continue;
          }

          // c. PostPOReceiptAndUpdateMasterLabel — body is a ReceivingTransSettings object.
          //    THIS is where LotNo + default location go (not in the LabelsPlan). DW takes
          //    UseDefaultLocation=true → resolves location from ARINVT default Receive Designator,
          //    creates FGMULTI with that location + lot, and writes FgMultiId into MASTER_LABEL.
          try {
            const postUrl = `/POReceiving/PO/PostPOReceiptAndUpdateMasterLabel/0?poReceiptId=${poReceiptId}`;
            const postBody = {
              UseDefaultLocation: true,
              LocationId: 0,
              LotNo: String(lotNo),
              TransDate: dateReceived,
            };
            const pRes = await http.post(postUrl, postBody);
            const body = pRes.data?.data ?? pRes.data;
            const fgMultiId = Number(body?.FgMultiId ?? body?.FGMultiId ?? body?.fgMultiId ?? 0) || undefined;
            const masterLabelId = Number(body?.MasterLabelId ?? body?.MasterLabel?.Id ?? body?.masterLabelId ?? 0) || undefined;
            receipts.push({
              poDetailId: line.poDetailId, poReleaseId, arInvtId: line.arInvtId,
              itemNumber: line.itemNumber, qtyReceived: qty, lotNo, serialNo, success: true,
              poReceiptId, fgMultiId, masterLabelId,
            });
            // Only increment lot after a fully successful receipt — failed attempts shouldn't burn a lot number
            maxLot = lotNo;
          } catch (e: unknown) {
            const msg = (e && typeof e === 'object' && 'message' in e) ? String((e as { message: unknown }).message) : 'unknown';
            receipts.push({
              poDetailId: line.poDetailId, poReleaseId, arInvtId: line.arInvtId,
              itemNumber: line.itemNumber, qtyReceived: qty, lotNo, serialNo, success: false,
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

    /**
     * Retries ONE failed receipt row, resuming from where the prior attempt stopped
     * (see resolveResumeStage). receivePO is intentionally NOT reused or modified.
     */
    async retryReceipt(input: RetryReceiptInput): Promise<ReceiptResult> {
      const stage = resolveResumeStage(input);
      const base = {
        poDetailId: input.poDetailId,
        poReleaseId: input.poReleaseId,
        arInvtId: input.arInvtId,
        itemNumber: input.itemNumber,
        qtyReceived: input.qtyReceived,
      };
      const dateReceived = todayIso();
      const comment = 'Ponovni prijem na default lokaciju';

      let lotNo: number;
      // Defensive: readNextLot swallows errors internally today and returns a fallback, so this catch is currently unreachable.
      // Kept so retryReceipt's contract holds — every failure becomes a failed ReceiptResult, never a thrown exception that would abort the batch loop.
      try {
        lotNo = await readNextLot(http, input.arInvtId);
      } catch (e: unknown) {
        return { ...base, success: false, error: `readNextLot failed: ${errMsg(e)}` };
      }
      let poReceiptId = input.poReceiptId ?? 0;
      let serialNo: string | undefined;

      logger.info({ ...base, stage, existingPoReceiptId: input.poReceiptId }, 'retryReceipt: start');

      // Step 1 — CreatePOReceipt (only when starting fresh; never re-create an existing receipt)
      if (stage === 'fresh') {
        try {
          const createUrl = `/POReceiving/PO/CreatePOReceipt/0?poDetailId=${input.poDetailId}&poReleaseId=${input.poReleaseId}&qtyReceived=${input.qtyReceived}&dateReceived=${encodeURIComponent(dateReceived)}&comment=${encodeURIComponent(comment)}&username=${encodeURIComponent(input.username)}`;
          const cRes = await http.post(createUrl, {});
          const body = cRes.data?.data ?? cRes.data;
          poReceiptId = Number(body?.Id ?? body?.ID ?? 0);
          if (!Number.isFinite(poReceiptId) || poReceiptId <= 0) {
            return { ...base, lotNo, success: false, error: `CreatePOReceipt returned no Id. Body: ${JSON.stringify(body)}` };
          }
        } catch (e: unknown) {
          return { ...base, lotNo, success: false, error: `CreatePOReceipt failed: ${errMsg(e)}` };
        }
      }

      // Step 2 — CreatePoReceiptsLabelsPlan (fresh or fromLabels; allocate a serial here)
      if (stage === 'fresh' || stage === 'fromLabels') {
        // Defensive: readNextSerial swallows errors internally today and returns a fallback, so this catch is currently unreachable.
        // Kept so retryReceipt's contract holds — every failure becomes a failed ReceiptResult, never a thrown exception that would abort the batch loop.
        try {
          serialNo = String(await readNextSerial(http)).padStart(7, '0');
        } catch (e: unknown) {
          return { ...base, lotNo, poReceiptId, success: false, error: `readNextSerial failed: ${errMsg(e)}` };
        }
        try {
          await http.post(`/POReceiving/PO/CreatePoReceiptsLabelsPlan/0`, {
            POReceiptsId: poReceiptId,
            LabelsCount: 1,
            Qty: input.qtyReceived,
            Serial: serialNo,
          });
        } catch (e: unknown) {
          return { ...base, lotNo, serialNo, poReceiptId, success: false, error: `CreatePoReceiptsLabelsPlan failed: ${errMsg(e)}` };
        }
      }

      // Step 3 — PostPOReceiptAndUpdateMasterLabel (always)
      try {
        const postUrl = `/POReceiving/PO/PostPOReceiptAndUpdateMasterLabel/0?poReceiptId=${poReceiptId}`;
        const pRes = await http.post(postUrl, {
          UseDefaultLocation: true,
          LocationId: 0,
          LotNo: String(lotNo),
          TransDate: dateReceived,
        });
        const body = pRes.data?.data ?? pRes.data;
        const fgMultiId = Number(body?.FgMultiId ?? body?.FGMultiId ?? body?.fgMultiId ?? 0) || undefined;
        const masterLabelId = Number(body?.MasterLabelId ?? body?.MasterLabel?.Id ?? body?.masterLabelId ?? 0) || undefined;
        // serialNo is undefined on a 'fromPost' resume: it was allocated in the prior attempt (accepted limitation).
        return { ...base, lotNo, serialNo, poReceiptId, fgMultiId, masterLabelId, success: true };
      } catch (e: unknown) {
        return { ...base, lotNo, serialNo, poReceiptId, success: false, error: `PostPOReceiptAndUpdateMasterLabel failed: ${errMsg(e)}` };
      }
    },

    /**
     * Pre-receive check (group A: no cost recipe; group C: serialized + fractional qty).
     * Reads are safe to run in parallel (no Oracle SEQ writes). One item read failing must
     * NOT abort the whole check. Returns grouped warnings only; never blocks receiving.
     * receivePO stays untouched. (Group B / orphan labels added once DW field names are
     * confirmed on the test VM — see plan Task 1.)
     */
    async validateReceipt(input: { items: ValidateItemInput[] }): Promise<ValidateResult> {
      // Dedup by arInvtId: the same item may appear on several PO lines.
      const byId = new Map<number, ValidateItemInput>();
      for (const it of input.items) {
        if (Number.isFinite(it.arInvtId) && it.arInvtId > 0 && !byId.has(it.arInvtId)) byId.set(it.arInvtId, it);
      }
      const distinct = [...byId.values()];

      const noRecipe: ReceiptWarning['items'] = [];
      const unreliable: ReceiptWarning['items'] = [];
      const serialFractional: ReceiptWarning['items'] = [];

      await Promise.all(distinct.map(async (it) => {
        try {
          const meta = await inventory.getById(it.arInvtId);
          const tag = { arInvtId: it.arInvtId, itemNumber: it.itemNumber };
          if (meta?.hasRecipe === false) noRecipe.push(tag);
          else if (!meta || meta.hasRecipe === undefined) unreliable.push(tag);
          if (meta?.isSerialized && !Number.isInteger(it.quantity)) serialFractional.push(tag);
        } catch (e: unknown) {
          logger.warn({ arInvtId: it.arInvtId, err: errMsg(e) }, 'validateReceipt: item read failed, skipping');
        }
      }));

      const warnings: ReceiptWarning[] = [];
      if (noRecipe.length) {
        warnings.push({ kind: 'NO_RECIPE', items: noRecipe,
          message: `${noRecipe.length} stavki nema recept (Roll Inventory Cost) - prijem ce verovatno pasti za njih.` });
      }
      if (unreliable.length) {
        warnings.push({ kind: 'RECIPE_UNRELIABLE', items: unreliable,
          message: `Za ${unreliable.length} stavki provera recepta nije pouzdana (DW ne vraca tu informaciju).` });
      }
      if (serialFractional.length) {
        warnings.push({ kind: 'SERIAL_FRACTIONAL', items: serialFractional,
          message: `${serialFractional.length} serijalizovanih stavki ima razlomljenu kolicinu.` });
      }
      return { warnings };
    },
  };
}
