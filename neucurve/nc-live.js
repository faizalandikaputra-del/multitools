/* NeuCurve - nc-live.js : LIVE Auto Apply support (loaded BEFORE assets/index.js).  v3 - NO POLLING.
   Settings > Auto Apply (the existing toggle) works like a live link to After Effects:
     - click a keyframe (or several) in the timeline, then move / edit the graph here: the keyframes are updated
       continuously while you drag, so the After Effects Graph Editor follows in real time;
     - the LAST keyframes you clicked are remembered (jsx/host.jsx NC_liveStatus/NC_liveRun), so it keeps working
       after you click elsewhere / deselect - it re-selects them for you;
     - works in the Curve tab AND in the Large Graph Editor window.

   WHY v3: the old version asked After Effects for the selection every ~350 ms for as long as the Curve tab was open
   and Auto Apply was ON. Every one of those requests runs on AE's main thread and makes AE refresh its UI, which
   resets the mouse cursor - that is the arrow <-> I-beam flicker over the expression box. v3 never talks to After
   Effects on a timer. The selection is remembered with ONE request when the pointer enters the panel (you are about
   to use it, so you are not typing in AE at that moment) and again when an apply runs (NC_liveRun reads it itself).
   With Auto Apply OFF this file sends nothing to After Effects at all.

   This file only provides what the compiled bundle (assets/index.js, see "__ncLive" there) calls:
     __ncLive.delay(model)  ms to wait before the next live apply, or -1 = ignore (change did not come from
                            local input, e.g. it was just synced from the other NeuCurve window -> avoids double apply)
     __ncLive.gap(model)    minimum spacing between two applies
   Only the Bezier model is applied "continuously"; Elastic / Bounce / Wave / Steps / Custom (bake) re-apply 450 ms
   after you stop changing (they create keyframes, so they must not run on every mouse move). */
(function () {
  "use strict";
  var IS_SETTINGS = /[?&]ext=settings/.test(location.search);
  var BEZIER = 0;
  var cep = !!(window.__adobe_cep__);
  var old = false;          // old CEP hosts (AE 2019 / 2021) get a slower cadence
  try {
    var env = window.__adobe_cep__ && JSON.parse(window.__adobe_cep__.getHostEnvironment());
    var ver = (env && env.appVersion) || "";
    old = /^16\./.test(ver) || /^17\./.test(ver);
  } catch (e) { }

  var L = window.__ncLive = {
    lastInput: 0, lastRun: 0, busy: false, pending: false,
    down: false,      // a mouse button is held on the graph canvas (a drag in progress)
    // While you DRAG on the graph, applying every 70 ms keeps After Effects busy almost constantly, and AE keeps
    // resetting the mouse cursor (crosshair <-> arrow flicker). So during a drag the apply rate is much lower; the
    // final position is still applied right after you stop (trailing apply in the bundle's throttle).
    gap: function (model) {
      if (L.down) { return model === BEZIER ? (old ? 420 : 320) : 600; }
      return model === BEZIER ? (old ? 130 : 70) : 450;
    },
    delay: function (model) {
      var now = Date.now();
      if (now - L.lastInput > 1200) { return -1; }            // not a local edit
      var wait = L.lastRun + L.gap(model) - now;               // throttle (leading + trailing), not debounce
      return wait > 0 ? wait : 0;
    }
  };

  // "Was this change made by the person using THIS window?" - any pointer / key / wheel input counts.
  function touch() { L.lastInput = Date.now(); }
  ["mousedown", "mousemove", "mouseup", "touchstart", "touchmove", "wheel", "keydown", "input", "change", "click"].forEach(function (t) {
    window.addEventListener(t, touch, true);
  });

  // Cursor lock while dragging on the graph: keep the crosshair for the whole drag, whatever the page / host does.
  var root = document.documentElement;
  window.addEventListener("mousedown", function (e) {
    if (e.button !== 0) { return; }
    var t = e.target, onGraph = false;
    while (t && t !== document.body) {
      if (t.classList && (t.classList.contains("curve-svg") || t.classList.contains("canvas-container"))) { onGraph = true; break; }
      t = t.parentNode;
    }
    if (onGraph) { L.down = true; root.classList.add("nc-graph-drag"); }
  }, true);
  function release() { if (L.down) { L.down = false; root.classList.remove("nc-graph-drag"); } }
  window.addEventListener("mouseup", release, true);
  window.addEventListener("blur", release);
  document.addEventListener("mouseleave", function (e) { if (e.buttons === 0) { release(); } });

  /* ---------------- selection memory (event driven, NO timer) ----------------
     One NC_liveStatus() request when the pointer enters the panel (after a short dwell, so just crossing the panel
     edge does nothing), at most once per 2 s, never while an apply runs, never while the tab is hidden, and only
     while Auto Apply is ON. */
  if (IS_SETTINGS) { return; }
  var inFlight = false, lastSnap = 0, dwell = 0;

  function autoOn() { try { return localStorage.getItem("neucurve_autoApply") === "true"; } catch (e) { return false; } }

  function snapshot() {
    dwell = 0;
    try {
      if (!cep || !window.CSInterface || !autoOn()) { return; }
      if (document.hidden || window.innerWidth === 0) { return; }
      if (L.busy || L.down || inFlight) { return; }
      var now = Date.now();
      if (now - lastSnap < 2000) { return; }
      lastSnap = now;
      inFlight = true;
      new window.CSInterface().evalScript("NC_liveStatus()", function () { inFlight = false; });
    } catch (e) { inFlight = false; }
  }

  document.addEventListener("mouseenter", function () {
    clearTimeout(dwell);
    dwell = setTimeout(snapshot, 180);
  });
  document.addEventListener("mouseleave", function () { clearTimeout(dwell); dwell = 0; });
  window.addEventListener("focus", function () { clearTimeout(dwell); dwell = setTimeout(snapshot, 180); });
})();
