/**
 * splash.js - removes the opening splash (css/splash.css) once its animation has finished, or at once
 * when the user clicks / presses a key. The animation itself is pure CSS, so it starts painting before
 * any panel script has run; this file only cleans up. ES5 on purpose (old CEF).
 */
(function () {
  "use strict";
  var s = document.getElementById("mt-splash");
  if (!s) { return; }
  var gone = false, t;
  function done() {
    if (gone) { return; }
    gone = true; clearTimeout(t);
    s.className += " is-done";
    if (s.parentNode) { s.parentNode.removeChild(s); }
  }
  function skip() {
    if (gone) { return; }
    s.style.transition = "opacity 0.2s ease";
    s.style.animation = "none";
    s.style.opacity = "0";
    clearTimeout(t); t = setTimeout(done, 220);
  }
  s.addEventListener("animationend", function (e) { if (e.target === s && e.animationName === "mts-out") { done(); } });
  s.addEventListener("mousedown", skip);
  document.addEventListener("keydown", skip);
  t = setTimeout(done, 2200);                       // safety net if animationend never fires
})();
