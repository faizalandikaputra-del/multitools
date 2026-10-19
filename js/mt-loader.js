/**
 * mt-loader.js - paints the ring loader of the Curve tab (css/mt-boot.css). VISUAL ONLY: it watches the pane's .is-loading flag and the
 * frame's load event; it does not start, stop or change how NeuCurve loads (that stays in js/main.js + neucurve/nc-warm.js).
 * The number is honest in stages: it eases toward 55 % while the frame is loading, toward 92 % after the frame has loaded (modes warming),
 * and the loader disappears with the flag. ES5 on purpose (old CEF).
 */
(function () {
  "use strict";
  var pane = document.getElementById("curve-pane"), frame = document.getElementById("curve-frame");
  var el = pane && pane.querySelector(".mtl");
  if (!pane || !el) { return; }
  var arc = el.querySelector(".mtl-arc"), pct = el.querySelector(".mtl-pct");
  var len = 163.4, p = 0, loaded = false, running = false, last = 0;
  var raf = window.requestAnimationFrame || function (cb) { return setTimeout(function () { cb(Date.now()); }, 16); };
  try { len = 2 * Math.PI * parseFloat(arc.getAttribute("r")); } catch (e) { }
  arc.style.strokeDasharray = len;

  function paint() {
    arc.style.strokeDashoffset = len * (1 - p);
    var t = String(Math.round(p * 100)) + "%";
    if (pct.textContent !== t) { pct.textContent = t; }
  }
  function loading() { return pane.classList.contains("is-loading"); }
  function loop(now) {
    if (!loading()) { running = false; p = 0; loaded = false; paint(); return; }
    var dt = last ? Math.min(now - last, 100) : 16;
    last = now;
    var target = loaded ? 0.92 : 0.55;
    p += (target - p) * (1 - Math.exp(-dt / 900));
    if (p > 0.99) { p = 0.99; }
    paint();
    raf(loop);
  }
  function kick() { if (running || !loading()) { return; } running = true; last = 0; raf(loop); }

  if (frame) { frame.addEventListener("load", function () { if (frame.getAttribute("src")) { loaded = true; } }); }
  if (window.MutationObserver) { new MutationObserver(kick).observe(pane, { attributes: true, attributeFilter: ["class"] }); }
  paint();
  kick();
})();
