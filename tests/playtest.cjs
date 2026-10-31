// Playtest v2: GAMES partií za sebou (odveta → odveta) ve 2 nezávislých prohlížečích v REÁLNÉM čase, „lidské“ tahy.
//   node tests/playtest.cjs [URL]      (výchozí http://127.0.0.1:8793/)
//   Chromium desktop 1366×820 (Mark) + WebKit iPhone 13 na výšku 390×844 (Radka).
//   Lidské časy: míření AIM_MIN–AIM_MAX s (výchozí 4–8), výběr ježka PICK_MIN–PICK_MAX s (2–4), stavba BUILD_MIN–BUILD_MAX s (5–9).
//   Chyba míření ±ERR_DEG° a ±ERR_POW (výchozí 4° a 6 %). Stavba místo střelby: když je král pod 60 % (šance 60 %) nebo náhodně 15 %.
//   Výstup: řádek na tah, tabulka partií (mapa, modifikátor, tahy, výstřely, stavby, minuty, vítěz), JSON v tests/out/<GAME>.json,
//   obrázky do $SHOTS (výchozí tests/shots-play).
const path = require("path"), fs = require("fs");
const PW = process.env.PW || path.join(process.env.APPDATA || "", "npm/node_modules/playwright");
const { chromium, webkit, devices } = require(PW);
let URL = process.argv[2] || "http://127.0.0.1:8793/";
URL += (URL.includes("?") ? "&" : "?") + "test";
const SHOTS = process.env.SHOTS || path.join(__dirname, "shots-play");
const num = (k, d) => +(process.env[k] ?? d);
const AIM = [num("AIM_MIN", 4), num("AIM_MAX", 8)], PICK = [num("PICK_MIN", 2), num("PICK_MAX", 4)], BUILD = [num("BUILD_MIN", 5), num("BUILD_MAX", 9)];
const ERR_DEG = num("ERR_DEG", 4), ERR_POW = num("ERR_POW", 0.06), GAMES = num("GAMES", 3), MAXT = num("MAXT", 24);
fs.mkdirSync(SHOTS, { recursive: true }); fs.mkdirSync(path.join(__dirname, "out"), { recursive: true });
const T = 30000, now = () => Date.now();
const info = p => p.evaluate(() => window.JPT && window.JPT.info());
const rr = (a, b) => a + Math.random() * (b - a);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const MAPN = { h: "Kopec", u: "Údolí s jezírkem", p: "Plošiny", s: "Skála" };
const modN = i => !i.md ? "bez" : i.md === "v" ? `vítr ${i.wd > 0 ? "→" : "←"}${Math.abs(i.wd)}` : { n: "noc", i: "mráz", g: "lehká gravitace" }[i.md];

(async () => {
  const bA = await chromium.launch(), bB = await webkit.launch();
  const A = await (await bA.newContext({ viewport: { width: 1366, height: 820 } })).newPage();
  const B = await (await bB.newContext({ ...devices["iPhone 13"], viewport: { width: 390, height: +process.env.BH || 844 } })).newPage();
  const errs = [];
  global.PAGES = { A, B };
  for (const [n, p] of [["A", A], ["B", B]]) p.on("pageerror", e => errs.push(n + ": " + e.message));
  const shot = (p, n) => p.screenshot({ path: path.join(SHOTS, n + ".png") });
  const hideBanner = async p => { if (await p.locator("#banner").isVisible()) await p.click("#banner").catch(() => {}); };

  await A.goto(URL); await A.waitForSelector("#setup:not([hidden])", { timeout: T });
  await A.fill("#nameX", "Mark"); await A.fill("#nameO", "Radka");
  await A.click('#starterSeg button[data-v="x"]'); await A.click("#setupSubmit");
  await A.waitForSelector("#share:not([hidden])", { timeout: T });
  const link = (await A.evaluate(() => location.href)).replace(/\?test/, "");
  await A.click("#backBtn");
  await B.goto(link.replace("#", "?test#")); await B.waitForSelector("#intro:not([hidden])", { timeout: T });
  await shot(B, "p00-vyzva-iphone");
  await B.click("#acceptBtn"); await B.waitForSelector("#hud:not([hidden])", { timeout: T });

  const games = [];
  for (let g = 1; g <= GAMES; g++) {
    await A.waitForFunction(() => { const i = window.JPT.info(); return i && i.ph !== "end" && !i.replay; }, null, { timeout: 60000 });
    const g0 = await info(A);
    await B.waitForFunction(id => { const i = window.JPT.info(); return i && i.sd === id; }, g0.sd, { timeout: 60000 });
    await sleep(1500); await shot(A, `p${g}0-start-desktop`); await shot(B, `p${g}1-start-iphone`);
    await hideBanner(A); await hideBanner(B);
    const rows = [];
    const t0 = now();
    let turns = 0;
    while (turns < MAXT) {
      const ia = await info(A);
      if (ia.ph === "end") break;
      const P = ia.p === "x" ? A : B, O = ia.p === "x" ? B : A, nm = ia.p === "x" ? "Mark" : "Radka", me = ia.p;
      await P.waitForFunction(() => document.title.startsWith("Jsi na tahu") || document.title.startsWith("Vybíráš"), null, { timeout: 60000 });
      await hideBanner(P);
      let ip = await info(P);
      const n0 = ip.n, tTurn = now();
      const myKing = ip.king[me] / 70;
      const canBuild = await P.evaluate(() => document.getElementById("modeBuild").getAttribute("aria-disabled") !== "true");
      const wantBuild = canBuild && ((myKing < 0.6 && Math.random() < 0.6) || Math.random() < 0.15);
      let kind = "s", detail = "";
      if (wantBuild) {
        kind = "b";
        await P.click("#modeBuild");
        await P.waitForFunction(() => window.JPT.ghost() && window.JPT.ghost().ok, null, { timeout: 8000 }).catch(() => {});
        const pieces = await P.$$eval("#pieces [data-k]", els => els.map(e => e.dataset.k));
        const want = pieces[Math.floor(Math.random() * pieces.length)];
        await P.click(`#pieces [data-k="${want}"]`);
        await sleep(rr(BUILD[0], BUILD[1]) * 1000);
        const gh = await P.evaluate(() => window.JPT.ghost());
        if (!gh || !gh.ok) { await P.click("#modeShoot"); kind = "s"; }
        else {
          if (turns < 4 || g === 1) await shot(P, `p${g}5-stavba-${nm}-${turns}`);
          detail = gh.kind;
          await P.click("#placeBtn");
        }
      }
      if (kind === "s") {
        const aimTarget = rr(AIM[0], AIM[1]) * 1000, tAim0 = now();
        const best = await P.evaluate(() => window.JPT.best(5000));
        const bestMs = now() - tAim0;
        const da = rr(-ERR_DEG, ERR_DEG) * Math.PI / 180, k = 1 + rr(-ERR_POW, ERR_POW);
        const dx = (best.dx * Math.cos(da) - best.dy * Math.sin(da)) * k, dy = (best.dx * Math.sin(da) + best.dy * Math.cos(da)) * k;
        const [sx, sy] = await P.evaluate(() => window.JPT.sling());
        const aimLeft = Math.max(1500, aimTarget - bestMs - 400), STEPS = 24, t0a = now();
        await P.mouse.move(sx, sy); await P.mouse.down();
        for (let i = 1; i <= STEPS; i++) {
          const q = i / STEPS, e = q < 0.6 ? 0.35 * (q / 0.6) : 0.35 + 0.65 * ((q - 0.6) / 0.4) ** 0.8, wob = (1 - q) * 14;
          await P.mouse.move(sx + dx * e + rr(-wob, wob), sy + dy * e + rr(-wob, wob));
          if (g === 1 && turns < 2 && i === 16) await shot(P, `p${g}2-mireni-${nm}`);
          await sleep(Math.max(20, (aimLeft * i / STEPS) - (now() - t0a)));
        }
        await P.mouse.move(sx + dx, sy + dy);
        detail = ip.hd[me];
        await P.mouse.up();
        // ověř, že ježek opravdu vyletěl; jinak záznam a jeden nový pokus (kamera se mohla ještě dorovnávat)
        const went = await P.waitForFunction(n => { const i = window.JPT.info(); return i.acting || i.n > n; }, n0, { timeout: 4000, polling: 50 }).then(() => true, () => false);
        if (!went) {
          const sl2 = await P.evaluate(() => ({ sling: window.JPT.sling(), cam: window.JPT.cam(), status: document.getElementById("status").textContent }));
          console.log("NEVYSTRELIL " + JSON.stringify({ hra: g, tah: turns + 1, kdo: nm, sling0: [sx, sy], dx, dy, ...sl2 }));
          await shot(P, `nevystrelil-${g}-${turns}`);
          const [tx, ty] = sl2.sling;
          await P.mouse.move(tx, ty); await P.mouse.down();
          for (let i = 1; i <= 12; i++) { await P.mouse.move(tx + dx * i / 12, ty + dy * i / 12); await sleep(40); }
          await P.mouse.up();
        }
        if (g === 1 && turns < 3) { await sleep(1300); await shot(P, `p${g}3-let-${nm}-${turns}`); }
      }
      await P.waitForFunction(n => { const i = window.JPT.info(); return i.n > n && !i.busy && !i.acting; }, n0, { timeout: 120000, polling: 50 });
      const tDone = now();
      await O.waitForFunction(n => { const i = window.JPT.info(); return i.n > n && !i.replay; }, n0, { timeout: 120000, polling: 50 });
      ip = await info(P);
      const row = { hra: g, tah: turns + 1, kdo: nm, akce: kind === "s" ? "střela" : "stavba", co: detail, s: +((tDone - tTurn) / 1000).toFixed(1),
        kral: `${Math.round(ip.king.x)}:${Math.round(ip.king.o)}`, jednotky: `${ip.alive.x}:${ip.alive.o}`, cb: ip.lastAct && ip.lastAct.cb || "", hl: ip.lastAct && ip.lastAct.hl ? ip.lastAct.hl.length : 0 };
      if (ip.ph === "pick") {
        await P.waitForSelector("#pickRow:not([hidden])", { timeout: T });
        if (g === 1 && turns < 2) await shot(P, `p${g}4-vyber-jezka-${nm}`);
        await sleep(rr(PICK[0], PICK[1]) * 1000);
        const avail = (await info(P)).pl[me === "x" ? "o" : "x"];
        const want = avail[Math.floor(Math.random() * avail.length)];
        await P.click(`#kinds [data-k="${want}"]`);
        await P.click("#sendBtn");
        await P.waitForFunction(() => { const i = window.JPT.info(); return i.ph !== "pick" && !i.busy; }, null, { timeout: 60000, polling: 50 });
        const tSync = now();
        await O.waitForFunction(() => { const i = window.JPT.info(); return i.ph !== "pick" && !i.replay; }, null, { timeout: 60000, polling: 50 });
        row.poslal = want; row.syncS = +((now() - tSync) / 1000).toFixed(1);
      }
      row.celkemS = +((now() - tTurn) / 1000).toFixed(1);
      rows.push(row); console.log(JSON.stringify(row));
      turns++;
      if ((await info(A)).ph === "end" || ip.ph === "end") break;
    }
    await A.waitForFunction(() => { const i = window.JPT.info(); return i.ph === "end" && !i.replay && !i.acting; }, null, { timeout: 120000 });
    await B.waitForFunction(() => { const i = window.JPT.info(); return i.ph === "end" && !i.replay && !i.acting; }, null, { timeout: 120000 });
    const fa = await info(A), min = (now() - t0) / 60000;
    const sum = { hra: g, mapa: MAPN[fa.map] || fa.map, modifikator: modN(fa), seed: fa.sd, tahu: rows.length, vystrelu: rows.filter(r => r.akce === "střela").length, staveb: rows.filter(r => r.akce === "stavba").length,
      minut: +min.toFixed(1), vitez: fa.win === "x" ? "Mark" : fa.win === "o" ? "Radka" : "remíza", jak: { k: "král padl", l: "po 8. tahu", r: "vzdání" }[fa.wy] || fa.wy,
      comeback: rows.filter(r => r.cb).map(r => r.cb).join(","), leceni: rows.reduce((s, r) => s + r.hl, 0), serie: fa.w.join(":"), tituly: fa.tt };
    games.push({ sum, rows });
    console.log("PARTIE " + JSON.stringify(sum));
    await sleep(1500); await shot(A, `p${g}8-konec-desktop`); await shot(B, `p${g}9-konec-iphone`);
    if (g < GAMES) {
      const L = fa.win === "x" ? B : A;   // odvetu zakládá poražený („Chci odvetu“)
      await L.click("#endPrimary");
      await A.waitForFunction(sd => window.JPT.info().sd !== sd && window.JPT.info().ph !== "end", fa.sd, { timeout: 60000 });
    }
  }
  console.log("\n| # | mapa | modifikátor | tahů | výstřelů | staveb | minut | vítěz | jak | comeback | série |");
  console.log("|---|---|---|---|---|---|---|---|---|---|---|");
  for (const { sum: s } of games) console.log(`| ${s.hra} | ${s.mapa} | ${s.modifikator} | ${s.tahu} | ${s.vystrelu} | ${s.staveb} | ${s.minut} | ${s.vitez} | ${s.jak} | ${s.comeback || "–"} | ${s.serie} |`);
  console.log("chyby stránky: " + (errs.length ? errs.join(" | ") : "žádné"));
  fs.writeFileSync(path.join(__dirname, "out", (process.env.GAME || "playtest") + ".json"), JSON.stringify({ games, errs }, null, 1));
  await bA.close(); await bB.close();
  process.exit(errs.length ? 1 : 0);
})().catch(async e => {
  console.error(e.message.split("\n")[0]);
  for (const [n, p] of Object.entries(global.PAGES || {})) {
    const d = await p.evaluate(() => ({ title: document.title, status: document.getElementById("status").textContent, info: window.JPT && window.JPT.info() })).catch(x => x.message);
    console.error(n, JSON.stringify(d));
    await p.screenshot({ path: path.join(SHOTS, "chyba-" + n + ".png") }).catch(() => {});
  }
  process.exit(2);
});
