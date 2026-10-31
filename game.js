// Ježkomet v2 – hra, kreslení a synchronizace. Fyzika a pravidla jsou v engine.js (JP), pevnosti a partie v fort.js (JPFort).
(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  const attempt = (f, d) => { try { return f(); } catch { return d; } };
  const other = p => p === "x" ? "o" : "x";
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const TEST = /[?&]test\b/.test(location.search);
  const mq = matchMedia("(prefers-reduced-motion: reduce)");
  const calm = () => mq.matches;
  const STATS = { ko: 0, slow: 0, frag: 0, boom: 0, cheer: 0, sad: 0, shock: 0, fearFrames: 0, hitFrames: 0, freeze: 0, dodge: 0, bounce: 0, shield: 0, heal: 0, build: 0 };   // jen pro testy (?test)
  const { INK, TEAM, drawUnit, drawHog, drawBlock, MATCOL } = ART;
  const outline = (c, lw) => ART.stroke(c, lw);
  const circle = ART.circle, rrect = ART.rrect;
  const { W, GY, PY, SLING, ZONE, PLINTHS, HILL, KIND, UNIT, CR } = JP;
  const isUnit = JP.isUnit;
  const RULES = JP.RULES;

  // ---------- zvuk (WebAudio, zapne se po prvním dotyku) ----------
  let ac = null, master = null, muted = attempt(() => localStorage.getItem("jp-mute") === "1", false);
  function audio() {
    if (!ac) {
      ac = attempt(() => new (window.AudioContext || window.webkitAudioContext)(), null);
      if (ac) { master = ac.createGain(); master.gain.value = 0.55; master.connect(ac.destination); }
    }
    if (ac && ac.state === "suspended") ac.resume();
  }
  document.addEventListener("pointerdown", audio, { passive: true });
  document.addEventListener("keydown", audio);
  function tone(f, dur, { type = "sine", vol = 0.2, to = null, delay = 0 } = {}) {
    if (!ac || muted) return;
    const t = ac.currentTime + delay, o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t);
    if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.02);
  }
  let noiseBuf = null;
  function noise(dur, { vol = 0.2, f = 1200, q = 1, kind = "bandpass", to = null } = {}) {
    if (!ac || muted) return;
    if (!noiseBuf) { noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
    const t = ac.currentTime, s = ac.createBufferSource(), fl = ac.createBiquadFilter(), g = ac.createGain();
    s.buffer = noiseBuf; fl.type = kind; fl.frequency.setValueAtTime(f, t); fl.Q.value = q;
    if (to) fl.frequency.exponentialRampToValueAtTime(to, t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(fl); fl.connect(g); g.connect(master); s.start(t); s.stop(t + dur);
  }
  let lastStretch = 0;
  const sfx = {
    stretch(p) { const n = performance.now(); if (n - lastStretch < 70) return; lastStretch = n; tone(180 + p * 260, 0.07, { type: "triangle", vol: 0.05 }); },
    launch() { noise(0.35, { vol: 0.35, f: 600, to: 2400, q: 0.8 }); tone(320, 0.25, { type: "square", vol: 0.06, to: 120 }); },
    hit(m, s) {
      const v = 0.12 + s * 0.08;
      if (m === "g" || m === "i") { noise(0.25, { vol: v, f: m === "i" ? 4200 : 5200, kind: "highpass" }); tone(m === "i" ? 1900 : 2400, 0.18, { vol: v * 0.4, to: 3100 }); tone(3300, 0.12, { vol: v * 0.3, delay: 0.04 }); }
      else if (m === "m") { tone(520, 0.3, { type: "triangle", vol: v * 0.7, to: 470 }); tone(1310, 0.22, { vol: v * 0.3 }); noise(0.06, { vol: v * 0.6, f: 3000, q: 2 }); }
      else if (m === "s") { tone(140, 0.16, { vol: v, to: 70 }); noise(0.09, { vol: v * 0.8, f: 1800, q: 2 }); }
      else if (m === "w") { tone(220, 0.12, { type: "triangle", vol: v, to: 110 }); noise(0.07, { vol: v * 0.6, f: 900, q: 3 }); }
      else if (m === "c") tone(700, 0.12, { vol: v * 0.7, to: 1300 });
      else tone(110, 0.14, { vol: v * 0.8, to: 60 });
    },
    boom() { noise(0.5, { vol: 0.5, f: 900, to: 90, q: 0.7, kind: "lowpass" }); tone(110, 0.4, { type: "sawtooth", vol: 0.22, to: 38 }); },
    pick() { tone(520, 0.08, { type: "triangle", vol: 0.12 }); tone(780, 0.12, { type: "triangle", vol: 0.12, delay: 0.07 }); },
    ko() { tone(900, 0.12, { vol: 0.16, to: 1500 }); tone(1500, 0.3, { type: "triangle", vol: 0.12, to: 300, delay: 0.1 }); noise(0.25, { vol: 0.12, f: 900, delay: 0.08 }); },
    king() { [784, 659, 523, 392].forEach((f, i) => tone(f, 0.22, { type: "triangle", vol: 0.15, delay: 0.15 + i * 0.1 })); },
    drop() { tone(200, 0.12, { type: "triangle", vol: 0.14, to: 120 }); noise(0.08, { vol: 0.12, f: 700, q: 2 }); },
    boing() { tone(260, 0.28, { type: "triangle", vol: 0.16, to: 620 }); tone(130, 0.2, { vol: 0.1, to: 300 }); },
    hop() { tone(600, 0.12, { type: "triangle", vol: 0.1, to: 1200 }); },
    clank() { tone(980, 0.14, { type: "square", vol: 0.05, to: 760 }); noise(0.08, { vol: 0.12, f: 3800, q: 3 }); },
    heal() { [880, 1175, 1568].forEach((f, i) => tone(f, 0.18, { vol: 0.07, delay: i * 0.06 })); },
    win() { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.28, { type: "triangle", vol: 0.16, delay: i * 0.12 })); },
    lose() { [392, 330, 262].forEach((f, i) => tone(f, 0.32, { type: "triangle", vol: 0.13, delay: i * 0.16 })); },
    turn() { tone(660, 0.1, { vol: 0.1 }); tone(990, 0.14, { vol: 0.1, delay: 0.09 }); },
    click() { tone(420, 0.05, { type: "triangle", vol: 0.08 }); },
  };
  const buzz = ms => attempt(() => navigator.vibrate && navigator.vibrate(ms || 12));

  // ---------- plátno a kamera (camera.js: rozvržení, pohyb, ruční ovládání) ----------
  const cv = $("stage"), ctx = cv.getContext("2d");
  let cw = 0, ch = 0, dpr = 1;
  // výchozí záběr na výšku: podstavec od x 60 po prak, pevnost až 3 patra (≈ 450 nad zemí), dole pruh pro lištu tahu
  const cam = JPCam.create({ W, GY, SLING, ZONE, CR, home: { span: 402, left: 60, top: 150, tall: 450, dirt: [0.15, 96, 134] } });
  function resize() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    cw = innerWidth; ch = innerHeight;
    cv.width = Math.round(cw * dpr); cv.height = Math.round(ch * dpr);
    cam.resize(cw, ch);
    if ($("viewLbl")) syncView();
  }
  const portrait = () => cam.portrait();
  const overview = () => cam.overview();
  const desktop = () => matchMedia("(hover: hover) and (pointer: fine) and (min-width: 900px) and (min-height: 560px)").matches;
  const toScreen = (x, y) => cam.toScreen(x, y), toWorld = (sx, sy) => cam.toWorld(sx, sy);
  // čí pevnost se ukazuje, když nic nelétá: při tahu pevnost hráče na tahu, při výběru ježka a po konci ta, do které se střílelo
  function viewTeam() {
    if (!st) return me || "x";
    if (st.ph === "end") return st.win && st.win !== "=" ? other(st.win) : (me || st.p);
    return st.ph === "pick" ? other(st.p) : st.p;
  }
  function syncView() {
    const bt = cam.button(viewTeam());
    $("viewPlus").toggleAttribute("hidden", !bt.plus);
    $("viewLbl").textContent = bt.label; $("viewBtn").setAttribute("aria-label", bt.label);
  }
  function shotCtx() {
    if (acting && acting.kind === "s") return { team: acting.team, r: acting };
    if (replay && replay.rp) { const a = replay.acts[replay.i]; if (a && a.kind === "s") return { team: a.by, r: replay }; }
    return null;
  }
  // výchozí pohled; při stavbě přiblížení na vlastní pevnost nad lištou
  function restView() {
    if (building() && !portrait()) {
      const dock = $("dock").getBoundingClientRect(), side = dock.left > cw * 0.55;   // na šířku je lišta vpravo, na desktopu dole
      const room = side ? ch - 40 : Math.max(200, dock.top - 30), s = clamp(Math.min((side ? dock.left - 40 : cw - 80) / 520, (room - 60) / 480), overview(), 2.2);
      const cx = me === "x" ? 250 : W - 250;
      const ground = GY + 70;
      return { x: cx, s, y: side ? -40 / s : -(ch - room) / s + 20 / s + (ground - GY) * 0 };
    }
    return cam.restView(viewTeam());
  }
  function camIntent() {
    const intent = { rest: restView(), reduced: calm(), shot: null };
    const S = shotCtx();
    if (!S) return intent;
    const r = S.r, h = currentHog();
    let hog = null;
    if (h) {
      const ts = (slow.t > 0 ? slow.f : 1) * speed(), h1 = r.wait > 0 ? null : r.rp.hogView(r.t + 1);
      hog = { x: h.x, y: h.y, vx: h1 ? (h1.x - h.x) * 60 * ts : 0, vy: h1 ? (h1.y - h.y) * 60 * ts : 0 };
    }
    intent.shot = { team: S.team, waiting: r.wait > 0, hog };
    return intent;
  }

  // ---------- mapy a modifikátory: barvy a pozadí ve stejném světě „Ranní louka z modelíny“ ----------
  const PAL = {
    h: { sky: "#86D9F2", far: "#A9E2D3", near: "#88D09F", hill: "#7AD24A", grass: "#6CCB3A", grassD: "#4E9E2A", dirt: "#C98A4B", dirtD: "#B97C40" },
    u: { sky: "#8BD6EC", far: "#B4E2D0", near: "#8ECE9C", hill: "#7AD24A", grass: "#70C93E", grassD: "#4E9E2A", dirt: "#C58748", dirtD: "#AF7440", water: "#5CC3EA", waterD: "#3E9FCC", waterL: "#BDEBFA" },
    p: { sky: "#98D2F2", far: "#B5D8EA", near: "#93CCB1", hill: "#7AD24A", grass: "#67C63F", grassD: "#4A9A2C", dirt: "#C68A4E", dirtD: "#B07842", wood: "#E3A05C", woodD: "#B8763F" },
    s: { sky: "#94D3EA", far: "#C6E1C2", near: "#A0CD92", hill: "#7AD24A", grass: "#78C341", grassD: "#529A2E", dirt: "#C99050", dirtD: "#B37C44", rock: "#A99DBA", rockD: "#857A99", rockL: "#C9BFD6", moss: "#7DBF4C" },
  };
  const NIGHT = { sky: "#283463", far: "#33497A", near: "#3A5B7E", hill: "#4E973D", grass: "#4F9C3F", grassD: "#36782E", dirt: "#8D6238", dirtD: "#77522F", water: "#3B6FA4", waterD: "#2C5684", waterL: "#7FA8D6", wood: "#B98450", woodD: "#8A5E36", rock: "#7D7596", rockD: "#615A7A", rockL: "#9C94B2", moss: "#5E9A42" };
  const FROST = { sky: "#A9DEF2", far: "#C9E8EE", near: "#A9D9CB", grass: "#93D3B7", grassD: "#6FAF97", hill: "#8ED4AE" };
  const env = () => st ? { map: st.map, md: st.md, wd: st.wd } : { map: "h", md: "", wd: 0 };
  function pal() {
    const e = env(), base = PAL[e.map] || PAL.h;
    if (e.md === "n") return { ...base, ...NIGHT };
    if (e.md === "i") return { ...base, ...FROST };
    return base;
  }
  const MAPUI = {
    h: ["Kopec", "Kopec uprostřed zastaví nízké rány."],
    u: ["Údolí s jezírkem", "Mezi pevnostmi je volno, jezírko spolkne, co do něj spadne."],
    p: ["Plošiny", "Dřevěné plošiny chytí nízké rány, střílej obloukem nebo mezerou."],
    s: ["Skála", "Přes skálu uprostřed se dostaneš jen vysokým obloukem."],
  };
  function modUi(g) {
    if (!g || !g.md) return ["Klidný den", "Bez zvláštních podmínek, rozhoduje míření.", ""];
    if (g.md === "v") { const dir = g.wd < 0 ? "doleva" : "doprava", n = Math.abs(g.wd); return [`Vítr ${n}`, `Fouká vítr ${dir} (síla ${n} ze 3) a stáčí ježka v letu.`, "v"]; }
    if (g.md === "n") return ["Noc", "Noc: pevnosti osvětlují lucerny, pravidla platí stejně.", "n"];
    if (g.md === "i") return ["Mráz", "Mráz: v pevnostech je víc ledu a led klouže.", "i"];
    return ["Lehká gravitace", "Lehká gravitace: ježek letí delším a vyšším obloukem.", "g"];
  }
  const SKY0 = "#86D9F2";
  function bg() {
    const P = pal();
    ctx.fillStyle = P.sky; ctx.fillRect(0, 0, cw, ch);
    if (st && st.md === "n") drawStars();
    layer(0.35, P.far, X => 120 + 40 * Math.sin(X / 190) + 26 * Math.sin(X / 83 + 1.3), 40);
    layer(0.62, P.near, X => 64 + 24 * Math.sin(X / 120 + 0.5) + 14 * Math.abs(Math.sin(X / 47)), 18);
  }
  function layer(f, col, hgt, base) {
    const s = cam.s, gyS = toScreen(0, GY)[1];
    ctx.beginPath(); ctx.moveTo(-10, ch + 10);
    for (let sx = -10; sx <= cw + 10; sx += 8) {
      const X = cam.x * f + (sx - cw / 2) / s;
      ctx.lineTo(sx, gyS - (hgt(X) + base) * s);
    }
    ctx.lineTo(cw + 10, ch + 10); ctx.closePath();
    ctx.fillStyle = col; ctx.fill();
  }
  const STARS = Array.from({ length: 70 }, (_, i) => [(i * 7919 % 997) / 997, (i * 104729 % 613) / 613 * 0.55, 0.6 + (i % 5) * 0.3]);
  function drawStars() {
    for (const [u, v, r] of STARS) {
      const tw = calm() ? 0.8 : 0.55 + 0.45 * Math.sin(animT * 1.3 + u * 40);
      ctx.fillStyle = `rgba(255,248,220,${tw})`; circle(ctx, u * cw, v * ch, r); ctx.fill();
    }
  }

  // ---------- stav postaviček v rendereru (výrazy a reakce; nic se nesynchronizuje) ----------
  const CS = new Map();
  let animT = 0, frameN = 0, lastBodies = new Map();
  const TAU = Math.PI * 2, rnd = (a, b) => a + Math.random() * (b - a);
  const halfH = k => UNIT[k].r || UNIT[k].h / 2;
  function csOf(b) {
    let s = CS.get(b.id);
    if (!s) { s = { t: b.t, k: b.k, x: b.x, y: b.y, vx: 0, vy: 0, rot: b.a, hp: b.hp, blinkIn: rnd(40, 240), blinkT: 0, fear: 0, hit: 0, startle: 0, cheer: 0, sad: 0, heal: 0, dodge: 0, ph: (b.id * 1.713) % TAU, lx: 0, ly: 0, last: frameN }; CS.set(b.id, s); }
    return s;
  }
  function csUpdate(bodies, hog, dtf) {
    frameN++; animT += dtf / 60;
    lastBodies = new Map();
    for (const b of bodies) lastBodies.set(b.id, b);
    for (const b of bodies) {
      if (!isUnit(b.k)) continue;
      const s = csOf(b);
      if (Math.abs(b.x - s.x) > 160 || Math.abs(b.y - s.y) > 160) { s.vx = s.vy = 0; s.hp = b.hp; s.rot = b.a; }
      s.vx += ((b.x - s.x) / dtf - s.vx) * 0.4; s.vy += ((b.y - s.y) / dtf - s.vy) * 0.4;
      s.x = b.x; s.y = b.y; s.t = b.t; s.k = b.k; s.last = frameN;
      if (b.hp < s.hp - 1.2) { s.hit = 1; s.startle = 1; }
      if (s.fear > 0.5) STATS.fearFrames++;
      if (s.hit > 0.35) STATS.hitFrames++;
      s.hp = b.hp;
      const speed = Math.hypot(s.vx, s.vy);
      // kulaté jednotky se po pádu narovnají (ve fyzice se mohou kutálet), Štítonoš ne
      if (speed > 0.9 || b.k === "S") s.rot = b.a; else s.rot += (Math.round(s.rot / TAU) * TAU - s.rot) * Math.min(1, 0.12 * dtf);
      let ft = 0, lx = (b.t === "x" ? 0.75 : -0.75) + Math.sin(animT * 0.5 + s.ph) * 0.35, ly = -0.1 + Math.sin(animT * 0.37 + s.ph * 2) * 0.25;
      if (hog) {
        const dx = hog.x - b.x, dy = hog.y - b.y, d = Math.hypot(dx, dy);
        if (d < 800) { lx = dx / (d || 1); ly = dy / (d || 1); }
        if (d < 340) ft = (1 - d / 340) * (hog.team === b.t ? 0.45 : 1);
      }
      s.fear += (ft - s.fear) * Math.min(1, 0.14 * dtf);
      s.lx += (lx - s.lx) * Math.min(1, 0.2 * dtf); s.ly += (ly - s.ly) * Math.min(1, 0.2 * dtf);
      s.hit = Math.max(0, s.hit - dtf / 26); s.startle = Math.max(0, s.startle - dtf / 34);
      s.cheer = Math.max(0, s.cheer - dtf / 100); s.sad = Math.max(0, s.sad - dtf / 100);
      s.heal = Math.max(0, s.heal - dtf / 110); s.dodge = Math.max(0, s.dodge - dtf / 40);
      s.blinkIn -= dtf;
      if (s.blinkIn <= 0) { s.blinkT = 7; s.blinkIn = rnd(120, 300); }
      if (s.blinkT > 0) s.blinkT -= dtf;
    }
  }
  function poseOf(b) {
    const s = CS.get(b.id), M = !calm();
    const k = Math.cos(-s.rot), n = Math.sin(-s.rot);
    const o = {
      hurt: b.max ? clamp(1 - b.hp / b.max, 0, 1) : 0, lookX: s.lx * k - s.ly * n, lookY: s.lx * n + s.ly * k,
      blink: M && s.blinkT > 0 ? Math.sin(Math.PI * (1 - Math.max(0, s.blinkT) / 7)) : 0,
      fear: s.fear, hit: s.hit, cheer: s.cheer > 0 ? Math.min(1, s.cheer * 3) : 0, sad: s.sad > 0 ? Math.min(1, s.sad * 3) : 0, startle: s.startle, t: animT + s.ph, still: !M,
      heal: s.heal > 0 ? Math.min(1, s.heal * 2) : 0, dodge: s.dodge,
    };
    if (b.k === "S") o.shield = clamp((b.z || 0) / UNIT.S.z, 0, 1);
    const breath = M ? 1 + Math.sin(animT * 2.4 + s.ph) * 0.016 : 1, sq = M ? s.hit * 0.13 : 0;
    const hop = M ? -(o.cheer > 0 ? Math.abs(Math.sin(animT * 9 + s.ph)) * 9 * Math.min(1, s.cheer * 2) : 0) - s.startle * 3 : 0;
    return { o, rot: s.rot, dy: hop, sx: breath * (1 + sq), sy: breath * (1 - sq) };
  }
  function mood(team, what, str = 1) {
    for (const s of CS.values()) {
      if (s.t !== team || frameN - s.last > 3) continue;
      STATS[what]++;
      if (what === "cheer") { s.cheer = str; s.sad = 0; } else if (what === "sad") { s.sad = str; s.cheer = 0; } else if (what === "shock") { s.startle = 1; s.fear = Math.max(s.fear, 0.6); }
    }
  }
  function reactToShot(by, evs) {
    const opp = other(by), teamOf = id => (CS.get(id) || {}).t;
    const kos = evs.filter(e => e.type === "k" && e.m === opp).length, selfKo = evs.filter(e => e.type === "k" && e.m === by).length;
    const hurt = evs.filter(e => e.type === "d" && teamOf(e.id) === opp).length, wrecked = evs.filter(e => e.type === "b").length;
    if (kos) { mood(by, "cheer", 1); mood(opp, "shock"); }
    else if (hurt || wrecked >= 2) { mood(by, "cheer", 0.45); mood(opp, "shock"); }
    else if (!selfKo) { mood(by, "sad", 1); mood(opp, "cheer", 0.4); }
    if (selfKo) { mood(by, "sad", 1); }
  }

  // ---------- svět ----------
  const lwW = () => clamp(2.8 * cam.s / 0.55, 1.4, 3.4) / cam.s;
  const groundAt = x => JP.groundAt(env().map, x);
  function drawTerrain(lw) {
    const P = pal(), map = env().map;
    const left = cam.x - cw / cam.s - 200, right = cam.x + cw / cam.s + 200;
    if (map === "h") {
      ctx.save(); ctx.beginPath(); ctx.rect(-3000, -3000, W + 6000, GY + 3014); ctx.clip();
      circle(ctx, HILL.x, HILL.y, HILL.r); ctx.fillStyle = P.hill; ctx.fill(); outline(ctx, lw);
      ctx.restore();
    }
    if (map === "s") {
      const R = JP.ROCK;
      ctx.beginPath(); R.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.closePath();
      ctx.fillStyle = P.rock; ctx.fill();
      ctx.save(); ctx.clip();
      ctx.fillStyle = P.rockD; ctx.beginPath(); ctx.moveTo(720, 630); ctx.lineTo(820, 700); ctx.lineTo(820, GY + 4); ctx.lineTo(700, GY + 4); ctx.closePath(); ctx.fill();
      ctx.fillStyle = P.rockL; ctx.beginPath(); ctx.moveTo(610, 760); ctx.lineTo(650, 650); ctx.lineTo(670, 646); ctx.lineTo(640, 760); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = P.rockD; ctx.lineWidth = lw * 0.8; ctx.lineCap = "round";
      for (const [a, b, c, d] of [[650, 700, 690, 760], [690, 760, 676, 820], [740, 690, 760, 770], [700, 840, 730, 870]]) { ctx.beginPath(); ctx.moveTo(a, b); ctx.lineTo(c, d); ctx.stroke(); }
      ctx.fillStyle = P.moss; ctx.beginPath(); ctx.moveTo(662, 636); ctx.quadraticCurveTo(700, 618, 738, 636); ctx.quadraticCurveTo(700, 652, 662, 636); ctx.fill();
      ctx.restore();
      ctx.beginPath(); R.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); outline(ctx, lw);
    }
    // zem
    ctx.fillStyle = P.dirt; ctx.fillRect(left, GY, right - left, 4000);
    ctx.fillStyle = P.dirtD; for (let x = Math.floor(left / 180) * 180; x < right; x += 180) { circle(ctx, x + 40, GY + 70 + (x % 7) * 8, 6); ctx.fill(); circle(ctx, x + 120, GY + 140 + (x % 5) * 10, 4.5); ctx.fill(); }
    if (map === "u") {
      const Pn = JP.POND, a = Pn.x0 - 40, b = Pn.x0 + 40;
      ctx.beginPath(); ctx.moveTo(a - 2, GY); ctx.lineTo(b, Pn.y); ctx.lineTo(W - b, Pn.y); ctx.lineTo(W - a + 2, GY); ctx.closePath(); ctx.fillStyle = P.dirtD; ctx.fill();
      const wl = Pn.water, xa = a + (b - a) * (wl - GY) / (Pn.y - GY);
      ctx.beginPath(); ctx.moveTo(xa, wl); ctx.lineTo(b, Pn.y); ctx.lineTo(W - b, Pn.y); ctx.lineTo(W - xa, wl); ctx.closePath(); ctx.fillStyle = P.water; ctx.fill();
      ctx.save(); ctx.clip();
      ctx.fillStyle = P.waterD; ctx.fillRect(xa, Pn.y - 22, W - 2 * xa, 30);
      ctx.strokeStyle = P.waterL; ctx.lineWidth = 3; ctx.lineCap = "round";
      const ph = calm() ? 0 : animT * 0.8;
      for (let i = 0; i < 4; i++) { const x = 580 + i * 80 + Math.sin(ph + i) * 10, y = wl + 12 + (i % 2) * 14; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 34, y); ctx.stroke(); }
      ctx.restore();
      ctx.beginPath(); ctx.moveTo(xa, wl); ctx.lineTo(W - xa, wl); ctx.strokeStyle = P.waterL; ctx.lineWidth = lw; ctx.stroke();
      // rákosí
      for (const [x, s] of [[a + 16, 1], [W - a - 16, -1], [a + 30, 1]]) for (let i = 0; i < 3; i++) {
        const bx = x + i * 6 * s, top = GY - 30 - i * 8;
        ctx.beginPath(); ctx.moveTo(bx, GY + 6); ctx.quadraticCurveTo(bx + 3 * s, (GY + top) / 2, bx + 6 * s, top); ctx.strokeStyle = P.grassD; ctx.lineWidth = 3; ctx.stroke();
        if (i === 1) { rrect(ctx, bx + 6 * s - 3, top - 14, 6, 16, 3); ctx.fillStyle = "#8A5A3B"; ctx.fill(); }
      }
    }
    // tráva (u údolí jen na plošinách, svah je hlína)
    const grass = (x0, x1) => { ctx.fillStyle = P.grass; ctx.fillRect(x0, GY - 2, x1 - x0, 22); ctx.beginPath(); ctx.moveTo(x0, GY + 20); ctx.lineTo(x1, GY + 20); ctx.strokeStyle = P.grassD; ctx.lineWidth = 3; ctx.stroke(); };
    if (map === "u") { grass(left, JP.POND.x0 - 40); grass(W - JP.POND.x0 + 40, right); }
    else grass(left, right);
    ctx.beginPath();
    if (map === "h") { const e = Math.sqrt(HILL.r ** 2 - (GY - HILL.y) ** 2); ctx.moveTo(left, GY); ctx.lineTo(HILL.x - e, GY); ctx.moveTo(HILL.x + e, GY); ctx.lineTo(right, GY); }
    else if (map === "u") { const Pn = JP.POND, a = Pn.x0 - 40, b = Pn.x0 + 40; ctx.moveTo(left, GY); ctx.lineTo(a, GY); ctx.lineTo(b, Pn.y); ctx.lineTo(W - b, Pn.y); ctx.lineTo(W - a, GY); ctx.lineTo(right, GY); }
    else if (map === "s") { ctx.moveTo(left, GY); ctx.lineTo(JP.ROCK[0][0], GY); ctx.moveTo(JP.ROCK[JP.ROCK.length - 1][0], GY); ctx.lineTo(right, GY); }
    else { ctx.moveTo(left, GY); ctx.lineTo(right, GY); }
    outline(ctx, lw);
    if (map === "p") for (const p of JP.PLAT) {
      // sloupek a prkenná plošina
      const top = p.y + p.h / 2;
      rrect(ctx, p.x - 7, top - 2, 14, GY - top + 4, 3); ctx.fillStyle = P.woodD; ctx.fill(); outline(ctx, lw * 0.8);
      rrect(ctx, p.x - p.w / 2, p.y - p.h / 2, p.w, p.h, 5); ctx.fillStyle = P.wood; ctx.fill();
      ctx.save(); ctx.clip(); ctx.fillStyle = "rgba(255,255,255,.28)"; ctx.fillRect(p.x - p.w / 2, p.y - p.h / 2, p.w, 5); ctx.fillStyle = "rgba(43,22,56,.16)"; ctx.fillRect(p.x - p.w / 2, p.y + p.h / 2 - 5, p.w, 5);
      ctx.strokeStyle = P.woodD; ctx.lineWidth = 1.5; for (let x = p.x - p.w / 2 + 34; x < p.x + p.w / 2 - 10; x += 34) { ctx.beginPath(); ctx.moveTo(x, p.y - p.h / 2); ctx.lineTo(x, p.y + p.h / 2); ctx.stroke(); }
      ctx.restore();
      rrect(ctx, p.x - p.w / 2, p.y - p.h / 2, p.w, p.h, 5); outline(ctx, lw);
      ctx.fillStyle = P.grass; rrect(ctx, p.x - p.w / 2 + 3, p.y - p.h / 2 - 4, p.w - 6, 6, 3); ctx.fill();
    }
  }
  // noc: teplé světlo luceren za pevnostmi a světlušky (jen pozadí, jednotky a kostky zůstávají plně čitelné)
  function drawNightGlow() {
    for (const t of ["x", "o"]) {
      const cx = t === "x" ? 220 : W - 220, cy = GY - 230;
      const g = ctx.createRadialGradient(cx, cy, 30, cx, cy, 420);
      g.addColorStop(0, "rgba(255,214,140,.42)"); g.addColorStop(0.55, "rgba(255,200,120,.16)"); g.addColorStop(1, "rgba(255,200,120,0)");
      ctx.fillStyle = g; ctx.fillRect(cx - 420, cy - 420, 840, 840);
    }
  }
  function drawFireflies() {
    for (let i = 0; i < 16; i++) {
      const bx = (i * 173) % W, by = 420 + (i * 97) % 380, t = calm() ? 0 : animT;
      const x = bx + Math.sin(t * 0.7 + i) * 40, y = by + Math.sin(t * 0.9 + i * 2) * 26, a = calm() ? 0.8 : 0.45 + 0.55 * Math.max(0, Math.sin(t * 2 + i * 1.7));
      ctx.fillStyle = `rgba(214,255,120,${a * 0.35})`; circle(ctx, x, y, 7); ctx.fill();
      ctx.fillStyle = `rgba(240,255,170,${a})`; circle(ctx, x, y, 2.6); ctx.fill();
    }
  }
  // vítr: lehké proužky ve směru větru; lehká gravitace: chmýří stoupá
  function drawWindStreaks(lw) {
    const wd = env().wd || 0; if (!wd) return;
    const t = calm() ? 0 : animT, sp = 120 * Math.abs(wd), dir = Math.sign(wd);
    ctx.strokeStyle = "rgba(255,255,255,.75)"; ctx.lineCap = "round"; ctx.lineWidth = 3;
    for (let i = 0; i < 9; i++) {
      const span = W + 400, x = ((i * 211 + dir * t * sp) % span + span) % span - 200, y = 140 + (i * 71) % 420;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + dir * 40, y - 10, x + dir * 80, y); ctx.stroke();
    }
  }
  function drawFluff() {
    for (let i = 0; i < 12; i++) {
      const t = calm() ? 0 : animT, x = (i * 131) % W + Math.sin(t * 0.6 + i) * 30, y = 820 - ((t * 18 + i * 67) % 560);
      ctx.strokeStyle = "rgba(255,255,255,.8)"; ctx.lineWidth = 1.4;
      for (let k = 0; k < 6; k++) { const a = k / 6 * TAU; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * 6, y + Math.sin(a) * 6); ctx.stroke(); }
      ctx.fillStyle = "#fff"; circle(ctx, x, y, 1.6); ctx.fill();
    }
  }
  // prapor na pevnosti podle postupu v sérii (1 Ostřílený, 2 Mistr praku, 3 Král louky)
  function drawBanner(t, rank, lw) {
    if (!rank) return;
    const x = t === "x" ? PLINTHS.x[0] + 7 : PLINTHS.o[1] - 7, y0 = PY, top = PY - 190, dir = t === "x" ? 1 : -1, T = TEAM[t];
    rrect(ctx, x - 3, top, 6, y0 - top, 3); ctx.fillStyle = "#8A5A3B"; ctx.fill(); outline(ctx, lw * 0.7);
    circle(ctx, x, top - 3, 5); ctx.fillStyle = "#FFC83D"; ctx.fill(); outline(ctx, lw * 0.6);
    const wave = calm() ? 0 : Math.sin(animT * 3) * 3, fx = x + dir * 3;
    ctx.beginPath(); ctx.moveTo(fx, top + 4); ctx.quadraticCurveTo(fx + dir * 30, top + 4 + wave, fx + dir * 58, top + 18); ctx.quadraticCurveTo(fx + dir * 30, top + 34 - wave, fx, top + 38); ctx.closePath();
    ctx.fillStyle = rank >= 3 ? "#FFC83D" : T.c; ctx.fill(); outline(ctx, lw * 0.8);
    if (rank >= 2) ART.star(ctx, fx + dir * 22, top + 20, 7, rank >= 3 ? T.c : "#FFE27A", lw * 0.5);
  }
  function hpCol(f) { return f > 0.5 ? "#59C74A" : f > 0.25 ? "#FFC83D" : "#E8413C"; }
  function drawBars(bodies, lw) {
    const bw = clamp(56 / cam.s, 46, 96), bh = clamp(9 / cam.s, 7, 16);
    for (const b of bodies) {
      if (!isUnit(b.k)) continue;
      const U = UNIT[b.k], f = clamp(b.hp / U.hp, 0, 1), sh = b.k === "S" ? clamp((b.z || 0) / U.z, 0, 1) : 0;
      const king = b.k === "K";
      if (!king && f >= 0.999 && (b.k !== "S" || sh >= 0.999)) continue;
      const w = king ? bw * 1.15 : bw * 0.75, x = b.x - w / 2, y = b.y - halfH(b.k) - (king ? 30 : 16) - bh;
      rrect(ctx, x, y, w, bh, bh / 2); ctx.fillStyle = "rgba(43,22,56,.55)"; ctx.fill();
      if (f > 0) { rrect(ctx, x + 1.5, y + 1.5, Math.max(bh - 3, (w - 3) * f), bh - 3, (bh - 3) / 2); ctx.fillStyle = hpCol(f); ctx.fill(); }
      rrect(ctx, x, y, w, bh, bh / 2); ctx.lineWidth = lw * 0.6; ctx.strokeStyle = INK; ctx.stroke();
      if (b.k === "S" && sh > 0) { rrect(ctx, x, y - bh * 0.75, w * sh, bh * 0.55, bh * 0.27); ctx.fillStyle = "#4FA8FF"; ctx.fill(); ctx.lineWidth = lw * 0.4; ctx.stroke(); }
    }
  }
  function drawWorld(scene) {
    const lw = lwW(), E = env();
    if (E.md === "n") drawNightGlow();
    if (E.md === "v") drawWindStreaks(lw);
    drawTerrain(lw);
    const P = pal();
    // podstavce
    for (const t of ["x", "o"]) { const [a, b] = PLINTHS[t]; rrect(ctx, a, GY - 30, b - a, 32, 5); ctx.fillStyle = E.md === "n" ? "#6E7790" : "#8E98AA"; ctx.fill(); ctx.save(); ctx.clip(); ctx.fillStyle = "rgba(255,255,255,.25)"; ctx.fillRect(a, GY - 30, b - a, 6); ctx.fillStyle = "rgba(43,22,56,.14)"; ctx.fillRect(a, GY - 8, b - a, 10); ctx.restore(); rrect(ctx, a, GY - 30, b - a, 32, 5); outline(ctx, lw); }
    if (st) for (const t of ["x", "o"]) drawBanner(t, st.tt[t], lw);
    for (const t of ["x", "o"]) drawSling(t, lw, scene, 0);
    // zóna stavby a duch dílu
    if (scene.ghost) drawGhostZone(lw);
    for (const b of scene.bodies) {
      ctx.save();
      if (isUnit(b.k)) {
        const p = poseOf(b), hh = halfH(b.k);
        ctx.translate(b.x, b.y + p.dy); ctx.rotate(p.rot); ctx.translate(0, hh); ctx.scale(p.sx, p.sy); ctx.translate(0, -hh);
        drawUnit(ctx, b.k, b.t, lw, p.o);
      } else { ctx.translate(b.x, b.y); ctx.rotate(b.a); drawBlock(ctx, b.k, lw, b.max ? 1 - b.hp / b.max : 0, b.id); }
      ctx.restore();
    }
    drawBars(scene.bodies, lw);
    if (scene.ghost) drawGhost(scene.ghost, lw);
    if (scene.dots) {
      scene.dots.forEach((p, i) => { circle(ctx, p[0], p[1], Math.max(2.4, 6.2 - i * 0.13)); ctx.fillStyle = `rgba(255,255,255,${1 - i / scene.dots.length * 0.75})`; ctx.fill(); ctx.lineWidth = lw * 0.5; ctx.strokeStyle = "rgba(43,22,56,.6)"; ctx.stroke(); });
    }
    if (scene.hog) { const h = scene.hog; ctx.save(); ctx.translate(h.x, h.y); ctx.rotate(h.a); drawHog(ctx, h.team, lw, h.type, { t: animT }); ctx.restore(); }
    for (const t of ["x", "o"]) drawSling(t, lw, scene, 1);
    if (E.md === "n") drawFireflies();
    if (E.md === "g") drawFluff();
    drawParticles(lw);
    if (scene.hog) {
      const [sx, sy] = toScreen(scene.hog.x, scene.hog.y);
      if (sy < 0) { ctx.save(); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.beginPath(); ctx.moveTo(sx, 8); ctx.lineTo(sx - 10, 24); ctx.lineTo(sx + 10, 24); ctx.closePath(); ctx.fillStyle = "#fff"; ctx.fill(); outline(ctx, 2.5); ctx.restore(); }
    }
  }
  function drawSling(t, lw, scene, front) {
    const s = SLING[t], gy = groundAt(s.x), dir = t === "x" ? 1 : -1;
    const tipA = [s.x - 17, s.y - 4], tipB = [s.x + 17, s.y - 4];
    const pulled = scene.pull && scene.pull.team === t ? scene.pull : null;
    const idle = scene.loaded === t && !pulled && !calm() ? Math.sin(animT * 2.6) * 1.6 : 0;
    const pouch = pulled ? [pulled.x, pulled.y] : [s.x - dir * (scene.loaded === t ? 3 : 0) + idle * -dir * 0.4, s.y + 16 + idle];
    const band = tip => {
      ctx.lineCap = "round"; ctx.beginPath(); ctx.moveTo(tip[0], tip[1]); ctx.lineTo(pouch[0], pouch[1]);
      ctx.strokeStyle = ART.INK; ctx.lineWidth = 9; ctx.stroke(); ctx.strokeStyle = "#E0436B"; ctx.lineWidth = 4.5; ctx.stroke();
    };
    if (!front) { band(dir > 0 ? tipA : tipB); return; }
    ctx.beginPath(); ctx.moveTo(s.x - 6, gy + 6); ctx.lineTo(s.x - 6, s.y + 34); ctx.lineTo(tipA[0] - 5, tipA[1]); ctx.lineTo(tipA[0] + 5, tipA[1] - 2);
    ctx.lineTo(s.x, s.y + 24); ctx.lineTo(tipB[0] - 5, tipB[1] - 2); ctx.lineTo(tipB[0] + 5, tipB[1]); ctx.lineTo(s.x + 6, s.y + 34); ctx.lineTo(s.x + 6, gy + 6); ctx.closePath();
    ctx.fillStyle = "#B8763F"; ctx.fill(); outline(ctx, lw);
    ctx.save(); ctx.clip(); ctx.fillStyle = "rgba(255,255,255,.2)"; ctx.fillRect(s.x - 7, gy - 200, 4, 320); ctx.fillStyle = "rgba(43,22,56,.18)"; ctx.fillRect(s.x + 3, s.y, 4, 160); ctx.restore();
    if (pulled) { ctx.save(); ctx.translate(pulled.x, pulled.y); ctx.rotate(pulled.a); drawHog(ctx, t, lw, scene.hogType || "n", { t: animT }); ctx.restore(); }
    else if (scene.loaded === t) { ctx.save(); ctx.translate(pouch[0], pouch[1] - 4); drawHog(ctx, t, lw, scene.hogType || "n", { t: animT }); ctx.restore(); }
    band(dir > 0 ? tipB : tipA);
    rrect(ctx, pouch[0] - 9, pouch[1] - 5, 18, 10, 4); ctx.fillStyle = "#5A2A3A"; ctx.fill();
  }
  function drawGhostZone(lw) {
    const [z0, z1] = ZONE[me];
    ctx.save(); ctx.setLineDash([10, 8]); ctx.strokeStyle = "rgba(198,244,50,.95)"; ctx.lineWidth = lw * 1.1;
    rrect(ctx, z0, PY - JP.BUILD_H, z1 - z0, JP.BUILD_H, 14); ctx.stroke(); ctx.restore();
  }
  function drawGhost(g, lw) {
    const d = JP.pieceDims(g.kind, g.rot);
    ctx.save(); ctx.translate(g.x, g.y); ctx.rotate(g.rot ? Math.PI / 2 : 0); ctx.globalAlpha = 0.72;
    drawBlock(ctx, g.kind, lw, 0, 3); ctx.restore();
    rrect(ctx, g.x - d.w / 2 - 4, g.y - d.h / 2 - 4, d.w + 8, d.h + 8, 8);
    ctx.lineWidth = lw * 1.3; ctx.strokeStyle = g.ok ? "#C6F432" : "#E8413C"; ctx.setLineDash(g.ok ? [] : [8, 6]); ctx.stroke(); ctx.setLineDash([]);
    if (!g.ok) { ctx.save(); ctx.translate(g.x, g.y); ctx.strokeStyle = "#E8413C"; ctx.lineWidth = lw * 1.6; ctx.lineCap = "round"; ctx.beginPath(); ctx.moveTo(-9, -9); ctx.lineTo(9, 9); ctx.moveTo(9, -9); ctx.lineTo(-9, 9); ctx.stroke(); ctx.restore(); }
  }

  // ---------- částice, úlomky, třesení, zpomalení ----------
  let parts = [], shake = 0, freeze = 0, slow = { t: 0, f: 1 };
  const PCOL = { w: ["#E9A55A", "#C77F35", "#F6C88A"], s: ["#A8B3C4", "#7D889A", "#D5DCE6"], g: ["#E6FBFF", "#BDEFFF", "#ffffff"], i: ["#E8F7FF", "#B6E2F5", "#ffffff"], m: ["#C4CCD8", "#8B97AB", "#EEF2F7"], c: ["#fff", "#FFE27A"], z: ["#C98A4B", "#6CCB3A"], h: ["#8A5A3B", "#6B4226"], b: ["#9FD3FF", "#ffffff", "#4FA8FF"] };
  const MAXP = 380;
  function burst(x, y, m, n, power = 1) {
    if (calm()) n = Math.ceil(n / 3);
    const cols = PCOL[m] || PCOL.z;
    for (let i = 0; i < n && parts.length < MAXP; i++) {
      const a = Math.random() * TAU, v = (1.5 + Math.random() * 4.5) * power;
      parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 2.5 * power, life: 0, max: 35 + Math.random() * 30, k: m === "g" || m === "i" || m === "b" ? "shard" : m === "s" || m === "z" ? "dust" : "chip", c: cols[i % cols.length], sz: 3 + Math.random() * 6, r: Math.random() * 6, vr: (Math.random() - 0.5) * 0.4 });
    }
  }
  function fragments(e) {
    const bi = lastBodies.get(e.id), K = bi && KIND[bi.k];
    if (!K) { burst(e.x, e.y, e.m || "w", 14, 1.2); return; }
    STATS.frag++;
    const m = K.m, cols = MATCOL[m] || MATCOL.w, long = K.w >= K.h, L = long ? K.w : K.h;
    const n = calm() ? 3 : m === "g" || m === "i" ? 9 : m === "s" || m === "m" ? 6 : clamp(Math.round(L / 34), 3, 6);
    const ca = Math.cos(bi.a), sa = Math.sin(bi.a);
    for (let i = 0; i < n && parts.length < MAXP; i++) {
      const u = (i + 0.5) / n - 0.5, lx = long ? u * K.w : (Math.random() - 0.5) * K.w, ly = long ? (Math.random() - 0.5) * K.h : u * K.h;
      const wx = bi.x + lx * ca - ly * sa, wy = bi.y + lx * sa + ly * ca;
      const ang = Math.atan2(wy - e.y, wx - e.x) + (Math.random() - 0.5) * 0.9, v = 2 + Math.random() * 4.2;
      const cell = long ? [K.w / n, K.h] : [K.w, K.h / n];
      const pts = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([px, py]) => [px * (cell[0] / 2) * (0.7 + Math.random() * 0.3), py * (cell[1] / 2) * (0.7 + Math.random() * 0.3)]);
      const glassy = m === "g" || m === "i";
      if (glassy) { pts.length = 3; for (const q of pts) { q[0] *= 0.8; q[1] *= 0.8; } }
      parts.push({ x: wx, y: wy, vx: Math.cos(ang) * v, vy: Math.sin(ang) * v - 2.2, life: 0, max: 80 + Math.random() * 40, k: "frag", pts, c: cols[0], glass: glassy, r: bi.a, vr: (Math.random() - 0.5) * 0.45, sz: 1 });
    }
    if (m === "w" && !calm()) for (let i = 0; i < 4 && parts.length < MAXP; i++) parts.push({ x: bi.x + (Math.random() - 0.5) * K.w, y: bi.y, vx: (Math.random() - 0.5) * 6, vy: -2 - Math.random() * 4, life: 0, max: 60 + Math.random() * 30, k: "frag", pts: [[-8, -1.2], [8, -1.2], [8, 1.2], [-8, 1.2]], c: cols[1], glass: false, r: Math.random() * 3, vr: (Math.random() - 0.5) * 0.6, sz: 1 });
    burst(bi.x, bi.y, m === "g" || m === "i" ? m : "z", m === "s" || m === "m" ? 10 : 5, 0.8);
  }
  const words = ["Au!", "Jau!", "Ouha!", "Fuj!", "Ajaj!"];
  function floatText(x, y, text, c, sz = 34, vy = -1.1, max = 80) { parts.push({ x, y, vx: 0, vy, life: 0, max, k: "text", c, text, sz, r: 0, vr: 0 }); }
  function koFx(x, y, team, kind) {
    burst(x, y, "c", 8, 1.1);
    const dir = x > W / 2 ? 1 : -1;
    puff.push({ x, y, team, kind: kind || "C", life: 0, vx: dir * (1.4 + Math.random()), vy: -8.6, rot: 0, vr: dir * 0.2 });
    if (!calm()) for (let i = 0; i < 5; i++) parts.push({ x, y: y - 10, vx: (i - 2) * 1.5, vy: -4 - Math.random() * 2, life: 0, max: 60, k: "star", c: "#FFE27A", sz: 9, r: 0, vr: 0.1 });
    floatText(x, y - 34, kind === "K" ? "Král padl!" : words[(x | 0) % words.length], TEAM[team].c, kind === "K" ? 44 : 34, -1.1, kind === "K" ? 120 : 80);
  }
  function boomFx(e) {
    STATS.boom++;
    parts.push({ x: e.x, y: e.y, vx: 0, vy: 0, life: 0, max: 26, k: "ring", sz: e.r, c: "#FFD23C", r: 0, vr: 0 });
    const cols = ["#FFD23C", "#FF8A2A", "#E8413C", "#fff"];
    for (let i = 0; i < (calm() ? 6 : 16) && parts.length < MAXP; i++) { const a = Math.random() * TAU, v = 2 + Math.random() * 6; parts.push({ x: e.x, y: e.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 1, life: 0, max: 24 + Math.random() * 18, k: "puffball", c: cols[i % 4], sz: 8 + Math.random() * 12, r: 0, vr: 0 }); }
    burst(e.x, e.y, "z", 10, 1.4);
  }
  let puff = [];
  function puffOut(p) {
    for (let i = 0; i < (calm() ? 5 : 9) && parts.length < MAXP; i++) { const a = i / 9 * TAU, v = 1.2 + Math.random() * 1.6; parts.push({ x: p.x, y: p.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 0.4, life: 0, max: 30 + Math.random() * 10, k: "puffball", c: "#fff", sz: 8 + Math.random() * 6, r: 0, vr: 0 }); }
    if (!calm()) for (let i = 0; i < 4; i++) parts.push({ x: p.x, y: p.y, vx: (i - 1.5) * 1.6, vy: -2.4 - i * 0.3, life: 0, max: 46, k: "star", c: "#FFE27A", sz: 8, r: 0, vr: 0.12 });
    floatText(p.x, p.y - 8, "puf", "#fff", 26, -0.7, 50);
  }
  function drawParticles(lw) {
    for (const p of puff) {
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.scale(1 + p.life / 150, 1 + p.life / 150);
      drawUnit(ctx, p.kind, p.team, lw, { ko: true, hurt: 1, t: animT, still: calm(), plain: true }); ctx.restore();
    }
    for (const p of parts) {
      const al = p.k === "frag" ? Math.min(1, (1 - p.life / p.max) * 3) : 1 - p.life / p.max;
      ctx.save(); ctx.globalAlpha = Math.max(0, al); ctx.translate(p.x, p.y); ctx.rotate(p.r);
      if (p.k === "chip") { ctx.fillStyle = p.c; ctx.fillRect(-p.sz / 2, -p.sz / 5, p.sz, p.sz / 2.5); ctx.strokeStyle = INK; ctx.lineWidth = lw * 0.4; ctx.strokeRect(-p.sz / 2, -p.sz / 5, p.sz, p.sz / 2.5); }
      else if (p.k === "frag") { ctx.beginPath(); p.pts.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.closePath(); ctx.fillStyle = p.c; ctx.fill(); ctx.strokeStyle = p.glass ? "rgba(43,22,56,.6)" : INK; ctx.lineWidth = lw * 0.55; ctx.lineJoin = "round"; ctx.stroke(); }
      else if (p.k === "dust") { circle(ctx, 0, 0, p.sz * (0.6 + p.life / p.max)); ctx.fillStyle = p.c; ctx.fill(); }
      else if (p.k === "shard") { ctx.beginPath(); ctx.moveTo(0, -p.sz); ctx.lineTo(p.sz * 0.6, p.sz * 0.5); ctx.lineTo(-p.sz * 0.5, p.sz * 0.3); ctx.closePath(); ctx.fillStyle = p.c; ctx.fill(); ctx.strokeStyle = "rgba(43,22,56,.6)"; ctx.lineWidth = lw * 0.35; ctx.stroke(); }
      else if (p.k === "star") { ART.star(ctx, 0, 0, p.sz, p.c, lw * 0.5); }
      else if (p.k === "puffball") { circle(ctx, 0, 0, p.sz * (0.5 + 0.9 * p.life / p.max)); ctx.fillStyle = p.c; ctx.fill(); outline(ctx, lw * 0.6); }
      else if (p.k === "ring") { const u = p.life / p.max, r = p.sz * (1 - (1 - u) ** 3); circle(ctx, 0, 0, r); ctx.fillStyle = p.c === "#7FE3D9" ? "rgba(127,227,217,.22)" : "rgba(255,210,60,.28)"; ctx.fill(); ctx.lineWidth = lw * (1.6 - u); ctx.strokeStyle = p.c === "#7FE3D9" ? "#1FA9A3" : "#FF8A2A"; ctx.stroke(); }
      else if (p.k === "text") { ctx.rotate(-p.r); ctx.font = `${p.sz}px "Titan One", sans-serif`; ctx.textAlign = "center"; ctx.lineWidth = 7; ctx.strokeStyle = INK; ctx.lineJoin = "round"; ctx.strokeText(p.text, 0, 0); ctx.fillStyle = p.c; ctx.fillText(p.text, 0, 0); }
      ctx.restore();
    }
  }
  function stepParticles() {
    for (const p of parts) {
      p.life++;
      if (p.k === "text" || p.k === "ring") { p.y += p.vy; p.x += p.vx; continue; }
      p.vy += p.k === "puffball" ? 0.04 : 0.25; p.vx *= p.k === "puffball" ? 0.93 : 0.98; p.x += p.vx; p.y += p.vy; p.r += p.vr;
      if (p.y > GY - 2 && p.k !== "dust" && p.k !== "puffball") { p.y = GY - 2; p.vy *= -0.3; p.vx *= 0.7; p.vr *= 0.6; }
    }
    parts = parts.filter(p => p.life < p.max);
    for (const p of puff) {
      p.life++; p.x += p.vx; p.y += p.vy; p.vy += 0.42; p.rot += p.vr;
      if (p.life === 34) { puffOut(p); }
    }
    puff = puff.filter(p => p.life < 34);
    shake *= 0.86; if (shake < 0.3) shake = 0;
  }
  let koTrack = { kings: { x: 1, o: 1 }, last: -99 };
  function beginAct(bodies) { koTrack = { kings: { x: JP.kingOf(bodies, "x") ? 1 : 0, o: JP.kingOf(bodies, "o") ? 1 : 0 }, last: -99 }; }
  function nearCritters(x, y, r, f) { for (const s of CS.values()) if (frameN - s.last <= 3 && Math.hypot(s.x - x, s.y - y) < r) f(s); }
  function hitStop(freezeTicks, slowT, slowF, kick) {
    if (calm()) return;
    freeze = Math.max(freeze, freezeTicks);
    if (slowT) slow = slow.t > 0 ? { t: Math.max(slow.t, slowT), f: Math.min(slow.f, slowF) } : { t: slowT, f: slowF };
    cam.impact(kick);
  }
  function fx(e, quiet) {
    if (e.type === "h") {
      burst(e.x, e.y, e.m, 3 + e.s * 4, 0.6 + e.s * 0.3);
      if (!quiet) sfx.hit(e.m, e.s);
      if (e.s >= 2 && !calm()) shake = Math.max(shake, 4 + e.s * 3);
      if (e.s >= 3) hitStop(3, 14, 0.5, 0.5);
      if (e.s >= 2) nearCritters(e.x, e.y, 110, s => { s.startle = Math.max(s.startle, 0.6 + e.s * 0.12); });
    } else if (e.type === "b") {
      fragments(e); if (!quiet) sfx.hit(e.m || "w", 3);
      if (!calm()) { shake = Math.max(shake, 7); hitStop(2, 0, 1, 0.3); }
      nearCritters(e.x, e.y, 130, s => { s.startle = 1; });
    } else if (e.type === "k") {
      const team = e.m === "o" ? "o" : "x", king = e.u === "K";
      koFx(e.x, e.y, team, e.u); if (!quiet) { sfx.ko(); if (king) sfx.king(); } buzz(king ? 60 : 30);
      if (!calm()) { shake = Math.max(shake, king ? 16 : 10); hitStop(king ? 8 : 5, 0, 1, king ? 1 : 0.7); }
      if (king) koTrack.kings[team] = 0;
      const decisive = king || e.t - koTrack.last < 45;
      koTrack.last = e.t;
      STATS.ko++;
      if (decisive && !calm()) { hitStop(0, king ? 80 : 50, king ? 0.25 : 0.32, 1); STATS.slow++; }
      CS.delete(e.id);
      nearCritters(e.x, e.y, 200, s => { s.startle = 1; s.fear = Math.max(s.fear, 0.7); });
    } else if (e.type === "e") {
      boomFx(e); if (!quiet) sfx.boom(); buzz(40);
      if (!calm()) { shake = Math.max(shake, 16); hitStop(4, 24, 0.4, 1); }
      nearCritters(e.x, e.y, e.r * 1.6, s => { s.startle = 1; s.fear = Math.max(s.fear, 0.8); });
    } else if (e.type === "n") { if (!quiet) sfx.drop(); burst(e.x, e.y + 10, "z", 8, 0.7); STATS.build++; }
    else if (e.type === "j") {
      const s = CS.get(e.id); STATS.dodge++;
      if (s) { s.dodge = 1; s.startle = 1; floatText(s.x, s.y - 30, "hop!", "#FFE27A", 26, -1.3, 60); }
      if (!quiet) sfx.hop();
    } else if (e.type === "r") {
      STATS.bounce++;
      parts.push({ x: e.x, y: e.y, vx: 0, vy: 0, life: 0, max: 22, k: "ring", sz: 60, c: "#7FE3D9", r: 0, vr: 0 });
      floatText(e.x, e.y - 40, "boing", "#7FE3D9", 28, -1.2, 55);
      if (!quiet) sfx.boing();
      if (!calm()) shake = Math.max(shake, 5);
    } else if (e.type === "z") {
      STATS.shield++;
      const s = CS.get(e.id);
      if (s) { burst(s.x + (s.t === "x" ? 18 : -18), s.y, "b", 8, 0.9); if (e.z <= 0) floatText(s.x, s.y - 44, "Štít praskl", "#9FD3FF", 22, -1, 70); }
      if (!quiet) sfx.clank();
    }
  }
  // léčení a comeback po dohrání akce (u střelce i u soupeře stejně, z dokumentu)
  function afterAct(a) {
    if (!a) return;
    if (Array.isArray(a.hl) && a.hl.length) {
      let delay = 0;
      for (const [hid, tid] of a.hl) {
        setTimeout(() => {
          const h = CS.get(hid), t = CS.get(tid), b = st && st.b.find(q => q.id === tid);
          if (h) h.heal = 1; if (t) { t.heal = 1; t.cheer = Math.max(t.cheer, 0.3); }
          const prev = a.hlFrom && a.hlFrom[tid];
          if (b) floatText(b.x, b.y - halfH(b.k) - 14, "+" + (prev != null ? b.hp - prev : JP.HEAL.amount), "#2FBF71", 30, -1, 80);
          STATS.heal++; sfx.heal();
        }, delay);
        delay += calm() ? 0 : 260;
      }
    }
    if (a.cb) {
      const who = a.cb, text = me === who ? "Prohráváš: máš jednu stavbu navíc a smíš stavět hned." : `${nameOf(st, who)} prohrává a dostává jednu stavbu navíc.`;
      notice(text);
    }
  }

  // ---------- stav ----------
  let st = null;            // partie (b = tělesa jako objekty)
  let room = null, me = null, view = "setup", busy = false, net = "", bootSeq = 0, starter = "o", shareKind = "new";
  let acting = null;        // { sim, kind, base, … } – moje probíhající akce (výstřel nebo stavba)
  let replay = null;        // { acts, i, rp, t, final } – přehrávání soupeřova tahu
  let pendingDoc = null;
  let aim = null;           // { x0, y0, dx, dy, kb } – napínání praku
  let pickSel = null;
  let pickAt = 0;
  let mode = "shoot";       // můj tah: shoot | build
  let ghost = null;         // { kind, rot, x, y, yh, ok, why }
  let drag = null;          // tažení ducha prstem / myší
  let bannerFor = "";

  const nameOf = (g, p) => p === "x" ? g.x : g.o;
  const ended = () => !!st && st.ph === "end";
  const myTurn = () => !!st && !!me && st.p === me && !ended();
  const ready = () => !acting && !replay && !busy && view === "play";
  const handOf = (g, t) => g && g.hd ? g.hd[t] || "" : "";
  const canAim = () => myTurn() && st.ph === "t" && mode === "shoot" && !!handOf(st, me) && ready();
  const picking = () => myTurn() && st.ph === "pick" && !acting && !replay && view === "play";
  const building = () => myTurn() && st.ph === "t" && mode === "build" && !acting && !replay && view === "play";
  function buildBlock(g, t) {
    if (!g || g.ph !== "t" || g.p !== t) return "Teď nejsi na tahu.";
    if (g.bs[t] <= 0) return "Stavby ti došly.";
    if (g.lb[t]) return "Dvakrát po sobě stavět nejde.";
    if (JP.turnNo(g.n) < RULES.buildFrom) return "Stavět můžeš od 2. tahu.";
    return "";
  }
  const freeSeat = () => !room ? null : !room.sx ? "x" : !room.so ? "o" : null;
  const say = t => { $("say").textContent = ""; requestAnimationFrame(() => $("say").textContent = t); };

  function currentHog() {
    if (acting && acting.kind === "s") { const h = acting.rp.hogView(acting.t); return h && { ...h, team: acting.team, type: acting.type }; }
    if (replay && replay.rp) { const a = replay.acts[replay.i], h = replay.rp.hogView(replay.t); return h && { ...h, team: a.by, type: a.ht || "n" }; }
    return null;
  }
  let decor = null;   // pevnost na pozadí úvodní obrazovky
  function scene() {
    let bodies, hog = currentHog();
    if (acting) bodies = acting.rp.view(acting.t);
    else if (replay && replay.rp) bodies = replay.rp.view(replay.t);
    else if (st) bodies = st.b.map(b => ({ ...b, max: JP.maxOf(b) }));
    else { if (!decor) decor = JPFort.gen(424242).bodies.map(b => ({ ...b, max: JP.maxOf(b) })); bodies = decor; }
    const sc = { bodies, hog, hogType: st ? handOf(st, st.p) || "n" : "n" };
    if (aim && canAim()) {
      const { ang, pow } = aimParams(aim.dx, aim.dy);
      const s = SLING[me], pullW = pow * 70;
      sc.pull = { team: me, x: s.x - Math.cos(ang) * pullW, y: s.y - Math.sin(ang) * pullW, a: ang };
      if (pow > 0.08) {
        const all = JP.preview(me, ang, pow, 16, 3, handOf(st, me), env()), cut = all.findIndex(p => p[1] > groundAt(p[0]) - 6);
        sc.dots = cut < 0 ? all : all.slice(0, cut);
      }
    } else if (st && st.ph === "t" && handOf(st, st.p) && !acting && !replay && !ended() && view === "play" && !(building())) sc.loaded = st.p;
    if (building() && ghost) sc.ghost = ghost;
    return sc;
  }

  // ---------- smyčka ----------
  let last = performance.now(), accT = 0;
  const speed = () => TEST && window.JPT ? window.JPT.speed : 1;
  function frame(now) {
    const dt = Math.min(100, now - last); last = now;
    accT += dt * speed() * (slow.t > 0 ? slow.f : settling() ? 1.8 : 1);
    let n = 0;
    while (accT >= 1000 / 60 && n < 12) { accT -= 1000 / 60; n++; tick(); }
    if (n >= 12) accT = 0;
    draw();
    requestAnimationFrame(frame);
  }
  function settling() {
    const r = acting && !acting.played ? acting : replay && replay.rp ? replay : null;
    return !!r && r.wait <= 0 && r.t - (r.lastEv || 0) > 30 && !r.rp.hogView(r.t);
  }
  function tick() {
    if (freeze > 0) { freeze--; STATS.freeze++; return; }
    if (acting && !acting.played && stepPlay(acting)) { acting.played = true; if (acting.kind === "s") reactToShot(acting.team, acting.evs); tryFinish(); }
    if (replay) stepReplay();
    stepParticles();
  }
  let lastDrawT = performance.now();
  function draw() {
    const nowT = performance.now(), lastDrawT0 = lastDrawT, dtf = clamp((nowT - lastDrawT) / 16.667, 0.3, 3); lastDrawT = nowT;
    if (slow.t > 0) slow.t -= dtf;
    cam.update((nowT - lastDrawT0) / 1000, camIntent());
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const sx = shake ? (Math.random() - 0.5) * shake : 0, sy = shake ? (Math.random() - 0.5) * shake : 0;
    ctx.translate(sx, sy);
    bg();
    const [ox, oy] = toScreen(0, 0);
    ctx.setTransform(dpr * cam.s, 0, 0, dpr * cam.s, dpr * (ox + sx), dpr * (oy + sy));
    const sc = scene();
    csUpdate(sc.bodies, sc.hog, dtf);
    drawWorld(sc);
    if (frameN % 12 === 0 && view === "play" && st) hudLive(sc.bodies);
  }

  // ---------- míření ----------
  const maxPull = () => clamp(Math.min(cw, ch) * 0.34, 90, 210);
  function aimParams(dx, dy) {
    const d = Math.hypot(dx, dy);
    if (!d) return { ang: me === "o" ? -Math.PI * 0.75 : -Math.PI / 4, pow: 0 };
    return { ang: Math.round(Math.atan2(-dy, -dx) * 1000) / 1000, pow: Math.round(Math.min(1, d / maxPull()) * 1000) / 1000 };
  }
  const pt = e => { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  const ptrs = new Map();
  let pan = null, pinch = null;
  function nearSling(x, y) {
    const [hx, hy] = toScreen(SLING[me].x, SLING[me].y);
    return Math.hypot(x - hx, y - hy) < Math.max(56, 95 * cam.s);
  }
  cv.addEventListener("pointerdown", e => {
    const [x, y] = pt(e);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    if (e.isPrimary) { ptrs.clear(); pinch = null; }
    ptrs.set(e.pointerId, [x, y]);
    attempt(() => cv.setPointerCapture(e.pointerId));
    if (ptrs.size === 2) {
      aim = null; pan = null; drag = null;
      const [a, b] = [...ptrs.values()];
      pinch = true; cam.pinchStart(a, b); syncView();
      render(); return;
    }
    if (ptrs.size > 2) return;
    if (canAim() && nearSling(x, y)) { aim = { x0: x, y0: y, dx: 0, dy: 0 }; render(); return; }
    // stavba: tažení posouvá ducha (kamera se netáhne), na dotyku drží duch 64 px nad prstem
    if (building() && ghost) { drag = { touch: e.pointerType === "touch" }; moveGhost(x, y, drag.touch); return; }
    pan = { x0: x, cx: cam.x, moved: false };
    cv.classList.add("pan");
  });
  cv.addEventListener("pointermove", e => {
    if (!ptrs.has(e.pointerId)) return;
    const [x, y] = pt(e);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    ptrs.set(e.pointerId, [x, y]);
    if (pinch && ptrs.size >= 2) {
      const [a, b] = [...ptrs.values()];
      cam.pinchMove(a, b); syncView();
    } else if (aim) {
      aim.dx = x - aim.x0; aim.dy = y - aim.y0;
      const { pow } = aimParams(aim.dx, aim.dy);
      sfx.stretch(pow); showMeter();
    } else if (drag) moveGhost(x, y, drag.touch);
    else if (pan) {
      if (Math.abs(x - pan.x0) > 4) pan.moved = true;
      if (pan.moved) { cam.panTo(pan.cx, x - pan.x0); syncView(); }
    }
  });
  const endAim = fire => {
    if (!aim) return;
    const a = aim; aim = null;
    const { ang, pow } = aimParams(a.dx, a.dy);
    if (fire && pow >= 0.1 && canAim()) shoot(ang, pow); else render();
  };
  function up(e, fire) {
    ptrs.delete(e.pointerId);
    if (pinch) { if (ptrs.size < 2) { pinch = null; cam.pinchEnd(); } return; }
    endAim(fire);
    if (drag) { drag = null; renderDock(); }
    pan = null; cv.classList.remove("pan");
  }
  cv.addEventListener("pointerup", e => up(e, true));
  cv.addEventListener("pointercancel", e => up(e, false));
  cv.addEventListener("wheel", e => {
    e.preventDefault();
    const [x] = pt(e);
    cam.zoomAt(x, Math.exp(-e.deltaY * 0.0015)); syncView();
  }, { passive: false });
  $("viewBtn").addEventListener("click", () => { cam.toggle(viewTeam(), me ? SLING[me].x : null); syncView(); });
  cv.tabIndex = 0;
  document.addEventListener("keydown", e => {
    if (view !== "play" || !st || e.target.closest("input, textarea, select, dialog")) return;
    const k = e.key;
    if (myTurn() && st.ph === "t" && ready()) {
      if (k === "q" || k === "Q") { setMode("shoot"); e.preventDefault(); return; }
      if (k === "e" || k === "E") { setMode("build"); e.preventDefault(); return; }
    }
    if (building()) {
      if (k === "r" || k === "R") { rotate(); e.preventDefault(); }
      else if (k === "Enter") { e.preventDefault(); doBuild(); }
      else if (k === "Escape") { setMode("shoot"); }
      else if (k === "ArrowLeft" || k === "ArrowRight") { nudge(k === "ArrowLeft" ? -8 : 8, 0); e.preventDefault(); }
      else if (k === "ArrowUp" || k === "ArrowDown") { nudge(0, k === "ArrowUp" ? -1 : 1); e.preventDefault(); }
      else if (k >= "1" && k <= "3") { choosePiece(JP.BUILD[+k - 1]); }
      return;
    }
    if (canAim() && (document.activeElement === cv || document.activeElement === document.body)) {
      if (!aim) { const r = maxPull() * 0.7, a0 = me === "o" ? -Math.PI * 0.75 : -Math.PI / 4; aim = { x0: 0, y0: 0, dx: -Math.cos(a0) * r, dy: -Math.sin(a0) * r, kb: true }; }
      const { ang, pow } = aimParams(aim.dx, aim.dy);
      let A = ang, P = pow, used = true;
      if (k === "ArrowLeft") A += (me === "o" ? 1 : -1) * Math.PI / 180;
      else if (k === "ArrowRight") A -= (me === "o" ? 1 : -1) * Math.PI / 180;
      else if (k === "ArrowUp") P = Math.min(1, P + 0.02);
      else if (k === "ArrowDown") P = Math.max(0.1, P - 0.02);
      else if (k === " " || k === "Enter") { endAim(true); e.preventDefault(); return; }
      else if (k === "Escape") { aim = null; render(); return; }
      else { used = false; if (!aim.dx && !aim.dy) aim = null; }
      if (used) { e.preventDefault(); aim.dx = -Math.cos(A) * P * maxPull(); aim.dy = -Math.sin(A) * P * maxPull(); showMeter(); }
    } else if (picking()) {
      if (k === "ArrowLeft") { pickMove(-1); e.preventDefault(); }
      else if (k === "ArrowRight") { pickMove(1); e.preventDefault(); }
      else if (k === "Enter") { e.preventDefault(); sendHog(); }
    }
  });
  function showMeter() {
    if (!aim) { $("meter").hidden = true; return; }
    const { ang, pow } = aimParams(aim.dx, aim.dy);
    let deg = Math.round(-ang * 180 / Math.PI); if (me === "o") deg = 180 - deg;
    $("meter").hidden = false; $("hint").hidden = true;
    $("meter").textContent = pow < 0.1 ? "Táhni dál dozadu" : `Síla ${Math.round(pow * 100)} % · úhel ${deg}°`;
  }

  // ---------- stavba ----------
  function setMode(m) {
    if (!myTurn() || st.ph !== "t") return;
    if (m === "build" && buildBlock(st, me)) { toast(buildBlock(st, me)); return; }
    if (mode === m) return;
    mode = m; aim = null; drag = null;
    if (m === "build") { if (!ghost) choosePiece("mS", true); else refreshGhost(); }
    sfx.click(); render();
  }
  function snapX(x, w) { const [z0, z1] = ZONE[me]; return clamp(Math.round(x / 8) * 8, z0 + w / 2, z1 - w / 2); }
  function placeGhost(kind, rot, x, yh) {
    const { w } = JP.pieceDims(kind, rot);
    x = snapX(x, w);
    const y = JP.restY(st.b, me, kind, rot, x, yh), v = JP.canPlace(st.b, me, kind, x, y, rot);
    return { kind, rot, x, y, yh, ok: v.ok, why: v.why };
  }
  // výchozí místo: co nejblíž před králem (platné), jinak první platné
  function defaultGhost(kind, rot) {
    const K = JP.kingOf(st.b, me), dir = me === "x" ? 1 : -1;
    let best = null;
    const { w } = JP.pieceDims(kind, rot), [z0, z1] = ZONE[me];
    for (let x = z0 + w / 2; x <= z1 - w / 2; x += 8) for (let yh = PY - 420; yh <= PY; yh += 24) {
      const g = placeGhost(kind, rot, x, yh);
      if (!g.ok) continue;
      const score = K ? -Math.abs(g.x - (K.x + dir * 58)) - Math.abs(g.y - K.y) * 0.7 : -g.y;
      if (!best || score > best.score) best = { ...g, score };
    }
    return best || placeGhost(kind, rot, K ? K.x + dir * 60 : (z0 + z1) / 2, PY);
  }
  function choosePiece(kind, quiet) {
    if (!building() && !quiet) return;
    const rot = kind === "mS" ? 0 : ghost && ghost.kind === kind ? ghost.rot : 0;
    ghost = defaultGhost(kind, rot);
    if (!ghost.ok && kind === "wP") ghost = defaultGhost(kind, 1);
    if (!quiet) sfx.click();
    renderDock();
  }
  function refreshGhost() { if (ghost) ghost = placeGhost(ghost.kind, ghost.rot, ghost.x, ghost.yh); }
  function rotate() { if (!building() || !ghost) return; ghost = placeGhost(ghost.kind, ghost.rot ? 0 : 1, ghost.x, ghost.yh); if (!ghost.ok) { const d = defaultGhost(ghost.kind, ghost.rot); if (d.ok) ghost = d; } sfx.click(); renderDock(); }
  function moveGhost(sx, sy, touch) {
    const [wx, wy] = toWorld(sx, sy - (touch ? 64 : 0));
    ghost = placeGhost(ghost.kind, ghost.rot, wx, wy);
    renderDock();
  }
  function nudge(dx, dy) {
    if (!ghost) return;
    if (dy) {
      // nahoru / dolů: o patro výš nebo níž (další plocha)
      const levels = [];
      for (let yh = PY - 440; yh <= PY; yh += 8) { const g = placeGhost(ghost.kind, ghost.rot, ghost.x, yh); if (!levels.length || Math.abs(levels[levels.length - 1].y - g.y) > 4) levels.push(g); }
      const i = levels.findIndex(g => Math.abs(g.y - ghost.y) < 4), j = clamp(i + dy, 0, levels.length - 1);
      if (i >= 0) ghost = levels[j];
    } else ghost = placeGhost(ghost.kind, ghost.rot, ghost.x + dx, ghost.yh);
    renderDock();
  }
  function doBuild() {
    if (!building() || !ghost || !ghost.ok) { if (ghost && !ghost.ok) toast(ghost.why); return; }
    const base = st, g = ghost;
    beginAct(base.b);
    const sim = JP.sim(base.b, { env: env() });
    sim.place(me, g.kind, g.x, g.y, g.rot);
    while (sim.step());
    const res = sim.result();
    const act = { n: base.n + 1, by: me, kind: "b", kf: res.kf, ev: res.ev, b0: JP.packBodies(base.b), pc: { k: g.kind, x: Math.round(g.x * 10) / 10, y: Math.round(g.y * 10) / 10, r: g.rot } };
    const next = advance(base, res.bodies, me, act);
    acting = { team: me, kind: "b", base, next, act, evs: JP.decEvents(res.ev), rp: JP.replay(base.b, res.kf, res.ev), t: 0, evI: 0, wait: 0, played: false, ok: null };
    ghost = null; mode = "shoot";
    say("Stavíš.");
    const A = acting;
    commit(next, cur => cur.id === base.id && cur.n === base.n && cur.p === me && cur.ph === "t" && !buildBlock(cur, me) && !cur.r, "", base).then(ok => { A.ok = ok; tryFinish(); });
    render();
  }

  // ---------- výstřel (u mě) ----------
  // Střelec simuluje výstřel hned celý, zápis odešle okamžitě a vlastní tah si přehraje ze stejných snímků jako soupeř.
  function shoot(ang, pow) {
    const base = st, type = handOf(base, me);
    beginAct(base.b);
    const sim = JP.sim(base.b, { env: env() });
    sim.launch(me, ang, pow, type);
    while (sim.step());
    const res = sim.result(24000);
    const act = { n: base.n + 1, by: me, kind: "s", kf: res.kf, ev: res.ev, b0: JP.packBodies(base.b), a: Math.round(ang * 1000), f: Math.round(pow * 1000), ht: type };
    const next = advance(base, res.bodies, me, act);
    acting = { team: me, kind: "s", type, base, next, act, evs: JP.decEvents(res.ev), rp: JP.replay(base.b, res.kf, res.ev), t: 0, evI: 0, wait: 14, played: false, ok: null };
    sfx.launch(); buzz(20);
    $("meter").hidden = true;
    say("Výstřel!");
    const A = acting;
    commit(next, cur => cur.id === base.id && cur.n === base.n && cur.p === me && cur.ph === "t" && handOf(cur, me) === type && !cur.r, "", base).then(ok => { A.ok = ok; tryFinish(); });
    render();
  }
  // stav po akci hráče `by`: konec, léčení soupeře na začátku jeho tahu, comeback, ruka a výběr ježka
  function advance(base, bodies, by, act) {
    const q = other(by);
    const next = { ...base, b: bodies, n: base.n + 1, t: Math.floor(Date.now() / 60000), h: [act],
      hd: { ...base.hd }, pl: { ...base.pl }, bs: { ...base.bs }, lb: { ...base.lb }, cb: { ...base.cb } };
    if (act.kind === "s") { next.hd[by] = ""; next.lb[by] = 0; } else { next.bs[by]--; next.lb[by] = 1; }
    const res = JP.outcome(bodies, by, next.n);
    if (res) { next.ph = "end"; next.win = res.win; next.wy = res.wy; return next; }
    const before = new Map(bodies.map(b => [b.id, b.hp]));
    const hl = JP.heal(next.b, q);
    if (hl.length) { act.hl = hl; act.hlFrom = Object.fromEntries(hl.map(([, t]) => [t, before.get(t)])); }
    if (!next.cb[q] && JP.behind(next.b, q)) { next.cb[q] = 1; next.bs[q]++; next.lb[q] = 0; act.cb = q; }
    if (next.hd[q]) { next.ph = "t"; next.p = q; }
    else if (next.pl[q].length === 1) { next.hd[q] = next.pl[q]; next.pl = giveHog(next, q, next.pl[q]); next.ph = "t"; next.p = q; }
    else { next.ph = "pick"; next.p = by; }
    return next;
  }
  function tryFinish() {
    const A = acting;
    if (!A || !A.played || A.ok === null) return;
    acting = null;
    if (!A.ok) { render(); return; }
    setGame(A.next);
    pickAt = performance.now() + (calm() ? 250 : 700);
    afterChange(true);
    afterAct(A.act);
  }
  function giveHog(g, to, type) {
    let rest = g.pl[to].replace(type, "");
    if (!rest) rest = JP.HOG_ORDER.replace(type, "");
    return { ...g.pl, [to]: rest };
  }
  const pool = () => st && me ? st.pl[other(me)] : "";
  function pickMove(d) {
    const p = pool(); if (!p || !pickSel) return;
    const i = JP.HOG_ORDER.split("").filter(c => p.includes(c)), k = (i.indexOf(pickSel) + d + i.length) % i.length;
    pickSel = i[k]; renderPick();
  }
  async function sendHog() {
    if (!picking() || !pickSel || busy || !pool().includes(pickSel)) return;
    const base = st, opp = other(me), hg = pickSel;
    const next = { ...base, ph: "t", p: opp, hd: { ...base.hd, [opp]: hg }, pl: giveHog(base, opp, hg) };
    const ok = await commit(next, cur => cur.id === base.id && cur.n === base.n && cur.p === me && cur.ph === "pick" && !cur.r, "", base);
    if (!ok) { render(); return; }
    sfx.pick(); setGame(next); afterChange(false);
    say(`${nameOf(next, opp)} dostane: ${HOGUI[hg][0]}.`);
  }

  // ---------- přehrávání soupeřova tahu ----------
  function startReplay(acts, final) {
    replay = { acts, i: -1, rp: null, t: 0, final };
    nextReplay();
  }
  function nextReplay() {
    const prev = replay.acts[replay.i];
    if (prev && prev.kind === "s" && replay.rp) reactToShot(prev.by, replay.rp.events);
    replay.i++;
    const a = replay.acts[replay.i];
    if (!a) { const f = replay.final; replay = null; setGame(f); afterChange(true); afterAct(prev); if (pendingDoc) { const d = pendingDoc; pendingDoc = null; apply(d, true); } return; }
    const b0 = JP.unpackBodies(a.b0) || st.b;
    beginAct(b0);
    replay.rp = JP.replay(b0, a.kf, a.ev);
    replay.t = 0; replay.evI = 0; replay.wait = a.kind === "s" ? 30 : 12;
    if (a.kind === "s") { sfx.launch(); say(`${nameOf(replay.final, a.by)} střílí.`); } else say(`${nameOf(replay.final, a.by)} staví.`);
    render();
  }
  function stepPlay(r) {
    if (r.wait > 0) { r.wait--; return false; }
    r.t++;
    const evs = r.rp.events;
    while (r.evI < evs.length && evs[r.evI].t <= r.t) { fx(evs[r.evI++]); r.lastEv = r.t; }
    return r.t > r.rp.end + 28;
  }
  function stepReplay() { if (stepPlay(replay)) nextReplay(); }

  // ---------- sdílená místnost (mantledb.sh, bez účtu) ----------
  // Odkaz #r.<id>. Dokument {app, g, v, sx, so, u}: v = počítadlo zápisů, sx / so = zařízení na židlích.
  // g (rv 2) = {rv, id, x, o, s, k, kc, w, r, n, p, ph: t|pick|end, win: x|o|=, wy: k|l|r, b, h: [jedna akce],
  //            hd {x,o} ježek v ruce, pl {x,o} dávky, bs {x,o} zbývající stavby, lb {x,o} minule stavěl, cb {x,o} comeback využit,
  //            sd seed, map, md modifikátor, wd vítr, tt {x,o} postup v sérii, t}
  const API = "https://mantledb.sh/v2/";
  const docUrl = id => `${API}jezkomet-${id}/hra`;
  const BASE_URL = location.origin + location.pathname;
  const linkFor = () => BASE_URL + "#r." + room.id;
  async function req(url, opt = {}) {
    const c = new AbortController(), timer = setTimeout(() => c.abort(), 12000);
    try { return await fetch(url, { ...opt, cache: "no-store", signal: c.signal }); } finally { clearTimeout(timer); }
  }
  async function loadDoc(id) {
    const r = await req(docUrl(id));
    if (r.status === 404) return null;
    if (!r.ok) throw new Error("load " + r.status);
    return r.json();
  }
  async function saveDoc(id, d) {
    const r = await req(docUrl(id), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...d, u: Date.now() }) });
    if (!r.ok) throw new Error("save " + r.status);
  }
  const store = { get: k => attempt(() => localStorage.getItem(k), null), set: (k, v) => attempt(() => localStorage.setItem(k, v)) };
  const randId = n => [...crypto.getRandomValues(new Uint8Array(n))].map(b => (b % 36).toString(36)).join("");
  const device = store.get("jp-dev") || randId(16);
  store.set("jp-dev", device);

  const toDoc = g => { const d = { ...g, b: JP.packBodies(g.b) }; delete d.old; return d; };
  function norm(g) {
    if (!g || typeof g !== "object") return null;
    const str = (v, n) => typeof v === "string" ? v.trim().slice(0, n) : "";
    const x = str(g.x, 16), o = str(g.o, 16);
    if (!x || !o || (g.s !== "x" && g.s !== "o")) return null;
    const w = Array.isArray(g.w) ? [0, 1].map(k => Math.max(0, Math.min(999, g.w[k] | 0))) : [0, 0];
    const k = /^[1-6c]$/.test(g.k || "") ? g.k : "", kc = str(g.kc, 40);
    const common = { id: str(g.id, 12) || "0", x, o, s: g.s, k: k === "c" && !kc ? "" : k, kc, w, r: g.r === "x" || g.r === "o" ? g.r : "", t: Number.isFinite(g.t) ? g.t : null, tt: { x: JP.rankOf(w[0]), o: JP.rankOf(w[1]) } };
    // stará verze (v1): zobrazí se jako ukončená, odveta založí partii v2
    if (g.rv !== 2) {
      const b = JP.unpackBodies(g.b) || [];
      return { ...common, rv: 1, old: true, n: Math.max(0, g.n | 0), p: g.s, ph: "end", win: "", wy: "v", b, h: [], hd: { x: "", o: "" }, pl: { x: JP.HOG_ORDER, o: JP.HOG_ORDER }, bs: { x: 0, o: 0 }, lb: { x: 0, o: 0 }, cb: { x: 0, o: 0 }, sd: 0, map: "h", md: "", wd: 0 };
    }
    const b = JP.unpackBodies(g.b);
    if (!b || (g.p !== "x" && g.p !== "o") || !["t", "pick", "end"].includes(g.ph)) return null;
    const hogOk = c => typeof c === "string" && c.length === 1 && JP.HOG_ORDER.includes(c);
    const h = (Array.isArray(g.h) ? g.h : []).filter(a => a && Number.isFinite(a.n) && (a.by === "x" || a.by === "o") && (a.kind === "s" || a.kind === "b") && typeof a.kf === "string").slice(-1).map(a => ({ ...a, ht: hogOk(a.ht) ? a.ht : "n" }));
    const poolOk = v => typeof v === "string" && v.length > 0 && v.length <= 5 && [...v].every(c => JP.HOG_ORDER.includes(c)) && new Set(v).size === v.length ? v : JP.HOG_ORDER;
    const pair = (v, f) => ({ x: f(v && v.x), o: f(v && v.o) });
    const num = (lo, hi) => v => Math.max(lo, Math.min(hi, v | 0));
    return { ...common, rv: 2, n: Math.max(0, g.n | 0), p: g.p, ph: g.ph, win: ["x", "o", "="].includes(g.win) ? g.win : "", wy: ["k", "l", "r"].includes(g.wy) ? g.wy : "",
      b, h, hd: pair(g.hd, v => hogOk(v) ? v : ""), pl: pair(g.pl, poolOk), bs: pair(g.bs, num(0, 6)), lb: pair(g.lb, num(0, 1)), cb: pair(g.cb, num(0, 1)),
      sd: (g.sd >>> 0) || 0, map: JP.MAPS[g.map] ? g.map : "h", md: ["", "v", "n", "i", "g"].includes(g.md) ? g.md : "", wd: Math.max(-3, Math.min(3, g.wd | 0)) };
  }
  // nová partie: zakladatel vygeneruje pevnosti ze seedu (mapa a modifikátor se liší od předchozí partie)
  function freshGame(x, o, s, k, kc, w, prev) {
    const seed = crypto.getRandomValues(new Uint32Array(1))[0];
    const su = JPFort.setup(seed, prev);
    const fort = JPFort.gen(seed, { ice: su.md === "i", env: su });
    const hd = { x: "", o: "" }; hd[s] = "n";
    const pl = { x: JP.HOG_ORDER, o: JP.HOG_ORDER }; pl[s] = JP.HOG_ORDER.replace("n", "");
    const bs = { x: 0, o: 0 }; bs[s] = RULES.builds[0]; bs[other(s)] = RULES.builds[1];
    return { rv: 2, id: randId(6), x, o, s, k, kc, w, r: "", n: 0, p: s, ph: "t", win: "", wy: "", b: fort.bodies, h: [], hd, pl, bs, lb: { x: 0, o: 0 }, cb: { x: 0, o: 0 },
      sd: fort.sd, map: su.map, md: su.md, wd: su.wd, tt: { x: JP.rankOf(w[0]), o: JP.rankOf(w[1]) }, t: null };
  }
  const setGame = g => { st = g; };
  const sig = g => g ? [g.rv, g.id, g.x, g.o, g.s, g.n, g.p, g.ph, g.w.join(":"), g.r, g.k, g.kc, g.hd.x, g.hd.o, g.pl.x, g.pl.o, g.bs.x, g.bs.o, g.lb.x, g.lb.o, g.win].join("|") : "";

  async function commit(next, ok, conflictText, base = st) {
    busy = true; pollSeq++; render();
    let d;
    try { d = await loadDoc(room.id); }
    catch { busy = false; toast("Spojení nevyšlo, zkus to znovu."); render(); return false; }
    const cur = d && norm(d.g);
    if (!d || !cur || (d.v !== room.v && sig(cur) !== sig(base)) || !ok(cur)) {
      busy = false;
      toast(conflictText || "Mezitím se hra změnila, tah se nezapsal.");
      if (d) apply(d, true); else render();
      return false;
    }
    for (let tries = 0; ; tries++) {
      try { await saveDoc(room.id, { ...d, g: toDoc(next), v: d.v + 1 }); break; }
      catch { if (tries >= 2) { busy = false; toast("Tah se nepodařilo odeslat, zkus to znovu."); render(); return false; } await new Promise(r => setTimeout(r, 900)); }
    }
    room.v = d.v + 1; room.sx = d.sx || ""; room.so = d.so || "";
    busy = false; lastChange = Date.now();
    return true;
  }

  function apply(d, force) {
    if (!room || !d) return;
    room.sx = d.sx || ""; room.so = d.so || "";
    const g = norm(d.g);
    if (!g || (d.v === room.v && !force)) { render(); return; }
    if (acting) return;
    if (replay) { pendingDoc = d; return; }
    const prev = st;
    room.v = d.v; lastChange = Date.now();
    if (view === "intro") { setGame(g); if (!freeSeat()) show("play"); else render(); return; }
    if (view !== "play") { setGame(g); return; }
    if (prev && sig(g) === sig(prev)) { render(); return; }
    if (prev && g.id === prev.id && g.n > prev.n && !g.old) {
      const acts = g.h.filter(a => a.n > prev.n && a.by !== me).sort((a, b) => a.n - b.n);
      if (acts.length) { startReplay(acts, g); return; }
    }
    const newGame = !prev || g.id !== prev.id;
    setGame(g);
    if (newGame) resetScene();
    afterChange(newGame);
  }
  function resetScene() { parts = []; puff = []; CS.clear(); cam.snapNext(); cam.release(); mode = "shoot"; ghost = null; aim = null; }
  function afterChange(fresh) {
    if (fresh || (myTurn() && !acting)) { cam.release(); }
    if (!myTurn() || st.ph !== "t") { mode = "shoot"; ghost = null; }
    else if (mode === "build" && buildBlock(st, me)) { mode = "shoot"; ghost = null; }
    syncView();
    if (picking()) { const p = pool(); if (!pickSel || !p.includes(pickSel)) pickSel = [...JP.HOG_ORDER].find(c => p.includes(c)); }
    if (ended()) {
      const won = st.win === me;
      if (fresh && me && !st.old) { st.win === "=" ? sfx.turn() : won ? sfx.win() : sfx.lose(); }
      $("endBox").classList.remove("go"); void $("endBox").offsetWidth; $("endBox").classList.add("go");
    } else if (myTurn() && st.ph === "t") { sfx.turn(); buzz(15); }
    if (st && !ended() && st.n === 0 && bannerFor !== st.id) showBanner();
    render();
    remember();
  }

  // ---------- dotazování ----------
  let pollT = null, pollSeq = 0, lastChange = Date.now(), fails = 0;
  function interval() {
    const idle = Date.now() - lastChange;
    const ms = idle < 90e3 ? 1500 : idle < 5 * 60e3 ? 2500 : idle < 30 * 60e3 ? 10000 : 30000;
    return fails ? Math.min(60000, ms * 2 ** Math.min(fails, 4)) : ms;
  }
  function schedule(ms) { clearTimeout(pollT); pollT = setTimeout(poll, ms); }
  async function poll() {
    clearTimeout(pollT);
    if (!room || room.v < 0 || document.hidden) return;
    if (busy || acting) { schedule(1500); return; }
    const id = room.id, seq = ++pollSeq;
    try {
      const d = await loadDoc(id);
      if (!room || room.id !== id || seq !== pollSeq || busy) return schedule(interval());
      fails = 0;
      if (net) { net = ""; render(); }
      if (d) apply(d);
    } catch {
      fails++;
      if (fails >= 2 && !net) { net = "Spojení vázne, zkouším to znovu…"; render(); }
    }
    schedule(interval());
  }
  function wake() { if (room && !document.hidden) { lastChange = Date.now(); poll(); } }
  document.addEventListener("visibilitychange", wake);
  window.addEventListener("pageshow", e => { if (e.persisted) wake(); });
  window.addEventListener("online", wake);
  window.addEventListener("focus", wake);

  // ---------- texty ----------
  const STAKES = {
    "1": { text: "Kdo prohraje, platí kafe.", third: (w, l) => `${l} platí kafe.`, win: () => "Kafe platí soupeř.", lose: () => "Kafe platíš ty." },
    "2": { text: "Vítěz vybírá místo na rande.", third: w => `${w} vybírá místo na rande.`, win: () => "Místo na rande vybíráš ty.", lose: w => `${w} vybírá místo na rande.` },
    "3": { text: "Kdo prohraje, zve na zmrzlinu.", third: (w, l) => `${l} zve na zmrzlinu.`, win: (w, l) => `${l} tě zve na zmrzlinu.`, lose: () => "Na zmrzlinu zveš ty." },
    "4": { text: "Vítěz vybírá film na večer.", third: w => `${w} vybírá film na večer.`, win: () => "Film na večer vybíráš ty.", lose: w => `${w} vybírá film na večer.` },
    "5": { text: "Kdo prohraje, pravdivě odpoví na jednu otázku.", third: (w, l) => `${l} pravdivě odpoví na jednu otázku.`, win: (w, l) => `${l} ti pravdivě odpoví na jednu otázku.`, lose: () => "Odpovídáš na jednu otázku. Pravdivě." },
    "6": { text: "Jen o čest.", third: w => `Čest patří: ${w}.`, win: () => "Čest je tvoje.", lose: w => `Čest patří: ${w}.` },
  };
  function stake(g) {
    if (STAKES[g.k]) return STAKES[g.k];
    if (g.k === "c" && g.kc) { const t = g.kc; return { text: t, third: w => `${w} vyhrává sázku: ${t}`, win: () => `Vyhráváš sázku: ${t}`, lose: w => `${w} vyhrává sázku: ${t}` }; }
    return null;
  }
  function message() {
    const s = stake(st), host = me || "x";
    return `${nameOf(st, host)} tě vyzývá na Ježkomet: střílíme z praku ježka na pevnosti a kdo první shodí soupeřova krále, vyhrává.${s ? " O co hrajeme: " + s.text : ""} Hrajeme oba na tomhle odkazu, bez registrace: ${linkFor()}`;
  }
  function seriesAfter() { const w = [...st.w]; if (st.ph === "end" && (st.win === "x" || st.win === "o") && !st.old) w[st.win === "x" ? 0 : 1]++; return w; }
  function concedeText() {
    const s = stake(st), W_ = nameOf(st, st.win), L = nameOf(st, other(st.win));
    return `Uznávám porážku v Ježkometu. ${s ? s.third(W_, L) + " " : ""}Kdy a kde?`;
  }
  const HOGUI = {
    n: ["Obyčejný", "Poctivá rána do všeho."], k: ["Kamenný", "Těžký: boří a Tlusťoch ho neodrazí."], g: ["Gumový", "Skáče a odráží se od všeho."],
    b: ["Bouchací", "Při dopadu vybuchne."], s: ["Špičák", "Prorazí štít, letí rychle."],
  };
  const PIECEUI = { mS: ["Štít", "Kovová clona, vydrží nejvíc."], sB: ["Blok", "Těžký kámen, ucpe díru."], wP: ["Trám", "Dlouhé dřevo na strop i můstek."] };
  const UNITUI = { K: "Král", S: "Štítonoš", T: "Tlusťoch", L: "Léčitel", R: "Skokan", C: "Strážník" };

  // ---------- vykreslení UI ----------
  function setView(v) {
    view = v;
    ["setup", "info", "intro", "share"].forEach(k => $(k).hidden = v !== k);
    $("hud").hidden = v !== "play";
    render();
  }
  const show = v => view === v ? render() : setView(v);
  const iconCache = {};
  function unitIcon(kind, team, ko) {
    const key = kind + team + (ko ? 1 : 0);
    if (!iconCache[key]) {
      const c = document.createElement("canvas"); c.width = c.height = 64;
      const x = c.getContext("2d"), r = UNIT[kind].r || 26, sc = 23 / (r + (kind === "K" ? 10 : 4));
      x.translate(32, kind === "K" ? 38 : 33); x.scale(sc * 1.15, sc * 1.15);
      drawUnit(x, kind, team, 2.6 / sc, { lookX: team === "x" ? 1 : -1, ko: !!ko, hurt: ko ? 1 : 0, plain: true, still: true });
      iconCache[key] = c.toDataURL();
    }
    return iconCache[key];
  }
  const hogIcons = {};
  function hogIcon(type) {
    if (!hogIcons[type]) {
      const c = document.createElement("canvas"); c.width = c.height = 96;
      const x = c.getContext("2d"); x.translate(48, 52); x.scale(1.5, 1.5); drawHog(x, "x", 2.2, type, { t: 1 });
      hogIcons[type] = c.toDataURL();
    }
    return hogIcons[type];
  }
  const pieceIcons = {};
  function pieceIcon(kind) {
    if (!pieceIcons[kind]) {
      const c = document.createElement("canvas"); c.width = c.height = 80;
      const x = c.getContext("2d"), d = KIND[kind], sc = Math.min(64 / d.w, 64 / d.h, 1.1);
      x.translate(40, 40); x.scale(sc, sc); if (kind === "wP") x.rotate(-0.35); drawBlock(x, kind, 2.4 / sc, 0, 5);
      pieceIcons[kind] = c.toDataURL();
    }
    return pieceIcons[kind];
  }
  // HUD: lišta krále a pastilky jednotek (životy jako kroužek, štít modře); aktualizuje se i během přehrávání
  function hudLive(bodies) {
    for (const t of ["x", "o"]) {
      const T = t.toUpperCase(), K = bodies.find(b => b.k === "K" && b.t === t), f = K ? clamp(K.hp / JP.KING_HP, 0, 1) : 0;
      const fill = $("kb" + T);
      fill.style.width = (f * 100).toFixed(1) + "%"; fill.style.background = hpCol(f);
      $("kbn" + T).textContent = K ? `${Math.max(0, Math.round(K.hp))}` : "0";
      $("kbar" + T).setAttribute("aria-label", `Král: ${K ? Math.round(K.hp) : 0} ze ${JP.KING_HP} životů`);
      const box = $("pills" + T);
      if (!box.dataset.ready) {
        box.dataset.ready = "1";
        for (const k of JP.UNIT_ORDER) { const s = document.createElement("span"); s.className = "pill"; s.dataset.k = k; const im = new Image(); im.alt = ""; s.appendChild(im); box.appendChild(s); }
      }
      const label = [];
      for (const s of box.children) {
        const k = s.dataset.k, b = bodies.find(q => q.k === k && q.t === t), hp = b ? clamp(b.hp / UNIT[k].hp, 0, 1) : 0, sh = b && k === "S" ? clamp((b.z || 0) / UNIT.S.z, 0, 1) : 0;
        const key = (b ? 1 : 0) + ":" + Math.round(hp * 20) + ":" + Math.round(sh * 4);
        if (s.dataset.s === key) { label.push(`${UNITUI[k]} ${b ? Math.round(hp * 100) + " %" : "venku"}`); continue; }
        s.dataset.s = key;
        s.firstChild.src = unitIcon(k, t, !b);
        s.style.setProperty("--hp", (hp * 100).toFixed(0));
        s.style.setProperty("--hc", hpCol(hp));
        s.classList.toggle("out", !b); s.classList.toggle("sh", sh > 0);
        label.push(`${UNITUI[k]} ${b ? Math.round(hp * 100) + " %" : "venku"}`);
      }
      box.setAttribute("aria-label", label.join(", "));
    }
  }
  function render() {
    if (view === "share") renderShare();
    if (view === "intro") renderIntro();
    if (view !== "play" || !st) { document.title = "Ježkomet"; return; }
    const sc = scene();
    hudLive(sc.bodies);
    $("nmX").textContent = st.x; $("nmO").textContent = st.o;
    for (const t of ["x", "o"]) {
      const T = t.toUpperCase(), wins = st.w[t === "x" ? 0 : 1], title = JP.titleOf(wins);
      $("tt" + T).textContent = title; $("tt" + T).hidden = !title;
      const h = handOf(st, t), hi = $("hand" + T);
      hi.hidden = !h || ended();
      if (h) { hi.src = hogIcon(h); hi.alt = `V ruce: ${HOGUI[h][0]}`; hi.title = `V ruce: ${HOGUI[h][0]}`; }
    }
    const w = ended() && !replay && !acting ? seriesAfter() : st.w;
    $("score").innerHTML = `<b class="x">${w[0]}</b> : <b class="o">${w[1]}</b>`;
    $("score").setAttribute("aria-label", `Série ${st.x} ${w[0]}, ${st.o} ${w[1]}`);
    $("turnNo").textContent = ended() ? "Konec" : `Tah ${Math.min(RULES.turns, JP.turnNo(st.n))}/${RULES.turns}`;
    const [ml, , mk] = modUi(st);
    $("modChip").hidden = !mk || st.old;
    if (mk) { $("modLbl").textContent = ml; $("modChip").dataset.m = mk; $("modArrow").style.transform = `scaleX(${st.wd < 0 ? -1 : 1})`; $("modChip").title = modUi(st)[1]; }
    const turnP = ended() ? null : st.p;
    $("plateX").classList.toggle("turn", turnP === "x"); $("plateO").classList.toggle("turn", turnP === "o");
    // stav
    let s = "", waitStyle = true, pulse = false;
    const opp = me ? other(me) : null;
    if (net) s = net;
    else if (ended() && !replay) s = "";
    else if (acting) s = acting.played ? "Odesílám…" : acting.kind === "s" ? "Letí!" : "Stavíš…";
    else if (replay) { const a = replay.acts[replay.i]; s = a ? (a.kind === "s" ? `${nameOf(st, a.by)} střílí!` : `${nameOf(st, a.by)} staví…`) : ""; }
    else if (busy) s = "Odesílám…";
    else if (myTurn() && st.ph === "t") { s = mode === "build" ? "Stavíš: vyber díl a místo" : "Jsi na tahu"; waitStyle = false; pulse = mode !== "build"; }
    else if (myTurn() && st.ph === "pick") { s = "Vyber ježka pro soupeře"; waitStyle = false; }
    else s = st.ph === "pick" ? (me && me !== st.p ? `${nameOf(st, st.p)} ti vybírá ježka…` : `${nameOf(st, st.p)} vybírá ježka…`) : `${nameOf(st, st.p)} je na tahu…`;
    $("status").textContent = s; $("status").hidden = !s;
    $("status").classList.toggle("wait", waitStyle); $("status").classList.toggle("pulse", pulse && !calm());
    const waiting = !!me && !!freeSeat() && !ended();
    $("waitBox").hidden = !waiting || canAim() || picking() || building() || !!acting || !!aim;
    if (waiting) $("waitText").textContent = `${nameOf(st, opp)} ještě neotevřel(a) výzvu. Pošli odkaz do chatu.`;
    $("hint").hidden = !canAim() || !!aim || !$("waitBox").hidden;
    $("hint").textContent = portrait() ? "Chyť ježka v praku, táhni dozadu a pusť." : "Chyť ježka v praku, táhni dozadu a pusť. Jinde tažením posouváš scénu.";
    if (!aim) $("meter").hidden = true;
    renderDock();
    cv.classList.toggle("aim", canAim() && !aim); cv.classList.toggle("aiming", !!aim); cv.classList.toggle("build", building());
    const showEnd = ended() && !replay && !acting;
    $("endBox").hidden = !showEnd;
    if (showEnd) renderEnd();
    document.title = canAim() || building() ? "Jsi na tahu · Ježkomet" : picking() ? "Vybíráš ježka · Ježkomet" : ended() && !replay ? "Konec partie · Ježkomet" : "Ježkomet";
  }
  // spodní lišta: ježek v ruce, volba Střelba / Stavba, díly stavby, výběr ježka pro soupeře
  function renderDock() {
    if (!st || view !== "play") return;
    const showPick = picking() && performance.now() >= pickAt;
    if (picking() && !showPick) setTimeout(render, pickAt - performance.now() + 30);
    const turn = myTurn() && st.ph === "t" && ready();
    $("dock").hidden = !(turn || showPick);
    $("dock").classList.toggle("picking", showPick);
    $("dock").classList.toggle("building", turn && mode === "build");
    $("turnRow").hidden = !turn; $("pickRow").hidden = !showPick;
    if (showPick) renderPick();
    if (!turn) return;
    const h = handOf(st, me), [nm, inf] = HOGUI[h] || ["", ""];
    $("hdIcon").src = h ? hogIcon(h) : "";
    $("hdName").textContent = nm;
    const from = st.n === 0 ? "První výstřel." : st.h[0] && st.h[0].by === me && st.h[0].kind === "b" ? "Zůstal ti z minula." : `Od soupeře (${nameOf(st, other(me))}).`;
    $("hdInfo").textContent = `${from} ${inf}`;
    const why = buildBlock(st, me), left = st.bs[me];
    $("modeShoot").setAttribute("aria-pressed", String(mode === "shoot"));
    $("modeBuild").setAttribute("aria-pressed", String(mode === "build"));
    $("modeBuild").setAttribute("aria-disabled", String(!!why));
    $("modeBuild").classList.toggle("off", !!why);
    $("buildLeft").textContent = left;
    $("modeBuild").title = why || `Postav jeden díl. Zbývá ${left}.`;
    $("modeBuild").setAttribute("aria-label", why ? `Stavba: ${why}` : `Stavba, zbývá ${left}`);
    $("buildRow").hidden = mode !== "build";
    $("handRow").hidden = mode === "build" && portrait();
    if (mode === "build") {
      const box = $("pieces");
      if (!box.dataset.ready) {
        box.dataset.ready = "1";
        JP.BUILD.forEach((k, i) => {
          const b = document.createElement("button"); b.type = "button"; b.className = "btn piece"; b.dataset.k = k;
          const im = new Image(); im.src = pieceIcon(k); im.alt = ""; im.width = im.height = 40;
          const t = document.createElement("span"); t.className = "pt"; t.innerHTML = `<b>${PIECEUI[k][0]}</b><small>${PIECEUI[k][1]}</small>`;
          const kb = document.createElement("kbd"); kb.textContent = String(i + 1);
          b.append(im, t, kb);
          b.addEventListener("click", () => choosePiece(k));
          box.appendChild(b);
        });
      }
      for (const b of box.children) b.setAttribute("aria-pressed", String(!!ghost && ghost.kind === b.dataset.k));
      const ok = !!ghost && ghost.ok;
      $("placeBtn").setAttribute("aria-disabled", String(!ok)); $("placeBtn").classList.toggle("off", !ok);
      $("buildWhy").textContent = ghost ? (ok ? (portrait() ? "Táhni prstem, kam díl dát." : "Klikni nebo táhni, kam díl dát. R otočí, Enter postaví.") : ghost.why) : "";
      $("buildWhy").classList.toggle("bad", !!ghost && !ok);
      $("rotBtn").disabled = !ghost || ghost.kind === "sB";
    }
  }
  function renderPick() {
    const box = $("kinds"), p = pool();
    if (!box.dataset.ready) {
      box.dataset.ready = "1";
      for (const k of JP.HOG_ORDER) {
        const b = document.createElement("button"); b.type = "button"; b.className = "btn kind"; b.dataset.k = k;
        const im = new Image(); im.src = hogIcon(k); im.alt = ""; im.width = im.height = 44;
        const nm = document.createElement("span"); nm.className = "kn"; nm.textContent = HOGUI[k][0];
        b.append(im, nm);
        b.addEventListener("click", () => { if (picking() && pool().includes(k)) { pickSel = k; sfx.stretch(0.3); renderPick(); } });
        box.appendChild(b);
      }
    }
    for (const b of box.querySelectorAll("[data-k]")) {
      const k = b.dataset.k, used = !p.includes(k);
      b.disabled = used; b.setAttribute("aria-pressed", String(pickSel === k));
      b.title = used ? "Už dostal(a), počkej na další dávku." : HOGUI[k][1];
    }
    $("pickTitle").textContent = `Ježek pro soupeře (${nameOf(st, other(me))})`;
    $("pickNote").textContent = pickSel ? `${HOGUI[pickSel][0]}: ${HOGUI[pickSel][1]}` : "";
    $("pickLeft").textContent = `Zbývá ${p.length} z 5 v dávce.`;
    $("sendBtn").disabled = busy || !pickSel || !p.includes(pickSel);
    $("sendBtn").textContent = pickSel ? `Poslat: ${HOGUI[pickSel][0]}` : "Poslat ježka";
  }
  $("sendBtn").addEventListener("click", sendHog);
  $("modeShoot").addEventListener("click", () => setMode("shoot"));
  $("modeBuild").addEventListener("click", () => setMode("build"));
  $("rotBtn").addEventListener("click", rotate);
  $("placeBtn").addEventListener("click", () => { if (ghost && !ghost.ok) { toast(ghost.why); return; } doBuild(); });

  function renderEnd() {
    const s = stake(st);
    $("endKicker").textContent = st.old ? "" : st.wy === "l" ? "Po devátém tahu rozhodl zdravější král." : st.wy === "r" ? "Partie skončila vzdáním." : st.win === "=" ? "Oba králové padli v jednom tahu." : "Král padl.";
    $("endKicker").hidden = !$("endKicker").textContent;
    $("endPrimary").hidden = !me; $("endPrimary").disabled = busy;
    if (st.old) {
      $("endTitle").textContent = "Stará verze hry";
      $("endSeries").textContent = `${st.x} ${st.w[0]} : ${st.w[1]} ${st.o}`;
      $("endStake").textContent = "Stará verze hry, odveta v nové.";
      $("endPrimary").textContent = "Odveta v nové verzi";
      $("endSecondary").textContent = "Zkopírovat odkaz na hru";
      $("endRank").hidden = true;
      return;
    }
    if (st.win === "=") {
      $("endTitle").textContent = "Remíza";
      $("endStake").textContent = "Sázka čeká na odvetu.";
    } else {
      const won = me && st.win === me, W_ = nameOf(st, st.win), L = nameOf(st, other(st.win));
      $("endTitle").textContent = !me ? `${W_} vyhrává!` : won ? "Vyhráváš!" : `${W_} vyhrává`;
      if (st.r) $("endTitle").textContent += st.r === me ? " (vzdal(a) ses)" : ` (${L} to vzdal(a))`;
      $("endStake").textContent = s ? (!me ? s.third(W_, L) : won ? s.win(W_, L) : s.lose(W_, L)) : won ? "Pevnost padla, tvoji slaví." : "Příště to bude tvůj král, kdo vydrží.";
    }
    const w = seriesAfter();
    $("endSeries").textContent = `${st.x} ${w[0]} : ${w[1]} ${st.o}`;
    // postup v sérii: nový titul
    let rank = "";
    if (st.win === "x" || st.win === "o") { const i = st.win === "x" ? 0 : 1, a = JP.titleOf(st.w[i]), b = JP.titleOf(w[i]); if (b && a !== b) rank = `${nameOf(st, st.win)} je teď ${b}.`; }
    $("endRank").textContent = rank; $("endRank").hidden = !rank;
    const starts = st.win === "=" ? nameOf(st, other(st.s)) : nameOf(st, other(st.win));
    if (!me) $("endSecondary").textContent = "Zkopírovat odkaz na hru";
    else if (st.win === me) { $("endPrimary").textContent = `Odveta (začíná ${starts})`; $("endSecondary").textContent = "Zkopírovat odkaz na hru"; }
    else if (st.win === "=") { $("endPrimary").textContent = `Odveta (začíná ${starts})`; $("endSecondary").textContent = "Zkopírovat odkaz na hru"; }
    else { $("endPrimary").textContent = "Chci odvetu"; $("endSecondary").textContent = "Uznat porážku"; }
  }
  function renderShare() {
    $("shareName").textContent = nameOf(st, other(me || "x"));
    const s = stake(st);
    $("shareMeta").textContent = "Odkaz posíláš jen jednou, tahy se na něm pak objevují samy." + (s ? ` O co: ${s.text}` : "");
    const msg = $("msg"), link = linkFor();
    if (msg.dataset.link !== link) { msg.value = message(); msg.dataset.link = link; }
    $("shareBtn").hidden = !navigator.share;
  }
  function renderIntro() {
    const host = room && room.sx ? "x" : "o";
    $("introTitle").textContent = `${nameOf(st, host)} tě vyzývá na Ježkomet`;
    const s = stake(st);
    $("introMeta").textContent = `Hraješ za ${TEAM[other(host)].name}. ` + (s ? `O co: ${s.text}` : "Hraje se pro radost.");
    const [mn, ms] = MAPUI[st.map] || MAPUI.h;
    $("introMap").textContent = `${mn}. ${ms} ${modUi(st)[1]}`;
    $("acceptBtn").disabled = busy;
  }
  // karta partie: mapa a modifikátor na začátku každé partie
  function showBanner() {
    bannerFor = st.id;
    const [mn, ms] = MAPUI[st.map] || MAPUI.h, [ml, mt, mk] = modUi(st);
    $("bnMap").textContent = mn; $("bnMapT").textContent = ms;
    $("bnMod").textContent = ml; $("bnModT").textContent = mt;
    $("bnModIcon").dataset.m = mk || "-";
    $("bnStart").textContent = `Začíná ${nameOf(st, st.s)}.`;
    $("banner").hidden = false; $("banner").classList.remove("go"); void $("banner").offsetWidth; $("banner").classList.add("go");
    clearTimeout(showBanner.t); showBanner.t = setTimeout(hideBanner, calm() ? 6000 : 4200);
  }
  function hideBanner() { $("banner").hidden = true; }
  $("banner").addEventListener("click", hideBanner);
  function notice(text) {
    const n = $("notice"); n.textContent = text; n.hidden = false; say(text);
    n.classList.remove("go"); void n.offsetWidth; n.classList.add("go");
    clearTimeout(notice.t); notice.t = setTimeout(() => n.hidden = true, 4200);
  }
  function cast(el) {
    if (el.childElementCount) return;
    for (const [t, k] of [["x", "K"], [null, "s"], ["o", "K"]]) {
      const c = document.createElement("canvas"); c.width = c.height = 128;
      const x = c.getContext("2d"); x.translate(64, 72); x.scale(1.9, 1.9);
      t ? drawUnit(x, k, t, 2.2, { lookX: t === "x" ? 0.6 : -0.6, still: true, plain: true }) : (x.scale(1.2, 1.2), drawHog(x, "x", 2.2, "n", { t: 1 }));
      el.appendChild(c);
    }
  }

  // ---------- hraní: odveta, vzdání ----------
  async function rematch() {
    if (busy || !me || !ended()) return;
    const starts = st.old ? st.s : st.win === "=" ? other(st.s) : other(st.win);
    const next = freshGame(st.x, st.o, starts, st.k, st.kc, seriesAfter(), { map: st.map, md: st.md });
    if (!await commit(next, cur => cur.id === st.id && cur.ph === "end", "Odvetu už mezitím založil soupeř.")) return;
    setGame(next); resetScene();
    afterChange(true);
    say(`Odveta. Začíná ${nameOf(next, next.s)}.`);
  }
  async function resign() {
    if (busy || !me || ended() || acting) return;
    if (!confirm("Opravdu vzdát tuhle partii?")) return;
    const next = { ...st, r: me, ph: "end", win: other(me), wy: "r", n: st.n + 1, h: [] };
    if (!await commit(next, cur => cur.id === st.id && cur.n === st.n && cur.ph !== "end")) return;
    setGame(next); afterChange(true);
  }
  $("endPrimary").addEventListener("click", rematch);
  $("endSecondary").addEventListener("click", () => {
    if (me && st.win && st.win !== "=" && st.win !== me && !st.old) copy(concedeText(), "Zkopírováno, vlož to do chatu");
    else copyLink();
  });

  // ---------- přijetí výzvy ----------
  async function accept() {
    if (busy || !room) return;
    busy = true; render();
    let d;
    try { d = await loadDoc(room.id); }
    catch { busy = false; toast("Spojení nevyšlo, zkus to znovu."); render(); return; }
    const seat = d && (!d.sx ? "x" : !d.so ? "o" : null);
    if (!d || !seat) { busy = false; toast("Výzvu už přijal někdo jiný. Můžeš přihlížet."); show("play"); if (d) apply(d, true); return; }
    const nd = { ...d, v: d.v + 1, [seat === "x" ? "sx" : "so"]: device };
    try { await saveDoc(room.id, nd); }
    catch { busy = false; toast("Spojení nevyšlo, zkus to znovu."); render(); return; }
    busy = false;
    room.v = nd.v; room.sx = nd.sx || ""; room.so = nd.so || "";
    setMe(seat);
    setGame(norm(d.g) || st);
    bannerFor = st.id;   // pravidla a mapu už viděl na kartě výzvy
    setView("play"); afterChange(true);
  }
  $("acceptBtn").addEventListener("click", accept);
  $("introMine").addEventListener("click", () => {
    const p = room && room.sx ? "x" : "o";
    if (!room || !confirm(`Pokračovat v tomhle prohlížeči jako ${nameOf(st, p)}?`)) return;
    setMe(p); setView("play"); afterChange(false);
  });
  function setMe(p) { me = p; store.set("jp-r-" + room.id, p); remember(); }

  // ---------- kopírování, nabídka ----------
  function toast(text) {
    const t = $("toast"); t.textContent = text; t.hidden = false;
    clearTimeout(toast.t); toast.t = setTimeout(() => t.hidden = true, 2800);
  }
  async function copy(text, done) {
    try { await navigator.clipboard.writeText(text); toast(done); }
    catch { window.prompt("Zkopíruj si to:", text); }
  }
  const copyLink = () => copy(linkFor(), "Odkaz je zkopírovaný");
  $("copyBtn").addEventListener("click", () => copy($("msg").value, "Zkopírováno, vlož to do chatu"));
  $("copyLinkBtn").addEventListener("click", copyLink);
  $("waitCopy").addEventListener("click", copyLink);
  $("shareBtn").addEventListener("click", async () => { try { await navigator.share({ text: $("msg").value }); } catch {} });
  $("backBtn").addEventListener("click", () => { setView("play"); afterChange(false); });
  const openSheet = id => { const d = $(id); if (!d.open) d.showModal(); };
  document.querySelectorAll("dialog [data-close]").forEach(b => b.addEventListener("click", () => b.closest("dialog").close()));
  document.querySelectorAll("dialog").forEach(d => d.addEventListener("click", e => { if (e.target === d) d.close(); }));
  $("menuBtn").addEventListener("click", () => { $("mResign").hidden = !me || ended(); openSheet("menuSheet"); });
  $("mCopy").addEventListener("click", () => { $("menuSheet").close(); copyLink(); });
  $("mHelp").addEventListener("click", () => { $("menuSheet").close(); openSheet("helpSheet"); });
  $("mResign").addEventListener("click", () => { $("menuSheet").close(); resign(); });
  $("mNew").addEventListener("click", () => { $("menuSheet").close(); newGame(); });
  function syncSound() { $("soundWave").toggleAttribute("hidden", muted); $("soundOff").toggleAttribute("hidden", !muted); $("soundBtn").setAttribute("aria-label", muted ? "Zapnout zvuk" : "Vypnout zvuk"); $("soundLbl").textContent = muted ? "Zvuk vyp." : "Zvuk"; }
  $("soundBtn").addEventListener("click", () => { muted = !muted; store.set("jp-mute", muted ? "1" : "0"); syncSound(); });
  syncSound();
  const iOS = /iP(hone|od)/.test(navigator.userAgent);
  const standalone = attempt(() => matchMedia("(display-mode: standalone)").matches, false) || navigator.standalone === true;
  const fsOK = !iOS && !!(document.fullscreenEnabled || document.webkitFullscreenEnabled);
  const fsEl = () => document.fullscreenElement || document.webkitFullscreenElement;
  function syncFs() {
    const on = !!fsEl();
    $("fsIn").toggleAttribute("hidden", on); $("fsOut").toggleAttribute("hidden", !on);
    const l = on ? "Zmenšit" : "Celá obrazovka"; $("fsLbl").textContent = l; $("fsBtn").setAttribute("aria-label", l);
  }
  $("fsBtn").hidden = standalone;
  $("fsBtn").addEventListener("click", () => {
    if (!fsOK) { openSheet("a2hsSheet"); return; }
    if (fsEl()) (document.exitFullscreen || document.webkitExitFullscreen).call(document);
    else { const r = (document.documentElement.requestFullscreen || document.documentElement.webkitRequestFullscreen).call(document.documentElement); if (r && r.catch) r.catch(() => toast("Celá obrazovka tu nejde.")); }
  });
  document.addEventListener("fullscreenchange", () => { syncFs(); resize(); });
  document.addEventListener("webkitfullscreenchange", () => { syncFs(); resize(); });
  syncFs();

  // ---------- naposledy hrané ----------
  function recentRooms() { return attempt(() => JSON.parse(store.get("jp-rooms") || "[]"), []).filter(r => r && /^[0-9a-z]{6,24}$/.test(r.id)); }
  function remember() {
    if (!room || !st) return;
    const list = recentRooms().filter(r => r.id !== room.id);
    list.unshift({ id: room.id, x: st.x, o: st.o });
    store.set("jp-rooms", JSON.stringify(list.slice(0, 5)));
  }

  // ---------- založení ----------
  async function createRoom(g) {
    if (busy) return;
    busy = true; render();
    const id = randId(12);
    const d = { app: "jezkomet", g: toDoc(g), v: 1, sx: device, so: "" };
    try { await saveDoc(id, d); }
    catch { busy = false; toast("Hru se nepodařilo založit. Zkontroluj připojení a zkus to znovu."); render(); return; }
    busy = false; setGame(g); shareKind = "new";
    room = { id, v: 1, sx: d.sx, so: d.so };
    bootSeq++;
    history.replaceState(null, "", location.pathname + location.search + "#r." + id);
    setMe("x");
    lastChange = Date.now(); schedule(2500);
    resetScene();
    setView("share");
  }
  function newGame() {
    clearTimeout(pollT); bootSeq++;
    room = null; me = null; st = null; busy = false; net = ""; acting = null; replay = null; pickSel = null; aim = null; mode = "shoot"; ghost = null; CS.clear(); parts = []; puff = [];
    history.pushState(null, "", location.pathname + location.search);
    showSetup();
  }
  const syncCustom = () => { $("customWrap").hidden = $("stakeSel").value !== "c"; };
  $("stakeSel").addEventListener("change", syncCustom);
  $("stakeCustom").addEventListener("input", () => { $("customCount").textContent = `${$("stakeCustom").value.length} / 40`; });
  $("starterSeg").addEventListener("click", e => {
    const b = e.target.closest("button"); if (!b) return;
    starter = b.dataset.v;
    [...$("starterSeg").children].forEach(x => x.setAttribute("aria-pressed", String(x.dataset.v === starter)));
  });
  function showSetup() {
    if (!$("nameX").value) $("nameX").value = store.get("jp-name") || "";
    cast($("setupCast"));
    const rs = recentRooms();
    $("recent").hidden = !rs.length;
    $("recent").innerHTML = "";
    if (rs.length) {
      $("recent").append("Rozehrané: ");
      rs.forEach((r, i) => { const a = document.createElement("a"); a.href = "#r." + r.id; a.textContent = `${r.x} a ${r.o}`; $("recent").append(a); if (i < rs.length - 1) $("recent").append(" · "); });
    }
    syncCustom(); setView("setup");
  }
  $("infoNew").addEventListener("click", newGame);
  $("infoRetry").addEventListener("click", boot);
  $("setupForm").addEventListener("submit", ev => {
    ev.preventDefault();
    const x = $("nameX").value.trim().slice(0, 16), o = $("nameO").value.trim().slice(0, 16);
    if (!x || !o || busy) return;
    store.set("jp-name", x);
    let k = $("stakeSel").value, kc = "";
    if (k === "c") { kc = $("stakeCustom").value.trim().slice(0, 40); if (!kc) k = ""; }
    createRoom(freshGame(x, o, starter, k, kc, [0, 0], null));
  });

  // ---------- start ----------
  function info(title, meta, retry) {
    $("infoTitle").textContent = title;
    $("infoMeta").textContent = meta; $("infoMeta").hidden = !meta;
    $("infoRetry").hidden = !retry; $("infoNew").hidden = retry === null;
    setView("info");
  }
  async function openRoom(id, seq) {
    room = { id, v: -1, sx: "", so: "" };
    info("Otevírám hru…", "", null);
    let d;
    try { d = await loadDoc(id); }
    catch { if (seq === bootSeq) info("Hru se nepodařilo načíst.", "Zkontroluj připojení a zkus to znovu.", true); return; }
    if (seq !== bootSeq) return;
    const g = d && norm(d.g);
    if (!g) { room = null; info("Tahle hra tu není.", "Odkaz je špatně zkopírovaný, nebo hra vypršela (ukládá se 30 dní od posledního tahu).", false); return; }
    setGame(g); room.v = d.v; room.sx = d.sx || ""; room.so = d.so || "";
    const saved = store.get("jp-r-" + id);
    me = saved === "x" || saved === "o" ? saved : room.sx === device ? "x" : room.so === device ? "o" : null;
    lastChange = Date.now(); schedule(2500);
    resetScene();
    if (!me && freeSeat() && !ended()) { cast($("introCast")); setView("intro"); return; }
    if (st.n > 0 || ended()) bannerFor = st.id;
    setView("play"); afterChange(false);
  }
  function boot() {
    const seq = ++bootSeq;
    clearTimeout(pollT);
    room = null; me = null; busy = false; net = ""; fails = 0; acting = null; replay = null; pickSel = null; aim = null; mode = "shoot"; ghost = null;
    const h = (location.hash || "").replace(/^#/, "");
    const r = /^r\.([0-9a-z]{6,24})$/.exec(h);
    if (r) { openRoom(r[1], seq); return; }
    st = null; showSetup();
  }

  // ---------- testovací háček (jen s ?test) ----------
  if (TEST) {
    window.JPT = {
      speed: 1,
      cam: () => ({ x: cam.x, y: cam.y, s: cam.s, user: cam.isManual(), full: overview(), home: cam.restView(viewTeam()), homeS: cam.homeS(), ground: toScreen(0, GY)[1], crit: 2 * JP.CR * cam.s, king: 2 * UNIT.K.r * cam.s, portrait: portrait(), label: $("viewLbl").textContent, fs: !!fsEl(), fsOK }),
      hogScreen: () => { const h = currentHog(); return h ? toScreen(h.x, h.y) : null; },
      topY: () => Math.min(...st.b.map(b => [toScreen(b.x, JP.aabb(b)[1])]).filter(([p]) => p[0] > 0 && p[0] < cw).map(([p]) => p[1])),
      proj: (x, y) => { const [sx, sy] = toScreen(x, y); const r = cv.getBoundingClientRect(); return [r.left + sx, r.top + sy]; },
      stats: STATS, calm,
      crit: () => [...CS.values()].filter(s => frameN - s.last <= 3).map(s => ({ t: s.t, k: s.k, fear: +s.fear.toFixed(2), hit: +s.hit.toFixed(2), cheer: +s.cheer.toFixed(2), sad: +s.sad.toFixed(2), startle: +s.startle.toFixed(2) })),
      sling: () => { const [x, y] = toScreen(SLING[me].x, SLING[me].y); const r = cv.getBoundingClientRect(); return [r.left + x, r.top + y]; },
      ghost: () => ghost && { ...ghost, screen: JPT.proj(ghost.x, ghost.y) },
      info: () => st && { rv: st.rv, old: !!st.old, ph: st.ph, p: st.p, n: st.n, hd: { ...st.hd }, hg: handOf(st, st.p), pl: { ...st.pl }, bs: { ...st.bs }, lb: { ...st.lb }, cb: { ...st.cb }, mode, building: building(), picking: picking(), pickSel, slow: slow.t > 0, me, win: st.win, wy: st.wy, acting: !!acting, replay: !!replay, busy, map: st.map, md: st.md, wd: st.wd, sd: st.sd, tt: { ...st.tt },
        alive: { x: JP.alive(st.b, "x"), o: JP.alive(st.b, "o") }, king: { x: JP.kingOf(st.b, "x") ? JP.kingOf(st.b, "x").hp : 0, o: JP.kingOf(st.b, "o") ? JP.kingOf(st.b, "o").hp : 0 }, w: st.w, view, bodies: st.b.length,
        units: st.b.filter(b => isUnit(b.k)).map(b => b.k + b.t + ":" + Math.round(b.hp) + (b.z != null ? "/" + Math.round(b.z) : "")).sort().join(" "), lastAct: st.h[0] ? { kind: st.h[0].kind, by: st.h[0].by, hl: st.h[0].hl || null, cb: st.h[0].cb || null, ev: st.h[0].ev } : null },
      // nejlepší výstřel z mřížky: vrací tah myší v pixelech (dx, dy), který dá přesně simulovaný úhel a sílu
      best(maxMs = 8000) {
        const t0 = performance.now(), mp = maxPull(), opp = other(me), E = env(), type = handOf(st, me);
        let best = null;
        const kH = (bs, t) => { const k = JP.kingOf(bs, t); return k ? k.hp : -100; };
        outer: for (let deg = 12; deg <= 72; deg += 5) for (let p = 0.6; p <= 1.0001; p += 0.05) {
          if (performance.now() - t0 > maxMs) break outer;
          const ang = me === "x" ? -deg * Math.PI / 180 : -Math.PI + deg * Math.PI / 180;
          const dx = Math.round(-Math.cos(ang) * p * mp), dy = Math.round(-Math.sin(ang) * p * mp);
          const q = aimParams(dx, dy);
          const s = JP.sim(st.b, { env: E }); s.launch(me, q.ang, q.pow, type); while (s.step());
          const r = s.result();
          const ko = JP.alive(st.b, opp) - JP.alive(r.bodies, opp);
          const score = (kH(st.b, opp) - kH(r.bodies, opp)) * 3 - (kH(st.b, me) - kH(r.bodies, me)) * 4 + ko * 20 - (JP.alive(st.b, me) - JP.alive(r.bodies, me)) * 25 + (st.b.length - r.bodies.length);
          if (!best || score > best.score) best = { dx, dy, score, ko, king: !JP.kingOf(r.bodies, opp) };
          if (best.king) break outer;
        }
        return best;
      },
    };
  }

  window.addEventListener("resize", resize);
  window.addEventListener("hashchange", boot);
  resize();
  boot();
  requestAnimationFrame(frame);
})();
