// Ladění fyziky v2.  node tests/tune.cjs [počet_seedů]
// 1) generované pevnosti bez výstřelu stojí (spící tělesa i po probuzení), přes mnoho seedů a všechny mapy;
// 2) rozložení výsledků mřížkových výstřelů pro každý druh ježka: zásah krále, král jednou ranou, vyřazení, vlastní ztráty,
//    odraz Tlusťochem, úskok Skokana, štít; 3) limit klíčových snímků (24 kB); 4) přehrání = simulace (determinismus).
const JP = require("../engine.js");
const JPFort = require("../fort.js");
const S = +process.argv[2] || 6;
const NAMES = { n: "obyčejný", k: "kamenný", g: "gumový", b: "bouchací", s: "špičák" };
let fail = 0;
const bad = m => { fail++; console.log("FAIL:", m); };

// 1) stabilita přes mnoho seedů (rychlé: jen pevnost bez výstřelu, vše probuzené)
{
  let moved = 0, worst = 0;
  for (let i = 0; i < 60; i++) {
    const seed = Math.imul(i + 7, 2246822519) >>> 0, su = JPFort.setup(seed), g = JPFort.gen(seed, { ice: su.md === "i", env: su });
    const s = JP.sim(g.bodies, { awake: true, env: su }); let n = 0; while (n < 300 && s.step()) n++;
    const after = new Map(s.view().map(b => [b.id, b]));
    let lost = 0, mx = 0;
    for (const b of g.bodies) { const a = after.get(b.id); if (!a) { lost++; continue; } mx = Math.max(mx, Math.abs(a.x - b.x) + Math.abs(a.y - b.y)); }
    worst = Math.max(worst, mx);
    if (lost || mx > 6) moved++;
  }
  console.log(`stabilita: 60 seedů (mapy i modifikátory), pevnost se pohnula nebo něco spadlo u ${moved}, největší posun ${worst.toFixed(1)} px`);
  if (moved > 1) bad("pevnosti nestojí");
}

// 2) mřížkové výstřely
const agg = {};
let maxKf = 0, maxDoc = 0, detOk = 0, detN = 0;
for (let si = 0; si < S; si++) {
  const seed = Math.imul(si + 101, 2654435761) >>> 0, su = JPFort.setup(seed), g = JPFort.gen(seed, { ice: su.md === "i", env: su });
  const init = g.bodies, kingO = JP.kingOf(init, "o");
  for (const type of JP.HOG_ORDER) {
    const A = agg[type] = agg[type] || { shots: 0, kingHit: 0, kingKill: 0, ko1: 0, ko2: 0, self: 0, bounce: 0, bounceHome: 0, dodge: 0, rNear: 0, shield: 0, ticks: 0, kf: 0 };
    for (let deg = 12; deg <= 72; deg += 6) for (let pow = 0.6; pow <= 1.0001; pow += 0.08) {
      const s = JP.sim(init, { env: su }); s.launch("x", -deg * Math.PI / 180, pow, type);
      let hogMaxX = 0, rMin = 1e9, rObs = null;
      while (s.step()) {
        const h = s.hogView(); if (!h) continue;
        hogMaxX = Math.max(hogMaxX, h.x);
        for (const it of s.items.values()) if (it.k === "R" && it.t === "o") { const d = Math.hypot(it.b.position.x - h.x, it.b.position.y - h.y); if (d < rMin) rMin = d; }
      }
      const r = s.result(), ev = JP.decEvents(r.ev);
      const k1 = JP.kingOf(r.bodies, "o");
      A.shots++; A.ticks += r.ticks; A.kf = Math.max(A.kf, r.kf.length); maxKf = Math.max(maxKf, r.kf.length);
      if (!k1 || k1.hp < kingO.hp) A.kingHit++;
      if (!k1) A.kingKill++;
      const koO = ev.filter(e => e.type === "k" && e.m === "o").length, koX = ev.filter(e => e.type === "k" && e.m === "x").length;
      if (koO >= 1) A.ko1++; if (koO >= 2) A.ko2++; if (koX) A.self++;
      const rb = ev.find(e => e.type === "r");
      if (rb) { A.bounce++; const xEv = ev.find(e => e.type === "x"); if (xEv && xEv.x < JP.W / 2) A.bounceHome++; }
      if (rMin < 70) { A.rNear++; if (ev.some(e => e.type === "j")) A.dodge++; }
      if (ev.some(e => e.type === "z")) A.shield++;
      // dokument: tělesa + jedna akce
      const doc = JSON.stringify({ g: { b: JP.packBodies(r.bodies), h: [{ kf: r.kf, ev: r.ev, b0: JP.packBodies(init) }] } });
      maxDoc = Math.max(maxDoc, doc.length);
      // přehrání u soupeře skončí ve stejném stavu jako simulace střelce
      if ((deg + Math.round(pow * 100)) % 5 === 0) {
        detN++;
        const rp = JP.replay(init, r.kf, r.ev), v = new Map(rp.view(rp.end + 1).map(b => [b.id, b]));
        const same = r.bodies.every(b => { const q = v.get(b.id); return q && Math.abs(q.x - b.x) <= 1.5 && Math.abs(q.y - b.y) <= 1.5; }) && v.size === r.bodies.length;
        if (same) detOk++;
      }
    }
  }
}
const pct = (a, b) => (b ? (a / b * 100).toFixed(0) : "-") + " %";
for (const t of JP.HOG_ORDER) {
  const A = agg[t];
  console.log(`${NAMES[t].padEnd(9)} ${A.shots} ran: král zasažen ${pct(A.kingHit, A.shots)}, král padl ${pct(A.kingKill, A.shots)}, KO≥1 ${pct(A.ko1, A.shots)}, KO≥2 ${pct(A.ko2, A.shots)}, vlastní ztráta ${pct(A.self, A.shots)}, odraz T ${A.bounce} (domů ${A.bounceHome}), skokan uhnul ${A.dodge}/${A.rNear}, štít ${A.shield}, tiků prům ${(A.ticks / A.shots).toFixed(0)}, kf max ${A.kf} B`);
}
console.log(`max kf ${maxKf} B (limit 24000), největší dokument ~${(maxDoc / 1024).toFixed(1)} kB (limit 60 kB), přehrání = simulace ${detOk}/${detN}`);
if (maxKf > 24000) bad("klíčové snímky nad 24 kB");
if (maxDoc > 60000) bad("dokument nad 60 kB");
if (detOk < detN) bad("přehrání se liší od simulace");
const allKill = JP.HOG_ORDER.split("").reduce((s, t) => s + agg[t].kingKill, 0), allShots = JP.HOG_ORDER.split("").reduce((s, t) => s + agg[t].shots, 0);
console.log(`král padl jednou ranou celkem ${pct(allKill, allShots)}`);
process.exitCode = fail ? 1 : 0;
