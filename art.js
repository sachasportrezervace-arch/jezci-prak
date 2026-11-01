// Ježkomet – kreslení jednotek, ježků a kostek (canvas, po vrstvách, žádné bitmapy).
// Světlo vlevo nahoře, stín vpravo dole, obrys v inkoustu. Stav postavičky (výraz) dostává funkce v objektu `o`;
// drží ho renderer, do synchronizovaného dokumentu nejde nic.
// Jednotky (v2): K král, C strážník, T tlusťoch, S štítonoš, R skokan, L léčitel. Všechny sdílejí obličej a výrazy
// křečka (tým x) a sovičky (tým o); tělo, uši, doplňky a měřítko se liší podle druhu.
(() => {
  "use strict";
  const INK = "#2B1638", TAU = Math.PI * 2;
  const TEAM = {
    x: { c: "#FF7A2F", d: "#D9541A", dd: "#A93A0E", hi: "#FFB68A", belly: "#FFE0B8", bellyD: "#F5BE86", pink: "#FF8FA8", name: "Křečci" },
    o: { c: "#9B6BFF", d: "#7346D9", dd: "#52289F", hi: "#CDB4FF", belly: "#EADFFF", bellyD: "#CDB6F5", beak: "#FFB020", beakD: "#E08A00", name: "Sovičky" },
  };
  const GOLD = "#FFC83D", GOLD_D = "#E8A21A", STEEL = "#B9C3D4", STEEL_D = "#8190A8", STEEL_L = "#E9EEF6", HEAL_G = "#2FBF71", ROYAL = "#D8344F";
  const circle = (c, x, y, r) => { c.beginPath(); c.arc(x, y, r, 0, TAU); };
  const ell = (c, x, y, rx, ry, rot = 0) => { c.beginPath(); c.ellipse(x, y, rx, ry, rot, 0, TAU); };
  const stroke = (c, lw, col = INK) => { c.lineWidth = lw; c.strokeStyle = col; c.lineJoin = "round"; c.lineCap = "round"; c.stroke(); };
  const fillStroke = (c, fill, lw) => { c.fillStyle = fill; c.fill(); stroke(c, lw); };
  const rrect = (c, x, y, w, h, r) => { c.beginPath(); c.roundRect ? c.roundRect(x, y, w, h, r) : c.rect(x, y, w, h); };
  const rng = seed => { let s = (seed * 2654435761 + 12345) >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; };

  // ---------- pomocné kousky obličeje ----------
  function star(c, x, y, r, col, lw) {
    c.beginPath();
    for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.45 : r; c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
    c.closePath(); fillStroke(c, col, lw);
  }
  function spiral(c, x, y, r, lw) {
    c.beginPath();
    for (let i = 0; i <= 28; i++) { const a = i * 0.5, rr = r * i / 28; c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
    stroke(c, lw);
  }
  function sweat(c, x, y, s, lw) {
    c.beginPath(); c.moveTo(x, y - 5 * s); c.quadraticCurveTo(x + 4 * s, y + 1 * s, x, y + 4 * s); c.quadraticCurveTo(x - 4 * s, y + 1 * s, x, y - 5 * s);
    fillStroke(c, "#BDEFFF", lw * 0.5);
    c.fillStyle = "rgba(255,255,255,.85)"; circle(c, x - 1, y + 1, 1); c.fill();
  }
  function plaster(c, x, y, rot, lw) {
    c.save(); c.translate(x, y); c.rotate(rot);
    rrect(c, -6.5, -2.8, 13, 5.6, 2.2); fillStroke(c, "#F6D3A2", lw * 0.55);
    c.fillStyle = "#E3B47A"; rrect(c, -2, -2.8, 4, 5.6, 0); c.fill();
    c.fillStyle = "rgba(43,22,56,.35)"; for (const dx of [-4.2, 4.2]) for (const dy of [-1, 1]) { circle(c, dx, dy, 0.55); c.fill(); }
    c.restore();
  }
  // oko: styl open | happy | squeeze | half | dizzy | x ; s = poloměr, lid = zavření víčka 0..1
  function beadEye(c, x, y, s, style, side, look, lid, lw) {
    if (style === "happy") { c.beginPath(); c.arc(x, y + 1.8, s * 0.95, Math.PI * 1.12, Math.PI * 1.88); stroke(c, 2.3); return; }
    if (style === "squeeze") { const q = side; c.beginPath(); c.moveTo(x - q * 3.4, y - 3.2); c.lineTo(x + q * 2.4, y); c.lineTo(x - q * 3.4, y + 3.2); stroke(c, 2.3); return; }
    if (style === "x") { c.beginPath(); c.moveTo(x - 3, y - 3); c.lineTo(x + 3, y + 3); c.moveTo(x + 3, y - 3); c.lineTo(x - 3, y + 3); stroke(c, 2.2); return; }
    if (style === "dizzy") { spiral(c, x, y, s * 1.05, 1.7); return; }
    if (style === "half") {
      c.beginPath(); c.arc(x, y, s, 0, Math.PI); c.closePath(); c.fillStyle = INK; c.fill();
      c.beginPath(); c.moveTo(x - s, y); c.lineTo(x + s, y); stroke(c, 2.1);
      c.fillStyle = "#fff"; circle(c, x - s * 0.3, y + s * 0.45, s * 0.22); c.fill(); return;
    }
    const ry = Math.max(0.5, s * (1 - lid));
    ell(c, x, y, s, ry); c.fillStyle = INK; c.fill();
    if (lid < 0.5) {
      c.fillStyle = "#fff"; circle(c, x - s * 0.32 + look[0] * 0.5, y - s * 0.34 + look[1] * 0.5, s * 0.34); c.fill();
      circle(c, x + s * 0.34 + look[0] * 0.3, y + s * 0.3, s * 0.15); c.fill();
    }
  }

  // ---------- koruna (samostatně, i pro ikonu krále v HUD) ----------
  // x, y = střed spodní hrany koruny, s = měřítko (šířka ≈ 16·s, výška ≈ 14·s), lw = tloušťka obrysu ve výstupních jednotkách
  function crown(c, x, y, s = 1, lw = 2.2, ko = false) {
    c.save(); c.translate(x, y); c.scale(s, s);
    const l = lw / s, g1 = ko ? "#E3D9A8" : GOLD, g2 = ko ? "#C9BC84" : GOLD_D;
    c.beginPath();
    c.moveTo(-8, 0); c.lineTo(-9, -11.5); c.lineTo(-4.2, -6.4); c.lineTo(0, -14.2); c.lineTo(4.2, -6.4); c.lineTo(9, -11.5); c.lineTo(8, 0); c.closePath();
    c.fillStyle = g1; c.fill();
    c.save(); c.clip();
    c.fillStyle = g2; c.fillRect(-10, -4.6, 20, 5);                       // spodní obruč
    c.fillStyle = "rgba(43,22,56,.16)"; c.beginPath(); c.moveTo(0, -14.2); c.lineTo(4.2, -6.4); c.lineTo(9, -11.5); c.lineTo(9, 0); c.lineTo(2.6, 0); c.closePath(); c.fill();   // stín vpravo
    c.fillStyle = "rgba(255,255,255,.55)"; c.beginPath(); c.moveTo(-7.4, -1); c.lineTo(-8.2, -10); c.lineTo(-6.4, -8.4); c.lineTo(-6, -1); c.closePath(); c.fill();   // odlesk vlevo
    c.restore();
    c.beginPath(); c.moveTo(-8.2, -4.6); c.lineTo(8.2, -4.6); stroke(c, l * 0.55);
    c.beginPath(); c.moveTo(-8, 0); c.lineTo(-9, -11.5); c.lineTo(-4.2, -6.4); c.lineTo(0, -14.2); c.lineTo(4.2, -6.4); c.lineTo(9, -11.5); c.lineTo(8, 0); c.closePath(); stroke(c, l);
    for (const [px, py] of [[-9, -11.5], [0, -14.2], [9, -11.5]]) { circle(c, px, py - 0.4, 1.9); c.fillStyle = ko ? "#F0E9D0" : "#FFF8EA"; c.fill(); stroke(c, l * 0.6); }
    ell(c, 0, -2.3, 1.9, 1.5); c.fillStyle = ko ? "#C99AA6" : ROYAL; c.fill(); stroke(c, l * 0.5);
    for (const sx of [-5.4, 5.4]) { circle(c, sx, -2.3, 0.9); c.fillStyle = ko ? "#CFC7D6" : "#6FD0FF"; c.fill(); }
    c.restore();
  }

  // ---------- stav postavičky (výrazy) ----------
  // o: { hurt, lookX, lookY, blink, fear, hit, cheer, sad, startle, ko, t, still, plain, shield, heal, dodge }
  function mood(o, T, dir) {
    const hurt = o.hurt || 0, fear = o.fear || 0, hit = o.hit || 0, cheer = o.cheer || 0, sad = o.sad || 0, startle = o.startle || 0, t = o.t || 0, still = !!o.still;
    const ko = !!o.ko, look = [(o.lookX || 0) * 1.6, (o.lookY || 0) * 1.2];
    const squeeze = hit > 0.35 && !ko, dizzy = ko || hurt > 0.8;
    const happy = !squeeze && !dizzy && cheer > 0.15;
    const half = !squeeze && !dizzy && !happy && (hurt > 0.5 || sad > 0.3);
    const wide = !squeeze && !dizzy && !happy && !half && (fear > 0.35 || startle > 0.3);
    const style = dizzy ? (ko ? "dizzy" : "half") : squeeze ? "squeeze" : happy ? "happy" : half ? "half" : "open";
    return {
      dir, hurt, fear, hit, cheer, sad, startle, t, still, look, style, wide, lid: o.blink || 0, ko, happy, half, squeeze, dizzy,
      col: ko ? "#CFC7D6" : T.c, plain: !!o.plain, trem: still ? 0 : (fear > 0.5 ? Math.sin(t * 60) * fear * 0.9 : 0),
    };
  }

  // ---------- křeček: sdílené části ----------
  function hamFace(c, T, lw, p) {
    const { dir, hurt, fear, hit, sad, look, style, wide, lid, ko, happy, squeeze } = p;
    const ex = 6.8, ey = -2.4, es = wide ? 5.1 : 4.4, pr = look;
    if (!ko && !squeeze && !happy) { c.fillStyle = "rgba(255,90,120,.4)"; for (const s of [-1, 1]) { ell(c, s * 12.2, 4.2, 3.6, 2.4); c.fill(); } }
    if (happy) { c.fillStyle = "rgba(255,90,120,.55)"; for (const s of [-1, 1]) { ell(c, s * 12.2, 4.2, 4, 2.7); c.fill(); } }
    for (const s of [-1, 1]) beadEye(c, s * ex, ey, es, style, s, pr, lid, lw);
    if (!ko && (fear > 0.35 || hurt > 0.3 || sad > 0.3 || hit > 0.35) && !happy) for (const s of [-1, 1]) {
      c.beginPath(); c.moveTo(s * ex + s * 4, ey - 7.6 + (hit > 0.35 ? 2 : 0)); c.lineTo(s * ex - s * 3.4, ey - 9.4 - (hit > 0.35 ? -1 : 0.6)); stroke(c, 1.9);
    }
    ell(c, 0, 2.1, 2.4, 1.7); c.fillStyle = ko ? "#bbb" : "#E8566F"; c.fill(); stroke(c, lw * 0.4);
    const my = 4.4;
    if (ko) { c.beginPath(); c.moveTo(-3, my + 1); c.quadraticCurveTo(0, my + 3, 3, my + 1); stroke(c, 1.6); ell(c, 0.6, my + 4.2, 2.2, 1.7); c.fillStyle = "#FF8FA8"; c.fill(); }
    else if (happy) {
      c.beginPath(); c.moveTo(-5, my - 0.5); c.quadraticCurveTo(0, my + 9, 5, my - 0.5); c.closePath(); fillStroke(c, INK, lw * 0.5);
      c.save(); c.clip(); c.fillStyle = "#FF8FA8"; ell(c, 0, my + 6.5, 4, 2.6); c.fill(); c.fillStyle = "#fff"; c.fillRect(-2.4, my - 0.6, 4.8, 2.2); c.restore();
    } else if (hit > 0.35 || p.startle > 0.3) {
      ell(c, 0, my + 2.2, 3.1, hit > 0.35 ? 3.4 : 2.7); fillStroke(c, INK, lw * 0.45);
      c.fillStyle = "#fff"; c.fillRect(-1.9, my - 0.9, 3.8, 2);
    } else if (fear > 0.35) {
      c.beginPath(); c.moveTo(-4, my + 2); for (let i = 1; i <= 4; i++) c.lineTo(-4 + i * 2, my + 2 + (i % 2 ? 1.5 : -0.5)); stroke(c, 1.6);
    } else if (sad > 0.3 || hurt > 0.5) {
      c.beginPath(); c.moveTo(-3.4, my + 2.6); c.quadraticCurveTo(0, my - 0.6, 3.4, my + 2.6); stroke(c, 1.8);
    } else {
      c.beginPath(); c.moveTo(-3.6, my); c.quadraticCurveTo(-1.8, my + 2.6, 0, my + 0.4); c.quadraticCurveTo(1.8, my + 2.6, 3.6, my); stroke(c, 1.7);
      c.fillStyle = "#fff"; rrect(c, -2.4, my + 0.9, 2.3, 3, 0.8); c.fill(); stroke(c, lw * 0.3); rrect(c, 0.1, my + 0.9, 2.3, 3, 0.8); c.fill(); stroke(c, lw * 0.3);
    }
  }
  // tlapka s prstíky; sx = rozevření, dy = posun dolů (pro jiná těla)
  function pawAt(c, col, lw, x, y, rot) {
    c.save(); c.translate(x, y); c.rotate(rot); ell(c, 0, 0, 4.4, 5.6); fillStroke(c, col, lw * 0.85); c.strokeStyle = INK; c.lineWidth = 1; for (const d of [-1.6, 0, 1.6]) { c.beginPath(); c.moveTo(d, 2.6); c.lineTo(d, 4.6); c.stroke(); } c.restore();
  }
  function hamPaws(c, lw, p, sx = 1, dy = 0) {
    const { dir, sad, fear, happy, still, t, ko, col } = p;
    const paw = (x, y, rot) => pawAt(c, col, lw, x * sx, y + dy, rot);
    if (happy) { paw(-15.6, -3 - (still ? 0 : Math.abs(Math.sin(t * 12)) * 3), -0.7); paw(15.6, -3 - (still ? 0 : Math.abs(Math.sin(t * 12 + 1)) * 3), 0.7); }
    else if (sad > 0.3 && !ko) { paw(dir * 5.5, -1.5, 0.2); paw(-dir * 16.5, 9, 0.5); }
    else if (fear > 0.45) { paw(-11, 8.5, -0.3); paw(11, 8.5, 0.3); }
    else { paw(-16.4, 7.5, 0.5); paw(16.4, 7.5, -0.5); }
  }
  // obvaz kolem hlavy (málem KO), oříznutý tělem
  function bandage(c, lw, cx, cy, rad, a0, a1, w = 9.5) {
    c.beginPath(); c.arc(cx, cy, rad, a0, a1); stroke(c, w, INK);
    c.beginPath(); c.arc(cx, cy, rad, a0, a1); stroke(c, Math.max(2, w - 3.3), "#FFF8EA");
    c.beginPath(); c.arc(cx, cy, rad, a0, a1); c.setLineDash([2, 5]); stroke(c, Math.max(1.5, w - 4.5), "rgba(43,22,56,.18)"); c.setLineDash([]);
  }
  // náplast, kapka potu a hvězdičky: v prostoru obličeje
  function faceFx(c, T, lw, p, team) {
    if (p.plain) return;
    const { dir, hurt, fear, ko, squeeze, still, t } = p;
    if (hurt > 0.28 && !ko) plaster(c, team === "x" ? 9 : -9, team === "x" ? 6.5 : 7, team === "x" ? -0.5 : 0.5, lw);
    if (fear > 0.45 && !squeeze) sweat(c, dir * -15, -9 + (still ? 0 : Math.sin(t * 9) * 0.8), 1, lw);
  }

  // Obecný křeček. G = geometrie (v jednotkách těla, strážník má poloměr 19,5), H = háčky pre/mid/post.
  function hamBase(c, T, lw, p, G, H = {}) {
    const { dir, hurt, fear, hit, squeeze, ko, col } = p;
    const belly = ko ? "#E9E4EE" : T.belly;
    if (H.pre) H.pre(c, T, lw, p);
    // ocásek a nožky (za tělem)
    if (G.tail) { circle(c, G.tail[0], G.tail[1], G.tail[2]); fillStroke(c, col, lw * 0.8); }
    if (G.feet) for (const s of [-1, 1]) { ell(c, s * G.feet[0], G.feet[1], G.feet[2], G.feet[3]); fillStroke(c, ko ? "#E9E4EE" : T.belly, lw * 0.8); }
    // uši
    const [ex, ey, er, eri] = G.ears;
    const spread = fear * 2.2 + hit * 1.5, drop = fear * 3 + hurt * 2 + (squeeze ? 2 : 0);
    for (const s of [-1, 1]) {
      circle(c, s * (ex + spread), ey + drop, er); fillStroke(c, col, lw);
      circle(c, s * (ex + spread), ey + 0.4 + drop, eri); c.fillStyle = ko ? "#E1D9E6" : T.pink; c.fill();
    }
    // tělo
    const { cy, rx, ry } = G.body, bp = () => ell(c, 0, cy, rx, ry);
    bp(); c.fillStyle = col; c.fill();
    c.save(); c.clip();
    c.fillStyle = ko ? "#A99FB2" : T.d; c.fillRect(-40, -40, 80, 80);
    c.fillStyle = col; circle(c, -3.2, cy - 5, rx + 0.4); c.fill();
    const B = G.belly;
    c.save(); c.translate(B.x, B.y); c.scale(B.sx, B.sy);
    c.fillStyle = belly; ell(c, 0, 0.4, 12.5, 9.8); c.fill();   // bříško
    c.fillStyle = ko ? "#D7CFDD" : T.bellyD; ell(c, 1, 3.9, 10.5, 5.2); c.fill();
    c.fillStyle = col; ell(c, 0, -1.4, 12.8, 8.8); c.fill();
    c.fillStyle = belly; ell(c, 0, 0, 11.8, 8.8); c.fill();
    c.restore();
    if (!ko) { c.fillStyle = "rgba(255,255,255,.34)"; ell(c, G.hl[0], G.hl[1], G.hl[2], G.hl[3], -0.7); c.fill(); }
    c.restore();
    bp(); stroke(c, lw);
    if (!ko) { c.fillStyle = "rgba(255,255,255,.8)"; circle(c, G.spec[0], G.spec[1], G.spec[2]); c.fill(); }
    if (hurt > 0.55 && !ko) { c.save(); bp(); c.clip(); bandage(c, lw, G.band[0], G.band[1], G.band[2], Math.PI * 1.1, Math.PI * 1.9, G.band[3] || 9.5); c.restore(); }
    // tvář
    const F = G.face;
    c.save(); c.translate(F.x, F.y); c.scale(F.s, F.s); hamFace(c, T, lw / F.s, p); c.restore();
    if (H.mid) H.mid(c, T, lw, p);
    hamPaws(c, lw, p, G.pawsX || 1, G.pawsDy || 0);
    if (H.post) H.post(c, T, lw, p);
    c.save(); c.translate(F.x, F.y); c.scale(F.s, F.s); faceFx(c, T, lw / F.s, p, "x"); c.restore();
  }

  // ---------- sovička: sdílené části ----------
  function owlFace(c, T, lw, p) {
    const { hurt, fear, hit, sad, look, style, wide, lid, ko, happy, col } = p;
    const face = ko ? "#E9E4EE" : T.belly;
    const ex = 7.4, ey = -2.6, es = wide ? 7.6 : 6.6;
    for (const s of [-1, 1]) { circle(c, s * ex, ey, 9.4); c.fillStyle = face; c.fill(); stroke(c, lw * 0.5, ko ? "#A99FB2" : T.dd); }
    for (const s of [-1, 1]) {
      const x = s * ex;
      if (style === "open") {
        circle(c, x, ey, es); c.fillStyle = "#fff"; c.fill(); stroke(c, lw * 0.6);
        const pr = wide ? 3.1 : 3.9;
        circle(c, x + look[0] * 1.3, ey + look[1] * 1.1, pr); c.fillStyle = INK; c.fill();
        c.fillStyle = "#fff"; circle(c, x + look[0] * 1.3 - 1.2, ey + look[1] * 1.1 - 1.3, 1.3); c.fill(); circle(c, x + look[0] * 1.3 + 1.2, ey + look[1] * 1.1 + 1.1, 0.6); c.fill();
        if (lid > 0.05) { c.save(); circle(c, x, ey, es); c.clip(); c.fillStyle = col; c.fillRect(x - es - 1, ey - es - 1, es * 2 + 2, (es * 2 + 2) * lid); c.restore(); c.beginPath(); c.moveTo(x - es, ey - es + es * 2 * lid); c.lineTo(x + es, ey - es + es * 2 * lid); stroke(c, 1.8); }
      } else if (style === "half") {
        circle(c, x, ey, es); c.fillStyle = "#fff"; c.fill(); stroke(c, lw * 0.6);
        circle(c, x + look[0], ey + 2.4, 3.6); c.fillStyle = INK; c.fill();
        c.save(); circle(c, x, ey, es); c.clip(); c.fillStyle = col; c.fillRect(x - es - 1, ey - es - 1, es * 2 + 2, es + 1.6); c.restore();
        c.beginPath(); c.moveTo(x - es, ey + 0.6); c.lineTo(x + es, ey + 0.6); stroke(c, 2);
      } else beadEye(c, x, ey, 3.6, style, s, look, 0, lw);
    }
    if (!ko && (fear > 0.35 || hurt > 0.3 || sad > 0.3 || hit > 0.35) && !happy) for (const s of [-1, 1]) {
      c.beginPath(); c.moveTo(s * ex + s * 6.6, ey - 10.8); c.lineTo(s * ex - s * 5.2, ey - 13.6 + (hit > 0.35 ? 2.2 : 0)); stroke(c, 2.3, ko ? "#A99FB2" : T.dd);
    }
    // zobák
    const open = hit > 0.35 || p.startle > 0.3 || happy;
    const bk = ko ? "#ccc" : T.beak, bkd = ko ? "#aaa" : T.beakD;
    if (open) {
      c.beginPath(); c.moveTo(-4.4, 1.2); c.lineTo(4.4, 1.2); c.lineTo(0, 7.6); c.closePath(); fillStroke(c, INK, lw * 0.5);
      c.beginPath(); c.moveTo(-3.6, 0.6); c.lineTo(3.6, 0.6); c.lineTo(0, 4.4); c.closePath(); fillStroke(c, bk, lw * 0.5);
      c.beginPath(); c.moveTo(-2.4, 6.4); c.quadraticCurveTo(0, 8.8, 2.4, 6.4); c.lineTo(0, 9.6); c.closePath(); c.fillStyle = bk; c.fill(); stroke(c, lw * 0.45);
    } else {
      c.beginPath(); c.moveTo(-4.4, 0.6); c.lineTo(4.4, 0.6); c.quadraticCurveTo(2, 6, 0, 8); c.quadraticCurveTo(-2, 6, -4.4, 0.6); c.closePath(); fillStroke(c, bk, lw * 0.55);
      c.beginPath(); c.moveTo(-1.6, 3.2); c.lineTo(1.6, 3.2); stroke(c, 1, bkd);
    }
  }
  // křídlo: ang = natočení, (x, y) = kořen, s = měřítko
  function owlWing(c, T, lw, p, s, ang, x = 15, y = -1, k = 1) {
    const { ko } = p, dark = ko ? "#A99FB2" : T.d;
    c.save(); c.translate(s * x, y); c.rotate(ang); c.scale(k, k);
    c.beginPath(); c.moveTo(0, -3); c.quadraticCurveTo(s * 11, 1, s * 7.6, 15); c.quadraticCurveTo(s * 1.6, 11, 0, 8); c.closePath();
    fillStroke(c, dark, lw * 0.85 / k);
    c.beginPath(); c.moveTo(s * 2.6, 1); c.quadraticCurveTo(s * 7, 4, s * 5.4, 11); stroke(c, 1.4, ko ? "#B8AEC0" : T.c);
    c.restore();
  }
  function owlWings(c, T, lw, p, wx = 15, wy = -1, wk = 1) {
    const { dir, happy, still, t, sad, ko, fear } = p, dark = ko ? "#A99FB2" : T.d;
    if (happy) { const f = still ? 0 : Math.sin(t * 14) * 0.25; owlWing(c, T, lw, p, -1, 0.4 + 1.5 + f, wx, wy, wk); owlWing(c, T, lw, p, 1, -0.4 - 1.5 - f, wx, wy, wk); }
    else if (sad > 0.3 && !ko) {
      owlWing(c, T, lw, p, -dir, dir * 0.2, wx, wy, wk);
      c.save(); c.translate(dir * 7, -2); c.rotate(dir * 0.15); c.beginPath(); c.moveTo(-3.5, -7); c.quadraticCurveTo(dir * 8, -6, dir * 5, 10); c.quadraticCurveTo(-4, 9, -3.5, -7); c.closePath(); fillStroke(c, dark, lw * 0.85); c.restore();
    }
    else if (fear > 0.45) { owlWing(c, T, lw, p, -1, -0.25, wx, wy, wk); owlWing(c, T, lw, p, 1, 0.25, wx, wy, wk); }
    else { owlWing(c, T, lw, p, -1, 0.05, wx, wy, wk); owlWing(c, T, lw, p, 1, -0.05, wx, wy, wk); }
  }
  // Obecná sovička. G = geometrie, H = háčky pre/mid/post.
  function owlBase(c, T, lw, p, G, H = {}) {
    const { dir, hurt, fear, ko, col } = p;
    const face = ko ? "#E9E4EE" : T.belly, dark = ko ? "#A99FB2" : T.d;
    if (H.pre) H.pre(c, T, lw, p);
    // ocas a pařátky
    if (G.tail !== false) for (const k of [-1, 0, 1]) { c.beginPath(); c.moveTo(k * 4 - dir * 6, 12); c.lineTo(k * 6 - dir * 9, 22.5); c.lineTo(k * 6 - dir * 2, 21); c.closePath(); fillStroke(c, ko ? "#B8AEC0" : T.dd, lw * 0.75); }
    if (G.feet !== false) {
      const fx = G.fx || 8;
      for (const s of [-1, 1]) {
        c.beginPath(); c.moveTo(s * fx - 4, 17); c.lineTo(s * fx - 4, 20.4); c.moveTo(s * fx, 17); c.lineTo(s * fx, 21); c.moveTo(s * fx + 4, 17); c.lineTo(s * fx + 4, 20.4);
        stroke(c, 3.6, INK); c.strokeStyle = ko ? "#ccc" : T.beak; c.lineWidth = 1.6; c.stroke();
      }
    }
    // chocholky
    const drop = fear * 2 + hurt * 2, ts = G.tuft || 1, ty = G.tuftY || 0;
    for (const s of [-1, 1]) {
      c.beginPath(); c.moveTo(s * 5.5 * ts, -15.5 + ty + drop); c.quadraticCurveTo(s * 9 * ts, -22 * ts + ty + drop + (ts - 1) * -8, s * 15.6 * ts, -26 * ts + ty + drop * 0.6 + (ts - 1) * -8); c.quadraticCurveTo(s * 18.6 * ts, -17 + ty, s * 16.4 * ts, -9.6 + ty + drop); c.closePath();
      fillStroke(c, col, lw);
      c.beginPath(); c.moveTo(s * 9.4 * ts, -17 + ty + drop); c.quadraticCurveTo(s * 12 * ts, -20.5 * ts + ty + drop, s * 14.4 * ts, -22.6 * ts + ty + drop); stroke(c, 1.5, ko ? "#A99FB2" : T.dd);
    }
    // tělo
    const bp = G.path ? () => G.path(c) : () => ell(c, 0, G.body[0], G.body[1], G.body[1]);
    if (G.under) { bp(); stroke(c, lw * 2.7); }
    bp(); c.fillStyle = col; c.fill();
    c.save(); c.clip();
    c.fillStyle = dark; c.fillRect(-40, -40, 80, 80);
    c.fillStyle = col; circle(c, -3.2, G.body[0] - 4.5, G.body[1] + 0.4); c.fill();
    // hruď s pírky
    const Ch = G.chest;
    c.fillStyle = face; ell(c, Ch[0], Ch[1], Ch[2], Ch[3]); c.fill();
    c.strokeStyle = ko ? "#B8AEC0" : T.bellyD; c.lineWidth = 1.5; c.lineCap = "round";
    for (const [x, y, sz = 2.7] of G.marks) { c.beginPath(); c.moveTo(x - sz, y - sz * 1.4 / 2.7); c.lineTo(x, y + sz * 1.6 / 2.7); c.lineTo(x + sz, y - sz * 1.4 / 2.7); c.stroke(); }
    if (!ko) { c.fillStyle = "rgba(255,255,255,.34)"; ell(c, G.hl[0], G.hl[1], G.hl[2], G.hl[3], -0.7); c.fill(); }
    c.restore();
    if (!G.under) { bp(); stroke(c, lw); }
    if (hurt > 0.55 && !ko) { c.save(); bp(); c.clip(); bandage(c, lw, G.band[0], G.band[1], G.band[2], Math.PI * 1.08, Math.PI * 1.92, G.band[3] || 9.5); c.restore(); }
    if (H.band) H.band(c, T, lw, p);
    // obličejový terč a oči
    const F = G.face;
    c.save(); c.translate(F.x, F.y); c.scale(F.s, F.s); owlFace(c, T, lw / F.s, p); c.restore();
    if (H.mid) H.mid(c, T, lw, p);
    if (G.wings !== false) owlWings(c, T, lw, p, G.wx || 15, G.wy === undefined ? -1 : G.wy, G.wk || 1);
    if (H.post) H.post(c, T, lw, p);
    c.save(); c.translate(F.x, F.y); c.scale(F.s, F.s); faceFx(c, T, lw / F.s, p, "o"); c.restore();
  }

  // ---------- doplňky jednotek ----------
  // pláštěnka krále (za tělem): týmová barva se zvlněným červeným lemem
  function cape(c, T, lw, p) {
    const { dir, ko, t, still, fear } = p, sw = still ? 0 : Math.sin(t * 3.2) * 0.9;
    const f = ko ? "#B8AEC0" : T.d, hem = ko ? "#B79CA6" : ROYAL, hemD = ko ? "#9C8590" : "#A5213A";
    const bk = -dir, fr = dir;                       // záda a čelo
    const pts = () => {
      c.beginPath();
      c.moveTo(fr * 11, -3); c.lineTo(bk * 12, -4);
      c.bezierCurveTo(bk * 20, 2, bk * 26 + sw * bk, 12, bk * 28 + sw * bk, 21);
      c.quadraticCurveTo(bk * 19, 24.2, bk * 10, 22); c.quadraticCurveTo(0, 25, fr * 10, 22.4); c.quadraticCurveTo(fr * 19, 24.2, fr * 23, 20.6);
      c.bezierCurveTo(fr * 22, 12, fr * 17, 3, fr * 11, -3); c.closePath();
    };
    pts(); c.fillStyle = f; c.fill();
    c.save(); c.clip();
    c.fillStyle = hem; c.beginPath(); c.moveTo(-34, 21.4); c.quadraticCurveTo(bk * 19, 22.6, bk * 10, 20.2); c.quadraticCurveTo(0, 23.4, fr * 10, 20.6); c.quadraticCurveTo(fr * 19, 22.6, 34, 19.4); c.lineTo(34, 32); c.lineTo(-34, 32); c.closePath(); c.fill();
    c.fillStyle = hemD; c.fillRect(-34, 25.4, 68, 8);
    c.fillStyle = "rgba(43,22,56,.2)"; c.beginPath(); c.moveTo(fr * 8, -4); c.lineTo(fr * 30, -4); c.lineTo(fr * 30, 30); c.lineTo(fr * 18, 30); c.closePath(); c.fill();
    c.strokeStyle = "rgba(43,22,56,.22)"; c.lineWidth = 1.2; for (const k of [-1, 1]) { c.beginPath(); c.moveTo(k * 17 + bk * 0.0, 8); c.lineTo(k * 21 - 0, 22); c.stroke(); }
    c.restore();
    pts(); stroke(c, lw);
  }
  function kingChain(c, T, lw, p) {
    const { dir, ko } = p;
    // dvě zlaté sponky na ramenou spojené řetízkem pod bradou
    c.beginPath(); c.moveTo(-13.4, 8.4); c.quadraticCurveTo(0, 15.8, 13.4, 8.4); stroke(c, 3.4, INK); c.strokeStyle = ko ? "#E3D9A8" : GOLD; c.lineWidth = 1.7; c.stroke();
    for (const s of [-1, 1]) { circle(c, s * 14, 7.6, 3.2); fillStroke(c, ko ? "#E3D9A8" : GOLD, lw * 0.6); c.fillStyle = ko ? "#CFC7D6" : ROYAL; circle(c, s * 14, 7.6, 1.2); c.fill(); }
  }
  // bílá čepice s zeleným křížem (léčitel)
  function nurseCap(c, T, lw, p, y = 0) {
    const { ko } = p, wh = ko ? "#F1EEF4" : "#FFFDF6", wh2 = ko ? "#D9D3E0" : "#E8E1D2", cr = ko ? "#9DBFAB" : HEAL_G;
    c.save(); c.translate(0, y);
    const dome = () => { c.beginPath(); c.moveTo(-11.2, -14); c.bezierCurveTo(-12.6, -24.6, -5.4, -30.6, 0, -30.6); c.bezierCurveTo(5.4, -30.6, 12.6, -24.6, 11.2, -14); c.quadraticCurveTo(0, -11.2, -11.2, -14); c.closePath(); };
    dome(); c.fillStyle = wh; c.fill();
    c.save(); c.clip();
    c.fillStyle = wh2; c.beginPath(); c.moveTo(5, -32); c.quadraticCurveTo(10, -22, 8, -10); c.lineTo(14, -10); c.lineTo(14, -32); c.closePath(); c.fill();
    c.fillStyle = ko ? "#E0DAE8" : "#F3EDE0"; c.fillRect(-14, -17, 28, 4);                  // záložka čepice
    c.restore();
    c.beginPath(); c.moveTo(-11.4, -16.6); c.quadraticCurveTo(0, -13.4, 11.4, -16.6); stroke(c, lw * 0.5, "rgba(43,22,56,.55)");
    dome(); stroke(c, lw * 0.95);
    // kříž
    c.beginPath(); c.moveTo(-1.8, -26.6); c.lineTo(1.8, -26.6); c.lineTo(1.8, -23.2); c.lineTo(5.2, -23.2); c.lineTo(5.2, -19.6); c.lineTo(1.8, -19.6); c.lineTo(1.8, -16.2 - 0.6); c.lineTo(-1.8, -16.8); c.lineTo(-1.8, -19.6); c.lineTo(-5.2, -19.6); c.lineTo(-5.2, -23.2); c.lineTo(-1.8, -23.2); c.closePath();
    c.fillStyle = cr; c.fill(); stroke(c, lw * 0.5);
    c.fillStyle = "rgba(255,255,255,.5)"; c.fillRect(-4.2, -22.6, 3, 1.2);
    c.restore();
  }
  // brašna přes rameno: popruh přes hruď (oříznutý tělem) a taška na boku
  function satchelStrap(c, T, lw, p) {
    const { dir, ko } = p;
    c.save(); ell(c, 0, 1, 19.5, 19); c.clip();
    c.beginPath(); c.moveTo(dir * 20, 4); c.quadraticCurveTo(dir * 2, 9, -dir * 13, 19); stroke(c, 4.8, INK);
    c.beginPath(); c.moveTo(dir * 20, 4); c.quadraticCurveTo(dir * 2, 9, -dir * 13, 19); stroke(c, 3, ko ? "#B8AEC0" : "#9A6238");
    c.beginPath(); c.moveTo(dir * 20, 3); c.quadraticCurveTo(dir * 2, 8, -dir * 13, 18); stroke(c, 0.9, "rgba(255,255,255,.35)");
    c.restore();
  }
  function satchelBag(c, T, lw, p) {
    const { dir, ko } = p;
    c.save(); c.translate(-dir * 15.6, 13.4); c.rotate(-dir * 0.3);
    rrect(c, -5.8, -4.6, 11.6, 9.6, 2.4); c.fillStyle = ko ? "#B8AEC0" : "#B7773F"; c.fill();
    c.save(); c.clip(); c.fillStyle = "rgba(43,22,56,.2)"; c.fillRect(1.2, -5, 6, 11); c.fillStyle = ko ? "#C9C2D0" : "#CD8C52"; c.beginPath(); c.moveTo(-6, -5); c.lineTo(6, -5); c.lineTo(6, -0.6); c.quadraticCurveTo(0, 2.6, -6, -0.6); c.closePath(); c.fill(); c.restore();
    rrect(c, -5.8, -4.6, 11.6, 9.6, 2.4); stroke(c, lw * 0.8);
    circle(c, 0, 1.9, 2.5); c.fillStyle = "#FFFDF6"; c.fill(); stroke(c, lw * 0.4);
    c.fillStyle = ko ? "#9DBFAB" : HEAL_G; c.fillRect(-0.7, 0.4, 1.4, 3); c.fillRect(-1.5, 1.2, 3, 1.4);
    c.restore();
  }

  // pelerína/koruna a spol. pro obě tělesné šablony
  const HOOK = {
    K: { pre: cape, mid: kingChain, post: (c, T, lw, p, top) => crown(c, 0, top - 1.2, 1.0, lw, p.ko) },
    L: { mid: satchelStrap, post: (c, T, lw, p) => { satchelBag(c, T, lw, p); nurseCap(c, T, lw, p, p.capY || 0); } },
  };

  // ---------- geometrie šablon ----------
  // křeček – strážník je základ (r 19,5), ostatní se z něj odvozují
  const hamGeo = (kind, dir) => {
    const C = { body: { cy: 1, rx: 19.5, ry: 19 }, ears: [11.6, -14, 7.6, 4.1], tail: [-dir * 17, 11, 4.6], feet: [8, 16.6, 6.4, 3.8], belly: { x: dir * 1.5, y: 8.6, sx: 1, sy: 1 }, hl: [-8.4, -9.6, 5.6, 3], spec: [-12.3, -4.6, 1.3], band: [0, 1, 14.5], face: { x: 0, y: 0, s: 1 } };
    if (kind === "T") return { ...C, body: { cy: 0.5, rx: 19.5, ry: 19.5 }, ears: [9.4, -16.4, 5.4, 3], tail: [-dir * 18.6, 10, 5.4], feet: [10.2, 17.4, 7.2, 4.1], belly: { x: dir * 0.8, y: 7.4, sx: 1.4, sy: 1.34 }, hl: [-9.4, -9.4, 6.4, 3.4], spec: [-13.4, -4.4, 1.6], band: [0.5, 0.5, 17.4, 4.8], face: { x: 0, y: -10.6, s: 0.68 } };
    if (kind === "R") return { ...C, body: { cy: -5, rx: 15.8, ry: 15.2 }, ears: [10.8, -17.6, 8, 4.6], tail: null, feet: null, belly: { x: dir * 1, y: 1.8, sx: 0.84, sy: 0.74 }, hl: [-6.8, -14.2, 4.6, 2.5], spec: [-9.8, -9.6, 1.1], band: [0, -5, 11.6, 5.6], face: { x: 0, y: -7, s: 0.8 }, pawsX: 0.82, pawsDy: -5.6 };
    return C;
  };
  const owlGeo = (kind, dir) => {
    const C = { body: [0.5, 19.5], chest: [0, 10, 11.5, 10.5], marks: [[-5, 8.6], [5, 8.6], [0, 13.2], [-8, 14], [8, 14]], hl: [-8.4, -10, 5.4, 2.9], band: [0, 1, 15.5], face: { x: 0, y: 0, s: 1 } };
    if (kind === "T") {
      const N = 16, R0 = 16.7, rb = 3.3;
      const path = c => { c.beginPath(); for (let i = 0; i < N; i++) { const a = i / N * TAU, x = Math.cos(a) * R0, y = 0.5 + Math.sin(a) * R0; c.moveTo(x + rb, y); c.arc(x, y, rb, 0, TAU); } c.moveTo(16, 0.5); c.arc(0, 0.5, 16, 0, TAU); };
      return { ...C, path, under: true, body: [0.5, 19.5], chest: [0, 6.8, 15.4, 13.2], marks: [[-8, 0.5, 3.1], [0, -0.5, 3.1], [8, 0.5, 3.1], [-12.4, 7.6, 3.1], [-4.2, 7, 3.1], [4.2, 7, 3.1], [12.4, 7.6, 3.1], [-8.2, 14, 3.1], [0, 14.6, 3.1], [8.2, 14, 3.1]], hl: [-9.4, -9.6, 6.4, 3.3], band: [0.5, 0.5, 17.2, 4.8], face: { x: 0, y: -10.2, s: 0.7 }, tuft: 0.74, tuftY: -1.2, fx: 10.2, wx: 17, wy: 1.4, wk: 1.1 };
    }
    if (kind === "R") return { ...C, body: [-4.5, 15.6], chest: [0, 4.2, 9.4, 8.4], marks: [[-4, 3.2, 2.3], [4, 3.2, 2.3], [0, 7.4, 2.3]], hl: [-6.4, -13.6, 4.4, 2.4], band: [0, -4, 11, 5.4], face: { x: 0, y: -7.2, s: 0.8 }, tuft: 0.86, tuftY: -4.6, tail: false, feet: false, wx: 13, wy: -4, wk: 0.82 };
    return C;
  };

  // ---------- kruhové jednotky K, C, T, R, L ----------
  const CIRC = { K: { k: 24 / 19.5 }, C: { k: 1 }, T: { k: 30 / 19.5 }, R: { k: 14 / 19.5 }, L: { k: 18 / 19.5 } };
  const TOP = { K: -40, C: -26.5, T: -40.5, S: -43, R: -23, L: -33 };           // výška nad středem pro hvězdičky a „+“ (svět)
  const ORBIT = { K: 15, C: 13, T: 18, S: 13, R: 9.5, L: 13 };

  // ---------- štítonoš (obdélník 30×50) ----------
  function helmet(c, T, lw, p, brim, topY) {
    const { dir, ko, t, still, col } = p;
    // dóm
    const dome = () => { c.beginPath(); c.moveTo(-16.6, brim); c.bezierCurveTo(-17.4, brim - 8.6, -9.4, topY, 0, topY); c.bezierCurveTo(9.4, topY, 17.4, brim - 8.6, 16.6, brim); c.closePath(); };
    dome(); c.fillStyle = ko ? "#CFC7D6" : STEEL; c.fill();
    c.save(); c.clip();
    c.fillStyle = ko ? "#A99FB2" : STEEL_D; c.fillRect(2, topY - 2, 20, 40);
    c.fillStyle = ko ? "#CFC7D6" : STEEL; ell(c, -1.6, brim - 7.6, 15, 11.6); c.fill();
    c.fillStyle = "rgba(255,255,255,.55)"; ell(c, -8, brim - 8.4, 3.6, 5.8, 0.55); c.fill();
    c.restore();
    dome(); stroke(c, lw * 0.95);
    // čelní pás s nýty
    rrect(c, -17.8, brim - 3.8, 35.6, 5.6, 2.4); c.fillStyle = ko ? "#A99FB2" : STEEL_D; c.fill(); c.save(); c.clip(); c.fillStyle = "rgba(255,255,255,.28)"; c.fillRect(-18, brim - 3.8, 36, 1.6); c.restore(); rrect(c, -17.8, brim - 3.8, 35.6, 5.6, 2.4); stroke(c, lw * 0.85);
    c.fillStyle = ko ? "#E1D9E6" : STEEL_L; for (const x of [-11.6, 0, 11.6]) { circle(c, x, brim - 1, 1); c.fill(); }
    // hřeben: týmový hřeben po celé délce přilby (od čela dozadu)
    const sw = still ? 0 : Math.sin(t * 5) * 0.6, bk = -dir, fr = dir;
    const comb = () => {
      c.beginPath(); c.moveTo(fr * 11, topY + 3.2);
      c.bezierCurveTo(fr * 11, topY - 3.8, fr * 6, topY - 9.4, fr * 0.4, topY - 9.2);
      c.bezierCurveTo(bk * 6, topY - 9.2, bk * 11 + sw * bk, topY - 7, bk * 15 + sw * bk, topY - 1.6);
      c.lineTo(bk * 12.4, topY - 1.4); c.lineTo(bk * 14.8 + sw * bk, topY + 2.2); c.lineTo(bk * 10.6, topY + 1.4); c.lineTo(bk * 12.4, topY + 5);
      c.lineTo(bk * 6.6, topY + 3.6); c.quadraticCurveTo(0, topY + 5.2, fr * 11, topY + 3.2); c.closePath();
    };
    comb(); c.fillStyle = col; c.fill();
    c.save(); c.clip();
    c.fillStyle = ko ? "#A99FB2" : p.team === "x" ? TEAM.x.d : TEAM.o.d; c.beginPath(); c.moveTo(-18, topY + 2); c.quadraticCurveTo(0, topY - 3, 18, topY - 1); c.lineTo(18, topY + 8); c.lineTo(-18, topY + 8); c.closePath(); c.fill();
    c.fillStyle = "rgba(255,255,255,.4)"; ell(c, fr * 3, topY - 4.4, 5.6, 1.5, -0.2 * fr); c.fill();
    c.restore();
    comb(); stroke(c, lw * 0.9);
  }
  // štít: kulatý, dřevo s kovovým okrajem a týmovým pupkem; stage 0 celý, 1 prasklý, 2 ulomený okraj, 3 jen úlomek
  function shieldPoly(c, R, stage) {
    c.beginPath();
    if (stage < 2) { c.arc(0, 0, R, 0, TAU); return; }
    const N = 30;
    for (let i = 0; i < N; i++) {
      const a = i / N * TAU; let rr = R;
      const d = Math.atan2(Math.sin(a + 1.0), Math.cos(a + 1.0));         // výřez směrem nahoru-dopředu (úhel -1 rad)
      if (Math.abs(d) < 0.46) rr = R * (0.58 + 0.12 * ((i % 2) ? 1 : -1) + Math.abs(d) * 0.55);
      c.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    c.closePath();
  }
  function shield(c, T, lw, p, cx, cy, R, stage) {
    const { dir, ko } = p, steel = ko ? "#CFC7D6" : STEEL, steelD = ko ? "#A99FB2" : STEEL_D;
    c.save(); c.translate(cx, cy);
    if (stage >= 3) {                                                   // zbyl jen kus okraje v tlapce
      const a0 = dir > 0 ? Math.PI * 0.72 : -Math.PI * 0.28, a1 = a0 + Math.PI * 0.56;
      c.beginPath(); c.arc(0, 0, R - 2, a0, a1); stroke(c, 6.2, INK);
      c.beginPath(); c.arc(0, 0, R - 2, a0, a1); stroke(c, 3.8, steel);
      c.beginPath(); c.arc(0, 0, R - 2.9, a0 + 0.06, a1 - 0.06); stroke(c, 1.1, "rgba(255,255,255,.55)");
      c.beginPath(); c.arc(0, 0, R - 0.9, a0 + 0.1, a1 - 0.12); stroke(c, 1, steelD);
      const mx = Math.cos((a0 + a1) / 2) * (R + 2), my = Math.sin((a0 + a1) / 2) * (R + 2);                  // třísky
      c.beginPath(); c.moveTo(mx, my - 3); c.lineTo(mx + dir * 4.4, my - 0.8); c.lineTo(mx + dir * 0.6, my + 2.6); c.closePath(); fillStroke(c, ko ? "#CFC7D6" : "#EDAC62", lw * 0.55);
      c.restore(); return;
    }
    shieldPoly(c, R, stage); c.fillStyle = steel; c.fill();
    c.save(); c.clip();
    c.fillStyle = steelD; c.fillRect(-R - 2, -R - 2, R * 2 + 4, R * 2 + 4);
    c.fillStyle = steel; circle(c, -1.3, -1.6, R + 0.4); c.fill();
    // dřevěný střed
    const wr = R - 3.3;
    circle(c, 0, 0, wr); c.fillStyle = ko ? "#CFC7D6" : "#C77F35"; c.fill();
    c.save(); circle(c, 0, 0, wr); c.clip();
    c.fillStyle = ko ? "#E9E4EE" : "#EDAC62"; circle(c, -1.1, -1.4, wr + 0.2); c.fill();
    c.strokeStyle = ko ? "#A99FB2" : "#B26E2B"; c.lineWidth = 1.1; for (const x of [-4.6, 0, 4.6]) { c.beginPath(); c.moveTo(x, -wr); c.lineTo(x, wr); c.stroke(); }
    c.restore();
    circle(c, 0, 0, wr); stroke(c, lw * 0.5);
    // nýty na okraji
    c.fillStyle = steelD; for (let i = 0; i < 6; i++) { const a = i / 6 * TAU + 0.5; circle(c, Math.cos(a) * (R - 1.6), Math.sin(a) * (R - 1.6), 0.8); c.fill(); }
    // pupek v barvě týmu
    circle(c, 0, 0, 3.6); fillStroke(c, ko ? "#CFC7D6" : T.c, lw * 0.6);
    c.fillStyle = "rgba(255,255,255,.7)"; circle(c, -1.1, -1.3, 0.9); c.fill();
    // odlesk okraje
    c.beginPath(); c.arc(0, 0, R - 1.5, Math.PI * 1.08, Math.PI * 1.5); stroke(c, 1.3, "rgba(255,255,255,.7)");
    // praskliny
    if (stage >= 1) {
      const crack = (pts, w) => { c.beginPath(); pts.forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y)); stroke(c, w, INK); c.beginPath(); pts.forEach(([x, y], i) => i ? c.lineTo(x + 0.9, y + 0.9) : c.moveTo(x + 0.9, y + 0.9)); stroke(c, w * 0.45, "rgba(255,255,255,.55)"); };
      crack([[0.8, -3.4], [-1.4, -5.8], [-0.4, -8.6], [-3.2, -R]], 1.5);
      if (stage >= 2) { crack([[3.2, 2.6], [6.2, 4.4], [5.6, 7.8], [8.6, R - 1]], 1.4); crack([[-3.2, 2.4], [-6, 4.2], [-8.4, 3.6]], 1.3); crack([[0, 3.6], [-0.6, 7], [1.4, R - 0.6]], 1.2); }
    }
    c.restore();
    shieldPoly(c, R, stage); stroke(c, lw * 0.95);
    c.restore();
  }
  function bodyRectPath(c) { rrect(c, -15, -25, 30, 50, 11); }
  function rectBody(c, T, lw, p, belly, marks) {
    const { dir, ko, col, hurt } = p, dark = ko ? "#A99FB2" : T.d;
    bodyRectPath(c); c.fillStyle = col; c.fill();
    c.save(); c.clip();
    c.fillStyle = dark; c.fillRect(-20, -30, 40, 60);
    rrect(c, -17.6, -28.4, 30, 50, 11); c.fillStyle = col; c.fill();
    belly(c);
    if (!ko) { c.fillStyle = "rgba(255,255,255,.3)"; ell(c, -8.4, -15.6, 3.2, 8.2, 0.12); c.fill(); }
    c.restore();
    bodyRectPath(c); stroke(c, lw);
    if (!ko) { c.fillStyle = "rgba(255,255,255,.75)"; circle(c, -10.4, -2, 1.2); c.fill(); }
  }
  function drawS(c, T, lw, p, team, o) {
    const { dir, ko, hurt, fear, hit, happy, sad, still, t, squeeze, col } = p;
    const stage = o.shield === undefined ? 0 : (o.shield > 0.83 ? 0 : o.shield > 0.5 ? 1 : o.shield > 0.16 ? 2 : 3);
    const belly = ko ? "#E9E4EE" : T.belly, bellyD = ko ? "#D7CFDD" : T.bellyD;
    const sCx = dir * 10.5, sCy = 12.2, sR = 12.5, brim = -15, topY = -28.4;
    const hop = happy ? (still ? 0 : -Math.abs(Math.sin(t * 12)) * 2.4) : 0;
    c.translate(0, hop);
    // za tělem: pařátky/nožky, ocas
    if (team === "x") {
      circle(c, -dir * 15.6, 17.4, 4.4); fillStroke(c, col, lw * 0.8);
      for (const s of [-1, 1]) { ell(c, s * 7, 23.2, 6.2, 3.7); fillStroke(c, ko ? "#E9E4EE" : T.belly, lw * 0.8); }
      const spread = fear * 1.6 + hit * 1.2, drop = fear * 2 + hurt * 2 + (squeeze ? 2 : 0);
      for (const s of [-1, 1]) { circle(c, s * (13.2 + spread), -19 + drop, 5.6); fillStroke(c, col, lw); circle(c, s * (13.2 + spread), -18.6 + drop, 3.1); c.fillStyle = ko ? "#E1D9E6" : T.pink; c.fill(); }
    } else {
      for (const k of [-1, 0, 1]) { c.beginPath(); c.moveTo(k * 3.4 - dir * 6, 20); c.lineTo(k * 5 - dir * 9.4, 29); c.lineTo(k * 5 - dir * 2.4, 27); c.closePath(); fillStroke(c, ko ? "#B8AEC0" : T.dd, lw * 0.75); }
      for (const s of [-1, 1]) {
        c.beginPath(); c.moveTo(s * 7 - 3.4, 22.6); c.lineTo(s * 7 - 3.4, 26.2); c.moveTo(s * 7, 22.6); c.lineTo(s * 7, 26.8); c.moveTo(s * 7 + 3.4, 22.6); c.lineTo(s * 7 + 3.4, 26.2);
        stroke(c, 3.6, INK); c.strokeStyle = ko ? "#ccc" : T.beak; c.lineWidth = 1.6; c.stroke();
      }
    }
    // tělo
    if (team === "x") {
      rectBody(c, T, lw, p, () => {
        c.fillStyle = belly; ell(c, dir * 1.2, 14.4, 11.4, 10.4); c.fill();
        c.fillStyle = bellyD; ell(c, dir * 2, 19.2, 10, 5.4); c.fill();
        c.fillStyle = col; ell(c, dir * 1.2, 11.2, 12, 8); c.fill();
        c.fillStyle = belly; ell(c, dir * 1.2, 13.4, 11, 8.8); c.fill();
      });
    } else {
      rectBody(c, T, lw, p, () => {
        c.fillStyle = ko ? "#E9E4EE" : T.belly; ell(c, 0, 13.6, 11.2, 11.6); c.fill();
        c.strokeStyle = ko ? "#B8AEC0" : T.bellyD; c.lineWidth = 1.5; c.lineCap = "round";
        for (const [x, y] of [[-4.6, 8.4], [4.6, 8.4], [0, 13], [-6.4, 17.6], [6.4, 17.6], [0, 21.4]]) { c.beginPath(); c.moveTo(x - 2.6, y - 1.4); c.lineTo(x, y + 1.6); c.lineTo(x + 2.6, y - 1.4); c.stroke(); }
      });
    }
    // obvaz
    if (hurt > 0.55 && !ko) { c.save(); bodyRectPath(c); c.clip(); bandage(c, lw, 0, -3, 15, Math.PI * 1.08, Math.PI * 1.92, 6); c.restore(); }
    // zadní tlapka / křídlo (za štítem)
    const rearArm = () => {
      if (team === "x") {
        if (happy) pawAt(c, col, lw, -dir * 16.5, -4 - (still ? 0 : Math.abs(Math.sin(t * 12 + 1)) * 4), -dir * 0.5);
        else if (sad > 0.3 && !ko) pawAt(c, col, lw, dir * 3.6, -6.4, dir * 0.15);
        else pawAt(c, col, lw, -dir * 16.2, 6.4 + (fear > 0.45 ? 2 : 0), dir * 0.45);
      } else {
        if (happy) owlWing(c, T, lw, p, -dir, -dir * (0.5 + 1.4 + (still ? 0 : Math.sin(t * 14) * 0.25)), 14, -3, 0.9);
        else if (sad > 0.3 && !ko) { c.save(); c.translate(dir * 3, -2); c.rotate(dir * 0.15); c.beginPath(); c.moveTo(-3, -7); c.quadraticCurveTo(dir * 7, -6, dir * 4, 9); c.quadraticCurveTo(-3.5, 8, -3, -7); c.closePath(); fillStroke(c, ko ? "#A99FB2" : T.d, lw * 0.85); c.restore(); }
        else owlWing(c, T, lw, p, -dir, -dir * 0.05, 14.4, 0, 0.9);
      }
    };
    // pořadí: přilba pod obličejem, aby obočí zůstalo vidět
    helmet(c, T, lw, p, brim, topY);
    if (hurt > 0.55 && !ko) { c.save(); bodyRectPath(c); c.clip(); c.beginPath(); c.arc(0, -2, 14, Math.PI * 1.12, Math.PI * 1.88); stroke(c, 7, INK); c.beginPath(); c.arc(0, -2, 14, Math.PI * 1.12, Math.PI * 1.88); stroke(c, 4.4, "#FFF8EA"); c.restore(); }
    const F = team === "x" ? { x: 0, y: -4.4, s: 0.9 } : { x: 0, y: -3.8, s: 0.8 };
    c.save(); c.translate(F.x, F.y); c.scale(F.s, F.s); (team === "x" ? hamFace : owlFace)(c, T, lw / F.s, p); c.restore();
    rearArm();
    // štít před tělem
    shield(c, T, lw, p, sCx, sCy, sR, stage);
    // tlapka přidržující štít
    if (stage < 3) { if (team === "x") pawAt(c, col, lw, dir * 4.2, 13.2, dir * 0.4); else { c.save(); c.translate(dir * 3.6, 12.6); c.rotate(dir * 0.5); ell(c, 0, 0, 3.6, 5.6); fillStroke(c, ko ? "#A99FB2" : T.d, lw * 0.8); c.restore(); } }
    else if (team === "x") pawAt(c, col, lw, dir * 4.6, 10.8, dir * 0.3 + (still ? 0 : Math.sin(t * 9) * 0.1));
    c.save(); c.translate(F.x, F.y); c.scale(F.s, F.s); faceFx(c, T, lw / F.s, p, team); c.restore();
  }

  // ---------- skokan ----------
  function legs(c, T, lw, p, dodge, ham) {
    const { dir, ko, col } = p, leg = ko ? "#E9E4EE" : ham ? T.belly : T.beak, ankle = 19.4 + dodge * 1.2;
    for (const s of [-1, 1]) {
      c.beginPath(); c.moveTo(s * 5.2, 8.8); c.lineTo(s * (11.4 - dodge * 5), 14.2 - dodge * 1.6); c.lineTo(s * (8.4 - dodge * 3), ankle);
      stroke(c, 5.4, INK); c.strokeStyle = ham ? (ko ? "#CFC7D6" : T.d) : (ko ? "#ccc" : T.beak); c.lineWidth = 2.6; c.stroke();
      ell(c, s * (8.4 - dodge * 3) + dir * 1.6, ankle + 1.2, 4.4, 2.3); fillStroke(c, ham ? (ko ? "#E9E4EE" : T.belly) : (ko ? "#ccc" : T.beak), lw * 0.75);
    }
  }
  function curlTail(c, T, lw, p, dodge, ham) {
    const { dir, ko, t, still } = p, bk = -dir, turns = 0.85 + dodge * 1.5, sp = still ? 0 : Math.sin(t * 10) * 0.18 * dodge;
    const cx = bk * 20.4, cy = -1.4, N = 26, pts = [[bk * 13, 5], [bk * 17.6, 6.4]];
    for (let i = 0; i <= N; i++) { const f = i / N, a = Math.PI * 0.55 + f * (turns + sp) * TAU, rr = 6.4 - f * 4.6; pts.push([cx + bk * Math.cos(a) * rr, cy + Math.sin(a) * rr]); }
    const path = () => { c.beginPath(); pts.forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y)); };
    path(); stroke(c, 5.2, INK); path(); stroke(c, 2.8, ko ? "#CFC7D6" : ham ? p.col : T.dd);
  }
  function headband(c, T, lw, p, ham) {
    const { dir, ko, t, still } = p, bk = -dir, fl = still ? 0 : Math.sin(t * 7) * 1.1, wh = ko ? "#E9E4EE" : "#FFF8EA";
    for (const [dy, ang] of [[-0.6, -0.5], [2.4, 0.3]]) {
      c.save(); c.translate(bk * 12.4, (ham ? -11.6 : -10.6) + dy); c.scale(bk, 1); c.rotate(ang + fl * 0.07);
      c.beginPath(); c.moveTo(0, -1.5); c.lineTo(6.4, -2.4 + fl * 0.4); c.lineTo(9.6, 0.2 + fl); c.lineTo(6.2, 2.4 + fl * 0.5); c.lineTo(0, 1.5); c.closePath(); fillStroke(c, wh, lw * 0.8);
      c.restore();
    }
    circle(c, bk * 12.4, ham ? -11 : -10, 2.1); fillStroke(c, wh, lw * 0.8);
  }

  // ---------- veřejné kreslení jednotky ----------
  const DIMS = { K: { r: 24 }, C: { r: 19 }, T: { r: 30 }, S: { w: 30, h: 50 }, R: { r: 14 }, L: { r: 18 } };
  const unitDim = k => (typeof JP !== "undefined" && JP.UNIT && JP.UNIT[k]) || DIMS[k];
  function aura(c, kind, o, p) {
    const h = Math.min(1, o.heal), U = unitDim(kind), R = U.r || Math.hypot(U.w, U.h) / 2, pulse = p.still ? 0 : Math.sin(p.t * 5) * 2;
    c.fillStyle = `rgba(47,191,113,${0.16 * h})`; circle(c, 0, 0, R + 15 + pulse); c.fill();
    c.fillStyle = `rgba(47,191,113,${0.2 * h})`; circle(c, 0, 0, R + 8 + pulse * 0.6); c.fill();
    c.strokeStyle = `rgba(47,191,113,${0.75 * h})`; c.lineWidth = 2; c.setLineDash([5, 4]); c.lineDashOffset = p.still ? 0 : -p.t * 10; circle(c, 0, 0, R + 11 + pulse); c.stroke(); c.setLineDash([]);
  }
  function healPlus(c, kind, o, p, lw) {
    const h = Math.min(1, o.heal), y = TOP[kind] - 8 - (p.still ? 0 : Math.sin(p.t * 6) * 1.6);
    c.save(); c.translate(0, y); c.scale(0.6 + h * 0.5, 0.6 + h * 0.5);
    c.beginPath(); c.moveTo(-2.8, -8); c.lineTo(2.8, -8); c.lineTo(2.8, -2.8); c.lineTo(8, -2.8); c.lineTo(8, 2.8); c.lineTo(2.8, 2.8); c.lineTo(2.8, 8); c.lineTo(-2.8, 8); c.lineTo(-2.8, 2.8); c.lineTo(-8, 2.8); c.lineTo(-8, -2.8); c.lineTo(-2.8, -2.8); c.closePath();
    c.fillStyle = HEAL_G; c.fill(); stroke(c, lw * 0.9 / (0.6 + h * 0.5));
    c.fillStyle = "rgba(255,255,255,.55)"; c.fillRect(-1.8, -6.4, 2.2, 3.2);
    c.restore();
  }
  // bílý praporek: jednotka málem padla, drží ho na straně od soupeře a vlaje jím (svět, střed jednotky = 0,0)
  function whiteFlag(c, kind, p, lw) {
    const D = DIMS[kind], hw = D.r || D.w / 2, s = p.dir, x = -s * (hw + 4), y0 = (D.r || D.h / 2) * 0.3, top = TOP[kind] - 2;
    const w = p.still ? 0 : Math.sin(p.t * 9);
    c.beginPath(); c.moveTo(x, y0); c.lineTo(x, top); stroke(c, lw * 2, INK);
    c.beginPath(); c.moveTo(x, y0); c.lineTo(x, top); stroke(c, lw * 0.9, "#B8763F");
    c.beginPath(); c.moveTo(x, top);
    c.bezierCurveTo(x - s * 6, top - 2 + w * 1.6, x - s * 12, top + 2 - w * 1.6, x - s * 18, top + w * 2.2);
    c.lineTo(x - s * 18, top + 12 + w * 2.2);
    c.bezierCurveTo(x - s * 12, top + 14 - w * 1.6, x - s * 6, top + 10 + w * 1.6, x, top + 12);
    c.closePath(); fillStroke(c, "#FFF8EA", lw * 0.7);
    ell(c, x, y0 - 7, 4.2, 4.8); fillStroke(c, p.col, lw * 0.7);
  }
  function drawUnit(c, kind, team, lw, o = {}) {
    if (!DIMS[kind]) kind = "C";
    const T = TEAM[team] || TEAM.x, tm = TEAM[team] ? team : "x", dir = tm === "x" ? 1 : -1, p = mood(o, T, dir);
    p.team = tm;
    c.save();
    if (p.trem) c.translate(p.trem, 0);
    else if (o.flag && !p.still && !p.ko) c.translate(Math.sin(p.t * 47) * 0.7, 0);   // málem padl: kolena se třesou
    if (o.heal > 0) aura(c, kind, o, p);
    if (kind === "S") drawS(c, T, lw, p, tm, o);
    else {
      const U = unitDim(kind), k = kind === "C" ? 1 : (U.r || DIMS[kind].r) / 19.5, l = lw / k, dodge = kind === "R" ? Math.max(0, Math.min(1, o.dodge || 0)) : 0;
      c.save();
      if (kind === "R") { c.translate(0, 14); c.scale(1 - dodge * 0.16, 1 + dodge * 0.42); c.translate(0, -14); }
      c.scale(k, k);
      const H = HOOK[kind] ? { ...HOOK[kind] } : {};
      if (kind === "K") { const post = H.post; H.post = (cc, TT, ll, pp) => post(cc, TT, ll, pp, tm === "x" ? -17.4 : -19.2); }
      if (kind === "R") {
        const ham = tm === "x";
        H.pre = (cc, TT, ll, pp) => { legs(cc, TT, ll, pp, dodge, ham); curlTail(cc, TT, ll, pp, dodge, ham); };
        const bandFn = (cc, TT, ll, pp) => {
          cc.save(); (ham ? ell(cc, 0, -5, 15.8, 15.2) : ell(cc, 0, -4.5 + 0.5, 15.6, 15.6)); cc.clip();
          const cyb = ham ? -5 : -4, rr = ham ? 11.6 : 11.2;
          cc.beginPath(); cc.arc(0, cyb, rr, Math.PI * 1.1, Math.PI * 1.9); stroke(cc, 6.6, INK);
          cc.beginPath(); cc.arc(0, cyb, rr, Math.PI * 1.1, Math.PI * 1.9); stroke(cc, 4.4, pp.ko ? "#E9E4EE" : "#FFF8EA");
          cc.beginPath(); cc.arc(0, cyb, rr + 0.9, Math.PI * 1.16, Math.PI * 1.5); stroke(cc, 1, "rgba(255,255,255,.9)");
          cc.restore();
          headband(cc, TT, ll, pp, ham);
        };
        if (ham) H.mid = bandFn; else H.band = bandFn;
      }
      if (kind === "T") {
        H.mid = (cc, TT, ll, pp) => {
          if (tm === "x") {
            // tmavší vnitřní obrys těla (týmová tmavá pod inkoustem)
            cc.save(); ell(cc, 0, 0.5, 19.5, 19.5); cc.clip(); ell(cc, 0, 0.5, 19.5, 19.5); cc.strokeStyle = pp.ko ? "#A99FB2" : TT.dd; cc.lineWidth = ll * 3; cc.globalAlpha = 0.55; cc.stroke(); cc.globalAlpha = 1; cc.restore();
            // chomáčky na tvářích
            const fill = pp.ko ? "#E9E4EE" : TT.belly;
            for (const s of [-1, 1]) {
              const cs = [[s * 12.4, -10, 3.1], [s * 13.8, -6.6, 3.3], [s * 11.8, -3.8, 2.9]];
              cc.beginPath(); for (const [x, y, r] of cs) { cc.moveTo(x + r, y); cc.arc(x, y, r, 0, TAU); }
              cc.lineJoin = "round"; stroke(cc, ll * 1.5); cc.fillStyle = fill; cc.fill();
            }
          }
        };
      }
      if (kind === "L") { H.capY = 0; }
      if (tm === "x") hamBase(c, T, l, p, hamGeo(kind, dir), H);
      else owlBase(c, T, l, p, owlGeo(kind, dir), H);
      c.restore();
    }
    // vznášející se „+“ a hvězdičky nad hlavou, bílý praporek „málem padl“
    if (!p.plain) {
      if (o.flag && !p.ko) whiteFlag(c, kind, p, lw);
      if (o.heal > 0) healPlus(c, kind, o, p, lw);
      if (p.dizzy || p.ko) {
        const top = TOP[kind];
        for (let i = 0; i < 3; i++) {
          const a = (p.still ? 0 : p.t * 4) + i * TAU / 3;
          star(c, Math.cos(a) * ORBIT[kind], top + Math.sin(a) * 3.2, 4.6, "#FFE27A", lw * 0.55);
        }
      }
    }
    c.restore();
  }
  const drawCritter = (c, team, lw, o) => drawUnit(c, "C", team, lw, o);

  // ---------- ježek ----------
  const HOGCOL = {
    n: { spike: "#6B4226", body: "#8A5A3B", face: "#FFE3BE" },
    k: { spike: "#566073", body: "#8791A4", face: "#DDE3EC" },
    g: { spike: "#1FA9A3", body: "#34C8C0", face: "#E5FFFB" },
    b: { spike: "#7A1F2A", body: "#E8413C", face: "#FFD9C0" },
    s: { spike: "#9AA6BA", body: "#FFD02B", face: "#FFF0B0" },
  };
  function drawHog(c, team, lw, type = "n", o = {}) {
    const H = (typeof JP !== "undefined" && JP.hogOf && JP.hogOf(type)) || { r: type === "s" ? 12 : 17 }, R = H.r, C = HOGCOL[type] || HOGCOL.n, t = o.t || 0;
    if (type === "s") { drawSpike(c, team, lw, R, C); return; }
    c.beginPath();
    if (type === "g") {
      for (let i = 0; i < 14; i++) { const a = i / 14 * TAU, x = Math.cos(a) * (R + 2.5), y = Math.sin(a) * (R + 2.5); c.moveTo(x + 5.4, y); c.arc(x, y, 5.4, 0, TAU); }
      c.fillStyle = C.spike; c.fill(); stroke(c, lw);
      circle(c, 0, 0, R + 1); c.fillStyle = C.spike; c.fill();
    } else {
      const n = type === "k" ? 20 : 28, tall = type === "k" ? 6 : 7.5;
      for (let i = 0; i < n; i++) { const a = i / n * TAU, rr = i % 2 ? R + 1 : R + tall; c.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
      c.closePath(); c.fillStyle = C.spike; c.fill(); stroke(c, lw);
    }
    circle(c, 0, 0, R - 1); c.fillStyle = C.body; c.fill();
    c.save(); circle(c, 0, 0, R - 1); c.clip();
    c.fillStyle = "rgba(43,22,56,.22)"; circle(c, 4, 4, R + 2); c.fill(); c.fillStyle = C.body; circle(c, -2, -2.5, R - 0.4); c.fill();
    if (type === "k") { c.fillStyle = "rgba(43,22,56,.22)"; for (const [x, y, s] of [[-8, -6, 2], [-3, 9, 1.6], [10, -9, 1.8], [-10, 6, 1.5]]) { circle(c, x, y, s); c.fill(); } }
    c.fillStyle = "rgba(255,255,255,.45)"; ell(c, -7, -8, 4.6, 2.6, -0.7); c.fill();
    c.restore();
    circle(c, 6, 4, R * 0.56); c.fillStyle = C.face; c.fill(); stroke(c, lw * 0.6);
    circle(c, R * 0.82, 6, 2.6); c.fillStyle = INK; c.fill();
    c.fillStyle = INK; circle(c, 7.2, 0.4, 2.2); c.fill(); c.fillStyle = "#fff"; circle(c, 7.8, -0.3, 0.8); c.fill();
    if (type === "k") { c.beginPath(); c.moveTo(3.4, -3.4); c.lineTo(10.6, -1.6); stroke(c, 1.9); }
    else if (type === "b") { c.beginPath(); c.moveTo(3.4, -2.6); c.lineTo(10.6, -4.4); stroke(c, 1.9); }
    else { c.strokeStyle = INK; c.lineWidth = 1.6; c.beginPath(); c.arc(7, 1, 2.9, Math.PI * 1.1, Math.PI * 1.9); c.stroke(); }
    c.beginPath(); c.arc(-4, 2, R - 3, Math.PI * 0.55, Math.PI * 0.95); c.strokeStyle = TEAM[team].c; c.lineWidth = 5; c.stroke();
    if (type === "b") {
      c.beginPath(); c.moveTo(-1, -R - 3); c.quadraticCurveTo(-7, -R - 9, -3, -R - 15); stroke(c, 3.2); c.strokeStyle = "#E9A55A"; c.lineWidth = 1.5; c.stroke();
      const f = 0.8 + 0.2 * Math.sin(t * 25);
      star(c, -3, -R - 17, 5 * f, "#FFD23C", lw * 0.45);
      circle(c, -3, -R - 17, 1.8 * f); c.fillStyle = "#fff"; c.fill();
    }
  }
  // Špičák: malý, žlutý, dlouhé ocelové hroty a špičatý čumák (silueta „šípek“, ve 24 px se nespletu s kulatými)
  function drawSpike(c, team, lw, R, C) {
    const N = 11, a0 = 0.28;
    // hroty (ocel), úzké a dlouhé
    const spikes = (len, base) => {
      c.beginPath();
      for (let i = 0; i < N; i++) {
        const a = a0 + i / N * TAU, b = a + TAU / N / 2;
        c.lineTo(Math.cos(a) * (R + len), Math.sin(a) * (R + len));
        c.lineTo(Math.cos(b) * (R + base), Math.sin(b) * (R + base));
      }
      c.closePath();
    };
    spikes(11.4, 0.2); c.fillStyle = C.spike; c.fill(); stroke(c, lw);
    // světlá hrana a tmavá hrana každého hrotu (hranatý kov)
    c.lineCap = "butt";
    for (let i = 0; i < N; i++) {
      const a = a0 + i / N * TAU, b = a - TAU / N / 2 * 0.62, d = a + TAU / N / 2 * 0.62;
      c.beginPath(); c.moveTo(Math.cos(b) * (R + 0.6), Math.sin(b) * (R + 0.6)); c.lineTo(Math.cos(a) * (R + 9.4), Math.sin(a) * (R + 9.4)); c.lineTo(Math.cos(a) * (R + 1.2), Math.sin(a) * (R + 1.2)); c.closePath();
      c.fillStyle = "rgba(255,255,255,.5)"; c.fill();
      c.beginPath(); c.moveTo(Math.cos(d) * (R + 0.6), Math.sin(d) * (R + 0.6)); c.lineTo(Math.cos(a) * (R + 9.4), Math.sin(a) * (R + 9.4)); c.lineTo(Math.cos(a) * (R + 1.2), Math.sin(a) * (R + 1.2)); c.closePath();
      c.fillStyle = "rgba(43,22,56,.28)"; c.fill();
    }
    // tělo + čumák dopředu (+x)
    c.beginPath(); c.moveTo(R - 3, -5.8); c.lineTo(R + 8.6, 2.4); c.lineTo(R - 3, 8.2); c.closePath(); fillStroke(c, C.face, lw * 0.9);
    circle(c, 0, 0, R - 0.6); c.fillStyle = C.body; c.fill();
    c.save(); circle(c, 0, 0, R - 0.6); c.clip();
    c.fillStyle = "rgba(43,22,56,.2)"; circle(c, 3.4, 3.4, R + 2); c.fill(); c.fillStyle = C.body; circle(c, -1.6, -2, R - 0.6); c.fill();
    c.fillStyle = "rgba(255,255,255,.55)"; ell(c, -4.4, -5.6, 3.4, 1.8, -0.7); c.fill();
    c.restore();
    circle(c, 0, 0, R - 0.6); stroke(c, lw);
    // tlapa čumáku přes tělo (bříško v tváři)
    c.beginPath(); c.moveTo(R - 4.2, -5); c.lineTo(R + 7.4, 2.4); c.lineTo(R - 4.2, 7); c.closePath(); c.fillStyle = C.face; c.fill();
    c.beginPath(); c.moveTo(R - 3.2, -5.8); c.lineTo(R + 8.6, 2.4); c.lineTo(R - 3.2, 8.2); stroke(c, lw * 0.9);
    circle(c, R + 8.2, 2.4, 1.7); c.fillStyle = INK; c.fill();
    // oko: přimhouřené, odhodlané
    c.fillStyle = INK; circle(c, 4.4, -1.4, 2); c.fill(); c.fillStyle = "#fff"; circle(c, 4.9, -2, 0.75); c.fill();
    c.beginPath(); c.moveTo(1.2, -4.8); c.lineTo(7.4, -2.4); stroke(c, 1.9);
    // týmový pásek na zádech
    c.beginPath(); c.arc(-1.6, 1, R - 3.4, Math.PI * 0.6, Math.PI * 0.98); c.strokeStyle = TEAM[team].c; c.lineWidth = 3.4; c.stroke();
  }

  // ---------- kostky ----------
  const MATCOL = { w: ["#EDAC62", "#C77F35"], s: ["#B2BCCC", "#7D889A"], g: ["rgba(196,242,255,.7)", "rgba(110,190,222,.95)"], i: ["rgba(214,234,255,.86)", "rgba(122,168,226,.95)"], m: ["#9AAEC6", "#5B6F8A"] };
  function cracks(c, w, h, dmg, seed, glass) {
    const n = dmg > 0.75 ? 4 : dmg > 0.5 ? 3 : dmg > 0.25 ? 2 : 1;
    const draw = (col, lw0, off) => {
      const rr = rng(seed);
      c.strokeStyle = col; c.lineWidth = lw0; c.lineCap = "round"; c.lineJoin = "round";
      for (let i = 0; i < n; i++) {
        const side = Math.floor(rr() * 4), u = rr() - 0.5;
        let x = side % 2 ? (side === 1 ? w / 2 : -w / 2) : u * w, y = side % 2 ? u * h : (side === 0 ? -h / 2 : h / 2);
        const tx = (rr() - 0.5) * w * 0.3, ty = (rr() - 0.5) * h * 0.3, len = 3 + Math.floor(rr() * 2) + (dmg > 0.5 ? 1 : 0);
        c.beginPath(); c.moveTo(x + off, y + off);
        for (let k = 1; k <= len; k++) { x += (tx - x) / (len - k + 1) + (rr() - 0.5) * 7; y += (ty - y) / (len - k + 1) + (rr() - 0.5) * 7; c.lineTo(x + off, y + off); if (k === 2 && rr() < 0.7) { c.moveTo(x + off, y + off); c.lineTo(x + (rr() - 0.5) * 16 + off, y + (rr() - 0.5) * 16 + off); c.moveTo(x + off, y + off); } }
        c.stroke();
      }
    };
    draw(glass ? "rgba(255,255,255,.9)" : "rgba(255,255,255,.4)", 1.6, 1);
    draw(INK, 1.4, 0);
  }
  // šestiramenná vločka (led)
  function flake(c, x, y, r, col, w) {
    c.strokeStyle = col; c.lineWidth = w; c.lineCap = "round";
    for (let i = 0; i < 3; i++) {
      const a = i * Math.PI / 3, dx = Math.cos(a) * r, dy = Math.sin(a) * r;
      c.beginPath(); c.moveTo(x - dx, y - dy); c.lineTo(x + dx, y + dy); c.stroke();
      for (const s of [-1, 1]) { const bx = x + dx * 0.55 * s, by = y + dy * 0.55 * s, na = a + Math.PI / 2.6; for (const q of [-1, 1]) { c.beginPath(); c.moveTo(bx, by); c.lineTo(bx + Math.cos(a * 1 + q * 0.9) * r * 0.34 * s, by + Math.sin(a + q * 0.9) * r * 0.34 * s); c.stroke(); } }
    }
  }
  function drawBlock(c, k, lw, dmg = 0, seed = 1) {
    const K = JP.KIND[k], w = K.w, h = K.h, [fill, dark] = MATCOL[K.m], rad = K.m === "s" ? 6 : K.m === "m" ? 2.6 : K.m === "i" ? 4.2 : 3.2;
    rrect(c, -w / 2, -h / 2, w, h, rad); c.fillStyle = fill; c.fill();
    c.save(); c.clip();
    const b = Math.min(5, h * 0.26, w * 0.26);
    // světlo vlevo nahoře, stín vpravo dole
    c.fillStyle = "rgba(255,255,255,.3)"; c.fillRect(-w / 2, -h / 2, w, b); c.fillStyle = "rgba(255,255,255,.14)"; c.fillRect(-w / 2, -h / 2, b, h);
    c.fillStyle = "rgba(43,22,56,.17)"; c.fillRect(-w / 2, h / 2 - b, w, b); c.fillStyle = "rgba(43,22,56,.1)"; c.fillRect(w / 2 - b, -h / 2, b, h);
    const long = w > h, L = long ? w : h, S = long ? h : w;
    if (K.m === "w") {
      c.strokeStyle = dark; c.lineWidth = 1.5;
      for (let i = 1; i <= 2; i++) { const o = -S / 2 + S * i / 3; c.beginPath(); if (long) { c.moveTo(-L / 2 + 10, o); c.bezierCurveTo(-L / 6, o + 2, L / 6, o - 2, L / 2 - 10, o); } else { c.moveTo(o, -L / 2 + 10); c.bezierCurveTo(o + 2, -L / 6, o - 2, L / 6, o, L / 2 - 10); } c.stroke(); }
      if (L > 150) { ell(c, long ? L * 0.18 : 0, long ? 0 : L * 0.18, 4.6, 2.6, long ? 0 : Math.PI / 2); c.strokeStyle = dark; c.lineWidth = 1.4; c.stroke(); }
      else if (w === h) { ell(c, 5, -4, 4.4, 3, 0.5); c.strokeStyle = dark; c.lineWidth = 1.4; c.stroke(); circle(c, 5, -4, 1.1); c.fillStyle = dark; c.fill(); }
      c.fillStyle = dark;
      for (const s of [-1, 1]) { const x = long ? s * (L / 2 - 6) : 0, y = long ? 0 : s * (L / 2 - 6); circle(c, x, y, 1.7); c.fill(); c.fillStyle = "rgba(255,255,255,.55)"; circle(c, x - 0.5, y - 0.5, 0.6); c.fill(); c.fillStyle = dark; }
    } else if (K.m === "s") {
      c.strokeStyle = "rgba(255,255,255,.34)"; c.lineWidth = 1.5; c.strokeRect(-w / 2 + 5, -h / 2 + 5, w - 10, h - 10);
      const R = rng(seed + 3); c.fillStyle = dark;
      for (let i = 0; i < 6; i++) { circle(c, (R() - 0.5) * w * 0.78, (R() - 0.5) * h * 0.78, 1.2 + R() * 1.1); c.fill(); }
    } else if (K.m === "i") {
      // led: mléčně světle modrý, fasetované plochy, mrazivé tečky a vločky; žádné jedno dlouhé „sklo“ úhlopříčky
      const R = rng(seed + 11);
      c.fillStyle = "rgba(255,255,255,.4)";
      c.beginPath(); c.moveTo(-w / 2, -h / 2); c.lineTo(-w / 2 + L * 0.34 * (long ? 1 : 0.5) + 6, -h / 2); c.lineTo(-w / 2, -h / 2 + (long ? S * 0.9 : L * 0.2)); c.closePath(); c.fill();
      c.fillStyle = "rgba(112,160,224,.28)";
      c.beginPath(); c.moveTo(w / 2, h / 2); c.lineTo(w / 2 - (long ? L * 0.28 : S * 0.95), h / 2); c.lineTo(w / 2, h / 2 - (long ? S * 0.9 : L * 0.2)); c.closePath(); c.fill();
      c.strokeStyle = "rgba(255,255,255,.7)"; c.lineWidth = 1;
      c.beginPath(); c.moveTo(-w / 2 + 3, long ? -1 : -h * 0.2); c.lineTo(long ? -w * 0.1 : 3, long ? h / 2 - 4 : -h * 0.05); c.moveTo(long ? w * 0.16 : -S / 2 + 2, long ? -h / 2 + 3 : h * 0.18); c.lineTo(long ? w * 0.3 : S / 2 - 2, long ? 2 : h * 0.3); c.stroke();
      c.fillStyle = "rgba(255,255,255,.92)";
      for (let i = 0; i < Math.min(14, 4 + L / 10); i++) { circle(c, (R() - 0.5) * (w - 6), (R() - 0.5) * (h - 6), 0.6 + R() * 0.8); c.fill(); }
      if (S >= 18) { const n = L > 80 ? 2 : 1; for (let i = 0; i < n; i++) { const fx = long ? (i - (n - 1) / 2) * L * 0.34 + L * 0.06 : 0, fy = long ? 0 : (i - (n - 1) / 2) * L * 0.34 + (n === 1 ? -L * 0.08 : 0); flake(c, fx, fy, Math.min(S, 40) * (S < 24 ? 0.26 : 0.2) + 2.2, "rgba(255,255,255,.95)", 1.1); } }
      c.strokeStyle = "rgba(255,255,255,.75)"; c.lineWidth = 1.5; c.strokeRect(-w / 2 + 3, -h / 2 + 3, w - 6, h - 6);
      c.beginPath(); c.moveTo(-w / 2 + 6, -h / 2 + 3); c.lineTo(-w / 2 + 6 + Math.min(14, L * 0.3), -h / 2 + 3); stroke(c, 2.4, "rgba(255,255,255,1)");
    } else if (K.m === "m") {
      // kov: široké zkosení, rýhy broušení, nýty v rozích, ostrý lesk
      const e = Math.min(4.2, S * 0.2);
      c.fillStyle = "rgba(255,255,255,.34)"; c.beginPath(); c.moveTo(-w / 2, -h / 2); c.lineTo(w / 2, -h / 2); c.lineTo(w / 2 - e, -h / 2 + e); c.lineTo(-w / 2 + e, -h / 2 + e); c.lineTo(-w / 2 + e, h / 2 - e); c.lineTo(-w / 2, h / 2); c.closePath(); c.fill();
      c.fillStyle = "rgba(43,22,56,.3)"; c.beginPath(); c.moveTo(w / 2, h / 2); c.lineTo(-w / 2, h / 2); c.lineTo(-w / 2 + e, h / 2 - e); c.lineTo(w / 2 - e, h / 2 - e); c.lineTo(w / 2 - e, -h / 2 + e); c.lineTo(w / 2, -h / 2); c.closePath(); c.fill();
      c.strokeStyle = "rgba(43,22,56,.4)"; c.lineWidth = 1; c.strokeRect(-w / 2 + e, -h / 2 + e, w - 2 * e, h - 2 * e);
      c.strokeStyle = "rgba(255,255,255,.22)"; c.lineWidth = 0.9;
      if (long) { for (let y = -h / 2 + e + 3; y < h / 2 - e - 1; y += 3.2) { c.beginPath(); c.moveTo(-w / 2 + e + 8, y); c.lineTo(w / 2 - e - 8, y); c.stroke(); } }
      else { for (let x = -w / 2 + e + 3; x < w / 2 - e - 1; x += 3.2) { c.beginPath(); c.moveTo(x, -h / 2 + e + 8); c.lineTo(x, h / 2 - e - 8); c.stroke(); } }
      // šikmý lesk
      c.fillStyle = "rgba(255,255,255,.4)"; const sh = Math.min(w, h);
      c.beginPath(); c.moveTo(-w / 2 + sh * 0.3, h / 2); c.lineTo(-w / 2 + sh * 0.3 + 4.2, h / 2); c.lineTo(-w / 2 + sh * 0.3 + 4.2 + sh * 0.9, -h / 2); c.lineTo(-w / 2 + sh * 0.3 + sh * 0.9, -h / 2); c.closePath(); c.fill();
      if (sh > 30) { c.beginPath(); c.moveTo(-w / 2 + sh * 0.3 + 7.4, h / 2); c.lineTo(-w / 2 + sh * 0.3 + 9, h / 2); c.lineTo(-w / 2 + sh * 0.3 + 9 + sh * 0.9, -h / 2); c.lineTo(-w / 2 + sh * 0.3 + 7.4 + sh * 0.9, -h / 2); c.closePath(); c.fill(); }
      // nýty
      const rv = (x, y) => { circle(c, x, y, 1.9); c.fillStyle = "#6E819B"; c.fill(); stroke(c, 0.9, "rgba(43,22,56,.7)"); c.fillStyle = "rgba(255,255,255,.85)"; circle(c, x - 0.6, y - 0.6, 0.65); c.fill(); };
      const q = e + 3.4;
      if (w > 30 && h > 30) for (const sx of [-1, 1]) for (const sy of [-1, 1]) rv(sx * (w / 2 - q), sy * (h / 2 - q));
      else if (long) for (const s of [-1, 1]) rv(s * (w / 2 - q - 2), 0);
      else for (const s of [-1, 1]) rv(0, s * (h / 2 - q - 2));
      if (!long && h > 60) { rv(0, 0); }
    } else {
      c.strokeStyle = "rgba(255,255,255,.95)"; c.lineWidth = 3;
      const m = Math.min(w, h);
      if (S < 24) {        // tenký skleněný sloup/deska: dva krátké šikmé odlesky místo jedné dlouhé úhlopříčky
        const sl = Math.min(m * 0.9, 14);
        for (const [off, ln] of long ? [[-L / 2 + 10, 1], [-L / 2 + 22, 0.55], [L * 0.2, 1], [L * 0.2 + 12, 0.55]] : [[-L / 2 + 14, 1], [-L / 2 + 28, 0.55], [L * 0.1, 1], [L * 0.1 + 14, 0.55]]) {
          c.lineWidth = ln > 0.9 ? 2.6 : 1.3; c.beginPath();
          if (long) { c.moveTo(off, S / 2 - 3); c.lineTo(off + sl * 0.9, -S / 2 + 3); } else { c.moveTo(-S / 2 + 3, off + sl * 0.9); c.lineTo(S / 2 - 3, off); }
          c.stroke();
        }
      } else {
        c.beginPath();
        c.moveTo(-w / 2 + m * 0.28, h / 2 - 3); c.lineTo(w / 2 - 3, -h / 2 + m * 0.28); c.stroke();
        c.lineWidth = 1.4; c.beginPath(); c.moveTo(-w / 2 + m * 0.5, h / 2 - 3); c.lineTo(w / 2 - 3, -h / 2 + m * 0.5); c.stroke();
      }
      c.strokeStyle = "rgba(255,255,255,.6)"; c.lineWidth = 1.6; c.strokeRect(-w / 2 + 3, -h / 2 + 3, w - 6, h - 6);
    }
    if (dmg > 0.18) { if (dmg > 0.5) { c.fillStyle = "rgba(43,22,56,.09)"; c.fillRect(-w / 2, -h / 2, w, h); } cracks(c, w, h, dmg, seed, K.m === "g" || K.m === "i"); }
    c.restore();
    rrect(c, -w / 2, -h / 2, w, h, rad); stroke(c, lw);
  }

  window.ART = { INK, TEAM, drawUnit, drawCritter, drawHog, drawBlock, MATCOL, crown, star, sweat, circle, stroke, rrect, rng };
})();
