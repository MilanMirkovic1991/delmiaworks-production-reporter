# CLAUDE.md — DelmiaWorks Production Reporter

Jedini instrukcioni fajl projekta. Auto-učitava se na startu sesije; dopunjuje globalni
`CLAUDE.md` (MES/shop-floor preferencije). Dublja arhitektura/fajl-mapa (opciono):
`docs/SESSION-CONTEXT.md`.

## Šta je app (ukratko)

Wizard koji preko DelmiaWorks WebAPI-ja vodi ka automatskoj prijavi proizvodnje:
login → EPlant → Sales Order/artikal → BOM → stablo radnih naloga. Cilj koji još NE
radi: automatska prijava proizvodnje od dna BOM-a ka vrhu (Phase 4) i kreiranje WO (Phase 2).
**Nabavka i prijem su UKLONJENI (2026-06-04)** — fokus je isključivo na prijavi proizvodnje.
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
- TDD; Conventional Commits. Ne diraj foundation lanac (auth → EPlant → SO → BOM → WO stablo)
  bez razloga — to je osnova za prijavu proizvodnje.
- Trajno stanje/odluke upisuj OVDE (sekcije „Trenutno stanje" i „Changelog"), ne samo u chat.

---

## Trenutno stanje (slika za nastavak — ažuriraj na kraju dana)

- **2026-06-04: Phase 4 (kaskadna prijava proizvodnje) IMPLEMENTIRANA** (commit `489db8c`),
  čeka živi test korisnika. Klik „Prijavi proizvodnju" na čvoru prijavi taj WO + ceo podstablo,
  od dna ka vrhu, preko DW `ReportProductionByWorkOrder`. Po WO: `WorkOrderEx.ProductionHours`
  (standard) → ±15% jitter; `goodPartsQty` = puna `Quantity`; `lotNo` = broj WO-a (`mfgNumber`).
  Read-only dry-run prema VM-u potvrdio mapiranja na pravim podacima (57 WO za eplant 13).
  Testovi: **backend 90/90, frontend 16/16** zeleno. Frontend build čist; backend `tsc` čist osim
  PRE-POSTOJEĆE pino-http greške.
- **2026-06-04 (ranije): nabavka i prijem UKLONJENI** (`4c77771`); keeper `extractDwFriendlyMessage` (`cdad354`).
- E2E lanac: login → SO lista → stavka SO → Release (količina) → stablo radnih naloga; na svakom
  WO dugme „▶ Prijavi proizvodnju" pokreće kaskadu (potvrda pre upisa), status ✓/✗ po WO u stablu.
- Faze: Phase 1 GOTOVA; **Phase 4 IMPLEMENTIRANA (čeka živi test).** Phase 2 (kreiranje WO) /
  Phase 5 NISU počele. Phase 3 (nabavka/prijem) + validator + retry UKLONJENI.

### Sledeći korak

- **Živi test Phase 4 (2026-06-04) — uzrok pada razložen, odluka doneta.** Kaskada pada na
  serijskim komponentama: artikli klase „IN" (potrošni, troše se u delićima, npr. `097327103`)
  bili su **serijski**, a DW ZABRANJUJE skidanje delića serijskog lota (`FloorDispositionEx` →
  „Duplicate scan or Partial is disabled!"; auto-backflush → „Insufficient inventory", regular
  pool 0). To je DW master-data kontradikcija (serijsko + razlomljena količina), ne greška u kodu.
  **Odluka korisnika: skida serijalizaciju sa tih artikala i radimo STRIKTNO bez serijalizacije.**
  Aplikacija NE menja kod — čim artikli nisu serijski, auto-backflush prolazi i kaskada ide do kraja.
- **Po de-serijalizaciji:** ponovo pokrenuti kaskadu (✗ → ✓). Opciono: kontrolna proba na test VM-u
  da se potvrdi uspešna prijava (jedna prijava = pravi upis u test bazu; minimalna količina).
- Otvoreno: opcija „preostala umesto pune količine", živa progresija dok kaskada traje (sad rezime na kraju).
- Spec: `docs/superpowers/specs/2026-06-04-production-reporting-cascade-design.md`.
  Ako nabavka/prijem ikad zatrebaju nazad — `git revert 4c77771`.

### Otvoreni problemi / blokeri

- Cowork mount blokira git upis i `rm` — commit/brisanje na Windows-u.
- Junk od vitest-a: `*.timestamp-*.mjs` (backend/frontend) — obrisati ili u `.gitignore`.
- NE komitovati: `Cene.xlsx`, `Cene_popunjen.xlsx`, `Cene/`, `_fill_cene.py`.
- `git status` ima CRLF↔LF šum → prave izmene: `git diff --ignore-all-space --stat`.
- PRE-POSTOJEĆA pino-http greška u `server.ts` (`tsc` build): `app.use(pinoHttp(...))`
  „not callable". Ne utiče na dev (tsx) ni test (vitest). Nije uvedena našim radom.

---

## Changelog (dopisuj najnovije na vrh)

- **2026-06-04 (Phase 4 živi test)** — Kaskada pada na serijskim komponentama. Razloženo probom
  test VM-a: artikli klase „IN" (potrošni, razlomljena BOM količina, npr. `097327103`, lot
  MasterLabelId 136 / serijski 0000114 / 100000 kom / LocId 27029) bili su serijski; DW ne da da
  se skine delić serijskog lota (`FloorDispositionEx` → „Partial is disabled"; auto-backflush →
  „Insufficient inventory", regular pool 0). DW master-data kontradikcija (ista klasa kao stara
  „grupa C"), ne kod. **Odluka: skinuti serijalizaciju, raditi striktno bez nje** — aplikacija bez
  izmene; čim nije serijsko, auto-backflush prolazi. Sve probe atomarno poništene (ništa upisano).
- **2026-06-04 (Phase 4)** — Kaskadna prijava proizvodnje, TDD, commit `489db8c`. Otkriven DW
  WebAPI read-only probom test VM-a: `GET WorkOrders/WorkOrderEx/{woId}` → `ProductionHours`;
  `GET ReportProductionByWorkOrder/WorkOrder/{eplant}?workOrderId` → `Quantity`; `POST
  ReportProductionByWorkOrder/GoodPartsQuantityDisposition/{eplant}?workOrderId&goodPartsQty&
  productionHours&lotNo`. Klik na čvor → `flattenBottomUp` (post-order, preskače kupovne/cikluse)
  → po WO sekvencijalno: čitaj standard → `jitterHours` ±15% → POST puna `Quantity`. Auth greška
  staje, DW greška nastavlja (`runCascade`). Nove jedinice: `dwClient/production.ts`,
  `services/productionCascade.ts`, `routes/production.ts` (`POST /api/production/report-cascade`);
  vraćen `looksLikeAuthError`; frontend `reportProductionCascade` + dugme na WO + status ✓/✗ po WO.
  Read-only dry-run potvrdio mapiranja (WO 1342: std 1.0688 h, qty 32). Testovi: backend 90/90,
  frontend 16/16. NIJE još živi test (pravi upis u DW).
- **2026-06-04** — Uklonjeni nabavka i prijem (Phase 3 + pre-receive validator + retry), po
  odluci da se fokus svede isključivo na prijavu proizvodnje. Obrisano: `dwClient/po.ts`,
  `routes/po.ts`, `utils/collectPurchased.ts`, `utils/classifyReceiptError.ts` + 11 test fajlova;
  skinuti validatorski biti (`hasRecipe`/`isSerialized`/`RECIPE_KEYS`/`SERIAL_KEYS`) iz
  `inventory.ts`; `WorkOrders.tsx` sveden na čist prikaz WO stabla; PO metode/tipovi iz
  `api/client.ts`. Zadržan `extractDwFriendlyMessage` u `http.ts` (generička DW poruka, korisna
  za Phase 4; commit `cdad354`). 21 fajl, −2410 linija (commit `4c77771`). Testovi: backend 69/69,
  frontend 14/14. Stari changelog ispod ostaje kao istorija (PO 20 live nalazi, kategorije A–D).
- **2026-06-03 (popodne)** — Ispravka decimala za serijalizovane (grupa C), TDD, NEKOMITOVANO:
  `receivePO` sada na labelu (`CreatePoReceiptsLabelsPlan.Qty`) šalje qty koju je DW upisao na prijem
  (`CreatePOReceipt` body `Qty`), umesto sirove qty sa release-a → prijem i labela se poklope za
  serijalizovan artikal. Bez zaokruživanja s naše strane (mirror DW vrednosti). Dodat jednokratni
  `DW response sample (CreatePOReceipt)` log za potvrdu polja. Ispravljen i tekst grupe C u
  `classifyReceiptError.ts` (nije „mora ceo broj", nego neslaganje preciznosti). Testovi: backend 110/110,
  frontend 31/31. NB: grupu A je korisnik ručno sredio (roll cost); ako VM snapshot vrati pre toga,
  recepture treba ponovo. `receivePO` srž (koraci/štampa) nije menjana — samo qty koja ide na labelu.
- **2026-06-03** — Live prijem PO 20: 99/111 (sekvenca `S_EPLANT_PO_REC_13` ujutru nestala →
  ručni prijem je inicijalizovao; ORA-14552 prošao). Razložene 4 kategorije neuspeha (A recept,
  B lot/orphan, C serijalizovan+razlomljen, D currency — D je nov). Dodato (TDD, NEKOMITOVANO):
  `extractDwFriendlyMessage` u `dwClient/http.ts` (DW poruka stiže do UI), `utils/classifyReceiptError.ts`
  + grupisan panel rezimea posle prijema u `WorkOrders.tsx`. `receivePO`/`retry`/`createPO` netaknuti.
  Testovi: backend 109/109, frontend 31/31.
- **2026-06-02** — Implementiran i objavljen pre-receive validator (Tasks 2–6, TDD):
  `validateReceipt` + ruta `POST /:poId/receive-validate` + automatski panel upozorenja
  (grupe A recept, C serijalizovano+razlomljeno); `receivePO` netaknut. Testovi
  backend 105/105, frontend 22/22. Live: prijem 100 stavki uspeo; ostatak za analizu sutra.
