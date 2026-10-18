/* NeuCurve - nc-warm.js  (companion of nc-warm.css)
   Why: in After Effects the first mode switches of a session feel heavy, then smooth after a few switches; the same panel in a normal
   browser tab is fine. That is a cold engine: the first time a mode (Bezier / Custom / Elastic / Bounce / Wave / Steps) is shown, the
   bundle builds that mode's UI, the stylesheets resolve for it, and every helper script (nc-flow, nc-gsize, nc-icons-pro, nc-extras ...)
   runs its mutation handlers for the first time, all on unoptimised code and a software-rendered CEF, right when you click.
   What: once the graph is up, this file silently clicks through every mode tab once and ends on the mode you were on (the app only
   stores the active mode, nothing else changes), while the page is hidden and the host shows its loading spinner. It stops by itself
   the moment you touch the panel. The host (js/main.js, Curve.show) keeps its spinner until this file posts {mtCurveReady}, with a
   4 s safety timeout, so the panel never waits on this longer than that.
   Only inside the Curve tab frame: the Large Graph Editor window is a top-level window synced with the main panel, never cycled.
   Off switch: WARM = false below (or remove nc-warm.js / nc-warm.css from neucurve/index.html). Plain ES5 for old CEF. */
(function () {
  "use strict";
  var WARM = true;
  var TAB_SEL = ".mtab, .nav-tab";
  var SETTLE = 600;            // ms after the last click: the app eases its Y viewport for ~0.5 s after a mode switch
  var GIVE_UP = 8000;          // ms: no graph / no tabs by then = skip warming
  var root = document.documentElement;
  var inFrame = false, raf = window.requestAnimationFrame || function (cb) { return setTimeout(cb, 16); };
  var finished = false, origin = null, aborted = false, t0 = Date.now(), failsafe = 0;

  try { inFrame = !!window.parent && window.parent !== window; } catch (e) { inFrame = true; }

  function ready() {
    try { if (window.parent && window.parent !== window) { window.parent.postMessage({ mtCurveReady: true }, "*"); } } catch (e) { }
  }
  function vis(el) { return !!el && el.getClientRects && el.getClientRects().length > 0; }
  function isActive(el) { return /(^|\s)active(\s|$)/.test(el.className || ""); }
  function tabs() {
    var all = document.querySelectorAll(TAB_SEL), out = [], i;
    for (i = 0; i < all.length; i++) { if (vis(all[i])) { out.push(all[i]); } }
    return out;
  }
  function graphUp() { var s = document.querySelector("svg.curve-svg"); return !!(s && s.querySelector("path[stroke-width='2.5']") && vis(s)); }

  function done(restoreFirst) {
    if (finished) { return; }
    finished = true;
    clearTimeout(failsafe);
    try { if (restoreFirst && origin && origin.parentNode && !isActive(origin)) { origin.click(); } } catch (e) { }
    window.removeEventListener("pointerdown", stop, true); window.removeEventListener("mousedown", stop, true);
    window.removeEventListener("keydown", stop, true); window.removeEventListener("wheel", stop, true);
    window.removeEventListener("touchstart", stop, true);
    setTimeout(function () {
      window.__ncWarm = 0;
      root.classList.remove("nc-warming");
      root.classList.add("nc-warm-out");
      setTimeout(function () { root.classList.remove("nc-warm-out"); }, 400);
      ready();
    }, restoreFirst ? 80 : 0);
  }
  function stop() { aborted = true; done(true); }   // the user touched the panel: put the mode back and show it right away

  function run(list) {
    var order = [], i, k = 0, o = -1;
    for (i = 0; i < list.length; i++) { if (isActive(list[i])) { o = i; } }
    if (o < 0) { done(false); return; }
    origin = list[o];
    for (i = 0; i < list.length; i++) { if (i !== o) { order.push(list[i]); } }
    order.push(origin);                                     // end on the mode you were on
    order = order.concat(order);                            // v3: two passes - the second one runs on code the engine has already started to optimise, and repaints what the first pass painted
    (function next() {
      if (finished) { return; }
      if (k >= order.length) { setTimeout(function () { if (!finished) { done(true); } }, SETTLE); return; }
      try { order[k++].click(); } catch (e) { }
      raf(function () { raf(next); });
    })();
  }

  function begin() {
    var list;
    if (finished) { return; }
    if (document.hidden) { setTimeout(begin, 200); return; }
    list = tabs();
    if (list.length >= 2 && graphUp()) { setTimeout(function () { if (!finished) { run(tabs()); } }, 350); return; }   // let nc-flow / nc-gsize finish their first layout
    if (Date.now() - t0 > GIVE_UP) { done(false); return; }
    setTimeout(begin, 120);
  }

  if (!WARM || !inFrame) { return; }
  try { if (window.localStorage && localStorage.getItem("neucurve_noWarm") === "1") { return; } } catch (e) { }
  window.__ncWarm = 1;                                      // nc-morph.js: morphs run for real while warming, but only 120 ms long (warms the morph path too)
  root.classList.add("nc-warming");
  failsafe = setTimeout(function () { done(true); }, GIVE_UP + 4000);   // whatever happens, the panel is never left hidden
  window.addEventListener("pointerdown", stop, true); window.addEventListener("mousedown", stop, true);
  window.addEventListener("keydown", stop, true); window.addEventListener("wheel", stop, true);
  window.addEventListener("touchstart", stop, true);
  if (document.readyState === "loading") { document.addEventListener("DOMContentLoaded", begin); } else { begin(); }
})();
