/* Multi Tool - mt-hotkeys.js   (PANEL side of Settings > Keyboard shortcuts, plus the Command Palette)
   What it does
     1. Builds ONE list of commands from the panel itself: tabs, Easy Layer tools, anchor / align / fit / flip, Tools tab actions,
        every Shortcutz tile (built-in and your own). Nothing is duplicated: each command calls the same Bridge function the button calls.
     2. Command Palette: a search box over that list. Default key Ctrl+K (change it in Settings > Keyboard shortcuts).
     3. Keyboard shortcuts: any command can get a key. Stored in localStorage "mt.hotkeys" = {on, palette, map:{commandId:{c:"Ctrl+Shift+1", k:49}}}.
     4. Talks to the Settings window over js/mt-settings-bus.js:  hkreq (window asks)  ->  hkstate (panel answers)  /  hkset (window saves).
   Keys only reach the panel while it has keyboard focus. registerKeyEventsInterest tells After Effects to hand those keys to the panel
   instead of using them itself (same method as NeuCurve's hotkeys in neucurve/nc-pro.js).
   Load AFTER js/main.js and js/mt-settings-bus.js. Plain ES5, Chromium-74 safe. */
(function () {
  "use strict";
  var core = window.MTCore, bus = window.MTSettingsBus;
  if (!core) { return; }

  var LS_KEY = "mt.hotkeys", LS_RECENT = "mt.hotkeys.recent";
  var IS_MAC = /Mac/i.test(navigator.platform || "");
  var DEFAULT_PALETTE = { c: "Ctrl+K", k: 75 };
  var root = document.documentElement;

  // ---------- storage ----------
  var state = { on: true, palette: DEFAULT_PALETTE, map: {} };
  function load() {
    var raw = null, o = null;
    try { raw = window.localStorage.getItem(LS_KEY); } catch (e) { raw = null; }
    if (raw) { try { o = JSON.parse(raw); } catch (e2) { o = null; } }
    if (o && typeof o === "object") {
      state.on = o.on !== false;
      state.palette = (o.palette === null) ? null : (o.palette && o.palette.c ? o.palette : DEFAULT_PALETTE);
      state.map = (o.map && typeof o.map === "object") ? o.map : {};
    }
  }
  function save() { try { window.localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch (e) { } }
  function recent() { try { var a = JSON.parse(window.localStorage.getItem(LS_RECENT) || "[]"); return Array.isArray(a) ? a : []; } catch (e) { return []; } }
  function pushRecent(id) {
    var a = recent().filter(function (x) { return x !== id; });
    a.unshift(id);
    try { window.localStorage.setItem(LS_RECENT, JSON.stringify(a.slice(0, 6))); } catch (e) { }
  }

  // ---------- key helpers (same format as NeuCurve: "Ctrl+Alt+Shift+K") ----------
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

  // Combos NeuCurve already uses while the Curve tab is open: those keys belong to NeuCurve there.
  function neucurveCombos() {
    var out = [], raw, o, a;
    try {
      if (window.localStorage.getItem("neucurve_hotkeysOn") === "0") { return out; }
      raw = window.localStorage.getItem("neucurve_hotkeys");
      o = raw ? JSON.parse(raw) : null;
      if (o && typeof o === "object") { for (a in o) { if (o.hasOwnProperty(a) && o[a] && o[a].c) { out.push(o[a].c); } } }
    } catch (e) { }
    return out;
  }

  // ---------- commands ----------
  function call(fn, args) {
    return core.Bridge.call(fn, args || []).then(function (res) {
      core.toast((res && res.message) || (res && res.ok ? "Done." : "Something went wrong."), !(res && res.ok));
      return res;
    });
  }
  function dummyEl() { return document.createElement("span"); }
  function add(list, id, group, title, run, kw) { list.push({ id: id, g: group, t: title, run: run, kw: kw || "" }); }

  function buildCommands() {
    var list = [], i, id, T = core.TABS || {}, SC = core.Shortcutz, tools;

    // repeat the last command that was run (palette, hotkey or this one): the fastest way to do the same thing on the next layer
    add(list, "meta:repeat", "General", "Repeat last command", function () {
      var last = recent()[0], c = last ? findCommand(last) : null;
      if (!c) { core.toast("Nothing to repeat yet.", true); return; }
      try { c.run(); } catch (e) { core.toast("That command could not run.", true); }
    }, "again redo last");

    // tabs
    for (id in T) {
      if (T.hasOwnProperty(id)) { (function (tid) { add(list, "tab:" + tid, "Tabs", "Go to " + (T[tid].title || tid), function () { core.showTab(tid); }, "open switch tab"); })(id); }
    }

    // Easy Layer
    tools = (T["easy-layer"] && T["easy-layer"].tools) || [];
    for (i = 0; i < tools.length; i++) {
      (function (tool) { add(list, "el:" + tool.id, "Easy Layer", "New " + tool.name + " layer", function () { core.runTool(null, "easy-layer", tool); }, "create add layer " + tool.code); })(tools[i]);
    }

    // Anchor, align, fit, flip
    var ANCH = [["tl", "Top Left"], ["tc", "Top Center"], ["tr", "Top Right"], ["ml", "Middle Left"], ["mm", "Center"], ["mr", "Middle Right"], ["bl", "Bottom Left"], ["bc", "Bottom Center"], ["br", "Bottom Right"]];
    var ALIGN = [["left", "Left"], ["hcenter", "Horizontal Center"], ["right", "Right"], ["top", "Top"], ["vcenter", "Vertical Center"], ["bottom", "Bottom"]];
    var FIT = [["comp", "Fit to Comp"], ["width", "Fit Width"], ["height", "Fit Height"]];
    for (i = 0; i < ANCH.length; i++) { (function (a) { add(list, "aa:anchor:" + a[0], "Anchor & Align", "Anchor point: " + a[1], function () { call("AA_setAnchor", [a[0]]); }, "pivot"); })(ANCH[i]); }
    for (i = 0; i < ALIGN.length; i++) { (function (a) { add(list, "aa:align:" + a[0], "Anchor & Align", "Align to comp: " + a[1], function () { call("AA_align", [a[0]]); }, "position"); })(ALIGN[i]); }
    for (i = 0; i < FIT.length; i++) { (function (a) { add(list, "aa:fit:" + a[0], "Anchor & Align", a[1], function () { call("AA_fit", [a[0]]); }, "scale size"); })(FIT[i]); }
    add(list, "aa:flip:h", "Anchor & Align", "Flip horizontal", function () { call("flipSelectedLayers", ["h"]); }, "mirror");
    add(list, "aa:flip:v", "Anchor & Align", "Flip vertical", function () { call("flipSelectedLayers", ["v"]); }, "mirror");

    // Tools tab
    add(list, "tool:split:char", "Tools", "Split text into characters", function () { call("TOOLS_splitText", ["char"]); });
    add(list, "tool:split:word", "Tools", "Split text into words", function () { call("TOOLS_splitText", ["word"]); });
    add(list, "tool:stagger", "Tools", "Stagger layers (2 frames, top to bottom)", function () { call("TOOLS_stagger", [2, "top-down"]); }, "sequence offset");
    add(list, "tool:trim:in", "Tools", "Trim in point to playhead", function () { call("TOOLS_trimToPlayhead", ["in"]); });
    add(list, "tool:trim:out", "Tools", "Trim out point to playhead", function () { call("TOOLS_trimToPlayhead", ["out"]); });
    add(list, "tool:precomp:each", "Tools", "Pre-compose each layer", function () { call("TOOLS_precomposeEach", [true]); });
    add(list, "tool:precomp:all", "Tools", "Pre-compose layers together", function () { call("TOOLS_precomposeTogether", [true]); });
    add(list, "tool:unprecomp", "Tools", "Unprecompose (copy attributes)", function () { call("TOOLS_unprecompose", ["copy"]); });
    add(list, "tool:color:sel", "Tools", "Color-code selected layers", function () { call("TOOLS_autoColorCode", ["selected"]); }, "label");
    add(list, "tool:color:all", "Tools", "Color-code whole comp", function () { call("TOOLS_autoColorCode", ["all"]); }, "label");
    function saveFrame(fmt) {
      var S = core.SaveFrame;
      if (!S || S.busy) { return; }
      S.busy = true;
      S.autoSave(fmt).then(function (res) { S.busy = false; if (res) { core.toast(res.message || (res.ok ? "Done." : "Something went wrong."), !res.ok); } },
        function (err) { S.busy = false; core.toast(String(err), true); });
    }
    add(list, "tool:frame:png", "Tools", "Save frame as PNG", function () { saveFrame("png"); }, "export still image");
    add(list, "tool:frame:jpg", "Tools", "Save frame as JPG", function () { saveFrame("jpg"); }, "export still image");

    // Shortcutz tiles
    if (SC) {
      var groups = [["expr", SC.EXPR_PRESETS], ["effect", SC.EFFECT_PRESETS], ["util", SC.UTIL_PRESETS]], gi, defs, di;
      for (gi = 0; gi < groups.length; gi++) {
        defs = groups[gi][1] || [];
        for (di = 0; di < defs.length; di++) {
          (function (grp, def) { add(list, "sc:" + grp + ":" + def.id, "Shortcutz", def.name, function () { SC.runBuiltin(grp, def.id, dummyEl()); }, "speed dial " + (def.note || "")); })(groups[gi][0], defs[di]);
        }
      }
      var items = [];
      try { items = SC.getItems() || []; } catch (e) { items = []; }
      for (i = 0; i < items.length; i++) { (function (item) { add(list, "sc:c:" + item.id, "My Shortcuts", item.name, function () { SC.runItem(item, dummyEl()); }, "custom"); })(items[i]); }
    }
    return list;
  }

  function findCommand(id) {
    var list = buildCommands(), i;
    for (i = 0; i < list.length; i++) { if (list[i].id === id) { return list[i]; } }
    return null;
  }
  function runCommand(cmd) {
    if (!cmd) { return; }
    if (cmd.id !== "meta:repeat") { pushRecent(cmd.id); }       // "repeat" must not replace what it repeats
    try { cmd.run(); } catch (e) { core.toast("That command could not run.", true); }
  }

  // ---------- key engine ----------
  var lookup = {};
  function rebuildLookup() {
    var a; lookup = {};
    for (a in state.map) { if (state.map.hasOwnProperty(a) && state.map[a] && state.map[a].c) { lookup[state.map[a].c] = a; } }
  }
  function isTyping(t) {
    var tag = t && t.tagName;
    return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || (t && t.isContentEditable);
  }
  function onKey(e) {
    if (!state.on || e.repeat || e.isComposing) { return; }
    var combo = comboOf(e); if (!combo) { return; }
    var typing = isTyping(e.target);
    if (pal.open) {
      if (state.palette && state.palette.c === combo) { e.preventDefault(); e.stopPropagation(); closePalette(); }
      return;                                                   // the palette's own input handles the other keys
    }
    if (typing) { return; }
    if (core.currentTab() === "curve" && neucurveCombos().indexOf(combo) >= 0) { return; }
    if (state.palette && state.palette.c === combo) { e.preventDefault(); e.stopPropagation(); openPalette(); return; }
    var id = lookup[combo];
    if (!id) { return; }
    e.preventDefault(); e.stopPropagation();
    runCommand(findCommand(id));
  }
  document.addEventListener("keydown", onKey, true);

  // After Effects keeps most key presses for itself. This tells CEP which keys the panel wants.
  var lastInterest = "";
  function registerKeys(force) {
    try {
      var cep = window.__adobe_cep__; if (!cep || !cep.registerKeyEventsInterest) { return; }
      var list = [], a, h, items = [];
      if (state.on) {
        if (state.palette) { items.push(state.palette); }
        for (a in state.map) { if (state.map.hasOwnProperty(a) && state.map[a]) { items.push(state.map[a]); } }
      }
      /* registerKeyEventsInterest REPLACES the previous list, and NeuCurve (Curve tab, same extension) registers its own keys too.
         Send both lists in every call so neither side erases the other. */
      try {
        var nraw = window.localStorage.getItem("neucurve_hotkeys"), nm = nraw ? JSON.parse(nraw) : null;
        if (nm && typeof nm === "object" && window.localStorage.getItem("neucurve_hotkeysOn") !== "0") {
          for (a in nm) { if (nm.hasOwnProperty(a) && nm[a] && nm[a].k) { items.push(nm[a]); } }
        }
      } catch (eN) { }
      for (a = 0; a < items.length; a++) {
        if (!items[a] || !items[a].k) { continue; }
        h = String(items[a].c || "");
        list.push({ keyCode: items[a].k, ctrlKey: !IS_MAC && h.indexOf("Ctrl+") === 0, metaKey: IS_MAC && h.indexOf("Ctrl+") === 0, altKey: h.indexOf("Alt+") >= 0, shiftKey: h.indexOf("Shift+") >= 0 });
      }
      var json = JSON.stringify(list);
      if (json === lastInterest && !force) { return; }
      lastInterest = json;
      if (list.length) { cep.registerKeyEventsInterest(json); }
    } catch (e) { }
  }
  window.addEventListener("focus", function () { registerKeys(true); });
  window.addEventListener("mouseenter", function () { registerKeys(true); }, true);
  document.addEventListener("visibilitychange", function () { registerKeys(true); });
  setInterval(function () { registerKeys(true); }, 5000);

  // ---------- Command Palette ----------
  var pal = { open: false, el: null, input: null, list: null, items: [], sel: 0, all: [] };
  function keyLabel(id) { return (state.map[id] && state.map[id].c) ? state.map[id].c : ""; }
  function esc(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }

  function score(cmd, tokens) {
    var hay = (cmd.t + " " + cmd.g + " " + cmd.kw).toLowerCase(), title = cmd.t.toLowerCase(), s = 0, i, p;
    for (i = 0; i < tokens.length; i++) {
      p = hay.indexOf(tokens[i]);
      if (p < 0) { return -1; }
      s += (title.indexOf(tokens[i]) === 0) ? 0 : (title.indexOf(tokens[i]) > 0 ? 2 : 6);
      s += p / 100;
    }
    return s;
  }
  function filter(q) {
    var all = pal.all, out = [], i, tokens, sc, rec, seen = {};
    q = String(q || "").toLowerCase().replace(/^\s+|\s+$/g, "");
    if (!q) {
      rec = recent();
      for (i = 0; i < rec.length; i++) { var c = null, j; for (j = 0; j < all.length; j++) { if (all[j].id === rec[i]) { c = all[j]; break; } } if (c) { out.push(c); seen[c.id] = 1; } }
      for (i = 0; i < all.length; i++) { if (!seen[all[i].id]) { out.push(all[i]); } }
      return out.slice(0, 60);
    }
    tokens = q.split(/\s+/);
    for (i = 0; i < all.length; i++) { sc = score(all[i], tokens); if (sc >= 0) { out.push({ c: all[i], s: sc }); } }
    out.sort(function (a, b) { return a.s - b.s; });
    return out.slice(0, 60).map(function (x) { return x.c; });
  }
  function paint() {
    var html = "", i, c, k, hasRecent = !pal.input.value && recent().length;
    for (i = 0; i < pal.items.length; i++) {
      c = pal.items[i]; k = keyLabel(c.id);
      html += '<li class="mt-pal-item' + (i === pal.sel ? " is-sel" : "") + '" role="option" aria-selected="' + (i === pal.sel ? "true" : "false") + '" data-i="' + i + '">' +
        '<span class="mt-pal-name">' + esc(c.t) + '</span><span class="mt-pal-group">' + esc(c.g) + '</span>' + (k ? '<kbd class="mt-pal-key">' + esc(k) + "</kbd>" : "") + "</li>";
    }
    if (!pal.items.length) { html = '<li class="mt-pal-empty">No match. Try another word.</li>'; }
    pal.list.innerHTML = html;
    pal.list.setAttribute("data-recent", hasRecent ? "1" : "0");
  }
  function move(d) {
    if (!pal.items.length) { return; }
    pal.sel = (pal.sel + d + pal.items.length) % pal.items.length;
    paint();
    var el = pal.list.querySelector(".is-sel");
    if (el) {
      var top = el.offsetTop, bot = top + el.offsetHeight;
      if (top < pal.list.scrollTop) { pal.list.scrollTop = top; }
      else if (bot > pal.list.scrollTop + pal.list.clientHeight) { pal.list.scrollTop = bot - pal.list.clientHeight; }
    }
  }
  function runSelected(i) {
    var c = pal.items[i === undefined ? pal.sel : i];
    if (!c) { return; }
    closePalette();
    setTimeout(function () { runCommand(c); }, 0);
  }
  function ensurePalette() {
    if (pal.el) { return; }
    var el = document.createElement("div");
    el.className = "mt-pal"; el.setAttribute("aria-hidden", "true");
    el.innerHTML = '<div class="mt-pal-box" role="dialog" aria-label="Command palette">' +
      '<input class="mt-pal-input" type="text" placeholder="Search tools, tabs and shortcuts" autocomplete="off" spellcheck="false" aria-label="Search commands">' +
      '<ul class="mt-pal-list" role="listbox"></ul>' +
      '<div class="mt-pal-foot"><span><kbd>Enter</kbd> run</span><span><kbd>&uarr;</kbd><kbd>&darr;</kbd> move</span><span><kbd>Esc</kbd> close</span></div></div>';
    document.body.appendChild(el);
    pal.el = el; pal.input = el.querySelector(".mt-pal-input"); pal.list = el.querySelector(".mt-pal-list");
    el.addEventListener("mousedown", function (e) { if (e.target === el) { e.preventDefault(); closePalette(); } });
    pal.list.addEventListener("mousemove", function (e) {
      var t = e.target; while (t && t !== pal.list && !(t.getAttribute && t.getAttribute("data-i"))) { t = t.parentNode; }
      if (t && t !== pal.list) { var i = parseInt(t.getAttribute("data-i"), 10); if (i !== pal.sel) { pal.sel = i; paint(); } }
    });
    pal.list.addEventListener("click", function (e) {
      var t = e.target; while (t && t !== pal.list && !(t.getAttribute && t.getAttribute("data-i"))) { t = t.parentNode; }
      if (t && t !== pal.list) { runSelected(parseInt(t.getAttribute("data-i"), 10)); }
    });
    pal.input.addEventListener("input", function () { pal.items = filter(pal.input.value); pal.sel = 0; pal.list.scrollTop = 0; paint(); });
    pal.input.addEventListener("keydown", function (e) {
      var k = e.key;
      if (k === "ArrowDown") { e.preventDefault(); move(1); }
      else if (k === "ArrowUp") { e.preventDefault(); move(-1); }
      else if (k === "Enter") { e.preventDefault(); runSelected(); }
      else if (k === "Escape") { e.preventDefault(); e.stopPropagation(); closePalette(); }
    });
  }
  function openPalette() {
    ensurePalette();
    pal.all = buildCommands();
    pal.input.value = ""; pal.items = filter(""); pal.sel = 0;
    paint();
    pal.open = true;
    pal.el.classList.add("is-open"); pal.el.setAttribute("aria-hidden", "false");
    pal.list.scrollTop = 0;
    setTimeout(function () { try { pal.input.focus(); } catch (e) { } }, 0);
  }
  function closePalette() {
    if (!pal.open) { return; }
    pal.open = false;
    pal.el.classList.remove("is-open"); pal.el.setAttribute("aria-hidden", "true");
    try { pal.input.blur(); } catch (e) { }
  }

  // ---------- Settings window sync ----------
  function sendState() {
    if (!bus) { return; }
    var cmds = buildCommands().map(function (c) { return { id: c.id, g: c.g, t: c.t }; });
    bus.send("hkstate", { on: state.on, palette: state.palette, defPalette: DEFAULT_PALETTE, map: state.map, cmds: cmds, reserved: neucurveCombos(), mac: IS_MAC });
  }
  if (bus) {
    bus.on("hkreq", function () { sendState(); });
    bus.on("hkset", function (d) {
      if (!d || typeof d !== "object") { return; }
      state.on = d.on !== false;
      state.palette = (d.palette === null) ? null : (d.palette && d.palette.c ? d.palette : DEFAULT_PALETTE);
      state.map = (d.map && typeof d.map === "object") ? d.map : {};
      save(); rebuildLookup(); registerKeys(true); sendState();
    });
  }

  load(); rebuildLookup(); registerKeys(true);
  window.MTHotkeys = { open: openPalette, close: closePalette, commands: buildCommands, state: function () { return state; } };
})();
