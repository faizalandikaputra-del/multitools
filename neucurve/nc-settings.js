/* NeuCurve - nc-settings.js (v1)
   NeuCurve Settings window, built to match Flow's settings window (sidebar tabs, groups, rows, color editor).
   It replaces the old Svelte "Settings" page. Nothing is stored in a new place: every control reads/writes the same
   localStorage keys (prefix "neucurve_") and fires the same "com.neucurve.sync" CSEvent as before, so the Curve tab,
   the Graph Editor window, nc-extras.js, nc-bg.js, nc-gsize.js and nc-particles.js keep working unchanged.
   Plain ES5 for old CEP hosts (AE 2021 / Chromium 74). */
(function () {
  "use strict";

  var APP_ID = "nc-settings";
  var DEF = {
    uiColor: "#FFFFFF", graphLineColor: "#FFFFFF", handleColor: "#FFFFFF",
    autoApply: "false", overshoot: "true", liveBall: "1", layoutMode: "auto",
    bgImagePath: "", bgOpacity: "1",
    gradOn: "0", gradC1: "#000000", gradC2: "#ffffff", gradGlow: "#ffffff", gradDir: "160", gradInt: "100", gradArea: "panel", gradP: "bw",
    wgDir: "90", wgInt: "45", wgSize: "55",
    hStyle: "circle", hSize: "4.5", hLine: "1.2", hImg: "",
    pEffect: "particles", pColor: "#ffffff", pAlpha: "100",
    gWp: "", gHp: "", gWl: "", gHl: "", bgOrig: "false",
    hidePresets: "false", hideGraph: "false"
  };
  var COLORS = ["#3366FF", "#ff2a2a", "#00a8ff", "#2ecc71", "#f1c40f", "#9b59b6", "#ff9f43", "#ffffff"];
  var PROFILE_KEY = "neucurve_profile";
  var DEFAULT_PROFILE = { name: "NeuCurve", bio: "NeuCurve Settings", image: "" };
  var DEFAULT_AVATAR = "data:image/svg+xml;utf8," + encodeURIComponent(
    "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'><rect width='64' height='64' fill='#18181b'/>" +
    "<path d='M12 50C26 50 22 14 52 14' fill='none' stroke='#fafafa' stroke-width='4' stroke-linecap='round'/>" +
    "<circle cx='12' cy='50' r='5' fill='#3366ff'/><circle cx='52' cy='14' r='5' fill='#3366ff'/></svg>");

  var els = {};
  var activeKey = "", profileTimer = null;
  var profile = loadProfile(), profileShown = false;

  function $(id) { return document.getElementById(id); }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function num(v, lo, hi, d) { v = parseFloat(v); if (!isFinite(v)) { v = d; } return clamp(v, lo, hi); }

  /* ---------------- storage + sync ---------------- */
  function read(k) { try { var v = localStorage.getItem("neucurve_" + k); return v === null ? DEF[k] : v; } catch (e) { return DEF[k]; } }
  function write(k, v) {
    try { if (v === "" && /^g[WH][pl]$/.test(k)) { localStorage.removeItem("neucurve_" + k); } else { localStorage.setItem("neucurve_" + k, String(v)); } } catch (e) { }
  }
  function broadcastNow(k, v) {
    try {
      var CE = window.CSEvent || (typeof CSEvent !== "undefined" ? CSEvent : null);
      if (!CE || !window.CSInterface) { return; }
      var ev = new CE("com.neucurve.sync", "APPLICATION");
      ev.data = JSON.stringify({ key: k, val: String(v), appId: APP_ID });
      new window.CSInterface().dispatchEvent(ev);
    } catch (e) { }
  }
  /* Dragging a colour / slider fires "input" on every mouse move. localStorage is written immediately (other windows get a
     "storage" event at once), but the CEP event - which every NeuCurve listener (graph, ball, background, extras ...) parses
     and re-applies - is coalesced: latest value per key, at most one burst every 40 ms, always flushed at the end / on close. */
  var bQueue = {}, bTimer = 0;
  function flushBroadcast() {
    var q = bQueue, key; bQueue = {}; if (bTimer) { clearTimeout(bTimer); bTimer = 0; }
    for (key in q) { if (q.hasOwnProperty(key)) { broadcastNow(key, q[key]); } }
  }
  function broadcast(k, v) {
    bQueue[k] = v;
    if (!bTimer) { bTimer = setTimeout(flushBroadcast, 40); }
  }
  window.addEventListener("beforeunload", flushBroadcast);
  function set(k, v) { write(k, v); broadcast(k, v); }
  function readBool(k) { return read(k) === "true" || read(k) === true; }

  function normalizeHex(value) {
    var hex = String(value || "").replace(/[^0-9a-f]/gi, "");
    if (hex.length === 3) { hex = hex.charAt(0) + hex.charAt(0) + hex.charAt(1) + hex.charAt(1) + hex.charAt(2) + hex.charAt(2); }
    return hex.length === 6 ? "#" + hex.toLowerCase() : "";
  }
  function colorOf(key) { return normalizeHex(read(key)) || normalizeHex(DEF[key]) || "#ffffff"; }
  function hexToRgba(hex, a) {
    var c = normalizeHex(hex) || "#ffffff";
    return "rgba(" + parseInt(c.slice(1, 3), 16) + "," + parseInt(c.slice(3, 5), 16) + "," + parseInt(c.slice(5, 7), 16) + "," + a + ")";
  }
  function hexToHsv(hex) {
    var c = normalizeHex(hex) || "#ffffff";
    var r = parseInt(c.slice(1, 3), 16) / 255, g = parseInt(c.slice(3, 5), 16) / 255, b = parseInt(c.slice(5, 7), 16) / 255;
    var max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min, h = 0;
    if (d) {
      if (max === r) { h = ((g - b) / d) % 6; } else if (max === g) { h = (b - r) / d + 2; } else { h = (r - g) / d + 4; }
      h *= 60; if (h < 0) { h += 360; }
    }
    return { h: h, s: max === 0 ? 0 : d / max * 100, v: max * 100 };
  }
  function toHex(v) { var h = Math.round(clamp(v, 0, 255)).toString(16); return h.length === 1 ? "0" + h : h; }
  function hsvToHex(h, s, v) {
    h = ((Number(h) || 0) % 360 + 360) % 360; s = clamp(Number(s) || 0, 0, 100) / 100; v = clamp(Number(v) || 0, 0, 100) / 100;
    var c = v * s, x = c * (1 - Math.abs((h / 60) % 2 - 1)), m = v - c, r = 0, g = 0, b = 0;
    if (h < 60) { r = c; g = x; } else if (h < 120) { r = x; g = c; } else if (h < 180) { g = c; b = x; }
    else if (h < 240) { g = x; b = c; } else if (h < 300) { r = x; b = c; } else { r = c; b = x; }
    return "#" + toHex((r + m) * 255) + toHex((g + m) * 255) + toHex((b + m) * 255);
  }

  /* ---------------- tabs ---------------- */
  function initTabs() {
    var buttons = document.querySelectorAll("[data-settings-tab]");
    var sections = document.querySelectorAll("[data-settings-section]");
    var title = $("settingsSectionTitle"), desc = $("settingsSectionDescription"), body = document.querySelector(".settings-body");
    var order = ["appearance", "background", "handles", "behavior"];

    function activate(name) {
      var i, on, found = false;
      for (i = 0; i < sections.length; i++) { if (sections[i].getAttribute("data-settings-section") === name) { found = true; } }
      if (!found) { name = "appearance"; }
      for (i = 0; i < sections.length; i++) {
        on = sections[i].getAttribute("data-settings-section") === name;
        sections[i].classList.toggle("is-active", on);
        sections[i].setAttribute("aria-hidden", on ? "false" : "true");
        if (on) { title.textContent = sections[i].getAttribute("data-settings-title"); desc.textContent = sections[i].getAttribute("data-settings-description"); }
      }
      for (i = 0; i < buttons.length; i++) {
        on = buttons[i].getAttribute("data-settings-tab") === name;
        buttons[i].classList.toggle("is-active", on);
        buttons[i].setAttribute("aria-selected", on ? "true" : "false");
      }
      document.title = "NeuCurve Settings - " + title.textContent;
      if (body) { body.scrollTop = 0; }
      closeColorEditor();
      try { sessionStorage.setItem("neucurve.settings.section", name); } catch (e) { }
      scheduleFit();
    }
    for (var i = 0; i < buttons.length; i++) {
      buttons[i].setAttribute("role", "tab");
      buttons[i].addEventListener("click", function (e) { activate(e.currentTarget.getAttribute("data-settings-tab")); });
      buttons[i].addEventListener("keydown", function (e) {
        var cur = order.indexOf(e.currentTarget.getAttribute("data-settings-tab")), k = e.key, n = cur;
        if (k === "ArrowDown" || k === "ArrowRight") { n = (cur + 1) % order.length; }
        else if (k === "ArrowUp" || k === "ArrowLeft") { n = (cur + order.length - 1) % order.length; }
        else { return; }
        e.preventDefault(); activate(order[n]);
        var t = document.querySelector('[data-settings-tab="' + order[n] + '"]'); if (t) { t.focus(); }
      });
    }
    var stored = ""; try { stored = sessionStorage.getItem("neucurve.settings.section") || ""; } catch (e) { }
    activate(stored || "appearance");
  }

  /* ---------------- window follows its content ----------------
     The Settings window is a CEP Modeless window. After every tab change / opened color editor / layout change it asks
     the host to resize it (CSInterface.resizeContent) so the active tab fits without a scrollbar, within the screen limits.
     The manifest allows 585 wide and 420-1400 tall. Outside CEP (browser preview) this does nothing. */
  var fitTimer = 0, lastFitH = 0;
  function fitWindow() {
    try {
      if (!window.CSInterface || !window.__adobe_cep__) { return; }
      var body = document.querySelector(".settings-body"), sec = document.querySelector(".settings-section.is-active");
      var last = sec && sec.lastElementChild; if (!body || !last) { return; }
      var sr = sec.getBoundingClientRect(), lr = last.getBoundingClientRect();
      var content = lr.bottom - sr.top + (parseFloat(getComputedStyle(last).marginBottom) || 0) + 24;
      var chrome = window.innerHeight - body.clientHeight;
      var maxH = Math.max(480, Math.min(1400, (window.screen.availHeight || 900) - 70));
      var h = Math.round(Math.max(420, Math.min(maxH, chrome + content)));
      if (Math.abs(h - lastFitH) < 4) { return; }
      lastFitH = h;
      if (Math.abs(h - window.innerHeight) < 4 && Math.abs(window.innerWidth - 585) < 3) { return; }   // already that size: a native resize relayouts the whole window for nothing
      new window.CSInterface().resizeContent(585, h);
    } catch (e) { }
  }
  function scheduleFit() { clearTimeout(fitTimer); fitTimer = setTimeout(fitWindow, 60); }
  window.__ncFitWindow = fitWindow;

  /* ---------------- color editor: Multi Tool's picker popover ----------------
     "Edit" opens the same themed picker the Multi Tool panel uses (js/mt-colorpicker.js), anchored to the button through an
     invisible <input type="color"> (cpProxy). The picker writes cpProxy.value and fires "input" while you drag, so the color
     is applied live, exactly like the old inline sliders did. Closing (Esc / click outside / scroll) is detected from the
     class the picker puts on cpProxy. No OS color dialog is ever used. */
  var cpProxy = null, lastKey = "";
  function ensureProxy() {
    if (cpProxy) { return cpProxy; }
    cpProxy = document.createElement("input");
    cpProxy.type = "color"; cpProxy.className = "nc-cp-proxy"; cpProxy.tabIndex = -1; cpProxy.setAttribute("aria-hidden", "true");
    cpProxy.addEventListener("input", function () { if (activeKey) { set(activeKey, cpProxy.value); refreshAll(); } });
    document.body.appendChild(cpProxy);
    if (typeof MutationObserver !== "undefined") {
      new MutationObserver(function () {
        if (activeKey && !/mt-cp-open/.test(cpProxy.className)) { lastKey = activeKey; closeColorEditor(); }
      }).observe(cpProxy, { attributes: true, attributeFilter: ["class"] });
    }
    return cpProxy;
  }
  function openColorEditor(key, button) {
    var px = ensureProxy(), r = button.getBoundingClientRect();
    closeColorEditor();
    activeKey = key; button.classList.add("is-open");
    px.style.left = r.left + "px"; px.style.top = r.top + "px"; px.style.width = r.width + "px"; px.style.height = r.height + "px";
    px.value = colorOf(key);
    px.click();
  }
  function closeColorEditor() {
    var b = document.querySelectorAll("[data-color-edit]");
    for (var i = 0; i < b.length; i++) { b[i].classList.remove("is-open"); }
    activeKey = "";
  }

  /* ---------------- generic helpers ---------------- */
  function bindRange(id, key, valueId, fmt, toStore) {
    var inp = $(id);
    inp.addEventListener("input", function () { set(key, toStore ? toStore(inp.value) : inp.value); refreshAll(); });
    return function () {
      if (document.activeElement !== inp) { inp.value = valueFor(key, toStore); }
      $(valueId).textContent = fmt(parseFloat(inp.value));
    };
  }
  function valueFor(key, toStore) {
    if (key === "bgOpacity") { return String(Math.round(num(read(key), 0, 1, 1) * 100)); }
    if (/^g[WH][pl]$/.test(key)) { return String(num(read(key), 25, 100, 100)); }
    return read(key);
  }
  function pct(v) { return Math.round(v) + "%"; }
  function deg(v) { return Math.round(v) + "\u00b0"; }

  function pickFile(title, exts, cb) {
    /* CEP file dialog gives a real path (no huge data URL in localStorage); falls back to <input type=file> */
    try {
      if (window.cep && window.cep.fs && window.cep.fs.showOpenDialogEx) {
        var r = window.cep.fs.showOpenDialogEx(false, false, title, "", exts);
        if (r.err === 0 && r.data && r.data.length) { cb(pathToUrl(r.data[0])); }
        return true;
      }
    } catch (e) { }
    return false;
  }
  function pathToUrl(p) {
    p = String(p || "").replace(/\\/g, "/");
    if (!p) { return ""; }
    if (/^(file:|data:|https?:)/i.test(p)) { return p; }
    return "file:///" + p.replace(/^\/+/, "");
  }
  function fileToSource(file, cb) {
    var p = file && (file.path || file.fullPath);
    if (p) { cb(pathToUrl(p)); return; }
    var fr = new FileReader();
    fr.onload = function () { cb(String(fr.result || "")); };
    fr.readAsDataURL(file);
  }
  function okImage(file, re, mimeRe) { return file && (re.test(String(file.name || "")) || mimeRe.test(String(file.type || ""))); }
  function hookDrop(zone, onFile) {
    zone.addEventListener("dragover", function (e) { e.preventDefault(); zone.classList.add("is-dragging"); });
    zone.addEventListener("dragleave", function () { zone.classList.remove("is-dragging"); });
    zone.addEventListener("drop", function (e) {
      e.preventDefault(); zone.classList.remove("is-dragging");
      onFile(e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]);
    });
  }
  function safeSet(k, v) { try { localStorage.setItem("neucurve_" + k, String(v)); set(k, v); } catch (e) { /* storage full: image too large */ } }

  /* ---------------- profile ---------------- */
  function loadProfile() {
    var p = {}; try { p = JSON.parse(localStorage.getItem(PROFILE_KEY) || "{}") || {}; } catch (e) { }
    return {
      name: cleanText(p.name, DEFAULT_PROFILE.name, 40, false),
      bio: cleanText(p.bio, DEFAULT_PROFILE.bio, 120, true),
      image: typeof p.image === "string" ? p.image : ""
    };
  }
  function cleanText(v, fb, max, allowEmpty) {
    if (typeof v !== "string") { return fb; }
    v = v.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
    return v || (allowEmpty ? "" : fb);
  }
  function saveProfile() { try { localStorage.setItem(PROFILE_KEY, JSON.stringify(profile)); } catch (e) { } }
  function refreshProfile(fields) {
    var src = profile.image || DEFAULT_AVATAR;
    els.avatar.src = src; els.editorAvatar.src = src;
    if (fields !== false) { els.pName.value = profile.name; els.pBio.value = profile.bio; }
    els.pNameShow.textContent = cleanText(profile.name, DEFAULT_PROFILE.name, 40, false);
    els.pBioShow.textContent = cleanText(profile.bio, DEFAULT_PROFILE.bio, 120, true);
    els.pClear.disabled = !profile.image;
  }
  function initProfile() {
    els.avatar = $("settingsProfileAvatar"); els.editorAvatar = $("settingsProfileEditorAvatar");
    els.pName = $("settingsProfileName"); els.pBio = $("settingsProfileBio");
    els.pNameShow = $("settingsProfileNameDisplay"); els.pBioShow = $("settingsProfileBioDisplay");
    els.pClear = $("settingsClearProfileImage");
    var file = $("settingsProfileFileInput");
    $("settingsProfileAvatarButton").addEventListener("click", function () { file.click(); });
    file.addEventListener("change", function () {
      var f = file.files && file.files[0]; file.value = "";
      if (!okImage(f, /\.(png|jpe?g|gif|webp)$/i, /^image\/(png|jpeg|gif|webp)$/i)) { return; }
      var fr = new FileReader();
      fr.onload = function () { profile.image = String(fr.result || ""); saveProfile(); refreshProfile(); };
      fr.readAsDataURL(f);
    });
    els.pClear.addEventListener("click", function () { profile.image = ""; saveProfile(); refreshProfile(); });
    function later() { if (profileTimer) { clearTimeout(profileTimer); } profileTimer = setTimeout(function () { profileTimer = null; saveProfile(); }, 180); }
    els.pName.addEventListener("input", function () { profile.name = String(els.pName.value || "").slice(0, 40); refreshProfile(false); later(); });
    els.pBio.addEventListener("input", function () { profile.bio = String(els.pBio.value || "").slice(0, 120); refreshProfile(false); later(); });
    function flush() {
      if (profileTimer) { clearTimeout(profileTimer); profileTimer = null; }
      profile.name = cleanText(profile.name, DEFAULT_PROFILE.name, 40, false);
      profile.bio = cleanText(profile.bio, DEFAULT_PROFILE.bio, 120, true);
      saveProfile(); refreshProfile();
    }
    els.pName.addEventListener("change", flush); els.pBio.addEventListener("change", flush);
    $("settingsResetProfile").addEventListener("click", function () {
      profile = { name: DEFAULT_PROFILE.name, bio: DEFAULT_PROFILE.bio, image: "" }; flush();
    });
  }

  /* ---------------- custom dropdown (same look as Flow's language dropdown) ---------------- */
  function createDropdown(selectId) {
    var sel = $(selectId); if (!sel) { return; }
    sel.setAttribute("aria-hidden", "true"); sel.setAttribute("tabindex", "-1");
    var wrap = document.createElement("div"); wrap.className = "settings-language-dropdown";
    sel.parentNode.insertBefore(wrap, sel); wrap.appendChild(sel);
    var trigger = document.createElement("button"); trigger.type = "button"; trigger.className = "settings-language-dropdown__trigger";
    trigger.setAttribute("role", "combobox"); trigger.setAttribute("aria-haspopup", "listbox"); trigger.setAttribute("aria-expanded", "false");
    var label = document.createElement("span"); label.className = "settings-language-dropdown__label"; trigger.appendChild(label);
    var chev = document.createElement("span"); chev.className = "settings-language-dropdown__chevron"; chev.setAttribute("aria-hidden", "true"); trigger.appendChild(chev);
    var menu = document.createElement("div"); menu.className = "settings-language-dropdown__menu"; menu.id = selectId + "Menu"; menu.setAttribute("role", "listbox");
    wrap.insertBefore(trigger, sel); wrap.appendChild(menu);
    var open = false;
    /* v2: while open, the list is moved to <body> and drawn with position:fixed. The card (overflow:hidden), the scroll area and the
       card's own transform (a transformed ancestor makes position:fixed relative to itself) can no longer clip, offset or hide it. */
    function dock() {
      menu.classList.remove("is-floating", "is-up");
      menu.style.left = menu.style.top = menu.style.bottom = menu.style.width = menu.style.maxHeight = menu.style.overflowY = "";
      if (menu.parentNode !== wrap) { wrap.appendChild(menu); }
    }
    function close() {
      if (!open) { return; }
      open = false; menu.classList.remove("is-open"); trigger.setAttribute("aria-expanded", "false");
      document.removeEventListener("scroll", onMove, true); window.removeEventListener("resize", onMove);
      dock();
    }
    function onMove(e) { if (open && !(e && e.target === menu)) { place(); } }
    /* idempotent: when the options are unchanged only the selected class + label are updated. Rebuilding the buttons while the list is
       open replayed the pop-in / stagger animation of every item = the flicker when choosing a value. */
    function sync() {
      var n = sel.options.length, kids = menu.children, same = kids.length === n, i, o;
      for (i = 0; same && i < n; i++) { if (kids[i].textContent !== sel.options[i].textContent) { same = false; } }
      if (!same) {
        menu.textContent = "";
        for (i = 0; i < n; i++) {
          o = document.createElement("button"); o.type = "button"; o.className = "settings-language-dropdown__option";
          o.setAttribute("role", "option"); o.setAttribute("data-index", String(i));
          o.textContent = sel.options[i].textContent; menu.appendChild(o);
        }
      }
      for (i = 0; i < n; i++) { kids[i].classList.toggle("is-selected", i === sel.selectedIndex); }
      label.textContent = sel.options[sel.selectedIndex] ? sel.options[sel.selectedIndex].textContent : "";
    }
    function pick(i) {
      if (i < 0 || i >= sel.options.length) { return; }
      sel.selectedIndex = i;
      var ev; try { ev = new Event("change", { bubbles: true }); } catch (e) { ev = document.createEvent("Event"); ev.initEvent("change", true, true); }
      close(); sync(); sel.dispatchEvent(ev); try { trigger.focus({ preventScroll: true }); } catch (e) { trigger.focus(); }
    }
    /* open downward when it fits, else upward, else the side with more room (list scrolls inside itself); bounds = the window, 8px margin */
    function place() {
      var M = 8, vw = document.documentElement.clientWidth || window.innerWidth, vh = window.innerHeight;
      var t = trigger.getBoundingClientRect();
      menu.style.maxHeight = ""; menu.style.overflowY = "";
      menu.classList.add("is-floating");
      var w = Math.round(t.width), left = Math.max(M, Math.min(Math.round(t.left), vw - w - M));
      menu.style.width = w + "px"; menu.style.left = left + "px"; menu.style.bottom = "auto";
      var need = menu.scrollHeight + 2, below = vh - t.bottom - M - 4, above = t.top - M - 4;
      var up = below < need && above > below;
      var room = Math.max(80, Math.floor(up ? above : below));
      if (need > room) { menu.style.maxHeight = room + "px"; menu.style.overflowY = "auto"; }
      var h = Math.min(need, room);
      menu.style.top = Math.round(up ? t.top - 4 - h : t.bottom + 4) + "px";
      menu.classList.toggle("is-up", up);
    }
    trigger.addEventListener("click", function () {
      if (open) { close(); }
      else {
        sync(); open = true; document.body.appendChild(menu);
        menu.classList.add("is-open"); trigger.setAttribute("aria-expanded", "true"); place();
        document.addEventListener("scroll", onMove, true); window.addEventListener("resize", onMove);   /* follow the trigger while the page scrolls */
      }
    });
    trigger.addEventListener("keydown", function (e) {
      if (e.key === "ArrowDown") { e.preventDefault(); if (!open) { trigger.click(); } else { pick(Math.min(sel.options.length - 1, sel.selectedIndex + 1)); } }
      else if (e.key === "ArrowUp") { e.preventDefault(); if (!open) { trigger.click(); } else { pick(Math.max(0, sel.selectedIndex - 1)); } }
      else if (e.key === "Escape") { close(); }
    });
    menu.addEventListener("click", function (e) {
      var t = e.target; while (t && t !== menu) { if (t.classList && t.classList.contains("settings-language-dropdown__option")) { pick(Number(t.getAttribute("data-index"))); return; } t = t.parentNode; }
    });
    document.addEventListener("mousedown", function (e) { if (open && !wrap.contains(e.target) && !menu.contains(e.target)) { close(); } });
    sel.addEventListener("change", sync);
    sel._ncSync = sync; sync();
  }

  /* ---------------- build + bind ---------------- */
  var syncers = [];

  function init() {
    initTabs();
    try {
      if (window.ResizeObserver) {
        var ro = new ResizeObserver(scheduleFit), gs = document.querySelectorAll(".settings-group");
        for (var gi = 0; gi < gs.length; gi++) { ro.observe(gs[gi]); }
      }
      window.addEventListener("load", scheduleFit);
    } catch (e) { }

    /* swatches */
    var sw = $("settingsSwatches"), html = "";
    for (var i = 0; i < COLORS.length; i++) { html += '<button type="button" data-quick-preset="' + COLORS[i] + '" style="--swatch:' + COLORS[i] + '" aria-label="' + COLORS[i] + '"></button>'; }
    sw.innerHTML = html;
    var sb = sw.querySelectorAll("[data-quick-preset]");
    for (i = 0; i < sb.length; i++) {
      sb[i].addEventListener("click", function (e) {
        var c = normalizeHex(e.currentTarget.getAttribute("data-quick-preset"));
        set("uiColor", c); set("graphLineColor", c); set("handleColor", c); refreshAll();
      });
    }

    /* color edit buttons */
    var eb = document.querySelectorAll("[data-color-edit]");
    for (i = 0; i < eb.length; i++) {
      /* a press outside the picker closes it first; if that press was on this very button, it should stay closed */
      eb[i].addEventListener("mousedown", function (e) {
        e.currentTarget.__ncOff = (lastKey === e.currentTarget.getAttribute("data-color-edit")) && !!document.querySelector(".mt-cp.is-closing");
      });
      eb[i].addEventListener("click", function (e) {
        var k = e.currentTarget.getAttribute("data-color-edit");
        if (e.currentTarget.__ncOff) { e.currentTarget.__ncOff = false; lastKey = ""; return; }
        openColorEditor(k, e.currentTarget);
      });
    }

    /* toggles */
    function toggle(id, key, onVal, offVal, isOn) {
      var el = $(id); el.addEventListener("change", function () { set(key, el.checked ? onVal : offVal); refreshAll(); });
      syncers.push(function () { el.checked = isOn(); });
    }
    toggle("settingsAutoApply", "autoApply", "true", "false", function () { return readBool("autoApply"); });
    toggle("settingsOvershoot", "overshoot", "true", "false", function () { return read("overshoot") !== "false"; });
    toggle("settingsLiveBall", "liveBall", "1", "0", function () { return read("liveBall") !== "0"; });
    /* panel view: the two toggles exclude each other, so the Curve tab is never left empty */
    toggle("settingsHidePresets", "hidePresets", "true", "false", function () { return readBool("hidePresets"); });
    toggle("settingsHideGraph", "hideGraph", "true", "false", function () { return readBool("hideGraph"); });
    $("settingsHidePresets").addEventListener("change", function () { if (this.checked && readBool("hideGraph")) { set("hideGraph", "false"); refreshAll(); } });
    $("settingsHideGraph").addEventListener("change", function () { if (this.checked && readBool("hidePresets")) { set("hidePresets", "false"); refreshAll(); } });
    toggle("settingsBgOriginal", "bgOrig", "true", "false", function () { return readBool("bgOrig"); });
    toggle("settingsGradOn", "gradOn", "1", "0", function () { return read("gradOn") === "1"; });

    /* dropdowns */
    createDropdown("settingsLayoutMode"); createDropdown("settingsBackgroundEffect");
    var lm = $("settingsLayoutMode"), fx = $("settingsBackgroundEffect");
    lm.addEventListener("change", function () { set("layoutMode", lm.value); });
    fx.addEventListener("change", function () { set("pEffect", fx.value); });
    syncers.push(function () {
      var m = read("layoutMode"); lm.value = (m === "portrait" || m === "landscape") ? m : "auto"; if (lm._ncSync) { lm._ncSync(); }
      var e = read("pEffect"); fx.value = (e === "rain" || e === "snow" || e === "circles" || e === "off") ? e : "particles"; if (fx._ncSync) { fx._ncSync(); }
    });

    /* segmented controls */
    function seg(id, key, match) {
      var box = $(id), b = box.querySelectorAll("button");
      for (var j = 0; j < b.length; j++) {
        b[j].addEventListener("click", function (e) { set(key, e.currentTarget.getAttribute("data-v")); refreshAll(); });
      }
      syncers.push(function () { for (var j = 0; j < b.length; j++) { b[j].classList.toggle("is-selected", match(b[j].getAttribute("data-v"))); } });
    }
    seg("settingsGlowSide", "wgDir", function (v) { return parseFloat(v) === Math.round(num(read("wgDir"), 0, 360, 90)) % 360; });
    seg("settingsGradArea", "gradArea", function (v) { return v === (read("gradArea") === "graph" ? "graph" : "panel"); });

    /* ranges */
    syncers.push(bindRange("settingsGlowDir", "wgDir", "settingsGlowDirValue", deg));
    syncers.push(bindRange("settingsGlowInt", "wgInt", "settingsGlowIntValue", pct));
    syncers.push(bindRange("settingsGlowSize", "wgSize", "settingsGlowSizeValue", pct));
    syncers.push(bindRange("settingsGradDir", "gradDir", "settingsGradDirValue", deg));
    syncers.push(bindRange("settingsGradInt", "gradInt", "settingsGradIntValue", pct));
    syncers.push(bindRange("settingsEffectAlpha", "pAlpha", "settingsEffectAlphaValue", pct));
    syncers.push(bindRange("settingsHandleSize", "hSize", "settingsHandleSizeValue", function (v) { return v.toFixed(1); }));
    syncers.push(bindRange("settingsHandleLineThickness", "hLine", "settingsHandleLineThicknessValue", function (v) { return v.toFixed(1) + "px"; }));
    syncers.push(bindRange("settingsOpacity", "bgOpacity", "settingsOpacityValue", pct, function (v) { return String(Math.round(parseFloat(v)) / 100); }));

    /* resets */
    $("settingsResetGlow").addEventListener("click", function () { set("wgDir", "90"); set("wgInt", "45"); set("wgSize", "55"); refreshAll(); });
    $("settingsResetGradient").addEventListener("click", function () {
      set("gradP", "bw"); set("gradC1", DEF.gradC1); set("gradC2", DEF.gradC2); set("gradGlow", DEF.gradGlow);
      set("gradDir", "160"); set("gradInt", "100"); set("gradArea", "panel"); set("gradOn", "0"); refreshAll();
    });
    $("settingsResetEffect").addEventListener("click", function () { set("pEffect", "particles"); set("pColor", "#ffffff"); set("pAlpha", "100"); refreshAll(); });

    /* graph background media */
    var drop = $("settingsDropzone"), fin = $("settingsFileInput");
    function setBackground(src) { if (src) { safeSet("bgImagePath", src); refreshAll(); } }
    drop.addEventListener("click", function () { if (!pickFile("Select Graph Background", ["png", "jpg", "jpeg", "gif"], setBackground)) { fin.click(); } });
    fin.addEventListener("change", function () {
      var f = fin.files && fin.files[0]; fin.value = "";
      if (okImage(f, /\.(png|jpe?g|gif)$/i, /^image\/(png|jpeg|gif)$/i)) { fileToSource(f, setBackground); }
    });
    hookDrop(drop, function (f) { if (okImage(f, /\.(png|jpe?g|gif)$/i, /^image\/(png|jpeg|gif)$/i)) { fileToSource(f, setBackground); } });
    $("settingsClearBackground").addEventListener("click", function () { set("bgImagePath", ""); refreshAll(); });

    /* handles */
    var hp = $("settingsHandlePresets").querySelectorAll("[data-handle-style]");
    for (i = 0; i < hp.length; i++) {
      hp[i].addEventListener("click", function (e) { set("hStyle", e.currentTarget.getAttribute("data-handle-style")); refreshAll(); });
    }
    var hd = $("settingsHandleDropzone"), hin = $("settingsHandleFileInput");
    function setHandleImage(src) { if (src) { safeSet("hImg", src); set("hStyle", "image"); refreshAll(); } }
    hd.addEventListener("click", function () {
      if (read("hImg") && read("hStyle") !== "image") { set("hStyle", "image"); refreshAll(); return; }
      if (!pickFile("Select Handle Image (PNG / GIF)", ["png", "gif"], setHandleImage)) { hin.click(); }
    });
    hin.addEventListener("change", function () {
      var f = hin.files && hin.files[0]; hin.value = "";
      if (okImage(f, /\.(png|gif)$/i, /^image\/(png|gif)$/i)) { fileToSource(f, setHandleImage); }
    });
    hookDrop(hd, function (f) { if (okImage(f, /\.(png|gif)$/i, /^image\/(png|gif)$/i)) { fileToSource(f, setHandleImage); } });
    $("settingsClearHandleImage").addEventListener("click", function () {
      set("hImg", ""); if (read("hStyle") === "image") { set("hStyle", "circle"); } refreshAll();
    });

    refreshAll();
    setInterval(refreshAll, 500);   /* picks up changes made in other windows / the Adjust Background editor */
    window.addEventListener("storage", function (e) { if (!e.key || e.key.indexOf("neucurve_") === 0) { refreshAll(); } });
    try {
      if (window.CSInterface) {
        new window.CSInterface().addEventListener("com.neucurve.sync", function (ev) {
          try {
            var d = ev && ev.data; if (typeof d === "string") { d = JSON.parse(d); }
            if (d && d.appId !== APP_ID && d.key && !d.json) { write(d.key, d.val); refreshAll(); }
          } catch (e) { }
        });
      }
    } catch (e) { }
  }

  /* ---------------- refresh ---------------- */
  var lastSig = "";
  function refreshAll() {
    var root = document.documentElement;
    var ui = colorOf("uiColor");
    root.style.setProperty("--settings-theme", ui);
    root.style.setProperty("--settings-theme-soft", hexToRgba(ui, 0.26));
    root.style.setProperty("--ui-color", ui);

    /* gradient preview (same variables Flow's preview uses) */
    var gd = Math.round(num(read("gradDir"), 0, 360, 160)), gi = Math.round(num(read("gradInt"), 0, 100, 100));
    root.style.setProperty("--settings-background-start", colorOf("gradC1"));
    root.style.setProperty("--settings-background-end", colorOf("gradC2"));
    root.style.setProperty("--settings-background-direction", gd + "deg");
    root.style.setProperty("--settings-background-dim", (1 - gi / 100).toFixed(3));
    var btns = document.querySelectorAll("[data-color-edit]");   /* every color button (UI, graph line, handle, gradient, effect), not only the gradient ones */
    for (var i = 0; i < btns.length; i++) { btns[i].style.setProperty("--settings-edit-color", colorOf(btns[i].getAttribute("data-color-edit"))); }

    /* swatches */
    var sw = document.querySelectorAll("[data-quick-preset]");
    for (i = 0; i < sw.length; i++) { sw[i].classList.toggle("is-selected", normalizeHex(sw[i].getAttribute("data-quick-preset")) === ui); }

    for (i = 0; i < syncers.length; i++) { syncers[i](); }

    /* media dropzone */
    var path = String(read("bgImagePath") || ""), prev = $("settingsDropPreview"), zone = $("settingsDropzone");
    if (prev.getAttribute("data-src") !== path) {
      prev.setAttribute("data-src", path);
      while (prev.firstChild) { prev.removeChild(prev.firstChild); }
      if (path) { var im = document.createElement("img"); im.alt = ""; im.src = path; prev.appendChild(im); }
    }
    zone.classList.toggle("has-media", !!path);
    zone.classList.toggle("use-original-color", readBool("bgOrig"));
    $("settingsDropEmpty").style.display = path ? "none" : "";
    if (prev.firstChild) { prev.firstChild.style.opacity = String(num(read("bgOpacity"), 0, 1, 1)); }
    $("nc-bg-edit-open").disabled = !path;
    $("settingsClearBackground").disabled = !path;

    /* handles */
    var style = read("hStyle"), img = String(read("hImg") || "");
    var hb = $("settingsHandlePresets").querySelectorAll("[data-handle-style]");
    for (i = 0; i < hb.length; i++) {
      var on = hb[i].getAttribute("data-handle-style") === style;
      hb[i].classList.toggle("is-selected", on); hb[i].setAttribute("aria-pressed", on ? "true" : "false");
    }
    var hpv = $("settingsHandlePreview"), hdz = $("settingsHandleDropzone");
    if (hpv.getAttribute("data-src") !== img) {
      hpv.setAttribute("data-src", img);
      while (hpv.firstChild) { hpv.removeChild(hpv.firstChild); }
      if (img) { var hi = document.createElement("img"); hi.alt = ""; hi.src = img; hpv.appendChild(hi); }
    }
    hdz.classList.toggle("has-image", !!img);
    hdz.classList.toggle("is-selected", style === "image");
    hdz.setAttribute("aria-pressed", style === "image" ? "true" : "false");
    $("settingsClearHandleImage").disabled = !img;
    root.style.setProperty("--settings-handle-preview-size", clamp(Math.round(num(read("hSize"), 2, 9, 4.5) * 14 / 4.5), 12, 24) + "px");

  }

  /* Window size: 585 wide like Flow, height follows the content (fitWindow). Re-applied a few times at startup so an old
     manifest (320 x 580 or the previous fixed 585 x 625) cannot win; the height is the last fitted one once there is one. */
  function resizeWindow(tries) {
    var w = 585, h = lastFitH || 625;
    /* Was: resizeContent called 3 times (0 / 250 / 500 ms) plus the fit = 4 native resizes while the window was still opening.
       Now it resizes only when the window really is not that size (an old manifest), and stops as soon as it is. */
    var off = Math.abs(window.innerWidth - w) > 2 || Math.abs(window.innerHeight - h) > 2;
    if (off) {
      try { if (window.__adobe_cep__ && window.__adobe_cep__.resizeContent) { window.__adobe_cep__.resizeContent(w, h); } else if (window.CSInterface) { var cs = new window.CSInterface(); if (cs.resizeContent) { cs.resizeContent(w, h); } } } catch (e) { }
    }
    if (off && tries > 0) { setTimeout(function () { resizeWindow(tries - 1); }, 250); } else { scheduleFit(); }
  }
  resizeWindow(2);

  if (document.readyState === "loading") { document.addEventListener("DOMContentLoaded", init); } else { init(); }
})();
