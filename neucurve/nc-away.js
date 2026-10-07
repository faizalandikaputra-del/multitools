/* NeuCurve - nc-away.js : "pointer is away" gate (loaded FIRST).
   Bug: the Curve tab blinked black for a split second whenever the mouse was NOT over the panel. Cause: while the pointer is
   elsewhere in After Effects, AE keeps repainting its own window, and a CEF layer that is ALSO being repainted on every
   frame by perpetual animations (the APPLY button's rAF glow, the particle canvas, blur layers, infinite CSS animations)
   loses a frame now and then -> black flash.
   Fix: while the pointer is outside this page, every perpetual animation is stopped (no rAF, no CSS animation, no polling
   writes). Everything resumes the moment the pointer comes back. Visually nothing changes while you are using the panel.
   API: window.__ncAway() -> true while the pointer is away; fires window event "nc-away" on every change. */
(function () {
  "use strict";
  var root = document.documentElement, away = true;   // start "away" until the first real pointer event
  window.__ncAway = function () { return away; };
  function set(v) {
    if (v === away) { return; }
    away = v;
    if (v) { root.classList.add("nc-away"); } else { root.classList.remove("nc-away"); }
    try { window.dispatchEvent(new Event("nc-away")); } catch (e) { }
  }
  root.classList.add("nc-away");
  var opts = true;
  document.addEventListener("mousemove", function () { set(false); }, opts);
  document.addEventListener("mouseenter", function () { set(false); }, opts);
  document.addEventListener("mousedown", function () { set(false); }, opts);
  document.addEventListener("wheel", function () { set(false); }, opts);
  document.addEventListener("keydown", function () { set(false); }, opts);
  // Leaving the page. While a button is held (dragging a handle outside the graph) we stay "active".
  document.addEventListener("mouseleave", function (e) { if (!e.buttons) { set(true); } });
  document.addEventListener("mouseout", function (e) { if (!e.relatedTarget && !e.buttons) { set(true); } }, opts);
  window.addEventListener("mouseup", function (e) { if (e.clientX < 0 || e.clientY < 0 || e.clientX > window.innerWidth || e.clientY > window.innerHeight) { set(true); } }, opts);
})();
