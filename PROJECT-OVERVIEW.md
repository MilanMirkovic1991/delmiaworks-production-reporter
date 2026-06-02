# PROJECT-OVERVIEW — DelmiaWorks Production Reporter

Objedinjen pregled iz handoff fajlova u `.cowork-handoff/`
(`handoff-po-receive-fixes.md` → `handoff-receipt-retry-validator.md`, koji je
njegov direktan nastavak). Za potpunu sliku aplikacije pročitati i
`docs/handoff-2026-06-01.md`, za DW znanje i analizu neuspeha
`docs/handoff-2026-05-27.md`.

## Šta aplikacija radi

Aplikacija automatizuje prijavljivanje proizvodnje u DelmiaWorks-u preko WebAPI-ja.
Tok od kraja do kraja koji trenutno radi: login → izbor Sales Order-a / artikla →
BOM → stablo radnih naloga → priprema nabavke → kreiranje PO (sa PO_RELEASES, Seq,
auto-approve) → prijem (Lot, FGMULTI, MASTER_LABEL sa unikatnim 7-cifrenim
serijskim brojem) → retry neuspelih prijema. **Ne radi još:** prijava proizvodnje
(Phase 4).

## Trenutno stanje

- Repo: `delmiaworks-production-reporter` (Windows host,
  https://github.com/MilanMirkovic1991/delmiaworks-production-reporter).
- Branch `main`, head `eefe298`, push-ovano (lokalno = remote).
- **105/105 backend + 22/22 frontend testova prolaze** (validator dodao 11 backend + 2 frontend).
- Working tree: samo nepovezani `Cene*.xlsx` / `_fill_cene.py` (NE komitovati).

Završeno do sada:

- **Phase 1 (read-only)** — kompletna.
- **Phase 3 (PO + prijem + nalepnice)** — radi end-to-end, u testiranju protiv DW VM.
  Bug-fix-ovi: `PO_RELEASES.Seq` (per-arInvtId brojač preko `UpdatePOReleaseItem`) i
  `MASTER_LABEL.SERIALNO` (globalni monotoni brojač max+1, 7 cifara, nikad duplikat).
  Live test PO #23 (111 stavki): 56 prijema uspelo, 55 palo — svih 55 su DW
  master-data problemi, ne greška u kodu.
- **Retry („Ponovi neuspeli prijem")** — gotovo, pregledano, spojeno u `main`,
  objavljeno. Dugme „Ponovi" po neuspelom redu + „Ponovi sve neuspele". Ponavlja samo
  taj red i nastavlja odakle je stao (ne pravi dupli `PO_RECEIPTS`). Backend:
  `retryReceipt` + ruta `POST /api/po/:poId/receive-retry`; `receivePO` netaknut.
  Batch staje samo na isteklu sesiju (401/403), ne na običnu DW grešku.

U toku / nije počelo:

- **Pre-receive validator** — IMPLEMENTIRAN (Tasks 2–6 iz plana), TDD, čeka commit (vidi
  `docs/handoff-2026-06-02.md`). Radi grupa A (recept) i C (serijalizovan+razlomljeno) +
  automatski panel upozorenja; `receivePO` netaknut. **Ostaje:** commit (mount blokira git),
  proba DW VM za tačna imena polja (Task 1), i grupa B (orphan label).
- **Phase 2 (kreiranje radnih naloga)** — nije počela.
- **Phase 4 (prijava proizvodnje)** — nije počela.
- **Phase 5 (hardening)** — nije počela.

## Sledeći koraci (po prioritetu)

1. **Commit validatora (korisnik, Windows):** ovo okruženje ne dozvoljava git upis. Poruke
   i detalji u `docs/handoff-2026-06-02.md`. Push samo na izričit zahtev.
2. **Proba DW test okruženja** (prvi zadatak plana, vidi „Blokeri"): naći koje DW
   polje otkriva (A) recept i (C) serijalizovan artikal. Pisati `backend/tools/peek-*.ts`,
   pokrenuti `npx tsx`, ubaciti nalaz u kod+komentare, obrisati probu pre commita.
3. **Implementacija validatora** (TDD): `validateReceipt` u
   `backend/src/dwClient/po.ts`, ruta `POST /api/po/:poId/receive-validate`, panel
   upozorenja u `frontend/src/pages/WorkOrders.tsx`. `receivePO` ostaje netaknut.
4. **Zaokruživanje razlomljene količine** (lek za grupu C), **Phase 2** (kreiranje WO /
   prijava proizvodnje), čišćenje zaostalih DW redova, zaštita porta 5173, osvežavanje
   README.
5. **DW admin (korisnik):** pokrenuti „Roll Inventory Cost" za ~50 arInvtId sa „No
   recipe card"; obrisati orphan MASTER_LABEL redove Id 254 i 327.

## Donete odluke i zašto

- **MASTER_LABEL.SERIALNO = globalni brojač max(postojeći)+1**, 7 cifara, monotono
  raste kroz sve `receivePO` pozive. Maks se čita jednom po pozivu sa
  `GET /Labels/PrintLabel/MasterLabels/0`. Razlog: user spec („0000001, 0000002… nikad
  duplikat, broji do u nedogled") + DW `AK_MASTER_LABEL_SERIAL` unique constraint.
- **PO_RELEASES.Seq** se setuje preko follow-up `POST .../UpdatePOReleaseItem/{id}` sa
  punim release body + `Seq`. Create ne prihvata `Seq`. Seq je per-arInvtId unutar
  jednog PO (1, 2, 3…). Neuspeh `UpdatePOReleaseItem` je non-fatal (loguje warn, red
  ostaje uspešan).
- **Sve PO line/release operacije su sekvencijalne** (`for await`) — paralelno je
  triggerovalo `ORA-00001 (UNQ_PO_DETAIL_SEQ)` race.
- **Endpoint discovery pattern:** kad `apiId=...` daje 500 → listaj kontrolere
  `GET /Help` (HTML), grep `apiId=(...Controller)`, pa `GET /Help/Controller?apiId=<full>`.
- **Nova funkcionalnost ide u zasebne funkcije/rute** (kao retry, kao validator);
  `receivePO` ostaje NETAKNUT.

Pre-receive validator — dogovoren dizajn:

- **Tri provere:** A — artikal nema recept („Roll Inventory Cost", ~50/55, najveća
  korist); B — orphan MASTER_LABEL bez lota; C — serijalizovan artikal + razlomljena
  količina. (Grupu D — „PO Receipt not found determining currency" — već rešava retry.)
- **Ponašanje: samo upozorava, ne blokira i ne preskače.** Lažna uzbuna ne sme da
  zaustavi ispravan prijem.
- **Prikaz: automatski**, grupisan/sažet panel iznad dugmeta „Prijem"; dugme ostaje aktivno.
- **Arhitektura „Pristup 1" (preporučen, isti obrazac kao retry):** frontend šalje
  stavke iz odgovora `createPO` novoj ruti `.../receive-validate`; backend za svaki
  različit artikal čita DW podatke (čitanja mogu paralelno) + jedno čitanje
  `GET /Labels/PrintLabel/MasterLabels/0` za grupu B. `receivePO` netaknut.

Probano i ODBAČENO (ne ponavljati):

- `Serial: '1'` hard-kodovan — uzrok originalne `ORA-00001`.
- `Serial` baziran na `poReceiptId` — uniqueness OK ali ne zadovoljava user spec.
- `LotNo` u `CreatePoReceiptsLabelsPlan` body — pripada `ReceivingTransSettings`.
- Field nazivi `PoReceiptId`/`LabelCount` — DW DTO je `POReceiptsId`/`LabelsCount`.
- Paralelno kreiranje line item-a / releases — `ORA-00001` race.
- „Suvi prolaz" kroz `receivePO` (režim provere) — dira stabilizovan `receivePO`.
- Upozorenja unutar odgovora `createPO` — meša kupovinu sa proverom prijema.
- Validator „na dugme Proveri" / „u potvrdi pri kliku na Prijem" — u korist
  automatskog panela.

## Izmenjeni / relevantni fajlovi

- `backend/src/dwClient/po.ts` — glavni fajl: `createPurchaseOrder` (Seq + UpdatePOReleaseItem),
  `receivePO` (fetch max-Serial + global counter), `retryReceipt` + `resolveResumeStage`.
  OVDE ide buduća `validateReceipt`.
- `backend/src/dwClient/index.ts` — dwClient factory + auth.
- `backend/src/dwClient/inventory.ts` — `getById(arInvtId)`; treba proširiti za polja
  „recept" i „serijalizovan" (meta probe).
- `backend/src/dwClient/{salesOrders,bom}.ts` — domeni SO i BOM.
- `backend/src/routes/po.ts` — rute; ima `POST /:poId/receive-retry`. OVDE ide
  `.../receive-validate`.
- `frontend/src/api/client.ts` — pozivi i tipovi (`retryReceipts`, `ReceiptRow`, `RetryRow`,
  `serialNo`).
- `frontend/src/pages/WorkOrders.tsx` — „Detalji prijema", „Serijski br." kolona, retry
  dugmad; OVDE ide panel upozorenja validatora.
- `pokreni.bat` / `zaustavi.bat` — start/stop sa detekcijom konflikta portova.
- Testovi: `backend/test/dwClient/{po,resumeStage,retryReceipt}.test.ts`,
  `backend/test/routes/poRetry.test.ts`, `frontend/test/...`.
- Dokumentacija: `docs/handoff-2026-06-01.md` (pun pregled), `docs/handoff-2026-05-27.md`
  (DW znanje, grupe neuspeha, trijaža), `docs/superpowers/specs|plans/2026-06-01-retry-receipts*`.

## Otvoreni problemi / blokeri

| Kategorija | Stavki | Uzrok | Šta treba |
|---|---|---|---|
| „No recipe card found" | ~50 | DW item nema cost recipe card | DW admin: „Roll Inventory Cost" za te arInvtId |
| Orphan MASTER_LABEL 254/327 | 2 | Zaostali iz ranijih neuspelih runova | DW admin: obrisati ta dva reda |
| Serijalizovan + razlomljena qty | 3 | qty 12.8 / 2.1472 / 32.0176 na serijalizovanim artiklima | Odluka: zaokruživanje, izmena config-a artikla, ili manualan prijem |
| „PO Receipt not found determining currency" | 3 | Tranzijentno / vendor currency config | Retry (već postoji), ili istraga vendor master |

Sva 4 su DW server-side, ne kod.

Tehnički blokeri za validator:

- **(Glavni) Grupa A — detekcija recepta:** ne zna se koje DW polje/poziv kaže „ima/nema
  recept". Mora proba na DW test VM; bez mrežnog pristupa toj VM ne može se potvrditi.
- **Grupa C — zastavica „serijalizovan":** verovatno na `InventoryItem`, nije mapirana;
  potvrditi probom.
- **Grupa B — „orphan" je heuristika**, izoštriti na pravim podacima.
- Dizajn validatora nije potvrđen (Pristup 1 čeka „OK") ni zapisan u spec.

Pre-postojeće (nije naše): `npm run build` na backendu pukne na jednoj grešci u
`backend/src/server.ts` (pino-http, call signature) — na `main` od ranije; ne utiče na
`vitest` ni `dev`.

DW DBA prerequisite (već primenjen):

```sql
CREATE SEQUENCE IQMS.S_EPLANT_PO_REC_13 START WITH 1 INCREMENT BY 1 NOCACHE NOCYCLE;
-- Ako se uvede novi EPlant: isto za S_EPLANT_PO_REC_<id>
```

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

# Build (NAPOMENA: backend pukne na pre-postojećoj pino-http grešci; ne utiče na testove/dev)
npm run build

# DW WebAPI proba (jednokratno, obrisati pre commita)
cd backend && npx tsx tools/peek-<thing>.ts
#   DTO:     GET /Help/Api?apiId=METHOD-Area-Controller-Action-...
#   Katalog: GET /Help → grep apiId=...Controller → GET /Help/Controller?apiId=<full>

# Git: komituj slobodno; PUSH samo na eksplicitan zahtev korisnika.
```

DW test okruženje: URL `http://192.168.20.28:8080/WebAPI`, user `IQMS` / `iqms`, baza
`IQORA`, EPlant `13`, approver badge `001` (mora postojati u `PR_EMP`). Token iz
`POST /User/Login` ide kao zaglavlje `AuthToken`.
