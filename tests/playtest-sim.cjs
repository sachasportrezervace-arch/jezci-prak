// Odhad délky partie bez prohlížeče: celé partie jen na enginu (stejná fyzika jako ve hře).
// node tests/playtest-sim.cjs [počet_partií]
// Hráči:
//   bot    = nadlidsky přesný (nejlepší rána z mřížky, bez chyby)
//   clovek = nejlepší rána z hrubší mřížky + chyba úhlu ±4° a síly ±6 % (rovnoměrně)
//   nahodny = „zkouším to“: rána, která přistane v soupeřově pevnosti, výběr náhodný, chyba ±8° / ±12 %
// Twist: ježka na výstřel vybírá soupeř z dávky (obyčejný, kamenný, gumový, bouchací; každý jednou, než se dávka obnoví),
// v simulaci náhodně. Začínající hráč střílí obyčejným.
const JP = require("../engine.js");
const N = +process.argv[2] || 60;
let seed = +process.env.SEED || 12345;
const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const rr = (a, b) => a + (b - a) * rnd();

function play(type, init, me, ang, pow) {
  const s = JP.sim(init); s.launch(me, ang, pow, type); while (s.step());
  return s.result();
}
const angOf = (me, deg) => me === "x" ? -deg * Math.PI / 180 : -Math.PI + deg * Math.PI / 180;
function candidates(bodies, me, degStep, powStep, type) {
  const opp = me === "x" ? "o" : "x", out = [];
  for (let d = 10; d <= 72; d += degStep) for (let p = 0.5; p <= 1.0001; p += powStep) {
    const ang = angOf(me, d), r = play(type, bodies, me, ang, p);
    const ko = JP.alive(bodies, opp) - JP.alive(r.bodies, opp), self = JP.alive(bodies, me) - JP.alive(r.bodies, me);
    const hits = (r.ev.match(/(^|\|)b\./g) || []).length;
    out.push({ d, p, ang, ko, self, hits, score: ko * 10 - self * 15 + hits * 0.6 });
  }
  return out;
}
function choose(kind, bodies, me, type) {
  if (kind === "bot") { const c = candidates(bodies, me, 4, 0.03, type); c.sort((a, b) => b.score - a.score); return { ang: c[0].ang, pow: c[0].p }; }
  if (kind === "clovek") {
    const c = candidates(bodies, me, 5, 0.05, type); c.sort((a, b) => b.score - a.score);
    // člověk neumí nejlepší ránu najít jako stroj: bere jednu z nejlepších tří
    const pick = c[Math.floor(rnd() * 3)];
    const da = rr(-4, 4) * Math.PI / 180, dp = rr(-0.06, 0.06);
    return { ang: pick.ang + (me === "x" ? da : -da), pow: Math.max(0.12, Math.min(1, pick.p * (1 + dp))) };
  }
  // nahodny: tah, který aspoň doletí do soupeřovy pevnosti (slabá rána nic neudělá)
  const c = candidates(bodies, me, 6, 0.1, type).filter(x => x.score >= 0 && x.p >= 0.6);
  const pick = c[Math.floor(rnd() * c.length)] || { ang: angOf(me, 45), p: 0.8 };
  const da = rr(-8, 8) * Math.PI / 180, dp = rr(-0.12, 0.12);
  return { ang: pick.ang + (me === "x" ? da : -da), pow: Math.max(0.12, Math.min(1, pick.p * (1 + dp))) };
}
const give = (pool, to, t) => { let r = pool[to].replace(t, ""); if (!r) r = JP.HOG_ORDER.replace(t, ""); pool[to] = r; };
function game(kind, first) {
  let bodies = JP.initialBodies(), p = first, turns = 0, ticks = [], log = [];
  const per = { x: 0, o: 0 }, pool = { x: first === "x" ? "kgb" : JP.HOG_ORDER, o: first === "o" ? "kgb" : JP.HOG_ORDER };
  let type = "n";
  while (turns < 60) {
    const sh = choose(kind, bodies, p, type);
    const s = JP.sim(bodies); s.launch(p, sh.ang, sh.pow, type); while (s.step());
    const r = s.result(); ticks.push(r.ticks);
    const before = [JP.alive(bodies, "x"), JP.alive(bodies, "o")];
    bodies = r.bodies; per[p]++; turns++;
    log.push(`${p}${type}:${before.join("")}>${JP.alive(bodies, "x")}${JP.alive(bodies, "o")}`);
    if (JP.alive(bodies, "x") === 0 || JP.alive(bodies, "o") === 0) break;
    const to = p === "x" ? "o" : "x", pl = pool[to];
    type = pl.length === 1 ? pl : pl[Math.floor(rnd() * pl.length)];
    give(pool, to, type);
    p = to;
  }
  return { turns, per, ticks: ticks.filter(Boolean), win: JP.alive(bodies, "o") === 0 ? "x" : JP.alive(bodies, "x") === 0 ? "o" : "-", log };
}
const stat = a => { a = [...a].sort((x, y) => x - y); const m = a.reduce((s, v) => s + v, 0) / a.length; return `prům ${m.toFixed(1)} · medián ${a[a.length >> 1]} · min ${a[0]} · max ${a[a.length - 1]}`; };
for (const kind of (process.env.KINDS || "bot,clovek,nahodny").split(",")) {
  const t0 = Date.now(), G = [];
  const n = kind === "bot" ? Math.min(N, 30) : N;
  for (let i = 0; i < n; i++) G.push(game(kind, i % 2 ? "o" : "x"));
  const perPlayer = G.map(g => Math.ceil(g.turns / 2));
  const shotTicks = G.flatMap(g => g.ticks);
  const unfinished = G.filter(g => g.win === "-").length;
  console.log(`\n== ${kind} (${n} partií, ${((Date.now() - t0) / 1000).toFixed(0)} s)`);
  console.log(`  výstřelů celkem: ${stat(G.map(g => g.turns))}`);
  console.log(`  výstřelů na hráče (zhruba): ${stat(perPlayer)}`);
  console.log(`  doba letu a doznívání výstřelu: ${stat(shotTicks.map(t => Math.round(t / 60 * 10) / 10))} s`);
  console.log(`  nedohráno za 60 výstřelů: ${unfinished}, vyhrál první: ${(G.filter(g => g.win === (G.indexOf(g) % 2 ? "o" : "x")).length / n * 100).toFixed(0)} %`);
  console.log("  ukázka:", G[0].log.join(" "));
}
