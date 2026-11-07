/* Multi Tool - mt-saber.js : even, rounded edge light for Auto Parent (Easy Layer) and the Expression Code editor.
   WHY: the old ring was one huge rotating conic-gradient seen through a 2px gap. On a wide, short box the angle
   sweep is not linear along the edge: the light crawled in the middle of the long sides, then raced past the ends
   and "jumped" around the corners. Now an SVG rounded-rect stroke (pathLength 100) carries a 3-layer comet, so it
   travels the real perimeter at constant speed, follows the corner radius, and never leaves the 2px gap.
   Applies to .saber-wrap and .saber-wrap--code. Shortcutz tiles / preset folders keep their own rules.
   Plain ES5. Needs css/mt-saber.css. */
(function () {
  "use strict";
  var NS = "http://www.w3.org/2000/svg";
  var SEL = ".saber-wrap:not(.saber-wrap--tile):not(.saber-wrap--folder)";
  var GAP = 2;   // padding of .saber-wrap = visible ring thickness
  var LAYERS = [[40, .10], [32, .16], [24, .24], [17, .36], [11, .55], [6, 1]];   /* [length in % of the edge, opacity]: tail -> head, all ending at the same point */
  var ro = null, queued = false;

  function el(name, attrs) {
    var n = document.createElementNS(NS, name), k;
    for (k in attrs) { if (attrs.hasOwnProperty(k)) { n.setAttribute(k, attrs[k]); } }
    return n;
  }
  function layout(wrap) {
    var svg = wrap.__sbSvg;
    if (!svg) { return; }
    var w = wrap.offsetWidth, h = wrap.offsetHeight;
    if (!w || !h) { return; }
    var r = parseFloat(getComputedStyle(wrap).borderTopLeftRadius) || 10;
    var half = GAP / 2, rx = Math.max(0, Math.min(r - half, (w - GAP) / 2, (h - GAP) / 2));
    svg.setAttribute("viewBox", "0 0 " + w + " " + h);
    var rects = svg.querySelectorAll("rect"), i;
    for (i = 0; i < rects.length; i++) {
      rects[i].setAttribute("x", half); rects[i].setAttribute("y", half);
      rects[i].setAttribute("width", w - GAP); rects[i].setAttribute("height", h - GAP);
      rects[i].setAttribute("rx", rx); rects[i].setAttribute("ry", rx);
    }
  }
  function build(wrap) {
    if (wrap.__sbSvg) { return; }
    var svg = el("svg", { "class": "saber-svg", "aria-hidden": "true", preserveAspectRatio: "none" }), i;
    for (i = 0; i < LAYERS.length; i++) {
      svg.appendChild(el("rect", {
        "class": "saber-seg saber-seg--" + i + (i === LAYERS.length - 1 ? " saber-seg--head" : ""), pathLength: "100", fill: "none",
        "stroke-width": GAP, "stroke-opacity": LAYERS[i][1], "stroke-dasharray": LAYERS[i][0] + " " + (100 - LAYERS[i][0])
      }));
    }
    wrap.insertBefore(svg, wrap.firstChild);
    wrap.__sbSvg = svg;
    wrap.setAttribute("data-sb", "1");
    layout(wrap);
    if (ro) { ro.observe(wrap); }
  }
  function scan() {
    queued = false;
    var list = document.querySelectorAll(SEL), i;
    for (i = 0; i < list.length; i++) { build(list[i]); }
  }
  function queue() { if (!queued) { queued = true; (window.requestAnimationFrame || setTimeout)(scan); } }

  if (window.ResizeObserver) {
    ro = new ResizeObserver(function (entries) { for (var i = 0; i < entries.length; i++) { layout(entries[i].target); } });
  } else {
    window.addEventListener("resize", function () { var l = document.querySelectorAll("[data-sb]"); for (var i = 0; i < l.length; i++) { layout(l[i]); } });
  }
  new MutationObserver(queue).observe(document.documentElement, { childList: true, subtree: true });
  if (document.readyState === "loading") { document.addEventListener("DOMContentLoaded", queue); } else { queue(); }
})();
