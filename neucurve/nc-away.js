/* NeuCurve - nc-away.js : "pointer is away" gate (loaded FIRST).
   Bug 1: the Curve tab blinked black for a split second whenever the mouse was NOT over the panel. Cause: while the pointer is
   elsewhere in After Effects, AE keeps repainting its own window, and a CEF layer that is ALSO being repainted on every
   frame by perpetual animations (the APPLY button's rAF glow, the particle canvas, blur layers, infinite CSS animations)
   loses a frame now and then -> black flash.
   Bug 2 (v2): same quick flicker while the pointer RESTS inside the panel (no mouseleave ever fires).
   Fix: while the pointer is outside this page, OR no input for IDLE_MS, every heavy perpetual animation is stopped (no rAF,
   no CSS animation, no polling writes). Everything resumes on the first input.
   API: window.__ncAway()       -> true while pointer is outside OR idle (heavy loops: APPLY glow, polling)
        window.__ncPointerOut() -> true ONLY while the pointer is outside the page (light loops, e.g. particles, keep
                                   running while the pointer rests inside)
        window event "nc-away" fires whenever __ncAway() changes. */
(function () {
  "use strict";
  var root = document.documentElement;
  /* v4: Settings > "Keep Animations Running" (neucurve_keepMotion, default ON). ON = the gate never closes: nothing is
     paused when the pointer leaves the panel or rests for 4 s (the freeze looked like "animations suddenly stop").
     OFF = the old behaviour below (anti black-flash). */
  function keep() { return true; }   /* v27: the "Keep Animations Running" setting was removed - animations always keep running */
  var out = true, idle = false, away = !keep();   // old mode: start "away" until the first real pointer event
  var IDLE_MS = 4000, lastAct = Date.now();
  window.__ncAway = function () { return away; };
  window.__ncPointerOut = function () { return out; };
  function update() {
    var v = keep() ? false : (out || idle);
    if (v === away) { return; }
    away = v;
    if (v) { root.classList.add("nc-away"); } else { root.classList.remove("nc-away"); }
    try { window.dispatchEvent(new Event("nc-away")); } catch (e) { }
  }
  if (!keep()) { root.classList.add("nc-away"); }
  function act() { lastAct = Date.now(); out = false; idle = false; update(); }
  function leave() { out = true; update(); }
  setInterval(function () { if (!idle && !out && Date.now() - lastAct > IDLE_MS) { idle = true; } update(); }, 1000);
  window.addEventListener("storage", function (e) { if (!e.key || e.key === "neucurve_keepMotion") { update(); } });
  var opts = true;
  document.addEventListener("mousemove", act, opts);
  document.addEventListener("mouseenter", act, opts);
  document.addEventListener("mousedown", act, opts);
  document.addEventListener("wheel", act, opts);
  document.addEventListener("keydown", act, opts);
  // Leaving the page. While a button is held (dragging a handle outside the graph) we stay "active".
  document.addEventListener("mouseleave", function (e) { if (!e.buttons) { leave(); } });
  document.addEventListener("mouseout", function (e) { if (!e.relatedTarget && !e.buttons) { leave(); } }, opts);
  window.addEventListener("mouseup", function (e) { if (e.clientX < 0 || e.clientY < 0 || e.clientX > window.innerWidth || e.clientY > window.innerHeight) { leave(); } }, opts);
})();
