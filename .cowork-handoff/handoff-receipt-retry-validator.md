# Handoff — Receipt Retry (završeno) + Pre-Receive Validator (u dizajnu)

Ova sesija je nastavak `handoff-po-receive-fixes.md` — njegovih „Sledećih koraka"
#4 i #5: **#4 retry-dugme po redu = ZAVRŠENO i objavljeno; #5 pre-receive validator
= sada u fazi dizajna.**

## Trenutno stanje

- Repo: `delmiaworks-production-reporter` (Windows, https://github.com/MilanMirkovic1991/delmiaworks-production-reporter).
- Branch `main`, head `eefe298`. **Push-ovano** (lokalno = remote).
- **94/94 backend + 20/20 frontend testova prolaze.**
- Working tree: samo nepovezani `Cene*.xlsx` / `_fill_cene.py` (NE komitovati).

**Završeno ove sesije:**
- **Retry („Ponovi neuspeli prijem")** — gotovo, prošlo pun pregled, spojeno u `main`,
  objavljeno. Dugme „Ponovi" po neuspelom redu + „Ponovi sve neuspele" iznad tabele.
  Ponavlja se SAMO taj red i „nastavlja odakle je stao" (ne pravi dupli `PO_RECEIPTS`).
  Backend: nova `retryReceipt` + ruta `POST /api/po/:poId/receive-retry`; `receivePO`
  NETAKNUT. Batch staje samo na isteklu sesiju (401/403), ne na običnu DW grešku.
- Napisan i objavljen pun pregled projekta: **`docs/handoff-2026-06-01.md`** (cela
  aplikacija — pročitati PRVO za potpunu sliku).

**U dizajnu (NEMA koda, NEMA spec-a još):**
- **Pre-receive validator** — upozorenja pre prijema PO-a da se neuspesi spreče unapred.
  Dogovorene odluke su niže; stali smo na potvrdi „Pristupa 1" pre pisanja spec-a.

**Aplikacija radi end-to-end:** login → SO/artikal → BOM → WO stablo → priprema nabavke →
kreiranje PO (+PO_RELEASES, Seq, auto-approve) → prijem (Lot, FGMULTI, MASTER_LABEL,
unikatan 7-cifren Serial) → retry neuspelih. Ne radi: prijava proizvodnje (Phase 4).

## Sledeći koraci (po prioritetu)

1. **Nastavi dizajn validatora:** potvrdi „Pristup 1" sa korisnikom → izloži pune sekcije
   dizajna → upiši spec u `docs/superpowers/specs/2026-06-01-pre-receive-validator-design.md`
   → korisnik pregleda → `writing-plans`.
2. **Prvi zadatak plana = proba DW test okruženja** (vidi „Blokeri"): naći koje DW polje
   otkriva (A) recept i (C) serijalizovan artikal. Pisati `backend/tools/peek-*.ts`,
   pokrenuti `npx tsx`, ubaciti nalaz u kod+komentare, obrisati probu pre commita. Tek po
   tome graditi.
3. **Implementacija** (subagent-driven-development, TDD): `validateReceipt` u
   `backend/src/dwClient/po.ts`, ruta `POST /api/po/:poId/receive-validate`, panel
   upozorenja u `frontend/src/pages/WorkOrders.tsx`. `receivePO` ostaje netaknut.
4. (Niže, iz `docs/handoff-2026-06-01.md` §9): zaokruživanje razlomljene količine (lek za
   grupu C), Phase 2 (kreiranje WO / prijava proizvodnje), čišćenje zaostalih DW redova,
   zaštita porta 5173, osvežavanje README.
5. **DW admin (korisnik), preneto iz prethodnog handoff-a:** „Roll Inventory Cost" za ~50
   arInvtId sa „No recipe card"; obrisati orphan MASTER_LABEL 254 i 327.

## Donete odluke i zašto

**Pre-receive validator — dizajn dogovoren ove sesije:**
- **Tri provere** (od 4 grupe neuspeha iz živog testa PO #23; grupu D — prolazno „PO Receipt
  not found determining currency" — već rešava retry):
  - **A — artikal nema recept** („No recipe card / Roll Inventory Cost"), ~50/55 — najveća korist.
  - **B — orphan MASTER_LABEL bez lota** za taj artikal.
  - **C — serijalizovan artikal + razlomljena količina** (npr. 2.1472).
- **Ponašanje: SAMO upozorava — ne blokira i ne preskače.** Razlog: lažna uzbuna ne sme da
  zaustavi ispravan prijem; korisnik zadržava punu kontrolu.
- **Obim: sve tri odjednom, ali implementacija KREĆE od probe DW test okruženja** za polja
  A i C. Ako pouzdanog signala za recept (A) nema preko WebAPI-ja → grupa A radi „najbolje
  što može" uz jasnu napomenu. Razlog: A je najvrednija ali nesigurna dok se ne proba.
- **Prikaz: automatski.** Čim se PO napravi, provera se sama pokrene i prikaže GRUPISAN/sažet
  panel iznad dugmeta „Prijem" (npr. „50 stavki nema recept", „3 serijalizovane sa
  razlomljenom količinom"). Dugme za prijem ostaje aktivno. Razlog: automatski = ne previdi
  se; grupisano jer spisak ume biti dug (~50).
- **Arhitektura — „Pristup 1" (preporučen, ISTI obrazac kao retry):** frontend već ima
  stavke iz odgovora `createPO` (`lineItems`: arInvtId, quantity, poDetailId, releaseId) i
  pošalje ih novoj ruti `…/receive-validate`. Backend za svaki RAZLIČIT artikal pročita DW
  podatke (recept, serijalizovan) — čitanja, mogu paralelno (nema Oracle sequence trke kao
  kod upisa); plus jedno čitanje `GET /Labels/PrintLabel/MasterLabels/0` za grupu B. Vraća
  grupisana upozorenja. `receivePO` NETAKNUT.

**Probano i ODBAČENO (ne ponavljati):**
- **„Suvi prolaz" kroz `receivePO`** (dodati mu režim provere bez upisa) — ODBAČENO: dira
  namerno stabilizovan `receivePO`; isti razlog zbog kog je i retry zasebna funkcija.
- **Upozorenja unutar odgovora `createPO`** — ODBAČENO: меša kupovinu (kreiranje PO-a) sa
  proverom prijema; teže za održavanje i testiranje.
- **Prikaz „na dugme Proveri"** (može da se zaboravi) i **„u potvrdi pri kliku na Prijem"**
  (nezgodno za dug spisak u iskočnoj poruci) — ODBAČENI u korist automatskog panela.

(Za ranije odbačene pristupe oko Seq/Serial bugova vidi `handoff-po-receive-fixes.md`.)

## Izmenjeni / relevantni fajlovi

**Retry — već spojeno/objavljeno:**
- `backend/src/dwClient/po.ts` — dodate `retryReceipt` + `resolveResumeStage`;
  `receivePO`/`createPurchaseOrder` netaknuti.
- `backend/src/routes/po.ts` — dodata ruta `POST /:poId/receive-retry` (+ `looksLikeAuthError`).
- `frontend/src/api/client.ts` — `retryReceipts` poziv + tipovi `ReceiptRow` / `RetryRow`.
- `frontend/src/pages/WorkOrders.tsx` — dugmad „Ponovi" / „Ponovi sve neuspele" u „Detalji prijema".
- Testovi: `backend/test/dwClient/{resumeStage,retryReceipt}.test.ts`,
  `backend/test/routes/poRetry.test.ts`,
  `frontend/test/{api/retryReceipts.test.ts, pages/WorkOrdersRetry.test.tsx}`.

**Validator — tek treba dirati (orijentacija):**
- `backend/src/dwClient/po.ts` — OVDE nova `validateReceipt`.
- `backend/src/dwClient/inventory.ts` — `getById(arInvtId)` → `/Manufacturing/Inventory/InventoryItem/{id}`;
  sad mapira samo osnovna polja → **meta probe** za polja „recept" i „serijalizovan".
- `backend/src/routes/po.ts` — OVDE nova ruta `…/receive-validate`.
- `frontend/src/api/client.ts` — OVDE poziv + tip.
- `frontend/src/pages/WorkOrders.tsx` — `createPOMutation.data.lineItems` = izvor stavki;
  OVDE panel upozorenja.

**Dokumentacija / kontekst:**
- `docs/handoff-2026-06-01.md` — pun pregled projekta (retry + cela aplikacija). **Prvo pročitati.**
- `docs/handoff-2026-05-27.md` — DW znanje, 4 grupe neuspeha, trijaža grešaka, DTO oblici.
- `docs/superpowers/specs|plans/2026-06-01-retry-receipts*` — spec/plan retry-a (obrazac koji validator preslikava).
- `.cowork-handoff/handoff-po-receive-fixes.md` — handoff druge konsolidovane sesije (Seq/Serial fix).

## Otvoreni problemi / blokeri

- **(GLAVNI) Grupa A — detekcija recepta:** ne zna se koje DW polje/poziv kaže „ima/nema
  recept". Mora proba na DW test VM. Bez mrežnog pristupa toj VM ne može se potvrditi.
  Najveća korist validatora zavisi od ovoga.
- **Grupa C — zastavica „serijalizovan":** verovatno postoji na `InventoryItem`, ali nije
  mapirana; potvrditi probom.
- **Grupa B — „orphan" je heuristika:** master nalepnice za artikal bez lota; izoštriti na
  pravim podacima.
- Dizajn validatora nije još potvrđen (Pristup 1 preporučen, čeka „OK") ni zapisan u spec.
- **Pre-postojeće (nije naše):** `npm run build` na backendu pukne na JEDNOJ grešci u
  `backend/src/server.ts` (pino-http, call signature) — na `main` od ranije; ne utiče na
  `vitest` ni `dev`.
- **DW master-data neuspesi (iz živog testa, nije kod):** ~50 „No recipe card", 2 orphan
  label (254/327), 3 serijalizovan+razlomljeno, 3 transient currency. Detalji: `docs/handoff-2026-05-27.md`.

## Komande

```bash
# Instalacija (koren; npm workspaces)
npm install

# Pokretanje (dva terminala; ili pokreni.bat / zaustavi.bat u korenu)
cd backend  && npm run dev     # http://localhost:3001
cd frontend && npm run dev     # http://localhost:5174

# Testovi (pokrenuti OBA pre commita)
cd backend  && npx vitest run  # 94 testa
cd frontend && npx vitest run  # 20 testova

# Build
npm run build
# NAPOMENA: backend build vrati grešku zbog PRE-POSTOJEĆE greške u
# backend/src/server.ts (pino-http) — nije od nas, ne utiče na testove/dev.

# DW WebAPI proba (jednokratno, obrisati pre commita)
cd backend && npx tsx tools/peek-<thing>.ts
#   DTO:     GET /Help/Api?apiId=METHOD-Area-Controller-Action-...
#   Katalog: GET /Help  → grep apiId=...Controller → GET /Help/Controller?apiId=<full>

# Git: komituj slobodno; PUSH samo na eksplicitan zahtev korisnika.
```

DW test okruženje: URL `http://192.168.20.28:8080/WebAPI`, user `IQMS` / `iqms`, baza
`IQORA`, EPlant `13`, approver badge `001`. Token iz `POST /User/Login` ide kao zaglavlje
`AuthToken`.

## Pravila rada

- **Korisniku piši na srpskom**, neformalno („ti"), JEDNOSTAVNIM rečnikom — bez teškog
  programerskog žargona; objasni šta nešto RADI, ne pukim terminima. Kod, komentari i commit
  poruke na engleskom; tekst u interfejsu na srpskom. Domenski pojmovi (prijem, lot, serijski,
  release, PO) su OK.
- **BEZBEDNOSNO pravilo:** NE izmišljaj cene i ne pretražuj široko po internetu za
  ograničene/vojne artikle (PENTRIT/PETN, Heksogen/RDX, Heksotol, Olovo Azid, Olovo Stifnat,
  Barut, KAPISLA, PRIPALA; interne PP/FP oznake tipa UR-9, RK-35, DB-23, GRAD S, RK-30).
  Reč je o legitimnom, licenciranom proizvođaču municije koji radi interni ERP — ostani na
  internim ERP podacima.
- **Conventional Commits.** `feat(scope):`, `fix(scope):`, `chore:`, `docs:`. Telo objašnjava
  ZAŠTO. Trailer `Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>`. Uvek NOV commit;
  nikad `--no-verify` / `--no-gpg-sign` / `--amend`. **PUSH samo na eksplicitan zahtev.**
- **Portovi:** 3001/5174 sa `strictPort`. NIKAD 3000/5173 — drži ih susedni projekat
  „Expected PO Receipts" (`C:\Users\Milan\Documents\Expected PO Receipts`).
- **Proces (superpowers skills):** nova funkcija → `brainstorming` → `writing-plans` →
  `subagent-driven-development` (svež podagent po zadatku; dvostepena provera: PRVO poklapanje
  sa spec-om, PA kvalitet koda; ponovni pregled posle ispravki). TDD: test pre koda; `nock`
  za HTTP u backend testovima.
- **`receivePO` ostaje NETAKNUT.** Nova funkcionalnost ide u zasebne funkcije/rute (kao retry,
  kao validator).
- **Struktura:** klijent za DW = `backend/src/dwClient/` (po domenu: `po.ts`, `inventory.ts`,
  `salesOrders.ts`, `bom.ts`). Rute konzumiraju `dwClient`, ne axios direktno.
- **Pre tvrdnje da je gotovo / pre commita:** pokreni OBA test paketa i potvrdi da su zelena.
- **Handoff po sesiji:** `docs/handoff-YYYY-MM-DD.md` na `main`.
