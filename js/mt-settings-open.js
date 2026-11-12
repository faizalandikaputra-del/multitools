/* Multi Tool - mt-settings-open.js
   One small gate shared by the panel, NeuCurve and both Settings windows (all load from file:// = one shared localStorage).
   Problem: while a Settings window is open the pointer is outside the panel, so every background poll that talks to After Effects
   (QCE_autoRes, the Quick Comp Edit refresh, the NeuCurve playhead poll, registerKeyEventsInterest ...) kept running.
   Each host call makes After Effects reset the mouse cursor, so the cursor blinked (hand <-> arrow) over the Settings window.
   Fix: a Settings window writes a heartbeat key while it is open and visible; the polls ask window.__mtSettingsOpen() and rest.
   Calls that come from a real action (a button, a changed setting) never ask this gate, so they still run.
   Key "mtbus.settingsAlive" uses the mtbus. prefix on purpose: js/mt-persist.js never mirrors it to disk, so the beat costs no file writes.
   ES5, Chromium-74 safe. */
(function (w) {
  "use strict";
  var KEY = "mtbus.settingsAlive", BEAT_MS = 1000, TTL = 3500;
  var inSettings = /settings\.html$/i.test(String((w.location && w.location.pathname) || ""));

  function read() { try { return parseInt(w.localStorage.getItem(KEY), 10) || 0; } catch (e) { return 0; } }
  w.__mtSettingsOpen = function () { var t = read(), d = Date.now() - t; return t > 0 && d > -TTL && d < TTL; };

  if (!inSettings) { return; }

  // ---- Settings window side: beat while open and visible, clear on close ----
  var me = String(Date.now()) + Math.random().toString(36).slice(2, 6);
  function beat() {
    try {
      if (w.document.hidden) { clear(); return; }
      w.localStorage.setItem(KEY, String(Date.now()));
      w.localStorage.setItem(KEY + ".by", me);
    } catch (e) { }
  }
  function clear() {
    try { if (w.localStorage.getItem(KEY + ".by") === me) { w.localStorage.removeItem(KEY); w.localStorage.removeItem(KEY + ".by"); } } catch (e) { }
  }
  beat();
  setInterval(beat, BEAT_MS);
  w.addEventListener("pagehide", clear);
  w.addEventListener("unload", clear);
  w.addEventListener("beforeunload", clear);
  w.document.addEventListener("visibilitychange", beat);
})(window);
