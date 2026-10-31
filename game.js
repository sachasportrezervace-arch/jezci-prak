// Ježkomet – hra, kreslení a synchronizace. Fyzika je v engine.js (JP).
(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  const attempt = (f, d) => { try { return f(); } catch { return d; } };
  const other = p => p === "x" ? "o" : "x";
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const TEST = /[?&]test\b/.test(location.search);
  const mq = matchMedia("(prefers-reduced-motion: reduce)");
  const calm = () => mq.matches;
  const STATS = { ko: 0, slow: 0, frag: 0, boom: 0, cheer: 0, sad: 0, shock: 0, fearFrames: 0, hitFrames: 0, freeze: 0 };   // jen pro testy (?test)
  const { INK, TEAM, drawCritter, drawHog, drawBlock, MATCOL } = ART;
  const outline = (c, lw) => ART.stroke(c, lw);
  const circle = ART.circle, rrect = ART.rrect;
  const { W, GY, SLING, ZONE, PLINTHS, HILL, KIND, CR, HOG_R } = JP;

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
      if (m === "g") { noise(0.25, { vol: v, f: 5200, kind: "highpass" }); tone(2400, 0.18, { vol: v * 0.4, to: 3100 }); tone(3300, 0.12, { vol: v * 0.3, delay: 0.04 }); }
      else if (m === "s") { tone(140, 0.16, { vol: v, to: 70 }); noise(0.09, { vol: v * 0.8, f: 1800, q: 2 }); }
      else if (m === "w") { tone(220, 0.12, { type: "triangle", vol: v, to: 110 }); noise(0.07, { vol: v * 0.6, f: 900, q: 3 }); }
      else if (m === "c") tone(700, 0.12, { vol: v * 0.7, to: 1300 });
      else tone(110, 0.14, { vol: v * 0.8, to: 60 });
    },
    boom() { noise(0.5, { vol: 0.5, f: 900, to: 90, q: 0.7, kind: "lowpass" }); tone(110, 0.4, { type: "sawtooth", vol: 0.22, to: 38 }); },
    pick() { tone(520, 0.08, { type: "triangle", vol: 0.12 }); tone(780, 0.12, { type: "triangle", vol: 0.12, delay: 0.07 }); },
    ko() { tone(900, 0.12, { vol: 0.16, to: 1500 }); tone(1500, 0.3, { type: "triangle", vol: 0.12, to: 300, delay: 0.1 }); noise(0.25, { vol: 0.12, f: 900, delay: 0.08 }); },
    drop() { tone(260, 0.1, { type: "triangle", vol: 0.1, to: 180 }); },
    win() { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.28, { type: "triangle", vol: 0.16, delay: i * 0.12 })); },
    lose() { [392, 330, 262].forEach((f, i) => tone(f, 0.32, { type: "triangle", vol: 0.13, delay: i * 0.16 })); },
    turn() { tone(660, 0.1, { vol: 0.1 }); tone(990, 0.14, { vol: 0.1, delay: 0.09 }); },
  };
  const buzz = ms => attempt(() => navigator.vibrate && navigator.vibrate(ms || 12));

  // ---------- plátno a kamera (camera.js: rozvržení, pohyb, ruční ovládání) ----------
  const cv = $("stage"), ctx = cv.getContext("2d");
  let cw = 0, ch = 0, dpr = 1;
  const cam = JPCam.create({ W, GY, SLING, ZONE, CR: JP.CR });
  function resize() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    cw = innerWidth; ch = innerHeight;
    cv.width = Math.round(cw * dpr); cv.height = Math.round(ch * dpr);
    cam.resize(cw, ch);
    if ($("viewLbl")) syncView();
  }
  const portrait = () => cam.portrait();
  const overview = () => cam.overview();
  const toScreen = (x, y) => cam.toScreen(x, y), toWorld = (sx, sy) => cam.toWorld(sx, sy);
  // čí pevnost se ukazuje, když nic nelétá: při míření pevnost střelce, při výběru ježka a po konci ta, do které se střílelo
  function viewTeam() {
    if (!st) return me || "x";
    if (st.ph === "end") return st.win ? other(st.win) : (me || st.p);
    return st.ph === "pick" ? other(st.p) : st.p;
  }
  function syncView() {
    const bt = cam.button(viewTeam());
    $("viewPlus").toggleAttribute("hidden", !bt.plus);
    $("viewLbl").textContent = bt.label; $("viewBtn").setAttribute("aria-label", bt.label);
  }
  // probíhající výstřel (můj nebo soupeřův): { team, r }
  function shotCtx() {
    if (acting) return { team: acting.team, r: acting };
    if (replay && replay.rp) { const a = replay.acts[replay.i]; if (a && a.kind === "s") return { team: a.by, r: replay }; }
    return null;
  }
  // co má kamera právě sledovat: výchozí pohled, nebo výstřel s ježkem (poloha a rychlost ve světě za sekundu)
  function camIntent() {
    const intent = { rest: cam.restView(viewTeam()), reduced: calm(), shot: null };
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

  // ---------- pozadí: klidné, ať nepřebíjí hru (bez slunce, mraků a přechodů) ----------
  const SKY = "#86D9F2";
  function bg() {
    ctx.fillStyle = SKY; ctx.fillRect(0, 0, cw, ch);
    layer(0.35, "#A9E2D3", X => 120 + 40 * Math.sin(X / 190) + 26 * Math.sin(X / 83 + 1.3), 40);
    layer(0.62, "#88D09F", X => 64 + 24 * Math.sin(X / 120 + 0.5) + 14 * Math.abs(Math.sin(X / 47)), 18);
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

  // ---------- stav postaviček v rendereru (výrazy a reakce; nic se nesynchronizuje) ----------
  // Odvozuje se z těles ve scéně (poloha, životy), ježka (vzdálenost) a událostí (zásah, KO, výsledek výstřelu),
  // takže soupeř vidí totéž co střelec z přehrávaných snímků a událostí.
  const CS = new Map();
  let animT = 0, frameN = 0, lastBodies = new Map();
  const TAU = Math.PI * 2, rnd = (a, b) => a + Math.random() * (b - a);
  function csOf(b) {
    let s = CS.get(b.id);
    if (!s) { s = { t: b.t, x: b.x, y: b.y, vx: 0, vy: 0, rot: b.a, hp: b.hp, blinkIn: rnd(40, 240), blinkT: 0, fear: 0, hit: 0, startle: 0, cheer: 0, sad: 0, ph: (b.id * 1.713) % TAU, lx: 0, ly: 0, last: frameN }; CS.set(b.id, s); }
    return s;
  }
  function csUpdate(bodies, hog, dtf) {
    frameN++; animT += dtf / 60;
    lastBodies = new Map();
    for (const b of bodies) lastBodies.set(b.id, b);
    for (const b of bodies) {
      if (b.k !== "C") continue;
      const s = csOf(b);
      if (Math.abs(b.x - s.x) > 160 || Math.abs(b.y - s.y) > 160) { s.vx = s.vy = 0; s.hp = b.hp; s.rot = b.a; }
      s.vx += ((b.x - s.x) / dtf - s.vx) * 0.4; s.vy += ((b.y - s.y) / dtf - s.vy) * 0.4;
      s.x = b.x; s.y = b.y; s.t = b.t; s.last = frameN;
      if (b.hp < s.hp - 1.2) { s.hit = 1; s.startle = 1; }
      if (s.fear > 0.5) STATS.fearFrames++;
      if (s.hit > 0.35) STATS.hitFrames++;
      s.hp = b.hp;
      const speed = Math.hypot(s.vx, s.vy);
      if (speed > 0.9) s.rot = b.a; else s.rot += (Math.round(s.rot / TAU) * TAU - s.rot) * Math.min(1, 0.12 * dtf);
      // strach a pohled podle ježka
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
    };
    const breath = M ? 1 + Math.sin(animT * 2.4 + s.ph) * 0.016 : 1, sq = M ? s.hit * 0.13 : 0;
    const hop = M ? -(o.cheer > 0 ? Math.abs(Math.sin(animT * 9 + s.ph)) * 9 * Math.min(1, s.cheer * 2) : 0) - s.startle * 3 : 0;
    return { o, rot: s.rot, dy: hop, sx: breath * (1 + sq), sy: breath * (1 - sq) };
  }
  // nálada celého týmu (živé postavičky)
  function mood(team, what, str = 1) {
    for (const s of CS.values()) {
      if (s.t !== team || frameN - s.last > 3) continue;
      STATS[what]++;
      if (what === "cheer") { s.cheer = str; s.sad = 0; } else if (what === "sad") { s.sad = str; s.cheer = 0; } else if (what === "shock") { s.startle = 1; s.fear = Math.max(s.fear, 0.6); }
    }
  }
  // výsledek výstřelu: radost, úlek nebo facepalm (evs = události jednoho tahu)
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
  const groundAt = x => { const d = x - HILL.x; return Math.abs(d) < HILL.r ? Math.min(GY, HILL.y - Math.sqrt(HILL.r * HILL.r - d * d)) : GY; };
  function drawWorld(scene) {
    const lw = lwW();
    // kopec
    ctx.save(); ctx.beginPath(); ctx.rect(-3000, -3000, W + 6000, GY + 3014); ctx.clip();
    circle(ctx, HILL.x, HILL.y, HILL.r); ctx.fillStyle = "#7AD24A"; ctx.fill(); outline(ctx, lw);
    ctx.restore();
    // zem
    const left = cam.x - cw / cam.s, right = cam.x + cw / cam.s;
    ctx.fillStyle = "#C98A4B"; ctx.fillRect(left, GY, right - left, 4000);
    ctx.fillStyle = "#B97C40"; for (let x = Math.floor(left / 180) * 180; x < right; x += 180) { circle(ctx, x + 40, GY + 70 + (x % 7) * 8, 6); ctx.fill(); circle(ctx, x + 120, GY + 140 + (x % 5) * 10, 4.5); ctx.fill(); }
    ctx.fillStyle = "#6CCB3A"; ctx.fillRect(left, GY - 2, right - left, 22);
    ctx.beginPath(); ctx.moveTo(left, GY + 20); ctx.lineTo(right, GY + 20); ctx.strokeStyle = "#4E9E2A"; ctx.lineWidth = 3; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(left, GY); ctx.lineTo(HILL.x - Math.sqrt(HILL.r ** 2 - (GY - HILL.y) ** 2), GY);
    ctx.moveTo(HILL.x + Math.sqrt(HILL.r ** 2 - (GY - HILL.y) ** 2), GY); ctx.lineTo(right, GY); outline(ctx, lw);
    // podstavce
    for (const t of ["x", "o"]) { const [a, b] = PLINTHS[t]; rrect(ctx, a, GY - 30, b - a, 32, 5); ctx.fillStyle = "#8E98AA"; ctx.fill(); ctx.save(); ctx.clip(); ctx.fillStyle = "rgba(255,255,255,.25)"; ctx.fillRect(a, GY - 30, b - a, 6); ctx.fillStyle = "rgba(43,22,56,.14)"; ctx.fillRect(a, GY - 8, b - a, 10); ctx.restore(); rrect(ctx, a, GY - 30, b - a, 32, 5); outline(ctx, lw); }
    // praky (zadní guma)
    for (const t of ["x", "o"]) drawSling(t, lw, scene, 0);
    // tělesa
    for (const b of scene.bodies) {
      ctx.save();
      if (b.k === "C") {
        const p = poseOf(b);
        ctx.translate(b.x, b.y + p.dy); ctx.rotate(p.rot); ctx.translate(0, 19); ctx.scale(p.sx, p.sy); ctx.translate(0, -19);
        drawCritter(ctx, b.t, lw, p.o);
      } else { ctx.translate(b.x, b.y); ctx.rotate(b.a); drawBlock(ctx, b.k, lw, b.max ? 1 - b.hp / b.max : 0, b.id); }
      ctx.restore();
    }
    // náhled dráhy
    if (scene.dots) {
      scene.dots.forEach((p, i) => { circle(ctx, p[0], p[1], Math.max(2.4, 6.2 - i * 0.13)); ctx.fillStyle = `rgba(255,255,255,${1 - i / scene.dots.length * 0.75})`; ctx.fill(); ctx.lineWidth = lw * 0.5; ctx.strokeStyle = "rgba(43,22,56,.6)"; ctx.stroke(); });
    }
    if (scene.hog) { const h = scene.hog; ctx.save(); ctx.translate(h.x, h.y); ctx.rotate(h.a); drawHog(ctx, h.team, lw, h.type, { t: animT }); ctx.restore(); }
    for (const t of ["x", "o"]) drawSling(t, lw, scene, 1);
    drawParticles(lw);
    // ježek mimo obrazovku nahoře
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
    // guma: tmavý obrys + sytá barva, ať je vidět i když je krátká
    const band = tip => {
      ctx.lineCap = "round"; ctx.beginPath(); ctx.moveTo(tip[0], tip[1]); ctx.lineTo(pouch[0], pouch[1]);
      ctx.strokeStyle = ART.INK; ctx.lineWidth = 9; ctx.stroke(); ctx.strokeStyle = "#E0436B"; ctx.lineWidth = 4.5; ctx.stroke();
    };
    if (!front) { band(dir > 0 ? tipA : tipB); return; }
    ctx.beginPath(); ctx.moveTo(s.x - 6, gy + 6); ctx.lineTo(s.x - 6, s.y + 34); ctx.lineTo(tipA[0] - 5, tipA[1]); ctx.lineTo(tipA[0] + 5, tipA[1] - 2);
    ctx.lineTo(s.x, s.y + 24); ctx.lineTo(tipB[0] - 5, tipB[1] - 2); ctx.lineTo(tipB[0] + 5, tipB[1]); ctx.lineTo(s.x + 6, s.y + 34); ctx.lineTo(s.x + 6, gy + 6); ctx.closePath();
    ctx.fillStyle = "#B8763F"; ctx.fill(); outline(ctx, lw);
    ctx.save(); ctx.clip(); ctx.fillStyle = "rgba(255,255,255,.2)"; ctx.fillRect(s.x - 7, gy, 4, 120); ctx.fillStyle = "rgba(43,22,56,.18)"; ctx.fillRect(s.x + 3, s.y, 4, 160); ctx.restore();
    if (pulled) { ctx.save(); ctx.translate(pulled.x, pulled.y); ctx.rotate(pulled.a); drawHog(ctx, t, lw, scene.hogType || "n", { t: animT }); ctx.restore(); }
    else if (scene.loaded === t) { ctx.save(); ctx.translate(pouch[0], pouch[1] - 4); drawHog(ctx, t, lw, scene.hogType || "n", { t: animT }); ctx.restore(); }
    band(dir > 0 ? tipB : tipA);
    rrect(ctx, pouch[0] - 9, pouch[1] - 5, 18, 10, 4); ctx.fillStyle = "#5A2A3A"; ctx.fill();
  }

  // ---------- částice, úlomky, třesení, zpomalení ----------
  let parts = [], shake = 0, freeze = 0, slow = { t: 0, f: 1 };
  const PCOL = { w: ["#E9A55A", "#C77F35", "#F6C88A"], s: ["#A8B3C4", "#7D889A", "#D5DCE6"], g: ["#E6FBFF", "#BDEFFF", "#ffffff"], c: ["#fff", "#FFE27A"], z: ["#C98A4B", "#6CCB3A"], h: ["#8A5A3B", "#6B4226"] };
  const MAXP = 380;
  function burst(x, y, m, n, power = 1) {
    if (calm()) n = Math.ceil(n / 3);
    const cols = PCOL[m] || PCOL.z;
    for (let i = 0; i < n && parts.length < MAXP; i++) {
      const a = Math.random() * TAU, v = (1.5 + Math.random() * 4.5) * power;
      parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 2.5 * power, life: 0, max: 35 + Math.random() * 30, k: m === "g" ? "shard" : m === "s" || m === "z" ? "dust" : "chip", c: cols[i % cols.length], sz: 3 + Math.random() * 6, r: Math.random() * 6, vr: (Math.random() - 0.5) * 0.4 });
    }
  }
  // rozpad kostky na úlomky (tvar a barva podle materiálu kostky)
  function fragments(e) {
    const bi = lastBodies.get(e.id), K = bi && KIND[bi.k];
    if (!K) { burst(e.x, e.y, e.m || "w", 14, 1.2); return; }
    STATS.frag++;
    const m = K.m, cols = MATCOL[m], long = K.w >= K.h, L = long ? K.w : K.h;
    const n = calm() ? 3 : m === "g" ? 9 : m === "s" ? 6 : clamp(Math.round(L / 34), 3, 6);
    const ca = Math.cos(bi.a), sa = Math.sin(bi.a);
    for (let i = 0; i < n && parts.length < MAXP; i++) {
      const u = (i + 0.5) / n - 0.5, lx = long ? u * K.w : (Math.random() - 0.5) * K.w, ly = long ? (Math.random() - 0.5) * K.h : u * K.h;
      const wx = bi.x + lx * ca - ly * sa, wy = bi.y + lx * sa + ly * ca;
      const ang = Math.atan2(wy - e.y, wx - e.x) + (Math.random() - 0.5) * 0.9, v = 2 + Math.random() * 4.2;
      const cell = long ? [K.w / n, K.h] : [K.w, K.h / n];
      const pts = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([px, py]) => [px * (cell[0] / 2) * (0.7 + Math.random() * 0.3), py * (cell[1] / 2) * (0.7 + Math.random() * 0.3)]);
      if (m === "g") { pts.length = 3; for (const q of pts) { q[0] *= 0.8; q[1] *= 0.8; } }
      parts.push({ x: wx, y: wy, vx: Math.cos(ang) * v, vy: Math.sin(ang) * v - 2.2, life: 0, max: 80 + Math.random() * 40, k: "frag", pts, c: cols[0], glass: m === "g", r: bi.a, vr: (Math.random() - 0.5) * 0.45, sz: 1 });
    }
    if (m === "w" && !calm()) for (let i = 0; i < 4 && parts.length < MAXP; i++) parts.push({ x: bi.x + (Math.random() - 0.5) * K.w, y: bi.y, vx: (Math.random() - 0.5) * 6, vy: -2 - Math.random() * 4, life: 0, max: 60 + Math.random() * 30, k: "frag", pts: [[-8, -1.2], [8, -1.2], [8, 1.2], [-8, 1.2]], c: cols[1], glass: false, r: Math.random() * 3, vr: (Math.random() - 0.5) * 0.6, sz: 1 });
    burst(bi.x, bi.y, m === "g" ? "g" : "z", m === "s" ? 10 : 5, 0.8);
  }
  function koFx(x, y, team) {
    burst(x, y, "c", 8, 1.1);
    const dir = x > W / 2 ? 1 : -1;
    puff.push({ x, y, team, life: 0, vx: dir * (1.4 + Math.random()), vy: -8.6, rot: 0, vr: dir * 0.2 });
    if (!calm()) for (let i = 0; i < 5; i++) parts.push({ x, y: y - 10, vx: (i - 2) * 1.5, vy: -4 - Math.random() * 2, life: 0, max: 60, k: "star", c: "#FFE27A", sz: 9, r: 0, vr: 0.1 });
    const words = ["Au!", "Jau!", "Ouha!", "Fuj!", "Ajaj!"];
    parts.push({ x, y: y - 34, vx: 0, vy: -1.1, life: 0, max: 80, k: "text", c: TEAM[team].c, text: words[(x | 0) % words.length], sz: 34, r: 0, vr: 0 });
  }
  function boomFx(e) {
    STATS.boom++;
    parts.push({ x: e.x, y: e.y, vx: 0, vy: 0, life: 0, max: 26, k: "ring", sz: e.r, c: "#FFD23C", r: 0, vr: 0 });
    const cols = ["#FFD23C", "#FF8A2A", "#E8413C", "#fff"];
    for (let i = 0; i < (calm() ? 6 : 16) && parts.length < MAXP; i++) { const a = Math.random() * TAU, v = 2 + Math.random() * 6; parts.push({ x: e.x, y: e.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 1, life: 0, max: 24 + Math.random() * 18, k: "puffball", c: cols[i % 4], sz: 8 + Math.random() * 12, r: 0, vr: 0 }); }
    burst(e.x, e.y, "z", 10, 1.4);
  }
  let puff = [];   // vyřazené postavičky: odlétnou v oblouku a „puf“
  function puffOut(p) {
    for (let i = 0; i < (calm() ? 5 : 9) && parts.length < MAXP; i++) { const a = i / 9 * TAU, v = 1.2 + Math.random() * 1.6; parts.push({ x: p.x, y: p.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 0.4, life: 0, max: 30 + Math.random() * 10, k: "puffball", c: "#fff", sz: 8 + Math.random() * 6, r: 0, vr: 0 }); }
    if (!calm()) for (let i = 0; i < 4; i++) parts.push({ x: p.x, y: p.y, vx: (i - 1.5) * 1.6, vy: -2.4 - i * 0.3, life: 0, max: 46, k: "star", c: "#FFE27A", sz: 8, r: 0, vr: 0.12 });
  }
  function drawParticles(lw) {
    for (const p of puff) {
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.scale(1 + p.life / 150, 1 + p.life / 150);
      drawCritter(ctx, p.team, lw, { ko: true, hurt: 1, t: animT, still: calm(), plain: true }); ctx.restore();
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
      else if (p.k === "ring") { const u = p.life / p.max, r = p.sz * (1 - (1 - u) ** 3); circle(ctx, 0, 0, r); ctx.fillStyle = "rgba(255,210,60,.28)"; ctx.fill(); ctx.lineWidth = lw * (1.6 - u); ctx.strokeStyle = "#FF8A2A"; ctx.stroke(); }
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
  // událost ze simulace nebo záznamu
  let koTrack = { alive: { x: 3, o: 3 }, last: -99 };
  function beginAct(bodies) { koTrack = { alive: { x: JP.alive(bodies, "x"), o: JP.alive(bodies, "o") }, last: -99 }; }
  function nearCritters(x, y, r, f) { for (const s of CS.values()) if (frameN - s.last <= 3 && Math.hypot(s.x - x, s.y - y) < r) f(s); }
  // hit-stop, zpomalení a záškub kamery při nárazu na jednom místě (jen vykreslení; simulace i záznam se nemění)
  //   freezeTicks: pauza ve snímcích, slowT/slowF: délka (snímky) a rychlost zpomalení, kick: záškub kamery 0..1
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
      koFx(e.x, e.y, e.m === "o" ? "o" : "x"); if (!quiet) sfx.ko(); buzz(30);
      if (!calm()) { shake = Math.max(shake, 10); hitStop(5, 0, 1, 0.7); }
      const team = e.m === "o" ? "o" : "x";
      koTrack.alive[team]--;
      const decisive = koTrack.alive[team] <= 0 || e.t - koTrack.last < 45;
      koTrack.last = e.t;
      STATS.ko++;
      if (decisive && !calm()) { hitStop(0, 60, 0.28, 1); STATS.slow++; }
      CS.delete(e.id);
      nearCritters(e.x, e.y, 200, s => { s.startle = 1; s.fear = Math.max(s.fear, 0.7); });
    } else if (e.type === "e") {
      boomFx(e); if (!quiet) sfx.boom(); buzz(40);
      if (!calm()) { shake = Math.max(shake, 16); hitStop(4, 24, 0.4, 1); }
      nearCritters(e.x, e.y, e.r * 1.6, s => { s.startle = 1; s.fear = Math.max(s.fear, 0.8); });
    } else if (e.type === "n") { if (!quiet) sfx.drop(); }
  }

  // ---------- stav ----------
  let st = null;            // partie (b = tělesa jako objekty)
  let room = null, me = null, view = "setup", busy = false, net = "", bootSeq = 0, starter = "o", shareKind = "new";
  let acting = null;        // { sim, kind, base, … } – moje probíhající simulace
  let replay = null;        // { acts, i, rp, t, final } – přehrávání soupeřova tahu
  let pendingDoc = null;    // dokument, který přišel během přehrávání
  let aim = null;           // { x0, y0, dx, dy, kb } – napínání praku
  let pickSel = null;       // vybraný druh ježka ve fázi výběru
  let pickAt = 0;           // panel výběru naskočí s krátkým odstupem, ať je vidět reakce postaviček na výstřel

  const nameOf = (g, p) => p === "x" ? g.x : g.o;
  const ended = () => !!st && st.ph === "end";
  const myTurn = () => !!st && !!me && st.p === me && !ended();
  const canAim = () => myTurn() && st.ph === "aim" && !acting && !replay && !busy && view === "play";
  const picking = () => myTurn() && st.ph === "pick" && !acting && !replay && view === "play";
  const freeSeat = () => !room ? null : !room.sx ? "x" : !room.so ? "o" : null;
  const say = t => { $("say").textContent = ""; requestAnimationFrame(() => $("say").textContent = t); };

  function currentHog() {
    if (acting) { const h = acting.rp.hogView(acting.t); return h && { ...h, team: acting.team, type: acting.type }; }
    if (replay && replay.rp) { const a = replay.acts[replay.i], h = replay.rp.hogView(replay.t); return h && { ...h, team: a.by, type: a.ht || "n" }; }
    return null;
  }
  function scene() {
    let bodies, hog = currentHog();
    if (acting) bodies = acting.rp.view(acting.t);
    else if (replay && replay.rp) bodies = replay.rp.view(replay.t);
    else bodies = st ? st.b.map(b => ({ ...b, max: b.k === "C" ? JP.CRITTER_HP : JP.MAT[KIND[b.k].m].hp })) : JP.initialBodies();
    const sc = { bodies, hog, hogType: st ? st.hg : "n" };
    if (aim && canAim()) {
      const { ang, pow } = aimParams(aim.dx, aim.dy);
      const s = SLING[me], pullW = pow * 70;
      sc.pull = { team: me, x: s.x - Math.cos(ang) * pullW, y: s.y - Math.sin(ang) * pullW, a: ang };
      if (pow > 0.08) {
        // náhled jen úvodní oblouk: končí, když by tečka zapadla do terénu
        const all = JP.preview(me, ang, pow, 16, 3, st.hg), cut = all.findIndex(p => p[1] > groundAt(p[0]) - 6);
        sc.dots = cut < 0 ? all : all.slice(0, cut);
      }
    } else if (st && st.ph === "aim" && !acting && !replay && !ended() && view === "play") sc.loaded = st.p;   // ježek v praku vidí i čekající
    return sc;
  }

  // ---------- smyčka ----------
  let last = performance.now(), accT = 0;
  const speed = () => TEST && window.JPT ? window.JPT.speed : 1;
  function frame(now) {
    const dt = Math.min(100, now - last); last = now;
    accT += dt * speed() * (slow.t > 0 ? slow.f : settling() ? 1.8 : 1);
    let n = 0;
    while (accT >= 1000 / 60 && n < 12) {
      accT -= 1000 / 60; n++;
      tick();
    }
    if (n >= 12) accT = 0;
    draw();
    requestAnimationFrame(frame);
  }
  // když doznívá pád a nic se neděje (ježek je pryč, 0,5 s bez události), přehrávání se zrychlí; vizuální, simulace se nemění
  function settling() {
    const r = acting && !acting.played ? acting : replay && replay.rp ? replay : null;
    return !!r && r.wait <= 0 && r.t - (r.lastEv || 0) > 30 && !r.rp.hogView(r.t);
  }
  function tick() {
    if (freeze > 0) { freeze--; STATS.freeze++; return; }   // hit-stop: jen vizuální pauza, simulace i záznam stojí
    if (acting && !acting.played && stepPlay(acting)) { acting.played = true; reactToShot(acting.team, acting.evs); tryFinish(); }
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
  function inZone(x) { const wx = toWorld(x, 0)[0], [z0, z1] = ZONE[me]; return wx > z0 - 60 && wx < z1 + 60; }
  cv.addEventListener("pointerdown", e => {
    const [x, y] = pt(e);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    if (e.isPrimary) { ptrs.clear(); pinch = null; }   // nový první dotyk = staré ukazatele už skončily
    ptrs.set(e.pointerId, [x, y]);
    attempt(() => cv.setPointerCapture(e.pointerId));
    if (ptrs.size === 2) {
      // druhý prst: zoom, rozpracované míření se zruší
      aim = null; pan = null;
      const [a, b] = [...ptrs.values()];
      pinch = true; cam.pinchStart(a, b); syncView();
      render(); return;
    }
    if (ptrs.size > 2) return;
    if (canAim() && nearSling(x, y)) { aim = { x0: x, y0: y, dx: 0, dy: 0 }; render(); return; }
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
    } else if (pan) {
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
  cv.addEventListener("keydown", e => {
    if (canAim()) {
      if (!aim) { const r = maxPull() * 0.7, a0 = me === "o" ? -Math.PI * 0.75 : -Math.PI / 4; aim = { x0: 0, y0: 0, dx: -Math.cos(a0) * r, dy: -Math.sin(a0) * r, kb: true }; }
      const { ang, pow } = aimParams(aim.dx, aim.dy);
      let A = ang, P = pow, used = true;
      if (e.key === "ArrowLeft") A += (me === "o" ? 1 : -1) * Math.PI / 180;
      else if (e.key === "ArrowRight") A -= (me === "o" ? 1 : -1) * Math.PI / 180;
      else if (e.key === "ArrowUp") P = Math.min(1, P + 0.02);
      else if (e.key === "ArrowDown") P = Math.max(0.1, P - 0.02);
      else if (e.key === " " || e.key === "Enter") { endAim(true); e.preventDefault(); return; }
      else if (e.key === "Escape") { aim = null; render(); return; }
      else used = false;
      if (used) { e.preventDefault(); aim.dx = -Math.cos(A) * P * maxPull(); aim.dy = -Math.sin(A) * P * maxPull(); showMeter(); }
    } else if (picking()) {
      if (e.key === "ArrowLeft") { pickMove(-1); e.preventDefault(); }
      else if (e.key === "ArrowRight") { pickMove(1); e.preventDefault(); }
      else if (e.key === " " || e.key === "Enter") { e.preventDefault(); sendHog(); }
    }
  });
  function showMeter() {
    if (!aim) { $("meter").hidden = true; return; }
    const { ang, pow } = aimParams(aim.dx, aim.dy);
    let deg = Math.round(-ang * 180 / Math.PI); if (me === "o") deg = 180 - deg;
    $("meter").hidden = false; $("hint").hidden = true;
    $("meter").textContent = pow < 0.1 ? "Táhni dál dozadu" : `Síla ${Math.round(pow * 100)} % · úhel ${deg}°`;
  }

  // ---------- výstřel a stavba (u mě) ----------
  // Střelec simuluje výstřel hned celý (rychle, bez čekání na animaci), zápis odešle okamžitě a vlastní tah si přehraje
  // ze stejných snímků jako soupeř. Soupeř tak nečeká, až střelcovi doběhne animace.
  function shoot(ang, pow) {
    const base = st;
    beginAct(base.b);
    const sim = JP.sim(base.b);
    sim.launch(me, ang, pow, base.hg);
    while (sim.step());
    const res = sim.result(28000);
    const next = { ...base, b: res.bodies, n: base.n + 1, t: Math.floor(Date.now() / 60000) };
    const act = { n: next.n, by: me, kind: "s", kf: res.kf, ev: res.ev, b0: JP.packBodies(base.b), a: Math.round(ang * 1000), f: Math.round(pow * 1000), ht: base.hg };
    next.h = [act];
    const opp = other(me), mine = JP.alive(res.bodies, me), theirs = JP.alive(res.bodies, opp);
    if (theirs === 0) { next.ph = "end"; next.win = me; }
    else if (mine === 0) { next.ph = "end"; next.win = opp; }
    else if (base.pl[opp].length === 1) { next.ph = "aim"; next.p = opp; next.hg = base.pl[opp]; next.pl = giveHog(base, opp, next.hg); }
    else { next.ph = "pick"; next.p = me; }
    acting = { team: me, type: base.hg, base, next, evs: JP.decEvents(res.ev), rp: JP.replay(base.b, res.kf, res.ev), t: 0, evI: 0, wait: 14, played: false, ok: null };
    sfx.launch(); buzz(20);
    $("meter").hidden = true;
    say("Výstřel!");
    const A = acting;
    commit(next, cur => cur.id === base.id && cur.n === base.n && cur.p === me && cur.ph === base.ph && !cur.r, "", base).then(ok => { A.ok = ok; tryFinish(); });
    render();
  }
  function tryFinish() {
    const A = acting;
    if (!A || !A.played || A.ok === null) return;
    acting = null;
    if (!A.ok) { render(); return; }
    setGame(A.next);
    pickAt = performance.now() + (calm() ? 250 : 700);
    afterChange(true);
  }
  // dávkování ježků: soupeř dostane každý druh jednou, než se dávka obnoví (poslední zbývající přijde sám)
  function giveHog(g, to, type) {
    let rest = g.pl[to].replace(type, "");
    if (!rest) rest = JP.HOG_ORDER.replace(type, "");
    return { ...g.pl, [to]: rest };
  }
  // ježek pro soupeře: vyber druh a pošli
  const pool = () => st && me ? st.pl[other(me)] : "";
  function pickMove(d) {
    const p = pool(); if (!p || !pickSel) return;
    const i = JP.HOG_ORDER.split("").filter(c => p.includes(c)), k = (i.indexOf(pickSel) + d + i.length) % i.length;
    pickSel = i[k]; renderPick();
  }
  async function sendHog() {
    if (!picking() || !pickSel || busy || !pool().includes(pickSel)) return;
    const base = st, opp = other(me), hg = pickSel;
    const next = { ...base, ph: "aim", p: opp, hg, pl: giveHog(base, opp, hg) };
    const ok = await commit(next, cur => cur.id === base.id && cur.n === base.n && cur.p === me && cur.ph === "pick" && !cur.r, "", base);
    if (!ok) { render(); return; }
    sfx.pick(); setGame(next); afterChange(false);
    say(`${nameOf(next, opp)} dostane: ${HOGUI[hg][0]} ježek.`);
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
    if (!a) { const f = replay.final; replay = null; setGame(f); afterChange(true); if (pendingDoc) { const d = pendingDoc; pendingDoc = null; apply(d, true); } return; }
    const b0 = JP.unpackBodies(a.b0) || st.b;
    beginAct(b0);
    replay.rp = JP.replay(b0, a.kf, a.ev);
    replay.t = 0; replay.evI = 0; replay.wait = a.kind === "s" ? 30 : 12;
    if (a.kind === "s") { sfx.launch(); say(`${nameOf(replay.final, a.by)} střílí.`); }
    render();
  }
  // jeden krok přehrávání (soupeřův tah i vlastní tah střelce); vrací true, když doběhlo
  function stepPlay(r) {
    if (r.wait > 0) { r.wait--; return false; }
    r.t++;
    const evs = r.rp.events;
    while (r.evI < evs.length && evs[r.evI].t <= r.t) { fx(evs[r.evI++]); r.lastEv = r.t; }
    return r.t > r.rp.end + 28;
  }
  function stepReplay() { if (stepPlay(replay)) nextReplay(); }

  // ---------- sdílená místnost (jako Psaníčko: mantledb.sh, bez účtu) ----------
  // Odkaz #r.<id>. Dokument {app, g, v, sx, so, u}: v = počítadlo zápisů, sx / so = zařízení na židlích.
  // g = {id, x, o, s, k, kc, w, r, n, p, ph: aim|build|end, win, b: tělesa, h: poslední akce [{n, by, kind, kf, ev, b0, …}], t}
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

  const toDoc = g => ({ ...g, b: JP.packBodies(g.b) });
  function norm(g) {
    if (!g || typeof g !== "object") return null;
    const str = (v, n) => typeof v === "string" ? v.trim().slice(0, n) : "";
    const x = str(g.x, 16), o = str(g.o, 16), b = JP.unpackBodies(g.b);
    if (!x || !o || !b || (g.s !== "x" && g.s !== "o") || (g.p !== "x" && g.p !== "o") || !["aim", "build", "pick", "end"].includes(g.ph)) return null;
    const w = Array.isArray(g.w) ? [0, 1].map(k => Math.max(0, Math.min(999, g.w[k] | 0))) : [0, 0];
    const k = /^[1-6c]$/.test(g.k || "") ? g.k : "", kc = str(g.kc, 40);
    const hogOk = c => typeof c === "string" && c.length === 1 && JP.HOG_ORDER.includes(c);
    const h = (Array.isArray(g.h) ? g.h : []).filter(a => a && Number.isFinite(a.n) && (a.by === "x" || a.by === "o") && (a.kind === "s" || a.kind === "b") && typeof a.kf === "string").slice(-2).map(a => ({ ...a, ht: hogOk(a.ht) ? a.ht : "n" }));
    // ježci (twist): hg = druh ježka, kterého teď střílí hráč na tahu; pl = které druhy ještě může každý dostat. Starší hry je nemají.
    const poolOk = v => typeof v === "string" && v.length > 0 && v.length <= 4 && [...v].every(c => JP.HOG_ORDER.includes(c)) && new Set(v).size === v.length ? v : JP.HOG_ORDER;
    const pl = { x: poolOk(g.pl && g.pl.x), o: poolOk(g.pl && g.pl.o) };
    let ph = g.ph, p = g.p;
    if (ph === "build") { ph = "aim"; p = other(p); }   // rozehraná hra ze starší verze (stavba kostek): stavba odpadá, na tahu je soupeř
    return { id: str(g.id, 12) || "0", x, o, s: g.s, k: k === "c" && !kc ? "" : k, kc, w, r: g.r === "x" || g.r === "o" ? g.r : "",
      n: Math.max(0, g.n | 0), p, ph, win: g.win === "x" || g.win === "o" ? g.win : "", b, h, hg: hogOk(g.hg) ? g.hg : "n", pl, t: Number.isFinite(g.t) ? g.t : null };
  }
  function freshGame(x, o, s, k, kc, w) {
    // první střelec začíná obyčejným ježkem, ostatní druhy dostane později
    const pl = { x: s === "x" ? "kgb" : JP.HOG_ORDER, o: s === "o" ? "kgb" : JP.HOG_ORDER };
    return { id: randId(6), x, o, s, k, kc, w, r: "", n: 0, p: s, ph: "aim", win: "", b: JP.initialBodies(), h: [], hg: "n", pl, t: null };
  }
  const setGame = g => { st = g; };
  const sig = g => g ? [g.id, g.x, g.o, g.s, g.n, g.p, g.ph, g.w.join(":"), g.r, g.k, g.kc, g.hg, g.pl.x, g.pl.o].join("|") : "";

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
    if (acting) return;                         // moje simulace běží, zápis přijde po ní
    if (replay) { pendingDoc = d; return; }
    const prev = st;
    room.v = d.v; lastChange = Date.now();
    if (view === "intro") { setGame(g); if (!freeSeat()) show("play"); else render(); return; }
    if (view !== "play") { setGame(g); return; }
    if (prev && sig(g) === sig(prev)) { render(); return; }
    if (prev && g.id === prev.id && g.n > prev.n) {
      const acts = g.h.filter(a => a.n > prev.n && a.by !== me).sort((a, b) => a.n - b.n);
      if (acts.length) { startReplay(acts, g); return; }
    }
    const newGame = !prev || g.id !== prev.id;
    setGame(g);
    if (newGame) { parts = []; puff = []; CS.clear(); cam.snapNext(); cam.release(); }
    afterChange(newGame);
  }
  // po změně stavu: stavba, oznámení, konec
  function afterChange(fresh) {
    if (fresh || (myTurn() && !acting)) { cam.release(); }
    syncView();
    if (picking()) { const p = pool(); if (!pickSel || !p.includes(pickSel)) pickSel = p[0]; }
    if (ended()) {
      const won = st.win === me;
      if (fresh && me) { won ? sfx.win() : sfx.lose(); }
      $("endBox").classList.remove("go"); void $("endBox").offsetWidth; $("endBox").classList.add("go");
    } else if (myTurn() && st.ph === "aim") { sfx.turn(); buzz(15); }
    render();
    remember();
  }

  // ---------- dotazování ----------
  let pollT = null, pollSeq = 0, lastChange = Date.now(), fails = 0;
  function interval() {
    const idle = Date.now() - lastChange;
    const ms = idle < 90e3 ? 1500 : idle < 5 * 60e3 ? 2500 : idle < 30 * 60e3 ? 10000 : 30000;   // při živé hře rychleji, ať soupeř nečeká
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
    return `${nameOf(st, host)} tě vyzývá na Ježkomet: střílíme z praku ježka na pevnosti, kdo první shodí všechny tři soupeřovy postavičky, vyhrává.${s ? " O co hrajeme: " + s.text : ""} Hrajeme oba na tomhle odkazu, bez registrace: ${linkFor()}`;
  }
  function seriesAfter() { const w = [...st.w]; if (st.ph === "end" && st.win) w[st.win === "x" ? 0 : 1]++; return w; }
  function concedeText() {
    const s = stake(st), W_ = nameOf(st, st.win), L = nameOf(st, other(st.win));
    return `Uznávám porážku v Ježkometu. ${s ? s.third(W_, L) + " " : ""}Kdy a kde?`;
  }

  // ---------- vykreslení UI ----------
  function setView(v) {
    view = v;
    ["setup", "info", "intro", "share"].forEach(k => $(k).hidden = v !== k);
    $("hud").hidden = v !== "play";
    render();
  }
  const show = v => view === v ? render() : setView(v);
  const lifeCache = {};
  function lifeIcon(team, alive) {
    const key = team + alive;
    if (!lifeCache[key]) {
      const c = document.createElement("canvas"); c.width = c.height = 64;
      const x = c.getContext("2d"); x.translate(32, 36); x.scale(1.22, 1.22); drawCritter(x, team, 2.4, { lookX: team === "x" ? 1 : -1, ko: !alive, hurt: alive ? 0 : 1, plain: true, still: true });
      lifeCache[key] = c.toDataURL();
    }
    return lifeCache[key];
  }
  function lives(el, team, n) {
    const key = team + n;
    if (el.dataset.k === key) return;
    el.dataset.k = key; el.innerHTML = "";
    for (let i = 0; i < 3; i++) { const im = new Image(); im.src = lifeIcon(team, i < n); im.alt = ""; im.width = 26; im.height = 26; el.appendChild(im); }
    el.setAttribute("aria-label", `${n} ze 3 ve hře`);
  }
  function render() {
    if (view === "share") renderShare();
    if (view === "intro") renderIntro();
    if (view !== "play" || !st) { document.title = "Ježkomet"; return; }
    const sc = scene();
    const alive = t => sc.bodies.filter(b => b.k === "C" && b.t === t).length;
    $("nmX").textContent = st.x; $("nmO").textContent = st.o;
    lives($("livesX"), "x", alive("x")); lives($("livesO"), "o", alive("o"));
    const w = ended() && !replay && !acting ? seriesAfter() : st.w;
    $("score").innerHTML = `<b class="x">${w[0]}</b> : <b class="o">${w[1]}</b>`;
    $("score").setAttribute("aria-label", `Série ${st.x} ${w[0]}, ${st.o} ${w[1]}`);
    const turnP = ended() ? null : st.p;
    $("plateX").classList.toggle("turn", turnP === "x"); $("plateO").classList.toggle("turn", turnP === "o");
    // stav
    let s = "", waitStyle = true, pulse = false;
    const opp = me ? other(me) : null;
    if (net) s = net;
    else if (ended() && !replay) s = "";
    else if (acting) s = acting.played ? "Odesílám…" : "Letí!";
    else if (replay) { const a = replay.acts[replay.i]; s = a ? (a.kind === "s" ? `${nameOf(st, a.by)} střílí!` : `${nameOf(st, a.by)} staví…`) : ""; }
    else if (busy) s = "Odesílám…";
    else if (myTurn() && st.ph === "aim") { s = "Jsi na tahu: natáhni prak"; waitStyle = false; pulse = true; }
    else if (myTurn() && st.ph === "pick") { s = "Vyber ježka pro soupeře"; waitStyle = false; }
    else s = st.ph === "pick" ? (me && me !== st.p ? `${nameOf(st, st.p)} ti vybírá ježka…` : `${nameOf(st, st.p)} vybírá ježka…`) : `${nameOf(st, st.p)} míří…`;
    $("status").textContent = s; $("status").hidden = !s;
    $("status").classList.toggle("wait", waitStyle); $("status").classList.toggle("pulse", pulse && !calm());
    const waiting = !!me && !!freeSeat() && !ended();
    $("waitBox").hidden = !waiting || canAim() || picking() || !!acting || !!aim;
    if (waiting) $("waitText").textContent = `${nameOf(st, opp)} ještě neotevřel(a) výzvu. Pošli odkaz do chatu.`;
    $("hint").hidden = !canAim() || !!aim || !$("waitBox").hidden;
    $("hint").textContent = portrait() ? "Chyť ježka v praku, táhni dozadu a pusť." : "Chyť ježka v praku, táhni dozadu a pusť. Jinde tažením posouváš scénu.";
    if (!aim) $("meter").hidden = true;
    const showPick = picking() && performance.now() >= pickAt;
    if (picking() && !showPick) setTimeout(render, pickAt - performance.now() + 30);
    $("pickBox").hidden = !showPick;
    if (showPick) renderPick();
    // ježek na tahu: vidí ho střelec i čekající
    const chip = st.ph === "aim" && !ended() && !acting && !replay;
    $("hogChip").hidden = !chip;
    if (chip) {
      const [nm, inf] = HOGUI[st.hg], mine = myTurn();
      $("hcIcon").src = hogIcon(st.hg);
      $("hcName").textContent = `${nm} ježek`;
      $("hcInfo").textContent = mine ? (st.n === 0 ? `První výstřel. ${inf}` : `Vybral ti ho ${nameOf(st, other(st.p))}. ${inf}`) : `${nameOf(st, st.p)} střílí. ${inf}`;
    }
    cv.classList.toggle("aim", canAim() && !aim); cv.classList.toggle("aiming", !!aim);
    // konec
    const showEnd = ended() && !replay && !acting;
    $("endBox").hidden = !showEnd;
    if (showEnd) renderEnd();
    document.title = canAim() ? "Jsi na tahu · Ježkomet" : picking() ? "Vybíráš ježka · Ježkomet" : ended() && !replay ? "Konec partie · Ježkomet" : "Ježkomet";
  }
  // druhy ježků: název a jedna věta o tom, co umí
  const HOGUI = { n: ["Obyčejný", "Poctivá rána."], k: ["Kamenný", "Těžký: boří, ale letí kratší."], g: ["Gumový", "Skáče a odráží se od všeho."], b: ["Bouchací", "Při dopadu vybuchne."] };
  const hogIcons = {};
  function hogIcon(type) {
    if (!hogIcons[type]) {
      const c = document.createElement("canvas"); c.width = c.height = 96;
      const x = c.getContext("2d"); x.translate(48, 52); x.scale(1.5, 1.5); drawHog(x, "x", 2.2, type, { t: 1 });
      hogIcons[type] = c.toDataURL();
    }
    return hogIcons[type];
  }
  function renderPick() {
    const box = $("kinds"), p = pool();
    if (!box.dataset.ready) {
      box.dataset.ready = "1";
      for (const k of JP.HOG_ORDER) {
        const b = document.createElement("button"); b.type = "button"; b.className = "btn kind"; b.dataset.k = k;
        const im = new Image(); im.src = hogIcon(k); im.alt = ""; im.width = im.height = 48;
        const nm = document.createElement("span"); nm.className = "kn"; nm.textContent = HOGUI[k][0];
        const sm = document.createElement("small"); sm.className = "ki"; sm.textContent = HOGUI[k][1];
        const tx = document.createElement("span"); tx.className = "kt"; tx.append(nm, sm);
        b.append(im, tx);
        b.addEventListener("click", () => { if (picking() && pool().includes(k)) { pickSel = k; sfx.stretch(0.3); renderPick(); } });
        box.appendChild(b);
      }
    }
    for (const b of box.querySelectorAll("[data-k]")) {
      const k = b.dataset.k, used = !p.includes(k);
      b.disabled = used; b.setAttribute("aria-pressed", String(pickSel === k));
      b.querySelector(".ki").textContent = used ? "Už dostal(a), počkej na další dávku." : HOGUI[k][1];
    }
    $("pickTitle").textContent = `Jakého ježka dostane soupeř (${nameOf(st, other(me))})?`;
    $("pickNote").textContent = `Každý druh dostane jednou, než se dávka obnoví. Zbývá ${p.length} z 4.`;
    $("sendBtn").disabled = busy || !pickSel || !p.includes(pickSel);
    $("sendBtn").textContent = pickSel ? `Poslat: ${HOGUI[pickSel][0]} ježek` : "Poslat ježka";
  }
  $("sendBtn").addEventListener("click", sendHog);

  function renderEnd() {
    const won = me && st.win === me, s = stake(st), W_ = nameOf(st, st.win), L = nameOf(st, other(st.win));
    $("endTitle").textContent = !me ? `${W_} vyhrává!` : won ? "Vyhráváš!" : `${W_} vyhrává`;
    if (st.r) $("endTitle").textContent += st.r === me ? " (vzdal(a) ses)" : ` (${L} to vzdal(a))`;
    const w = seriesAfter();
    $("endSeries").textContent = `${st.x} ${w[0]} : ${w[1]} ${st.o}`;
    $("endStake").textContent = s ? (!me ? s.third(W_, L) : won ? s.win(W_, L) : s.lose(W_, L)) : won ? "Pevnost padla, tvoje postavičky slaví." : "Příště to bude tvoje pevnost, která vydrží.";
    const loser = nameOf(st, other(st.win));
    $("endPrimary").hidden = !me; $("endPrimary").disabled = busy;
    if (!me) $("endSecondary").textContent = "Zkopírovat odkaz na hru";
    else if (won) { $("endPrimary").textContent = `Odveta (začíná ${loser})`; $("endSecondary").textContent = "Zkopírovat odkaz na hru"; }
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
    $("acceptBtn").disabled = busy;
  }
  function cast(el) {
    if (el.childElementCount) return;
    for (const [t, hog] of [["x", false], [null, true], ["o", false]]) {
      const c = document.createElement("canvas"); c.width = c.height = 128;
      const x = c.getContext("2d"); x.translate(64, 68); x.scale(2.2, 2.2);
      hog ? drawHog(x, "x", 2.2, "n", { t: 1 }) : drawCritter(x, t, 2.2, { lookX: t === "x" ? 0.6 : -0.6, still: true, plain: true });
      el.appendChild(c);
    }
  }

  // ---------- hraní: odveta, vzdání ----------
  async function rematch() {
    if (busy || !me || !ended()) return;
    const loser = other(st.win);
    const next = freshGame(st.x, st.o, loser, st.k, st.kc, seriesAfter());
    if (!await commit(next, cur => cur.id === st.id && cur.ph === "end", "Odvetu už mezitím založil soupeř.")) return;
    setGame(next); parts = []; puff = []; CS.clear(); cam.snapNext();
    afterChange(true);
    say(`Odveta. Začíná ${nameOf(next, next.s)}.`);
  }
  async function resign() {
    if (busy || !me || ended() || acting) return;
    if (!confirm("Opravdu vzdát tuhle partii?")) return;
    const next = { ...st, r: me, ph: "end", win: other(me), n: st.n + 1, h: [] };
    if (!await commit(next, cur => cur.id === st.id && cur.n === st.n && cur.ph !== "end")) return;
    setGame(next); afterChange(true);
  }
  $("endPrimary").addEventListener("click", rematch);
  $("endSecondary").addEventListener("click", () => {
    if (me && st.win && st.win !== me) copy(concedeText(), "Zkopírováno, vlož to do chatu");
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
    setView("share");
  }
  function newGame() {
    clearTimeout(pollT); bootSeq++;
    room = null; me = null; st = null; busy = false; net = ""; acting = null; replay = null; pickSel = null; aim = null; CS.clear(); parts = []; puff = [];
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
    createRoom(freshGame(x, o, starter, k, kc, [0, 0]));
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
    cam.snapNext();
    if (!me && freeSeat() && !ended()) { cast($("introCast")); setView("intro"); return; }
    setView("play"); afterChange(false);
  }
  function boot() {
    const seq = ++bootSeq;
    clearTimeout(pollT);
    room = null; me = null; busy = false; net = ""; fails = 0; acting = null; replay = null; pickSel = null; aim = null;
    const h = (location.hash || "").replace(/^#/, "");
    const r = /^r\.([0-9a-z]{6,24})$/.exec(h);
    if (r) { openRoom(r[1], seq); return; }
    st = null; showSetup();
  }

  // ---------- testovací háček (jen s ?test) ----------
  if (TEST) {
    window.JPT = {
      speed: 1,
      cam: () => ({ x: cam.x, y: cam.y, s: cam.s, user: cam.isManual(), full: overview(), home: cam.restView(viewTeam()), homeS: cam.homeS(), ground: toScreen(0, GY)[1], crit: 2 * JP.CR * cam.s, portrait: portrait(), label: $("viewLbl").textContent, fs: !!fsEl(), fsOK }),
      hogScreen: () => { const h = currentHog(); return h ? toScreen(h.x, h.y) : null; },
      // y na obrazovce nejvyššího tělesa, které je v záběru (pevnost, ne ježek)
      topY: () => Math.min(...st.b.map(b => [toScreen(b.x, b.y - (b.k === "C" ? JP.CR : 24))]).filter(([p]) => p[0] > 0 && p[0] < cw).map(([p]) => p[1])),
      proj: (x, y) => { const [sx, sy] = toScreen(x, y); const r = cv.getBoundingClientRect(); return [r.left + sx, r.top + sy]; },
      stats: STATS, calm,
      crit: () => [...CS.values()].filter(s => frameN - s.last <= 3).map(s => ({ t: s.t, fear: +s.fear.toFixed(2), hit: +s.hit.toFixed(2), cheer: +s.cheer.toFixed(2), sad: +s.sad.toFixed(2), startle: +s.startle.toFixed(2) })),
      sling: () => { const [x, y] = toScreen(SLING[me].x, SLING[me].y); const r = cv.getBoundingClientRect(); return [r.left + x, r.top + y]; },
      info: () => st && { ph: st.ph, p: st.p, n: st.n, hg: st.hg, pl: st.pl, picking: picking(), pickSel, slow: slow.t > 0, me, win: st.win, acting: !!acting, replay: !!replay, busy, alive: { x: JP.alive(st.b, "x"), o: JP.alive(st.b, "o") }, w: st.w, view },
      // nejlepší výstřel z mřížky: vrací tah myší v pixelech (dx, dy), který dá přesně simulovaný úhel a sílu
      best(maxMs = 8000) {
        const t0 = performance.now(), mp = maxPull(), opp = other(me);
        let best = null;
        const degs = [], pows = [];
        for (let d = 10; d <= 72; d += 4) degs.push(d);
        for (let p = 0.56; p <= 1.0001; p += 0.03) pows.push(p);
        outer: for (const deg of degs) for (const p of pows) {
          if (performance.now() - t0 > maxMs) break outer;
          const ang = me === "x" ? -deg * Math.PI / 180 : -Math.PI + deg * Math.PI / 180;
          const dx = Math.round(-Math.cos(ang) * p * mp), dy = Math.round(-Math.sin(ang) * p * mp);
          const q = aimParams(dx, dy);
          const s = JP.sim(st.b); s.launch(me, q.ang, q.pow, st.hg); while (s.step());
          const r = s.result();
          const score = (3 - JP.alive(r.bodies, opp)) * 10 - (3 - JP.alive(r.bodies, me)) * 15 + JP.alive(st.b, opp) - JP.alive(r.bodies, opp);
          if (!best || score > best.score) best = { dx, dy, score, ko: JP.alive(st.b, opp) - JP.alive(r.bodies, opp) };
          if (best.ko >= 1 && best.score >= 10) break outer;
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
