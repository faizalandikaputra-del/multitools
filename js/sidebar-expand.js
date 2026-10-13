/**
 * sidebar-expand.js - navigation rail auto-expand (left or right edge; not in a top / bottom bar).
 * - Adds a name label (taken from aria-label) to every sidebar button; the native title="" tooltips of the
 *   sidebar were removed on purpose (they flickered), the expanded rail shows the names instead.
 * - Cursor stays on the sidebar for 5 s -> class "is-expanded" (grows to the right, see css/sidebar-expand.css).
 * - Cursor leaves (or the window loses focus) -> collapses smoothly again. While a tab is being dragged to
 *   reorder, the rail stays open and closes right after the drop if the cursor is outside.
 * ES5 on purpose (old CEF).
 */
(function () {
  "use strict";
  var DWELL = 5000;                     // ms the cursor must stay on the navigation before it expands
  var bar = null, timer = 0, inside = false;

  function labelise() {
    var tabs = bar.querySelectorAll(".tab"), i, t, name, span;
    for (i = 0; i < tabs.length; i++) {
      t = tabs[i];
      if (t.querySelector(".tab-label")) { continue; }
      name = t.getAttribute("aria-label") || t.getAttribute("title") || "";
      t.removeAttribute("title");
      if (!name) { continue; }
      span = document.createElement("span");
      span.className = "tab-label";
      span.appendChild(document.createTextNode(name));
      t.appendChild(span);
    }
  }

  function dragging() { return document.documentElement.classList.contains("is-tab-dragging"); }
  // Settings > Navigation position (js/mt-navpos.js): a top / bottom bar has no room for names, so it never expands.
  // Settings > Navigation style = Dock (js/mt-navstyle.js): names are tooltips there, the rail never expands either.
  function inBar() { var r = document.documentElement, d = r.getAttribute("data-nav-pos"); return d === "top" || d === "bottom" || r.getAttribute("data-nav-style") === "dock"; }
  function open() { timer = 0; if (inside && bar && !inBar()) { bar.classList.add("is-expanded"); } }
  function close() {
    if (timer) { clearTimeout(timer); timer = 0; }
    if (bar) { bar.classList.remove("is-expanded"); }
  }

  function enter() {
    inside = true;
    if (inBar()) { return; }
    if (timer || bar.classList.contains("is-expanded")) { return; }
    timer = setTimeout(open, DWELL);
  }
  function leave() {
    inside = false;
    if (dragging()) { return; }
    close();
  }

  function init() {
    bar = document.querySelector(".sidebar");
    if (!bar) { return; }
    labelise();
    bar.addEventListener("mouseenter", enter);
    bar.addEventListener("mouseleave", leave);
    // mouseenter is not fired when the panel re-renders under a resting cursor: catch it on the first move too
    bar.addEventListener("mousemove", function () { if (!inside) { enter(); } });
    document.addEventListener("mouseleave", leave);
    window.addEventListener("blur", leave);
    document.addEventListener("mouseup", function () { if (!inside && !dragging()) { close(); } }, true);
  }

  if (document.readyState === "loading") { document.addEventListener("DOMContentLoaded", init); }
  else { init(); }
})();
