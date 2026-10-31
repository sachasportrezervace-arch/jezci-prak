// Celá partie ve 2 nezávislých prohlížečích: Chromium na desktopu (1366×820, myš) a WebKit s emulací iPhonu 13
// (na výšku, od 2. tahu na šířku). Navíc kamera (posun, pinch, kolečko, celá scéna), fullscreen / „Přidat na plochu“,
// rozvržení desktop vs. mobil, přihlížející s prefers-reduced-motion.
// node tests/duel.cjs [URL]   (výchozí http://127.0.0.1:8793/)
// Výstřel = skutečné tažení myší od praku; úhel a sílu vybere JPT.best() (jen s ?test) z mřížky simulací.
const path = require("path");
const PW = process.env.PW || path.join(process.env.APPDATA || "", "npm/node_modules/playwright");
const { chromium, webkit, devices } = require(PW);
let URL = process.argv[2] || "http://127.0.0.1:8793/";
URL += (URL.includes("?") ? "&" : "?") + "test";
const SHOTS = process.env.SHOTS || path.join(__dirname, "shots");
require("fs").mkdirSync(SHOTS, { recursive: true });

let pass = 0, fail = 0;
function check(name, ok, extra = "") {
  if (ok) pass++; else fail++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  (" + extra + ")" : ""}`);
}
const T = 25000;
const info = p => p.evaluate(() => window.JPT && window.JPT.info());
const camOf = p => p.evaluate(() => window.JPT.cam());
const other = p => p === "x" ? "o" : "x";

(async () => {
  const bA = await chromium.launch(), bB = await webkit.launch();
  const A = await (await bA.newContext({ viewport: { width: 1366, height: 820 } })).newPage();
  const ctxB = await bB.newContext({ ...devices["iPhone 13"] });
  const B = await ctxB.newPage();
  const errs = [];
  for (const [n, p] of [["A", A], ["B", B]]) p.on("pageerror", e => errs.push(n + ": " + e.message));
  const shot = (p, n) => p.screenshot({ path: path.join(SHOTS, n + ".png") });

  // 1) Mark (desktop) založí výzvu
  await A.goto(URL);
  await A.waitForSelector("#setup:not([hidden])", { timeout: T });
  await shot(A, "01-zalozeni-desktop");
  await A.fill("#nameX", "Mark"); await A.fill("#nameO", "Radka");
  await A.selectOption("#stakeSel", "1");
  await A.click('#starterSeg button[data-v="x"]');
  await A.click("#setupSubmit");
  await A.waitForSelector("#share:not([hidden])", { timeout: T });
  const link = (await A.evaluate(() => location.href)).replace(/\?test/, "");
  const msg = await A.inputValue("#msg");
  check("výzva: odkaz #r.<id> a zpráva se jménem a sázkou", /#r\.[0-9a-z]{12}$/.test(link) && msg.includes("Mark tě vyzývá na Ježkomet") && msg.includes("platí kafe") && msg.includes(link), link);
  await A.click("#backBtn");
  await A.waitForSelector("#hud:not([hidden])", { timeout: T });

  // 2) Radka (iPhone, WebKit) otevře odkaz a přijme
  const linkT = link.replace("#", "?test#");
  await B.goto(linkT);
  await B.waitForSelector("#intro:not([hidden])", { timeout: T });
  const introT = await B.locator("#introTitle").innerText();
  check("výzva u Radky: jméno vyzyvatele a sázka", introT.includes("Mark tě vyzývá") && (await B.locator("#introMeta").innerText()).includes("platí kafe"), introT);
  await shot(B, "02-vyzva-iphone");
  await B.click("#acceptBtn");
  await B.waitForSelector("#hud:not([hidden])", { timeout: T });
  check("Radka hraje za Sovičky (o)", (await info(B)).me === "o");
  await A.waitForFunction(() => document.title.startsWith("Jsi na tahu"), null, { timeout: T });

  // 3) rozvržení a kamera
  const ca = await camOf(A), cb = await camOf(B);
  check("desktop: výchozí pohled = celá scéna", Math.abs(ca.s - ca.full) < 0.01, `s ${ca.s.toFixed(3)} / celá ${ca.full.toFixed(3)}`);
  check("iPhone na výšku: výchozí pohled přiblížený (scéna širší než displej)", cb.s > cb.full * 1.3, `s ${cb.s.toFixed(3)} / celá ${cb.full.toFixed(3)}`);
  const lblVis = await A.locator("#viewLbl").isVisible(), lblB = await B.locator("#viewLbl").isVisible();
  const toolsA = await A.locator(".tools").boundingBox(), toolsB = await B.locator(".tools").boundingBox();
  check("desktop: nástroje s popisky v řadě dole, mobil: ikony ve sloupci nahoře", lblVis && !lblB && toolsA.width > toolsA.height && toolsA.y > 700 && toolsB.height > toolsB.width && toolsB.y < 120);
  const hB = await B.$$eval(".tools .btn, #endPrimary, #dropBtn", els => els.filter(e => e.offsetParent).map(e => Math.round(e.getBoundingClientRect().height)));
  check("mobil: dotykové cíle aspoň 44 px", hB.length >= 4 && hB.every(h => h >= 44), hB.join(","));
  const fsA = await A.evaluate(() => getComputedStyle(document.querySelector(".plate .nm")).fontSize), fsB = await B.evaluate(() => getComputedStyle(document.querySelector(".plate .nm")).fontSize);
  check("desktop má větší HUD než mobil (vlastní rozvržení)", parseFloat(fsA) > parseFloat(fsB), `${fsA} vs ${fsB}`);
  await shot(A, "03-desktop-na-tahu"); await shot(B, "04-iphone-vyska-ceka");

  // posun tažením mimo prak (iPhone)
  const vb = B.viewportSize();
  await B.mouse.move(vb.width * 0.5, vb.height * 0.3); await B.mouse.down();
  for (let i = 1; i <= 5; i++) await B.mouse.move(vb.width * 0.5 - i * 30, vb.height * 0.3);
  await B.mouse.up();
  const cb2 = await camOf(B);
  check("iPhone: posun tažením mimo prak", cb2.user && cb2.x > cb.x + 100, `x ${cb.x.toFixed(0)} → ${cb2.x.toFixed(0)}`);
  // pinch dvěma prsty (syntetické pointer události)
  await B.evaluate(({ w, h }) => {
    const c = document.getElementById("stage");
    const ev = (t, id, x) => c.dispatchEvent(new PointerEvent(t, { pointerId: id, clientX: x, clientY: h * 0.35, bubbles: true, pointerType: "touch", isPrimary: id === 11 }));
    ev("pointerdown", 11, w * 0.45); ev("pointerdown", 12, w * 0.55);
    for (let i = 1; i <= 6; i++) { ev("pointermove", 11, w * 0.45 + i * 5); ev("pointermove", 12, w * 0.55 - i * 5); }
    ev("pointerup", 11, w * 0.45 + 30); ev("pointerup", 12, w * 0.55 - 30);
  }, { w: vb.width, h: vb.height });
  const cb3 = await camOf(B);
  check("iPhone: pinch oddálí scénu", cb3.s < cb2.s * 0.85, `s ${cb2.s.toFixed(3)} → ${cb3.s.toFixed(3)}`);
  await B.click("#viewBtn");
  const cb4 = await camOf(B);
  check("iPhone: lupa přepíná celou scénu / přiblížení", Math.abs(cb4.s - cb4.full) < 0.01 || cb4.s > cb3.s, `s ${cb4.s.toFixed(3)}`);
  // kolečko myši + celá scéna (desktop)
  await A.mouse.move(683, 400); await A.mouse.wheel(0, -400); await A.waitForTimeout(100);
  const ca2 = await camOf(A);
  check("desktop: kolečko myši přiblíží", ca2.s > ca.s * 1.3, `s ${ca.s.toFixed(3)} → ${ca2.s.toFixed(3)}`);
  await A.click("#viewBtn");
  const ca3 = await camOf(A);
  check("desktop: tlačítko Celá scéna oddálí", Math.abs(ca3.s - ca3.full) < 0.01, `s ${ca3.s.toFixed(3)}`);
  // fullscreen: Chromium skutečně, iPhone nápověda Přidat na plochu
  await A.click("#fsBtn"); await A.waitForTimeout(400);
  const fs1 = (await camOf(A)).fs;
  await A.click("#fsBtn"); await A.waitForTimeout(400);
  const fs2 = (await camOf(A)).fs;
  check("desktop: fullscreen tlačítko zapne a vypne celou obrazovku", fs1 && !fs2, `${fs1} → ${fs2}`);
  await B.click("#fsBtn");
  const a2hs = await B.locator("#a2hsSheet").isVisible();
  check("iPhone: fullscreen tlačítko ukáže návod Přidat na plochu", a2hs && /Přidat na plochu/.test(await B.locator("#a2hsSheet").innerText()));
  await shot(B, "05-iphone-pridat-na-plochu");
  await B.click("#a2hsSheet [data-close]");
  const man = await A.evaluate(async () => (await fetch("manifest.webmanifest")).json());
  check("manifest: display standalone + ikony", man.display === "standalone" && man.icons.length >= 2);

  // 4) partie
  for (const p of [A, B]) await p.evaluate(() => { window.JPT.speed = 3; });
  let turns = 0, sawReplay = false, sawBuild = false, syncOk = true, follow = null, landscape = false;
  while (turns < 40) {
    const ia = await info(A);
    if (ia.ph === "end") break;
    if (turns === 1 && !landscape) {
      landscape = true;
      await B.setViewportSize({ width: 844, height: 390 });
      await B.waitForTimeout(300);
      const cl = await camOf(B);
      check("iPhone na šířku: celá scéna, nástroje vpravo", Math.abs(cl.s - cl.full) < 0.05 || cl.user, `s ${cl.s.toFixed(3)}`);
      await shot(B, "06-iphone-sirka");
    }
    const P = ia.p === "x" ? A : B, O = ia.p === "x" ? B : A, nm = ia.p === "x" ? "Mark" : "Radka";
    await P.waitForFunction(() => document.title.startsWith("Jsi na tahu"), null, { timeout: T });
    const best = await P.evaluate(() => window.JPT.best(6000));
    const [sx, sy] = await P.evaluate(() => window.JPT.sling());
    const s0 = await camOf(P);
    await P.mouse.move(sx, sy); await P.mouse.down();
    for (let i = 1; i <= 6; i++) await P.mouse.move(sx + best.dx * i / 6, sy + best.dy * i / 6);
    if (turns === 0) { await P.waitForTimeout(150); await shot(P, "07-miri-desktop"); check("náhled dráhy: měřič síly a úhlu", /Síla \d+ %/.test(await P.locator("#meter").innerText())); }
    await P.mouse.up();
    if (P === A && follow === null) {
      await A.waitForTimeout(500);
      const cf = await camOf(A);
      follow = cf.s > s0.s * 1.15 || Math.abs(cf.x - s0.x) > 40;
      check("kamera při výstřelu sleduje ježka", follow, `s ${s0.s.toFixed(2)} → ${cf.s.toFixed(2)}, x ${s0.x.toFixed(0)} → ${cf.x.toFixed(0)}`);
    }
    const n0 = ia.n;
    const seen = await O.waitForFunction(() => window.JPT.info().replay, null, { timeout: 60000, polling: 50 }).then(() => true, () => false);
    sawReplay = sawReplay || seen;
    if (turns === 0) { await O.waitForTimeout(600); await shot(O, "08-prehrani-iphone"); }
    await P.waitForFunction(n => { const i = window.JPT.info(); return i.n > n && !i.busy && !i.acting; }, n0, { timeout: 60000 });
    let ip = await info(P);
    await O.waitForFunction(n => { const i = window.JPT.info(); return i.n >= n && !i.replay; }, ip.n, { timeout: 60000 });
    const same1 = await A.evaluate(() => JSON.stringify(window.JPT.info().alive)) === await B.evaluate(() => JSON.stringify(window.JPT.info().alive));
    syncOk = syncOk && same1;
    console.log(`  tah ${turns + 1}: ${nm} trefil ${best.ko} → stav ${JSON.stringify(ip.alive)}${same1 ? "" : " NESHODA"}`);
    if (ip.ph === "end") break;
    await P.waitForSelector("#buildBox:not([hidden])", { timeout: T });
    if (!sawBuild || (P === B && turns < 2)) await shot(P, `09-stavba-${P === A ? "desktop" : "iphone"}-${turns}`);
    if (!sawBuild && P === A) {
      const bb = await A.locator("#buildBox").boundingBox();
      check("desktop: panel stavby vpravo uprostřed", bb.x > 900 && bb.y > 100 && bb.y + bb.height < 760, JSON.stringify(bb));
    }
    sawBuild = true;
    await P.click(`#kinds [data-k="${["sB", "wP", "gP"][turns % 3]}"]`);
    await P.click("#dropBtn");
    await P.waitForFunction(n => { const i = window.JPT.info(); return i.n > n && !i.busy && !i.acting; }, ip.n, { timeout: 60000 });
    ip = await info(P);
    await O.waitForFunction(n => { const i = window.JPT.info(); return i.n >= n && !i.replay; }, ip.n, { timeout: 60000 });
    turns++;
  }
  check("výstřel se u soupeře přehrál z klíčových snímků", sawReplay);
  check("fáze stavby proběhla a předala tah", sawBuild);
  check("oba prohlížeče mají po každém tahu stejné počty postaviček", syncOk);
  const fa = await info(A), fb = await info(B);
  check("partie skončila výhrou", fa.ph === "end" && !!fa.win && fb.ph === "end" && fb.win === fa.win, `vítěz ${fa.win} po ${turns + 1} tazích`);
  await A.waitForSelector("#endBox:not([hidden])", { timeout: T }); await B.waitForSelector("#endBox:not([hidden])", { timeout: T });
  const W_ = fa.win === "x" ? A : B, L_ = fa.win === "x" ? B : A;
  const tW = await W_.locator("#endTitle").innerText(), tL = await L_.locator("#endTitle").innerText();
  check("konec: vítěz vidí výhru, poražený jméno vítěze, sázka", tW.startsWith("Vyhráváš") && tL.includes("vyhrává") && /kafe/i.test(await L_.locator("#endStake").innerText()), `${tW} / ${tL}`);
  const ser = await A.locator("#endSeries").innerText();
  check("skóre série 1 : 0 pro vítěze", fa.win === "x" ? ser === "Mark 1 : 0 Radka" : ser === "Mark 0 : 1 Radka", ser);
  await shot(A, "10-konec-desktop"); await shot(B, "11-konec-iphone");

  // 5) odveta
  await W_.click("#endPrimary");
  await W_.waitForFunction(() => window.JPT.info().ph === "aim" && window.JPT.info().n === 0, null, { timeout: T });
  await L_.waitForFunction(() => window.JPT.info().ph === "aim" && window.JPT.info().n === 0, null, { timeout: T });
  const ra = await info(A), rb = await info(B);
  check("odveta: nová partie u obou, začíná poražený", ra.p === other(fa.win) && rb.p === ra.p && ra.alive.x === 3 && ra.alive.o === 3);
  check("odveta: série se přenesla", JSON.stringify(ra.w) === JSON.stringify(rb.w) && ra.w[fa.win === "x" ? 0 : 1] === 1, JSON.stringify(ra.w));
  await L_.waitForFunction(() => document.title.startsWith("Jsi na tahu"), null, { timeout: T });
  const sc = await A.locator("#score").innerText();
  check("HUD ukazuje skóre série", sc.replace(/\s/g, "") === (fa.win === "x" ? "1:0" : "0:1"), sc);

  // 6) přihlížející s omezeným pohybem
  const bC = await chromium.launch();
  const C = await (await bC.newContext({ ...devices["Pixel 7"], reducedMotion: "reduce" })).newPage();
  C.on("pageerror", e => errs.push("C: " + e.message));
  await C.goto(linkT); await C.waitForSelector("#hud:not([hidden])", { timeout: T });
  const ic = await info(C);
  check("přihlížející (reduced motion) vidí partii bez židle", ic.me === null && ic.n === 0 && /míří/.test(await C.locator("#status").innerText()));
  await bC.close();

  // 7) obnovení stránky a návrat na výšku
  await B.setViewportSize({ width: 390, height: 664 });
  await B.reload(); await B.waitForSelector("#hud:not([hidden])", { timeout: T });
  check("po obnovení stránky WebKit pozná svou stranu", (await info(B)).me === "o");

  check("žádné chyby v konzoli stránky", errs.length === 0, errs.slice(0, 3).join(" | "));
  console.log(`\n${pass} PASS, ${fail} FAIL`);
  await bA.close(); await bB.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
