/* NeuCurve - theme accent + background sync with the Multi Tool panel.
   The panel's Settings > Theme color picker is the single source of truth for the extension's accent hue, and
   Settings > Background color is the single source of truth for its dark base tone. NeuCurve runs as a separate
   document inside an iframe, so it can't see the panel's CSS variables directly.
   The panel already posts a combined { mtBg: true, opacity, hasMedia, ... } message into this frame whenever
   its background OR its theme changes (see Curve.sync() / Settings.applyTheme() / Settings.applyColor() in the
   panel's js/main.js) - this file just also reads themeHex/themeRgb/bgHex/bgRgb off that same message (no
   separate round trip needed; the "Multitool integration: background opacity sync" bootstrap script already at
   the top of index.html handles asking the panel for its current state on load/retry).
   What this becomes here:
     --mt-accent      the accent hex, e.g. "#8b6cf7"
     --mt-accent-rgb  the same color as "r,g,b" (for rgba() uses)
     --mt-bg-rgb            the panel's background color as "r,g,b"
     --mt-bg-shell-rgb / --mt-bg-side-rgb / --mt-bg-rail-rgb / --mt-bg-canvas-rgb
                            tiers matched to the .graph-shell family's actual hardcoded colors
                            (#1e1e1e / #1a1a1a / #141414 / #0a0a0a) - see nc-theme-sync.css
     --bg-color             set straight to the hex for NeuCurve's <body> hook, kept for completeness,
                             though in practice .graph-shell (100vh, no var() of its own) paints over it
   plus "mt-themed" / "mt-bg-themed" classes on <html>. nc-theme-sync.css maps --mt-accent/--mt-accent-rgb onto
   NeuCurve's OWN theming hooks (--ui-color / --accent, which already drive its buttons/active states/preset
   borders) and its curve colors (--graph-color / --handle-color) with !important, since NeuCurve keeps
   re-asserting those two itself from its own per-model color every time a model's color changes - see
   nc-theme-sync.css for the full write-up and why !important is what actually wins that race. That same file
   also forces the curve <path>'s own SVG "stroke" attribute directly, belt-and-braces, using the identical
   "CSS beats SVG presentation attributes" trick index.html's "mt-embed-bg" style block already relies on for
   the graph's background <rect>. It also uses !important to override .extension-wrapper / .canvas-container /
   .curve-svg's backgrounds, since - unlike the accent hooks - those three are hardcoded hex with no var() hook
   of their own in the compiled bundle.
   nc-glow.js's glow layers copy the curve path's rendered stroke color, so they follow automatically once
   nc-glow.js reads the COMPUTED stroke (not just the literal attribute) - see the one-line change there.
   Does nothing when this page runs on its own: no "mtBg" message ever arrives, so neither class is ever added
   and NeuCurve keeps its own default/last-picked colors exactly as before. Likewise, bgHex/bgRgb arrive as
   null whenever the panel has no custom background color set (its own default, or its automatic light-theme
   case) - deliberately, since NeuCurve has no light variant of its own and forcing one would look broken; see
   the comment on BgState in the panel's js/main.js.

   BUG FIX (the actual "stuck on black" report): the four --mt-bg-*-rgb tiers above, and the .graph-shell /
   .side-column / .model-rail / .canvas-column selectors nc-theme-sync.css maps them onto, were written
   against a DOM shape NeuCurve doesn't actually render in this build - .graph-shell and friends never
   appear in the live document at all (confirmed by walking the compiled bundle's own injected stylesheet).
   The screen that's actually on screen (canvas + side rail + bottom action bar, the Settings pane, the
   preset library modal, the onboarding/guide panel, etc.) is built from a completely different set of
   scoped classes - .canvas-area, .model-nav-strip, .preset-container, .settings-container, .modal-box, and
   ~35 others - each with its own hardcoded gray literal and, same as before, no var() hook of its own. So
   picking white only ever lightened the two stray selectors that happened to have real elements behind them
   (.extension-wrapper, .canvas-container/.curve-svg - kept "for coverage" per the old comment, more by luck
   than design) while everything else - the canvas floor, the whole right-hand library panel, Settings,
   modals - stayed on its native dark tone, which is exactly the "NeuCurve tab stuck on black" symptom.
   Rather than hand-maintain a giant static !important rule per selector (fragile - anything added to a
   future NeuCurve build silently falls back to dark again), BASE_TONES below lists every real selector
   found this way, grouped by its original literal gray value, and rebuildDynamicBgCss() generates the
   override stylesheet at runtime: each group's tint is bgRgb + (own gray - 30) per channel, clamped to
   0-255 - 30 is .graph-shell's own #1e1e1e tone, i.e. the same "0 offset" reference the four tiers above
   already used, just applied to the selectors that actually exist instead of the guessed ones. The four
   --mt-bg-*-rgb vars and their CSS mapping are left in place (harmless, and still exactly right for
   .extension-wrapper/.canvas-container/.curve-svg/.graph-shell-if-it-ever-ships), this is purely additive.
   The curve canvas's own background - an SVG <rect fill="#0e0e0e"> painted by the graph itself, not a CSS
   background at all - needed the same "CSS declaration beats SVG presentation attribute" trick this file
   already uses for the curve <path>'s stroke; that rule lives in nc-theme-sync.css next to it. */
(function () {
  "use strict";
  var root = document.documentElement;

  function hexToRgb(hex) {
    var m = /^#?([0-9a-f]{6})$/i.exec(hex || "");
    if (!m) { return null; }
    var n = parseInt(m[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function offset(rgb, amount) {
    return rgb.map(function (c) { return Math.max(0, Math.min(255, c + amount)); }).join(",");
  }

  // Every real selector in the compiled bundle with a hardcoded near-black background and no var() hook,
  // grouped by its original literal gray value (0-42), found by walking document.styleSheets in the live
  // app. Interaction-only states (:hover/:focus/kbd chips) and the two intentionally-dark code/expression
  // surfaces are left out on purpose - see the file banner above.
  var BASE_TONES = [
    { base: 0,  sel: ".expr-box, .modal-input" },
    { base: 10, sel: ".canvas-column, .custom-picker, .preview-box" },
    { base: 12, sel: ".guide-details" },
    { base: 14, sel: ".canvas-area, .settings-container" },
    { base: 17, sel: ".drop-zone, .hex-input-row, .layout-mode-group, .lib-select, .method-comparison, .presets-container, .preview-track-wrapper, .settings-header, .shortcut-row, .update-banner" },
    { base: 20, sel: ".guide-card, .hint, .model-nav-strip, .model-rail, .preset-grid, .sidebar-extension-bg" },
    { base: 22, sel: ".comp-col, .extension-wrapper, .grid-scroll, .lock-content, .preset-container, .preset-thumbnail, .icon-group, .utility-group" },
    { base: 24, sel: ".action-container, .home-indicator, .model-tabs-horizontal" },
    { base: 26, sel: ".canvas-container, .category-card, .curve-svg, .edit-btn, .library-header, .modal-box, .preview-strip-container, .section-divider-vertical, .section-divider, .side-column, .visit-btn" },
    { base: 30, sel: ".graph-shell, .preset-card" },
    { base: 36, sel: ".ctx-divider" },
    { base: 42, sel: ".apply-divider, .dropdown-divider, .home-bar" }
  ];
  var dynStyle = null;

  function clamp255(n) { return Math.max(0, Math.min(255, n)); }

  // Builds (or clears, when rgb is null) the #mt-bg-dynamic-sync stylesheet from BASE_TONES + the current
  // background color. Called on every sync, same as the tier vars above.
  function rebuildDynamicBgCss(rgb) {
    if (!dynStyle) {
      dynStyle = document.createElement("style");
      dynStyle.id = "mt-bg-dynamic-sync";
      document.head.appendChild(dynStyle);
    }
    var css = !rgb ? "" : BASE_TONES.map(function (t) {
      var r = clamp255(rgb[0] + (t.base - 30));
      var g = clamp255(rgb[1] + (t.base - 30));
      var b = clamp255(rgb[2] + (t.base - 30));
      var scoped = t.sel.split(",").map(function (s) { return "html.mt-bg-themed " + s.trim(); }).join(", ");
      return scoped + " { background: rgb(" + r + "," + g + "," + b + ") !important; }";
    }).join("\n");
    /* flicker fix: rewriting a <style> block with identical text still forces a full-page restyle + repaint (visible as a
       quick blink every time the panel re-posts its state, e.g. while a slider is dragged). Only write on a real change. */
    if (dynStyle.textContent !== css) { dynStyle.textContent = css; }
  }

  // Applies one theme/background state object (same shape the panel posts: { themeHex, themeRgb, bgHex, bgRgb }).
  var lastStateKey = "";
  function applyState(d) {
    if (!d) { return; }
    var key = [d.motionOff, d.bgHex, d.bgRgb, d.scheme, d.panelBgHex].join("|");
    if (key === lastStateKey) { return; }       // same state re-posted (opacity/theme tweaks elsewhere): nothing to do
    lastStateKey = key;
    if (typeof d.motionOff === "boolean") {
      if (d.motionOff) { root.setAttribute("data-reduce-motion", "true"); } else { root.removeAttribute("data-reduce-motion"); }
    }
    /* NOTE: the panel's Theme color (themeHex/themeRgb) is deliberately IGNORED here. NeuCurve's colors come only
       from NeuCurve Settings (UI Color / Graph Line Color / Handle & Node Color), so changing the Multi Tool theme
       no longer recolors the Curve tab. Only the Background color + motion flag are still synced. */

    /* AUTO LIGHT STYLE: the panel reports its style scheme ("light" | "dark" - Glass auto/pinned light-dark, or Material
       You) and its real background color (panelBgHex). NeuCurve is light when the panel is, or when the user picked a
       light Background color (so a white pick in a dark style no longer leaves white-on-white text). nc-light.js then
       flips text/borders/overlays/grid; the surfaces below follow the panel's own background color. */
    var picked = (typeof d.bgHex === "string" && d.bgHex) ? d.bgHex : "";
    var pickedRgb = hexToRgb(picked);
    var isLight = d.scheme === "light" || (pickedRgb && (pickedRgb[0] + pickedRgb[1] + pickedRgb[2]) / 3 > 150);
    root.classList.toggle("mt-light", !!isLight);                 // enables the static nc-light.css even if nc-light.js can't run
    if (window.ncLight) { window.ncLight.set(!!isLight); }
    var effBg = picked || (isLight ? (hexToRgb(d.panelBgHex) ? d.panelBgHex : "#f2f2f5") : "");

    if (effBg) {
      var rgb = hexToRgb(effBg);
      if (rgb) {
        root.style.setProperty("--bg-color", effBg);           // NeuCurve's own <body> hook (mostly moot - see CSS notes)
        root.style.setProperty("--mt-bg-rgb", rgb.join(","));
        // Tiers matched to .graph-shell's actual hardcoded family (#1e1e1e / #1a1a1a / #141414 / #0a0a0a) -
        // see nc-theme-sync.css for which element gets which tier and why.
        root.style.setProperty("--mt-bg-shell-rgb", offset(rgb, 0));
        root.style.setProperty("--mt-bg-side-rgb", offset(rgb, -4));
        root.style.setProperty("--mt-bg-rail-rgb", offset(rgb, -10));
        root.style.setProperty("--mt-bg-canvas-rgb", offset(rgb, -20));
        root.classList.add("mt-bg-themed");
        rebuildDynamicBgCss(rgb);
      }
    } else {
      root.style.removeProperty("--bg-color");
      root.style.removeProperty("--mt-bg-rgb");
      root.style.removeProperty("--mt-bg-shell-rgb");
      root.style.removeProperty("--mt-bg-side-rgb");
      root.style.removeProperty("--mt-bg-rail-rgb");
      root.style.removeProperty("--mt-bg-canvas-rgb");
      root.classList.remove("mt-bg-themed");
      rebuildDynamicBgCss(null);
    }
  }

  // (1) Embedded in the panel's Curve tab (iframe): the panel postMessages its state.
  window.addEventListener("message", function (e) {
    var d = e.data;
    if (e.source !== window.parent || !d || d.mtBg !== true) { return; }
    applyState(d);
  });

  // (2) Opened as its OWN window (Large Graph Editor "?ext=graph", Settings "?ext=settings"): there is no parent
  // iframe to postMessage us, so the panel (Curve.broadcastExternal in js/main.js) also writes its state to
  // localStorage ("mt_theme_state") and fires a CEP event ("com.multitool.theme.sync"). Read it on load, follow it
  // live, and ask the panel for a fresh copy in case it changed while this window was closed.
  var STANDALONE = (window.parent === window);
  if (STANDALONE) {
    var lastRaw = null;
    var fromJson = function (raw) {
      if (!raw || raw === lastRaw) { return; }
      try { var d = typeof raw === "string" ? JSON.parse(raw) : raw; if (d && d.mtBg === true) { lastRaw = raw; applyState(d); } } catch (err) { }
    };
    var readStored = function () { try { fromJson(localStorage.getItem("mt_theme_state")); } catch (err) { } };
    readStored();
    window.addEventListener("storage", function (e) { if (!e.key || e.key === "mt_theme_state") { readStored(); } });
    setInterval(readStored, 500);   // same-profile fallback if neither event above is delivered
    var wire = function () {
      try {
        var cep = window.__adobe_cep__;
        if (cep && cep.addEventListener) {
          cep.addEventListener("com.multitool.theme.sync", function (ev) { fromJson(ev && ev.data); });
          var host = "", extId = "";
          try { host = JSON.parse(cep.getHostEnvironment()).appName; } catch (e1) { }
          try { extId = cep.getExtensionId(); } catch (e2) { }
          cep.dispatchEvent({ type: "com.multitool.theme.request", scope: "APPLICATION", appId: host, extensionId: extId, data: "" });
        }
      } catch (err) { }
    };
    if (document.readyState === "loading") { document.addEventListener("DOMContentLoaded", wire); } else { wire(); }
  }

  /* Keep --nc-ui-rgb ("r,g,b") in step with NeuCurve's own --ui-color (set by the bundle from Settings > UI Color),
     so CSS can build rgba() glows from the user's chosen color. */
  (function trackUiColor() {
    var last = "";
    function upd() {
      var v = "";
      try { v = (root.style.getPropertyValue("--ui-color") || getComputedStyle(root).getPropertyValue("--ui-color") || "").trim(); } catch (e) { }
      if (v === last) { return; }
      last = v;
      var rgb = hexToRgb(v);
      if (rgb) { root.style.setProperty("--nc-ui-rgb", rgb.join(",")); }
    }
    try { new MutationObserver(upd).observe(root, { attributes: true, attributeFilter: ["style"] }); } catch (e) { }
    window.addEventListener("storage", upd);
    setInterval(upd, 1000);
    upd();
  })();
})();
