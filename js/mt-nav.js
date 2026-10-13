/* Multi Tool - mt-nav.js (v2)  -  Settings > Appearance > Navigation (see css/mt-nav.css)
   Where the tab rail sits: "left" (default, nothing set on <html>) or "right" (data-nav="right"). Stored in localStorage "mtx.navPos".
   The two cards [data-nav-opt] live in #settings-modal; the separate Settings window mirrors them through js/mt-settings-remote.js
   (the attribute is in its key list). Switching: the rail fades out through its old edge, the tools glide across (FLIP) and the rail fades in from the new edge, tab by tab (details at slide()).
   No slide when animations are off (data-reduce-motion). MTNav.reset() is called by Settings > Reset everything. ES5. */
(function () {
  "use strict";
  var KEY = "mtx.navPos", root = document.documentElement, DUR = 380, EASE = "cubic-bezier(0.2, 0, 0, 1)";

  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { } }
  function lsDel(k) { try { localStorage.removeItem(k); } catch (e) { } }
  function get() { return lsGet(KEY) === "right" ? "right" : "left"; }
  function reduce() { return root.getAttribute("data-reduce-motion") === "true"; }

  function apply() {
    if (get() === "right") { root.setAttribute("data-nav", "right"); } else { root.removeAttribute("data-nav"); }
  }

  function paint() {
    var cards = document.querySelectorAll("[data-nav-opt]"), cur = get(), i;
    for (i = 0; i < cards.length; i++) { cards[i].setAttribute("aria-checked", cards[i].getAttribute("data-nav-opt") === cur ? "true" : "false"); }
  }

  // v2 (fix53): the rail LEAVES through its old edge and ARRIVES from the new edge while the tools glide across - one carried-over motion, no sweep over the tools.
  //   phase A (150 ms, accelerate)  rail slides 18 px toward its old edge and fades out; the tools dim a little (ambient)
  //   the side flips (the tab icons / names mirror while the rail is invisible: no visible jump)
  //   phase B (tools 440 ms, ease (0.2, 0, 0, 1))  the tools glide from where they were to where they are, dim -> full
  //   phase B (rail 380 ms, start +60 ms, MD3 emphasized decelerate)  rail comes in from 28 px beyond the new edge + fades in; every tab follows 28 ms after the
  //   previous one (max 170 ms), moving 10 px. Total about 0.5 s, the "page transition" band. Only transform + opacity (GPU), nothing re-lays out.
  var T_OUT = 150, T_MAIN = 440, T_IN = 380, E_OUT = "cubic-bezier(0.3, 0, 1, 1)", E_IN = "cubic-bezier(0.05, 0.7, 0.1, 1)";
  var run = null;                                  // the transition in progress: { anims, timer, phaseA, change, side, main }

  function wipe(r) {                               // stop everything of a transition and give back the elements' own styles
    var i;
    if (r.timer) { clearTimeout(r.timer); r.timer = 0; }
    for (i = 0; i < r.anims.length; i++) { try { r.anims[i].cancel(); } catch (e) { } }
    r.anims = [];
    if (r.side) { r.side.style.opacity = ""; }
  }
  function finishNow() {                           // a second pick while the first still plays: land the first at once
    var r = run; if (!r) { return; }
    run = null; wipe(r);
    if (r.phaseA && r.change) { r.change(); }
  }

  function slide(change) {
    var side = document.querySelector(".sidebar"), main = document.getElementById("main"), r, a0, b0, out, inn;
    finishNow();
    if (!side || !side.animate || reduce()) { change(); return; }
    a0 = side.getBoundingClientRect().left; b0 = main ? main.getBoundingClientRect().left : 0;
    out = get() === "left" ? -1 : 1;               // old edge; the new edge is the opposite one
    inn = -out;
    r = run = { anims: [], timer: 0, phaseA: true, change: change, side: side, main: main };
    try {
      r.anims.push(side.animate([{ opacity: 1, transform: "translate3d(0,0,0)" }, { opacity: 0, transform: "translate3d(" + (out * 18) + "px,0,0)" }], { duration: T_OUT, easing: E_OUT, fill: "forwards" }));
      if (main) { r.anims.push(main.animate([{ opacity: 1 }, { opacity: 0.82 }], { duration: T_OUT, easing: E_OUT, fill: "forwards" })); }
    } catch (e) { run = null; wipe(r); change(); return; }
    r.timer = setTimeout(function () {
      var a1, b1, tabs, i, ch;
      r.timer = 0; r.phaseA = false;
      side.style.opacity = "0";                    // hold it invisible across the flip, then let the new animation take over
      wipe(r); side.style.opacity = "0";
      change();
      a1 = side.getBoundingClientRect().left; b1 = main ? main.getBoundingClientRect().left : 0;
      try {
        r.anims.push(side.animate([{ opacity: 0, transform: "translate3d(" + (inn * 28) + "px,0,0)" }, { opacity: 1, transform: "translate3d(0,0,0)" }], { duration: T_IN, delay: 60, easing: E_IN, fill: "both" }));
        tabs = side.querySelectorAll(".tab");
        for (i = 0; i < tabs.length; i++) {
          r.anims.push(tabs[i].animate([{ opacity: 0, transform: "translate3d(" + (inn * 10) + "px,0,0)" }, { opacity: 1, transform: "translate3d(0,0,0)" }], { duration: 300, delay: 100 + Math.min(i * 28, 170), easing: E_IN, fill: "backwards" }));
        }
        if (main) {
          r.anims.push(main.animate([{ transform: "translate3d(" + (Math.abs(b0 - b1) > 1 ? (b0 - b1) : 0) + "px,0,0)", opacity: 0.82 }, { transform: "translate3d(0,0,0)", opacity: 1 }], { duration: T_MAIN, easing: EASE }));
        }
        side.style.opacity = "";
      } catch (e2) { }
      r.timer = setTimeout(function () { if (run === r) { run = null; } wipe(r); }, T_MAIN + 220);
    }, T_OUT);
  }

  function pick(v) {
    v = v === "right" ? "right" : "left";
    if (v === get()) { paint(); return; }
    slide(function () { if (v === "right") { lsSet(KEY, "right"); } else { lsDel(KEY); } apply(); });
    paint();
  }

  function reset() { lsDel(KEY); apply(); paint(); }

  function init() {
    var cards = document.querySelectorAll("[data-nav-opt]"), i;
    for (i = 0; i < cards.length; i++) {
      (function (card) { card.addEventListener("click", function () { pick(card.getAttribute("data-nav-opt")); }); })(cards[i]);
    }
    paint();
  }

  apply();                                    // before the first paint: the rail never jumps sides on start
  window.MTNav = { get: get, set: pick, reset: reset };
  if (document.readyState === "loading") { document.addEventListener("DOMContentLoaded", init); } else { init(); }
})();
