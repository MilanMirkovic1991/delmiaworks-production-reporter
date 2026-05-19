# Prijava proizvodnje — Phase 1 design (MVP)

**Datum:** 2026-05-19
**Status:** Approved (brainstorming)
**Sledeći korak:** writing-plans → implementation

## 1. Cilj

Web aplikacija koja vodi korisnika (planer/tehnolog) kroz wizard tok:

1. Pretraga artikla
2. Izbor aktivnog Sales Order-a za taj artikal
3. Izbor pune količine ili pojedinačnih release-ova
4. Prikaz multi-level BOM stabla sa preračunatim potrebnim količinama komponenti

Faza 1 je **read-only** — ne menja ništa u DelmiaWorks-u. Postavlja osnovu za Faze 2–5 (radni nalozi, nabavka, prijava proizvodnje, hardening) koje će menjati ERP stanje.

## 2. Tech stack

- **Backend:** Node.js + TypeScript + Express, axios klijent za DelmiaWorks WebAPI, pino za strukturisano logovanje.
- **Frontend:** React + TypeScript + Vite. State: Zustand (wizard state) + TanStack Query (server cache).
- **Autentifikacija:** korisnik unosi DelmiaWorks kredencijale na login ekranu; backend čuva AuthToken u in-memory session mapi, frontend dobija httpOnly sessionId cookie.
- **Deployment:** lokalno (jedna mašina, dva procesa u dev-u, jedan u produkciji), bez baze podataka.
- **Verzioniranje:** monorepo, javni GitHub repo `delmiaworks-production-reporter`.

## 3. Repo struktura

```
delmiaworks-production-reporter/
├── backend/
│   ├── src/
│   │   ├── server.ts              # Express bootstrap
│   │   ├── routes/                # /api/* rute
│   │   │   ├── auth.ts
│   │   │   ├── items.ts
│   │   │   ├── salesOrders.ts
│   │   │   └── bom.ts
│   │   ├── dwClient/              # DelmiaWorks WebAPI klijent
│   │   │   ├── index.ts           # createClient(baseUrl, creds)
│   │   │   ├── auth.ts            # login, refresh
│   │   │   ├── inventory.ts       # search items, get details
│   │   │   ├── salesOrders.ts     # SO + releases
│   │   │   ├── bom.ts             # BomComponentsEx, MaterialsForItem
│   │   │   ├── filter.ts          # buildFilter helper
│   │   │   └── types.ts           # API response tipovi
│   │   ├── services/
│   │   │   └── bomTreeBuilder.ts  # rekurzivna izgradnja stabla
│   │   ├── session.ts             # in-memory Map<sessionId, SessionData>
│   │   └── config.ts              # env + DW base URL
│   ├── test/
│   │   ├── fixtures/dw/           # snimljeni DW JSON odgovori
│   │   └── ...
│   ├── package.json
│   └── tsconfig.json
├── frontend/
│   ├── src/
│   │   ├── App.tsx
│   │   ├── pages/
│   │   │   ├── Login.tsx
│   │   │   ├── ItemSearch.tsx
│   │   │   ├── SalesOrders.tsx
│   │   │   ├── Releases.tsx
│   │   │   └── BomView.tsx
│   │   ├── components/
│   │   │   ├── BomTreeNode.tsx
│   │   │   ├── QuantityBadge.tsx
│   │   │   └── WizardStepper.tsx
│   │   ├── api/                   # tanki klijent za BFF
│   │   ├── store/                 # Zustand (session + wizard)
│   │   └── types.ts
│   ├── index.html
│   ├── vite.config.ts
│   └── package.json
├── docs/superpowers/specs/
├── .gitignore
├── README.md
└── package.json                   # workspace root
```

## 4. Komponente

### 4.1 dwClient (backend)

Tanki sloj nad axiosom. Odgovornosti:

- Login na `POST /User/Login` (application=`delmiaworks-production-reporter`, username, password, database), čuva AuthToken u memoriji vezan za session.
- Šalje `Authorization` header na svaki sledeći request.
- Auto re-login: ako DW vrati 403 Forbidden, pokušava jednom re-login sa keširanim kredencijalima iz iste sesije; ako i to ne uspe → propagira 401 ka frontu i briše sesiju.
- Konstruiše `filter` parametre po DW formatu: `buildFilter({ArInvtId: 123, Status: 'Active'})` → `(ArInvtId.eq~123~&Status.eq~Active~)`. Escape-uje znakove `~`, `&`, `|`, `(`, `)` u vrednostima.
- Vraća strogo tipizirane domain modele (ne sirovi JSON). Tipovi su izvedeni iz API dokumentacije.
- Modularno po domenu: `inventory`, `salesOrders`, `bom`, `auth`.

### 4.2 bomTreeBuilder (backend)

Rekurzivna izgradnja multi-level BOM stabla.

- Ulaz: `arInvtId`, `qty`, `dwClient`, `sessionEplantId`.
- Korak 1 (root): `MaterialsForItem(arInvtId, qty)` → direktne komponente sa već preračunatim količinama.
- Korak 2 (rekurzija): za svaku komponentu koja je proizvodni artikal (item class flag), pozovi sebe sa `(component.arInvtId, component.qtyRequired)`.
- Kupovne komponente se ne rekurziraju.
- **Detekcija ciklusa:** držimo `Set<arInvtId>` predaka u trenutnoj grani. Ako pre rekurzije nađemo da je `component.arInvtId` u tom Set-u, prekidamo TU granu, postavljamo `cycleDetected: true` na nodu, logujemo warning. Drugi delovi stabla se ne prekidaju.
- **Bez fiksne dubine** — rekurzija ide dokle god BOM ide. Isti artikal može se pojaviti u različitim granama (paralelna upotreba), to NIJE ciklus.
- Paralelizacija: po nivou koristi `Promise.all` za komponente istog roditelja.
- Izlaz: stablo sa poljima
  ```typescript
  type BomNode = {
    arInvtId: number;
    itemNumber: string;
    description: string;
    rev: string;
    itemClass: string;
    isPurchased: boolean;
    qtyRequired: number;
    uom: string;
    level: number;
    cycleDetected?: boolean;
    children: BomNode[];
  };
  ```

### 4.3 Session (backend)

In-memory `Map<sessionId, SessionData>`:

```typescript
type SessionData = {
  sessionId: string;        // UUID v4
  username: string;
  baseUrl: string;
  database: string;
  eplantId: number;
  authToken: string;
  // keširane kredencijale za re-login na 403
  passwordEnc: string;      // simetrično enkriptovano session ključem
  createdAt: Date;
  lastActivityAt: Date;
};
```

- TTL: 8h od `lastActivityAt`. Periodična čistka svakih 15 min.
- Brisanje sesije na logout endpoint-u.
- Restart procesa briše sve sesije — korisnici moraju ponovo da se uloguju (prihvatljivo u Fazi 1).

### 4.4 BFF rute (backend)

Sve pod prefiksom `/api`, sve traže validan `sessionId` cookie (osim `/api/auth/login`).

| Metoda | Putanja | Opis |
|--------|---------|------|
| POST | `/api/auth/login` | `{baseUrl, username, password, database, eplantId}` → set httpOnly cookie, vrati `{username, eplantId}` |
| POST | `/api/auth/logout` | obriši sesiju |
| GET | `/api/auth/me` | vraća sessionData ili 401 |
| GET | `/api/items?q=<string>&page=<n>` | proxy ka DW InventoryList sa search filterom |
| GET | `/api/items/:arInvtId/sales-orders` | aktivni SO za artikal |
| GET | `/api/sales-orders/:ordDetailId/releases` | release-ovi za SO line |
| GET | `/api/bom-tree?itemId=<n>&qty=<n>` | rekurzivni BOM tree |

### 4.5 Wizard UI (frontend)

4 stranice + login. Wizard state u Zustand `useWizardStore`:

```typescript
type WizardState = {
  step: 1 | 2 | 3 | 4;
  selectedItem?: { arInvtId, itemNumber, description };
  selectedSO?: { ordDetailId, orderNumber, totalOrdered, cummShipped };
  selection: { mode: 'full' | 'releases', releaseIds: number[] };
  finalQty: number;
  goTo(step): void;
  reset(): void;
};
```

Sa `persist` middleware → state preživi reload browsera.

**Step 1 - ItemSearch:**
- Input za pretragu (debounce 250ms, min 2 karaktera).
- Lista rezultata, click → `setSelectedItem` + `goTo(2)`.
- "Load more" dugme za paging.

**Step 2 - SalesOrders:**
- Učitava SO za `selectedItem.arInvtId`.
- Tabela: OrderNumber, Customer, PONumber, TotalOrdered, CummShipped, Remaining.
- Click red → `setSelectedSO` + `goTo(3)`.

**Step 3 - Releases:**
- Radio button: "Puna količina" (default) ili "Selektuj release-ove".
- Ako "Puna količina": `finalQty = selectedSO.totalOrdered`. (Potvrđeno biznis pravilo — TotalQTYOrdered, ne remaining.)
- Ako "Releases": učitava listu release-ova, checkbox po redu, dinamički sumira → `finalQty = sum(checked.qty)`.
- Validacija: ako mode=releases i ništa nije čekirano, "Next" disabled.
- "Next" → `goTo(4)`.

**Step 4 - BomView:**
- Učitava `/api/bom-tree?itemId=...&qty=...`.
- Renderuje stablo sa `BomTreeNode` komponentom (rekurzivna).
- Svaki nod: ikonica (📦 kupovni / 🔧 proizvodni), itemNumber, description, qtyRequired + uom, badge level.
- Ciklus → upozorenje "⚠ Ciklus detektovan" pod tim nodom, ne rekurzira dublje.
- Collapse/expand po nodu (default expanded prva 3 nivoa, ostalo collapsed).
- **"🔄 Osveži BOM" dugme** — ručna invalidacija TanStack Query cache-a za `bom-tree` ključ.

### 4.6 EPlant kontekst

- Korisnik bira EPlant na login formi (dropdown se popunjava iz EPlant liste — TBD koji DW endpoint vraća; u prvoj iteraciji prihvati ručni unos EPlantId broja).
- EPlant se čuva u sesiji.
- Backend automatski dodaje `&EPlantId.eq~{sessionEplant}~` u filtere za SO i WO (kasnije faze).
- Inventory itemsi su cross-plant, ne filtrira se po EPlant-u.

## 5. Data flow

```
LOGIN
  Frontend → POST /api/auth/login {baseUrl,user,pass,db,eplantId}
  Backend  → DW POST /User/Login → AuthToken
  Backend  → kreiraj sessionId, set httpOnly cookie

SEARCH ITEM (debounced 250ms)
  Frontend → GET /api/items?q=PART
  Backend  → DW GET /Manufacturing/Inventory/InventoryList/0
              ?filterby=ItemNo&searchtext=PART
  TanStack Query keš: staleTime 30s

LIST SALES ORDERS
  Frontend → GET /api/items/123/sales-orders
  Backend  → DW GET /SalesDistribution/SalesOrder/SalesOrder/0
              ?filter=(ArInvtId.eq~123~&Status.eq~Active~&EPlantId.eq~1~)
  Backend agregira po (OrderNumber, OrdDetailId)
  TanStack Query keš: staleTime 60s

LIST RELEASES
  Frontend → GET /api/sales-orders/456/releases
  Backend  → DW GET /SalesDistribution/SalesOrder/SalesOrderReleases/0
              ?salesOrderDetailId=456
  TanStack Query keš: staleTime 60s

COMPUTE FINAL QTY
  mode='full'     → finalQty = selectedSO.totalOrdered
  mode='releases' → finalQty = Σ(checked release.qty)

BOM TREE
  Frontend → GET /api/bom-tree?itemId=123&qty=500
  Backend  bomTreeBuilder:
    1. MaterialsForItem(123, 500) → komponente level 1
    2. za svaku 'manufactured' komponentu → rekurzivno
    3. Promise.all po nivou
    4. cycle detection po ancestor setu
  TanStack Query keš: staleTime ∞ (samo Refresh dugme invalidira)
```

## 6. Error handling

| Scenario | Detekcija | Backend odgovor | UI prikaz |
|----------|-----------|-----------------|-----------|
| DW nedostupan | axios timeout 15s ili ECONNREFUSED | 503 + `{error:'DW_UNREACHABLE'}` | Toast + "Probaj ponovo" |
| Pogrešni kredencijali | DW 500 na /User/Login | 401 + `{error:'AUTH_FAILED'}` | Inline error na login formi |
| AuthToken istekao | DW 403 mid-session | Auto re-login jednom; ako fail → 401 | Toast "Sesija istekla" + redirect /login |
| Artikal nema BOM | prazna lista iz `MaterialsForItem` | 200 + `{tree: null, reason:'NO_BOM'}` | "Ovaj artikal nema definisan BOM" |
| Ciklus u BOM grani | ancestor set sadrži arInvtId | nod sa `cycleDetected:true`, log warn | Badge "⚠ Ciklus: PART-X" pod nodom |
| SO bez release-ova | DW vraća praznu listu | 200 + `{releases:[]}` | "Nema release-ova" + onemogući checkbox mode |
| Selektovano 0 release-ova | client-side validacija | n/a | Next disabled, inline hint |
| Količina ≤ 0 | server validacija | 400 + `{error:'INVALID_QTY'}` | Toast |
| Drugi DW 5xx | catch-all | 502 + `{error:'DW_ERROR', message, requestId}` | Toast + requestId |

**Logovanje (pino):**

- Po HTTP request-u: `{requestId, sessionId, username, method, path, status, durationMs, dwCalls[]}` (dwCalls = niz `{endpoint, status, ms}`).
- `bomTreeBuilder` loguje: ukupan broj nodova, max dubinu dostignutu, broj detektovanih ciklusa.
- Greške → level `error` sa stack-om. Uspesi → `info`.

**Retry strategija (Faza 1):**

- Network errors: jednom retry sa 1s backoff.
- 5xx od DelmiaWorks-a: ne retry-ujemo automatski (sve GET-ovi u Fazi 1 su jeftini, ali ne želimo da maskiramo probleme).

**Frontend rezilijencija:**

- Zustand `persist` u localStorage → wizard state preživi reload.
- "Reset wizard" dugme briše state i vraća na step 1.
- Step 4 na reload → ponovo učita BOM (cache hit ako < 60s).

## 7. Testiranje

| Sloj | Alat | Pokriva |
|------|------|---------|
| `dwClient` unit | Vitest + nock | filter konstrukcija, header injekcija, parse u domain modele, retry logika |
| `bomTreeBuilder` unit | Vitest | jednostavan BOM, multi-level, ciklus u grani, prazan BOM, isti artikal u 2 grane, paralelizacija |
| `routes` integration | Vitest + supertest | rute sa stub-ovanim dwClient-om — status kodovi, JSON oblik |
| Frontend komponente | Vitest + React Testing Library | wizard state tranzicije, validacije, BomTreeNode rekurzija |
| E2E (opciono) | Playwright | login → search → SO → full qty → BOM render (manuelno, ne u CI) |

**Fixtures:**

- `backend/test/fixtures/dw/` — snimljeni DW JSON odgovori:
  - `inventoryList.json`
  - `salesOrder.json`
  - `salesOrderReleases.json`
  - `bomComponentsEx_simple.json`
  - `bomComponentsEx_cycle.json`
  - `materialsForItem_multilevel.json`
- Snimaju se jednom skriptom `scripts/recordFixtures.ts` protiv test VM, komituju se sa testovima.

**TDD pristup (po superpowers:test-driven-development):**

- Svaka jedinica koda dobija test PRE implementacije.
- Posebno: `bomTreeBuilder` (ciklusi, paralelizacija), `buildFilter` (escape, AND/OR), wizard state mašina (prelasci).

## 8. Šta JE i NIJE u Fazi 1

**JE u opsegu:**

- Login sa DW kredencijalima + izbor EPlant-a
- Pretraga artikala
- Lista aktivnih Sales Order-a za artikal
- Lista release-ova + selekcija ili "puna količina = TotalQTYOrdered"
- Multi-level BOM stablo sa preračunatim količinama
- Detekcija ciklusa
- "Refresh BOM" dugme
- Strukturisano logovanje
- Unit + integration testovi

**NIJE u opsegu (Faze 2–5):**

- Radni nalozi (Work Orders) — pronalaženje, selekcija, hijerarhija
- Nabavna porudžbenica — kreiranje, prijem, štampanje nalepnica
- Automatska prijava proizvodnje od dna ka vrhu
- Backflush, serijski brojevi, master label
- Audit log u perzistentnoj bazi
- Korisničke role i autorizacija
- Multi-user pristup (jedna mašina, jedan korisnik istovremeno za sada)
- Resumability nakon prekida

## 9. Otvorena pitanja za fazu implementacije

1. **EPlant lista endpoint** — koji tačno DW endpoint vraća listu dostupnih EPlant-ova za logovanog korisnika? Treba proveriti u dokumentaciji ili na test VM. Fallback: ručni unos EPlantId broja.
2. **Detekcija "manufactured vs purchased"** — tačno polje u `MaterialsForItem` odgovoru koje to razlikuje (`ItemClass`? bool flag?) — verifikovati na pravom odgovoru iz test VM.
3. **DW `InventoryList` filter polje** — `filterby=ItemNo` vs `filterby=Description` vs `filterby=All` — proveriti dostupne vrednosti.
4. **Aktivni SO definicija** — `Status.eq~Active~` ili neki drugi string? Proveriti enum vrednosti za status.

Sva ova pitanja se rešavaju prvim pozivom na test VM tokom implementacije, ne blokiraju pisanje plana.
