# Spec — Phase 4: Kaskadna prijava proizvodnje

- **Datum:** 2026-06-04
- **Status:** odobren pristup A; korisnik tražio da se dalje radi autonomno po najboljoj preporuci (bez pitanja).
- **Pristup:** A — backend orkestrira kaskadu, rezultat po WO na kraju (kao stari `receivePO`).

## Cilj

Klik na „Prijavi proizvodnju" na nekom čvoru stabla prijavi proizvodnju za **taj WO i ceo
podstablo ispod njega**, automatski, od dna ka vrhu. Vreme po WO se varira ±15% nasumično od
standarda; količina po WO ostaje tačna. Na kraju se prikaže gde je prošlo, a gde nije.

## DW WebAPI ugovor (otkriveno read-only probom test VM-a)

Sve preko WebAPI-ja, `AuthToken` header, `{eplantId}` iz sesije.

1. **Standardno vreme po WO:**
   `GET /Manufacturing/WorkOrders/WorkOrderEx/{workOrderId}`
   → `data.ProductionHours` (standardni sati za WO, izvedeno iz `STANDARD.CYCLETM_DISP`),
   `StandardID`, `CyclesRequired`, `BatchSize`, `MfgNumber`.
2. **Količina po WO:**
   `GET /Manufacturing/ReportProductionByWorkOrder/WorkOrder/{eplantId}?workOrderId={id}`
   → `data.Quantity`, `RemainingQuantity`, `QuantityReported`, `Completed`.
3. **Prijava proizvodnje (POST, jedini upis):**
   `POST /Manufacturing/ReportProductionByWorkOrder/GoodPartsQuantityDisposition/{eplantId}`
   `?workOrderId={id}&goodPartsQty={qty}&productionHours={hours}&lotNo={lot}`
   - `goodPartsQty` (decimal, required) = **puna `Quantity` WO-a** (odluka korisnika).
   - `productionHours` (decimal, default 0) = `ProductionHours × (0.85 + rnd×0.30)` — **±15%, po WO**.
   - `lotNo` (string, „Finished Good Lot Number") = **broj radnog naloga (`mfgNumber`)** —
     lot proizvedene komponente JESTE broj WO-a koji se prijavljuje (pravilo korisnika 2026-06-04).
   - `{eplantId}` u putanji (opciono) = iz sesije.

   **Potrošnja komponenti (lot deteta):** Korisnik: kad roditelj troši dete-komponentu, mora da
   povuče i lot te komponente. Pošto kaskada ide od dna ka vrhu i svako dete dobije lot = svoj WO
   broj, roditeljev `GoodPartsQuantityDisposition` (DW „disposition" = prijava + raspolaganje
   materijalom/backflush) troši baš te lotove. DW ima i poseban `Inventory/Disposition`
   (`FloorDispoOutCalculated/{woId}`, `ManualDispositionBackflush` sa `lotNo`) za eksplicitnu
   potrošnju — NE koristimo ga naslepo (rizik dvostruke potrošnje / pogrešnih zaliha za MES);
   potvrditi u živom testu da li je auto-backflush dovoljan ili treba eksplicitni floor-disposition.

## Odluke (best-recommendation, bez daljih pitanja korisniku)

| Odluka | Izbor |
|---|---|
| Obim kaskade | kliknuti čvor + ceo podstablo ispod |
| Redosled | od dna ka vrhu (deca pre roditelja) |
| Količina (`goodPartsQty`) | puna `Quantity` WO-a iz DW |
| Vreme (`productionHours`) | `ProductionHours` × nasumično `0.85–1.15`, po WO |
| `lotNo` (proizvedeni lot) | broj radnog naloga (`mfgNumber`) |
| Potrošnja komponenti | oslonac na DW disposition/backflush (bottom-up + WO-lotovi); eksplicitni floor-disposition tek ako živi test pokaže da treba |
| Više WO na čvoru | prijavi svaki |
| Kupovni/ciklus čvorovi | preskoči (nemaju WO) |
| Bezbednost | potvrda pre starta (pravi upisi, puna količina, broj WO); sekvencijalno; auth greška staje, DW greška ne staje (nastavi i zabeleži) |

## Arhitektura (čiste, testabilne jedinice)

**Backend**
- `dwClient/production.ts` — `makeProductionApi(http)`: `getWorkOrderEx`, `getReportWorkOrder`,
  `reportGoodParts`. Tanki DW pozivi, bez logike.
- `services/productionCascade.ts` — **čista logika**: `flattenBottomUp(tree)` → niz
  `{node, workOrder}` od dna ka vrhu (uključuje koren, preskače kupovne/cikluse);
  `jitterHours(std, rng)` → `std*(0.85+rng()*0.30)`. RNG ubrizgan radi determinističnih testova.
- `routes/production.ts` — `POST /api/production/report-cascade` body `{arInvtId, qty}`:
  ponovo sagradi stablo (kao `workOrderTree` ruta), `flattenBottomUp`, pa **sekvencijalno** za
  svaki WO: `getWorkOrderEx` → std vreme; `getReportWorkOrder` → količina; `jitterHours`;
  `reportGoodParts`. Skupi rezultat po WO. Vrati `{results, summary}`.
- `dwClient/index.ts` — dodaj `production: makeProductionApi(http)`.
- `server.ts` — montiraj `/api/production`.

**Frontend**
- `api/client.ts` — `reportProductionCascade(arInvtId, qty)` + tip `CascadeResult`.
- `pages/WorkOrders.tsx` — mutacija kaskade + stanje rezultata; prosledi rezultate stablu.
- `components/WorkOrderTreeNode.tsx` — dugme „Prijavi proizvodnju" pokreće kaskadu za podstablo
  tog čvora (potvrda pre); status ✓/✗ po WO redu iz rezultata (zameni stari `alert`).

## Obrada grešaka / sledljivost

- Po WO `try/catch`: DW greška NE prekida kaskadu (zabeleži `error`, nastavi); auth (401/403)
  prekida (kao retry). DW poruka se vidi preko `extractDwFriendlyMessage` (zadržan iz ranije).
- Sekvencijalno (ne paralelno) — pouka iz `receivePO` (Oracle SEQ trke).
- Rezultat po WO: `{workOrderId, mfgNumber, itemNumber, arInvtId, goodPartsQty, productionHours, success, error?}`.

## Testovi (TDD)

- `services/productionCascade.test.ts` — bottom-up redosled, uključuje koren, preskače kupovne,
  više WO po čvoru, ciklus; `jitterHours` granice (seeded rng) i da količina ostaje netaknuta.
- `dwClient/production.test.ts` — tačni URL/parametri za 3 poziva (mock http).
- `routes/production.test.ts` — sekvencijalno, rezultat po WO, jedna greška ne staje, auth staje.
- `frontend` — dugme pokreće kaskadu; status ✓/✗ po WO se renderuje.

## Koraci implementacije

1. `dwClient/production.ts` + test (TDD).
2. `services/productionCascade.ts` (flatten + jitter) + test.
3. `routes/production.ts` + test; `index.ts` + `server.ts` montaža.
4. `api/client.ts` + tipovi.
5. `WorkOrders.tsx` + `WorkOrderTreeNode.tsx` (dugme → kaskada, status po WO) + frontend testovi.
6. Verifikacija: `npm test` zeleno, `npm run build` (sem poznate pino-http), read-only dry-run
   provera prema DW VM (čitanja + izračun, bez POST-a). Probe (`backend/tools/`) obrisati.

## Van obima (YAGNI za v1)

- Živa progresija dok kaskada traje (SSE/stream) — može kasnije.
- Biranje pojedinačnih WO/isključivanje — v1 prijavljuje ceo podstablo.
- Prijava preostale (RemainingQuantity) umesto pune — korisnik izabrao punu; nije za sada.
