// E2E Ježkomet: trénink proti botovi (#solo). Chromium desktop 1366×820 (vstup tlačítkem „Zkusit sám“) a WebKit iPhone 13
// 390×844 (vstup přímo adresou #solo). Celá partie s botem: hráč střílí nejlepší ranou z JPT.best (tažením od praku), jednou
// staví a vybírá ježky; bot míří, občas staví a vybírá ježka hráči. Kontroluje se, že do mantledb.sh nejde ani jeden požadavek,
// že je vidět „Trénink“ (žádná série), konec nabídne „Znovu“ a „Vyzvat soupeře“ a že přechod na výzvu vrátí normální hru.
//   node tests/solo.cjs [URL]      (výchozí http://127.0.0.1:8823/)
const path = require("path");
const PW = process.env.PW || path.join(process.env.APPDATA || "", "npm/node_modules/playwright");
const { chromium, webkit, devices } = require(PW);
let URL = process.argv[2] || "http://127.0.0.1:8823/";
URL += (URL.includes("?") ? "&" : "?") + "test";
const SHOTS = process.env.SHOTS || path.join(__dirname, "shots-solo");
require("fs").mkdirSync(SHOTS, { recursive: true });

let pass = 0, fail = 0;
function check(name, ok, extra = "") {
  if (ok) pass++; else fail++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  (" + extra + ")" : ""}`);
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
const T = 25000;

async function run(nm, browser, opts, viaHash) {
  const ctx = await browser.newContext(opts), P = await ctx.newPage();
  const sync = [], errs = [];
  P.on("request", r => { if (/mantledb\.sh/.test(r.url())) sync.push(r.method() + " " + r.url()); });
  P.on("pageerror", e => errs.push(e.message));
  P.on("dialog", d => d.accept());
  const info = () => P.evaluate(() => window.JPT.info());
  const shot = n => P.screenshot({ path: path.join(SHOTS, `${nm}-${n}.png`) });

  // ----- vstup -----
  if (viaHash) {
    await P.goto(URL + "#solo");
  } else {
    await P.goto(URL);
    await P.waitForSelector("#setup:not([hidden])", { timeout: T });
    const sb = await P.locator("#soloBtn").boundingBox();
    check(`${nm}: na úvodní obrazovce je sekundární tlačítko „Zkusit sám“ (≥ 44 px)`, (await P.locator("#soloBtn").innerText()) === "Zkusit sám" && sb && sb.height >= 44 && (await P.locator("#soloBtn").getAttribute("class")).includes("paper"));
    await P.fill("#nameX", "Mark");
    await P.click("#soloBtn");
  }
  await P.waitForSelector("#hud:not([hidden])", { timeout: T });
  const i0 = await info();
  check(`${nm}: trénink běží (#solo, hraju za Křečky, bot za Sovičky, začínám, pevnosti a mapa ze seedu)`, (await P.evaluate(() => location.hash)) === "#solo" && (await P.evaluate(() => window.JPT.solo())) && i0.me === "x" && i0.p === "x" && i0.ph === "t" && i0.n === 0 && i0.alive.x === 6 && i0.alive.o === 6 && !!i0.map, JSON.stringify({ map: i0.map, md: i0.md, wd: i0.wd }));
  check(`${nm}: místo skóre série nenápadný štítek „Trénink“, žádné čekání na soupeře`, (await P.locator("#score").innerText()) === "Trénink" && !(await P.locator("#waitBox").isVisible()));
  check(`${nm}: karta partie ukáže mapu a modifikátor jako v ostré hře`, await P.locator("#banner").isVisible() && (await P.locator("#bnMap").innerText()).length > 2);
  await shot("01-start");
  if (await P.locator("#banner").isVisible()) await P.click("#banner").catch(() => {});
  await P.evaluate(() => { window.JPT.speed = 3; });

  // ----- partie -----
  let myShots = 0, myBuilds = 0, myPicks = 0, botShots = 0, botBuilds = 0, botPicks = 0, lastN = -1, lastHd = "", guard = 0, botShotSeen = false;
  const t0 = Date.now();
  while (guard++ < 400) {
    const i = await info();
    if (i.ph === "end" && !i.replay && !i.acting) break;
    if (i.n !== lastN) {
      if (i.lastAct && i.lastAct.by === "o") { if (i.lastAct.kind === "s") botShots++; else botBuilds++; }
      lastN = i.n;
    }
    if (i.hd.x && i.hd.x !== lastHd && i.p === "x" && i.n > 0 && !i.lb.x) botPicks++;
    lastHd = i.hd.x;
    if (i.replay && !botShotSeen) { botShotSeen = true; await sleep(250); await shot("03-bot-tahne"); }
    const mine = i.me === i.p && !i.replay && !i.acting && !i.busy;
    if (mine && i.ph === "pick") {
      await P.waitForSelector("#pickRow:not([hidden])", { timeout: T });
      if (!myPicks) await shot("04-vyber-jezka-pro-bota");
      await P.click("#kinds [data-k]:not([disabled])");
      await P.click("#sendBtn");
      await P.waitForFunction(() => window.JPT.info().ph !== "pick" || window.JPT.info().p !== "x", null, { timeout: T });
      myPicks++;
      continue;
    }
    if (mine && i.ph === "t" && (await P.evaluate(() => document.title.startsWith("Jsi na tahu")))) {
      const canBuild = (await P.getAttribute("#modeBuild", "aria-disabled")) === "false";
      if (!myBuilds && canBuild && i.n >= 2) {
        await P.click("#modeBuild");
        await P.waitForFunction(() => window.JPT.ghost() && window.JPT.ghost().ok, null, { timeout: 8000 }).catch(() => {});
        await sleep(300); await shot("05-stavba");
        await P.click("#placeBtn");
        await P.waitForFunction(n => window.JPT.info().n > n && !window.JPT.info().acting, i.n, { timeout: 60000 }).catch(async e => { await shot("chyba-stavba"); throw new Error(`${nm} stavba: ${e.message.split("\n")[0]} ${JSON.stringify(await P.evaluate(() => ({ g: window.JPT.ghost(), mode: window.JPT.info().mode })))}`); });
        myBuilds++;
        continue;
      }
      // kamera se po tahu bota plynule vrací na můj prak (na výšku je prak jinak mimo obrazovku)
      await P.waitForFunction(() => { const c = window.JPT.cam(); return Math.abs(c.x - c.home.x) < 12 && Math.abs(c.s - c.home.s) < 0.03 && !c.user; }, null, { timeout: 9000, polling: 100 }).catch(() => {});
      const best = await P.evaluate(() => window.JPT.best(2500));
      const [sx, sy] = await P.evaluate(() => window.JPT.sling());
      await P.mouse.move(sx, sy); await P.mouse.down();
      for (let k = 1; k <= 6; k++) await P.mouse.move(sx + best.dx * k / 6, sy + best.dy * k / 6);
      if (!myShots) await shot("02-mireni");
      await P.mouse.up();
      await P.waitForFunction(n => window.JPT.info().n > n && !window.JPT.info().acting, i.n, { timeout: 60000 }).catch(async e => { await shot("chyba-vystrel"); throw new Error(`${nm} výstřel: ${e.message.split("\n")[0]} prak ${sx},${sy} tah ${best.dx},${best.dy}`); });
      myShots++;
      continue;
    }
    await sleep(150);
  }
  const ie = await info();
  const secs = Math.round((Date.now() - t0) / 1000);
  console.log(`  ${nm}: partie ${secs} s, tahů ${ie.n}, já ${myShots} výstřelů + ${myBuilds} stavba + ${myPicks} výběrů, bot ${botShots} výstřelů + ${botBuilds} staveb + ${botPicks} výběrů, králové ${Math.round(ie.king.x)}:${Math.round(ie.king.o)}, vítěz ${ie.win}`);
  check(`${nm}: celá partie s botem doběhne do konce`, ie.ph === "end" && (ie.win === "x" || ie.win === "o" || ie.win === "="), `n ${ie.n}, ${ie.wy}`);
  check(`${nm}: bot hraje sám (střílí a vybírá mi ježka)`, botShots >= 1 && botPicks >= 1, `výstřely ${botShots}, stavby ${botBuilds}, výběry ${botPicks}`);
  check(`${nm}: hráč v tréninku střílí, staví i vybírá ježka botovi`, myShots >= 1 && myBuilds === 1 && myPicks >= 1);
  await P.waitForSelector("#endBox:not([hidden])", { timeout: T }); await sleep(600);
  await shot("06-konec");
  const end = { p: await P.locator("#endPrimary").innerText(), s: await P.locator("#endSecondary").innerText(), series: await P.locator("#endSeries").isVisible(), rank: await P.locator("#endRank").isVisible(), score: await P.locator("#score").innerText() };
  check(`${nm}: konec nabídne „Znovu“ a „Vyzvat soupeře“, bez série a titulu`, end.p === "Znovu" && end.s === "Vyzvat soupeře" && !end.series && !end.rank && end.score === "Trénink" && ie.w[0] === 0 && ie.w[1] === 0, JSON.stringify(end));
  // Znovu: nová partie v tréninku (jiná mapa nebo modifikátor než minulá)
  await P.click("#endPrimary");
  await P.waitForFunction(id => { const i = window.JPT.info(); return i && i.n === 0 && i.ph === "t" && window.JPT.solo(); }, null, { timeout: T });
  const ir = await info();
  check(`${nm}: „Znovu“ založí novou tréninkovou partii (jiná mapa nebo modifikátor)`, ir.n === 0 && (ir.map !== ie.map || ir.md !== ie.md) && (await P.evaluate(() => location.hash)) === "#solo", `${ie.map}/${ie.md} → ${ir.map}/${ir.md}`);
  // nabídka v tréninku: bez kopírování odkazu, „Vyzvat soupeře“ vede na normální výzvu
  if (await P.locator("#banner").isVisible()) await P.click("#banner").catch(() => {});
  await P.click("#menuBtn");
  const menu = { copy: await P.locator("#mCopy").isVisible(), nw: await P.locator("#mNew").innerText() };
  await shot("07-nabidka");
  check(`${nm}: nabídka v tréninku nemá odkaz na hru a nabízí „Vyzvat soupeře“`, !menu.copy && menu.nw === "Vyzvat soupeře", JSON.stringify(menu));
  await P.click("#mNew");
  await P.waitForSelector("#setup:not([hidden])", { timeout: T });
  check(`${nm}: „Vyzvat soupeře“ vrátí úvodní obrazovku normální výzvy (trénink skončil)`, !(await P.evaluate(() => window.JPT.solo())) && (await P.evaluate(() => location.hash)) === "");
  check(`${nm}: žádný požadavek na mantledb.sh (nic se nesynchronizuje, nevzniká místnost)`, sync.length === 0, sync.slice(0, 3).join(" | "));
  check(`${nm}: žádné chyby stránky`, errs.length === 0, errs.join(" | "));
  await ctx.close();
}

(async () => {
  const bA = await chromium.launch(), bB = await webkit.launch();
  try {
    const only = process.env.ONLY || "";
    await Promise.all([
      !only || only === "desktop" ? run("desktop", bA, { viewport: { width: 1366, height: 820 } }, false) : null,
      !only || only === "iphone" ? run("iphone", bB, { ...devices["iPhone 13"], viewport: { width: 390, height: 844 } }, true) : null,
    ]);
  } catch (e) { fail++; console.log("FAIL  výjimka: " + e.message); }
  await bA.close(); await bB.close();
  console.log(`\n${pass} PASS, ${fail} FAIL`);
  process.exit(fail ? 1 : 0);
})();
