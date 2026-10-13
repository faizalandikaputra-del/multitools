/* Multi Tool - mt-island.js (v3)
   "Dynamic island": a small black capsule at the top centre of the panel.
   Closed  = ONE icon (timer ring or stopwatch, whichever is selected), centred exactly.
   Click   = the capsule grows into a card: Timer / Stopwatch switch, big digits, Start / Pause / Reset and, for the Timer, H : M : S steppers.
   Click outside or Esc = it shrinks back. Motion + sizes: css/mt-island.css.
   Visible: always while the panel is not in idle mode; in idle mode only while the idle UI is auto-hidden (body.is-quiet) AND a timer / stopwatch is live.
   Fed by js/mt-idle-focus.js:
     MTIsland.update({ timer: { state: "idle|running|paused|done", text, frac, cfg: { h, m, s } }, sw: { state: "idle|running|paused", text, hidden } })
   Stopwatch "hidden" (the same swHidden switch as the idle screen): the digits are masked in the card until the pointer is over the island, then they show at once.
   MTIsland.notice(obj | null): update card (see setNotice). Timer / Stopwatch use ONE switch; the feature changes only when it is clicked.
   On / off: MTIsland.setEnabled(bool), key mtx.island ("0" = off). Off hides the capsule and the Curve tab goes back to its original layout (no top strip).
   Hooks set by js/mt-idle-focus.js:
     MTIsland.onToggle("timer" | "sw")      start / pause / resume
     MTIsland.onReset("timer" | "sw")       reset
     MTIsland.onSwHide()                    toggle hide / show of the stopwatch digits
     MTIsland.onSetTimer(h, m, s)           new timer length (only called while the timer is idle)
   When the idle UI auto-hides, the live widgets fly up into the island (--mi-dx / --mi-dy) and back out. Digits use MTRoll when loaded.
   Chromium-74 safe (CEP), ES5. */
(function () {
  "use strict";
  var TOP = 6, CW = 56, CH = 28, EW_MAX = 272, KEY = "mtx.islandMode", KEY_ON = "mtx.island", ARC = 56.55;
  var LIM = { h: 23, m: 59, s: 59 }, UNITS = ["h", "m", "s"], UNIT_NAME = { h: "hr", m: "min", s: "sec" }, UNIT_LONG = { h: "Hours", m: "Minutes", s: "Seconds" };
  var root, pill, panel, swBtn, lab = {}, gT, gS, gU, arcU, arc, handS, paneT, paneS, paneU, uiU = {}, notice = null, notesOpen = false, noticeTtl = 0, autoTimer = 0, leaving = 0, ui = { t: {}, s: {} }, nums = {};
  var data = { timer: null, sw: null }, mode = "timer", open = false, shown = false, wasDone = false, viewKey = "", prevT = false, prevS = false, hold = 0, holdIv = 0, hov = false, lock = false, flip = false, lastMask = false, MASK = "\u2022\u2022:\u2022\u2022:\u2022\u2022";

  var I_SWAP = '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 4L3.5 7.5 7 11M3.5 7.5h13M17 13l3.5 3.5L17 20M20.5 16.5h-13"/></svg>';
  var I_CHEV = '<svg viewBox="0 0 24 24" width="12" height="12" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>';
  var I_DOWN = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v10M7.5 11l4.5 4.5 4.5-4.5M5 19.5h14"/></svg>';
  var G_U = '<svg class="mi-glyph mi-g-u" viewBox="0 0 24 24" aria-hidden="true"><circle class="mi-ring" cx="12" cy="12" r="9"/><circle class="mi-arc mi-u-arc" cx="12" cy="12" r="9" transform="rotate(-90 12 12)"/><path class="mi-u-arrow" d="M12 7.5v7M8.8 11.8l3.2 3.2 3.2-3.2"/></svg>';
  var I_PLAY = '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z" fill="currentColor"/></svg>';
  var I_PAUSE = '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1.2" fill="currentColor"/><rect x="14" y="5" width="4" height="14" rx="1.2" fill="currentColor"/></svg>';
  var I_RESET = '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>';
  var I_EYE = '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>';
  var I_EYEOFF = '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9.9 4.24A9.1 9.1 0 0 1 12 4c7 0 10 8 10 8a13.2 13.2 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.5 13.5 0 0 0 2 12s3 8 10 8a9.7 9.7 0 0 0 5.39-1.61"/><path d="M2 2l20 20"/><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/></svg>';
  var I_UP = '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M6 15l6-6 6 6"/></svg>';
  var I_DN = '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>';
  var G_T = '<svg class="mi-glyph mi-g-t" viewBox="0 0 24 24" aria-hidden="true"><circle class="mi-ring" cx="12" cy="12" r="9"/><circle class="mi-arc" cx="12" cy="12" r="9" transform="rotate(-90 12 12)"/><path class="mi-hand-t" d="M12 7.5V12l2.8 1.7"/></svg>';
  var G_S = '<svg class="mi-glyph mi-g-s" viewBox="0 0 24 24" aria-hidden="true"><circle class="mi-sw-body" cx="12" cy="13.5" r="7.6"/><path class="mi-sw-nub" d="M9.6 3h4.8"/><path class="mi-hand-s" d="M12 13.5V8.8"/></svg>';

  // On / off (Settings > Dynamic island). Stored as mtx.island: "0" = off, anything else = on. Off adds html.mt-island-off (css/mt-island.css):
  // the capsule is hidden and the Curve pane loses its --mi-reserve strip, so NeuCurve has exactly its original layout.
  function enabled() { try { return localStorage.getItem(KEY_ON) !== "0"; } catch (e) { return true; } }
  function applyEnabled() { document.documentElement.classList.toggle("mt-island-off", !enabled()); }
  applyEnabled();                                                       // before first paint: no strip flash when it is off
  function $(id) { return document.getElementById(id); }
  function body() { return document.body; }
  function idle() { return body().classList.contains("is-idle"); }
  function quiet() { return body().classList.contains("is-quiet"); }
  function reduce() { return document.documentElement.getAttribute("data-reduce-motion") === "true"; }
  function pad(n) { return n < 10 ? "0" + n : String(n); }
  function clamp(v, lo, hi) { v = parseInt(v, 10); if (!isFinite(v)) { v = 0; } return Math.max(lo, Math.min(hi, v)); }
  function live(x) { return !!x && x.state !== "idle"; }
  function el(tag, cls, html) { var e = document.createElement(tag); if (cls) { e.className = cls; } if (html) { e.innerHTML = html; } return e; }
  function setTxt(node, t) { if (node && node.textContent !== t) { node.textContent = t; } }
  function digits(node, t) { if (window.MTRoll) { window.MTRoll.set(node, t, "fast", true); } else { setTxt(node, t); } }   // true = roll outside idle mode too: changed digits roll up, like the idle clock
  function api() { return window.MTIsland || {}; }

  function build() {
    if (root) { return; }
    try { var m = localStorage.getItem(KEY); if (m === "sw" || m === "timer") { mode = m; } } catch (e) { }
    root = el("div", "mt-island"); root.id = "mt-island"; root.setAttribute("role", "group"); root.setAttribute("aria-label", "Timer and stopwatch");
    pill = el("button", "mi-pill", G_T + G_S + G_U); pill.type = "button"; pill.setAttribute("aria-expanded", "false"); pill.setAttribute("aria-label", "Open timer and stopwatch");
    gT = pill.querySelector(".mi-g-t"); gS = pill.querySelector(".mi-g-s"); gU = pill.querySelector(".mi-g-u"); arcU = pill.querySelector(".mi-u-arc"); arc = pill.querySelector(".mi-arc"); handS = pill.querySelector(".mi-hand-s");

    panel = el("div", "mi-panel"); panel.setAttribute("aria-hidden", "true");
    // one switch instead of two tabs: the left side names the feature in use, the right side the one a click goes to. Nothing changes until it is clicked.
    var hd = el("div", "mi-head");
    swBtn = el("button", "mi-switch",
      '<span class="mi-stack mi-cur"><span class="mi-l mi-l-t">Timer<i class="mi-dot"></i></span><span class="mi-l mi-l-s">Stopwatch<i class="mi-dot mi-dot-s"></i></span></span>' +
      '<span class="mi-stack mi-nxt"><span class="mi-l mi-l-t">Timer<i class="mi-dot"></i></span><span class="mi-l mi-l-s">Stopwatch<i class="mi-dot mi-dot-s"></i></span></span><span class="mi-swap">' + I_SWAP + '</span>');
    swBtn.type = "button"; lab.t = swBtn.querySelectorAll(".mi-l-t"); lab.s = swBtn.querySelectorAll(".mi-l-s");   // [0] = shown label, [1] = the "click goes to" label
    hd.appendChild(swBtn); panel.appendChild(hd);

    // ---- timer pane ----
    paneT = el("div", "mi-pane mi-pane-t is-set");
    var set = el("div", "mi-set"), u, col, up, dn, inp;
    for (u = 0; u < 3; u++) {
      (function (k) {
        col = el("div", "mi-col");
        up = el("button", "mi-step", I_UP); up.type = "button"; up.setAttribute("aria-label", "Increase " + UNIT_LONG[k].toLowerCase());
        dn = el("button", "mi-step", I_DN); dn.type = "button"; dn.setAttribute("aria-label", "Decrease " + UNIT_LONG[k].toLowerCase());
        inp = document.createElement("input");                       // no type attribute on purpose: the Material theme restyles input[type="text"]
        inp.className = "mi-num"; inp.maxLength = 2; inp.setAttribute("inputmode", "numeric"); inp.setAttribute("autocomplete", "off"); inp.setAttribute("aria-label", UNIT_LONG[k]); inp.value = "00";
        nums[k] = inp;
        bindStep(up, k, 1); bindStep(dn, k, -1); bindNum(inp, k);
        col.appendChild(up); col.appendChild(inp); col.appendChild(dn); col.appendChild(el("span", "mi-unit", UNIT_NAME[k]));
        if (k !== "h") { set.appendChild(el("span", "mi-colon")); }
        set.appendChild(col);
      })(UNITS[u]);
    }
    paneT.appendChild(set);
    var rt = el("div", "mi-read"); ui.t.big = el("div", "mi-big"); ui.t.bar = el("div", "mi-bar", "<i></i>"); ui.t.status = el("div", "mi-status");
    rt.appendChild(ui.t.big); rt.appendChild(ui.t.bar); rt.appendChild(ui.t.status); paneT.appendChild(rt);
    paneT.appendChild(controls("timer", ui.t));

    // ---- stopwatch pane ----
    paneS = el("div", "mi-pane mi-pane-s");
    var rs = el("div", "mi-read"); ui.s.big = el("div", "mi-big"); ui.s.status = el("div", "mi-status");
    rs.appendChild(ui.s.big); rs.appendChild(ui.s.status); paneS.appendChild(rs);
    var cs = controls("sw", ui.s);
    ui.s.eye = el("button", "mi-eye", I_EYE); ui.s.eye.type = "button"; ui.s.eyeOn = false;
    ui.s.eye.addEventListener("click", function () {
      flip = true;                                                          // this change is animated (hover reveal is not)
      if (!(data.sw && data.sw.hidden)) { hov = false; lock = true; }       // just hidden while the pointer is still inside: stay masked until it leaves and comes back
      if (api().onSwHide) { api().onSwHide(); }
    });
    cs.appendChild(ui.s.eye); paneS.appendChild(cs);

    // ---- update pane (filled by MTIsland.notice, used by js/mt-updater.js) ----
    paneU = el("div", "mi-pane mi-pane-u");
    var uh = el("div", "mi-u-head");
    uh.appendChild(el("span", "mi-u-ico", I_DOWN));
    var ut = el("div", "mi-u-text"); uiU.title = el("div", "mi-u-title"); uiU.sub = el("div", "mi-u-sub"); ut.appendChild(uiU.title); ut.appendChild(uiU.sub); uh.appendChild(ut);
    uiU.more = el("button", "mi-u-more", "<span>Notes</span>" + I_CHEV); uiU.more.type = "button"; uiU.more.setAttribute("aria-expanded", "false"); uiU.more.title = "What\u2019s new"; uh.appendChild(uiU.more);
    paneU.appendChild(uh);
    uiU.notes = el("pre", "mi-u-notes"); paneU.appendChild(uiU.notes);
    uiU.bar = el("div", "mi-u-bar", "<i></i>"); paneU.appendChild(uiU.bar);
    var uc = el("div", "mi-ctl");
    uiU.later = el("button", "mi-later", "Later"); uiU.later.type = "button";
    uiU.now = el("button", "mi-main", "Update now"); uiU.now.type = "button";
    uc.appendChild(uiU.later); uc.appendChild(uiU.now); paneU.appendChild(uc);
    uiU.more.addEventListener("click", function () { notesOpen = !notesOpen; paint(); swapNotes(); });
    uiU.now.addEventListener("click", function () { if (notice && notice.onNow) { notice.onNow(); } });
    uiU.later.addEventListener("click", function () { if (notice && notice.onLater) { notice.onLater(); } });

    panel.appendChild(paneT); panel.appendChild(paneS); panel.appendChild(paneU);
    root.appendChild(pill); root.appendChild(panel); body().appendChild(root);

    root.classList.toggle("is-sw", mode === "sw"); root.classList.toggle("lab-sw", mode === "sw");
    pill.addEventListener("click", function (e) { e.stopPropagation(); setOpen(true); });
    root.addEventListener("click", function (e) { e.stopPropagation(); });
    root.addEventListener("mouseenter", function () { if (!lock) { hov = true; if (data.sw && data.sw.hidden) { paint(); } } });   // pointer over the island: hidden digits show at once
    root.addEventListener("mouseleave", function () { hov = false; lock = false; if (data.sw && data.sw.hidden) { paint(); } });          // a click on the island never leaves idle mode
    swBtn.addEventListener("click", toggleMode);
  }

  function controls(which, o) {
    var box = el("div", "mi-ctl");
    o.reset = el("button", "mi-reset", I_RESET); o.reset.type = "button"; o.reset.setAttribute("aria-label", which === "timer" ? "Reset timer" : "Reset stopwatch");
    o.main = el("button", "mi-main", ""); o.main.type = "button"; o.main.innerHTML = '<span class="mi-mi"></span><span class="mi-ml"></span>';
    o.mi = o.main.querySelector(".mi-mi"); o.ml = o.main.querySelector(".mi-ml"); o.ic = "";
    o.reset.addEventListener("click", function () { if (api().onReset) { api().onReset(which); } });
    o.main.addEventListener("click", function () { if (api().onToggle) { api().onToggle(which); } });
    box.appendChild(o.reset); box.appendChild(o.main);
    return box;
  }

  // ---------- timer length: steppers ----------
  function readCfg() { return { h: clamp(nums.h.value, 0, LIM.h), m: clamp(nums.m.value, 0, LIM.m), s: clamp(nums.s.value, 0, LIM.s) }; }
  function commit() { var c = readCfg(); if (api().onSetTimer) { api().onSetTimer(c.h, c.m, c.s); } }
  function bump(k, d) { nums[k].value = pad(clamp(clamp(nums[k].value, 0, LIM[k]) + d, 0, LIM[k])); commit(); }
  function stopHold() { clearTimeout(hold); clearInterval(holdIv); hold = 0; holdIv = 0; }
  function bindStep(btn, k, d) {
    btn.addEventListener("pointerdown", function (e) {
      if (e.button !== undefined && e.button > 0) { return; }
      stopHold(); bump(k, d);
      hold = setTimeout(function () { holdIv = setInterval(function () { bump(k, d); }, 70); }, 380);   // press and hold = repeat
    });
    ["pointerup", "pointerleave", "pointercancel"].forEach(function (n) { btn.addEventListener(n, stopHold); });
    btn.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); bump(k, d); } });
  }
  function bindNum(inp, k) {
    inp.addEventListener("focus", function () { try { inp.select(); } catch (e) { } });
    inp.addEventListener("input", function () { inp.value = inp.value.replace(/\D/g, "").slice(0, 2); });
    inp.addEventListener("change", function () { inp.value = pad(clamp(inp.value, 0, LIM[k])); commit(); });
    inp.addEventListener("keydown", function (e) {
      if (e.key === "Enter") { e.preventDefault(); inp.blur(); }
      else if (e.key === "ArrowUp") { e.preventDefault(); bump(k, 1); }
      else if (e.key === "ArrowDown") { e.preventDefault(); bump(k, -1); }
      e.stopPropagation();
    });
    inp.addEventListener("wheel", function (e) { e.preventDefault(); e.stopPropagation(); bump(k, e.deltaY < 0 ? 1 : -1); });
  }

  // ---------- open / close / mode ----------
  function layout() {
    if (!root) { return; }
    var ew = Math.min(EW_MAX, window.innerWidth - 16); ew -= ew % 2; if (ew < 200) { ew = 200; }
    root.style.setProperty("--mi-ew", ew + "px");
    if (open) { root.style.setProperty("--mi-w", ew + "px"); root.style.setProperty("--mi-h", Math.round(panel.offsetHeight) + "px"); }
    else { root.style.setProperty("--mi-w", CW + "px"); root.style.setProperty("--mi-h", CH + "px"); }
  }
  function swap() {                                    // content of the card changes: let it rise in again
    if (!open || reduce()) { return; }
    panel.classList.remove("is-swap"); void panel.offsetWidth; panel.classList.add("is-swap");
  }
  function setOpen(v, focusBack) {
    if (v === open) { return; }
    open = v; stopHold();
    if (v) { hookFrame(); }
    root.classList.toggle("is-open", v); pill.setAttribute("aria-expanded", v ? "true" : "false"); panel.setAttribute("aria-hidden", v ? "false" : "true");
    if (v) { panel.classList.remove("is-swap"); }
    paint();
    if (!v && focusBack) { try { pill.focus(); } catch (e) { } }
  }
  function setMode(m) {
    if (m === mode) { return; }
    mode = m; try { localStorage.setItem(KEY, m); } catch (e) { }
    root.classList.toggle("is-sw", m === "sw"); root.classList.toggle("lab-sw", m === "sw");
    paint();
  }
  // The switch: labels roll at once, the old view fades out (0.13 s), then the new one rises in while the card eases to its new height.
  function toggleMode() {
    if (leaving) { return; }
    var m = mode === "timer" ? "sw" : "timer";
    if (!open || reduce()) { setMode(m); return; }
    leaving = 1; root.classList.toggle("lab-sw", m === "sw");
    panel.classList.add("is-leaving");
    setTimeout(function () { leaving = 0; setMode(m); panel.classList.remove("is-leaving"); }, 130);
  }
  function swapNotes() { if (!open || reduce() || !notesOpen) { return; } restart(uiU.notes, "is-in"); }

  // ---------- update notice (js/mt-updater.js) ----------
  // MTIsland.notice({ title, sub, notes, f, busy, nowText, nowHidden, laterText, laterHidden, open, ttl, onNow, onLater }) shows the update card; notice(null) removes it.
  // open:true opens the card by itself (once per call), ttl = ms until the notice removes itself (used for the "Updated" confirmation).
  function setNotice(n) {
    var was = !!notice;
    notice = n || null; clearTimeout(noticeTtl);
    if (!n) { notesOpen = false; }
    build();
    root.classList.toggle("is-upd", !!n);
    if (n && n.open && !open) {
      clearTimeout(autoTimer);
      autoTimer = setTimeout(function () { if (notice && !open && enabled()) { setOpen(true); } }, was ? 60 : 480);   // let the capsule pop in first, then grow
    }
    if (!n && was && open) { setOpen(false); }
    if (n && n.ttl) { noticeTtl = setTimeout(function () { setNotice(null); }, n.ttl); }
    paint();
  }

  // ---------- painting ----------
  function mainBtn(o, st, labels, disabled) {
    var ic = st === "running" ? "pause" : "play";
    if (o.ic !== ic) { o.mi.innerHTML = ic === "pause" ? I_PAUSE : I_PLAY; o.ic = ic; }
    setTxt(o.ml, labels[st]); o.main.setAttribute("aria-label", labels[st]); o.main.disabled = !!disabled;
    o.reset.hidden = st === "idle";
  }

  function restart(node, cls) { node.classList.remove(cls); void node.offsetWidth; node.classList.add(cls); }

  function paintNotice() {
    var n = notice, f;
    if (!n) { return; }
    setTxt(uiU.title, n.title || ""); setTxt(uiU.sub, n.sub || "");
    if (uiU.notes.textContent !== (n.notes || "")) { uiU.notes.textContent = n.notes || ""; }
    var hasNotes = !!n.notes && !n.busy;
    uiU.more.hidden = !hasNotes; paneU.classList.toggle("is-notes", hasNotes && notesOpen);
    uiU.more.setAttribute("aria-expanded", hasNotes && notesOpen ? "true" : "false");
    f = Math.max(0, Math.min(1, n.f || 0));
    paneU.classList.toggle("is-busy", !!n.busy);
    uiU.bar.firstChild.style.setProperty("--p", String(f));
    arcU.style.strokeDashoffset = String(ARC * (1 - (n.busy ? f : 0)));
    paneU.classList.toggle("is-run", !!n.busy);
    setTxt(uiU.now, n.nowText || "Update now");
    uiU.now.hidden = !!n.nowHidden; uiU.now.disabled = !!n.busy;
    setTxt(uiU.later, n.laterText || "Later"); uiU.later.hidden = !!n.laterHidden; uiU.later.disabled = !!n.busy;
  }

  function paint() {
    build();
    var t = data.timer, s = data.sw, tl = live(t), sl = live(s);
    // the feature in use changes only when the switch is clicked (no auto-switch when the other one starts)
    prevT = tl; prevS = sl;

    var ts = t ? t.state : "idle", ss = s ? s.state : "idle", c = t && t.cfg ? t.cfg : { h: 0, m: 0, s: 0 }, zero = !c.h && !c.m && !c.s;
    // timer pane
    paneT.classList.toggle("is-set", ts === "idle"); paneT.classList.toggle("is-paused", ts === "paused"); paneT.classList.toggle("is-done", ts === "done");
    UNITS.forEach(function (k) { if (document.activeElement !== nums[k]) { var v = pad(c[k] || 0); if (nums[k].value !== v) { nums[k].value = v; } } });
    if (t) { digits(ui.t.big, t.text); }
    ui.t.bar.firstChild.style.setProperty("--p", String(Math.max(0, Math.min(1, t ? t.frac || 0 : 0))));
    setTxt(ui.t.status, ts === "running" ? "Running" : ts === "paused" ? "Paused" : ts === "done" ? "Time is up" : "");
    mainBtn(ui.t, ts, { idle: "Start", running: "Pause", paused: "Resume", done: "Start again" }, ts === "idle" && zero);
    // stopwatch pane
    paneS.classList.toggle("is-paused", ss === "paused");
    var hid = !!(s && s.hidden), mask = hid && !hov;
    if (s) { digits(ui.s.big, mask ? MASK : s.text); }
    setTxt(ui.s.status, mask ? "Hover to show time" : (ss === "running" ? "Running" : ss === "paused" ? "Paused" : "Ready"));
    if (ui.s.eyeOn !== hid) {
      ui.s.eye.innerHTML = hid ? I_EYEOFF : I_EYE; ui.s.eyeOn = hid;
      if (flip && !reduce()) { restart(ui.s.eye, "is-pop"); }
    }
    if (flip && hid !== undefined) {
      if (mask !== lastMask && !reduce()) { restart(ui.s.big, "is-flip"); restart(ui.s.status, "is-flip"); }
      flip = false;
    }
    lastMask = mask;
    ui.s.eye.setAttribute("aria-pressed", hid ? "true" : "false"); ui.s.eye.setAttribute("aria-label", hid ? "Show stopwatch time" : "Hide stopwatch time"); ui.s.eye.title = hid ? "Show time" : "Hide time";
    mainBtn(ui.s, ss, { idle: "Start", running: "Pause", paused: "Resume" }, false);
    // tabs + closed icon
    for (var li = 0; li < 2; li++) { lab.t[li].classList.toggle("is-live", tl); lab.s[li].classList.toggle("is-live", sl); }
    swBtn.setAttribute("aria-label", mode === "sw" ? "Switch to timer" : "Switch to stopwatch");
    root.classList.toggle("has-alt", mode === "sw" ? tl : sl);          // the other feature is running: a small dot beside the closed icon
    paintNotice();
    arc.style.strokeDashoffset = String(ARC * (1 - Math.max(0, Math.min(1, t ? t.frac || 0 : 0))));
    gT.setAttribute("class", "mi-glyph mi-g-t" + (ts === "done" ? " is-done" : ""));
    gS.setAttribute("class", "mi-glyph mi-g-s" + (ss === "running" ? " is-run" : ss === "paused" ? " is-pause" : ""));
    pill.setAttribute("aria-label", notice ? "Open update" : "Open " + (mode === "sw" ? "stopwatch" : "timer"));

    var want = enabled() && (!idle() || (quiet() && (tl || sl || !!notice))), was = shown;
    if (!want && open) { open = false; stopHold(); root.classList.remove("is-open"); pill.setAttribute("aria-expanded", "false"); panel.setAttribute("aria-hidden", "true"); }
    var vk = notice ? "upd" : mode + (mode === "timer" && ts === "idle" ? ":set" : ":run");
    var changed = vk !== viewKey; viewKey = vk;
    if (changed) { swap(); }
    layout();
    if (want !== shown) { shown = want; root.classList.toggle("is-on", want); }

    var done = ts === "done";
    if (done && !wasDone && want && !open && root.animate && !reduce()) {     // time is up: one jelly pulse of the closed capsule
      try { root.animate([{ transform: "scale(1)" }, { transform: "scale(1.12,1.18)", offset: 0.35 }, { transform: "scale(0.98,0.97)", offset: 0.65 }, { transform: "scale(1)" }], { duration: 620, easing: "cubic-bezier(0.34, 1.3, 0.64, 1)" }); } catch (e2) { }
    }
    wasDone = done;
    return was !== shown;
  }

  // ---------- NeuCurve tab (iframe) ----------
  // 1. Mouse / key events inside the iframe never reach this document, so "click outside" and Esc could not close the island there.
  //    Fix: listen inside the frame too (same origin), and treat the window losing focus to the frame as a click outside.
  // 2. The strip above the frame (css/mt-island.css, --mi-reserve) is painted solid in NeuCurve's own base colour (--mi-strip), never transparent.
  function frameEl() { return $("curve-frame"); }
  function parseRgb(c) { var m = /rgba?\(([^)]+)\)/.exec(c || ""), p; if (!m) { return null; } p = m[1].split(","); return { r: parseFloat(p[0]), g: parseFloat(p[1]), b: parseFloat(p[2]), a: p.length > 3 ? parseFloat(p[3]) : 1 }; }
  function stripColor() {
    var f = frameEl(), d, w, c, v;
    try {
      d = f && f.contentDocument; w = d && d.defaultView;
      if (w) {
        c = parseRgb(w.getComputedStyle(d.body).backgroundColor);
        if (c && c.a >= 0.98) { return "rgb(" + c.r + "," + c.g + "," + c.b + ")"; }
        v = w.getComputedStyle(d.documentElement).getPropertyValue("--bg-color").trim();   // set by neucurve/nc-theme-sync.js from the panel background
        if (/^#[0-9a-f]{3,8}$/i.test(v)) { return v; }
      }
    } catch (e) { }
    v = getComputedStyle(document.documentElement).getPropertyValue("--curve-bg").trim();
    return v || "#0a0a0a";
  }
  function syncStrip() { var pane = $("curve-pane"); if (pane) { pane.style.setProperty("--mi-strip", stripColor()); } }
  function watch(node) { try { new MutationObserver(syncStrip).observe(node, { attributes: true, attributeFilter: ["class", "style", "data-theme", "data-ui-theme"] }); } catch (e) { } }
  function hookFrame() {
    var f = frameEl(), d;
    if (!f) { return; }
    try {
      d = f.contentDocument;
      if (!d || !d.documentElement || d._miHook) { syncStrip(); return; }
      d._miHook = true;
      // Any press inside NeuCurve closes the island. Listen on the frame's WINDOW in the capture phase, and for pointer / touch too:
      // the graph grip (neucurve/nc-gsize.js) stops pointerdown and prevents its default, so no mousedown ever follows it.
      var w = d.defaultView || d, close = function () { if (open) { setOpen(false); } };
      ["pointerdown", "mousedown", "touchstart"].forEach(function (n) { w.addEventListener(n, close, true); });
      w.addEventListener("keydown", function (e) { if (open && (e.key === "Escape" || e.keyCode === 27)) { setOpen(false); } }, true);
      watch(d.documentElement); if (d.body) { watch(d.body); }
    } catch (e) { }
    syncStrip();
  }

  // Settings > Navigation position "Top": css/mt-navpos.css moves the island below the bar, so the fly-to point moves with it.
  function barDrop() {
    if (document.documentElement.getAttribute("data-nav-pos") !== "top") { return 0; }
    var b = document.querySelector(".sidebar");
    return b ? Math.round(b.getBoundingClientRect().bottom) : 0;
  }

  // live widgets fly toward the island when the idle UI hides: where is the island centre relative to each widget centre?
  function aim() {
    var ids = [["idle-timer", data.timer], ["idle-sw", data.sw]], i, e, r, cx = window.innerWidth / 2, cy = TOP + CH / 2 + barDrop();
    for (i = 0; i < ids.length; i++) {
      e = $(ids[i][0]); if (!e || !live(ids[i][1]) || !e.offsetParent) { continue; }
      r = e.getBoundingClientRect();
      e.style.setProperty("--mi-dx", Math.round(cx - (r.left + r.width / 2)) + "px");
      e.style.setProperty("--mi-dy", Math.round(cy - (r.top + r.height / 2)) + "px");
    }
  }

  function setEnabled(on) {
    try { if (on) { localStorage.removeItem(KEY_ON); } else { localStorage.setItem(KEY_ON, "0"); } } catch (e) { }
    applyEnabled();
    if (root) { paint(); aim(); }                                       // closes the card and hides / shows the capsule
    setTimeout(syncStrip, 0);
    try { window.dispatchEvent(new Event("resize")); } catch (e2) { }
    try { window.dispatchEvent(new Event("mt-island-toggle")); } catch (e3) { }   // js/mt-updater.js moves the update card between the island and the old banner   // the Curve frame measures itself again at its new size
  }
  function update(d) { data = { timer: d && d.timer || null, sw: d && d.sw || null }; paint(); }

  function init() {
    build();
    try { new MutationObserver(function () { aim(); paint(); }).observe(body(), { attributes: true, attributeFilter: ["class"] }); } catch (e) { }   // idle / quiet changed
    window.addEventListener("resize", function () { aim(); layout(); });
    ["pointerdown", "mousedown", "touchstart"].forEach(function (n) {                                                         // press outside closes
      document.addEventListener(n, function (e) { if (open && !root.contains(e.target)) { setOpen(false); } }, true);
    });
    document.addEventListener("keydown", function (e) { if (open && (e.key === "Escape" || e.keyCode === 27)) { setOpen(false, root.contains(document.activeElement)); } }, true);
    window.addEventListener("blur", function () { stopHold(); var f = frameEl(); if (open && f && document.activeElement === f) { setOpen(false); } });   // focus went into the NeuCurve frame
    var fr = frameEl(), pane = $("curve-pane");
    if (fr) { fr.addEventListener("load", function () { hookFrame(); setTimeout(syncStrip, 400); setTimeout(syncStrip, 1500); }); }   // theme message arrives a moment after load
    watch(document.documentElement); if (pane) { watch(pane); }
    hookFrame();
    paint();
  }

  window.MTIsland = { update: update, aim: aim, notice: setNotice, setEnabled: setEnabled, isEnabled: enabled, onToggle: null, onReset: null, onSwHide: null, onSetTimer: null };
  if (document.readyState === "loading") { document.addEventListener("DOMContentLoaded", init); } else { init(); }
})();
