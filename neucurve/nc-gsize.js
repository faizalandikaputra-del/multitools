/* NeuCurve - nc-gsize.js (v24)  FREE GRAPH SIZE
   Drag the small grip at the bottom-right corner of the graph to make the plot bigger / smaller with NO fixed aspect
   (wide, tall, 1:1 ... anything). Hold Shift while dragging to keep the current proportions. Double-click the grip = back to auto.
   Works in portrait, landscape and auto mode: the size is remembered separately for portrait and landscape (auto just
   uses whichever one is showing). Also adjustable with sliders in NeuCurve Settings > Graph Size.
   localStorage (prefix neucurve_): gWp gHp (portrait) gWl gHl (landscape), percent 25-100 of the free space; empty = auto.
   The compiled bundle (assets/index.js) calls window.__ncGS(isLandscape) when it computes the plot size, and exposes
   window.__ncGBump() (recompute) + window.__ncGPlot() (plot rectangle) - see the README note. Plain ES5 for old CEP hosts. */
/* v19  FLOW FIT: the plot now fills the whole graph area (see __ncGS + the bundle patch "fit"), so dragging the native divider under the
   graph resizes the box live, exactly like Flow. localStorage neucurve_gFit = "0" restores the old capped aspect. */
(function () {
  "use strict";
  var IS_SETTINGS = /[?&]ext=settings/.test(location.search);
  var MIN = 25, MAX = 100;
  function rd(k) { try { var v = localStorage.getItem("neucurve_" + k); return v === null ? "" : v; } catch (e) { return ""; } }
  function wr(k, v) { try { if (v === "" || v === null) { localStorage.removeItem("neucurve_" + k); } else { localStorage.setItem("neucurve_" + k, String(v)); } } catch (e) { } }
  function pct(v) { v = parseFloat(v); return isFinite(v) ? Math.max(MIN, Math.min(MAX, v)) : null; }
  function broadcast(k, v) {
    try {
      var CE = window.CSEvent || (typeof CSEvent !== "undefined" ? CSEvent : null);
      if (!CE || !window.CSInterface) { return; }
      var ev = new CE("com.neucurve.sync", "APPLICATION");
      ev.data = JSON.stringify({ key: k, val: String(v), appId: "nc-gsize" });
      new window.CSInterface().dispatchEvent(ev);
    } catch (e) { }
  }

  /* called by the bundle every time it computes the plot size; null = keep NeuCurve's own automatic size */
  /* v20 FLOW LIMITS (portrait). Same numbers as Flow's curve-types.js: the graph column is max 300px wide and centred, and the graph
     height is locked between minGraphTop and maxGraphTop, so the box can never turn flat or huge when the divider is dragged.
     panel = min(panel width, 300); min = max(172, min(210, panel*.62)); max = max(min, min(270, panel*.9)). Padding of the plot = 12px a side. */
  var PAD = 12;
  function lim(panelW) {
    var pw = Math.min(panelW, 300), lo = Math.max(172, Math.min(210, pw * 0.62)), hi = Math.max(lo, Math.min(270, pw * 0.9));
    return { pw: pw, lo: lo, hi: hi };
  }
  window.__ncGClamp = function (nw, nh, panelW, land) {
    /* v23: landscape AND portrait with "Hide Preset Graphs" (html.nc-view-graph) = the graph owns the whole panel: no 300px / 270px caps */
    if (land || document.documentElement.classList.contains("nc-view-graph")) { return { w: Math.max(1, nw), h: Math.max(1, nh) }; }   /* v21: landscape = the whole box, no 300px / height caps */
    var L = lim(panelW);
    return { w: Math.max(1, Math.min(nw, L.pw - 16)), h: Math.max(1, Math.min(nh, L.hi)) };
  };
  window.__ncGBounds = function (panelW) {
    if (rd("gFit") === "0") { return null; }
    var L = lim(panelW);
    return { min: Math.round(L.lo + PAD * 2), max: Math.round(L.hi + PAD * 2) };
  };
  window.__ncGS = function (land) {
    /* portrait: "fit" = Flow limits above, no 1.3 / 1.25 aspect caps. landscape + gFit="0": the old automatic look. Custom % sizes sit on top. */
    var fit = rd("gFit") !== "0";   /* v21: fit in landscape too (the old 1.3 aspect cap left empty side bands) */
    var s = land ? "l" : "p", w = pct(rd("gW" + s)), h = pct(rd("gH" + s));
    if (w === null && h === null) { return fit ? { w: 1, h: 1, fit: true } : null; }
    return { w: (w === null ? 100 : w) / 100, h: (h === null ? 100 : h) / 100, fit: fit };
  };
  function bump() { try { if (window.__ncGBump) { window.__ncGBump(); } } catch (e) { } }
  function setSize(land, w, h) {
    var s = land ? "l" : "p";
    wr("gW" + s, w === null ? "" : Math.round(w)); wr("gH" + s, h === null ? "" : Math.round(h));
    broadcast("gW" + s, w === null ? "" : Math.round(w)); broadcast("gH" + s, h === null ? "" : Math.round(h));
    bump();
  }

  if (IS_SETTINGS) { return; }

  var grip = null, dragging = false;
  function q(sel) { return document.querySelector(sel); }

  /* v22 SQUARE BOX: the box width is capped to the box height and centred, so it never turns into a flat strip.
     v24 FIX (grip bug): the cap now stays ON while you drag / after you set a custom size. Before, the first drag step switched the
     cap off, so the box jumped from the square to the full panel width in the middle of the drag: the free space (the 100% the
     percentages are measured against) changed under the pointer, the plot jumped, the grip flew away from the cursor, and it
     flickered whenever the size touched 100%/100% (cap on <-> off). Now the box never changes while resizing; only the plot inside
     it does (25-100% of the box on each axis, so wide / tall / 1:1 all work). Make the whole box bigger with the divider under it.
     No cap only with gFit="0" or in the Large Graph Editor (?ext=graph). */
  function hug(area, P) {
    /* width cap = box height (height never depends on width, so no feedback loop / flicker). Not binding when the panel is narrower.
       v25 FIX (box merged with the presets / cut off): margin:auto on a flex-column child turns off "stretch", so the box became
       shrink-to-fit = as wide as the plot inside it. The bundle measures this very box (bind:clientWidth) to size the plot, so the
       size fed itself and froze at the first width: dragging the split divider, narrowing the panel, or switching Multi Tool tabs
       left the box wider than its column (landscape: drawn over the presets, portrait: cut by the panel edge).
       Now the box gets an explicit width:100% (capped by max-width), so it always follows its column and the plot follows the box. */
    var st = area.style;
    var capped = rd("gFit") !== "0" && !/[?&]ext=graph/.test(location.search);
    var want = area.clientHeight;
    if (capped && want > 80) {
      if (st.maxWidth !== want + "px") { st.maxWidth = want + "px"; }
      if (st.marginLeft !== "auto") { st.marginLeft = "auto"; st.marginRight = "auto"; }
      if (st.width !== "100%") { st.width = "100%"; }
      if (st.boxSizing !== "border-box") { st.boxSizing = "border-box"; }
    } else if (st.maxWidth || st.marginLeft || st.width) {
      st.maxWidth = ""; st.marginLeft = ""; st.marginRight = ""; st.width = ""; st.boxSizing = "";
    }
  }

  /* v26 FIT CHECK, self-healing (landscape: graph cut off / not filling its box until you drag the divider or reload the panel).
     The bundle sizes the plot from W / H handed to it by Svelte's hidden resize frame inside .canvas-area. In the real host that frame
     can miss a change (docking of the toolbar under the graph, panel resize while the tab is hidden, slow first paint), so the plot
     keeps an old size: the SVG is bigger than the box (clipped on both sides, the 1,1 end and the right handle vanish) or, in
     landscape auto-fit, smaller than it. Dragging the divider "fixes" it only because that really resizes the box.
     fitCheck() compares SVG and box, and when they disagree it does by itself what the drag does:
       try 1: shrink .canvas-area by 1px for two frames (min/max-height)
       try 2+: also shrink .fixed-section by 1px (width) for two frames = same effect as a 1px divider drag
     then __ncGBump(). It runs on every place() AND from a ResizeObserver and a light watchdog (see start()), so a stale plot
     heals within ~1s with no user action. Anti-loop: 3 tries, then it waits 2s before it is allowed to try again. */
  var fitLast = "", fitTries = 0, fitAt = 0, fitBusy = false;
  function wantFill() {   /* landscape + automatic size: the plot must fill the box (portrait is capped by design, custom % sizes are smaller on purpose) */
    return !!(window.__ncGPlot && window.__ncGPlot().land) && rd("gFit") !== "0" && rd("gWl") === "" && rd("gHl") === "" && !/[?&]ext=graph/.test(location.search);
  }
  function fitCheck(area, svg) {
    if (dragging || fitBusy || !window.__ncGBump) { return; }
    var aw = area.clientWidth, ah = area.clientHeight;
    if (aw < 60 || ah < 60) { return; }
    var sr = svg.getBoundingClientRect();
    var tooBig = sr.width > aw + 2 || sr.height > ah + 2;
    var tooSmall = !tooBig && wantFill() && (sr.width < aw - 8 || sr.height < ah - 8);
    if (!tooBig && !tooSmall) { fitLast = ""; fitTries = 0; return; }
    var now = Date.now(), key = aw + "x" + ah + "/" + Math.round(sr.width) + "x" + Math.round(sr.height);
    if (key !== fitLast) { fitLast = key; fitTries = 0; }
    if (fitTries >= 3) { if (now - fitAt < 2000) { return; } fitTries = 0; }
    fitTries++; fitAt = now; fitBusy = true;
    var h = ah - 1, fs = area.parentElement, fw = null;
    area.style.minHeight = h + "px"; area.style.maxHeight = h + "px";
    if (fitTries >= 2 && fs && fs.classList.contains("fixed-section")) {   /* 2nd try: the same 1px the divider drag gives */
      fw = fs.style.width; var cw = fs.getBoundingClientRect().width;
      if (cw > 80) { fs.style.width = (cw - 1) + "px"; } else { fw = null; }
    }
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        area.style.minHeight = ""; area.style.maxHeight = "";
        if (fw !== null) { fs.style.width = fw; }
        fitBusy = false; bump();
      });
    });
  }

  function place() {
    var area = q(".canvas-area"), svg = q("svg.curve-svg"), P = window.__ncGPlot && window.__ncGPlot();
    if (!area || !svg || !P) { if (grip) { grip.style.display = "none"; } return; }
    hug(area, P);
    fitCheck(area, svg);
    if (!grip) {
      grip = document.createElement("div"); grip.id = "nc-gsize"; grip.title = "Drag to resize the graph (Shift = keep proportions, double-click = auto)";
      grip.innerHTML = '<svg viewBox="0 0 12 12" width="12" height="12"><path d="M10 3 3 10M10 7 7 10" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>';
      grip.addEventListener("pointerdown", down);
      grip.addEventListener("dblclick", function () { setSize(!!(window.__ncGPlot && window.__ncGPlot().land), null, null); });
    }
    if (grip.parentNode !== area) { area.appendChild(grip); }
    var ar = area.getBoundingClientRect(), sr = svg.getBoundingClientRect();
    grip.style.display = "flex";
    /* v21: the grip no longer sits on the plot corner (where you drag the curve). It lives in the box's bottom-right
       corner cluster, directly left of the expand icon, and is only a faint mark until you hover it. */
    var ex = q(".fl-expand"), er = ex ? ex.getBoundingClientRect() : null, gw = 14, gh = 14, gx, gy;
    if (er && er.width) { gx = er.left - ar.left - gw - 4; gy = er.top - ar.top + Math.round((er.height - gh) / 2); }
    else { gx = sr.right - ar.left - gw - 8; gy = sr.bottom - ar.top - gh - 4; }
    grip.style.left = Math.round(gx) + "px";
    grip.style.top = Math.round(gy) + "px";
  }
  window.__ncGPC = function () { if (!dragging) { place(); } };

  function down(e) {
    var P = window.__ncGPlot && window.__ncGPlot(); if (!P) { return; }
    e.preventDefault(); e.stopPropagation();
    var land = !!P.land, s = land ? "l" : "p";
    var curW = pct(rd("gW" + s)) || 100, curH = pct(rd("gH" + s)) || 100;
    /* free space in px = current plot / current percent (the bundle scales the free space, so this stays exact) */
    var AV = window.__ncGAv;   /* free space the bundle scales (before the aspect cap) - exact in auto AND custom mode */
    var availW = AV ? AV.w : P.w / (curW / 100), availH = AV ? AV.h : P.h / (curH / 100);
    var x0 = e.clientX, y0 = e.clientY, w0 = P.w, h0 = P.h, ratio = w0 / h0;
    dragging = true; document.documentElement.classList.add("nc-gsize-drag");
    try { grip.setPointerCapture(e.pointerId); } catch (er) { }
    var busy = false, last = null;
    function move(ev) {
      var nw = w0 + (ev.clientX - x0) * 2, nh = h0 + (ev.clientY - y0) * 2;      /* centred plot: corner follows the pointer */
      if (ev.shiftKey) { nh = nw / ratio; }
      var pw = Math.max(MIN, Math.min(MAX, nw / availW * 100)), ph = Math.max(MIN, Math.min(MAX, nh / availH * 100));
      last = [pw, ph];
      if (busy) { return; } busy = true;
      requestAnimationFrame(function () { busy = false; if (last) { wr("gW" + s, Math.round(last[0])); wr("gH" + s, Math.round(last[1])); bump(); place(); } });
    }
    function up() {
      grip.removeEventListener("pointermove", move); grip.removeEventListener("pointerup", up); grip.removeEventListener("pointercancel", up);
      dragging = false; document.documentElement.classList.remove("nc-gsize-drag");
      if (last) { setSize(land, last[0], last[1]); }
      setTimeout(place, 30);
    }
    grip.addEventListener("pointermove", move); grip.addEventListener("pointerup", up); grip.addEventListener("pointercancel", up);
  }

  /* follow changes made elsewhere (Settings sliders, the other NeuCurve window) */
  function onSync(ev) {
    try {
      var d = ev && ev.data; if (typeof d === "string") { d = JSON.parse(d); }
      if (d && /^g[WH][pl]$/.test(d.key) && d.appId !== "nc-gsize") { wr(d.key, d.val); bump(); }
    } catch (e) { }
  }
  window.addEventListener("storage", function (e) { if (!e.key || /neucurve_g[WH][pl]$/.test(e.key)) { bump(); } });
  try { if (window.CSInterface) { new window.CSInterface().addEventListener("com.neucurve.sync", onSync); } } catch (e) { }
  window.addEventListener("resize", function () { setTimeout(place, 60); });
  /* layout can change without the bundle recomputing (tab bar moves, panel divider drag): re-place the grip, cheap and rAF-throttled */
  var pend = false;
  function sch() { if (pend || dragging) { return; } pend = true; requestAnimationFrame(function () { pend = false; place(); }); }
  function start() {
    /* the APPLY button glow rewrites its SVG style ~60x per second: never re-measure the graph for that */
    new MutationObserver(function (list) {
      for (var i = 0; i < list.length; i++) {
        var t = list[i].target;
        if (t && t.closest && t.closest(".apply-btn")) { continue; }
        sch(); return;
      }
    }).observe(document.getElementById("app") || document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "style", "width", "height"] });
    sch();
    /* v26: heal stale plots with no mutation / window resize to trigger it: observe the box and poll lightly (reads only) */
    try {
      if (window.ResizeObserver) {
        var ro = new ResizeObserver(function () { sch(); }), watched = null;
        setInterval(function () { var a = q(".canvas-area"); if (a && a !== watched) { watched = a; ro.observe(a); } }, 500);
      }
    } catch (e) { }
    setInterval(function () { if (!dragging && !document.hidden) { sch(); } }, 800);
  }
  if (document.readyState === "loading") { document.addEventListener("DOMContentLoaded", start); } else { start(); }
})();
