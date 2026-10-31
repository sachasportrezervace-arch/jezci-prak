// Ježkomet v2 – fyzikální jádro (bez DOM). Matter.js 0.19.0 (vendor/).
// Autoritou je střelec: jeho klient spustí simulaci, nahraje klíčové snímky a konečný stav.
// Druhý hráč nesimuluje, jen přehraje snímky (JP.replay) a převezme konečný stav.
// v2: král a 5 druhů jednotek (K C T S R L), 5 materiálů (dřevo, kámen, sklo, led, kov), 5 ježků (n k g b s),
// stavba jednoho dílu (place) a léčení na začátku tahu (heal). Pevnosti generuje fort.js.
(function (root) {
  "use strict";
  const M = root.Matter || (typeof require === "function" ? require("matter-js") : null);
  const { Engine, Bodies, Body, Composite, Events, Sleeping } = M;

  const W = 1400, GY = 880, PLINTH = 30, PY = GY - PLINTH;
  const G = 0.001 * (1000 / 60) ** 2;             // zrychlení na krok (stejné jako Matter)
  const VMAX = 20;                                // rychlost ježka při plném napnutí (jednotky / krok)
  const HOG_R = 17, CR = 19;
  const SLING = { x: { x: 430, y: 748 }, o: { x: W - 430, y: 748 } };
  // podstavec = zóna stavby (v2 širší: 60–380 a zrcadlově)
  const PLINTHS = { x: [60, 380], o: [W - 380, W - 60] };
  const ZONE = PLINTHS;
  const BUILD_H = 440;                            // stavět jde do této výšky nad podstavcem (pevnost má až 3 patra)
  const HILL = { x: W / 2, y: GY + 190, r: 330 };
  const MAX_TICKS = 660, PLACE_TICKS = 90;
  // mřížka pevnosti (tým x; tým o je zrcadlo x → W − x): osy sloupů, patro 96 + deska 22
  const FORT = { ax: [74, 170, 266, 362], cell: 96, slab: 22, pitch: 118 };

  // ladění (sekce 9 designu): násobky poškození z nárazů pro jednotky a kostky
  const TUNE = { dmg: 0.42, blk: 1, kingCap: 0.55 };

  // materiály
  const MAT = {
    w: { density: 0.0011, friction: 0.7, restitution: 0.05, hp: 26 },   // dřevo
    s: { density: 0.0032, friction: 0.8, restitution: 0.02, hp: 70 },   // kámen
    g: { density: 0.0009, friction: 0.4, restitution: 0.1, hp: 9 },     // sklo
    i: { density: 0.0009, friction: 0.03, restitution: 0.05, hp: 14 },  // led (klouže)
    m: { density: 0.0045, friction: 0.6, restitution: 0.03, hp: 80 },   // kov
  };
  // druhy kostek: materiál + tvar.  Sloupy 22×96 (sklo a led 20×96), desky 96×22 (krajní 107×22: nesou celý krajní sloup), kostky, díly stavby.
  const KIND = {
    wP: { m: "w", w: 130, h: 22 }, wL: { m: "w", w: 230, h: 22 }, wB: { m: "w", w: 22, h: 96 },
    sB: { m: "s", w: 46, h: 46 }, gP: { m: "g", w: 20, h: 96 }, gS: { m: "g", w: 96, h: 18 },
    sC: { m: "s", w: 22, h: 96 }, iP: { m: "i", w: 20, h: 96 },
    wM: { m: "w", w: 96, h: 22 }, sM: { m: "s", w: 96, h: 22 }, gM: { m: "g", w: 96, h: 22 }, iM: { m: "i", w: 96, h: 22 },
    wN: { m: "w", w: 107, h: 22 }, sN: { m: "s", w: 107, h: 22 }, gN: { m: "g", w: 107, h: 22 }, iN: { m: "i", w: 107, h: 22 },
    wK: { m: "w", w: 46, h: 46 }, mK: { m: "m", w: 40, h: 40 },
    mS: { m: "m", w: 18, h: 72 },
  };
  // jednotky: r = kruh, w×h = obdélník (Štítonoš); hp životy; z = zásoba (štít, úskoky, léčení)
  const UNIT = {
    K: { r: 24, d: 0.0013, hp: 60 },              // král
    C: { r: 19, d: 0.0012, hp: 30 },              // strážník
    T: { r: 30, d: 0.0022, hp: 50 },              // tlusťoch (odráží ježky)
    S: { w: 30, h: 50, d: 0.0014, hp: 34, z: 45 },// štítonoš (štít zepředu)
    R: { r: 14, d: 0.0013, hp: 18, z: 3 },        // skokan (uskočí)
    L: { r: 18, d: 0.0012, hp: 24, z: 24 },       // léčitel
  };
  const UNIT_ORDER = "KSTLRC";
  const isUnit = k => k.length === 1 && !!UNIT[k];
  const KING_HP = UNIT.K.hp, CRITTER_HP = UNIT.C.hp;
  const T_BOUNCE = 0.8, T_DMG = 0.6;
  const DODGE = { d: 70, vx: 3.2, vy: -5.5, edge: 40, speed: 5 };
  const HEAL = { amount: 6, range: 170 };
  const SHIELD_S = 2.5, BOOM_SHIELD = 0.5;
  // ježci: r poloměr, d hustota, rest odrazivost, v násobek rychlosti; boom = vybuchne, pierce = zabodne se (neodrazí ho Tlusťoch)
  const HOGS = {
    n: { r: 17, d: 0.00397, rest: 0.3, v: 1 },
    k: { r: 19, d: 0.0095, rest: 0.06, v: 0.84, heavy: true },
    g: { r: 17, d: 0.00264, rest: 0.9, v: 1 },
    b: { r: 17, d: 0.00397, rest: 0.2, v: 1, boom: true },
    s: { r: 12, d: 0.00796, rest: 0.05, v: 1.12, pierce: true },
  };
  const HOG_ORDER = "nkgbs";
  const hogOf = t => HOGS[t] || HOGS.n;
  const BOOM_R = 150;
  // díly stavby (pořadí v liště: Štít, Blok, Trám)
  const BUILD = ["mS", "sB", "wP"];

  const r1 = v => Math.round(v * 10) / 10;
  const maxOf = b => isUnit(b.k) ? UNIT[b.k].hp : MAT[KIND[b.k].m].hp;
  const zMax = k => (UNIT[k] && UNIT[k].z) || 0;

  // stav do dokumentu: [id, druh, x*10, y*10, úhel*1000, životy(, zásoba)] (jednotky mají druh + tým: "Kx", "So"…)
  const packBodies = bs => bs.map(b => {
    const row = [b.id, isUnit(b.k) ? b.k + b.t : b.k, Math.round(b.x * 10), Math.round(b.y * 10), Math.round(b.a * 1000), Math.max(1, Math.round(b.hp))];
    if (zMax(b.k)) row.push(Math.max(0, Math.round(b.z || 0)));
    return row;
  });
  function unpackBodies(arr) {
    if (!Array.isArray(arr)) return null;
    const out = [];
    for (const r of arr.slice(0, 400)) {
      if (!Array.isArray(r) || r.length < 6) return null;
      const [id, kk, x, y, a, hp] = r;
      if (typeof kk !== "string") return null;
      const unit = kk.length === 2 && isUnit(kk[0]) && (kk[1] === "x" || kk[1] === "o");
      if (!unit && !KIND[kk]) return null;
      if (![id, x, y, a, hp].every(Number.isFinite)) return null;
      const b = { id: id | 0, k: unit ? kk[0] : kk, t: unit ? kk[1] : "", x: x / 10, y: y / 10, a: a / 1000, hp };
      if (unit && zMax(b.k)) b.z = Number.isFinite(r[6]) ? Math.max(0, Math.min(zMax(b.k), r[6])) : zMax(b.k);
      out.push(b);
    }
    return out;
  }
  const alive = (bs, t) => bs.filter(b => isUnit(b.k) && b.t === t).length;
  const kingOf = (bs, t) => bs.find(b => b.k === "K" && b.t === t) || null;
  const dims = k => isUnit(k) ? (UNIT[k].r ? { w: UNIT[k].r * 2, h: UNIT[k].r * 2 } : { w: UNIT[k].w, h: UNIT[k].h }) : KIND[k];
  // osově zarovnaný obdélník tělesa (s natočením)
  function aabb(b) {
    if (isUnit(b.k) && UNIT[b.k].r) { const r = UNIT[b.k].r; return [b.x - r, b.y - r, b.x + r, b.y + r]; }
    const d = dims(b.k), c = Math.abs(Math.cos(b.a)), s = Math.abs(Math.sin(b.a));
    const hw = (d.w * c + d.h * s) / 2, hh = (d.w * s + d.h * c) / 2;
    return [b.x - hw, b.y - hh, b.x + hw, b.y + hh];
  }

  function makeBody(b) {
    if (isUnit(b.k)) {
      const U = UNIT[b.k], o = { density: U.d, friction: 0.8, frictionStatic: 1, restitution: 0.15, angle: b.a, label: b.k };
      return U.r ? Bodies.circle(b.x, b.y, U.r, o) : Bodies.rectangle(b.x, b.y, U.w, U.h, { ...o, chamfer: { radius: 6 } });
    }
    const K = KIND[b.k], m = MAT[K.m];
    return Bodies.rectangle(b.x, b.y, K.w, K.h, { density: m.density, friction: m.friction, frictionStatic: K.m === "i" ? 0.05 : 1, restitution: m.restitution, angle: b.a, label: b.k, chamfer: { radius: 2 } });
  }
  // ---------- mapy (terén mezi pevnostmi; vše symetrické podle středu, ať je to férové) ----------
  //   h Kopec · u Údolí s jezírkem · p Plošiny · s Skála.  Podstavce a praky jsou na všech mapách stejně.
  const POND = { x0: 505, x1: W - 505, y: GY + 78, water: GY + 26 };
  const PLAT = [{ x: W / 2, y: 588, w: 170, h: 24 }, { x: 568, y: 724, w: 104, h: 22 }, { x: W - 568, y: 724, w: 104, h: 22 }];
  const ROCK = [[592, GY], [622, 712], [662, 636], [738, 636], [778, 712], [808, GY]];
  const MAPS = {
    h: { name: "Kopec" }, u: { name: "Údolí s jezírkem" }, p: { name: "Plošiny" }, s: { name: "Skála" },
  };
  const mapOf = m => MAPS[m] ? m : "h";
  function staticWorld(map) {
    map = mapOf(map);
    const o = { isStatic: true, friction: 0.9, label: "ground" };
    const out = [];
    const poly = pts => { const v = pts.map(([x, y]) => ({ x, y })), c = M.Vertices.centre(v); return Bodies.fromVertices(c.x, c.y, [v], o); };
    if (map === "u") {
      // údolí: dno jezírka níž, břehy šikmé
      out.push(Bodies.rectangle(W / 2, POND.y + 100, W * 3, 200, o));
      out.push(poly([[-W, GY], [POND.x0 - 40, GY], [POND.x0 + 40, POND.y], [-W, POND.y]]));
      out.push(poly([[W - POND.x0 + 40, GY], [2 * W, GY], [2 * W, POND.y], [W - POND.x0 - 40, POND.y]]));
    } else out.push(Bodies.rectangle(W / 2, GY + 100, W * 3, 200, o));
    if (map === "h") out.push(Bodies.circle(HILL.x, HILL.y, HILL.r, o));
    if (map === "p") for (const p of PLAT) {
      out.push(Bodies.rectangle(p.x, p.y, p.w, p.h, o));
      out.push(Bodies.rectangle(p.x, (p.y + p.h / 2 + GY) / 2, 14, GY - p.y - p.h / 2, o));
    }
    if (map === "s") out.push(poly(ROCK));
    for (const t of ["x", "o"]) { const [a, b] = PLINTHS[t]; out.push(Bodies.rectangle((a + b) / 2, GY - PLINTH / 2, b - a, PLINTH, { ...o, label: "plinth" })); }
    return out;
  }
  // povrch terénu v daném x (pro kreslení praku a náhled dráhy)
  function groundAt(map, x) {
    map = mapOf(map);
    if (map === "h") { const d = x - HILL.x; return Math.abs(d) < HILL.r ? Math.min(GY, HILL.y - Math.sqrt(HILL.r * HILL.r - d * d)) : GY; }
    if (map === "u") {
      const a = POND.x0 - 40, b = POND.x0 + 40, c = W - b, e = W - a;
      if (x <= a || x >= e) return GY;
      if (x >= b && x <= c) return POND.y;
      return x < b ? GY + (x - a) / (b - a) * (POND.y - GY) : GY + (e - x) / (e - c) * (POND.y - GY);
    }
    if (map === "p") { for (const p of PLAT) if (Math.abs(x - p.x) <= p.w / 2) return p.y - p.h / 2; return GY; }
    if (map === "s") {
      for (let i = 0; i < ROCK.length - 1; i++) { const [x0, y0] = ROCK[i], [x1, y1] = ROCK[i + 1]; if (x >= x0 && x <= x1) return y0 + (y1 - y0) * (x - x0) / (x1 - x0 || 1); }
      return GY;
    }
    return GY;
  }
  // modifikátor partie: "" nic · v vítr (wd −3..3, jen na ježka) · n noc (jen vzhled) · i led (pevnost z ledu) · g nízká gravitace
  const WIND = 0.012, LOWG = 0.7;
  const gravOf = env => env && env.md === "g" ? LOWG : 1;
  const windOf = env => env && env.md === "v" ? (env.wd | 0) * WIND : 0;

  // ---------- simulace u střelce ----------
  // opt: { every, onEvent, awake (probudit vše: kontrola usazení), plinthOnly (bez praků) }
  function sim(bodies, opt = {}) {
    const engine = Engine.create({ enableSleeping: true, positionIterations: 10, velocityIterations: 8 });
    const env = opt.env || {}, wind = windOf(env);
    engine.gravity.scale = 0.001 * gravOf(env);
    const items = new Map();   // id -> { b: tělo, k, t, hp, max, z }
    let nextId = 1;
    Composite.add(engine.world, staticWorld(env.map));
    for (const s of bodies) {
      const body = makeBody(s);
      body.plugin.id = s.id;
      Composite.add(engine.world, body);
      if (!opt.awake) Sleeping.set(body, true);
      items.set(s.id, { b: body, k: s.k, t: s.t, hp: s.hp, max: maxOf(s), z: zMax(s.k) ? (Number.isFinite(s.z) ? s.z : zMax(s.k)) : 0 });
      nextId = Math.max(nextId, s.id + 1);
    }
    let hog = null, tick = 0, calm = 0, done = false, limit = MAX_TICKS, hogIdle = 0;
    const ev = [], doomed = new Set(), last = new Map(), frames = [];
    let every = opt.every || (items.size > 60 ? 3 : 2);
    const emit = e => { ev.push(e); if (opt.onEvent) opt.onEvent(e); };

    const pendingD = new Map(), dCount = new Map(), zCount = new Map(), dodged = new Set();
    let hogType = "n", hogTeam = "", boomAt = null, launchTick = 0, bounce = null, boomed = false;
    function damage(id, amount, x, y) {
      const it = items.get(id);
      if (!it || doomed.has(id) || !(amount > 0)) return;
      it.hp -= amount;
      // události „d“: jednotky při každém ztraceném bodu, kostky jen při přechodu na další čtvrtinu (praskliny u soupeře)
      if (it.hp > 0 && amount >= 1) {
        if (isUnit(it.k)) pendingD.set(id, it.hp);
        else { const q = Math.floor(it.hp / it.max * 4); if (q !== it.q) { it.q = q; pendingD.set(id, it.hp); } }
      }
      if (it.hp <= 0) { doomed.add(id); emit({ type: isUnit(it.k) ? "k" : "b", id, t: tick, x: r1(x), y: r1(y), m: isUnit(it.k) ? it.t : KIND[it.k].m, u: it.k }); }
    }
    // zásah jednotky: štít Štítonoše zepředu, ×0,6 od ježka na Tlusťocha, strop jedné rány na krále
    function hitUnit(it, id, d, sp, src) {
      if (it.k === "T" && src === "hog") d *= T_DMG;
      if (it.k === "K" && src !== "fall") d = Math.min(d, KING_HP * TUNE.kingCap);
      if (it.k === "S" && it.z > 0) {
        const dir = it.t === "x" ? 1 : -1, front = (sp.x - it.b.position.x) * dir > 8;
        if (front || src === "boom") {
          const pass = src === "boom" ? d * BOOM_SHIELD : 0, mult = src === "hog" && hogType === "s" ? SHIELD_S : 1;
          let toShield = (d - pass) * mult;
          const took = Math.min(it.z, toShield);
          it.z -= took; toShield -= took;
          d = pass + toShield / mult;
          const n = zCount.get(id) || 0;
          if (took >= 1 && n < 10) { zCount.set(id, n + 1); emit({ type: "z", id, t: tick, z: Math.round(it.z) }); }
        }
      }
      damage(id, d, sp.x, sp.y);
    }
    Events.on(engine, "collisionStart", e => {
      for (const p of e.pairs) {
        const A = p.bodyA.parent, B = p.bodyB.parent, n = p.collision.normal;
        const v = Math.abs((A.velocity.x - B.velocity.x) * n.x + (A.velocity.y - B.velocity.y) * n.y);
        const sp = p.collision.supports[0] || A.position;
        // jednotka na zemi = spadla
        for (const [X, Y] of [[A, B], [B, A]]) {
          if (isUnit(X.label) && Y.label === "ground") damage(X.plugin.id, 999, X.position.x, X.position.y);
        }
        // Tlusťoch odrazí ježka (ne kamenného ani špičáka): normálová složka se po řešení srážky nastaví na −0,8× původní
        if (hog && !bounce && (A === hog || B === hog)) {
          const T = A === hog ? B : A;
          if (T.label === "T" && !hogOf(hogType).heavy && !hogOf(hogType).pierce && !hogOf(hogType).boom) {
            const nx = n.x, ny = n.y, vn = hog.velocity.x * nx + hog.velocity.y * ny;
            bounce = { nx, ny, vn, vx: hog.velocity.x, vy: hog.velocity.y };
            emit({ type: "r", t: tick, x: r1(sp.x), y: r1(sp.y) });
          }
        }
        if (v < 1.6) continue;
        if (hog && hogOf(hogType).boom && !boomAt && tick > launchTick + 3 && (A === hog || B === hog)) boomAt = { x: sp.x, y: sp.y };
        for (const [X, Y] of [[A, B], [B, A]]) {
          const id = X.plugin.id;
          if (!id) continue;
          const it = items.get(id); if (!it) continue;
          const ratio = Y.isStatic ? 2 : Math.max(0.25, Math.min(4, Y.mass / X.mass));
          let d = Math.pow(v - 1.5, 1.5) * ratio;
          if (isUnit(it.k)) { d *= TUNE.dmg; if (d > 0.5) hitUnit(it, id, d, sp, Y === hog ? "hog" : "hit"); }
          else {
            d *= TUNE.blk;
            if (Y === hog && hogType === "s" && KIND[it.k].m === "m") d *= 1.3;
            if (d > 0.5) damage(id, d, sp.x, sp.y);
          }
        }
        if (v > 3 && ev.length < 400) {
          const mat = [A, B].map(b => b.label === "hog" ? "h" : isUnit(b.label) ? "c" : KIND[b.label] ? KIND[b.label].m : "z");
          emit({ type: "h", t: tick, x: r1(sp.x), y: r1(sp.y), s: Math.min(3, Math.floor(v / 5) + 1), m: mat.includes("g") ? "g" : mat.includes("i") ? "i" : mat.includes("m") ? "m" : mat.includes("s") ? "s" : mat.includes("w") ? "w" : mat.includes("c") ? "c" : "z" });
        }
      }
    });

    function record(force) {
      const f = [];
      const take = (id, body) => {
        const x = Math.round(body.position.x), y = Math.round(body.position.y), a = Math.round(body.angle * 100);
        const l = last.get(id);
        if (force || !l || Math.abs(l[0] - x) >= 1 || Math.abs(l[1] - y) >= 1 || Math.abs(l[2] - a) >= 1) { last.set(id, [x, y, a]); f.push([id, x, y, a]); }
      };
      if (hog) take(0, hog);
      for (const [id, it] of items) if (!it.b.isSleeping || !last.has(id)) take(id, it.b);
      if (f.length) frames.push([tick, f]);
    }
    for (const [id, it] of items) { const b = it.b; last.set(id, [Math.round(b.position.x), Math.round(b.position.y), Math.round(b.angle * 100)]); }

    // výbuch bouchacího ježka: odhodí a poškodí vše v okruhu BOOM_R, ježek zmizí
    function explode(cx, cy) {
      boomAt = null; boomed = true;
      emit({ type: "e", t: tick, x: r1(cx), y: r1(cy), r: BOOM_R });
      for (const [id, it] of items) {
        const b = it.b, dx = b.position.x - cx, dy = b.position.y - cy, d = Math.hypot(dx, dy);
        if (d >= BOOM_R) continue;
        const k = 1 - d / BOOM_R, m = b.mass, nx = dx / (d || 1), ny = dy / (d || 1) - 0.35;
        const dv = Math.min(15, 21 * k / m);
        Sleeping.set(b, false);
        Body.setVelocity(b, { x: b.velocity.x + nx * dv, y: b.velocity.y + ny * dv });
        if (isUnit(it.k)) hitUnit(it, id, 26 * k, b.position, "boom");
        else damage(id, 34 * k, b.position.x, b.position.y);
      }
      if (hog) { emit({ type: "x", t: tick, x: r1(cx), y: r1(cy) }); Composite.remove(engine.world, hog); hog = null; }
      wakeAll();
    }
    function wakeAll() { for (const it of items.values()) Sleeping.set(it.b, false); }
    // Skokan uskočí před soupeřovým ježkem, který k němu letí (bez náhody)
    function dodges() {
      if (!hog || boomed) return;
      const hv = hog.velocity, hs = Math.hypot(hv.x, hv.y);
      if (hs <= DODGE.speed) return;
      for (const [id, it] of items) {
        if (it.k !== "R" || it.t === hogTeam || it.z <= 0 || dodged.has(id) || doomed.has(id)) continue;
        const p = it.b.position, dx = p.x - hog.position.x, dy = p.y - hog.position.y;
        if (Math.hypot(dx, dy) > DODGE.d || hv.x * dx + hv.y * dy <= 0) continue;
        const [z0, z1] = PLINTHS[it.t], nearEdge = p.x - z0 < DODGE.edge || z1 - p.x < DODGE.edge;
        const sx = nearEdge ? 0 : Math.sign(dx || 1) * DODGE.vx;
        Sleeping.set(it.b, false);
        Body.setVelocity(it.b, { x: it.b.velocity.x + sx, y: it.b.velocity.y + DODGE.vy });
        it.z -= 1; dodged.add(id);
        emit({ type: "j", id, t: tick, dx: r1(sx), dy: r1(DODGE.vy) });
      }
    }
    function step() {
      if (done) return false;
      if (hog && wind) Body.setVelocity(hog, { x: hog.velocity.x + wind, y: hog.velocity.y });   // vítr fouká jen do ježka
      Engine.update(engine, 1000 / 60);
      tick++;
      if (bounce && hog) {
        // odraz od Tlusťocha: tečná složka zůstane, normálová = −0,8× původní
        const { nx, ny, vn, vx, vy } = bounce, tx = vx - vn * nx, ty = vy - vn * ny;
        Body.setVelocity(hog, { x: tx - T_BOUNCE * vn * nx, y: ty - T_BOUNCE * vn * ny });
        bounce = { done: true };
      }
      if (boomAt && hog) explode(boomAt.x, boomAt.y);
      dodges();
      if (pendingD.size) {
        for (const [id, hp] of pendingD) {
          const n = dCount.get(id) || 0;
          if (items.has(id) && !doomed.has(id) && n < 8) { dCount.set(id, n + 1); emit({ type: "d", id, t: tick, hp: Math.round(hp) }); }
        }
        pendingD.clear();
      }
      if (doomed.size) {
        for (const id of doomed) { const it = items.get(id); if (it) { Composite.remove(engine.world, it.b); items.delete(id); } }
        doomed.clear(); wakeAll();
      }
      for (const [id, it] of items) {
        const p = it.b.position;
        if (p.x < -200 || p.x > W + 200 || p.y > GY + 300) {
          Composite.remove(engine.world, it.b); items.delete(id);
          if (isUnit(it.k)) emit({ type: "k", id, t: tick, x: r1(p.x), y: r1(p.y), m: it.t, u: it.k });
          else emit({ type: "o", id, t: tick });
        }
      }
      if (hog) {
        const p = hog.position;
        hogIdle = hog.speed < 0.6 ? hogIdle + 1 : 0;
        const gone = p.x < -200 || p.x > W + 200 || p.y > GY + 300;
        if (!gone && hogOf(hogType).boom && (hogIdle > 40 || tick > launchTick + 240)) explode(p.x, p.y);
        else if (gone || hogIdle > 50 || tick > limit - 30) {
          emit({ type: "x", t: tick, x: r1(p.x), y: r1(p.y) });
          Composite.remove(engine.world, hog); hog = null;
        }
      }
      if (tick % every === 0) record(false);
      let moving = !!hog;
      if (!moving) for (const it of items.values()) {
        const b = it.b;
        if (!b.isSleeping && (b.speed > 0.25 || Math.abs(b.angularVelocity) > 0.012)) { moving = true; break; }
      }
      calm = moving ? 0 : calm + 1;
      if ((tick > 20 && calm > 30) || tick >= limit) { record(false); done = true; }
      return !done;
    }

    return {
      engine, items,
      get hog() { return hog; }, get tick() { return tick; }, get done() { return done; },
      launch(team, ang, pow, type) {
        const s = SLING[team], H = hogOf(type);
        hogType = HOGS[type] ? type : "n"; hogTeam = team; launchTick = tick;
        hog = Bodies.circle(s.x, s.y, H.r, { density: H.d, friction: 0.5, restitution: H.rest, frictionAir: 0, label: "hog" });
        Composite.add(engine.world, hog);
        Body.setVelocity(hog, launchVel(ang, pow, hogType));
        Body.setAngularVelocity(hog, team === "x" ? 0.25 : -0.25);
        record(true);
      },
      // stavba: díl se objeví na místě (bez pádu shora) a usadí se
      place(team, kind, x, y, rot) {
        const d = KIND[kind];
        const id = nextId++;
        const body = makeBody({ k: kind, x, y, a: rot ? Math.PI / 2 : 0 });
        body.plugin.id = id;
        Composite.add(engine.world, body);
        items.set(id, { b: body, k: kind, t: "", hp: MAT[d.m].hp, max: MAT[d.m].hp, z: 0 });
        limit = PLACE_TICKS;
        emit({ type: "n", id, t: tick, k: kind, x: r1(x), y: r1(y), a: rot ? 1 : 0 });
        record(true);
        return id;
      },
      step,
      view() {
        const out = [];
        for (const [id, it] of items) {
          const b = { id, k: it.k, t: it.t, x: it.b.position.x, y: it.b.position.y, a: it.b.angle, hp: it.hp, max: it.max };
          if (zMax(it.k)) b.z = it.z;
          out.push(b);
        }
        return out;
      },
      hogView() { return hog ? { x: hog.position.x, y: hog.position.y, a: hog.angle } : null; },
      // konečný stav + záznam pro soupeře (klíčové snímky ≤ maxLen, při velkém výstřelu řidší)
      result(maxLen = 24000) {
        const bodies = this.view().map(b => ({ ...b, x: r1(b.x), y: r1(b.y), a: Math.round(b.a * 1000) / 1000, hp: Math.max(1, Math.round(b.hp)), ...(zMax(b.k) ? { z: Math.max(0, Math.round(b.z)) } : {}) }));
        let kf = encFrames(frames, 1), step = 1;
        while (kf.length > maxLen && step < 16) { step++; kf = encFrames(frames, step); }
        return { bodies, kf, ev: encEvents(ev), ticks: tick };
      },
    };
  }

  // ---------- léčení na začátku tahu (deterministické nad dokumentem) ----------
  // Pro každého živého léčitele týmu (podle id): spojenec do 170 px s nejnižším hp/max (shoda: nižší id), +min(6, chybí, zásoba).
  // Mění bodies (hp, z), vrací [[léčitel, cíl, nové hp]].
  function heal(bodies, team) {
    const out = [];
    const healers = bodies.filter(b => b.k === "L" && b.t === team && (b.z || 0) > 0).sort((a, b) => a.id - b.id);
    for (const L of healers) {
      let best = null;
      for (const b of bodies) {
        if (b === L || !isUnit(b.k) || b.t !== team) continue;
        const mx = UNIT[b.k].hp;
        if (b.hp >= mx || Math.hypot(b.x - L.x, b.y - L.y) > HEAL.range) continue;
        const f = b.hp / mx;
        if (!best || f < best.f - 1e-9 || (Math.abs(f - best.f) < 1e-9 && b.id < best.b.id)) best = { b, f };
      }
      if (!best) continue;
      const add = Math.min(HEAL.amount, UNIT[best.b.k].hp - best.b.hp, L.z);
      if (add <= 0) continue;
      best.b.hp += add; L.z -= add;
      out.push([L.id, best.b.id, best.b.hp]);
    }
    return out;
  }

  // ---------- stavba: kde díl může stát ----------
  const pieceDims = (kind, rot) => { const d = KIND[kind]; return rot ? { w: d.h, h: d.w } : { w: d.w, h: d.h }; };
  // výška, na které díl v daném x spočine na nejvyšší ploše pod bodem yHint (střed dílu)
  function restY(bodies, team, kind, rot, x, yHint) {
    const { w, h } = pieceDims(kind, rot);
    let best = PY;
    for (const b of bodies) {
      if (isUnit(b.k)) continue;
      const [x0, y0, x1] = aabb(b);
      const ov = Math.min(x1, x + w / 2) - Math.max(x0, x - w / 2);
      if (ov <= 2) continue;
      if (y0 >= yHint - 6 && y0 < best) best = y0;
    }
    return best - h / 2;
  }
  function canPlace(bodies, team, kind, x, y, rot) {
    if (!KIND[kind] || !BUILD.includes(kind)) return { ok: false, why: "Takový díl nejde postavit." };
    const { w, h } = pieceDims(kind, rot), [z0, z1] = ZONE[team];
    const L = x - w / 2, R = x + w / 2, T = y - h / 2, B = y + h / 2;
    if (L < z0 - 0.5 || R > z1 + 0.5 || B > PY + 0.5 || T < PY - BUILD_H) return { ok: false, why: "Stavět jde jen na vlastním podstavci." };
    let support = B >= PY - 8 ? w : 0;
    for (const b of bodies) {
      const [x0, y0, x1, y1] = aabb(b);
      const ox = Math.min(x1, R) - Math.max(x0, L), oy = Math.min(y1, B) - Math.max(y0, T);
      if (ox > 1 && oy > 1) return { ok: false, why: "Tady to stát nemůže." };
      if (b.k === "K") {
        const cx = Math.max(L, Math.min(b.x, R)), cy = Math.max(T, Math.min(b.y, B));
        if (Math.hypot(cx - b.x, cy - b.y) < UNIT.K.r + 10) return { ok: false, why: "Tady to stát nemůže." };
      }
      if (!isUnit(b.k) && y0 >= B - 2 && y0 <= B + 8 && ox > 0) support += ox;
    }
    if (support < w * 0.3) return { ok: false, why: "Tady to stát nemůže." };
    return { ok: true, why: "" };
  }

  // ---------- pravidla partie (čisté funkce nad stavem, sdílí je hra i simulace v testech) ----------
  // turns: tahů na hráče; builds: zásoba staveb [začínající, druhý]; buildFrom: stavět nejdřív v tomto tahu hráče
  const RULES = { turns: 9, builds: [3, 4], buildFrom: 2, comebackKing: 0.35, comebackUnits: 2 };
  const other = t => t === "x" ? "o" : "x";
  const kingFrac = (bs, t) => { const k = kingOf(bs, t); return k ? Math.max(0, k.hp) / KING_HP : 0; };
  const turnNo = n => Math.floor(n / 2) + 1;                       // kolikátý tah má hráč na tahu (n = počet odehraných akcí)
  function limitWinner(bs) {
    const ax = kingFrac(bs, "x"), ao = kingFrac(bs, "o");
    if (Math.abs(ax - ao) > 1e-9) return { win: ax > ao ? "x" : "o", wy: "l" };
    const nx = alive(bs, "x"), no = alive(bs, "o");
    if (nx !== no) return { win: nx > no ? "x" : "o", wy: "l" };
    const sum = t => bs.filter(b => isUnit(b.k) && b.t === t).reduce((s, b) => s + b.hp / UNIT[b.k].hp, 0);
    const sx = sum("x"), so = sum("o");
    if (Math.abs(sx - so) > 1e-6) return { win: sx > so ? "x" : "o", wy: "l" };
    return { win: "=", wy: "l" };
  }
  // výsledek po akci hráče `by` (n = počet akcí včetně této); null = hraje se dál
  function outcome(bs, by, n) {
    const kb = kingOf(bs, by), ko = kingOf(bs, other(by));
    if (!kb && !ko) return { win: "=", wy: "k" };
    if (!ko) return { win: by, wy: "k" };
    if (!kb) return { win: other(by), wy: "k" };
    if (n >= RULES.turns * 2) return limitWinner(bs);
    return null;
  }
  // prohrává tým výrazně? (král o 35 % slabší, nebo o 2 jednotky méně) → jednou za partii stavba navíc
  const behind = (bs, t) => kingFrac(bs, t) <= kingFrac(bs, other(t)) - RULES.comebackKing || alive(bs, t) <= alive(bs, other(t)) - RULES.comebackUnits;
  // titul a kosmetika podle výher v sérii
  const TITLES = [[5, "Král louky"], [3, "Mistr praku"], [1, "Ostřílený"]];
  const rankOf = wins => wins >= 5 ? 3 : wins >= 3 ? 2 : wins >= 1 ? 1 : 0;
  const titleOf = wins => (TITLES.find(t => wins >= t[0]) || [0, ""])[1];

  const launchVel = (ang, pow, type) => { const k = pow * VMAX * hogOf(type).v; return { x: Math.cos(ang) * k, y: Math.sin(ang) * k }; };
  // náhled začátku dráhy (bez srážek)
  function preview(team, ang, pow, n = 34, every = 2, type, env) {
    const s = SLING[team], v = launchVel(ang, pow, type), pts = [], g = G * gravOf(env), wd = windOf(env);
    let x = s.x, y = s.y, vx = v.x, vy = v.y;
    for (let i = 1; i <= n * every; i++) { vx += wd; vy += g; x += vx; y += vy; if (i % every === 0) pts.push([x, y]); }
    return pts;
  }

  // ---------- záznam ----------
  // snímky: "tick;id,x,y,a;id,x,y,a|tick;…" (step > 1 = řidší záznam pro velký výstřel)
  function encFrames(frames, step) {
    const out = [];
    const pend = new Map();
    frames.forEach((fr, i) => {
      for (const e of fr[1]) pend.set(e[0], e);
      if (i % step === 0 || i === frames.length - 1) {
        out.push(fr[0] + ";" + [...pend.values()].map(e => e.join(",")).join(";"));
        pend.clear();
      }
    });
    return out.join("|");
  }
  function decFrames(s) {
    if (typeof s !== "string" || !s) return [];
    return s.split("|").map(f => {
      const parts = f.split(";");
      return [parseInt(parts[0], 10), parts.slice(1).filter(Boolean).map(e => e.split(",").map(Number))];
    }).filter(f => Number.isFinite(f[0]));
  }
  function encEvents(ev) {
    return ev.map(e => {
      if (e.type === "h") return ["h", e.t, Math.round(e.x), Math.round(e.y), e.s, e.m].join(".");
      if (e.type === "k") return ["k", e.id, e.t, Math.round(e.x), Math.round(e.y), e.m, e.u].join(".");
      if (e.type === "b") return ["b", e.id, e.t, Math.round(e.x), Math.round(e.y), e.m].join(".");
      if (e.type === "o") return ["o", e.id, e.t].join(".");
      if (e.type === "x") return ["x", e.t, Math.round(e.x), Math.round(e.y)].join(".");
      if (e.type === "n") return ["n", e.id, e.t, e.k, Math.round(e.x), Math.round(e.y), e.a].join(".");
      if (e.type === "d") return ["d", e.id, e.t, e.hp].join(".");
      if (e.type === "e") return ["e", e.t, Math.round(e.x), Math.round(e.y), e.r].join(".");
      if (e.type === "j") return ["j", e.id, e.t, Math.round(e.dx), Math.round(e.dy)].join(".");
      if (e.type === "r") return ["r", e.t, Math.round(e.x), Math.round(e.y)].join(".");
      if (e.type === "z") return ["z", e.id, e.t, e.z].join(".");
      if (e.type === "l") return ["l", e.id, e.to, e.t, e.hp].join(".");
      return "";
    }).filter(Boolean).join("|");
  }
  function decEvents(s) {
    if (typeof s !== "string" || !s) return [];
    return s.split("|").map(p => {
      const f = p.split("."), n = i => Number(f[i]);
      switch (f[0]) {
        case "h": return { type: "h", t: n(1), x: n(2), y: n(3), s: n(4), m: f[5] };
        case "k": return { type: "k", id: n(1), t: n(2), x: n(3), y: n(4), m: f[5], u: f[6] || "C" };
        case "b": return { type: "b", id: n(1), t: n(2), x: n(3), y: n(4), m: f[5] };
        case "o": return { type: "o", id: n(1), t: n(2) };
        case "x": return { type: "x", t: n(1), x: n(2), y: n(3) };
        case "n": return { type: "n", id: n(1), t: n(2), k: f[3], x: n(4), y: n(5), a: n(6) };
        case "d": return { type: "d", id: n(1), t: n(2), hp: n(3) };
        case "e": return { type: "e", t: n(1), x: n(2), y: n(3), r: n(4) };
        case "j": return { type: "j", id: n(1), t: n(2), dx: n(3), dy: n(4) };
        case "r": return { type: "r", t: n(1), x: n(2), y: n(3) };
        case "z": return { type: "z", id: n(1), t: n(2), z: n(3) };
        case "l": return { type: "l", id: n(1), to: n(2), t: n(3), hp: n(4) };
      }
      return null;
    }).filter(e => e && Number.isFinite(e.t)).sort((a, b) => a.t - b.t);
  }

  // ---------- přehrávání u soupeře ----------
  function replay(bodies, kf, evStr) {
    const frames = decFrames(kf), events = decEvents(evStr);
    const map = new Map();       // id -> { k, t, hp, z, track: [[tick,x,y,a]], gone }
    for (const b of bodies) map.set(b.id, { k: b.k, t: b.t, hp: b.hp, z: b.z, track: [[0, b.x, b.y, Math.round(b.a * 100)]], gone: Infinity });
    const hogTrack = [];
    for (const [t, es] of frames) for (const [id, x, y, a] of es) {
      if (id === 0) { hogTrack.push([t, x, y, a]); continue; }
      let m = map.get(id);
      if (!m) {
        const n = events.find(e => e.type === "n" && e.id === id);
        if (!n) continue;
        m = { k: n.k, t: "", hp: MAT[KIND[n.k] ? KIND[n.k].m : "w"].hp, born: n.t, track: [], gone: Infinity };
        map.set(id, m);
      }
      m.track.push([t, x, y, a]);
    }
    for (const e of events) if ((e.type === "b" || e.type === "k" || e.type === "o") && map.has(e.id)) map.get(e.id).gone = e.t;
    const evOf = type => { const m = new Map(); for (const e of events) if (e.type === type) { if (!m.has(e.id)) m.set(e.id, []); m.get(e.id).push([e.t, type === "z" ? e.z : e.hp]); } return m; };
    const dmgEv = evOf("d"), zEv = evOf("z");
    const valAt = (l, t, v0) => { if (!l) return v0; let v = v0; for (const [tt, h] of l) if (tt <= t) v = h; else break; return v; };
    const xEv = events.find(e => e.type === "x");
    const hogGone = xEv ? xEv.t : (hogTrack.length ? hogTrack[hogTrack.length - 1][0] + 1 : 0);
    const end = Math.max(0, ...frames.map(f => f[0]), ...events.map(e => e.t));
    function at(track, t) {
      if (!track.length) return null;
      if (t <= track[0][0]) return track[0];
      let i = track.length - 1;
      while (i > 0 && track[i][0] > t) i--;
      const a = track[i], b = track[i + 1];
      if (!b) return a;
      const u = (t - a[0]) / (b[0] - a[0]);
      return [t, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u, a[3] + (b[3] - a[3]) * u];
    }
    return {
      end, events,
      view(t) {
        const out = [];
        for (const [id, m] of map) {
          if (t >= m.gone || (m.born !== undefined && t < m.born)) continue;
          const p = at(m.track, t);
          if (!p) continue;
          const b = { id, k: m.k, t: m.t, x: p[1], y: p[2], a: p[3] / 100, hp: valAt(dmgEv.get(id), t, m.hp), max: maxOf(m) };
          if (zMax(m.k)) b.z = valAt(zEv.get(id), t, m.z);
          out.push(b);
        }
        return out;
      },
      hogView(t) {
        if (!hogTrack.length || t >= hogGone) return null;
        const p = at(hogTrack, t);
        return p && { x: p[1], y: p[2], a: p[3] / 100 };
      },
    };
  }

  const JP = {
    W, GY, PY, G, VMAX, HOG_R, CR, SLING, ZONE, PLINTHS, HILL, KIND, MAT, UNIT, UNIT_ORDER, BUILD, BUILD_H, FORT, TUNE,
    KING_HP, CRITTER_HP, MAX_TICKS, HOGS, HOG_ORDER, BOOM_R, HEAL, DODGE, hogOf, isUnit, maxOf, zMax,
    RULES, outcome, limitWinner, behind, kingFrac, turnNo, rankOf, titleOf, TITLES,
    MAPS, POND, PLAT, ROCK, WIND, LOWG, mapOf, groundAt, gravOf, windOf, staticWorld,
    packBodies, unpackBodies, alive, kingOf, dims, aabb, makeBody, sim, heal, restY, canPlace, pieceDims, preview, launchVel, decFrames, decEvents, replay,
  };
  if (typeof module !== "undefined") module.exports = JP;
  else root.JP = JP;
})(typeof window !== "undefined" ? window : globalThis);
