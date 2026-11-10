/* Multi Tool - mt-palette-pro.js  (PANEL side)
   Settings > Appearance > "Color wheel": where the Color Palette wheel lives.
     Mode    Floating (round button in a corner that opens the wheel)  /  Inside tab (the card at the top of the tab)
     Corner  bottom right / bottom left / top right / top left   (Floating only)
     Size    button size: small / medium / large                 (Floating only)
   The real controls are the hidden buttons below (in #settings-modal), mirrored to html/settings.html by js/mt-settings-remote.js,
   like Density in js/mt-pro.js. Storage keys (localStorage): mtx.cpWheelMode, mtx.cpWheelCorner, mtx.cpWheelSize (absent = default).
   js/main.js (CPWheel) reads them and rebuilds the tab when this file fires "mt-cw-settings". ES5, Chromium-74 safe. */
(function () {
  "use strict";
  var KEYS = { mode: "mtx.cpWheelMode", corner: "mtx.cpWheelCorner", size: "mtx.cpWheelSize" };
  var OPTS = { mode: ["float", "inline"], corner: ["br", "bl", "tr", "tl"], size: ["s", "m", "l"] };
  var DEF = { mode: "float", corner: "br", size: "m" };
  function $(id) { return document.getElementById(id); }
  function get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function set(k, v) { try { localStorage.setItem(k, String(v)); } catch (e) { } }
  function del(k) { try { localStorage.removeItem(k); } catch (e) { } }
  function val(g) { var v = get(KEYS[g]); return OPTS[g].indexOf(v) !== -1 ? v : DEF[g]; }

  function buildControls() {
    var box = document.querySelector("#settings-modal .modal");
    if (!box || $("mtcw-fields")) { return; }
    var d = document.createElement("div"); d.id = "mtcw-fields"; d.hidden = true; var html = "";
    Object.keys(OPTS).forEach(function (g) {
      OPTS[g].forEach(function (o) { html += '<button type="button" role="radio" aria-checked="false" id="mtcw-' + g + '-' + o + '">' + g + ' ' + o + '</button>'; });
    });
    d.innerHTML = html + '<button type="button" id="mtcw-reset">Reset color wheel</button>';
    box.appendChild(d);
  }
  function sync() {
    Object.keys(OPTS).forEach(function (g) {
      var cur = val(g);
      OPTS[g].forEach(function (o) { var el = $("mtcw-" + g + "-" + o); if (el) { el.setAttribute("aria-checked", o === cur ? "true" : "false"); } });
    });
    var off = val("mode") === "inline";     // corner + size only matter for the floating wheel
    ["corner", "size"].forEach(function (g) { OPTS[g].forEach(function (o) { var el = $("mtcw-" + g + "-" + o); if (el) { el.disabled = off; } }); });
  }
  function fire() { try { document.dispatchEvent(new CustomEvent("mt-cw-settings")); } catch (e) { } }
  function choose(g, o) {
    if (o === DEF[g]) { del(KEYS[g]); } else { set(KEYS[g], o); }
    sync(); fire();
  }
  function init() {
    buildControls(); sync();
    Object.keys(OPTS).forEach(function (g) {
      OPTS[g].forEach(function (o) { var el = $("mtcw-" + g + "-" + o); if (el) { el.addEventListener("click", function () { choose(g, o); }); } });
    });
    var r = $("mtcw-reset");
    if (r) { r.addEventListener("click", function () { Object.keys(KEYS).forEach(function (g) { del(KEYS[g]); }); sync(); fire(); }); }
  }
  if (document.readyState === "loading") { document.addEventListener("DOMContentLoaded", init); } else { init(); }
})();
