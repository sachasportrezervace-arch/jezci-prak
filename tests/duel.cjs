// Celá partie ve 2 nezávislých prohlížečích: Chromium (Pixel 7 na výšku) a WebKit (iPhone 13 na šířku).
// node tests/duel.cjs [URL]   (výchozí http://127.0.0.1:8793/)
// Výstřel = skutečné tažení myší po plátně; úhel a sílu vybere JPT.best() (jen s ?test) z mřížky simulací.
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
const hash = p => p.evaluate(() => JSON.stringify(window.JPT && window.JPT.info() && window.JPT.info().n) + "|" + document.title);

(async () => {
  const bA = await chromium.launch(), bB = await webkit.launch();
  const iphoneL = { ...devices["iPhone 13 landscape"] };
  const A = await (await bA.newContext({ ...devices["Pixel 7"] })).newPage();
  const B = await (await bB.newContext(iphoneL)).newPage();
  const errs = [];
  for (const [n, p] of [["A", A], ["B", B]]) p.on("pageerror", e => errs.push(n + ": " + e.message));
  const shot = (p, n) => p.screenshot({ path: path.join(SHOTS, n + ".png") });

  // 1) Mark založí výzvu
  await A.goto(URL);
  await A.waitForSelector("#setup:not([hidden])", { timeout: T });
  await shot(A, "01-zalozeni");
  await A.fill("#nameX", "Mark"); await A.fill("#nameO", "Radka");
  await A.selectOption("#stakeSel", "1");
  await A.click('#starterSeg button[data-v="x"]');
  await A.click("#setupSubmit");
  await A.waitForSelector("#share:not([hidden])", { timeout: T });
  const link = (await A.evaluate(() => location.href)).replace(/\?test/, "");
  const msg = await A.inputValue("#msg");
  check("výzva: odkaz #r.<id> a zpráva se jménem a sázkou", /#r\.[0-9a-z]{12}$/.test(link) && msg.includes("Mark tě vyzývá na Ježkomet") && msg.includes("platí kafe") && msg.includes(link), link);
  await shot(A, "02-sdileni");
  await A.click("#backBtn");
  await A.waitForSelector("#hud:not([hidden])", { timeout: T });

  // 2) Radka otevře odkaz ve WebKitu a přijme
  const linkT = link.replace("#", "?test#");
  await B.goto(linkT);
  await B.waitForSelector("#intro:not([hidden])", { timeout: T });
  const introT = await B.locator("#introTitle").innerText();
  check("výzva u Radky: jméno vyzyvatele a sázka", introT.includes("Mark tě vyzývá") && (await B.locator("#introMeta").innerText()).includes("platí kafe"), introT);
  await shot(B, "03-vyzva-radka");
  await B.click("#acceptBtn");
  await B.waitForSelector("#hud:not([hidden])", { timeout: T });
  check("Radka hraje za Sovičky (o)", (await info(B)).me === "o");
  for (const p of [A, B]) await p.evaluate(() => { window.JPT.speed = 3; });

  // 3) partie
  await A.waitForFunction(() => document.title.startsWith("Jsi na tahu"), null, { timeout: T });
  check("Mark je na tahu, Radka čeká", (await B.title()) === "Ježkomet");
  await shot(A, "04-na-tahu-mark");
  let turns = 0, sawReplay = false, sawBuild = false, syncOk = true, buildSynced = true;
  const pages = { x: A, y: B };
  while (turns < 40) {
    const ia = await info(A);
    if (ia.ph === "end") break;
    const P = ia.p === "x" ? A : B, O = ia.p === "x" ? B : A, nm = ia.p === "x" ? "Mark" : "Radka";
    await P.waitForFunction(() => document.title.startsWith("Jsi na tahu"), null, { timeout: T });
    const best = await P.evaluate(() => window.JPT.best(6000));
    const box = await P.locator("#stage").boundingBox();
    const sx = box.x + box.width * 0.5, sy = box.y + box.height * 0.45;
    await P.mouse.move(sx, sy); await P.mouse.down();
    for (let i = 1; i <= 6; i++) await P.mouse.move(sx + best.dx * i / 6, sy + best.dy * i / 6);
    if (turns === 0) { await P.waitForTimeout(150); await shot(P, "05-miri"); check("náhled dráhy: měřič síly a úhlu", /Síla \d+ %/.test(await P.locator("#meter").innerText())); }
    await P.mouse.up();
    const n0 = ia.n;
    // u soupeře proběhne přehrání výstřelu
    const seen = await O.waitForFunction(() => window.JPT.info().replay, null, { timeout: 60000, polling: 50 }).then(() => true, () => false);
    sawReplay = sawReplay || seen;
    if (turns === 0) { await O.waitForTimeout(500); await shot(O, "06-prehrani-u-soupere"); }
    await P.waitForFunction(n => { const i = window.JPT.info(); return i.n > n && !i.busy && !i.acting; }, n0, { timeout: 60000 });
    let ip = await info(P);
    await O.waitForFunction(n => { const i = window.JPT.info(); return i.n >= n && !i.replay; }, ip.n, { timeout: 60000 });
    const same1 = await A.evaluate(() => JSON.stringify(window.JPT.info().alive)) === await B.evaluate(() => JSON.stringify(window.JPT.info().alive));
    syncOk = syncOk && same1;
    console.log(`  tah ${turns + 1}: ${nm} trefil ${best.ko} → stav ${JSON.stringify(ip.alive)}${same1 ? "" : " NESHODA"}`);
    if (ip.ph === "end") break;
    // stavba
    await P.waitForSelector("#buildBox:not([hidden])", { timeout: T });
    if (!sawBuild) { await shot(P, "07-stavba"); sawBuild = true; }
    await P.click(`#kinds [data-k="${["sB", "wP", "gP"][turns % 3]}"]`);
    await P.click("#dropBtn");
    await P.waitForFunction(n => { const i = window.JPT.info(); return i.n > n && !i.busy && !i.acting; }, ip.n, { timeout: 60000 });
    ip = await info(P);
    await O.waitForFunction(n => { const i = window.JPT.info(); return i.n >= n && !i.replay; }, ip.n, { timeout: 60000 });
    const bodiesA = await A.evaluate(() => window.JPT.info().n), bodiesB = await B.evaluate(() => window.JPT.info().n);
    buildSynced = buildSynced && bodiesA === bodiesB;
    turns++;
  }
  check("výstřel se u soupeře přehrál z klíčových snímků", sawReplay);
  check("fáze stavby proběhla a předala tah", sawBuild && buildSynced);
  check("oba prohlížeče mají po každém tahu stejné počty postaviček", syncOk);
  const fa = await info(A), fb = await info(B);
  check("partie skončila výhrou", fa.ph === "end" && !!fa.win && fb.ph === "end" && fb.win === fa.win, `vítěz ${fa.win} po ${turns + 1} tazích`);
  await A.waitForSelector("#endBox:not([hidden])", { timeout: T }); await B.waitForSelector("#endBox:not([hidden])", { timeout: T });
  const W_ = fa.win === "x" ? A : B, L_ = fa.win === "x" ? B : A;
  const tW = await W_.locator("#endTitle").innerText(), tL = await L_.locator("#endTitle").innerText();
  check("konec: vítěz vidí výhru, poražený jméno vítěze, sázka", tW.startsWith("Vyhráváš") && tL.includes("vyhrává") && /kafe/i.test(await L_.locator("#endStake").innerText()), `${tW} / ${tL}`);
  const ser = await A.locator("#endSeries").innerText();
  check("skóre série 1 : 0 pro vítěze", fa.win === "x" ? ser === "Mark 1 : 0 Radka" : ser === "Mark 0 : 1 Radka", ser);
  await shot(W_, "08-vyhra"); await shot(L_, "09-prohra");

  // 4) odveta: poražený začíná, skóre série se přenese
  await W_.click("#endPrimary");
  await W_.waitForFunction(() => window.JPT.info().ph === "aim" && window.JPT.info().n === 0, null, { timeout: T });
  await L_.waitForFunction(() => window.JPT.info().ph === "aim" && window.JPT.info().n === 0, null, { timeout: T });
  const ra = await info(A), rb = await info(B);
  check("odveta: nová partie u obou, začíná poražený", ra.p === other(fa.win) && rb.p === ra.p && ra.alive.x === 3 && ra.alive.o === 3);
  check("odveta: série se přenesla", JSON.stringify(ra.w) === JSON.stringify(rb.w) && ra.w[fa.win === "x" ? 0 : 1] === 1, JSON.stringify(ra.w));
  await L_.waitForFunction(() => document.title.startsWith("Jsi na tahu"), null, { timeout: T });
  check("v odvetě je na tahu poražený", true);
  const sc = await A.locator("#score").innerText();
  check("HUD ukazuje skóre série", sc.replace(/\s/g, "") === (fa.win === "x" ? "1:0" : "0:1"), sc);
  await shot(L_, "10-odveta");

  // 5) přihlížející s omezeným pohybem (prefers-reduced-motion)
  const bC = await chromium.launch();
  const C = await (await bC.newContext({ ...devices["Pixel 7"], reducedMotion: "reduce" })).newPage();
  C.on("pageerror", e => errs.push("C: " + e.message));
  await C.goto(linkT); await C.waitForSelector("#hud:not([hidden])", { timeout: T });
  const ic = await info(C);
  check("přihlížející (reduced motion) vidí partii bez židle", ic.me === null && ic.n === 0 && /míří/.test(await C.locator("#status").innerText()));
  await shot(C, "11-prihlizejici");
  await bC.close();

  // 6) obnovení stránky: stav zůstane
  await B.reload(); await B.waitForSelector("#hud:not([hidden])", { timeout: T });
  check("po obnovení stránky WebKit pozná svou stranu", (await info(B)).me === "o");

  check("žádné chyby v konzoli stránky", errs.length === 0, errs.slice(0, 3).join(" | "));
  console.log(`\n${pass} PASS, ${fail} FAIL`);
  await bA.close(); await bB.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
function other(p) { return p === "x" ? "o" : "x"; }
