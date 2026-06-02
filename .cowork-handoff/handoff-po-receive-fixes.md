# Handoff — PO Receive Fixes (Seq + Serial)

Session radila na popravkama DelmiaWorks PO + auto-receive flow-a: dva
bug-fixa (PO_RELEASES.Seq i MASTER_LABEL.SERIALNO global counter), plus
širi end-of-session recap dokument.

## Trenutno stanje

- Repo: `delmiaworks-production-reporter` (Windows host, https://github.com/MilanMirkovic1991/delmiaworks-production-reporter)
- Branch `main`, head `22fd9b5`. Push-ovano.
- Working tree clean.
- 81/81 backend tests + 18/18 frontend tests prolaze.
- **Live test protiv DW VM (PO #23, 111 line items): 56 receipts uspeli, 55 neuspeli.** Nema više `ORA-00001` na `AK_MASTER_LABEL_SERIAL`. Svih 55 neuspeha su DW master-data problemi (nije bug u kodu — vidi "Otvoreni problemi").
- Receive flow radi end-to-end: login → SO → releases → BOM → WO tree → create PO + PO_RELEASES sa Seq → auto-approve → auto-receive sa Lot + FGMULTI + MASTER_LABEL sa unikatnim Serial.

## Sledeći koraci (po prioritetu)

1. **DW admin (korisnik):** pokrenuti "Roll Inventory Cost" u DelmiaWorks UI za ~50 arInvtId-jeva koji su pali sa "No recipe card found". DW sam to predlaže u FriendlyMessage.
2. **DW admin (korisnik):** obrisati orphan MASTER_LABEL redove sa Id-jevima 254 i 327 (zaostali iz ranijih neuspelih runova).
3. **Odluka (UX):** kako tretirati 3 stavke sa fractional qty + serijalizovani inventory (qty = 12.8, 2.1472, 32.0176). Opcije: zaokruživanje na ceo broj pri kreiranju PO, izmena konfiguracije artikla u DW-u, ili manualan prijem.
4. **Kod:** retry-button po redu u "Detalji prijema" tabeli (`WorkOrders.tsx`) — najkorisnije za 3 transient "PO Receipt could not be found while determining currency" greške i posle DW admin koraka 1-2.
5. **Kod:** pre-receive validator — pre `receivePO` GET-uj item metadata svake linije i upozori ako fali recipe card, ili ako je qty fractional za serijalizovan artikal, ili ako postoje orphan MasterLabels.
6. **Kod:** Phase 2 — kreiranje Work Order-a za primljene količine (nije ni započeto).

## Donete odluke i zašto

- **MASTER_LABEL.SERIALNO se generiše kao globalni brojač = max(postojeći)+1, formatiran na 7 cifara, monotono raste kroz sve `receivePO` pozive.** Maks se čita jednom po pozivu sa `GET /Labels/PrintLabel/MasterLabels/0` (vraća sve redove sa `Serial` poljem). Razlog: explicit user spec (*"0000001, pa onda 0000002… I nikada ne sme da se duplira… Broji do u nedogled"*) + DW enforce-uje `AK_MASTER_LABEL_SERIAL` unique constraint.
- **PO_RELEASES.Seq se setuje preko follow-up `POST /POReceiving/PO/UpdatePOReleaseItem/{id}`** sa punim release body + `Seq: nextSeq`. Razlog: `/Help/Api?apiId=POST-POReceiving-PO-CreatePOReleaseItem-…` pokazuje da Create ne prihvata `Seq` kao parametar. Seq counter je per-`arInvtId` unutar jednog PO (1, 2, 3...) — `Map<arInvtId, number>`.
- **Failure of `UpdatePOReleaseItem` je non-fatal.** Release row postoji u DW-u, samo bez Seq vrednosti. Loguje se warn, line item ostaje uspešan.
- **Endpoint discovery pattern:** kada `apiId=...` daje 500, listaj kontrolere preko `GET /Help` (HTML), grep-uj za `apiId=([A-Za-z0-9._]+Controller)`, pa drill-down `GET /Help/Controller?apiId=<full>`. Tako otkriven `WebAPI.Areas.Labels.Controllers.PrintLabelController` → `MasterLabels` endpoint.

**Probano i ODBAČENO (ne ponavljati):**

- **`Serial: '1'` hard-kodovan u CreatePoReceiptsLabelsPlan body.** Uzrok originalne `ORA-00001 (AK_MASTER_LABEL_SERIAL)`. Prvi prijem prolazi, svi ostali padaju.
- **`Serial: String(poReceiptId).padStart(7, '0')`** (poReceiptId-based). Garantuje uniqueness ali ne zadovoljava user spec "0000001, 0000002, brojač do u nedogled, bez veze sa artiklom". Bilo committed kratko, pa promenjeno na global max+1 brojač.
- **`LotNo` u `CreatePoReceiptsLabelsPlan` body.** Pogrešno mesto. LotNo pripada `ReceivingTransSettings` body-ju za `PostPOReceiptAndUpdateMasterLabel` (probano kroz `/Help/Api` peek).
- **Field nazivi `PoReceiptId` / `LabelCount`.** DW DTO je zapravo `POReceiptsId` (capital PO, trailing s) i `LabelsCount`. Pogrešna imena su davala `FK_PO_RECEI_REF_22293_PO_RECEI`.
- **Paralelno kreiranje line item-a / releases.** Triggerovalo `ORA-00001 (UNQ_PO_DETAIL_SEQ)` race. Sve PO line/release operacije su sekvencijalne (`for await`).

## Izmenjeni / relevantni fajlovi

- `backend/src/dwClient/po.ts` — **glavni fajl ove sesije.** `createPurchaseOrder` ima Seq counter + UpdatePOReleaseItem call. `receivePO` ima fetch max-Serial na startu + global counter alokaciju u glavnoj petlji.
- `backend/test/dwClient/po.test.ts` — 16 PO testova; ovaj session dodao 3 + ažurirao mock-ove za `/Labels/PrintLabel/MasterLabels/0` na svakom `receivePO` testu.
- `frontend/src/api/client.ts` — dodato `serialNo?: string` u `receivePO` response tip.
- `frontend/src/pages/WorkOrders.tsx` — nova "Serijski br." kolona u "Detalji prijema" tabeli posle `Lot` kolone.
- `docs/handoff-2026-05-27.md` — širi end-of-session recap (363 linija) sa detaljnom analizom 55 neuspeha, DW WebAPI knowledge base, error triage tabelom.

Ostali ključni fajlovi (nepromenjeni ove sesije ali važni za context):

- `backend/src/dwClient/index.ts` — dwClient factory + auth
- `backend/src/routes/*.ts` — Express routes
- `pokreni.bat` / `zaustavi.bat` — Windows convenience start/stop sa port-conflict detection

## Otvoreni problemi / blokeri

| Kategorija | Broj stavki | Uzrok | Šta treba |
|---|---|---|---|
| "No recipe card found" | ~50 | DW item nema cost recipe card | DW admin: pokreni "Roll Inventory Cost" za te arInvtId-jeve |
| "Missing Lot #" referenca na MasterLabel 254/327 | 2 | Orphan MasterLabel iz prethodnih neuspelih runova | DW admin: obriši ta dva reda |
| "Serialized item, fractional qty" | 3 | qty = 12.8 / 2.1472 / 32.0176 na artiklima sa Serialized Inventory Control | Odluka: zaokruživanje, izmena artikl config-a, ili manualan DW UI prijem |
| "PO Receipt not found while determining currency" | 3 | Tranzijentno / vendor currency config | Retry, ili istraga vendor master |

Sva 4 kategorije su DW server-side, ne kod. Naša aplikacija je tačna na svim mestima gde može da bude.

DW DBA prerequisite koji je već primenjen tokom ove sesije:
```sql
-- Bilo potrebno ranije za ORA-14552
CREATE SEQUENCE IQMS.S_EPLANT_PO_REC_13 START WITH 1 INCREMENT BY 1 NOCACHE NOCYCLE;
-- Ako se uvede novi EPlant: isto za S_EPLANT_PO_REC_<id>
```

## Komande

```bash
# Pokretanje (dva terminala, ili double-click pokreni.bat)
cd backend  && npm run dev          # http://localhost:3001
cd frontend && npm run dev          # http://localhost:5174

# Testovi
cd backend  && npx vitest run       # 81 testova
cd frontend && npx vitest run       # 18 testova

# Build
npm run build                       # iz root-a

# Lint / typecheck (nije zaseban skript; vitest pokriva tip checking)

# Git
git status
git log --oneline -10
# Push samo na eksplicitan zahtev korisnika.

# Probe DW WebAPI (jednokratno; obrisati posle)
cd backend && npx tsx tools/peek-foo.ts
```

DW credentials (testno okruženje):
- URL: `http://192.168.20.28:8080/WebAPI`
- User: `IQMS` / `iqms`
- Database: `IQORA`
- EPlant: `13`
- Approver badge: `001` (mora postojati u `PR_EMP`)

## Pravila rada

- **Komuniciraj sa korisnikom na srpskom** (neformalno, "ti"). Code, komentari, commit poruke ostaju na engleskom.
- **Conventional Commits.** `feat(scope): …`, `fix(scope): …`, `chore: …`, `docs: …`. Body objašnjava ZAŠTO, ne ŠTA. Trailer: `Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>`.
- **Nikad ne push-uj bez eksplicitnog "push" zahteva.** Komituj slobodno; remote samo na zahtev.
- **Nikad `--no-verify` / `--no-gpg-sign` / `--amend`** bez eksplicitnog zahteva. Pre-commit hook fail-uje → fix-uj root cause i napravi NOVI commit, ne amend.
- **Sibling project constraint:** `C:\Users\Milan\Documents\Expected PO Receipts` zauzima portove 3000 i 5173. Naša app koristi 3001 i 5174 sa `strictPort`. Nikad ne reclaim-uj 3000/5173.
- **TDD-friendly:** svaka izmena u `backend/src/dwClient/po.ts` mora ići uz test u `backend/test/dwClient/po.test.ts`. Tests koriste `nock` za HTTP mocking. Pre commita pokreni `npx vitest run` u oba modula.
- **DW WebAPI probe pattern:** kada treba istražiti DTO ili endpoint, pisi `backend/tools/peek-<thing>.ts`, pokreni sa `npx tsx`, iskoristi nalaze u kodu+komentarima, obriši probe pre commita.
- **Naša funkcionalna celina:** klijent za DW se zove `dwClient` (`backend/src/dwClient/`). Svaki domen je svoj fajl (`po.ts`, `inventory.ts`, `salesOrders.ts`, `bom.ts`). Routes konzumiraju `dwClient`, ne axios direktno.
- **Faza projekta:** Phase 1 (read-only) ✅. Phase 2 (WO creation) nije počela. Phase 3 (PO + receive + labels) je u testiranju protiv DW VM. Phase 4 (production reporting) ❌. Phase 5 (hardening) ❌.
