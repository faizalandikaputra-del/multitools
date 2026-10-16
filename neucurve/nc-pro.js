/* NeuCurve - nc-pro.js (v1)   PANEL side of the new Graph / Handle / Hotkey settings (UI: nc-pro-settings.js, CSS: nc-pro.css).
   Reads the same localStorage keys ("neucurve_*") and listens to the same "com.neucurve.sync" CSEvent + "storage" event as the other NeuCurve modules.
     Grid       gridShow gridLabels gridX gridY gridStyle gridOp gridW gridColor
                gridX / gridY / gridColor are read by the patched grid code in assets/index.js through window.__ncGD (set below, BEFORE the bundle runs);
                everything else is CSS gated by html[data-nc-*] attributes, so nothing changes until a setting is touched.
     Line       lineW lineStyle lineGlow
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
    var lg = Math.round(nm("lineGlow", 0, 20, 0)); flag("data-nc-lg", lg > 0); cssv("--nc-lg", lg + "px");

    var hg = Math.round(nm("hGlow", 0, 20, 0)); flag("data-nc-hglow", hg > 0); cssv("--nc-hglow", hg + "px");
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
    speedGraph: function () { return byTitle("Speed Graph"); }
  };
  function press(action) {
    var f = TARGET[action], b = f ? f() : null;
    if (!b || b.disabled) { return false; }
    b.classList.remove("nc-hk-flash"); void b.offsetWidth; b.classList.add("nc-hk-flash");
    setTimeout(function () { b.classList.remove("nc-hk-flash"); }, 260);
    b.click();
    return true;
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
        press(a);
        return;
      }
    }
  }
  window.addEventListener("keydown", onKey, true);

  /* After Effects keeps most key presses for itself. Telling CEP which keys the panel wants makes them arrive here. */
  var lastInterest = "";
  function registerKeys() {
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
      var json = JSON.stringify(list);
      if (json === lastInterest) { return; }
      lastInterest = json;
      if (list.length) { new window.CSInterface().registerKeyEventsInterest(json); }
    } catch (e) { }
  }

  /* ---------------- sync ---------------- */
  window.addEventListener("storage", function (e) { if (e.key && e.key.indexOf(P) === 0) { soon(); } });
  function hookCep() { try { if (window.CSInterface) { new window.CSInterface().addEventListener("com.neucurve.sync", soon); } } catch (e) { } }
  hookCep();
  if (document.readyState === "loading") { document.addEventListener("DOMContentLoaded", function () { hookCep(); soon(); }); } else { soon(); }
  apply();
  window.NCPro = { apply: apply, press: press };
})();
