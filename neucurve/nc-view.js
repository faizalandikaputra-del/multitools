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

  function apply() {
    var hp = on("hidePresets"), hg = on("hideGraph");
    if (hp && hg) { hg = false; }
    var wasG = root.classList.contains("nc-view-graph"), wasP = root.classList.contains("nc-view-presets");
    root.classList.toggle("nc-view-graph", hp);
    root.classList.toggle("nc-view-presets", hg);
    if (wasG !== hp || wasP !== hg) {
      /* the bundle re-measures the graph on resize */
      setTimeout(function () { try { window.dispatchEvent(new Event("resize")); } catch (e) { } }, 30);
      setTimeout(function () { try { window.dispatchEvent(new Event("resize")); } catch (e) { } }, 260);
    }
  }

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
})();
