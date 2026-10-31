// Krátké videá kamery: iPhone 13 na výšku (WebKit, 390×844) a desktop (Chromium, 1280×720), obě strany stejné partie v reálném čase.
// Tři výstřely: Mark (desktop) → Radka (iPhone) → Mark; u třetího iPhone za letu převezme kameru (pinch + tažení) a tlačítko ji vrátí.
// node tests/cam-video.cjs [URL]   → tests/shots-cam/kamera-iphone-vyska.webm, kamera-desktop.webm (ffmpeg v PATH; GIF=1 přidá .gif)
const path = require("path"), fs = require("fs"), cp = require("child_process");
const PW = process.env.PW || path.join(process.env.APPDATA || "", "npm/node_modules/playwright");
const { chromium, webkit, devices } = require(PW);
let URL = process.argv[2] || "http://127.0.0.1:8793/";
URL += (URL.includes("?") ? "&" : "?") + "test";
const OUT = process.env.OUT || path.join(__dirname, "shots-cam"), TMP = path.join(__dirname, "out", "video-cam");
fs.mkdirSync(OUT, { recursive: true }); fs.mkdirSync(TMP, { recursive: true });
for (const f of fs.readdirSync(TMP)) fs.unlinkSync(path.join(TMP, f));
const T = 30000, sleep = ms => new Promise(r => setTimeout(r, ms));
const info = p => p.evaluate(() => window.JPT.info());

(async () => {
  const bA = await chromium.launch(), bB = await webkit.launch();
  const ctxA = await bA.newContext({ viewport: { width: 1280, height: 720 }, recordVideo: { dir: TMP, size: { width: 1280, height: 720 } } });
  const ctxB = await bB.newContext({ ...devices["iPhone 13"], viewport: { width: 390, height: 844 }, recordVideo: { dir: TMP, size: { width: 390, height: 844 } } });
  const A = await ctxA.newPage(), B = await ctxB.newPage();
  await A.goto(URL); await A.waitForSelector("#setup:not([hidden])", { timeout: T });
  await A.fill("#nameX", "Mark"); await A.fill("#nameO", "Radka");
  await A.click('#starterSeg button[data-v="x"]'); await A.click("#setupSubmit");
  await A.waitForSelector("#share:not([hidden])", { timeout: T });
  const link = (await A.evaluate(() => location.href)).replace(/\?test/, "");
  await A.click("#backBtn");
  await B.goto(link.replace("#", "?test#")); await B.waitForSelector("#intro:not([hidden])", { timeout: T });
  await B.click("#acceptBtn"); await B.waitForSelector("#hud:not([hidden])", { timeout: T });
  await A.waitForFunction(() => document.title.startsWith("Jsi na tahu"), null, { timeout: T });
  await sleep(1800);

  for (let turn = 0; turn < 3; turn++) {
    const ia = await info(A); if (ia.ph === "end") break;
    const P = ia.p === "x" ? A : B, O = ia.p === "x" ? B : A;
    await P.waitForFunction(() => document.title.startsWith("Jsi na tahu"), null, { timeout: T });
    await sleep(900);
    const best = await P.evaluate(() => window.JPT.best(6000)), [sx, sy] = await P.evaluate(() => window.JPT.sling());
    await P.mouse.move(sx, sy); await P.mouse.down();
    for (let i = 1; i <= 14; i++) { await P.mouse.move(sx + best.dx * i / 14, sy + best.dy * i / 14); await sleep(70); }
    await sleep(300); await P.mouse.up();
    if (turn === 2 && O === B) {
      // iPhone sleduje třetí výstřel a za letu převezme kameru: pinch, tažení, pak tlačítko přehledu
      await B.waitForFunction(() => window.JPT.info().replay, null, { timeout: 30000, polling: 30 }); await sleep(650);
      await B.evaluate(() => {
        const c = document.getElementById("stage"), w = innerWidth, h = innerHeight;
        const ev = (t, id, x, y) => c.dispatchEvent(new PointerEvent(t, { pointerId: id, clientX: x, clientY: y, bubbles: true, pointerType: "touch", isPrimary: id === 21 }));
        ev("pointerdown", 21, w * 0.40, h * 0.40); ev("pointerdown", 22, w * 0.60, h * 0.40);
        let i = 0; const iv = setInterval(() => { i++; ev("pointermove", 21, w * 0.40 + i * 5, h * 0.40); ev("pointermove", 22, w * 0.60 - i * 5, h * 0.40); if (i >= 14) { clearInterval(iv); ev("pointerup", 21, 0, 0); ev("pointerup", 22, 0, 0); } }, 30);
      });
      await sleep(1300);
      if (await B.evaluate(() => window.JPT.cam().user)) await B.click("#viewBtn");   // tlačítko vrátí automatiku, kamera se plynule vrátí k ježkovi
    }
    await P.waitForFunction(n => { const i = window.JPT.info(); return i.n > n && !i.busy && !i.acting; }, ia.n, { timeout: 60000 });
    await O.waitForFunction(n => { const i = window.JPT.info(); return i.n > n && !i.replay; }, ia.n, { timeout: 60000 });
    await sleep(1600);
    const ip = await info(P);
    if (ip.ph === "end") break;
    if (ip.ph === "pick") {
      await P.waitForSelector("#pickBox:not([hidden])", { timeout: T }); await sleep(1400);
      const avail = (await info(P)).pl[ia.p === "x" ? "o" : "x"];
      await P.click('#kinds [data-k="' + (avail.includes("b") ? "b" : avail[0]) + '"]'); await P.click("#sendBtn");
    }
    await O.waitForFunction(() => { const i = window.JPT.info(); return i.ph === "aim" && !i.replay && i.me === i.p; }, null, { timeout: 60000 });
    await sleep(1800);
  }
  const vA = await A.video().path(), vB = await B.video().path();
  await ctxA.close(); await ctxB.close(); await bA.close(); await bB.close();
  // přepis na menší webm (VP9); GIF=1 navíc udělá GIF
  const outs = [[vB, "kamera-iphone-vyska"], [vA, "kamera-desktop"]];
  for (const [src, name] of outs) {
    const dst = path.join(OUT, name + ".webm");
    const r = cp.spawnSync("ffmpeg", ["-y", "-v", "error", "-i", src, "-c:v", "libvpx-vp9", "-crf", "40", "-b:v", "0", "-r", "30", "-an", dst]);
    if (r.status !== 0) fs.copyFileSync(src, dst);
    console.log("video", dst, (fs.statSync(dst).size / 1024).toFixed(0) + " kB");
    if (process.env.GIF) cp.spawnSync("ffmpeg", ["-y", "-v", "error", "-i", dst, "-vf", "fps=12,scale=" + (name.includes("iphone") ? "280:-1" : "640:-1") + ":flags=lanczos,split[a][b];[a]palettegen[p];[b][p]paletteuse", path.join(OUT, name + ".gif")]);
  }
})().catch(e => { console.error(e); process.exit(2); });
