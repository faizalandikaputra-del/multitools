/**
 * tab-wheel.js - scroll the mouse wheel over the left tab bar to switch tabs.
 * Wheel down = next tab, wheel up = previous tab (follows the current, possibly re-ordered, tab order).
 * It simply clicks the neighbouring tab button, so the normal showTab() motion (panel fade, sliding
 * highlight, scroll-into-view) plays exactly like a real click - nothing is duplicated here.
 *
 * - Mouse wheel: one notch = one tab. Touchpad: small deltas are collected until ~55px = one tab.
 * - A short cooldown (just longer than the panel leave animation) keeps fast spinning smooth:
 *   the highlight glides across several tabs instead of skipping or stuttering.
 * - Stops at the first/last tab (no wrap-around). Ctrl+wheel is left alone.
 * - Registered on window in the capture phase so it runs before smooth-scroll.js / ScrollForward,
 *   which would otherwise scroll the tab list itself. ES5 on purpose (old CEF).
 */
(function () {
  "use strict";

  var STEP_PX = 55;        // touchpad: collected delta that equals one tab
  var COOLDOWN = 150;      // ms between tab switches (panel leave animation is 110ms)
  var RESET_AFTER = 260;   // ms without wheel events = start a fresh gesture

  var acc = 0, lastEvt = 0, lastStep = 0;

  function tabsIn(box) { return Array.prototype.slice.call(box.querySelectorAll(".tab")); }

  function onWheel(e) {
    var t = e.target;
    if (e.ctrlKey || !t || !t.closest) { return; }
    var sidebar = t.closest(".sidebar");
    if (!sidebar) { return; }

    // This handler runs first (window capture) and swallows the event below, so the other wheel listeners never see it.
    // Tell the activity trackers (Idle screen in main.js, js/mt-away.js) by hand: scrolling the tab bar is activity.
    try { window.dispatchEvent(new Event("mt-wheel-activity")); } catch (eAct) { }

    e.preventDefault();
    e.stopPropagation();
    if (e.stopImmediatePropagation) { e.stopImmediatePropagation(); }

    var dy = e.deltaY || e.deltaX || 0;
    if (e.deltaMode === 1) { dy *= 33; } else if (e.deltaMode === 2) { dy *= 300; }
    if (!dy) { return; }

    var now = Date.now();
    if (now - lastEvt > RESET_AFTER || (acc && (acc > 0) !== (dy > 0))) { acc = 0; }
    lastEvt = now;
    acc += dy;
    if (Math.abs(acc) < STEP_PX) { return; }
    if (now - lastStep < COOLDOWN) { acc = 0; return; }

    var box = sidebar.querySelector(".tabs");
    if (!box) { return; }
    var list = tabsIn(box), i, cur = -1;
    for (i = 0; i < list.length; i++) {
      if (list[i].classList.contains("is-active")) { cur = i; break; }
    }
    var next = list[cur + (acc > 0 ? 1 : -1)];
    acc = 0;
    if (!next) { return; }          // already at the first / last tab
    lastStep = now;
    next.click();
  }

  window.addEventListener("wheel", onWheel, { passive: false, capture: true });
})();
