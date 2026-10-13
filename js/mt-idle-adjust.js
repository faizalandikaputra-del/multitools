/* Multi Tool - mt-idle-adjust.js  (v19: FREE CANVAS + zoom on resize)
   Idle screen: move, resize and show / hide every widget without opening Settings, all from the "Adjust widgets" button
   (#ia-btn, bottom right of the idle screen).

   Widgets: Clock (date, time, session, message), Time in After Effects, Timer, Stopwatch, Alarms, Notes and to-do.

   HOW THE LAYOUT WORKS (rewritten in v15, replaces the grid + offset system of fix33 - fix38)
   - Normal state (never adjusted): the widgets sit in their normal grid / flow, exactly as before.
   - First time Adjust opens: every visible widget is "frozen" where it stands (position: absolute inside #idle-clock, class
     .wa-canvas). From then on each widget is placed by its OWN left / top / width / height and depends on no other widget:
     moving, resizing, hiding or showing one widget can never push, stretch or shift another one.
     Hidden widgets have NO box while adjusting (v19): their icons wait in the shelf at the bottom left (#ia-shelf); a click shows the widget in the nearest free spot.
   - Move: drag a widget anywhere inside the panel (soft snap to the panel edges and to the other widgets, guide lines).
     Arrow keys nudge the focused widget (Shift = bigger).
   - Resize: drag the grip (bottom right). Width and height are free; the text follows the width (--wa-s = width / start width,
     0.68 - 1.3, see css "text follows the box"). Arrow keys resize, double-click the grip = default size.
     The clock has no box: its grip changes the TEXT SCALE (50 - 220 %).
   - Free placement: widgets may overlap and sit anywhere, down to the panel bottom; the one touched last is on top. A widget never
     ends up outside the panel (also after the panel is resized).
   - Reset layout: back to the original flow layout. If nothing was changed when Done is pressed, the flow layout stays
     (nothing is saved).
   - Show / hide: the eye. Four widgets use the SAME switches as Settings > Idle screen > Idle screen cards
     (#idle-show-elapsed / -sw / -al / -tabs); the Timer has key mtx.showTimer; the clock mtx.showClock.
   - Done: the button again, or Esc (Esc leaves adjust mode first, a second Esc leaves the idle screen).
   - Adjust button hides itself after ~2.5 s without movement; auto-hide of all widgets after a few seconds (pill cycles
     off / 3 / 6 / 10 s), not while adjusting / hovering a widget / typing.
   Keys: mtx.autoHide, mtx.wLayout = {"v":2,"items":{"sw":{"x":0.05,"y":0.4,"w":0.45,"w0":0.45,"h":0.2}, "clock":{"x":..,"y":..,"s":1.3}}}
   (x, w = fraction of the panel width; y, h = fraction of the panel height, so a layout survives a resized panel), mtx.showTimer.
   Old v1 layouts (grid span + offsets) are ignored on purpose. Load AFTER js/mt-idle-focus.js. ES5, Chromium-74 safe. */
(function () {
  "use strict";
  /* v19 (fix53): PANEL RESIZE. The whole canvas now scales like one picture. The layout stores the panel width it was made at (ref); the cards are zoomed by
     panel width / ref (CSS var --wa-zoom, same zoom property as Card scale) and the clock text scale is multiplied by the same factor. Positions, widths and heights are
     fractions of the panel width, so every box AND its text shrink / grow together: wrapping, heights and gaps stay the same, nothing overlaps and nothing is
     re-sorted (v18 only moved the boxes: text kept its size, wrapped more, grew taller, then the overlap check threw widgets around). */
  var P = "mtx.", LAYOUT_KEY = P + "wLayout", TIMER_KEY = P + "showTimer", CLOCK_KEY = P + "showClock";
  var SC_MIN = 0.5, SC_MAX = 2.2, S_MIN = 0.68, S_MAX = 1.3, MIN_W = 110, MIN_H = 56, GAP = 8, EDGE = 4, EDGE_B = 12, GAP2 = 6, SNAP = 10, GRID_Y = 8, GRID_M = 16, STEP = 10, STEP_BIG = 40;
  var WIDGETS = [
    { id: "clock", el: "idle-hero", clock: true, key: CLOCK_KEY, name: "Clock", noun: "clock" },
    { id: "elapsed", el: "idle-elapsed", name: "Time in After Effects", noun: "time in After Effects", box: "idle-show-elapsed" },
    { id: "timer", el: "idle-timer", name: "Timer", noun: "timer", own: true, key: TIMER_KEY },
    { id: "sw", el: "idle-sw", name: "Stopwatch", noun: "stopwatch", box: "idle-show-sw" },
    { id: "al", el: "idle-alarms", name: "Alarms", noun: "alarms", box: "idle-show-al" },
    { id: "tabs", el: "idle-tabs", name: "Notes and to-do", noun: "notes and to-do", box: "idle-show-tabs", full: true }
  ];
  var ICON_EYE = '<svg class="wa-ico-on" viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>' +
    '<svg class="wa-ico-off" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 3l18 18"/><path d="M10.6 5.1A10.6 10.6 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.2 4"/><path d="M6.5 6.6C3.7 8.4 2 12 2 12s3.6 7 10 7c1.7 0 3.2-.4 4.5-1"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>';
  // one glyph per widget for the hidden-widget shelf (24 px grid, stroke only)
  var SHELF_ICON = {
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.2 2"/>',
    elapsed: '<path d="M6 3h12M6 21h12"/><path d="M7 3c0 5 5 6 5 9s-5 4-5 9M17 3c0 5-5 6-5 9s5 4 5 9"/>',
    timer: '<path d="M9.5 2.5h5"/><circle cx="12" cy="13.5" r="8"/><path d="M12 13.5V9.5"/>',
    sw: '<path d="M9.5 2.5h5M12 2.5v3"/><circle cx="12" cy="13.5" r="8"/><path d="M12 13.5l3-3"/><path d="M19 6l1.4-1.4"/>',
    al: '<path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2h-15z"/><path d="M10 21a2 2 0 0 0 4 0"/>',
    tabs: '<rect x="5" y="3" width="14" height="18" rx="2.5"/><path d="M9 8.5h6M9 12.5h6M9 16.5h3.5"/>'
  };
  var shelf = null, shelfBtns = {};
  var ICON_GRIP = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 10 10 20"/><path d="M20 16l-4 4"/></svg>';

  function $(id) { return document.getElementById(id); }
  function isIdle() { return document.body.classList.contains("is-idle"); }
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { } }
  function lsDel(k) { try { localStorage.removeItem(k); } catch (e) { } }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function r1(v) { return Math.round(v * 10) / 10; }

  var AH_KEY = P + "autoHide", AH_OPTS = [0, 3, 6, 10];
  var refW = null, Z = 1, zClamped = false;
  var items = {}, dirty = false, adjusting = false, drag = null, mv = null, guides = null, ui = {};
  var ahSec = 6, ahTimer = 0, quiet = false, swallowClick = false, lastMove = 0, iaTimer = 0, IA_MS = 2500, switching = false;

  // ---------- storage ----------
  function hasItems() { var k; for (k in items) { if (items.hasOwnProperty(k)) { return true; } } return false; }
  function num(v, lo, hi) { v = parseFloat(v); return isFinite(v) && v >= lo && v <= hi ? v : null; }
  function loadLayout() {
    var o = null, it;
    items = {}; dirty = false; refW = null;
    try { o = JSON.parse(lsGet(LAYOUT_KEY) || "null"); } catch (e) { o = null; }
    if (!o || o.v !== 3 || !o.items || typeof o.items !== "object") { return; }
    WIDGETS.forEach(function (w) {
      var s = o.items[w.id], x, y, ww, w0, h, sc; if (!s || typeof s !== "object") { return; }
      x = num(s.x, -0.5, 1.5); y = num(s.y, -0.5, 8); if (x === null || y === null) { return; }
      it = { x: x, y: y };
      if (w.clock) { sc = num(s.s, SC_MIN, SC_MAX); if (sc !== null) { it.s = sc; } }
      else {
        ww = num(s.w, 0.05, 2); if (ww === null) { return; }
        w0 = num(s.w0, 0.05, 2); h = num(s.h, 0.01, 8);
        it.w = ww; it.w0 = w0 === null ? ww : w0; if (h !== null) { it.h = h; }
      }
      items[w.id] = it;
    });
    refW = num(o.ref, 120, 6000);
    dirty = hasItems();
  }
  function saveLayout() {
    var out = { v: 3, items: {} }, any = false;
    WIDGETS.forEach(function (w) {
      var it = items[w.id], c;
      if (!it) { return; }
      c = { x: Math.round(it.x * 10000) / 10000, y: Math.round(it.y * 10000) / 10000 }; any = true;
      if (w.clock) { if (it.s) { c.s = Math.round(it.s * 100) / 100; } }
      else { c.w = Math.round(it.w * 10000) / 10000; c.w0 = Math.round(it.w0 * 10000) / 10000; if (it.h) { c.h = Math.round(it.h * 10000) / 10000; } }
      out.items[w.id] = c;
    });
    if (refW) { out.ref = Math.round(refW); }
    if (any && dirty) { lsSet(LAYOUT_KEY, JSON.stringify(out)); } else { lsDel(LAYOUT_KEY); }
  }

  // ---------- geometry (all numbers are screen px, relative to the inside of the panel #idle-clock) ----------
  function reduceMotion() {            // the app's own Animations switch only (not the OS setting: the owner keeps Windows animation effects off and wants the motion)
    return document.documentElement.getAttribute("data-reduce-motion") === "true";
  }
  function panel() { return $("idle-clock"); }
  function origin() {
    var p = panel(), r = p.getBoundingClientRect();
    return { l: r.left + p.clientLeft, t: r.top + p.clientTop - p.scrollTop, W: p.clientWidth, H: p.clientHeight };   // t: top of the scrollable CONTENT
  }
  function cardScale() {
    var box = panel(), v = 1;
    try { v = parseFloat(box.style.getPropertyValue("--idle-card-scale")) || 1; } catch (e) { v = 1; }
    return v;
  }
  // the gap two boxes must keep shrinks with the canvas (a layout scaled to 50 % has 4 px gaps, which are not an overlap)
  function g2() { return GAP2 * Math.min(1, Z); }
  // Z = panel width / the width the layout was made at. Written as --wa-zoom (cards: zoom) and used for the clock text scale. Returns true when the
  // panel went beyond the 0.4 - 2.4 range (then ref follows, the layout is re-checked once).
  var Z_MIN = 0.4, Z_MAX = 2.4;
  function syncZoom() {
    var p = panel(), o, z = 1, base, c = false;
    if (!p) { return false; }
    if (hasItems()) {
      o = origin();
      if (o.W < 60) { return false; }                                // panel hidden / collapsed: keep the last zoom
      if (!refW) { refW = o.W; }
      z = o.W / refW;
      if (z < Z_MIN || z > Z_MAX) { z = clamp(z, Z_MIN, Z_MAX); refW = o.W / z; c = true; }
    }
    Z = z; zClamped = c;
    if (hasItems()) { base = cardScale(); p.style.setProperty("--wa-zoom", String(Math.round(base * Z * 1000) / 1000)); }
    else { p.style.removeProperty("--wa-zoom"); }
    return c;
  }
  // screen px per layout px (the cards are zoomed by Settings > Card scale): measured, with the scale as fallback
  function pxRatio(el) {
    var r = el.getBoundingClientRect(), ow = el.offsetWidth, k = ow ? r.width / ow : 1;
    return (isFinite(k) && k > 0.2 && k < 4) ? k : cardScale() * Z;
  }
  function visible(w) { var el = $(w.el); return !!(el && el.offsetParent !== null); }
  // Where a widget IS. A widget that has its own place is read from the stored item (left / top / width) + its height, never from the
  // screen rect: a glide (transition) in progress would report a half-way spot and push the other widgets for nothing.
  function rectOf(w, o) {
    var el = $(w.el), it = items[w.id], k, r;
    if (it && hasItems()) {
      k = pxRatio(el.parentNode) || 1;
      return { l: it.x * o.W, t: it.y * o.W, w: w.clock ? el.offsetWidth * k : it.w * o.W, h: el.offsetHeight * k };
    }
    r = el.getBoundingClientRect();
    return { l: r.left - o.l, t: r.top - o.t, w: r.width, h: r.height };
  }
  // lowest y a widget may reach: far below the view (the idle screen scrolls down, so widgets can live below the fold)
  function bottomLimit(o) { return Math.max(o.H * 4, 2400); }
  function otherRects(w, o) {
    var out = [];
    WIDGETS.forEach(function (x) { if (x !== w && visible(x)) { out.push(rectOf(x, o)); } });
    return out;
  }
  // true if box a touches (or comes closer than g px to) any box of the list
  function hit(a, list, g) {
    var i, b; g = g || 0;
    for (i = 0; i < list.length; i++) {
      b = list[i];
      if (a.l < b.l + b.w + g - 1 && a.l + a.w > b.l - g + 1 && a.t < b.t + b.h + g - 1 && a.t + a.h > b.t - g + 1) { return true; }
    }
    return false;
  }
  // keep the whole box inside the panel (a box bigger than the panel is only pinned to the top-left)
  function fit(r, o) {
    var B = bottomLimit(o) - EDGE_B;
    return {
      l: r.w <= o.W - 2 * EDGE ? clamp(r.l, EDGE, o.W - r.w - EDGE) : EDGE,
      t: r.h <= B - EDGE ? clamp(r.t, EDGE, B - r.h) : EDGE,
      w: r.w, h: r.h
    };
  }
  // nearest spot (to r) where the box touches no other box
  function findSpot(r, others, o) {
    var xs = [r.l], ys = [r.t], i, a, b, c, best = null, d, f, t, o2;
    for (i = 0; i < others.length; i++) {
      o2 = others[i];
      xs.push(o2.l - r.w - GAP, o2.l + o2.w + GAP, o2.l); ys.push(o2.t - r.h - GAP, o2.t + o2.h + GAP, o2.t);
    }
    xs.push(EDGE); ys.push(EDGE);
    for (a = 0; a < xs.length; a++) {
      for (b = 0; b < ys.length; b++) {
        c = { l: xs[a], t: ys[b], w: r.w, h: r.h }; f = fit(c, o);
        if (Math.abs(f.l - c.l) > 0.5 || Math.abs(f.t - c.t) > 0.5) { continue; }                 // that candidate is outside the panel
        if (hit(f, others)) { continue; }
        d = Math.abs(f.l - r.l) + Math.abs(f.t - r.t);
        if (!best || d < best.d) { best = { d: d, l: f.l, t: f.t }; }
      }
    }
    if (best) { return { l: best.l, t: best.t, w: r.w, h: r.h }; }
    t = r.t; for (i = 0; i < others.length; i++) { t = Math.max(t, others[i].t + others[i].h + GAP); }       // crowded: under everything, still inside
    return fit({ l: r.l, t: t, w: r.w, h: r.h }, o);
  }

  // ---------- applying a stored item to its element ----------
  function clearInline(el) {
    el.style.zIndex = ""; el.style.left = ""; el.style.top = ""; el.style.width = ""; el.style.minHeight = "";
    el.style.removeProperty("--wa-s"); el.classList.remove("wa-scaled");
  }
  function scaleFor(w, it) {
    if (w.clock) { return it.s || 1; }
    return it.w0 ? clamp(it.w / it.w0, S_MIN, S_MAX) : 1;
  }
  var applying = false;
  function apply(w) {
    var el = $(w.el), it = items[w.id], o, k, s;
    if (!el) { return; }
    if (!it) { clearInline(el); return; }
    o = origin(); k = pxRatio(el.parentNode) || 1;
    el.style.left = r1(it.x * o.W / k) + "px"; el.style.top = r1(it.y * o.W / k) + "px";
    s = scaleFor(w, it); if (w.clock) { s *= Z; }                  // the clock has no zoomed wrapper: its text scale carries the panel zoom
    if (Math.abs(s - 1) > 0.02) { el.style.setProperty("--wa-s", String(Math.round(s * 100) / 100)); el.classList.add("wa-scaled"); }
    else { el.style.removeProperty("--wa-s"); el.classList.remove("wa-scaled"); }
    if (!w.clock) {
      el.style.width = r1(it.w * o.W / k) + "px";
      el.style.minHeight = it.h ? r1(it.h * o.W / k) + "px" : "";
    }
    if (!applying) { syncEnd(); }
  }
  // The panel scrolls (overflow-y). While Adjust is open a 1 px marker 160 px under the lowest widget gives the scroll room, so a widget can be dragged below the fold; outside Adjust it sits 12 px under it (no scrolling when everything fits).
  function syncEnd() {
    var p = panel(), m = $("idle-canvas-end"), o, bottom = 0, k;
    if (!p) { return; }
    if (!hasItems()) { if (m && m.parentNode) { m.parentNode.removeChild(m); } return; }
    o = origin();
    WIDGETS.forEach(function (w) { var it = items[w.id], el = $(w.el); if (it && el && visible(w)) { k = pxRatio(el.parentNode) || 1; bottom = Math.max(bottom, it.y * o.W + el.offsetHeight * k); } });
    if (!m) { m = document.createElement("div"); m.id = "idle-canvas-end"; m.setAttribute("aria-hidden", "true"); }
    if (m.parentNode !== p) { p.appendChild(m); }
    m.style.top = Math.round(bottom + (adjusting ? 160 : 12)) + "px";     // scroll room only while Adjust is open; otherwise the panel scrolls only when a widget really sticks out
  }
  function applyAll() {
    var p = panel(); if (!p) { return; }
    p.classList.toggle("wa-canvas", hasItems());
    syncZoom();
    applying = true; WIDGETS.forEach(apply); applying = false; syncEnd();
    syncEnd();
  }
  function naturalHeight(w) {                      // screen px
    var el = $(w.el), keep = el.style.minHeight, k = pxRatio(el.parentNode) || 1, n;
    el.style.minHeight = ""; n = el.offsetHeight * k; el.style.minHeight = keep; return n;
  }
  // MOTION (Premium archetype, same curves as css/mt-idle-adjust.css): enter = decelerate 420 ms, settle = standard 300 ms
  var EASE_IN = "cubic-bezier(0.05, 0.7, 0.1, 1)", EASE_STD = "cubic-bezier(0.2, 0, 0, 1)", EASE_ACC = "cubic-bezier(0.3, 0, 1, 1)";
  var emergeFrom = null, leaving = {};              // emergeFrom: centre of the shelf icon that was clicked (the widget grows out of it)
  // A widget that comes back: from the shelf icon it was called with (emergeFrom) it GROWS out of that icon (scale 0.18 -> 1, 380 ms, decelerate, opacity 0 -> 1);
  // from anywhere else (Settings switch) it rises 0.6 rem and scales up from 96 % (420 ms). transform + opacity only, one element.
  function popIn(w) {
    var el = $(w.el), end, from = emergeFrom, r, k, dx, dy;
    emergeFrom = null;
    if (!el || !el.animate || reduceMotion()) { return; }
    try { end = window.getComputedStyle(el).opacity; } catch (e) { end = "1"; }
    if (from) {
      r = el.getBoundingClientRect(); k = pxRatio(el.parentNode) || 1;
      if (r.width > 2) {
        dx = (from.x - (r.left + r.width / 2)) / k; dy = (from.y - (r.top + r.height / 2)) / k;
        el.animate([{ opacity: 0, transform: "translate3d(" + dx + "px," + dy + "px,0) scale(0.18)" }, { opacity: end, transform: "none" }], { duration: 380, easing: EASE_IN });
        return;
      }
    }
    el.animate([{ opacity: 0, transform: "translate3d(0, 0.6rem, 0) scale(0.96)" }, { opacity: end, transform: "none" }], { duration: 420, easing: EASE_IN });
  }
  // A widget that goes away (the eye, while adjusting): it shrinks into the shelf (scale -> 0.18, fades, 260 ms, accelerate) and only THEN is switched off,
  // so the icon appears where the widget just vanished. done() runs once, also when the animation never finishes (guard timer).
  function flyTarget() {
    var r;
    if (shelf && !shelf.classList.contains("is-empty")) { r = shelf.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }
    return { x: 40, y: (window.innerHeight || 600) - 44 };       // where the shelf will appear (bottom left)
  }
  function hideAnim(w, done) {
    var el = $(w.el), r, k, t, dx, dy, a, fin = false, tm;
    if (!adjusting || !el || !el.animate || reduceMotion() || !visible(w)) { done(); return; }
    r = el.getBoundingClientRect();
    if (r.width < 2) { done(); return; }
    k = pxRatio(el.parentNode) || 1; t = flyTarget();
    dx = (t.x - (r.left + r.width / 2)) / k; dy = (t.y - (r.top + r.height / 2)) / k;
    leaving[w.id] = true;
    function end() {
      if (fin) { return; } fin = true; clearTimeout(tm); delete leaving[w.id];
      done();
      try { a.cancel(); } catch (e) { }
    }
    try {
      a = el.animate([{ opacity: 1, transform: "translate3d(0,0,0) scale(1)" }, { opacity: 0, transform: "translate3d(" + dx + "px," + dy + "px,0) scale(0.18)" }], { duration: 260, easing: EASE_ACC, fill: "forwards" });
      a.onfinish = end;
    } catch (e2) { end(); return; }
    tm = setTimeout(end, 380);
  }
  function dropAnim(w) {                           // set down: lift (1.025) -> tiny press (0.992) -> rest. Follow-through, no bounce
    var el = $(w.el);
    if (!el || !el.animate || reduceMotion()) { return; }
    el.animate([{ transform: "scale(1.025)" }, { transform: "scale(0.992)", offset: 0.5 }, { transform: "none" }], { duration: 300, easing: EASE_STD });
  }
  // everything that moves because of a change (reset layout) glides from where it was to where it is now
  function flipFrom(before) {
    if (reduceMotion()) { return; }
    var o = origin();
    WIDGETS.forEach(function (w) {
      var el = $(w.el), b = before[w.id], a, dx, dy;
      if (!el || !b || !visible(w) || !el.animate) { return; }
      a = el.getBoundingClientRect(); dx = b.left - a.left; dy = b.top - a.top;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) { return; }
      el.animate([{ transform: "translate3d(" + dx + "px," + dy + "px,0)" }, { transform: "none" }], { duration: 420, easing: EASE_STD });
    });
  }
  function snapshot() {
    var out = {};
    WIDGETS.forEach(function (w) { var el = $(w.el); if (el && visible(w)) { out[w.id] = el.getBoundingClientRect(); } });
    return out;
  }
  var zTop = 10;
  function raise(w) { var el = $(w.el); if (el) { el.style.zIndex = String(++zTop); } }
  function glide(w) {
    var el = $(w.el); if (!el || reduceMotion()) { return; }
    el.classList.add("wa-glide");
    if (el.__waG) { clearTimeout(el.__waG); }
    el.__waG = setTimeout(function () { el.__waG = 0; el.classList.remove("wa-glide"); }, 360);
  }
  function setPos(w, o, l, t) {
    var it = items[w.id]; if (!it) { return; }
    it.x = l / o.W; it.y = t / o.W; dirty = true; apply(w);
  }

  // ---------- freeze / unfreeze ----------
  // measure with no motion in the way (an auto-hide transform or an entrance animation would skew the rects)
  function measureNow(fn) {
    var p = panel(), out; p.classList.add("wa-measure");
    try { out = fn(); } finally { p.classList.remove("wa-measure"); }
    return out;
  }
  // every VISIBLE widget gets its current place as its own absolute box
  function freeze() {
    if (hasItems() || !panel()) { return; }
    var o = origin(), list = [];
    measureNow(function () {
      WIDGETS.forEach(function (w) { if (visible(w)) { list.push({ w: w, r: rectOf(w, o) }); } });
    });
    refW = o.W; Z = 1;
    list.forEach(function (m) {
      var it = { x: m.r.l / o.W, y: m.r.t / o.W };
      if (!m.w.clock) { it.w = m.r.w / o.W; it.w0 = it.w; }
      items[m.w.id] = it;
    });
    dirty = false;
    panel().classList.add("wa-canvas"); syncZoom();
    applying = true; WIDGETS.forEach(apply); applying = false; syncEnd();
  }
  function unfreeze() {
    items = {}; dirty = false; refW = null;
    var p = panel(); if (p) { p.classList.remove("wa-canvas"); p.scrollTop = 0; }
    syncZoom();
    WIDGETS.forEach(apply); syncEnd();
  }
  // a widget with no place yet (it was hidden when the canvas was made): natural size, nearest free spot
  function placeMissing(w) {
    var el = $(w.el), o, k, r, others, sp, ww, par, cw, gap = 0, cs, it;
    if (!el || items[w.id] || !hasItems() || !visible(w)) { return; }
    o = origin(); k = pxRatio(el.parentNode) || 1;
    if (!w.clock) {
      par = el.parentNode; cw = par ? par.getBoundingClientRect().width : 0;
      try { cs = window.getComputedStyle(par); gap = (parseFloat(cs.columnGap) || 0) * k; } catch (e) { gap = 0; }
      ww = cw > 80 ? (w.full ? cw : (cw - gap) / 2) : o.W * 0.46;
      ww = clamp(ww, MIN_W, o.W - 2 * EDGE);
      it = items[w.id] = { x: EDGE / o.W, y: EDGE / o.W, w: ww / o.W, w0: ww / o.W };
    } else { it = items[w.id] = { x: EDGE / o.W, y: EDGE / o.W }; }
    apply(w);
    r = rectOf(w, o); others = otherRects(w, o);
    sp = findSpot({ l: EDGE, t: EDGE, w: r.w, h: r.h }, others, o);
    it.x = sp.l / o.W; it.y = sp.t / o.W; apply(w);
  }
  function placeAllMissing() { WIDGETS.forEach(placeMissing); }

  // ---------- no stacking, never outside ----------
  // Keeps the box inside the panel and OFF every other box: if it touches one it glides to the nearest free spot (the canvas is as tall as it needs to be).
  function settleOne(w, o) {
    var it = items[w.id], el = $(w.el), r, f, others;
    if (!it || !el || !visible(w)) { return false; }
    r = rectOf(w, o); f = fit(r, o); others = otherRects(w, o);
    if (hit(f, others, g2())) { f = findSpot(f, others, o); }
    if (Math.abs(f.l - r.l) > 0.5 || Math.abs(f.t - r.t) > 0.5) { glide(w); setPos(w, o, f.l, f.t); return true; }
    return false;
  }
  function resolveAll(first) {
    if (!hasItems() || !panel()) { return; }
    var o = origin(), list = first ? [first].concat(WIDGETS.filter(function (x) { return x !== first; })) : WIDGETS, pass, changed;
    for (pass = 0; pass < 3; pass++) {
      changed = false;
      list.forEach(function (w) { if (settleOne(w, o)) { changed = true; } });
      if (!changed) { break; }
    }
  }
  function settle(first) { resolveAll(first); saveLayout(); }

  // ---------- size ----------
  function readout(w) {
    var el = $(w.el), name = el && el.querySelector(".wa-name"), it = items[w.id], r, o; if (!el || !name) { return; }
    if (drag && drag.w === w && it) {
      if (w.clock) { name.textContent = Math.round(scaleFor(w, it) * 100) + "%"; }
      else { o = origin(); r = rectOf(w, o); name.textContent = Math.round(r.w) + " × " + Math.round(r.h); }
    } else { name.textContent = w.name; }
  }
  function ensure(w) { if (!hasItems()) { freeze(); } if (!items[w.id]) { placeMissing(w); } return items[w.id]; }
  // new width (and height, or null = leave it); the text scale follows the width
  function setSizeRaw(w, o, nw, nh) {
    var el = $(w.el), it = items[w.id], r, B = bottomLimit(o) - EDGE_B, nat;
    r = rectOf(w, o);
    nw = clamp(nw, MIN_W, Math.max(MIN_W, o.W - r.l - EDGE));
    it.w = nw / o.W; dirty = true; apply(w);
    if (nh !== null) {
      nat = naturalHeight(w);
      nh = clamp(nh, MIN_H, Math.max(MIN_H, B - r.t));
      if (nh > nat + 4) { it.h = nh / o.W; } else { delete it.h; }
      apply(w);
    }
  }
  // A widget can only grow until it meets another widget: if the new size would touch one, the size stops just before it
  // (bisection between the last good size and the wanted one; width first, then height).
  function resizeTo(w, o, nw, nh) {
    var el = $(w.el), it = items[w.id], others, ow, oh, hasH, lo, hi, i, mid, wv, r;
    if (!el || !it) { return; }
    others = otherRects(w, o);
    function ok() { return !hit(rectOf(w, o), others, g2()); }
    ow = it.w * o.W; hasH = !!it.h; oh = hasH ? it.h * o.W : null;
    r = rectOf(w, o);
    var startOk = ok(), startH = r.h;
    setSizeRaw(w, o, nw, nh);
    if (!startOk || ok()) { return; }
    setSizeRaw(w, o, ow, oh === null && nh !== null ? startH : oh);              // back to the last good size
    if (oh === null && nh !== null) { delete it.h; apply(w); }
    lo = ow; hi = nw;
    for (i = 0; i < 8; i++) { mid = (lo + hi) / 2; setSizeRaw(w, o, mid, null); if (ok()) { lo = mid; } else { hi = mid; } }
    wv = lo; setSizeRaw(w, o, wv, null);
    if (nh !== null) {
      lo = rectOf(w, o).h; hi = nh;
      if (hi > lo) {
        for (i = 0; i < 8; i++) { mid = (lo + hi) / 2; setSizeRaw(w, o, wv, mid); if (ok()) { lo = mid; } else { hi = mid; } }
        setSizeRaw(w, o, wv, lo);
      }
    }
  }
  function setScale(w, v) {
    var it = items[w.id], prev, o, others; if (!it) { return; }
    prev = it.s;
    v = clamp(Math.round(v * 100) / 100, SC_MIN, SC_MAX);
    if (Math.abs(v - 1) < 0.03) { delete it.s; } else { it.s = v; }
    dirty = true; apply(w);
    o = origin(); others = otherRects(w, o);
    if (v > (prev || 1) && hit(rectOf(w, o), others, g2())) { if (prev) { it.s = prev; } else { delete it.s; } apply(w); }   // the clock may not grow onto another widget
  }

  function onDown(w, e) {
    if (e.button !== undefined && e.button !== 0) { return; }
    var el = $(w.el), it = ensure(w); if (!el || !it) { return; }
    e.preventDefault(); e.stopPropagation();
    var o = origin(), r = rectOf(w, o);
    drag = { w: w, id: e.pointerId, x: e.clientX, y: e.clientY, r: r, o: o, others: otherRects(w, o), T: targets(o, otherRects(w, o)), s0: scaleFor(w, it), h0: it.h ? it.h * o.W : 0, grip: e.currentTarget, clock: !!w.clock };
    raise(w); el.classList.add("wa-drag");
    try { drag.grip.setPointerCapture(e.pointerId); } catch (e1) { }
    readout(w);
  }
  function onMove(e) {
    if (!drag || (drag.id !== undefined && e.pointerId !== drag.id)) { return; }
    var dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (drag.clock) { setScale(drag.w, drag.s0 * (drag.r.w + dx) / Math.max(40, drag.r.w)); readout(drag.w); return; }
    var nw = drag.r.w + dx, nh = Math.abs(dy) > 4 ? drag.r.h + dy : (drag.h0 || null), oo = origin(), gx = null, gy = null, bx, by, q, i;
    bx = snapAxis2(nw, 0, { lo: [], c: [], hi: drag.T.x.hi.map(function (t) { return { at: t.at - drag.r.l, pen: t.pen }; }) }, 0);      // right edge on a line
    for (i = 0; i < drag.others.length; i++) { q = drag.others[i].w - nw; if (Math.abs(q) <= SNAP && (!bx || Math.abs(q) < Math.abs(bx.d))) { bx = { d: q, at: drag.others[i].w }; } }   // same width as a neighbour
    if (bx) { nw += bx.d; gx = oo.l + drag.r.l + nw; }
    if (nh !== null && Math.abs(dy) > 4) {
      by = snapAxis2(nh, 0, { lo: [], c: [], hi: drag.T.y.hi.map(function (t) { return { at: t.at - drag.r.t, pen: t.pen }; }) }, 0);
      for (i = 0; i < drag.others.length; i++) { q = drag.others[i].h - nh; if (Math.abs(q) <= SNAP && (!by || Math.abs(q) < Math.abs(by.d))) { by = { d: q, at: drag.others[i].h }; } }
      q = Math.round((drag.r.t + nh) / GRID_Y) * GRID_Y - (drag.r.t + nh); if (Math.abs(q) <= SNAP && (!by || Math.abs(q) + 3 < Math.abs(by.d))) { by = { d: q, at: 0 }; }   // 8 px rows
      if (by) { nh += by.d; gy = oo.t + drag.r.t + nh; }
    }
    showGuides(gx, gy);
    resizeTo(drag.w, drag.o, nw, nh);
    readout(drag.w);
  }
  function onUp(e) {
    if (!drag || (drag.id !== undefined && e.pointerId !== drag.id)) { return; }
    var w = drag.w, el = $(w.el);
    try { drag.grip.releasePointerCapture(drag.id); } catch (e2) { }
    if (el) { el.classList.remove("wa-drag"); }
    showGuides(null, null);
    drag = null; readout(w); settle(w);
  }
  function onKey(w, e) {
    var key = e.key, step = e.shiftKey ? STEP_BIG : STEP, dx = 0, dy = 0, it = ensure(w), o, r;
    if (!it) { return; }
    if (w.clock) {                                       // clock: arrows change the scale (5 %, Shift 10 %)
      var d = 0, q = e.shiftKey ? 0.1 : 0.05;
      if (key === "ArrowRight" || key === "ArrowUp") { d = q; } else if (key === "ArrowLeft" || key === "ArrowDown") { d = -q; } else { return; }
      e.preventDefault(); e.stopPropagation();
      setScale(w, scaleFor(w, it) + d); settle(w); return;
    }
    if (key === "ArrowLeft") { dx = -step; } else if (key === "ArrowRight") { dx = step; }
    else if (key === "ArrowUp") { dy = -step; } else if (key === "ArrowDown") { dy = step; } else { return; }
    e.preventDefault(); e.stopPropagation();
    o = origin(); r = rectOf(w, o);
    resizeTo(w, o, r.w + dx, dy ? r.h + dy : (it.h ? it.h * o.W : null));
    settle(w);
  }
  function resetOne(w) {      // the grip, double-click: default size
    var it = items[w.id]; if (!it) { return; }
    if (w.clock) { delete it.s; } else { it.w = it.w0; delete it.h; }
    dirty = true; apply(w); glide(w); settle(w); readout(w);
  }
  // Reset layout: back to the original flow. While adjusting the canvas is made again from that flow (nothing moved yet = nothing saved).
  // Reset layout: the original flow layout of ALL six widgets (hidden ones keep their own slot, so showing one later never overlaps
  // anything). Done without any further change: the flow layout comes back and nothing is saved.
  function resetAll() {
    var before = snapshot();
    lsDel(CLOCK_KEY);
    unfreeze(); refresh();
    if (adjusting) { freeze(); dirty = false; placeAllMissing(); }     // freeze() measures every displayed widget, ghosts included
    saveLayout();
    flipFrom(before);
  }

  // Tidy up: rows of widgets with equal gaps. Widgets that sit on about the same height form a row (left to right as they were); a row that does not fit wraps;
  // a row is stretched to the panel width (keeping each widget's text scale between 0.68 and 1.3), every widget of a row gets the row's height, rows are GAP apart.
  function tidyAll() {
    if (!adjusting || !panel()) { return; }
    if (!hasItems()) { freeze(); }
    placeAllMissing();
    var o = origin(), M = GRID_M, avail = o.W - 2 * M, list = [], rows = [], cur = null, subs = [], y = M, before = snapshot();
    WIDGETS.forEach(function (w) { if (visible(w) && items[w.id]) { list.push({ w: w, r: rectOf(w, o) }); } });
    if (!list.length) { return; }
    list.sort(function (a, b) { return (a.r.t - b.r.t) || (a.r.l - b.r.l); });
    list.forEach(function (m) {
      if (cur && !m.w.full && !cur.full && m.r.t < cur.t + cur.h * 0.5) { cur.items.push(m); cur.h = Math.max(cur.h, m.r.h); }
      else { cur = { t: m.r.t, h: m.r.h, full: !!m.w.full, items: [m] }; rows.push(cur); }
    });
    rows.forEach(function (row) {
      var sub = [], sw = 0;
      row.items.sort(function (a, b) { return a.r.l - b.r.l; });
      row.items.forEach(function (m) {
        var ww = m.w.full ? avail : clamp(m.r.w, m.w.clock ? 40 : MIN_W, avail);
        if (sub.length && sw + GAP + ww > avail) { subs.push(sub); sub = []; sw = 0; }
        sw += (sub.length ? GAP : 0) + ww; sub.push({ m: m, ww: ww, nw: ww });
      });
      if (sub.length) { subs.push(sub); }
    });
    subs.forEach(function (sub) {
      var gaps = (sub.length - 1) * GAP, fixed = 0, flex = 0, f = 1, x, total = 0, rowH = 0;
      sub.forEach(function (e) { if (e.m.w.clock || e.m.w.full) { fixed += e.ww; } else { flex += e.ww; } });
      if (flex > 0) { f = (avail - gaps - fixed) / flex; if (f < 0.8 || f > 1.35) { f = 1; } }
      sub.forEach(function (e) {
        var it = items[e.m.w.id], w0;
        glide(e.m.w);
        if (e.m.w.clock) { return; }
        w0 = (it.w0 || it.w) * o.W;
        e.nw = e.m.w.full ? avail : clamp(clamp(e.ww * f, MIN_W, avail), w0 * S_MIN, w0 * S_MAX);
        it.w = e.nw / o.W; delete it.h; apply(e.m.w);                           // natural height at the new width
      });
      sub.forEach(function (e) { e.h = rectOf(e.m.w, o).h; rowH = Math.max(rowH, e.h); total += e.nw; });
      total += gaps; x = M + Math.max(0, (avail - total) / 2);
      sub.forEach(function (e) {
        var it = items[e.m.w.id];
        it.x = x / o.W; it.y = (y + (e.m.w.clock ? (rowH - e.h) / 2 : 0)) / o.W;
        if (!e.m.w.clock && rowH > e.h + 4) { it.h = rowH / o.W; }
        apply(e.m.w); x += e.nw + GAP;
      });
      y += rowH + GAP;
    });
    dirty = true; syncEnd(); resolveAll(); saveLayout();
  }

  // ---------- move ----------
  function guideEls() {
    if (guides) { return guides; }
    var v = document.createElement("div"), h = document.createElement("div");
    v.className = "wa-guide wa-guide-v"; h.className = "wa-guide wa-guide-h";
    document.body.appendChild(v); document.body.appendChild(h);
    guides = { v: v, h: h };
    return guides;
  }
  function showGuides(gx, gy) {
    var g = guideEls();
    if (gx === null) { g.v.classList.remove("is-on"); } else { g.v.style.left = gx + "px"; g.v.classList.add("is-on"); }
    if (gy === null) { g.h.classList.remove("is-on"); } else { g.h.style.top = gy + "px"; g.h.classList.add("is-on"); }
  }
  // ---------- tidy snapping ----------
  // Targets, per axis, for the left / top edge (lo), the centre (c) and the right / bottom edge (hi) of the moving box.
  //   - the panel edges and the centre line
  //   - the other widgets: same edge, same centre, and exactly GAP px next to them (so every gap between widgets is the same)
  //   - a column grid (12 columns, 6 on a narrow panel) for x, an 8 px grid for y; the grid pulls a little weaker (pen) than another widget
  function targets(o, others) {
    var T = { x: { lo: [{ at: EDGE, pen: 0 }], c: [{ at: o.W / 2, pen: 0 }], hi: [{ at: o.W - EDGE, pen: 0 }] }, y: { lo: [{ at: EDGE, pen: 0 }], c: [], hi: [] } }, i, b, cols = o.W >= 480 ? 12 : 6, cw, c;
    for (i = 0; i < others.length; i++) {
      b = others[i];
      T.x.lo.push({ at: b.l, pen: 0 }, { at: b.l + b.w + GAP, pen: 0 }); T.x.hi.push({ at: b.l + b.w, pen: 0 }, { at: b.l - GAP, pen: 0 }); T.x.c.push({ at: b.l + b.w / 2, pen: 0 });
      T.y.lo.push({ at: b.t, pen: 0 }, { at: b.t + b.h + GAP, pen: 0 }); T.y.hi.push({ at: b.t + b.h, pen: 0 }, { at: b.t - GAP, pen: 0 }); T.y.c.push({ at: b.t + b.h / 2, pen: 0 });
    }
    cw = (o.W - 2 * GRID_M - (cols - 1) * GAP) / cols;
    if (cw > 8) { for (c = 0; c < cols; c++) { T.x.lo.push({ at: GRID_M + c * (cw + GAP), pen: 3 }); T.x.hi.push({ at: GRID_M + c * (cw + GAP) + cw, pen: 3 }); } }
    return T;
  }
  // the best alignment within SNAP px: {d: how far to move, at: the line that was met}; step > 0 adds a regular grid of that size
  function snapAxis2(lo, size, A, step) {
    var best = null, pts = [[lo, A.lo, 0], [lo + size / 2, A.c, 0], [lo + size, A.hi, 1]], i, j, d, sc, g;
    function take(dd, at, pen) { sc = Math.abs(dd) + pen; if (Math.abs(dd) <= SNAP && (best === null || sc < best.sc)) { best = { d: dd, at: at, sc: sc }; } }
    for (i = 0; i < pts.length; i++) {
      for (j = 0; j < pts[i][1].length; j++) { take(pts[i][1][j].at - pts[i][0], pts[i][1][j].at, pts[i][1][j].pen); }
      if (step && i !== 1) { g = Math.round(pts[i][0] / step) * step; take(g - pts[i][0], g, 3); }
    }
    return best;
  }
  function startMove(w, e) {
    if (e.button !== undefined && e.button !== 0) { return; }
    var el = $(w.el); if (!el || !ensure(w)) { return; }
    e.preventDefault(); e.stopPropagation();
    var o = origin(), r = rectOf(w, o), others = otherRects(w, o), T = targets(o, others), p = panel();
    // r, xs, ys are CONTENT coordinates (they do not change when the panel scrolls); sc0 = scroll position at the start
    mv = { w: w, id: e.pointerId, sx: e.clientX, sy: e.clientY, px: e.clientX, py: e.clientY, r: r, tx: T.x, ty: T.y, others: others, free: hit(r, others, g2()), vl: r.l, vt: r.t, sc0: p.scrollTop, tl: r.l, tt: r.t, cl: r.l, ct: r.t, ov: e.currentTarget, raf: 0, released: false };
    raise(w); el.classList.add("wa-drag", "wa-lift");
    try { mv.ov.setPointerCapture(e.pointerId); } catch (e1) { }
    readout(w);
    mv.raf = requestAnimationFrame(moveStep);
  }
  function onMoveMove(e) {
    if (!mv || mv.released || (mv.id !== undefined && e.pointerId !== mv.id)) { return; }
    mv.px = e.clientX; mv.py = e.clientY;
  }
  // one frame: scroll the panel when the pointer is near its top / bottom edge, find the target spot (edges + snap), ease toward it
  function moveStep() {
    if (!mv) { return; }
    var p = panel(), o = origin(), r = mv.r, vt = o.t + p.scrollTop, vb = vt + p.clientHeight, ZONE = 56, d = 0, f, bx, by, gx = null, gy = null, ex, ey, blocked = false, el = $(mv.w.el);
    if (!mv.released) {
      if (mv.py > vb - ZONE) { d = clamp((mv.py - (vb - ZONE)) / ZONE, 0, 1.4) * 11; }
      else if (mv.py < vt + ZONE) { d = -clamp(((vt + ZONE) - mv.py) / ZONE, 0, 1.4) * 11; }
      if (d) { p.scrollTop = p.scrollTop + d; o = origin(); }
      f = fit({ l: r.l + mv.px - mv.sx, t: r.t + (mv.py - mv.sy) + (p.scrollTop - mv.sc0), w: r.w, h: r.h }, o);
      bx = snapAxis2(f.l, r.w, mv.tx, 0); by = snapAxis2(f.t, r.h, mv.ty, GRID_Y);
      if (bx) { f.l += bx.d; gx = o.l + bx.at; }
      if (by) { f.t += by.d; gy = o.t + by.at; }
      f = fit(f, o);
      // other widgets are solid: if the wanted spot touches one, try sliding along it (x only, y only), else stay at the last free spot
      if (!mv.free && hit({ l: f.l, t: f.t, w: r.w, h: r.h }, mv.others, g2())) {
        if (!hit({ l: f.l, t: mv.vt, w: r.w, h: r.h }, mv.others, g2())) { f.t = mv.vt; }
        else if (!hit({ l: mv.vl, t: f.t, w: r.w, h: r.h }, mv.others, g2())) { f.l = mv.vl; }
        else { f.l = mv.vl; f.t = mv.vt; }
        blocked = true;
      }
      mv.vl = f.l; mv.vt = f.t;
      if (el) { el.classList.toggle("wa-clash", blocked); }
      showGuides(gx, gy);
      mv.tl = f.l; mv.tt = f.t;
    }
    ex = mv.tl - mv.cl; ey = mv.tt - mv.ct;
    if (Math.abs(ex) < 0.2 && Math.abs(ey) < 0.2) { mv.cl = mv.tl; mv.ct = mv.tt; } else { mv.cl += ex * 0.36; mv.ct += ey * 0.36; }   // easing toward the pointer
    setPos(mv.w, o, mv.cl, mv.ct);
    if (mv.released && mv.cl === mv.tl && mv.ct === mv.tt) { mv.raf = 0; finishMove(); return; }
    mv.raf = requestAnimationFrame(moveStep);
  }
  function onMoveUp(e) {
    if (!mv || (mv.id !== undefined && e.pointerId !== mv.id)) { return; }
    try { mv.ov.releasePointerCapture(mv.id); } catch (e2) { }
    showGuides(null, null);
    mv.released = true;                            // the loop finishes the glide to the last target, then finishMove()
  }
  function finishMove() {
    if (!mv) { return; }
    var w = mv.w, el = $(w.el);
    if (mv.raf) { cancelAnimationFrame(mv.raf); mv.raf = 0; }
    showGuides(null, null);
    if (el) { el.classList.remove("wa-drag", "wa-lift", "wa-clash"); }
    mv = null; readout(w);
    dropAnim(w); settle(w);
  }
  function onMoveKey(w, e) {
    var key = e.key, step = e.shiftKey ? STEP_BIG : STEP, dx = 0, dy = 0, o, r, f;
    if (key === "ArrowLeft") { dx = -step; } else if (key === "ArrowRight") { dx = step; }
    else if (key === "ArrowUp") { dy = -step; } else if (key === "ArrowDown") { dy = step; } else { return; }
    e.preventDefault(); e.stopPropagation();
    if (!ensure(w)) { return; }
    o = origin(); r = rectOf(w, o); f = fit({ l: r.l + dx, t: r.t + dy, w: r.w, h: r.h }, o);
    if (hit(f, otherRects(w, o), g2())) { return; }
    setPos(w, o, f.l, f.t); settle(w);
  }

  // ---------- show / hide ----------
  function isOn(w) {
    if (w.key) { return lsGet(w.key) !== "0"; }
    var c = $(w.box);
    if (c) { return !!c.checked; }
    return true;
  }
  // a widget that appears gets its own place (or the nearest free spot); nothing else moves
  function afterToggle(w) {
    if (!hasItems()) { return; }
    if (!items[w.id]) { placeMissing(w); } else { settleOne(w, origin()); }
    if (isOn(w)) { popIn(w); }
    saveLayout();
  }
  function setOn(w, on) {
    if (leaving[w.id]) { return; }                                  // the exit is still playing
    if (!on && isOn(w) && adjusting) { hideAnim(w, function () { switchTo(w, false); }); return; }
    switchTo(w, on);
  }
  function switchTo(w, on) {
    if (w.key) { lsSet(w.key, on ? "1" : "0"); refresh(); afterToggle(w); return; }
    var c = $(w.box);
    if (!c) { return; }
    switching = true;
    try {
      c.checked = !!on;
      try { c.dispatchEvent(new Event("change", { bubbles: true })); } catch (e) { var ev = document.createEvent("Event"); ev.initEvent("change", true, false); c.dispatchEvent(ev); }
    } finally { switching = false; }
    refresh(); afterToggle(w);
  }
  function refresh() {
    WIDGETS.forEach(function (w) {
      var el = $(w.el); if (!el) { return; }
      var on = isOn(w), eye = el.querySelector(".wa-eye");
      el.classList.toggle("wa-ghost", !on);
      if (w.own || w.clock) { el.classList.toggle("wa-off", !on); }
      if (eye) {
        eye.setAttribute("aria-pressed", on ? "true" : "false");
        eye.setAttribute("aria-label", (on ? "Hide " : "Show ") + w.noun);
        eye.setAttribute("title", (on ? "Hide " : "Show ") + w.noun);
      }
    });
    syncShelf();
  }

  // ---------- hidden-widget shelf ----------
  // A hidden widget has no box on the canvas (so it can never be in the way while adjusting); its icon waits here instead. Click = show it again.
  function buildShelf() {
    if (shelf) { return; }
    shelf = document.createElement("div"); shelf.id = "ia-shelf"; shelf.className = "ia-shelf is-empty";
    shelf.setAttribute("role", "group"); shelf.setAttribute("aria-label", "Hidden widgets");
    WIDGETS.forEach(function (w) {
      var b = document.createElement("button");
      b.type = "button"; b.className = "ia-sh"; b.hidden = true;
      b.setAttribute("data-name", w.name); b.setAttribute("aria-label", "Show " + w.noun);
      b.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true">' + (SHELF_ICON[w.id] || "") + "</svg>";
      b.addEventListener("click", function (e) {
        var r = b.getBoundingClientRect(); e.stopPropagation();
        emergeFrom = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
        setOn(w, true);
        emergeFrom = null;
      });
      shelf.appendChild(b); shelfBtns[w.id] = b;
    });
    document.body.appendChild(shelf);
  }
  function syncShelf() {
    var any = false;
    if (!shelf) { return; }
    WIDGETS.forEach(function (w) {
      var b = shelfBtns[w.id], off = !isOn(w); if (!b) { return; }
      if (off && b.hidden) { b.hidden = false; b.classList.remove("is-pop"); void b.offsetWidth; b.classList.add("is-pop"); }
      else if (!off && !b.hidden) { b.hidden = true; b.classList.remove("is-pop"); }
      if (off) { any = true; }
    });
    shelf.classList.toggle("is-empty", !any);
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
    var ov = document.createElement("div"); ov.className = "wa-move"; ov.tabIndex = 0; ov.setAttribute("role", "group");
    ov.setAttribute("aria-label", "Move " + w.noun + ". Arrow keys move it.");
    ov.setAttribute("title", "Drag to move it anywhere.");
    el.appendChild(ov); el.appendChild(bar);
    ov.addEventListener("pointerdown", function (e) { startMove(w, e); });
    ov.addEventListener("pointermove", onMoveMove);
    ov.addEventListener("pointerup", onMoveUp);
    ov.addEventListener("pointercancel", onMoveUp);
    ov.addEventListener("keydown", function (e) { onMoveKey(w, e); });
    eye.addEventListener("click", function (e) { e.stopPropagation(); setOn(w, !isOn(w)); });
    grip.addEventListener("pointerdown", function (e) { onDown(w, e); });
    grip.addEventListener("pointermove", onMove);
    grip.addEventListener("pointerup", onUp);
    grip.addEventListener("pointercancel", onUp);
    grip.addEventListener("keydown", function (e) { onKey(w, e); });
    grip.addEventListener("dblclick", function (e) { e.stopPropagation(); resetOne(w); });
    if (w.box && $(w.box)) { $(w.box).addEventListener("change", function () { if (!switching) { refresh(); afterToggle(w); } }); }   // Settings window flips the same switch
  }

  // ---------- auto-hide ----------
  function loadAH() {
    var v = lsGet(AH_KEY), n = v === null ? 6 : parseInt(v, 10);
    ahSec = AH_OPTS.indexOf(n) >= 0 ? n : 6;
  }
  function ahLabel() { return ahSec ? "Auto-hide " + ahSec + " s" : "Auto-hide off"; }
  function ahEnabled() {
    if (!ahSec || !isIdle() || adjusting) { return false; }
    var u = $("idle-unlock");
    return !(u && u.getAttribute("data-mode") === "move");     // in that mode any pointer move leaves the idle screen
  }
  function setClass(name, on) {       // write only on a real change (a no-op class write still queues a mutation record)
    var l = document.body.classList;
    if (l.contains(name) !== !!on) { if (on) { l.add(name); } else { l.remove(name); } }
  }
  function setQuiet(on) { if (on === quiet) { return; } quiet = on; setClass("is-quiet", on); }
  function ahBusy() {
    var a = document.activeElement, clock = $("idle-clock");
    if (a && clock && clock.contains(a) && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) { return true; }      // typing in a note / to-do
    try { return !!document.querySelector(".idle-chips > *:hover, .idle-dash > *:hover"); } catch (e) { return false; }
  }
  function ahFire() {
    ahTimer = 0;
    if (!ahEnabled()) { return; }
    if (drag || mv || ahBusy()) { ahArm(); return; }
    setQuiet(true);
  }
  function ahArm() {
    if (ahTimer) { clearTimeout(ahTimer); ahTimer = 0; }
    if (ahEnabled()) { ahTimer = setTimeout(ahFire, ahSec * 1000); }
  }
  function wake() { if (quiet) { setQuiet(false); } ahArm(); iaWake(); }
  // the adjust button has its own, shorter timer: it hides after IA_MS without movement, even when the pointer rests on it
  function iaWake() {
    setClass("is-ia-quiet", false);
    if (iaTimer) { clearTimeout(iaTimer); iaTimer = 0; }
    if (isIdle() && !adjusting) { iaTimer = setTimeout(iaFire, IA_MS); }
  }
  function iaFire() {
    iaTimer = 0;
    if (!isIdle() || adjusting) { return; }
    if (drag || mv) { iaWake(); return; }
    setClass("is-ia-quiet", true);
  }
  function cycleAH() {
    ahSec = AH_OPTS[(AH_OPTS.indexOf(ahSec) + 1) % AH_OPTS.length];
    lsSet(AH_KEY, String(ahSec));
    if (ui.auto) { ui.auto.textContent = ahLabel(); }
  }
  function bindAH() {
    function activity(e) {
      if (!isIdle()) { return; }
      if (e.type === "pointermove") { var t = Date.now(); if (t - lastMove < 120) { return; } lastMove = t; }
      if (e.type === "pointerdown") { swallowClick = quiet; }       // the first tap on a hidden UI only brings it back
      wake();
    }
    ["pointermove", "pointerdown", "keydown", "wheel", "touchstart"].forEach(function (n) {
      window.addEventListener(n, activity, { capture: true, passive: true });
    });
    // a finished timer no longer wakes the UI (that made the timer vanish and pop back): it stays visible (.is-live) and rolls its digits back to the set time
    if (ui.auto) { ui.auto.textContent = ahLabel(); ui.auto.addEventListener("click", function () { cycleAH(); wake(); }); }
  }

  // ---------- adjust mode ----------
  function setAdjust(on) {
    on = !!on && isIdle();
    if (on === adjusting) { return; }
    adjusting = on;
    if (on) {
      freeze();                                                    // visible widgets stay exactly where they are
      setClass("is-adjusting", true);
      refresh(); placeAllMissing();                                // a widget that was hidden when the canvas was made gets its place
      resolveAll();                                                // a saved layout from an older version may overlap: separate it
    } else {
      if (mv) { finishMove(); }
      else if (drag) {
        var el = $(drag.w.el); if (el) { el.classList.remove("wa-drag"); }
        drag = null; WIDGETS.forEach(readout);
      }
      showGuides(null, null);
      setClass("is-adjusting", false);
      if (!dirty && hasItems()) { unfreeze(); lsDel(LAYOUT_KEY); }  // nothing was changed: keep the original flow layout
      else { settle(); }
    }
    if (ui.btn) {
      ui.btn.setAttribute("aria-pressed", on ? "true" : "false");
      ui.btn.setAttribute("aria-label", on ? "Done adjusting" : "Adjust widgets");
      ui.btn.setAttribute("title", on ? "Done" : "Adjust widgets");
    }
    if (ui.reset) { ui.reset.tabIndex = on ? 0 : -1; }
    if (ui.tidy) { ui.tidy.tabIndex = on ? 0 : -1; }
    if (ui.auto) { ui.auto.tabIndex = on ? 0 : -1; }
    syncEnd();                                                     // scroll room only while Adjust is open
    wake();
  }

  function init() {
    ui.btn = $("ia-btn"); ui.reset = $("ia-reset"); ui.tidy = $("ia-tidy"); ui.auto = $("ia-auto");
    loadAH();
    loadLayout();
    WIDGETS.forEach(build); buildShelf();
    refresh(); applyAll();
    if (ui.btn) { ui.btn.addEventListener("click", function (e) { setAdjust(!adjusting); if (e.detail) { ui.btn.blur(); } }); }
    if (ui.reset) { ui.reset.addEventListener("click", resetAll); }
    if (ui.tidy) { ui.tidy.addEventListener("click", tidyAll); }
    bindAH();

    // Esc leaves adjust mode first. On window (capture) so it runs before the idle screen's own Esc handler.
    window.addEventListener("keydown", function (e) {
      if ((e.key === "Escape" || e.keyCode === 27) && adjusting) { e.stopImmediatePropagation(); e.preventDefault(); setAdjust(false); }
    }, true);
    // (A click on an empty spot of the idle screen no longer leaves it at all; this guard only covers the Adjust mode.)
    var clock = $("idle-clock");
    if (clock) {
      clock.addEventListener("click", function (e) {
        if (swallowClick) { swallowClick = false; e.stopPropagation(); e.preventDefault(); return; }   // that tap only revealed the UI
        if (!adjusting) { return; }
        var t = e.target, sel = ".idle-card, .idle-timer, .idle-elapsed, .idle-hero, .idle-message, button, input, textarea, select, a", path = e.composedPath ? e.composedPath() : [], i;
        if (t && t.closest && t.closest(sel)) { return; }
        for (i = 0; i < path.length; i++) { if (path[i] && path[i].matches && path[i].matches(sel)) { return; } }
        e.stopPropagation();
      }, true);
    }
    // The idle screen opening / closing. Only a real change of body.is-idle is handled: this observer sees every class write on
    // <body>, including our own (is-adjusting, is-quiet, is-ia-quiet), so reacting to each of them would loop forever.
    var wasIdle = isIdle(), qT = 0;
    try {
      new MutationObserver(function () {
        var now = isIdle();
        if (now === wasIdle) { return; }
        wasIdle = now;
        if (now) {
          if (qT) { clearTimeout(qT); qT = 0; }
          setClass("is-ia-quiet", false); setQuiet(false);   // a late clear from the last exit must not hide this entry
          ahArm(); iaWake();
          requestAnimationFrame(function () { if (isIdle() && hasItems()) { applyAll(); resolveAll(); saveLayout(); } });   // a saved layout never opens stacked or cut off
        } else {
          if (adjusting) { setAdjust(false); }
          if (ahTimer) { clearTimeout(ahTimer); ahTimer = 0; }
          if (iaTimer) { clearTimeout(iaTimer); iaTimer = 0; }
          swallowClick = false;
          // Auto-hide state is cleared only AFTER the clock has faded out (css/mt-idle-motion.css, 0.22 s). Cleared at once, the hidden
          // boxes jumped back to visible while the clock was still on screen = a pop at the start of every exit from auto-hide.
          if (qT) { clearTimeout(qT); }
          qT = setTimeout(function () { qT = 0; if (!isIdle()) { setClass("is-ia-quiet", false); setQuiet(false); } }, 420);
        }
      }).observe(document.body, { attributes: true, attributeFilter: ["class"] });
    } catch (e2) { }
    // the panel (or Card scale) changed: positions are fractions of the panel, so they follow; then keep everything inside and unstacked
    // v19: the canvas is zoomed by panel width / ref, so a resize needs no overlap check at all (everything scales together). One frame per burst, so the
    // widgets follow the panel edge while it is dragged. Only when the zoom hit its limit (very small / very large panel) the layout is checked once.
    var rzRaf = 0, lastW = 0;
    function onResize() {
      rzRaf = 0;
      if (!hasItems() || !panel()) { return; }
      var o = origin(); if (o.W < 60 || Math.abs(o.W - lastW) < 0.5) { return; }
      lastW = o.W;
      applyAll();
      if (zClamped && isIdle()) { settle(); } else { syncEnd(); }
    }
    function schedResize() { if (!rzRaf) { rzRaf = requestAnimationFrame(onResize); } }
    window.addEventListener("resize", schedResize);
    try { if (window.ResizeObserver && panel()) { new ResizeObserver(schedResize).observe(panel()); } } catch (e3) { }
    // "Reset everything" in Settings
    var rs = $("settings-reset");
    if (rs) { rs.addEventListener("click", function () { lsDel(LAYOUT_KEY); lsDel(TIMER_KEY); lsDel(CLOCK_KEY); lsDel(AH_KEY); unfreeze(); loadAH(); if (ui.auto) { ui.auto.textContent = ahLabel(); } refresh(); }); }
  }
  if (document.readyState === "loading") { document.addEventListener("DOMContentLoaded", init); } else { init(); }
})();
