# Changelog

## 2026-06-02

Implementiran i objavljen pre-receive validator (Tasks 2–6, TDD): `validateReceipt`
+ ruta `POST /:poId/receive-validate` + automatski panel upozorenja (grupe A recept,
C serijalizovano+razlomljeno); `receivePO` netaknut. Testovi: backend 105/105,
frontend 22/22. Live: prijem 100 stavki uspeo protiv DW; ostatak stavki nije prošao —
za analizu sutra.
