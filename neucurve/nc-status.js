/* NeuCurve - nc-status.js (v3)  -  see nc-status.css
   Puts the status pill (.status-overlay, created by the Svelte bundle inside .action-container) in the thin strip UNDER the graph, centred
   between the "0" and "1" axis labels (the graph box .canvas-area ends with that strip), so it never covers the curve, its handles or the
   toolbar. It copies the strip (relative to .action-container) into left / top and limits max-width to the space between the two labels.
   Falls back to the spot just above the action bar when the graph is not on screen (e.g. presets-only view). Runs when the pill is added,
   when its text changes and on window resize, at most one requestAnimationFrame per burst. Layout is only read, the bundle's own DOM is
   never touched. ES5 (AE 2021 / CEF 88). */
(function () {
  "use strict";
  var raf = 0;

  function place() {
    var pill, box, area, b, r, left, top;
    raf = 0;
    pill = document.querySelector(".action-container .status-overlay");
    if (!pill) { return; }
    box = pill.parentNode;
    area = document.querySelector(".canvas-area");
    b = box.getBoundingClientRect();
    if (area && area.offsetParent) {
      r = area.getBoundingClientRect();
      if (r.width > 24 && r.height > 24) {
        pill.style.maxWidth = Math.max(40, Math.round(r.width - 56)) + "px";             // room for the "0" and "1" labels on both sides
        left = r.left - b.left + (r.width - pill.offsetWidth) / 2; top = r.bottom - b.top - 11;
        pill.style.left = Math.round(left) + "px"; pill.style.top = Math.round(top) + "px";
        return;
      }
    }
    pill.style.left = "8px"; pill.style.top = "-20px"; pill.style.maxWidth = "calc(100% - 16px)";     // no graph: just above the action bar
  }
  function sched() { if (!raf) { raf = requestAnimationFrame(place); } }

  function start() {
    try {
      new MutationObserver(function (list) {
        var i, j, n;
        for (i = 0; i < list.length; i++) {
          for (j = 0; j < list[i].addedNodes.length; j++) {
            n = list[i].addedNodes[j];
            if (n.nodeType === 1 && (n.classList.contains("status-overlay") || n.querySelector(".status-overlay"))) { sched(); return; }
          }
          if (list[i].type === "characterData" && list[i].target.parentNode && list[i].target.parentNode.classList && list[i].target.parentNode.classList.contains("status-overlay")) { sched(); return; }   // text changed in place: centre again
        }
      }).observe(document.body, { childList: true, subtree: true, characterData: true });
    } catch (e) { }
    window.addEventListener("resize", sched);
    sched();
  }
  if (document.body) { start(); } else { document.addEventListener("DOMContentLoaded", start); }
})();
