/*!
 * ambient-orbs.js - random drifting for the ambient colour circles behind the UI.
 *
 * The three .ambient-orb elements live in .ambient-orbs (first child of .app, see html/index.html).
 * Their slow blink is pure CSS (css/ambient-orbs.css). This file only moves them: every orb
 * independently picks a new random point every ~10-18 s and glides there with a CSS transition on
 * `transform` (compositor-only, so it costs next to nothing). Sizes follow the panel size and the
 * orbs are re-clamped on resize. ES5 on purpose (old CEF); never throws if the markup is missing.
 */
(function () {
  "use strict";

  var host = document.getElementById("ambient-orbs");
  if (!host) { return; }
  var orbs = Array.prototype.slice.call(host.querySelectorAll(".ambient-orb"));
  if (!orbs.length) { return; }

  // Start where the old static gradient pools were (fractions of the panel; centre of each circle).
  var START = [[0.10, 0.08], [0.92, 0.42], [0.30, 1.0]];
  var MOVE_MIN_S = 10, MOVE_MAX_S = 18;       // seconds per glide
  var SPAN = [-0.1, 1.1];                     // centres may drift slightly past the edges, so the glow can leave the panel

  var W = 0, H = 0, D = 0;
  var state = orbs.map(function (el, i) {
    var s = START[i % START.length];
    return { el: el, fx: s[0], fy: s[1], timer: 0 };
  });

  function rand(a, b) { return a + Math.random() * (b - a); }
  function reduced() { return document.documentElement.getAttribute("data-reduce-motion") === "true"; }

  function place(o, animateSeconds) {
    var x = o.fx * W - D / 2, y = o.fy * H - D / 2;
    o.el.style.transitionDuration = (animateSeconds || 0) + "s";
    o.el.style.transform = "translate3d(" + Math.round(x) + "px," + Math.round(y) + "px,0)";
  }

  function measure() {
    var w = host.clientWidth, h = host.clientHeight;
    if (!w || !h) { return false; }
    W = w; H = h;
    D = Math.round(Math.max(160, Math.min(520, Math.max(W, H) * 0.6)));
    state.forEach(function (o) { o.el.style.width = D + "px"; o.el.style.height = D + "px"; });
    return true;
  }

  function pickTarget(o) {
    var tries = 6, fx, fy;
    do {
      fx = rand(SPAN[0], SPAN[1]); fy = rand(SPAN[0], SPAN[1]);
      // make sure it is a real move, not a tiny shuffle
      if (Math.abs(fx - o.fx) + Math.abs(fy - o.fy) > 0.45) { break; }
    } while (--tries > 0);
    o.fx = fx; o.fy = fy;
  }

  function schedule(o, delayMs) {
    clearTimeout(o.timer);
    o.timer = setTimeout(function () { step(o); }, delayMs);
  }

  function step(o) {
    if (reduced() || !W || !H) { schedule(o, 4000); return; }   // wait until the panel has a size / motion is allowed
    var secs = rand(MOVE_MIN_S, MOVE_MAX_S);
    pickTarget(o);
    place(o, secs);
    schedule(o, secs * 1000);
  }

  function init() {
    if (!measure()) { setTimeout(init, 300); return; }
    state.forEach(function (o, i) {
      place(o, 0);
      void o.el.offsetWidth;                  // commit the start position before the first glide
      schedule(o, 400 + i * 900);             // staggered first moves so the orbs never move in sync
    });
  }

  var resizeTimer = 0;
  window.addEventListener("resize", function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      if (!measure()) { return; }
      state.forEach(function (o) { place(o, 0); });
    }, 120);
  });

  init();
})();
