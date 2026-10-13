/* Multi Tool - mt-island.js (v3)
   "Dynamic island" for the Timer / Stopwatch. A black capsule at the top centre of the panel.
   COLLAPSED  one icon + the live digits of ONE tool (centred). The icon is a progress ring (Timer) or a breathing dot (Stopwatch).
   EXPANDED   a click on the capsule grows it (width, height and corner radius morph together) into a small panel:
              - ONE switch button (press = Timer <-> Stopwatch, the labels slide) picks which tool is shown, in the panel and in the collapsed capsule afterwards
              - Timer     not started: hours / minutes steppers (click, hold, wheel or type) + presets + Start;  started: countdown + ring + pause / reset
              - Stopwatch big digits + start / pause / reset
              Esc, a click outside or the Done press collapses it again.
   Shown while a timer / stopwatch is active AND (the panel is not in idle mode OR the idle UI is auto-hidden = body.is-quiet). While it is expanded it stays on screen.
   Fed by js/mt-idle-focus.js:
     MTIsland.update({ timer: { active, name, text, frac, done, paused, running, h, m }, sw: { active, name, text, running, paused } })
   Callbacks set by js/mt-idle-focus.js: onToggle("timer" | "sw"), onReset("timer" | "sw"), onSetTime(h, m).
   Digits use MTRoll (js/mt-idle-roll.js) when it is loaded. Styles: css/mt-island.css. Chromium-74 safe (no flex gap, no inset). */
(function () {
  "use strict";
  var PAD = 16, COL_H = 36, X_MAX = 288, SEL_KEY = "mtx.islandSel";
  var PLAY = '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z" fill="currentColor"/></svg>';
  var PAUSE = '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1.2" fill="currentColor"/><rect x="14" y="5" width="4" height="14" rx="1.2" fill="currentColor"/></svg>';
  var RESET = '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="M5 12a7 7 0 1 0 2.1-5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><path d="M5 4.5v4.2h4.2" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  var UP = '<svg viewBox="0 0 24 24" width="12" height="12" aria-hidden="true"><path d="M6 14.5l6-6 6 6" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  var DOWN = '<svg viewBox="0 0 24 24" width="12" height="12" aria-hidden="true"><path d="M6 9.5l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  var root, cEl, xEl, cIco, cTime, sw, tabT, tabS, vT, vS, tSet, tRun, hIn, mIn, tGo, tBig, tRing, tRst, tPlay, sBig, sPlay, sRst, tName, pager;
  var data = { timer: null, sw: null }, shown = false, open = false, wasDone = false, sel = "timer", view = "timer", lastVis = false;
  var cfg = { h: 1, m: 0 };

  function $(id) { return document.getElementById(id); }
  function body() { return document.body; }
  function idle() { return body().classList.contains("is-idle"); }
  function quiet() { return body().classList.contains("is-quiet"); }
  function reduce() { return document.documentElement.getAttribute("data-reduce-motion") === "true"; }
  function el(tag, cls, html) { var e = document.createElement(tag); if (cls) { e.className = cls; } if (html) { e.innerHTML = html; } return e; }
  function btn(cls, html, label) { var b = el("button", cls, html); b.type = "button"; b.setAttribute("aria-label", label); return b; }
  function pad2(n) { return n < 10 ? "0" + n : String(n); }
  function clampN(v, lo, hi) { v = parseInt(v, 10); if (!isFinite(v)) { v = lo; } return Math.max(lo, Math.min(hi, v)); }
  function setTxt(node, t) { if (node.textContent !== t) { node.textContent = t; } }
  function digits(node, t) { if (window.MTRoll) { window.MTRoll.set(node, t, "fast"); } else { setTxt(node, t); } }
  function cb(name, a, b) { var f = window.MTIsland && window.MTIsland[name]; if (f) { f(a, b); } }

  function build() {
    if (root) { return; }
    root = el("div", "mt-island"); root.id = "mt-island"; root.setAttribute("role", "button"); root.tabIndex = 0; root.setAttribute("aria-expanded", "false"); root.setAttribute("aria-label", "Timer and stopwatch");

    // ---- collapsed: ONE icon + digits ----
    cEl = el("div", "mi-c");
    cIco = el("span", "mi-ico"); cTime = el("span", "mi-time");
    cEl.appendChild(cIco); cEl.appendChild(cTime);

    // ---- expanded ----
    xEl = el("div", "mi-x");
    var SWAP = '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="M7 4L3.5 7.5 7 11M3.5 7.5H17M17 13l3.5 3.5L17 20M20.5 16.5H7" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    sw = btn("mi-swap", '<span class="mi-swwin"><span class="mi-swtrack">' +
      '<span class="mi-swrow"><span class="mi-tico mi-tico-t"></span><span class="mi-tname">Timer</span><i class="mi-live"></i></span>' +
      '<span class="mi-swrow"><span class="mi-tico mi-tico-s"></span><span class="mi-tname">Stopwatch</span><i class="mi-live"></i></span>' +
      '</span></span><span class="mi-swarrows">' + SWAP + '</span>', "Switch between timer and stopwatch");
    var rows = sw.querySelectorAll(".mi-swrow"); tabT = rows[0]; tabS = rows[1];
    var views = el("div", "mi-views");

    // timer view: setter + running state
    vT = el("div", "mi-view mi-view-t");
    tSet = el("div", "mi-set");
    var row = el("div", "mi-steps");
    function stepper(unit, max) {
      var col = el("div", "mi-step"), up = btn("mi-st", UP, "More " + unit), inp = el("input", "mi-num"), dn = btn("mi-st", DOWN, "Less " + unit), u = el("span", "mi-unit"); u.textContent = unit;
      inp.type = "text"; inp.setAttribute("inputmode", "numeric"); inp.maxLength = 2; inp.setAttribute("aria-label", unit);
      col.appendChild(up); col.appendChild(inp); col.appendChild(dn); col.appendChild(u);
      hold(up, function () { bump(unit, +1, max); }); hold(dn, function () { bump(unit, -1, max); });
      col.addEventListener("wheel", function (e) { e.preventDefault(); bump(unit, e.deltaY < 0 ? 1 : -1, max); }, { passive: false });
      inp.addEventListener("focus", function () { try { inp.select(); } catch (e) { } });
      inp.addEventListener("input", function () { var d = inp.value.replace(/[^0-9]/g, "").slice(0, 2); if (d !== inp.value) { inp.value = d; } });
      inp.addEventListener("change", function () { setUnit(unit, clampN(inp.value, 0, max)); });
      inp.addEventListener("keydown", function (e) { e.stopPropagation(); if (e.key === "Enter") { inp.blur(); } else if (e.key === "ArrowUp") { e.preventDefault(); bump(unit, 1, max); } else if (e.key === "ArrowDown") { e.preventDefault(); bump(unit, -1, max); } else if (e.key === "Escape") { inp.blur(); setOpen(false); } });
      return { col: col, inp: inp };
    }
    var sh = stepper("hours", 23), sm = stepper("minutes", 59);
    hIn = sh.inp; mIn = sm.inp;
    var colon = el("span", "mi-colon"); colon.textContent = ":";
    row.appendChild(sh.col); row.appendChild(colon); row.appendChild(sm.col);
    var pre = el("div", "mi-pre");
    [[0, 5], [0, 10], [0, 25], [1, 0]].forEach(function (p) {
      var b = btn("mi-chip", p[0] ? p[0] + " h" : p[1] + " min", "Set " + (p[0] ? p[0] + " hour" : p[1] + " minutes"));
      b.addEventListener("click", function () { setTime(p[0], p[1]); }); pre.appendChild(b);
    });
    tGo = btn("mi-go mi-go-t", PLAY + "<span>Start</span>", "Start timer");
    tGo.addEventListener("click", function () { if (cfg.h * 60 + cfg.m > 0) { cb("onToggle", "timer"); } else { nudge(tSet); } });
    tSet.appendChild(row); tSet.appendChild(pre); tSet.appendChild(tGo);

    tRun = el("div", "mi-run");
    tBig = el("div", "mi-big"); tName = el("div", "mi-sub");
    tRing = el("div", "mi-bar"); tRing.appendChild(el("i", "mi-fill"));
    var rwrap = el("div", "mi-rwrap"); rwrap.appendChild(tBig); rwrap.appendChild(tRing);
    var rb = el("div", "mi-btns");
    tRst = btn("mi-round mi-round-s", RESET, "Reset timer"); tPlay = btn("mi-go mi-go-t", PAUSE + "<span>Pause</span>", "Pause timer");
    tRst.addEventListener("click", function () { cb("onReset", "timer"); }); tPlay.addEventListener("click", function () { cb("onToggle", "timer"); });
    rb.appendChild(tRst); rb.appendChild(tPlay);
    tRun.appendChild(rwrap); tRun.appendChild(tName); tRun.appendChild(rb);
    vT.appendChild(tSet); vT.appendChild(tRun);

    // stopwatch view
    vS = el("div", "mi-view mi-view-s");
    var swrap = el("div", "mi-run");
    sBig = el("div", "mi-big mi-big-s");
    var sb = el("div", "mi-btns");
    sRst = btn("mi-round mi-round-s", RESET, "Reset stopwatch"); sPlay = btn("mi-go mi-go-s", PLAY + "<span>Start</span>", "Start stopwatch");
    sRst.addEventListener("click", function () { cb("onReset", "sw"); }); sPlay.addEventListener("click", function () { cb("onToggle", "sw"); });
    sb.appendChild(sRst); sb.appendChild(sPlay);
    swrap.appendChild(sBig); swrap.appendChild(sb); vS.appendChild(swrap);

    views.appendChild(vT); views.appendChild(vS);
    xEl.appendChild(sw); xEl.appendChild(views);

    root.appendChild(cEl); root.appendChild(xEl); body().appendChild(root);

    sw.addEventListener("click", function () { pick(view === "timer" ? "sw" : "timer"); });
    root.addEventListener("click", function (e) { if (!open) { setOpen(true); } e.stopPropagation(); });
    root.addEventListener("keydown", function (e) { if (!open && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); setOpen(true); } });
    document.addEventListener("pointerdown", function (e) { if (open && !root.contains(e.target)) { setOpen(false); } }, true);
    window.addEventListener("keydown", function (e) {
      if (open && (e.key === "Escape" || e.keyCode === 27)) { e.stopImmediatePropagation(); e.preventDefault(); setOpen(false); }
    }, true);
    try { var s = localStorage.getItem(SEL_KEY); if (s === "sw" || s === "timer") { sel = s; } } catch (e0) { }
    view = sel;
  }

  // press and hold: repeat (starts after 380 ms, then speeds up)
  function hold(b, fn) {
    var t = 0, iv = 0;
    function stop() { clearTimeout(t); clearInterval(iv); t = 0; iv = 0; }
    b.addEventListener("pointerdown", function (e) { if (e.button) { return; } fn(); stop(); t = setTimeout(function () { iv = setInterval(fn, 70); }, 380); });
    ["pointerup", "pointerleave", "pointercancel", "blur"].forEach(function (n) { b.addEventListener(n, stop); });
    b.addEventListener("click", function (e) { if (e.detail === 0) { fn(); } });        // keyboard
  }
  function nudge(node) {
    if (!node.animate || reduce()) { return; }
    try { node.animate([{ transform: "translateX(0)" }, { transform: "translateX(-5px)" }, { transform: "translateX(5px)" }, { transform: "translateX(-3px)" }, { transform: "translateX(0)" }], { duration: 320, easing: "ease-out" }); } catch (e) { }
  }
  function setUnit(unit, v) { if (unit === "hours") { setTime(v, cfg.m); } else { setTime(cfg.h, v); } }
  function bump(unit, d, max) {
    var cur = unit === "hours" ? cfg.h : cfg.m, v = cur + d;
    if (v > max) { v = 0; } if (v < 0) { v = max; }
    setUnit(unit, v);
  }
  function setTime(h, m) {
    cfg.h = clampN(h, 0, 23); cfg.m = clampN(m, 0, 59);
    cb("onSetTime", cfg.h, cfg.m);
    paintSet();
  }
  function paintSet() {
    if (document.activeElement !== hIn) { hIn.value = pad2(cfg.h); }
    if (document.activeElement !== mIn) { mIn.value = pad2(cfg.m); }
    tGo.disabled = false;
    tGo.classList.toggle("is-empty", cfg.h * 60 + cfg.m <= 0);
  }

  // ---------- which tool ----------
  function activeOf(k) { return !!(data[k] && data[k].active); }
  function effective() {                                      // the tool the collapsed capsule shows
    if (activeOf(sel)) { return sel; }
    var o = sel === "timer" ? "sw" : "timer";
    return activeOf(o) ? o : sel;
  }
  function pick(k) {
    if (view === k) { return; }
    sel = k; try { localStorage.setItem(SEL_KEY, k); } catch (e) { }
    root.setAttribute("data-dir", k === "sw" ? "next" : "prev");
    view = k; paint(true);
  }

  // ---------- geometry ----------
  function collapsedSize() {
    var w = cEl.offsetWidth + 2 * PAD;
    return { w: Math.max(96, w), h: COL_H };
  }
  function expandedSize() {
    var w = Math.min(X_MAX, Math.max(220, window.innerWidth - 16));
    xEl.style.width = w + "px";
    return { w: w, h: xEl.offsetHeight };
  }
  var sizeKey = "";
  function applySize(force) {
    if (!root) { return; }
    var key = open ? ("x|" + view + "|" + (tSet.hidden ? 1 : 0) + "|" + window.innerWidth) : ("c|" + root.getAttribute("data-tool") + "|" + cTime.textContent.length);
    if (!force && key === sizeKey) { return; }                  // no layout read when nothing changed (the 1 s tick)
    sizeKey = key;
    var s = open ? expandedSize() : collapsedSize();
    root.style.width = s.w + "px"; root.style.height = s.h + "px";
    root.style.borderRadius = (open ? 26 : Math.round(s.h / 2)) + "px";
  }

  function setOpen(o) {
    if (o === open) { return; }
    build(); open = o;
    root.classList.toggle("is-open", o); root.setAttribute("aria-expanded", o ? "true" : "false");
    if (o) { view = effective(); sel = view; }
    paint(false);
    if (!o) {
      try { if (root.contains(document.activeElement)) { document.activeElement.blur(); } } catch (e) { }
      holdUntil = Date.now() + 460; setTimeout(function () { paint(false); }, 480);
    }
  }

  // widgets that are live fly toward the island when the idle UI hides: where is the island centre relative to each widget centre?
  function aim() {
    var ids = [["idle-timer", data.timer], ["idle-sw", data.sw]], i, e, r, cx = window.innerWidth / 2, cy = 8 + 18;
    for (i = 0; i < ids.length; i++) {
      e = $(ids[i][0]); if (!e) { continue; }
      if (!ids[i][1] || !ids[i][1].active || !e.offsetParent) { continue; }
      r = e.getBoundingClientRect();
      e.style.setProperty("--mi-dx", Math.round(cx - (r.left + r.width / 2)) + "px");
      e.style.setProperty("--mi-dy", Math.round(cy - (r.top + r.height / 2)) + "px");
    }
  }
  var holdUntil = 0;                                          // stay on screen until the collapse animation has finished
  function visibleWanted() { return open || Date.now() < holdUntil || ((activeOf("timer") || activeOf("sw")) && (!idle() || quiet())); }

  // ---------- paint ----------
  function stateBtn(b, running, label, running_txt, idle_txt) {
    var ic = running ? "pause" : "play";
    if (b._ic !== ic) { b.innerHTML = (running ? PAUSE : PLAY) + "<span>" + (running ? "Pause" : idle_txt) + "</span>"; b._ic = ic; b._tx = running ? "Pause" : idle_txt; }
    else if (!running && b._tx !== idle_txt) { b.lastChild.textContent = idle_txt; b._tx = idle_txt; }
    b.setAttribute("aria-label", label);
  }

  function paint(viewChanged) {
    build();
    var t = data.timer, s = data.sw, want = visibleWanted(), was = shown, eff = effective();
    if (t && typeof t.h === "number" && document.activeElement !== hIn && document.activeElement !== mIn) { cfg.h = t.h; cfg.m = t.m; }

    if (!open) {                                                // collapsed: ONE icon + digits (the hidden panel is not touched every second)
      root.setAttribute("data-tool", eff);
      cEl.classList.toggle("is-t", eff === "timer"); cEl.classList.toggle("is-s", eff === "sw");
      var cdd = eff === "timer" ? t : s;
      if (cdd) {
        digits(cTime, cdd.text);
        if (eff === "timer") { cIco.style.setProperty("--p", String(Math.max(0, Math.min(1, cdd.frac || 0)) * 360) + "deg"); }
        cEl.classList.toggle("is-done", eff === "timer" && !!cdd.done);
        cEl.classList.toggle("is-paused", eff === "timer" ? !!cdd.paused : !!(s && s.paused));
        cEl.classList.toggle("is-running", eff === "timer" ? !!cdd.running : !!(s && s.running));
      }
    } else {
      // expanded: switch (one button, the rows slide)
      tabT.classList.toggle("is-live", !!(t && t.active)); tabS.classList.toggle("is-live", !!(s && s.active));
      sw.setAttribute("data-on", view);
      vT.hidden = view !== "timer"; vS.hidden = view !== "sw";
      if (viewChanged) { var v = view === "timer" ? vT : vS; v.classList.remove("is-in"); void v.offsetWidth; v.classList.add("is-in"); }

      if (view === "timer" && t) {
        var run = !!t.active;
        tSet.hidden = run; tRun.hidden = !run;
        if (!run) { paintSet(); stateBtn(tGo, false, "Start timer", "Pause", "Start"); }
        else {
          digits(tBig, t.text);
          tRing.style.setProperty("--pc", (Math.max(0, Math.min(1, t.frac || 0)) * 100).toFixed(1) + "%");
          setTxt(tName, t.done ? "Time is up" : (t.paused ? "Paused" : "Counting down"));
          tRun.classList.toggle("is-done", !!t.done); tRun.classList.toggle("is-paused", !!t.paused);
          stateBtn(tPlay, !!t.running, t.running ? "Pause timer" : (t.paused ? "Resume timer" : "Start timer again"), "Pause", t.paused ? "Resume" : "Start again");
        }
      }
      if (view === "sw" && s) {
        digits(sBig, s.text);
        sBig.classList.toggle("is-paused", !!s.paused);
        stateBtn(sPlay, !!s.running, s.running ? "Pause stopwatch" : (s.paused ? "Resume stopwatch" : "Start stopwatch"), "Pause", s.paused ? "Resume" : "Start");
        sRst.disabled = !s.active;
      }
    }

    applySize();
    if (want !== shown) { shown = want; root.classList.toggle("is-on", want); }
    var done = !!(t && t.done);
    if (done && !wasDone && want && !open && root.animate && !reduce()) {            // time is up: one jelly pulse
      try { root.animate([{ transform: "scale(1)" }, { transform: "scale(1.09,1.12)", offset: 0.35 }, { transform: "scale(0.98,0.97)", offset: 0.65 }, { transform: "scale(1)" }], { duration: 620, easing: "cubic-bezier(0.34, 1.3, 0.64, 1)" }); } catch (e) { }
    }
    wasDone = done;
    return was !== shown;
  }

  function update(d) {
    data = { timer: d && d.timer || null, sw: d && d.sw || null };
    paint(false);
  }

  function init() {
    build();
    try {
      new MutationObserver(function () { aim(); paint(false); }).observe(body(), { attributes: true, attributeFilter: ["class"] });   // idle / quiet changed
    } catch (e) { }
    window.addEventListener("resize", function () { aim(); applySize(true); });
    paint(false);
  }

  window.MTIsland = { update: update, aim: aim, onToggle: null, onReset: null, onSetTime: null };
  if (document.readyState === "loading") { document.addEventListener("DOMContentLoaded", init); } else { init(); }
})();
