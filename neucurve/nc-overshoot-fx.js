/* NeuCurve - nc-overshoot-fx.js (v1)  OVERSHOOT CROSSING EFFECT (styles: nc-overshoot-fx.css). Plain ES5.
   The bundle calls window.__ncOvFx(x, y) on every handle-drag move (pointer position in curve units) and window.__ncOvFx(null) on release.
   Crossing the 1 line upward or the 0 line downward = ENTER: the line lights up, a sweep runs out from the handle, a ring bursts, a tinted
   band fills the zone. Coming back inside = EXIT: everything fades with an accelerate curve.
   With "Allow Overshoot" OFF the crossing is refused: only a short soft flash on the line (the point cannot leave the box).
   window.__ncGMap(x, y) (bundle) gives the svg position of a curve point; window.__ncGPlot() the plot rectangle. */
(function () {
  "use strict";
  if (/[?&]ext=settings/.test(location.search)) { return; }
  var HYS_PX = 4, COOL = 220;
  var lastKey = "", side = null, lastT = 0, host = null, edges = {}, bands = {}, raf = 0, hold = 0;

  function q(s) { return document.querySelector(s); }
  function el(cls, parent) { var d = document.createElement("div"); d.className = cls; parent.appendChild(d); return d; }

  function build(area) {
    if (host && host.parentNode === area) { return; }
    host = document.createElement("div"); host.id = "nc-ovfx"; area.appendChild(host);
    ["top", "bot"].forEach(function (s) {
      var b = el("ncov-band " + s, host); b.appendChild(document.createElement("i")); bands[s] = b;
      var e = el("ncov-edge", host); e.sw = el("ncov-sweep", e); e.bu = el("ncov-burst", e); edges[s] = e;
    });
  }

  function accent(svg) {
    try {
      var ps = svg.querySelectorAll("path");
      for (var i = 0; i < ps.length; i++) {
        var cs = getComputedStyle(ps[i]);
        if (cs.stroke && cs.stroke !== "none" && parseFloat(cs.strokeWidth) >= 2) { return cs.stroke; }
      }
    } catch (e) { }
    return "#fff";
  }

  /* geometry in px relative to .canvas-area */
  function geom(area, svg) {
    var P = window.__ncGPlot && window.__ncGPlot(), M = window.__ncGMap; if (!P || !M) { return null; }
    var ar = area.getBoundingClientRect(), sr = svg.getBoundingClientRect(), vb = svg.viewBox && svg.viewBox.baseVal;
    var kx = vb && vb.width ? sr.width / vb.width : 1, ky = vb && vb.height ? sr.height / vb.height : 1;
    var ox = sr.left - ar.left, oy = sr.top - ar.top;
    var y1 = oy + M(0, 1).sy * ky, y0 = oy + M(0, 0).sy * ky;
    return { l: ox + P.x * kx, w: P.w * kx, t: oy + P.y * ky, b: oy + (P.y + P.h) * ky, y1: y1, y0: y0, ox: ox, kx: kx, M: M };
  }

  function layout() {
    var area = q(".canvas-area"), svg = q("svg.curve-svg"); if (!area || !svg || !host) { return false; }
    var g = geom(area, svg); if (!g) { return false; }
    var key = [g.l, g.w, g.t, g.b, g.y0, g.y1].map(Math.round).join(",");
    if (key === lastKey) { return g; }
    lastKey = key;
    var T = bands.top.style, B = bands.bot.style, et = edges.top.style, eb = edges.bot.style;
    T.left = B.left = et.left = eb.left = Math.round(g.l) + "px";
    T.width = B.width = et.width = eb.width = Math.round(g.w) + "px";
    T.top = Math.round(g.t) + "px"; T.height = Math.max(0, Math.round(g.y1 - g.t)) + "px";
    B.top = Math.round(g.y0) + "px"; B.height = Math.max(0, Math.round(g.b - g.y0)) + "px";
    et.top = Math.round(g.y1) + "px"; eb.top = Math.round(g.y0) + "px";
    return g;
  }

  function loop() {
    raf = 0;
    if (!layout()) { return; }
    if (side || Date.now() < hold) { raf = requestAnimationFrame(loop); }
  }
  function kick(ms) { hold = Math.max(hold, Date.now() + (ms || 0)); if (!raf) { raf = requestAnimationFrame(loop); } }

  function replay(node, cls) { node.classList.remove("go"); if (cls) { node.classList.remove(cls); } void node.offsetWidth; node.classList.add("go"); if (cls) { node.classList.add(cls); } }

  function enter(s, x, allowed) {
    var area = q(".canvas-area"), svg = q("svg.curve-svg"); if (!area || !svg) { return; }
    build(area);
    lastKey = "";
    var g = layout(); if (!g) { return; }
    host.style.setProperty("--c", accent(svg));
    var e = edges[s], px = (g.M(Math.max(0, Math.min(1, x)), 0).sx * g.kx + g.ox) - g.l;      /* handle x inside the plot, px */
    e.sw.style.transformOrigin = Math.round(px) + "px 50%";
    e.bu.style.left = Math.round(px) + "px"; e.bu.style.top = "0px";
    if (allowed) {
      e.classList.add("on"); bands[s].classList.add("on");
      replay(e.sw, null); e.sw.classList.remove("soft"); replay(e.bu, null);
    } else {
      replay(e.sw, "soft");                                                                      /* refused: short soft flash only */
    }
    kick(600);
  }
  function exit(s) {
    if (!edges[s]) { return; }
    edges[s].classList.remove("on"); bands[s].classList.remove("on"); kick(400);
  }

  window.__ncOvFx = function (x, y) {
    var now = Date.now(), s = null, M = window.__ncGMap, k = M ? Math.abs(M(0, 0).sy - M(0, 1).sy) : 300, H = HYS_PX / Math.max(40, k);
    if (x === null || x === undefined) { if (side) { exit(side); side = null; } return; }
    if (side === "top") { s = y > 1 - H ? "top" : null; }          /* stay lit until the pointer is 4 px back inside */
    else if (side === "bot") { s = y < H ? "bot" : null; }
    else { s = y > 1 + H ? "top" : (y < -H ? "bot" : null); }      /* light up only 4 px beyond the line */
    if (s === side) { return; }
    if (side) { exit(side); }
    if (s && now - lastT > COOL) { lastT = now; enter(s, x, window.__ncOv !== false); }
    side = s;
  };
  window.addEventListener("blur", function () { window.__ncOvFx(null); });
})();
