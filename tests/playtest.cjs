// Playtest: celá partie ve 2 nezávislých prohlížečích v REÁLNÉM čase (rychlost 1×), „lidské“ rány s chybou,
// měření časů a screenshoty po tazích.  node tests/playtest.cjs [URL]
//   Chromium desktop 1366×820 (Mark) + WebKit iPhone 13 na výšku 390×844 (Radka), celou partii na výšku.
//   Lidské časy: míření 4–8 s na výstřel (od chvíle, kdy je hráč na tahu, po puštění; AIM_MIN/AIM_MAX), výběr ježka 2–4 s
//   (PICK_MIN/PICK_MAX). Hledání rány botem se do doby míření počítá, tah se tedy nepodlézá. GAME=jméno pro jiný soubor výsledků.
//   Chyba míření: úhel ±ERR_DEG (výchozí 4°), síla ±ERR_POW (výchozí 6 %).
//   Výstup: tabulka tahů + souhrn (JSON v tests/out/playtest.json), obrázky do $SHOTS (výchozí tests/shots-play).
const path = require("path"), fs = require("fs");
const PW = process.env.PW || path.join(process.env.APPDATA || "", "npm/node_modules/playwright");
const { chromium, webkit, devices } = require(PW);
let URL = process.argv[2] || "http://127.0.0.1:8793/";
URL += (URL.includes("?") ? "&" : "?") + "test";
const SHOTS = process.env.SHOTS || path.join(__dirname, "shots-play");
const AIM_MIN = +(process.env.AIM_MIN ?? 4), AIM_MAX = +(process.env.AIM_MAX ?? 8), PICK_MIN = +(process.env.PICK_MIN ?? 2), PICK_MAX = +(process.env.PICK_MAX ?? 4);
const ERR_DEG = +(process.env.ERR_DEG ?? 4), ERR_POW = +(process.env.ERR_POW ?? 0.06), MAXT = +(process.env.MAXT || 14);
fs.mkdirSync(SHOTS, { recursive: true }); fs.mkdirSync(path.join(__dirname, "out"), { recursive: true });
const T = 30000, now = () => Date.now();
const info = p => p.evaluate(() => window.JPT && window.JPT.info());
const stat = p => p.evaluate(() => document.getElementById("status").textContent);
const rr = (a, b) => a + Math.random() * (b - a);
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const bA = await chromium.launch(), bB = await webkit.launch();
  const A = await (await bA.newContext({ viewport: { width: 1366, height: 820 } })).newPage();
  const B = await (await bB.newContext({ ...devices["iPhone 13"], viewport: { width: 390, height: +process.env.BH || 844 } })).newPage();
  const errs = [];
  for (const [n, p] of [["A", A], ["B", B]]) p.on("pageerror", e => errs.push(n + ": " + e.message));
  const shot = (p, n) => p.screenshot({ path: path.join(SHOTS, n + ".png") });

  await A.goto(URL); await A.waitForSelector("#setup:not([hidden])", { timeout: T });
  await A.fill("#nameX", "Mark"); await A.fill("#nameO", "Radka");
  await A.click('#starterSeg button[data-v="x"]'); await A.click("#setupSubmit");
  await A.waitForSelector("#share:not([hidden])", { timeout: T });
  const link = (await A.evaluate(() => location.href)).replace(/\?test/, "");
  await A.click("#backBtn");
  await B.goto(link.replace("#", "?test#")); await B.waitForSelector("#intro:not([hidden])", { timeout: T });
  await B.click("#acceptBtn"); await B.waitForSelector("#hud:not([hidden])", { timeout: T });
  await A.waitForFunction(() => document.title.startsWith("Jsi na tahu"), null, { timeout: T });
  await sleep(500);
  await shot(A, "p01-start-desktop"); await shot(B, "p02-start-iphone-vyska");

  const rows = [], waits = [];
  let turns = 0, landscape = false;
  const t0 = now();
  while (turns < MAXT) {
    const ia = await info(A);
    if (ia.ph === "end") break;
    const P = ia.p === "x" ? A : B, O = ia.p === "x" ? B : A, nm = ia.p === "x" ? "Mark" : "Radka";
    const tTurn = now();
    await P.waitForFunction(() => document.title.startsWith("Jsi na tahu"), null, { timeout: T });
    const waitedForTurn = now() - tTurn;
    const tAim0 = now(), aimTarget = rr(AIM_MIN, AIM_MAX) * 1000;
    const best = await P.evaluate(() => window.JPT.best(5000));
    const bestMs = now() - tAim0;
    // lidská chyba: otoč vektor o ±ERR_DEG a prodluž/zkrať o ±ERR_POW
    const da = rr(-ERR_DEG, ERR_DEG) * Math.PI / 180, k = 1 + rr(-ERR_POW, ERR_POW);
    const dx = (best.dx * Math.cos(da) - best.dy * Math.sin(da)) * k, dy = (best.dx * Math.sin(da) + best.dy * Math.cos(da)) * k;
    const [sx, sy] = await P.evaluate(() => window.JPT.sling());
    // míření: nejdřív chvíli „hledá“ (palec u praku, drobné pohyby), pak plynule dotáhne na zvolený úhel a sílu; celkem aimTarget
    const aimLeft = Math.max(1500, aimTarget - bestMs - 400);
    await P.mouse.move(sx, sy); await P.mouse.down();
    const STEPS = 24, t0a = now();
    for (let i = 1; i <= STEPS; i++) {
      const k = i / STEPS, e = k < 0.6 ? 0.35 * (k / 0.6) : 0.35 + 0.65 * ((k - 0.6) / 0.4) ** 0.8, wob = (1 - k) * 14;
      await P.mouse.move(sx + dx * e + rr(-wob, wob), sy + dy * e + rr(-wob, wob));
      if (turns < 2 && i === 12) { await shot(O, `p10-soupere-miri-${turns}`); await shot(P, `p11-mireni-${turns}`); }
      await sleep(Math.max(20, (aimLeft * i / STEPS) - (now() - t0a)));
    }
    await P.mouse.move(sx + dx, sy + dy);
    const aimS = +((now() - tAim0) / 1000).toFixed(1);
    const n0 = ia.n;
    await P.mouse.up();
    const tShot = now();
    const tOReplay = O.waitForFunction(() => window.JPT.info().replay, null, { timeout: 90000, polling: 30 }).then(() => now());
    // snímky z letu (střelec)
    const flight = [];
    if (turns < 3) for (let i = 0; i < 7; i++) { await sleep(450); flight.push(shot(P, `p20-let-${turns}-${i}`)); }
    await Promise.all(flight);
    await P.waitForFunction(n => { const i = window.JPT.info(); return i.n > n && !i.busy && !i.acting; }, n0, { timeout: 90000, polling: 30 });
    const tCommit = now();
    const tR0 = await tOReplay;
    if (turns < 2) { await sleep(900); await shot(O, `p30-prehrani-${turns}`); }
    await O.waitForFunction(() => !window.JPT.info().replay, null, { timeout: 90000, polling: 30 });
    const tR1 = now();
    let ip = await info(P);
    await O.waitForFunction(n => window.JPT.info().n >= n, ip.n, { timeout: 30000 });
    const row = { tah: turns + 1, kdo: nm, miriS: aimS, ko: best.ko, nezHodnoceno: best.score, stavPo: JSON.stringify(ip.alive),
      letS: +((tCommit - tShot) / 1000).toFixed(1), prodlevaDoPrehraniS: +((tR0 - tCommit) / 1000).toFixed(1), prehraniS: +((tR1 - Math.max(tR0, tCommit - 5000)) / 1000).toFixed(1), celkemCekaSoupereS: +((tR1 - tShot) / 1000).toFixed(1) };
    if (ip.ph === "end") { rows.push(row); waits.push(row.celkemCekaSoupereS); break; }
    // výběr ježka pro soupeře (twist); když zbývá jediný druh, přijde sám
    const tP = now();
    if (ip.ph === "pick") {
      await P.waitForSelector("#pickBox:not([hidden])", { timeout: T });
      if (turns < 2) { await shot(P, `p40-vyber-jezka-${P === A ? "desktop" : "iphone"}-${turns}`); await shot(O, `p41-soupere-ceka-na-jezka-${turns}`); }
      await sleep(rr(PICK_MIN, PICK_MAX) * 1000);   // rozmyslí si, koho pošle
      const avail = (await info(P)).pl[ia.p === "x" ? "o" : "x"];
      const order = ["b", "k", "g", "n"];
      const curHg = (await info(P)).hg;
      const want = order.find(t => avail.includes(t) && t !== curHg) || avail[0];
      await P.click(`#kinds [data-k="${want}"]`);
      await P.click("#sendBtn");
      await P.waitForFunction(() => { const i = window.JPT.info(); return i.ph === "aim" && !i.busy; }, null, { timeout: 60000, polling: 30 });
    }
    await O.waitForFunction(() => { const i = window.JPT.info(); return i.ph === "aim" && !i.replay; }, null, { timeout: 60000, polling: 30 });
    row.vyberS = +((now() - tP) / 1000).toFixed(1); row.jezek = (await info(O)).hg;
    rows.push(row); waits.push(row.celkemCekaSoupereS + row.vyberS);
    console.log(JSON.stringify(row));
    turns++;
  }
  const fa = await info(A);
  await sleep(1200);
  await shot(A, "p90-konec-desktop"); await shot(B, "p91-konec-iphone");
  const total = (now() - t0) / 1000;
  const shots = rows.length, perPlayer = Math.ceil(shots / 2);
  const avg = a => a.reduce((s, v) => s + v, 0) / (a.length || 1);
  const byP = { Mark: rows.filter(r => r.kdo === "Mark").length, Radka: rows.filter(r => r.kdo === "Radka").length };
  const sum = { vystrelu: shots, naHrace: perPlayer, poHracich: byP, tahu: rows.length, vitez: fa.win, celkemS: +total.toFixed(0), celkemMin: +(total / 60).toFixed(1), prumMiriS: +avg(rows.map(r => r.miriS)).toFixed(1), prumLetS: +avg(rows.map(r => r.letS)).toFixed(1),
    prumCekaniSoupereS: +avg(rows.map(r => r.celkemCekaSoupereS)).toFixed(1), prumProdlevaS: +avg(rows.map(r => r.prodlevaDoPrehraniS)).toFixed(1),
    prumVyberS: +avg(rows.filter(r => r.vyberS).map(r => r.vyberS)).toFixed(1), chyby: errs, chybaMireni: { deg: ERR_DEG, pow: ERR_POW } };
  console.log("SOUHRN " + JSON.stringify(sum));
  fs.writeFileSync(path.join(__dirname, "out", (process.env.GAME || "playtest") + ".json"), JSON.stringify({ rows, sum }, null, 1));
  await bA.close(); await bB.close();
})().catch(e => { console.error(e); process.exit(2); });
