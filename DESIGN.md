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
