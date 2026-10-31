// Ježkomet v2 – generátor pevností a partie ze seedu (bez DOM, stejné UMD jako engine.js).
// JPFort.gen(seed, opt) -> { bodies, sd, tries, fallback, F, king }  (obě strany, usazené, zrcadlové)
// JPFort.setup(seed, prev) -> { sd, map, md, wd }   mapa a modifikátor partie (odveta se liší od předchozí)
// Generuje jen klient zakladatele, ostatní berou tělesa z dokumentu, takže rozdíly mezi zařízeními nehrozí.
(function (root) {
  "use strict";
  const JP = root.JP || (typeof require === "function" ? require("./engine.js") : null);
  const { W, PY, FORT, KIND, UNIT } = JP;

  function mulberry32(a) {
    return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  }
  const pick = (rnd, list) => { const sum = list.reduce((s, x) => s + x[1], 0); let r = rnd() * sum; for (const [v, w] of list) { if ((r -= w) < 0) return v; } return list[list.length - 1][0]; };
  const nextSeed = sd => (Math.imul(sd, 1664525) + 1013904223) >>> 0;

  // váhy materiálu rámu podle patra: dřevo, kámen, sklo, led (kov v rámu není, jen kostky dole)
  const MATW = {
    bottom: [["w", 30], ["s", 60], ["g", 10], ["i", 0]],
    mid: [["w", 50], ["s", 25], ["g", 15], ["i", 10]],
    top: [["w", 40], ["s", 10], ["g", 25], ["i", 25]],
  };
  const MATW_ICE = {
    bottom: [["w", 30], ["s", 50], ["g", 5], ["i", 15]],
    mid: [["w", 30], ["s", 20], ["g", 10], ["i", 40]],
    top: [["w", 25], ["s", 5], ["g", 15], ["i", 55]],
  };
  const COL = { w: "wB", s: "sC", g: "gP", i: "iP" };
  const SLAB = { w: "wM", s: "sM", g: "gM", i: "iM" }, SLAB_END = { w: "wN", s: "sN", g: "gN", i: "iN" };
  // desky se potkávají ve středu sloupu; krajní desky sahají až pod krajní sloup
  const slabX = b => b === 0 ? (FORT.ax[0] - 11 + FORT.ax[1]) / 2 : b === 2 ? (FORT.ax[2] + FORT.ax[3] + 11) / 2 : (FORT.ax[1] + FORT.ax[2]) / 2;
  const MAX_BLOCKS = 34;

  // levá pevnost (tým x) v lokálních souřadnicích
  function layout(seed, opt) {
    const rnd = mulberry32(seed), ice = !!opt.ice, ax = FORT.ax;
    const F = pick(rnd, [[2, 45], [3, 55]]);
    const base = f => PY - f * FORT.pitch;
    const rowOf = f => f === 0 ? "bottom" : f === F - 1 ? "top" : "mid";
    const MW = ice ? MATW_ICE : MATW;
    const colM = [], slabM = [];
    for (let f = 0; f < F; f++) {
      colM.push(ax.map(() => pick(rnd, MW[rowOf(f)])));
      slabM.push([0, 1, 2].map(() => pick(rnd, MW[rowOf(f)])));
    }
    // král: zadní nebo střední zátoka, patro podle počtu pater; přední sloup jeho buňky je slabý (dřevo, sklo, led)
    const bk = pick(rnd, [[0, 50], [1, 50]]);
    const lk = F === 2 ? pick(rnd, [[0, 50], [1, 50]]) : pick(rnd, [[0, 35], [1, 35], [2, 30]]);
    if (colM[lk][bk + 1] === "s") colM[lk][bk + 1] = pick(rnd, [["w", 60], ["g", 25], ["i", 15]]);
    // sloty: buňky (f, b) a střechy (F, b)
    const slots = [];
    for (let f = 0; f <= F; f++) for (let b = 0; b < 3; b++) slots.push({ f, b, roof: f === F, unit: null });
    const slot = (f, b) => slots.find(s => s.f === f && s.b === b);
    const free = s => s && !s.unit;
    const nearest = (f, b) => slots.filter(free).sort((p, q) => (Math.abs(p.b - b) + Math.abs(p.f - f) * 1.2) - (Math.abs(q.b - b) + Math.abs(q.f - f) * 1.2) || (p.f - q.f) || (p.b - q.b))[0];
    slot(lk, bk).unit = "K";
    const put = (k, s, f0, b0) => { (free(s) ? s : nearest(f0, b0)).unit = k; };
    put("S", slot(lk, bk + 1), lk, bk + 1);
    { let t = null; for (let b = 2; b >= 0 && !t; b--) for (let f = lk; f >= 0 && !t; f--) if (free(slot(f, b))) t = slot(f, b); put("T", t, lk, 2); }
    put("L", bk > 0 ? slot(lk, bk - 1) : null, lk, bk);
    put("R", slot(F, 2), F, 2);
    { const fr = slots.filter(free); put("C", fr[Math.floor(rnd() * fr.length)], 0, 1); }
    // ledová deska nikdy nenese jednotku
    for (const s of slots) if (s.unit && s.f > 0 && slabM[s.f - 1][s.b] === "i") slabM[s.f - 1][s.b] = "w";

    const L = [];
    const add = (k, x, y, a = 0) => L.push({ k, x, y, a });
    for (let f = 0; f < F; f++) {
      for (let i = 0; i < 4; i++) add(COL[colM[f][i]], ax[i], base(f) - 48);
      for (let b = 0; b < 3; b++) add((b === 1 ? SLAB : SLAB_END)[slabM[f][b]], slabX(b), base(f) - 96 - 11);
    }
    // jednotky
    const units = [];
    for (const s of slots) if (s.unit) {
      const U = UNIT[s.unit], half = U.r || U.h / 2, x = (ax[s.b] + ax[s.b + 1]) / 2;
      units.push({ k: s.unit, x, y: base(s.f) - half, a: 0 });
    }
    // výplň volných buněk a atika
    let metal = 0;
    const cube = f => pick(rnd, MW[rowOf(f)]) === "s" ? "sB" : "wK";
    for (const s of slots) {
      if (s.unit || s.roof) continue;
      const x = (ax[s.b] + ax[s.b + 1]) / 2, y0 = base(s.f);
      const what = pick(rnd, [["", 30], ["1", 25], ["2", 20], ["g", 10], ["i", ice ? 25 : 10], ["m", 5]]);
      if (what === "1") add(cube(s.f), x, y0 - 23);
      else if (what === "2") { add(cube(s.f), x, y0 - 23); add(cube(s.f), x, y0 - 69); }
      else if (what === "g") { add("gP", x - 18, y0 - 48); add("gP", x + 18, y0 - 48); }
      else if (what === "i") { add("iP", x - 18, y0 - 48); add("iP", x + 18, y0 - 48); }
      else if (what === "m" && metal < 3) { add("mK", x, y0 - 20); metal++; }
    }
    const atika = Math.floor(rnd() * 4);
    const roofs = slots.filter(s => s.roof && !s.unit);
    for (let i = 0; i < atika && roofs.length; i++) {
      const s = roofs.splice(Math.floor(rnd() * roofs.length), 1)[0];
      add(rnd() < 0.6 ? "sB" : "wK", (ax[s.b] + ax[s.b + 1]) / 2, base(F) - 23);
    }
    while (L.length > MAX_BLOCKS) L.pop();
    return { F, king: { bay: bk, floor: lk }, blocks: L, units };
  }

  // záložní pevnost (tvar v1 přenesený na širší podstavec), kdyby žádný seed neprošel
  function fallbackLayout() {
    const ax = FORT.ax, P = PY, b = f => P - f * FORT.pitch, L = [], units = [];
    for (let f = 0; f < 2; f++) {
      ["sC", "wB", "wB", "sC"].forEach((k, i) => L.push({ k, x: ax[i], y: b(f) - 48, a: 0 }));
      for (let i = 0; i < 3; i++) L.push({ k: i === 1 ? (f ? "wM" : "sM") : (f ? "wN" : "sN"), x: slabX(i), y: b(f) - 107, a: 0 });
    }
    const c = i => (ax[i] + ax[i + 1]) / 2;
    units.push({ k: "K", x: c(0), y: b(0) - 24 }, { k: "S", x: c(1), y: b(0) - 25 }, { k: "T", x: c(2), y: b(0) - 30 },
      { k: "L", x: c(0), y: b(1) - 18 }, { k: "C", x: c(1), y: b(1) - 19 }, { k: "R", x: c(2), y: b(2) - 14 });
    L.push({ k: "sB", x: c(2), y: b(1) - 23, a: 0 });
    return { F: 2, king: { bay: 0, floor: 0 }, blocks: L, units: units.map(u => ({ ...u, a: 0 })) };
  }

  function toBodies(lay) {
    const left = [];
    let id = 1;
    for (const b of lay.blocks) left.push({ id: id++, k: b.k, t: "", x: b.x, y: b.y, a: b.a, hp: JP.MAT[KIND[b.k].m].hp });
    for (const u of lay.units) { const b = { id: id++, k: u.k, t: "x", x: u.x, y: u.y, a: 0, hp: UNIT[u.k].hp }; if (JP.zMax(u.k)) b.z = JP.zMax(u.k); left.push(b); }
    return left;
  }
  // usazení: pevnost postavit, nechat stát až 240 tiků (vše vzhůru); posun < 3 px, natočení < 0,03, nic se nesmí poškodit
  function settle(left, env) {
    const s = JP.sim(left, { awake: true, env });
    let n = 0; while (n < 240 && s.step()) n++;
    const after = new Map(s.view().map(b => [b.id, b]));
    let ok = after.size === left.length, maxD = 0, maxA = 0;
    for (const b of left) {
      const a = after.get(b.id);
      if (!a) { ok = false; continue; }
      const d = Math.hypot(a.x - b.x, a.y - b.y), da = Math.abs(a.a - b.a);
      maxD = Math.max(maxD, d); if (!(JP.isUnit(b.k) && JP.UNIT[b.k].r)) maxA = Math.max(maxA, da);
      const round = JP.isUnit(b.k) && JP.UNIT[b.k].r;
      if (Math.abs(a.x - b.x) >= (round ? 8 : 3) || Math.abs(a.y - b.y) >= 5 || (!round && da >= 0.03) || a.hp < b.hp - 0.01) ok = false;
    }
    const r = s.result();
    return { ok, maxD, maxA, bodies: r.bodies.map(b => ({ ...b, hp: JP.maxOf(b), ...(JP.zMax(b.k) ? { z: JP.zMax(b.k) } : {}) })) };
  }
  function mirror(left) {
    const n = left.length;
    const right = left.map(b => ({ ...b, id: b.id + n, x: Math.round((W - b.x) * 10) / 10, a: b.a ? -b.a : 0, t: b.t ? "o" : "" }));
    return [...left, ...right];
  }

  function gen(seed, opt = {}) {
    const t0 = Date.now();
    let sd = seed >>> 0;
    for (let tries = 1; tries <= 12; tries++) {
      const lay = layout(sd, opt);
      const left = toBodies(lay);
      if (left.length <= 40) {
        const st = settle(left, opt.env);
        if (st.ok) return { bodies: mirror(st.bodies), sd, tries, fallback: false, F: lay.F, king: lay.king, ms: Date.now() - t0, maxD: st.maxD };
      }
      sd = nextSeed(sd);
    }
    const lay = fallbackLayout(), st = settle(toBodies(lay), opt.env);
    return { bodies: mirror(st.bodies), sd: seed >>> 0, tries: 13, fallback: true, F: lay.F, king: lay.king, ms: Date.now() - t0, maxD: st.maxD };
  }

  // mapa a modifikátor partie ze seedu; odveta (prev) dostane jinou mapu a jiný modifikátor než předchozí partie
  const MAP_IDS = ["h", "u", "p", "s"];
  const MODS = [["", 28], ["v", 22], ["n", 16], ["i", 16], ["g", 18]];
  function setup(seed, prev) {
    const rnd = mulberry32(seed ^ 0x9E3779B9);
    let map = MAP_IDS[Math.floor(rnd() * 4)], md = pick(rnd, MODS);
    if (prev && prev.map === map) map = MAP_IDS[(MAP_IDS.indexOf(map) + 1 + Math.floor(rnd() * 3)) % 4];
    if (prev && prev.md === md) md = pick(rnd, MODS.filter(m => m[0] !== md));
    const wd = md === "v" ? (rnd() < 0.5 ? -1 : 1) * (1 + Math.floor(rnd() * 3)) : 0;
    return { sd: seed >>> 0, map, md, wd };
  }

  const JPFort = { gen, setup, mulberry32, nextSeed, layout, fallbackLayout, MAP_IDS };
  if (typeof module !== "undefined") module.exports = JPFort;
  else root.JPFort = JPFort;
})(typeof window !== "undefined" ? window : globalThis);
