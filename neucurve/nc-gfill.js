/* NeuCurve - nc-gfill.js (v1)  GRAPH FLOOR FILLS THE GRAPH BOX
   Problem: the plot (svg.curve-svg) is capped (Flow limits, ~300px wide) and centred inside the wider .canvas-area box, so the
   floor rect and the Graph Background image stopped at the plot edge and left dark empty bands on both sides.
   Fix: the plot keeps its size (curve, handles, grid and the 0..1 range are NOT touched). Only the floor rect and the background
   <image> are stretched to the whole .canvas-area, plus OVERSHOOT px on every side so there is never a hairline seam at the border.
   .canvas-area already has overflow:hidden + the rounded border, so the extra part is cropped there.
   - sets --gf-x / --gf-y / --gf-w / --gf-h (svg user units) on the svg; nc-gbox.css uses them for the floor rect
   - exposes window.__ncGFill = { svg, x, y, w, h } (same units) for nc-bg.js, which places the background image in it
   - turns html.nc-gfill on/off. Off switch: localStorage neucurve_gFill = "0", or remove the <link>/<script> in index.html.
   Plain ES5 (old CEP hosts). */
(function () {
  "use strict";
  if (/[?&]ext=settings/.test(location.search)) { return; }
  var OVERSHOOT = 6;     /* px beyond the box edge on each side; raise for more, 0 = exactly the box */
  var last = "", pend = false;

  function off() { try { return localStorage.getItem("neucurve_gFill") === "0"; } catch (e) { return false; } }
  function q(s) { return document.querySelector(s); }

  function clear(svg) {
    var root = document.documentElement;
    if (root.classList.contains("nc-gfill")) { root.classList.remove("nc-gfill"); }
    window.__ncGFill = null;
    if (svg) { ["--gf-x", "--gf-y", "--gf-w", "--gf-h"].forEach(function (k) { svg.style.removeProperty(k); }); }
    last = "";
  }

  function update() {
    pend = false;
    var area = q(".canvas-area"), svg = q("svg.curve-svg");
    if (off() || !area || !svg) { clear(svg); return; }
    var ar = area.getBoundingClientRect(), sr = svg.getBoundingClientRect();
    var svgW = parseFloat(svg.getAttribute("width")), svgH = parseFloat(svg.getAttribute("height"));
    if (!(sr.width > 0 && sr.height > 0 && ar.width > 0 && ar.height > 0 && svgW > 0 && svgH > 0)) { clear(svg); return; }
    var kx = svgW / sr.width, ky = svgH / sr.height;                   /* css px -> svg units (1 unless something scales the plot) */
    var bl = area.clientLeft || 0, bt = area.clientTop || 0;           /* area border: overflow:hidden clips at the padding box */
    var x = (ar.left + bl - OVERSHOOT - sr.left) * kx;
    var y = (ar.top + bt - OVERSHOOT - sr.top) * ky;
    var w = (area.clientWidth + OVERSHOOT * 2) * kx;
    var h = (area.clientHeight + OVERSHOOT * 2) * ky;
    var key = [x, y, w, h].map(function (n) { return Math.round(n * 10); }).join(",");
    if (key === last && window.__ncGFill && window.__ncGFill.svg === svg) { return; }
    last = key;
    svg.style.setProperty("--gf-x", x.toFixed(2) + "px");
    svg.style.setProperty("--gf-y", y.toFixed(2) + "px");
    svg.style.setProperty("--gf-w", w.toFixed(2) + "px");
    svg.style.setProperty("--gf-h", h.toFixed(2) + "px");
    window.__ncGFill = { svg: svg, x: x, y: y, w: w, h: h };
    document.documentElement.classList.add("nc-gfill");
    try { if (window.__ncBgFit) { window.__ncBgFit(); } } catch (e) { }   /* re-place the background image in the new box */
  }

  function sch() { if (pend) { return; } pend = true; requestAnimationFrame(update); }

  function start() {
    var host = document.getElementById("app") || document.body;
    /* the APPLY button glow rewrites its SVG style ~60x per second: ignore it, like nc-gsize.js does */
    new MutationObserver(function (list) {
      for (var i = 0; i < list.length; i++) {
        var t = list[i].target;
        if (t && t.closest && t.closest(".apply-btn")) { continue; }
        if (t && t.nodeType === 1 && t.closest && t.closest("svg.curve-svg") && t.tagName !== "svg") { continue; }   /* curve redraws */
        sch(); return;
      }
    }).observe(host, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "style", "width", "height"] });
    try {
      if (window.ResizeObserver) {
        var ro = new ResizeObserver(sch), tick = setInterval(function () {
          var a = q(".canvas-area"); if (a) { ro.observe(a); clearInterval(tick); }
        }, 200);
      }
    } catch (e) { }
    window.addEventListener("resize", sch);
    window.addEventListener("storage", function (e) { if (!e.key || /neucurve_gFill$/.test(e.key)) { sch(); } });
    setInterval(sch, 600);   /* cheap safety net: update() bails out when nothing changed */
    sch();
  }
  if (document.readyState === "loading") { document.addEventListener("DOMContentLoaded", start); } else { start(); }
})();
