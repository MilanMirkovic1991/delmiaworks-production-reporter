# HANDOFF — slika za sutra

> Kratak snimak za nastavak. Detaljna istorija/odluke su u `CLAUDE.md` (sekcije
> „Trenutno stanje" i „Changelog"). Ovde držim samo ono što treba da odmah nastavim.

_Poslednje ažuriranje: 2026-06-03._

## Trenutno stanje

- Branch `main` == `origin/main` (poslednji commit `c0e5d53`). Komitovan deo:
  validator (Tasks 2–6) i konsolidacija handoff/changelog u `CLAUDE.md`.
- Testovi zeleno: **backend 110/110, frontend 31/31**. `tsc` čist osim
  PRE-POSTOJEĆE pino-http greške u `server.ts` (nije naša, ne smeta dev/test).
- **NEKOMITOVANO (danas):** http-sloj provlači DW `FriendlyMessage` do UI; frontend
  prikazuje grupisan rezime neuspeha prijema; `receivePO` na labelu šalje qty koju
  je DW upisao na prijem (ispravka decimala za serijalizovane artikle). Srž
  `receivePO` / `retryReceipt` / `createPurchaseOrder` NETAKNUTA.
- E2E radi: login → EPlant → SO/artikal → BOM → stablo WO → priprema nabavke →
  kreiranje PO → prijem (Lot, FGMULTI, MASTER_LABEL, 7-cifren serijski) → retry →
  pre-receive validator.
- Faze: Phase 1 GOTOVA; Phase 3 (PO+prijem+nalepnice) radi, u testiranju; Retry
  GOTOVO; Validator IMPLEMENTIRAN (ostaje Task 1 i grupa B). Phase 2 / 4 / 5 NISU počele.
- Live (PO 20, danas): prijem **99/111**. Ujutru je sekvenca `S_EPLANT_PO_REC_13`
  nestala (ORA-14552), ručni prijem u DW je inicijalizovao brojač pa je prošlo 99.
  Preostalih 12 = DW master-data (ne naš bug), 4 kategorije (A recept, B lot/orphan,
  C serijalizovano+preciznost, D currency).

## Sledeći koraci (po prioritetu)

1. **Commit današnjeg NEKOMITOVANOG rada** (DW FriendlyMessage + grupisan rezime +
   decimal-mirror za serijalizovane). TDD je već prošao, ostaje samo commit/push.
   NB: Cowork mount blokira git upis — komituj sa Windows-a.
2. **Orphan cleanup tool** (`backend/tools/list-orphan-receipts.ts`, `npx tsx`):
   naći PO_RECEIPTS bez vezanog FGMULTI (ostaci od palih prijema) i ponuditi DELETE
   pre nego što Phase 4 krene. Verovatno leči i grupu B.
3. **Task 1 — proba DW VM:** `backend/tools/peek-*.ts` → tačna imena polja za recept
   (grupa A) i serijalizaciju (grupa C) → na početak `RECIPE_KEYS` / `SERIAL_KEYS` u
   `dwClient/inventory.ts`. Tako validator UPOZORAVA PRE klika (sad rezime stiže POSLE
   prijema). Probu obrisati pre commita.
4. **Grupa D istraga:** `peek` na `poReceiptId` iz grupe D → utvrditi koji DW podatak
   (valuta na dobavljaču/artiklu) fali.
5. Zaokruživanje razlomljene količine (grupa C) → Phase 2 (kreiranje WO) → Phase 4
   (auto prijava od dna BOM-a ka vrhu) → Phase 5 (hardening).

## Donete odluke i zašto

- **Validator samo upozorava, nikad ne blokira** dugme „Prijem". Put prijema
  (`receivePO`/`retryReceipt`/`createPurchaseOrder`) mora ostati stabilan.
- Panel upozorenja automatski (auto-poziv `receive-validate`), grupisan; `itemNumber`
  se mapira iz BOM-a (`purchaseItems`) jer `createPO.lineItems` ne nosi broj artikla.
- `MASTER_LABEL.SERIALNO` = globalni monotoni max+1 (7 cifara, nikad duplikat);
  `PO_RELEASES.Seq` = per-arInvtId brojač.
- Decimala za serijalizovane: na labelu ide qty koju je DW upisao na prijem
  (`CreatePOReceipt` body `Qty`), bez zaokruživanja s naše strane (mirror DW vrednosti).

## Otvoreni problemi / blokeri

- 12 neuspelih (PO 20) = DW master-data, rešava se u DW ne u kodu. Grupu A je korisnik
  već ručno sredio (roll cost) — ako VM snapshot vrati pre toga, recepture ponoviti.
- Raste broj orphan PO_RECEIPTS od palih prijema → treba cleanup tool (korak 2).
- Cowork mount blokira git upis i `rm` → commit/brisanje radi na Windows-u.
- Junk od vitest-a: `*.timestamp-*.mjs` → obrisati ili u `.gitignore`.
- NE komitovati: `Cene.xlsx`, `Cene_popunjen.xlsx`, `Cene/`, `_fill_cene.py`.
- `git status` ima CRLF↔LF šum → prave izmene gledaj sa `git diff --ignore-all-space --stat`.

## Izmenjeni fajlovi (NEKOMITOVANO, današnji rad)

- `backend/src/dwClient/http.ts` — `extractDwFriendlyMessage` (DW poruka do pozivaoca)
- `backend/src/dwClient/po.ts` — `receivePO` qty-mirror za serijalizovane + jednokratni
  `DW response sample (CreatePOReceipt)` log
- `backend/test/dwClient/po.test.ts`, `backend/test/dwClient/dwError.test.ts` (nov)
- `frontend/src/utils/classifyReceiptError.ts` (nov) + test
- `frontend/src/pages/WorkOrders.tsx` — grupisan panel rezimea neuspeha prijema
- `CLAUDE.md` — ažurirano „Trenutno stanje" i „Changelog"

## Komande

- Test sve: `npm test`  ·  Build: `npm run build`
- Dev: `npm run dev:backend` + `npm run dev:frontend` (frontend Vite :5174)
- Windows: `pokreni.bat` / `zaustavi.bat`
- Prave izmene (bez CRLF šuma): `git diff --ignore-all-space --stat`
