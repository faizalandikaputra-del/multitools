/* Multi Tool - mt-toast-preview.js  (WINDOW side of html/settings.html)
   Settings > Appearance > Toast. The real toast appears in the panel, which can be off screen while this window is open,
   so a change here used to look like it did nothing. This draws the toast in a small mock inside the window:
     - Position and Time on screen are read from the mirrored controls (#mtp-toast-pos, #mtp-toast-dur)
     - "Show a test toast" and every change play the preview for the chosen time (the real toast still fires in the panel)
     - while the dynamic island is on (localStorage mtx.islandOn, shared with the panel) toasts live in the island, so the
       Position row is dimmed and the mock shows the island capsule instead
   Local only: no call to After Effects, no message to the panel. ES5. */
(function () {
  "use strict";
  var box = document.getElementById("winToastPreview"), note = document.getElementById("winToastNote"),
      row = document.getElementById("winToastPosRow"), hint = document.getElementById("winToastPosHint"),
      posEl = document.getElementById("mtp-toast-pos"), durEl = document.getElementById("mtp-toast-dur"),
      testEl = document.getElementById("mtp-toast-test");
  if (!box || !posEl || !durEl) { return; }

  var POS = { "bottom": 1, "top": 1, "bottom-right": 1, "top-right": 1, "bottom-left": 1, "top-left": 1 };
  var HINT_OFF = "Where the toast appears in the panel.", HINT_ON = "Not used while the dynamic island is on.";
  var NOTE_ON = "The dynamic island is on, so toasts grow out of the island. Turn the island off to choose a corner.";
  var NOTE_OFF = "Toasts appear in the panel at the chosen position.";
  var shown = { pos: "", mode: "", note: "" }, hideT = 0;

  function islandOn() { try { return window.localStorage.getItem("mtx.islandOn") !== "0"; } catch (e) { return true; } }
  function ms() { var n = parseInt(durEl.value, 10); return isFinite(n) && n >= 800 ? Math.min(n, 15000) : 2400; }

  function paint() {
    var on = islandOn(), pos = POS[posEl.value] ? posEl.value : "bottom", mode = on ? "island" : "panel";
    if (shown.pos !== pos) { shown.pos = pos; box.setAttribute("data-pos", pos); }
    if (shown.mode !== mode) {
      shown.mode = mode; box.setAttribute("data-mode", mode);
      if (row) { row.classList.toggle("is-idle", on); }
      if (hint) { hint.textContent = on ? HINT_ON : HINT_OFF; }
    }
    var n = on ? NOTE_ON : NOTE_OFF;
    if (note && shown.note !== n) { shown.note = n; note.textContent = n; }
  }

  function play() {
    paint();
    clearTimeout(hideT);
    box.classList.remove("is-on");
    void box.offsetWidth;                       // restart the transition when pressed again
    box.classList.add("is-on");
    hideT = setTimeout(function () { box.classList.remove("is-on"); }, ms());
  }

  posEl.addEventListener("change", play);
  durEl.addEventListener("change", play);
  if (testEl) { testEl.addEventListener("click", play); }

  // the panel confirms values a moment after a click (state mirror sets .value without an event), and the island switch can
  // change in the other window: a slow local check keeps the mock honest. Nothing here leaves the window.
  paint();
  setInterval(function () { if (!document.hidden) { paint(); } }, 800);
})();
