// Napojení Ježkometu na místnost Herny (protokol 1, react-apps/HERNA-PROTOKOL.md) ve 2 nezávislých prohlížečích:
// Chromium desktop 1366×820 (Mark, sedadlo 0) a WebKit iPhone 13 390×844 (Radka, sedadlo 1). Hra běží v iframe pod lištou 48 px
// v maketě rodiče (Herna), která sbírá postMessage zprávy od svého iframe.
//   node tests/herna.cjs [URL]      (výchozí http://127.0.0.1:8823/)
// Ověřuje: ohlášení <meta name="herna-protokol">, oba sednou bez výzvy a setupu (zaklada=1 založí, zaklada=0 čeká a sedne),
// sedadlo → tým a jméno, skryté sdílení / „Zkusit sám“ / „Nová hra“, zakladatel čeká na soupeře, synchronní výstřel,
// zprávy pripraveno → stav ceka/hraje/konec → vysledek (jednou na okno, stejný klíč partie, vitez = sedadlo), odveta = nová partie,
// reload bez nového zápisu, „Jiná hra“ → jina-hra, zakládá sedadlo 1, bez #herna hra beze změny, žádné chyby stránky.
const path = require("path");
const PW = process.env.PW || path.join(process.env.APPDATA || "", "npm/node_modules/playwright");
const { chromium, webkit, devices } = require(PW);
const BASE = process.argv[2] || "http://127.0.0.1:8823/";
const GAME = BASE + (BASE.includes("?") ? "&" : "?") + "test";
const SHOTS = process.env.SHOTS || path.join(__dirname, "shots-herna");
require("fs").mkdirSync(SHOTS, { recursive: true });
// rodič na stejném originu jako hra (jako živá Herna na github.io); stránku podstrčí page.route, na server nejde
const PARENT = new URL("__herna-rodic.html", BASE).href;
const NAMES = ["Mark", "Radka Ž, ň"];   // čárka a diakritika: každé jméno přes encodeURIComponent

let pass = 0, fail = 0;
function check(name, ok, extra = "") {
  if (ok) pass++; else fail++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  (" + extra + ")" : ""}`);
}
const T = 30000;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const rid = n => Array.from({ length: n }, () => "0123456789abcdefghijklmnopqrstuvwxyz"[Math.floor(Math.random() * 36)]).join("");
const hernaUrl = (r, seat, zaklada, m = "test000000") => `${GAME}#herna=1&m=${m}&r=${r}&seat=${seat}&names=${NAMES.map(encodeURIComponent).join(",")}&zaklada=${zaklada}`;
const doc = async r => { const res = await fetch(`https://mantledb.sh/v2/jezkomet-${r}/hra`, { cache: "no-store" }); return res.status === 404 ? null : res.json(); };
const PARENT_HTML = `<!doctype html><html lang="cs"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<style>html,body{margin:0;height:100%;background:#16202b;overflow:hidden}#bar{height:48px;background:#22303f;color:#fff;font:600 15px system-ui;display:flex;align-items:center;padding:0 12px}
iframe{position:absolute;top:48px;left:0;width:100%;height:calc(100% - 48px);border:0}</style></head>
<body><div id="bar">Herna · maketa rodiče</div><script>
window.__m = [];
addEventListener("message", e => {
  const f = document.querySelector("iframe");
  if (!f || e.source !== f.contentWindow) return;
  const z = e.data;
  if (!z || typeof z !== "object" || z.herna !== 1 || typeof z.typ !== "string") return;
  __m.push(JSON.parse(JSON.stringify(z)));
});
window.openGame = u => {
  const old = document.querySelector("iframe"); if (old) old.remove();
  __m = [];
  const f = document.createElement("iframe");
  f.setAttribute("allow", "clipboard-read; clipboard-write; fullscreen; autoplay");
  f.src = u; document.body.appendChild(f);
};
</script></body></html>`;

(async () => {
  // meta řádek tak, jak ho čte Herna (mistnost.js umiProtokol)
  const html = await (await fetch(BASE, { cache: "no-store" })).text();
  check("index.html ohlašuje <meta name=\"herna-protokol\" content=\"1\">", /<meta[^>]+name=["']herna-protokol["'][^>]*content=["']1["']/i.test(html));

  const bA = await chromium.launch(), bB = await webkit.launch();
  const SEED = +process.env.DUEL_SEED || 4283902645;   // stejný pevný seed první partie jako duel.cjs (král nepadne 1. ranou)
  const ctxA = await bA.newContext({ viewport: { width: 1366, height: 820 } });
  await ctxA.addInitScript(sd => {
    if (!/[?&]test/.test(location.search)) return;
    const real = crypto.getRandomValues.bind(crypto); let used = false;
    crypto.getRandomValues = arr => { if (!used && arr instanceof Uint32Array && arr.length === 1) { used = true; arr[0] = sd; return arr; } return real(arr); };
  }, SEED);
  const ctxB = await bB.newContext({ ...devices["iPhone 13"], viewport: { width: 390, height: 844 } });
  const errs = [];
  for (const ctx of [ctxA, ctxB]) await ctx.route(PARENT, r => r.fulfill({ contentType: "text/html; charset=utf-8", body: PARENT_HTML }));
  const A = await ctxA.newPage(), B = await ctxB.newPage();
  for (const [n, p] of [["A", A], ["B", B]]) {
    p.on("pageerror", e => errs.push(n + ": " + e.message));
    p.on("dialog", d => d.accept());
  }
  const shot = (p, n) => p.screenshot({ path: path.join(SHOTS, n + ".png") }).catch(() => {});
  async function open(p, url) {
    if (!p.url().startsWith(PARENT)) await p.goto(PARENT);
    await p.evaluate(u => window.openGame(u), url);
    const el = await p.waitForSelector("iframe");
    const f = await el.contentFrame();
    await f.waitForFunction(() => window.JPT && document.readyState !== "loading", null, { timeout: T });
    return f;
  }
  const msgs = p => p.evaluate(() => window.__m.slice());
  const info = f => f.evaluate(() => window.JPT.info());
  const vis = (f, sel) => f.$eval(sel, e => !e.hidden && e.getClientRects().length > 0 && getComputedStyle(e).visibility !== "hidden").catch(() => false);
  const inPlay = f => f.waitForFunction(() => { const i = window.JPT.info(); return i && i.view === "play" && !!i.me; }, null, { timeout: T, polling: 100 });
  const stavy = ms => ms.filter(m => m.typ === "stav").map(m => m.faze);
  const results = ms => ms.filter(m => m.typ === "vysledek");
  const hideBanner = async f => { if (await vis(f, "#banner")) await f.click("#banner").catch(() => {}); };
  const settleCam = f => f.waitForFunction(() => { const c = window.JPT.cam(); return Math.abs(c.x - c.home.x) < 12 && Math.abs(c.s - c.home.s) < 0.03 && !c.user; }, null, { timeout: 9000, polling: 100 }).catch(() => {});
  async function shoot(P, fP, fO) {
    await fP.waitForFunction(() => document.title.startsWith("Jsi na tahu"), null, { timeout: T });
    await hideBanner(fP); await settleCam(fP);
    const i0 = await info(fP);
    const best = await fP.evaluate(() => window.JPT.best(4500));
    const [sx0, sy0] = await fP.evaluate(() => window.JPT.sling());
    const r = await P.$eval("iframe", e => { const b = e.getBoundingClientRect(); return [b.left, b.top]; });
    const sx = sx0 + r[0], sy = sy0 + r[1];
    await P.mouse.move(sx, sy); await P.mouse.down();
    for (let i = 1; i <= 6; i++) await P.mouse.move(sx + best.dx * i / 6, sy + best.dy * i / 6);
    await P.mouse.up();
    await fP.waitForFunction(n => { const i = window.JPT.info(); return i.n > n && !i.busy && !i.acting; }, i0.n, { timeout: 90000, polling: 50 });
    await fO.waitForFunction(n => { const i = window.JPT.info(); return i.n > n && !i.replay; }, i0.n, { timeout: 90000, polling: 50 });
    return i0;
  }
  async function resign(f) {
    await hideBanner(f);
    await f.waitForFunction(() => { const i = window.JPT.info(); return !i.acting && !i.busy && !i.replay; }, null, { timeout: T });
    await f.click("#menuBtn");
    await f.click("#mResign");
  }
  const endBoth = (fa, fb) => Promise.all([fa, fb].map(f => f.waitForFunction(() => { const i = window.JPT.info(); return i.ph === "end" && !i.replay && !i.acting && !document.getElementById("endBox").hidden; }, null, { timeout: T, polling: 100 })));
  const vysledekBoth = (n) => Promise.all([A, B].map(p => p.waitForFunction(n => window.__m.filter(m => m.typ === "vysledek").length >= n, n, { timeout: T, polling: 100 })));

  // ---------- 1. Radka (sedadlo 1, zaklada=0) otevře hru dřív, než existuje ----------
  const r1 = "t" + rid(11);
  const fB = await open(B, hernaUrl(r1, 1, 0));
  await fB.waitForFunction(() => /Čeká se, až hra naskočí/.test(document.getElementById("infoTitle").textContent), null, { timeout: T });
  await sleep(1500);
  check("zaklada=0: „Čeká se, až hra naskočí“ a dotazování (dokument zatím není)", await vis(fB, "#info") && !(await doc(r1)));
  check("zaklada=0: žádná výzva, setup ani sdílení", !(await vis(fB, "#intro")) && !(await vis(fB, "#setup")) && !(await vis(fB, "#share")) && !(await vis(fB, "#soloBtn")));
  let mB = await msgs(B);
  check("B: první zpráva pripraveno, pak stav ceka", mB[0] && mB[0].typ === "pripraveno" && stavy(mB)[0] === "ceka", JSON.stringify(mB));
  await shot(B, "1-radka-ceka");

  // ---------- 2. Mark (sedadlo 0, zaklada=1) založí, oba sednou bez výzvy ----------
  const fA = await open(A, hernaUrl(r1, 0, 1));
  await Promise.all([inPlay(fA), inPlay(fB)]);
  let iA = await info(fA), iB = await info(fB);
  const d1 = await doc(r1);
  check("zaklada=1 založil dokument jezkomet-<r>/hra se jmény z names", !!d1 && d1.app === "jezkomet" && d1.g.x === NAMES[0] && d1.g.o === NAMES[1], d1 && `${d1.g.x} / ${d1.g.o}`);
  check("obě místa obsazená tokeny zařízení (různými)", !!d1 && !!d1.sx && !!d1.so && d1.sx !== d1.so);
  check("sedadlo 0 = tým x (Mark), sedadlo 1 = tým o (Radka)", iA.me === "x" && iB.me === "o");
  check("jména v HUD podle names", (await fA.textContent("#nmX")) === NAMES[0] && (await fB.textContent("#nmO")) === NAMES[1]);
  check("oba hrají bez výzvy (#intro, #setup, #share skryté)", !(await vis(fA, "#intro")) && !(await vis(fB, "#intro")) && !(await vis(fA, "#share")) && !(await vis(fA, "#setup")) && !(await vis(fB, "#setup")));
  check("první partie: v2, tah 0, seed z ostré hry", iA.rv === 2 && iA.n === 0 && iA.ph === "t" && iA.sd === iB.sd && iA.map === iB.map && iA.md === iB.md, `mapa ${iA.map}, modifikátor ${iA.md || "–"}, začíná ${iA.p}`);
  await Promise.all([A, B].map(p => p.waitForFunction(() => { const s = window.__m.filter(m => m.typ === "stav"); return s.length && s[s.length - 1].faze === "hraje"; }, null, { timeout: T, polling: 100 })));
  let mA = await msgs(A); mB = await msgs(B);
  check("A: pripraveno → stav ceka → hraje", mA[0].typ === "pripraveno" && stavy(mA).join(",") === "ceka,hraje", JSON.stringify(mA));
  check("B: stav ceka → hraje", stavy(mB).join(",") === "ceka,hraje", stavy(mB).join(","));
  check("zprávy mají herna: 1", [...mA, ...mB].every(m => m.herna === 1));
  // skryté odkazy ven
  await hideBanner(fA);
  await fA.click("#menuBtn");
  check("nabídka: bez „Zkopírovat odkaz“ a „Nová hra s někým jiným“, „Vzdát partii“ zůstává", !(await vis(fA, "#mCopy")) && !(await vis(fA, "#mNew")) && await vis(fA, "#mResign"));
  await shot(A, "2-mark-nabidka");
  await fA.click("#menuSheet [data-close]");
  check("čekací box bez „Zkopírovat odkaz“", !(await vis(fA, "#waitCopy")) && !(await vis(fB, "#waitCopy")));
  await shot(A, "2-mark-hra"); await shot(B, "2-radka-hra");

  // ---------- 3. výstřel: oba vidí totéž ----------
  const P = iA.p === "x" ? A : B, fP = iA.p === "x" ? fA : fB, fO = iA.p === "x" ? fB : fA;
  await shoot(P, fP, fO);
  iA = await info(fA); iB = await info(fB);
  check("výstřel v Herně: oba prohlížeče mají stejný stav", iA.units === iB.units && iA.bodies === iB.bodies && iA.n === iB.n && iA.ph === iB.ph, `n ${iA.n}, ${iA.units}`);
  check("během partie žádný vysledek", !results(await msgs(A)).length && !results(await msgs(B)).length);

  // ---------- 4. Mark se vzdá: vysledek vitez 1, jednou na okno, stejný klíč ----------
  await resign(fA);
  await endBoth(fA, fB);
  await vysledekBoth(1);
  await sleep(1200);
  mA = await msgs(A); mB = await msgs(B);
  let vA = results(mA), vB = results(mB);
  const p1 = vA[0] && vA[0].partie;
  check("konec partie: jeden vysledek na okno", vA.length === 1 && vB.length === 1, `${vA.length} / ${vB.length}`);
  check("vysledek: stejný klíč partie v obou oknech, tvar <r>:<id>", !!p1 && p1 === vB[0].partie && p1.startsWith(r1 + ":") && p1.length <= 48, p1);
  check("vysledek: vitez = sedadlo 1 (Mark se vzdal)", vA[0].vitez === 1 && vB[0].vitez === 1);
  check("stav konec před výsledkem", stavy(mA).slice(-1)[0] === "konec" && stavy(mB).slice(-1)[0] === "konec");
  check("konec: „Odveta“ + „Jiná hra“", (await fA.textContent("#endSecondary")) === "Jiná hra" && (await fB.textContent("#endSecondary")) === "Jiná hra" && await vis(fB, "#endPrimary"));
  await shot(A, "4-mark-konec"); await shot(B, "4-radka-konec");

  // ---------- 5. odveta: nová partie, stav hraje ----------
  const id1 = (await info(fA)).sd;
  await fB.click("#endPrimary");
  await Promise.all([fA, fB].map(f => f.waitForFunction(sd => { const i = window.JPT.info(); return i.ph === "t" && i.n === 0 && i.sd !== sd; }, id1, { timeout: T, polling: 100 })));
  await Promise.all([A, B].map(p => p.waitForFunction(() => { const s = window.__m.filter(m => m.typ === "stav"); return s[s.length - 1].faze === "hraje"; }, null, { timeout: T, polling: 100 })));
  iA = await info(fA);
  check("odveta: nová partie oběma, série 0:1, stav hraje", iA.w[0] === 0 && iA.w[1] === 1 && (await info(fB)).sd === iA.sd, `série ${iA.w.join(":")}`);

  // ---------- 6. reload Markova rámu: sedne zpátky bez zápisu ----------
  const vBefore = (await doc(r1)).v;
  await fA.evaluate(() => location.reload());
  await sleep(500);
  await fA.waitForFunction(() => window.JPT && window.JPT.info() && window.JPT.info().view === "play", null, { timeout: T, polling: 100 });
  const vAfter = (await doc(r1)).v;
  iA = await info(fA);
  check("reload v Herně: zpátky za Marka (x), bez výzvy a bez nového zápisu", iA.me === "x" && !(await vis(fA, "#intro")) && vAfter === vBefore, `v ${vBefore} → ${vAfter}`);
  await A.waitForFunction(() => window.__m.filter(m => m.typ === "stav").slice(-1)[0]?.faze === "hraje", null, { timeout: T, polling: 100 });

  // ---------- 7. Radka se vzdá: vitez 0, nový klíč ----------
  await resign(fB);
  await endBoth(fA, fB);
  await vysledekBoth(2);
  await sleep(1200);
  mA = await msgs(A); mB = await msgs(B); vA = results(mA); vB = results(mB);
  check("2. partie: vitez = sedadlo 0, jiný klíč než 1. partie, stejný v obou oknech",
    vA.length === 2 && vB.length === 2 && vA[1].vitez === 0 && vB[1].vitez === 0 && vA[1].partie === vB[1].partie && vA[1].partie !== p1, `${vA.map(v => v.partie + "→" + v.vitez)} | ${vB.map(v => v.partie + "→" + v.vitez)}`);

  // ---------- 8. Jiná hra ----------
  await fB.click("#endSecondary");
  await B.waitForFunction(() => window.__m.some(m => m.typ === "jina-hra"), null, { timeout: 5000 }).catch(() => {});
  mB = await msgs(B);
  check("„Jiná hra“ pošle jina-hra", mB.slice(-1)[0] && mB.slice(-1)[0].typ === "jina-hra", JSON.stringify(mB.slice(-1)));

  // ---------- 9. zakládá sedadlo 1, Mark přijde až za chvíli ----------
  const r2 = "t" + rid(13);
  const fB2 = await open(B, hernaUrl(r2, 1, 1));
  await inPlay(fB2);
  await sleep(2500);
  const iB2 = await info(fB2), d2 = await doc(r2);
  check("sedadlo 1 zakládá: dokument má x = names[0], o = names[1], Radka sedí na o", !!d2 && d2.g.x === NAMES[0] && d2.g.o === NAMES[1] && !!d2.so && !d2.sx && iB2.me === "o");
  const waitTxt = await fB2.textContent("#waitText").catch(() => "");
  check("zakladatel čeká na soupeře: box „Čeká se, až si Mark sedne ke hře.“, nemíří", await vis(fB2, "#waitBox") && /Čeká se, až si Mark sedne ke hře/.test(waitTxt) && !(await vis(fB2, "#waitCopy")) && !(await fB2.title()).startsWith("Jsi na tahu"), waitTxt);
  check("zakladatel čeká: stav ceka, žádné hraje", stavy(await msgs(B)).join(",") === "ceka", stavy(await msgs(B)).join(","));
  await shot(B, "9-radka-zaklada-ceka");
  const fA2 = await open(A, hernaUrl(r2, 0, 0));
  await inPlay(fA2);
  await B.waitForFunction(() => window.__m.filter(m => m.typ === "stav").slice(-1)[0]?.faze === "hraje", null, { timeout: T, polling: 100 });
  const d2b = await doc(r2);
  check("Mark (zaklada=0) si sedl na x, Radce se odemkla hra", (await info(fA2)).me === "x" && !!d2b.sx && d2b.sx !== d2b.so && !(await vis(fB2, "#waitBox")));
  await resign(fB2);
  await endBoth(fA2, fB2);
  await vysledekBoth(1);
  await sleep(1000);
  const vA2 = results(await msgs(A)), vB2 = results(await msgs(B));
  check("zakládá sedadlo 1: vitez stále podle sedadla (0 = Mark)", vA2.length === 1 && vB2.length === 1 && vA2[0].vitez === 0 && vB2[0].vitez === 0 && vA2[0].partie === vB2[0].partie && vA2[0].partie.startsWith(r2 + ":"));

  // ---------- 10. bez #herna beze změny ----------
  const C = await ctxA.newPage();
  C.on("pageerror", e => errs.push("C: " + e.message));
  await C.goto(GAME);
  await C.waitForFunction(() => window.JPT && !document.getElementById("setup").hidden, null, { timeout: T });
  check("bez #herna: setup se „Zkusit sám“, JPT.herna() = null", await vis(C, "#setup") && await vis(C, "#soloBtn") && (await C.evaluate(() => window.JPT.herna())) === null);
  await C.goto(GAME.replace("?test", "?test&x=1") + "#herna=1&r=SPATNE!&seat=0&names=a,b&zaklada=1");
  await C.waitForFunction(() => window.JPT && !document.getElementById("setup").hidden, null, { timeout: T });
  check("neplatné #herna (r) = hra jako dřív (setup)", await vis(C, "#setup") && (await C.evaluate(() => window.JPT.herna())) === null);
  // hra mimo iframe s #herna (ruční test z protokolu): běží, nic neposílá rodiči (sama sobě)
  const r3 = "t" + rid(11);
  await C.goto(hernaUrl(r3, 0, 1));
  await C.waitForFunction(() => window.JPT && window.JPT.info() && window.JPT.info().view === "play", null, { timeout: T, polling: 100 });
  const h3 = await C.evaluate(() => window.JPT.herna());
  check("#herna bez rodiče: hra běží, zprávy jen v logu (window.parent === window)", !!h3 && h3.team === "x" && h3.log[0].typ === "pripraveno");
  // stará hra v iframe bez #herna: rodič nedostane nic
  await open(A, GAME);
  await sleep(2500);
  check("hra v iframe bez #herna neposílá žádné zprávy", (await msgs(A)).length === 0);

  check("žádné chyby stránky", errs.length === 0, errs.join(" | "));
  await bA.close(); await bB.close();
  console.log(`\n${pass} PASS, ${fail} FAIL  (místnosti ${r1}, ${r2}, ${r3})`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error("CHYBA TESTU:", e); process.exit(2); });
