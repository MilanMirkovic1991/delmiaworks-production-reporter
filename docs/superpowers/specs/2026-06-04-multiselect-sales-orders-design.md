# Spec — Multiselect prodajnih porudžbina + agregacija + auto-login

- **Datum:** 2026-06-04 · **Status:** odobreno (korisnik: „po artiklu", „završi najbolje")
- **Bezbednosna tačka:** tag `stabilno-kaskada-2026-06-04` (= `b87a2e1`) na oba remote-a.

## Cilj
1. **Auto-login:** na startu se sam uloguj (test kredencijali), sam izaberi `eplant 13`, i odmah
   prikaži Sales Order-e. Manuelni login OSTAJE kao fallback (ako auto padne → prikaži formu).
2. **Multiselect SO:** na prvoj strani (lista SO) čekboksiraj više porudžbina. Zatim biraj količinu:
   - puna količina = **zbir svih izabranih** (po artiklu),
   - konkretan SO → njegov release ili puna,
   - više release-ova iz više SO.
3. **Ne pokvariti postojeće:** kaskada/WO-stablo (`/work-orders` + backend) ostaju NETAKNUTI.

## Ključni model (potvrđen sa korisnikom)
Prijava je **po jednom artiklu** (`arInvtId` + količina → WO stablo → kaskada). Zato se izbor
**agregira PO ARTIKLU**: saberi količinu istog `arInvtId` preko svih izabranih SO/release-ova.
- 1 artikal u planu → jedno stablo → jedna kaskada (postojeće).
- više artikala → lista; svaki se zasebno otvori i prijavi (reuse postojećeg WO ekrana).

## Arhitektura

**Čista logika (TDD):** `frontend/src/utils/aggregateDemand.ts`
- `aggregateDemand(units: DemandUnit[]): ProducePart[]` — grupiše po `arInvtId`, sabira `qty`,
  izbacuje qty≤0. `DemandUnit = {arInvtId, itemNumber, description, qty}`.

**Store:** `wizardStore` — DODAJ (bez rušenja postojećeg):
- `selectedSOs: {salesOrderId, orderNumber, company}[]`, `producePlan: ProducePart[]`,
  `setSelectedSOs`, `setProducePlan`, `activatePart(part)` → setuje `selectedSO` (sintetički „Plan"),
  `selectedLineItem` (arInvtId/itemNumber, totalOrdered=qty) i `finalQty=qty` da `/work-orders` radi neizmenjen.

**Strane / rute:**
- `Login.tsx` — auto-login (mount): `login(def) → selectEPlant(13) → '/'`; fail → forma (popunjena) + greška.
- `SalesOrdersList.tsx` — čekboks po redu + traka „Izabrano: N · Dalje →" → `setSelectedSOs` → `/aggregate`.
  (Klik na red i dalje radi za brzi single-drill: postojeći tok ostaje.)
- `AggregatePage.tsx` (NOVA, `/aggregate`) — za svaki izabrani SO povuci stavke (`salesOrderLineItems`).
  Po stavci: default „puna" (qty=totalOrdered) ili prekidač „release-ovi" (povuci `releasesForSO`,
  čekboksi). Dole rezime = `aggregateDemand(units)` → `producePlan`. „Dalje →".
- `ProducePlanPage.tsx` (NOVA, `/produce`) — lista artikala iz `producePlan` (ident, qty, „Otvori →").
  „Otvori" → `activatePart` → `/work-orders` (postojeće stablo+kaskada). 1 artikal → preskoči listu.
- `App.tsx` — dodaj `/aggregate`, `/produce` (ProtectedRoute). `WorkOrders` „Nazad" → `/produce` ako plan postoji.

**Stari ekrani** (`SalesOrderItems`, `Releases`) ostaju i rade (single-drill fallback) — ništa se ne briše.

## Auto-login detalji
Default kredencijali (test VM, nisu tajna — već u repo dokumentaciji): baseUrl
`http://192.168.20.28:8080/WebAPI`, user `IQMS`, pass `iqms`, db `IQORA`, eplant `13`. Forma popunjena
istim, pa ako auto padne korisnik vidi/menja i ručno se prijavi. Ako `selectEPlant(13)` padne → `/select-eplant`.

## Testovi (TDD)
- `utils/aggregateDemand.test.ts` — grupisanje/sabiranje po artiklu, više SO, prazno, qty≤0.
- `wizardStore` — `activatePart` setuje polja za `/work-orders`; `setSelectedSOs`/`setProducePlan`.
- `Login` — auto-login na mount zove login+selectEPlant(13)+nav('/'); na grešci prikaže formu.
- `SalesOrdersList` — multiselect + „Dalje" setuje SO i ide na `/aggregate` (postojeći test ažuriran).
- `AggregatePage` — puna-suma po artiklu; release-mod sabira čekirane; cross-SO.

## Van obima (YAGNI v1)
- Pamćenje plana kroz refresh za multi-part (persist je ok ali ne komplikovati).
- Paralelno prijavljivanje više artikala odjednom (radi se jedan po jedan iz liste).
