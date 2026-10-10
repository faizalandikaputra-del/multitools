/* NeuCurve - nc-ball.js (v1)  LIVE PREVIEW BALL INSIDE THE GRAPH
   The ball that used to run on the scrub strip under the graph now lives IN the graph and never stops: it travels along the curve
   (x = time, y = the eased value), rests a moment at the end, fades, and starts over. Because it reads the curve that is drawn,
   it follows every edit live (dragging a handle, switching Bezier / Elastic / Bounce / Wave / Steps / Custom, a preset) with no
   extra wiring. Looks: a core dot in the curve colour with a dark separator ring, a soft halo, and a short comet tail.
   The Preview (play) button restarts the run from the left.
   Settings > Behavior > "Live Preview Ball" (localStorage neucurve_liveBall, default "1"). OFF = the ball is removed and the old
   strip under the graph comes back. Only attributes that no other NeuCurve script watches are written per frame (cx / cy / transform /
   opacity / fill), and no node is added or removed while it runs, so it never wakes the other MutationObservers. Plain ES5. */
(function () {
  "use strict";
  if (/[?&]ext=settings/.test(location.search)) { return; }
  var NS = "http://www.w3.org/2000/svg", root = document.documentElement;
  var HOLD0 = 300, RUN = 1100, HOLD1 = 450, FADE = 150, CYCLE = HOLD0 + RUN + HOLD1 + FADE;   /* ms: rest+fade in | travel | rest | fade out */
  var TAIL = 7, TAIL_STEP = 26;                                                                 /* tail dots, ms between them */
  var t0 = 0, raf = 0, g = null, core = null, ring = null, h1 = null, h2 = null, tail = [], lastColor = "", colorAt = 0, curD = null, xs = [], ys = [], running = false;

  function on() { try { return localStorage.getItem("neucurve_liveBall") !== "0"; } catch (e) { return true; } }
  function still() { return root.getAttribute("data-reduce-motion") === "true"; }

  function mainPath(svg) {
    var kids = svg.children, i, k;
    for (i = 0; i < kids.length; i++) {
      k = kids[i];
      if (k.tagName && k.tagName.toLowerCase() === "path" && k.getAttribute("stroke-width") === "2.5" && k.getAttribute("fill") === "none") { return k; }
    }
    return null;
  }

  /* Bezier / Custom draw cubic "C" segments, the other modes draw "L" polylines. Polylines are read straight from "d" (fast);
     anything else is sampled along the path with the browser's own getPointAtLength, so the ball follows whatever is drawn. */
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

  function parse(d, path) {
    var i, n, len, q, SAMPLES = 160, fast;
    xs = []; ys = [];
    if (!d) { return; }
    fast = !/[^MLmlz\d\s,.eE+-]/.test(d) ? null : sampleCubicPath(d);
    if (fast) { for (i = 0; i < fast.length; i++) { xs.push(fast[i][0]); ys.push(fast[i][1]); } }
    else
    if (!/[^MLmlz\d\s,.eE+-]/.test(d)) {
      n = d.match(/-?\d*\.?\d+(?:e-?\d+)?/gi) || [];
      for (i = 0; i + 1 < n.length; i += 2) { xs.push(parseFloat(n[i])); ys.push(parseFloat(n[i + 1])); }
    } else {
      try {
        len = path.getTotalLength();
        for (i = 0; i <= SAMPLES; i++) { q = path.getPointAtLength(len * i / SAMPLES); xs.push(q.x); ys.push(q.y); }
      } catch (e) { xs = []; ys = []; }
    }
    for (i = 1; i < xs.length; i++) { if (xs[i] < xs[i - 1]) { xs[i] = xs[i - 1]; } }   /* binary search needs x to never go back */
  }

  /* y of the drawn curve at progress p (0..1 of its x range) */
  function pos(p) {
    var n = xs.length, x, lo = 0, hi, mid, a, b, f;
    if (n < 2) { return null; }
    x = xs[0] + (xs[n - 1] - xs[0]) * p;
    hi = n - 1;
    while (hi - lo > 1) { mid = (lo + hi) >> 1; if (xs[mid] <= x) { lo = mid; } else { hi = mid; } }
    a = xs[lo]; b = xs[hi]; f = b > a ? (x - a) / (b - a) : 0;
    return [x, ys[lo] + (ys[hi] - ys[lo]) * f];
  }

  function prog(t) { return t < HOLD0 ? 0 : (t < HOLD0 + RUN ? (t - HOLD0) / RUN : 1); }
  function opa(t) { return t < FADE ? t / FADE : (t > CYCLE - FADE ? (CYCLE - t) / FADE : 1); }

  function mk(tag, attrs) {
    var e = document.createElementNS(NS, tag), k;
    for (k in attrs) { if (attrs.hasOwnProperty(k)) { e.setAttribute(k, attrs[k]); } }
    return e;
  }

  function build() {
    var i, d;
    g = mk("g", { "class": "nc-ball", "pointer-events": "none" });
    for (i = 0; i < TAIL; i++) { d = mk("circle", { r: (3.2 - i * 0.3).toFixed(2), cx: "0", cy: "0", opacity: "0" }); tail.push(d); g.appendChild(d); }
    var head = mk("g", { "class": "nc-ball-head" });
    h1 = mk("circle", { r: "12", opacity: ".12" });
    h2 = mk("circle", { r: "7.6", opacity: ".2" });
    ring = mk("circle", { r: "5.6", opacity: ".92" });
    core = mk("circle", { r: "3.8" });
    head.appendChild(h1); head.appendChild(h2); head.appendChild(ring); head.appendChild(core);
    g.appendChild(head);
    g.__head = head;
  }

  function paint(svg, path, now) {
    var k, c, light;
    if (now - colorAt > 400) {
      colorAt = now;
      try { c = getComputedStyle(path).stroke; } catch (e) { c = ""; }
      if (c && c !== "none" && c !== lastColor) {
        lastColor = c;
        for (k = 0; k < tail.length; k++) { tail[k].setAttribute("fill", c); }
        h1.setAttribute("fill", c); h2.setAttribute("fill", c); core.setAttribute("fill", c);
      }
      light = root.classList.contains("mt-light");
      ring.setAttribute("fill", light ? "#f2f2f2" : "#0e0e0e");
    }
  }

  /* v27 smooth run. Why it stuttered: (1) the loop skipped frames (>= 28 ms apart) so the ball moved at an uneven ~30 fps,
     (2) every 400-500 ms it forced a style recalc (getComputedStyle) and a layout (getBoundingClientRect) INSIDE the frame,
     (3) it rewrote ~30 attributes per frame, even in the rest phases where nothing moves.
     Now: one draw per display frame, size comes from a ResizeObserver, the colour is re-read only while the ball rests, and an
     attribute is written only when its value changed (tail dots are moved with one transform each; their radius is fixed). */
  var shown = false, ro = null, roSvg = null, roPoll = 0;
  var lastHead = "", lastHeadO = "", lastTailT = [], lastTailO = [];
  function watchSize(svg) {
    if (roSvg === svg) {
      if (!ro && performance.now() - roPoll > 1500) { roPoll = performance.now(); shown = svg.getBoundingClientRect().width > 0; }
      return;
    }
    roSvg = svg;
    if (ro) { try { ro.disconnect(); } catch (e) { } ro = null; }
    shown = svg.getBoundingClientRect().width > 0;   /* once, here - never per frame */
    if (window.ResizeObserver) {
      try { ro = new ResizeObserver(function (es) { var r = es && es[0] && es[0].contentRect; if (r) { shown = r.width > 0; } }); ro.observe(svg); } catch (e) { ro = null; }
    }
  }
  function frame(now) {
    raf = 0;
    if (!on()) { stop(); return; }
    /* no writes while the graph is being dragged (nc-glow.css hides the ball for that time) */
    if (root.classList.contains("nc-graph-drag")) { raf = requestAnimationFrame(frame); return; }
    var svg = document.querySelector("svg.curve-svg"), path = svg && mainPath(svg), t, p, o, pt, i, tp, tt, hs, d, s2, o2, rest, st = still();
    if (svg && path) { watchSize(svg); }
    if (svg && path && shown) {
      if (!g) { build(); }
      if (g.parentNode !== svg) {   /* keep it under the handles so they stay on top and grabbable */
        hs = svg.querySelector(":scope > g.handles");
        if (hs) { svg.insertBefore(g, hs); } else { svg.appendChild(g); }
      }
      d = path.getAttribute("d");
      if (d !== curD) { curD = d; parse(d || "", path); }
      t = st ? HOLD0 + RUN + 1 : (now - t0) % CYCLE;
      rest = st || t > HOLD0 + RUN;                                  /* the ball is not travelling: a good moment for the style read */
      if (!lastColor || (rest && now - colorAt > 1500)) { paint(svg, path, now); }
      p = prog(t); o = st ? 1 : opa(t);
      pt = pos(p);
      if (pt) {
        s2 = "translate(" + pt[0].toFixed(2) + " " + pt[1].toFixed(2) + ")";
        if (s2 !== lastHead) { lastHead = s2; g.__head.setAttribute("transform", s2); }
        o2 = o.toFixed(3);
        if (o2 !== lastHeadO) { lastHeadO = o2; g.__head.setAttribute("opacity", o2); }
        for (i = 0; i < TAIL; i++) {
          tt = st ? 0 : t - (i + 1) * TAIL_STEP;
          tp = pos(prog(tt));
          if (!tp) { continue; }
          s2 = "translate(" + tp[0].toFixed(2) + " " + tp[1].toFixed(2) + ")";
          if (s2 !== lastTailT[i]) { lastTailT[i] = s2; tail[i].setAttribute("transform", s2); }
          o2 = (st ? 0 : .34 * (1 - i / TAIL) * o).toFixed(3);
          if (o2 !== lastTailO[i]) { lastTailO[i] = o2; tail[i].setAttribute("opacity", o2); }
        }
      }
    }
    raf = requestAnimationFrame(frame);
  }

  function start() {
    root.classList.add("nc-ball-on");
    if (!t0) { t0 = performance.now(); }
    if (!raf) { raf = requestAnimationFrame(frame); }
    running = true;
  }
  function stop() {
    if (raf) { cancelAnimationFrame(raf); raf = 0; }
    if (g && g.parentNode) { g.parentNode.removeChild(g); }
    lastHead = ""; lastHeadO = ""; lastTailT = []; lastTailO = [];
    root.classList.remove("nc-ball-on");
    running = false;
  }
  function refresh() {
    var was = running;
    if (on()) { start(); } else { stop(); }
    if (was !== running) {   /* the strip under the graph came / went: the bundle re-measures the graph on resize */
      setTimeout(function () { try { window.dispatchEvent(new Event("resize")); } catch (e) { } }, 30);
    }
  }

  /* Preview (play) button = run again from the left */
  document.addEventListener("click", function (e) {
    var b = e.target && e.target.closest && e.target.closest('[title="Preview"],[data-ncp="Preview"]');
    if (b) { t0 = performance.now(); }
  }, true);

  window.addEventListener("storage", function (e) { if (!e.key || e.key === "neucurve_liveBall") { refresh(); } });
  try {
    if (window.CSInterface) {
      new window.CSInterface().addEventListener("com.neucurve.sync", function (ev) {
        try {
          var d = ev && ev.data; if (typeof d === "string") { d = JSON.parse(d); }
          if (d && d.key === "liveBall") { localStorage.setItem("neucurve_liveBall", String(d.val)); refresh(); }
        } catch (e) { }
      });
    }
  } catch (e) { }

  refresh();   /* before the bundle builds its DOM: the strip is hidden from the first paint, the ball appears with the graph */
})();
