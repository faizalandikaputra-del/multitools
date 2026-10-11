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
   v22 (RE-Faster logic): ease-out-expo over 500 ms (same curve + duration as RE-Faster's category morph, no overshoot), the
   shape is blended from wherever the curve is on screen right now (interrupting never snaps), and the same "is-morphing"
   frame-drop guard: while a morph runs the glow stack, handle halos and the live ball are not drawn / updated
   (window.__ncMorphUntil, read by nc-glow.js / nc-ball.js / nc-apply-glow.js; svg.nc-morphing in nc-morph.css), then the
   glow fades back in. One render per frame (the observer render and the rAF render no longer double up) and a idle-time warm-up
   so the very first mode switch after AE starts runs on already-optimised code.
   v24: the hidden mode warm-up (nc-warm.js) no longer disables the morph: it runs start() / render() / moveHandles() / fadeBack() and the
   .nc-morphing / .nc-morph-out style changes for real, with a 120 ms duration (WARM_DURATION), so the first real mode switch in AE is not cold.
   Plain ES5 for old CEF (AE 2019/2021).  Off switch: remove <script src="./nc-morph.js"> and <link href="./nc-morph.css">. */
(function () {
  "use strict";

  var DURATION = 500;       // ms (RE-Faster: 500)
  var WARM_DURATION = 120;  // ms: morph length while nc-warm.js cycles the modes behind the spinner (page hidden, only the code path matters)
  var GRID = 200;           // samples along X while morphing (420 before; the glow is off while morphing so fewer points are plenty)
  var MORPH_CLASS = "nc-morphing";
  var OUT_CLASS = "nc-morph-out";
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

  function reduced() { return document.documentElement.getAttribute("data-reduce-motion") === "true"; }   // v24: the hidden mode warm-up (nc-warm.js) now runs the REAL morph too, just short (WARM_DURATION), so its code path is not cold on the first real switch

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

  /* v26: analytic sampler for paths made of absolute M / L / C only (what Bezier "L" polylines and Custom "C" curves are).
     Evaluates the cubics directly instead of asking the browser for getTotalLength + hundreds of getPointAtLength calls, which was
     ~70 ms on every mode switch (and every Custom drag frame in nc-ball.js). Returns [[x,y], ...] or null for anything else
     (relative commands, arcs, H / V ...) so the caller falls back to the geometric sampler. */
  function sampleCubicPath(d) {
    var re = /([MLCZ])|(-?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?)|([A-Za-z])/g, m, cmd = "", nums = [], out = [], cx = 0, cy = 0, bad = false;
    function flush() {
      var i, k, n, t, u, x, y, x0, y0, x1, y1, x2, y2, x3, y3, ch;
      if (cmd === "M" || cmd === "L") {
        for (i = 0; i + 1 < nums.length; i += 2) { cx = nums[i]; cy = nums[i + 1]; out.push([cx, cy]); }
      } else if (cmd === "C") {
        for (i = 0; i + 5 < nums.length; i += 6) {
          x0 = cx; y0 = cy; x1 = nums[i]; y1 = nums[i + 1]; x2 = nums[i + 2]; y2 = nums[i + 3]; x3 = nums[i + 4]; y3 = nums[i + 5];
          ch = Math.abs(x1 - x0) + Math.abs(y1 - y0) + Math.abs(x2 - x1) + Math.abs(y2 - y1) + Math.abs(x3 - x2) + Math.abs(y3 - y2);
          n = Math.max(12, Math.min(96, Math.ceil(ch / 3)));
          for (k = 1; k <= n; k++) {
            t = k / n; u = 1 - t;
            x = u * u * u * x0 + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * x3;
            y = u * u * u * y0 + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y3;
            out.push([x, y]);
          }
          cx = x3; cy = y3;
        }
      }
      nums = [];
    }
    while ((m = re.exec(d)) !== null) {
      if (m[3]) { bad = true; break; }
      if (m[1]) { flush(); cmd = m[1]; if (cmd === "Z") { cmd = ""; } }
      else { nums.push(parseFloat(m[2])); }
    }
    if (bad) { return null; }
    flush();
    return out.length > 1 ? out : null;
  }

  function samplePath(d) {
    var fast = sampleCubicPath(d);
    if (fast) { return fast; }
    try {
      var p = document.createElementNS("http://www.w3.org/2000/svg", "path"), len, n, i, pt, out = [];
      p.setAttribute("d", d);
      len = p.getTotalLength();
      if (!(len > 0)) { return null; }
      n = Math.min(400, Math.max(60, Math.round(len / 2.5)));
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

  /* ---------- easing: RE-Faster category morph = ease-out-expo (1 - 2^(-10 t)), no overshoot ---------- */
  function ease(t) {
    return t >= 1 ? 1 : (t <= 0 ? 0 : 1 - Math.pow(2, -10 * t));
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
    window.__ncMorphUntil = 0;                        // glow / ball / apply-glow may draw again (their next frame sees this)
    if (a.frame) { caf(a.frame); a.frame = 0; }
    if (a.svg && a.svg.classList) {
      a.svg.classList.remove(MORPH_CLASS);
      if (writeTarget) { fadeBack(a.svg); }
    }
    clearHandleOffsets(a);
    if (writeTarget && a.path.parentNode) {
      a.path.setAttribute("d", a.toD);
      try { mo.takeRecords(); } catch (e) { }
    }
    lastD = a.toD;
    lastH = takeHandles();
  }

  /* glow stack comes back with a short fade (nc-morph.css, .nc-morph-out) instead of popping in */
  var outTimer = 0, outSvg = null;
  function fadeBack(svg) {
    if (outTimer) { clearTimeout(outTimer); }
    if (outSvg && outSvg !== svg && outSvg.classList) { outSvg.classList.remove(OUT_CLASS); }
    outSvg = svg;
    svg.classList.add(OUT_CLASS);
    outTimer = setTimeout(function () { outTimer = 0; if (outSvg && outSvg.classList) { outSvg.classList.remove(OUT_CLASS); } outSvg = null; }, 360);
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

  /* v2: the X range is blended too. Both curves are sampled by their own x fraction (0..1 of their own width) and the shown point is
     lerp(oldPoint, newPoint, ease). Before, one fixed X grid (old range joined with new range) was used, so a curve that is narrower
     than the other (Elastic / Bounce / Wave sit inside a zoomed-out box, Bezier fills it) kept flat "tails" running to the box edge during
     the whole morph and lost them in one frame at the end: the line visibly popped / stretched when switching modes. */
  function buildD(a, e) {
    var n = GRID, yb = a.sb, ya = a.ya, parts = a.parts, k, u, xa, xb, x, y, y2;
    for (k = 0; k <= n; k++) {
      u = k / n;
      xa = a.ax0 + (a.ax1 - a.ax0) * u;
      xb = yb.minX + (yb.maxX - yb.minX) * u;
      x = xa + (xb - xa) * e;
      y2 = yb.at(xb);
      y = ya[k] + (y2 - ya[k]) * e;
      parts[k] = (k === 0 ? "M" : "L") + fmt(x) + "," + fmt(y);
    }
    return parts.join(" ");
  }

  function render(a) {
    var t = now(), lin = (t - a.t0) / (a.dur || DURATION), e;
    if (lin >= 1) { finish(a, true); return; }
    a.tr = t;
    window.__ncMorphUntil = Date.now() + 250;        // refreshed every frame: a stuck flag (hidden frame, no rAF) clears itself
    e = ease(lin < 0 ? 0 : lin);
    a.written = buildD(a, e);
    a.path.setAttribute("d", a.written);
    moveHandles(a, e);
    try { mo.takeRecords(); } catch (err) { }       // our own write must not look like an app update
  }

  function start(path, fromD, toD, fromH) {
    var A = parsePolyline(fromD), sa, i, a, svg;
    if (!A || A.length < 2) { return; }
    sa = makeSampler(A);
    if (anim) { finish(anim, false); }
    svg = path.parentNode;
    a = { path: path, svg: svg, frame: 0, t0: now(), tr: 0, dur: window.__ncWarm === 1 ? WARM_DURATION : DURATION, xs: [], ya: [], sb: null, toD: toD, written: fromD,
          appT: -1e9, parts: new Array(GRID + 1), hEls: handleEls(svg), hFrom: [], hNow: [] };
    for (i = 0; i < a.hEls.length; i++) {
      a.hFrom.push(fromH && fromH.length ? (fromH[i] || fromH[fromH.length - 1]) : null);   // extra handles sprout from the last old one
    }
    if (!setTarget(a, toD)) { return; }
    if (!(sa.maxX - sa.minX > 1) || !(a.sb.maxX - a.sb.minX > 1)) { return; }
    a.ax0 = sa.minX; a.ax1 = sa.maxX;
    for (i = 0; i <= GRID; i++) { a.ya.push(sa.at(a.ax0 + (a.ax1 - a.ax0) * i / GRID)); }
    anim = a;
    if (outTimer) { clearTimeout(outTimer); outTimer = 0; }
    if (outSvg && outSvg.classList) { outSvg.classList.remove(OUT_CLASS); outSvg = null; }
    svg.classList.add(MORPH_CLASS);
    render(a);                                       // first frame in the same task as the switch: no flash of the new curve
    if (anim === a) {
      (function loop() {
        if (anim !== a) { return; }
        a.frame = raf(function () { if (anim !== a) { return; } if (now() - a.tr >= 8 && now() - a.appT > 20) { render(a); }   /* the app is rewriting "d" every frame: the observer render below already covers it */ if (anim === a) { loop(); } });
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
      if (setTarget(anim, curD)) { anim.appT = now(); render(anim); }
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

  /* ---------- warm-up ----------
     "Lag only on the first mode switches after AE starts, gone after a few switches" = cold JS engine (the parser, sampler and
     frame builder run unoptimised the first times). Run the exact same code on synthetic curves in 3 short idle slices
     (~2-4 ms each) shortly after the tab loads, so the first real switch already hits optimised code. Touches no DOM and no app state. */
  function synth(kind, i) {
    var d = "M0,300", k, t, y;
    if (kind === 0) { return "M0,300 C" + (110 + i) + ",300 " + (160 + i) + ",20 500,20"; }                 // Custom style (C)
    for (k = 1; k <= 100; k++) {                                                                               // Bezier / Elastic / Bounce style (L)
      t = k / 100;
      y = kind === 1 ? 300 - 280 * (1 - Math.cos(t * Math.PI * (3.5 + i % 4)) * Math.pow(1 - t, 2.2))
                     : 300 - 280 * (1 - Math.pow(1 - t, 3 + i % 3));
      d += " L" + (t * 500).toFixed(2) + "," + y.toFixed(2);
    }
    return d;
  }
  function warmRound(round) {
    var i, j, A, B, sa, sb, a, e, ds = [synth(0, round), synth(1, round), synth(2, round)];
    for (j = 0; j < 3; j++) {
      A = parsePolyline(ds[j]); B = parsePolyline(ds[(j + 1) % 3]);
      if (!A || !B) { continue; }
      sa = makeSampler(A); sb = makeSampler(B);
      a = { ax0: sa.minX, ax1: sa.maxX, sb: sb, ya: [], parts: new Array(GRID + 1) };
      for (i = 0; i <= GRID; i++) { a.ya.push(sa.at(a.ax0 + (a.ax1 - a.ax0) * i / GRID)); }
      for (i = 0; i < 8; i++) { e = ease(i / 8); buildD(a, e); }
    }
  }
  function warmUp() {
    var n = 0, slice = function () {
      try { warmRound(n); } catch (e) { }
      if (++n < 3) { setTimeout(idle, 500); }
    }, idle = function () {
      if (window.requestIdleCallback) { window.requestIdleCallback(slice, { timeout: 1200 }); } else { setTimeout(slice, 0); }
    };
    setTimeout(idle, 1200);
  }

  function boot() {
    warmUp();
    var p = findMainPath();
    if (p) { lastD = p.getAttribute("d"); lastH = takeHandles(); }
    mo.observe(document.documentElement, {
      subtree: true, childList: true,
      attributes: true, attributeOldValue: true, attributeFilter: ["d", "class"]
    });
  }

  if (document.readyState === "loading") { document.addEventListener("DOMContentLoaded", boot); } else { boot(); }
})();
