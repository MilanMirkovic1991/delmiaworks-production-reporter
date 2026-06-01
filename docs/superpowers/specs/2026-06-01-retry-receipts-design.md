# Ponovni prijem za neuspele redove (Retry) — dizajn

**Datum:** 2026-06-01
**Status:** Approved (brainstorming)
**Sledeći korak:** writing-plans → implementation

## 1. Cilj

Kad korisnik pokrene prijem nabavke (PO receipt), aplikacija obrađuje red po red.
Neki redovi prođu, neki padnu (npr. DW na trenutak nije odgovorio, ili je jedan
od tri koraka pukao). Trenutno, ako red padne, jedini izlaz je da se ceo prijem
pokrene ponovo — a to bi pokušalo i one redove koji su već prošli.

Cilj ove izmene: dati korisniku dugme **„Ponovi"** pored svakog neuspelog reda,
i jedno dugme **„Ponovi sve neuspele"** iznad tabele. Klik pokušava prijem ponovo
**samo za taj red (ili te redove)**, i to pametno — nastavlja odakle je prošli
pokušaj stao, umesto da pravi duplikate.

## 2. Kako prijem radi danas (podsetnik)

Prijem jednog reda ima tri koraka koji idu jedan za drugim:

1. **Kreiranje prijema** — napravi se red u DW tabeli prijema (PO_RECEIPTS).
2. **Plan nalepnice** — rezerviše se „mesto" za nalepnicu (koliko komada, koja
   količina, koji serijski broj).
3. **Knjiženje + master nalepnica** — prijem se proknjiži, napravi se zapis u
   FGMULTI, i u master nalepnicu se upiše veza ka tom zapisu.

Dve stvari se računaju na početku celog prijema:

- **Serijski broj** — sedmocifren, jedinstven u celom sistemu, nikad se ne
  ponavlja. Računa se iz najvećeg postojećeg serijskog broja.
- **Lot broj** — po artiklu, ceo broj, računa se iz najvećeg postojećeg lota za
  taj artikal.

Ako neki korak padne, red ostane „napola gotov" — npr. prijem je napravljen, ali
nije proknjižen. Zato ponovni pokušaj ne sme naivno da krene od koraka 1, jer bi
napravio drugi prijem za istu stavku (tzv. orphan red).

## 3. Šta korisnik vidi (ekran)

Menja se ekran „Radni nalozi" (`frontend/src/pages/WorkOrders.tsx`), tabela sa
rezultatima prijema koja se pojavi nakon klika na postojeće dugme za prijem.

**Po redu:**

- Red koji je prošao izgleda kao i sad: zelena kvačica i popunjene kolone
  (Receipt ID, FGMULTI, Master Label).
- Red koji je pao trenutno prikazuje `✗ <poruka greške>`. Pored te poruke dodaje
  se malo dugme **„Ponovi"**.
- Dok ponovni pokušaj traje, dugme tog reda je zaključano i prikazuje „...".
- Ako pokušaj uspe, red se „pretvori" u uspešan (zelena kvačica, popunjene kolone),
  dugme nestane.
- Ako opet padne, ostaje `✗ <nova poruka>` sa dugmetom „Ponovi" spremnim za novi
  pokušaj.

**Iznad tabele:**

- Ako ima bar jedan neuspeli red, prikazuje se dugme **„Ponovi sve neuspele"**.
- Klik pošalje sve neuspele redove backendu, koji ih obrađuje jedan za drugim (ne
  sve odjednom — vidi razlog u sekciji 5) i vrati rezultat za svaki. Kad grupni
  pokušaj završi, svaki red u tabeli dobije svoj novi ishod (zelena kvačica ili
  nova poruka greške).
- Dok grupni pokušaj traje, oba dugmeta (i grupno i pojedinačna) su zaključana.
- Kad se završi, dugme „Ponovi sve neuspele" nestaje ako više nema neuspelih
  redova, ili ostaje ako ih je još.

## 4. Šta se dešava iza kad klikneš „Ponovi"

Dodaje se nova funkcija u `backend/src/dwClient/po.ts` koja obrađuje **jedan red**
(jedan par poDetailId + poReleaseId). Postojeća funkcija `receivePO` se **ne dira**
— ona je tek nedavno stabilizovana i ne želimo da je mešamo sa novim izmenama.

Nova funkcija radi ovako (princip „nastavi odakle si stao"):

1. **Proveri dokle je prošli pokušaj stigao** — pita DW da li već postoji prijem
   za taj red, da li postoji plan nalepnice, da li postoji FGMULTI zapis.
2. **Preskoči korake koji su već urađeni** — npr. ako prijem već postoji ali nije
   proknjižen, kreće od koraka „plan nalepnice" / „knjiženje", ne pravi novi
   prijem.
3. **Ponovo izračunaj serijski i lot broj** u trenutku pokušaja (ne koristi
   stare vrednosti iz prvog prolaza, jer su se u međuvremenu mogle promeniti).
4. **Vrati isti oblik rezultata** kao i kod običnog prijema (uspeh/greška, Receipt
   ID, FGMULTI, Master Label, serijski, lot), da frontend može da osveži red bez
   posebne logike.

Dodaje se i novi servisni poziv na backendu (u `backend/src/routes/po.ts`) kome
frontend pošalje **listu redova koje treba ponoviti**, a on vrati **rezultat za
svaki red**. Grupno dugme šalje sve neuspele redove kroz taj jedan poziv; pojedinačno
dugme šalje listu od jednog reda. Backend ih obrađuje **jedan za drugim**.

## 5. Granični slučajevi

| Situacija | Šta radimo |
|-----------|------------|
| Dupli klik na „Ponovi" | Dugme se zaključa čim se klikne; drugi klik ne radi ništa dok prvi ne završi. |
| Zašto ne paralelno | DW ume da napravi sudar pri istovremenom dodeljivanju serijskih/lot brojeva. Zato redovi idu jedan za drugim. |
| Sesija istekla usred grupnog pokušaja | Backend stane čim dobije „nisi prijavljen", preostali redovi ostaju neuspeli, korisnik se vraća na login. Već obrađeni redovi ostaju obrađeni. |
| Korak proverava „dokle se stiglo" ne postoji u DW-u | Ako neki upit za proveru stanja ne postoji, vraćamo se na sigurnu varijantu: ponovi ceo red od početka i prijavi grešku ako napravi duplikat (vidi otvoreno pitanje u sekciji 8). |
| Red je u međuvremenu već proknjižen ručno u DW-u | Provera stanja to vidi, preskoči knjiženje, prijavi red kao uspešan. |
| Postojeće dugme za prijem | Ostaje netaknuto i radi isto kao i pre. |

## 6. Testiranje

| Sloj | Pokriva |
|------|---------|
| `dwClient` (nova funkcija) | Logika „nastavi odakle si stao": prijem već postoji → preskoči korak 1; plan već postoji → preskoči korak 2; sve već urađeno → odmah uspeh; ništa nije urađeno → uradi sva tri koraka. |
| `dwClient` — serijski/lot | Da se serijski i lot ponovo računaju pri svakom pokušaju, a ne uzimaju iz prvog prolaza. |
| backend servisni poziv | Ulaz = lista redova, izlaz = rezultat po redu; redovi se obrađuju redom; prekid na isteklu sesiju. |
| frontend | Dugme „Ponovi" se vidi samo na neuspelom redu; uspešan red nema dugme; grupno dugme se vidi samo kad ima neuspelih; po uspehu se red pretvori u zeleni; dugme zaključano dok traje. |

Testovi se pišu PRE implementacije (po superpowers TDD pristupu). Za DW odgovore
koriste se snimljeni primeri (fixtures), ne živi DW.

## 7. Šta JE i NIJE u opsegu

**JE:**

- Dugme „Ponovi" po neuspelom redu.
- Dugme „Ponovi sve neuspele" iznad tabele.
- Nova funkcija na backendu koja ponavlja jedan red, sa logikom „nastavi odakle si
  stao".
- Novi servisni poziv: lista redova unutra, rezultat po redu napolju.
- Ponovni izračun serijskog i lot broja pri svakom pokušaju.

**NIJE:**

- Bilo kakva izmena postojeće `receivePO` funkcije ili postojećeg dugmeta za prijem.
- Automatsko ponavljanje bez klika korisnika (sve je ručno).
- Paralelna obrada više redova istovremeno.
- Trajno pamćenje neuspelih redova posle osvežavanja stranice (rezultati žive samo
  u trenutnoj sesiji u browseru, kao i sad).

## 8. Otvorena pitanja za fazu implementacije

1. **Koji tačno DW upiti vraćaju stanje reda** — treba potvrditi u DW dokumentaciji
   (`/Help/Api`) koji pozivi vraćaju: postoji li prijem za dati poDetailId/poReleaseId,
   postoji li plan nalepnice, postoji li FGMULTI/master nalepnica. Ovo se proverava na
   test okruženju na početku implementacije.
2. **Sigurna varijanta ako provera stanja nije moguća** — ako neki od tih upita ne
   postoji, dogovoriti tačno ponašanje: da li ponoviti ceo red (rizik duplikata) ili
   blokirati ponovni pokušaj uz jasnu poruku. Predlog: ako bar prijem (korak 1) možemo
   da proverimo, to je dovoljno da izbegnemo glavni rizik (dupli PO_RECEIPTS); ostali
   koraci su jeftiniji za ponavljanje.

Oba pitanja se rešavaju prvim pozivom na test okruženje tokom implementacije i ne
blokiraju pisanje plana.
