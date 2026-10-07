/* NeuCurve - automatic LIGHT look (companion to nc-theme-sync.js).

   NeuCurve's compiled bundle only has a dark look: hundreds of hardcoded near-black backgrounds, white / light-gray
   text, translucent-white overlays and hairlines. nc-theme-sync.js already re-tints the backgrounds to the panel's
   color, but on a LIGHT style (Settings > Style: Glass light, Material You light, or a light Background color) the
   text, borders, hover overlays, grid lines and thumbnails stayed light-on-light / dark-on-dark.

   window.ncLight.set(true|false) switches it. When on:
     1. <html class="mt-light"> + color-scheme: light
     2. #mt-light-sync: a stylesheet generated at runtime from NeuCurve's OWN rules - every neutral (gray / white /
        black) color found in color / background / border / outline / fill / stroke / box-shadow / gradients is
        inverted, saturated colors (the yellow accent, red, ...) are left alone, and light TEXT is darkened while
        dark text (e.g. on the yellow APPLY button) is kept. Generating it (instead of a hand-written list) means
        anything a future NeuCurve build adds is covered too. Rebuilt automatically when NeuCurve injects styles.
     3. SVG presentation attributes (grid lines, axis labels - not CSS, so (2) can't reach them) are re-colored
        inline from the attribute value, kept in step by a MutationObserver.
   Background tones themselves stay with nc-theme-sync.js (#mt-bg-dynamic-sync), which is told the panel's real
   background color when the style is light. Turning light off removes everything again. */
(function () {
  "use strict";
  var root = document.documentElement;
  var ON = false;
  var styleEl = null;
  var sheetCache = (typeof WeakMap === "function") ? new WeakMap() : null;
  var lastCss = "";
  var buildTimer = 0, headObs = null, svgObs = null, svgRaf = 0;

  var COLOR_RE = /#[0-9a-fA-F]{8}\b|#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3,4}\b|rgba?\([^)]*\)|\b(?:white|black)\b/g;
  var PROP_RE = /^(color|background|background-color|background-image|border(-(top|right|bottom|left))?(-color)?|outline(-color)?|fill|stroke|caret-color|stop-color|box-shadow|column-rule-color|text-decoration-color)$/;

  function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }
  function parseColor(tok) {
    var t = tok.toLowerCase(), m;
    if (t === "white") { return [255, 255, 255, 1]; }
    if (t === "black") { return [0, 0, 0, 1]; }
    if (t.charAt(0) === "#") {
      var h = t.slice(1);
      if (h.length === 3 || h.length === 4) { h = h.split("").map(function (c) { return c + c; }).join(""); }
      var n = parseInt(h.slice(0, 6), 16);
      return [(n >> 16) & 255, (n >> 8) & 255, n & 255, h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1];
    }
    m = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+%?))?\s*\)$/.exec(t);
    if (!m) { return null; }
    var a = 1;
    if (m[4] != null) { a = m[4].slice(-1) === "%" ? parseFloat(m[4]) / 100 : parseFloat(m[4]); }
    return [+m[1], +m[2], +m[3], a];
  }
  function fmt(r, g, b, a) {
    r = Math.round(clamp(r, 0, 255)); g = Math.round(clamp(g, 0, 255)); b = Math.round(clamp(b, 0, 255));
    return a >= 0.999 ? "rgb(" + r + "," + g + "," + b + ")" : "rgba(" + r + "," + g + "," + b + "," + (Math.round(a * 1000) / 1000) + ")";
  }

  // kind: "text" (color / fill / stroke / caret) - only LIGHT ones are flipped, dark text stays dark;
  //       "surface" (backgrounds / borders / shadows) - every neutral is inverted.
  function mapColor(tok, kind, prop, scrim) {
    var c = parseColor(tok);
    if (!c) { return tok; }
    var r = c[0], g = c[1], b = c[2], a = c[3];
    if (Math.max(r, g, b) - Math.min(r, g, b) > 30) { return tok; }            // saturated: accent / status colors stay
    var L = (r + g + b) / 3;
    if (kind === "text") {
      if (L < 100) { return tok; }
      var t = Math.max(18, (255 - L) * 0.82);
      return fmt(t, t, t, a);
    }
    if (prop === "box-shadow") {                                               // drop shadows stay dark; light highlights flip
      return L >= 128 ? fmt(0, 0, 0, a) : tok;
    }
    if (a < 0.999) {
      if (L >= 128) { return fmt(0, 0, 0, a); }                                // white veil / hairline -> black veil / hairline
      if (prop === "background" || prop === "background-color" || prop === "background-image") {
        if (scrim) { return tok; }                                             // modal backdrop / overlay: stays a dark scrim
        return fmt(0, 0, 0, a * 0.2);                                          // recessed "well" (thumbs, inputs): a faint shade, not a gray slab
      }
      return tok;
    }
    return fmt(clamp(255 - r, 14, 246), clamp(255 - g, 14, 246), clamp(255 - b, 14, 246), 1);
  }

  function mapValue(prop, val, scrim) {
    if (!val || val.indexOf("var(") !== -1 || val.indexOf("url(") !== -1) { return null; }
    if (prop.indexOf("--") === 0) {                                             // custom property: guess its role from its name
      if (/glow|shadow|particle/i.test(prop)) { return null; }
      prop = /ink|icon|text|fg|(^|-)color$/i.test(prop) ? "color" : (/bg|back|btn|fill|surface|plate|well/i.test(prop) ? "background-color" : "border-color");
    }
    var kind = (prop === "color" || prop === "fill" || prop === "stroke" || prop === "caret-color" || prop === "stop-color" ||
                prop === "text-decoration-color") ? "text" : "surface";
    var changed = false;
    var out = val.replace(COLOR_RE, function (tok) {
      var n = mapColor(tok, kind, prop, scrim);
      if (n !== tok) { changed = true; }
      return n;
    });
    return changed ? out : null;
  }

  function splitTop(sel) {                                                   // split a selector list on top-level commas
    var out = [], depth = 0, cur = "", i, ch;
    for (i = 0; i < sel.length; i++) {
      ch = sel.charAt(i);
      if (ch === "(" || ch === "[") { depth++; } else if (ch === ")" || ch === "]") { depth--; }
      if (ch === "," && depth === 0) { out.push(cur); cur = ""; } else { cur += ch; }
    }
    if (cur.trim()) { out.push(cur); }
    return out;
  }
  function scopeSel(sel) {
    return splitTop(sel).map(function (s) {
      s = s.trim();
      if (/^html(?![A-Za-z0-9_-])/.test(s)) { return s.replace(/^html/, "html.mt-light"); }
      if (/^:root(?![A-Za-z0-9_-])/.test(s)) { return s.replace(/^:root/, "html.mt-light"); }
      return "html.mt-light " + s;
    }).join(", ");
  }

  function ruleList(rules, depthGuard) {
    var out = "", i, r, sel, decl, j, name, val, nv;
    if (!rules || depthGuard > 4) { return out; }
    for (i = 0; i < rules.length; i++) {
      r = rules[i];
      if (r.type === 1 && r.style) {                                           // CSSStyleRule
        // FIX: never re-process rules that are ALREADY light (the pre-generated nc-light.css, or anything scoped to
        // .mt-light). Inverting them a 2nd time turned the light colors back into the dark originals, and since the
        // runtime sheet has the higher specificity ("html.mt-light.mt-light ..."), it won - the tab stayed black.
        if (r.selectorText && r.selectorText.indexOf("mt-light") !== -1) { continue; }
        decl = "";
        var scrim = /backdrop|overlay|scrim|modal-bg|tooltip|toast/i.test(r.selectorText);
        for (j = 0; j < r.style.length; j++) {
          name = r.style[j];
          if (!PROP_RE.test(name) && name.indexOf("--") !== 0) { continue; }
          val = r.style.getPropertyValue(name);
          if (name.indexOf("--") === 0) { if (!/^\s*(#[0-9a-f]{3,8}|rgba?\([^)]*\)|white|black)\s*$/i.test(val)) { continue; } }
          nv = mapValue(name, val.trim(), scrim);
          if (nv != null) { decl += name + ":" + nv + " !important;"; }
        }
        if (decl) { sel = scopeSel(r.selectorText); out += sel + "{" + decl + "}\n"; }
      } else if (r.type === 4 && r.cssRules) {                                 // @media
        var inner = ruleList(r.cssRules, depthGuard + 1);
        if (inner) { out += "@media " + r.media.mediaText + "{\n" + inner + "}\n"; }
      } else if (r.type === 12 && r.cssRules) {                                // @supports
        var inner2 = ruleList(r.cssRules, depthGuard + 1);
        if (inner2) { out += "@supports " + r.conditionText + "{\n" + inner2 + "}\n"; }
      }
    }
    return out;
  }

  function sheetCss(owner, sheet) {
    if (sheetCache && sheetCache.has(owner)) {
      var c = sheetCache.get(owner);
      if (c.len === lenOf(sheet)) { return c.css; }
    }
    var rules = null, css = "";
    try { rules = sheet.cssRules; } catch (e) { rules = null; }                // blocked / cross-origin (Google Fonts)
    if (rules) { css = ruleList(rules, 0); }
    else if (owner.tagName === "LINK" && owner.href && /^(file|https?|chrome-extension):/i.test(owner.href) && owner.href.indexOf("fonts.googleapis") === -1) {
      // Local sheet the engine won't expose: read its text and parse it in a scratch <style> instead.
      try {
        var xhr = new XMLHttpRequest(); xhr.open("GET", owner.href, false); xhr.send(null);
        if (xhr.responseText) {
          var tmp = document.createElement("style"); tmp.media = "not all"; tmp.textContent = xhr.responseText;
          document.head.appendChild(tmp);
          try { css = ruleList(tmp.sheet.cssRules, 0); } finally { document.head.removeChild(tmp); }
        }
      } catch (e2) { css = ""; }
    }
    if (sheetCache) { sheetCache.set(owner, { len: lenOf(sheet), css: css }); }
    return css;
  }
  function lenOf(sheet) { try { return sheet.cssRules.length; } catch (e) { return -1; } }

  // Things the color-by-color pass can't reach: bitmap thumbnails (drawn with white strokes on a transparent canvas).
  var STATIC_CSS =
    "html.mt-light .preset-thumbnail canvas { filter: invert(1) hue-rotate(180deg) contrast(1.15); }\n" +
    "html.mt-light { color-scheme: light; }\n";

  function rebuild() {
    buildTimer = 0;
    if (!ON) { return; }
    var css = "", sheets = document.styleSheets, i, s, owner;
    for (i = 0; i < sheets.length; i++) {
      s = sheets[i]; owner = s.ownerNode;
      if (!owner || owner.id === "mt-light-sync" || owner.id === "mt-bg-dynamic-sync") { continue; }
      if (owner.tagName === "LINK" && /nc-light\.css/.test(owner.getAttribute("href") || "")) { continue; }   // already light
      css += sheetCss(owner, s);
    }
    if (!styleEl) {
      styleEl = document.createElement("style");
      styleEl.id = "mt-light-sync";
    }
    // Sit BEFORE #mt-bg-dynamic-sync so the generated background tones keep winning ties.
    var dyn = document.getElementById("mt-bg-dynamic-sync");
    if (styleEl.parentNode !== document.head) { document.head.appendChild(styleEl); }
    if (dyn && dyn.parentNode === document.head && (styleEl.compareDocumentPosition(dyn) & 4) === 0) {
      document.head.insertBefore(styleEl, dyn);
    }
    css += STATIC_CSS;
    if (css !== lastCss) { lastCss = css; styleEl.textContent = css; }
  }
  function scheduleRebuild() { if (!buildTimer) { buildTimer = setTimeout(rebuild, 60); } }

  /* ---- SVG presentation attributes (grid hairlines, axis labels) ---- */
  function svgPass() {
    svgRaf = 0;
    if (!ON) { return; }
    var els = document.querySelectorAll("svg line[stroke], svg text[fill]"), i, el, attr, nv;
    for (i = 0; i < els.length; i++) {
      el = els[i];
      attr = el.tagName.toLowerCase() === "text" ? "fill" : "stroke";
      nv = mapValue(attr, el.getAttribute(attr) || "");
      if (nv != null) { if (el.style.getPropertyValue(attr) !== nv) { el.style.setProperty(attr, nv); el.setAttribute("data-mt-lt", attr); } }
    }
  }
  function scheduleSvg() { if (!svgRaf) { svgRaf = requestAnimationFrame(svgPass); } }
  function svgClear() {
    var els = document.querySelectorAll("[data-mt-lt]"), i, el;
    for (i = 0; i < els.length; i++) { el = els[i]; el.style.removeProperty(el.getAttribute("data-mt-lt")); el.removeAttribute("data-mt-lt"); }
  }

  function start() {
    root.classList.add("mt-light");
    root.style.setProperty("color-scheme", "light");
    rebuild();
    if (!headObs && window.MutationObserver) {
      headObs = new MutationObserver(scheduleRebuild);
      headObs.observe(document.head, { childList: true, characterData: true, subtree: true });
      svgObs = new MutationObserver(scheduleSvg);
      svgObs.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ["stroke", "fill"] });
    }
    scheduleSvg();
    // The bundle is deferred and injects its styles + DOM a moment after load: pick those up too.
    setTimeout(rebuild, 300); setTimeout(rebuild, 1200); setTimeout(svgPass, 400);
  }
  function stop() {
    root.classList.remove("mt-light");
    root.style.removeProperty("color-scheme");
    if (headObs) { headObs.disconnect(); headObs = null; }
    if (svgObs) { svgObs.disconnect(); svgObs = null; }
    if (styleEl && styleEl.parentNode) { styleEl.parentNode.removeChild(styleEl); }
    lastCss = ""; if (styleEl) { styleEl.textContent = ""; }
    svgClear();
  }

  window.ncLight = {
    set: function (on) {
      on = !!on;
      if (on === ON) { return; }
      ON = on;
      if (on) { start(); } else { stop(); }
    },
    isOn: function () { return ON; }
  };
})();
