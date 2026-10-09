/* NeuCurve - nc-view.js (v1)  PANEL VIEW: show only the graph, or only the presets.
   Settings > Behavior > "Hide Preset Graphs" / "Hide Graph Settings" write neucurve_hidePresets / neucurve_hideGraph
   ("true" / "false"). This file turns them into one class on <html> that nc-view.css styles:
       nc-view-graph    -> only the graph column (mode tabs, graph, tools, Apply) is shown
       nc-view-presets  -> only the preset column is shown (graph hidden, Apply bar + gear stay so presets can still be applied)
   Both can never be on together: the Settings window turns the other one off, and if the two keys ever disagree here
   (old / edited storage) the graph wins, so the panel is never left empty.
   Not used in the Settings window or in the Large Graph Editor (?ext=graph). Plain ES5 for AE 2021 / Chromium 74. */
(function () {
  "use strict";
  if (/[?&]ext=(settings|graph)/.test(location.search)) { return; }

  var root = document.documentElement;

  function on(k) { try { return localStorage.getItem("neucurve_" + k) === "true"; } catch (e) { return false; } }

  /* Graph-only view: the scrub strip (line + ball that previews the animation) normally lives under the graph / above the presets and
     was hidden together with them. Now it is docked INSIDE the graph box (bottom edge) while "Hide Preset Graphs" is on, and handed
     back to nc-flow.js when it is off. */
  function dock() {
    var strip = document.querySelector(".preview-strip-container"), area = document.querySelector(".canvas-area");
    if (!strip || !area) { return; }
    if (root.classList.contains("nc-view-graph")) {
      if (strip.parentNode !== area) { area.appendChild(strip); }
      if (!strip.__ncPv) {   /* the ball only runs from the Preview (play) button, which is hidden with the preset toolbar: click the strip = Preview */
        strip.__ncPv = true;
        strip.title = "Click to preview the animation";
        strip.addEventListener("click", function () {
          if (!root.classList.contains("nc-view-graph")) { return; }
          var b = document.querySelector('[title="Preview"]'); if (b) { b.click(); }
        });
      }
    } else if (strip.parentNode === area) {
      var back = document.querySelector(".action-container .fl-bar") || document.querySelector(".action-container");
      if (back) { back.appendChild(strip); }   /* nc-flow.js build() puts it in its exact place right after */
    }
  }

  function apply() {
    var hp = on("hidePresets"), hg = on("hideGraph");
    if (hp && hg) { hg = false; }
    var wasG = root.classList.contains("nc-view-graph"), wasP = root.classList.contains("nc-view-presets");
    root.classList.toggle("nc-view-graph", hp);
    root.classList.toggle("nc-view-presets", hg);
    dock();
    fit();
    if (wasG !== hp || wasP !== hg) {
      /* the bundle re-measures the graph on resize */
      setTimeout(function () { try { window.dispatchEvent(new Event("resize")); } catch (e) { } }, 30);
      setTimeout(function () { try { window.dispatchEvent(new Event("resize")); } catch (e) { } }, 260);
    }
  }

  /* v2 FULL HEIGHT: portrait + "Hide Preset Graphs" -> the graph box takes ALL the height the panel has left (panel height minus the tab strip
     and the tool / Apply rows), instead of the divider height (which is only 160-270 px). The bundle asks window.__ncFullH() for its
     graph height; 0 = use the divider height as before. nc-view.js re-asks (window.__ncHBump) whenever the layout changes. */
  function px(v) { v = parseFloat(v); return isFinite(v) ? v : 0; }
  window.__ncFullH = function () {
    if (!root.classList.contains("nc-view-graph")) { return 0; }
    var fs = document.querySelector(".content-wrapper .fixed-section"), wrap = document.querySelector(".content-wrapper");
    var area = fs && fs.querySelector(".canvas-area");
    if (!fs || !area || (wrap && wrap.classList.contains("is-landscape"))) { return 0; }
    var used = 0, kids = fs.children, i, cs;
    for (i = 0; i < kids.length; i++) {
      if (kids[i] === area) { continue; }
      cs = getComputedStyle(kids[i]);
      if (cs.display === "none" || cs.position === "absolute" || cs.position === "fixed") { continue; }
      used += kids[i].offsetHeight + px(cs.marginTop) + px(cs.marginBottom);
    }
    cs = getComputedStyle(area);
    used += (area.offsetHeight - area.clientHeight) + px(cs.marginTop) + px(cs.marginBottom);
    var h = Math.floor(fs.clientHeight - used);
    return h >= 120 ? h : 0;
  };
  var fitT = 0;
  function fit() { clearTimeout(fitT); fitT = setTimeout(function () { try { if (window.__ncHBump) { window.__ncHBump(); } } catch (e) { } }, 40); }
  window.addEventListener("resize", fit);

  function onSync(ev) {
    try {
      var d = ev && ev.data; if (typeof d === "string") { d = JSON.parse(d); }
      if (d && (d.key === "hidePresets" || d.key === "hideGraph")) {
        localStorage.setItem("neucurve_" + d.key, String(d.val));
        apply();
      }
    } catch (e) { }
  }

  apply();   /* before first paint of the bundle: no flash of the hidden column */
  window.addEventListener("storage", function (e) { if (!e.key || e.key === "neucurve_hidePresets" || e.key === "neucurve_hideGraph") { apply(); } });
  try { if (window.CSInterface) { new window.CSInterface().addEventListener("com.neucurve.sync", onSync); } } catch (e) { }
  window.__ncView = { apply: apply };
  /* the bundle builds its DOM after this script: keep docking until the strip exists, then only when the layout changes */
  var tries = 0, t = setInterval(function () { dock(); fit(); if (++tries > 40) { clearInterval(t); } }, 250);
  try {
    new MutationObserver(function () { if (root.classList.contains("nc-view-graph")) { dock(); } }).observe(document.body || root, { childList: true, subtree: true });
  } catch (e) { }
})();
