# delmiaworks-production-reporter

Wizard app that walks a planner through: item → Sales Order → releases → multi-level BOM tree with calculated quantities. Phase 1 is read-only (no writes to DelmiaWorks).

## Development

```bash
npm install
npm run dev:backend   # http://localhost:3000
npm run dev:frontend  # http://localhost:5173
```

See `docs/superpowers/specs/2026-05-19-prijava-proizvodnje-phase1-design.md` for design and `docs/superpowers/plans/2026-05-19-prijava-proizvodnje-phase1.md` for the implementation plan.
