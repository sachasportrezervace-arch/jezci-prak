# Ježkomet

Tahová fyzikální prakovačka 1v1 pro dva na jednom odkazu, bez účtů. Křečci proti Sovičkám: natáhni prak, vystřel ježka na soupeřovu pevnost a shoď jeho krále. Ježka na další výstřel ti vybírá soupeř. Verze 2 (`rv:2`): král, pět jednotek, pět ježků, stavba, náhodné pevnosti, mapy a modifikátory.

Živě: https://sachasportrezervace-arch.github.io/jezci-prak/ · trénink proti botovi: https://sachasportrezervace-arch.github.io/jezci-prak/#solo

## Pravidla (v2)
- **Cíl:** vyraz soupeřovu **králi** všech **70 životů**. Zásahy mu za jeden tah vezmou nejvýš **30** (strop na celou akci, ne na jeden náraz), **pád na zem 35** (jednou za akci, král na zemi dál neztrácí). Král tak vždy přežije aspoň dva tahy. Padnou-li oba králové v jednom tahu, je remíza.
- **Limit:** **8 tahů každého** (16 akcí). Pak vyhrává zdravější král v procentech, při shodě víc živých jednotek, pak součet životů, jinak remíza (série se nemění).
- **Pevnost:** král + **5 jednotek**, každá jiná: **Strážník** (bez schopnosti), **Tlusťoch** (odráží ježky, náraz ježka na něj dá jen 60 %), **Štítonoš** (štít 45 zastaví zásahy zepředu, dokud drží), **Skokan** (třikrát uskočí před letícím ježkem), **Léčitel** (na začátku tvého tahu vyléčí spojenci nejvýš 6 životů, zásoba 24 na partii). Pevnost se generuje ze seedu (`fort.js`), obě strany jsou zrcadlové, takže férové.
- **Tah:** buď **vystřelíš** ježka (chyť ho v praku, táhni dozadu a pusť; klávesnice šipky + mezerník, `Q` střelba), nebo **postavíš** jeden díl (`E`): štít (kov), blok (kámen) nebo trám (dřevo), `R` otočí, `Enter` postaví. Stavět jde nejvýš 3× za partii (kdo nezačínal, 4×), nikdy dvakrát po sobě a až od 2. tahu.
- **Twist, ježci od soupeře:** po výstřelu vybereš, jakého ježka střílí soupeř. **5 ježků:** obyčejný (poctivý), kamenný (těžký, boří, letí kratší, Tlusťoch ho neodrazí), gumový (skáče a odráží se), bouchací (při dopadu vybuchne), **špičák** (malý a rychlý, zabodne se, ×2,5 na štít). Každý druh dostane jednou za dávku, poslední zbývající přijde sám. Ježek, kterého nevystřelíš (postavíš), ti zůstane na příští tah.
- **Mapy:** Kopec, Údolí s jezírkem, Plošiny, Skála (terén uprostřed, vždy symetrický). **Modifikátory:** klidný den, vítr 1–3 doleva/doprava (praporek u praku), noc (lucerny, pravidla stejná), mráz (víc ledu v pevnostech), lehká gravitace (0,7×). Odveta má vždy jinou mapu i jiný modifikátor, takže se partie neopakují.
- **Comeback:** kdo výrazně prohrává (král o 35 % slabší, nebo o 2 jednotky méně), dostane jednou za partii stavbu navíc a smí stavět hned.
- **Série a tituly:** odvetu začíná poražený, skóre série se nese dál. Výhry v sérii dají titul u jména: 1 Ostřílený, 3 Mistr praku, 5 Král louky (s praporem a korunkou). Výzva nese jména obou a volitelnou sázku; vzdát jde z nabídky.
- **Sólo `#solo`:** „Zkusit sám“ = trénink proti botovi za Sovičky. Jen lokálně (nic se neukládá do mantledb), série a tituly se nepočítají. Bot míří s chybou, občas staví a ježka ti vybírá náhodně.

## Technika
- `index.html` (vzhled), `art.js` (kreslení postaviček, ježků a kostek po vrstvách, výrazy), `camera.js` (kamera bez DOM: rozvržení, kriticky tlumený pohyb, sledování ježka, ruční ovládání; rozhraní v hlavičce souboru), `game.js` (scéna, ovládání, reakce postaviček, synchronizace), `engine.js` (fyzika bez DOM, jednotky, ježci, mapy, pravidla partie `RULES`), `fort.js` (generátor pevností a výběr mapy a modifikátoru ze seedu, bez DOM), `vendor/matter-0.19.0.min.js` (Matter.js 0.19.0, MIT, připnutá kopie z npm).
- Autorita je střelec: jeho klient simuluje výstřel, uloží druh ježka, parametry výstřelu, klíčové snímky dráhy (každý 2. tik, jen pohnutá tělesa, max. 24 kB), události (zásahy, životy postaviček, výbuch) a konečné pozice všech těles. Soupeř snímky přehraje a převezme konečný stav. Každý tah se simuluje z uloženého stavu, takže se zařízení nemohou rozjet.
- Dokument v2 (`rv:2`): `sd` seed, `map`, `md` modifikátor, `wd` vítr, `hd` ježek v ruce obou, `pl` dávky ježků, `bs` zbývající stavby, `lb` minule stavěl, `cb` comeback využit, `tt` titul, `h` jen poslední akce. Hra v1 (bez `rv`) se zobrazí jako ukončená „Stará verze hry“ s odvetou v nové verzi (přenese jména, sérii a sázku). Návrh a čísla: `docs/herni-design-v2.md`.
- Výrazy postaviček (strach, zásah, radost, zranění) a zpomalení u rozhodujícího zásahu jsou jen ve vykreslení; z dokumentu se nic nepočítá.
- Synchronizace jako Psaníčko: mantledb.sh `jezkomet-<id>/hra`, odkaz `#r.<id>`, počítadlo `v` proti souběžným zápisům, dotazování 1,5 s po tahu, pak řidčeji. Limit dokumentu MantleDB ověřen: 60 kB projde, 120 kB vrací 413.
- Postavičky, ježek, kostky i krajina jsou kreslené kódem, žádné cizí obrázky. Přehled všech výrazů: `tools/sprites.html` (přes `node tools/serve.cjs`).

## Herna (místnost pro dva)
Hra umí protokol Herny verze 1 (`react-apps/HERNA-PROTOKOL.md`), ohlášení `<meta name="herna-protokol" content="1">` v `index.html`.
- Adresa: `…/jezci-prak/#herna=1&m=<místnost>&r=<id>&seat=0|1&names=A,B&zaklada=0|1`. `r` je vlastní místnost hry (dokument `jezkomet-<r>/hra`). Bez výzvy a setupu: `zaklada=1` dokument založí se jmény z `names` (mapa a modifikátor ze seedu, kdo začíná losem, bez sázky), `zaklada=0` ukáže „Čeká se, až hra naskočí“, dotazuje se a pak si sedne. Vazba je pevná: sedadlo 0 = tým x (`names[0]`), sedadlo 1 = tým o (`names[1]`), bez ohledu na to, kdo zakládal.
- Zakladatel nemíří, dokud si soupeř nesedne („Čeká se, až si … sedne ke hře.“), aby se jeho tah nepřepsal zápisem soupeřova sednutí.
- Skryté: sdílení odkazu, „Zkopírovat odkaz“, „Nová hra s někým jiným“, „Uznat porážku“ (kopírování do chatu), na iPhonu „Celá obrazovka“ (vedla by na Přidat na plochu). Partie z Herny se nezapisují do „Rozehrané“. Odveta, série, tituly a modifikátory zůstávají.
- Zprávy rodiči (`postMessage({herna:1,…}, "*")`, jen v iframe): `pripraveno`; `stav` `ceka` (načítání / soupeř nesedí) → `hraje` → `konec` (po dopřehrání posledního tahu); `vysledek` jednou za partii s `partie: "<r>:<id partie>"` (stejné v obou oknech) a `vitez` 0 | 1 | `null` (remíza); `jina-hra` z tlačítka „Jiná hra“ vedle odvety na konci partie.
- Bez platného `herna=1` (+ `r` `[0-9a-z]{6,24}`, `seat` 0|1) se hra chová jako dřív.
- Test: `node tests/herna.cjs [URL]` – maketa rodiče (lišta 48 px + iframe, stejný origin přes `page.route`), Chromium desktop + WebKit iPhone 13.

## Testy
- `node tests/tune.cjs` – stabilita pevností, rozložení výsledků výstřelů pro každý druh ježka (král jednou ranou 0 %), determinismus přehrání, limit klíčových snímků.
- `node tests/gen.cjs` – generátor pevností: 200 seedů, úspěšnost do 3 pokusů, mapy a modifikátory.
- `node tests/solo.cjs [URL]` – trénink `#solo` proti botovi (desktop i iPhone).
- `node tests/duel.cjs [URL]` – celá partie v2 v Chromiu (desktop) a WebKitu (iPhone 13 na výšku i na šířku): výzva, karta partie s mapou a modifikátorem, výstřely, stavba, výběr ježka, přehrání, HUD krále a jednotek, konec, sázka, titul, odveta (jiná mapa a modifikátor), přihlížející s `prefers-reduced-motion` (kamera jen v pevných záběrech), vzdání, obnovení stránky, dokument v1. `SHOTS=složka` mění složku screenshotů. Playwright z globálního npm (`%APPDATA%/npm/node_modules/playwright`).
- `node tests/playtest.cjs [URL]` – 3 partie za sebou přes odvetu v reálném čase (desktop + iPhone 390×844 celou dobu na výšku) s „lidskou“ chybou míření (±4°, ±6 %), mířením 4–8 s a výběrem ježka 2–4 s na výstřel, měří délku partie, časy tahů a čekání, ukládá screenshoty (`tests/shots-play`).
- `node tests/cam-video.cjs [URL]` – krátká videa kamery (iPhone na výšku a desktop, tři výstřely, za letu převzetí kamery) do `tests/shots-cam/` (webm, potřebuje ffmpeg).
- `node tests/playtest-sim.cjs [n]` – odhad délky partie bez prohlížeče (bot, člověk s chybou, nahodilý hráč).
- `node tests/herna.cjs [URL]` – napojení na Hernu (protokol 1) ve 2 prohlížečích, viz sekce Herna.
- Lokálně: `node tools/serve.cjs 8823`.
