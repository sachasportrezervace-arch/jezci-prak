// Odhad délky a vyváženosti partie v2 bez prohlížeče: celé partie jen na enginu (stejná fyzika a pravidla jako ve hře).
// node tests/playtest-sim.cjs [počet_partií]      KINDS=clovek,nahodny  SEED=…
// Hráči:
//   clovek  = jedna z nejlepších tří ran hrubé mřížky + chyba úhlu ±4° a síly ±6 %; staví, když je král pod 55 % nebo má
//             slabého ježka a stavbu (a náhodně ~15 %), soupeři vybírá ježka náhodně z dávky
//   nahodny = rána, která aspoň doletí do soupeřovy pevnosti, chyba ±8° / ±12 %, staví náhodně
// Čas tahu (odhad z playtestu v1 a designu): míření 6 s + let a doznívání (tiky / 60, doznívání zrychlené) + výběr 3 s + síť 2 s;
// stavba 9 s. Výstup: tahy, výstřely, stavby, minuty, konec králem / limitem, remízy, výhra prvního, druhy ježků.
const JP = require("../engine.js");
const JPFort = require("../fort.js");
const N = +process.argv[2] || 30;
let seed = +process.env.SEED || 12345;
const rnd = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
const rr = (a, b) => a + (b - a) * rnd();
const other = t => t === "x" ? "o" : "x";
const angOf = (me, deg) => me === "x" ? -deg * Math.PI / 180 : -Math.PI + deg * Math.PI / 180;

function shotScore(before, after, me) {
  const opp = other(me), k0 = JP.kingOf(before, opp), k1 = JP.kingOf(after, opp), m0 = JP.kingOf(before, me), m1 = JP.kingOf(after, me);
  let s = 0;
  if (!k1) s += 1000; else s += (k0.hp - k1.hp) * 3;
  if (!m1) s -= 2000; else s -= (m0.hp - m1.hp) * 3;
  s += (JP.alive(before, opp) - JP.alive(after, opp)) * 25 - (JP.alive(before, me) - JP.alive(after, me)) * 30;
  const hp = (bs, t) => bs.filter(b => JP.isUnit(b.k) && b.t === t).reduce((a, b) => a + b.hp, 0);
  s += (hp(before, opp) - hp(after, opp)) * 0.6;
  s += (before.filter(b => !b.t && b.x * (opp === "o" ? 1 : -1) > 0).length - after.length + before.length) * 0;   // místo pro váhu kostek
  const blk = bs => bs.filter(b => !JP.isUnit(b.k) && (opp === "o" ? b.x > JP.W / 2 : b.x < JP.W / 2)).length;
  s += (blk(before) - blk(after)) * 2;
  return s;
}
function shoot(bodies, me, ang, pow, type, env) { const s = JP.sim(bodies, { env }); s.launch(me, ang, pow, type); while (s.step()); return s.result(); }
function choose(kind, bodies, me, type, env) {
  const step = kind === "clovek" ? [6, 0.08] : [8, 0.1];
  const out = [];
  for (let d = 12; d <= 72; d += step[0]) for (let p = 0.6; p <= 1.0001; p += step[1]) {
    const ang = angOf(me, d), r = shoot(bodies, me, ang, p, type, env);
    out.push({ ang, p, score: shotScore(bodies, r.bodies, me) });
  }
  out.sort((a, b) => b.score - a.score);
  if (kind === "clovek") {
    const pick = out[Math.floor(rnd() * 3)];
    const da = rr(-4, 4) * Math.PI / 180, dp = rr(-0.06, 0.06);
    return { ang: pick.ang + da, pow: Math.max(0.12, Math.min(1, pick.p * (1 + dp))) };
  }
  const ok = out.filter(x => x.score > 0);
  const pick = ok[Math.floor(rnd() * ok.length)] || out[Math.floor(rnd() * out.length)];
  const da = rr(-8, 8) * Math.PI / 180, dp = rr(-0.12, 0.12);
  return { ang: pick.ang + da, pow: Math.max(0.12, Math.min(1, pick.p * (1 + dp))) };
}
// stavba botem: díl co nejblíž před králem (směrem k soupeři), platné místo podle JP.canPlace
function buildSpot(bodies, me) {
  const K = JP.kingOf(bodies, me); if (!K) return null;
  const dir = me === "x" ? 1 : -1, [z0, z1] = JP.ZONE[me];
  let best = null;
  for (const kind of ["mS", "sB", "wP"]) for (const rot of [0, 1]) {
    const { w } = JP.pieceDims(kind, rot);
    for (let x = z0 + w / 2; x <= z1 - w / 2; x += 8) for (let yh = JP.PY - 420; yh <= JP.PY; yh += 30) {
      const y = JP.restY(bodies, me, kind, rot, x, yh);
      if (!JP.canPlace(bodies, me, kind, x, y, rot).ok) continue;
      const score = -Math.abs(x - (K.x + dir * 60)) - Math.abs(y - K.y) * 0.6 + (kind === "mS" ? 20 : 0);
      if (!best || score > best.score) best = { kind, x, y, rot, score };
    }
  }
  return best;
}
const WEAK = "gn";
function game(kind, first, gseed, prev) {
  const su = JPFort.setup(gseed, prev), env = su, g0 = JPFort.gen(gseed, { ice: su.md === "i", env });
  let bodies = g0.bodies, p = first, n = 0, shots = 0, builds = 0, secs = 0, cbUsed = 0;
  const hd = { [first]: "n", [other(first)]: "" }, pl = { [first]: "kgbs", [other(first)]: JP.HOG_ORDER };
  const bs = { [first]: JP.RULES.builds[0], [other(first)]: JP.RULES.builds[1] }, lb = { x: 0, o: 0 }, cb = { x: 0, o: 0 }, picks = {};
  let res = null, kingFall = 0;
  const log = [];
  while (!res) {
    const canBuild = bs[p] > 0 && !lb[p] && JP.turnNo(n) >= JP.RULES.buildFrom;
    const wantBuild = canBuild && (JP.kingFrac(bodies, p) < 0.55 || WEAK.includes(hd[p]) && rnd() < 0.5 || rnd() < (kind === "nahodny" ? 0.25 : 0.12));
    let spot = wantBuild ? buildSpot(bodies, p) : null;
    const before = bodies;
    if (spot) {
      const s = JP.sim(bodies, { env }); s.place(p, spot.kind, spot.x, spot.y, spot.rot); while (s.step());
      bodies = s.result().bodies; bs[p]--; lb[p] = 1; builds++; secs += 9; log.push(p + "B");
    } else {
      const c = choose(kind, bodies, p, hd[p], env), r = shoot(bodies, p, c.ang, c.pow, hd[p], env);
      bodies = r.bodies; shots++; lb[p] = 0; secs += 6 + Math.min(r.ticks, 400) / 60 * 0.8 + 0.6 + 2;
      if (r.ev.includes("k.") && JP.decEvents(r.ev).some(e => e.type === "k" && e.u === "K" && e.y > JP.GY - 40)) kingFall++;
      log.push(p + hd[p]); hd[p] = "";
    }
    n++;
    res = JP.outcome(bodies, p, n);
    if (res) break;
    const q = other(p);
    JP.heal(bodies, q);
    if (!cb[q] && JP.behind(bodies, q)) { cb[q] = 1; bs[q]++; lb[q] = 0; cbUsed++; }
    if (!hd[q]) {
      const pool = pl[q], t = pool.length === 1 ? pool : pool[Math.floor(rnd() * pool.length)];
      hd[q] = t; picks[t] = (picks[t] || 0) + 1;
      let rest = pool.replace(t, ""); if (!rest) rest = JP.HOG_ORDER.replace(t, ""); pl[q] = rest;
      if (pool.length > 1) secs += 3;
    }
    p = q;
  }
  return { n, shots, builds, min: secs / 60, win: res.win, wy: res.wy, first, kingFall, cbUsed, picks, map: su.map, md: su.md, log: log.join(" ") };
}
const q = (a, f) => { a = [...a].sort((x, y) => x - y); return a[Math.min(a.length - 1, Math.floor(a.length * f))]; };
const avg = a => a.reduce((s, v) => s + v, 0) / (a.length || 1);
for (const kind of (process.env.KINDS || "clovek").split(",")) {
  const t0 = Date.now(), G = [];
  let prev = null;
  for (let i = 0; i < N; i++) { const gs = Math.floor(rnd() * 2 ** 32); const g = game(kind, i % 2 ? "o" : "x", gs, prev); prev = { map: g.map, md: g.md }; G.push(g); if (process.env.V) console.log(JSON.stringify(g)); }
  const k = G.filter(g => g.wy === "k").length, draw = G.filter(g => g.win === "=").length, firstWin = G.filter(g => g.win === g.first).length;
  const picks = {}; for (const g of G) for (const [t, c] of Object.entries(g.picks)) picks[t] = (picks[t] || 0) + c;
  const allPicks = Object.values(picks).reduce((s, v) => s + v, 0);
  console.log(`\n== ${kind} (${N} partií, ${((Date.now() - t0) / 1000).toFixed(0)} s, TUNE ${JSON.stringify(JP.TUNE)}, král ${JP.KING_HP})`);
  console.log(`  tahů: medián ${q(G.map(g => g.n), 0.5)}, 90. perc. ${q(G.map(g => g.n), 0.9)}; výstřelů prům ${avg(G.map(g => g.shots)).toFixed(1)}; staveb ${(avg(G.map(g => g.builds / g.n)) * 100).toFixed(0)} % tahů`);
  console.log(`  minut: medián ${q(G.map(g => g.min), 0.5).toFixed(1)}, prům ${avg(G.map(g => g.min)).toFixed(1)}, 10.–90. perc. ${q(G.map(g => g.min), 0.1).toFixed(1)}–${q(G.map(g => g.min), 0.9).toFixed(1)}`);
  console.log(`  konec králem ${(k / N * 100).toFixed(0)} %, remíza ${(draw / N * 100).toFixed(0)} %, výhra prvního ${(firstWin / (N - draw || 1) * 100).toFixed(0)} %, král padl pádem ${G.reduce((s, g) => s + g.kingFall, 0)} z ${k}, comeback využit ${G.reduce((s, g) => s + g.cbUsed, 0)}×`);
  console.log(`  ježci od soupeře: ${Object.entries(picks).map(([t, c]) => t + " " + (c / allPicks * 100).toFixed(0) + " %").join(", ")}`);
  console.log("  ukázka:", G[0].log);
}
