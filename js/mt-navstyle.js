/* Multi Tool - mt-navstyle.js (companion of css/mt-navstyle.css). Plain ES5 for old CEF (AE 2019/2021).
   Settings > Navigation style: classic (default), dock, line or square. Works with every Navigation position.
   - Saved in localStorage "mtx.navStyle" (missing = classic). Sets <html data-nav-style="...">; the first paint is done by the inline script in html/index.html.
   - The cards [data-nav-style-opt] live in #settings-modal (index.html) and are mirrored to the Settings window by js/mt-settings-remote.js
     like every other control (the key attribute is listed there and in mt-settings-window.js).
   - Dock: icons grow as the pointer comes near (--dk = 1 to 1.5 on each .sidebar .tab, written here). Rect maths is zoom-aware (.app { zoom }).
   Off switch: remove this script + its stylesheet + the settings cards; the panel then always uses the Classic look. */
(function () {
  "use strict";
  var KEY = "mtx.navStyle", ATTR = "data-nav-style", OPTS = { classic: 1, dock: 1, line: 1, square: 1 };
  var MAXGROW = 0.5;                 // dock: biggest extra scale (1 + 0.5)
  var REACH = 2.4;                   // dock: how many tab heights away the pointer still has an effect
  var root = document.documentElement, rafId = 0, px = 0, py = 0, inside = false;

  function read() {
    var v = null;
    try { v = localStorage.getItem(KEY); } catch (e) { }
    return OPTS.hasOwnProperty(v) ? v : "classic";
  }
  function write(v) {
    try { if (v === "classic") { localStorage.removeItem(KEY); } else { localStorage.setItem(KEY, v); } } catch (e) { }
  }
  function current() { var v = root.getAttribute(ATTR); return OPTS.hasOwnProperty(v) ? v : "classic"; }
  function isDock() { return current() === "dock"; }

  function paint(st) {
    var list = document.querySelectorAll("[data-nav-style-opt]"), i, on;
    for (i = 0; i < list.length; i++) {
      on = list[i].getAttribute("data-nav-style-opt") === st;
      list[i].setAttribute("aria-checked", on ? "true" : "false");
      list[i].tabIndex = on ? 0 : -1;
    }
  }

  /* ---------- dock magnify ---------- */
  function zoomOf(el) {
    var z = 1, n, v;
    for (n = el; n && n.nodeType === 1; n = n.parentElement) {
      v = parseFloat(window.getComputedStyle(n).zoom);
      if (v && v > 0 && v !== 1) { z *= v; }
    }
    if (z === 1) { v = parseFloat(window.getComputedStyle(root).getPropertyValue("--ui-scale")); if (v && v > 0) { z = v; } }
    return z;
  }
  // rect in the same pixels as clientX / clientY (old CEF returns it divided by the zoom, see js/main.js pointerBox)
  function box(el, zoom) {
    var r = el.getBoundingClientRect(), z = zoom || zoomOf(el), k = 1, ratio;
    if (Math.abs(z - 1) > 0.001 && el.offsetWidth > 0) {
      ratio = r.width / el.offsetWidth;
      if (Math.abs(ratio - 1) < Math.abs(ratio - z)) { k = z; }
    }
    return { left: r.left * k, top: r.top * k, width: r.width * k, height: r.height * k };
  }
  function clearGrow() {
    var l = document.querySelectorAll(".sidebar .tab"), i;
    for (i = 0; i < l.length; i++) { l[i].__dk = null; l[i].style.removeProperty("--dk"); }
  }
  function grow() {
    rafId = 0;
    if (!isDock() || !inside || root.getAttribute("data-reduce-motion") === "true") { clearGrow(); return; }
    var pos = root.getAttribute("data-nav-pos"), bar = pos === "top" || pos === "bottom";
    var l = document.querySelectorAll(".sidebar .tab"), i, b, c, d, t, s, reach, z, v;
    z = l.length ? zoomOf(l[0]) : 1;          // one zoom lookup per frame, not one per tab (getComputedStyle up the whole tree)
    for (i = 0; i < l.length; i++) {
      b = box(l[i], z);
      if (!b.width) { continue; }
      c = bar ? b.left + b.width / 2 : b.top + b.height / 2;
      d = Math.abs((bar ? px : py) - c);
      reach = (bar ? b.width : b.height) * REACH;
      t = Math.max(0, 1 - d / reach);
      s = 1 + MAXGROW * t * t * (3 - 2 * t);
      v = s.toFixed(2);
      if (l[i].__dk !== v) { l[i].__dk = v; l[i].style.setProperty("--dk", v); }   // write only when the value changed
    }
  }
  function onMove(e) {
    var s = e.target && e.target.closest ? e.target.closest(".sidebar") : null;
    if (!s) { if (inside) { inside = false; grow(); } return; }
    px = e.clientX; py = e.clientY; inside = true;
    if (isDock() && !rafId) { rafId = (window.requestAnimationFrame || setTimeout)(grow, 16); }
  }
  function onLeave() { inside = false; if (!rafId) { rafId = (window.requestAnimationFrame || setTimeout)(grow, 16); } }

  function apply(st, save) {
    if (!OPTS.hasOwnProperty(st)) { st = "classic"; }
    root.setAttribute(ATTR, st);
    if (save) { write(st); }
    paint(st);
    if (st !== "dock") { clearGrow(); }
    // names: a Dock rail never expands (js/sidebar-expand.js asks the attribute); drop an open rail
    var bar = document.querySelector(".sidebar");
    if (bar && st === "dock") { bar.classList.remove("is-expanded"); }
    try { window.dispatchEvent(new Event("resize")); } catch (e) { }   // main.js re-measures the highlight, the tooltip hides
  }

  function arrowNav(e) {
    var k = e.keyCode;
    if (k !== 37 && k !== 38 && k !== 39 && k !== 40) { return; }
    var cards = Array.prototype.slice.call(document.querySelectorAll("[data-nav-style-opt]"));
    var i = cards.indexOf(e.currentTarget);
    if (i < 0) { return; }
    var next = (k === 37 || k === 38) ? (i + cards.length - 1) % cards.length : (i + 1) % cards.length;
    e.preventDefault();
    cards[next].focus();
    cards[next].click();
  }

  function bind() {
    var cards = document.querySelectorAll("[data-nav-style-opt]"), i;
    for (i = 0; i < cards.length; i++) {
      (function (card) {
        card.addEventListener("click", function () { apply(card.getAttribute("data-nav-style-opt"), true); });
        card.addEventListener("keydown", arrowNav);
      })(cards[i]);
    }
    paint(current());
    document.addEventListener("mousemove", onMove, true);
    document.addEventListener("mouseleave", onLeave);
    window.addEventListener("blur", onLeave);
    // The Settings window shares localStorage: a change made there is picked up here too.
    window.addEventListener("storage", function (e) { if (e && e.key === KEY) { apply(read(), false); } });
  }

  function reset() { write("classic"); apply("classic", false); }

  window.MTNavStyle = { get: current, set: function (s) { apply(s, true); }, reset: reset, dock: isDock };

  root.setAttribute(ATTR, read());
  if (document.readyState === "loading") { document.addEventListener("DOMContentLoaded", bind); } else { bind(); }
})();
