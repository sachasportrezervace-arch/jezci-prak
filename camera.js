// Ježkomet – kamera (bez DOM, bez znalosti pravidel hry). Používá game.js, jde ji spustit i v Node (testy).
//
// const cam = JPCam.create({ W, GY, SLING, ZONE, CR });   // rozměry světa z engine.js
//
// Rozvržení a mapování
//   cam.resize(cw, ch)                  velikost plátna v CSS px; kamera naskočí na cíl bez přechodu
//   cam.toScreen(x, y) -> [sx, sy]      svět → obrazovka;  cam.toWorld(sx, sy) -> [x, y]
//   cam.x, cam.y, cam.s                 střed (svět x), svislý posun (svět), měřítko; jen ke čtení
//   cam.portrait(), cam.overview(), cam.homeS()   na výšku? / měřítko celé scény / měřítko výchozího záběru na výšku
//   cam.restView(team) -> {x, s}        výchozí pohled pro tým na tahu (na výšku pevnost a prak, jinak celá scéna)
// Snímek
//   cam.update(dt, intent)              dt v sekundách; intent = {
//                                         rest: {x, s},                       výchozí pohled (z restView)
//                                         reduced: bool,                      prefers-reduced-motion: jen krátké přechody
//                                         shot: null | { team, waiting, hog } probíhající výstřel; hog = null | {x, y, vx, vy}
//                                       }                                      (vx, vy ve světě za sekundu)
//   cam.snapNext()                      příští update bez přechodu (nová hra, otočení)
//   cam.impact(power 0..1)              krátký záškub přiblížení při velkém dopadu (u reduced se ignoruje)
// Uživatel (kdykoli, i za letu: převezme kameru, automatika se vypne, dokud ji nevrátí release() nebo tlačítko)
//   cam.panTo(cx0, dxScreen)            posun, cx0 = střed při začátku tahu
//   cam.pinchStart(a, b), cam.pinchMove(a, b), cam.pinchEnd()    a, b = [sx, sy] dvou prstů
//   cam.zoomAt(sx, factor)              kolečko myši
//   cam.release(), cam.isManual()       vrátí automatiku / je kamera ruční?
//   cam.button(team) -> {label, plus}   stav tlačítka přehledu;  cam.toggle(team, mySlingX) = jeho kliknutí:
//                                         ruční → zpět na automatiku, automatika → celá scéna (na výšku) nebo přiblížení (jinak)
// Pohyb: kritické tlumení (SmoothDamp) nezávislé na snímkové frekvenci, žádné skoky mezi cíli. Za letu střed sleduje ježka
// s předstihem ve směru letu, měřítko se zmenšuje s rychlostí a výškou, při velkém výšce se posune i svisle; po dopadu
// krátce zůstane a pomalu se vrátí na výchozí pohled.
(function (root) {
  "use strict";
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  // kriticky tlumená pružina: [nová hodnota, nová rychlost]
  function smooth(cur, vel, target, st, dt) {
    st = Math.max(0.0001, st);
    const w = 2 / st, x = w * dt, e = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
    const ch = cur - target, tmp = (vel + w * ch) * dt;
    return [target + (ch + tmp) * e, (vel - w * tmp) * e];
  }

  function create(cfg) {
    const { W, GY, SLING, ZONE } = cfg;
    const other = t => t === "x" ? "o" : "x";
    const LEAD = 0.22, HUGE = 1200;           // předstih (s) a rychlost ježka při plné síle (svět/s), z ní se odvozuje zoom
    let cw = 1, ch = 1;
    const c = { x: W / 2, y: 0, s: 0.5, vx: 0, vy: 0, vs: 0 };
    let manual = null, pinch = null, needSnap = true, kick = 0, holdT = 0, holdX = W / 2, holdS = 0.5, hadHog = false;

    // ----- rozvržení -----
    c.portrait = () => ch > cw * 1.1;
    c.overview = () => Math.min(cw / 1440, (ch - 80) / 640);
    const groundHome = () => ch - clamp(ch * 0.115, 72, 104);   // na výšku: zem u spodku, pod ní pruh hlíny pro nápovědu a měřič
    // postavička ≥ ~36 px na iPhonu 13; shora zůstane místo pro HUD a panely nad pevností
    c.homeS = () => clamp(Math.min(cw / 400, (groundHome() - 285) / 312), c.overview(), 2.4);
    const flightBase = () => Math.max(c.overview(), Math.min(cw / 900, (ch - 60) / 560));
    const minS = () => c.overview() * 0.9;
    const maxS = () => Math.max(c.overview() * 3.2, 1.2, c.portrait() ? c.homeS() * 1.8 : 0);
    // y světa GY+70 leží na této výšce obrazovky pro měřítko s; na výšku zem stojí dole a při oddálení se zvedá do poloviny výšky
    function anchorAt(s) {
      if (!c.portrait()) return ch;
      const ov = c.overview(), t = clamp((s - ov) / Math.max(0.01, c.homeS() * 0.75 - ov), 0, 1);
      return ch * 0.58 + (groundHome() - ch * 0.58) * t + 70 * s;
    }
    function clampView(x, s) {
      s = clamp(s, minS(), maxS());
      const half = cw / (2 * s);
      return { x: half * 2 >= W + 160 ? W / 2 : clamp(x, -80 + half, W + 80 - half), s };
    }
    c.toScreen = (x, y) => [cw / 2 + (x - c.x) * c.s, anchorAt(c.s) + (y - GY - 70 + c.y) * c.s];
    c.toWorld = (sx, sy) => [c.x + (sx - cw / 2) / c.s, GY + 70 - c.y + (sy - anchorAt(c.s)) / c.s];
    // pohled na pevnost a prak týmu (na výšku): prak u okraje, pevnost celá vedle něj, soupeř mimo záběr
    function homeFor(team) {
      const s = c.homeS(), span = cw / s, f = 0.84, sx = SLING[team].x;
      return clampView(team === "x" ? sx - (f - 0.5) * span : sx + (f - 0.5) * span, s);
    }
    c.restView = team => c.portrait() ? homeFor(team) : { x: W / 2, s: c.overview() };
    const restIsOverview = () => !c.portrait();

    c.resize = (w, h) => {
      cw = w; ch = h; needSnap = true;
      if (manual) manual = clampView(manual.x, manual.s);
    };
    c.snapNext = () => { needSnap = true; };

    // ----- uživatel -----
    function takeOver(x, s) {
      if (!Number.isFinite(x) || !Number.isFinite(s)) return;
      const v = clampView(x, s);
      manual = v; c.x = v.x; c.s = v.s; c.vx = 0; c.vs = 0;
    }
    c.isManual = () => !!manual;
    c.release = () => { manual = null; };
    c.panTo = (cx0, dx) => takeOver(cx0 - dx / c.s, c.s);
    c.pinchStart = (a, b) => {
      const mx = (a[0] + b[0]) / 2;
      pinch = { d0: Math.max(20, Math.hypot(a[0] - b[0], a[1] - b[1])), s0: c.s, wx: c.toWorld(mx, 0)[0] };
    };
    c.pinchMove = (a, b) => {
      if (!pinch) return;
      const d = Math.hypot(a[0] - b[0], a[1] - b[1]), mx = (a[0] + b[0]) / 2, s2 = clamp(pinch.s0 * d / pinch.d0, minS(), maxS());
      takeOver(pinch.wx - (mx - cw / 2) / s2, s2);
    };
    c.pinchEnd = () => { pinch = null; };
    c.zoomAt = (sx, factor) => {
      const wx = c.toWorld(sx, 0)[0], s2 = clamp(c.s * factor, minS(), maxS());
      takeOver(wx - (sx - cw / 2) / s2, s2);
    };
    // tlačítko přehledu
    c.button = team => {
      const rest = restIsOverview();
      if (!manual) return rest ? { label: "Přiblížit", plus: true } : { label: "Celá scéna", plus: false };
      return { label: rest ? "Celá scéna" : "Zpět na hru", plus: false };
    };
    c.toggle = (team, mySlingX) => {
      if (manual) { manual = null; return; }                                  // zpět na automatiku
      if (restIsOverview()) { const r = c.restView(team); manual = clampView(mySlingX == null ? W / 2 : mySlingX, Math.max(r.s, c.overview() * 1.8)); }
      else manual = clampView(W / 2, c.overview());                           // celá scéna
    };
    c.impact = p => { kick = Math.max(kick, clamp(p, 0, 1)); };

    // ----- cíl pro snímek -----
    function shotGoal(S, rest, reduced) {
      const team = S.team, tg = other(team), h = S.hog, port = c.portrait();
      const a = port ? homeFor(team) : rest, b = port ? homeFor(tg) : rest;
      const sx = SLING[team].x, tx = tg === "o" ? ZONE.o[0] : ZONE.x[1];
      const slow = { x: 0.45, y: 0.4, s: 0.5 };
      if (!h) {
        if (reduced) return { ...b, y: 0, T: { x: 0.18, y: 0.18, s: 0.18 } };
        if (holdT > 0) return { x: holdX, s: holdS, y: 0, T: { x: 0.3, y: 0.3, s: 0.35 } };
        return { x: b.x, s: b.s, y: 0, T: slow };
      }
      const u = clamp((h.x - sx) / (tx - sx), 0, 1);
      if (reduced) return { ...(port && u >= 0.55 ? b : a), y: 0, T: { x: 0.18, y: 0.18, s: 0.18 } };
      const base = port ? c.homeS() : flightBase();
      // před odpalem se kamera srovná na ježka v praku (prak je u okraje záběru, ježek by jinak hned vyletěl z obrazovky)
      if (S.waiting) { const dir = tg === "o" ? 1 : -1, x = port ? clamp(sx + dir * 40, Math.min(a.x, b.x), Math.max(a.x, b.x)) : sx; return { x, s: base, y: 0, T: { x: 0.28, y: 0.3, s: 0.35 } }; }
      // let: střed před ježkem ve směru letu, zoom podle rychlosti a výšky, svislý posun, když ježek vyletí nad horní okraj
      const sp = Math.hypot(h.vx, h.vy), speedN = clamp(sp / HUGE, 0, 1), heightN = clamp((GY - h.y) / 450, 0, 1);
      const s = Math.max(c.overview(), base * (1 - (port ? 0.16 : 0.22) * clamp(0.55 * speedN + 0.45 * heightN, 0, 1)));
      const xl = h.x + h.vx * LEAD, yl = h.y + h.vy * LEAD;
      const x = port ? clamp(xl, Math.min(a.x, b.x), Math.max(a.x, b.x)) : xl;
      const ay = anchorAt(s), margin = port ? 175 : 130;
      const y = clamp((margin - ay) / s - (yl - GY - 70), 0, 600);
      hadHog = true; holdX = x; holdS = port ? c.homeS() * 0.92 : base;
      holdT = port ? (u < 0.9 ? 0.6 : 0) : 1.25;
      return { x, s, y, T: { x: 0.18, y: 0.2, s: 0.32 } };
    }

    c.update = (dt, intent) => {
      dt = clamp(dt, 0.001, 0.1);
      const rest = intent.rest, reduced = !!intent.reduced, S = intent.shot;
      if (!S) { holdT = 0; hadHog = false; }
      else if (!S.hog && holdT > 0) holdT -= dt;
      kick *= Math.exp(-dt / 0.28);
      let g;
      if (manual) g = { x: manual.x, s: manual.s, y: 0, T: { x: 0.3, y: 0.3, s: 0.3 } };
      else if (S) g = shotGoal(S, rest, reduced);
      else g = { x: rest.x, s: rest.s, y: 0, T: reduced ? { x: 0.18, y: 0.18, s: 0.18 } : { x: 0.45, y: 0.3, s: 0.5 } };
      if (!manual && !reduced && kick > 0.01) g.s *= 1 + 0.07 * kick;
      const v = clampView(g.x, g.s);
      if (needSnap) { c.x = v.x; c.s = v.s; c.y = g.y; c.vx = c.vy = c.vs = 0; needSnap = false; return; }
      [c.x, c.vx] = smooth(c.x, c.vx, v.x, g.T.x, dt);
      [c.s, c.vs] = smooth(c.s, c.vs, v.s, g.T.s, dt);
      [c.y, c.vy] = smooth(c.y, c.vy, g.y, g.T.y, dt);
      if (!(Number.isFinite(c.x) && Number.isFinite(c.s) && Number.isFinite(c.y))) { c.x = v.x; c.s = v.s; c.y = 0; c.vx = c.vy = c.vs = 0; }
    };
    return c;
  }

  const JPCam = { create, smooth };
  if (typeof module !== "undefined") module.exports = JPCam;
  else root.JPCam = JPCam;
})(typeof window !== "undefined" ? window : globalThis);
