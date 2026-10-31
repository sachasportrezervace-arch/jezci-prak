// Krátký GIF reakcí postaviček: pohled hráče A (Chromium 1280×720, nahrávka webm) na soupeřův výstřel bouchacím ježkem,
// který A sám vybral: strach před letem, úlek, zásah, úlomky, vyřazení a radost střelce.
// node tests/gif.cjs [URL]  → tests/shots-live/reakce.gif (potřebuje ffmpeg v PATH)
const path = require("path"), fs = require("fs"), cp = require("child_process");
const PW = process.env.PW || path.join(process.env.APPDATA || "", "npm/node_modules/playwright");
const { chromium } = require(PW);
let URL = process.argv[2] || "http://127.0.0.1:8793/";
URL += (URL.includes("?") ? "&" : "?") + "test";
const OUT = process.env.OUT || path.join(__dirname, "shots-live");
const VID = path.join(__dirname, "out", "video");
fs.mkdirSync(OUT, { recursive: true }); fs.mkdirSync(VID, { recursive: true });
for (const f of fs.readdirSync(VID)) fs.unlinkSync(path.join(VID, f));
const T = 30000, sleep = ms => new Promise(r => setTimeout(r, ms));
const info = p => p.evaluate(() => window.JPT.info());

(async () => {
  const b = await chromium.launch();
  const t0 = Date.now();
  const ctxA = await b.newContext({ viewport: { width: 1280, height: 720 }, recordVideo: { dir: VID, size: { width: 1280, height: 720 } } });
  const A = await ctxA.newPage();
  const B = await (await b.newContext({ viewport: { width: 1000, height: 640 } })).newPage();
  await A.goto(URL); await A.waitForSelector("#setup:not([hidden])", { timeout: T });
  await A.fill("#nameX", "Mark"); await A.fill("#nameO", "Radka");
  await A.click('#starterSeg button[data-v="x"]'); await A.click("#setupSubmit");
  await A.waitForSelector("#share:not([hidden])", { timeout: T });
  const link = (await A.evaluate(() => location.href)).replace(/\?test/, "");
  await A.click("#backBtn");
  await B.goto(link.replace("#", "?test#")); await B.waitForSelector("#intro:not([hidden])", { timeout: T });
  await B.click("#acceptBtn"); await B.waitForSelector("#hud:not([hidden])", { timeout: T });
  await A.waitForFunction(() => document.title.startsWith("Jsi na tahu"), null, { timeout: T });

  // A: slabší výstřel (nechá postavičky žít), pak vybere bouchacího ježka pro B
  const shoot = async (P, tag, power) => {
    const best = await P.evaluate(() => window.JPT.best(5000));
    const [sx, sy] = await P.evaluate(() => window.JPT.sling());
    const k = power || 1;
    await P.mouse.move(sx, sy); await P.mouse.down();
    for (let i = 1; i <= 8; i++) { await P.mouse.move(sx + best.dx * k * i / 8, sy + best.dy * k * i / 8); await sleep(60); }
    await P.mouse.up();
  };
  await shoot(A, "A", 0.85);
  await A.waitForSelector("#pickBox:not([hidden])", { timeout: 60000 });
  await sleep(600);
  await A.click('#kinds [data-k="b"]'); await A.click("#sendBtn");
  await B.waitForFunction(() => { const i = window.JPT.info(); return i.ph === "aim" && !i.replay && i.me === i.p; }, null, { timeout: 60000 });
  await B.waitForTimeout(800);
  // B střílí bouchacím; A to sleduje
  const tShot = Date.now();
  await shoot(B, "B");
  await A.waitForFunction(() => window.JPT.info().replay, null, { timeout: 60000, polling: 30 });
  const tRep = Date.now();
  await A.waitForFunction(() => !window.JPT.info().replay, null, { timeout: 90000, polling: 30 });
  await sleep(2500);
  const tEnd = Date.now();
  await ctxA.close(); await b.close();
  const vid = fs.readdirSync(VID).find(f => f.endsWith(".webm"));
  if (!vid) throw new Error("nahrávka chybí");
  const ss = Math.max(0, (tRep - t0) / 1000 - 1.2 - 0.6), dur = Math.min(10, (tEnd - tRep) / 1000 + 1.2);
  const gif = path.join(OUT, "reakce.gif");
  const scale = +(process.env.GIFW || 760);
  cp.execFileSync("ffmpeg", ["-y", "-ss", ss.toFixed(2), "-t", dur.toFixed(2), "-i", path.join(VID, vid), "-vf", `fps=12,scale=${scale}:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=96[p];[b][p]paletteuse=dither=bayer:bayer_scale=4`, "-loop", "0", gif], { stdio: "ignore" });
  const mb = fs.statSync(gif).size / 1048576;
  console.log(`GIF ${gif} ${mb.toFixed(2)} MB, ${dur.toFixed(1)} s (od ${ss.toFixed(1)} s videa)`);
  process.exit(0);
})().catch(e => { console.error(e); process.exit(2); });
