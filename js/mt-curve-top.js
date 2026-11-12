/* Multi Tool - mt-curve-top.js (v1)  -  see css/mt-curve-top.css
   Copies the opaque colour of NeuCurve's backdrop (.extension-wrapper inside #curve-frame) into --curve-top-bg on <html>, so the band
   behind the island matches. Reads only; same-origin file:// frame (the panel already shares localStorage with it). A translucent or
   unreadable value is ignored (the last good colour stays). Checks on frame load, when the Curve tab opens, and once a second while
   it is open and visible. ES5. */
(function () {
  "use strict";
  var root = document.documentElement, frame = document.getElementById("curve-frame"), last = "";
  if (!frame) { return; }

  function opaque(c) {
    var m = /^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)(?:[\s,\/]+([\d.]+%?))?\s*\)$/i.exec(c || "");
    if (!m) { return ""; }
    var a = m[4] === undefined ? 1 : (m[4].slice(-1) === "%" ? parseFloat(m[4]) / 100 : parseFloat(m[4]));
    return a >= 0.98 ? "rgb(" + m[1] + "," + m[2] + "," + m[3] + ")" : "";
  }
  function paint() {
    var doc, win, names = [".extension-wrapper", ".graph-shell", "body"], i, el, col;
    try { doc = frame.contentDocument; win = frame.contentWindow; } catch (e) { return; }
    if (!doc || !win || !doc.body) { return; }
    for (i = 0; i < names.length; i++) {
      el = doc.querySelector(names[i]); if (!el) { continue; }
      try { col = opaque(win.getComputedStyle(el).backgroundColor); } catch (e2) { col = ""; }
      if (col) { break; }
    }
    if (col && col !== last) { last = col; root.style.setProperty("--curve-top-bg", col); }
    inset(doc);
  }
  /* v5: tell NeuCurve how much room the island needs at the top (50px = 8 + 36 + 6, same as css/mt-island.css); 0 when the island is off. */
  var lastInset = "";
  function inset(doc) {
    var v = root.getAttribute("data-island") === "off" ? "0px" : "50px";
    if (v === lastInset && doc.documentElement.style.getPropertyValue("--mt-top-inset") === v) { return; }
    lastInset = v;
    try { doc.documentElement.style.setProperty("--mt-top-inset", v); } catch (e4) { }
  }

  frame.addEventListener("load", function () { paint(); setTimeout(paint, 600); setTimeout(paint, 2500); });
  window.addEventListener("message", function (e) {
    if (e && e.data && (e.data.mtCurveReady || e.data.mtBgRequest)) { paint(); setTimeout(paint, 300); }
  });
  try {
    new MutationObserver(function () { if (root.classList.contains("mt-curve-open")) { paint(); } })
      .observe(root, { attributes: true, attributeFilter: ["class", "data-island"] });
  } catch (e3) { }
  setInterval(function () { if (!document.hidden && root.classList.contains("mt-curve-open")) { paint(); } }, 1000);
})();
