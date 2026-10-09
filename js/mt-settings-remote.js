/* Multi Tool - mt-settings-remote.js  (PANEL side of the separate Settings window)
   The Settings controls still live in #settings-modal inside the panel, so every existing handler (theme, background,
   scale, animation, idle, updater ...) keeps working untouched. The modal is never shown any more:
     - the gear button (and any code that calls Settings.open()) opens the Settings window instead;
     - the window sends actions (click / value / check) that are replayed here on the real controls;
     - this script sends the controls' state back (value, checked, aria-checked, disabled, hidden, text) so the window mirrors it.
   Load AFTER js/main.js and js/mt-updater.js. ES5, Chromium-74 safe. */
(function () {
  "use strict";
  var bus = window.MTSettingsBus, modal = document.getElementById("settings-modal");
  if (!bus || !modal) { return; }

  var KEY_ATTRS = ["data-ui-theme-opt", "data-mu-seed", "data-mu-mode", "data-anim-style-opt", "data-anim-ease-opt", "data-label-select"];
  var SKIP = { "settings-modal": 1, "settings-title": 1, "settings-close": 1, "label-toggle": 1, "label-toggle-text": 1, "label-collapse": 1, "label-assign-list": 1 };
  var VARS = ["--accent", "--accent-rgb", "--accent-strong", "--accent-soft", "--on-accent", "--gp-rgb", "--gp-bg", "--gp-accent", "--mtx-k",
    "--md-bg", "--md-bg-rgb", "--md-primary", "--md-primary-rgb", "--md-on-primary", "--md-secondary-container", "--md-on-secondary-container",
    "--md-surface", "--md-on-surface", "--md-on-surface-variant", "--md-outline-rgb", "--md-primary-container"];
  var ROOT_ATTRS = ["data-ui-theme", "data-theme", "data-md-scheme", "data-reduce-motion", "data-anim-ease"];

  function keyOf(el) {
    if (el.id) { return "#" + el.id; }
    for (var i = 0; i < KEY_ATTRS.length; i++) {
      var v = el.getAttribute(KEY_ATTRS[i]);
      if (v !== null) { return "[" + KEY_ATTRS[i] + "=\"" + v + "\"]"; }
    }
    return null;
  }
  function find(key) { try { return modal.querySelector(key) || document.querySelector(key); } catch (e) { return null; } }   // #bg-* editor controls live outside the modal

  // ---------- open the window instead of the modal ----------
  document.addEventListener("click", function (e) {
    var t = e.target;
    while (t && t.nodeType === 1) {
      if (t.id === "settings-btn") { e.stopImmediatePropagation(); e.preventDefault(); bus.openWindow(); return; }
      t = t.parentNode;
    }
  }, true);
  // Settings.open() (e.g. "Done" in the background editor) adds .is-open: turn that into "open the window".
  function guardModal() {
    if (!modal.classList.contains("is-open")) { return; }
    modal.classList.remove("is-open"); modal.setAttribute("aria-hidden", "true");
    bus.openWindow();
  }
  try { new MutationObserver(guardModal).observe(modal, { attributes: true, attributeFilter: ["class"] }); } catch (e) { }

  // ---------- state -> window ----------
  var alive = 0, lastJson = "", timer = 0;
  function collect() {
    var els = modal.querySelectorAll("[id],[data-ui-theme-opt],[data-mu-seed],[data-mu-mode],[data-anim-style-opt],[data-anim-ease-opt],[data-label-select]");
    var k = {}, i, el, key, o, tag, type;
    for (i = 0; i < els.length; i++) {
      el = els[i]; key = keyOf(el);
      if (!key || (el.id && SKIP[el.id]) || k[key]) { continue; }
      tag = el.tagName; type = (el.type || "").toLowerCase(); o = {};
      if (tag === "INPUT" && (type === "checkbox" || type === "radio")) { o.c = el.checked; }
      else if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") { o.v = el.value; }
      else { o.t = (el.textContent || "").replace(/\s+/g, " ").replace(/^ | $/g, ""); }
      if (el.disabled) { o.d = 1; }
      var ar = el.getAttribute("aria-checked"); if (ar !== null) { o.a = ar; }
      var hid = el.hidden; if (!hid) { try { hid = getComputedStyle(el).display === "none"; } catch (e) { } }
      if (hid) { o.h = 1; }
      k[key] = o;
    }
    var root = document.documentElement, vars = {}, attrs = {}, cs = getComputedStyle(root);
    for (i = 0; i < VARS.length; i++) { var v = (cs.getPropertyValue(VARS[i]) || "").trim(); if (v) { vars[VARS[i]] = v; } }
    for (i = 0; i < ROOT_ATTRS.length; i++) { var a = root.getAttribute(ROOT_ATTRS[i]); if (a !== null) { attrs[ROOT_ATTRS[i]] = a; } }
    var sw = {}, g = modal.querySelector("[data-ui-theme-opt=\"glass\"] .ui-theme-swatch"), m = modal.querySelector("[data-ui-theme-opt=\"material\"] .ui-theme-swatch");
    if (g) { sw.glass = { style: g.getAttribute("style") || "", scheme: g.getAttribute("data-gp-scheme") || "" }; }
    if (m) { sw.material = { style: m.getAttribute("style") || "", scheme: "" }; }
    var list = document.getElementById("label-assign-list");
    return { k: k, vars: vars, attrs: attrs, sw: sw, list: list ? list.innerHTML : "" };
  }
  function push(force) {
    try { pushBg(); } catch (e0) { }
    var s; try { s = collect(); } catch (e) { return; }
    var json = JSON.stringify(s);
    if (!force && json === lastJson) { return; }
    lastJson = json; bus.send("state", s);
  }

  // ---------- background preview (Settings window > Background > Adjust background, js/mt-bg-preview.js) ----------
  // Small, frequent message "bgview" (view + opacity + panel shape + a media id). The media itself ("bgsrc": a file / data URL)
  // is sent only when the window asks for a media id it does not have yet, so a big GIF is never re-sent every tick.
  var bgId = 0, bgKey = "", bgMedia = null, lastBgJson = "";
  function bgNow() {
    var layer = document.getElementById("bg-layer"), mlayer = document.getElementById("bg-motion-layer"), kind = "", src = "";
    var vid = document.getElementById("bg-motion-video"), gif = document.getElementById("bg-motion-img");
    if (mlayer && mlayer.classList.contains("has-media")) {
      if (vid && vid.classList.contains("is-active")) { kind = "video"; src = vid.getAttribute("src") || ""; }
      else if (gif && gif.classList.contains("is-active")) { kind = "image"; src = gif.getAttribute("src") || ""; }
    }
    if (!src && layer && layer.classList.contains("has-img")) {
      var m = /^url\((['"]?)([\s\S]*)\1\)$/.exec(layer.style.backgroundImage || ""); if (m) { kind = "image"; src = m[2]; }
    }
    return { kind: kind, src: src };
  }
  function val(id, d) { var el = document.getElementById(id); var n = el ? parseFloat(el.value) : NaN; return isFinite(n) ? n : d; }
  function pushBg() {
    var now = bgNow(), key = now.kind + "|" + now.src;
    if (key !== bgKey) { bgKey = key; bgId++; bgMedia = { id: bgId, kind: now.kind, src: now.src }; }
    var v = {
      id: bgId, kind: now.kind, has: !!now.src, blob: now.src.indexOf("blob:") === 0,
      z: val("bg-zoom", 100), x: val("bg-pos-x", 50), y: val("bg-pos-y", 50), op: val("bg-motion-opacity", 100),
      aw: window.innerWidth || 1, ah: window.innerHeight || 1,
      gray: document.documentElement.classList.contains("mt-bg-gray")
    };
    var json = JSON.stringify(v);
    if (json !== lastBgJson) { lastBgJson = json; bus.send("bgview", v); }
  }
  bus.on("bgreq", function () { if (bgMedia && bgMedia.src.indexOf("blob:") !== 0) { bus.send("bgsrc", bgMedia); } });
  function soon() { setTimeout(push, 40); setTimeout(push, 300); }
  function tick() {
    if (Date.now() - alive > 7000) { clearInterval(timer); timer = 0; return; }
    push(false);
  }
  bus.on("hello", function () {
    alive = Date.now(); lastJson = ""; lastBgJson = "";
    push(true);
    if (!timer) { timer = setInterval(tick, 350); }
  });

  // ---------- window action -> real control ----------
  function fire(el, name) {
    var ev; try { ev = new Event(name, { bubbles: true }); } catch (e) { ev = document.createEvent("Event"); ev.initEvent(name, true, true); }
    el.dispatchEvent(ev);
  }
  bus.on("act", function (m) {
    var el = m && m.k ? find(m.k) : null;
    if (!el) { return; }
    if (m.t === "click") { el.click(); }
    else if (m.t === "check") { if (el.checked !== !!m.c) { el.click(); } }
    else if (m.t === "value") {
      if (el.value !== String(m.v)) { el.value = m.v; }
      fire(el, "input");
      if (m.f || el.tagName === "SELECT") { fire(el, "change"); }
    }
    soon();
  });
})();
