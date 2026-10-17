/* NeuCurve - nc-pro.js (v1)   PANEL side of the new Graph / Handle / Hotkey settings (UI: nc-pro-settings.js, CSS: nc-pro.css).
   Reads the same localStorage keys ("neucurve_*") and listens to the same "com.neucurve.sync" CSEvent + "storage" event as the other NeuCurve modules.
     Grid       gridShow gridLabels gridX gridY gridStyle gridOp gridW gridColor
                gridX / gridY / gridColor are read by the patched grid code in assets/index.js through window.__ncGD (set below, BEFORE the bundle runs);
                everything else is CSS gated by html[data-nc-*] attributes, so nothing changes until a setting is touched.
     Line       lineW lineStyle lineGlow   (lineGlow / hGlow -> window.__ncUG, drawn by nc-glow.js)
     Handles    hGlow hHover hGuides hGuideStyle hGuideOp hLabels
     Hotkeys    hotkeysOn hotkeys = {action: {c:"Ctrl+Shift+K", k:75}}  -> clicks the real toolbar button
   Load BEFORE assets/index.js. Plain ES5. */
(function () {
  "use strict";
  var P = "neucurve_", root = document.documentElement, ls = null;
  try { ls = window.localStorage; void ls.length; } catch (e0) { ls = null; }
  var DEF = {
    gridShow: "1", gridLabels: "1", gridX: "6", gridY: "5", gridStyle: "solid", gridOp: "100", gridW: "1", gridColor: "#ffffff",
    lineW: "2.5", lineStyle: "solid", lineGlow: "0",
    hGlow: "0", hHover: "0", hGuides: "1", hGuideStyle: "solid", hGuideOp: "100", hLabels: "1",
    hotkeysOn: "1", hotkeys: ""
  };
  function rd(k) { var v = null; try { v = ls ? ls.getItem(P + k) : null; } catch (e) { } return (v === null || v === undefined) ? DEF[k] : v; }
  function nm(k, lo, hi, d) { var v = parseFloat(rd(k)); if (!isFinite(v)) { v = d; } return Math.max(lo, Math.min(hi, v)); }
  function hexToRgb(h) {
    h = String(h || "").replace(/[^0-9a-f]/gi, "");
    if (h.length === 3) { h = h.charAt(0) + h.charAt(0) + h.charAt(1) + h.charAt(1) + h.charAt(2) + h.charAt(2); }
    if (h.length !== 6) { return "255,255,255"; }
    return parseInt(h.slice(0, 2), 16) + "," + parseInt(h.slice(2, 4), 16) + "," + parseInt(h.slice(4, 6), 16);
  }
  function flag(name, on, val) { if (on) { root.setAttribute(name, val === undefined ? "1" : val); } else { root.removeAttribute(name); } }
  function cssv(name, val) { root.style.setProperty(name, val); }

  /* the patched grid code in assets/index.js reads this on every redraw */
  window.__ncGD = { x: 6, y: 5, rgb: "255,255,255" };
  var lastGrid = "";
  function redrawGrid() {
    var f = function () { try { if (window.__ncGRedraw) { window.__ncGRedraw(); } } catch (e) { } };
    f(); setTimeout(f, 60); setTimeout(f, 320);
  }

  function apply() {
    var x = Math.round(nm("gridX", 2, 16, 6)), y = Math.round(nm("gridY", 2, 16, 5)), rgb = hexToRgb(rd("gridColor"));
    window.__ncGD.x = x; window.__ncGD.y = y; window.__ncGD.rgb = rgb;
    flag("data-nc-grid", rd("gridShow") === "0", "off");
    flag("data-nc-glabels", rd("gridLabels") === "0", "off");
    var gs = rd("gridStyle"); flag("data-nc-gs", gs === "dashed" || gs === "dotted", gs);
    var go = Math.round(nm("gridOp", 10, 100, 100)); flag("data-nc-go", go !== 100); cssv("--nc-go", String(go / 100));
    var gw = nm("gridW", 0.5, 3, 1); flag("data-nc-gw", Math.abs(gw - 1) > 0.01); cssv("--nc-gw", String(gw));

    var lw = nm("lineW", 1, 6, 2.5); flag("data-nc-lw", Math.abs(lw - 2.5) > 0.01); cssv("--nc-lw", String(lw));
    var ls2 = rd("lineStyle"); flag("data-nc-ls", ls2 === "dashed" || ls2 === "dotted", ls2);
    var lg = Math.round(nm("lineGlow", 0, 20, 0));   /* glow is drawn by nc-glow.js (SVG strokes); CSS drop-shadow is not rendered in After Effects' CEF */

    var hg = Math.round(nm("hGlow", 0, 20, 0));
    var ugKey = lg + "|" + hg, ugOld = window.__ncUG ? window.__ncUG.line + "|" + window.__ncUG.handle : "";
    window.__ncUG = { line: lg, handle: hg };
    if (ugKey !== ugOld) { try { if (window.__ncGlowSync) { window.__ncGlowSync(); } } catch (eg) { } }
    flag("data-nc-hh", rd("hHover") === "1", "on");
    flag("data-nc-hg", rd("hGuides") === "0", "off");
    flag("data-nc-hgs", rd("hGuideStyle") === "dashed", "dashed");
    var ho = Math.round(nm("hGuideOp", 10, 100, 100)); flag("data-nc-hgo", ho !== 100); cssv("--nc-hgo", String(ho / 100));
    flag("data-nc-hl", rd("hLabels") === "0", "off");

    var gk = x + "|" + y + "|" + rgb;
    if (gk !== lastGrid) { var first = lastGrid === ""; lastGrid = gk; if (!first) { redrawGrid(); } }
    registerKeys();
  }
  var timer = 0;
  function soon() { if (timer) { return; } timer = setTimeout(function () { timer = 0; try { apply(); } catch (e) { } }, 30); }

  /* ---------------- hotkeys ---------------- */
  var IS_MAC = /Mac/i.test(navigator.platform || "");
  function comboOf(e) {
    var k = e.key, code = e.code || "", name;
    if (k === "Control" || k === "Shift" || k === "Alt" || k === "Meta" || k === "AltGraph" || k === "OS") { return ""; }
    if (/^Key[A-Z]$/.test(code)) { name = code.charAt(3); }
    else if (/^Digit[0-9]$/.test(code)) { name = code.charAt(5); }
    else if (k === " ") { name = "Space"; }
    else if (k && k.length === 1) { name = k.toUpperCase(); }
    else { name = k || ""; }
    if (!name) { return ""; }
    return (e.ctrlKey || e.metaKey ? "Ctrl+" : "") + (e.altKey ? "Alt+" : "") + (e.shiftKey ? "Shift+" : "") + name;
  }
  function hkMap() {
    var raw = rd("hotkeys"), o = {};
    if (!raw) { return o; }
    try { o = JSON.parse(raw) || {}; } catch (e) { o = {}; }
    return (o && typeof o === "object") ? o : {};
  }
  function q(sel) { return document.querySelector(sel); }
  function byTitle(t) {
    var bs = document.querySelectorAll("button"), i, b, tt;
    for (i = 0; i < bs.length; i++) {
      b = bs[i]; tt = b.getAttribute("title") || b.__mtTitle || b.getAttribute("data-mt-title") || b.getAttribute("aria-label") || "";
      if (tt === t) { return b; }
    }
    return null;
  }
  var TARGET = {
    apply: function () { return q(".apply-btn"); },
    ease: function () { return q(".fl-ease"); },
    easeIn: function () { return q(".fl-ein"); },
    easeOut: function () { return q(".fl-eout"); },
    invert: function () { return byTitle("Invert"); },
    preview: function () { return byTitle("Preview"); },
    readAE: function () { return byTitle("Read from AE"); },
    savePreset: function () { return q(".fl-star"); },
    removeExpr: function () { return byTitle("Remove Expressions"); },
    speedGraph: function () { return byTitle("Speed Graph"); },
    /* preset keys: nc-quick.js. A target may return {__run: fn} instead of a button. */
    presetNext: function () { return window.NCQuick ? { __run: window.NCQuick.next } : null; },
    presetPrev: function () { return window.NCQuick ? { __run: window.NCQuick.prev } : null; },
    toggleFav: function () { return window.NCQuick ? { __run: window.NCQuick.toggleFav } : null; },
    fav1: function () { return window.NCQuick ? { __run: function () { window.NCQuick.fav(1); } } : null; },
    fav2: function () { return window.NCQuick ? { __run: function () { window.NCQuick.fav(2); } } : null; },
    fav3: function () { return window.NCQuick ? { __run: function () { window.NCQuick.fav(3); } } : null; },
    fav4: function () { return window.NCQuick ? { __run: function () { window.NCQuick.fav(4); } } : null; },
    fav5: function () { return window.NCQuick ? { __run: function () { window.NCQuick.fav(5); } } : null; }
  };
  function press(action) {
    var f = TARGET[action], b = f ? f() : null;
    if (!b || b.disabled) { return false; }
    if (typeof b.__run === "function") { b.__run(); return true; }
    b.classList.remove("nc-hk-flash"); void b.offsetWidth; b.classList.add("nc-hk-flash");
    setTimeout(function () { b.classList.remove("nc-hk-flash"); }, 260);
    b.click();
    return true;
  }
  /* Triggered while another Multi Tool tab is showing: the button flash is invisible there, so say it with the panel toast. */
  var HK_LABEL = { apply: "Apply", ease: "Ease", easeIn: "Ease In", easeOut: "Ease Out", invert: "Invert", preview: "Preview", readAE: "Read from AE", savePreset: "Save preset", removeExpr: "Remove expressions", speedGraph: "Speed graph", presetNext: "Next preset", presetPrev: "Previous preset", toggleFav: "Toggle favorite" };
  function notifyOutside(a, ok) {
    try {
      var fe = window.frameElement, pane = fe && fe.closest ? fe.closest(".curve-pane") : null, mt = window.parent && window.parent.__MT;
      if (!pane || !mt || !mt.toast || pane.classList.contains("is-active")) { return; }
      mt.toast("NeuCurve: " + (HK_LABEL[a] || a) + (ok ? "" : " (not available right now)"), !ok);
    } catch (e) { }
  }
  function onKey(e) {
    if (rd("hotkeysOn") === "0" || e.repeat || e.isComposing) { return; }
    var t = e.target, tag = t && t.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || (t && t.isContentEditable)) { return; }
    var combo = comboOf(e); if (!combo) { return; }
    var map = hkMap(), a;
    for (a in map) {
      if (map.hasOwnProperty(a) && TARGET[a] && map[a] && map[a].c === combo) {
        e.preventDefault(); e.stopPropagation();
        var ok = press(a);
        notifyOutside(a, ok);
        return;
      }
    }
  }
  window.addEventListener("keydown", onKey, true);
  /* The Curve tab is an iframe inside the Multi Tool panel. After a click on the tab bar / another part of the panel the keyboard focus sits
     in the PARENT document and the iframe never sees the key. While this tab is visible, listen on the parent document too (same origin). */
  function hookParent() {
    try {
      var fe = window.frameElement, pd = window.parent && window.parent !== window ? window.parent.document : null;
      if (!fe || !pd || window.__ncPKey) { return; }
      window.__ncPKey = function (e) { if (fe.offsetWidth > 0 && fe.offsetHeight > 0) { onKey(e); } };
      pd.addEventListener("keydown", window.__ncPKey, true);
    } catch (e) { }
  }
  hookParent();
  /* keep the Curve tab's own focus too: a click anywhere in it puts the keyboard here */
  window.addEventListener("mousedown", function () { try { window.focus(); } catch (e) { } }, true);

  /* After Effects keeps most key presses for itself. Telling CEP which keys the panel wants makes them arrive here. */
  var lastInterest = "";
  function registerKeys(force) {
    try {
      if (!window.CSInterface || !window.__adobe_cep__) { return; }
      var map = hkMap(), list = [], a, h;
      if (rd("hotkeysOn") !== "0") {
        for (a in map) {
          if (!map.hasOwnProperty(a) || !TARGET[a] || !map[a] || !map[a].k) { continue; }
          h = String(map[a].c || "");
          list.push({ keyCode: map[a].k, ctrlKey: !IS_MAC && h.indexOf("Ctrl+") === 0, metaKey: IS_MAC && h.indexOf("Ctrl+") === 0, altKey: h.indexOf("Alt+") >= 0, shiftKey: h.indexOf("Shift+") >= 0 });
        }
      }
      /* the panel (js/mt-hotkeys.js) has its own keys; the list we send REPLACES the panel's, so add them */
      try {
        var praw = window.localStorage.getItem("mt.hotkeys"), po = praw ? JSON.parse(praw) : null, pa, pk = [], ph;
        if (po && po.on !== false) {
          if (po.palette) { pk.push(po.palette); } else if (po.palette === undefined) { pk.push({ c: "Ctrl+K", k: 75 }); }
          if (po.map) { for (pa in po.map) { if (po.map.hasOwnProperty(pa) && po.map[pa]) { pk.push(po.map[pa]); } } }
        } else if (!po) { pk.push({ c: "Ctrl+K", k: 75 }); }
        for (pa = 0; pa < pk.length; pa++) {
          if (!pk[pa] || !pk[pa].k) { continue; }
          ph = String(pk[pa].c || "");
          list.push({ keyCode: pk[pa].k, ctrlKey: !IS_MAC && ph.indexOf("Ctrl+") === 0, metaKey: IS_MAC && ph.indexOf("Ctrl+") === 0, altKey: ph.indexOf("Alt+") >= 0, shiftKey: ph.indexOf("Shift+") >= 0 });
        }
      } catch (eP) { }
      var json = JSON.stringify(list);
      if (json === lastInterest && !force) { return; }
      lastInterest = json;
      if (list.length) { new window.CSInterface().registerKeyEventsInterest(json); }
    } catch (e) { }
  }

  /* ---------------- sync ---------------- */
  window.addEventListener("storage", function (e) { if (e.key && e.key.indexOf(P) === 0) { soon(); } });
  /* The Settings window, the Large Graph Editor and the panel are separate CEP extensions with separate localStorage, so the "storage"
     event never arrives between them. The CSEvent carries the new value ({key, val}): write it into THIS window's localStorage first,
     exactly like nc-ball.js / nc-view.js / nc-extras.js do. Without this the Handle Effects and Graph settings never reached the panel. */
  function onSync(ev) {
    try {
      var d = ev && ev.data; if (typeof d === "string") { d = JSON.parse(d); }
      if (d && d.key && DEF.hasOwnProperty(d.key) && ls) { ls.setItem(P + d.key, String(d.val)); }
    } catch (e) { }
    soon();
  }
  function hookCep() { try { if (window.CSInterface) { new window.CSInterface().addEventListener("com.neucurve.sync", onSync); } } catch (e) { } }
  hookCep();
  if (document.readyState === "loading") { document.addEventListener("DOMContentLoaded", function () { hookCep(); soon(); }); } else { soon(); }
  apply();
  /* re-send the key list when the tab / panel gets attention again, and now and then */
  function again() { registerKeys(true); }
  window.addEventListener("focus", again);
  window.addEventListener("mouseenter", again, true);
  document.addEventListener("visibilitychange", again);
  setInterval(function () { if (!(window.__ncAway && window.__ncAway())) { again(); } }, 5000);
  /* console helper: NCPro.debug() -> what is stored, what AE was told */
  function debug() { return { on: rd("hotkeysOn"), map: hkMap(), interest: lastInterest, cep: !!window.__adobe_cep__, framed: window.parent !== window }; }
  window.NCPro = { apply: apply, press: press, debug: debug };
})();
