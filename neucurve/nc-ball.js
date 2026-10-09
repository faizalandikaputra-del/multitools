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
  function parse(d, path) {
    var i, n, len, q, SAMPLES = 260;
    xs = []; ys = [];
    if (!d) { return; }
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
    for (i = 0; i < TAIL; i++) { d = mk("circle", { r: "0", opacity: "0" }); tail.push(d); g.appendChild(d); }
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

  function frame(now) {
    raf = 0;
    if (!on()) { stop(); return; }
    var svg = document.querySelector("svg.curve-svg"), path = svg && mainPath(svg), t, p, o, pt, i, tp, tt, hs;
    if (svg && path && svg.getBoundingClientRect().width > 0) {
      if (!g) { build(); }
      if (g.parentNode !== svg) {   /* keep it under the handles so they stay on top and grabbable */
        hs = svg.querySelector(":scope > g.handles");
        if (hs) { svg.insertBefore(g, hs); } else { svg.appendChild(g); }
      }
      var d = path.getAttribute("d");
      if (d !== curD) { curD = d; parse(d || "", path); }
      paint(svg, path, now);
      t = still() ? HOLD0 + RUN + 1 : (now - t0) % CYCLE;
      p = prog(t); o = still() ? 1 : opa(t);
      pt = pos(p);
      if (pt) {
        g.__head.setAttribute("transform", "translate(" + pt[0].toFixed(2) + " " + pt[1].toFixed(2) + ")");
        g.__head.setAttribute("opacity", o.toFixed(3));
        for (i = 0; i < TAIL; i++) {
          tt = still() ? 0 : t - (i + 1) * TAIL_STEP;
          tp = pos(prog(tt));
          if (!tp) { continue; }
          tail[i].setAttribute("cx", tp[0].toFixed(2)); tail[i].setAttribute("cy", tp[1].toFixed(2));
          tail[i].setAttribute("r", (3.2 - i * 0.3).toFixed(2));
          tail[i].setAttribute("opacity", (still() ? 0 : .34 * (1 - i / TAIL) * o).toFixed(3));
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
