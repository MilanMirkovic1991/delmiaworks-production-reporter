# SESSION CONTEXT — DelmiaWorks Production Reporter

Samostalan kontekst za nastavak u novoj sesiji. Na početku nove sesije pokaži/zalepi
ovaj fajl (ili ga drži kao projektni `CLAUDE.md`). Sažeta dnevna slika je u
`HANDOFF.md`; istorija u `CHANGELOG.md`; širi pregled u `PROJECT-OVERVIEW.md`.

> Napomena o `/resume`: u Claude Code `/resume` nastavlja prethodnu sačuvanu sesiju
> iz njenog transkripta — NE učitava proizvoljan markdown. Za auto-učitavanje memorije
> koristi `CLAUDE.md` (globalni/projektni). Ovaj fajl je za ručno učitavanje konteksta.

## Šta je aplikacija

Wizard koji automatizuje prijavljivanje proizvodnje u DelmiaWorks-u preko WebAPI-ja.
Tok: login → izbor EPlant-a → Sales Order / artikal → BOM → stablo radnih naloga →
priprema nabavke → kreiranje PO → prijem sa nalepnicama → retry neuspelih → pre-receive
validator. Cilj koji još NIJE urađen: automatska prijava proizvodnje od dna BOM-a ka vrhu
(Phase 4) i kreiranje radnih naloga (Phase 2).

Repo: `delmiaworks-production-reporter` (Windows host),
https://github.com/MilanMirkovic1991/delmiaworks-production-reporter. Branch `main`.

## Stek i pokretanje

- Monorepo (npm workspaces): `backend` (Express + tsx + DW WebAPI klijent) i
  `frontend` (React + Vite, port 5174). Node ≥ 20. TypeScript svuda. Vitest za testove.
- Komande (iz korena):
  - Test sve: `npm test`  (pojedinačno: `npm --workspace backend run test`,
    `npm --workspace frontend run test`)
  - Build: `npm run build`
  - Dev: `npm run dev:backend` (tsx watch) + `npm run dev:frontend` (vite :5174)
  - Windows: `pokreni.bat` (git pull --ff-only → npm install po potrebi → start),
    `zaustavi.bat` (gašenje).
- Stanje testova: backend 105/105, frontend 22/22 zeleno. `tsc` čist osim
  PRE-POSTOJEĆE pino-http greške u `backend/src/server.ts` (nije naša, ne utiče na dev/test).

## Fajl-mapa (gde šta živi)

Backend DW klijent (`backend/src/dwClient/`):
- `auth.ts` login/sesija, `http.ts` HTTP omotač, `filter.ts` OData-style filteri,
  `shared.ts`/`types.ts` pomoćno.
- `salesOrders.ts`, `bom.ts`, `workOrders.ts`, `inventory.ts`, `eplants.ts`, `po.ts`.
- `inventory.ts`: `InventoryItem` ima `hasRecipe?` / `isSerialized?`; `getById` mapira
  preko `readBoolMeta` + kandidatske liste `RECIPE_KEYS` / `SERIAL_KEYS` (defanzivno —
  vidi „Otvoreno", Task 1).
- `po.ts`: `createPurchaseOrder`, `receivePO`, `retryReceipt`, `validateReceipt`.
  Tipovi: `ValidateItemInput`, `WarningKind`, `ReceiptWarning`, `ValidateResult`.

Backend rute (`backend/src/routes/`): `auth`, `eplants`, `salesOrders`, `items`, `bom`,
`workOrders`, `workOrderTree`, `po`. Servisi: `bomTreeBuilder.ts`,
`workOrderTreeBuilder.ts`. Middleware: `requireSession.ts`, `errorHandler.ts`.

Frontend (`frontend/src/`): stranice `Login`, `SelectEPlant`, `SalesOrdersList`,
`SalesOrderItems`, `Releases`, `WorkOrders`. Wizard stanje: `store/wizardStore.ts`.
API klijent: `api/client.ts` (+ `api/types.ts`). Util: `utils/collectPurchased.ts`.

Dokumentacija: `docs/superpowers/specs/` (dizajn) i `docs/superpowers/plans/` (TDD planovi).
Dnevni handoff-i: `docs/handoff-YYYY-MM-DD.md`. Cowork handoff-i: `.cowork-handoff/`.

## Donete odluke i konvencije

- **Pre-receive validator samo upozorava, nikad ne blokira** dugme „Prijem" (Pristup 1).
  `receivePO` / `retryReceipt` / `createPurchaseOrder` ostaju NETAKNUTI → put prijema stabilan.
- Validator grupe: A = nema recepta (`NO_RECIPE` / `RECIPE_UNRELIABLE`),
  B = orphan MASTER_LABEL (još NIJE implementiran), C = serijalizovan + razlomljena
  količina (`SERIAL_FRACTIONAL`). Dedup po `arInvtId`, paralelna čitanja, fail-soft po stavci.
- Panel upozorenja je automatski (auto-poziv `receive-validate` pri otvaranju), grupisan,
  proširiv. `itemNumber` se mapira iz BOM-a (`purchaseItems`) jer `createPO.lineItems`
  ne nosi broj artikla.
- DW master-data bug-fix-ovi (drže se): `MASTER_LABEL.SERIALNO` = globalni monotoni max+1
  (7 cifara, nikad duplikat); `PO_RELEASES.Seq` = per-arInvtId brojač (preko
  `UpdatePOReleaseItem`). PO se kreira sa PO_RELEASES, Seq, auto-approve.
- TDD: prvo test pa implementacija; Conventional Commits poruke.
- Sve protiv DW-a ide preko WebAPI-ja (bez direktnog pisanja u bazu).

## Stanje faza

- Phase 1 (read-only): GOTOVA.
- Phase 3 (PO + prijem + nalepnice): radi end-to-end, u testiranju protiv DW VM.
- Retry neuspelih prijema: GOTOVO, spojeno, objavljeno.
- Pre-receive validator (Tasks 2–6): IMPLEMENTIRAN, komitovan i pushovan
  (`f678b8b…a833901`). Ostaje: Task 1 (proba DW VM) i grupa B.
- Phase 2 (kreiranje WO): NIJE počela. Phase 4 (prijava proizvodnje): NIJE počela.
  Phase 5 (hardening): NIJE počela.

## Otvoreno / sledeći koraci (po prioritetu)

1. **Razložiti neuspeh na ostatku stavki u prijemu od 2026-06-02** (posle 100 uspelih).
   Detalji još nisu prikupljeni; utvrditi je li u domenu validatora (A/B/C) ili nov slučaj.
2. **Task 1 — proba DW VM:** `backend/tools/peek-*.ts` (`npx tsx`) → potvrditi TAČNA imena
   polja za recept (A) i serijalizaciju (C); pravi ključ na početak `RECIPE_KEYS`/`SERIAL_KEYS`
   u `inventory.ts`; probu obrisati pre commita.
3. **Grupa B (orphan MASTER_LABEL):** dodati heuristiku (`validateReceipt` već čita
   `MasterLabels/0` jednom).
4. Zaokruživanje razlomljene količine (lek za grupu C) → Phase 2 → Phase 4 → Phase 5.

## Blokeri / zamke okruženja

- Cowork mount blokira git upis (`.git/index.lock` „Operation not permitted") i `rm`
  (brisanje fajlova). Commit/brisanje raditi na Windows-u.
- Junk od vitest-a: `backend/vitest.config.ts.timestamp-*.mjs`,
  `frontend/vite.config.ts.timestamp-*.mjs` — obrisati na Windows-u ili `*.timestamp-*.mjs`
  u `.gitignore`.
- NE komitovati: `Cene.xlsx`, `Cene_popunjen.xlsx`, `Cene/`, `_fill_cene.py` (nepovezano).
- `git status` često pokazuje CRLF↔LF šum; prave izmene vidi sa
  `git diff --ignore-all-space --stat`.
