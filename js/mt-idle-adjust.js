/* Multi Tool - mt-idle-adjust.js
   Idle screen: resize every widget, show / hide each one without opening Settings, all from the "Adjust widgets"
   button at the bottom right of the idle screen (#ia-btn).

   Widgets: Time in After Effects, Timer, Stopwatch, Alarms, Notes and to-do.
   - Resize: drag the grip on the bottom right of a widget (arrow keys also work: left / right = one column, up / down =
     height, Shift = bigger steps; double-click the grip = back to the default size). The width snaps to whole columns of a
     12-column grid (span 4 - 12), so the gaps between boxes stay equal; the height is a minimum in px. The text follows
     the width: --wa-s = span / default span (0.68 - 1.3), see css/mt-idle-adjust.css "text follows the box".
   - Show / hide: the eye button. Four widgets use the SAME switches as Settings > Idle screen > Idle screen cards
     (#idle-show-elapsed / -sw / -al / -tabs), so both places always agree. The Timer chip has no Settings switch:
     key mtx.showTimer. A hidden widget stays on screen as a dimmed ghost while adjusting, so it can be switched back on.
   - Done: the button again, or Esc (Esc leaves adjust mode first, a second Esc leaves the idle screen).
   Keys: mtx.wLayout = {"sw":{"span":8,"h":180}, ...}, mtx.showTimer.
   Load AFTER js/mt-idle-focus.js. ES5, Chromium-74 safe. */
(function () {
  "use strict";
  var P = "mtx.", LAYOUT_KEY = P + "wLayout", TIMER_KEY = P + "showTimer";
  var COLS = 12, MIN_SPAN = 4, MAX_H = 1200, S_MIN = 0.68, S_MAX = 1.3;
  var WIDGETS = [
    { id: "elapsed", el: "idle-elapsed", span: 6, name: "Time in After Effects", noun: "time in After Effects", box: "idle-show-elapsed" },
    { id: "timer", el: "idle-timer", span: 6, name: "Timer", noun: "timer", own: true },
    { id: "sw", el: "idle-sw", span: 6, name: "Stopwatch", noun: "stopwatch", box: "idle-show-sw" },
    { id: "al", el: "idle-alarms", span: 6, name: "Alarms", noun: "alarms", box: "idle-show-al" },
    { id: "tabs", el: "idle-tabs", span: 12, name: "Notes and to-do", noun: "notes and to-do", box: "idle-show-tabs" }
  ];
  var ICON_EYE = '<svg class="wa-ico-on" viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>' +
    '<svg class="wa-ico-off" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 3l18 18"/><path d="M10.6 5.1A10.6 10.6 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.2 4"/><path d="M6.5 6.6C3.7 8.4 2 12 2 12s3.6 7 10 7c1.7 0 3.2-.4 4.5-1"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>';
  var ICON_GRIP = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 10 10 20"/><path d="M20 16l-4 4"/></svg>';

  function $(id) { return document.getElementById(id); }
  function isIdle() { return document.body.classList.contains("is-idle"); }
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { } }
  function lsDel(k) { try { localStorage.removeItem(k); } catch (e) { } }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  var layout = {}, adjusting = false, drag = null, ui = {};

  // ---------- storage ----------
  function loadLayout() {
    var o = null;
    try { o = JSON.parse(lsGet(LAYOUT_KEY) || "null"); } catch (e) { o = null; }
    layout = {};
    if (!o || typeof o !== "object") { return; }
    WIDGETS.forEach(function (w) {
      var s = o[w.id]; if (!s || typeof s !== "object") { return; }
      var sp = parseInt(s.span, 10), hh = parseFloat(s.h), out = {};      // (an older px "w" is ignored on purpose)
      if (isFinite(sp) && sp >= MIN_SPAN && sp <= COLS && sp !== w.span) { out.span = sp; }
      if (isFinite(hh) && hh > 0) { out.h = Math.min(MAX_H, Math.round(hh)); }
      if (out.span || out.h) { layout[w.id] = out; }
    });
  }
  function saveLayout() {
    var any = false, k; for (k in layout) { if (layout.hasOwnProperty(k)) { any = true; } }
    if (any) { lsSet(LAYOUT_KEY, JSON.stringify(layout)); } else { lsDel(LAYOUT_KEY); }
  }

  // ---------- size ----------
  function spanOf(w) { var s = layout[w.id]; return s && s.span ? s.span : w.span; }
  function applySize(w) {
    var el = $(w.el), s = layout[w.id]; if (!el) { return; }
    if (s && s.span) {
      el.style.gridColumn = "span " + s.span;
      el.style.setProperty("--wa-s", String(Math.round(clamp(s.span / w.span, S_MIN, S_MAX) * 100) / 100));
      el.classList.add("wa-scaled");
    } else {
      el.style.gridColumn = ""; el.style.removeProperty("--wa-s"); el.classList.remove("wa-scaled");
    }
    el.style.width = ""; el.classList.remove("wa-sized");                 // (clean up inline widths of older versions)
    el.style.minHeight = s && s.h ? s.h + "px" : "";
  }
  function applyAll() { WIDGETS.forEach(applySize); }
  function cardScale() {
    var box = $("idle-clock"), v = 1;
    try { v = parseFloat(box.style.getPropertyValue("--idle-card-scale")) || 1; } catch (e) { v = 1; }
    return v;
  }
  // screen px per layout px (the cards are zoomed by Settings > Card scale): measured, with the scale as fallback
  function pxRatio(el) {
    var r = el.getBoundingClientRect(), ow = el.offsetWidth, k = ow ? r.width / ow : 1;
    return (isFinite(k) && k > 0.3 && k < 3) ? k : cardScale();
  }
  // nat = the natural height of the widget at its new width; a taller box is stored, a shorter one is simply "natural"
  function setSize(w, span, nh, nat) {
    var s = layout[w.id] || (layout[w.id] = {});
    span = clamp(span, MIN_SPAN, COLS);
    if (span !== w.span) { s.span = span; } else { delete s.span; }
    if (nh > (nat || 0) + 4) { s.h = Math.round(clamp(nh, 0, MAX_H)); } else { delete s.h; }
    if (!s.span && !s.h) { delete layout[w.id]; }
    applySize(w);
  }
  function naturalHeight(el) {
    var keep = el.style.minHeight, n; el.style.minHeight = ""; n = el.offsetHeight; el.style.minHeight = keep; return n;
  }
  function readout(w) {
    var el = $(w.el), name = el && el.querySelector(".wa-name"); if (!el || !name) { return; }
    name.textContent = drag && drag.w === w ? spanOf(w) + "/" + COLS + " \u00d7 " + Math.round(el.offsetHeight) : w.name;
  }

  function onDown(w, e) {
    if (e.button !== undefined && e.button !== 0) { return; }
    var el = $(w.el), grid = el && el.parentNode; if (!el || !grid) { return; }
    e.preventDefault(); e.stopPropagation();
    var k = pxRatio(grid), cs = null, gap = 0;
    try { cs = window.getComputedStyle(grid); gap = (parseFloat(cs.columnGap) || parseFloat(cs.gridColumnGap) || 0) * k; } catch (e0) { gap = 0; }
    drag = {
      w: w, id: e.pointerId, x: e.clientX, y: e.clientY, span: spanOf(w), oh: el.offsetHeight, nat: naturalHeight(el), h0: layout[w.id] && layout[w.id].h ? layout[w.id].h : 0,
      pitch: Math.max(10, (grid.getBoundingClientRect().width + gap) / COLS),     // screen px of one column + one gap
      k: pxRatio(el), grip: e.currentTarget
    };
    el.classList.add("wa-drag");
    try { drag.grip.setPointerCapture(e.pointerId); } catch (e1) { }
    readout(w);
  }
  function onMove(e) {
    if (!drag || (drag.id !== undefined && e.pointerId !== drag.id)) { return; }
    var cols = Math.round((e.clientX - drag.x) / drag.pitch), dy = (e.clientY - drag.y) / drag.k;
    var el = $(drag.w.el);
    // the height is only touched when the pointer really moved up / down; a width-only drag keeps the stored height (or "natural")
    setSize(drag.w, drag.span + cols, Math.abs(dy) > 4 ? drag.oh + dy : drag.h0, el ? naturalHeight(el) : drag.nat);
    readout(drag.w);
  }
  function onUp(e) {
    if (!drag || (drag.id !== undefined && e.pointerId !== drag.id)) { return; }
    var w = drag.w, el = $(w.el);
    try { drag.grip.releasePointerCapture(drag.id); } catch (e2) { }
    if (el) { el.classList.remove("wa-drag"); }
    drag = null; saveLayout(); readout(w);
  }
  function onKey(w, e) {
    var key = e.key, step = e.shiftKey ? 40 : 10, dc = 0, dy = 0;
    if (key === "ArrowLeft") { dc = -1; } else if (key === "ArrowRight") { dc = 1; }
    else if (key === "ArrowUp") { dy = -step; } else if (key === "ArrowDown") { dy = step; } else { return; }
    var el = $(w.el); if (!el) { return; }
    e.preventDefault(); e.stopPropagation();
    var h0 = layout[w.id] && layout[w.id].h ? layout[w.id].h : 0;
    setSize(w, spanOf(w) + dc, dy ? el.offsetHeight + dy : h0, naturalHeight(el));
    saveLayout();
  }
  function resetOne(w) { delete layout[w.id]; applySize(w); saveLayout(); readout(w); }
  function resetAll() { layout = {}; applyAll(); saveLayout(); }

  // ---------- show / hide ----------
  function isOn(w) {
    if (w.own) { return lsGet(TIMER_KEY) !== "0"; }
    var c = $(w.box);
    if (c) { return !!c.checked; }
    return true;
  }
  function setOn(w, on) {
    if (w.own) { lsSet(TIMER_KEY, on ? "1" : "0"); refresh(); return; }
    var c = $(w.box);
    if (!c) { return; }
    c.checked = !!on;
    try { c.dispatchEvent(new Event("change", { bubbles: true })); } catch (e) { var ev = document.createEvent("Event"); ev.initEvent("change", true, false); c.dispatchEvent(ev); }
    refresh();
  }
  function refresh() {
    WIDGETS.forEach(function (w) {
      var el = $(w.el); if (!el) { return; }
      var on = isOn(w), eye = el.querySelector(".wa-eye");
      el.classList.toggle("wa-ghost", !on);
      if (w.own) { el.classList.toggle("wa-off", !on); }
      if (eye) {
        eye.setAttribute("aria-pressed", on ? "true" : "false");
        eye.setAttribute("aria-label", (on ? "Hide " : "Show ") + w.noun);
        eye.setAttribute("title", (on ? "Hide " : "Show ") + w.noun);
      }
    });
  }

  // ---------- chrome on each widget ----------
  function build(w) {
    var el = $(w.el); if (!el || el.querySelector(".wa-bar")) { return; }
    var bar = document.createElement("div"); bar.className = "wa-bar";
    var lbl = document.createElement("div"); lbl.className = "wa-lbl";
    var eye = document.createElement("button"); eye.type = "button"; eye.className = "wa-eye"; eye.innerHTML = ICON_EYE;
    var name = document.createElement("span"); name.className = "wa-name"; name.textContent = w.name;
    var grip = document.createElement("button"); grip.type = "button"; grip.className = "wa-grip"; grip.innerHTML = ICON_GRIP;
    grip.setAttribute("aria-label", "Resize " + w.noun + ". Arrow keys change the size.");
    grip.setAttribute("title", "Drag to resize. Double-click for the default size.");
    lbl.appendChild(eye); lbl.appendChild(name); bar.appendChild(lbl); bar.appendChild(grip);
    el.appendChild(bar);
    eye.addEventListener("click", function (e) { e.stopPropagation(); setOn(w, !isOn(w)); });
    grip.addEventListener("pointerdown", function (e) { onDown(w, e); });
    grip.addEventListener("pointermove", onMove);
    grip.addEventListener("pointerup", onUp);
    grip.addEventListener("pointercancel", onUp);
    grip.addEventListener("keydown", function (e) { onKey(w, e); });
    grip.addEventListener("dblclick", function (e) { e.stopPropagation(); resetOne(w); });
    if (w.box && $(w.box)) { $(w.box).addEventListener("change", refresh); }   // Settings window flips the same switch
  }

  // ---------- adjust mode ----------
  function setAdjust(on) {
    on = !!on && isIdle();
    if (on === adjusting) { return; }
    adjusting = on;
    document.body.classList.toggle("is-adjusting", on);
    if (ui.btn) {
      ui.btn.setAttribute("aria-pressed", on ? "true" : "false");
      ui.btn.setAttribute("aria-label", on ? "Done adjusting" : "Adjust widgets");
      ui.btn.setAttribute("title", on ? "Done" : "Adjust widgets");
    }
    if (ui.reset) { ui.reset.tabIndex = on ? 0 : -1; }
    if (on) {
      var box = $("idle-clock"), fold = $("idle-fold-btn");
      if (box && fold && box.classList.contains("is-folded")) { fold.click(); }   // the widgets sit behind "Show panels"
      refresh();
    } else if (drag) {
      var el = $(drag.w.el); if (el) { el.classList.remove("wa-drag"); }
      drag = null; saveLayout();
      WIDGETS.forEach(readout);
    }
  }

  function init() {
    ui.btn = $("ia-btn"); ui.reset = $("ia-reset");
    loadLayout();
    WIDGETS.forEach(build);
    applyAll(); refresh();
    if (ui.btn) { ui.btn.addEventListener("click", function () { setAdjust(!adjusting); }); }
    if (ui.reset) { ui.reset.addEventListener("click", resetAll); }

    // Esc leaves adjust mode first. On window (capture) so it runs before the idle screen's own Esc handler.
    window.addEventListener("keydown", function (e) {
      if ((e.key === "Escape" || e.keyCode === 27) && adjusting) { e.stopImmediatePropagation(); e.preventDefault(); setAdjust(false); }
    }, true);
    // A click on an empty spot normally leaves the idle screen; not while adjusting.
    var clock = $("idle-clock");
    if (clock) {
      clock.addEventListener("click", function (e) {
        if (!adjusting) { return; }
        var t = e.target, sel = ".idle-card, .idle-timer, .idle-elapsed, .idle-message, button, input, textarea, select, a", path = e.composedPath ? e.composedPath() : [], i;
        if (t && t.closest && t.closest(sel)) { return; }
        for (i = 0; i < path.length; i++) { if (path[i] && path[i].matches && path[i].matches(sel)) { return; } }
        e.stopPropagation();
      }, true);
    }
    // leaving the idle screen ends adjust mode
    try {
      new MutationObserver(function () { if (adjusting && !isIdle()) { setAdjust(false); } })
        .observe(document.body, { attributes: true, attributeFilter: ["class"] });
    } catch (e2) { }
    // "Reset everything" in Settings
    var rs = $("settings-reset");
    if (rs) { rs.addEventListener("click", function () { lsDel(LAYOUT_KEY); lsDel(TIMER_KEY); layout = {}; applyAll(); refresh(); }); }
  }
  if (document.readyState === "loading") { document.addEventListener("DOMContentLoaded", init); } else { init(); }
})();
