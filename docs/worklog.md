# Deník – Ježkomet (jezci-prak)

## 2026-10-31 · Claude (session z Psaníčka)
- Hotovo: hra postavená a nasazená, https://sachasportrezervace-arch.github.io/jezci-prak/ (repo sachasportrezervace-arch/jezci-prak, Pages z main /).
- Název „Ježkomet“ (ježek + -met), složka a repo zůstávají `jezci-prak` podle zadání. Svět a twisty v DESIGN.md, produkt v PRODUCT.md (odvozeno ze zadání, bez rozhovoru – Mark nechce dotazy).
- Fyzika Matter.js 0.19.0 (vendor/), autoritou je střelec, soupeř přehrává klíčové snímky. Ladění odolnosti: `node tests/tune.cjs` (postavička 22 životů: z 437 výstřelů žádný nevyřadí všechny tři naráz z výchozí pevnosti).
- Opraveno během testu: třída `build` na plátně kolidovala se stylem panelu stavby (plátno ujelo o půl šířky) → panel přejmenován na `.buildbox`.
- Pozor: port 8765 drží Kafíčko, 8791 Zvířátka, Ježkomet lokálně na 8793 (`node tools/serve.cjs`). `.claude/launch.json` v react-apps spouští Kafíčko, ne tuhle hru.
- Otevřené: na výšku je scéna malá (celý svět na šířku telefonu); hra radí otočit na šířku. Bot v testu hledá nejlepší ránu mřížkou, lidská partie bude delší.
