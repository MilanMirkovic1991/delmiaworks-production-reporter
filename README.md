# delmiaworks-production-reporter

Wizard app that walks a planner through:
1. Pick an item
2. Pick an active Sales Order for that item
3. Pick the full ordered quantity or specific releases
4. View the multi-level BOM with calculated component quantities

Phase 1 is **read-only** — nothing is written to DelmiaWorks.

## Requirements

- Node.js 20+
- A reachable DelmiaWorks WebAPI (e.g. `http://delmiaworks-host:8080/WebAPI`) and valid credentials
- Network access from the dev machine to the DW WebAPI

## Setup

```bash
npm install
```

## Dev

In two terminals:

```bash
# Terminal 1 — backend (http://localhost:3001)
npm run dev:backend

# Terminal 2 — frontend (http://localhost:5173)
npm run dev:frontend
```

Open http://localhost:5173, log in with your DW credentials, and walk through the wizard.

## Test

```bash
npm test                # runs backend + frontend test suites
```

## Build

```bash
npm run build
```

## Architecture

See [`docs/superpowers/specs/2026-05-19-prijava-proizvodnje-phase1-design.md`](docs/superpowers/specs/2026-05-19-prijava-proizvodnje-phase1-design.md).

## Roadmap

- **Phase 1 (this):** read-only item → SO → releases → BOM tree
- **Phase 2:** find and select Work Orders for the chosen quantity
- **Phase 3:** create Purchase Order + auto-receive + print labels
- **Phase 4:** automatic production reporting bottom-up
- **Phase 5:** hardening — persistent audit log, resumable runs, role-based authz
