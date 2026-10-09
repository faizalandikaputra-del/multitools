/* NeuCurve - nc-handle.js (v1)  html.nc-press while a handle / the graph is pressed (see nc-handle.css). ES5. */
(function () {
  "use strict";
  var root = document.documentElement;
  function down(e) {
    var t = e.target;
    while (t && t.nodeType === 1) {
      if (t.tagName && t.tagName.toLowerCase() === "svg" && t.classList && t.classList.contains("curve-svg")) { root.classList.add("nc-press"); return; }
      t = t.parentNode;
    }
  }
  function up() { root.classList.remove("nc-press"); }
  window.addEventListener("mousedown", down, true);
  window.addEventListener("touchstart", down, true);
  window.addEventListener("mouseup", up, true);
  window.addEventListener("touchend", up, true);
  window.addEventListener("touchcancel", up, true);
  window.addEventListener("blur", up);
})();
