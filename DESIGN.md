# Ježkomet – vizuální svět

**Svět: „Ranní louka z modelíny“.** Hračkový kreslený svět: tlusté obrysy v tmavé švestce, syté veselé barvy, měkké stíny, vše kreslené vektorově na canvasu (žádné bitmapy, žádné cizí assety).

## Typografie (finalisté → vítěz)
| dvojice | proč ne / proč ano |
|---|---|
| **Titan One + Baloo 2** (vítěz) | Titan One je baculatý, hravý, čte se i malý; Baloo 2 má kulaté tvary a 500–800 řezy. Obě latin-ext (čeština ověřena v CSS API, render v testu). |
| Lilita One + Nunito | Lilita je o stupeň „sportovnější“, ale působí jako výchozí herní font; Nunito je na hru moc kancelářský. |
| Bowlby One + Fredoka | Bowlby je na mobilu těžký a široký, české háčky ve velikosti 14 px slévají. |

Titan One jen na nadpisy a čísla skóre, Baloo 2 na všechno ostatní.

## Paleta
- inkoust (obrysy, text): `#2B1638` švestka
- nebe: `#7FD6F2` → `#FFF1C4` (ranní), kopce `#5FB8A8` / `#3E9C7E`, tráva `#6CCB3A`, hlína `#B5763E`
- Křečci (hráč vlevo): `#FF7A2F`, bříško `#FFD7A8`
- Sovičky (hráč vpravo): `#9B6BFF`, bříško `#E6D8FF`
- materiály: dřevo `#E9A55A`, kámen `#A8B3C4`, sklo `#BDEFFF` (průhledné)
- akce / „na tahu“: limetka `#C6F432` (sdílená řeč s Psaníčkem)
- papír UI: `#FFF8EA`

## Jazyk prvků
- Tlačítka jako hračky: obrys 3 px inkoustem, spodní „ret“ (tmavší pruh, při stisku se zamáčkne). Ret je řeč tohoto světa, ne kostým.
- Panely: krémový papír, obrys 3 px, zaoblení 22 px, měkký stín.
- Ikony: vlastní SVG, stejný tah 2.5 px.

## Pohyb
Jeden autorský moment: výstřel (napnutí praku, výstřel, třesení, třísky). Paralaxa 3 vrstev (mraky, kopce, keře). `prefers-reduced-motion`: bez třesení, bez driftu mraků, méně částic, kamera skáče místo plynulého letu.

## Twisty (navrženo 3, ve hře 1)
1. **Stavitel (ve hře):** po každém výstřelu si střelec přidá 1 kostku do své pevnosti. Dává tah dvě rozhodnutí (útok + obrana), smaže pocit „jen čekám“, nehraje si na štěstí a nepřekrývá se s Tančíky (vítr, terén).
2. Bodlinky: ježek se po dopadu přilepí a do dalšího tahu brání jako trnitá zeď. Zamítnuto: hromadí tělesa a zvětšuje synchronizovaný stav.
3. Rozprsk: jednou za partii ježek ve vzduchu ťuknutím vystřelí tři menší. Zamítnuto: ve 1v1 rozhoduje o výsledku víc náhoda než míření.
