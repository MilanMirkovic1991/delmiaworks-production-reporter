# CLAUDE.md — DelmiaWorks Production Reporter

Jedini instrukcioni fajl projekta. Auto-učitava se na startu sesije; dopunjuje globalni
`CLAUDE.md` (MES/shop-floor preferencije). Dublja arhitektura/fajl-mapa (opciono):
`docs/SESSION-CONTEXT.md`.

## Šta je app (ukratko)

Wizard koji preko DelmiaWorks WebAPI-ja automatizuje prijavljivanje proizvodnje:
login → EPlant → Sales Order/artikal → BOM → stablo radnih naloga → priprema nabavke →
kreiranje PO → prijem sa nalepnicama → retry → pre-receive validator. Cilj koji još NE
radi: automatska prijava proizvodnje od dna BOM-a ka vrhu (Phase 4) i kreiranje WO (Phase 2).
Sve protiv DW-a ide preko WebAPI-ja.

## Stek i komande

Monorepo (npm workspaces): `backend` (Express + tsx) i `frontend` (React + Vite :5174).
Node ≥ 20, TypeScript, Vitest.
- Test sve: `npm test` · Build: `npm run build`
- Dev: `npm run dev:backend` + `npm run dev:frontend`
- Windows: `pokreni.bat` / `zaustavi.bat`

## Način rada (poštuj)

- Pre većih izmena: kratak plan + pretpostavke, pa sačekaj potvrdu. Ne pogađaj — ako fali
  informacija, pitaj jednim konkretnim pitanjem.
- Produkcioni kvalitet (pouzdanost, obrada grešaka, sledljivost). Reci šta si proverio, šta nisi.
- TDD; Conventional Commits. Ne diraj `receivePO` / `retryReceipt` / `createPurchaseOrder`
  bez razloga — put prijema mora ostati stabilan.
- Trajno stanje/odluke upisuj OVDE (sekcije „Trenutno stanje" i „Changelog"), ne samo u chat.

---

## Trenutno stanje (slika za nastavak — ažuriraj na kraju dana)

- Branch `main` == `origin/main`. Validator (Tasks 2–6) komitovan i pushovan
  (`f678b8b…a833901`). Testovi: **backend 105/105, frontend 22/22** zeleno. `tsc` čist
  osim PRE-POSTOJEĆE pino-http greške u `server.ts` (nije naša, ne utiče na dev/test).
- E2E radi: login → SO/artikal → BOM → stablo WO → priprema nabavke → kreiranje PO
  (PO_RELEASES, Seq, auto-approve) → prijem (Lot, FGMULTI, MASTER_LABEL, unikatan
  7-cifren serijski) → retry → pre-receive validator (panel upozorenja, grupe A i C).
- Faze: Phase 1 GOTOVA; Phase 3 (PO+prijem+nalepnice) radi, u testiranju; Retry GOTOVO;
  Validator IMPLEMENTIRAN (ostaje Task 1 i grupa B). Phase 2 / Phase 4 / Phase 5 NISU počele.
- 2026-06-02 live: prijem **100 stavki uspeo**; **ostatak stavki nije prošao** — detalji
  još nisu prikupljeni.

### Sledeći koraci (po prioritetu)

1. **Razložiti neuspeh na ostatku stavki u prijemu od 2026-06-02** (posle 100 uspelih).
   Utvrditi je li u domenu validatora (grupe A/B/C) ili nov slučaj. **Najhitnije.**
2. **Task 1 — proba DW VM:** `backend/tools/peek-*.ts` (`npx tsx`) → potvrditi TAČNA imena
   polja za recept (A) i serijalizaciju (C); pravi ključ na početak `RECIPE_KEYS` /
   `SERIAL_KEYS` u `backend/src/dwClient/inventory.ts`; probu obrisati pre commita.
3. **Grupa B (orphan MASTER_LABEL):** dodati heuristiku (`validateReceipt` već čita
   `MasterLabels/0` jednom).
4. Zaokruživanje razlomljene količine (lek za grupu C) → Phase 2 (kreiranje WO) →
   Phase 4 (prijava proizvodnje) → Phase 5 (hardening).

### Donete odluke i zašto

- **Validator samo upozorava, nikad ne blokira** dugme „Prijem" (Pristup 1).
  `receivePO` / `retryReceipt` / `createPurchaseOrder` NETAKNUTI → put prijema stabilan.
- Panel upozorenja automatski (auto-poziv `receive-validate`), grupisan; `itemNumber`
  se mapira iz BOM-a (`purchaseItems`) jer `createPO.lineItems` ne nosi broj artikla.
- `MASTER_LABEL.SERIALNO` = globalni monotoni max+1 (7 cifara, nikad duplikat);
  `PO_RELEASES.Seq` = per-arInvtId brojač.

### Otvoreni problemi / blokeri

- Ostatak stavki u prijemu nije prošao — uzrok nepoznat dok se ne prikupe detalji (korak 1).
- Cowork mount blokira git upis i `rm` — commit/brisanje na Windows-u.
- Junk od vitest-a: `*.timestamp-*.mjs` (backend/frontend) — obrisati ili u `.gitignore`.
- NE komitovati: `Cene.xlsx`, `Cene_popunjen.xlsx`, `Cene/`, `_fill_cene.py`.
- `git status` ima CRLF↔LF šum → prave izmene: `git diff --ignore-all-space --stat`.

---

## Changelog (dopisuj najnovije na vrh)

- **2026-06-02** — Implementiran i objavljen pre-receive validator (Tasks 2–6, TDD):
  `validateReceipt` + ruta `POST /:poId/receive-validate` + automatski panel upozorenja
  (grupe A recept, C serijalizovano+razlomljeno); `receivePO` netaknut. Testovi
  backend 105/105, frontend 22/22. Live: prijem 100 stavki uspeo; ostatak za analizu sutra.
