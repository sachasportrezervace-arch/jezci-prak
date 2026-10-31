# Ježkomet – vizuální svět

**Svět: „Ranní louka z modelíny“.** Hračkový kreslený svět: tlusté obrysy v tmavé švestce, syté veselé barvy, měkké stíny, vše kreslené vektorově na canvasu (žádné bitmapy, žádné cizí assety). Scéna je záměrně klidná: rovné nebe bez slunce, mraků a přechodů, dva ploché pásy kopců bez obrysu, ať hru nepřebíjí pozadí. Obrys má jen to, s čím se hraje (terén, pevnosti, postavičky, ježek).

## Typografie (finalisté → vítěz)
| dvojice | proč ne / proč ano |
|---|---|
| **Titan One + Baloo 2** (vítěz) | Titan One je baculatý, hravý, čte se i malý; Baloo 2 má kulaté tvary a 500–800 řezy. Obě latin-ext (čeština ověřena v CSS API, render v testu). |
| Lilita One + Nunito | Lilita je o stupeň „sportovnější“, ale působí jako výchozí herní font; Nunito je na hru moc kancelářský. |
| Bowlby One + Fredoka | Bowlby je na mobilu těžký a široký, české háčky ve velikosti 14 px slévají. |

Titan One jen na nadpisy a čísla skóre, Baloo 2 na všechno ostatní.

## Paleta
- inkoust (obrysy, text): `#2B1638` švestka
- nebe plochá `#86D9F2`, kopce `#A9E2D3` / `#88D09F`, tráva `#6CCB3A`, hlína `#C98A4B`
- Křečci (hráč vlevo): `#FF7A2F`, stín `#D9541A`, bříško `#FFE0B8`
- Sovičky (hráč vpravo): `#9B6BFF`, stín `#7346D9`, bříško `#EADFFF`, zobák `#FFB020`
- materiály: dřevo `#EDAC62`, kámen `#B2BCCC`, sklo `#C4F2FF` (průhledné)
- akce / „na tahu“: limetka `#C6F432` (sdílená řeč s Psaníčkem)
- papír UI: `#FFF8EA`

## Postavičky (art.js, vrstvy v canvasu)
Světlo vlevo nahoře, jemný stín vpravo dole (půlměsíc tmavší barvy oříznutý do těla), odlesk, bříško, obrys 2–3 px. Křeček: vejčité tělo, kulaté uši s růžovým vnitřkem, tlapky s prstíky, nožky, ocásek, tvářičky, dva přední zuby, korálková očka. Soviča: chocholky, obličejový terč se dvěma velkýma očima, zobák, křidélka, pírka na hrudi, pařátky, ocasní pera.
Výrazy a reakce drží renderer (ne dokument), u soupeře se odvodí z přehrávaných snímků a událostí:
- klid: dýchání, mrkání, pohled k soupeřově pevnosti, při letu ježka oči sledují ježka;
- strach (ježek letí blízko): velké oči, třes, kapka potu, uši dozadu;
- zásah: oči >< a otevřená pusa, krátké zploštění; úlek při zásahu v okolí;
- zranění podle hp/max: náplast (28 %), obvaz kolem hlavy a smutné oči (55 %), kroužící hvězdičky a půlměsíce (80 %);
- radost (poskok, ruce nahoře, oči ^ ^) po dobrém výstřelu, facepalm po minutí, úlek čekajícího týmu;
- vyřazení: postavička s kroužky v očích odlétne v oblouku a „puf“ (obláček a hvězdičky), nikdy nic krutého.
`prefers-reduced-motion`: výrazy zůstávají, mizí třes, poskoky, zploštění, mrkání, hvězdičky se netočí, méně úlomků a částic, žádné zpomalení ani hit-stop.

## Jednotky v2 (art.js, obě tělesné šablony: křeček i sovička)
Každá jednotka má vlastní siluetu, aby se nepletla ani ve 24 px na telefonu. Všechny vychází ze strážníka (křeček r 19,5), barva týmu zůstává, rozdíl dělá tvar a doplněk.
- **Král** (r 24): o čtvrtinu větší než strážník, zlatá koruna se třemi hroty (stejná i v HUD jako ikona), pláštěnka v barvě týmu se zvlněným červeným lemem. Lišta životů nad hlavou stále, v HUD lišta krále u obou hráčů.
- **Strážník** (r 19): základní postavička z v1, beze změny.
- **Tlusťoch** (r 30): široká koule, bříško přes většinu těla, malé uši a hlava; sovička je načepýřená koule z peříček. Při odrazu ježka tyrkysový kroužek a nápis „boing“.
- **Štítonoš** (obdélník 30×50): přilba s čelním pásem s nýty a týmovým hřebenem, kulatý štít z dřeva s kovovým okrajem a týmovým pupkem před tělem. Štít praská ve třech stupních (prasklý, ulomený okraj, jen úlomek) podle zbývajícího štítu.
- **Skokan** (r 14): drobný, výš posazené tělo, pásek přes čelo; při úskoku se protáhne a „hop!“ bublina.
- **Léčitel** (r 18): bílá čepice se zeleným křížem a brašna přes rameno; při léčení zelené „+6“ a zelená aura.
Ostatní jednotky ukazují lištu životů jen při zranění. V HUD má každá jednotka pastilku s kroužkem životů, štít jako modrý oblouk.

## Ježci a nové materiály v2
- **Špičák:** malý, žlutý, dlouhé ocelové hroty a špičatý čumák (silueta „šípek“), aby se nepletl s kulatými ježky.
- **Led:** mléčně světle modrý, fasetované plochy, mrazivé tečky a šestiramenné vločky. **Kov:** široké zkosení, rýhy broušení, nýty v rozích, ostrý lesk.

## Mapy (terén mezi pevnostmi, vždy symetrický, podstavce a praky stejné)
- **Kopec:** zelený kopec uprostřed zastaví nízké rány (výchozí mapa v1).
- **Údolí s jezírkem:** šikmé hliněné břehy a jezírko, které spolkne, co do něj spadne; tráva jen na rovině.
- **Plošiny:** tři dřevěné plošiny na sloupcích (prkna), chytí nízké rány, střílí se obloukem nebo mezerou.
- **Skála:** fialově šedá skála s mechem uprostřed, přes ni jen vysoký oblouk.
Paleta map vychází z jedné „Ranní louky“ (jen jemné posuny nebe a trávy, `PAL` v `game.js`), aby každá mapa byla jiná, ale svět zůstal jeden.

## Modifikátory (karta partie, štítek `#modChip` v HUD)
- **Klidný den:** bez úprav.
- **Vítr 1–3:** bílé proužky ve směru větru (pás pod horním HUD zůstává čistý) a **praporek větru** za prakem každého hráče: vlaje po větru, síla = počet oranžových pruhů ze tří (zbytek papírově bílý) a jak vodorovně stojí (síla 1 visí, 3 stojí rovně). Při `prefers-reduced-motion` praporek nevlaje, jen ukazuje směr a sílu.
- **Noc:** tmavě modré nebe, hvězdy, teplé světlo luceren za pevnostmi a světlušky; jednotky a kostky zůstávají plně čitelné (noc jen v pozadí a terénu).
- **Mráz:** chladnější tráva a kopce, v pevnostech víc ledu.
- **Lehká gravitace:** stoupající chmýří v pozadí.
Odveta má vždy jinou mapu a jiný modifikátor než předchozí partie.

## Kostky a ježci
Kostky mají jednotný jazyk: světlo nahoře vlevo, stín dole vpravo, vnitřní hrana; dřevo má suky, léta a hřebíky, kámen fazetu a tečky, sklo odlesky. Praskliny přibývají ve čtyřech stupních podle hp/max (dvojitý tah, tmavý + světlý okraj pro hloubku). Zničená kostka se rozpadne na úlomky stejného materiálu (dřevěné třísky, kamenné kusy, skleněné střepy), které padají, odskakují a mizí.
Ježci se liší siluetou i barvou: obyčejný hnědý, kamenný šedý s hrubšími hroty, gumový tyrkysový s oblými hroty, bouchací červený s doutnákem.

## Pohyb
Autorské momenty: výstřel (napnutí praku, výstřel, třesení, třísky) a rozhodující zásah (krátký hit-stop a zpomalení jen ve vykreslení; simulace i dokument se nemění). Zpomalení jen u vyřazení poslední postavičky nebo dvojitého KO.

## Twisty (navrženo 3, ve hře 1)
Zhodnocení původního twistu (po výstřelu si střelec přidá 1 kostku do pevnosti): jako obrana slušné, ale slabé. Nic nepřekvapí (víš, co uděláš), v 1. kole je skoro neviditelný (kostka nic nemění na výsledku prvních výstřelů), prodlužuje tah (výběr, umístění, pád a usazení kostky 4–14 s měřeno v playtestu) a občas zabije vlastní postavičku (v simulaci 9 z 40 náhodných kostek vyřadilo vlastní postavičku). Oproti Angry Birds (pevné pořadí ptáků, jeden hráč) nepřidává žádné rozhodnutí proti člověku.

1. **Munice od soupeře (ve hře).** Po výstřelu vybereš, jakého ježka střílí soupeř: obyčejného, kamenného (těžký, boří, letí kratší), gumového (skáče a odráží se) nebo bouchacího (při dopadu vybuchne a odhodí vše v okruhu). Každý druh dostane jednou, než se dávka obnoví, poslední zbývající přijde sám. Proč vyhrává: je vidět už po prvním výstřelu (soupeř hned má v praku vybraného ježka a vidí ho i čekající), vysvětlí se jednou větou, dává tahu rozhodnutí proti člověku (komu kdy dát silného ježka, co kdo zrovna ustojí) a je to psychologická hra, ne štěstí. Dávkování brání „vždycky dám nejslabšího“. Tah je kratší než dřív (jedno ťuknutí místo stavění). Stav je jedno pole (`hg`) a pole dávek (`pl`), autoritou zůstává střelec.
2. Odražený materiál: kostky vyražené ze soupeřovy pevnosti padají do tvé. Zamítnuto: efekt je na pár kostek, ve fyzice nahodilý a hráč ho těžko plánuje, nepřidává rozhodnutí.
3. Záchranný výstřel: výstřelem podepřeš nebo vrátíš vlastní postavičku. Zamítnuto: míří se na vlastní pevnost místo na soupeře, ruší základní radost ze střelby a špatně se vysvětluje jednou větou.
Dřívější nápady (Bodlinky, Rozprsk) zůstávají zamítnuté: hromadí tělesa a zvětšují synchronizovaný stav, ve 1v1 rozhoduje o výsledku víc náhoda než míření.
