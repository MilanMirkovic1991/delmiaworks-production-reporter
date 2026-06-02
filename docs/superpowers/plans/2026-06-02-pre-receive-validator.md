# Pre-receive validator — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Spec:** `docs/superpowers/specs/2026-06-01-pre-receive-validator-design.md` (approved).

**Goal:** After a PO is created, automatically check its line items and show a grouped
warning panel above the existing "Prijem" button — group A (item has no cost recipe),
group B (orphan MASTER_LABEL without a lot), group C (serialized item + fractional qty).
The validator **only warns**; it never blocks or skips receiving. `receivePO` stays untouched.

**Architecture (Pristup 1, mirrors retry):** A new isolated `validateReceipt` function in
the DW client takes the line items the frontend already has from `createPO`, dedups by
`arInvtId`, reads DW item data per distinct item (reads can run in parallel — no Oracle
sequence races like writes), reads the master-label list once for group B, and returns
**grouped** warnings. A new route `POST /api/po/:poId/receive-validate` exposes it. The
frontend calls it automatically on `createPO` success and renders one collapsible panel.

**Tech Stack:** Backend — Node + TypeScript + Express + axios; tests Vitest + nock + supertest.
Frontend — React + TS + Vite + TanStack Query; tests Vitest + RTL + happy-dom.

---

## Background facts (verified against current code)

- `backend/src/dwClient/po.ts` exports `makePOApi(http)` → `{ createPurchaseOrder, receivePO, retryReceipt }`. We ADD `validateReceipt`. We DO NOT touch `receivePO`/`createPurchaseOrder`/`retryReceipt`.
- `backend/src/dwClient/inventory.ts` exports `makeInventoryApi(http)` → `{ searchItems, getById, getMaterialsForItem }`. `getById(arInvtId)` GETs `/Manufacturing/Inventory/InventoryItem/{id}` and maps with a defensive multi-key pattern (`obj.X ?? obj.Y`). We EXTEND its mapping with `hasRecipe?` and `isSerialized?` (group A + C signals).
- The master-label endpoint is **already known and used**: `readNextSerial` in `po.ts` does `GET /Labels/PrintLabel/MasterLabels/0` → array of rows with a `Serial` field. Group B reuses this same call; we additionally need the per-row item id and lot field (confirm names in Task 1).
- `backend/src/routes/po.ts` exports `makePORouter(store)`; routes `/create`, `/:poId/receive`, `/:poId/receive-retry`. Auth via `router.use(makeRequireSession(store))`; handlers use `req.dw!.po` and `req.session!.username`.
- `frontend/src/api/client.ts`: `createPO(items)` returns `{ poId, poNo, approved, approvalError?, lineItems: [{ arInvtId, quantity, success, poDetailId?, releaseId?, error? }] }`. This `lineItems` array is the validator's input.
- `frontend/src/pages/WorkOrders.tsx`: `createPOMutation` (line ~36), `poId` (line ~44); the create-success block is ~164-187 and the receive button is ~189-206. The validator panel goes between the create-success summary and the receive button.

## Probe-gated unknowns (resolved in Task 1, NOT blocking the plan)

Three DW field names are unknown until probed on the test VM. The code is written
**defensively** (check several plausible keys, like the existing `?? ` pattern), so the
plan is implementable now; Task 1 just confirms/narrows the keys and feeds real fixtures.

| Group | Unknown | Defensive default until probed |
|---|---|---|
| A | which `InventoryItem` field/relation says "has cost recipe" | check `RecipeExists`, `HasRecipe`, `CostRecipeId`, `RecipeCardId`; if none present → `hasRecipe: undefined` → warn "recept nepouzdan" |
| C | which field flags "serialized" | check `Serialized`, `IsSerialized`, `SerialTracking`, `LotSerial` truthy |
| B | item-id + lot fields on a master-label row | check `ArInvtId`/`Id`/`InvtId` and `LotNo`/`Lot` empty/null |

If Task 1 shows group A has **no** reliable WebAPI signal, group A degrades to a clearly
labelled "nepouzdana provera" warning (per spec §5); the rest ships regardless.

---

## Task 1: DW VM probe — discover field names (USER runs; one-off, deleted before commit)

**Why a separate task:** the test VM (`192.168.20.28`) is on an internal network the agent
cannot reach. The user runs these scripts and pastes the key output back into this plan
before Tasks 2-3 are finalized. Scripts are deleted before any commit (per project rules).

**Files (temporary, git-ignored / deleted after):**
- New: `backend/tools/peek-inventory-item.ts`
- New: `backend/tools/peek-master-labels.ts`

- [ ] **Step 1: Create `backend/tools/peek-inventory-item.ts`**

```typescript
// One-off probe. Run: cd backend && npx tsx tools/peek-inventory-item.ts <arInvtId>
// Goal: find which fields reveal (A) a cost recipe and (C) serialization.
// DELETE before committing.
import { createDwClient } from '../src/dwClient/index.js';

const BASE = process.env.DW_BASE ?? 'http://192.168.20.28:8080/WebAPI';
const arInvtId = Number(process.argv[2] ?? 0);

async function main() {
  const dw = createDwClient({ baseUrl: BASE });
  const { authToken } = await dw.auth.login({
    username: 'IQMS', password: 'iqms', database: 'IQORA',
  });
  dw.setAuthToken(authToken);

  // Raw GET so we see EVERY field, not the mapped subset.
  const http = (dw as unknown as { _http?: unknown });
  const res = await (await import('axios')).default.get(
    `${BASE}/Manufacturing/Inventory/InventoryItem/${arInvtId}`,
    { headers: { AuthToken: authToken } },
  );
  const raw = res.data?.data ?? res.data;
  const obj = Array.isArray(raw) ? raw[0] : raw;
  console.log('ALL KEYS:', Object.keys(obj).sort().join(', '));
  // Highlight likely recipe / serial fields:
  for (const k of Object.keys(obj)) {
    if (/recipe|cost|serial|lot/i.test(k)) console.log(`  ${k} =`, obj[k]);
  }
  void http;
}
main().catch(e => { console.error(e?.response?.data ?? e); process.exit(1); });
```

- [ ] **Step 2: Run it against (a) an item known to have NO recipe and (b) one WITH a recipe**

```bash
cd backend
npx tsx tools/peek-inventory-item.ts <arInvtId_without_recipe>   # one of the ~50 failing items
npx tsx tools/peek-inventory-item.ts <arInvtId_with_recipe>      # an item that received OK
npx tsx tools/peek-inventory-item.ts <arInvtId_serialized>       # one of the 3 serialized items
```

Record below which key DIFFERS between the no-recipe and with-recipe items, and which key
flags serialization:

```
# RECIPE field: ____________________  (value when no recipe: ____ ; when has recipe: ____)
# SERIAL field: ____________________  (value when serialized: ____ )
```

- [ ] **Step 3: Create + run `backend/tools/peek-master-labels.ts`** (group B field names)

```typescript
// Run: cd backend && npx tsx tools/peek-master-labels.ts   — DELETE before committing.
import { createDwClient } from '../src/dwClient/index.js';
const BASE = process.env.DW_BASE ?? 'http://192.168.20.28:8080/WebAPI';
async function main() {
  const dw = createDwClient({ baseUrl: BASE });
  const { authToken } = await dw.auth.login({ username: 'IQMS', password: 'iqms', database: 'IQORA' });
  dw.setAuthToken(authToken);
  const axios = (await import('axios')).default;
  const res = await axios.get(`${BASE}/Labels/PrintLabel/MasterLabels/0`, { headers: { AuthToken: authToken } });
  const rows = res.data?.data ?? res.data ?? [];
  console.log('COUNT:', rows.length);
  if (rows.length) console.log('KEYS:', Object.keys(rows[0]).sort().join(', '));
  // Look for orphans (label rows 254 / 327 are known orphans):
  for (const r of rows) if ([254, 327].includes(Number(r.Id ?? r.ID))) console.log('ORPHAN ROW:', r);
}
main().catch(e => { console.error(e?.response?.data ?? e); process.exit(1); });
```

Record below the item-id field and the lot field on a master-label row, and what an orphan
(rows 254/327) looks like:

```
# LABEL item-id field: __________   LABEL lot field: __________   orphan signature: __________
```

- [ ] **Step 4: Delete the probe scripts** (`rm backend/tools/peek-*.ts`). Do NOT commit them.

> After this task, update the "Defensive default" keys in Tasks 2-3 below with the confirmed
> field names (replace the guesses with the real key first in each `??` chain).

---

## Task 2: Extend `inventory.getById` mapping with recipe + serial signals (backend)

**Files:**
- Modify: `backend/src/dwClient/inventory.ts` (add `hasRecipe?`/`isSerialized?` to `InventoryItem` + map them in `getById`)
- Test: `backend/test/dwClient/inventoryMeta.test.ts`

- [ ] **Step 1: Write the failing test** `backend/test/dwClient/inventoryMeta.test.ts`

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import nock from 'nock';
import { createDwClient } from '../../src/dwClient/index.js';
const BASE = 'http://dw.test:8080/WebAPI';

describe('inventory.getById meta (recipe / serialized)', () => {
  beforeEach(() => nock.disableNetConnect());
  afterEach(() => { nock.cleanAll(); nock.enableNetConnect(); });

  it('maps hasRecipe=true and isSerialized=true when the fields are present/truthy', async () => {
    nock(BASE).get('/Manufacturing/Inventory/InventoryItem/100')
      .reply(200, { data: { Id: 100, ItemNumber: 'P', RecipeExists: true, Serialized: 'Y' } });
    const dw = createDwClient({ baseUrl: BASE }); dw.setAuthToken('t');
    const it = await dw.inventory.getById(100);
    expect(it?.hasRecipe).toBe(true);
    expect(it?.isSerialized).toBe(true);
  });

  it('maps hasRecipe=false when the recipe field is present but falsy', async () => {
    nock(BASE).get('/Manufacturing/Inventory/InventoryItem/101')
      .reply(200, { data: { Id: 101, ItemNumber: 'Q', RecipeExists: false, Serialized: 'N' } });
    const dw = createDwClient({ baseUrl: BASE }); dw.setAuthToken('t');
    const it = await dw.inventory.getById(101);
    expect(it?.hasRecipe).toBe(false);
    expect(it?.isSerialized).toBe(false);
  });

  it('leaves hasRecipe undefined when NO recipe field exists (unreliable signal)', async () => {
    nock(BASE).get('/Manufacturing/Inventory/InventoryItem/102')
      .reply(200, { data: { Id: 102, ItemNumber: 'R' } });
    const dw = createDwClient({ baseUrl: BASE }); dw.setAuthToken('t');
    const it = await dw.inventory.getById(102);
    expect(it?.hasRecipe).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run → FAIL** (`cd backend && npx vitest run test/dwClient/inventoryMeta.test.ts`) — fields don't exist yet.

- [ ] **Step 3: Implement.** In `inventory.ts`, add to `InventoryItem` type:

```typescript
  /** true/false if DW exposes a cost-recipe signal; undefined if no such field (unreliable). */
  hasRecipe?: boolean;
  /** true if the item is serial-tracked. */
  isSerialized?: boolean;
```

Add two module-level helpers (replace the guessed keys with the Task 1 findings, real key FIRST):

```typescript
const RECIPE_KEYS = ['RecipeExists', 'HasRecipe', 'CostRecipeId', 'RecipeCardId'];
const SERIAL_KEYS = ['Serialized', 'IsSerialized', 'SerialTracking', 'LotSerial'];
function readBoolMeta(obj: Record<string, unknown>, keys: string[]): boolean | undefined {
  for (const k of keys) {
    if (k in obj) {
      const v = obj[k];
      if (typeof v === 'boolean') return v;
      if (typeof v === 'number') return v > 0;
      if (typeof v === 'string') return ['y', 'true', '1'].includes(v.trim().toLowerCase());
      return Boolean(v);
    }
  }
  return undefined;
}
```

In `getById`, in the returned object add:

```typescript
        hasRecipe: readBoolMeta(obj, RECIPE_KEYS),
        isSerialized: readBoolMeta(obj, SERIAL_KEYS) ?? false,
```

- [ ] **Step 4: Run → PASS.** Then run the full inventory suite to confirm no regression:
  `cd backend && npx vitest run test/dwClient/`

- [ ] **Step 5: Commit**

```bash
git add backend/src/dwClient/inventory.ts backend/test/dwClient/inventoryMeta.test.ts
git commit -m "feat(validator): map recipe/serialized signals on InventoryItem.getById"
```

---

## Task 3: `validateReceipt` DW-client method (backend)

**Files:**
- Modify: `backend/src/dwClient/po.ts` (add `ValidateInput`/`ReceiptWarning`/`ValidateResult` types near the other types; add `validateReceipt` inside `makePOApi`'s returned object, after `retryReceipt`)
- Test: `backend/test/dwClient/validateReceipt.test.ts`

- [ ] **Step 1: Write the failing test** `backend/test/dwClient/validateReceipt.test.ts`

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import nock from 'nock';
import { createDwClient } from '../../src/dwClient/index.js';
const BASE = 'http://dw.test:8080/WebAPI';

function itemRow(id: number, extra: Record<string, unknown>) {
  return { data: { Id: id, ItemNumber: `P-${id}`, ...extra } };
}

describe('po.validateReceipt', () => {
  beforeEach(() => nock.disableNetConnect());
  afterEach(() => { nock.cleanAll(); nock.enableNetConnect(); });

  it('group A: warns for an item with hasRecipe=false', async () => {
    nock(BASE).get('/Manufacturing/Inventory/InventoryItem/100').reply(200, itemRow(100, { RecipeExists: false }));
    nock(BASE).get('/Labels/PrintLabel/MasterLabels/0').reply(200, { data: [] });
    const dw = createDwClient({ baseUrl: BASE }); dw.setAuthToken('t');
    const out = await dw.po.validateReceipt({ items: [{ arInvtId: 100, itemNumber: 'P-100', quantity: 5 }] });
    const a = out.warnings.find(w => w.kind === 'NO_RECIPE');
    expect(a?.items.map(i => i.arInvtId)).toEqual([100]);
  });

  it('group C: warns for serialized item with fractional qty, NOT for whole qty', async () => {
    nock(BASE).get('/Manufacturing/Inventory/InventoryItem/200').reply(200, itemRow(200, { Serialized: 'Y', RecipeExists: true }));
    nock(BASE).get('/Manufacturing/Inventory/InventoryItem/201').reply(200, itemRow(201, { Serialized: 'Y', RecipeExists: true }));
    nock(BASE).get('/Labels/PrintLabel/MasterLabels/0').reply(200, { data: [] });
    const dw = createDwClient({ baseUrl: BASE }); dw.setAuthToken('t');
    const out = await dw.po.validateReceipt({ items: [
      { arInvtId: 200, itemNumber: 'P-200', quantity: 2.1472 },
      { arInvtId: 201, itemNumber: 'P-201', quantity: 3 },
    ]});
    const c = out.warnings.find(w => w.kind === 'SERIAL_FRACTIONAL');
    expect(c?.items.map(i => i.arInvtId)).toEqual([200]);
  });

  it('dedups reads per arInvtId (same item on two lines = one DW read)', async () => {
    // Only ONE InventoryItem nock; a second read would throw on disableNetConnect.
    nock(BASE).get('/Manufacturing/Inventory/InventoryItem/300').reply(200, itemRow(300, { RecipeExists: true, Serialized: 'N' }));
    nock(BASE).get('/Labels/PrintLabel/MasterLabels/0').reply(200, { data: [] });
    const dw = createDwClient({ baseUrl: BASE }); dw.setAuthToken('t');
    const out = await dw.po.validateReceipt({ items: [
      { arInvtId: 300, itemNumber: 'P-300', quantity: 1 },
      { arInvtId: 300, itemNumber: 'P-300', quantity: 1 },
    ]});
    expect(out.warnings.filter(w => w.items.length).length).toBe(0);
  });

  it('never throws when one item read fails — that item is skipped, others still checked', async () => {
    nock(BASE).get('/Manufacturing/Inventory/InventoryItem/400').reply(500, 'boom');
    nock(BASE).get('/Manufacturing/Inventory/InventoryItem/401').reply(200, itemRow(401, { RecipeExists: false }));
    nock(BASE).get('/Labels/PrintLabel/MasterLabels/0').reply(200, { data: [] });
    const dw = createDwClient({ baseUrl: BASE }); dw.setAuthToken('t');
    const out = await dw.po.validateReceipt({ items: [
      { arInvtId: 400, itemNumber: 'P-400', quantity: 1 },
      { arInvtId: 401, itemNumber: 'P-401', quantity: 1 },
    ]});
    expect(out.warnings.find(w => w.kind === 'NO_RECIPE')?.items.map(i => i.arInvtId)).toEqual([401]);
  });
});
```

(Group B test is added once Task 1 confirms the master-label item-id + lot field names.)

- [ ] **Step 2: Run → FAIL** (`validateReceipt is not a function`).

- [ ] **Step 3: Add types** near the other exported types in `po.ts`:

```typescript
export type ValidateItemInput = { arInvtId: number; itemNumber: string; quantity: number };
export type WarningKind = 'NO_RECIPE' | 'RECIPE_UNRELIABLE' | 'ORPHAN_LABEL' | 'SERIAL_FRACTIONAL';
export type ReceiptWarning = {
  kind: WarningKind;
  /** Serbian one-liner summarizing the group, e.g. "Nema recept (Roll Inventory Cost)". */
  message: string;
  items: Array<{ arInvtId: number; itemNumber: string }>;
};
export type ValidateResult = { warnings: ReceiptWarning[] };
```

- [ ] **Step 4: Add `validateReceipt`** inside `makePOApi`'s returned object (after `retryReceipt`). It reads each distinct item in parallel, reads master-labels once, builds grouped warnings:

```typescript
    async validateReceipt(input: { items: ValidateItemInput[] }): Promise<ValidateResult> {
      // Dedup by arInvtId (same item may appear on several lines).
      const byId = new Map<number, ValidateItemInput>();
      for (const it of input.items) if (it.arInvtId > 0 && !byId.has(it.arInvtId)) byId.set(it.arInvtId, it);
      const distinct = [...byId.values()];

      const noRecipe: ReceiptWarning['items'] = [];
      const unreliable: ReceiptWarning['items'] = [];
      const serialFractional: ReceiptWarning['items'] = [];

      // Reads are safe to run in parallel (no Oracle SEQ writes). One failure must not abort.
      await Promise.all(distinct.map(async (it) => {
        try {
          const meta = await inventoryGetById(http, it.arInvtId);   // see helper note below
          if (meta?.hasRecipe === false) noRecipe.push({ arInvtId: it.arInvtId, itemNumber: it.itemNumber });
          else if (meta?.hasRecipe === undefined) unreliable.push({ arInvtId: it.arInvtId, itemNumber: it.itemNumber });
          if (meta?.isSerialized && !Number.isInteger(it.quantity)) {
            serialFractional.push({ arInvtId: it.arInvtId, itemNumber: it.itemNumber });
          }
        } catch (e) { logger.warn({ arInvtId: it.arInvtId, err: errMsg(e) }, 'validateReceipt: item read failed, skipping'); }
      }));

      // Group B (orphan labels) — added after Task 1 confirms label field names.

      const warnings: ReceiptWarning[] = [];
      if (noRecipe.length) warnings.push({ kind: 'NO_RECIPE', message: `${noRecipe.length} stavki nema recept (Roll Inventory Cost) — prijem će verovatno pasti za njih.`, items: noRecipe });
      if (unreliable.length) warnings.push({ kind: 'RECIPE_UNRELIABLE', message: `Za ${unreliable.length} stavki provera recepta nije pouzdana (DW ne vraća tu informaciju).`, items: unreliable });
      if (serialFractional.length) warnings.push({ kind: 'SERIAL_FRACTIONAL', message: `${serialFractional.length} serijalizovanih stavki ima razlomljenu količinu.`, items: serialFractional });
      return { warnings };
    },
```

> **Helper note:** `validateReceipt` lives in `po.ts` but needs the inventory item meta.
> Cleanest: pass `inventory.getById` in, OR add a tiny local `inventoryGetById(http, id)` that
> does the same GET. Decide at implementation time — preferred is to read via the existing
> `makeInventoryApi(http).getById` so the mapping (Task 2) is reused. If `po.ts` shouldn't
> import `inventory.ts`, inline a minimal GET that reuses the `readBoolMeta` keys. Keep
> `receivePO` untouched either way.

- [ ] **Step 5: Run → PASS.** Then full backend dwClient suite green.

- [ ] **Step 6: Commit**

```bash
git add backend/src/dwClient/po.ts backend/test/dwClient/validateReceipt.test.ts
git commit -m "feat(validator): validateReceipt groups no-recipe / serialized-fractional warnings"
```

---

## Task 4: `POST /:poId/receive-validate` route (backend)

**Files:**
- Modify: `backend/src/routes/po.ts` (add route after `/:poId/receive-retry`)
- Test: `backend/test/routes/poValidate.test.ts`

- [ ] **Step 1: Write the failing test** covering: 401 when unauthenticated; 400 `NO_VALID_ITEMS` for empty body; 200 with grouped warnings for a valid items list (nock the InventoryItem + MasterLabels calls).

- [ ] **Step 2: Run → FAIL** (route 404).

- [ ] **Step 3: Add the route** (mirrors `/create` input cleaning):

```typescript
  router.post('/:poId/receive-validate', async (req, res, next) => {
    try {
      const poId = Number(req.params.poId);
      if (!Number.isFinite(poId) || poId <= 0) { res.status(400).json({ error: 'INVALID_PO_ID' }); return; }
      const raw = Array.isArray(req.body?.items) ? req.body.items : [];
      const items = raw.map((r: unknown) => {
        const o = r as Record<string, unknown>;
        return { arInvtId: Number(o?.arInvtId ?? 0), itemNumber: String(o?.itemNumber ?? ''), quantity: Number(o?.quantity ?? 0) };
      }).filter((i: { arInvtId: number }) => i.arInvtId > 0);
      if (items.length === 0) { res.status(400).json({ error: 'NO_VALID_ITEMS' }); return; }
      const result = await req.dw!.po.validateReceipt({ items });
      logger.info({ poId, warningCount: result.warnings.length }, 'PO receipt validated');
      res.json({ poId, ...result });
    } catch (e) { next(e); }
  });
```

- [ ] **Step 4: Run → PASS.** **Step 5: Commit** `feat(validator): POST /:poId/receive-validate route`.

---

## Task 5: Frontend API client — `validateReceipt` + types

**Files:**
- Modify: `frontend/src/api/client.ts` (add `ReceiptWarning`/`ValidateResult` types; add `validateReceipt`)
- Test: `frontend/test/api/validateReceipt.test.ts`

- [ ] **Step 1: Failing test** — `api.validateReceipt(poId, items)` POSTs `{ items }` to `/api/po/:poId/receive-validate` and returns the parsed `{ poId, warnings }`.

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Add types + method:**

```typescript
export type WarningKind = 'NO_RECIPE' | 'RECIPE_UNRELIABLE' | 'ORPHAN_LABEL' | 'SERIAL_FRACTIONAL';
export type ReceiptWarning = { kind: WarningKind; message: string; items: Array<{ arInvtId: number; itemNumber: string }> };

  validateReceipt: (poId: number, items: Array<{ arInvtId: number; itemNumber: string; quantity: number }>) =>
    req<{ poId: number; warnings: ReceiptWarning[] }>(`/api/po/${poId}/receive-validate`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items }),
    }),
```

- [ ] **Step 4: Run → PASS. Step 5: Commit** `feat(validator): frontend api.validateReceipt + ReceiptWarning type`.

---

## Task 6: WorkOrders page — automatic warning panel

**Files:**
- Modify: `frontend/src/pages/WorkOrders.tsx`
- Test: `frontend/test/pages/WorkOrdersValidate.test.tsx`

- [ ] **Step 1: Failing test.** Mock `api.createPO` to return `lineItems` with a couple of items;
  mock `api.validateReceipt` to return one `NO_RECIPE` group. Assert: after clicking "Kreiraj PO",
  `api.validateReceipt` is called automatically with the created line items; a panel with the
  group message appears; the "Prijem" button is **still enabled** (not disabled by the panel);
  expanding the group lists the affected item numbers.

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Implement.** Add a `validateMutation` (or `useQuery` keyed on `poId`) that fires in a
  `useEffect` on `createPOMutation.isSuccess`, sending `createPOMutation.data.lineItems` mapped to
  `{ arInvtId, itemNumber, quantity }`. Render a panel between the create-success summary (~line 187)
  and the receive button (~line 189):
  - while pending: "Proveravam stavke...";
  - on error: "Provera nije uspela (prijem i dalje moguć)" — **must not disable receive**;
  - on success with warnings: one block per `warning`, each collapsible to list `items` (item numbers);
  - on success with none: "Nema upozorenja — sve stavke izgledaju spremne za prijem."
  The receive button's `disabled` stays exactly as today (only `receivePOMutation` state) — the panel
  never gates it.

- [ ] **Step 4: Run new test → PASS. Step 5: Run existing `WorkOrders.test.tsx` + `WorkOrdersRetry.test.tsx` → no regression.**

- [ ] **Step 6: Commit** `feat(validator): automatic grouped warning panel above receive`.

---

## Task 7: Full verification

- [ ] **Step 1: Backend** — `cd backend && npx vitest run` (was 94; expect 94 + new tests, all green).
- [ ] **Step 2: Frontend** — `cd frontend && npx vitest run` (was 20; expect 20 + new, all green).
- [ ] **Step 3: Typecheck** — `cd frontend && npx tsc -b` clean. (Backend build still hits the pre-existing pino-http error in `server.ts`; that is NOT ours and does not affect vitest/dev — see PROJECT-OVERVIEW.)
- [ ] **Step 4: Manual smoke (requires DW VM, USER):** create a PO containing one of the ~50 no-recipe items; confirm the panel auto-shows "nema recept" with that item listed and that the "Prijem" button is still clickable.
- [ ] **Step 5: Handoff** — append outcome to `docs/handoff-2026-06-02.md`; refresh `PROJECT-OVERVIEW.md` and the `.cowork-handoff/` next-steps. (Git push only on explicit request.)

---

## Self-review notes (spec coverage)

- Spec §3 (automatic, grouped, collapsible panel above receive; receive stays active) → Task 6.
- Spec §4 (Pristup 1: lineItems → new route → per-distinct-item parallel reads + one label read; receivePO untouched) → Tasks 3, 4, 5; dedup + parallel + fail-soft in Task 3.
- Spec §4 A/B/C signals → Task 2 (recipe/serial mapping), Task 3 (A + C logic; B after Task 1), Task 1 (field discovery).
- Spec §5 (validate failure never blocks; A degrades to "nepouzdano" when no signal; dedup; 401/403 passthrough) → Tasks 3 (RECIPE_UNRELIABLE, fail-soft), 4 (passthrough via next(e)), 6 (panel never disables receive).
- Spec §6 (TDD, fixtures, per-layer tests, receive button stays active) → every task is test-first.
- Spec §8 open questions (recipe field, serial flag, orphan heuristic) → Task 1 probe; defensive multi-key code keeps the rest unblocked.
```
