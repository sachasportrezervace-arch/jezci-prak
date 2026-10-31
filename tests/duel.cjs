// E2E Ježkomet v2: celá partie ve 2 nezávislých prohlížečích (Chromium desktop 1366×820 s myší a klávesnicí, WebKit iPhone 13
// na výšku 390×844 s dotykem), pak odveta se sérií, přihlížející s prefers-reduced-motion, reload uprostřed partie
// a dokument ve staré verzi (v1).
//   node tests/duel.cjs [URL]      (výchozí http://127.0.0.1:8793/)
// Co se ověřuje (podrobně v jednotlivých oddílech níže):
//   výzva a přijetí · karta partie a modifikátor · rozvržení, kamera, fullscreen · 1. tah bez stavby · výstřel tažením myší ·
//   twist (střelec vybírá ježka soupeři, ruka) · stavba od 2. tahu (klávesy Q/E/R/Enter, dotyk, neplatné místo, na výšku i na šířku) ·
//   „dvakrát po sobě“ a ježek zůstane v ruce (výběr se přeskočí) · schopnosti jednotek (engine v obou prohlížečích + události z partie) ·
//   HUD (lišta krále, pastilky, číslo tahu) po každém tahu · konec králem / po 8. tahu · odveta (série, nový seed, titul) ·
//   vzdání · přihlížející · reload · starý dokument v1 · žádné chyby stránky.
// Výstřel = skutečné tažení myší od praku; úhel a sílu vybere JPT.best() (jen s ?test) z mřížky simulací.
// Co se v partii nestane samo (např. comeback, schopnost), se nehlásí jako PASS, ale jako NEOVĚŘENO.
const path = require("path");
const PW = process.env.PW || path.join(process.env.APPDATA || "", "npm/node_modules/playwright");
const { chromium, webkit, devices } = require(PW);
let URL = process.argv[2] || "http://127.0.0.1:8793/";
URL += (URL.includes("?") ? "&" : "?") + "test";
const SHOTS = process.env.SHOTS || path.join(__dirname, "shots-duel");
require("fs").mkdirSync(SHOTS, { recursive: true });

let pass = 0, fail = 0;
const unverified = [];
function check(name, ok, extra = "") {
  if (ok) pass++; else fail++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  (" + extra + ")" : ""}`);
}
function soft(name, why) { unverified.push(name); console.log(`NEOVĚŘENO  ${name}  (${why})`); }
const T = 25000;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const info = p => p.evaluate(() => window.JPT && window.JPT.info());
const camOf = p => p.evaluate(() => window.JPT.cam());
const other = p => p === "x" ? "o" : "x";
const MAPN = { h: "Kopec", u: "Údolí s jezírkem", p: "Plošiny", s: "Skála" };
const HOGN = { n: "Obyčejný", k: "Kamenný", g: "Gumový", b: "Bouchací", s: "Špičák" };
const modName = i => !i.md ? "Klidný den" : i.md === "v" ? `Vítr ${Math.abs(i.wd)}` : { n: "Noc", i: "Mráz", g: "Lehká gravitace" }[i.md];
const MODHINT = { "": /Bez zvláštních podmínek/, v: /Fouká vítr/, n: /Noc:/, i: /Mráz:/, g: /Lehká gravitace:/ };
const rectsOf = (p, sels) => p.evaluate(sels => Object.fromEntries(sels.map(q => {
  const e = document.querySelector(q);
  if (!e || e.hidden) return [q, null];
  const b = e.getBoundingClientRect(), cs = getComputedStyle(e);
  return [q, b.width && cs.display !== "none" && cs.visibility !== "hidden" ? { l: b.left, t: b.top, r: b.right, b: b.bottom, w: b.width, h: b.height } : null];
})), sels);
const hit = (a, b, m = 0) => !!a && !!b && a.l < b.r - m && a.r > b.l + m && a.t < b.b - m && a.b > b.t + m;
const ghostRect = p => p.evaluate(() => {
  const g = window.JPT.ghost(); if (!g) return null;
  const d = JP.pieceDims(g.kind, g.rot), s = window.JPT.cam().s, [x, y] = g.screen;
  return { l: x - d.w * s / 2, r: x + d.w * s / 2, t: y - d.h * s / 2, b: y + d.h * s / 2, ok: g.ok, kind: g.kind, rot: g.rot, why: g.why };
});

(async () => {
  const bA = await chromium.launch(), bB = await webkit.launch();
  // Seed první partie je ve hře náhodný (crypto). Aby test nezávisel na tom, jestli padne partie s krále zabitým 1. ranou
  // (to je pravidlo hry, ne chyba), zakladatel dostane pevný seed (DUEL_SEED=náhodný vypne). Odveta už seed losuje normálně.
  const SEED = process.env.DUEL_SEED === "random" ? 0 : (+process.env.DUEL_SEED || 4283902645);
  const ctxA = await bA.newContext({ viewport: { width: 1366, height: 820 } });
  if (SEED) await ctxA.addInitScript(sd => {
    const real = crypto.getRandomValues.bind(crypto); let used = false;
    crypto.getRandomValues = arr => { if (!used && arr instanceof Uint32Array && arr.length === 1) { used = true; arr[0] = sd; return arr; } return real(arr); };
  }, SEED);
  const A = await ctxA.newPage();
  // iPhone 13 na výšku: 390×844 (celá obrazovka v PWA), BH=664 simuluje Safari s lištami
  const BH = +process.env.BH || 844;
  const B = await (await bB.newContext({ ...devices["iPhone 13"], viewport: { width: 390, height: BH } })).newPage();
  const errs = [];
  for (const [n, p] of [["A", A], ["B", B]]) { p.on("pageerror", e => errs.push(n + ": " + e.message)); p.on("dialog", d => d.accept()); }
  const shot = (p, n) => p.screenshot({ path: path.join(SHOTS, n + ".png") });
  const hideBanner = async p => { if (await p.locator("#banner").isVisible()) await p.click("#banner").catch(() => {}); };
  const vwOf = p => p.viewportSize();

  // ---------- pomocné akce ----------
  // klidná kamera na výchozím pohledu (po dopadu se vrací plynule)
  const camWait = (p, expr, ms = 6000) => p.waitForFunction(`(${expr})(window.JPT.cam())`, null, { timeout: ms, polling: 100 }).catch(() => {});
  const settleCam = p => p.waitForFunction(() => { const c = window.JPT.cam(); return Math.abs(c.x - c.home.x) < 12 && Math.abs(c.s - c.home.s) < 0.03 && !c.user; }, null, { timeout: 9000, polling: 100 }).catch(() => {});
  // stav HUD po tahu: lišta krále, pastilky, číslo tahu odpovídají stavu hry
  async function hudBad(p) {
    await sleep(350);
    return p.evaluate(() => {
      const i = window.JPT.info(), bad = [];
      for (const t of ["x", "o"]) {
        const T_ = t.toUpperCase(), kn = document.getElementById("kbn" + T_).textContent, w = document.getElementById("kb" + T_).style.width;
        if (kn !== String(Math.round(i.king[t]))) bad.push(`král ${t}: ${kn} / ${Math.round(i.king[t])}`);
        const want = Math.max(0, Math.min(100, i.king[t] / 70 * 100));
        if (Math.abs(parseFloat(w) - want) > 1) bad.push(`lišta ${t}: ${w} / ${want.toFixed(1)} %`);
        const out = document.querySelectorAll(`#pills${T_} .pill.out`).length;
        if (out !== 6 - i.alive[t]) bad.push(`pastilky ${t}: ${out} venku / ${6 - i.alive[t]} padlých`);
      }
      const tn = document.getElementById("turnNo").textContent, want = i.ph === "end" ? "Konec" : `Tah ${Math.min(8, Math.floor(i.n / 2) + 1)}/8`;
      if (tn !== want) bad.push(`číslo tahu: „${tn}“ / „${want}“`);
      return bad;
    });
  }
  const evCounts = {};   // typy událostí ze všech akcí partie (z dokumentu)
  const countEv = i => { if (i.lastAct && i.lastAct.ev) for (const e of i.lastAct.ev.split("|")) { const k = e.split(".")[0]; if (k) evCounts[k] = (evCounts[k] || 0) + 1; } if (i.lastAct && i.lastAct.hl) evCounts.hl = (evCounts.hl || 0) + 1; };
  const pouch = [];
  let syncOk = true, hudProblems = [], kingHits = 0, hudChecks = 0, kingBarChecked = 0, actions = 0, cbSeen = 0, cbOk = true;
  // po každé akci: oba prohlížeče mají stejný stav, HUD sedí, sledují se zásahy krále a comeback
  async function afterAction(i0, P, tag) {
    const [ia, ib] = [await info(A), await info(B)];
    const same = ia.units === ib.units && ia.bodies === ib.bodies && ia.n === ib.n && ia.ph === ib.ph && ia.p === ib.p && JSON.stringify(ia.hd) === JSON.stringify(ib.hd) && JSON.stringify(ia.bs) === JSON.stringify(ib.bs) && JSON.stringify(ia.lb) === JSON.stringify(ib.lb);
    syncOk = syncOk && same;
    if (!same) console.log(`  NESHODA po ${tag}: A ${ia.units} n${ia.n} ${ia.ph} | B ${ib.units} n${ib.n} ${ib.ph}`);
    countEv(ia);
    actions++;
    const hit_ = ia.king.x < i0.king.x - 0.5 || ia.king.o < i0.king.o - 0.5;
    for (const [nm, p] of [["A", A], ["B", B]]) {
      const bad = await hudBad(p); hudChecks++;
      if (bad.length) hudProblems.push(`${tag}/${nm}: ${bad.join("; ")}`);
    }
    if (hit_) { kingHits++; kingBarChecked++; }
    if (ia.lastAct && ia.lastAct.cb) {
      cbSeen++;
      const q = ia.lastAct.cb, okBs = ia.bs[q] === i0.bs[q] + 1 && ia.cb[q] === 1 && ia.lb[q] === 0;
      const txt = await (q === "x" ? A : B).locator("#notice").innerText().catch(() => ""), txt2 = await (q === "x" ? B : A).locator("#notice").innerText().catch(() => "");
      const noteOk = /Prohráváš: máš jednu stavbu navíc/.test(txt) && /prohrává a dostává jednu stavbu navíc/.test(txt2);
      cbOk = cbOk && okBs && noteOk;
      console.log(`  comeback pro ${q}: stavby ${i0.bs[q]} → ${ia.bs[q]}, hlášky ${noteOk ? "ano" : "NE: „" + txt + "“ / „" + txt2 + "“"}`);
    }
    console.log(`  tah ${actions}: ${tag} → králové ${Math.round(ia.king.x)}:${Math.round(ia.king.o)}, jednotky ${ia.alive.x}:${ia.alive.o}, stavby ${ia.bs.x}:${ia.bs.o}, ruka ${ia.hd.x || "–"}:${ia.hd.o || "–"}${same ? "" : "  NESHODA"}`);
    return ia;
  }
  // výstřel tažením myší od praku; vrací, až oba klienti mají nový stav (soupeř dopřehrál)
  async function shoot(P, O, tag, o = {}) {
    await P.waitForFunction(() => document.title.startsWith("Jsi na tahu"), null, { timeout: T });
    await hideBanner(P);
    await settleCam(P);
    const i0 = await info(P);
    if (o.before) await o.before(i0);
    const best = await P.evaluate(() => window.JPT.best(4500));
    const [sx, sy] = await P.evaluate(() => window.JPT.sling());
    await P.mouse.move(sx, sy); await P.mouse.down();
    for (let i = 1; i <= 6; i++) await P.mouse.move(sx + best.dx * i / 6, sy + best.dy * i / 6);
    // napnutý ježek v praku nesmí zajet pod lištu tahu (dock je přes plátno)
    {
      const pr = await P.evaluate(([dx, dy]) => {
        const d = Math.hypot(dx, dy) || 1, mp = Math.max(90, Math.min(210, Math.min(innerWidth, innerHeight) * 0.34)), pow = Math.min(1, d / mp), c = window.JPT.cam();
        const sl = JP.SLING[window.JPT.info().me], [px, py] = window.JPT.proj(sl.x + dx / d * pow * 70, sl.y + dy / d * pow * 70), k = document.getElementById("dock").getBoundingClientRect(), r = 17 * c.s;
        const under = !document.getElementById("dock").hidden && px + r > k.left && px - r < k.right && py + r > k.top && py - r < k.bottom;
        return { under, px: Math.round(px), py: Math.round(py), dock: [k.left, k.top, k.right, k.bottom].map(Math.round) };
      }, [best.dx, best.dy]);
      pouch.push(pr);
      if (pr.under) console.log(`  ježek v praku je pod lištou: ${tag}, pouzdro ${pr.px},${pr.py}, lišta ${pr.dock}`);
    }
    if (o.meter) { await P.waitForTimeout(150); await shot(P, o.meter); check("náhled dráhy: měřič síly a úhlu", /Síla \d+ %/.test(await P.locator("#meter").innerText())); }
    await P.mouse.up();
    const seenP = O.waitForFunction(() => window.JPT.info().replay, null, { timeout: 30000, polling: 40 }).then(() => true, () => false);
    if (o.during) await o.during(i0);
    const seen = await seenP;
    if (o.replay) await o.replay(seen);
    await P.waitForFunction(n => { const i = window.JPT.info(); return i.n > n && !i.busy && !i.acting; }, i0.n, { timeout: 90000, polling: 50 });
    await O.waitForFunction(n => { const i = window.JPT.info(); return i.n > n && !i.replay; }, i0.n, { timeout: 90000, polling: 50 });
    const ia = await afterAction(i0, P, tag);
    return { i0, best, seenReplay: seen, ia };
  }
  // výběr ježka pro soupeře (po výstřelu): vrací, až soupeř ježka drží v ruce
  async function pickHog(P, O, want, tag, o = {}) {
    await P.waitForSelector("#pickRow:not([hidden])", { timeout: T });
    const sel = await P.$$eval("#kinds [data-k]", els => els.map(e => ({ k: e.dataset.k, dis: e.disabled })));
    const pl = (await info(P)).pl[other((await info(P)).me)];
    if (o.shot) await shot(P, o.shot);
    if (o.checks) await o.checks(sel, pl);
    await P.click(`#kinds [data-k="${want}"]`);
    const note = await P.locator("#pickNote").innerText(), btn = await P.locator("#sendBtn").innerText();
    check(`${tag}: výběr ukáže popis a tlačítko „Poslat: ${HOGN[want]}“`, note.startsWith(HOGN[want] + ":") && btn === `Poslat: ${HOGN[want]}`, `${note} | ${btn}`);
    await P.click("#sendBtn");
    await P.waitForFunction(() => { const i = window.JPT.info(); return i.ph !== "pick" && !i.busy; }, null, { timeout: 60000, polling: 50 });
    const meI = await info(P);
    await O.waitForFunction(w => { const i = window.JPT.info(); return i.ph === "t" && !i.replay && i.hd[i.p] === w; }, want, { timeout: 60000, polling: 50 });
    return meI;
  }
  // stavba (A: klávesy Q/E/R/Enter, B: dotyk); vrací, až oba klienti mají nový stav
  async function buildAct(P, O, tag, o) {
    await P.waitForFunction(() => document.title.startsWith("Jsi na tahu"), null, { timeout: T });
    await hideBanner(P);
    await settleCam(P);
    const i0 = await info(P);
    if (o.before) await o.before(i0);
    const bodies0 = i0.bodies;
    if (o.keys) { await P.keyboard.press("e"); } else { await P.click("#modeBuild"); }
    await P.waitForFunction(() => window.JPT.info().mode === "build" && window.JPT.ghost(), null, { timeout: 8000 });
    await sleep(o.keys ? 1700 : 1300);
    if (o.afterOn) await o.afterOn(i0);
    await P.evaluate(() => document.activeElement && document.activeElement.blur());
    if (o.keys) await P.keyboard.press("Enter"); else await P.click("#placeBtn");
    const seenP = O.waitForFunction(() => window.JPT.info().replay, null, { timeout: 30000, polling: 40 }).then(() => true, () => false);
    if (o.during) await o.during(i0);
    const seen = await seenP;
    await P.waitForFunction(n => { const i = window.JPT.info(); return i.n > n && !i.busy && !i.acting; }, i0.n, { timeout: 90000, polling: 50 });
    await O.waitForFunction(n => { const i = window.JPT.info(); return i.n > n && !i.replay; }, i0.n, { timeout: 90000, polling: 50 });
    const ia = await afterAction(i0, P, tag);
    return { i0, ia, seenReplay: seen, bodies0 };
  }
  async function docOf(p) {
    return p.evaluate(async () => {
      const id = location.hash.replace(/^#r\./, "");
      const r = await fetch(`https://mantledb.sh/v2/jezkomet-${id}/hra`, { cache: "no-store" }), txt = await r.text(), d = JSON.parse(txt);
      return { rv: d.g.rv, sd: d.g.sd, n: d.g.n, h: (d.g.h || []).length, size: txt.length, bodies: JP.unpackBodies(d.g.b) };
    });
  }

  // ===== 1) Mark (desktop) založí výzvu =====
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
  check("výzva: odkaz #r.<id> a zpráva se jménem, sázkou a králem", /#r\.[0-9a-z]{12}$/.test(link) && msg.includes("Mark tě vyzývá na Ježkomet") && msg.includes("platí kafe") && msg.includes("krále") && msg.includes(link), link);
  await A.click("#backBtn");
  await A.waitForSelector("#hud:not([hidden])", { timeout: T });

  // partie v2 u zakladatele: pevnosti ze seedu, král + 5 jednotek na straně, zásoba staveb
  const i1 = await info(A);
  check("nová partie je v2: 6 postaviček na straně (král + 5), králové 70, stavby 3 : 4, ruka jen u prvního (obyčejný)", i1.rv === 2 && !i1.old && i1.n === 0 && i1.ph === "t" && i1.p === "x" && i1.me === "x" && i1.alive.x === 6 && i1.alive.o === 6 && i1.king.x === 70 && i1.king.o === 70 && i1.bs.x === 3 && i1.bs.o === 4 && i1.hd.x === "n" && i1.hd.o === "" && i1.pl.x === "kgbs" && i1.pl.o === "nkgbs", JSON.stringify({ alive: i1.alive, bs: i1.bs, hd: i1.hd, pl: i1.pl }));
  check("pevnosti: mapa z nabídky, seed, 24–80 těles", !!MAPN[i1.map] && i1.sd > 0 && i1.bodies >= 24 && i1.bodies <= 80, `mapa ${i1.map}, modifikátor „${i1.md}“, vítr ${i1.wd}, seed ${i1.sd}, těles ${i1.bodies}`);
  const doc1 = await docOf(A);
  check("dokument v mantledb: rv 2, seed a všechna tělesa pevností", doc1.rv === 2 && doc1.sd === i1.sd && doc1.bodies && doc1.bodies.length === i1.bodies, `${doc1.size} B`);
  // karta partie u zakladatele: mapa a modifikátor
  const ban = { vis: await A.locator("#banner").isVisible(), map: await A.locator("#bnMap").innerText(), mod: await A.locator("#bnMod").innerText(), st: await A.locator("#bnStart").innerText() };
  check("karta partie u zakladatele: mapa, modifikátor a kdo začíná odpovídají stavu hry", ban.vis && ban.map === MAPN[i1.map] && ban.mod === modName(i1) && ban.st === "Začíná Mark.", JSON.stringify(ban));
  await shot(A, "02-karta-partie-desktop");
  const chipVis = await A.locator("#modChip").isVisible(), chipTxt = chipVis ? await A.locator("#modLbl").innerText() : "";
  check("#modChip: skrytý bez modifikátoru, jinak s jeho názvem a ikonou", chipVis === !!i1.md && (!i1.md || (chipTxt === modName(i1) && (await A.locator("#modChip").getAttribute("data-m")) === i1.md)), `md „${i1.md}“, chip „${chipTxt}“`);
  await A.click("#banner");
  check("karta partie se zavře klepnutím", !(await A.locator("#banner").isVisible()));

  // ===== 2) Radka (iPhone, WebKit) otevře odkaz a přijme =====
  const linkT = link.replace("#", "?test#");
  await B.goto(linkT);
  await B.waitForSelector("#intro:not([hidden])", { timeout: T });
  const introT = await B.locator("#introTitle").innerText(), introM = await B.locator("#introMap").innerText();
  check("výzva u Radky: jméno vyzyvatele a sázka", introT.includes("Mark tě vyzývá") && (await B.locator("#introMeta").innerText()).includes("platí kafe"), introT);
  check("výzva u Radky ukazuje mapu a modifikátor (#introMap)", introM.includes(MAPN[i1.map]) && MODHINT[i1.md].test(introM), introM);
  await shot(B, "03-vyzva-iphone");
  await B.click("#acceptBtn");
  await B.waitForSelector("#hud:not([hidden])", { timeout: T });
  check("Radka hraje za Sovičky (o); kartu partie už viděla ve výzvě", (await info(B)).me === "o" && !(await B.locator("#banner").isVisible()));
  await A.waitForFunction(() => document.title.startsWith("Jsi na tahu"), null, { timeout: T });

  // ===== 3) HUD na startu, rozvržení a kamera =====
  for (const [nm, p] of [["desktop", A], ["iPhone", B]]) {
    const r = await p.evaluate(() => ({
      kn: ["X", "O"].map(t => document.getElementById("kbn" + t).textContent), lab: ["X", "O"].map(t => document.getElementById("kbar" + t).getAttribute("aria-label")),
      pills: ["X", "O"].map(t => document.querySelectorAll("#pills" + t + " .pill").length), out: document.querySelectorAll(".pill.out").length, sh: ["X", "O"].map(t => document.querySelectorAll(`#pills${t} .pill.sh`).length),
      tn: document.getElementById("turnNo").textContent, tt: ["X", "O"].map(t => !document.getElementById("tt" + t).hidden), plabel: document.getElementById("pillsX").getAttribute("aria-label"),
    }));
    check(`HUD na startu (${nm}): králové 70/70, 6 pastilek na stranu, štít jen u Štítonoše, Tah 1/8, žádné tituly`, r.kn.join() === "70,70" && r.lab[0] === "Král: 70 ze 70 životů" && r.pills.join() === "6,6" && r.out === 0 && r.sh.join() === "1,1" && r.tn === "Tah 1/8" && !r.tt[0] && !r.tt[1] && /Štítonoš 100 %/.test(r.plabel), JSON.stringify(r));
  }
  const ca = await camOf(A), cb = await camOf(B);
  check("desktop: výchozí pohled = celá scéna", Math.abs(ca.s - ca.full) < 0.01, `s ${ca.s.toFixed(3)} / celá ${ca.full.toFixed(3)}`);
  // výchozí pohled na výšku: přiblížený na pevnost a prak toho, kdo je na tahu (Radka čeká, na tahu je Mark → jeho pevnost vlevo)
  const homeB = await B.evaluate(() => { const c = window.JPT.cam(), P = window.JPT.proj; return { c, plinth: [60, 380].map(x => P(x, 850)[0]), sling: P(430, 748), ground: c.ground, vh: innerHeight, top: window.JPT.topY() }; });
  check("iPhone na výšku: výchozí záběr je přiblížený na pevnost (ne celá scéna)", homeB.c.portrait && homeB.c.s > homeB.c.full * 2.5 && Math.abs(homeB.c.s - homeB.c.homeS) < 0.01, `s ${homeB.c.s.toFixed(3)} / celá ${homeB.c.full.toFixed(3)}`);
  check("iPhone na výšku: postavička má na obrazovce ≥ 36 px", homeB.c.crit >= 36, homeB.c.crit.toFixed(1) + " px");
  check("iPhone na výšku: podstavec a prak jsou celé v záběru, pod zemí jen pruh hlíny", homeB.plinth.every(x => x > -3 && x < 387) && homeB.sling[0] < 385 && homeB.sling[0] > 20 && homeB.vh - homeB.ground < 0.16 * homeB.vh && homeB.vh - homeB.ground > 60, `podstavec ${homeB.plinth.map(v => v.toFixed(0))}, prak ${homeB.sling.map(v => v.toFixed(0))}, hlína ${(homeB.vh - homeB.ground).toFixed(0)} px`);
  const R0 = { A: await rectsOf(A, ["#plateX", "#plateO", ".mid", ".tools", "#status", "#dock", "#banner"]), B: await rectsOf(B, ["#plateX", "#plateO", ".mid", ".tools", "#status", "#dock", "#banner"]) };
  check("nástroje jsou ikony bez popisků: na desktopu zvuk, lupa, celá obrazovka a nabídka v řadě nahoře vpravo, na mobilu jen lupa a nabídka ve sloupci vpravo nahoře",
    !(await A.locator("#viewLbl").isVisible()) && !(await B.locator("#viewLbl").isVisible()) && R0.A[".tools"].w > R0.A[".tools"].h && R0.A[".tools"].t < 200 && R0.A[".tools"].r > 1366 - 40 && R0.B[".tools"].h > R0.B[".tools"].w && R0.B[".tools"].t < 130 && R0.B[".tools"].r > 390 - 20,
    `desktop ${JSON.stringify(R0.A[".tools"] && [R0.A[".tools"].l, R0.A[".tools"].t, R0.A[".tools"].w, R0.A[".tools"].h].map(Math.round))}, mobil ${JSON.stringify(R0.B[".tools"] && [R0.B[".tools"].l, R0.B[".tools"].t, R0.B[".tools"].w, R0.B[".tools"].h].map(Math.round))}`);
  check("nástroje nepřekrývají jména, lišty krále ani číslo tahu (desktop i mobil)", ["A", "B"].every(k => !hit(R0[k][".tools"], R0[k]["#plateX"]) && !hit(R0[k][".tools"], R0[k]["#plateO"]) && !hit(R0[k][".tools"], R0[k][".mid"]) && !hit(R0[k][".tools"], R0[k]["#status"])), JSON.stringify({ A: R0.A[".tools"] && Math.round(R0.A[".tools"].t), Bt: Math.round(R0.B[".tools"].t), platesBottom: Math.round(R0.B["#plateX"].b), statusTop: R0.B["#status"] && Math.round(R0.B["#status"].t) }));
  check("desktop: karta ježka a lišta tahu dole uprostřed mezi pevnostmi, mobil: přes šířku dole", R0.A["#dock"].l > 340 && R0.A["#dock"].r < 1030 && R0.A["#dock"].b <= 820 && R0.B["#dock"] === null, JSON.stringify(R0.A["#dock"]));
  const hB = await B.$$eval(".tools .btn", els => els.filter(e => e.offsetParent).map(e => Math.round(e.getBoundingClientRect().height)));
  check("mobil: vpravo jen lupa a nabídka, dotykové cíle aspoň 44 px", hB.length === 2 && hB.every(h => h >= 44), hB.join(","));
  {
    const hA = await A.$$eval(".tools .btn", els => els.filter(e => e.offsetParent).length);
    check("desktop: zvuk, lupa, celá obrazovka a nabídka nahoře vpravo", hA === 4, String(hA));
  }
  const fsA = await A.evaluate(() => getComputedStyle(document.querySelector(".plate .nm")).fontSize), fsB = await B.evaluate(() => getComputedStyle(document.querySelector(".plate .nm")).fontSize);
  check("desktop má větší HUD než mobil (vlastní rozvržení)", parseFloat(fsA) > parseFloat(fsB), `${fsA} vs ${fsB}`);
  await shot(A, "04-desktop-na-tahu"); await shot(B, "05-iphone-vyska-ceka");

  // posun tažením mimo prak (iPhone)
  const vb = B.viewportSize();
  await B.waitForTimeout(300);
  const cbz = await camOf(B);   // už je přiblíženo, je kam posouvat
  await B.mouse.move(vb.width * 0.5, vb.height * 0.3); await B.mouse.down();
  for (let i = 1; i <= 5; i++) await B.mouse.move(vb.width * 0.5 + i * 30, vb.height * 0.3);
  await B.mouse.up();
  const cb2 = await camOf(B);
  check("iPhone: posun tažením mimo prak", cb2.user && cb2.x < cbz.x - 60, `x ${cbz.x.toFixed(0)} → ${cb2.x.toFixed(0)}`);
  // pinch dvěma prsty (syntetické pointer události)
  await B.evaluate(({ w, h }) => {
    const c = document.getElementById("stage");
    const ev = (t, id, x) => c.dispatchEvent(new PointerEvent(t, { pointerId: id, clientX: x, clientY: h * 0.35, bubbles: true, pointerType: "touch", isPrimary: id === 11 }));
    ev("pointerdown", 11, w * 0.45); ev("pointerdown", 12, w * 0.55);
    for (let i = 1; i <= 6; i++) { ev("pointermove", 11, w * 0.45 + i * 5); ev("pointermove", 12, w * 0.55 - i * 5); }
    ev("pointerup", 11, w * 0.45 + 30); ev("pointerup", 12, w * 0.55 - 30);
  }, { w: vb.width, h: vb.height });
  const cb3 = await camOf(B);
  check("iPhone: pinch oddálí scénu a tlačítko nabídne návrat na hru", cb3.s < cb2.s * 0.85 && cb3.label === "Zpět na hru", `s ${cb2.s.toFixed(3)} → ${cb3.s.toFixed(3)}, „${cb3.label}“`);
  // oddáleno pinchem → lupa vrátí pevnost a prak, další klik ukáže celou scénu
  await B.click("#viewBtn"); await camWait(B, "c => !c.user && Math.abs(c.s - c.homeS) < 0.02");
  const cb4 = await camOf(B);
  check("iPhone: lupa po oddálení vrátí záběr na pevnost a prak", !cb4.user && Math.abs(cb4.s - cb4.homeS) < 0.02 && cb4.crit >= 36, `s ${cb3.s.toFixed(3)} → ${cb4.s.toFixed(3)}`);
  await B.click("#viewBtn"); await camWait(B, "c => c.user && Math.abs(c.s - c.full) < 0.02");
  const cb5 = await camOf(B);
  check("iPhone: lupa oddálí na celou scénu", cb5.user && Math.abs(cb5.s - cb5.full) < 0.02 && Math.abs(cb5.x - 700) < 80, `s ${cb5.s.toFixed(3)} / celá ${cb5.full.toFixed(3)}, x ${cb5.x.toFixed(0)}`);
  await shot(B, "06-iphone-vyska-cela-scena");
  await B.click("#viewBtn"); await camWait(B, "c => !c.user && Math.abs(c.s - c.homeS) < 0.02");
  // kolečko myši + celá scéna (desktop); karta partie je přes střed, nejdřív ji zavřít
  await hideBanner(A);
  await A.mouse.move(683, 400); await A.mouse.wheel(0, -400); await A.waitForTimeout(100);
  const ca2 = await camOf(A);
  check("desktop: kolečko myši přiblíží", ca2.s > ca.s * 1.3, `s ${ca.s.toFixed(3)} → ${ca2.s.toFixed(3)}`);
  await A.click("#viewBtn"); await A.waitForTimeout(1800);
  const ca3 = await camOf(A);
  check("desktop: tlačítko Celá scéna oddálí a vrátí automatiku", Math.abs(ca3.s - ca3.full) < 0.01 && !ca3.user, `s ${ca3.s.toFixed(3)}`);
  // fullscreen: Chromium skutečně, iPhone nápověda Přidat na plochu
  await A.click("#fsBtn"); await A.waitForTimeout(400);
  const fs1 = (await camOf(A)).fs;
  await A.click("#fsBtn"); await A.waitForTimeout(400);
  const fs2 = (await camOf(A)).fs;
  check("desktop: fullscreen tlačítko zapne a vypne celou obrazovku", fs1 && !fs2, `${fs1} → ${fs2}`);
  // na telefonu jsou zvuk a celá obrazovka v nabídce
  await B.click("#menuBtn");
  const mobMenu = { snd: await B.locator("#mSound").isVisible(), fs: await B.locator("#mFs").isVisible(), sndA: await A.locator("#mSound").isVisible() };
  check("iPhone: nabídka obsahuje Zvuk a Celou obrazovku (na desktopu ne, tam jsou nahoře)", mobMenu.snd && mobMenu.fs && !mobMenu.sndA, JSON.stringify(mobMenu));
  await B.click("#mFs");
  const a2hs = await B.locator("#a2hsSheet").isVisible();
  check("iPhone: fullscreen tlačítko ukáže návod Přidat na plochu", a2hs && /Přidat na plochu/.test(await B.locator("#a2hsSheet").innerText()));
  await shot(B, "07-iphone-pridat-na-plochu");
  await B.click("#a2hsSheet [data-close]");
  const man = await A.evaluate(async () => (await fetch("manifest.webmanifest")).json());
  check("manifest: display standalone + ikony", man.display === "standalone" && man.icons.length >= 2);
  // nápověda v2 (Jak se hraje) obsahuje pravidla v2
  await A.click("#menuBtn"); await A.click("#mHelp");
  const help = await A.locator("#helpSheet").innerText();
  check("nápověda „Jak se hraje“ popisuje král, stavbu, 5 ježků a jednotky v2", /krále/.test(help) && /třikrát za partii/.test(help) && /pěti druhů/.test(help) && /Tlusťoch/.test(help) && /Štítonoš/.test(help) && /Léčitel/.test(help) && /osmém tahu/.test(help));
  await A.click("#helpSheet [data-close]");

  // ===== 4) schopnosti jednotek na úrovni enginu (stejný scénář v Chromiu i WebKitu) =====
  // Tlusťoch odráží (r), Štítonoš ztrácí štít (z), Skokan uskakuje (j); Léčitel léčí (JP.heal). Scénář: král týmu x + jedna jednotka týmu o.
  const ABIL = () => {
    const bs = JPFort.gen(424242).bodies, out = {};
    const scene = u => bs.filter(b => (b.t === "x" && b.k === "K") || (b.t === "o" && (b.k === u || b.k === "K")));
    const find = (unit, ev) => {
      const sc = scene(unit);
      for (const hg of "nkgbs") for (const map of ["u", "h"]) for (let deg = 6; deg <= 60; deg += 3) for (const pw of [0.6, 0.7, 0.8, 0.9, 1]) {
        const s = JP.sim(sc, { env: { map, md: "", wd: 0 } }); s.launch("x", -deg * Math.PI / 180, pw, hg); while (s.step());
        if (s.result(24000).ev.split("|").some(e => e.split(".")[0] === ev)) return { hg, map, deg, pw };
      }
      return null;
    };
    out.r = find("T", "r"); out.z = find("S", "z"); out.j = find("R", "j");
    const dmg = bs.map(b => b.k === "K" && b.t === "x" ? { ...b, hp: 40 } : { ...b });
    out.heal = JP.heal(dmg, "x"); out.healHp = dmg.find(b => b.k === "K" && b.t === "x").hp;
    const L = dmg.find(b => b.k === "L" && b.t === "x"); out.healerZ = L.z;
    return out;
  };
  for (const [nm, p] of [["Chromium", A], ["WebKit", B]]) {
    const ab = await p.evaluate(`(${ABIL.toString()})()`);
    check(`schopnosti v enginu (${nm}): Tlusťoch odrazí ježka, Štítonoš ztratí štít, Skokan uskočí`, !!ab.r && !!ab.z && !!ab.j, `odraz ${JSON.stringify(ab.r)}, štít ${JSON.stringify(ab.z)}, úskok ${JSON.stringify(ab.j)}`);
    check(`léčení v enginu (${nm}): Léčitel dá králi +6 životů a ubude mu zásoba`, ab.heal.length === 1 && ab.healHp === 46 && ab.healerZ === 18, JSON.stringify({ heal: ab.heal, hp: ab.healHp, z: ab.healerZ }));
  }

  // ===== 5) partie =====
  for (const p of [A, B]) await p.evaluate(() => { window.JPT.speed = 3; });
  let camBefore = null, follow = null, flightB = null, takeover = false, sawReplay = false, pickChecked = false;
  const WANT = ["s", "b", "k", "g", "n"];
  const wantFrom = (avail, used) => WANT.find(t => avail.includes(t) && !used.has(t)) || avail[0];
  const usedHogs = new Set();
  const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

  // --- 1. akce: Mark (n = 0) – stavba je zakázaná, výstřel tažením myší ---
  await hideBanner(A);
  const modeOff = await A.getAttribute("#modeBuild", "aria-disabled"), modeTitle = await A.getAttribute("#modeBuild", "title");
  await A.click("#modeBuild", { force: true });
  const toast1 = await A.locator("#toast").innerText();
  const iAfterClick = await info(A);
  check("1. tah: Stavba je zakázaná („od 2. tahu“), klepnutí ukáže důvod a zůstane Střelba", modeOff === "true" && /2\. tahu/.test(modeTitle) && /2\. tahu/.test(toast1) && iAfterClick.mode === "shoot" && (await A.getAttribute("#modeShoot", "aria-pressed")) === "true", `${modeTitle} | ${toast1}`);
  check("1. tah: v ruce je obyčejný ježek („První výstřel.“), zbývají 3 stavby", (await A.locator("#hdName").innerText()) === "Obyčejný" && /^První výstřel\./.test(await A.locator("#hdInfo").innerText()) && (await A.locator("#buildLeft").innerText()) === "3");
  check("1. tah: u Mark je ježek v HUD u jeho jména, Radka nic nedrží", (await A.locator("#handX").isVisible()) && !(await A.locator("#handO").isVisible()));
  await shot(A, "08-prvni-tah-desktop");
  const s1 = await shoot(A, B, "Mark střílí", {
    meter: "09-miri-desktop",
    before: async () => { camBefore = await camOf(A); },
    during: async () => {
      await A.waitForTimeout(500);
      const cf = await camOf(A), s0 = camBefore;
      follow = cf.s > s0.s * 1.15 || Math.abs(cf.x - s0.x) > 40;
      check("kamera při výstřelu sleduje ježka", follow, `s ${s0.s.toFixed(2)} → ${cf.s.toFixed(2)}, x ${s0.x.toFixed(0)} → ${cf.x.toFixed(0)}`);
    },
    replay: async seen => { sawReplay = sawReplay || seen; await B.waitForTimeout(600); await shot(B, "10-prehrani-iphone"); },
  });
  check("výstřel se u soupeře přehrál z klíčových snímků", s1.seenReplay);
  const doc2 = await docOf(A);
  check("dokument po výstřelu: jedna akce v h, rv 2, do 60 kB", doc2.rv === 2 && doc2.h === 1 && doc2.n === 1 && doc2.size < 60000, `${doc2.size} B`);
  const iP1 = await info(A);
  check("po výstřelu: ježek z ruky zmizel a protože soupeř nic nedrží, vybírá střelec (ph pick, na tahu Mark)", iP1.ph === "pick" && iP1.p === "x" && iP1.hd.x === "" && iP1.hd.o === "" && !(await A.locator("#handX").isVisible()));
  // twist: Mark vybírá ježka pro Radku (#pickRow)
  usedHogs.add("n");
  const pk1 = await pickHog(A, B, "s", "pick 1 (Mark → Radka)", {
    shot: "11-vyber-jezka-desktop",
    checks: async (sel, pl) => {
      check("výběr ježka (Mark): 5 druhů n k g b s, všechny dostupné v 1. kole, tah řádek skrytý", eq(sel.map(s => s.k), ["n", "k", "g", "b", "s"]) && sel.every(s => !s.dis) && pl === "nkgbs" && !(await A.locator("#turnRow").isVisible()) && (await A.locator("#pickTitle").innerText()).includes("Radka") && (await A.locator("#pickLeft").innerText()) === "Zbývá 5 z 5 v dávce.");
      const dock = await rectsOf(A, ["#dock"]);
      check("desktop: panel výběru ježka dole uprostřed mezi pevnostmi (nezakrývá cíl)", dock["#dock"].l > 340 && dock["#dock"].r < 1030 && dock["#dock"].b <= 820, JSON.stringify(dock["#dock"]));
    },
  });
  usedHogs.add("s");
  // Radka (B) má ježka v ruce
  const iB1 = await info(B);
  const chipB = { name: await B.locator("#hdName").innerText(), info: await B.locator("#hdInfo").innerText(), alt: await B.getAttribute("#handO", "alt"), vis: await B.locator("#handO").isVisible(), visA: await A.locator("#handO").isVisible(), altA: await A.getAttribute("#handO", "alt") };
  check("twist v 1. kole: Radka má v ruce ježka, kterého jí vybral Mark (#hdName, #handO u obou, info.hd)", iB1.hd.o === "s" && iB1.hd.x === "" && iB1.p === "o" && iB1.me === "o" && chipB.name === "Špičák" && /^Od soupeře \(Mark\)\./.test(chipB.info) && chipB.vis && chipB.visA && chipB.alt === "V ruce: Špičák" && chipB.altA === "V ruce: Špičák", JSON.stringify(chipB));
  check("po výběru: v dávce pro Radku zbývají 4 druhy (bez špičáku)", iB1.pl.o === "nkgb", iB1.pl.o);
  await shot(B, "12-jezek-od-soupere-iphone");

  // --- 2. akce: Radka (n = 1) – stavba zakázaná i pro ni, výstřel, kamera na iPhonu ---
  await settleCam(B);
  const offB = await B.getAttribute("#modeBuild", "aria-disabled"), titleB = await B.getAttribute("#modeBuild", "title");
  check("1. tah Radky: Stavba je zakázaná („od 2. tahu“) i pro druhého hráče", offB === "true" && /2\. tahu/.test(titleB), titleB);
  const touchSizes = await B.$$eval(".tools .btn, #modeShoot, #modeBuild", els => els.filter(e => e.offsetParent).map(e => Math.round(e.getBoundingClientRect().height)));
  check("mobil: dotykové cíle nástrojů a přepínače Střelba / Stavba aspoň 44 px", touchSizes.length === 4 && touchSizes.every(h => h >= 44), touchSizes.join(","));
  const mB = await B.evaluate(() => {
    const box = q => { const e = document.querySelector(q); if (!e || e.hidden) return null; const b = e.getBoundingClientRect(); return b.width ? { x: b.left, y: b.top, w: b.width, h: b.height } : null; };
    return { sling: window.JPT.sling(), boxes: [".tools", "#status", "#dock", ".mid", "#plateX", "#plateO"].map(box).filter(Boolean), cam: window.JPT.cam(), vw: innerWidth };
  });
  {
    const [hx, hy] = mB.sling;
    const near = mB.boxes.some(b => hx > b.x - 24 && hx < b.x + b.w + 24 && hy > b.y - 24 && hy < b.y + b.h + 24);
    check("iPhone na výšku (Radka): ježek v praku je daleko od HUD a tlačítek a od okrajů (palec, gesta Safari; prak týmu o zrcadlově jako týmu x)", !near && hx > 24 && hx < mB.vw - 24 && hy > 250, `prak ${hx.toFixed(0)}, ${hy.toFixed(0)}`);
    check("iPhone na výšku: na tahu je pohled na vlastní pevnost a prak (kamera se vrátila)", Math.abs(mB.cam.x - mB.cam.home.x) < 25 && Math.abs(mB.cam.s - mB.cam.homeS) < 0.02, `x ${mB.cam.x.toFixed(0)} / výchozí ${mB.cam.home.x.toFixed(0)}`);
    const dockB = (await rectsOf(B, ["#dock"]))["#dock"], plinth = await B.evaluate(() => window.JPT.proj(0, 850)[1]);
    check("iPhone na výšku: lišta tahu nezakrývá podstavec ani postavičky (začíná pod podstavcem)", dockB && dockB.t >= plinth - 4, `lišta od ${dockB && dockB.t.toFixed(0)}, podstavec ${plinth.toFixed(0)}`);
    await shot(B, "13-iphone-vyska-miri");
  }
  await B.evaluate(() => { window.JPT.speed = 1; });   // kamera se měří v reálném čase, ne ve zrychlené partii
  const s2 = await shoot(B, A, "Radka střílí", {
    during: async () => {
      // plynulý let kamery na výšku: od praku střelce k pevnosti soupeře, bez skoku
      const xs = [], ss = [], ts = [], hs = [];
      for (let i = 0; i < 40; i++) { const c = await camOf(B); xs.push(c.x); ss.push(c.s); ts.push(Date.now()); hs.push(await B.evaluate(() => window.JPT.hogScreen())); await B.waitForTimeout(60); if (i === 8) await shot(B, "14-iphone-vyska-let"); }
      const hv = hs.filter(Boolean);
      const onScr = hv.filter(h => h[0] > 8 && h[0] < 382 && h[1] > 60 && h[1] < 800).length >= hv.length * 0.9, ahead = Math.max(...hv.map(h => h[0] - 195));
      check("iPhone na výšku: ježek je za letu celou dobu v záběru a kamera se dívá před něj (ve směru letu)", hv.length > 5 && onScr && ahead > 15, `ježek x ${Math.min(...hv.map(h => h[0])).toFixed(0)}–${Math.max(...hv.map(h => h[0])).toFixed(0)}, za středem až o ${ahead.toFixed(0)} px`);
      const steps = xs.slice(1).map((v, i) => Math.abs(v - xs[i]) / Math.max(1, ts[i + 1] - ts[i]) * 1000);   // rychlost kamery, jednotek světa za s (ježek letí asi 1200)
      flightB = { min: Math.min(...xs), max: Math.max(...xs), maxStep: Math.max(...steps), mid: xs.some(v => v > 450 && v < 950), sMin: Math.min(...ss), sMax: Math.max(...ss) };
      check("iPhone na výšku: zoom se za letu mění podle rychlosti a výšky", Math.max(...ss) - Math.min(...ss) > 0.03 && Math.min(...ss) < ss[0] * 0.97, `s ${Math.min(...ss).toFixed(3)}–${Math.max(...ss).toFixed(3)}`);
      check("iPhone na výšku: kamera při výstřelu plynule sleduje ježka k soupeři (bez skoku)", flightB.max - flightB.min > 600 && flightB.mid && flightB.maxStep < 2600, `x ${flightB.max.toFixed(0)} → ${flightB.min.toFixed(0)}, největší rychlost kamery ${flightB.maxStep.toFixed(0)}/s, s ${flightB.sMin.toFixed(2)}–${flightB.sMax.toFixed(2)}`);
    },
  });
  await B.evaluate(() => { window.JPT.speed = 3; });
  await B.waitForTimeout(2200);
  {
    const cd = await camOf(B);
    check("iPhone na výšku: po dopadu a usazení kamera zůstane na pevnosti, do které se střílelo (Mark vlevo)", Math.abs(cd.x - cd.home.x) < 25 && cd.x < 450, `x ${cd.x.toFixed(0)}`);
  }
  check("po výstřelu Radky: Mark nic nedrží, vybírá Radka (ph pick, na tahu Radka)", s2.ia.ph === "pick" && s2.ia.p === "o" && s2.ia.hd.o === "" && s2.ia.hd.x === "");
  const pk2 = await pickHog(B, A, "k", "pick 2 (Radka → Mark)", {
    shot: "15-vyber-jezka-iphone",
    checks: async (sel, pl) => {
      const r = await B.evaluate(() => { const b = document.getElementById("dock").getBoundingClientRect(), K = [...document.querySelectorAll("#kinds .btn")].map(e => Math.round(e.getBoundingClientRect().height)); return { top: b.top, bottom: b.bottom, K, send: Math.round(document.getElementById("sendBtn").getBoundingClientRect().height), plinth: window.JPT.proj(0, 850)[1], vh: innerHeight }; });
      check("výběr ježka (Radka → Mark): obyčejného Mark dostal na začátku, je šedý, ostatní 4 dostupné", eq(sel.map(s => s.k), ["n", "k", "g", "b", "s"]) && sel.find(s => s.k === "n").dis && sel.filter(s => s.dis).length === 1 && pl === "kgbs" && (await B.locator("#pickLeft").innerText()) === "Zbývá 4 z 5 v dávce.", JSON.stringify(sel.filter(s => s.dis)));
      check("mobil: výběr ježka má dotykové cíle ≥ 44 px a panel stojí pod podstavcem (nezakrývá pevnost)", r.K.length === 5 && r.K.every(h => h >= 44) && r.send >= 44 && r.top >= r.plinth - 4 && r.bottom <= r.vh, `karty ${r.K.join(",")}, Poslat ${r.send}, panel ${r.top.toFixed(0)}–${r.bottom.toFixed(0)}, podstavec ${r.plinth.toFixed(0)}`);
    },
  });
  usedHogs.add("k");

  // --- 3. akce: Mark (n = 2) staví klávesami; ježek zůstane v ruce ---
  const hogBefore = (await info(A)).hd.x;
  let ghostInfo = {};
  const b1 = await buildAct(A, B, "Mark staví", {
    keys: true,
    before: async i0 => {
      const off = await A.getAttribute("#modeBuild", "aria-disabled");
      check("2. tah Marka: Stavba je povolená, zbývají 3 stavby, ježek (kamenný) v ruce", off === "false" && i0.bs.x === 3 && i0.lb.x === 0 && i0.hd.x === "k" && (await A.locator("#buildLeft").innerText()) === "3" && (await A.locator("#hdName").innerText()) === "Kamenný", `lb ${i0.lb.x}`);
    },
    afterOn: async i0 => {
      const rows = await A.evaluate(() => ({ buildRow: !document.getElementById("buildRow").hidden, pieces: [...document.querySelectorAll("#pieces [data-k]")].map(e => e.dataset.k), place: document.getElementById("placeBtn").getAttribute("aria-disabled"), rot: document.getElementById("rotBtn").disabled, shootPressed: document.getElementById("modeShoot").getAttribute("aria-pressed"), buildPressed: document.getElementById("modeBuild").getAttribute("aria-pressed"), stage: document.getElementById("stage").className, ghost: window.JPT.ghost() && { ok: window.JPT.ghost().ok, kind: window.JPT.ghost().kind } }));
      check("stavba (desktop, klávesa E): přepnuto na Stavbu, řada dílů Štít / Blok / Trám, platný duch, Postavit aktivní", rows.buildRow && eq(rows.pieces, ["mS", "sB", "wP"]) && rows.ghost.ok && rows.place === "false" && rows.buildPressed === "true" && rows.shootPressed === "false", JSON.stringify(rows));
      await shot(A, "16-stavba-desktop");
      // Q vrátí Střelbu, E znovu Stavbu
      await A.keyboard.press("q");
      const q1 = (await info(A)).mode; await A.keyboard.press("e"); await A.waitForFunction(() => window.JPT.info().mode === "build", null, { timeout: 4000 });
      check("klávesy Q / E přepínají Střelbu a Stavbu", q1 === "shoot" && (await info(A)).mode === "build", q1);
      // neplatné místo: klepnutí na vlastního krále
      const doc = await docOf(A), mine = doc.bodies.filter(b => b.t === "x" && ["K", "S", "T", "L", "R", "C"].includes(b.k));
      let bad = null;
      for (const u of [mine.find(b => b.k === "K"), ...mine.filter(b => b.k !== "K")]) {
        const [px, py] = await A.evaluate(([x, y]) => window.JPT.proj(x, y), [u.x, u.y]);
        await A.mouse.click(px, py); await sleep(120);
        const g = await ghostRect(A);
        if (g && !g.ok) { bad = { unit: u.k, g, place: await A.getAttribute("#placeBtn", "aria-disabled"), why: await A.locator("#buildWhy").innerText(), bad: await A.locator("#buildWhy").evaluate(e => e.classList.contains("bad")) }; break; }
      }
      if (bad) {
        await shot(A, "17-stavba-neplatne-desktop");
        const n0 = (await info(A)).n;
        await A.click("#placeBtn", { force: true }); const t2 = await A.locator("#toast").innerText();
        check("neplatné místo: duch zčervená, Postavit je neaktivní, ukáže důvod a nic nepostaví", bad.place === "true" && bad.bad && bad.why.length > 3 && t2 === bad.why && (await info(A)).n === n0 && (await info(A)).mode === "build", `na ${bad.unit}: „${bad.why}“`);
      } else soft("neplatné místo stavby", "klepnutí na jednotky dalo vždy platného ducha");
      // díly a otočení: Trám otočený
      await A.click('#pieces [data-k="sB"]'); const gB = await ghostRect(A), rotDis = await A.locator("#rotBtn").isDisabled();
      await A.click('#pieces [data-k="wP"]'); await A.keyboard.press("r"); await sleep(80); const gP = await ghostRect(A);
      await A.click('#pieces [data-k="wP"]'); const gP2 = await ghostRect(A);
      check("díly: Blok se neotáčí (↻ neaktivní), Trám jde otočit klávesou R a dá platného ducha", gB.kind === "sB" && gB.ok && rotDis && gP.kind === "wP" && gP.ok && gP.rot === 1 && gP2.ok, `Blok ${gB.ok}, Trám rot ${gP.rot} ok ${gP.ok}, po novém výběru rot ${gP2.rot}`);
      if (!(await ghostRect(A)).ok) await A.click('#pieces [data-k="mS"]');
      ghostInfo = { kind: (await ghostRect(A)).kind };
    },
  });
  check("stavba klávesou Enter: bs 3 → 2, lb 1, stavěl Mark, ježek zůstal v ruce", b1.ia.bs.x === 2 && b1.ia.bs.o === b1.i0.bs.o && b1.ia.lb.x === 1 && b1.ia.hd.x === hogBefore && b1.ia.lastAct.kind === "b" && b1.ia.lastAct.by === "x", `bs ${JSON.stringify(b1.ia.bs)}, lb ${JSON.stringify(b1.ia.lb)}, ruka ${b1.ia.hd.x}`);
  check("stavba se přehrála u soupeře a v dokumentu je událost 'n' (nový díl)", b1.seenReplay && /(^|\|)n\./.test(b1.ia.lastAct.ev) && b1.ia.bodies >= b1.i0.bodies, `těles ${b1.i0.bodies} → ${b1.ia.bodies}`);
  check("po stavbě je v HUD u Marka pořád ježek (kamenný)", (await A.locator("#handX").isVisible()) && (await A.getAttribute("#handX", "alt")) === "V ruce: Kamenný");
  check("po stavbě soupeř nic nedrží, takže znovu vybírá Mark (ph pick), ježek Marka zůstává", b1.ia.ph === "pick" && b1.ia.p === "x" && b1.ia.hd.o === "" && b1.ia.pl.o === "nkgb");
  const pk3 = await pickHog(A, B, "g", "pick 3 (Mark → Radka)", {
    checks: async (sel, pl) => check("výběr po stavbě: špičák už Radka dostala, je šedý; Mark přitom drží kamenného", sel.find(s => s.k === "s").dis && sel.filter(s => s.dis).length === 1 && pl === "nkgb"),
  });
  usedHogs.add("g");

  // --- 4. akce: Radka (n = 3) střílí gumovým; Mark má ježka v ruce, takže se výběr přeskočí ---
  const s3 = await shoot(B, A, "Radka střílí (gumový)", {});
  check("výběr se přeskočí: Mark drží ježka z minula, po výstřelu Radky je rovnou na tahu (ph t, p x, hd.x kamenný)", s3.ia.ph === "t" && s3.ia.p === "x" && s3.ia.hd.x === "k" && s3.ia.hd.o === "" && !(await B.locator("#pickRow").isVisible()) && !(await A.locator("#pickRow").isVisible()), `ph ${s3.ia.ph}, p ${s3.ia.p}, hd ${JSON.stringify(s3.ia.hd)}`);

  // --- 5. akce: Mark (n = 4) – dvakrát po sobě stavět nejde; střílí kamenným ---
  await A.waitForFunction(() => document.title.startsWith("Jsi na tahu"), null, { timeout: T });
  const bOff = await A.getAttribute("#modeBuild", "aria-disabled"), bTitle = await A.getAttribute("#modeBuild", "title");
  await A.click("#modeBuild", { force: true }); const toast2 = await A.locator("#toast").innerText();
  check("další tah po stavbě: Stavba zakázaná („Dvakrát po sobě“), lb = 1, stavby zbývají 2, důvod v toastu", bOff === "true" && /Dvakrát po sobě/.test(bTitle) && /Dvakrát po sobě/.test(toast2) && s3.ia.lb.x === 1 && s3.ia.bs.x === 2 && (await info(A)).mode === "shoot", `${bTitle} | ${toast2}`);
  check("tah po stavbě: v ruce je pořád kamenný ježek", (await A.locator("#hdName").innerText()) === "Kamenný");
  const s4 = await shoot(A, B, "Mark střílí (kamenný)", {
    during: async () => {
      if (takeover) return;
      takeover = true;
      // kolečko za letu převezme kameru, automatika se vypne, tlačítko ji vrátí
      await A.waitForTimeout(200);
      await A.mouse.move(683, 400); await A.mouse.wheel(0, -300); await A.waitForTimeout(100);
      const c1 = await camOf(A); await A.waitForTimeout(400); const c2 = await camOf(A);
      check("za letu kolečko / pinch převezme kameru a ta zůstane stát", c1.user && Math.abs(c2.x - c1.x) < 2 && Math.abs(c2.s - c1.s) < 0.01, `ruční ${c1.user}, x ${c1.x.toFixed(0)} → ${c2.x.toFixed(0)}`);
      await A.click("#viewBtn"); await A.waitForTimeout(1800);
      const c3 = await camOf(A);
      check("tlačítko přehledu vrátí automatickou kameru", !c3.user, `ruční ${c3.user}, „${c3.label}“`);
    },
  });
  check("po výstřelu drženého ježka: lb Marka zpět na 0 (střelba ruší zákaz), stavby pořád 2", s4.ia.lb.x === 0 && s4.ia.bs.x === 2 && s4.ia.hd.x === "");
  if (s4.ia.ph === "pick") {
    const avail = s4.ia.pl.o;
    await pickHog(A, B, wantFrom(avail, usedHogs), "pick 4 (Mark → Radka)", {});
  }

  // --- 6. akce: Radka (n = 5) staví dotykem, na výšku i na šířku ---
  let landscapeInfo = null;
  const iNow = await info(A);
  if (iNow.ph === "t" && iNow.p === "o" && iNow.n >= 2) {
    const b2 = await buildAct(B, A, "Radka staví", {
      before: async i0 => {
        const off = await B.getAttribute("#modeBuild", "aria-disabled");
        check("tah Radky: Stavba povolená, zbývají aspoň 4 stavby (5 po comebacku), ježek v ruce", off === "false" && i0.bs.o >= 4 && i0.lb.o === 0 && !!i0.hd.o, `ruka ${i0.hd.o}, bs ${i0.bs.o}`);
      },
      afterOn: async () => {
        const rows = await B.evaluate(() => ({ pieces: [...document.querySelectorAll("#pieces .btn")].map(e => Math.round(e.getBoundingClientRect().height)), rot: Math.round(document.getElementById("rotBtn").getBoundingClientRect().height), place: Math.round(document.getElementById("placeBtn").getBoundingClientRect().height), modes: ["modeShoot", "modeBuild"].map(i => Math.round(document.getElementById(i).getBoundingClientRect().height)) }));
        check("mobil, stavba: díly, Otočit, Postavit i přepínač mají dotykové cíle ≥ 44 px", rows.pieces.length === 3 && [...rows.pieces, rows.rot, rows.place, ...rows.modes].every(h => h >= 44), JSON.stringify(rows));
        const R = await rectsOf(B, ["#dock", ".tools", "#plateX", "#plateO", ".mid", "#status"]), gr = await ghostRect(B), plinth = await B.evaluate(() => window.JPT.proj(0, 850)[1]);
        check("iPhone na výšku, stavba: duch je vidět nad lištou a lišta nepřekrývá vlastní pevnost (jednotky)", gr && !hit(gr, R["#dock"]) && gr.t > R[".tools"].t - 1, `duch ${gr && [gr.l, gr.t, gr.r, gr.b].map(Math.round)}, lišta ${R["#dock"] && [R["#dock"].l, R["#dock"].t].map(Math.round)}, podstavec ${plinth.toFixed(0)}`);
        await shot(B, "18-stavba-iphone-vyska");
        // dotyk: duch se drží 64 px nad prstem
        const [tx, ty] = await B.evaluate(() => window.JPT.proj(1180, 850 - 250));
        await B.touchscreen.tap(tx, ty); await sleep(150);
        const gh = await B.evaluate(() => { const g = window.JPT.ghost(), P = window.JPT.proj(g.x, g.yh); return { x: P[0], y: P[1], ok: g.ok }; });
        check("dotyk při stavbě: duch se drží 64 px nad prstem (těžiště se přichytává na 8 px)", Math.abs(gh.y - (ty - 64)) < 3 && Math.abs(gh.x - tx) < 12, `prst ${tx.toFixed(0)},${ty.toFixed(0)} → duch ${gh.x.toFixed(0)},${gh.y.toFixed(0)}`);
        await B.click('#pieces [data-k="sB"]'); await sleep(150);
        // na šířku (844×390): lišta vpravo, nic nepřekrývá
        await B.setViewportSize({ width: 844, height: 390 }); await sleep(1500);
        const L = await rectsOf(B, ["#dock", ".tools", "#plateX", "#plateO", ".mid", "#status", "#placeBtn", "#modeBuild", "#rotBtn"]), gl = await ghostRect(B), cl = await camOf(B);
        const inView = r => r && r.l >= -0.5 && r.t >= -0.5 && r.r <= 844.5 && r.b <= 390.5;
        landscapeInfo = { dock: L["#dock"], tools: L[".tools"], gl };
        check("iPhone na šířku, stavba: lišta i nástroje celé na obrazovce, nepřekrývají se a duch není pod lištou", inView(L["#dock"]) && inView(L[".tools"]) && !hit(L["#dock"], L[".tools"]) && !hit(L["#dock"], L["#plateX"]) && !hit(L["#dock"], L["#plateO"]) && gl && !hit(gl, L["#dock"]) && L["#placeBtn"].h >= 44 && L["#modeBuild"].h >= 44, `lišta ${L["#dock"] && [L["#dock"].l, L["#dock"].t, L["#dock"].r, L["#dock"].b].map(Math.round)}, duch ${gl && [gl.l, gl.t, gl.r, gl.b].map(Math.round)}, nástroje ${L[".tools"] && [L[".tools"].l, L[".tools"].t, L[".tools"].r, L[".tools"].b].map(Math.round)}`);
        await shot(B, "19-stavba-iphone-sirka");
      },
      during: async () => { await B.setViewportSize({ width: 390, height: BH }); },
    });
    check("stavba dotykem: bs o −1, lb 1, stavěla Radka, ježek zůstal v ruce, přehráno u Marka", b2.ia.bs.o === b2.i0.bs.o - 1 && b2.ia.lb.o === 1 && b2.ia.hd.o === b2.i0.hd.o && b2.ia.lastAct.kind === "b" && b2.ia.lastAct.by === "o" && b2.seenReplay, `bs ${JSON.stringify(b2.ia.bs)}, lb ${JSON.stringify(b2.ia.lb)}`);
    if (b2.ia.ph === "pick") {
      await sleep(900);
      await pickHog(B, A, wantFrom(b2.ia.pl.x, usedHogs), "pick 5 (Radka → Mark)", {});
    }
  } else soft("stavba Radky dotykem", `partie je ve stavu ${iNow.ph}/${iNow.p}/n${iNow.n}`);

  // --- zbytek partie: střelba nejlepším výstřelem, reload uprostřed, výběry ježků ---
  let reloaded = false, stBpre = null;   // STATS Radky před reloadem (po reloadu se počítadla v prohlížeči vynulují)
  for (let guard = 0; guard < 70; guard++) {
    const ia = await info(A);
    if (ia.ph === "end") break;
    const P = ia.p === "x" ? A : B, O = ia.p === "x" ? B : A, nm = ia.p === "x" ? "Mark" : "Radka";
    if (ia.ph === "pick") {
      await pickHog(P, O, wantFrom(ia.pl[other(ia.p)], usedHogs), `pick (${nm})`, {});
      continue;
    }
    // reload uprostřed partie (WebKit): stav, strana i ruce se obnoví
    if (!reloaded && ia.n >= 8) {
      reloaded = true;
      const bef = await info(B);
      stBpre = await B.evaluate(() => ({ ...window.JPT.stats }));
      await B.reload(); await B.waitForSelector("#hud:not([hidden])", { timeout: T });
      await B.waitForFunction(() => window.JPT && window.JPT.info() && window.JPT.info().view === "play", null, { timeout: T });
      const aft = await info(B);
      check("reload uprostřed partie: Radka zůstane Radkou a stav, tah, ruce, stavby i těleso sedí", aft.me === "o" && aft.n === bef.n && aft.p === bef.p && aft.ph === bef.ph && eq(aft.hd, bef.hd) && eq(aft.bs, bef.bs) && eq(aft.lb, bef.lb) && aft.units === bef.units && aft.sd === bef.sd && !(await B.locator("#banner").isVisible()), `n ${bef.n}→${aft.n}, ${aft.units === bef.units ? "jednotky stejné" : "JEDNOTKY JINÉ"}`);
      await B.evaluate(() => { window.JPT.speed = 3; });
      await shot(B, "20-iphone-po-reloadu");
      continue;
    }
    await shoot(P, O, `${nm} střílí`, {});
  }
  const fa = await info(A), fb = await info(B);
  check("partie skončila výhrou (král padl, nebo rozhodl po 8. tahu zdravější král)", fa.ph === "end" && (fa.win === "x" || fa.win === "o" || fa.win === "=") && fb.ph === "end" && fb.win === fa.win && fb.wy === fa.wy && ["k", "l"].includes(fa.wy), `vítěz ${fa.win}, důvod ${fa.wy}, tah ${fa.n}`);
  // pravidla konce
  if (fa.wy === "k") {
    const L = other(fa.win);
    check("konec králem: poražený nemá krále (padl / 0 životů), vítězův žije", fa.win === "=" ? fa.king.x === 0 && fa.king.o === 0 : fa.king[L] <= 0 && fa.king[fa.win] > 0, JSON.stringify(fa.king));
  } else if (fa.wy === "l") {
    const wk = fa.king[fa.win] || 0, lk = fa.king[other(fa.win)] || 0;
    check("konec po 8. tahu: 16 akcí a vítěz má zdravějšího krále (při shodě víc živých jednotek)", fa.n === 16 && (fa.win === "=" ? Math.abs(fa.king.x - fa.king.o) < 1e-6 : (wk > lk || (wk === lk && fa.alive[fa.win] >= fa.alive[other(fa.win)]))), `n ${fa.n}, králové ${JSON.stringify(fa.king)}, jednotky ${JSON.stringify(fa.alive)}`);
  }
  console.log(`  partie: ${actions} akcí, vítěz ${fa.win}, důvod ${fa.wy}, události ${JSON.stringify(evCounts)}`);
  check(`napnutý ježek v praku není pod lištou tahu (${pouch.length} výstřelů, desktop i mobil)`, pouch.length > 0 && pouch.every(x => !x.under), `pod lištou ${pouch.filter(x => x.under).length}`);
  check("oba prohlížeče mají po každém tahu stejné jednotky, tělesa, ruce a zásoby staveb", syncOk);
  check(`HUD sedí po každém tahu u obou (lišta krále, číslo, pastilky, Tah N/8) – ${hudChecks} kontrol`, hudProblems.length === 0, hudProblems.slice(0, 3).join(" | "));
  if (kingHits > 0) check(`lišta krále se mění se zásahem (zásah krále v ${kingHits} tazích a HUD seděl)`, hudProblems.length === 0); else soft("lišta krále se zásahem", "v partii nebyl král zasažen před koncem");
  if (cbSeen) check(`comeback (${cbSeen}×): stavba navíc, oznámení pro oba, lb vynulováno`, cbOk); else soft("comeback (stavba navíc pro prohrávajícího)", "v partii nenastal");
  const stA = await A.evaluate(() => ({ ...window.JPT.stats })), stB = await B.evaluate(() => ({ ...window.JPT.stats }));
  if (stBpre) for (const k of Object.keys(stBpre)) if (typeof stBpre[k] === "number") stB[k] = (stB[k] || 0) + stBpre[k];
  const sum = k => stA[k] + stB[k];
  check("reakce postaviček u střelce i u soupeře (radost / úlek / facepalm)", stA.cheer + stA.sad + stA.shock > 0 && stB.cheer + stB.sad + stB.shock > 0, `A ${JSON.stringify({ c: stA.cheer, s: stA.sad, h: stA.shock })} · B ${JSON.stringify({ c: stB.cheer, s: stB.sad, h: stB.shock })}`);
  check("při letu ježka se postavičky bojí a při zásahu cukají", sum("fearFrames") > 10 && sum("hitFrames") > 0, `strach ${sum("fearFrames")} snímků, cuknutí ${sum("hitFrames")}`);
  check("kostky se rozpadají na úlomky a vyřazení zpomalí / zatřese", sum("frag") > 0 && sum("ko") > 0, `úlomky ${sum("frag")}, KO ${sum("ko")}, zpomalení ${sum("slow")}, bouchnutí ${sum("boom")}`);
  check("stavba se přehrála efekty (STATS.build u obou) – dva díly", stA.build >= 2 && stB.build >= 2, `A ${stA.build}, B ${stB.build}`);
  // schopnosti v partii: pokud se událost stala, musela se u obou přehrát
  for (const [ev, key, nm] of [["j", "dodge", "Skokan uskočil"], ["r", "bounce", "Tlusťoch odrazil ježka"], ["z", "shield", "Štítonoš ztratil štít"], ["hl", "heal", "Léčitel vyléčil"]]) {
    if (evCounts[ev]) check(`schopnost v partii: ${nm} (${evCounts[ev]}× v dokumentu) a přehrálo se u obou`, sum(key) > 0 && stA[key] > 0 && stB[key] > 0, `A ${stA[key]}, B ${stB[key]}`);
    else soft(`schopnost v partii: ${nm}`, "v téhle partii se nestala (v enginu ověřeno výše)");
  }

  // ===== 6) konec hry =====
  await A.waitForSelector("#endBox:not([hidden])", { timeout: T }); await B.waitForSelector("#endBox:not([hidden])", { timeout: T });
  const winner = fa.win;
  const W_ = winner === "x" ? A : B, L_ = winner === "x" ? B : A;
  const endKick = await A.locator("#endKicker").innerText(), endKickB = await B.locator("#endKicker").innerText();
  const wantKick = fa.wy === "l" ? "Po devátém tahu rozhodl zdravější král." : winner === "=" ? "Oba králové padli v jednom tahu." : "Král padl.";
  check("konec: #endKicker říká, jak partie skončila (Král padl. / po devátém tahu)", endKick === wantKick && endKickB === wantKick && (await A.locator("#endKicker").isVisible()), `„${endKick}“`);
  const bad9 = await hudBad(A);
  check("konec: HUD ukazuje Konec a pastilky podle stavu", bad9.length === 0, bad9.join("; "));
  if (winner === "x" || winner === "o") {
    const tW = await W_.locator("#endTitle").innerText(), tL = await L_.locator("#endTitle").innerText();
    check("konec: vítěz vidí výhru, poražený jméno vítěze, sázka", tW.startsWith("Vyhráváš") && tL.includes("vyhrává") && /kafe/i.test(await L_.locator("#endStake").innerText()), `${tW} / ${tL}`);
    const ser = await A.locator("#endSeries").innerText();
    check("skóre série 1 : 0 pro vítěze", winner === "x" ? ser === "Mark 1 : 0 Radka" : ser === "Mark 0 : 1 Radka", ser);
    const rank = await A.locator("#endRank").innerText(), rankB = await B.locator("#endRank").innerText();
    check("první výhra v sérii přinese titul Ostřílený (#endRank u obou)", /je teď Ostřílený/.test(rank) && rank === rankB && (await A.locator("#endRank").isVisible()), rank);
    check("tlačítka konce: poražený „Chci odvetu“ / „Uznat porážku“, vítěz „Odveta (začíná …)“", (await L_.locator("#endPrimary").innerText()) === "Chci odvetu" && (await L_.locator("#endSecondary").innerText()) === "Uznat porážku" && /^Odveta \(začíná /.test(await W_.locator("#endPrimary").innerText()));
  } else {
    check("konec remízou: nadpis Remíza, série se nemění", (await A.locator("#endTitle").innerText()) === "Remíza" && (await A.locator("#endSeries").innerText()) === "Mark 0 : 0 Radka");
  }
  await shot(A, "21-konec-desktop"); await shot(B, "22-konec-iphone");
  await B.waitForTimeout(900);
  await B.setViewportSize({ width: 390, height: BH }); await B.waitForTimeout(1500);
  const endR = await B.evaluate(() => { const b = document.getElementById("endBox").getBoundingClientRect(); return { top0: b.top, bottom: b.bottom, left: b.left, right: b.right, topY: window.JPT.topY(), cam: window.JPT.cam(), vw: innerWidth, vh: innerHeight }; });
  check("iPhone na výšku: karta konce hry je celá na obrazovce a nezakrývá tlačítka nástrojů", endR.left >= 0 && endR.right <= endR.vw && endR.top0 >= 0 && endR.bottom <= endR.vh && endR.cam.portrait, JSON.stringify({ l: endR.left, r: endR.right, t: endR.top0, b: endR.bottom }));
  const endRects = await rectsOf(B, ["#endBox", ".tools", ".top"]);
  check("iPhone na výšku: karta konce nezakrývá nástroje vpravo nahoře", !hit(endRects["#endBox"], endRects[".tools"]), JSON.stringify([endRects["#endBox"], endRects[".tools"]].map(r => r && [r.l, r.t, r.r, r.b].map(Math.round))));
  check("iPhone na výšku: konec hry stojí v nebi, nezakrývá pevnost, která zůstala v záběru", endR.bottom < endR.topY - 4, `box končí ${endR.bottom.toFixed(0)}, pevnost začíná ${endR.topY.toFixed(0)}`);
  await shot(B, "23-konec-iphone-vyska");
  await B.setViewportSize({ width: 390, height: 664 }); await B.waitForTimeout(1200); await shot(B, "24-konec-iphone-vyska-nizky");
  const endR2 = await B.evaluate(() => { const b = document.getElementById("endBox").getBoundingClientRect(); return { bottom: b.bottom, top: window.JPT.topY(), vh: innerHeight }; });
  check("iPhone na výšku (664 px, Safari s lištami): karta konce se vejde na obrazovku", endR2.bottom <= endR2.vh, `box končí ${endR2.bottom.toFixed(0)} z ${endR2.vh}; pevnost začíná ${endR2.top.toFixed(0)}`);
  await B.setViewportSize({ width: 844, height: 390 }); await B.waitForTimeout(1200);
  const cl = await camOf(B), endL = (await rectsOf(B, ["#endBox", ".tools"]));
  check("iPhone na šířku: celá scéna (beze změny) a karta konce je celá na obrazovce", Math.abs(cl.s - cl.full) < 0.05 && !cl.portrait && endL["#endBox"] && endL["#endBox"].b <= 390.5 && endL["#endBox"].t >= -0.5, `s ${cl.s.toFixed(3)} / celá ${cl.full.toFixed(3)}, karta ${endL["#endBox"] && [endL["#endBox"].t, endL["#endBox"].b].map(Math.round)}`);
  await shot(B, "25-konec-iphone-sirka");
  await B.setViewportSize({ width: 390, height: BH }); await B.waitForTimeout(1000);

  // ===== 7) odveta =====
  const loser = winner === "x" ? B : winner === "o" ? A : B;
  const startP = winner === "=" ? other(fa.s) : other(winner);
  await loser.click("#endPrimary");
  await loser.waitForFunction(() => window.JPT.info().ph === "t" && window.JPT.info().n === 0, null, { timeout: T });
  await (loser === A ? B : A).waitForFunction(() => window.JPT.info().ph === "t" && window.JPT.info().n === 0, null, { timeout: T });
  const ra = await info(A), rb = await info(B);
  check("odveta: nová partie u obou, začíná poražený, 6 : 6 postaviček, zásoby staveb 3 : 4 podle začínajícího", ra.p === startP && rb.p === startP && ra.alive.x === 6 && ra.alive.o === 6 && ra.bs[startP] === 3 && ra.bs[other(startP)] === 4 && ra.hd[startP] === "n" && ra.hd[other(startP)] === "");
  check("odveta: nový seed a jiná mapa a jiný modifikátor než předchozí partie", ra.sd !== fa.sd && rb.sd === ra.sd && ra.md !== fa.md && ra.map !== fa.map, `seed ${fa.sd} → ${ra.sd}, mapa ${fa.map} → ${ra.map}, modifikátor „${fa.md}“ → „${ra.md}“`);
  check("odveta: série se přenesla", eq(ra.w, rb.w) && (winner === "=" ? eq(ra.w, [0, 0]) : ra.w[winner === "x" ? 0 : 1] === 1), JSON.stringify(ra.w));
  const sc = await A.locator("#score").innerText();
  check("HUD ukazuje skóre série", sc.replace(/\s/g, "") === (winner === "x" ? "1:0" : winner === "o" ? "0:1" : "0:0"), sc);
  if (winner === "x" || winner === "o") {
    const T_ = winner.toUpperCase(), LT = other(winner).toUpperCase();
    const tt = { tx: await A.locator("#tt" + T_).innerText(), vis: await A.locator("#tt" + T_).isVisible(), lv: await A.locator("#tt" + LT).isVisible(), tx2: await B.locator("#tt" + T_).innerText(), tt: ra.tt };
    check("titul po výhře: vítěz má u jména Ostřílený (tt 1), poražený nic – u obou prohlížečů", tt.vis && tt.tx === "Ostřílený" && tt.tx2 === "Ostřílený" && !tt.lv && ra.tt[winner] === 1 && ra.tt[other(winner)] === 0, JSON.stringify(tt));
  }
  // karta partie v odvetě u obou, s novou mapou a modifikátorem
  await sleep(500);
  const bans = [];
  for (const p of [A, B]) bans.push({ vis: await p.locator("#banner").isVisible(), map: await p.locator("#bnMap").innerText(), mod: await p.locator("#bnMod").innerText(), st: await p.locator("#bnStart").innerText() });
  check("karta nové partie v odvetě: u obou, s novou mapou, modifikátorem a kdo začíná", bans.every(b => b.vis && b.map === MAPN[ra.map] && b.mod === modName(ra) && b.st === `Začíná ${startP === "x" ? "Mark" : "Radka"}.`), JSON.stringify(bans[0]));
  const chip2 = await A.locator("#modChip").isVisible(), chipLbl2 = chip2 ? await A.locator("#modLbl").innerText() : "";
  check("#modChip v odvetě odpovídá modifikátoru", chip2 === !!ra.md && (!ra.md || chipLbl2 === modName(ra)), `md „${ra.md}“, „${chipLbl2}“`);
  await shot(A, "26-odveta-karta-desktop"); await shot(B, "27-odveta-karta-iphone");
  await hideBanner(A); await hideBanner(B);
  for (const p of [A, B]) await p.evaluate(() => { window.JPT.speed = 3; });

  // ===== 8) přihlížející s omezeným pohybem (3. kontext) =====
  const bC = await chromium.launch();
  const C = await (await bC.newContext({ ...devices["Pixel 7"], reducedMotion: "reduce" })).newPage();
  C.on("pageerror", e => errs.push("C: " + e.message));
  await C.goto(linkT); await C.waitForSelector("#hud:not([hidden])", { timeout: T });
  const ic = await info(C);
  check("přihlížející (reduced motion) vidí partii bez židle: žádná lišta tahu, stav hlásí, kdo je na tahu", ic.me === null && ic.n === 0 && /je na tahu/.test(await C.locator("#status").innerText()) && !(await C.locator("#dock").isVisible()), await C.locator("#status").innerText());
  check("přihlížející: prefers-reduced-motion je zapnuté a karta partie se zobrazí i jemu", (await C.evaluate(() => window.JPT.calm())) === true && (await C.locator("#banner").isVisible()));
  await hideBanner(C);
  check("přihlížející vidí stejnou mapu, modifikátor, tituly a skóre jako hráči", ic.sd === ra.sd && ic.md === ra.md && eq(ic.w, ra.w) && (await C.locator("#score").innerText()).replace(/\s/g, "") === sc.replace(/\s/g, ""));
  {
    // reduced motion na výšku (camera.js shotGoal): kamera ježka nesleduje. Záběry: prak střelce → jeden pevný záběr letu,
    // ve kterém je prak i cílová pevnost (ježek v něm letí přes obrazovku) → cílová pevnost; mezi nimi krátké přechody (~0,18 s).
    // Vzorkuje se celé přehrávání (přihlížející hraje rychlostí 1, let i doznívání trvá několik sekund) a chvíli po něm.
    const P = startP === "x" ? A : B, tg = other(startP);
    const ss = [];
    const shot3 = shoot(P, startP === "x" ? B : A, "odveta: první výstřel", {
      during: async () => {
        const seen = await C.waitForFunction(() => window.JPT.info().replay, null, { timeout: 60000, polling: 40 }).then(() => true, () => false);
        const t0 = Date.now();
        for (let after = 0; seen && after < 25 && Date.now() - t0 < 40000;) {
          const s = await C.evaluate(([me, tg]) => {
            const c = window.JPT.cam(), h = window.JPT.hogScreen(), sl = window.JPT.proj(JP.SLING[me].x, JP.SLING[me].y);
            const z = JP.ZONE[tg], fl = window.JPT.proj(z[0], JP.GY)[0], fr = window.JPT.proj(z[1], JP.GY)[0], vw = innerWidth;
            return { x: c.x, hx: h ? h[0] : null, rp: window.JPT.info().replay, homeX: c.home.x, both: sl[0] >= 0 && sl[0] <= vw && (fl + fr) / 2 >= 0 && (fl + fr) / 2 <= vw, whole: fl >= -2 && fr <= vw + 2, vw };
          }, [startP, tg]);
          s.t = Date.now() - t0; ss.push(s);
          if (!s.rp) after++;
          await C.waitForTimeout(50);
        }
        const xs = ss.map(s => s.x), lo = Math.min(...xs), hi = Math.max(...xs);
        // polohy = úseky, kde se střed kamery nehne o víc než 1,5 px aspoň 4 vzorky; přechod = souvislý pohyb (měřeno v ms)
        const plat = []; let run0 = -1, longest = 0, cur = null;
        for (let k = 1; k < ss.length; k++) {
          if (Math.abs(xs[k] - xs[k - 1]) > 1.5) { if (run0 < 0) run0 = ss[k - 1].t; longest = Math.max(longest, ss[k].t - run0); cur = null; }
          else { run0 = -1; if (!cur) plat.push(cur = { a: k - 1, b: k }); else cur.b = k; }
        }
        const pls = plat.filter(p => p.b - p.a >= 4);
        // záběr letu = poloha, ve které ježek letí nejvíc vzorků
        const fly = s => s.hx != null && s.rp, inP = p => ss.slice(p.a, p.b + 1);
        const flyP = pls.map(p => ({ p, n: inP(p).filter(fly).length })).sort((u, v) => v.n - u.n)[0];
        const fS = flyP ? inP(flyP.p).filter(fly) : [], hxs = fS.map(s => s.hx), vw = ss.length ? ss[0].vw : 1;
        const hogTravel = hxs.length ? Math.max(...hxs) - Math.min(...hxs) : 0;
        const last = ss[ss.length - 1] || {};
        check("prefers-reduced-motion: kamera při výstřelu nesleduje ježka, jen 2–4 pevné záběry (prak → let → cíl) s krátkými přechody",
          seen && pls.length >= 2 && pls.length <= 4 && longest <= 900 && hi - lo > 200,
          `${pls.length} poloh (${pls.map(p => Math.round(xs[p.a])).join(" → ")}), nejdelší přechod ${longest} ms, rozsah ${Math.round(hi - lo)}, ${ss.length} vzorků za ${last.t} ms`);
        check("prefers-reduced-motion: záběr letu je pevný a obsáhne prak střelce i cílovou pevnost, ježek jím přeletí (kamera se za ním nehýbe)",
          !!flyP && flyP.n >= 4 && fS.every(s => s.both) && hogTravel > 0.3 * vw,
          flyP ? `záběr x ${Math.round(xs[flyP.p.a])}, ${flyP.n} vzorků letu, prak i pevnost v záběru ${fS.filter(s => s.both).length}/${fS.length} (celá pevnost ${fS.filter(s => s.whole).length}), ježek přeletěl ${Math.round(hogTravel)} px z ${vw}` : "žádný záběr letu");
        check("prefers-reduced-motion: po výstřelu kamera stojí na výchozím pohledu (pevnost hráče na tahu)", !last.rp && Math.abs(last.x - last.homeX) < 12, `x ${Math.round(last.x)}, výchozí ${Math.round(last.homeX)}`);
      },
    });
    await shot3;
  }
  await C.waitForFunction(() => window.JPT.info().n >= 1 && !window.JPT.info().replay, null, { timeout: 30000, polling: 100 }).catch(() => {});
  const icAfter = await info(C);
  check("přihlížející vidí průběh: po výstřelu stejný stav jako hráči", icAfter.n === 1 && icAfter.units === (await info(A)).units);
  await bC.close();

  // ===== 9) vzdání v odvětě =====
  {
    const ib = await info(A), S = ib.p === "x" ? A : B, Wp = ib.p === "x" ? B : A, sNm = ib.p === "x" ? "Mark" : "Radka", wNm = ib.p === "x" ? "Radka" : "Mark";
    await S.click("#menuBtn"); await S.click("#mResign");
    await S.waitForFunction(() => window.JPT.info().ph === "end", null, { timeout: T }); await Wp.waitForFunction(() => window.JPT.info().ph === "end", null, { timeout: T });
    await S.waitForSelector("#endBox:not([hidden])", { timeout: T }); await Wp.waitForSelector("#endBox:not([hidden])", { timeout: T });
    const e2 = await info(S);
    const tS = await S.locator("#endTitle").innerText(), tW = await Wp.locator("#endTitle").innerText(), kS = await S.locator("#endKicker").innerText(), kW = await Wp.locator("#endKicker").innerText();
    check("vzdání: konec se vzdáním (wy r), vítěz je soupeř, kdo to vzdal, říká řádek nad nadpisem (nadpis bez poznámky)", e2.wy === "r" && e2.win === other(ib.p) && kS === "Vzdáno." && tS === `${wNm} vyhrává` && tW === "Vyhráváš!" && kW === `${sNm} se vzdává.`, `${kS} ${tS} | ${kW} ${tW}`);
    const w2 = eq(e2.w, ra.w) ? "bez změny" : "změna", ser2 = await Wp.locator("#endSeries").innerText();
    const exp = [...ra.w]; exp[ib.p === "x" ? 1 : 0]++;
    check("vzdání: výhra se započítá do série (zobrazené skóre)", ser2 === `Mark ${exp[0]} : ${exp[1]} Radka`, ser2 + " (dokument " + w2 + ")");
    await shot(Wp, "28-vzdani-vitez");
  }

  // ===== 10) reload po konci a dokument ve staré verzi (v1) =====
  await B.setViewportSize({ width: 390, height: 664 });
  await B.reload(); await B.waitForSelector("#hud:not([hidden])", { timeout: T });
  await B.waitForFunction(() => window.JPT && window.JPT.info() && window.JPT.info().view === "play", null, { timeout: T });
  check("po obnovení stránky WebKit pozná svou stranu a ukáže konec partie", (await info(B)).me === "o" && (await info(B)).ph === "end" && (await B.locator("#endBox").isVisible()));

  const bD = await chromium.launch();
  {
    const ctxD = await bD.newContext({ viewport: { width: 1100, height: 760 } });
    const D = await ctxD.newPage();
    D.on("pageerror", e => errs.push("D: " + e.message));
    D.on("dialog", d => d.accept());
    const roomId = "v1" + Math.random().toString(36).slice(2, 12);
    await ctxD.addInitScript(id => { try { localStorage.setItem("jp-r-" + id, "x"); } catch {} }, roomId);
    // dokument ve formátu v1: bez rv, ph "aim", ježek hg, dávka pl, 2 akce v h, kódy těles bez krále
    const v1 = { app: "jezkomet", v: 3, sx: "dev-v1-test", so: "dev-v1-soupeř", u: Date.now(), g: { id: "stara1", x: "Stará", o: "Hra", s: "x", k: "1", kc: "", w: [2, 1], r: "", n: 7, p: "o", ph: "aim", win: "", hg: "k", pl: { x: "nkgb", o: "kg" }, t: 28000000,
      b: [[1, "Cx", 1800, 8200, 0, 22], [2, "Cx", 2400, 8200, 0, 22], [3, "Cx", 3000, 8200, 0, 22], [4, "Co", 11000, 8200, 0, 22], [5, "Co", 11600, 8200, 0, 22], [6, "Co", 12200, 8200, 0, 22]], h: [{ n: 7, by: "x", kf: "0;1,1,1,1", ev: "", b0: [] }] } };
    const put = await D.goto(URL).then(() => D.evaluate(async ({ id, doc }) => { const r = await fetch(`https://mantledb.sh/v2/jezkomet-${id}/hra`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(doc) }); return r.status; }, { id: roomId, doc: v1 }));
    if (put >= 200 && put < 300) {
      await D.goto(URL + "#r." + roomId);
      await D.waitForSelector("#hud:not([hidden])", { timeout: T });
      await D.waitForSelector("#endBox:not([hidden])", { timeout: T });
      const io = await info(D);
      const o1 = { title: await D.locator("#endTitle").innerText(), stake: await D.locator("#endStake").innerText(), btn: await D.locator("#endPrimary").innerText(), kick: await D.locator("#endKicker").isVisible(), series: await D.locator("#endSeries").innerText(), chip: await D.locator("#modChip").isVisible(), dock: await D.locator("#dock").isVisible() };
      check("starý dokument v1 (bez rv): zobrazí se jako ukončená „Stará verze hry“ s tlačítkem odvety, bez karty partie a lišty tahu", io.old && io.ph === "end" && o1.title === "Stará verze hry" && /odveta v nové/.test(o1.stake) && o1.btn === "Odveta v nové verzi" && !o1.kick && o1.series === "Stará 2 : 1 Hra" && !o1.chip && !o1.dock && !(await D.locator("#banner").isVisible()), JSON.stringify(o1));
      await shot(D, "29-stara-verze-v1");
      await D.click("#endPrimary");
      await D.waitForFunction(() => { const i = window.JPT.info(); return i && !i.old && i.rv === 2 && i.n === 0 && i.ph === "t"; }, null, { timeout: T });
      const nw = await info(D);
      check("odveta ze staré hry: nová partie v2, začíná stejný hráč, série 2 : 1 se přenesla, 6 : 6 postaviček", nw.rv === 2 && nw.p === "x" && eq(nw.w, [2, 1]) && nw.alive.x === 6 && nw.alive.o === 6 && nw.bs.x === 3 && nw.bs.o === 4, JSON.stringify({ p: nw.p, w: nw.w, alive: nw.alive }));
    } else soft("starý dokument v1", `mantledb nepřijal zápis (HTTP ${put})`);
  }
  await bD.close();

  check("žádné chyby stránky (pageerror) v žádném prohlížeči", errs.length === 0, errs.slice(0, 3).join(" | "));
  console.log(`\n${pass} PASS, ${fail} FAIL` + (unverified.length ? `, ${unverified.length} NEOVĚŘENO (${unverified.join("; ")})` : ""));
  await bA.close(); await bB.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
