# Ježkomet – herní design v2 (`rv:2`)

Stav: návrh pro implementaci, 2026-10-31. Navazuje na v1 (`README.md`, `DESIGN.md`, `docs/worklog.md`). Čísla označená „ladit“ se mění podle sekce 9. Co se v tomto dokumentu jmenuje `camera.js`, dělá jiný agent; tento dokument ho jen využívá přes rozhraní ze sekce 10.

## 0. Co se mění a proč
Mark: hra je „nedodělaná, málo možností“. v1 má jedno rozhodnutí na tah (kam střelit) a jeden cíl (3 postavičky). v2 přidává **cíl** (král), **role** (4 nové jednotky), **volbu v tahu** (střelba × stavba), **5 ježků** a **náhodné pevnosti**. Zůstává: autorita střelce, přehrání klíčových snímků, twist „ježci od soupeře“, dokument v mantledb, Matter.js 0.19, série a sázka.

## 1. Smyčka tahu a pravidla
Stav hry `ph`: `t` (tah), `pick` (výběr ježka soupeři), `end`.
1. **Začátek:** zakladatel odešle výzvu, jeho klient vygeneruje pevnost ze seedu (sekce 6), ověří ji a zapíše tělesa. První střelec (`s`, jako v1) drží obyčejného ježka; druhý nic.
2. **Tah (`t`):** hráč na tahu vidí svého ježka (`hd`, dal mu ho soupeř) a zvolí **Střelba** (výchozí) nebo **Stavba**.
   - Střelba: stávající prak, vystřelí ježka z ruky, ruka se vyprázdní.
   - Stavba: postaví 1 díl (sekce 5), ježek **zůstává v ruce** do příštího tahu.
3. **Vyhodnocení:** střelec odsimuluje tah (u stavby usazení ~60 tiků), zapíše akci a konečné pozice. Pak se na začátku tahu soupeře **vyléčí** soupeřovi léčitelé (sekce 2, deterministická funkce nad dokumentem, výsledek v `h[0].hl`).
4. **Výhra hned po simulaci:** padl-li králi soupeře, vyhrává střelec; padl-li jen vlastní, vyhrává soupeř; padli-li oba v jednom tahu, je **remíza**.
5. **Výběr (`pick`):** pokud má soupeř **prázdnou ruku**, vybereš mu ježka (stejné dávkování `pl` jako v1, dávka nově 5 druhů). Má-li v ruce ježka, který nevystřelil, výběr se přeskočí a tah přechází rovnou na něj.
6. **Konec:** po 9 tazích každého hráče (`n >= 18`) vyhrává ten, kdo má víc životů krále v procentech; při shodě víc živých jednotek, pak součet životů v %, jinak **remíza** (`win:"="`, skóre série se nemění). Odveta: začíná poražený, po remíze ten, kdo naposled nezačínal.
7. **Ochrana proti nekonečné obraně (hard limity):** stavba max. **3× za partii** (druhý hráč **4×** jako vyrovnání výhody prvního tahu, ladit), **nikdy dvakrát po sobě**, nejdřív ve **2. tahu** hráče, jeden díl za tah; léčitel má zásobu 24 životů na celou partii; skokan 3 úskoky; štít se rozbije; limit 9 tahů. Tah nemá časovač (hra je asynchronní přes odkaz), limit je počet tahů.

## 2. Jednotky
Každá pevnost: **1 král + 5 jednotek (po jedné od druhu T, S, R, L, C)**, tedy 6 postaviček na stranu. Život krále i jednotek je v celých číslech, `max` se bere z druhu (ne z dokumentu). Dotek země = vyřazení (jako v1, platí pro všechny postavičky). Poškození nárazem: stávající vzorec v `engine.js` (`TUNE.dmg 0.15`) + úpravy v tabulce.

| kód | název / role | tvar, rozměr | hm. | HP | schopnost (přesně) | počet, pozice |
|---|---|---|---|---|---|---|
| `K` | **Král** (cíl) | kruh r 24 | 2,35 | **60** | žádná; koruna je jen kresba | 1, zadní nebo střední zátoka (sekce 6) |
| `C` | **Strážník** (základ, stávající postavička) | kruh r 19 | 1,36 | 30 | žádná | 1, náhodný volný slot |
| `T` | **Tlusťoch** (odraz) | kruh r 30, d 0,0022 | 6,2 | 50 | náraz ježka na něj dá ×0,6 poškození. V `collisionStart`, když je jedním tělesem ježek `n`, `g` nebo `b` a druhým Tlusťoch: normálová složka rychlosti ježka se nastaví na −0,8× původní (e = 0,8 bez ohledu na hmotnosti), tečná zůstane. Událost `r` | 1, nejpřednější volná buňka na úrovni krále nebo níž |
| `S` | **Štítonoš** (zastaví čelní zásahy) | obdélník 30×50, chamfer 6, d 0,0014 | 2,1 | 34 + **štít 45** | zásah „zepředu“ (bod dotyku má `(sp.x − X.x)·dir > 8`, `dir` = +1 tým `x`, −1 tým `o`): nejdřív se odečte ze štítu `z`, přetečení jde do HP. Šípy `s` dávají na štít ×2,5, výbuch projde z 50 %. Událost `z` | 1, buňka před králem (směrem k nepříteli) |
| `R` | **Skokan** (uhýbá) | kruh r 14 | 0,8 | 18 | v kroku simulace: ježek (ne po výbuchu) je do 70 px, **míří k němu** (`dot(v_ježka, poloha_skokana − poloha_ježka) > 0`), rychlost > 5, zbývá úskok (`z > 0`) a ještě neuskočil v tomto výstřelu → `Δv = (−sgn(dx)·3,2 ; −5,5)` (od ježka a nahoru; boční složka 0, je-li < 40 px k okraji podstavce), `z −= 1`. Žádná náhoda. Událost `j` | 1, nejvyšší volný slot (střecha přední zátoky) |
| `L` | **Léčitel** (zdravotník) | kruh r 18 | 1,22 | 24 | `heal(tělesa, tým)` při předání tahu: pro každého živého léčitele s `z > 0` (podle id) vybere spojence (včetně krále, mimo sebe) do 170 px s `hp < max` s nejnižším `hp/max` (shoda: nižší id), přidá `min(6, max−hp, z)`, `z −= to`. Událost `l` | 1, buňka hned za králem |

Zápis stavu: kód tělesa `K`/`C`/`T`/`S`/`R`/`L` + tým, např. `"Kx"`, `"So"` (v1 má jen `"Cx"`, `"Co"`). Šestice `[id, druh, x*10, y*10, úhel*1000, hp]` dostane **7. prvek `z`** jen u `S` (zbývající štít), `R` (úskoky), `L` (zásoba léčení). `unpackBodies` v1 bere `length >= 6`, takže přidání je bezpečné.

Vzhled (kresba v `art.js`, siluety se musí lišit i při 24 px):
- **Král:** o 25 % větší než strážník, zlatá koruna se třemi hroty, červená pelerína; křeček má oranžovou, sovička fialovou, korunu stejnou. HP lišta nad hlavou stále viditelná.
- **Tlusťoch:** široký kulatý, bříško přes 70 % těla, malá hlava; křeček tvářičky jako chomáč, sovička načepýřená koule. Barva týmu, tmavší obrys.
- **Štítonoš:** vysoký, kulatý štít (dřevo s kovovým okrajem) před tělem, přilba s hřebenem; štít praská (3 stupně podle `z/45`).
- **Skokan:** drobný, dlouhé nohy, pásek přes čelo; při úskoku se protáhne a ocas se zatočí.
- **Léčitel:** bílá čepice s křížem a brašna; při léčení zelená „+“ a zelená aura.
- **Strážník:** beze změny (existující sprite).

Kombinace s ježky:

| ježek | proti čemu je dobrý | proti čemu je špatný |
|---|---|---|
| obyčejný | všechno průměrně | – |
| kamenný | kov, kámen, bunkr, tlusťoch (neodrazí se), štítonoš (váha) | skokan (pomalý, vyhne se mu) |
| gumový | obejít přepážku odrazem, koryta | štít (nic nezlomí) |
| bouchací | skokan, léčitel, hustý shluk (plošný zásah) | štít a tlusťoch (výbuch jde skrz částečně) |
| špičák (nový) | štítonoš (×2,5 na štít), tlusťoch (neodráží se) | dřevo a sklo jen málo (lehký) |

## 3. Král
Tvar kruh r 24, hmotnost 2,35, **60 HP** (ladit, `KING_HP`), korunka je jen kresba. **„Shozen“** znamená jedno z: dotek `ground` (země nebo kopec, tedy pád z podstavce, platí jako u všech postaviček), `hp ≤ 0`, nebo vyletí z plátna (stávající pravidla `p.x < −200` atd.). Podstavec není `ground`, takže král stojící dole v zátoce nemůže „padnout“, jen přijít o životy; proto generátor dává králi vždy slabé místo (sekce 6). Událost `k` (stávající) nese tým.

## 4. Ježci (max. 5, dávka 5, každý jednou)
`HOG_ORDER = "nkgbs"`. Hm. = π·r²·d. Dávkování `pl` jako v1 (poslední zbývající přijde sám), `poolOk` změnit z max 4 na max 5.

| kód | název | hm. | r | rest | v× | zvláštní účinek |
|---|---|---|---|---|---|---|
| `n` | Obyčejný | 3,6 | 17 | 0,3 | 1 | – (stávající) |
| `k` | Kamenný | 10,8 | 19 | 0,06 | 0,84 | těžký, boří; Tlusťoch ho **neodrazí** (pravidlo odrazu se na něj nevztahuje) |
| `g` | Gumový | 2,4 | 17 | 0,9 | 1 | skáče, plošně obejde stěnu |
| `b` | Bouchací | 3,6 | 17 | 0,2 | 1 | při prvním nárazu výbuch `BOOM_R 150`, poškození postaviček 26·k, kostek 34·k (stávající); štítu ignoruje 50 % |
| `s` | **Špičák** (nový) | 3,6 | 12 | 0,05 | 1,12 | malý a rychlý, zabodne se (nepoužije odraz Tlusťocha), **×2,5 na štít Štítonoše**, ×1,3 na kovové kostky |

Špičák je vlastní odpověď na štít a tlusťocha, aby soupeřova volba ježka měla smysl (vybereš mu „tvrdý“ nebo „plošný“ podle toho, co mu stojí v cestě). Barva špičáku: žlutá s ocelovými hroty, tenká silueta.

## 5. Stavba
Díly (3 kusy, stačí na celou partii díky zásobě 3–4):

| díl | kód | rozměr | materiál | použití |
|---|---|---|---|---|
| **Štít** | `mS` | 18×72 (otočený 72×18) | kov | svislá clona před králem, otočený jako rychlý strop |
| **Blok** | `sB` | 46×46 | kámen | těžká zátka díry, podstavec |
| **Trám** | `wP` | 130×22 (otočený 22×130) | dřevo | strop, podpěra, můstek |

Pravidla:
- **Zóna:** vlastní podstavec (x v `ZONE[tým]`, nově 60–380 a zrcadlově) a výška do 300 px nad ním.
- **Platné umístění:** nepřekrývá žádné těleso (AABB s odstupem 1 px), je **podepřené** (pod ním do 8 px těleso nebo podstavec přes ≥ 30 % šířky), mimo hlavu krále (kruh r 24 + 10 px). Jinak duch zčervená a tlačítko je neaktivní s důvodem „Tady to stát nemůže.“.
- **Ovládání:** 1) klepni na díl v liště, 2) klepni do zóny nebo přetáhni ducha, 3) tlačítko **Otočit** (klávesa `R`), 4) **Postavit** (`Enter`). Na dotyku se duch při přetahování drží 64 px nad prstem. Pozice se přichytává na 8 px.
- **Fyzika:** `engine.place(team, kind, x, y, rot)` (nová, na rozdíl od `drop` bez pádu shora; v1 měřil pád 4,5–13,9 s a 22 % kostek zabilo vlastní postavičku). Díl se objeví na místě a usadí ≤ 60 tiků. Událost `n` (stávající) nese kód, polohu a otočení.
- **Počitadlo:** `bs:[x,o]` zbývající díly, `lb:[x,o]` 1 = minulý tah stavba (zákaz 2× po sobě). Server (conditional check v `commit`) odmítne zápis, který pravidla porušuje.
- **Cena stavby:** hráč se vzdá tahu střelby, ale **ježek mu zůstane** (a soupeř mu žádného dalšího nedá, viz twist níže).

### Twist „ježci od soupeře“ se stavbou
Twist **zachovat**, mění se jedna věc: ježek je „v ruce“ (`hd`), dokud ho hráč nevystřelí. Stavbou si hráč dobrého ježka (kamenného před štítem) **nechá na později**, ale špatného neprodá: soupeř mu nového nedává, dokud starý nevystřelí. Kdo vybírá, ví, že dostane příjemce, který může hodit stavbu, takže vybírá spíš „tvrdého, který jde proti tomu, co stojí v cestě“, než slabého. Ježek každého hráče je vidět v HUD u obou stran (psychologická hra z v1 zůstává). Alternativa „stavba zahodí ježka“ zamítnuta: trestala by stavění a soupeř by jím mohl vždy dát nejslabšího.

## 6. Generátor pevností (`fort.js`)
Čistá funkce `genFort(seed)` bez DOM, stejné UMD jako `engine.js`, použitelná v Node testech. **Generuje klient zakladatele**, ostatní berou tělesa z dokumentu (`b`), takže rozdíly mezi zařízeními nehrozí. Seed `sd` (uint32) je v dokumentu jen k reprodukci.

**PRNG:** `mulberry32(seed)`; výběr s váhami `pick(rnd, [[hodnota, váha], …])`.

**Geometrie:** podstavec rozšířit na **60–380** (zrcadlově `W−380`–`W−60`, šířka 320). Pevnost tvoří 3 zátoky široké 96, 4 řady sloupů (osy `x = 74, 170, 266, 362` pro tým `x`; jen konstanty z `JP`, ne natvrdo). Patro = 96 výšky + deska 22 (rozteč 118). Levá pevnost se staví lokálně a pro druhého hráče se zrcadlí `x → W − x`, `a → −a`; **obě strany tedy mají shodné tvary**, férovost je tím zaručena (první střelec je vyvážen zásobou stavby).

**Gramatika (v tomto pořadí):**
1. `F` = 2 nebo 3 patra (váhy 45/55).
2. **Rám:** sloupy `B` (22×96) v osách pro každé patro, desky `M` (nový tvar 100×22, `wM`, `sM`, `iM`, `gM` jako 96×18) mezi osami, tj. 3 desky na patro. Materiál podle patra (váhy):

| patro | dřevo | kámen | kov | sklo | led |
|---|---|---|---|---|---|
| 0 (dole) | 30 | 45 | 15 (jen kostky `mK`) | 10 | 0 |
| 1 | 50 | 25 | 0 | 15 | 10 |
| nejvyšší | 40 | 10 | 0 | 25 | 25 |

3. **Král:** zátoka `bk ∈ {0 zadní, 1 střední}` (50/50, nikdy přední), patro `ℓk` (F=2: dole 50 / nahoře 50; F=3: dole 35 / střed 35 / nahoře 30). Sloup za králem libovolný, **přední sloup kral-buňky z dřeva, skla nebo ledu** (slabé místo).
4. **Jednotky** do volných slotů (buňka nebo střecha zátoky, max. 1 jednotka na slot), v pořadí S, T, L, R, C podle preference ze sekce 2; není-li preferovaný slot volný, nejbližší volný.
5. **Výplň** zbylých buněk (váhy): prázdná 30, 1 blok 25, 2 bloky nad sebou 20, 2 skleněné sloupy 10, 2 ledové sloupy 10, 1 kovová kostka 5 (celkem max. 3 kovové kusy).
6. **Atika:** 0–3 bloky na střeše zátoky, kde nestojí jednotka.

**Materiály** (stávající + nové; hm. = d·plocha):

| m | d | tření | rest | HP | poznámka |
|---|---|---|---|---|---|
| `w` dřevo | 0,0011 | 0,7 | 0,05 | 26 | stávající |
| `s` kámen | 0,0032 | 0,8 | 0,02 | 70 | stávající |
| `g` sklo | 0,0009 | 0,4 | 0,1 | 9 | stávající |
| `i` **led** | 0,0009 | 0,03 (Matter bere min. z páru, vše na něm klouže) | 0,05 | 14 | ledová deska nikdy nenese jednotku |
| `m` **kov** | 0,0045 | 0,6 | 0,03 | 80 | odolá výbuchu (max. 34), těžký |

**Kontroly (generátor opakuje s dalším seedem `sd' = (sd·1664525 + 1013904223) >>> 0`, max. 12×, pak pevná záložní šablona v1):**
- žádné překrytí, ≤ **34 kostek + 6 postaviček = 40 těles** na stranu (výkon mobilu, limit klíčových snímků);
- **usazení:** postavit těleso, nechat 240 tiků; pak max. posun < 3 px a natočení < 0,03 rad, žádná ztráta HP ani vyřazení; do dokumentu jdou **usazené** pozice;
- **expozice krále:** 24 mřížkových výstřelů obyčejným ježkem; aspoň 3 poškodí krále, žádný z 60 výstřelů (všech 5 druhů) ho nezabije jedním zásahem;
- **zrcadlo:** ověřuje se jen levá strana, před zápisem 60 tiků kontrola celé scény.
Cíl: ≥ 95 % seedů projde do 3 pokusů, generování + kontrola ≤ 400 ms na mobilu (zobrazí se „Stavím pevnosti…“).

## 7. Data v dokumentu (`g`)
| pole | nové / změna | velikost |
|---|---|---|
| `rv` | `2` | 6 B |
| `sd` | seed uint32 | 15 B |
| `hd` | `["n",""]` ruka obou (druh ježka nebo `""`), nahrazuje `hg` | 14 B |
| `pl` | beze změny, ≤ 5 znaků | – |
| `bs`, `lb` | zásoba staveb, příznak „minule stavěl“ | 20 B |
| `ph` | `t` / `pick` / `end` (v1 `aim` mapovat na `t`) | – |
| `win` | `x` / `o` / `=`; `wy`: `k` král, `l` limit | 20 B |
| `b[]` | až ~92 těles (stav + stavby), 7. prvek `z` | ~3 kB |
| `h[0]` | **jen jedna** akce (v1 měl 2): `{n, by, kind:"s"|"b", kf, ev, b0, a, f, ht, pc:{k,x,y,r}, hl:[[léčitel,cíl,hp]]}` | kf ≤ 24 kB, b0 ~3 kB |

Odhad nejhoršího dokumentu ≈ 33 kB (limit 60 kB, 120 kB vrací 413); v1 mohl s dvěma akcemi po 28 kB dosáhnout 58 kB, což se tímto uvolňuje. `engine.result(24000)`, při > 60 tělesech `every = 3` a strop kroku řidnutí 12 → 16.
Nové události (tečkový zápis jako dosud): `j.id.t.dx.dy` úskok, `r.t.x.y` odraz Tlusťocha, `z.id.t.zhp` štít, `l.léčitel.cíl.t.hp` léčení (přehrávač bere jako `d` s vyšším hp a spustí zelený efekt).

**Zpětná kompatibilita:** hry bez `rv` (v1) se v klientu v2 **zobrazí jako ukončené** („Stará verze hry, odveta v nové.“) s tlačítkem Odveta, které přenese jména, sérii `w`, sázku `k`/`kc` a seed nové partie. Důvod: v1 a v2 mají jinou geometrii (podstavec 240 × 320), jiné kódy těles a jiný cíl; dvoje pravidla v jednom kódu by zdvojnásobila testy kvůli partiím, které trvají do 5 minut. Opačně v1 klient dokument v2 nepřečte (`unpackBodies` odmítne `"Kx"`, `ph:"t"`), takže ho nemůže rozbít. Při nasazení zvednout parametr `?v=` u skriptů v `index.html`.

## 8. UI volby tahu
**Zásady:** přepínač je vždy na dosah palce, hlavní akce má cíl ≥ 56 px, nic nezakrývá pevnosti, text nápovědy jen v nabídce a u prvního použití.

| rozvržení | HUD (nahoře) | spodek / bok |
|---|---|---|
| **Mobil na výšku** (390×844) | pruh 44 px: koruna + lišta krále + `Tah 7/9` + lišta soupeře; pod ním 12 pastilek (6 + 6) ⌀ 20 px s kroužkem HP, modrý půlkruh = štít | lišta 72 px nad hranou: řádek ježka od soupeře (ikona + název + 1 věta, 40 px), pod ním dvoutlačítko **Střelba / Stavba 3** (každé 50 % šířky, 56 px). Stavba nahradí dvoutlačítko řadou **Štít / Blok / Trám**, **↻**, **Postavit** |
| **Mobil na šířku** (844×390) | tenký pruh 28 px, lišty krále a 5 pastilek v jednom řádku | svislý sloupec u pravého okraje (palec): tlačítka Střelba a Stavba 56×56 pod sebou, díly vyjedou doleva v řadě; ježek jako malá ikona v rohu, klep ukáže popis |
| **Desktop** (≥ 1100 px) | pruh 56 px: jména, skóre série, lišty krále 220 px, pastilky 24 px | pravý panel 380 px (jako v1): přepínač, karta ježka s popisem a výběrem, seznam dílů se statistikou, klávesy `Q` střelba, `E` stavba, `R` otočit, `Enter` potvrdit, `Esc` zrušit |

- **Ježek od soupeře:** karta s kresbou ježka, názvem a větou účinku („Špičák: prorazí štít.“); u soupeře v HUD malá ikona jeho ježka (včetně zadrženého po stavbě).
- **Výběr ježka soupeři (`pick`):** řada 5 karet, nedostupné jsou šedé, vybraná ukáže větu účinku, jedno tlačítko **Pošli**.
- **Životy:** král má vždy lištu nad hlavou (šířka 64 px) a v HUD; ostatní lištu nad hlavou jen když `hp < max` nebo při přidržení, štít jako modrý oblouk; léčení „+6“ zeleně, úskok „hop!“ bublinou.
- **Stavba na mobilu:** při zapnutí se kamera (`camera.js`) přiblíží na vlastní pevnost (řeší i malou scénu na výšku z worklogu) a po Postavit se vrátí.

**Texty nápovědy (jedna věta na pravidlo):**
- „Shoď soupeřova krále na zem, nebo mu vyraz všechen život.“
- „Ostatní jednotky krále chrání.“
- „V tahu buď vystřelíš ježka od soupeře, nebo postavíš jeden díl.“
- „Stavět můžeš nejvýš třikrát za partii a nikdy dvakrát po sobě.“
- „Ježek, kterého nevystřelíš, ti zůstane na příští tah.“
- „Tlusťoch odráží ježky.“ · „Štítonoš zastaví zásahy zepředu, dokud štít drží.“ · „Skokan třikrát uskočí před ježkem.“ · „Léčitel ti na začátku tahu vyléčí 6 životů.“ · „Špičák prorazí štít.“
- „Po osmém tahu každého vyhrává ten, kdo má zdravějšího krále.“

## 9. Vyvažovací plán
Ladí se: `KING_HP 60`, `CRITTER_HP 30`, `TUNE.dmg/blk 0,15`, HP jednotek (T 50, S 34 + štít 45, R 18, L 24), `T` odraz 0,8 a ×0,6, léčení 6/zásoba 24/dosah 170, úskok 70 px/Δv/3×, ježci (tabulka 4), stavební zásoba 3/4, limit 9 tahů, váhy materiálů, `BOOM_R`.

**Cílové metriky (medián z 500 partií na konfiguraci):**

| metrika | cíl |
|---|---|
| délka partie | 4–6 min (průměrný tah: střela 17 s = míření 7 + let a usazení 5 + výběr 3 + síť 2; stavba 9 s) |
| tahů celkem | medián 16, 90. percentil ≤ 18 |
| výstřelů na partii | 11–13 (5–7 na hráče) |
| tahy stavbou | 18–28 % |
| konec králem před limitem | ≥ 85 %; remíza ≤ 5 % |
| výhra prvního střelce | 48–52 % |
| král padl pádem × na HP | 30–70 % |
| odraz Tlusťochem vrátí ježka do vlastní pevnosti | ≤ 10 % výstřelů |
| ježek mine Skokana | 40–60 % pokusů |
| podíl druhů ježků zvolených soupeřem | žádný > 30 % |

**Měření simulací (Node, bez prohlížeče):** nový `tests/balance.cjs` s boty z `playtest-sim.cjs` (nejlepší výstřel z mřížky, „člověk“ s chybou ±4° / ±6 %, náhodný) a stavební politikou (staví, když `hp krále < 50 %` nebo má v ruce slabého ježka a zásobu), 500 partií × seedy; výstup tabulka metrik a histogram délky. Čas odhadnout z počtu tahů a naměřených časů tahu z `playtest.cjs`.
**Playtest:** 6 partií Mark + Radka na skutečných zařízeních, odkaz `?dbg` loguje čas tahu a volbu střelba/stavba; po každé 3 otázky (pochopil jsi, co dělá každá jednotka; měl jsi pocit volby; byla partie moc dlouhá/krátká). Vyhodnotit proti tabulce výše, laděné číslo měnit po jednom.

## 10. Implementační plán (pořadí)
Soubory: `engine.js` (kódy, materiály, jednotky, simulace), nový `fort.js`, `game.js`, `art.js`, `index.html`; `camera.js` dělá jiný agent. Nic nepsat do `camera.js`.

1. **`engine.js` – data:** materiály `i`, `m`, kinds (`iB iP iL iM mK mS wM sM gM`), jednotky `K T S R L` (`makeBody`, `dims`, `typeMax`), 7. prvek `z` v `packBodies/unpackBodies`, nové konstanty `PLINTHS/ZONE`, `HOG_ORDER "nkgbs"`, ježek `s`. *Riziko:* změna `PLINTHS/ZONE` ovlivní `art.js` a kameru; číst vždy z `JP`.
2. **`fort.js` + `tests/gen.cjs`:** mulberry32, gramatika, kontroly, zrcadlo. *Test:* 1000 seedů (úspěšnost, počet těles, čas, expozice krále, shodný výstup v Node, Chromiu i WebKitu; zaokrouhlovat na 0,1 px).
3. **`engine.js` – pravidla simulace:** Tlusťoch (odraz, ×0,6), štít, úskok Skokana, `place()`, události `j r z l`, `heal()`, `result(24000)`. *Test:* jednotkové výstřely na každou jednotku, `tests/tune.cjs` rozšířit o krále (žádné zabití jednou ranou), velikost kf nejhoršího výstřelu na 92 tělesech ≤ 24 kB.
4. **`game.js` – stav:** `norm()` (`rv`, `hd`, `bs`, `lb`, `ph:"t"`, `win:"="`), `freshGame` (generátor), `commit` kontroly pravidel (zásoba, 2× po sobě, ruka), výhra/remíza/limit, v1 hra → ukončená s tlačítkem Odveta, `h` jen 1 akce. *Test:* bez UI (Node, mock dokumentu): všechny větve konce a obou králů naráz.
5. **`art.js`:** nové sprity (král s korunou, T, S se štítem a praskáním, R, L), led a kov, ježek `s`, lišty HP, efekty `+`, hop, jiskra štítu. Přehled do `tools/sprites.html`.
6. **UI (`index.html` + `game.js`):** přepínač, lišta ježka, stavba (duch, platnost, Otočit, Postavit), HUD v 3 rozvrženích, výběr 5 ježků, texty. *Riziko:* ovládání ducha na dotyku proti posunu kamery (kamera ignoruje tah, když je stavba aktivní).
7. **Integrace kamery** (až bude `camera.js` hotová): potřebuji `Cam.toWorld(px,py)`, `Cam.focus(x,y,ms)`, `Cam.fit(zóna)` a událost při změně velikosti; HUD je DOM, nezávislý na kameře.
8. **Ladění a balance:** `tests/balance.cjs`, úpravy čísel, sekce 9.
9. **E2E:** `tests/duel.cjs` přepsat (37 kontrol z v1 padne): výzva, generovaná pevnost, výstřel, stavba, zákaz 2× po sobě, výběr ježka, výhra králem, remíza, limit, v1 dokument → ukončená; Chromium + WebKit (iPhone 13 výška i šířka). Playtest `tests/playtest.cjs` s novými časy.
10. **Nasazení:** bump `?v=`, zapsat do `docs/worklog.md`, README (pravidla) a DESIGN.md (jednotky, ježek `s`).

**Rizika (pořadí podle závažnosti):** (1) nestabilní pevnosti → mitigace kontroly + záložní šablona; (2) objem kf s 80+ tělesy → `every 3`, strop 24 kB, test; (3) výkon mobilu při 90 tělesech (Matter spí; měřit snímkovou frekvenci na iPhonu 13); (4) rozbitá deterministika Skokana/Tlusťocha při opakované simulaci (testovat stejný vstup → shodný výstup); (5) souběžné zápisy: ruka `hd` a zásoba `bs` musí být v podmínce `commit`; (6) kamera mění souřadnice scény, kterou čtu: společně přes `JP` konstanty.

## 11. Změněná čísla po playtestu (31. 10. 2026, nasazeno)
Proč: v prvním playtestu v2 (bot s lidskou chybou ±4°/±6 %) padal král 1.–2. ranou (strop zásahu platil na každý náraz zvlášť a dotek země krále vyřadil). Po zvednutí krále na 80 HP a 9 tazích zase všechny partie končily jen limitem (5,4–9,0 min). Hodnoty níže jsou kompromis, který dal 3 partie po 4,0–4,9 min, 2 ze 3 skončily pádem krále, comeback ve všech třech.

| co | návrh (sekce 1–9) | nasazeno | kde |
|---|---|---|---|
| život krále | 60 | **70** | `UNIT.K.hp` |
| strop zásahů krále | – (za každý náraz) | **30 za celou akci** (`TUNE.kingCap 0.43` × 70) | `engine.js`, `damage()` |
| král dotkne země | vyřazení | **−35 životů**, jednou za akci, král na zemi už znovu neztrácí | `KING_FALL` |
| limit tahů | 9 každého | **8 každého** (`n ≥ 16`) | `RULES.turns` |
| poškození nárazem | `TUNE.dmg 0.15` | 0,42 (z ladění před playtestem, beze změny) | `TUNE.dmg` |
| comeback | – | král o 35 % slabší nebo o 2 jednotky méně → jednou za partii stavba navíc, smí stavět hned | `RULES.comebackKing/Units` |

Texty v `#intro`, `#helpSheet` a na konci hry odpovídají těmto číslům. Měření: `docs/worklog.md` (tabulka playtestu), `node tests/tune.cjs` (král jednou ranou 0 %).
