# Deník – Ježkomet (jezci-prak)

## 2026-10-31 · Claude (session z Psaníčka)
- Hotovo: hra postavená a nasazená, https://sachasportrezervace-arch.github.io/jezci-prak/ (repo sachasportrezervace-arch/jezci-prak, Pages z main /).
- Název „Ježkomet“ (ježek + -met), složka a repo zůstávají `jezci-prak` podle zadání. Svět a twisty v DESIGN.md, produkt v PRODUCT.md (odvozeno ze zadání, bez rozhovoru – Mark nechce dotazy).
- Fyzika Matter.js 0.19.0 (vendor/), autoritou je střelec, soupeř přehrává klíčové snímky. Ladění odolnosti: `node tests/tune.cjs` (postavička 22 životů: z 437 výstřelů žádný nevyřadí všechny tři naráz z výchozí pevnosti).
- Opraveno během testu: třída `build` na plátně kolidovala se stylem panelu stavby (plátno ujelo o půl šířky) → panel přejmenován na `.buildbox`.
- Pozor: port 8765 drží Kafíčko, 8791 Zvířátka, Ježkomet lokálně na 8793 (`node tools/serve.cjs`). `.claude/launch.json` v react-apps spouští Kafíčko, ne tuhle hru.
- Kolo 2 (pokyn Marka přes Psaníčko): fullscreen tlačítko (Fullscreen API; iPhone = návod Přidat na plochu + manifest standalone, ikony v icons/, `node tools/icons.cjs`), kamera (posun tažením mimo prak, pinch, kolečko, lupa celá scéna, sledování ježka a dopadu), vlastní rozvržení desktop (popisky, panel stavby vpravo) vs. mobil (ikony ve sloupci, cíle ≥ 44 px). Prak se teď chytá u praku, ne kdekoli.
- Opraveno: WebKit nechával visící ukazatel → nový primární dotyk ukazatele vyčistí, kamera ignoruje NaN.
- Otevřené: bot v testu hledá nejlepší ránu mřížkou a partie končí po 2–3 tazích; lidská partie bude delší. Kdyby byla moc krátká, zvednout CRITTER_HP v engine.js (tests/tune.cjs ukáže rozložení).
