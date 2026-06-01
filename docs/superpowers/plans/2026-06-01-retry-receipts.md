# Retry neuspelih PO prijema — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a per-row "Ponovi" button (and a "Ponovi sve neuspele" batch button) that re-runs a failed PO receipt row, resuming from where the prior attempt stopped instead of creating duplicate receipts.

**Architecture:** A new isolated `retryReceipt` function in the DW client handles ONE (poDetailId, poReleaseId) pair. It decides where to resume from data already carried on the failed row — `poReceiptId` is present iff `CreatePOReceipt` already succeeded, and the prior error message tells us whether the label-plan or the post step failed. This avoids a separate "does a receipt exist" DW query and means `receivePO` is left completely untouched. A new route `POST /api/po/:poId/receive-retry` takes a list of rows and processes them sequentially (to avoid Oracle SEQ races, like the existing receive flow). The frontend keeps a local copy of the receipt rows and merges retry results back in by key.

**Tech Stack:** Backend — Node + TypeScript + Express + axios; tests with Vitest + nock + supertest. Frontend — React + TypeScript + Vite + TanStack Query; tests with Vitest + React Testing Library + happy-dom.

---

## Background facts (verified against current code)

These are confirmed by reading the current source — rely on them:

- `backend/src/dwClient/po.ts` exports `makePOApi(http)` returning `{ createPurchaseOrder, receivePO }`. We ADD `retryReceipt` to this object. We DO NOT modify `receivePO` or `createPurchaseOrder`.
- The single-receipt flow is 3 DW calls, in order:
  1. `POST /POReceiving/PO/CreatePOReceipt/0?poDetailId=&poReleaseId=&qtyReceived=&dateReceived=&comment=&username=` → `{ data: { Id } }` = `poReceiptId`.
  2. `POST /POReceiving/PO/CreatePoReceiptsLabelsPlan/0` with body `{ POReceiptsId, LabelsCount: 1, Qty, Serial }` (Serial = 7-digit zero-padded string).
  3. `POST /POReceiving/PO/PostPOReceiptAndUpdateMasterLabel/0?poReceiptId=` with body `{ UseDefaultLocation: true, LocationId: 0, LotNo: "<n>", TransDate }` → `{ data: { FgMultiId, MasterLabelId } }`.
- Serial high-water mark: `GET /Labels/PrintLabel/MasterLabels/0` → array of `{ Serial }`; next = max numeric + 1, padded to 7 digits.
- Lot high-water mark per item: `GET /Manufacturing/Inventory/LocationsForItem/<arInvtId>` → array of `{ LotNo }`; next = max numeric + 1.
- On a FAILED receipt row (existing `ReceiptResult`), `poReceiptId` is set **only if** `CreatePOReceipt` succeeded. The error string is prefixed by which step failed: `"CreatePoReceiptsLabelsPlan failed: ..."` or `"PostPOReceiptAndUpdateMasterLabel failed: ..."`. This is proven by the existing test `backend/test/dwClient/po.test.ts` ("records partial success when PostPOReceipt fails").
- `backend/src/routes/po.ts` exports `makePORouter(store)`; existing route `POST /:poId/receive` calls `req.dw!.po.receivePO(...)`. Auth is enforced by `router.use(makeRequireSession(store))`.
- `frontend/src/api/client.ts` exports `api` with `receivePO(poId)`. The receipt row shape is currently inline in that file.
- `frontend/src/pages/WorkOrders.tsx` renders the receipt table directly from `receivePOMutation.data.receipts` (lines ~199-210). The Status cell shows `✓` or `✗ {error}` (line ~208). Row key is `` `${r.poDetailId}-${r.poReleaseId}` ``.

## Resume decision (the core idea)

| Prior attempt state | `poReceiptId` on row | prior error prefix | Resume stage | DW calls we make |
|---|---|---|---|---|
| `CreatePOReceipt` never succeeded | absent | (any / `CreatePOReceipt...`) | `fresh` | CreatePOReceipt → LabelsPlan → Post |
| receipt created, label-plan failed | present | `CreatePoReceiptsLabelsPlan...` | `fromLabels` | LabelsPlan → Post |
| receipt + label created, post failed | present | `PostPOReceiptAndUpdateMasterLabel...` | `fromPost` | Post |
| receipt present, error unknown | present | (anything else) | `fromLabels` (safe default) | LabelsPlan → Post |

Serial is only allocated when we call LabelsPlan (stages `fresh`/`fromLabels`). In `fromPost` the serial was already consumed by the prior attempt, so the resumed-success row will show serial `—` (accepted limitation; the value lives only in DW). Lot is recomputed (max+1) every time because a failed post never consumes a lot.

---

## Task 1: Resume-stage resolver + retry input type (backend, pure)

**Files:**
- Modify: `backend/src/dwClient/po.ts` (add types + exported pure function near the top, after the `ReceivePOResult` type at line 47)
- Test: `backend/test/dwClient/resumeStage.test.ts`

- [ ] **Step 1: Write the failing test**

Create `backend/test/dwClient/resumeStage.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { resolveResumeStage } from '../../src/dwClient/po.js';

describe('resolveResumeStage', () => {
  it('returns "fresh" when CreatePOReceipt never succeeded (no poReceiptId)', () => {
    expect(resolveResumeStage({})).toBe('fresh');
    expect(resolveResumeStage({ poReceiptId: 0 })).toBe('fresh');
    expect(resolveResumeStage({ priorError: 'CreatePOReceipt failed: boom' })).toBe('fresh');
  });

  it('returns "fromPost" when receipt + label exist and only the Post step failed', () => {
    expect(resolveResumeStage({
      poReceiptId: 9001,
      priorError: 'PostPOReceiptAndUpdateMasterLabel failed: cannot post',
    })).toBe('fromPost');
  });

  it('returns "fromLabels" when the receipt exists but the label-plan step failed', () => {
    expect(resolveResumeStage({
      poReceiptId: 9001,
      priorError: 'CreatePoReceiptsLabelsPlan failed: boom',
    })).toBe('fromLabels');
  });

  it('returns "fromLabels" as the safe default when the receipt exists but the error is unknown', () => {
    expect(resolveResumeStage({ poReceiptId: 9001, priorError: '' })).toBe('fromLabels');
    expect(resolveResumeStage({ poReceiptId: 9001 })).toBe('fromLabels');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend && npx vitest run test/dwClient/resumeStage.test.ts`
Expected: FAIL — `resolveResumeStage` is not exported / not a function.

- [ ] **Step 3: Add the types and the resolver**

In `backend/src/dwClient/po.ts`, immediately after the `ReceivePOResult` type (after line 47), add:

```typescript
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd backend && npx vitest run test/dwClient/resumeStage.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/src/dwClient/po.ts backend/test/dwClient/resumeStage.test.ts
git commit -m "feat(retry): resume-stage resolver + retry input type"
```

---

## Task 2: `retryReceipt` DW-client method (backend)

**Files:**
- Modify: `backend/src/dwClient/po.ts` (add 3 module-level helpers above `makePOApi` at line 57; add `retryReceipt` method inside the object returned by `makePOApi`, after `receivePO` ends at line 392)
- Test: `backend/test/dwClient/retryReceipt.test.ts`

- [ ] **Step 1: Write the failing test**

Create `backend/test/dwClient/retryReceipt.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import nock from 'nock';
import { createDwClient } from '../../src/dwClient/index.js';

const BASE = 'http://dw.test:8080/WebAPI';

describe('dwClient.po.retryReceipt', () => {
  beforeEach(() => nock.disableNetConnect());
  afterEach(() => { nock.cleanAll(); nock.enableNetConnect(); });

  it('fresh: runs all three steps when there is no prior poReceiptId', async () => {
    nock(BASE).get('/Manufacturing/Inventory/LocationsForItem/100').reply(200, { data: [{ LotNo: '4' }] });
    nock(BASE).get('/Labels/PrintLabel/MasterLabels/0').reply(200, { data: [{ Serial: '0000010' }] });
    nock(BASE).post('/POReceiving/PO/CreatePOReceipt/0')
      .query(q => Number(q.poDetailId) === 5001 && Number(q.poReleaseId) === 7001 && Number(q.qtyReceived) === 5)
      .reply(200, { data: { Id: 9001 } });
    nock(BASE).post('/POReceiving/PO/CreatePoReceiptsLabelsPlan/0', (b) => {
      const o = b as { POReceiptsId?: number; Serial?: string; Qty?: number };
      return o.POReceiptsId === 9001 && o.Serial === '0000011' && o.Qty === 5;
    }).reply(200, { data: {} });
    nock(BASE).post('/POReceiving/PO/PostPOReceiptAndUpdateMasterLabel/0', (b) => (b as { LotNo?: string }).LotNo === '5')
      .query(q => Number(q.poReceiptId) === 9001)
      .reply(200, { data: { FgMultiId: 4001, MasterLabelId: 8001 } });

    const client = createDwClient({ baseUrl: BASE });
    client.setAuthToken('t');
    const r = await client.po.retryReceipt({
      poDetailId: 5001, poReleaseId: 7001, arInvtId: 100, itemNumber: 'PART-A',
      qtyReceived: 5, username: 'IQMS',
    });
    expect(r).toMatchObject({
      success: true, poReceiptId: 9001, lotNo: 5, serialNo: '0000011',
      fgMultiId: 4001, masterLabelId: 8001,
    });
  });

  it('fromLabels: skips CreatePOReceipt, redoes LabelsPlan + Post', async () => {
    // NOTE: no CreatePOReceipt nock is registered. If retryReceipt called it,
    // nock(disableNetConnect) would throw and fail this test — that is the assertion.
    nock(BASE).get('/Manufacturing/Inventory/LocationsForItem/100').reply(200, { data: [] });
    nock(BASE).get('/Labels/PrintLabel/MasterLabels/0').reply(200, { data: [{ Serial: '0000099' }] });
    nock(BASE).post('/POReceiving/PO/CreatePoReceiptsLabelsPlan/0', (b) => {
      const o = b as { POReceiptsId?: number; Serial?: string };
      return o.POReceiptsId === 9001 && o.Serial === '0000100';
    }).reply(200, { data: {} });
    nock(BASE).post('/POReceiving/PO/PostPOReceiptAndUpdateMasterLabel/0', (b) => (b as { LotNo?: string }).LotNo === '1')
      .query(q => Number(q.poReceiptId) === 9001)
      .reply(200, { data: { FgMultiId: 4002 } });

    const client = createDwClient({ baseUrl: BASE });
    client.setAuthToken('t');
    const r = await client.po.retryReceipt({
      poDetailId: 5001, poReleaseId: 7001, arInvtId: 100, itemNumber: 'PART-A',
      qtyReceived: 5, username: 'IQMS',
      poReceiptId: 9001, priorError: 'CreatePoReceiptsLabelsPlan failed: boom',
    });
    expect(r.success).toBe(true);
    expect(r.poReceiptId).toBe(9001);
    expect(r.lotNo).toBe(1);
    expect(r.serialNo).toBe('0000100');
    expect(r.fgMultiId).toBe(4002);
  });

  it('fromPost: only re-posts (no CreatePOReceipt, no LabelsPlan)', async () => {
    // Only LocationsForItem + Post are registered. CreatePOReceipt and LabelsPlan
    // are intentionally NOT registered — calling them would fail the test.
    nock(BASE).get('/Manufacturing/Inventory/LocationsForItem/100').reply(200, { data: [] });
    nock(BASE).post('/POReceiving/PO/PostPOReceiptAndUpdateMasterLabel/0', (b) => (b as { LotNo?: string }).LotNo === '1')
      .query(q => Number(q.poReceiptId) === 9001)
      .reply(200, { data: { FgMultiId: 4003, MasterLabelId: 8003 } });

    const client = createDwClient({ baseUrl: BASE });
    client.setAuthToken('t');
    const r = await client.po.retryReceipt({
      poDetailId: 5001, poReleaseId: 7001, arInvtId: 100, itemNumber: 'PART-A',
      qtyReceived: 5, username: 'IQMS',
      poReceiptId: 9001, priorError: 'PostPOReceiptAndUpdateMasterLabel failed: cannot post',
    });
    expect(r.success).toBe(true);
    expect(r.poReceiptId).toBe(9001);
    expect(r.fgMultiId).toBe(4003);
    expect(r.masterLabelId).toBe(8003);
    expect(r.serialNo).toBeUndefined();   // serial was consumed in the prior attempt
  });

  it('returns success:false (preserving poReceiptId) when the Post step fails again', async () => {
    nock(BASE).get('/Manufacturing/Inventory/LocationsForItem/100').reply(200, { data: [] });
    nock(BASE).post('/POReceiving/PO/PostPOReceiptAndUpdateMasterLabel/0')
      .query(q => Number(q.poReceiptId) === 9001)
      .reply(500, 'still broken');

    const client = createDwClient({ baseUrl: BASE });
    client.setAuthToken('t');
    const r = await client.po.retryReceipt({
      poDetailId: 5001, poReleaseId: 7001, arInvtId: 100, itemNumber: 'PART-A',
      qtyReceived: 5, username: 'IQMS',
      poReceiptId: 9001, priorError: 'PostPOReceiptAndUpdateMasterLabel failed: cannot post',
    });
    expect(r.success).toBe(false);
    expect(r.poReceiptId).toBe(9001);
    expect(r.error).toMatch(/PostPOReceiptAndUpdateMasterLabel failed/);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend && npx vitest run test/dwClient/retryReceipt.test.ts`
Expected: FAIL — `client.po.retryReceipt is not a function`.

- [ ] **Step 3: Add module-level helpers above `makePOApi`**

In `backend/src/dwClient/po.ts`, directly above `export function makePOApi(http: AxiosInstance) {` (line 57), add:

```typescript
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
```

- [ ] **Step 4: Add the `retryReceipt` method**

In `backend/src/dwClient/po.ts`, inside the object returned by `makePOApi`, after the `receivePO` method closes (after its `},` at line 392) and before the final `};` of the returned object, add:

```typescript
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
      const comment = `Ponovni prijem na default lokaciju`;

      const lotNo = await readNextLot(http, input.arInvtId);
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
        serialNo = String(await readNextSerial(http)).padStart(7, '0');
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
        return { ...base, lotNo, serialNo, poReceiptId, fgMultiId, masterLabelId, success: true };
      } catch (e: unknown) {
        return { ...base, lotNo, serialNo, poReceiptId, success: false, error: `PostPOReceiptAndUpdateMasterLabel failed: ${errMsg(e)}` };
      }
    },
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd backend && npx vitest run test/dwClient/retryReceipt.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Run the full dwClient suite to confirm receivePO is unaffected**

Run: `cd backend && npx vitest run test/dwClient/po.test.ts`
Expected: PASS (all existing tests still green).

- [ ] **Step 7: Commit**

```bash
git add backend/src/dwClient/po.ts backend/test/dwClient/retryReceipt.test.ts
git commit -m "feat(retry): retryReceipt resumes a failed receipt without duplicating PO_RECEIPTS"
```

---

## Task 3: `POST /:poId/receive-retry` route (backend)

**Files:**
- Modify: `backend/src/routes/po.ts` (add helper above `makePORouter`; add route after the existing `/:poId/receive` route at line 62)
- Test: `backend/test/routes/poRetry.test.ts`

- [ ] **Step 1: Write the failing test**

Create `backend/test/routes/poRetry.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import nock from 'nock';
import { createApp } from '../../src/server.js';

const BASE = 'http://dw.test:8080/WebAPI';

async function login(app: ReturnType<typeof createApp>) {
  nock(BASE).post('/User/Login').reply(200, { AuthToken: 'tok', UserName: 'u' });
  const res = await request(app).post('/api/auth/login').send({
    baseUrl: BASE, username: 'u', password: 'p', database: 'db', eplantId: 1,
  });
  return res.headers['set-cookie'];
}

describe('POST /api/po/:poId/receive-retry', () => {
  beforeEach(() => { nock.disableNetConnect(); nock.enableNetConnect('127.0.0.1'); });
  afterEach(() => { nock.cleanAll(); nock.enableNetConnect(); });

  it('requires authentication', async () => {
    const app = createApp();
    const res = await request(app).post('/api/po/999/receive-retry').send({ rows: [] });
    expect(res.status).toBe(401);
  });

  it('returns 400 when no valid rows are provided', async () => {
    const app = createApp();
    const cookies = await login(app);
    const res = await request(app).post('/api/po/999/receive-retry').set('Cookie', cookies!).send({ rows: [] });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('NO_VALID_ROWS');
  });

  it('retries a single fresh row and returns its result', async () => {
    const app = createApp();
    const cookies = await login(app);
    nock(BASE).get('/Manufacturing/Inventory/LocationsForItem/100').reply(200, { data: [] });
    nock(BASE).get('/Labels/PrintLabel/MasterLabels/0').reply(200, { data: [] });
    nock(BASE).post('/POReceiving/PO/CreatePOReceipt/0').query(true).reply(200, { data: { Id: 9001 } });
    nock(BASE).post('/POReceiving/PO/CreatePoReceiptsLabelsPlan/0').reply(200, { data: {} });
    nock(BASE).post('/POReceiving/PO/PostPOReceiptAndUpdateMasterLabel/0').query(true)
      .reply(200, { data: { FgMultiId: 4001, MasterLabelId: 8001 } });

    const res = await request(app).post('/api/po/999/receive-retry').set('Cookie', cookies!).send({
      rows: [{ poDetailId: 5001, poReleaseId: 7001, arInvtId: 100, itemNumber: 'PART-A', qtyReceived: 5 }],
    });
    expect(res.status).toBe(200);
    expect(res.body.poId).toBe(999);
    expect(res.body.receipts).toHaveLength(1);
    expect(res.body.receipts[0]).toMatchObject({ success: true, poReceiptId: 9001, fgMultiId: 4001 });
  });

  it('stops early on a session/auth error and returns only the processed rows', async () => {
    const app = createApp();
    const cookies = await login(app);
    // Row 1 fails its CreatePOReceipt with 401 → loop must stop, row 2 is never processed.
    nock(BASE).get('/Manufacturing/Inventory/LocationsForItem/100').reply(200, { data: [] });
    nock(BASE).post('/POReceiving/PO/CreatePOReceipt/0').query(true).reply(401, 'Unauthorized');
    // No nocks for row 2 — if it were processed the test would error on an unmatched request.

    const res = await request(app).post('/api/po/999/receive-retry').set('Cookie', cookies!).send({
      rows: [
        { poDetailId: 5001, poReleaseId: 7001, arInvtId: 100, itemNumber: 'A', qtyReceived: 5 },
        { poDetailId: 5002, poReleaseId: 7002, arInvtId: 101, itemNumber: 'B', qtyReceived: 5 },
      ],
    });
    expect(res.status).toBe(200);
    expect(res.body.receipts).toHaveLength(1);
    expect(res.body.receipts[0].success).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend && npx vitest run test/routes/poRetry.test.ts`
Expected: FAIL — route returns 404 (not defined), so the auth/400/200 assertions fail.

- [ ] **Step 3: Add the auth-detection helper**

In `backend/src/routes/po.ts`, directly above `export function makePORouter(store: SessionStore) {` (line 9), add:

```typescript
/** Heuristic: does this DW error message look like an expired session / auth failure? */
function looksLikeAuthError(msg?: string): boolean {
  if (!msg) return false;
  return /\b(401|403)\b/.test(msg) || /forbidden|unauthor/i.test(msg);
}
```

- [ ] **Step 4: Add the route**

In `backend/src/routes/po.ts`, after the existing `/:poId/receive` route block closes (after its `});` at line 62) and before `return router;`, add:

```typescript
  router.post('/:poId/receive-retry', async (req, res, next) => {
    try {
      const poId = Number(req.params.poId);
      if (!Number.isFinite(poId) || poId <= 0) {
        res.status(400).json({ error: 'INVALID_PO_ID' });
        return;
      }
      const rawRows = Array.isArray(req.body?.rows) ? req.body.rows : [];
      const rows = rawRows.map((r: unknown) => {
        const o = r as Record<string, unknown>;
        return {
          poDetailId: Number(o?.poDetailId ?? 0),
          poReleaseId: Number(o?.poReleaseId ?? 0),
          arInvtId: Number(o?.arInvtId ?? 0),
          itemNumber: String(o?.itemNumber ?? ''),
          qtyReceived: Number(o?.qtyReceived ?? 0),
          poReceiptId: o?.poReceiptId != null ? Number(o.poReceiptId) : undefined,
          priorError: o?.priorError != null ? String(o.priorError) : undefined,
        };
      }).filter((r: { poDetailId: number; poReleaseId: number; qtyReceived: number }) =>
        r.poDetailId > 0 && r.poReleaseId > 0 && r.qtyReceived > 0);
      if (rows.length === 0) {
        res.status(400).json({ error: 'NO_VALID_ROWS' });
        return;
      }
      logger.info({ poId, rowCount: rows.length, username: req.session!.username }, 'Retrying PO receipts');

      const receipts = [];
      for (const row of rows) {
        const result = await req.dw!.po.retryReceipt({ ...row, username: req.session!.username });
        receipts.push(result);
        if (!result.success && looksLikeAuthError(result.error)) {
          logger.warn({ poId, poDetailId: row.poDetailId }, 'Retry batch stopped early — session/auth error');
          break;
        }
      }
      const successCount = receipts.filter(r => r.success).length;
      logger.info({ poId, successCount, totalCount: receipts.length }, 'PO receipts retried');
      res.json({ poId, receipts });
    } catch (e) { next(e); }
  });
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd backend && npx vitest run test/routes/poRetry.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add backend/src/routes/po.ts backend/test/routes/poRetry.test.ts
git commit -m "feat(retry): POST /:poId/receive-retry runs failed rows sequentially, stops on auth error"
```

---

## Task 4: Frontend API client — `retryReceipts` + shared row type

**Files:**
- Modify: `frontend/src/api/client.ts` (add `ReceiptRow` + `RetryRow` types; switch `receivePO` return to `ReceiptRow[]`; add `retryReceipts`)
- Test: `frontend/test/api/retryReceipts.test.ts`

- [ ] **Step 1: Write the failing test**

Create `frontend/test/api/retryReceipts.test.ts`:

```typescript
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
    expect(out.receipts[0].success).toBe(true);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('/api/po/999/receive-retry');
    expect(init!.method).toBe('POST');
    expect(JSON.parse(init!.body as string)).toEqual({ rows });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd frontend && npx vitest run test/api/retryReceipts.test.ts`
Expected: FAIL — `api.retryReceipts is not a function`.

- [ ] **Step 3: Add the types**

In `frontend/src/api/client.ts`, after the imports (line 1) and before `async function req`, add:

```typescript
export type ReceiptRow = {
  poDetailId: number;
  poReleaseId: number;
  arInvtId: number;
  itemNumber: string;
  qtyReceived: number;
  lotNo?: number;
  /** MASTER_LABEL.SERIALNO sent to DW (7-digit padded, globally sequential). */
  serialNo?: string;
  success: boolean;
  poReceiptId?: number;
  fgMultiId?: number;
  masterLabelId?: number;
  error?: string;
};

export type RetryRow = {
  poDetailId: number;
  poReleaseId: number;
  arInvtId: number;
  itemNumber: string;
  qtyReceived: number;
  poReceiptId?: number;
  priorError?: string;
};
```

- [ ] **Step 4: Use `ReceiptRow` in `receivePO` and add `retryReceipts`**

In `frontend/src/api/client.ts`, replace the entire `receivePO` property (lines 50-68) with:

```typescript
  receivePO: (poId: number) =>
    req<{ poId: number; receipts: ReceiptRow[] }>(`/api/po/${poId}/receive`, { method: 'POST' }),
  retryReceipts: (poId: number, rows: RetryRow[]) =>
    req<{ poId: number; receipts: ReceiptRow[] }>(`/api/po/${poId}/receive-retry`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rows }),
    }),
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd frontend && npx vitest run test/api/retryReceipts.test.ts`
Expected: PASS (1 test).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/api/client.ts frontend/test/api/retryReceipts.test.ts
git commit -m "feat(retry): frontend api.retryReceipts + shared ReceiptRow type"
```

---

## Task 5: Frontend WorkOrders page — retry buttons + row merge

**Files:**
- Modify: `frontend/src/pages/WorkOrders.tsx`
- Test: `frontend/test/pages/WorkOrdersRetry.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `frontend/test/pages/WorkOrdersRetry.test.tsx`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { WorkOrdersPage } from '../../src/pages/WorkOrders.js';
import { useWizardStore } from '../../src/store/wizardStore.js';
import { api } from '../../src/api/client.js';

vi.mock('../../src/api/client.js', () => ({
  api: {
    workOrderTree: vi.fn(async () => ({
      tree: {
        arInvtId: 1, itemNumber: 'PART-A', description: 'Widget A', rev: '1', itemClass: 'BUY',
        isPurchased: true, qtyRequired: 5, uom: 'ea', level: 0, workOrders: [], children: [],
      },
      stats: { nodeCount: 1, maxDepth: 0, cycleCount: 0, totalWorkOrders: 0, itemsWithoutWO: 0 },
    })),
    createPO: vi.fn(async () => ({
      poId: 999, poNo: 'PO-1', approved: true,
      lineItems: [{ arInvtId: 1, quantity: 5, success: true, poDetailId: 5001, releaseId: 7001 }],
    })),
    receivePO: vi.fn(async () => ({
      poId: 999,
      receipts: [{
        poDetailId: 5001, poReleaseId: 7001, arInvtId: 1, itemNumber: 'PART-A', qtyReceived: 5,
        success: false, poReceiptId: 9001,
        error: 'PostPOReceiptAndUpdateMasterLabel failed: boom',
      }],
    })),
    retryReceipts: vi.fn(async () => ({
      poId: 999,
      receipts: [{
        poDetailId: 5001, poReleaseId: 7001, arInvtId: 1, itemNumber: 'PART-A', qtyReceived: 5,
        success: true, poReceiptId: 9001, lotNo: 1, serialNo: '0000001', fgMultiId: 4001, masterLabelId: 8001,
      }],
    })),
  },
}));

function renderPage() {
  useWizardStore.getState().selectSO({ salesOrderId: 10, orderNumber: 'SO1', company: 'Acme', customerNumber: 'C-001' });
  useWizardStore.getState().selectLineItem({
    ordDetailId: 11, arInvtId: 1, itemNumber: 'PART-A', description: 'Widget A',
    totalOrdered: 5, cummShipped: 0, remaining: 5,
  });
  useWizardStore.getState().setSelectionFull();
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter><WorkOrdersPage /></MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('WorkOrdersPage retry flow', () => {
  beforeEach(() => {
    useWizardStore.getState().reset();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    vi.spyOn(window, 'alert').mockImplementation(() => {});
  });
  afterEach(() => { vi.restoreAllMocks(); });

  it('shows a "Ponovi" button on a failed row, retries it, and turns it into a success', async () => {
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => screen.getByText('PART-A'));

    // Create the PO, then receive it (both behind confirm() which we stubbed true).
    await user.click(screen.getByRole('button', { name: /kreiraj po/i }));
    await user.click(await screen.findByRole('button', { name: /prijem na default/i }));

    // The failed row must expose a per-row "Ponovi" button and the batch button.
    const retryBtn = await screen.findByRole('button', { name: /^ponovi$/i });
    expect(retryBtn).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /ponovi sve neuspele/i })).toBeInTheDocument();

    // Click "Ponovi" → api.retryReceipts called with the carried poReceiptId + priorError.
    await user.click(retryBtn);
    await waitFor(() => expect(api.retryReceipts).toHaveBeenCalledWith(999, [
      expect.objectContaining({ poDetailId: 5001, poReleaseId: 7001, poReceiptId: 9001, priorError: 'PostPOReceiptAndUpdateMasterLabel failed: boom' }),
    ]));

    // Row becomes success: no more "Ponovi", no more batch button.
    await waitFor(() => expect(screen.queryByRole('button', { name: /^ponovi$/i })).toBeNull());
    expect(screen.queryByRole('button', { name: /ponovi sve neuspele/i })).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd frontend && npx vitest run test/pages/WorkOrdersRetry.test.tsx`
Expected: FAIL — no "Ponovi" button exists yet.

- [ ] **Step 3: Add imports and local state to WorkOrders.tsx**

In `frontend/src/pages/WorkOrders.tsx`, change the client import (line 4) to also pull the row types:

```typescript
import { api, type ReceiptRow, type RetryRow } from '../api/client.js';
```

Then, immediately after the `receivePOMutation` declaration (lines 40-42), add the local receipts state, the sync effect, the retry mutation, and helpers:

```typescript
  const poId = createPOMutation.data?.poId;
  const [receipts, setReceipts] = useState<ReceiptRow[] | null>(null);

  useEffect(() => {
    if (receivePOMutation.data) setReceipts(receivePOMutation.data.receipts);
  }, [receivePOMutation.data]);

  const rowKey = (r: { poDetailId: number; poReleaseId: number }) => `${r.poDetailId}-${r.poReleaseId}`;
  const toRetryRow = (r: ReceiptRow): RetryRow => ({
    poDetailId: r.poDetailId,
    poReleaseId: r.poReleaseId,
    arInvtId: r.arInvtId,
    itemNumber: r.itemNumber,
    qtyReceived: r.qtyReceived,
    poReceiptId: r.poReceiptId,
    priorError: r.error,
  });

  const retryMutation = useMutation({
    mutationFn: (rows: RetryRow[]) => api.retryReceipts(poId!, rows),
    onSuccess: (data) => {
      setReceipts(prev => {
        const map = new Map((prev ?? []).map(r => [rowKey(r), r] as const));
        for (const u of data.receipts) map.set(rowKey(u), u);
        return Array.from(map.values());
      });
    },
  });

  const failedReceipts = (receipts ?? []).filter(r => !r.success);
  const pendingKeys = retryMutation.isPending
    ? new Set((retryMutation.variables ?? []).map(rowKey))
    : new Set<string>();
```

(`useState` and `useEffect` are already imported on line 1; `useMutation` on line 3.)

- [ ] **Step 4: Add the batch button to the receive summary**

In `frontend/src/pages/WorkOrders.tsx`, find the receive-success summary line (lines 180-181):

```tsx
                            <strong>Prijem završen.</strong>{' '}
                            Uspešno: {receivePOMutation.data.receipts.filter(r => r.success).length} / {receivePOMutation.data.receipts.length}
```

Replace those two lines with (derive counts from local `receipts`, and add the batch button):

```tsx
                            <strong>Prijem završen.</strong>{' '}
                            Uspešno: {(receipts ?? []).filter(r => r.success).length} / {(receipts ?? []).length}
                            {failedReceipts.length > 0 && (
                              <div className="row" style={{ marginTop: 8 }}>
                                <button
                                  disabled={retryMutation.isPending || !poId}
                                  onClick={() => retryMutation.mutate(failedReceipts.map(toRetryRow))}
                                >🔁 Ponovi sve neuspele ({failedReceipts.length})</button>
                                {retryMutation.isPending && (
                                  <span style={{ color: 'var(--muted)', fontSize: 13 }}>Ponavljam...</span>
                                )}
                              </div>
                            )}
```

- [ ] **Step 5: Render the table from local state and add the per-row button**

In `frontend/src/pages/WorkOrders.tsx`, change the table body to map over `receipts` instead of `receivePOMutation.data.receipts`. Replace line 199:

```tsx
                                    {receivePOMutation.data.receipts.map(r => (
```

with:

```tsx
                                    {(receipts ?? []).map(r => (
```

Then replace the Status cell (line 208):

```tsx
                                        <td>{r.success ? '✓' : <span style={{ color: 'var(--error)' }}>✗ {r.error}</span>}</td>
```

with:

```tsx
                                        <td>{r.success ? '✓' : (
                                          <span style={{ color: 'var(--error)' }}>
                                            ✗ {r.error}{' '}
                                            <button
                                              disabled={retryMutation.isPending || !poId}
                                              onClick={() => retryMutation.mutate([toRetryRow(r)])}
                                            >{pendingKeys.has(rowKey(r)) ? '...' : 'Ponovi'}</button>
                                          </span>
                                        )}</td>
```

- [ ] **Step 6: Run the new test to verify it passes**

Run: `cd frontend && npx vitest run test/pages/WorkOrdersRetry.test.tsx`
Expected: PASS (1 test).

- [ ] **Step 7: Run the existing WorkOrders test to confirm no regression**

Run: `cd frontend && npx vitest run test/pages/WorkOrders.test.tsx`
Expected: PASS (existing tests still green — the table now reads from `receipts`, seeded from the same data).

- [ ] **Step 8: Commit**

```bash
git add frontend/src/pages/WorkOrders.tsx frontend/test/pages/WorkOrdersRetry.test.tsx
git commit -m "feat(retry): per-row + batch retry buttons on the receive results table"
```

---

## Task 6: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Backend — typecheck + full test suite**

Run: `cd backend && npm run build && npm test`
Expected: build succeeds with no TypeScript errors; all tests pass.

- [ ] **Step 2: Frontend — typecheck + full test suite**

Run: `cd frontend && npx tsc -b && npm test`
Expected: typecheck clean; all tests pass.

- [ ] **Step 3: Manual smoke (optional, requires DW test VM)**

Start both apps (`npm run dev` in backend, `npm run dev` in frontend), drive a PO that has at least one row which fails on post, then click "Ponovi" and confirm the row turns green without creating a second PO_RECEIPTS in DW.

- [ ] **Step 4: Final commit if any fixups were needed**

```bash
git add -A
git commit -m "chore(retry): verification fixups"
```

(Skip if the working tree is clean.)

---

## Self-review notes (spec coverage)

- Spec §3 (per-row button + batch button, lock while pending, ✓ transition) → Task 5.
- Spec §4 (resume from where it stopped, skip done steps, recompute serial+lot, untouched receivePO, list-in/result-out endpoint) → Tasks 1, 2, 3.
- Spec §5 (double-click lock = `disabled` while pending; sequential not parallel = route loop; session expiry stops batch = `looksLikeAuthError` early break; original receive button untouched) → Tasks 3, 5.
- Spec §6 (resume-skip unit tests, serial/lot recompute, endpoint list-in/out + auth-stop, frontend button visibility/transition) → Tasks 1, 2, 3, 4, 5.
- Spec §8 open questions: resolved — we carry resume state on the failed row (poReceiptId + error prefix) instead of querying DW, so no unknown DW endpoint is needed. Residual accepted limitation: a row whose post step failed will show serial `—` after a successful resume, and a row manually posted in DW between attempts is not detected (rare; out of scope for v1).
