# HANDOFF — slika za sutra (2026-06-03)

Kratak snapshot za nastavak. Za dublji kontekst: `PROJECT-OVERVIEW.md`,
`docs/handoff-2026-06-02.md`, `.cowork-handoff/`.

## Trenutno stanje

- Branch `main` == `origin/main` (sve pushovano). Validator (Tasks 2–6) je komitovan
  i objavljen danas: `f678b8b…a833901`. Stavka „commit validatora" iz jučerašnjeg
  handoff-a je TIME ZAVRŠENA.
- Testovi zeleni: **backend 105/105, frontend 22/22**. `tsc` čist osim PRE-POSTOJEĆE
  pino-http greške u `server.ts` (nije naša, ne utiče na dev/test).
- E2E tok radi: login → SO/artikal → BOM → stablo WO → priprema nabavke → kreiranje PO
  (PO_RELEASES, Seq, auto-approve) → prijem (Lot, FGMULTI, MASTER_LABEL, unikatan
  7-cifren serijski) → retry neuspelih → pre-receive validator (panel upozorenja, grupe
  A i C). Ne radi još: prijava proizvodnje (Phase 4), kreiranje WO (Phase 2).
- Live test danas: prijem **100 stavki uspeo** i potvrđen protiv DW okruženja.

## Sledeći koraci (po prioritetu)

1. **Razložiti šta NIJE prošlo na ostatku stavki u današnjem prijemu** (posle 100 uspelih).
   Detalji (koje stavke, poruka/ponašanje) još NISU zabeleženi — prvo ih prikupiti.
   Utvrditi da li pada u domen validatora (grupe A/B/C) ili je nov slučaj. **Najhitnije.**
2. **Task 1 — proba DW VM:** pokrenuti `backend/tools/peek-*.ts` (`npx tsx`) da se potvrde
   TAČNA imena polja za recept (grupa A) i serijalizaciju (grupa C); pravi ključ pomeriti
   na početak `RECIPE_KEYS` / `SERIAL_KEYS` u `backend/src/dwClient/inventory.ts`. Probu
   obrisati pre commita. Do tada kod radi defanzivno (više kandidata → „RECIPE_UNRELIABLE").
3. **Grupa B (orphan MASTER_LABEL)** — još nije implementirana. `validateReceipt` već čita
   `MasterLabels/0` jednom; treba dodati heuristiku (čeka da proba potvrdi item-id i lot polja).
4. **Zaokruživanje razlomljene količine** (lek za grupu C), pa **Phase 2** (kreiranje WO),
   **Phase 4** (prijava proizvodnje), **Phase 5** (hardening). Nisu počele.

## Donete odluke i zašto

- **Validator samo upozorava, nikad ne blokira** dugme „Prijem" (Pristup 1). `receivePO` /
  `retryReceipt` / `createPurchaseOrder` ostavljeni NETAKNUTI → put prijema ostaje stabilan.
- Panel upozorenja je grupisan i automatski (auto-poziv `receive-validate` pri otvaranju);
  `itemNumber` se mapira iz BOM-a (`purchaseItems`) jer `createPO.lineItems` ne nosi broj artikla.
- `MASTER_LABEL.SERIALNO` = globalni monotoni max+1 (7 cifara, nikad duplikat);
  `PO_RELEASES.Seq` = per-arInvtId brojač. (Bug-fix-ovi iz ranijih sesija, drže se.)

## Otvoreni problemi / blokeri

- **Ostatak stavki u prijemu nije prošao** — uzrok nepoznat dok se ne prikupe detalji (korak 1).
- **Cowork mount blokira git upis i brisanje fajlova** (`.git/index.lock` „Operation not
  permitted", `rm` ne radi). Commit/brisanje raditi na Windows-u.
- Zaostali junk od vitest-a: `backend/vitest.config.ts.timestamp-*.mjs`,
  `frontend/vite.config.ts.timestamp-*.mjs`. Obrisati na Windows-u ili dodati
  `*.timestamp-*.mjs` u `.gitignore`. Nisu povezani s logikom.

## Izmenjeni / nekomitovani fajlovi

- Realne izmene: `docs/handoff-2026-06-02.md` (+7, beleška s kraja dana). Ostalo u
  `git status` je CRLF↔LF šum (`git diff --ignore-all-space --stat` to potvrđuje).
- **NE komitovati:** `Cene.xlsx`, `Cene_popunjen.xlsx`, `Cene/`, `_fill_cene.py` (nepovezano).

## Komande

- Test sve: `npm test` (backend `npm --workspace backend run test`, frontend
  `npm --workspace frontend run test`).
- Build: `npm run build`.
- Dev: `npm run dev:backend` (tsx watch) + `npm run dev:frontend` (vite, port 5174).
  Na Windows-u: `pokreni.bat` (git pull --ff-only → npm install po potrebi → start);
  `zaustavi.bat` za gašenje.
