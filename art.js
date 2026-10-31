// Ježkomet – kreslení postaviček, ježků a kostek (canvas, po vrstvách, žádné bitmapy).
// Světlo vlevo nahoře, stín vpravo dole, obrys v inkoustu. Stav postavičky (výraz) dostává funkce v objektu `o`;
// drží ho renderer, do synchronizovaného dokumentu nejde nic.
(() => {
  "use strict";
  const INK = "#2B1638", TAU = Math.PI * 2;
  const TEAM = {
    x: { c: "#FF7A2F", d: "#D9541A", dd: "#A93A0E", hi: "#FFB68A", belly: "#FFE0B8", bellyD: "#F5BE86", pink: "#FF8FA8", name: "Křečci" },
    o: { c: "#9B6BFF", d: "#7346D9", dd: "#52289F", hi: "#CDB4FF", belly: "#EADFFF", bellyD: "#CDB6F5", beak: "#FFB020", beakD: "#E08A00", name: "Sovičky" },
  };
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
  // ---------- postavička ----------
  // o: { hurt, lookX, lookY, blink, fear, hit, cheer, sad, startle, ko, t, still }
  function drawCritter(c, team, lw, o = {}) {
    const T = TEAM[team], r = 19.5, dir = team === "x" ? 1 : -1;
    const hurt = o.hurt || 0, fear = o.fear || 0, hit = o.hit || 0, cheer = o.cheer || 0, sad = o.sad || 0, startle = o.startle || 0, t = o.t || 0, still = !!o.still;
    const ko = !!o.ko, look = [(o.lookX || 0) * 1.6, (o.lookY || 0) * 1.2];
    const squeeze = hit > 0.35 && !ko, dizzy = ko || hurt > 0.8;
    const happy = !squeeze && !dizzy && cheer > 0.15;
    const half = !squeeze && !dizzy && !happy && (hurt > 0.5 || sad > 0.3);
    const wide = !squeeze && !dizzy && !happy && !half && (fear > 0.35 || startle > 0.3);
    const style = dizzy ? (ko ? "dizzy" : "half") : squeeze ? "squeeze" : happy ? "happy" : half ? "half" : "open";
    const lid = o.blink || 0;
    const trem = still ? 0 : (fear > 0.5 ? Math.sin(t * 60) * fear * 0.9 : 0);
    const col = ko ? "#CFC7D6" : T.c;
    if (trem) c.translate(trem, 0);

    if (team === "x") drawHamster(c, T, lw, { r, dir, hurt, fear, hit, cheer, sad, startle, t, still, look, style, wide, lid, ko, happy, half, squeeze, dizzy, col });
    else drawOwl(c, T, lw, { r, dir, hurt, fear, hit, cheer, sad, startle, t, still, look, style, wide, lid, ko, happy, half, squeeze, dizzy, col });

    // zranění a emoce nad obličejem
    if (o.plain) return;
    if (hurt > 0.28 && !ko) plaster(c, team === "x" ? 9 : -9, team === "x" ? 6.5 : 7, team === "x" ? -0.5 : 0.5, lw);
    if (fear > 0.45 && !squeeze) sweat(c, dir * -15, -9 + (still ? 0 : Math.sin(t * 9) * 0.8), 1, lw);
    if ((dizzy || ko) && true) {
      for (let i = 0; i < 3; i++) {
        const a = (still ? 0 : t * 4) + i * TAU / 3;
        star(c, Math.cos(a) * 13, -r - 7 + Math.sin(a) * 3.2, 4.6, "#FFE27A", lw * 0.55);
      }
    }
  }

  function drawHamster(c, T, lw, p) {
    const { r, dir, hurt, fear, hit, cheer, sad, still, t, look, style, wide, lid, ko, happy, half, squeeze, dizzy, col } = p;
    const belly = ko ? "#E9E4EE" : T.belly;
    // ocásek a nožky (za tělem)
    circle(c, -dir * 17, 11, 4.6); fillStroke(c, col, lw * 0.8);
    for (const s of [-1, 1]) { ell(c, s * 8, 16.6, 6.4, 3.8); fillStroke(c, ko ? "#E9E4EE" : T.belly, lw * 0.8); }
    // uši
    const spread = fear * 2.2 + hit * 1.5, drop = fear * 3 + hurt * 2 + (squeeze ? 2 : 0);
    for (const s of [-1, 1]) {
      circle(c, s * (11.6 + spread), -14 + drop, 7.6); fillStroke(c, col, lw);
      circle(c, s * (11.6 + spread), -13.6 + drop, 4.1); c.fillStyle = ko ? "#E1D9E6" : T.pink; c.fill();
    }
    // tělo
    ell(c, 0, 1, r, r - 0.5);
    c.fillStyle = col; c.fill();
    c.save(); c.clip();
    c.fillStyle = ko ? "#A99FB2" : T.d; c.fillRect(-26, -26, 52, 52);
    c.fillStyle = col; circle(c, -3.2, -4, r + 0.4); c.fill();
    c.fillStyle = ko ? "#E9E4EE" : T.belly; ell(c, dir * 1.5, 9, 12.5, 9.8); c.fill();   // bříško
    c.fillStyle = ko ? "#D7CFDD" : T.bellyD; ell(c, dir * 2.5, 12.5, 10.5, 5.2); c.fill();
    c.fillStyle = col; ell(c, dir * 1.5, 7.2, 12.8, 8.8); c.fill();
    c.fillStyle = belly; ell(c, dir * 1.5, 8.6, 11.8, 8.8); c.fill();
    if (!ko) { c.fillStyle = "rgba(255,255,255,.34)"; ell(c, -8.4, -9.6, 5.6, 3, -0.7); c.fill(); }
    c.restore();
    ell(c, 0, 1, r, r - 0.5); stroke(c, lw);
    if (!ko) { c.fillStyle = "rgba(255,255,255,.8)"; circle(c, -12.3, -4.6, 1.3); c.fill(); }
    // obvaz přes čelo (málem KO)
    if (hurt > 0.55 && !ko) {
      c.save(); ell(c, 0, 1, r, r - 0.5); c.clip();
      c.beginPath(); c.arc(0, 1, r - 5, Math.PI * 1.1, Math.PI * 1.9); stroke(c, 9.5, INK);
      c.beginPath(); c.arc(0, 1, r - 5, Math.PI * 1.1, Math.PI * 1.9); stroke(c, 6.2, "#FFF8EA");
      c.beginPath(); c.arc(0, 1, r - 5, Math.PI * 1.1, Math.PI * 1.9); c.setLineDash([2, 5]); stroke(c, 5, "rgba(43,22,56,.18)"); c.setLineDash([]);
      c.restore();
    }
    // tvář
    const ex = 6.8, ey = -2.4, es = wide ? 5.1 : 4.4, pr = look;
    if (!ko && !squeeze && !happy) { c.fillStyle = "rgba(255,90,120,.4)"; for (const s of [-1, 1]) { ell(c, s * 12.2, 4.2, 3.6, 2.4); c.fill(); } }
    if (happy) { c.fillStyle = "rgba(255,90,120,.55)"; for (const s of [-1, 1]) { ell(c, s * 12.2, 4.2, 4, 2.7); c.fill(); } }
    for (const s of [-1, 1]) beadEye(c, s * ex, ey, es, style, s, pr, lid, lw);
    // obočí
    if (!ko && (fear > 0.35 || hurt > 0.3 || sad > 0.3 || hit > 0.35) && !happy) for (const s of [-1, 1]) {
      c.beginPath(); c.moveTo(s * ex + s * 4, ey - 7.6 + (hit > 0.35 ? 2 : 0)); c.lineTo(s * ex - s * 3.4, ey - 9.4 - (hit > 0.35 ? -1 : 0.6) ); stroke(c, 1.9);
    }
    // nos, zuby, pusa
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
    // tlapky
    const paw = (x, y, rot) => { c.save(); c.translate(x, y); c.rotate(rot); ell(c, 0, 0, 4.4, 5.6); fillStroke(c, col, lw * 0.85); c.strokeStyle = INK; c.lineWidth = 1; for (const d of [-1.6, 0, 1.6]) { c.beginPath(); c.moveTo(d, 2.6); c.lineTo(d, 4.6); c.stroke(); } c.restore(); };
    if (happy) { paw(-15.6, -3 - (still ? 0 : Math.abs(Math.sin(t * 12)) * 3), -0.7); paw(15.6, -3 - (still ? 0 : Math.abs(Math.sin(t * 12 + 1)) * 3), 0.7); }
    else if (sad > 0.3 && !ko) { paw(dir * 5.5, -1.5, 0.2); paw(-dir * 16.5, 9, 0.5); }
    else if (fear > 0.45) { paw(-11, 8.5, -0.3); paw(11, 8.5, 0.3); }
    else { paw(-16.4, 7.5, 0.5); paw(16.4, 7.5, -0.5); }
  }

  function drawOwl(c, T, lw, p) {
    const { r, dir, hurt, fear, hit, cheer, sad, still, t, look, style, wide, lid, ko, happy, half, squeeze, dizzy, col } = p;
    const face = ko ? "#E9E4EE" : T.belly, dark = ko ? "#A99FB2" : T.d;
    // ocas a pařátky
    for (const k of [-1, 0, 1]) { c.beginPath(); c.moveTo(k * 4 - dir * 6, 12); c.lineTo(k * 6 - dir * 9, 22.5); c.lineTo(k * 6 - dir * 2, 21); c.closePath(); fillStroke(c, ko ? "#B8AEC0" : T.dd, lw * 0.75); }
    for (const s of [-1, 1]) {
      c.beginPath(); c.moveTo(s * 8 - 4, 17); c.lineTo(s * 8 - 4, 20.4); c.moveTo(s * 8, 17); c.lineTo(s * 8, 21); c.moveTo(s * 8 + 4, 17); c.lineTo(s * 8 + 4, 20.4);
      stroke(c, 3.6, INK); c.strokeStyle = ko ? "#ccc" : T.beak; c.lineWidth = 1.6; c.stroke();
    }
    // chocholky
    const drop = fear * 2 + hurt * 2;
    for (const s of [-1, 1]) {
      c.beginPath(); c.moveTo(s * 5.5, -15.5 + drop); c.quadraticCurveTo(s * 9, -22 + drop, s * 15.6, -26 + drop * 0.6); c.quadraticCurveTo(s * 18.6, -17, s * 16.4, -9.6 + drop); c.closePath();
      fillStroke(c, col, lw);
      c.beginPath(); c.moveTo(s * 9.4, -17 + drop); c.quadraticCurveTo(s * 12, -20.5 + drop, s * 14.4, -22.6 + drop); stroke(c, 1.5, ko ? "#A99FB2" : T.dd);
    }
    // tělo
    ell(c, 0, 0.5, r, r);
    c.fillStyle = col; c.fill();
    c.save(); c.clip();
    c.fillStyle = dark; c.fillRect(-26, -26, 52, 52);
    c.fillStyle = col; circle(c, -3.2, -4, r + 0.4); c.fill();
    // hruď s pírky
    c.fillStyle = face; ell(c, 0, 10, 11.5, 10.5); c.fill();
    c.strokeStyle = ko ? "#B8AEC0" : T.bellyD; c.lineWidth = 1.5; c.lineCap = "round";
    for (const [x, y] of [[-5, 8.6], [5, 8.6], [0, 13.2], [-8, 14], [8, 14]]) { c.beginPath(); c.moveTo(x - 2.7, y - 1.4); c.lineTo(x, y + 1.6); c.lineTo(x + 2.7, y - 1.4); c.stroke(); }
    if (!ko) { c.fillStyle = "rgba(255,255,255,.34)"; ell(c, -8.4, -10, 5.4, 2.9, -0.7); c.fill(); }
    c.restore();
    ell(c, 0, 0.5, r, r); stroke(c, lw);
    // obvaz
    if (hurt > 0.55 && !ko) {
      c.save(); ell(c, 0, 0.5, r, r); c.clip();
      c.beginPath(); c.arc(0, 1, r - 4, Math.PI * 1.08, Math.PI * 1.92); stroke(c, 9.5, INK);
      c.beginPath(); c.arc(0, 1, r - 4, Math.PI * 1.08, Math.PI * 1.92); stroke(c, 6.2, "#FFF8EA");
      c.beginPath(); c.arc(0, 1, r - 4, Math.PI * 1.08, Math.PI * 1.92); c.setLineDash([2, 5]); stroke(c, 5, "rgba(43,22,56,.18)"); c.setLineDash([]);
      c.restore();
    }
    // obličejový terč a oči
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
    // křídla
    const wing = (s, ang) => {
      c.save(); c.translate(s * 15, -1); c.rotate(ang);
      c.beginPath(); c.moveTo(0, -3); c.quadraticCurveTo(s * 11, 1, s * 7.6, 15); c.quadraticCurveTo(s * 1.6, 11, 0, 8); c.closePath();
      fillStroke(c, dark, lw * 0.85);
      c.beginPath(); c.moveTo(s * 2.6, 1); c.quadraticCurveTo(s * 7, 4, s * 5.4, 11); stroke(c, 1.4, ko ? "#B8AEC0" : T.c);
      c.restore();
    };
    if (happy) { const f = still ? 0 : Math.sin(t * 14) * 0.25; wing(-1, 0.4 + 1.5 + f); wing(1, -0.4 - 1.5 - f); }
    else if (sad > 0.3 && !ko) {
      wing(-dir, dir * 0.2);
      c.save(); c.translate(dir * 7, -2); c.rotate(dir * 0.15); c.beginPath(); c.moveTo(-3.5, -7); c.quadraticCurveTo(dir * 8, -6, dir * 5, 10); c.quadraticCurveTo(-4, 9, -3.5, -7); c.closePath(); fillStroke(c, dark, lw * 0.85); c.restore();
    }
    else if (fear > 0.45) { wing(-1, -0.25); wing(1, 0.25); }
    else { wing(-1, 0.05); wing(1, -0.05); }
  }

  // ---------- ježek ----------
  const HOGCOL = {
    n: { spike: "#6B4226", body: "#8A5A3B", face: "#FFE3BE" },
    k: { spike: "#566073", body: "#8791A4", face: "#DDE3EC" },
    g: { spike: "#1FA9A3", body: "#34C8C0", face: "#E5FFFB" },
    b: { spike: "#7A1F2A", body: "#E8413C", face: "#FFD9C0" },
  };
  function drawHog(c, team, lw, type = "n", o = {}) {
    const H = (window.JP && JP.hogOf(type)) || { r: 17 }, R = H.r, C = HOGCOL[type] || HOGCOL.n, t = o.t || 0;
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

  // ---------- kostky ----------
  const MATCOL = { w: ["#EDAC62", "#C77F35"], s: ["#B2BCCC", "#7D889A"], g: ["rgba(196,242,255,.7)", "rgba(110,190,222,.95)"] };
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
  function drawBlock(c, k, lw, dmg = 0, seed = 1) {
    const K = JP.KIND[k], w = K.w, h = K.h, [fill, dark] = MATCOL[K.m], rad = K.m === "s" ? 6 : 3.2;
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
      c.fillStyle = dark;
      for (const s of [-1, 1]) { const x = long ? s * (L / 2 - 6) : 0, y = long ? 0 : s * (L / 2 - 6); circle(c, x, y, 1.7); c.fill(); c.fillStyle = "rgba(255,255,255,.55)"; circle(c, x - 0.5, y - 0.5, 0.6); c.fill(); c.fillStyle = dark; }
    } else if (K.m === "s") {
      c.strokeStyle = "rgba(255,255,255,.34)"; c.lineWidth = 1.5; c.strokeRect(-w / 2 + 5, -h / 2 + 5, w - 10, h - 10);
      const R = rng(seed + 3); c.fillStyle = dark;
      for (let i = 0; i < 6; i++) { circle(c, (R() - 0.5) * w * 0.78, (R() - 0.5) * h * 0.78, 1.2 + R() * 1.1); c.fill(); }
    } else {
      c.strokeStyle = "rgba(255,255,255,.95)"; c.lineWidth = 3; c.beginPath(); const m = Math.min(w, h);
      c.moveTo(-w / 2 + m * 0.28, h / 2 - 3); c.lineTo(w / 2 - 3, -h / 2 + m * 0.28); c.stroke();
      c.lineWidth = 1.4; c.beginPath(); c.moveTo(-w / 2 + m * 0.5, h / 2 - 3); c.lineTo(w / 2 - 3, -h / 2 + m * 0.5); c.stroke();
      c.strokeStyle = "rgba(255,255,255,.6)"; c.lineWidth = 1.6; c.strokeRect(-w / 2 + 3, -h / 2 + 3, w - 6, h - 6);
    }
    if (dmg > 0.18) { if (dmg > 0.5) { c.fillStyle = "rgba(43,22,56,.09)"; c.fillRect(-w / 2, -h / 2, w, h); } cracks(c, w, h, dmg, seed, K.m === "g"); }
    c.restore();
    rrect(c, -w / 2, -h / 2, w, h, rad); stroke(c, lw);
  }

  window.ART = { INK, TEAM, drawCritter, drawHog, drawBlock, MATCOL, star, circle, stroke, rrect, rng };
})();
