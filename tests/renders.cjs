// Sada renderů všech obrazovek a stavů pro design review (desktop 1366×820, iPhone 13 na výšku a na šířku, WebKit/Chromium).
// node tests/renders.cjs [URL]  → $SHOTS (výchozí tests/shots-review)
const path = require("path"), fs = require("fs");
const PW = process.env.PW || path.join(process.env.APPDATA || "", "npm/node_modules/playwright");
const { chromium, webkit, devices } = require(PW);
let URL = process.argv[2] || "http://127.0.0.1:8793/";
URL += (URL.includes("?") ? "&" : "?") + "test";
const SHOTS = process.env.SHOTS || path.join(__dirname, "shots-review");
fs.mkdirSync(SHOTS, { recursive: true });
const T = 30000, sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const bA = await chromium.launch(), bB = await webkit.launch();
  const profiles = [
    ["desktop", bA, { viewport: { width: 1366, height: 820 } }],
    ["iphone-vyska", bB, { ...devices["iPhone 13"], viewport: { width: 390, height: 844 } }],
    ["iphone-sirka", bB, { ...devices["iPhone 13 landscape"] }],
  ];
  for (const [name, br, opts] of profiles) {
    const ctx = await br.newContext(opts), p = await ctx.newPage();
    const shot = n => p.screenshot({ path: path.join(SHOTS, `${name}-${n}.png`) });
    // načítání (zpomalená odpověď) a chyba spojení
    await p.route("**/mantledb.sh/**", async r => { await sleep(1500); r.continue(); });
    await p.goto(URL + "#r.aaaaaaaaaaaa");
    await p.waitForSelector("#info:not([hidden])", { timeout: T }); await shot("1-nacitani");
    await p.waitForFunction(() => /není/.test(document.getElementById("infoTitle").textContent), null, { timeout: T }); await shot("2-hra-neexistuje");
    await p.unroute("**/mantledb.sh/**");
    await p.route("**/mantledb.sh/**", r => r.abort());
    await p.goto(URL + "#r.bbbbbbbbbbbb"); await p.waitForFunction(() => /nepodařilo/.test(document.getElementById("infoTitle").textContent), null, { timeout: T }); await shot("3-chyba-spojeni");
    await p.unroute("**/mantledb.sh/**");
    // nastavení, sdílení
    await p.goto(URL); await p.waitForSelector("#setup:not([hidden])", { timeout: T });
    await p.fill("#nameX", "Mark"); await p.fill("#nameO", "Radka"); await p.selectOption("#stakeSel", "1");
    await shot("4-zalozeni");
    await p.click('#starterSeg button[data-v="x"]'); await p.click("#setupSubmit");
    await p.waitForSelector("#share:not([hidden])", { timeout: T }); await shot("5-sdileni");
    const link = (await p.evaluate(() => location.href)).replace(/\?test/, "");
    await p.click("#backBtn"); await p.waitForSelector("#hud:not([hidden])", { timeout: T }); await sleep(900);
    await shot("6-ceka-na-souperea");
    // výzva u soupeře
    const c2 = await br.newContext(opts), q = await c2.newPage();
    await q.goto(link.replace("#", "?test#")); await q.waitForSelector("#intro:not([hidden])", { timeout: T });
    await q.screenshot({ path: path.join(SHOTS, `${name}-7-vyzva.png`) });
    await q.click("#acceptBtn"); await q.waitForSelector("#hud:not([hidden])", { timeout: T });
    await p.waitForFunction(() => document.title.startsWith("Jsi na tahu"), null, { timeout: T }); await sleep(600);
    await shot("8-na-tahu"); await q.screenshot({ path: path.join(SHOTS, `${name}-9-soupere-miri.png`) });
    // celá scéna lupou a zpět
    await p.click("#viewBtn"); await sleep(1400); await shot("8b-cela-scena"); await p.click("#viewBtn"); await sleep(1400);
    // míření (skutečná dobrá rána) + let + dopad + výběr ježka
    const best = await p.evaluate(() => window.JPT.best(6000));
    const [sx, sy] = await p.evaluate(() => window.JPT.sling());
    await p.mouse.move(sx, sy); await p.mouse.down();
    for (let i = 1; i <= 8; i++) await p.mouse.move(sx + best.dx * i / 8, sy + best.dy * i / 8);
    await sleep(200); await shot("10-mireni"); await p.mouse.up();
    await sleep(500); await shot("10b-let-start"); await q.screenshot({ path: path.join(SHOTS, `${name}-10b-let-soupere.png`) });
    await sleep(500); await shot("10c-let-stred");
    await sleep(500); await shot("10d-dopad");
    await p.waitForSelector("#pickBox:not([hidden])", { timeout: 60000 }); await shot("11-vyber-jezka");
    await p.click('#kinds [data-k="k"]'); await sleep(200); await shot("12-vyber-kamenny");
    await p.click("#sendBtn");
    await q.waitForFunction(() => { const i = window.JPT.info(); return i.ph === "aim" && !i.replay && i.me === i.p; }, null, { timeout: 60000 }); await sleep(500);
    await q.screenshot({ path: path.join(SHOTS, `${name}-13-jezek-od-soupere.png`) });
    await p.click("#menuBtn"); await sleep(300); await shot("14-nabidka");
    await p.click("#mHelp"); await sleep(300); await shot("15-napoveda");
    await ctx.close(); await c2.close();
  }
  await bA.close(); await bB.close();
  console.log("hotovo:", SHOTS);
})().catch(e => { console.error(e); process.exit(2); });
