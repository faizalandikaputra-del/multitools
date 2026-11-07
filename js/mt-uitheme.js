/**
 * mt-uitheme.js - interface "Style" switch: Glass (default, the original look) or Material You.
 *
 *   <html data-ui-theme="glass|material">   chosen style (css/material-theme.css reacts to "material")
 *   <html data-theme="dark|light">          light/dark. Glass follows the After Effects UI brightness (main.js syncTheme());
 *                                            Material You sets it to its palette scheme (light/dark, js/mt-material.js).
 *   localStorage "mtx.uiTheme"              the saved choice ("material"; anything else = glass). An inline script in the
 *                                            <head> of html/index.html applies it before first paint (no flash of the wrong style).
 *
 * Theme color, Background color and Light/Dark are SHARED by both styles (e.g. Glass = red + Light -> Material You = red + Light):
 *   Theme color -> one seed (main.js -> MTMaterial.setSeed);  Background color -> localStorage "mtx.bgColor" (mirrored into MTMaterial);
 *   Light/Dark  -> a pick on either style is stored for both ("mtx.glassMode" + "mtx.mdMode"). As before, a Light/Dark pick clears the custom background colour.
 * The picker lives in Settings (#ui-theme-field); the Material You preview card is painted live by paintPreview(). Settings > "Reset everything" calls MTUiTheme.reset().
 * Plain ES5 for old CEP hosts.
 */
(function () {
  "use strict";
  var KEY = "mtx.uiTheme";
  var root = document.documentElement;

  function saved() { try { return localStorage.getItem(KEY) === "material" ? "material" : "glass"; } catch (e) { return "glass"; } }
  function current() { return root.getAttribute("data-ui-theme") === "material" ? "material" : "glass"; }

  // Glass Light/Dark: "light" | "dark" pinned by the user (localStorage "mtx.glassMode"); nothing stored = follow the After
  // Effects UI until the first pick. main.js syncTheme() honours it; "mt-glass-mode" lets main.js drop a custom Glass
  // background colour, whose inline surfaces would otherwise hide the change.
  var KEY_G = "mtx.glassMode";
  function glassMode() { try { var v = localStorage.getItem(KEY_G); return v === "light" || v === "dark" ? v : null; } catch (e) { return null; } }
  function glassApply() {
    var g = glassMode();
    if (g) { root.setAttribute("data-theme", g); }
    else if (typeof window.mtSyncTheme === "function") { window.mtSyncTheme(); }
  }
  function setGlassMode(m) {
    try { if (m === "light" || m === "dark") { localStorage.setItem(KEY_G, m); } else { localStorage.removeItem(KEY_G); } } catch (e) { }
    if ((m === "light" || m === "dark") && M()) { M().setMode(m); }      // same Light/Dark for Material You (also clears its canvas colour, like Glass does)
    if (current() === "glass") {
      glassApply();
      try { document.dispatchEvent(new CustomEvent("mt-glass-mode", { detail: { mode: m } })); } catch (e) { }
    }
    paintExtras();
  }

  // Glass -> Material You: carry the shared Light/Dark pick + background colour over to the Material You palette.
  function syncToMaterial() {
    var m = M(), gm = glassMode(), sb = glassSavedBg();
    if (!m) { return; }
    if (gm) { m.setMode(gm); }                                          // (this clears the Material canvas colour, so the colour is set after it)
    if (/^#[0-9a-f]{6}$/i.test(sb)) { m.setBg(sb); }
  }

  function paintCards(name) {
    var cards = document.querySelectorAll("[data-ui-theme-opt]"), i;
    for (i = 0; i < cards.length; i++) {
      var on = cards[i].getAttribute("data-ui-theme-opt") === name;
      cards[i].setAttribute("aria-checked", on ? "true" : "false");
      cards[i].tabIndex = on ? 0 : -1;
    }
  }

  // The Material You preview card mirrors the real style: it gets its own copy of the live --md-* palette
  // (Theme color + Light/Dark + custom background), so it matches the UI even while Glass is the active style.
  var pvKeys = [];
  function glassSavedBg() { try { return (localStorage.getItem("mtx.bgColor") || "").trim(); } catch (e) { return ""; } }
  function paintPreview() {
    var m = M(), sw = document.querySelector(".ui-theme-swatch--material"), gl = document.querySelector(".ui-theme-swatch--glass"), vars, k, i;
    if (!m || !sw) { return; }
    if (gl) {                                                         // Glass preview follows Theme color + Light/Dark too
      var scheme = current() === "glass" ? (root.getAttribute("data-theme") === "light" ? "light" : "dark") : (glassMode() || "dark");
      // A custom Glass Background color (inline --bg on <html>, set by Settings.applyColor) tints the preview too, and decides
      // whether the preview is drawn light or dark - otherwise the card kept its fixed #1b1b22 / #e9e9ee whatever you picked.
      // Material You active: inline --bg is no longer the Glass colour, so read the saved Glass colour (localStorage "mtx.bgColor")
      // instead - otherwise the Glass card fell back to its default colour as soon as you switched style.
      var cb = /^#([0-9a-f]{6})$/i.exec(current() === "glass" ? root.style.getPropertyValue("--bg").trim() : glassSavedBg());
      if (cb) {
        var bn = parseInt(cb[1], 16);
        gl.style.setProperty("--gp-bg", "#" + cb[1]);
        scheme = (((bn >> 16) & 255) + ((bn >> 8) & 255) + (bn & 255)) / 3 > 150 ? "light" : "dark";
      } else { gl.style.removeProperty("--gp-bg"); }
      gl.setAttribute("data-gp-scheme", scheme);
      var seed = String(m.getSeed()), c = /^#?([0-9a-f]{6})$/i.exec(seed), n;
      if (c) {
        n = parseInt(c[1], 16);
        gl.style.setProperty("--gp-accent", "#" + c[1]);
        gl.style.setProperty("--gp-rgb", ((n >> 16) & 255) + "," + ((n >> 8) & 255) + "," + (n & 255));
      }
    }
    try { vars = m.build(m.getSeed(), m.getBg(), m.getMode()); } catch (e) { return; }
    for (i = 0; i < pvKeys.length; i++) { sw.style.removeProperty(pvKeys[i]); }
    pvKeys = [];
    for (k in vars) { if (vars.hasOwnProperty(k) && k.indexOf("--md-") === 0) { sw.style.setProperty(k, vars[k]); pvKeys.push(k); } }
  }

  function apply(name) {
    name = name === "material" ? "material" : "glass";
    var was = current();
    root.setAttribute("data-ui-theme", name);
    if (name === "material") {
      root.setAttribute("data-theme", "light");
      if (was !== "material") { syncToMaterial(); }
    } else if (was === "material") {
      root.setAttribute("data-theme", "dark");                          // sensible default...
      glassApply();                                                     // ...then the pinned Glass Light/Dark, or the AE host UI
    }
    paintCards(name);
    paintPreview();
    try { document.dispatchEvent(new CustomEvent("mt-uitheme", { detail: { name: name } })); } catch (e) { }
  }

  function set(name) {
    apply(name);
    try { if (name === "material") { localStorage.setItem(KEY, "material"); } else { localStorage.removeItem(KEY); } } catch (e) { }
  }

  // ---- wiring ----
  var cards = document.querySelectorAll("[data-ui-theme-opt]"), i;
  for (i = 0; i < cards.length; i++) {
    (function (card) {
      card.addEventListener("click", function () { set(card.getAttribute("data-ui-theme-opt")); });
      card.addEventListener("keydown", function (e) {
        if (e.key !== "ArrowLeft" && e.key !== "ArrowRight" && e.key !== "ArrowUp" && e.key !== "ArrowDown") { return; }
        e.preventDefault();
        var next = current() === "glass" ? "material" : "glass";
        set(next);
        var t = document.querySelector('[data-ui-theme-opt="' + next + '"]'); if (t) { t.focus(); }
      });
    })(cards[i]);
  }

  // ---- Material You extras: palette swatches (-> Theme color), Light/Dark, background "Default" ----
  function M() { return window.MTMaterial; }
  function paintExtras() {
    var m = M(), j, seed = m ? String(m.getSeed()).toLowerCase() : "", sw = document.querySelectorAll("[data-mu-seed]");
    for (j = 0; j < sw.length; j++) { sw[j].setAttribute("aria-checked", sw[j].getAttribute("data-mu-seed") === seed ? "true" : "false"); }
    var md = document.querySelectorAll("[data-mu-mode]");
    for (j = 0; j < md.length; j++) {
      var want = md[j].getAttribute("data-mu-mode");
      md[j].setAttribute("aria-checked", current() === "glass" ? (want === root.getAttribute("data-theme") ? "true" : "false")
        : (m && !m.isCustomBg() && want === m.getMode() ? "true" : "false"));
    }
    var bg = document.getElementById("bg-color");
    if (bg && m && current() === "material") { try { bg.value = m.canvas(); } catch (e) { } }   // the colour input shows the live canvas
  }
  (function wireExtras() {
    var j, sw = document.querySelectorAll("[data-mu-seed]"), md = document.querySelectorAll("[data-mu-mode]"), rb = document.getElementById("bg-reset");
    for (j = 0; j < sw.length; j++) {
      sw[j].addEventListener("click", function () {
        var tc = document.getElementById("theme-color"); if (!tc) { return; }
        tc.value = this.getAttribute("data-mu-seed");
        tc.dispatchEvent(new Event("input", { bubbles: true }));       // main.js applies + saves it exactly like the colour picker
      });
    }
    for (j = 0; j < md.length; j++) {
      md[j].addEventListener("click", function () {
        var v = this.getAttribute("data-mu-mode");
        if (current() === "glass") { setGlassMode(v); }
        else if (M()) {
          M().setMode(v);
          try { localStorage.setItem(KEY_G, v); localStorage.removeItem("mtx.bgColor"); } catch (e) { }   // Glass gets the same Light/Dark (and drops its custom colour, like Material does)
        }
      });
    }
    if (rb) { rb.addEventListener("click", function () { if (current() === "material" && M()) { M().setBg(null); } }); }   // (main.js clears the shared "mtx.bgColor")   // Glass: handled in main.js
    document.addEventListener("mt-palette", paintExtras);
    document.addEventListener("mt-palette-preview", function () { paintPreview(); paintExtras(); });
    document.addEventListener("mt-uitheme", paintExtras);
    try { new MutationObserver(function () { paintExtras(); paintPreview(); }).observe(root, { attributes: true, attributeFilter: ["data-theme"] }); } catch (e) { }
  })();

  // One-time carry-over: a background colour that only Material You had (older builds kept two separate colours) becomes the shared one.
  (function migrate() { var m = M(); if (m && !glassSavedBg() && m.getBg()) { try { localStorage.setItem("mtx.bgColor", m.getBg()); } catch (e) { } } })();

  if (saved() === "material") { syncToMaterial(); }   // opened straight into Material You: still pick up the shared Light/Dark + background colour

  apply(saved());                                   // (the <head> script already did the attributes; this paints the picker)
  window.MTUiTheme = { get: current, set: set, reset: function () { setGlassMode(null); set("glass"); if (window.MTMaterial) { window.MTMaterial.reset(); } } };
})();
