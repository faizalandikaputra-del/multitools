/**
 * ae2021-compat.js
 * ------------------------------------------------------------------------
 * Purpose: make the existing CSS render the SAME WAY on old CEP hosts
 * (CEP 10 / Chromium 74, used by After Effects 2021) as it already does on
 * newer hosts (CEP 11+ / Chromium 88+, AE 2022-2025). It changes nothing
 * about how the panel looks or behaves - it only backfills two CSS features
 * this file/CSS relies on that Chromium 74 doesn't implement:
 *
 *   1. `gap` on flex containers (display:flex/inline-flex + gap/row-gap/
 *      column-gap). Landed in Chrome 84 (2020). On Chromium 74 the property
 *      is parsed but has NO visual effect on flex layouts (only on grid),
 *      so every spaced row/column in the UI collapses together.
 *
 *   2. `aspect-ratio`. Landed in Chrome 88 (2021). On Chromium 74 the
 *      declaration is inert, so every square tile (tool grid, swatches,
 *      align/anchor/fit buttons, NeuCurve preset thumbnails) loses its
 *      forced square shape.
 *
 * Both are feature-detected up front. On any host that already supports
 * them (AE 2022+, and every browser used for local testing), this whole
 * script does nothing beyond the two cheap detection checks and returns
 * immediately - zero effect on look, behavior, or performance there.
 *
 * On an old host it:
 *   - scans same-origin stylesheets once for rules that declare gap/
 *     row-gap/column-gap or aspect-ratio (regardless of what unit or
 *     CSS function the value uses - clamp()/min()/vh/etc all still work,
 *     since the ACTUAL numbers are read back via getComputedStyle, which
 *     resolves them to real pixels even on this old engine);
 *   - converts `gap` into equivalent margins between existing children
 *     (no markup change, no altered box sizes - just space *between*
 *     siblings, exactly like `gap` itself does);
 *   - converts `aspect-ratio` into a live inline `height` driven by the
 *     element's own measured width via ResizeObserver.
 *   - re-applies both whenever the panel's DOM changes (tab switches,
 *     dynamically rendered lists, NeuCurve's own re-renders) via a
 *     debounced MutationObserver, and on window resize (for wrapped rows).
 *
 * Include this AFTER the page's stylesheet(s) and BEFORE (or after; order
 * doesn't matter much) the app's own scripts. Safe to include in every
 * document that shares this CSS (main panel, NeuCurve iframe, NeuCurve's
 * standalone Settings/Graph Editor windows).
 */
(function () {
  "use strict";

  function supportsFlexGap() {
    try {
      var flex = document.createElement("div");
      flex.style.cssText =
        "display:flex;flex-direction:column;row-gap:4px;position:absolute;visibility:hidden;pointer-events:none;left:-9999px;top:-9999px;";
      var a = document.createElement("div");
      var b = document.createElement("div");
      a.style.height = b.style.height = "1px";
      flex.appendChild(a);
      flex.appendChild(b);
      (document.body || document.documentElement).appendChild(flex);
      var gapWorks = flex.scrollHeight === 6; // 1px + 4px gap + 1px if applied, else 2px
      flex.parentNode.removeChild(flex);
      return gapWorks;
    } catch (e) {
      return true; // don't touch anything we can't verify
    }
  }

  function supportsAspectRatio() {
    try {
      return !!(window.CSS && CSS.supports && CSS.supports("aspect-ratio", "1 / 1"));
    } catch (e) {
      return true;
    }
  }

  var FLEX_GAP_OK = supportsFlexGap();
  var ASPECT_RATIO_OK = supportsAspectRatio();

  if (FLEX_GAP_OK && ASPECT_RATIO_OK) {
    return; // modern host: nothing to do
  }

  // ---------- Collect matching selectors from same-origin stylesheets ----------
  // Rebuilt on every run (see runAll below), not just once: NeuCurve's compiled
  // bundle injects its own <style> tag at runtime (after this script's first
  // pass), so the first scan alone would miss it.
  var gapSelectors = [];
  var ratioSelectors = []; // { selector, w, h }

  function ratioFromText(text) {
    var m = /aspect-ratio\s*:\s*([0-9.]+)\s*\/\s*([0-9.]+)/i.exec(text);
    if (m) { return { w: parseFloat(m[1]), h: parseFloat(m[2]) }; }
    m = /aspect-ratio\s*:\s*([0-9.]+)\s*;/i.exec(text);
    if (m) { return { w: parseFloat(m[1]), h: 1 }; }
    return null;
  }

  function scanRuleList(rules) {
    for (var i = 0; i < rules.length; i++) {
      var r = rules[i];
      try {
        // Grouping rules (@media, @supports, ...) have cssRules but no selectorText
        // of their own - recurse into them. A plain style rule also exposes an
        // (always empty) cssRules property in some engines, so selectorText is the
        // real discriminator, not the mere presence of cssRules.
        if (!r.selectorText && r.cssRules) { scanRuleList(r.cssRules); continue; }
        if (!r.selectorText) { continue; }
        var text = r.cssText || "";
        if (!FLEX_GAP_OK && /(^|[^-\w])(gap|row-gap|column-gap)\s*:/i.test(text)) {
          gapSelectors.push(r.selectorText);
        }
        if (!ASPECT_RATIO_OK && /aspect-ratio\s*:/i.test(text)) {
          var ratio = ratioFromText(text);
          if (ratio) { ratioSelectors.push({ selector: r.selectorText, w: ratio.w, h: ratio.h }); }
        }
      } catch (e) { /* ignore a single malformed rule */ }
    }
  }

  function scanStylesheets() {
    gapSelectors.length = 0;
    ratioSelectors.length = 0;
    var sheets = document.styleSheets;
    for (var i = 0; i < sheets.length; i++) {
      try {
        var rules = sheets[i].cssRules || sheets[i].rules;
        if (rules) { scanRuleList(rules); }
      } catch (e) { /* cross-origin stylesheet (e.g. Google Fonts) - skip */ }
    }
  }

  // ---------- gap -> margin fallback ----------
  var seenGapEl = typeof WeakSet !== "undefined" ? null : null; // (no long-lived cache needed; re-run is idempotent)

  function applyGapFallback(el) {
    var cs;
    try { cs = window.getComputedStyle(el); } catch (e) { return; }
    if (!cs || (cs.display !== "flex" && cs.display !== "inline-flex")) { return; }

    var rowGap = parseFloat(cs.rowGap) || 0;
    var colGap = parseFloat(cs.columnGap) || 0;
    if (!rowGap && !colGap) { return; }

    var direction = cs.flexDirection || "row";
    var wrap = cs.flexWrap === "wrap" || cs.flexWrap === "wrap-reverse";
    var isColumn = direction === "column" || direction === "column-reverse";

    var children = [];
    for (var i = 0; i < el.children.length; i++) {
      var c = el.children[i];
      var ccs;
      try { ccs = window.getComputedStyle(c); } catch (e) { continue; }
      if (!ccs || ccs.display === "none") { continue; }
      if (ccs.position === "absolute" || ccs.position === "fixed") { continue; }
      children.push(c);
    }
    if (children.length < 2) { return; }

    var mainGap = isColumn ? rowGap : colGap;   // gap along the main (flow) axis
    var crossGap = isColumn ? colGap : rowGap;  // gap along the cross (wrap) axis

    // Only write when the value really differs: every inline-style write is a MutationObserver record, and the observer
    // below watches "style" - the old "reset to empty, then set again" on EVERY pass kept re-arming itself forever
    // (~1000 style writes per second, visible as quick glitches / hitches on After Effects 2021).
    function put(node, prop, val) { if (node.style[prop] !== val) { node.style[prop] = val; } }

    if (!wrap) {
      for (var k = 0; k < children.length; k++) {
        var last = k === children.length - 1;
        put(children[k], "marginRight", (!isColumn && !last) ? mainGap + "px" : "");
        put(children[k], "marginBottom", (isColumn && !last) ? mainGap + "px" : "");
      }
      return;
    }

    // Wrapped rows need their natural (margin-free) positions to find the lines, so reset first (rare: wrapped flex only).
    for (var j = 0; j < children.length; j++) {
      put(children[j], "marginRight", "");
      put(children[j], "marginBottom", "");
    }
    // Wrapped: bucket children into visual lines by their offset position,
    // then add main-axis gap between items in a line and cross-axis gap
    // between lines (skipping the very last item / last line).
    var lines = [];
    var currentLine = [];
    var lastPos = null;
    for (var m2 = 0; m2 < children.length; m2++) {
      var pos = isColumn ? children[m2].offsetLeft : children[m2].offsetTop;
      if (lastPos !== null && Math.abs(pos - lastPos) > 1) {
        lines.push(currentLine);
        currentLine = [];
      }
      currentLine.push(children[m2]);
      lastPos = pos;
    }
    if (currentLine.length) { lines.push(currentLine); }

    for (var li = 0; li < lines.length; li++) {
      var line = lines[li];
      for (var ci = 0; ci < line.length - 1; ci++) {
        if (isColumn) { line[ci].style.marginBottom = mainGap + "px"; }
        else { line[ci].style.marginRight = mainGap + "px"; }
      }
      if (li < lines.length - 1) {
        var lastInLine = line[line.length - 1];
        if (isColumn) { lastInLine.style.marginRight = crossGap + "px"; }
        else { lastInLine.style.marginBottom = crossGap + "px"; }
        // also give every other item in the line the cross gap so the next
        // line doesn't hug whichever item happens to be shortest
        for (var ci2 = 0; ci2 < line.length - 1; ci2++) {
          if (isColumn) { line[ci2].style.marginRight = crossGap + "px"; }
          else { line[ci2].style.marginBottom = crossGap + "px"; }
        }
      }
    }
  }

  function reapplyGapFallback() {
    if (FLEX_GAP_OK) { return; }
    for (var i = 0; i < gapSelectors.length; i++) {
      var els;
      try { els = document.querySelectorAll(gapSelectors[i]); } catch (e) { continue; }
      for (var j = 0; j < els.length; j++) { applyGapFallback(els[j]); }
    }
  }

  // ---------- aspect-ratio -> live height fallback ----------
  var observedRatioEls = [];

  function enforceRatio(el, w, h) {
    var width = el.offsetWidth;
    if (!width) { return; }
    var v = (Math.round(width * (h / w) * 100) / 100) + "px";
    if (el.style.height !== v) { el.style.height = v; }
  }

  function attachRatio(el, w, h) {
    for (var i = 0; i < observedRatioEls.length; i++) {
      if (observedRatioEls[i].el === el) { return; } // already handled
    }
    observedRatioEls.push({ el: el, w: w, h: h });
    enforceRatio(el, w, h);
    if (typeof ResizeObserver !== "undefined") {
      try {
        var ro = new ResizeObserver(function () { enforceRatio(el, w, h); });
        ro.observe(el);
      } catch (e) { /* fall back to the periodic + mutation re-scan below */ }
    }
  }

  function reapplyRatioFallback() {
    if (ASPECT_RATIO_OK) { return; }
    for (var i = 0; i < ratioSelectors.length; i++) {
      var entry = ratioSelectors[i];
      var els;
      try { els = document.querySelectorAll(entry.selector); } catch (e) { continue; }
      for (var j = 0; j < els.length; j++) { attachRatio(els[j], entry.w, entry.h); }
    }
  }

  // ---------- run + keep re-running as the panel's DOM changes ----------
  var sheetSig = "", applying = false, mo = null;
  function sheetSignature() {
    var sig = "", sheets = document.styleSheets;
    for (var i = 0; i < sheets.length; i++) {
      try { var r = sheets[i].cssRules || sheets[i].rules; sig += (r ? r.length : 0) + ","; } catch (e) { sig += "x,"; }
    }
    return sig;
  }
  function runAll() {
    // Re-scan the stylesheets only when a sheet was added / its rule count changed (NeuCurve's bundle injects its own
    // <style> after the first pass). Parsing every rule's cssText on every pass was the expensive part.
    var sig = sheetSignature();
    if (sig !== sheetSig) { sheetSig = sig; scanStylesheets(); }
    applying = true;
    try { reapplyGapFallback(); reapplyRatioFallback(); }
    finally {
      applying = false;
      if (mo) { try { mo.takeRecords(); } catch (e) { } }   // our own style writes must not trigger another pass
    }
  }

  var scheduled = false;
  function schedule() {
    if (scheduled) { return; }
    scheduled = true;
    (window.requestAnimationFrame || setTimeout)(function () {
      scheduled = false;
      runAll();
    });
  }

  // Which mutations can change the layout this shim fixes? Not the endless style writes on SVG paths (NeuCurve's APPLY
  // glow, curve/handle animation), not the graph-size grip, not anything we wrote ourselves.
  function relevant(records) {
    if (applying) { return false; }
    for (var i = 0; i < records.length; i++) {
      var r = records[i], t = r.target;
      if (r.type === "childList") { return true; }
      if (!t || t.nodeType !== 1) { continue; }
      if (typeof SVGElement !== "undefined" && t instanceof SVGElement) { continue; }
      if (t.id === "nc-gsize" || t.tagName === "CANVAS") { continue; }
      return true;
    }
    return false;
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", schedule);
  } else {
    schedule();
  }
  window.addEventListener("resize", schedule);

  try {
    mo = new MutationObserver(function (records) { if (relevant(records)) { schedule(); } });
    mo.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "style"] });
  } catch (e) {
    // very old engines without MutationObserver: fall back to a light poll
    setInterval(schedule, 800);
  }
})();
