// Ježkomet – fyzikální jádro (bez DOM). Matter.js 0.19.0 (vendor/).
// Autoritou je střelec: jeho klient spustí simulaci, nahraje klíčové snímky a konečný stav.
// Druhý hráč nesimuluje, jen přehraje snímky (JP.replay) a převezme konečný stav.
(function (root) {
  "use strict";
  const M = root.Matter || (typeof require === "function" ? require("matter-js") : null);
  const { Engine, Bodies, Body, Composite, Events, Sleeping } = M;

  const W = 1400, GY = 880, PLINTH = 30, PY = GY - PLINTH;
  const G = 0.001 * (1000 / 60) ** 2;             // zrychlení na krok (stejné jako Matter)
  const VMAX = 20;                                // rychlost ježka při plném napnutí (jednotky / krok)
  const HOG_R = 17, CR = 19;
  const SLING = { x: { x: 420, y: 748 }, o: { x: W - 420, y: 748 } };
  const ZONE = { x: [70, 330], o: [W - 330, W - 70] };
  const PLINTHS = { x: [80, 320], o: [W - 320, W - 80] };
  const HILL = { x: W / 2, y: GY + 190, r: 330 };
  const MAX_TICKS = 660, DROP_TICKS = 300;

  // druhy kostek: rozměr, materiál, životy
  const MAT = {
    w: { density: 0.0011, friction: 0.7, restitution: 0.05, hp: 26 },   // dřevo
    s: { density: 0.0032, friction: 0.8, restitution: 0.02, hp: 70 },   // kámen
    g: { density: 0.0009, friction: 0.4, restitution: 0.1, hp: 9 },     // sklo
  };
  const KIND = {
    wP: { m: "w", w: 130, h: 22 }, wL: { m: "w", w: 230, h: 22 }, wB: { m: "w", w: 22, h: 96 },
    sB: { m: "s", w: 46, h: 46 }, gP: { m: "g", w: 20, h: 96 }, gS: { m: "g", w: 96, h: 18 },
  };
  const CRITTER_HP = 30;
  // druhy ježků (twist: příští ježek je ten, kterého ti vybral soupeř)
  //   r poloměr, d hustota, rest odrazivost, v násobek rychlosti, boom = vybuchne při prvním nárazu
  const HOGS = {
    n: { r: 17, d: 0.004, rest: 0.3, v: 1 },
    k: { r: 19, d: 0.0095, rest: 0.06, v: 0.84 },
    g: { r: 17, d: 0.0026, rest: 0.9, v: 1 },
    b: { r: 17, d: 0.004, rest: 0.2, v: 1, boom: true },
  };
  const HOG_ORDER = "nkgb";
  const hogOf = t => HOGS[t] || HOGS.n;
  const BOOM_R = 150;
  // kostky, které si střelec může přidat ve fázi stavby
  const BUILD = ["wP", "sB", "gP"];

  const r1 = v => Math.round(v * 10) / 10;

  // výchozí pevnost (levá strana), pravá je zrcadlo
  function fortLeft() {
    const L = [];
    const add = (k, x, y, extra) => L.push({ k, x, y, a: 0, ...extra });
    const P = PY;
    add("wB", 110, P - 48); add("wB", 210, P - 48); add("gP", 300, P - 48);
    add("C", 160, P - CR); add("sB", 255, P - 23);
    add("wL", 205, P - 96 - 11);
    const F1 = P - 96 - 22;
    add("sB", 118, F1 - 23); add("C", 175, F1 - CR);
    add("gP", 240, F1 - 48); add("gP", 300, F1 - 48);
    add("wP", 268, F1 - 96 - 11);
    add("C", 268, F1 - 96 - 22 - CR);
    return L;
  }
  function initialBodies() {
    const out = []; let id = 1;
    for (const t of ["x", "o"]) for (const b of fortLeft()) {
      const x = t === "x" ? b.x : W - b.x;
      out.push({ id: id++, k: b.k, t: b.k === "C" ? t : "", x, y: b.y, a: 0, hp: b.k === "C" ? CRITTER_HP : MAT[KIND[b.k].m].hp });
    }
    return out;
  }
  // stav do dokumentu: [id, druh, x*10, y*10, úhel*1000, životy] (postavičky mají druh "Cx" / "Co")
  const packBodies = bs => bs.map(b => [b.id, b.k === "C" ? "C" + b.t : b.k, Math.round(b.x * 10), Math.round(b.y * 10), Math.round(b.a * 1000), Math.round(b.hp)]);
  function unpackBodies(arr) {
    if (!Array.isArray(arr)) return null;
    const out = [];
    for (const r of arr.slice(0, 400)) {
      if (!Array.isArray(r) || r.length < 6) return null;
      const [id, kk, x, y, a, hp] = r;
      const crit = kk === "Cx" || kk === "Co";
      if (!crit && !KIND[kk]) return null;
      if (![id, x, y, a, hp].every(Number.isFinite)) return null;
      out.push({ id: id | 0, k: crit ? "C" : kk, t: crit ? kk[1] : "", x: x / 10, y: y / 10, a: a / 1000, hp });
    }
    return out;
  }
  const alive = (bs, t) => bs.filter(b => b.k === "C" && b.t === t).length;
  const dims = k => k === "C" ? { w: CR * 2, h: CR * 2 } : KIND[k];

  function makeBody(b) {
    if (b.k === "C") {
      return Bodies.circle(b.x, b.y, CR, { density: 0.0012, friction: 0.8, frictionStatic: 1, restitution: 0.15, angle: b.a, label: "C" });
    }
    const K = KIND[b.k], m = MAT[K.m];
    return Bodies.rectangle(b.x, b.y, K.w, K.h, { density: m.density, friction: m.friction, frictionStatic: 1, restitution: m.restitution, angle: b.a, label: b.k, chamfer: { radius: 2 } });
  }
  function staticWorld() {
    const o = { isStatic: true, friction: 0.9 };
    const ground = Bodies.rectangle(W / 2, GY + 100, W * 3, 200, { ...o, label: "ground" });
    const hill = Bodies.circle(HILL.x, HILL.y, HILL.r, { ...o, label: "ground" });
    const pl = ["x", "o"].map(t => { const [a, b] = PLINTHS[t]; return Bodies.rectangle((a + b) / 2, GY - PLINTH / 2, b - a, PLINTH, { ...o, label: "plinth" }); });
    return [ground, hill, ...pl];
  }

  // ---------- simulace u střelce ----------
  function sim(bodies, opt = {}) {
    const engine = Engine.create({ enableSleeping: true, positionIterations: 10, velocityIterations: 8 });
    const items = new Map();   // id -> { b: tělo, k, t, hp, max }
    let nextId = 1;
    Composite.add(engine.world, staticWorld());
    for (const s of bodies) {
      const body = makeBody(s);
      body.plugin.id = s.id;
      Composite.add(engine.world, body);
      Sleeping.set(body, true);
      items.set(s.id, { b: body, k: s.k, t: s.t, hp: s.hp, max: s.k === "C" ? CRITTER_HP : MAT[KIND[s.k].m].hp });
      nextId = Math.max(nextId, s.id + 1);
    }
    let hog = null, tick = 0, calm = 0, done = false, limit = MAX_TICKS, hogIdle = 0;
    const ev = [], doomed = new Set(), last = new Map(), frames = [];
    let every = opt.every || 2;
    const emit = e => { ev.push(e); if (opt.onEvent) opt.onEvent(e); };

    const pendingD = new Map(), dCount = new Map();
    let hogType = "n", boomAt = null, launchTick = 0;
    function damage(id, amount, x, y) {
      const it = items.get(id);
      if (!it || doomed.has(id)) return;
      it.hp -= amount;
      // události „d“: postavičky při každém ztraceném bodu, kostky jen při přechodu na další čtvrtinu (praskliny u soupeře při přehrávání)
      if (it.hp > 0 && amount >= 1) {
        if (it.k === "C") pendingD.set(id, it.hp);
        else { const q = Math.floor(it.hp / it.max * 4); if (q !== it.q) { it.q = q; pendingD.set(id, it.hp); } }
      }
      if (it.hp <= 0) { doomed.add(id); emit({ type: it.k === "C" ? "k" : "b", id, t: tick, x: r1(x), y: r1(y), m: it.k === "C" ? it.t : KIND[it.k].m }); }
    }
    Events.on(engine, "collisionStart", e => {
      for (const p of e.pairs) {
        const A = p.bodyA.parent, B = p.bodyB.parent, n = p.collision.normal;
        const v = Math.abs((A.velocity.x - B.velocity.x) * n.x + (A.velocity.y - B.velocity.y) * n.y);
        const sp = p.collision.supports[0] || A.position;
        // postavička na zemi = spadla
        for (const [X, Y] of [[A, B], [B, A]]) {
          if (X.label === "C" && Y.label === "ground") damage(X.plugin.id, 999, X.position.x, X.position.y);
        }
        if (v < 1.6) continue;
        if (hog && hogOf(hogType).boom && !boomAt && tick > launchTick + 3 && (A === hog || B === hog)) boomAt = { x: sp.x, y: sp.y };
        for (const [X, Y] of [[A, B], [B, A]]) {
          const id = X.plugin.id;
          if (!id) continue;
          const ratio = Y.isStatic ? 2 : Math.max(0.25, Math.min(4, Y.mass / X.mass));
          const d = Math.pow(v - 1.5, 1.5) * ratio;
          if (d > 0.5) damage(id, d, sp.x, sp.y);
        }
        if (v > 3 && ev.length < 400) {
          const mat = [A, B].map(b => b.label === "hog" ? "h" : b.label === "C" ? "c" : KIND[b.label] ? KIND[b.label].m : "z");
          emit({ type: "h", t: tick, x: r1(sp.x), y: r1(sp.y), s: Math.min(3, Math.floor(v / 5) + 1), m: mat.includes("g") ? "g" : mat.includes("s") ? "s" : mat.includes("w") ? "w" : mat.includes("c") ? "c" : "z" });
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
      boomAt = null;
      emit({ type: "e", t: tick, x: r1(cx), y: r1(cy), r: BOOM_R });
      for (const [id, it] of items) {
        const b = it.b, dx = b.position.x - cx, dy = b.position.y - cy, d = Math.hypot(dx, dy);
        if (d >= BOOM_R) continue;
        const k = 1 - d / BOOM_R, m = b.mass, nx = dx / (d || 1), ny = dy / (d || 1) - 0.35;
        const dv = Math.min(15, 21 * k / m);
        Sleeping.set(b, false);
        Body.setVelocity(b, { x: b.velocity.x + nx * dv, y: b.velocity.y + ny * dv });
        damage(id, (it.k === "C" ? 26 : 34) * k, b.position.x, b.position.y);
      }
      if (hog) { emit({ type: "x", t: tick, x: r1(cx), y: r1(cy) }); Composite.remove(engine.world, hog); hog = null; }
      wakeAll();
    }
    function wakeAll() { for (const it of items.values()) Sleeping.set(it.b, false); }
    function step() {
      if (done) return false;
      Engine.update(engine, 1000 / 60);
      tick++;
      if (boomAt && hog) explode(boomAt.x, boomAt.y);
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
          if (it.k === "C") emit({ type: "k", id, t: tick, x: r1(p.x), y: r1(p.y), m: it.t });
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
        hogType = HOGS[type] ? type : "n"; launchTick = tick;
        hog = Bodies.circle(s.x, s.y, H.r, { density: H.d, friction: 0.5, restitution: H.rest, frictionAir: 0, label: "hog" });
        Composite.add(engine.world, hog);
        Body.setVelocity(hog, launchVel(ang, pow, hogType));
        Body.setAngularVelocity(hog, team === "x" ? 0.25 : -0.25);
        record(true);
      },
      drop(team, kind, x, rot) {
        const d = KIND[kind];
        const w = rot ? d.h : d.w, h = rot ? d.w : d.h;
        const [z0, z1] = ZONE[team];
        x = Math.max(z0 + w / 2, Math.min(z1 - w / 2, x));
        const id = nextId++;
        const y = dropY(this.view(), x, w, h);
        const body = makeBody({ k: kind, x, y, a: rot ? Math.PI / 2 : 0 });
        body.plugin.id = id;
        Composite.add(engine.world, body);
        items.set(id, { b: body, k: kind, t: "", hp: MAT[d.m].hp, max: MAT[d.m].hp });
        limit = DROP_TICKS;
        emit({ type: "n", id, t: tick, k: kind, x: r1(x), y: r1(y), a: rot ? 1 : 0 });
        record(true);
        return id;
      },
      step,
      view() {
        const out = [];
        for (const [id, it] of items) out.push({ id, k: it.k, t: it.t, x: it.b.position.x, y: it.b.position.y, a: it.b.angle, hp: it.hp, max: it.max });
        return out;
      },
      hogView() { return hog ? { x: hog.position.x, y: hog.position.y, a: hog.angle } : null; },
      // konečný stav + záznam pro soupeře
      result(maxLen = 30000) {
        const bodies = this.view().map(b => ({ ...b, x: r1(b.x), y: r1(b.y) }));
        let kf = encFrames(frames, 1), step = 1;
        while (kf.length > maxLen && step < 12) { step++; kf = encFrames(frames, step); }
        return { bodies, kf, ev: encEvents(ev), ticks: tick };
      },
    };
  }

  // výška, ze které se nová kostka pustí: kousek nad nejvyšším tělesem ve sloupci
  function dropY(view, x, w, h) {
    let top = PY;
    for (const b of view) {
      const d = dims(b.k), r = Math.max(d.w, d.h) / 2 + 2;
      if (Math.abs(b.x - x) < w / 2 + r) top = Math.min(top, b.y - r);
    }
    return Math.max(80, top - h / 2 - 14);
  }

  const launchVel = (ang, pow, type) => { const k = pow * VMAX * hogOf(type).v; return { x: Math.cos(ang) * k, y: Math.sin(ang) * k }; };
  // náhled začátku dráhy (bez srážek)
  function preview(team, ang, pow, n = 34, every = 2, type) {
    const s = SLING[team], v = launchVel(ang, pow, type), pts = [];
    let x = s.x, y = s.y, vx = v.x, vy = v.y;
    for (let i = 1; i <= n * every; i++) { vy += G; x += vx; y += vy; if (i % every === 0) pts.push([x, y]); }
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
      if (e.type === "k" || e.type === "b") return [e.type, e.id, e.t, Math.round(e.x), Math.round(e.y), e.m].join(".");
      if (e.type === "o") return ["o", e.id, e.t].join(".");
      if (e.type === "x") return ["x", e.t, Math.round(e.x), Math.round(e.y)].join(".");
      if (e.type === "n") return ["n", e.id, e.t, e.k, Math.round(e.x), Math.round(e.y), e.a].join(".");
      if (e.type === "d") return ["d", e.id, e.t, e.hp].join(".");
      if (e.type === "e") return ["e", e.t, Math.round(e.x), Math.round(e.y), e.r].join(".");
      return "";
    }).filter(Boolean).join("|");
  }
  function decEvents(s) {
    if (typeof s !== "string" || !s) return [];
    return s.split("|").map(p => {
      const f = p.split("."), n = i => Number(f[i]);
      switch (f[0]) {
        case "h": return { type: "h", t: n(1), x: n(2), y: n(3), s: n(4), m: f[5] };
        case "k": case "b": return { type: f[0], id: n(1), t: n(2), x: n(3), y: n(4), m: f[5] };
        case "o": return { type: "o", id: n(1), t: n(2) };
        case "x": return { type: "x", t: n(1), x: n(2), y: n(3) };
        case "n": return { type: "n", id: n(1), t: n(2), k: f[3], x: n(4), y: n(5), a: n(6) };
        case "d": return { type: "d", id: n(1), t: n(2), hp: n(3) };
        case "e": return { type: "e", t: n(1), x: n(2), y: n(3), r: n(4) };
      }
      return null;
    }).filter(e => e && Number.isFinite(e.t)).sort((a, b) => a.t - b.t);
  }

  // ---------- přehrávání u soupeře ----------
  function replay(bodies, kf, evStr) {
    const frames = decFrames(kf), events = decEvents(evStr);
    const map = new Map();       // id -> { k, t, hp, max, track: [[tick,x,y,a]], gone }
    for (const b of bodies) map.set(b.id, { k: b.k, t: b.t, hp: b.hp, track: [[0, b.x, b.y, Math.round(b.a * 100)]], gone: Infinity });
    const hogTrack = [];
    for (const [t, es] of frames) for (const [id, x, y, a] of es) {
      if (id === 0) { hogTrack.push([t, x, y, a]); continue; }
      let m = map.get(id);
      if (!m) {
        const n = events.find(e => e.type === "n" && e.id === id);
        if (!n) continue;
        m = { k: n.k, t: "", hp: 1, born: n.t, track: [], gone: Infinity };
        map.set(id, m);
      }
      m.track.push([t, x, y, a]);
    }
    for (const e of events) if ((e.type === "b" || e.type === "k" || e.type === "o") && map.has(e.id)) map.get(e.id).gone = e.t;
    const dmgEv = new Map();      // id -> [[tick, hp]]
    for (const e of events) if (e.type === "d") { if (!dmgEv.has(e.id)) dmgEv.set(e.id, []); dmgEv.get(e.id).push([e.t, e.hp]); }
    const hpAt = (id, t, hp0) => { const l = dmgEv.get(id); if (!l) return hp0; let hp = hp0; for (const [tt, h] of l) if (tt <= t) hp = h; else break; return hp; };
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
          if (p) out.push({ id, k: m.k, t: m.t, x: p[1], y: p[2], a: p[3] / 100, hp: hpAt(id, t, m.hp), max: m.k === "C" ? CRITTER_HP : MAT[KIND[m.k].m].hp });
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
    W, GY, PY, G, VMAX, HOG_R, CR, SLING, ZONE, PLINTHS, HILL, KIND, MAT, BUILD, CRITTER_HP, MAX_TICKS, HOGS, HOG_ORDER, BOOM_R, hogOf,
    initialBodies, packBodies, unpackBodies, alive, dims, sim, preview, launchVel, decFrames, decEvents, replay,
  };
  if (typeof module !== "undefined") module.exports = JP;
  else root.JP = JP;
})(typeof window !== "undefined" ? window : globalThis);
