/* Multi Tool - mt-smooth.js (companion of css/mt-smooth.css). Plain ES5 for old CEF (AE 2019/2021).
   1. Sidebar highlight: critically damped spring (Web Animation) that keeps its speed when you switch tabs quickly.
   2. "Finished" flash: when an action button / tile loses .is-loading (host call ended) a short accent veil plays,
      unless an error toast is showing. No change to main.js: it only watches class changes.
   Off switch: remove <script src="../js/mt-smooth.js"> and <link href="../css/mt-smooth.css">. */
(function () {
  "use strict";
  if (!window.MutationObserver) { return; }

  var DONE_SEL = ".btn, .btn-apply, .tool, .split-btn, .anchor-btn, .align-btn, .fit-btn, .flip-btn, " +
                 ".shortcut-tile, .qce-res-tile, .preset-apply, .btn-round-add, .label-swatch";

  function reduced() { return document.documentElement.getAttribute("data-reduce-motion") === "true"; }

  /* ---------- 1. sidebar highlight ---------- */
  function readY(t) {
    var m = /,\s*(-?[\d.]+)px/.exec(t || "");
    return m ? parseFloat(m[1]) : null;
  }
  /* v2: the highlight no longer uses a CSS transition (symmetric ease-in-out: every tab switch started from standstill and
     ended at standstill, so clicking / wheeling through several tabs felt like stop-start). It now follows a critically damped
     spring: no overshoot, and when the target changes mid-flight the NEW move starts with the CURRENT speed, so a fast run
     across several tabs is one continuous glide. main.js still just sets style.transform to the final slot; the motion is a
     Web Animation (keyframes sampled from the spring), so no style attribute is rewritten per frame and the other observers
     of the highlight (mt-anim.js) fire once per move, as before. Old hosts without Element.animate keep the CSS transition. */
  function initIndicator() {
    var ind = document.getElementById("tab-indicator");
    if (!ind) { return; }
    var spring = typeof ind.animate === "function";
    var W = 15, DUR = 560, N = 40;            /* W = stiffness (rad/s): ~330 ms to settle; DUR = length of the sampled run; N = keyframes */
    var y0 = readY(ind.style.transform), v0 = 0, tgt = y0, t0 = 0, anim = null, lastY = y0;
    if (spring) { document.documentElement.classList.add("mt-ind-spring"); }

    function tx(y) { return "translate(-50%, " + y.toFixed(2) + "px)"; }
    function clock() { return (window.performance && performance.now) ? performance.now() : Date.now(); }
    function stateAt(t) {
      if (tgt === null || !t0) { return { y: tgt, v: 0 }; }
      var dt = Math.max(0, (t - t0) / 1000), e = Math.exp(-W * dt), c1 = y0 - tgt, c2 = v0 + W * c1;
      return { y: tgt + (c1 + c2 * dt) * e, v: (v0 - W * c2 * dt) * e };
    }
    function stop() { if (anim) { try { anim.cancel(); } catch (e) { } anim = null; } }

    new MutationObserver(function (recs) {
      var y = readY(ind.style.transform), i, snap = false, t, s, k, tt, e, c1, c2, kfs;
      if (y === null) { return; }
      for (i = 0; i < recs.length; i++) {      /* main.js sets transition:none for a first / re-measured placement: jump, don't glide */
        var ov = recs[i].oldValue || "";
        if (ov.indexOf("transition: none") !== -1 || ov.indexOf("transition-property: none") !== -1) { snap = true; }
      }
      if (lastY !== null && y === lastY) { return; }          /* only width / height changed */
      if (!spring || snap || lastY === null || reduced()) { stop(); y0 = y; v0 = 0; tgt = y; t0 = 0; lastY = y; return; }
      t = clock(); s = stateAt(t);
      y0 = s.y; v0 = s.v; tgt = y; t0 = t; lastY = y;
      stop();
      c1 = y0 - tgt; c2 = v0 + W * c1; kfs = [];
      for (k = 0; k <= N; k++) {
        tt = (k / N) * (DUR / 1000); e = Math.exp(-W * tt);
        kfs.push({ transform: tx(k === N ? tgt : tgt + (c1 + c2 * tt) * e), offset: k / N });
      }
      try {
        var a = ind.animate(kfs, { duration: DUR, easing: "linear" });
        anim = a;
        a.onfinish = function () { if (anim === a) { anim = null; } };
      } catch (err) { anim = null; }
    }).observe(ind, { attributes: true, attributeFilter: ["style"], attributeOldValue: true });
  }

  /* ---------- 2. finished flash ---------- */
  function failed() { return !!document.querySelector(".toast.is-error.is-show"); }

  function flash(el) {
    var i, kids = el.children;
    for (i = kids.length - 1; i >= 0; i--) {
      if (kids[i].classList && kids[i].classList.contains("mt-done-fx")) { el.removeChild(kids[i]); }
    }
    var fx = document.createElement("span");
    fx.className = "mt-done-fx";
    fx.setAttribute("aria-hidden", "true");
    var restore = false;
    if (window.getComputedStyle(el).position === "static") { el.style.position = "relative"; restore = true; }
    el.appendChild(fx);
    setTimeout(function () {
      if (fx.parentNode) { fx.parentNode.removeChild(fx); }
      if (restore) { el.style.position = ""; }
    }, 560);
  }

  function initDone() {
    new MutationObserver(function (list) {
      for (var i = 0; i < list.length; i++) {
        var m = list[i], el = m.target;
        if ((m.oldValue || "").indexOf("is-loading") === -1) { continue; }
        if (!el.classList || el.classList.contains("is-loading")) { continue; }
        if (!el.matches(DONE_SEL)) { continue; }
        (function (node) {
          setTimeout(function () {
            /* the error toast (if any) is up by now */
            if (reduced() || !node.isConnected || failed()) { return; }
            flash(node);
          }, 70);
        })(el);
      }
    }).observe(document.body, { attributes: true, attributeFilter: ["class"], attributeOldValue: true, subtree: true });
  }

  function start() { initIndicator(); initDone(); }
  if (document.readyState === "loading") { document.addEventListener("DOMContentLoaded", start); } else { start(); }
})();
