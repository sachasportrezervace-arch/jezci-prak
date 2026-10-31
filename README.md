# Ježkomet

Tahová fyzikální prakovačka 1v1 pro dva na jednom odkazu, bez účtů. Křečci proti Sovičkám: natáhni prak, vystřel stočeného ježka na soupeřovu pevnost z kostek a shoď jeho tři postavičky. Ježka na další výstřel ti vybírá soupeř.

Živě: https://sachasportrezervace-arch.github.io/jezci-prak/

## Pravidla
- Výstřel: chyť ježka v praku, táhni dozadu a pusť (síla podle délky tahu, náhled začátku dráhy). Jinde tažením posouváš scénu. Klávesnice: šipky + mezerník.
- Postavička vypadne, když spadne na zem, nebo když ji trefí dost velká rána (náraz × poměr hmotností). Sklo vydrží málo, dřevo víc, kámen nejvíc.
- **Twist, ježci od soupeře:** po výstřelu vybereš, jakého ježka střílí soupeř: obyčejného, kamenného (těžký, boří, letí kratší), gumového (skáče a odráží se) nebo bouchacího (při dopadu vybuchne). Každý druh dostane jednou, než se dávka obnoví, poslední zbývající přijde sám. První střelec začíná obyčejným.
- Vyhrává, kdo první vyřadí všechny tři soupeřovy. Odveta začíná poražený, skóre série se nese dál. Výzva nese jména obou a volitelnou sázku.

## Technika
- `index.html` (vzhled), `art.js` (kreslení postaviček, ježků a kostek po vrstvách, výrazy), `camera.js` (kamera bez DOM: rozvržení, kriticky tlumený pohyb, sledování ježka, ruční ovládání; rozhraní v hlavičce souboru), `game.js` (scéna, ovládání, reakce postaviček, synchronizace), `engine.js` (fyzika bez DOM, druhy ježků), `vendor/matter-0.19.0.min.js` (Matter.js 0.19.0, MIT, připnutá kopie z npm).
- Autorita je střelec: jeho klient simuluje výstřel, uloží druh ježka, parametry výstřelu, klíčové snímky dráhy (každý 2. tik, jen pohnutá tělesa, max. ~28 kB), události (zásahy, životy postaviček, výbuch) a konečné pozice všech těles. Soupeř snímky přehraje a převezme konečný stav. Každý tah se simuluje z uloženého stavu, takže se zařízení nemohou rozjet.
- Twist v dokumentu: `hg` (druh ježka na tahu) a `pl` (které druhy ještě může kdo dostat). Starší hry bez nich se načtou s výchozími hodnotami, rozehraná stavba kostek z předchozí verze se přeskočí.
- Výrazy postaviček (strach, zásah, radost, zranění) a zpomalení u rozhodujícího zásahu jsou jen ve vykreslení; z dokumentu se nic nepočítá.
- Synchronizace jako Psaníčko: mantledb.sh `jezkomet-<id>/hra`, odkaz `#r.<id>`, počítadlo `v` proti souběžným zápisům, dotazování 1,5 s po tahu, pak řidčeji. Limit dokumentu MantleDB ověřen: 60 kB projde, 120 kB vrací 413.
- Postavičky, ježek, kostky i krajina jsou kreslené kódem, žádné cizí obrázky. Přehled všech výrazů: `tools/sprites.html` (přes `node tools/serve.cjs`).

## Testy
- `node tests/tune.cjs` – stabilita pevností a rozložení výsledků výstřelů pro každý druh ježka, limit klíčových snímků.
- `node tests/duel.cjs [URL]` – celá partie v Chromiu (desktop 1366×820) a WebKitu (iPhone 13 na výšku, od 2. tahu na šířku): výzva, přijetí, výstřely tažením myší, výběr ježka a jeho vidět u soupeře v 1. kole, přehrání, reakce postaviček, úlomky, zpomalení, výhra, sázka, odveta se sérií, přihlížející s `prefers-reduced-motion`, obnovení stránky. Playwright z globálního npm (`%APPDATA%/npm/node_modules/playwright`).
- `node tests/playtest.cjs [URL]` – partie v reálném čase (desktop + iPhone 390×844 celou dobu na výšku) s „lidskou“ chybou míření (±4°, ±6 %), mířením 4–8 s a výběrem ježka 2–4 s na výstřel, měří délku partie, časy tahů a čekání, ukládá screenshoty (`tests/shots-play`).
- `node tests/cam-video.cjs [URL]` – krátká videa kamery (iPhone na výšku a desktop, tři výstřely, za letu převzetí kamery) do `tests/shots-cam/` (webm, potřebuje ffmpeg).
- `node tests/playtest-sim.cjs [n]` – odhad délky partie bez prohlížeče (bot, člověk s chybou, nahodilý hráč).
- Lokálně: `node tools/serve.cjs 8793`.
