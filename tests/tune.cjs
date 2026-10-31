const JP = require("../engine.js");
const init = JP.initialBodies();
// 1) stabilita: probudit vše bez výstřelu
{ const s = JP.sim(init); for (const it of s.items.values()) require("matter-js").Sleeping.set(it.b, false);
  while (s.step()); const r = s.result(); console.log("stabilita:", r.ticks, "tiků, ev:", r.ev || "(nic)", "x alive", JP.alive(r.bodies,"x"), "o alive", JP.alive(r.bodies,"o")); }
// 2) sweep výstřelů hráče x
let best = [];
for (let deg = 15; deg <= 70; deg += 5) for (let pow = 0.55; pow <= 1.0001; pow += 0.05) {
  const s = JP.sim(init); s.launch("x", -deg * Math.PI / 180, pow); while (s.step());
  const r = s.result();
  const ko = 3 - JP.alive(r.bodies, "o"), self = 3 - JP.alive(r.bodies, "x"), br = (r.ev.match(/(^|\|)b\./g) || []).length;
  best.push({ deg, pow: pow.toFixed(2), ko, self, br, ticks: r.ticks, kf: r.kf.length });
}
console.log(best.filter(b => b.ko || b.br || b.self).map(b => `${b.deg}° ${b.pow}: KO ${b.ko} self ${b.self} rozbito ${b.br} tiků ${b.ticks} kf ${b.kf}`).join("\n"));
console.log("max kf", Math.max(...best.map(b => b.kf)), "trefy", best.filter(b=>b.ko).length, "/", best.length);
