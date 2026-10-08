/**
 * mt-away.js - "pointer is away" flag for the Multi Tool panel (same idea as neucurve/nc-away.js).
 * While the pointer is outside the panel (or the panel is hidden) <html> gets class "mt-away" and
 * css/mt-motion-fix.css freezes the decorative infinite animations; ambient-orbs.js also stops
 * starting new glides. Everything resumes on the first pointer / key event. ES5 on purpose (old CEF).
 */
(function () {
  "use strict";
  var root = document.documentElement, away = true;
  root.className += " mt-away";                       // away until the first real event
  function set(v) {
    if (v === away) { return; }
    away = v;
    if (v) { root.className += " mt-away"; }
    else { root.className = root.className.replace(/(^|\s)mt-away(?=\s|$)/g, ""); }
  }
  // "moving": the user is actively working in the panel (pointer / wheel / key in the last MOVING_MS).
  // The slow decorative drift (orbs) rests meanwhile, so the frosted cards are not re-blurred every frame
  // while the user hovers / scrolls / drags. window.__mtMoving + window event "mt-motion-state".
  var MOVING_MS = 1500, moving = false, mTimer = 0;
  window.__mtMoving = false;
  function setMoving(v) {
    if (v === moving) { return; }
    moving = v; window.__mtMoving = v;
    if (v) { root.className += " mt-moving"; }
    else { root.className = root.className.replace(/(^|\s)mt-moving(?=\s|$)/g, ""); }
    try { window.dispatchEvent(new Event("mt-motion-state")); } catch (e) { }
  }
  function touch() { setMoving(true); clearTimeout(mTimer); mTimer = setTimeout(function () { setMoving(false); }, MOVING_MS); }
  var wake = function () { set(false); touch(); };
  ["mousemove", "mousedown", "wheel", "keydown", "touchstart", "mouseenter"].forEach(function (t) {
    document.addEventListener(t, wake, true);
  });
  document.addEventListener("mouseleave", function (e) { if (!e.buttons) { set(true); clearTimeout(mTimer); setMoving(false); } });
  document.addEventListener("mouseout", function (e) { if (!e.relatedTarget && !e.buttons) { set(true); } }, true);
  document.addEventListener("visibilitychange", function () { if (document.hidden) { set(true); } });
})();
