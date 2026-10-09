/* Multi Tool - mt-settings-polish.js
   Tiny helper for the redesigned settings windows (html/settings.html and neucurve/settings.html).
   It only sets CSS custom properties and one class. It never reads or writes a setting.
   1. --fill      on every .settings-range, so the slider track fills up to the handle.
   2. --p-rgb     in NeuCurve's window: turns --settings-theme (a hex color) into an "r, g, b" triplet for the accent glow.
                  (Multi Tool's window already has --accent-rgb, which mt-settings-bus.js keeps up to date.)
   3. .p-swap     on the header whenever the section title changes, so the title and playhead animate again. */
(function () {
  "use strict";
  var root = document.documentElement;

  function hexToTriplet(v) {
    v = (v || "").replace(/^\s+|\s+$/g, "");
    var m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(v);
    if (!m) { return ""; }
    var h = m[1];
    if (h.length === 3) { h = h.charAt(0) + h.charAt(0) + h.charAt(1) + h.charAt(1) + h.charAt(2) + h.charAt(2); }
    return parseInt(h.substr(0, 2), 16) + ", " + parseInt(h.substr(2, 2), 16) + ", " + parseInt(h.substr(4, 2), 16);
  }

  var lastTheme = "", lastRgb = "";
  function syncAccent() {
    var cs;
    try { cs = getComputedStyle(root); } catch (e) { return; }
    /* NeuCurve window: bridge its hex theme color to the triplet the shared CSS uses */
    var theme = (cs.getPropertyValue("--settings-theme") || "").replace(/^\s+|\s+$/g, "");
    if (theme && theme !== lastTheme) {
      lastTheme = theme;
      var t = hexToTriplet(theme);
      if (t) { root.style.setProperty("--p-rgb", t); }
    }
    /* light accent (white, yellow...) needs a dark thumb / label on top of it */
    var rgb = (cs.getPropertyValue("--p-rgb") || "").replace(/^\s+|\s+$/g, "");
    if (rgb && rgb !== lastRgb) {
      lastRgb = rgb;
      var p = rgb.split(",");
      if (p.length === 3) {
        var lum = (0.299 * parseFloat(p[0]) + 0.587 * parseFloat(p[1]) + 0.114 * parseFloat(p[2])) / 255;
        root.style.setProperty("--p-on", lum > 0.62 ? "#17171b" : "#ffffff");
      }
    }
  }

  function fillOf(r) {
    var min = parseFloat(r.min); if (isNaN(min)) { min = 0; }
    var max = parseFloat(r.max); if (isNaN(max)) { max = 100; }
    var val = parseFloat(r.value); if (isNaN(val)) { val = min; }
    var pct = max > min ? ((val - min) / (max - min)) * 100 : 0;
    if (pct < 0) { pct = 0; } else if (pct > 100) { pct = 100; }
    var s = pct.toFixed(2) + "%";
    if (r.__pFill !== s) { r.__pFill = s; r.style.setProperty("--fill", s); }
  }
  function fillAll() {
    var list = document.querySelectorAll('input[type="range"]');
    for (var i = 0; i < list.length; i++) { fillOf(list[i]); }
  }

  function isFillRange(t) { return !!t && t.tagName === "INPUT" && t.type === "range"; }
  /* values set from code (the window mirrors the panel's sliders) fire no event: hook the setter once so --fill follows */
  (function hookValue() {
    try {
      var proto = HTMLInputElement.prototype, d = Object.getOwnPropertyDescriptor(proto, "value");
      if (!d || !d.set || d.set.__mtFill) { return; }
      var set = function (v) { d.set.call(this, v); if (this.type === "range") { fillOf(this); } };
      set.__mtFill = true;
      Object.defineProperty(proto, "value", { configurable: true, enumerable: d.enumerable, get: d.get, set: set });
    } catch (e) { /* old engine: fill still follows input / change events */ }
  })();
  document.addEventListener("input", function (e) { if (isFillRange(e.target)) { fillOf(e.target); } }, true);
  document.addEventListener("change", function (e) { if (isFillRange(e.target)) { fillOf(e.target); } }, true);

  function swap() {
    var head = document.querySelector(".settings-workspace-header");
    if (!head) { return; }
    head.classList.remove("p-swap");
    void head.offsetWidth; /* restart the animation */
    head.classList.add("p-swap");
  }

  function init() {
    syncAccent();
    fillAll();
    swap();
    var title = document.getElementById("settingsSectionTitle");
    if (title && typeof MutationObserver !== "undefined") {
      var last = title.textContent;
      new MutationObserver(function () {
        if (title.textContent !== last) { last = title.textContent; swap(); }
      }).observe(title, { childList: true, characterData: true, subtree: true });
    } else {
      document.addEventListener("click", function (e) {
        var n = e.target;
        while (n && n !== document) { if (n.getAttribute && n.getAttribute("data-settings-tab")) { swap(); return; } n = n.parentNode; }
      }, true);
    }
    /* values are also set from script (loading saved settings), which fires no event: re-check a few times a second */
    setInterval(function () { syncAccent(); fillAll(); }, 300);
  }

  if (document.readyState === "loading") { document.addEventListener("DOMContentLoaded", init); } else { init(); }
})();
