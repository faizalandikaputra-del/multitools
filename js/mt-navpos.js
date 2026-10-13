/* Multi Tool - mt-navpos.js (companion of css/mt-navpos.css). Plain ES5 for old CEF (AE 2019/2021).
   Settings > Navigation position: where the tab navigation sits - left (default), right, top or bottom.
   - Saved in localStorage "mtx.navPos" ("left" | "right" | "top" | "bottom"; missing = left).
   - Sets <html data-nav-pos="..."> (css/mt-navpos.css does the layout) and aria-orientation on .tabs.
   - The cards [data-nav-pos-opt] live in #settings-modal (index.html) and are mirrored to the Settings window by
     js/mt-settings-remote.js like every other control (the key attribute is listed there and in mt-settings-window.js).
   - Other scripts ask MTNavPos.horizontal() (sidebar-expand.js, mt-smooth.js, mt-tooltip.js, main.js use the attribute directly).
   - The first paint is done by the inline script at the top of html/index.html, so there is no flash of the wrong layout.
   - fix26: in a top / bottom bar only WHOLE tabs are shown (fit()): the tab list gets the width of N tabs, scroll-snaps to a tab edge and
     has two small arrows when more tabs exist. Before, the list was cut through the middle of an icon at both ends.
   Off switch: remove this script + its stylesheet + the settings cards; the panel then always uses the left rail. */
(function () {
  "use strict";
  var KEY = "mtx.navPos", ATTR = "data-nav-pos", OPTS = { left: 1, right: 1, top: 1, bottom: 1 };
  var root = document.documentElement;

  function read() {
    var v = null;
    try { v = localStorage.getItem(KEY); } catch (e) { }
    return OPTS.hasOwnProperty(v) ? v : "left";
  }
  function write(v) {
    try { if (v === "left") { localStorage.removeItem(KEY); } else { localStorage.setItem(KEY, v); } } catch (e) { }
  }
  function current() {
    var v = root.getAttribute(ATTR);
    return OPTS.hasOwnProperty(v) ? v : "left";
  }
  function horizontal() { var v = current(); return v === "top" || v === "bottom"; }

  /* ---------- top / bottom bar: whole tabs only ---------- */
  var GAP = 8;                 // 4px margin each side of a tab (css/mt-navpos.css)
  var ARROW_W = 22;            // width of one arrow button
  var prevBtn = null, nextBtn = null, fitQueued = 0;

  function tabsBox() { return document.querySelector(".sidebar .tabs"); }
  function tabList() { var t = tabsBox(); return t ? t.querySelectorAll(".tab") : []; }

  var CHEV_L = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg>';
  var CHEV_R = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>';

  function makeArrow(dir) {
    var b = document.createElement("button");
    b.type = "button";
    b.className = "mt-nav-arrow mt-nav-arrow--" + dir;
    b.setAttribute("aria-label", dir === "prev" ? "Previous tabs" : "More tabs");
    b.setAttribute("tabindex", "-1");
    b.hidden = true;
    b.innerHTML = dir === "prev" ? CHEV_L : CHEV_R;
    b.addEventListener("click", function () { page(dir === "prev" ? -1 : 1); });
    return b;
  }
  function ensureArrows() {
    var tabs = tabsBox();
    if (!tabs || prevBtn) { return !!prevBtn; }
    prevBtn = makeArrow("prev");
    nextBtn = makeArrow("next");
    tabs.parentNode.insertBefore(prevBtn, tabs);
    tabs.parentNode.insertBefore(nextBtn, tabs.nextSibling);
    tabs.addEventListener("scroll", updateArrows);
    return true;
  }

  function slotW() { var l = tabList(); return l.length ? l[0].offsetWidth + GAP : 0; }
  function visibleCount() { var t = tabsBox(), s = slotW(); return (t && s) ? Math.max(1, Math.round((t.clientWidth + GAP) / s)) : 1; }
  function firstVisible() { var t = tabsBox(), s = slotW(); return (t && s) ? Math.round(t.scrollLeft / s) : 0; }

  function updateArrows() {
    var t = tabsBox();
    if (!t || !prevBtn) { return; }
    prevBtn.disabled = t.scrollLeft <= 2;
    nextBtn.disabled = t.scrollLeft >= t.scrollWidth - t.clientWidth - 6;
  }

  function scrollToIndex(i) {
    var t = tabsBox(), l = tabList(), n = visibleCount(), max = Math.max(0, l.length - n);
    if (!t || !l.length) { return; }
    i = Math.max(0, Math.min(max, i));
    t.scrollLeft = l[i].offsetLeft;
  }
  function page(dir) {
    var n = visibleCount();
    scrollToIndex(firstVisible() + dir * Math.max(1, n - 1));
  }

  // Scrolls the list just far enough that the given tab is fully visible (used by main.js when a tab is selected).
  function reveal(el) {
    var l = tabList(), i = -1, k, first, n;
    for (k = 0; k < l.length; k++) { if (l[k] === el) { i = k; break; } }
    if (i < 0 || !horizontal()) { return false; }
    first = firstVisible(); n = visibleCount();
    if (i < first) { scrollToIndex(i); }
    else if (i > first + n - 1) { scrollToIndex(i - n + 1); }
    return true;
  }

  function fit() {
    fitQueued = 0;
    var bar = document.querySelector(".sidebar"), tabs = tabsBox();
    if (!bar || !tabs) { return; }
    if (!horizontal()) {
      tabs.style.width = ""; tabs.style.flex = "";
      if (prevBtn) { prevBtn.hidden = true; nextBtn.hidden = true; }
      return;
    }
    var list = tabList(), count = list.length, tabW = count ? list[0].offsetWidth : 0;
    if (!count || !tabW) { return; }
    ensureArrows();
    var cs = window.getComputedStyle(bar), slot = tabW + GAP, fixed = 0, extra, i;
    extra = bar.querySelectorAll(".refresh-btn, .settings-btn");
    for (i = 0; i < extra.length; i++) { fixed += extra[i].offsetWidth + GAP; }
    var avail = bar.clientWidth - (parseFloat(cs.paddingLeft) || 0) - (parseFloat(cs.paddingRight) || 0) - fixed;
    var total = count * slot - GAP, n, more = total > avail;
    // when tabs overflow, both arrows are reserved first
    if (more) { n = Math.max(1, Math.floor((avail - 2 * ARROW_W + GAP) / slot)); }
    else { n = count; }
    tabs.style.flex = "0 0 auto";
    tabs.style.width = (n * slot - GAP) + "px";
    prevBtn.hidden = !more; nextBtn.hidden = !more;
    if (!more) { tabs.scrollLeft = 0; }
    else {
      // snap back onto a tab edge and keep the active tab in view after a resize
      var act = bar.querySelector(".tabs .tab.is-active");
      scrollToIndex(firstVisible());
      if (act) { reveal(act); }
    }
    updateArrows();
  }
  function queueFit() { if (!fitQueued) { fitQueued = setTimeout(fit, 30); } }

  function paint(pos) {
    var list = document.querySelectorAll("[data-nav-pos-opt]"), i, on;
    for (i = 0; i < list.length; i++) {
      on = list[i].getAttribute("data-nav-pos-opt") === pos;
      list[i].setAttribute("aria-checked", on ? "true" : "false");
      list[i].tabIndex = on ? 0 : -1;
    }
  }

  // Re-measure everything that depends on the nav geometry once the new layout has been laid out.
  function relayout() {
    var tabs = document.querySelector(".tabs"), bar = document.querySelector(".sidebar"), act, tmp;
    if (tabs) { tabs.setAttribute("aria-orientation", horizontal() ? "horizontal" : "vertical"); }
    if (bar && horizontal()) { bar.classList.remove("is-expanded"); }          // names never expand in a bar
    // ae2021-compat.js (Chromium 74) re-runs its flex-gap fallback on a DOM change: tell it the list changed direction.
    if (tabs) { try { tmp = document.createComment(""); tabs.appendChild(tmp); tabs.removeChild(tmp); } catch (e) { } }
    fit();
    // main.js listens to "resize": it forgets the old highlight slot and measures the active tab again (offsetTop or offsetLeft).
    try { window.dispatchEvent(new Event("resize")); } catch (e2) { }
    act = document.querySelector(".tabs .tab.is-active");
    if (act && act.scrollIntoView) { try { act.scrollIntoView({ block: "nearest", inline: "nearest" }); } catch (e3) { } }
  }

  function apply(pos, save) {
    if (!OPTS.hasOwnProperty(pos)) { pos = "left"; }
    var changed = current() !== pos || !root.hasAttribute(ATTR);
    root.setAttribute(ATTR, pos);
    if (save) { write(pos); }
    paint(pos);
    var tl = document.querySelector(".tabs");
    if (tl) { tl.setAttribute("aria-orientation", horizontal() ? "horizontal" : "vertical"); }
    if (changed) { relayout(); }
  }

  function arrowNav(e) {
    var k = e.keyCode;
    if (k !== 37 && k !== 38 && k !== 39 && k !== 40) { return; }
    var cards = Array.prototype.slice.call(document.querySelectorAll("[data-nav-pos-opt]"));
    var i = cards.indexOf(e.currentTarget);
    if (i < 0) { return; }
    var next = (k === 37 || k === 38) ? (i + cards.length - 1) % cards.length : (i + 1) % cards.length;
    e.preventDefault();
    cards[next].focus();
    cards[next].click();
  }

  function bind() {
    var cards = document.querySelectorAll("[data-nav-pos-opt]"), i;
    for (i = 0; i < cards.length; i++) {
      (function (card) {
        card.addEventListener("click", function () { apply(card.getAttribute("data-nav-pos-opt"), true); });
        card.addEventListener("keydown", arrowNav);
      })(cards[i]);
    }
    apply(read(), false);
    queueFit();
    // UI scale (Settings > Display) or a font load changes the bar width without a window resize: watch the bar itself too.
    try { if (window.ResizeObserver && document.querySelector(".sidebar")) { new ResizeObserver(queueFit).observe(document.querySelector(".sidebar")); } } catch (eRo) { }
    // The Settings window shares localStorage: a change made there (or in another panel instance) is picked up here too.
    window.addEventListener("storage", function (e) { if (e && e.key === KEY) { apply(read(), false); } });
  }

  function reset() { write("left"); apply("left", false); }

  window.MTNavPos = { get: current, set: function (p) { apply(p, true); }, reset: reset, horizontal: horizontal, reveal: reveal, fit: fit };
  window.addEventListener("resize", queueFit);
  window.addEventListener("load", queueFit);

  // Attribute first (before main.js builds the tabs), cards and relayout once the DOM is complete.
  root.setAttribute(ATTR, read());
  if (document.readyState === "loading") { document.addEventListener("DOMContentLoaded", bind); } else { bind(); }
})();
