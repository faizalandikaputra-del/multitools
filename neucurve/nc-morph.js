/* NeuCurve - nc-morph.js  (companion of nc-morph.css)
   Smooth graph animation when the curve mode changes (Bezier / Custom / Elastic / Bounce / Wave / Steps), like the
   Flow reference: the old curve is morphed into the new one instead of jumping.
   How it works (no change to the compiled bundle):
     - a MutationObserver watches the main curve <path> (the direct child of svg.curve-svg with stroke-width 2.5)
       and the mode tabs (.mtab). When the active tab changes AND the path's "d" changes in the same update, the old
       and the new polylines are sampled on a common X grid and blended frame by frame (requestAnimationFrame):
       y(x) = lerp(oldY(x), newY(x), ease(t)).   Duration 380 ms, cubic ease-out with a tiny overshoot (as in Flow).
     - the glow (nc-glow.js) copies the path's "d", so it follows the morph automatically.
     - handles / mode overlays are faded out while morphing and fade back in at the end (nc-morph.css).
     - at the end the exact new "d" from the bundle is written back, so the final frame is pixel-identical to before.
   Any real change from the app while morphing (dragging, loading a preset, switching tab again) cancels the running
   morph; a second tab switch mid-morph continues from the current in-between shape.
   Respects Settings > Animations (html[data-reduce-motion="true"] = no morph).
   Plain ES5 for old CEF (AE 2019/2021).  Off switch: remove <script src="./nc-morph.js"> and <link href="./nc-morph.css">. */
(function () {
  "use strict";

  var DURATION = 380;       // ms
  var GRID = 420;           // samples along X while morphing
  var MORPH_CLASS = "nc-morphing";
  /* Mode tabs come in TWO markups in the compiled bundle: portrait = ".mtab" buttons inside ".model-tabs-horizontal",
     landscape = ".nav-tab" buttons inside ".model-nav-strip" (nc-flow.js turns that into the pill bar). Everything
     below (morph trigger + wheel switching) must know both, otherwise landscape gets neither. */
  var TAB_SEL = ".mtab, .nav-tab";
  var TAB_BOX_SEL = ".model-tabs-horizontal, .model-nav-strip, .model-rail";
  function isTab(n) { return !!(n && n.nodeType === 1 && n.classList && (n.classList.contains("mtab") || n.classList.contains("nav-tab"))); }
  var NUM = /-?\d*\.?\d+(?:[eE][-+]?\d+)?/g;

  var raf = window.requestAnimationFrame || function (cb) { return window.setTimeout(function () { cb(Date.now()); }, 16); };
  var caf = window.cancelAnimationFrame || window.clearTimeout;

  var anim = null;          // running morph { path, svg, frame, toD, written, ... }
  var armedH = null;        // handle positions belonging to `armed`
  var armed = null;         // tab switched, waiting for the path update { from, until }
  var lastD = null;         // last "d" seen on the main path (not written by us)
  var lastH = null;         // last handle positions seen (screen px) - the "from" side of the handle motion

  function reduced() { return document.documentElement.getAttribute("data-reduce-motion") === "true"; }

  function isMainPath(n) {
    return !!n && n.nodeType === 1 && n.tagName && n.tagName.toLowerCase() === "path" &&
      n.getAttribute("stroke-width") === "2.5" && n.getAttribute("fill") === "none" &&
      n.parentNode && n.parentNode.getAttribute && /(^|\s)curve-svg(\s|$)/.test(n.parentNode.getAttribute("class") || "");
  }

  function findMainPath() {
    var svg = document.querySelector("svg.curve-svg"), i, k;
    if (!svg) { return null; }
    for (i = 0; i < svg.children.length; i++) {
      k = svg.children[i];
      if (isMainPath(k)) { return k; }
    }
    return null;
  }

  /* ---------- path -> polyline ---------- */
  function parsePolyline(d) {
    if (!d) { return null; }
    var pts = [], nums, i;
    if (/[^MLml0-9eE\s,.\-+]/.test(d)) { return samplePath(d); }      // curves / arcs / H / V ... -> geometric sampling
    nums = d.match(NUM);
    if (!nums || nums.length < 4) { return null; }
    for (i = 0; i + 1 < nums.length; i += 2) { pts.push([parseFloat(nums[i]), parseFloat(nums[i + 1])]); }
    return pts;
  }

  function samplePath(d) {
    try {
      var p = document.createElementNS("http://www.w3.org/2000/svg", "path"), len, n, i, pt, out = [];
      p.setAttribute("d", d);
      len = p.getTotalLength();
      if (!(len > 0)) { return null; }
      n = Math.min(1200, Math.max(60, Math.round(len / 1.5)));
      for (i = 0; i <= n; i++) { pt = p.getPointAtLength(len * i / n); out.push([pt.x, pt.y]); }
      return out;
    } catch (e) { return null; }
  }

  /* y of a polyline at x. Vertical jumps (Steps) are skipped: a grid sample takes the value of the segment that
     really covers x, so the jump shows up as a very steep (1 grid cell wide) ramp while morphing. */
  function makeSampler(pts) {
    var n = pts.length, minX = pts[0][0], maxX = pts[0][0], i;
    for (i = 1; i < n; i++) { if (pts[i][0] < minX) { minX = pts[i][0]; } if (pts[i][0] > maxX) { maxX = pts[i][0]; } }
    var cursor = 0;
    function at(x) {
      var a, b, k, dx;
      if (x <= minX) { return edgeY(true); }
      if (x >= maxX) { return edgeY(false); }
      if (cursor >= n - 1 || pts[cursor][0] > x) { cursor = 0; }
      for (k = cursor; k < n - 1; k++) {
        a = pts[k]; b = pts[k + 1];
        dx = b[0] - a[0];
        if (dx > 1e-9 && x >= a[0] && x <= b[0]) { cursor = k; return a[1] + (b[1] - a[1]) * (x - a[0]) / dx; }
      }
      /* not monotone in x (rare): fall back to a full scan */
      for (k = 0; k < n - 1; k++) {
        a = pts[k]; b = pts[k + 1]; dx = b[0] - a[0];
        if (dx > 1e-9 && x >= a[0] && x <= b[0]) { return a[1] + (b[1] - a[1]) * (x - a[0]) / dx; }
      }
      return pts[n - 1][1];
    }
    function edgeY(first) {
      var ex = first ? minX : maxX, k, best = null;
      for (k = 0; k < n; k++) {
        if (Math.abs(pts[k][0] - ex) < 1e-6) {
          if (best === null) { best = pts[k][1]; }
          if (first) { return pts[k][1]; }        // first point at the left edge
          best = pts[k][1];                       // last point at the right edge
        }
      }
      return best === null ? pts[first ? 0 : n - 1][1] : best;
    }
    return { at: at, minX: minX, maxX: maxX };
  }

  /* ---------- easing (same shape as Flow's easeGraphTransition) ---------- */
  function ease(t) {
    var e = 1 - Math.pow(1 - t, 3) + Math.sin(t * Math.PI) * 0.035;
    return e < 0 ? 0 : (e > 1 ? 1 : e);
  }

  function fmt(v) { return (Math.round(v * 100) / 100).toString(); }

  /* ---------- handles ---------- */
  function handleEls(svg) {
    return svg ? Array.prototype.slice.call(svg.querySelectorAll("g.handles > g")) : [];
  }
  function elPos(el) {                              // logical position from the transform="translate(x, y)" attribute
    var m = (el.getAttribute("transform") || "").match(NUM);
    return m && m.length >= 2 ? { x: parseFloat(m[0]), y: parseFloat(m[1]) } : null;
  }
  function takeHandles() {
    var svg = document.querySelector("svg.curve-svg"), out = [], els = handleEls(svg), i, p;
    for (i = 0; i < els.length; i++) { p = elPos(els[i]); if (p) { out.push(p); } }
    return out;
  }

  /* ---------- the morph ---------- */
  /* NeuCurve eases its own Y viewport for ~0.5 s after a mode switch, so the app keeps rewriting "d" every frame
     during (and a bit after) our morph. We therefore treat the app's latest "d" as the live TARGET and blend
     from the old on-screen shape towards it:  shown = lerp(oldShape, appShape, ease(t)). */
  function now() { return (window.performance && performance.now) ? performance.now() : Date.now(); }

  function finish(a, writeTarget) {
    if (anim !== a) { return; }
    anim = null;
    if (a.frame) { caf(a.frame); a.frame = 0; }
    if (a.svg && a.svg.classList) { a.svg.classList.remove(MORPH_CLASS); }
    clearHandleOffsets(a);
    if (writeTarget && a.path.parentNode) {
      a.path.setAttribute("d", a.toD);
      try { mo.takeRecords(); } catch (e) { }
    }
    lastD = a.toD;
    lastH = takeHandles();
  }

  function clearHandleOffsets(a) {
    var i, el;
    for (i = 0; i < a.hEls.length; i++) {
      el = a.hEls[i];
      try { el.style.removeProperty("transform"); } catch (e) { }
    }
  }

  /* handles glide from where the old mode had them to where the new mode wants them (same easing as the curve) */
  function moveHandles(a, e) {
    var i, el, cur, from, x, y;
    a.hNow = [];
    for (i = 0; i < a.hEls.length; i++) {
      el = a.hEls[i];
      cur = el.parentNode ? elPos(el) : null;
      from = a.hFrom[i];
      if (!cur) { continue; }
      if (!from) { a.hNow.push(cur); continue; }
      x = cur.x + (from.x - cur.x) * (1 - e);
      y = cur.y + (from.y - cur.y) * (1 - e);
      el.style.transform = "translate(" + x.toFixed(2) + "px," + y.toFixed(2) + "px)";
      a.hNow.push({ x: x, y: y });
    }
  }

  function setTarget(a, d) {
    var B = parsePolyline(d);
    if (!B || B.length < 2) { return false; }
    a.toD = d;
    a.sb = makeSampler(B);
    a.yb = null;
    return true;
  }

  function render(a) {
    var lin = (now() - a.t0) / DURATION, e, k, parts, n = GRID, yb = a.sb, x, ya = a.ya, y2;
    if (lin >= 1) { finish(a, true); return; }
    e = ease(lin < 0 ? 0 : lin);
    parts = new Array(n + 1);
    for (k = 0; k <= n; k++) {
      x = a.xs[k];
      y2 = yb.at(x);
      parts[k] = (k === 0 ? "M" : "L") + fmt(x) + "," + fmt(ya[k] + (y2 - ya[k]) * e);
    }
    a.written = parts.join(" ");
    a.path.setAttribute("d", a.written);
    moveHandles(a, e);
    try { mo.takeRecords(); } catch (err) { }       // our own write must not look like an app update
  }

  function start(path, fromD, toD, fromH) {
    var A = parsePolyline(fromD), sa, i, x0, x1, a, svg;
    if (!A || A.length < 2) { return; }
    sa = makeSampler(A);
    if (anim) { finish(anim, false); }
    svg = path.parentNode;
    a = { path: path, svg: svg, frame: 0, t0: now(), xs: [], ya: [], sb: null, toD: toD, written: fromD,
          hEls: handleEls(svg), hFrom: [], hNow: [] };
    for (i = 0; i < a.hEls.length; i++) {
      a.hFrom.push(fromH && fromH.length ? (fromH[i] || fromH[fromH.length - 1]) : null);   // extra handles sprout from the last old one
    }
    if (!setTarget(a, toD)) { return; }
    x0 = Math.min(sa.minX, a.sb.minX); x1 = Math.max(sa.maxX, a.sb.maxX);
    if (!(x1 - x0 > 1)) { return; }
    for (i = 0; i <= GRID; i++) { a.xs.push(x0 + (x1 - x0) * i / GRID); a.ya.push(sa.at(a.xs[i])); }
    anim = a;
    svg.classList.add(MORPH_CLASS);
    render(a);                                       // first frame in the same task as the switch: no flash of the new curve
    if (anim === a) {
      (function loop() {
        if (anim !== a) { return; }
        a.frame = raf(function () { if (anim !== a) { return; } render(a); if (anim === a) { loop(); } });
      })();
    }
  }

  /* ---------- observer ---------- */
  function tabBecameActive(r) {
    var t = r.target;
    if (!isTab(t)) { return false; }
    return t.classList.contains("active") && !/(^|\s)active(\s|$)/.test(r.oldValue || "");
  }

  /* The Speed Graph button (gauge icon) swaps the curve for its speed (velocity) bell shape. It is not a mode tab,
     but it deserves the very same morph, both when it turns on and when it turns off. */
  function speedToggled(r) {
    var t = r.target;
    if (!t || t.nodeType !== 1 || !t.classList || r.attributeName !== "class") { return false; }
    /* the tooltip script blanks title="" while hovered, so also accept the marker nc-icons-pro.js puts on the button */
    if (t.getAttribute("title") !== "Speed Graph" && t.getAttribute("data-ncp") !== "Speed Graph") { return false; }
    return /(^|\s)active(\s|$)/.test(t.className) !== /(^|\s)active(\s|$)/.test(r.oldValue || "");
  }

  var mo = new MutationObserver(function (records) {
    var switched = false, firstOld = null, firstPath = null, curD = null, i, r, t = Date.now(), from;

    for (i = 0; i < records.length; i++) {
      r = records[i];
      if (r.attributeName === "class") {
        if (tabBecameActive(r) || speedToggled(r)) { switched = true; }
      } else if (r.attributeName === "d" && isMainPath(r.target)) {
        if (firstPath === null) { firstPath = r.target; firstOld = r.oldValue; }
        curD = r.target.getAttribute("d");
      }
    }

    if (switched) {
      armedH = anim && anim.hNow && anim.hNow.length ? anim.hNow : lastH;
      /* old shape = what was on screen before this update (the in-between shape if a morph was running) */
      armed = { from: firstPath ? firstOld : (anim ? anim.written : lastD), until: t + 400 };
    }
    if (armed && t > armed.until) { armed = null; }

    if (armed && firstPath) {
      from = armed.from;
      armed = null;
      if (!reduced() && from && curD && from !== curD) { start(firstPath, from, curD, armedH); armedH = null; return; }
    }

    if (anim && firstPath && anim.path === firstPath && curD) {
      /* the app moved the curve (viewport easing, drag ...): keep morphing towards its newest shape */
      if (setTarget(anim, curD)) { render(anim); }
      return;
    }

    if (!anim) { var p = findMainPath(); if (p) { lastD = p.getAttribute("d"); lastH = takeHandles(); } }
  });


  /* ---------- mouse wheel over the mode tabs = previous / next mode (portrait .mtab AND landscape .nav-tab) ---------- */
  (function () {
    var acc = 0, lastStep = 0, STEP = 40, COOLDOWN = 110;
    function boxOf(target) {
      var n = target && target.nodeType === 1 ? target : (target && target.parentNode);
      return n && n.closest ? n.closest(TAB_BOX_SEL) : null;
    }
    document.addEventListener("wheel", function (e) {
      var box = boxOf(e.target), tabs, i, active = -1, next, t = Date.now(), dy;
      if (!box) { return; }
      tabs = Array.prototype.slice.call(box.querySelectorAll(TAB_SEL));
      if (!tabs.length) { return; }
      e.preventDefault();
      dy = e.deltaY || e.deltaX || 0;
      if (e.deltaMode === 1) { dy *= 33; }                    // lines -> px
      if ((acc > 0 && dy < 0) || (acc < 0 && dy > 0)) { acc = 0; }
      acc += dy;
      if (Math.abs(acc) < STEP || t - lastStep < COOLDOWN) { return; }
      for (i = 0; i < tabs.length; i++) { if (/(^|\s)active(\s|$)/.test(tabs[i].className)) { active = i; break; } }
      next = active + (acc > 0 ? 1 : -1);
      acc = 0;
      if (next < 0 || next >= tabs.length || active < 0) { return; }
      lastStep = t;
      tabs[next].click();
    }, { passive: false });
  })();

  function boot() {
    var p = findMainPath();
    if (p) { lastD = p.getAttribute("d"); lastH = takeHandles(); }
    mo.observe(document.documentElement, {
      subtree: true, childList: true,
      attributes: true, attributeOldValue: true, attributeFilter: ["d", "class"]
    });
  }

  if (document.readyState === "loading") { document.addEventListener("DOMContentLoaded", boot); } else { boot(); }
})();
