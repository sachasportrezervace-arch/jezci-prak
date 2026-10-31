// Generátor pevností přes mnoho seedů: úspěšnost, počet pokusů, těles, čas, usazení, rozložení map a modifikátorů.
// node tests/gen.cjs [počet_seedů]
const JP = require("../engine.js");
const JPFort = require("../fort.js");
const N = +process.argv[2] || 200;
let ok3 = 0, fb = 0, maxBodies = 0, maxMs = 0, sumMs = 0, maxD = 0, floors = { 2: 0, 3: 0 };
const tries = {}, maps = {}, mods = {}, kinds = {};
for (let i = 0; i < N; i++) {
  const seed = (Math.imul(i + 1, 2654435761) >>> 0);
  const su = JPFort.setup(seed);
  maps[su.map] = (maps[su.map] || 0) + 1; mods[su.md || "-"] = (mods[su.md || "-"] || 0) + 1;
  const g = JPFort.gen(seed, { ice: su.md === "i", env: su });
  tries[g.tries] = (tries[g.tries] || 0) + 1;
  if (g.tries <= 3) ok3++;
  if (g.fallback) fb++;
  floors[g.F]++;
  const left = g.bodies.filter(b => b.x < JP.W / 2);
  maxBodies = Math.max(maxBodies, left.length); maxMs = Math.max(maxMs, g.ms); sumMs += g.ms; maxD = Math.max(maxD, g.maxD);
  for (const b of left) kinds[b.k] = (kinds[b.k] || 0) + 1;
  // zrcadlo: stejný počet a tvary
  const right = g.bodies.filter(b => b.x > JP.W / 2);
  if (right.length !== left.length || JP.alive(g.bodies, "x") !== 6 || JP.alive(g.bodies, "o") !== 6 || !JP.kingOf(g.bodies, "x")) { console.log("FAIL seed", seed); process.exitCode = 1; }
}
console.log(`seedů ${N}: do 3 pokusů ${(ok3 / N * 100).toFixed(1)} %, záložní ${fb}, pokusy ${JSON.stringify(tries)}, patra ${JSON.stringify(floors)}`);
console.log(`těles na stranu max ${maxBodies}, čas prům ${(sumMs / N).toFixed(0)} ms max ${maxMs} ms, usazení max posun ${maxD.toFixed(2)} px`);
console.log("mapy", JSON.stringify(maps), "modifikátory", JSON.stringify(mods));
console.log("druhy", JSON.stringify(kinds));
if (ok3 / N < 0.95) { console.log("FAIL: méně než 95 % seedů do 3 pokusů"); process.exitCode = 1; }
if (maxBodies > 40) { console.log("FAIL: víc než 40 těles na stranu"); process.exitCode = 1; }
