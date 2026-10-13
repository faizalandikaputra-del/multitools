/* Multi Tool - mt-idle-adjust.js  (v15: FREE CANVAS)
   Idle screen: move, resize and show / hide every widget without opening Settings, all from the "Adjust widgets" button
   (#ia-btn, bottom right of the idle screen).

   Widgets: Clock (date, time, session, message), Time in After Effects, Timer, Stopwatch, Alarms, Notes and to-do.

   HOW THE LAYOUT WORKS (rewritten in v15, replaces the grid + offset system of fix33 - fix38)
   - Normal state (never adjusted): the widgets sit in their normal grid / flow, exactly as before.
   - First time Adjust opens: every visible widget is "frozen" where it stands (position: absolute inside #idle-clock, class
     .wa-canvas). From then on each widget is placed by its OWN left / top / width / height and depends on no other widget:
     moving, resizing, hiding or showing one widget can never push, stretch or shift another one.
     Hidden widgets (ghosts) are put in a free spot while adjusting.
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
  var P = "mtx.", LAYOUT_KEY = P + "wLayout", TIMER_KEY = P + "showTimer", CLOCK_KEY = P + "showClock";
  var SC_MIN = 0.5, SC_MAX = 2.2, S_MIN = 0.68, S_MAX = 1.3, MIN_W = 110, MIN_H = 56, GAP = 8, EDGE = 4, EDGE_B = 12, GAP2 = 6, SNAP = 8, STEP = 10, STEP_BIG = 40;
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
  var ICON_GRIP = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 10 10 20"/><path d="M20 16l-4 4"/></svg>';

  function $(id) { return document.getElementById(id); }
  function isIdle() { return document.body.classList.contains("is-idle"); }
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { } }
  function lsDel(k) { try { localStorage.removeItem(k); } catch (e) { } }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function r1(v) { return Math.round(v * 10) / 10; }

  var AH_KEY = P + "autoHide", AH_OPTS = [0, 3, 6, 10];
  var items = {}, dirty = false, adjusting = false, drag = null, mv = null, guides = null, ui = {};
  var ahSec = 6, ahTimer = 0, quiet = false, swallowClick = false, lastMove = 0, iaTimer = 0, IA_MS = 2500, switching = false;

  // ---------- storage ----------
  function hasItems() { var k; for (k in items) { if (items.hasOwnProperty(k)) { return true; } } return false; }
  function num(v, lo, hi) { v = parseFloat(v); return isFinite(v) && v >= lo && v <= hi ? v : null; }
  function loadLayout() {
    var o = null, it;
    items = {}; dirty = false;
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
    if (any && dirty) { lsSet(LAYOUT_KEY, JSON.stringify(out)); } else { lsDel(LAYOUT_KEY); }
  }

  // ---------- geometry (all numbers are screen px, relative to the inside of the panel #idle-clock) ----------
  function reduceMotion() {
    try {
      if (document.documentElement.getAttribute("data-reduce-motion") === "true") { return true; }
      return !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    } catch (e) { return false; }
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
  // screen px per layout px (the cards are zoomed by Settings > Card scale): measured, with the scale as fallback
  function pxRatio(el) {
    var r = el.getBoundingClientRect(), ow = el.offsetWidth, k = ow ? r.width / ow : 1;
    return (isFinite(k) && k > 0.3 && k < 3) ? k : cardScale();
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
    s = scaleFor(w, it);
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
    applying = true; WIDGETS.forEach(apply); applying = false; syncEnd();
    syncEnd();
  }
  function naturalHeight(w) {                      // screen px
    var el = $(w.el), keep = el.style.minHeight, k = pxRatio(el.parentNode) || 1, n;
    el.style.minHeight = ""; n = el.offsetHeight * k; el.style.minHeight = keep; return n;
  }
  // MOTION (Premium archetype, same curves as css/mt-idle-adjust.css): enter = decelerate 420 ms, settle = standard 300 ms
  var EASE_IN = "cubic-bezier(0.05, 0.7, 0.1, 1)", EASE_STD = "cubic-bezier(0.2, 0, 0, 1)";
  function popIn(w) {                              // a widget that appears: rises 0.6 rem, scales up from 96 %, fades in
    var el = $(w.el), end;
    if (!el || !el.animate || reduceMotion()) { return; }
    try { end = window.getComputedStyle(el).opacity; } catch (e) { end = "1"; }
    el.animate([{ opacity: 0, transform: "translate3d(0, 0.6rem, 0) scale(0.96)" }, { opacity: end, transform: "none" }], { duration: 420, easing: EASE_IN });
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
    list.forEach(function (m) {
      var it = { x: m.r.l / o.W, y: m.r.t / o.W };
      if (!m.w.clock) { it.w = m.r.w / o.W; it.w0 = it.w; }
      items[m.w.id] = it;
    });
    dirty = false;
    panel().classList.add("wa-canvas");
    applying = true; WIDGETS.forEach(apply); applying = false; syncEnd();
  }
  function unfreeze() {
    items = {}; dirty = false;
    var p = panel(); if (p) { p.classList.remove("wa-canvas"); p.scrollTop = 0; }
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
    if (hit(f, others, GAP2)) { f = findSpot(f, others, o); }
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
    function ok() { return !hit(rectOf(w, o), others, GAP2); }
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
    if (v > (prev || 1) && hit(rectOf(w, o), others, GAP2)) { if (prev) { it.s = prev; } else { delete it.s; } apply(w); }   // the clock may not grow onto another widget
  }

  function onDown(w, e) {
    if (e.button !== undefined && e.button !== 0) { return; }
    var el = $(w.el), it = ensure(w); if (!el || !it) { return; }
    e.preventDefault(); e.stopPropagation();
    var o = origin(), r = rectOf(w, o);
    drag = { w: w, id: e.pointerId, x: e.clientX, y: e.clientY, r: r, o: o, s0: scaleFor(w, it), h0: it.h ? it.h * o.W : 0, grip: e.currentTarget, clock: !!w.clock };
    raise(w); el.classList.add("wa-drag");
    try { drag.grip.setPointerCapture(e.pointerId); } catch (e1) { }
    readout(w);
  }
  function onMove(e) {
    if (!drag || (drag.id !== undefined && e.pointerId !== drag.id)) { return; }
    var dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (drag.clock) { setScale(drag.w, drag.s0 * (drag.r.w + dx) / Math.max(40, drag.r.w)); readout(drag.w); return; }
    resizeTo(drag.w, drag.o, drag.r.w + dx, Math.abs(dy) > 4 ? drag.r.h + dy : (drag.h0 || null));
    readout(drag.w);
  }
  function onUp(e) {
    if (!drag || (drag.id !== undefined && e.pointerId !== drag.id)) { return; }
    var w = drag.w, el = $(w.el);
    try { drag.grip.releasePointerCapture(drag.id); } catch (e2) { }
    if (el) { el.classList.remove("wa-drag"); }
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
  // the nearest alignment within SNAP px: edges / centre of the moving box against the targets
  function snapAxis(lo, size, targets) {
    var pts = [lo, lo + size / 2, lo + size], best = null, i, j, d;
    for (i = 0; i < pts.length; i++) {
      for (j = 0; j < targets.length; j++) {
        d = targets[j] - pts[i];
        if (Math.abs(d) <= SNAP && (best === null || Math.abs(d) < Math.abs(best.d))) { best = { d: d, at: targets[j] }; }
      }
    }
    return best;
  }
  function startMove(w, e) {
    if (e.button !== undefined && e.button !== 0) { return; }
    var el = $(w.el); if (!el || !ensure(w)) { return; }
    e.preventDefault(); e.stopPropagation();
    var o = origin(), r = rectOf(w, o), others = otherRects(w, o), xs = [EDGE, o.W - EDGE], ys = [EDGE], i, b, p = panel();
    for (i = 0; i < others.length; i++) {
      b = others[i];
      xs.push(b.l, b.l + b.w / 2, b.l + b.w); ys.push(b.t, b.t + b.h / 2, b.t + b.h);
    }
    // r, xs, ys are CONTENT coordinates (they do not change when the panel scrolls); sc0 = scroll position at the start
    mv = { w: w, id: e.pointerId, sx: e.clientX, sy: e.clientY, px: e.clientX, py: e.clientY, r: r, xs: xs, ys: ys, others: others, free: hit(r, others, GAP2), vl: r.l, vt: r.t, sc0: p.scrollTop, tl: r.l, tt: r.t, cl: r.l, ct: r.t, ov: e.currentTarget, raf: 0, released: false };
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
      bx = snapAxis(f.l, r.w, mv.xs); by = snapAxis(f.t, r.h, mv.ys);
      if (bx) { f.l += bx.d; gx = o.l + bx.at; }
      if (by) { f.t += by.d; gy = o.t + by.at; }
      f = fit(f, o);
      // other widgets are solid: if the wanted spot touches one, try sliding along it (x only, y only), else stay at the last free spot
      if (!mv.free && hit({ l: f.l, t: f.t, w: r.w, h: r.h }, mv.others, GAP2)) {
        if (!hit({ l: f.l, t: mv.vt, w: r.w, h: r.h }, mv.others, GAP2)) { f.t = mv.vt; }
        else if (!hit({ l: mv.vl, t: f.t, w: r.w, h: r.h }, mv.others, GAP2)) { f.l = mv.vl; }
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
    if (hit(f, otherRects(w, o), GAP2)) { return; }
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
      refresh(); placeAllMissing();                                // ghosts (hidden widgets) get a free spot of their own
      resolveAll();                                                // a saved layout from an older version may overlap: separate it
      WIDGETS.forEach(function (w) { if (!isOn(w)) { popIn(w); } });   // ghosts fade in; the visible widgets do not move
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
    if (ui.auto) { ui.auto.tabIndex = on ? 0 : -1; }
    syncEnd();                                                     // scroll room only while Adjust is open
    wake();
  }

  function init() {
    ui.btn = $("ia-btn"); ui.reset = $("ia-reset"); ui.auto = $("ia-auto");
    loadAH();
    loadLayout();
    WIDGETS.forEach(build);
    refresh(); applyAll();
    if (ui.btn) { ui.btn.addEventListener("click", function (e) { setAdjust(!adjusting); if (e.detail) { ui.btn.blur(); } }); }
    if (ui.reset) { ui.reset.addEventListener("click", resetAll); }
    bindAH();

    // Esc leaves adjust mode first. On window (capture) so it runs before the idle screen's own Esc handler.
    window.addEventListener("keydown", function (e) {
      if ((e.key === "Escape" || e.keyCode === 27) && adjusting) { e.stopImmediatePropagation(); e.preventDefault(); setAdjust(false); }
    }, true);
    // A click on an empty spot normally leaves the idle screen; not while adjusting.
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
    var rzT = 0;
    window.addEventListener("resize", function () { clearTimeout(rzT); rzT = setTimeout(function () { if (hasItems()) { applyAll(); if (isIdle()) { settle(); } } }, 160); });
    // "Reset everything" in Settings
    var rs = $("settings-reset");
    if (rs) { rs.addEventListener("click", function () { lsDel(LAYOUT_KEY); lsDel(TIMER_KEY); lsDel(CLOCK_KEY); lsDel(AH_KEY); unfreeze(); loadAH(); if (ui.auto) { ui.auto.textContent = ahLabel(); } refresh(); }); }
  }
  if (document.readyState === "loading") { document.addEventListener("DOMContentLoaded", init); } else { init(); }
})();
