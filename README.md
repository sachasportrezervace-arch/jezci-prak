# Ježkomet

Tahová fyzikální prakovačka 1v1 pro dva na jednom odkazu, bez účtů. Křečci proti Sovičkám: natáhni prak, vystřel stočeného ježka na soupeřovu pevnost z kostek a shoď jeho tři postavičky. Po každém výstřelu si přidáš jednu kostku do své pevnosti.

Živě: https://sachasportrezervace-arch.github.io/jezci-prak/

## Pravidla
- Výstřel: kdekoli na scéně táhni dozadu a pusť (síla podle délky tahu, náhled začátku dráhy). Klávesnice: šipky + mezerník.
- Postavička vypadne, když spadne na zem, nebo když ji trefí dost velká rána (náraz × poměr hmotností). Sklo vydrží málo, dřevo víc, kámen nejvíc.
- Stavba (twist): po výstřelu vybereš prkno / kvádr / sloupek, posuneš ho nad svou pevností, případně otočíš, a pustíš.
- Vyhrává, kdo první vyřadí všechny tři soupeřovy. Odveta začíná poražený, skóre série se nese dál. Výzva nese jména obou a volitelnou sázku.

## Technika
- `index.html` (vzhled), `game.js` (kreslení na canvas, ovládání, synchronizace), `engine.js` (fyzika bez DOM), `vendor/matter-0.19.0.min.js` (Matter.js 0.19.0, MIT, připnutá kopie z npm).
- Autorita je střelec: jeho klient simuluje výstřel, uloží parametry výstřelu, klíčové snímky dráhy (každý 2. tik, jen pohnutá tělesa, max. ~28 kB) a konečné pozice všech těles. Soupeř snímky přehraje a převezme konečný stav. Každý tah se simuluje z uloženého stavu, takže se zařízení nemohou rozjet.
- Synchronizace jako Psaníčko: mantledb.sh `jezkomet-<id>/hra`, odkaz `#r.<id>`, počítadlo `v` proti souběžným zápisům, dotazování 2,5 s. Limit dokumentu MantleDB ověřen: 60 kB projde, 120 kB vrací 413.
- Postavičky, ježek, kostky i krajina jsou kreslené kódem, žádné cizí obrázky.

## Testy
- `node tests/tune.cjs` – stabilita pevností a rozložení výsledků výstřelů.
- `node tests/duel.cjs [URL]` – celá partie v Chromiu (Pixel 7 na výšku) a WebKitu (iPhone 13 na šířku): výzva, přijetí, výstřely tažením myší, přehrání u soupeře, stavba, výhra, sázka, odveta se sérií, přihlížející s `prefers-reduced-motion`, obnovení stránky. Playwright z globálního npm (`%APPDATA%/npm/node_modules/playwright`).
- Lokálně: `node tools/serve.cjs 8793`.
