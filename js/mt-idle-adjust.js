/* Multi Tool - mt-idle-adjust.js
   Idle screen: resize every widget, show / hide each one without opening Settings, all from the "Adjust widgets"
   button at the bottom right of the idle screen (#ia-btn).

   Widgets: Time in After Effects, Timer, Stopwatch, Alarms, Notes and to-do.
   - Move: while adjusting, drag any box anywhere (it follows the pointer with a little easing, lifts, snaps softly to the
     other boxes and back to its own place, with guide lines). It is stored as an offset from its grid place (relative left / top,
     px), so the grid and every transform stay untouched. Double-click a box = back to its place; arrow keys nudge a focused
     box (Shift = bigger). The old "Hide panels" switch is gone.
   - No stacking: boxes never end up on top of each other. A box that is dropped, resized, reset or pushed onto another one glides
     to the nearest free spot (resolveAll); while dragging, a box over another shows a red outline. Saved layouts are checked
     when the idle screen opens and when the panel is resized.
   - Resize: drag the grip on the bottom right of a widget (arrow keys also work: left / right = one column, up / down =
     height, Shift = bigger steps; double-click the grip = back to the default size). The width snaps to whole columns of a
     12-column grid (span 4 - 12), so the gaps between boxes stay equal; the height is a minimum in px. The text follows
     the width: --wa-s = span / default span (0.68 - 1.3), see css/mt-idle-adjust.css "text follows the box".
   - Show / hide: the eye button. Four widgets use the SAME switches as Settings > Idle screen > Idle screen cards
     (#idle-show-elapsed / -sw / -al / -tabs), so both places always agree. The Timer chip has no Settings switch:
     key mtx.showTimer. A hidden widget stays on screen as a dimmed ghost while adjusting, so it can be switched back on.
   - Done: the button again, or Esc (Esc leaves adjust mode first, a second Esc leaves the idle screen).
   - The adjust button hides itself after ~2.5 s without movement (always, even with the pointer resting on it); a mouse move brings it back.
   - Auto-hide: after a few seconds without movement the all boxes and the adjust button fade away (slide +
     fade, staggered), so the wallpaper shows; any mouse move / touch / key brings them back. Not while adjusting, while the
     pointer is over a box, while typing in a box, or in "Mouse move" exit mode. The first tap on a hidden UI only reveals it.
     The small "Auto-hide" pill (visible while adjusting) cycles off / 3 / 6 / 10 s.
   - Motion: a width change (column snap, arrow keys, reset) animates the box and its neighbours with a FLIP
     (translate + scale, 280 ms, standard easing); a pure height drag follows the pointer directly.
   Keys: mtx.autoHide (seconds, 0 = off, default 6), mtx.wLayout = {"sw":{"span":8,"h":180,"x":24,"y":-12}, ...}, mtx.showTimer.
   Load AFTER js/mt-idle-focus.js. ES5, Chromium-74 safe. */
(function () {
  "use strict";
  var P = "mtx.", LAYOUT_KEY = P + "wLayout", TIMER_KEY = P + "showTimer";
  var COLS = 12, MIN_SPAN = 4, MAX_H = 1200, S_MIN = 0.68, S_MAX = 1.3, MAX_OFF = 4000, SNAP = 8, KEEP = 48;
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

  var AH_KEY = P + "autoHide", AH_OPTS = [0, 3, 6, 10];
  var layout = {}, adjusting = false, drag = null, mv = null, guides = null, ui = {};
  var ahSec = 6, ahTimer = 0, quiet = false, swallowClick = false, lastMove = 0, iaTimer = 0, GAP = 8, IA_MS = 2500;

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
      var xx = parseFloat(s.x), yy = parseFloat(s.y);
      if (isFinite(xx) && Math.abs(xx) >= 1 && Math.abs(xx) <= MAX_OFF) { out.x = Math.round(xx); }
      if (isFinite(yy) && Math.abs(yy) >= 1 && Math.abs(yy) <= MAX_OFF) { out.y = Math.round(yy); }
      if (out.span || out.h || out.x || out.y) { layout[w.id] = out; }
    });
  }
  function saveLayout() {
    var any = false, k; for (k in layout) { if (layout.hasOwnProperty(k)) { any = true; } }
    if (any) { lsSet(LAYOUT_KEY, JSON.stringify(layout)); } else { lsDel(LAYOUT_KEY); }
  }

  // ---------- motion: FLIP for width changes ----------
  function reduceMotion() {
    try {
      if (document.documentElement.getAttribute("data-reduce-motion") === "true") { return true; }
      return !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    } catch (e) { return false; }
  }
  function visibleBoxes() {
    var out = [];
    WIDGETS.forEach(function (w) { var el = $(w.el); if (el && el.offsetParent !== null) { out.push(el); } });
    return out;
  }
  // First (where every box is now, including a running animation) -> mutate -> Last -> play the difference.
  function flip(mutate) {
    var els = visibleBoxes(), first = [], i;
    if (reduceMotion() || !els.length || !els[0].animate) { mutate(); return; }
    for (i = 0; i < els.length; i++) { first.push(els[i].getBoundingClientRect()); }
    for (i = 0; i < els.length; i++) { if (els[i].__waAnim) { try { els[i].__waAnim.cancel(); } catch (e) { } els[i].__waAnim = null; } }
    mutate();
    for (i = 0; i < els.length; i++) {
      var el = els[i], a = first[i], b = el.getBoundingClientRect();
      if (!b.width || !b.height) { continue; }
      var dx = a.left - b.left, dy = a.top - b.top, sx = a.width / b.width, sy = a.height / b.height;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1 && Math.abs(sx - 1) < 0.01 && Math.abs(sy - 1) < 0.01) { continue; }
      var k = pxRatio(el.parentNode) || 1;                       // the cards sit inside a zoomed box: translate is in layout px
      el.__waAnim = el.animate(
        [{ transformOrigin: "0 0", transform: "translate(" + (dx / k) + "px," + (dy / k) + "px) scale(" + sx + "," + sy + ")" },
         { transformOrigin: "0 0", transform: "none" }],
        { duration: 280, easing: "cubic-bezier(0.2, 0, 0, 1)" });
    }
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
    el.style.left = s && s.x ? s.x + "px" : ""; el.style.top = s && s.y ? s.y + "px" : "";     // moved boxes: offset from the grid place
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
    if (!s.span && !s.h && !s.x && !s.y) { delete layout[w.id]; }
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
    var want = clamp(drag.span + cols, MIN_SPAN, COLS), nh = Math.abs(dy) > 4 ? drag.oh + dy : drag.h0;
    if (want !== spanOf(drag.w)) { flip(function () { setSize(drag.w, want, nh, el ? naturalHeight(el) : drag.nat); resolveAll(drag.w); }); }   // a column step glides
    else { setSize(drag.w, want, nh, el ? naturalHeight(el) : drag.nat); }                                                   // height follows the pointer
    readout(drag.w);
  }
  function onUp(e) {
    if (!drag || (drag.id !== undefined && e.pointerId !== drag.id)) { return; }
    var w = drag.w, el = $(w.el);
    try { drag.grip.releasePointerCapture(drag.id); } catch (e2) { }
    if (el) { el.classList.remove("wa-drag"); }
    drag = null; saveLayout(); readout(w); settle(w);
  }
  function onKey(w, e) {
    var key = e.key, step = e.shiftKey ? 40 : 10, dc = 0, dy = 0;
    if (key === "ArrowLeft") { dc = -1; } else if (key === "ArrowRight") { dc = 1; }
    else if (key === "ArrowUp") { dy = -step; } else if (key === "ArrowDown") { dy = step; } else { return; }
    var el = $(w.el); if (!el) { return; }
    e.preventDefault(); e.stopPropagation();
    var h0 = layout[w.id] && layout[w.id].h ? layout[w.id].h : 0;
    flip(function () { setSize(w, spanOf(w) + dc, dy ? el.offsetHeight + dy : h0, naturalHeight(el)); resolveAll(w); });
    saveLayout();
  }
  function resetOne(w) {      // the grip: size only
    flip(function () { var s = layout[w.id]; if (s) { delete s.span; delete s.h; if (!s.x && !s.y) { delete layout[w.id]; } } applySize(w); resolveAll(w); });
    saveLayout(); readout(w);
  }
  function resetPos(w) {      // double-click on the box: position only
    flip(function () { var s = layout[w.id]; if (s) { delete s.x; delete s.y; if (!s.span && !s.h) { delete layout[w.id]; } } applySize(w); resolveAll(); });
    saveLayout();
  }
  function resetAll() { flip(function () { layout = {}; applyAll(); }); saveLayout(); }

  // ---------- no stacking ----------
  function hits(R, others) {
    var i, o;
    for (i = 0; i < others.length; i++) {
      o = others[i];
      if (R.left < o.right - 1 && R.right > o.left + 1 && R.top < o.bottom - 1 && R.bottom > o.top + 1) { return true; }
    }
    return false;
  }
  function otherRects(el) {
    var out = [];
    visibleBoxes().forEach(function (o) { if (o !== el) { out.push(o.getBoundingClientRect()); } });
    return out;
  }
  // Moves box w (its x / y offset) to the nearest spot where it touches no other box. Returns true if it had to move.
  function resolveOne(w) {
    var el = $(w.el); if (!el || el.offsetParent === null) { return false; }
    var r = el.getBoundingClientRect(), k = pxRatio(el.parentNode) || 1, others = otherRects(el), vw = window.innerWidth;
    function box(l, t) { return { left: l, top: t, right: l + r.width, bottom: t + r.height }; }
    if (!hits(box(r.left, r.top), others)) { return false; }
    var xs = [r.left], ys = [r.top], i, a, b, best = null, bl, bt, d, o;
    for (i = 0; i < others.length; i++) {
      o = others[i];
      xs.push(o.left - r.width - GAP, o.right + GAP); ys.push(o.top - r.height - GAP, o.bottom + GAP);
    }
    for (a = 0; a < xs.length; a++) {
      for (b = 0; b < ys.length; b++) {
        if (xs[a] < 4 || xs[a] + r.width > vw - 4 || ys[b] < 4) { continue; }          // stay inside the panel
        if (hits(box(xs[a], ys[b]), others)) { continue; }
        d = Math.abs(xs[a] - r.left) + Math.abs(ys[b] - r.top);
        if (!best || d < best.d) { best = { d: d, l: xs[a], t: ys[b] }; }
      }
    }
    if (!best) {                                       // crowded: put it under everything
      bt = r.top; for (i = 0; i < others.length; i++) { bt = Math.max(bt, others[i].bottom + GAP); }
      best = { l: clamp(r.left, 4, Math.max(4, vw - r.width - 4)), t: bt };
    }
    var st = layout[w.id] || (layout[w.id] = {});
    var nx = clamp(Math.round((st.x || 0) + (best.l - r.left) / k), -MAX_OFF, MAX_OFF), ny = clamp(Math.round((st.y || 0) + (best.t - r.top) / k), -MAX_OFF, MAX_OFF);
    if (Math.abs(nx) < 2) { nx = 0; } if (Math.abs(ny) < 2) { ny = 0; }
    if (nx) { st.x = nx; } else { delete st.x; }
    if (ny) { st.y = ny; } else { delete st.y; }
    if (!st.span && !st.h && !st.x && !st.y) { delete layout[w.id]; }
    applySize(w);
    return true;
  }
  // `first` (optional) is the box the user just touched: if it was moved it is resolved first; then every other moved box, until nothing overlaps.
  function resolveAll(first) {
    var pass, changed, i, w, list;
    for (pass = 0; pass < 3; pass++) {
      changed = false;
      list = first ? [first].concat(WIDGETS.filter(function (x) { return x !== first; })) : WIDGETS;
      for (i = 0; i < list.length; i++) {
        w = list[i];
        if (!(layout[w.id] && (layout[w.id].x || layout[w.id].y))) { continue; }   // a box in its grid place never moves aside: the moved box does
        if (resolveOne(w)) { changed = true; }
      }
      if (!changed) { break; }
    }
    return changed;
  }
  function settle(first) { flip(function () { resolveAll(first); }); saveLayout(); }

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
  // the nearest alignment within SNAP screen px: edges / centre of the moving box against the others and against its own place
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
  function moveStep() {
    if (!mv) { return; }
    var el = $(mv.w.el), ex = mv.tx - mv.cx, ey = mv.ty - mv.cy;
    if (el) {
      if (Math.abs(ex) < 0.2 && Math.abs(ey) < 0.2) { mv.cx = mv.tx; mv.cy = mv.ty; } else { mv.cx += ex * 0.36; mv.cy += ey * 0.36; }   // easing toward the pointer
      el.style.left = Math.round(mv.cx * 10) / 10 + "px"; el.style.top = Math.round(mv.cy * 10) / 10 + "px";
    }
    if (mv.cx !== mv.tx || mv.cy !== mv.ty) { mv.raf = requestAnimationFrame(moveStep); }
    else { mv.raf = 0; if (mv.released) { finishMove(); } }
  }
  function startMove(w, e) {
    if (e.button !== undefined && e.button !== 0) { return; }
    var el = $(w.el); if (!el) { return; }
    e.preventDefault(); e.stopPropagation();
    var s = layout[w.id] || {}, k = pxRatio(el.parentNode), r = el.getBoundingClientRect(), others = [];
    visibleBoxes().forEach(function (o) { if (o !== el) { others.push(o.getBoundingClientRect()); } });
    mv = {
      w: w, id: e.pointerId, sx: e.clientX, sy: e.clientY, x0: s.x || 0, y0: s.y || 0, tx: s.x || 0, ty: s.y || 0, cx: s.x || 0, cy: s.y || 0,
      k: k, r: r, others: others, ov: e.currentTarget, raf: 0, released: false
    };
    el.classList.add("wa-drag", "wa-lift");
    try { mv.ov.setPointerCapture(e.pointerId); } catch (e1) { }
    readout(w);
  }
  function onMoveMove(e) {
    if (!mv || mv.released || (mv.id !== undefined && e.pointerId !== mv.id)) { return; }
    var k = mv.k, r = mv.r, dx = e.clientX - mv.sx, dy = e.clientY - mv.sy;           // screen px
    var left = r.left + dx, top = r.top + dy, w = r.width, h = r.height, gx = null, gy = null, i, bx, by, xs = [], ys = [];
    // keep a part of the box on screen
    left = clamp(left, KEEP - w, window.innerWidth - KEEP); top = clamp(top, KEEP - h, window.innerHeight - KEEP);
    // soft snap: its own place (offset 0), then the other boxes
    xs.push(r.left - mv.x0 * k); ys.push(r.top - mv.y0 * k);
    xs.push(r.left - mv.x0 * k + w); ys.push(r.top - mv.y0 * k + h);
    for (i = 0; i < mv.others.length; i++) {
      xs.push(mv.others[i].left, mv.others[i].left + mv.others[i].width / 2, mv.others[i].left + mv.others[i].width);
      ys.push(mv.others[i].top, mv.others[i].top + mv.others[i].height / 2, mv.others[i].top + mv.others[i].height);
    }
    bx = snapAxis(left, w, xs); by = snapAxis(top, h, ys);
    if (bx) { left += bx.d; gx = bx.at; }
    if (by) { top += by.d; gy = by.at; }
    showGuides(gx, gy);
    var elm = $(mv.w.el);
    if (elm) { elm.classList.toggle("wa-clash", hits({ left: left, top: top, right: left + w, bottom: top + h }, mv.others)); }   // red outline: it will be moved aside
    mv.tx = mv.x0 + (left - r.left) / k; mv.ty = mv.y0 + (top - r.top) / k;
    if (!mv.raf) { mv.raf = requestAnimationFrame(moveStep); }
  }
  function onMoveUp(e) {
    if (!mv || (mv.id !== undefined && e.pointerId !== mv.id)) { return; }
    try { mv.ov.releasePointerCapture(mv.id); } catch (e2) { }
    showGuides(null, null);
    mv.released = true;
    if (Math.abs(mv.tx) < 1) { mv.tx = 0; } if (Math.abs(mv.ty) < 1) { mv.ty = 0; }
    if (!mv.raf) { mv.raf = requestAnimationFrame(moveStep); }     // finish the glide, then settle (finishMove)
  }
  function finishMove() {
    if (!mv) { return; }
    var w = mv.w, el = $(w.el), x = Math.round(mv.tx), y = Math.round(mv.ty), s = layout[w.id] || (layout[w.id] = {});
    if (x) { s.x = x; } else { delete s.x; }
    if (y) { s.y = y; } else { delete s.y; }
    if (!s.span && !s.h && !s.x && !s.y) { delete layout[w.id]; }
    if (el) { el.classList.remove("wa-drag", "wa-lift", "wa-clash"); }
    mv = null; applySize(w); saveLayout(); readout(w); settle(w);      // dropped on another box? it glides to the nearest free spot
  }
  function onMoveKey(w, e) {
    var key = e.key, step = e.shiftKey ? 40 : 10, dx = 0, dy = 0;
    if (key === "ArrowLeft") { dx = -step; } else if (key === "ArrowRight") { dx = step; }
    else if (key === "ArrowUp") { dy = -step; } else if (key === "ArrowDown") { dy = step; } else { return; }
    e.preventDefault(); e.stopPropagation();
    flip(function () {
      var s = layout[w.id] || (layout[w.id] = {}), x = clamp((s.x || 0) + dx, -MAX_OFF, MAX_OFF), y = clamp((s.y || 0) + dy, -MAX_OFF, MAX_OFF);
      if (x) { s.x = x; } else { delete s.x; }
      if (y) { s.y = y; } else { delete s.y; }
      if (!s.span && !s.h && !s.x && !s.y) { delete layout[w.id]; }
      applySize(w); resolveAll(w);
    });
    saveLayout();
  }

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
    var ov = document.createElement("div"); ov.className = "wa-move"; ov.tabIndex = 0; ov.setAttribute("role", "group");
    ov.setAttribute("aria-label", "Move " + w.noun + ". Arrow keys move it, double-click puts it back.");
    ov.setAttribute("title", "Drag to move. Double-click to put it back.");
    el.appendChild(ov); el.appendChild(bar);
    ov.addEventListener("pointerdown", function (e) { startMove(w, e); });
    ov.addEventListener("pointermove", onMoveMove);
    ov.addEventListener("pointerup", onMoveUp);
    ov.addEventListener("pointercancel", onMoveUp);
    ov.addEventListener("keydown", function (e) { onMoveKey(w, e); });
    ov.addEventListener("dblclick", function (e) { e.stopPropagation(); resetPos(w); });
    eye.addEventListener("click", function (e) { e.stopPropagation(); setOn(w, !isOn(w)); });
    grip.addEventListener("pointerdown", function (e) { onDown(w, e); });
    grip.addEventListener("pointermove", onMove);
    grip.addEventListener("pointerup", onUp);
    grip.addEventListener("pointercancel", onUp);
    grip.addEventListener("keydown", function (e) { onKey(w, e); });
    grip.addEventListener("dblclick", function (e) { e.stopPropagation(); resetOne(w); });
    if (w.box && $(w.box)) { $(w.box).addEventListener("change", refresh); }   // Settings window flips the same switch
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
    // a finished timer brings the UI back
    var tm = $("idle-timer");
    if (tm) {
      try { new MutationObserver(function () { if (isIdle() && tm.classList.contains("is-done")) { wake(); } }).observe(tm, { attributes: true, attributeFilter: ["class"] }); } catch (e) { }
    }
    if (ui.auto) { ui.auto.textContent = ahLabel(); ui.auto.addEventListener("click", function () { cycleAH(); wake(); }); }
  }

  // ---------- adjust mode ----------
  function setAdjust(on) {
    on = !!on && isIdle();
    if (on === adjusting) { return; }
    adjusting = on;
    setClass("is-adjusting", on);
    if (ui.btn) {
      ui.btn.setAttribute("aria-pressed", on ? "true" : "false");
      ui.btn.setAttribute("aria-label", on ? "Done adjusting" : "Adjust widgets");
      ui.btn.setAttribute("title", on ? "Done" : "Adjust widgets");
    }
    if (ui.reset) { ui.reset.tabIndex = on ? 0 : -1; }
    if (ui.auto) { ui.auto.tabIndex = on ? 0 : -1; }
    wake();
    if (on) {
      refresh();
    } else if (mv) {
      mv.tx = mv.cx; mv.ty = mv.cy; mv.released = true; showGuides(null, null); finishMove();
    } else if (drag) {
      var el = $(drag.w.el); if (el) { el.classList.remove("wa-drag"); }
      drag = null; saveLayout();
      WIDGETS.forEach(readout);
    }
  }

  function init() {
    ui.btn = $("ia-btn"); ui.reset = $("ia-reset"); ui.auto = $("ia-auto");
    loadAH();
    loadLayout();
    WIDGETS.forEach(build);
    applyAll(); refresh();
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
        var t = e.target, sel = ".idle-card, .idle-timer, .idle-elapsed, .idle-message, button, input, textarea, select, a", path = e.composedPath ? e.composedPath() : [], i;
        if (t && t.closest && t.closest(sel)) { return; }
        for (i = 0; i < path.length; i++) { if (path[i] && path[i].matches && path[i].matches(sel)) { return; } }
        e.stopPropagation();
      }, true);
    }
    // The idle screen opening / closing. Only a real change of body.is-idle is handled: this observer sees every class write on
    // <body>, including our own (is-adjusting, is-quiet, is-ia-quiet), so reacting to each of them would loop forever.
    var wasIdle = isIdle();
    try {
      new MutationObserver(function () {
        var now = isIdle();
        if (now === wasIdle) { return; }
        wasIdle = now;
        if (now) {
          ahArm(); iaWake();
          requestAnimationFrame(function () { if (isIdle()) { resolveAll(); saveLayout(); } });   // a saved layout never opens stacked
        } else {
          if (adjusting) { setAdjust(false); }
          if (ahTimer) { clearTimeout(ahTimer); ahTimer = 0; }
          if (iaTimer) { clearTimeout(iaTimer); iaTimer = 0; }
          setClass("is-ia-quiet", false); setQuiet(false); swallowClick = false;
        }
      }).observe(document.body, { attributes: true, attributeFilter: ["class"] });
    } catch (e2) { }
    // never stacked: check a saved layout when the idle screen opens, and again when the panel is resized
    var rzT = 0;
    window.addEventListener("resize", function () { if (!isIdle()) { return; } clearTimeout(rzT); rzT = setTimeout(function () { settle(); }, 160); });
    // "Reset everything" in Settings
    var rs = $("settings-reset");
    if (rs) { rs.addEventListener("click", function () { lsDel(LAYOUT_KEY); lsDel(TIMER_KEY); lsDel(AH_KEY); layout = {}; loadAH(); if (ui.auto) { ui.auto.textContent = ahLabel(); } applyAll(); refresh(); }); }
  }
  if (document.readyState === "loading") { document.addEventListener("DOMContentLoaded", init); } else { init(); }
})();
