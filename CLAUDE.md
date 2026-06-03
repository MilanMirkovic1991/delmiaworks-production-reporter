# CLAUDE.md — DelmiaWorks Production Reporter

Projektna memorija. Auto-učitava se na startu sesije; dopunjuje globalni `CLAUDE.md`
(MES/shop-floor preferencije).

## Prvo pročitaj

- `HANDOFF.md` — dnevna „slika za sutra" (trenutno stanje + sledeći koraci).
- `docs/SESSION-CONTEXT.md` — pun kontekst (arhitektura, fajl-mapa, odluke, konvencije).
- `CHANGELOG.md` — istorija po danima. Širi pregled: `PROJECT-OVERVIEW.md`.

## Šta je app (ukratko)

Wizard koji preko DelmiaWorks WebAPI-ja automatizuje prijavljivanje proizvodnje:
login → EPlant → Sales Order/artikal → BOM → stablo radnih naloga → priprema nabavke →
kreiranje PO → prijem sa nalepnicama → retry → pre-receive validator. Cilj koji još NE
radi: automatska prijava proizvodnje od dna BOM-a ka vrhu (Phase 4) i kreiranje WO (Phase 2).
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
- TDD; Conventional Commits. Ne diraj `receivePO` / `retryReceipt` / `createPurchaseOrder`
  bez razloga — put prijema mora ostati stabilan.
- Trajno stanje/odluke upisuj u markdown u projektu (HANDOFF.md kratak i ažuran), ne samo u chat.

## Zamke okruženja

- Cowork mount blokira git upis i `rm` — commit/brisanje na Windows-u.
- NE komitovati: `Cene.xlsx`, `Cene_popunjen.xlsx`, `Cene/`, `_fill_cene.py`.
- `git status` ima CRLF↔LF šum → prave izmene: `git diff --ignore-all-space --stat`.
