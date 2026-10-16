/* NeuCurve - nc-pro-settings.js (v1)   WINDOW side of the new Graph / Handle effects / Hotkeys settings (neucurve/settings.html).
   Same storage + sync as nc-settings.js: localStorage "neucurve_<key>" and the "com.neucurve.sync" CSEvent, which nc-pro.js (the Curve tab) applies.
   Load AFTER nc-settings.js. Plain ES5. */
(function () {
  "use strict";
  var APP_ID = "nc-settings-pro";
  var DEF = {
    gridShow: "1", gridLabels: "1", gridX: "6", gridY: "5", gridStyle: "solid", gridOp: "100", gridW: "1", gridColor: "#ffffff",
    lineW: "2.5", lineStyle: "solid", lineGlow: "0",
    hGlow: "0", hHover: "0", hGuides: "1", hGuideStyle: "solid", hGuideOp: "100", hLabels: "1",
    hotkeysOn: "1", hotkeys: "",
    cardStyle: "grid", cardShape: "soft",
    /* defaults of keys that nc-settings.js owns (needed by the page / group Reset buttons) */
    uiColor: "#FFFFFF", graphLineColor: "#FFFFFF", handleColor: "#FFFFFF",
    bgImagePath: "", bgOpacity: "1", bgOrig: "false", gWp: "", gHp: "", gWl: "", gHl: "",
    hStyle: "circle", hSize: "4.5", hLine: "1.2", hImg: "",
    autoApply: "false", overshoot: "true", liveBall: "1", layoutMode: "auto",
    hidePresets: "false", hideGraph: "false", showPresetNames: "true"
  };
  var GROUPS = {
    grid: ["gridShow", "gridLabels", "gridX", "gridY", "gridStyle", "gridOp", "gridW", "gridColor"],
    line: ["lineW", "lineStyle", "lineGlow"],
    handle: ["hGlow", "hHover", "hGuides", "hGuideStyle", "hGuideOp", "hLabels"],
    colors: ["uiColor", "graphLineColor", "handleColor"],
    media: ["bgImagePath", "bgOpacity", "bgOrig", "gWp", "gHp", "gWl", "gHl"],
    handleStyle: ["hStyle", "hSize", "hLine", "hImg"],
    behavior: ["autoApply", "overshoot", "liveBall", "layoutMode"],
    view: ["hidePresets", "hideGraph"],
    cards: ["cardStyle", "cardShape", "showPresetNames"]
  };
  /* keys that must be WRITTEN with their default (not removed): colors fall back to a migrated old yellow otherwise; empty strings are removed */
  var WRITE_DEF = { colors: 1, handleStyle: 1, behavior: 1, view: 1, cards: 1 };
  var ACTIONS = [
    ["apply", "Apply", "Apply the curve to the selected keyframes"],
    ["ease", "Ease", "Apply the Ease preset"],
    ["easeIn", "Ease In", "Apply the Ease In preset"],
    ["easeOut", "Ease Out", "Apply the Ease Out preset"],
    ["invert", "Invert curve", "Swap the curve upside down"],
    ["preview", "Preview", "Play the curve preview"],
    ["readAE", "Read from AE", "Read the selected keyframes into the graph"],
    ["savePreset", "Save as preset", "Save the current curve as a preset"],
    ["removeExpr", "Remove expressions", "Remove NeuCurve expressions from the selection"],
    ["speedGraph", "Speed graph", "Switch to the speed graph"]
  ];
  var IS_MAC = /Mac/i.test(navigator.platform || "");
  function $(id) { return document.getElementById(id); }
  function read(k) { var v = null; try { v = localStorage.getItem("neucurve_" + k); } catch (e) { } return v === null ? DEF[k] : v; }
  function write(k, v) { try { localStorage.setItem("neucurve_" + k, String(v)); } catch (e) { } }
  function drop(k) { try { localStorage.removeItem("neucurve_" + k); } catch (e) { } }

  var bQueue = {}, bTimer = 0;
  function broadcastNow(k, v) {
    try {
      var CE = window.CSEvent || (typeof CSEvent !== "undefined" ? CSEvent : null);
      if (!CE || !window.CSInterface) { return; }
      var ev = new CE("com.neucurve.sync", "APPLICATION");
      ev.data = JSON.stringify({ key: k, val: String(v), appId: APP_ID });
      new window.CSInterface().dispatchEvent(ev);
    } catch (e) { }
  }
  function flush() { var q = bQueue, k; bQueue = {}; bTimer = 0; for (k in q) { if (q.hasOwnProperty(k)) { broadcastNow(k, q[k]); } } }
  function set(k, v) { write(k, v); bQueue[k] = v; if (!bTimer) { bTimer = setTimeout(flush, 40); } }
  window.addEventListener("beforeunload", flush);

  var syncers = [];
  function txt(node, t) { if (node && node.textContent !== t) { node.textContent = t; } }
  function range(id, key, valueId, fmt) {
    var inp = $(id); if (!inp) { return; }
    inp.addEventListener("input", function () { set(key, inp.value); refresh(); });
    syncers.push(function () { if (document.activeElement !== inp) { inp.value = read(key); } txt($(valueId), fmt(parseFloat(inp.value))); });
  }
  function check(id, key, onVal, offVal, isOn) {
    var el = $(id); if (!el) { return; }
    el.addEventListener("change", function () { set(key, el.checked ? onVal : offVal); refresh(); });
    syncers.push(function () { el.checked = isOn(); });
  }
  function seg(id, key) {
    var box = $(id); if (!box) { return; }
    var bs = box.querySelectorAll("button"), i;
    for (i = 0; i < bs.length; i++) {
      bs[i].addEventListener("click", function (e) { set(key, e.currentTarget.getAttribute("data-v")); refresh(); });
    }
    syncers.push(function () {
      var cur = read(key), j;
      for (j = 0; j < bs.length; j++) { bs[j].classList.toggle("is-selected", bs[j].getAttribute("data-v") === cur); }
    });
  }
  function resetGroup(btnId, name) {
    var b = $(btnId); if (!b) { return; }
    b.addEventListener("click", function () {
      GROUPS[name].forEach(function (k) {
        if (WRITE_DEF[name] && DEF[k] !== "") { write(k, DEF[k]); } else { drop(k); }
        bQueue[k] = DEF[k];
      });
      if (!bTimer) { bTimer = setTimeout(flush, 40); }
      refresh();
    });
  }
  function px(v) { return (Math.round(v * 10) / 10) + "px"; }
  function pct(v) { return Math.round(v) + "%"; }
  function num(v) { return String(Math.round(v)); }

  /* ---------------- hotkeys ---------------- */
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
    var raw = read("hotkeys"), o = {};
    if (!raw) { return o; }
    try { o = JSON.parse(raw) || {}; } catch (e) { o = {}; }
    return (o && typeof o === "object") ? o : {};
  }
  function hkSave(o) { var k, any = false; for (k in o) { if (o.hasOwnProperty(k) && o[k]) { any = true; } } if (any) { set("hotkeys", JSON.stringify(o)); } else { drop("hotkeys"); bQueue.hotkeys = ""; if (!bTimer) { bTimer = setTimeout(flush, 40); } } }
  function shown(c) { return IS_MAC ? c.replace("Ctrl+", "Cmd+") : c; }
  var recording = "", hkNote = null;

  function buildHotkeys() {
    var list = $("ncpHkList"); if (!list) { return; }
    var html = "", i, a;
    for (i = 0; i < ACTIONS.length; i++) {
      a = ACTIONS[i];
      html += '<div class="settings-row ncp-hk-row"><span class="ncp-hk-name"><b>' + a[1] + '</b><small>' + a[2] + '</small></span>' +
        '<span class="ncp-hk-ctrl"><button type="button" class="ncp-hk-btn" data-hk="' + a[0] + '">Not set</button>' +
        '<button type="button" class="ncp-hk-x" data-hk-clear="' + a[0] + '" aria-label="Clear ' + a[1] + ' hotkey" title="Clear">&times;</button></span></div>';
    }
    list.innerHTML = html;
    hkNote = $("ncpHkNote");
    list.addEventListener("click", function (e) {
      var t = e.target, name;
      while (t && t !== list && !(t.getAttribute && (t.getAttribute("data-hk") || t.getAttribute("data-hk-clear")))) { t = t.parentNode; }
      if (!t || t === list) { return; }
      name = t.getAttribute("data-hk-clear");
      if (name) { var m = hkMap(); delete m[name]; hkSave(m); recording = ""; refresh(); return; }
      name = t.getAttribute("data-hk");
      recording = recording === name ? "" : name;
      if (hkNote) { hkNote.textContent = recording ? "Press the keys you want. Esc cancels, Backspace clears." : ""; }
      refresh();
    });
    syncers.push(function () {
      var m = hkMap(), bs = list.querySelectorAll(".ncp-hk-btn"), j, n, c;
      for (j = 0; j < bs.length; j++) {
        n = bs[j].getAttribute("data-hk"); c = m[n] && m[n].c;
        var label = recording === n ? "Press keys..." : (c ? shown(c) : "Not set");
        txt(bs[j], label);
        bs[j].classList.toggle("is-rec", recording === n);
        bs[j].classList.toggle("is-set", !!c && recording !== n);
        var x = list.querySelector('[data-hk-clear="' + n + '"]'); if (x) { x.hidden = !c; }
      }
    });
    window.addEventListener("keydown", function (e) {
      if (!recording) { return; }
      e.preventDefault(); e.stopPropagation();
      if (e.key === "Escape") { recording = ""; if (hkNote) { hkNote.textContent = ""; } refresh(); return; }
      if (e.key === "Backspace" || e.key === "Delete") { var m0 = hkMap(); delete m0[recording]; hkSave(m0); recording = ""; if (hkNote) { hkNote.textContent = ""; } refresh(); return; }
      var c = comboOf(e); if (!c) { return; }
      var m = hkMap(), k, taken = "";
      for (k in m) { if (m.hasOwnProperty(k) && k !== recording && m[k] && m[k].c === c) { taken = k; delete m[k]; } }
      m[recording] = { c: c, k: e.keyCode || e.which || 0 };
      hkSave(m);
      if (hkNote) {
        var takenName = ""; ACTIONS.forEach(function (a) { if (a[0] === taken) { takenName = a[1]; } });
        hkNote.textContent = taken ? ("Moved from " + takenName + " to this action.") : "";
      }
      recording = ""; refresh();
    }, true);
    window.addEventListener("blur", function () { if (recording) { recording = ""; refresh(); } });
    var rs = $("ncpHkReset");
    if (rs) { rs.addEventListener("click", function () { recording = ""; hkSave({}); if (hkNote) { hkNote.textContent = ""; } refresh(); }); }
  }

  /* "Reset this page": presses every Reset button of the visible section. Two clicks (the first one arms it) so it cannot happen by accident. */
  function initSectionReset() {
    var b = $("ncpSectionReset"), armed = 0, t = 0;
    if (!b) { return; }
    function disarm() { armed = 0; clearTimeout(t); b.classList.remove("is-armed"); b.textContent = "Reset this page"; }
    b.addEventListener("click", function () {
      if (!armed) { armed = 1; b.classList.add("is-armed"); b.textContent = "Click again to reset"; t = setTimeout(disarm, 3000); return; }
      disarm();
      var sec = document.querySelector(".settings-section.is-active"), bs, i;
      if (!sec) { return; }
      bs = sec.querySelectorAll(".settings-group-header-with-action > button");
      for (i = 0; i < bs.length; i++) {
        if (bs[i].id === "settingsClearBackground" || bs[i].id === "settingsClearHandleImage") { continue; }   /* "Clear" buttons only clear the image; the group Reset covers it */
        if (!bs[i].disabled) { bs[i].click(); }
      }
      setTimeout(refresh, 80);
    });
    b.addEventListener("blur", disarm);
  }

  function refresh() { var i; for (i = 0; i < syncers.length; i++) { try { syncers[i](); } catch (e) { } } }

  function init() {
    check("ncpGridShow", "gridShow", "1", "0", function () { return read("gridShow") !== "0"; });
    check("ncpGridLabels", "gridLabels", "1", "0", function () { return read("gridLabels") !== "0"; });
    range("ncpGridX", "gridX", "ncpGridXValue", num);
    range("ncpGridY", "gridY", "ncpGridYValue", num);
    seg("ncpGridStyle", "gridStyle");
    range("ncpGridOp", "gridOp", "ncpGridOpValue", pct);
    range("ncpGridW", "gridW", "ncpGridWValue", px);
    resetGroup("ncpGridReset", "grid");

    range("ncpLineW", "lineW", "ncpLineWValue", px);
    seg("ncpLineStyle", "lineStyle");
    range("ncpLineGlow", "lineGlow", "ncpLineGlowValue", px);
    resetGroup("ncpLineReset", "line");

    range("ncpHGlow", "hGlow", "ncpHGlowValue", px);
    check("ncpHHover", "hHover", "1", "0", function () { return read("hHover") === "1"; });
    check("ncpHGuides", "hGuides", "1", "0", function () { return read("hGuides") !== "0"; });
    seg("ncpHGuideStyle", "hGuideStyle");
    range("ncpHGuideOp", "hGuideOp", "ncpHGuideOpValue", pct);
    check("ncpHLabels", "hLabels", "1", "0", function () { return read("hLabels") !== "0"; });
    resetGroup("ncpHandleFxReset", "handle");

    /* preset cards: layout style (Grid / List / Compact) + corner shape; nc-view.js turns them into classes on <html> of the Curve tab */
    seg("ncpCardStyle", "cardStyle");
    seg("ncpCardShape", "cardShape");
    resetGroup("ncpCardsReset", "cards");

    /* Reset buttons for the groups that had none */
    resetGroup("ncpColorsReset", "colors");
    resetGroup("ncpMediaReset", "media");
    resetGroup("ncpHandleReset", "handleStyle");
    resetGroup("ncpBehaviorReset", "behavior");
    resetGroup("ncpViewReset", "view");
    initSectionReset();

    check("ncpHkOn", "hotkeysOn", "1", "0", function () { return read("hotkeysOn") !== "0"; });
    buildHotkeys();
    refresh();
    window.addEventListener("storage", function (e) { if (e.key && e.key.indexOf("neucurve_") === 0) { refresh(); } });
    window.addEventListener("focus", refresh);
    setInterval(function () { if (!recording) { refresh(); } }, 1500);
  }
  if (document.readyState === "loading") { document.addEventListener("DOMContentLoaded", init); } else { init(); }
})();
