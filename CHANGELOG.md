# Changelog

Kratke dnevne stavke za reviziju (najnovije na vrh). Detalji: `CLAUDE.md` i `HANDOFF.md`.

## 2026-06-03

Live prijem PO 20: 99/111 (jutarnji ORA-14552 na sekvenci `S_EPLANT_PO_REC_13`
rešen ručnim prijemom koji je inicijalizovao brojač). Razložene 4 kategorije
neuspeha (A recept, B lot/orphan, C serijalizovano+preciznost, D currency).
Dodato (TDD, NEKOMITOVANO): `extractDwFriendlyMessage` (DW poruka do UI),
`classifyReceiptError` + grupisan panel rezimea u `WorkOrders.tsx`, i ispravka
decimala za serijalizovane (`receivePO` na labelu šalje qty koju DW upiše na
prijem). Testovi: backend 110/110, frontend 31/31.
