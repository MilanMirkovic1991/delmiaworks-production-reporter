# Pre-receive validator (upozorenja pre prijema) — dizajn

**Datum:** 2026-06-02
**Status:** U pregledu (brainstorming)
**Sledeći korak:** korisnik pregleda → writing-plans → implementation
**Obrazac:** preslikava `2026-06-01-retry-receipts-design.md` (zasebna funkcija/ruta,
`receivePO` netaknut).

## 1. Cilj

Kad korisnik napravi nabavnu porudžbenicu (PO) i krene u prijem, deo redova padne
iz razloga koji se **mogu znati unapred** — pre nego što se klikne „Prijem". U
živom testu PO #23 (111 stavki) palo je 55 redova, i skoro svi su bili
master-data problemi u DW-u, ne greška u kodu.

Cilj ove izmene: čim se PO napravi, aplikacija **automatski** pregleda stavke i
prikaže **sažet panel upozorenja** iznad dugmeta „Prijem" — tipa „50 stavki nema
recept", „3 serijalizovane stavke sa razlomljenom količinom". Tako korisnik vidi
probleme unapred i može da ih reši (ili svesno nastavi), umesto da otkrije neuspeh
tek posle prijema.

**Ključno ponašanje: validator SAMO upozorava. Ne blokira i ne preskače prijem.**
Dugme „Prijem" ostaje aktivno. Razlog: lažna uzbuna ne sme da zaustavi ispravan
prijem; korisnik zadržava punu kontrolu.

## 2. Odakle dolaze upozorenja (4 grupe neuspeha iz testa PO #23)

Iz živog testa znamo 4 grupe razloga zašto red prijema padne:

- **A — artikal nema recept** („No recipe card" / treba „Roll Inventory Cost").
  ~50 od 55 neuspeha — **daleko najveća korist.**
- **B — orphan MASTER_LABEL bez lota** za taj artikal (zaostao iz ranijih
  neuspelih runova).
- **C — serijalizovan artikal + razlomljena količina** (npr. 12.8, 2.1472,
  32.0176) — serijski broj traži cele komade. 3 stavke.
- **D — „PO Receipt not found determining currency"** — prolazno / vendor
  currency. 3 stavke. **Ovo NE pokriva validator** — već ga rešava retry.

Validator pokriva **A, B i C**. Grupa D ostaje na retry-u.

## 3. Šta korisnik vidi (ekran)

Menja se ekran „Radni nalozi" (`frontend/src/pages/WorkOrders.tsx`), tačnije
deo posle kreiranja PO-a, iznad postojećeg dugmeta „Prijem".

- Čim `createPO` vrati stavke, frontend ih automatski pošalje na proveru i
  prikaže **jedan sažet, grupisan panel**. Korisnik ne mora ništa da klikne.
- Panel je **grupisan po tipu problema**, ne red-po-red (spisak ume biti dug,
  ~50). Na primer:
  - ⚠️ „50 stavki nema recept (Roll Inventory Cost) — prijem će verovatno pasti
    za njih."
  - ⚠️ „3 serijalizovane stavke imaju razlomljenu količinu."
  - ⚠️ „2 stavke imaju zaostalu master nalepnicu bez lota."
- Svaka grupa može da se **raširi** da pokaže koje tačno stavke (broj artikla)
  spadaju u nju — da korisnik zna šta da prijavi DW adminu.
- **Dugme „Prijem" ostaje aktivno cело vreme.** Panel je informativan.
- Dok provera traje, panel prikazuje „Proveravam stavke..."; ako provera sama
  padne (npr. DW ne odgovara), panel to kaže ali **ne** sprečava prijem.
- Ako nema nijednog upozorenja, panel je ili sakriven ili kaže „Nema upozorenja —
  sve stavke izgledaju spremne za prijem."

## 4. Šta se dešava iza (arhitektura — „Pristup 1")

Isti obrazac kao retry: **nova funkcija + nova ruta, `receivePO` netaknut.**

1. Frontend već ima stavke iz odgovora `createPO` (`lineItems`: arInvtId,
   quantity, poDetailId, releaseId) i pošalje ih novoj ruti
   **`POST /api/po/:poId/receive-validate`**.
2. Nova funkcija **`validateReceipt`** u `backend/src/dwClient/po.ts`:
   - Za svaki **različit** artikal (dedup po arInvtId) pročita DW podatke
     potrebne za provere A i C. Ovo su **čitanja** — mogu paralelno (nema Oracle
     sequence trke kao kod upisa).
   - Jednom pročita `GET /Labels/PrintLabel/MasterLabels/0` za grupu B.
   - Vrati **grupisana upozorenja** (po tipu, sa listom pogođenih stavki).
3. `receivePO` se **ne dira** (kao i kod retry-a).

Provere:

- **A (nema recept):** detektovati preko polja/poziva koji DW vraća za artikal.
  **Koje tačno polje — još se ne zna; mora proba na DW test VM** (vidi sekciju 8).
  Ako se pouzdan signal ne nađe, grupa A radi „najbolje što može" uz jasnu
  napomenu da je provera nepouzdana.
- **B (orphan label):** master nalepnica za artikal koja postoji ali nema vezan
  lot — heuristika koju treba izoštriti na pravim podacima.
- **C (serijalizovan + razlomljeno):** artikal ima zastavicu „serijalizovan"
  (verovatno na `InventoryItem`, nije još mapirana — potvrditi probom) **i**
  količina na stavci nije ceo broj.

## 5. Granični slučajevi

| Situacija | Šta radimo |
|-----------|------------|
| Provera (validate) sama padne | Panel kaže da provera nije uspela; **dugme „Prijem" ostaje aktivno.** Validator nikad ne blokira. |
| Signal za recept (A) ne postoji u WebAPI-ju | Grupa A radi „najbolje što može" uz jasnu napomenu „provera recepta nepouzdana"; ne lažira tačnost. |
| Lažno upozorenje | Prihvatljivo — panel je informativan, korisnik svesno nastavlja prijem. |
| Isti artikal na više stavki | Dedup po arInvtId — DW se čita jednom po artiklu; upozorenje navodi sve pogođene stavke. |
| Sesija istekla tokom provere | Vrati 401/403; frontend tretira kao i drugde (povratak na login). Ne ostavlja poluprikazan panel. |
| Postojeće dugme „Prijem" i `receivePO` | Netaknuti — rade isto kao pre. |

## 6. Testiranje (TDD, fixtures, ne živi DW)

| Sloj | Pokriva |
|------|---------|
| `dwClient` — `validateReceipt` | A: artikal bez recepta → upozorenje; sa receptom → ništa. B: orphan label → upozorenje. C: serijalizovan + razlomljeno → upozorenje; serijalizovan + ceo broj → ništa; neserijalizovan + razlomljeno → ništa. Dedup po arInvtId. |
| `dwClient` — robusnost | Ako DW poziv za jedan artikal padne, ostali se i dalje provere; cela funkcija ne pukne. |
| backend ruta | Ulaz = lista stavki, izlaz = grupisana upozorenja; prosleđuje 401/403. |
| frontend | Panel se pojavi automatski po `createPO`; grupisan prikaz; širenje grupe pokazuje stavke; **dugme „Prijem" ostaje aktivno** u svim slučajevima; greška provere ne blokira. |

Testovi se pišu PRE implementacije. Za DW odgovore — snimljeni fixtures.

## 7. Šta JE i NIJE u opsegu

**JE:**

- Automatski, grupisan panel upozorenja iznad dugmeta „Prijem".
- Tri provere: A (recept), B (orphan label), C (serijalizovan + razlomljeno).
- Nova funkcija `validateReceipt` (`po.ts`) + nova ruta `…/receive-validate`.
- Dedup čitanja po artiklu; paralelna čitanja; jedno čitanje master nalepnica za B.

**NIJE:**

- Bilo kakva izmena `receivePO` ili postojećeg dugmeta „Prijem".
- Blokiranje ili preskakanje prijema (validator samo upozorava).
- Grupa D („determining currency") — ostaje na retry-u.
- Automatsko ispravljanje problema (npr. „Roll Inventory Cost", brisanje orphan
  label-a, zaokruživanje količine) — to su zasebne, kasnije odluke.

## 8. Otvorena pitanja za fazu implementacije (prvi zadatak plana = proba DW VM)

1. **(GLAVNO) Koje DW polje/poziv otkriva „ima/nema recept" (grupa A).** Ne zna
   se. Mora proba na DW test VM (`backend/tools/peek-*.ts`, `npx tsx`, obrisati
   pre commita). Bez mrežnog pristupa toj VM ne može se potvrditi. **Najveća
   vrednost validatora zavisi od ovoga.** Ako se ne nađe → A „najbolje što može".
2. **Zastavica „serijalizovan" (grupa C)** — verovatno na `InventoryItem`, nije
   mapirana. Potvrditi istom probom; dodati u `inventory.ts` (`getById`).
3. **Heuristika „orphan" (grupa B)** — šta tačno znači „bez lota"; izoštriti na
   pravim podacima sa test VM.

Sva tri se rešavaju prvim zadatkom plana (proba test okruženja) i **ne blokiraju
pisanje plana** — plan može da se napiše tako da prvi korak bude upravo proba.

## 9. Blokeri van koda (DW admin — korisnik)

Ovo validator samo **otkriva**; ispravlja ih DW admin:

- „Roll Inventory Cost" za ~50 arInvtId bez recepta (grupa A).
- Obrisati orphan MASTER_LABEL redove Id 254 i 327 (grupa B).
- Odluka za grupu C: zaokruživanje količine, izmena config-a artikla, ili
  manualan prijem.
