# Spec — Uklanjanje nabavke i prijema (fokus: samo prijava proizvodnje)

- **Datum:** 2026-06-04
- **Status:** odobren (čeka pregled spec fajla pre plana)
- **Pristup:** A — jedan „remove procurement" commit (vidi „Plan izvođenja")

## Cilj

Potpuno ukloniti funkcionalnost nabavke i prijema (Phase 3 + pre-receive validator + retry)
iz aplikacije. Aplikacija zadržava lanac do stabla radnih naloga i postaje čista osnova za
jedini preostali cilj: **automatska prijava proizvodnje** (Phase 4, gradi se u sledećoj sesiji).

Ovo je namerno **uklanjanje**, ne refaktor. Ne dodaje se nova funkcionalnost (nema stub
ekrana ni skeleta Phase 4 — odluka korisnika: „wizard se završava na WO stablu").

## Krajnje stanje

Wizard: **Login → EPlant → SO lista → stavka SO → Release (izbor količine) → WO stablo (kraj).**

- WO ekran (`WorkOrders.tsx`) prikazuje **samo** stablo radnih naloga + statistiku, sa
  dugmadima „Osveži" i „Reset". Bez ijednog poziva ka `/api/po/*`.
- Backend više **ne** registruje rutu `/api/po`.
- Nema mrtvog koda iza feature-flag-a: uklonjeno je uklonjeno.

## Obim — tačna lista (provereno čitanjem izvora)

### Backend — briše se ceo fajl

| Fajl | Sadržaj koji nestaje |
|---|---|
| `backend/src/dwClient/po.ts` | `createPO`, `receivePO`, `retryReceipt`, `validateReceipt`, `resolveResumeStage`, `getMaxSerialNumber`, `makePOApi` |
| `backend/src/routes/po.ts` | sve rute `/api/po/*` (create, receive, receive-retry, receive-validate) |
| `backend/test/dwClient/po.test.ts` | |
| `backend/test/dwClient/retryReceipt.test.ts` | |
| `backend/test/dwClient/resumeStage.test.ts` | |
| `backend/test/dwClient/validateReceipt.test.ts` | |
| `backend/test/routes/poRetry.test.ts` | |
| `backend/test/routes/poValidate.test.ts` | |
| `backend/test/dwClient/inventoryMeta.test.ts` | testira validatorske bite koje se skidaju |

### Backend — edituje se (skida samo PO veze)

| Fajl | Izmena |
|---|---|
| `backend/src/dwClient/index.ts` | ukloni `import { makePOApi }` i `po: makePOApi(http)`. **Zadrži** `inventory: makeInventoryApi`. |
| `backend/src/server.ts` | ukloni `import { makePORouter }` i `app.use('/api/po', …)`. |
| `backend/src/dwClient/inventory.ts` | skini **samo** validatorske dodatke: polja `hasRecipe`/`isSerialized` na `InventoryItem`, konstante `RECIPE_KEYS`/`SERIAL_KEYS`, funkciju `readBoolMeta`, i njihova dva čitanja u `getById`. **Zadrži** `searchItems`, `getById` (srž), `getMaterialsForItem`, tipove `InventoryItem`/`BomMaterial`. |

### Frontend — briše se ceo fajl

| Fajl | Razlog |
|---|---|
| `frontend/src/utils/classifyReceiptError.ts` | klasifikacija grešaka prijema |
| `frontend/test/utils/classifyReceiptError.test.ts` | |
| `frontend/src/utils/collectPurchased.ts` | hrani „kupovne komponente za nabavku" tabelu (briše se cela) |
| `frontend/test/utils/collectPurchased.test.ts` | |
| `frontend/test/pages/WorkOrdersValidate.test.tsx` | |
| `frontend/test/pages/WorkOrdersRetry.test.tsx` | |
| `frontend/test/api/validateReceipt.test.ts` | |
| `frontend/test/api/retryReceipts.test.ts` | |

### Frontend — edituje se

| Fajl | Izmena |
|---|---|
| `frontend/src/pages/WorkOrders.tsx` | ukloni celu desnu „nabavka" sekciju: `collectPurchased`, sve mutacije (createPO/receive/retry/validate), state (`selectedToBuy`, `receipts`), panele upozorenja i rezimea, tabelu kupovnih komponenti. **Zadrži** prikaz WO stabla, statistiku, „Osveži"/„Reset", „Nazad" na `/releases`. |
| `frontend/src/api/client.ts` | ukloni `createPO`, `receivePO`, `retryReceipts`, `validateReceipt` i tipove `ReceiptRow`, `RetryRow`, `WarningKind`, `ReceiptWarning`. |
| `frontend/test/pages/WorkOrders.test.tsx` | uskladi sa uklonjenom sekcijom (samo provere WO stabla). |

### Ostaje netaknuto (foundation)

- Backend: `auth`, `eplants`, `salesOrders`, `bom`, `workOrders`, `workOrderTree`,
  `bomTreeBuilder`, `workOrderTreeBuilder`, `http`, `session`, `server` (sem skinute PO rute),
  `config`, `inventory` (sem validatorskih bita) i svi njihovi testovi.
- Frontend: `Login`, `SelectEPlant`, `SalesOrdersList`, `SalesOrderItems`,
  **`Releases.tsx` (korak 3 — izbor količine/release-ova SO; NIJE nabavka)**,
  `WorkOrderTreeNode`, `wizardStore` (4 koraka, `selection`/`finalQty`), `WizardStepper`.

### Jučerašnji nekomitovan rad — sudbina

- **Zadržati:** `extractDwFriendlyMessage` u `dwClient/http.ts` + `backend/test/dwClient/dwError.test.ts`
  (generička pomoć — DW poruka stiže do UI za bilo koji poziv; korisno za Phase 4).
- **Baciti:** `classifyReceiptError.ts` (+ test), panel u `WorkOrders.tsx`, qty-preciznost izmena
  u `po.ts` i `po.test.ts` (fajlovi ionako nestaju).

## Plan izvođenja (Pristup A)

1. **Commit 1 — sačuvaj keeper iz nekomitovanog rada:** `dwClient/http.ts`
   (`extractDwFriendlyMessage`) + `dwError.test.ts`. Pusti `npm test` (zeleno) pre commita.
2. **Commit 2 — remove procurement:** obriši fajlove + edituj fajlove iz obima gore u jednom
   logičkom commitu. Tako `git revert` vrati funkcionalnost ako ikad zatreba.
3. **Commit 3 — docs:** ažuriraj `CLAUDE.md` (Trenutno stanje + Changelog) i memoriju.

Bez `--force`, bez preskakanja hook-ova. Radi se na `main` (konvencija projekta), commit po commit.

## Provera (verifikacija pre „gotovo")

- `npm test` — backend i frontend **zeleno** (očekivano manje testova nego sada).
- `npm run build` — prolazi; jedini dozvoljeni izuzetak je **pre-postojeća** pino-http greška
  u `server.ts` (nije naša, ne uvodi se novom izmenom).
- Ručno: `npm run dev:backend` + `npm run dev:frontend`, proći wizard do WO stabla; potvrditi
  da se stablo crta, da nema PO dugmadi i da je konzola čista (nema 404 na `/api/po/*`).
- `grep` provera: nijedan preostali izvorni fajl ne referencira `/api/po`, `createPO`,
  `receivePO`, `retryReceipt`, `validateReceipt`, `classifyReceiptError`, `collectPurchased`.

## Rizici i ublažavanje

- **Viseći import posle brisanja** → `npm run build` + `grep` provera ga hvata; Pristup A drži
  build ispravnim na granicama commita.
- **Slučajno brisanje foundation koda** → obim je proveren čitanjem izvora; `Releases.tsx` i
  `inventory.ts` su eksplicitno označeni kao „zadrži" jer ih je prvi nacrt pogrešno svrstao.
- **Gubitak buduće reference** → uklonjeni kod ostaje u git istoriji (Commit 2 je atomičan i
  reverzibilan); kategorije prijema A–D i live nalazi ostaju zapisani u istoriji `CLAUDE.md`.

## Van obima (YAGNI)

- Nema stub ekrana „Prijava proizvodnje" ni skeleta rute `POST /production/report`.
- Nema čišćenja orphan PO_RECEIPTS u DW (alat iz starog plana — nebitan kad nema prijema).
- Nema izmena na samoj logici WO stabla / BOM-a.
