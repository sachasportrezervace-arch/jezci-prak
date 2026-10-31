// Ladění fyziky a ježků.  node tests/tune.cjs
// 1) výchozí pevnost bez výstřelu musí stát, 2) rozložení výsledků výstřelů pro každý druh ježka z výchozí pevnosti.
const JP = require("../engine.js");
const init = JP.initialBodies();
{ const s = JP.sim(init); for (const it of s.items.values()) require("matter-js").Sleeping.set(it.b, false);
  while (s.step()); const r = s.result(); console.log("stabilita:", r.ticks, "tiků, ev:", r.ev || "(nic)", "x alive", JP.alive(r.bodies, "x"), "o alive", JP.alive(r.bodies, "o"));
  if (JP.alive(r.bodies, "x") !== 3 || JP.alive(r.bodies, "o") !== 3) { console.log("FAIL: výchozí pevnost nestojí"); process.exitCode = 1; } }
const NAMES = { n: "obyčejný", k: "kamenný", g: "gumový", b: "bouchací" };
let maxKf = 0;
for (const type of JP.HOG_ORDER) {
  const rows = [];
  for (let deg = 15; deg <= 70; deg += 5) for (let pow = 0.55; pow <= 1.0001; pow += 0.05) {
    const s = JP.sim(init); s.launch("x", -deg * Math.PI / 180, pow, type); while (s.step());
    const r = s.result();
    const ko = 3 - JP.alive(r.bodies, "o"), self = 3 - JP.alive(r.bodies, "x"), br = (r.ev.match(/(^|\|)b\./g) || []).length;
    maxKf = Math.max(maxKf, r.kf.length);
    rows.push({ ko, self, br, ticks: r.ticks, kf: r.kf.length, ev: r.ev.length });
  }
  const c = n => rows.filter(r => r.ko >= n).length;
  const avg = k => (rows.reduce((s, r) => s + r[k], 0) / rows.length).toFixed(0);
  console.log(`${NAMES[type].padEnd(9)} výstřelů ${rows.length}: KO≥1 ${c(1)}, KO≥2 ${c(2)}, KO=3 ${c(3)}, vlastní KO ${rows.filter(r => r.self).length}, prům. rozbito ${(rows.reduce((s, r) => s + r.br, 0) / rows.length).toFixed(1)}, tiků ${avg("ticks")}, kf prům ${avg("kf")} max ${Math.max(...rows.map(r => r.kf))} B, ev max ${Math.max(...rows.map(r => r.ev))} B`);
}
console.log("max kf", maxKf, "B (limit 28000)");
if (maxKf > 28000) { console.log("FAIL: klíčové snímky nad limit"); process.exitCode = 1; }
