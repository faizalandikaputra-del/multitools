/* NeuCurve - continuous grow -> hold -> shrink glowing-border animation for the primary "APPLY" button (see
   nc-apply-glow.css for the full write-up, and the CEF drop-shadow note in particular).

   CEF NOTE (important, read this if the glow ever goes invisible again): the dash math is driven from
   JAVASCRIPT via requestAnimationFrame, NOT via CSS @keyframes on stroke-dasharray. Animating stroke-dasharray
   (a list-valued SVG property) through CSS keyframes - especially combined with calc(var(...)) - is exactly
   the kind of thing older/embedded Chromium builds (the CEF inside After Effects) can silently fail to
   animate, even though the same syntax works fine in a normal desktop Chrome. Setting .style.strokeDasharray
   / .style.strokeDashoffset directly from JS every frame is plain, boring DOM/SVG API usage that works on any
   CEF version - it's the same technique the old beam implementation already relied on (JS-computed
   strokeDasharray), just now driving the WHOLE grow/hold/shrink cycle instead of a single static split.

   .apply-btn is rendered by the compiled Svelte bundle, so - same pattern as nc-glow.js / nc-particles.js -
   this watches the DOM and, whenever it finds an .apply-btn without our SVG already inside it (first paint,
   or after Svelte remounts the action row), builds:
     - a crisp trace path,
     - a softer, blurred duplicate of that same trace for the neon bleed,
   and registers both with the shared animation loop below, which on every frame computes how much of the
   path should be "on" (dash length) and where that dash starts (offset) and writes both directly onto the
   elements. The result: a single glowing line starts as a point on the bottom-mid border, grows all the way
   around the rounded outline until the loop is fully closed, holds that closed ring briefly, then shrinks
   back down to a point at the exact same spot and loops.

   The rounded-rect path is built from the button's OWN measured size (ResizeObserver, not a fixed number) and
   traced at radius 8 to match .apply-btn's own border-radius exactly, so it fits the box precisely instead of
   floating outside it. It starts at the bottom-mid point and winds COUNTER-clockwise (right along the bottom
   first, up the right edge, across the top right-to-left, down the left edge, back to start).
   Console helper: __ncApplyGlow.resync() (useful after a manual panel resize in dev tools).
   To switch it off: delete the <script src="./nc-apply-glow.js"> line in index.html. */
(function () {
  "use strict";
  var NS = "http://www.w3.org/2000/svg";
  var RADIUS = 8;          // matches .apply-btn's own border-radius:8px exactly - traces right on the edge
  var DURATION = 4200;      // ms for one full grow -> hold -> shrink loop
  var GROW_END = 0.35;      // 0-35%: point grows into the full closed ring
  var HOLD_END = 0.60;      // 35-60%: ring holds fully closed
  // 60-100%: ring shrinks back down to a point at the same spot it started

  function roundedRectPath(w, h, r) {
    r = Math.max(0, Math.min(r, w / 2, h / 2));
    var cx = w / 2;
    // Starts at bottom-mid, winds RIGHT along the bottom edge first, up the right side, across the top
    // (right to left), down the left side, then back along the bottom to the start - i.e. counter-clockwise,
    // beginning at the bottom border. Sweep-flag 0 on every arc keeps the corners turning the same way.
    return [
      "M", cx, h,
      "L", w - r, h,
      "A", r, r, 0, 0, 0, w, h - r,
      "L", w, r,
      "A", r, r, 0, 0, 0, w - r, 0,
      "L", r, 0,
      "A", r, r, 0, 0, 0, 0, r,
      "L", 0, h - r,
      "A", r, r, 0, 0, 0, r, h,
      "L", cx, h,
      "Z"
    ].join(" ");
  }

  var items = [];          // { trace, traceSoft, len }
  var resyncFns = [];
  var rafId = null;
  var startTime = null;
  // Reduced motion is OPT-IN here, same policy as the panel's own css/style.css (search "OPT-IN" there for the
  // full write-up). This USED to follow the OS "prefers-reduced-motion" media query directly, which silently
  // held the ring static whenever Windows "Show animations" / macOS "Reduce motion" was off - a setting a lot
  // of users have off for performance reasons, with no idea it also mutes in-app effects like this one. That's
  // exactly why the glow can look "stuck"/non-animating specifically inside After Effects' embedded Chromium
  // (which inherits the OS setting) while it plays fine in a plain browser/device preview that doesn't. To
  // force it off on purpose instead: document.documentElement.setAttribute("data-reduce-motion", "true") on
  // THIS document (the NeuCurve iframe) - see also nc-apply-glow.css.
  var reduceMotion = false;
  try {
    reduceMotion = document.documentElement.getAttribute("data-reduce-motion") === "true";
  } catch (e) { /* ignore - just animate */ }

  function applyStatic() {
    // reduced-motion: hold a fully-closed, non-animating ring instead of running the loop.
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      var len = it.len || 200;
      var val = len.toFixed(2) + "px " + (len + 2).toFixed(2) + "px";
      it.trace.style.strokeDasharray = val;
      it.trace.style.strokeDashoffset = "0px";
      it.traceSoft.style.strokeDasharray = val;
      it.traceSoft.style.strokeDashoffset = "0px";
    }
  }

  function frame(now) {
    if (startTime === null) { startTime = now; }
    var u = ((now - startTime) % DURATION) / DURATION;
    var D, O; // D: 0..1 fraction of the path that's "on", O: 0..1 fraction offset into the path
    if (u < GROW_END) {
      D = u / GROW_END;
      O = 0;
    } else if (u < HOLD_END) {
      D = 1;
      O = 0;
    } else {
      var s = (u - HOLD_END) / (1 - HOLD_END);
      D = 1 - s;
      O = s;
    }
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      var len = it.len;
      if (!len || len < 1) { continue; }
      var dash = Math.max(0.6, D * len);      // never fully 0 - keeps the tiny "dot" cap visible
      var gap = len + 2;                      // longer than the path so only ONE dash shows
      var off = O * len;
      var val = dash.toFixed(2) + "px " + gap.toFixed(2) + "px";
      it.trace.style.strokeDasharray = val;
      it.trace.style.strokeDashoffset = off.toFixed(2) + "px";
      it.traceSoft.style.strokeDasharray = val;
      it.traceSoft.style.strokeDashoffset = off.toFixed(2) + "px";
    }
    rafId = (window.__ncAway && window.__ncAway()) ? null : requestAnimationFrame(frame);   // paused while the pointer is away (nc-away.js)
  }

  function startLoop() {
    if (reduceMotion) { applyStatic(); return; }
    if (rafId === null) { rafId = requestAnimationFrame(frame); }
  }

  // Follow the panel's Settings > Enable Animations toggle live (nc-theme-sync.js flips the attribute).
  try {
    new MutationObserver(function () {
      var now = document.documentElement.getAttribute("data-reduce-motion") === "true";
      if (now === reduceMotion) { return; }
      reduceMotion = now;
      if (now) {
        if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null; }
        applyStatic();
      } else {
        startLoop();
      }
    }).observe(document.documentElement, { attributes: true, attributeFilter: ["data-reduce-motion"] });
  } catch (e) { /* old CEF without MutationObserver - toggle applies on next reload */ }

  function build(btn) {
    var svg = document.createElementNS(NS, "svg");
    svg.setAttribute("class", "nc-apply-glow-svg");
    svg.setAttribute("aria-hidden", "true");

    function makePath(cls) {
      var p = document.createElementNS(NS, "path");
      p.setAttribute("class", cls);
      svg.appendChild(p);
      return p;
    }
    // Painted back-to-front: soft blurred trace first, crisp trace on top.
    var traceSoft = makePath("nc-apply-glow-trace-soft");
    var trace = makePath("nc-apply-glow-trace");

    btn.insertBefore(svg, btn.firstChild);

    var item = { trace: trace, traceSoft: traceSoft, len: 0 };
    items.push(item);

    function sync() {
      var w = btn.clientWidth, h = btn.clientHeight;
      if (w < 4 || h < 4) { return; }
      // No bleed/inset: the SVG's viewBox is the button's exact own size, so the traced path sits precisely
      // on its real edge. overflow:visible (see nc-apply-glow.css) still lets the blurred layer soften a
      // couple px past that edge without needing extra canvas space.
      svg.setAttribute("viewBox", "0 0 " + w + " " + h);
      svg.setAttribute("width", String(w));
      svg.setAttribute("height", String(h));

      var d = roundedRectPath(w, h, RADIUS);
      trace.setAttribute("d", d);
      traceSoft.setAttribute("d", d);
      item.len = trace.getTotalLength();
      if (reduceMotion) { applyStatic(); }
    }

    sync();
    resyncFns.push(sync);
    if (typeof ResizeObserver !== "undefined") {
      new ResizeObserver(sync).observe(btn);
    } else {
      window.addEventListener("resize", sync);
    }
  }

  function scan() {
    var btns = document.querySelectorAll(".apply-btn");
    for (var i = 0; i < btns.length; i++) {
      var btn = btns[i];
      if (!btn.querySelector(":scope > .nc-apply-glow-svg")) { build(btn); }
    }
  }

  function start() {
    scan();
    try {
      new MutationObserver(scan).observe(document.documentElement, { subtree: true, childList: true });
    } catch (e) { /* very old CEF: fall back to polling below */ }
    setInterval(function () { if (window.__ncAway && window.__ncAway()) { return; } scan(); }, 1000);
    window.addEventListener("nc-away", function () { if (!reduceMotion && rafId === null && !(window.__ncAway && window.__ncAway())) { rafId = requestAnimationFrame(frame); } });
    startLoop();
    window.__ncApplyGlow = { resync: function () { resyncFns.forEach(function (fn) { fn(); }); } };
  }

  if (document.readyState === "loading") { document.addEventListener("DOMContentLoaded", start); } else { start(); }
})();
