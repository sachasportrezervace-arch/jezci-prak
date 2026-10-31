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
  const INK = "#2B1638";
  const TEAM = {
    x: { c: "#FF7A2F", d: "#D9541A", belly: "#FFD7A8", name: "Křečci" },
    o: { c: "#9B6BFF", d: "#7346D9", belly: "#E6D8FF", name: "Sovičky" },
  };
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
    ko() { tone(900, 0.12, { vol: 0.16, to: 1500 }); tone(1500, 0.3, { type: "triangle", vol: 0.12, to: 300, delay: 0.1 }); noise(0.25, { vol: 0.12, f: 900, delay: 0.08 }); },
    drop() { tone(260, 0.1, { type: "triangle", vol: 0.1, to: 180 }); },
    win() { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.28, { type: "triangle", vol: 0.16, delay: i * 0.12 })); },
    lose() { [392, 330, 262].forEach((f, i) => tone(f, 0.32, { type: "triangle", vol: 0.13, delay: i * 0.16 })); },
    turn() { tone(660, 0.1, { vol: 0.1 }); tone(990, 0.14, { vol: 0.1, delay: 0.09 }); },
  };
  const buzz = ms => attempt(() => navigator.vibrate && navigator.vibrate(ms || 12));

  // ---------- kreslení postaviček a kostek ----------
  function outline(c, lw) { c.lineWidth = lw; c.strokeStyle = INK; c.lineJoin = "round"; c.lineCap = "round"; c.stroke(); }
  function circle(c, x, y, r) { c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); }
  function rrect(c, x, y, w, h, r) { c.beginPath(); c.roundRect ? c.roundRect(x, y, w, h, r) : c.rect(x, y, w, h); }

  // postavička: t = "x" křeček, "o" sovička; look = směr pohledu (-1..1); hurt 0..1; ko = šedá
  function drawCritter(c, team, lw, hurt = 0, look = 0, ko = false) {
    const T = TEAM[team], r = CR;
    const col = ko ? "#C9C2CE" : T.c, belly = ko ? "#E6E1EA" : T.belly;
    if (team === "x") {
      for (const s of [-1, 1]) { circle(c, s * 11, -14, 7.5); c.fillStyle = col; c.fill(); outline(c, lw); circle(c, s * 11, -14, 3.6); c.fillStyle = ko ? "#ddd" : "#FF9DB0"; c.fill(); }
      circle(c, 0, 0, r); c.fillStyle = col; c.fill(); outline(c, lw);
      c.beginPath(); c.ellipse(0, 7, 12, 10, 0, 0, Math.PI * 2); c.fillStyle = belly; c.fill();
    } else {
      for (const s of [-1, 1]) { c.beginPath(); c.moveTo(s * 6, -16); c.lineTo(s * 15, -25); c.lineTo(s * 16, -10); c.closePath(); c.fillStyle = col; c.fill(); outline(c, lw); }
      circle(c, 0, 0, r); c.fillStyle = col; c.fill(); outline(c, lw);
      c.beginPath(); c.ellipse(0, 8, 11, 9, 0, 0, Math.PI * 2); c.fillStyle = belly; c.fill();
      c.strokeStyle = ko ? "#aaa" : T.d; c.lineWidth = 1.4;
      for (const [x, y] of [[-4, 6], [4, 6], [0, 11]]) { c.beginPath(); c.moveTo(x - 2.5, y - 1); c.lineTo(x, y + 1.5); c.lineTo(x + 2.5, y - 1); c.stroke(); }
    }
    const er = team === "o" ? 6 : 4.6, ex = team === "o" ? 7.2 : 6.5, ey = -4;
    if (ko) {
      c.strokeStyle = INK; c.lineWidth = 1.8;
      for (const s of [-1, 1]) { c.beginPath(); c.moveTo(s * ex - 3, ey - 3); c.lineTo(s * ex + 3, ey + 3); c.moveTo(s * ex + 3, ey - 3); c.lineTo(s * ex - 3, ey + 3); c.stroke(); }
    } else {
      for (const s of [-1, 1]) {
        circle(c, s * ex, ey, er); c.fillStyle = "#fff"; c.fill(); outline(c, lw * 0.6);
        circle(c, s * ex + look * er * 0.4, ey + 0.6, er * 0.5); c.fillStyle = INK; c.fill();
        circle(c, s * ex + look * er * 0.4 + 1, ey - 0.8, er * 0.17); c.fillStyle = "#fff"; c.fill();
      }
      if (hurt > 0.15) { c.strokeStyle = INK; c.lineWidth = 1.8; for (const s of [-1, 1]) { c.beginPath(); c.moveTo(s * (ex + er), ey - er - 2); c.lineTo(s * (ex - er + 1), ey - er - 4 + hurt * 3); c.stroke(); } }
    }
    if (team === "o") { c.beginPath(); c.moveTo(-3, 1); c.lineTo(3, 1); c.lineTo(0, 6); c.closePath(); c.fillStyle = ko ? "#bbb" : "#FFB020"; c.fill(); outline(c, lw * 0.5); }
    else {
      if (!ko) { c.fillStyle = "rgba(255,90,120,.45)"; for (const s of [-1, 1]) { c.beginPath(); c.ellipse(s * 12, 3, 3.6, 2.4, 0, 0, Math.PI * 2); c.fill(); } }
      c.strokeStyle = INK; c.lineWidth = 1.5; c.beginPath(); c.moveTo(-3, 3); c.quadraticCurveTo(-1.5, 5, 0, 3); c.quadraticCurveTo(1.5, 5, 3, 3); c.stroke();
    }
  }
  function drawHog(c, team, lw) {
    const R = HOG_R;
    c.beginPath();
    for (let i = 0; i < 28; i++) {
      const a = i / 28 * Math.PI * 2, rr = i % 2 ? R + 1 : R + 7.5;
      c.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    c.closePath(); c.fillStyle = "#6B4226"; c.fill(); outline(c, lw);
    circle(c, 0, 0, R - 1); c.fillStyle = "#8A5A3B"; c.fill();
    circle(c, 6, 4, 9.5); c.fillStyle = "#FFE3BE"; c.fill(); outline(c, lw * 0.6);
    circle(c, 14, 6, 2.6); c.fillStyle = INK; c.fill();
    c.strokeStyle = INK; c.lineWidth = 1.6; c.beginPath(); c.arc(7, 1, 2.6, Math.PI * 1.1, Math.PI * 1.9); c.stroke();
    c.beginPath(); c.arc(-4, 2, R - 3, Math.PI * 0.55, Math.PI * 0.95); c.strokeStyle = TEAM[team].c; c.lineWidth = 5; c.stroke();
  }
  const MATCOL = { w: ["#E9A55A", "#C77F35"], s: ["#A8B3C4", "#7D889A"], g: ["rgba(189,239,255,.62)", "rgba(120,200,230,.9)"] };
  function drawBlock(c, k, lw, dmg = 0, seed = 1) {
    const K = KIND[k], w = K.w, h = K.h, [fill, dark] = MATCOL[K.m];
    rrect(c, -w / 2, -h / 2, w, h, K.m === "s" ? 5 : 3); c.fillStyle = fill; c.fill();
    c.save(); c.clip();
    if (K.m === "w") {
      c.strokeStyle = dark; c.lineWidth = 1.6;
      const long = w > h, L = long ? w : h, S = long ? h : w;
      for (let i = 1; i <= 2; i++) { const o = -S / 2 + S * i / 3; c.beginPath(); if (long) { c.moveTo(-L / 2 + 6, o); c.bezierCurveTo(-L / 6, o + 2, L / 6, o - 2, L / 2 - 6, o); } else { c.moveTo(o, -L / 2 + 6); c.bezierCurveTo(o + 2, -L / 6, o - 2, L / 6, o, L / 2 - 6); } c.stroke(); }
      c.fillStyle = "rgba(255,255,255,.25)"; c.fillRect(-w / 2, -h / 2, w, Math.min(5, h * 0.25));
    } else if (K.m === "s") {
      c.fillStyle = "rgba(255,255,255,.35)"; c.fillRect(-w / 2, -h / 2, w, 6);
      c.fillStyle = dark; for (let i = 0; i < 5; i++) { const px = ((seed * 37 + i * 53) % 100) / 100 - 0.5, py = ((seed * 61 + i * 29) % 100) / 100 - 0.5; circle(c, px * w * 0.8, py * h * 0.8, 1.8); c.fill(); }
    } else {
      c.strokeStyle = "rgba(255,255,255,.9)"; c.lineWidth = 3; c.beginPath(); const m = Math.min(w, h);
      c.moveTo(-w / 2 + m * 0.3, h / 2); c.lineTo(w / 2, -h / 2 + m * 0.3); c.stroke();
    }
    if (dmg > 0.3) {
      c.strokeStyle = INK; c.lineWidth = 1.4; c.beginPath();
      let x = ((seed * 13) % 10 - 5) * w / 14, y = -h / 2;
      c.moveTo(x, y);
      for (let i = 0; i < 4; i++) { x += ((seed * (i + 3)) % 7 - 3) * 2.2; y += h / 4; c.lineTo(x, y); }
      if (dmg > 0.62) { c.moveTo(-w / 2, ((seed * 7) % 5 - 2) * h / 10); c.lineTo(-w / 6, h / 10); c.lineTo(w / 8, -h / 12); }
      c.stroke();
    }
    c.restore();
    rrect(c, -w / 2, -h / 2, w, h, K.m === "s" ? 5 : 3); outline(c, lw);
  }

  // ---------- plátno a kamera ----------
  const cv = $("stage"), ctx = cv.getContext("2d");
  let cw = 0, ch = 0, dpr = 1;
  function resize() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    cw = innerWidth; ch = innerHeight;
    cv.width = Math.round(cw * dpr); cv.height = Math.round(ch * dpr);
    cam.snap = true;
  }
  const cam = { x: W / 2, s: 0.5, snap: true, hold: 0, holdX: W / 2 };
  const portrait = () => ch > cw * 1.1;
  const overview = () => portrait() ? cw / 1290 : Math.min(cw / 1440, (ch - 80) / 640);
  // y světa GY+70 leží na této výšce obrazovky
  const anchorY = () => portrait() ? Math.min(ch - 70, ch * 0.5 + overview() * 520) : ch;
  const toScreen = (x, y) => [cw / 2 + (x - cam.x) * cam.s, anchorY() + (y - GY - 70) * cam.s];
  const toWorld = (sx, sy) => [cam.x + (sx - cw / 2) / cam.s, GY + 70 + (sy - anchorY()) / cam.s];
  function camGoal() {
    const ov = overview();
    let s = ov, x = W / 2;
    const h = currentHog();
    const zoomS = Math.max(ov, Math.min(cw / 900, (ch - 60) / 560));
    if (h) { s = zoomS; x = h.x; cam.holdX = h.x; cam.hold = 50; }
    else if (cam.hold > 0) { s = zoomS; x = cam.holdX; }
    else if (building()) { s = Math.max(ov, Math.min(cw / 760, (ch - 200) / 520)); x = (ZONE[me][0] + ZONE[me][1]) / 2; }
    const half = cw / (2 * s);
    x = half * 2 >= W + 160 ? W / 2 : clamp(x, -80 + half, W + 80 - half);
    return { x, s };
  }

  // ---------- pozadí s paralaxou ----------
  const clouds = Array.from({ length: 7 }, (_, i) => ({ x: i * 330 - 300, y: 120 + (i * 97) % 260, k: 0.7 + (i * 37 % 10) / 20 }));
  let drift = 0;
  function bg(t) {
    const s = cam.s, [, gyS] = toScreen(0, GY);
    const sky = ctx.createLinearGradient(0, 0, 0, gyS);
    sky.addColorStop(0, "#5CC8EE"); sky.addColorStop(0.6, "#A9E6F4"); sky.addColorStop(1, "#FFF1C4");
    ctx.fillStyle = sky; ctx.fillRect(0, 0, cw, ch);
    // slunce
    const sunX = cw * 0.16 - cam.x * s * 0.03, sunY = Math.max(70, gyS - 560 * s);
    ctx.fillStyle = "rgba(255,226,122,.35)"; circle(ctx, sunX, sunY, 70 * Math.max(s, 0.45)); ctx.fill();
    ctx.fillStyle = "#FFE27A"; circle(ctx, sunX, sunY, 44 * Math.max(s, 0.45)); ctx.fill(); outline(ctx, 3);
    // mraky
    if (!calm()) drift += 0.12;
    for (const c of clouds) {
      const span = (W + 900);
      const wx = ((c.x + drift * c.k) % span + span) % span - 450;
      const sx = cw / 2 + (wx - cam.x * 0.25 - W * 0.375) * s * 0.9, sy = gyS - (520 + c.y) * s;
      const r = 34 * s * c.k + 10;
      ctx.beginPath();
      ctx.arc(sx, sy, r, Math.PI * 0.5, Math.PI * 1.5); ctx.arc(sx + r * 0.9, sy - r * 0.55, r * 0.9, Math.PI, Math.PI * 1.85);
      ctx.arc(sx + r * 1.9, sy - r * 0.2, r * 0.8, Math.PI * 1.3, Math.PI * 0.1); ctx.arc(sx + r * 2.1, sy + r * 0.3, r * 0.7, Math.PI * 1.7, Math.PI * 0.5);
      ctx.closePath(); ctx.fillStyle = "#fff"; ctx.fill(); outline(ctx, 2.5);
    }
    // vzdálené kopce (0.35) a keře (0.65)
    layer(0.35, "#8FD3C0", "#79C3AF", X => 130 + 45 * Math.sin(X / 190) + 30 * Math.sin(X / 83 + 1.3), 40);
    layer(0.62, "#58B86C", "#4AA35D", X => 70 + 28 * Math.sin(X / 120 + 0.5) + 18 * Math.abs(Math.sin(X / 47)), 18);
  }
  function layer(f, col, col2, hgt, base) {
    const s = cam.s, gyS = toScreen(0, GY)[1];
    const sx0 = 0, step = 8;
    ctx.beginPath(); ctx.moveTo(-10, ch + 10);
    for (let sx = sx0 - 10; sx <= cw + 10; sx += step) {
      const X = cam.x * f + (sx - cw / 2) / s;
      ctx.lineTo(sx, gyS - (hgt(X) + base) * s);
    }
    ctx.lineTo(cw + 10, ch + 10); ctx.closePath();
    const gr = ctx.createLinearGradient(0, gyS - 200 * s, 0, gyS); gr.addColorStop(0, col); gr.addColorStop(1, col2);
    ctx.fillStyle = gr; ctx.fill(); outline(ctx, Math.max(1.6, 2.6 * s));
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
    ctx.fillStyle = "#B5763E"; for (let x = Math.floor(left / 90) * 90; x < right; x += 90) { circle(ctx, x + 30, GY + 52 + (x % 7) * 6, 7); ctx.fill(); circle(ctx, x + 70, GY + 110 + (x % 5) * 8, 5); ctx.fill(); }
    ctx.fillStyle = "#6CCB3A"; ctx.fillRect(left, GY - 2, right - left, 22);
    ctx.beginPath(); ctx.moveTo(left, GY + 20); ctx.lineTo(right, GY + 20); ctx.strokeStyle = "#4E9E2A"; ctx.lineWidth = 3; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(left, GY); ctx.lineTo(HILL.x - Math.sqrt(HILL.r ** 2 - (GY - HILL.y) ** 2), GY);
    ctx.moveTo(HILL.x + Math.sqrt(HILL.r ** 2 - (GY - HILL.y) ** 2), GY); ctx.lineTo(right, GY); outline(ctx, lw);
    ctx.strokeStyle = "#4E9E2A"; ctx.lineWidth = 2.4;
    for (let x = Math.floor(left / 46) * 46; x < right; x += 46) { const y = groundAt(x + 10); ctx.beginPath(); ctx.moveTo(x + 4, y + 1); ctx.lineTo(x + 8, y - 9); ctx.lineTo(x + 12, y + 1); ctx.lineTo(x + 17, y - 6); ctx.stroke(); }
    // podstavce
    for (const t of ["x", "o"]) { const [a, b] = PLINTHS[t]; rrect(ctx, a, GY - 30, b - a, 32, 5); ctx.fillStyle = "#8E98AA"; ctx.fill(); outline(ctx, lw); ctx.fillStyle = "rgba(255,255,255,.25)"; ctx.fillRect(a + 4, GY - 27, b - a - 8, 5); }
    // praky (zadní guma)
    for (const t of ["x", "o"]) drawSling(t, lw, scene, 0);
    // tělesa
    for (const b of scene.bodies) {
      ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(b.a);
      if (b.k === "C") {
        const look = b.t === "x" ? 1 : -1;
        drawCritter(ctx, b.t, lw, b.max ? clamp(1 - b.hp / b.max, 0, 1) : 0, look);
      } else drawBlock(ctx, b.k, lw, b.max ? 1 - b.hp / b.max : 0, b.id);
      ctx.restore();
    }
    if (scene.ghost) {
      const g = scene.ghost; ctx.save(); ctx.globalAlpha = 0.55 + 0.2 * Math.sin(performance.now() / 200);
      ctx.translate(g.x, g.y); if (g.rot) ctx.rotate(Math.PI / 2); drawBlock(ctx, g.k, lw, 0, 3); ctx.restore();
      ctx.save(); ctx.setLineDash([10, 8]); ctx.strokeStyle = "rgba(43,22,56,.5)"; ctx.lineWidth = lw * 0.7;
      ctx.beginPath(); ctx.moveTo(g.x, g.y + 30); ctx.lineTo(g.x, GY - 34); ctx.stroke(); ctx.restore();
      const [z0, z1] = ZONE[me]; ctx.fillStyle = "rgba(198,244,50,.22)"; ctx.fillRect(z0, 80, z1 - z0, GY - 110);
    }
    // náhled dráhy
    if (scene.dots) {
      scene.dots.forEach((p, i) => { circle(ctx, p[0], p[1], Math.max(2.2, 6 - i * 0.12) ); ctx.fillStyle = `rgba(255,255,255,${1 - i / scene.dots.length * 0.75})`; ctx.fill(); ctx.lineWidth = lw * 0.5; ctx.strokeStyle = "rgba(43,22,56,.6)"; ctx.stroke(); });
    }
    if (scene.hog) { const h = scene.hog; ctx.save(); ctx.translate(h.x, h.y); ctx.rotate(h.a); drawHog(ctx, h.team, lw); ctx.restore(); }
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
    const pouch = pulled ? [pulled.x, pulled.y] : [s.x, s.y + 4];
    const band = tip => { ctx.beginPath(); ctx.moveTo(tip[0], tip[1]); ctx.lineTo(pouch[0], pouch[1]); ctx.strokeStyle = "#5A2A3A"; ctx.lineWidth = 6; ctx.lineCap = "round"; ctx.stroke(); };
    if (!front) {
      band(dir > 0 ? tipA : tipB);
      return;
    }
    ctx.beginPath(); ctx.moveTo(s.x - 6, gy + 6); ctx.lineTo(s.x - 6, s.y + 34); ctx.lineTo(tipA[0] - 5, tipA[1]); ctx.lineTo(tipA[0] + 5, tipA[1] - 2);
    ctx.lineTo(s.x, s.y + 24); ctx.lineTo(tipB[0] - 5, tipB[1] - 2); ctx.lineTo(tipB[0] + 5, tipB[1]); ctx.lineTo(s.x + 6, s.y + 34); ctx.lineTo(s.x + 6, gy + 6); ctx.closePath();
    ctx.fillStyle = "#B8763F"; ctx.fill(); outline(ctx, lw);
    if (pulled) { ctx.save(); ctx.translate(pulled.x, pulled.y); ctx.rotate(pulled.a); drawHog(ctx, t, lw); ctx.restore(); }
    else if (scene.loaded === t) { ctx.save(); ctx.translate(s.x, s.y); drawHog(ctx, t, lw); ctx.restore(); }
    band(dir > 0 ? tipB : tipA);
    rrect(ctx, pouch[0] - 9, pouch[1] - 5, 18, 10, 4); ctx.fillStyle = "#5A2A3A"; ctx.fill();
  }

  // ---------- částice a třesení ----------
  let parts = [], shake = 0;
  const PCOL = { w: ["#E9A55A", "#C77F35", "#F6C88A"], s: ["#A8B3C4", "#7D889A", "#D5DCE6"], g: ["#E6FBFF", "#BDEFFF", "#ffffff"], c: ["#fff", "#FFE27A"], z: ["#C98A4B", "#6CCB3A"], h: ["#8A5A3B", "#6B4226"] };
  function burst(x, y, m, n, power = 1) {
    if (calm()) n = Math.ceil(n / 3);
    const cols = PCOL[m] || PCOL.z;
    for (let i = 0; i < n && parts.length < 260; i++) {
      const a = Math.random() * Math.PI * 2, v = (1.5 + Math.random() * 4.5) * power;
      parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 2.5 * power, life: 0, max: 35 + Math.random() * 30, k: m === "g" ? "shard" : m === "s" || m === "z" ? "dust" : "chip", c: cols[i % cols.length], sz: 3 + Math.random() * 6, r: Math.random() * 6, vr: (Math.random() - 0.5) * 0.4 });
    }
  }
  function koFx(x, y, team) {
    burst(x, y, "c", 10, 1.2);
    for (let i = 0; i < (calm() ? 2 : 5); i++) parts.push({ x, y: y - 10, vx: (i - 2) * 1.4, vy: -4 - Math.random() * 2, life: 0, max: 60, k: "star", c: "#FFE27A", sz: 9, r: 0, vr: 0.1 });
    const words = ["Au!", "Jau!", "Ouha!", "Fuj!", "Ajaj!"];
    parts.push({ x, y: y - 30, vx: 0, vy: -1.1, life: 0, max: 80, k: "text", c: TEAM[team].c, text: words[(x | 0) % words.length], sz: 34, r: 0, vr: 0 });
    puff.push({ x, y, team, life: 0 });
  }
  let puff = [];   // vyřazené postavičky, které ještě chvíli odletují
  function drawParticles(lw) {
    for (const p of puff) {
      ctx.save(); ctx.globalAlpha = Math.max(0, 1 - p.life / 50); ctx.translate(p.x, p.y - p.life * 2.2); ctx.rotate(p.life * 0.15); ctx.scale(1 + p.life / 80, 1 + p.life / 80);
      drawCritter(ctx, p.team, lw, 1, 0, true); ctx.restore();
    }
    for (const p of parts) {
      const al = 1 - p.life / p.max;
      ctx.save(); ctx.globalAlpha = Math.max(0, al); ctx.translate(p.x, p.y); ctx.rotate(p.r);
      if (p.k === "chip") { ctx.fillStyle = p.c; ctx.fillRect(-p.sz / 2, -p.sz / 5, p.sz, p.sz / 2.5); ctx.strokeStyle = INK; ctx.lineWidth = lw * 0.4; ctx.strokeRect(-p.sz / 2, -p.sz / 5, p.sz, p.sz / 2.5); }
      else if (p.k === "dust") { circle(ctx, 0, 0, p.sz * (0.6 + p.life / p.max)); ctx.fillStyle = p.c; ctx.fill(); }
      else if (p.k === "shard") { ctx.beginPath(); ctx.moveTo(0, -p.sz); ctx.lineTo(p.sz * 0.6, p.sz * 0.5); ctx.lineTo(-p.sz * 0.5, p.sz * 0.3); ctx.closePath(); ctx.fillStyle = p.c; ctx.fill(); ctx.strokeStyle = "rgba(43,22,56,.6)"; ctx.lineWidth = lw * 0.35; ctx.stroke(); }
      else if (p.k === "star") { ctx.beginPath(); for (let i = 0; i < 10; i++) { const a = i * Math.PI / 5, r = i % 2 ? p.sz * 0.45 : p.sz; ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); } ctx.closePath(); ctx.fillStyle = p.c; ctx.fill(); outline(ctx, lw * 0.5); }
      else if (p.k === "text") { ctx.rotate(-p.r); ctx.font = `${p.sz}px "Titan One", sans-serif`; ctx.textAlign = "center"; ctx.lineWidth = 7; ctx.strokeStyle = INK; ctx.strokeText(p.text, 0, 0); ctx.fillStyle = p.c; ctx.fillText(p.text, 0, 0); }
      ctx.restore();
    }
  }
  function stepParticles() {
    for (const p of parts) { p.life++; if (p.k !== "text") { p.vy += 0.25; p.vx *= 0.98; } p.x += p.vx; p.y += p.vy; p.r += p.vr; if (p.k !== "text" && p.y > GY - 2 && p.k !== "dust") { p.y = GY - 2; p.vy *= -0.3; p.vx *= 0.7; } }
    parts = parts.filter(p => p.life < p.max);
    for (const p of puff) p.life++;
    puff = puff.filter(p => p.life < 50);
    shake *= 0.86; if (shake < 0.3) shake = 0;
  }
  // událost ze simulace nebo záznamu
  function fx(e, quiet) {
    if (e.type === "h") {
      burst(e.x, e.y, e.m, 3 + e.s * 4, 0.6 + e.s * 0.3);
      if (!quiet) sfx.hit(e.m, e.s);
      if (e.s >= 2 && !calm()) shake = Math.max(shake, 4 + e.s * 3);
    } else if (e.type === "b") {
      const m = e.m || "w";
      burst(e.x, e.y, m, 14, 1.2); if (!quiet) sfx.hit(m, 3);
      if (!calm()) shake = Math.max(shake, 7);
    } else if (e.type === "k") {
      koFx(e.x, e.y, e.m === "o" ? "o" : "x"); if (!quiet) sfx.ko(); buzz(30);
      if (!calm()) shake = Math.max(shake, 9);
    } else if (e.type === "n") { if (!quiet) sfx.drop(); }
  }

  // ---------- stav ----------
  let st = null;            // partie (b = tělesa jako objekty)
  let room = null, me = null, view = "setup", busy = false, net = "", bootSeq = 0, starter = "o", shareKind = "new";
  let acting = null;        // { sim, kind, base, … } – moje probíhající simulace
  let replay = null;        // { acts, i, rp, t, final } – přehrávání soupeřova tahu
  let pendingDoc = null;    // dokument, který přišel během přehrávání
  let aim = null;           // { x0, y0, dx, dy, kb } – napínání praku
  let ghost = null;         // { k, x, rot } – kostka ve fázi stavby
  let kbAim = null;

  const nameOf = (g, p) => p === "x" ? g.x : g.o;
  const ended = () => !!st && st.ph === "end";
  const myTurn = () => !!st && !!me && st.p === me && !ended();
  const canAim = () => myTurn() && st.ph === "aim" && !acting && !replay && !busy && view === "play";
  const building = () => myTurn() && st.ph === "build" && !acting && !replay && view === "play" && !!ghost;
  const freeSeat = () => !room ? null : !room.sx ? "x" : !room.so ? "o" : null;
  const say = t => { $("say").textContent = ""; requestAnimationFrame(() => $("say").textContent = t); };

  function currentHog() {
    if (acting) { const h = acting.sim.hogView(); return h && { ...h, team: acting.team }; }
    if (replay && replay.rp) { const h = replay.rp.hogView(replay.t); return h && { ...h, team: replay.acts[replay.i].by }; }
    return null;
  }
  function scene() {
    let bodies, hog = currentHog();
    if (acting) bodies = acting.sim.view();
    else if (replay && replay.rp) bodies = replay.rp.view(replay.t);
    else bodies = st ? st.b.map(b => ({ ...b, max: b.k === "C" ? JP.CRITTER_HP : JP.MAT[KIND[b.k].m].hp })) : JP.initialBodies();
    const sc = { bodies, hog };
    if (aim && canAim()) {
      const { ang, pow } = aimParams(aim.dx, aim.dy);
      const s = SLING[me], pullW = pow * 70;
      sc.pull = { team: me, x: s.x - Math.cos(ang) * pullW, y: s.y - Math.sin(ang) * pullW, a: ang };
      if (pow > 0.08) sc.dots = JP.preview(me, ang, pow, 22, 3);
    } else if (canAim()) sc.loaded = me;
    if (building()) {
      const K = KIND[ghost.k], w = ghost.rot ? K.h : K.w, h = ghost.rot ? K.w : K.h, [z0, z1] = ZONE[me];
      ghost.x = clamp(ghost.x, z0 + w / 2, z1 - w / 2);
      let top = JP.PY;
      for (const b of bodies) { const d = JP.dims(b.k), r = Math.max(d.w, d.h) / 2 + 2; if (Math.abs(b.x - ghost.x) < w / 2 + r) top = Math.min(top, b.y - r); }
      sc.ghost = { k: ghost.k, x: ghost.x, y: Math.max(80, top - h / 2 - 14), rot: ghost.rot };
    }
    return sc;
  }

  // ---------- smyčka ----------
  let last = performance.now(), accT = 0;
  const speed = () => TEST && window.JPT ? window.JPT.speed : 1;
  function frame(now) {
    const dt = Math.min(100, now - last); last = now;
    accT += dt * speed();
    let n = 0;
    while (accT >= 1000 / 60 && n < 12) {
      accT -= 1000 / 60; n++;
      tick();
    }
    if (n >= 12) accT = 0;
    draw();
    requestAnimationFrame(frame);
  }
  function tick() {
    if (acting && !acting.finished) {
      acting.sim.step();
      if (acting.sim.done) { acting.finished = true; finishAct(); }
    }
    if (replay) stepReplay();
    stepParticles();
    if (cam.hold > 0 && !currentHog()) cam.hold--;
  }
  function draw() {
    const g = camGoal();
    if (cam.snap || calm()) { cam.x = g.x; cam.s = g.s; cam.snap = false; }
    else { cam.x += (g.x - cam.x) * 0.09; cam.s += (g.s - cam.s) * 0.08; }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const sx = shake ? (Math.random() - 0.5) * shake : 0, sy = shake ? (Math.random() - 0.5) * shake : 0;
    ctx.translate(sx, sy);
    bg();
    const [ox, oy] = toScreen(0, 0);
    ctx.setTransform(dpr * cam.s, 0, 0, dpr * cam.s, dpr * (ox + sx), dpr * (oy + sy));
    drawWorld(scene());
  }

  // ---------- míření ----------
  const maxPull = () => clamp(Math.min(cw, ch) * 0.34, 90, 210);
  function aimParams(dx, dy) {
    const d = Math.hypot(dx, dy);
    if (!d) return { ang: me === "o" ? -Math.PI * 0.75 : -Math.PI / 4, pow: 0 };
    return { ang: Math.round(Math.atan2(-dy, -dx) * 1000) / 1000, pow: Math.round(Math.min(1, d / maxPull()) * 1000) / 1000 };
  }
  const pt = e => { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  cv.addEventListener("pointerdown", e => {
    if (canAim()) {
      const [x, y] = pt(e);
      aim = { x0: x, y0: y, dx: 0, dy: 0 };
      attempt(() => cv.setPointerCapture(e.pointerId));
      render();
    } else if (building()) {
      const [x] = pt(e); ghost.x = toWorld(x, 0)[0]; ghost.drag = true;
      attempt(() => cv.setPointerCapture(e.pointerId));
    }
  });
  cv.addEventListener("pointermove", e => {
    if (aim) {
      const [x, y] = pt(e); aim.dx = x - aim.x0; aim.dy = y - aim.y0;
      const { pow } = aimParams(aim.dx, aim.dy);
      sfx.stretch(pow); showMeter();
    } else if (ghost && ghost.drag && building()) { const [x] = pt(e); ghost.x = toWorld(x, 0)[0]; }
  });
  const endAim = fire => {
    if (!aim) return;
    const a = aim; aim = null;
    const { ang, pow } = aimParams(a.dx, a.dy);
    if (fire && pow >= 0.1 && canAim()) shoot(ang, pow); else render();
  };
  cv.addEventListener("pointerup", () => { endAim(true); if (ghost) ghost.drag = false; });
  cv.addEventListener("pointercancel", () => { endAim(false); if (ghost) ghost.drag = false; });
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
    } else if (building()) {
      if (e.key === "ArrowLeft") { ghost.x -= 10; e.preventDefault(); }
      else if (e.key === "ArrowRight") { ghost.x += 10; e.preventDefault(); }
      else if (e.key === "r" || e.key === "R") rotate();
      else if (e.key === " " || e.key === "Enter") { e.preventDefault(); dropBlock(); }
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
  function shoot(ang, pow) {
    const base = st;
    const sim = JP.sim(base.b, { onEvent: e => fx(e) });
    sim.launch(me, ang, pow);
    sfx.launch(); buzz(20);
    acting = { sim, kind: "s", team: me, base, a: Math.round(ang * 1000), f: Math.round(pow * 1000) };
    $("meter").hidden = true;
    say("Výstřel!");
    render();
  }
  function dropBlock() {
    if (!building()) return;
    const base = st, g = ghost;
    const sim = JP.sim(base.b, { onEvent: e => fx(e) });
    sim.drop(me, g.k, g.x, g.rot);
    acting = { sim, kind: "b", team: me, base, kk: g.k, bx: Math.round(g.x), rot: g.rot ? 1 : 0 };
    ghost = null;
    render();
  }
  async function finishAct() {
    const A = acting, base = A.base, res = A.sim.result(A.kind === "s" ? 28000 : 8000);
    const next = { ...base, b: res.bodies, n: base.n + 1, t: Math.floor(Date.now() / 60000) };
    const act = { n: next.n, by: me, kind: A.kind, kf: res.kf, ev: res.ev, b0: JP.packBodies(base.b) };
    if (A.kind === "s") Object.assign(act, { a: A.a, f: A.f }); else Object.assign(act, { kk: A.kk, bx: A.bx, rot: A.rot });
    next.h = A.kind === "s" ? [act] : [...(base.h || []).filter(a => a.n === base.n && a.kind === "s"), act];
    const mine = JP.alive(res.bodies, me), theirs = JP.alive(res.bodies, other(me));
    if (theirs === 0) { next.ph = "end"; next.win = me; }
    else if (mine === 0) { next.ph = "end"; next.win = other(me); }
    else if (A.kind === "s") { next.ph = "build"; next.p = me; }
    else { next.ph = "aim"; next.p = other(me); }
    const ok = await commit(next, cur => cur.id === base.id && cur.n === base.n && cur.p === me && cur.ph === base.ph && !cur.r, "", base);
    acting = null;
    if (!ok) { render(); return; }
    setGame(next);
    afterChange(true);
  }
  function rotate() { if (ghost) { ghost.rot = !ghost.rot; renderKinds(); } }

  // ---------- přehrávání soupeřova tahu ----------
  function startReplay(acts, final) {
    replay = { acts, i: -1, rp: null, t: 0, final };
    nextReplay();
  }
  function nextReplay() {
    replay.i++;
    const a = replay.acts[replay.i];
    if (!a) { const f = replay.final; replay = null; setGame(f); afterChange(true); if (pendingDoc) { const d = pendingDoc; pendingDoc = null; apply(d, true); } return; }
    const b0 = JP.unpackBodies(a.b0) || st.b;
    replay.rp = JP.replay(b0, a.kf, a.ev);
    replay.t = 0; replay.evI = 0; replay.wait = a.kind === "s" ? 50 : 15;
    if (a.kind === "s") { sfx.launch(); say(`${nameOf(replay.final, a.by)} střílí.`); }
    render();
  }
  function stepReplay() {
    const r = replay;
    if (r.wait > 0) { r.wait--; return; }
    r.t++;
    const evs = r.rp.events;
    while (r.evI < evs.length && evs[r.evI].t <= r.t) fx(evs[r.evI++]);
    if (r.t > r.rp.end + 40) nextReplay();
  }

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
    if (!x || !o || !b || (g.s !== "x" && g.s !== "o") || (g.p !== "x" && g.p !== "o") || !["aim", "build", "end"].includes(g.ph)) return null;
    const w = Array.isArray(g.w) ? [0, 1].map(k => Math.max(0, Math.min(999, g.w[k] | 0))) : [0, 0];
    const k = /^[1-6c]$/.test(g.k || "") ? g.k : "", kc = str(g.kc, 40);
    const h = (Array.isArray(g.h) ? g.h : []).filter(a => a && Number.isFinite(a.n) && (a.by === "x" || a.by === "o") && (a.kind === "s" || a.kind === "b") && typeof a.kf === "string").slice(-2);
    return { id: str(g.id, 12) || "0", x, o, s: g.s, k: k === "c" && !kc ? "" : k, kc, w, r: g.r === "x" || g.r === "o" ? g.r : "",
      n: Math.max(0, g.n | 0), p: g.p, ph: g.ph, win: g.win === "x" || g.win === "o" ? g.win : "", b, h, t: Number.isFinite(g.t) ? g.t : null };
  }
  function freshGame(x, o, s, k, kc, w) {
    return { id: randId(6), x, o, s, k, kc, w, r: "", n: 0, p: s, ph: "aim", win: "", b: JP.initialBodies(), h: [], t: null };
  }
  const setGame = g => { st = g; };
  const sig = g => g ? [g.id, g.x, g.o, g.s, g.n, g.p, g.ph, g.w.join(":"), g.r, g.k, g.kc].join("|") : "";

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
    if (newGame) { parts = []; puff = []; cam.snap = true; }
    afterChange(newGame);
  }
  // po změně stavu: stavba, oznámení, konec
  function afterChange(fresh) {
    if (myTurn() && st.ph === "build" && !ghost) ghost = { k: store.get("jp-kind") || "sB", x: me === "x" ? 260 : W - 260, rot: false };
    if (!myTurn() || st.ph !== "build") ghost = null;
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
    const ms = idle < 5 * 60e3 ? 2500 : idle < 30 * 60e3 ? 10000 : 30000;
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
      const x = c.getContext("2d"); x.translate(32, 36); x.scale(1.3, 1.3); drawCritter(x, team, 2.6, 0, team === "x" ? 1 : -1, !alive);
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
    const w = st.w;
    $("score").innerHTML = `<b class="x">${w[0]}</b> : <b class="o">${w[1]}</b>`;
    $("score").setAttribute("aria-label", `Série ${st.x} ${w[0]}, ${st.o} ${w[1]}`);
    const turnP = ended() ? null : st.p;
    $("plateX").classList.toggle("turn", turnP === "x"); $("plateO").classList.toggle("turn", turnP === "o");
    // stav
    let s = "", waitStyle = true, pulse = false;
    const opp = me ? other(me) : null;
    if (net) s = net;
    else if (ended() && !replay) s = "";
    else if (acting) s = acting.kind === "s" ? "Letí!" : "Kostka padá…";
    else if (replay) { const a = replay.acts[replay.i]; s = a ? (a.kind === "s" ? `${nameOf(st, a.by)} střílí!` : `${nameOf(st, a.by)} staví…`) : ""; }
    else if (busy) s = "Odesílám…";
    else if (myTurn() && st.ph === "aim") { s = "Jsi na tahu: natáhni prak"; waitStyle = false; pulse = true; }
    else if (myTurn() && st.ph === "build") { s = "Přidej si kostku"; waitStyle = false; }
    else s = st.ph === "build" ? `${nameOf(st, st.p)} staví…` : `${nameOf(st, st.p)} míří…`;
    $("status").textContent = s; $("status").hidden = !s;
    $("status").classList.toggle("wait", waitStyle); $("status").classList.toggle("pulse", pulse && !calm());
    const waiting = !!me && !!freeSeat() && !ended();
    $("waitBox").hidden = !waiting || canAim() || building() || !!acting || !!aim;
    if (waiting) $("waitText").textContent = `${nameOf(st, opp)} ještě neotevřel(a) výzvu. Pošli odkaz do chatu.`;
    $("hint").hidden = !canAim() || !!aim || !$("waitBox").hidden;
    $("hint").textContent = "Táhni kdekoli dozadu a pusť. Tečky ukážou dráhu.";
    if (!aim) $("meter").hidden = true;
    $("buildBox").hidden = !building();
    if (building()) renderKinds();
    $("rotTip").hidden = !canAim();
    cv.className = canAim() ? (aim ? "aiming" : "aim") : building() ? "build" : "";
    // konec
    const showEnd = ended() && !replay && !acting;
    $("endBox").hidden = !showEnd;
    if (showEnd) renderEnd();
    document.title = canAim() ? "Jsi na tahu · Ježkomet" : building() ? "Stavíš · Ježkomet" : ended() && !replay ? "Konec partie · Ježkomet" : "Ježkomet";
  }
  const KIND_UI = { wP: ["Prkno", "dřevo"], sB: ["Kvádr", "kámen"], gP: ["Sloupek", "sklo"] };
  function renderKinds() {
    const box = $("kinds");
    if (!box.dataset.ready) {
      box.dataset.ready = "1";
      for (const k of JP.BUILD) {
        const b = document.createElement("button"); b.type = "button"; b.className = "btn kind"; b.dataset.k = k;
        const c = document.createElement("canvas"); c.width = 140; c.height = 60;
        const x = c.getContext("2d"); const K = KIND[k]; const sc = Math.min(1, 120 / Math.max(K.w, K.h), 48 / Math.min(K.w, K.h) );
        x.translate(70, 30); x.scale(sc * 0.9, sc * 0.9); if (K.h > K.w) x.rotate(Math.PI / 2); drawBlock(x, k, 3 / sc, 0, 2);
        b.append(c, document.createTextNode(KIND_UI[k][0]));
        const sm = document.createElement("small"); sm.textContent = KIND_UI[k][1]; b.append(sm);
        b.addEventListener("click", () => { if (ghost) { ghost.k = k; store.set("jp-kind", k); renderKinds(); } });
        box.appendChild(b);
      }
      const r = document.createElement("button"); r.type = "button"; r.className = "btn paper kind rot"; r.id = "rotBtn";
      r.innerHTML = `<svg class="i" viewBox="0 0 24 24" width="26" height="26" aria-hidden="true"><path d="M20 12a8 8 0 1 1-2.3-5.6"/><path d="M20 4v5h-5"/></svg>Otočit`;
      r.addEventListener("click", rotate);
      box.appendChild(r);
    }
    for (const b of box.querySelectorAll("[data-k]")) b.setAttribute("aria-pressed", String(!!ghost && ghost.k === b.dataset.k));
    $("rotBtn").setAttribute("aria-pressed", String(!!ghost && ghost.rot));
    $("dropBtn").disabled = busy;
  }
  $("dropBtn").addEventListener("click", dropBlock);

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
    else { $("endPrimary").textContent = "Chci odvetu"; $("endSecondary").textContent = "Uznat porážku (zkopíruje zprávu)"; }
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
      const x = c.getContext("2d"); x.translate(64, 70); x.scale(2.3, 2.3);
      hog ? drawHog(x, "x", 2.4) : drawCritter(x, t, 2.4, 0, t === "x" ? 1 : -1);
      el.appendChild(c);
    }
  }

  // ---------- hraní: odveta, vzdání ----------
  async function rematch() {
    if (busy || !me || !ended()) return;
    const loser = other(st.win);
    const next = freshGame(st.x, st.o, loser, st.k, st.kc, seriesAfter());
    if (!await commit(next, cur => cur.id === st.id && cur.ph === "end", "Odvetu už mezitím založil soupeř.")) return;
    setGame(next); parts = []; puff = []; cam.snap = true;
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
  function syncSound() { $("soundWave").toggleAttribute("hidden", muted); $("soundOff").toggleAttribute("hidden", !muted); $("soundBtn").setAttribute("aria-label", muted ? "Zapnout zvuk" : "Vypnout zvuk"); }
  $("soundBtn").addEventListener("click", () => { muted = !muted; store.set("jp-mute", muted ? "1" : "0"); syncSound(); });
  syncSound();

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
    room = null; me = null; st = null; busy = false; net = ""; acting = null; replay = null; ghost = null; aim = null;
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
    cam.snap = true;
    if (!me && freeSeat() && !ended()) { cast($("introCast")); setView("intro"); return; }
    setView("play"); afterChange(false);
  }
  function boot() {
    const seq = ++bootSeq;
    clearTimeout(pollT);
    room = null; me = null; busy = false; net = ""; fails = 0; acting = null; replay = null; ghost = null; aim = null;
    const h = (location.hash || "").replace(/^#/, "");
    const r = /^r\.([0-9a-z]{6,24})$/.exec(h);
    if (r) { openRoom(r[1], seq); return; }
    st = null; showSetup();
  }

  // ---------- testovací háček (jen s ?test) ----------
  if (TEST) {
    window.JPT = {
      speed: 1,
      info: () => st && { ph: st.ph, p: st.p, n: st.n, me, win: st.win, acting: !!acting, replay: !!replay, busy, alive: { x: JP.alive(st.b, "x"), o: JP.alive(st.b, "o") }, w: st.w, view },
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
          const s = JP.sim(st.b); s.launch(me, q.ang, q.pow); while (s.step());
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
