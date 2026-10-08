/* NeuCurve - refined icon set. Swaps the stock icons for one consistent family:
   24px grid, 1.7 stroke, round joins, and a soft "tone" fill behind the main shape so each icon reads
   as an object, not just an outline. Matched by button title / class, re-applied if the UI re-renders.
   Styles: nc-icons-pro.css. To change one icon, edit its entry in ICONS below. */
(function () {
  "use strict";
  var T = function (d, extra) { return '<path class="ncp-t" d="' + d + '"' + (extra || "") + "/>"; };
  var P = function (d, extra) { return '<path d="' + d + '"' + (extra || "") + "/>"; };
  var C = function (x, y, r, filled) { return '<circle cx="' + x + '" cy="' + y + '" r="' + r + '"' + (filled ? ' class="ncp-f"' : "") + "/>"; };
  function svg(inner) {
    return '<svg class="ncp" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + inner + "</svg>";
  }
  var GEAR = "M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z";
  var ERASER = "m7 21-4.3-4.3a2 2 0 0 1 0-2.8l9.6-9.6a2 2 0 0 1 2.8 0l5.6 5.6a2 2 0 0 1 0 2.8L13 21";

  var ICONS = {
    /* mode tabs */
    "Bézier":  svg(P("M3.5 20.5c4 0 6.5-1.5 6.5-8.5s3.5-8 10.5-8") + C(3.5, 20.5, 1.9, 1) + C(20.5, 4, 1.9, 1)),
    "Custom":  svg(P("M4.5 18.5C8 15 9 12 12 12s4-3 7.5-6.5") + C(4.5, 18.5, 2.1, 1) + C(12, 12, 2.1, 1) + C(19.5, 5.5, 2.1, 1)),
    "Elastic": svg(P("M3 12h18", ' class="ncp-guide"') + P("M3 20C6.5 20 7 4 10.5 4S14 17 16 17s1.8-8 3-8 1.3 3 2 3")),
    "Bounce":  svg(P("M3 21h18", ' class="ncp-guide"') + P("M5.5 8C6.3 12 7 16 8 20c1-4.5 2.2-8 4-8s3 3.5 4 8c.6-2.6 1.4-4 2.3-4s1.6 1.4 2.2 4") + C(5.5, 4.3, 2, 1)),
    "Wave":    svg(P("M2 12h20", ' class="ncp-guide"') + P("M2 12c2.5-7 5-7 7.5 0s5 7 7.5 0c1.2-3.4 2.6-4.6 5-4.6")),
    "Steps":   svg(T("M3 20h4.5v-4.5H12V11h4.5V6.5H21V20Z") + P("M3 20h4.5v-4.5H12V11h4.5V6.5H21")),
    /* tool row */
    "Remove Expressions": svg(T(ERASER) + P(ERASER) + P("M22 21H7") + P("m5 11 9 9")),
    "Invert": svg(P("m21 16-4 4-4-4") + P("M17 20V4") + P("m3 8 4-4 4 4") + P("M7 4v16")),
    "Read from AE": svg(T("M3 15h18v3a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3Z") + P("M21 15v3a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3v-3") + P("m7.5 9.5 4.5 4.5 4.5-4.5") + P("M12 14V3")),
    "Speed Graph": svg(T("M2.5 20C7 20 8.4 4 12 4s5 16 9.5 16Z") + P("M2.5 20C7 20 8.4 4 12 4s5 16 9.5 16") + P("M2.5 20h19", ' stroke-opacity=".5" stroke-width="1.4"')),   /* After Effects speed graph: bell-shaped velocity curve over its baseline */
    "Save current curve as preset": svg(T("m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z") + P("m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z") + P("M12 7.5v6") + P("M9 10.5h6")),
    "Expression Templates": svg(T("M5 3h14a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z") + '<rect x="3" y="3" width="18" height="7" rx="2"/><rect x="3" y="14" width="9" height="7" rx="2"/><rect x="16" y="14" width="5" height="7" rx="2"/>'),
    "Expression Mode": svg(T("M5.5 3h13A2.5 2.5 0 0 1 21 5.5v13a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 18.5v-13A2.5 2.5 0 0 1 5.5 3Z") + '<rect x="3" y="3" width="18" height="18" rx="2.5"/>' + P("M9.5 17c2 0 2.6-1 2.6-3v-4c0-2 .8-3 3-3") + P("M9 11.5h6")),
    "Preview": svg(T("M8 5.2c0-.8.9-1.3 1.6-.8l9.2 6.1c.6.4.6 1.2 0 1.6l-9.2 6.1c-.7.5-1.6 0-1.6-.8Z") + P("M8 5.2c0-.8.9-1.3 1.6-.8l9.2 6.1c.6.4.6 1.2 0 1.6l-9.2 6.1c-.7.5-1.6 0-1.6-.8Z")),
    "Bake to Keyframes": svg(T("M12 2.8l4.2 4.2-4.2 4.2L7.8 7Z") + P("M12 2.8l4.2 4.2-4.2 4.2L7.8 7Z") + P("M12 12.8l4.2 4.2-4.2 4.2L7.8 17Z")),
    "Live Playhead": svg(C(12, 12, 2.1, 1) + P("M7.7 16.3a6 6 0 0 1 0-8.6") + P("M16.3 7.7a6 6 0 0 1 0 8.6") + P("M4.8 19.2a10 10 0 0 1 0-14.4") + P("M19.2 4.8a10 10 0 0 1 0 14.4")),
    "Open Large Graph Editor": svg(P("M14.5 3.5H20.5V9.5") + P("M9.5 20.5H3.5V14.5") + P("M20.5 3.5 13.5 10.5") + P("M3.5 20.5l7-7")),
    "Settings": svg(T(GEAR) + P(GEAR) + C(12, 12, 3))
  };
  /* Ease buttons are matched by class (their title can be translated) */
  /* After Effects keyframe shapes: Ease = hourglass, Ease In = hourglass half on the left narrowing into a point on the right,
     Ease Out = the mirror (point on the left, hourglass half on the right); no centre step, so they do not read as rewind / fast-forward. Filled, soft corners (class ncp-k in nc-icons-pro.css). */
  var K = function (d) { return '<path class="ncp-k" d="' + d + '"/>'; };
  var BY_CLASS = {
    "fl-eout": svg(K("M19.5 4.5Q14.5 9.4 10.5 10.1L4.5 12L10.5 13.9Q14.5 14.6 19.5 19.5Z")),
    "fl-ease": svg(K("M4.5 4.5Q10 9 12 9Q14 9 19.5 4.5V19.5Q14 15 12 15Q10 15 4.5 19.5Z")),
    "fl-ein":  svg(K("M4.5 4.5Q9.5 9.4 13.5 10.1L19.5 12L13.5 13.9Q9.5 14.6 4.5 19.5Z"))
  };

  function titleKey(b) {
    var t = b.getAttribute("title") || b.getAttribute("aria-label") || "";
    if (ICONS[t]) { return t; }
    if (t.indexOf("Bake to Keyframes") === 0) { return "Bake to Keyframes"; }
    return "";
  }
  function apply() {
    var btns = document.querySelectorAll("button, .mtab");
    for (var i = 0; i < btns.length; i++) {
      var b = btns[i], key = titleKey(b), html = null, id = "";
      if (key) { html = ICONS[key]; id = key; }
      else {
        for (var c in BY_CLASS) { if (b.classList && b.classList.contains(c)) { html = BY_CLASS[c]; id = c; } }
      }
      if (!html) { continue; }
      var cur = b.querySelector("svg");
      if (cur && cur.classList.contains("ncp") && b.getAttribute("data-ncp") === id) { continue; }
      b.innerHTML = html;
      b.setAttribute("data-ncp", id);
      b.setAttribute("data-fl-icon", "1");   /* tell nc-flow.js not to put its own icon back */
    }
  }
  var raf = 0;
  function schedule() { if (raf) { return; } raf = requestAnimationFrame(function () { raf = 0; apply(); }); }
  function start() {
    apply();
    new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
  }
  if (document.readyState === "loading") { document.addEventListener("DOMContentLoaded", start); } else { start(); }
})();
