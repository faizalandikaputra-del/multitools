/* Multi Tool - mt-island.js (v20: TAB BAR)
   v20: the ONE switch button is gone. An open island shows a row of tab icons (Timer, Stopwatch, Clock, Pin, + Effects while its dot shows, + Update while an update waits) above the
   content; one click = straight to that tab. Only the active tab has a label, inside ONE white pill that stretches and slides to the new tab (WAAPI, 320 ms). Open: bar icons drop in 6 px
   with a 30 ms stagger (140 - 420 ms), the label opens 300 - 420 ms, the content fades in 260 - 520 ms. Switch: old content leaves toward the old tab, new content comes from the new tab,
   the island height follows in 460 ms (class .is-sw). The Effects slot is empty while there is no dot; the Update slot is reserved at the right end, so nothing else moves when it grows in.
   Wheel / Esc as before; ArrowLeft / ArrowRight (not inside an input) step through the tabs. Animations switch off (data-reduce-motion) = no motion at all.
   v19: Copy Effects lives here now (js/mt-fxcopy.js drives it; the wide chip under the island is gone). A 7 px violet dot sits in the collapsed capsule while effects are
   selected / saved effects wait for a Paste (the capsule never changes size). A click on the island opens it straight on the new "Effects" tab (the tab is part of the switch cycle only
   while the dot shows). That tab auto-closes 420 ms after the pointer leaves. API for mt-fxcopy.js: MTIsland.fxHost() (the tab's container), fxDot(on), fxChanged() (re-measure), fxClose().
   v18: PIN TILES BACK   v18: tool tiles can be dragged onto the island again (they were lost in v16). The "Pin" view = pinned tool tiles (click = run the tool, x = unpin, Unpin all)
   + boxes. No star on tiles, no favorites bar, no Settings group (those stay removed). Motion: tiles stagger in, a new pin pops, an unpinned tile shrinks out.
   v17: bug - the collapsed   v17: bug - the collapsed capsule showed the clock time ALL the time (class .is-k forced the time wrapper open, css/mt-island.css + collapsedSize()). Now the time of day opens
   only while the pointer is on the island, like the timer / stopwatch: pointer away = the small dial icon only.
   v16: the "Favorites" view is now "Pin" and holds boxes only. The favorite feature (star on tool tiles, favorites bar, tile drop) was removed.
   v15: a box (".ta-group" card of the Tools tab, see js/mt-island-boxes.js) can be dragged by its header onto the island. The live box MOVES into the Pin view
   (under the tool tiles, scrolls inside its own area, x = bring it back). Drop type "text/mt-box" -> MTBoxes.pin(key). Exposed here: MTIsland.boxHost(), boxesChanged(n), isEnabled(), focusBoxes().
(v14 notes follow)
   v14: FAVORITES   v14: a fourth tool "Favorites" (between Clock and Update). It shows the tools pinned as favorites (the same list as the star on a tool tile, key mtx.pro.fav, js/mt-pro.js).
   Drag a tool tile (Easy Layer: Null, Solid ...) onto the island = add it; the tile stays where it is (copy, not move). Click a tile in the island = run that tool, so Null / Solid /
   Text ... can be created while the NeuCurve tab is open. Every tile has a x button (remove) and the header has "Clear all".
(v12 notes follow)
/* Multi Tool - mt-island.js (v12: CLOCK + wheel)
   v11: the island is also a CLOCK. Nothing running (no timer / stopwatch) = the collapsed capsule shows the time of day (a tiny dial whose hands move + HH:MM), so the time is
   visible without the idle screen. A running timer / stopwatch still takes the capsule over. Expanded: a third tool "Clock" (dial, big time, seconds, date, 24 h / 12 h chips, key mtx.islandClock12 = "1" for 12 h).
(v3 notes follow)
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
  var PAD = 16, PAD_C = 13, COL_H = 36, X_MAX = 288, SEL_KEY = "mtx.islandSel", H12_KEY = "mtx.islandClock12";
  var PLAY = '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z" fill="currentColor"/></svg>';
  var PAUSE = '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1.2" fill="currentColor"/><rect x="14" y="5" width="4" height="14" rx="1.2" fill="currentColor"/></svg>';
  var RESET = '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="M5 12a7 7 0 1 0 2.1-5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><path d="M5 4.5v4.2h4.2" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  var UP = '<svg viewBox="0 0 24 24" width="12" height="12" aria-hidden="true"><path d="M6 14.5l6-6 6 6" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  var DOWN = '<svg viewBox="0 0 24 24" width="12" height="12" aria-hidden="true"><path d="M6 9.5l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  var ORDER = ["timer", "sw", "clock", "fav", "fx", "u"], NAMES = { timer: "Timer", sw: "Stopwatch", clock: "Clock", fav: "Pin", fx: "Effects", u: "Update" }, IW = 28, GAP = 2;
  var SV = '<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">';
  var ICONS = {
    timer: SV + '<path d="M7 3.5h10M7 20.5h10M8 3.5v3.6c0 1.6 1.7 2.8 4 4.9-2.3 2.1-4 3.3-4 4.9v3.6M16 3.5v3.6c0 1.6-1.7 2.8-4 4.9 2.3 2.1 4 3.3 4 4.9v3.6"/></svg>',
    sw: SV + '<circle cx="12" cy="13.5" r="7"/><path d="M10 3h4M12 3v3.5M12 13.5l2.6-3"/></svg>',
    clock: SV + '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></svg>',
    fav: SV + '<path d="M9 4h6l-1 5 3 3.2v1.3H7v-1.3L10 9 9 4zM12 13.5V20.5"/></svg>',
    fx: '<span class="mi-fxt">fx</span>',
    u: SV + '<circle cx="12" cy="12" r="7.5"/><circle cx="12" cy="12" r="2.2" fill="currentColor" stroke="none"/></svg>'
  };
  var bar, track, pill, pillIn, tb = {}, trackW = 0, pillGeo = null, pillAnim = null, barKey = "", enT = 0, swT = 0, outing = [], lastEl = null;
  var vX, tabX, fxDotEl, fxOn = false, fxRev = 0, fxT = 0, fBoxWrap, fBoxes, boxN = 0, boxRO, vF, tabF, fGrid, fHead, fCount, fClear, fEmpty, fPrev = [], fKey = "\u0000", dropDepth = 0, cTw, sHide, lastHid, lastEff, hover = false, banner, bEl = {}, upd = false, updBusy = false, updWas = false, spin = 0, tabU, vU, cUtx, root, cEl, xEl, cIco, cTime, sw, tabT, tabS, vT, vS, tSet, tRun, hIn, mIn, tGo, tBig, tRing, tRst, tPlay, sBig, sPlay, sRst, tName, pager, tabK, vK, kDial, kBig, kSec, kMer, kDate, k24, k12, kTick = 0, kTurn = 0, kLastS = -1;
  var data = { timer: null, sw: null }, shown = false, open = false, wasDone = false, sel = "clock", view = "clock", lastVis = false;
  var cfg = { h: 1, m: 0 };
  // Settings > Appearance > Show dynamic island (checkbox #island-enabled, key mtx.islandOn, "0" = off). Off: the capsule never shows for the timer / stopwatch
  // (html[data-island="off"]: the live idle widgets then fade with the others instead of flying up). An update notice STILL uses the capsule, so an update is never missed.
  var ON_KEY = "mtx.islandOn";
  function enabled() { try { return localStorage.getItem(ON_KEY) !== "0"; } catch (e) { return true; } }
  function markEnabled() { var r = document.documentElement; if (enabled()) { r.removeAttribute("data-island"); } else { r.setAttribute("data-island", "off"); } }
  markEnabled();                                             // before the first paint

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
  function digits(node, t) { if (window.MTRoll) { window.MTRoll.set(node, t, "fast", true); } else { setTxt(node, t); } }       // same digit roll as the idle screen (always: also outside idle mode)
  function dswap(node, t) { if (window.MTRoll) { window.MTRoll.swap(node, t, "fast", true); } else { setTxt(node, t); } }          // stopwatch Hide / Show
  function rollReset(node) { if (window.MTRoll && node) { window.MTRoll.reset(node); } }
  function cb(name, a, b) { var f = window.MTIsland && window.MTIsland[name]; if (f) { f(a, b); } }

  function build() {
    if (root) { return; }
    root = el("div", "mt-island"); root.id = "mt-island"; root.setAttribute("role", "button"); root.tabIndex = 0; root.setAttribute("aria-expanded", "false"); root.setAttribute("aria-label", "Clock, timer and stopwatch");

    // ---- collapsed: ONE icon + digits ----
    cEl = el("div", "mi-c");
    cIco = el("span", "mi-ico", '<i class="mi-hh"></i><i class="mi-hm"></i><i class="mi-hs"></i>'); cTime = el("span", "mi-time");
    cUtx = el("span", "mi-utxt"); var badge = el("i", "mi-badge");
    cTw = el("span", "mi-tw"); cTw.appendChild(cTime); cTw.appendChild(cUtx);        // digits live in a wrapper that is closed until the pointer is on the island
    cEl.appendChild(cIco); cEl.appendChild(cTw); cEl.appendChild(badge);

    // ---- expanded ----
    xEl = el("div", "mi-x");
    bar = el("div", "mi-tabbar"); bar.setAttribute("role", "tablist"); bar.setAttribute("aria-label", "Timer, stopwatch, clock, pin, effects and update");
    track = el("div", "mi-tbs"); pill = el("div", "mi-pill", '<i class="mi-pill-in"></i>'); pillIn = pill.firstChild; track.appendChild(pill);
    ORDER.forEach(function (k, i) {
      var b = btn("mi-tb mi-tb-" + k, '<span class="mi-tbi"><span class="mi-ti">' + ICONS[k] + '<i class="mi-live"></i></span><span class="mi-tl"><span class="mi-tl-in">' + NAMES[k] + '</span></span></span>', NAMES[k]);
      b.setAttribute("role", "tab"); b.setAttribute("data-k", k); b.querySelector(".mi-tbi").style.setProperty("--i", String(i));
      b.addEventListener("click", function () { pick(k); });
      tb[k] = { el: b, lab: b.querySelector(".mi-tl-in"), lw: 0, vis: k !== "fx" && k !== "u" }; track.appendChild(b);
    });
    bar.appendChild(track);
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
    sHide = btn("mi-link mi-hide", "Hide time", "Hide stopwatch time");
    sHide.addEventListener("click", function () { cb("onToggleHide"); });
    swrap.appendChild(sBig); swrap.appendChild(sHide); swrap.appendChild(sb); vS.appendChild(swrap);

    // clock view: dial + big HH:MM + seconds + date, and a 24 h / 12 h switch
    vK = el("div", "mi-view mi-view-k");
    var kw = el("div", "mi-k");
    kDial = el("div", "mi-dial mi-kd", '<i class="mi-hh"></i><i class="mi-hm"></i><i class="mi-hs"></i>');
    var kt = el("div", "mi-kt"), krow = el("div", "mi-krow"), kside = el("div", "mi-kside");
    kBig = el("span", "mi-kbig"); kSec = el("span", "mi-ksec"); kMer = el("span", "mi-kmer"); kDate = el("div", "mi-kdate");
    kside.appendChild(kSec); kside.appendChild(kMer); krow.appendChild(kBig); krow.appendChild(kside); kt.appendChild(krow); kt.appendChild(kDate);
    kw.appendChild(kDial); kw.appendChild(kt);
    var kf = el("div", "mi-pre mi-kfmt");
    k24 = btn("mi-chip", "24 h", "24 hour clock"); k12 = btn("mi-chip", "12 h", "12 hour clock");
    k24.addEventListener("click", function () { setH12(false); }); k12.addEventListener("click", function () { setH12(true); });
    kf.appendChild(k24); kf.appendChild(k12);
    vK.appendChild(kw); vK.appendChild(kf);

    // pin view: tiles of the pinned tools (click = run it), a x on every tile, "Unpin all", a drop target for tiles + boxes dragged from the Tools tab
    vF = el("div", "mi-view mi-view-f");
    fHead = el("div", "mi-fhead"); fCount = el("span", "mi-fcount");
    fClear = btn("mi-link mi-fclear", "Unpin all", "Unpin all tools");
    fClear.addEventListener("click", function () { var a = favItems(), i; for (i = 0; i < a.length; i++) { window.MTPro.favRemove(a[i].tab, a[i].tool.id); } });
    fHead.appendChild(fCount); fHead.appendChild(fClear);
    fGrid = el("div", "mi-fgrid");
    fEmpty = el("div", "mi-fempty", "<b>Nothing pinned yet</b><span>Drag a tool tile or a box here to pin it.</span>");
    fBoxWrap = el("div", "mi-boxwrap"); fBoxWrap.hidden = true;
    fBoxes = el("div", "mi-boxes ta"); fBoxWrap.appendChild(el("div", "mi-boxlabel", "Boxes")); fBoxWrap.appendChild(fBoxes);
    vF.appendChild(fHead); vF.appendChild(fGrid); vF.appendChild(fEmpty); vF.appendChild(fBoxWrap);
    try { if (window.ResizeObserver) { var rq = 0; boxRO = new ResizeObserver(function () { if (!rq) { rq = requestAnimationFrame(function () { rq = 0; if (open && view === "fav") { applySize(true); } }); } }); boxRO.observe(fBoxes); } } catch (eR) { }

    vX = el("div", "mi-view mi-view-x");                       // Copy Effects (filled by js/mt-fxcopy.js through MTIsland.fxHost())

    vU = el("div", "mi-view mi-view-u");
    banner = $("mt-update");
    if (banner) {                                              // js/mt-updater.js keeps working: same element, same ids, same classes - it just lives in the island now
      vU.appendChild(banner);
      var nw = banner.querySelector("#mt-update-now"), lt = banner.querySelector("#mt-update-later"), mr = banner.querySelector("#mt-update-more");   // the island is not in the document yet: search inside the banner
      [nw, lt, mr].forEach(function (b) { if (b) { b.classList.remove("btn", "btn-primary", "btn-ghost"); } });
      if (nw) { nw.classList.add("mi-go", "mi-go-u"); } if (lt) { lt.classList.add("mi-ghost"); } if (mr) { mr.classList.add("mi-link"); }
      if (lt) { lt.addEventListener("click", function () { setTimeout(function () { setOpen(false); }, 0); }); }   // "Later" / "OK": collapse
      bEl.title = banner.querySelector("#mt-update-title"); bEl.sub = banner.querySelector("#mt-update-sub");
      try {
        var q = 0;
        new MutationObserver(function () { if (!q) { q = requestAnimationFrame(function () { q = 0; if (root) { paint(false); } }); } })
          .observe(banner, { attributes: true, attributeFilter: ["class"], subtree: true, childList: true, characterData: true });
      } catch (e) { }
    }
    views.appendChild(vT); views.appendChild(vS); views.appendChild(vK); views.appendChild(vF); views.appendChild(vX); views.appendChild(vU);
    xEl.appendChild(bar); xEl.appendChild(views);

    fxDotEl = el("i", "mi-fxdot"); fxDotEl.setAttribute("aria-hidden", "true");
    root.appendChild(cEl); root.appendChild(xEl); root.appendChild(fxDotEl); body().appendChild(root);

    root.addEventListener("click", function (e) { if (!open) { setOpen(true); } e.stopPropagation(); });
    root.addEventListener("mouseenter", function () { setHover(true); });
    root.addEventListener("mouseleave", function () { setHover(false); });
    root.addEventListener("keydown", function (e) { if (!open && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); setOpen(true); } });
    document.addEventListener("pointerdown", function (e) { if (open && !root.contains(e.target)) { setOpen(false); } }, true);
    window.addEventListener("keydown", function (e) {
      if (open && (e.key === "Escape" || e.keyCode === 27)) { e.stopImmediatePropagation(); e.preventDefault(); setOpen(false); return; }
      if (open && (e.key === "ArrowLeft" || e.key === "ArrowRight") && !e.ctrlKey && !e.altKey && !e.metaKey && !e.shiftKey) {      // v20: step through the tabs (never while typing in a field)
        var tg = e.target; if (tg && (/^(INPUT|TEXTAREA|SELECT)$/.test(tg.tagName) || tg.isContentEditable)) { return; }
        var c = cycle(), i = c.indexOf(view), j = i + (e.key === "ArrowRight" ? 1 : -1);
        if (i >= 0 && j >= 0 && j < c.length) { e.stopImmediatePropagation(); e.preventDefault(); pick(c[j]); }
      }
    }, true);
    bindDrop(); window.addEventListener("mtx-fav-change", onFavChange);
    try { var s = localStorage.getItem(SEL_KEY); if (s === "sw" || s === "timer" || s === "clock" || s === "fav") { sel = s; } } catch (e0) { }
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
  function effective() {                                      // the tool the collapsed capsule shows: a running timer / stopwatch, otherwise the clock
    if (sel === "timer" || sel === "sw") {
      if (activeOf(sel)) { return sel; }
      var o = sel === "timer" ? "sw" : "timer";
      if (activeOf(o)) { return o; }
    } else {
      if (activeOf("timer")) { return "timer"; }
      if (activeOf("sw")) { return "sw"; }
    }
    return "clock";
  }
  function cycle() { var c = ["timer", "sw", "clock", "fav"]; if (fxOn || view === "fx") { c.push("fx"); } if (upd) { c.push("u"); } return c; }
  // The Start / Update Now buttons are painted with the theme accent, their label with --theme-on-accent. Some themes (Material You, custom colours)
  // give an accent and an on-accent that are both light (or both dark), so the label melted into the button. Read the colour the button is REALLY painted with
  // and pick a dark or white label from its luminance.
  function fixOn() {
    try {
      var b = tGo || $("mt-update-now"); if (!b || !root) { return; }
      var m = /rgba?\(\s*(\d+)[ ,]+(\d+)[ ,]+(\d+)(?:[ ,\/]+([\d.]+))?/.exec(getComputedStyle(b).backgroundColor);
      if (!m || (m[4] !== undefined && parseFloat(m[4]) < 0.5)) { return; }
      var l = 0.2126 * (+m[1]) + 0.7152 * (+m[2]) + 0.0722 * (+m[3]);
      root.style.setProperty("--mi-on", l > 150 ? "#0b0b0d" : "#ffffff");
    } catch (e) { }
  }
  // ---------- clock ----------
  function is12() { try { return localStorage.getItem(H12_KEY) === "1"; } catch (e) { return false; } }
  function setH12(on) { try { if (on) { localStorage.setItem(H12_KEY, "1"); } else { localStorage.removeItem(H12_KEY); } } catch (e) { } paint(false); }
  function clockNow() {
    var d = new Date(), h = d.getHours(), m = d.getMinutes(), s = d.getSeconds(), t12 = is12(), dh = t12 ? (h % 12 || 12) : h;
    if (s < kLastS) { kTurn++; } kLastS = s;                  // the second hand only ever turns forward (no spin back at 59 -> 0)
    if (root) {
      root.style.setProperty("--k-h", ((h % 12) * 30 + m * 0.5).toFixed(1) + "deg");
      root.style.setProperty("--k-m", (m * 6 + s * 0.1).toFixed(1) + "deg");
      root.style.setProperty("--k-s", (s * 6 + kTurn * 360) + "deg");
    }
    return { d: d, s: s, hm: pad2(dh) + ":" + pad2(m), mer: t12 ? (h < 12 ? "AM" : "PM") : "" };
  }
  var DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"], MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  function clockShown() { return !!root && !!shown && (open ? view === "clock" : effective() === "clock"); }
  function tickClock() { if (clockShown() && !document.hidden) { paint(false); } }
  function pick(k) {
    if (view === k) { return; }
    if (k !== "u" && k !== "fx") { sel = k; try { localStorage.setItem(SEL_KEY, k); } catch (e) { } }
    root.setAttribute("data-dir", ORDER.indexOf(k) > ORDER.indexOf(view) ? "next" : "prev");     // the direction of the tabs themselves: old content leaves toward the old tab
    rollReset(k === "timer" ? tBig : (k === "clock" ? kBig : sBig));   // (fav has no digits)
    if (k === "clock") { rollReset(kSec); }
    if (k === "fav") { fKey = "\u0000"; }
    if (open && !reduce()) { root.classList.add("is-sw"); clearTimeout(swT); swT = setTimeout(function () { root.classList.remove("is-sw"); }, 500); }      // height follows the new content in 460 ms
    view = k; paint(true);
  }

  // ---------- tab bar (v20) ----------
  function measure() {                                         // label widths (cached per open) and the room for them: all slots at icon size + one label must fit the track
    if (!track) { return false; }
    var tw = track.clientWidth; if (!tw) { return false; }
    trackW = tw;
    var n = 5 + (tb.fx.vis ? 1 : 0), cap = Math.max(0, tw - n * IW - (n - 1) * GAP - 4);
    ORDER.forEach(function (k) { var w = tb[k].lab.offsetWidth; tb[k].lw = Math.max(0, Math.min(w, cap)); tb[k].el.style.setProperty("--lw", tb[k].lw + "px"); });
    return true;
  }
  function geom() {                                            // where every tab sits (left, width): icons IW wide, the active one + its label; Update is pinned to the right end
    var x = 0, out = {};
    ORDER.forEach(function (k) {
      if (!tb[k].vis && k === "fx") { return; }
      var w = IW + (view === k ? tb[k].lw : 0);
      if (k === "u") { out[k] = { l: Math.max(x, trackW - w), w: w }; } else { out[k] = { l: x, w: w }; x += w + GAP; }
    });
    return out;
  }
  function pillTo(g) { pill.style.width = g.w + "px"; pill.style.transform = "translate3d(" + g.l + "px,0,0)"; }
  function placePill(anim) {                                   // anim: the white pill stretches over old + new tab, then settles (transform + width only)
    var g = geom()[view]; if (!g) { return; }
    var cur = null;
    if (anim && pillGeo && !reduce() && pill.animate) {
      try { var pr = pill.getBoundingClientRect(), tr = track.getBoundingClientRect(); cur = { l: pr.left - tr.left, w: pr.width }; } catch (e) { cur = null; }
    }
    if (pillAnim) { try { pillAnim.cancel(); } catch (e1) { } pillAnim = null; }
    pillGeo = g; pillTo(g);
    if (cur) {
      var a = Math.min(cur.l, g.l), z = Math.max(cur.l + cur.w, g.l + g.w);
      function kf(l, w, o, ease) { var f = { transform: "translate3d(" + l + "px,0,0)", width: w + "px", easing: ease }; if (o !== null) { f.offset = o; } return f; }
      try {
        pillAnim = pill.animate([kf(cur.l, cur.w, 0, "cubic-bezier(0.3, 0, 0.2, 1)"), kf(a, z - a, 0.42, "cubic-bezier(0.32, 0.72, 0, 1)"), kf(g.l, g.w, 1, "linear")], { duration: 320, easing: "linear" });
      } catch (e2) { pillAnim = null; }
    }
  }
  function enterBar() {                                        // island just opened: icons drop in (140 - 420 ms, 30 ms apart), the label opens 300 - 420 ms
    if (!open || !track) { return; }
    measure(); var g = geom()[view]; if (!g) { return; }
    clearTimeout(enT);
    if (pillAnim) { try { pillAnim.cancel(); } catch (e) { } pillAnim = null; }
    bar.classList.remove("is-enter");
    if (reduce()) { bar.classList.remove("is-l0"); pillGeo = g; pillTo(g); return; }
    bar.classList.add("is-l0"); pill.style.setProperty("--pi", String(ORDER.indexOf(view)));
    pill.style.width = IW + "px"; pill.style.transform = "translate3d(" + g.l + "px,0,0)"; pillGeo = g;
    void bar.offsetWidth;
    bar.classList.add("is-enter"); bar.classList.remove("is-l0"); pill.style.width = g.w + "px";
    enT = setTimeout(function () { bar.classList.remove("is-enter"); }, 480);
  }
  function viewEl(k) { return k === "timer" ? vT : (k === "sw" ? vS : (k === "clock" ? vK : (k === "fav" ? vF : (k === "fx" ? vX : vU)))); }
  function endOuts() { var e; while (outing.length) { e = outing.pop(); e.classList.remove("is-out"); if (e !== viewEl(view)) { e.hidden = true; } } }
  function startOut(e) {                                       // the old content stays 240 ms, leaving toward the old tab (absolute, so the island height already follows the NEW content)
    endOuts(); e.hidden = false; e.classList.remove("is-in", "is-fade"); void e.offsetWidth; e.classList.add("is-out"); outing.push(e);
    setTimeout(function () { var i = outing.indexOf(e); if (i >= 0) { outing.splice(i, 1); e.classList.remove("is-out"); if (e !== viewEl(view)) { e.hidden = true; } } }, 260);
  }
  function fadeView() { var e = viewEl(view); [vT, vS, vK, vF, vX, vU].forEach(function (v) { v.classList.remove("is-in", "is-fade", "is-out"); }); void e.offsetWidth; e.classList.add("is-fade"); }   // open: content fades in 260 - 520 ms

  // ---------- geometry ----------
  function collapsedSize() {
    var hov = cEl.classList.contains("is-hov"), base = cEl.offsetWidth - cTw.offsetWidth;      // everything but the wrapper (its width is animating)
    var w = base + (hov ? cTw.scrollWidth : 0) + 2 * (hov ? PAD : PAD_C);   // the time (clock too) opens only while the pointer is on the island
    return { w: Math.max(COL_H, w), h: COL_H };
  }
  function expandedSize() {
    var w = Math.min(X_MAX, Math.max(220, window.innerWidth - 16));
    xEl.style.width = w + "px";
    return { w: w, h: xEl.offsetHeight };
  }
  var sizeKey = "";
  function applySize(force) {
    if (!root) { return; }
    var key = open ? ("x|" + view + "|" + (view === "fav" ? fKey + "|" + boxN : "") + "|" + (tSet.hidden ? 1 : 0) + (view === "fx" ? "|" + fxRev : "") + "|" + window.innerWidth + (view === "u" && banner ? "|" + banner.className + "|" + (bEl.sub ? bEl.sub.textContent.length : 0) : ""))
                   : ("c|" + (cEl.className) + "|" + cTime.textContent.length + "|" + cUtx.textContent.length);
    if (!force && key === sizeKey) { return; }                  // no layout read when nothing changed (the 1 s tick)
    sizeKey = key;
    var s = open ? expandedSize() : collapsedSize();
    root.style.width = s.w + "px"; root.style.height = s.h + "px";
    root.style.borderRadius = (open ? 26 : Math.round(s.h / 2)) + "px";
  }

  function setHover(h) {                                      // pointer on the island -> the time opens; pointer away -> icon only
    hover = h; if (!cEl) { return; }
    cEl.classList.toggle("is-hov", h);
    if (!open) { applySize(); }
    if (fxT) { clearTimeout(fxT); fxT = 0; }
    if (!h && open && view === "fx") {                         // the Effects tab closes itself when the pointer leaves (to pick a layer in the timeline)
      fxT = setTimeout(function () { fxT = 0; if (open && view === "fx" && !hover) { setOpen(false); } }, 420);
    }
  }
  function setOpen(o) {
    if (o === open) { return; }
    build(); open = o;
    root.classList.toggle("is-open", o); root.setAttribute("aria-expanded", o ? "true" : "false");
    rollReset(tBig); rollReset(sBig); rollReset(cTime); rollReset(kBig); rollReset(kSec);          // the node that comes into view draws plain once (no roll through old digits)
    if (o) { view = upd ? "u" : (fxOn ? "fx" : ((activeOf("timer") || activeOf("sw")) ? effective() : sel)); if (view !== "u" && view !== "fx") { sel = view; } root.setAttribute("data-dir", "next"); }
    barKey = ""; fixOn(); paint(false);
    if (o) { endOuts(); enterBar(); fadeView(); } else { root.classList.remove("is-sw"); }
    if (!o) {
      try { if (root.contains(document.activeElement)) { document.activeElement.blur(); } } catch (e) { }
      holdUntil = Date.now() + 460; setTimeout(function () { paint(false); }, 480);
    }
  }

  // widgets that are live fly toward the island when the idle UI hides: where is the island centre relative to each widget centre?
  function aim() {
    if (!enabled()) { return; }
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
  function visibleWanted() { return open || Date.now() < holdUntil || !idle() || quiet(); }      // always on screen (also after the timer finished); only the idle screen's own widgets replace it

  // ---------- pin ----------
  var X_SVG = '<svg viewBox="0 0 24 24" width="10" height="10" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round"/></svg>';
  function favItems() { try { return (window.MTPro && window.MTPro.favItems) ? window.MTPro.favItems() : []; } catch (e) { return []; } }
  function paintFav() {
    var items = favItems(), ids = items.map(function (it) { return it.tab + "|" + it.tool.id; }), key = ids.join(",");
    if (key === fKey && fGrid.childNodes.length === items.length) { return; }
    var first = fKey === "\u0000";                                   // first paint after the view was (re)opened: tiles stagger in; later changes: only the new tile pops
    fKey = key; fGrid.innerHTML = ""; fGrid.classList.toggle("is-stag", first);
    items.forEach(function (it, n) {
      var id = it.tab + "|" + it.tool.id, t = el("div", "mi-ftile"), b = btn("mi-fbtn", "", it.tool.name), img = window.__MT && window.__MT.toolImg ? window.__MT.toolImg(it.tab, it.tool.id) : null, rm = btn("mi-frm", X_SVG, "Unpin " + it.tool.name);
      t.style.setProperty("--i", String(Math.min(n, 7)));            // stagger budget: 8 x 35 ms < 300 ms
      if (!first && fPrev.indexOf(id) < 0) { t.classList.add("is-new"); }
      b.innerHTML = '<span class="mi-fimg"></span><span class="mi-fcode"></span><span class="mi-fname"></span>';
      b.querySelector(".mi-fcode").textContent = it.tool.code; b.querySelector(".mi-fname").textContent = it.tool.name;
      if (img) { b.querySelector(".mi-fimg").style.backgroundImage = 'url("' + img + '")'; b.classList.add("has-img"); }
      b.title = it.tool.name;
      b.addEventListener("click", function (e) { e.stopPropagation(); if (window.__MT && window.__MT.runTool) { window.__MT.runTool(b, it.tab, it.tool); } });
      rm.title = "Unpin";
      rm.addEventListener("click", function (e) {
        e.stopPropagation();
        var done = function () { if (window.MTPro) { window.MTPro.favRemove(it.tab, it.tool.id); } };
        if (document.documentElement.getAttribute("data-reduce-motion") === "true") { done(); return; }
        t.classList.add("is-out"); setTimeout(done, 150);              // exit is shorter than the entrance: shrink + fade, then the grid closes the gap
      });
      t.appendChild(b); t.appendChild(rm); fGrid.appendChild(t);
    });
    fPrev = ids;
    setTxt(fCount, items.length ? (items.length === 1 ? "1 pinned" : items.length + " pinned") : "Pin");
    fHead.hidden = !items.length && boxN > 0; fClear.hidden = !items.length; fEmpty.hidden = !!items.length || boxN > 0; fGrid.hidden = !items.length;
  }
  function onFavChange() { if (!root) { return; } fKey = "\u0001"; if (open && view === "fav") { paint(false); } else if (open) { applySize(); } }

  // a tool tile or a box dragged from the Tools tab: the capsule opens on Pin, the drop pins the tile (it stays where it was) / moves the box in
  function dragKind(e) { var t = e.dataTransfer && e.dataTransfer.types, i; if (!t) { return ""; } for (i = 0; i < t.length; i++) { if (t[i] === "text/mt-tool") { return "tool"; } if (t[i] === "text/mt-box") { return "box"; } } return ""; }
  function isToolDrag(e) { return !!dragKind(e); }
  function bindDrop() {
    root.addEventListener("dragenter", function (e) {
      if (!isToolDrag(e)) { return; }
      e.preventDefault(); dropDepth++; root.classList.add("is-drop");
      if (!open) { setOpen(true); }
      if (view !== "fav") { pick("fav"); }
    });
    root.addEventListener("dragover", function (e) { if (!isToolDrag(e)) { return; } e.preventDefault(); try { e.dataTransfer.dropEffect = dragKind(e) === "box" ? "move" : "copy"; } catch (er) { } });
    root.addEventListener("dragleave", function (e) { if (!isToolDrag(e)) { return; } dropDepth = Math.max(0, dropDepth - 1); if (!dropDepth) { root.classList.remove("is-drop"); } });
    root.addEventListener("drop", function (e) {
      if (!isToolDrag(e)) { return; }
      e.preventDefault(); e.stopPropagation(); dropDepth = 0; root.classList.remove("is-drop");
      if (dragKind(e) === "box") {
        var bk = ""; try { bk = e.dataTransfer.getData("text/mt-box"); } catch (erb) { }
        document.documentElement.classList.remove("mt-dragging-tool");
        setTimeout(function () { var ok = window.MTBoxes && window.MTBoxes.pin(bk); if (ok) { try { window.__MT.toast("Pinned."); } catch (er3) { } } }, 0);   // after dragend, so the moved header cannot cancel it
        return;
      }
      var v = ""; try { v = e.dataTransfer.getData("text/mt-tool"); } catch (er) { }
      var p = v.split("|"), added = false;
      if (p.length === 2 && window.MTPro && window.MTPro.favAdd) { added = window.MTPro.favAdd(p[0], p[1]); }
      try { window.__MT.toast(added ? "Pinned to the island." : "Already pinned."); } catch (er2) { }
      document.documentElement.classList.remove("mt-dragging-tool");
    });
    document.addEventListener("dragend", function () { dropDepth = 0; if (root) { root.classList.remove("is-drop"); } }, true);
  }

  // ---------- paint ----------
  function stateBtn(b, running, label, running_txt, idle_txt) {
    var ic = running ? "pause" : "play";
    if (b._ic !== ic) { b.innerHTML = (running ? PAUSE : PLAY) + "<span>" + (running ? "Pause" : idle_txt) + "</span>"; b._ic = ic; b._tx = running ? "Pause" : idle_txt; }
    else if (!running && b._tx !== idle_txt) { b.lastChild.textContent = idle_txt; b._tx = idle_txt; }
    b.setAttribute("aria-label", label);
  }

  function paint(viewChanged) {
    build();
    var t = data.timer, s = data.sw, eff = effective(), was = shown;
    upd = !!(banner && banner.classList.contains("is-show")); updBusy = upd && banner.classList.contains("is-busy");
    if (updBusy && !open && root.classList && (idle() ? quiet() : true)) { setOpen(true); }      // an install started: show its progress
    if (view === "u" && !upd) { view = effective(); root.setAttribute("data-dir", "prev"); viewChanged = true; }
    var want = visibleWanted();
    if (!enabled() && !upd) { want = false; }                   // switched off in Settings: only an update notice may show it
    if (t && typeof t.h === "number" && document.activeElement !== hIn && document.activeElement !== mIn) { cfg.h = t.h; cfg.m = t.m; }

    if (!open) {                                                // collapsed: ONE icon + digits (the hidden panel is not touched every second)
      var showU = upd && (!enabled() || updBusy || !(activeOf("timer") || activeOf("sw")));
      cEl.classList.toggle("is-u", showU); cEl.classList.toggle("has-upd", upd); cEl.classList.toggle("is-busy", showU && updBusy);
      if (showU) {
        var ti = bEl.title ? bEl.title.textContent : "Update", sb = bEl.sub ? bEl.sub.textContent : "", vm = /v[\d.]+\s*$/.exec(sb);
        setTxt(cUtx, ti === "Update available" ? "Update" + (vm ? " " + vm[0].replace(/\s+/g, "") : "") : ti);
      }
      root.setAttribute("data-tool", eff);
      cEl.classList.toggle("is-t", eff === "timer"); cEl.classList.toggle("is-s", eff === "sw"); cEl.classList.toggle("is-k", eff === "clock" && !showU);
      var cdd = eff === "timer" ? t : s;
      if (lastEff !== eff) { rollReset(cTime); lastEff = eff; }
      if (eff === "clock") {
        var kn = clockNow();
        if (!showU) { digits(cTime, kn.hm + (kn.mer ? " " + kn.mer : "")); }
        cEl.classList.remove("is-done", "is-paused", "is-running");
      } else if (cdd) {
        if (eff === "sw" && lastHid !== undefined && !!cdd.hidden !== lastHid) { dswap(cTime, cdd.text); } else { digits(cTime, cdd.text); }
        if (eff === "timer") { cIco.style.setProperty("--p", String(Math.max(0, Math.min(1, cdd.frac || 0)) * 360) + "deg"); }
        cEl.classList.toggle("is-done", eff === "timer" && !!cdd.done);
        cEl.classList.toggle("is-paused", eff === "timer" ? !!cdd.paused : !!(s && s.paused));
        cEl.classList.toggle("is-running", eff === "timer" ? !!cdd.running : !!(s && s.running));
      }
    } else {
      // expanded: tab bar (v20)
      var fxVis = fxOn || view === "fx";
      tb.timer.el.classList.toggle("is-live", !!(t && t.active)); tb.sw.el.classList.toggle("is-live", !!(s && s.active)); tb.fx.el.classList.toggle("is-live", fxOn);
      tb.fx.vis = fxVis; tb.u.vis = upd; tb.fx.el.classList.toggle("is-vis", fxVis); tb.u.el.classList.toggle("is-vis", upd);
      ORDER.forEach(function (k) { var on = view === k; tb[k].el.classList.toggle("is-on", on); tb[k].el.setAttribute("aria-selected", on ? "true" : "false"); tb[k].el.tabIndex = tb[k].vis ? (on ? 0 : -1) : -1; tb[k].el.setAttribute("aria-hidden", tb[k].vis ? "false" : "true"); });
      var cur = viewEl(view);
      if (viewChanged && lastEl && lastEl !== cur && !reduce()) { startOut(lastEl); }
      [vT, vS, vK, vF, vX, vU].forEach(function (v) { v.hidden = v !== cur && !v.classList.contains("is-out"); });
      if (viewChanged) { cur.classList.remove("is-in", "is-fade"); void cur.offsetWidth; cur.classList.add("is-in"); }
      lastEl = cur;
      var bk = view + "|" + (fxVis ? 1 : 0) + "|" + (upd ? 1 : 0) + "|" + window.innerWidth;
      if (viewChanged || bk !== barKey) { var kchg = bk !== barKey; barKey = bk; if (kchg) { measure(); } placePill(viewChanged); }

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
      if (view === "fav") { paintFav(); }
      if (view === "clock") {
        var cn = clockNow();
        digits(kBig, cn.hm); digits(kSec, ":" + pad2(cn.s)); setTxt(kMer, cn.mer);
        setTxt(kDate, DAYS[cn.d.getDay()] + ", " + cn.d.getDate() + " " + MONTHS[cn.d.getMonth()]);
        k24.classList.toggle("is-on", !is12()); k12.classList.toggle("is-on", is12());
      }
      if (view === "sw" && s) {
        if (lastHid !== undefined && !!s.hidden !== lastHid) { dswap(sBig, s.text); } else { digits(sBig, s.text); }
        setTxt(sHide, s.hidden ? "Show time" : "Hide time"); sHide.setAttribute("aria-label", s.hidden ? "Show stopwatch time" : "Hide stopwatch time");
        sBig.classList.toggle("is-paused", !!s.paused);
        stateBtn(sPlay, !!s.running, s.running ? "Pause stopwatch" : (s.paused ? "Resume stopwatch" : "Start stopwatch"), "Pause", s.paused ? "Resume" : "Start");
        sRst.disabled = !s.active;
      }
    }

    applySize();
    shown = want; root.classList.toggle("is-on", want);        // written every time: a missed change can never leave the island hidden
    if (s) { lastHid = !!s.hidden; }
    var arrived = upd && !updWas; updWas = upd;
    var done = !!(t && t.done);
    if ((arrived || (done && !wasDone)) && want && !open && root.animate && !reduce()) {            // time is up: one jelly pulse
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
    build(); bindSetting(); fixOn();
    try {
      new MutationObserver(function () { aim(); paint(false); }).observe(body(), { attributes: true, attributeFilter: ["class"] });   // idle / quiet changed
    } catch (e) { }
    window.addEventListener("resize", function () { aim(); applySize(true); if (open) { measure(); placePill(false); } });
    /* v12: mouse wheel over the OPEN island = next / previous tool (Timer, Stopwatch, Clock, Update). A window-capture listener, so it runs before
       js/smooth-scroll.js (document capture) and the panel behind never scrolls. Left alone: the hour / minute steppers (they use the wheel to change the number)
       and the scrollable release notes. One notch = one step; a touchpad collects ~60 px per step; 380 ms pause after each switch, no wrap-around. */
    var wAcc = 0, wLast = 0, wLock = 0;
    window.addEventListener("wheel", function (e) {
      if (!open || !root || !root.contains(e.target) || e.ctrlKey) { return; }
      var t = e.target, n = t;
      while (n && n !== root) { if (n.classList && (n.classList.contains("mi-step") || n.classList.contains("mt-update-notes") || ((n.classList.contains("mi-fgrid") || n.classList.contains("mi-boxes")) && n.scrollHeight > n.clientHeight + 1))) { return; } n = n.parentNode; }
      e.preventDefault(); e.stopPropagation();
      var now = Date.now(), dy = e.deltaY || 0;
      if (e.deltaMode === 1) { dy *= 33; }
      if (now - wLast > 260) { wAcc = 0; } wLast = now;
      if (now < wLock) { return; }
      wAcc += dy;
      if (Math.abs(wAcc) < 60) { return; }
      var c = cycle(), i = c.indexOf(view), j = i + (wAcc > 0 ? 1 : -1); wAcc = 0;
      if (j < 0 || j >= c.length) { return; }
      wLock = now + 380; pick(c[j]);
    }, { passive: false, capture: true });
    kTick = setInterval(tickClock, 1000);                       // only repaints while the clock is what is on screen (nothing else ticks when no timer runs)
    /* v8: a click INSIDE the NeuCurve iframe never reaches this document, so the "click outside" listener (pointerdown, above)
       could not collapse the island. Two ways in: (1) focus moving into an iframe blurs this window; (2) a pointerdown listener
       inside the (same-origin file://) frame itself, re-attached on every frame load, covers a frame that already had focus. */
    window.addEventListener("blur", function () {
      var a = document.activeElement;
      if (open && a && a.tagName === "IFRAME") { setOpen(false); }
    });
    var cf = document.getElementById("curve-frame");
    function hookFrame() {
      try {
        var d = cf.contentDocument;
        if (d && !d.__mtIsl) { d.__mtIsl = 1; d.addEventListener("pointerdown", function () { if (open) { setOpen(false); } }, true); }
      } catch (e) { }
    }
    if (cf) { cf.addEventListener("load", hookFrame); hookFrame(); }
    paint(false);
  }

  function applyEnabled() {
    markEnabled();
    if (window.MTBoxes) { try { window.MTBoxes.sync(); } catch (eB) { } }          // off: the boxes go back to their tab; on: remembered boxes on screen move in again
    if (!enabled() && open && view !== "u") { setOpen(false); }   // an open timer / stopwatch panel closes with it
    paint(false);
  }
  function bindSetting() {
    var c = $("island-enabled"), rs = $("settings-reset");
    if (c) {
      c.checked = enabled();
      c.addEventListener("change", function () { try { if (c.checked) { localStorage.removeItem(ON_KEY); } else { localStorage.setItem(ON_KEY, "0"); } } catch (e) { } applyEnabled(); });
    }
    if (rs) { rs.addEventListener("click", function () { try { localStorage.removeItem(ON_KEY); } catch (e) { } if (c) { c.checked = true; } applyEnabled(); }); }   // Reset everything
  }

  function boxesChanged(n) {
    boxN = n || 0; if (!root) { return; }
    fBoxWrap.hidden = !boxN; fKey = "\u0001";
    if (open && view === "fav") { paint(false); } else if (open) { applySize(true); }
  }
  function fxDot(on) {
    on = !!on; if (on === fxOn) { return; }
    fxOn = on; if (!root) { return; }
    root.classList.toggle("is-fx", on);
    if (open) { paint(false); }
  }
  function fxChanged() { fxRev++; if (open && view === "fx") { applySize(true); } }
  function fxClose() { if (open && view === "fx") { setOpen(false); } }
  function focusBoxes() { build(); if (!open) { setOpen(true); } if (view !== "fav") { pick("fav"); } }
  window.MTIsland = { fxHost: function () { build(); return vX; }, fxDot: fxDot, fxChanged: fxChanged, fxClose: fxClose, boxHost: function () { build(); return fBoxes; }, boxesChanged: boxesChanged, focusBoxes: focusBoxes, isEnabled: enabled, update: update, aim: aim, refresh: applyEnabled, onToggle: null, onReset: null, onSetTime: null, onToggleHide: null };
  if (document.readyState === "loading") { document.addEventListener("DOMContentLoaded", init); } else { init(); }
})();
