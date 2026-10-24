/* NeuCurve - glow on the main graph curve, drawn with plain SVG strokes (no CSS filter, no SVG <filter>).
   Why: CSS drop-shadow()/filter on an SVG <path> is not rendered by After Effects' embedded Chromium (CEP/CEF),
   and the SVG <filter> version hid the curve entirely. Stacked, wider, low-opacity strokes with round caps look
   like a glow and work in every CEF version.
   For every graph <svg class="curve-svg">, a <g class="nc-glow"> is inserted right BEFORE the main curve path
   (the <path stroke-width="2.5" fill="none">). Its paths copy that path's "d" and "stroke", so the glow follows
   the curve while you drag and always has the same color (also after changing the curve color, including the
   panel-driven accent override from nc-theme-sync.css - the color is read via getComputedStyle, not just the
   literal "stroke" attribute, specifically so a CSS override on the path is picked up too).
   v5: Settings > Handle Effects > Handle Glow and Settings > Curve Line > Glow (window.__ncUG, written by nc-pro.js) are drawn here too,
   with the same plain-SVG technique: g.nc-uglow (extra stacked strokes behind the curve) and circle.nc-hglow-u (radial-gradient halo behind
   each handle). They used to be CSS filter: drop-shadow() rules in nc-pro.css, which After Effects' CEF does not render.
   To switch the glow off: delete this file's <script> in index.html.
   Tune: LAYERS = [stroke width, opacity], outermost first. */
(function () {
  "use strict";
  var NS = "http://www.w3.org/2000/svg";
  /* SMOOTH GLOW: instead of 6 fat strokes (which showed as visible rings / bands) the glow is built from many thin
     steps whose opacities are computed so the combined result follows a Gaussian falloff:
        coverage(r) = GLOW_PEAK * exp(-r^2 / (2 * GLOW_SIGMA^2))      (r = distance from the curve centre, px)
     Each layer i is a stroke of width 2*r_i; its opacity a_i is derived so that stacking all layers (normal alpha
     compositing: 1 - prod(1 - a_i)) gives exactly that coverage at every r_i - so there are no hard edges, only a
     soft bloom that fades to ~0 at GLOW_RADIUS. Layers are listed outermost first: [stroke width, opacity].
     Tune: GLOW_PEAK (brightness next to the line), GLOW_SIGMA (how far it spreads), GLOW_RADIUS (cut-off),
     GLOW_STEPS (more = smoother, a little more work while dragging). */
  var GLOW_PEAK = 0.26, GLOW_SIGMA = 4.5, GLOW_RADIUS = 15, GLOW_STEPS = 8, CORE_R = 1.5;   /* 8 steps: smooth enough, and 43% fewer wide strokes to repaint on every drag frame */
  function buildLayers() {
    var out = [], i, n = GLOW_STEPS, r, a, step = (GLOW_RADIUS - CORE_R) / (n - 1);
    function cover(x) { return GLOW_PEAK * Math.exp(-(x * x) / (2 * GLOW_SIGMA * GLOW_SIGMA)); }
    for (i = 0; i < n; i++) {
      r = GLOW_RADIUS - step * i;                                            // outermost -> innermost
      // layer i lifts the coverage built by the layers outside it (cover(r + step)) up to cover(r)
      a = (i === 0) ? cover(r) : 1 - (1 - cover(r)) / (1 - cover(r + step));
      if (a < 0.0005) { a = 0.0005; }
      out.push([Math.round(r * 2 * 10) / 10, Math.round(a * 10000) / 10000]);
    }
    return out;
  }
  var LAYERS = buildLayers();
  /* soft round halo behind each handle (heart / dot): radius in px and peak opacity */
  var HALO_R = 11, HALO_A = 0.22;

  /* ---- v5: user glow (Settings sliders, 0..20 px) ---- */
  function userGlow() {
    var u = window.__ncUG || {}, l = parseFloat(u.line), h = parseFloat(u.handle);
    return { line: isFinite(l) ? Math.max(0, Math.min(20, l)) : 0, handle: isFinite(h) ? Math.max(0, Math.min(20, h)) : 0, lc: u.lc || "", hc: u.hc || "" };
  }
  function userLayers(lg) {
    var R = 3 + lg * 1.2, sigma = R / 2.4, peak = 0.4 + 0.45 * (lg / 20), n = 8, core = 1.5, step = (R - core) / (n - 1), out = [], i, r, a;
    function cover(x) { return peak * Math.exp(-(x * x) / (2 * sigma * sigma)); }
    for (i = 0; i < n; i++) {
      r = R - step * i;
      a = (i === 0) ? cover(r) : 1 - (1 - cover(r)) / (1 - cover(r + step));
      if (a < 0.0005) { a = 0.0005; }
      out.push([Math.round(r * 2 * 10) / 10, Math.round(a * 10000) / 10000]);
    }
    return out;
  }
  function syncUserLine(svg, base, d, color, lg, dragging) {
    var g = base.previousElementSibling, i, p, L;
    if (g && !(g.getAttribute && g.getAttribute("class") === "nc-uglow")) { g = null; }
    if (lg <= 0) { if (g) { svg.removeChild(g); } return; }
    if (g && g.__lg !== lg) { svg.removeChild(g); g = null; }
    if (!g) {
      L = userLayers(lg);
      g = document.createElementNS(NS, "g");
      g.setAttribute("class", "nc-uglow"); g.setAttribute("pointer-events", "none"); g.__lg = lg;
      for (i = 0; i < L.length; i++) {
        p = document.createElementNS(NS, "path");
        p.setAttribute("fill", "none"); p.setAttribute("stroke-width", String(L[i][0])); p.setAttribute("stroke-opacity", String(L[i][1]));
        p.setAttribute("stroke-linecap", "round"); p.setAttribute("stroke-linejoin", "round");
        g.appendChild(p);
      }
      svg.insertBefore(g, base);
    }
    if (dragging) { return; }
    for (i = 0; i < g.children.length; i++) {
      p = g.children[i];
      if (p.getAttribute("d") !== d) { p.setAttribute("d", d); }
      if (p.getAttribute("stroke") !== color) { p.setAttribute("stroke", color); }
    }
  }
  function syncUserHalos(svg, color, hg) {
    var hs = svg.querySelectorAll("g.handles > g"), i, c, k, gr, defs, st, t2;
    if (hg > 0) {
      defs = svg.querySelector("defs");
      if (!defs) { defs = document.createElementNS(NS, "defs"); svg.insertBefore(defs, svg.firstChild); }
      gr = defs.querySelector("#nc-uhglow-grad");
      if (!gr) {
        gr = document.createElementNS(NS, "radialGradient"); gr.setAttribute("id", "nc-uhglow-grad");
        for (k = 0; k <= 7; k++) {
          t2 = k / 7; st = document.createElementNS(NS, "stop");
          st.setAttribute("offset", String(t2)); st.setAttribute("stop-opacity", k === 7 ? "0" : String(Math.round(Math.exp(-(t2 * t2) * 3.6) * 1000) / 1000));
          gr.appendChild(st);
        }
        defs.appendChild(gr);
      }
      for (k = 0; k < gr.children.length; k++) { if (gr.children[k].getAttribute("stop-color") !== color) { gr.children[k].setAttribute("stop-color", color); } }
    }
    for (i = 0; i < hs.length; i++) {
      c = hs[i].querySelector(":scope > circle.nc-hglow-u");
      if (hg <= 0) { if (c) { hs[i].removeChild(c); } continue; }
      if (!c) {
        c = document.createElementNS(NS, "circle");
        c.setAttribute("class", "nc-hs nc-hglow-u"); c.setAttribute("fill", "url(#nc-uhglow-grad)"); c.setAttribute("pointer-events", "none");
        hs[i].insertBefore(c, hs[i].firstChild);
      }
      var rr = String(Math.round((6 + hg * 1.1) * 10) / 10), oo = String(Math.round(Math.min(1, 0.35 + hg * 0.035) * 100) / 100);
      if (c.getAttribute("r") !== rr) { c.setAttribute("r", rr); }
      if (c.getAttribute("opacity") !== oo) { c.setAttribute("opacity", oo); }
    }
  }
  var scheduled = false;

  function mainPath(svg) {
    var kids = svg.children, i, k;
    for (i = 0; i < kids.length; i++) {
      k = kids[i];
      if (k.tagName && k.tagName.toLowerCase() === "path" &&
          k.getAttribute("stroke-width") === "2.5" && k.getAttribute("fill") === "none") { return k; }
    }
    return null;
  }

  function ensureGroup(svg, path) {
    var g = path.previousElementSibling;
    if (g && g.getAttribute && g.getAttribute("class") === "nc-glow" && g.children.length === LAYERS.length) { return g; }
    var old = svg.querySelectorAll(":scope > g.nc-glow"), i;
    for (i = 0; i < old.length; i++) { svg.removeChild(old[i]); }
    g = document.createElementNS(NS, "g");
    g.setAttribute("class", "nc-glow");
    g.setAttribute("pointer-events", "none");
    /* no mix-blend-mode: it forces an offscreen pass over the whole graph on every drag frame */
    for (i = 0; i < LAYERS.length; i++) {
      var p = document.createElementNS(NS, "path");
      p.setAttribute("fill", "none");
      p.setAttribute("stroke-width", String(LAYERS[i][0]));
      p.setAttribute("stroke-opacity", String(LAYERS[i][1]));
      p.setAttribute("stroke-linecap", "round");
      p.setAttribute("stroke-linejoin", "round");
      g.appendChild(p);
    }
    svg.insertBefore(g, path);
    return g;
  }

  /* ---- handle halos: a radial-gradient circle (no filter needed) as the first child of every handle group ---- */
  function ensureGrad(svg) {
    var defs = svg.querySelector("defs");
    if (!defs) { defs = document.createElementNS(NS, "defs"); svg.insertBefore(defs, svg.firstChild); }
    var gr = defs.querySelector("#nc-hglow-grad");
    if (!gr) {
      gr = document.createElementNS(NS, "radialGradient");
      gr.setAttribute("id", "nc-hglow-grad");
      // Gaussian-like eased falloff (8 stops) instead of a straight 2-stop ramp, so the halo has no visible rim.
      var k2, t2, st;
      for (k2 = 0; k2 <= 7; k2++) {
        t2 = k2 / 7;
        st = document.createElementNS(NS, "stop");
        st.setAttribute("offset", String(t2));
        st.setAttribute("stop-opacity", t2 === 1 ? "0" : String(Math.round(HALO_A * Math.exp(-(t2 * t2) * 4.2) * 1000) / 1000));
        gr.appendChild(st);
      }
      defs.appendChild(gr);
    }
    return gr;
  }
  function haloColor(svg, fallback) {
    var c = svg.querySelector("#handle-pt circle:not(.nc-hs)"), v = c && c.getAttribute("fill");
    return v && v !== "none" && v !== "transparent" ? v : fallback;
  }
  function syncHalos(svg, curveColor) {
    var gr = ensureGrad(svg), col = haloColor(svg, curveColor), k;
    for (k = 0; k < gr.children.length; k++) { if (gr.children[k].getAttribute("stop-color") !== col) { gr.children[k].setAttribute("stop-color", col); } }
    var hs = svg.querySelectorAll("g.handles > g"), i;
    for (i = 0; i < hs.length; i++) {
      var first = hs[i].firstElementChild;
      if (hs[i].querySelector(":scope > circle.nc-hglow")) { continue; }
      var c = document.createElementNS(NS, "circle");
      c.setAttribute("class", "nc-hs nc-hglow"); c.setAttribute("r", String(HALO_R));
      c.setAttribute("fill", "url(#nc-hglow-grad)"); c.setAttribute("pointer-events", "none");
      hs[i].insertBefore(c, first);
    }
  }

  /* Drag cost: the old sync() ran synchronously for every mutation, called getComputedStyle (forced style recalc)
     and rewrote 14 paths each time. Now: one sync per animation frame (still before paint, so no lag), the curve
     colour is cached and only re-read when the stroke attribute changes or on the slow timer, and the halo pass
     is skipped while a "d"-only change comes in. */
  var colorCache = "", colorFor = "";
  function sync(light) {
    scheduled = false;
    var dragging = document.documentElement.classList.contains("nc-graph-drag") || (window.__ncMorphUntil || 0) > Date.now();   // v28: also idle while nc-morph.js morphs the curve (glow is hidden then, redrawn at the end)
    var svgs = document.querySelectorAll("svg.curve-svg"), i, j, ug = userGlow();
    for (i = 0; i < svgs.length; i++) {
      var path = mainPath(svgs[i]);
      if (!path) { continue; }
      var g = ensureGroup(svgs[i], path);
      var d = path.getAttribute("d") || "";
      var attr = path.getAttribute("stroke") || "";
      var s = colorCache;
      if (!light || !s || colorFor !== attr) {
        // Computed style first: reflects any CSS override (e.g. nc-theme-sync.css's accent !important rule),
        // not just whatever "stroke" attribute value NeuCurve's own bundle last wrote.
        s = "";
        try { s = getComputedStyle(path).stroke || ""; } catch (e) { /* ignore */ }
        if (!s || s === "none") { s = attr; }
        colorCache = s; colorFor = attr;
      }
      for (j = 0; j < g.children.length; j++) {
        if (dragging) { continue; }   // v27: glow is fully hidden during a drag (nc-glow.css); it is refreshed on release
        var gp = g.children[j];
        if (gp.getAttribute("d") !== d) { gp.setAttribute("d", d); }
        if (gp.getAttribute("stroke") !== s) { gp.setAttribute("stroke", s); }
      }
      if (!light) { syncHalos(svgs[i], s); }
      syncUserLine(svgs[i], g, d, ug.lc || s, ug.line, dragging);   /* Settings > Curve Line > Glow Color, else the curve color */
      if (!light) { syncUserHalos(svgs[i], ug.hc || haloColor(svgs[i], s), ug.handle);   /* Settings > Handle Effects > Glow Color, else the handle color */ }
    }
  }

  var rafPending = false;
  function schedule() { if (!scheduled) { scheduled = true; setTimeout(sync, 0); } }
  function scheduleFrame() {
    if (rafPending) { return; }
    rafPending = true;
    (window.requestAnimationFrame || function (f) { return setTimeout(f, 16); })(function () { rafPending = false; sync(true); });
  }

  window.__ncGlowSync = function () { setTimeout(function () { sync(); }, 0); };   // v5: nc-pro.js calls this after a glow slider changed
  window.addEventListener("mouseup", function () { setTimeout(sync, 40); }, false);   // repaint every glow layer after a drag

  function start() {
    try {
      // curve edits change "d" / "stroke"; switching model / tab re-creates the svg (childList)
      new MutationObserver(function (list) {
        for (var i = 0; i < list.length; i++) {
          var t = list[i].target;
          if (t && t.closest && t.closest("g.nc-glow, g.nc-uglow")) { continue; }   // ignore our own edits
          if (list[i].type === "attributes") { scheduleFrame(); return; }   // once per frame, before paint
          schedule();
        }
      }).observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ["d", "stroke"] });
    } catch (e) { /* very old CEF: fall back to polling */ }
    setInterval(function () { if (window.__ncAway && window.__ncAway()) { return; } sync(); }, 1000);
    sync();
  }

  if (document.readyState === "loading") { document.addEventListener("DOMContentLoaded", start); } else { start(); }
})();
