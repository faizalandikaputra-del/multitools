/**
 * mt-material.js - dynamic "Material You" palette (like Google Pixel's wallpaper colours).
 *
 * Builds a Material-3 style tonal palette from ONE seed colour (Settings > Theme color) and writes it to <html> as
 * --md-* custom properties; css/material-theme.css only reads those variables. Active only while
 * <html data-ui-theme="material"> (js/mt-uitheme.js); on Glass every --md-* property is removed again.
 *
 *   seed colour  -> primary / secondary / tertiary tonal palettes + tinted neutrals (the Pixel look: the whole UI
 *                   carries a soft tint of the seed hue, accents are the seed hue at tone 40 (light) / 80 (dark))
 *   Light / Dark -> localStorage "mtx.mdMode"   ("light" default | "dark")
 *   Background   -> localStorage "mtx.mdBg"     optional custom canvas colour (Settings > Background color while
 *                   Material You is on). Cards / text are derived from it, and the scheme (light or dark text)
 *                   follows its brightness. Empty = the palette's own tinted background.
 *
 * Tones are made in OKLCH and matched to the Material "tone" (CIE L*) by luminance, then clipped to sRGB, so no
 * HCT library is needed. Plain ES5 (old CEP hosts). Public API: window.MTMaterial.
 */
(function (root) {
  "use strict";

  var K_BG = "mtx.mdBg", K_MODE = "mtx.mdMode", K_SCHEME = "mtx.mdScheme";
  var DEFAULT_SEED = "#8b6cf7";

  // ---------------------------------------------------------------- colour maths
  function clamp01(x) { return x < 0 ? 0 : x > 1 ? 1 : x; }
  function toLin(c) { c = c / 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
  function fromLin(c) { c = clamp01(c); return 255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055); }
  function parseHex(h) {
    var m = /^#?([0-9a-f]{6})$/i.exec(h || ""); if (!m) { return null; }
    var n = parseInt(m[1], 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function hex2(v) { v = Math.round(v); var s = (v < 0 ? 0 : v > 255 ? 255 : v).toString(16); return s.length < 2 ? "0" + s : s; }
  function toHex(lin) { return "#" + hex2(fromLin(lin[0])) + hex2(fromLin(lin[1])) + hex2(fromLin(lin[2])); }
  function rgbStr(hex) { var c = parseHex(hex); return c ? c[0] + "," + c[1] + "," + c[2] : "0,0,0"; }

  function linToLab(r, g, b) {
    var l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
    var m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
    var s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
    return [0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
            1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
            0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s];
  }
  function labToLin(L, a, b) {
    var l = L + 0.3963377774 * a + 0.2158037573 * b;
    var m = L - 0.1055613458 * a - 0.0638541728 * b;
    var s = L - 0.0894841775 * a - 1.2914855480 * b;
    l = l * l * l; m = m * m * m; s = s * s * s;
    return [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
            -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
            -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s];
  }
  function inGamut(c) { var e = 0.0005; return c[0] >= -e && c[0] <= 1 + e && c[1] >= -e && c[1] <= 1 + e && c[2] >= -e && c[2] <= 1 + e; }
  function lum(c) { return 0.2126 * clamp01(c[0]) + 0.7152 * clamp01(c[1]) + 0.0722 * clamp01(c[2]); }

  // hex -> {L, c, h}  (OKLCH, h in radians)
  function hexToLch(hex) {
    var rgb = parseHex(hex) || parseHex(DEFAULT_SEED);
    var lab = linToLab(toLin(rgb[0]), toLin(rgb[1]), toLin(rgb[2]));
    return { L: lab[0], c: Math.sqrt(lab[1] * lab[1] + lab[2] * lab[2]), h: Math.atan2(lab[2], lab[1]) };
  }
  // colour at lightness L / chroma c / hue h, chroma pulled back until it fits sRGB
  function lchToLin(L, c, h) {
    var lo = 0, hi = c, i, t = labToLin(L, c * Math.cos(h), c * Math.sin(h));
    if (inGamut(t)) { return t; }
    for (i = 0; i < 14; i++) {
      var mid = (lo + hi) / 2, k = labToLin(L, mid * Math.cos(h), mid * Math.sin(h));
      if (inGamut(k)) { lo = mid; } else { hi = mid; }
    }
    return labToLin(L, lo * Math.cos(h), lo * Math.sin(h));
  }
  function lchHex(L, c, h) { return toHex(lchToLin(clamp01(L), c, h)); }

  // Material tone (CIE L*, 0-100) of hue h / chroma c -> hex. Lightness is solved so the real luminance matches.
  function tone(h, c, T) {
    if (T <= 0) { return "#000000"; }
    if (T >= 100) { return "#ffffff"; }
    var fy = (T + 16) / 116, Yt = T > 8 ? fy * fy * fy : T / 903.2963;
    var lo = 0, hi = 1, i, rgb;
    for (i = 0; i < 22; i++) {
      var mid = (lo + hi) / 2;
      rgb = lchToLin(mid, c, h);
      if (lum(rgb) < Yt) { lo = mid; } else { hi = mid; }
    }
    return toHex(lchToLin((lo + hi) / 2, c, h));
  }

  // ---------------------------------------------------------------- palette
  var TWO_PI = Math.PI * 2;
  function seedParts(seedHex) {
    var s = hexToLch(seedHex), grey = s.c < 0.02;
    return {
      h: s.h,
      grey: grey,
      pC: grey ? s.c : Math.max(s.c, 0.13),
      sC: grey ? 0 : 0.055,
      tC: grey ? 0 : 0.078,
      tH: s.h + Math.PI / 3,
      nC: grey ? 0 : 0.016,
      nvC: grey ? 0 : 0.03
    };
  }

  // Everything the stylesheet needs, as { "--md-name": value }.
  function build(seedHex, bgHex, mode) {
    var p = seedParts(seedHex), dark, v = {}, bg, bgL;

    // Light/Dark is shared with Glass (js/mt-uitheme.js): a pinned choice ("mtx.glassMode") decides the scheme even with a custom
    // background colour - e.g. red + Light stays Light on both styles. With no pinned choice the colour's brightness decides.
    var pin = lsGet("mtx.glassMode");
    if (bgHex && parseHex(bgHex)) { bgL = hexToLch(bgHex); dark = (pin === "light" || pin === "dark") ? pin === "dark" : bgL.L < 0.6; } else { dark = mode === "dark"; }

    // accents (always from the seed)
    var sp = parseHex(seedHex) || parseHex(DEFAULT_SEED), seedExact = "#" + hex2(sp[0]) + hex2(sp[1]) + hex2(sp[2]);
    if (dark) {
      v["--md-primary"] = tone(p.h, p.pC, 80);   v["--md-on-primary"] = tone(p.h, p.pC, 20);
      v["--md-primary-container"] = tone(p.h, p.pC, 30);   v["--md-on-primary-container"] = tone(p.h, p.pC, 90);
      v["--md-secondary"] = tone(p.h, p.sC, 80);
      v["--md-secondary-container"] = tone(p.h, p.sC, 30); v["--md-on-secondary-container"] = tone(p.h, p.sC, 90);
      v["--md-tertiary"] = tone(p.tH, p.tC, 80);
      v["--md-tertiary-container"] = tone(p.tH, p.tC, 30); v["--md-on-tertiary-container"] = tone(p.tH, p.tC, 90);
      v["--md-error"] = "#f2b8b5"; v["--md-error-container"] = "#8c1d18"; v["--md-on-error-container"] = "#f9dedc";
    } else {
      v["--md-primary"] = tone(p.h, p.pC, 40);   v["--md-on-primary"] = "#ffffff";
      v["--md-primary-container"] = tone(p.h, p.pC, 90);   v["--md-on-primary-container"] = tone(p.h, p.pC, 10);
      v["--md-secondary"] = tone(p.h, p.sC, 40);
      v["--md-secondary-container"] = tone(p.h, p.sC, 90); v["--md-on-secondary-container"] = tone(p.h, p.sC, 10);
      v["--md-tertiary"] = tone(p.tH, p.tC, 40);
      v["--md-tertiary-container"] = tone(p.tH, p.tC, 90); v["--md-on-tertiary-container"] = tone(p.tH, p.tC, 10);
      v["--md-error"] = "#b3261e"; v["--md-error-container"] = "#f9dedc"; v["--md-on-error-container"] = "#410e0b";
    }

    // Theme color: the primary is the EXACT colour picked in Settings (what Glass uses as its accent), on-primary by the same
    // luminance rule Glass uses (--theme-on-accent); the tonal containers above stay derived from its hue.
    v["--md-primary"] = seedExact;
    v["--md-on-primary"] = (0.299 * sp[0] + 0.587 * sp[1] + 0.114 * sp[2]) > 150 ? "#111114" : "#ffffff";

    if (bgL) {
      // custom canvas: surfaces are the canvas nudged lighter / darker (same offsets the M3 tone steps have)
      var c = Math.min(bgL.c, 0.12), h = bgL.h, L = bgL.L, off = dark
        ? { lowest: -0.03, low: 0.036, mid: 0.049, high: 0.08, highest: 0.113 }
        : { lowest: 0.02, low: -0.02, mid: -0.036, high: -0.053, highest: -0.071 };
      bg = bgHex.toLowerCase();
      v["--md-bg"] = bg;
      var br = parseHex(bgHex);
      // same per-channel steps Glass uses for its cards (main.js surfaceOffsets: card +7, hover +15, sunken -6), so a colour looks alike on both styles
      var step = function (d) { return "#" + hex2(Math.max(0, Math.min(255, br[0] + d))) + hex2(Math.max(0, Math.min(255, br[1] + d))) + hex2(Math.max(0, Math.min(255, br[2] + d))); };
      v["--md-surface-lowest"] = step(-6);
      v["--md-surface-low"] = step(3);
      v["--md-surface"] = step(7);
      v["--md-surface-high"] = step(11);
      v["--md-surface-highest"] = step(15);
      var tc = Math.min(c, 0.03);
      v["--md-on-surface"] = tone(h, tc, dark ? 92 : 10);
      v["--md-on-surface-variant"] = tone(h, tc, dark ? 80 : 30);
      v["--md-outline"] = tone(h, tc, dark ? 60 : 50);
      v["--md-outline-variant"] = tone(h, tc, dark ? 30 : 80);
    } else {
      var H = p.h, N = p.nC, NV = p.nvC;
      if (dark) {
        bg = tone(H, N, 6);
        v["--md-bg"] = bg;
        v["--md-surface-lowest"] = tone(H, N, 4); v["--md-surface-low"] = tone(H, N, 10); v["--md-surface"] = tone(H, N, 12);
        v["--md-surface-high"] = tone(H, N, 17); v["--md-surface-highest"] = tone(H, N, 22);
        v["--md-on-surface"] = tone(H, N, 90); v["--md-on-surface-variant"] = tone(H, NV, 80);
        v["--md-outline"] = tone(H, NV, 60); v["--md-outline-variant"] = tone(H, NV, 30);
      } else {
        bg = tone(H, N, 98);
        v["--md-bg"] = bg;
        v["--md-surface-lowest"] = "#ffffff"; v["--md-surface-low"] = tone(H, N, 96); v["--md-surface"] = tone(H, N, 94);
        v["--md-surface-high"] = tone(H, N, 92); v["--md-surface-highest"] = tone(H, N, 90);
        v["--md-on-surface"] = tone(H, N, 10); v["--md-on-surface-variant"] = tone(H, NV, 30);
        v["--md-outline"] = tone(H, NV, 50); v["--md-outline-variant"] = tone(H, NV, 80);
      }
    }
    v["--md-scrim"] = dark ? "rgba(0,0,0,0.55)" : "rgba(30,28,40,0.32)";
    // "r,g,b" twins, for rgba(var(--md-x-rgb), alpha)
    var rgbKeys = ["primary", "bg", "on-surface", "secondary-container", "primary-container", "outline", "on-primary"], i;
    for (i = 0; i < rgbKeys.length; i++) { v["--md-" + rgbKeys[i] + "-rgb"] = rgbStr(v["--md-" + rgbKeys[i]]); }
    v["--md-scheme"] = dark ? "dark" : "light";
    return v;
  }

  // ---------------------------------------------------------------- runtime
  var state = { seed: DEFAULT_SEED, bg: null, mode: "light", keys: [] };

  function lsGet(k) { try { return root.localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, val) { try { if (val == null) { root.localStorage.removeItem(k); } else { root.localStorage.setItem(k, val); } } catch (e) { } }

  function active() { return root.document && root.document.documentElement.getAttribute("data-ui-theme") === "material"; }

  function clearVars() {
    var st = root.document.documentElement.style, i;
    for (i = 0; i < state.keys.length; i++) { st.removeProperty(state.keys[i]); }
    state.keys = [];
    var el = root.document.documentElement;
    el.removeAttribute("data-md-scheme"); el.removeAttribute("data-md-bg");
  }

  // The Settings > Style preview card draws the live Material You palette even while Glass is active.
  function firePreview() {
    try { root.document.dispatchEvent(new CustomEvent("mt-palette-preview")); } catch (e) { }
  }

  function apply() {
    var el = root.document.documentElement;
    if (!active()) { clearVars(); firePreview(); return; }
    var vars = build(state.seed, state.bg, state.mode), k;
    clearVars();
    for (k in vars) { if (vars.hasOwnProperty(k)) { el.style.setProperty(k, vars[k]); state.keys.push(k); } }
    el.setAttribute("data-theme", vars["--md-scheme"]);     // dark text / light text for every shared stylesheet
    el.setAttribute("data-md-scheme", vars["--md-scheme"]);
    el.setAttribute("data-md-bg", state.bg ? "custom" : "default");
    lsSet(K_SCHEME, vars["--md-scheme"]);
    try { root.document.dispatchEvent(new CustomEvent("mt-palette", { detail: { bg: vars["--md-bg"], scheme: vars["--md-scheme"], custom: !!state.bg } })); } catch (e) { }
    firePreview();
  }

  function setSeed(hex) { state.seed = parseHex(hex) ? hex : DEFAULT_SEED; apply(); }
  function setBg(hex) {
    state.bg = parseHex(hex) ? hex.toLowerCase() : null;
    lsSet(K_BG, state.bg);
    apply();
  }
  function setMode(m) {
    state.mode = m === "dark" ? "dark" : "light";
    state.bg = null; lsSet(K_BG, null);                       // an explicit Light/Dark choice resets the canvas to the palette's own
    lsSet(K_MODE, state.mode === "dark" ? "dark" : null);
    apply();
  }

  state.bg = (function () { var b = lsGet(K_BG); return parseHex(b) ? b : null; })();
  state.mode = lsGet(K_MODE) === "dark" ? "dark" : "light";

  var api = {
    build: build,
    setSeed: setSeed, setBg: setBg, setMode: setMode, refresh: apply,
    getBg: function () { return state.bg; },
    getMode: function () { return state.mode; },
    getSeed: function () { return state.seed; },
    canvas: function () { return build(state.seed, state.bg, state.mode)["--md-bg"]; },
    isCustomBg: function () { return !!state.bg; },
    reset: function () { state.bg = null; state.mode = "light"; lsSet(K_BG, null); lsSet(K_MODE, null); apply(); }
  };
  root.MTMaterial = api;

  if (root.document) {
    root.document.addEventListener("mt-uitheme", apply);
    if (root.document.readyState === "loading") { root.document.addEventListener("DOMContentLoaded", apply); } else { apply(); }
  }
  if (typeof module !== "undefined" && module.exports) { module.exports = api; }
})(typeof window !== "undefined" ? window : { localStorage: null });
