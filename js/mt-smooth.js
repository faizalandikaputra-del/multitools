/* Multi Tool - mt-smooth.js (companion of css/mt-smooth.css). Plain ES5 for old CEF (AE 2019/2021).
   1. Sidebar highlight: duration grows with the distance it travels (CSS var --mt-ind-dur on #tab-indicator).
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
  function initIndicator() {
    var ind = document.getElementById("tab-indicator");
    if (!ind) { return; }
    var lastY = readY(ind.style.transform);
    new MutationObserver(function () {
      var y = readY(ind.style.transform);
      if (y === null) { return; }
      if (lastY !== null && y !== lastY) {
        var ms = Math.max(240, Math.min(440, 220 + Math.abs(y - lastY) * 1.1));
        ind.style.setProperty("--mt-ind-dur", Math.round(ms) + "ms");
      }
      lastY = y;
    }).observe(ind, { attributes: true, attributeFilter: ["style"] });
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
