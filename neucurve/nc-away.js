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
  // IDLE gate: a pointer that rests INSIDE the page never fires mouseleave, so the perpetual loops (APPLY glow rAF,
  // particle canvas, infinite CSS) kept repainting a still panel and CEF dropped a frame now and then -> quick flicker.
  // No pointer / wheel / key input for IDLE_MS = treated as away. First input resumes everything.
  var IDLE_MS = 4000, lastAct = Date.now();
  function act() { lastAct = Date.now(); set(false); }
  setInterval(function () { if (!away && Date.now() - lastAct > IDLE_MS) { set(true); } }, 1000);
  var opts = true;
  document.addEventListener("mousemove", act, opts);
  document.addEventListener("mouseenter", act, opts);
  document.addEventListener("mousedown", act, opts);
  document.addEventListener("wheel", act, opts);
  document.addEventListener("keydown", act, opts);
  // Leaving the page. While a button is held (dragging a handle outside the graph) we stay "active".
  document.addEventListener("mouseleave", function (e) { if (!e.buttons) { set(true); } });
  document.addEventListener("mouseout", function (e) { if (!e.relatedTarget && !e.buttons) { set(true); } }, opts);
  window.addEventListener("mouseup", function (e) { if (e.clientX < 0 || e.clientY < 0 || e.clientX > window.innerWidth || e.clientY > window.innerHeight) { set(true); } }, opts);
})();
