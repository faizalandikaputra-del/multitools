/**
 * panel-refresh.js - "Refresh Panel" button (sidebar, above the gear).
 * After you copy updated Multi Tool files over the installed folder, press it instead of closing After Effects:
 *   1. re-loads jsx/host.jsx into After Effects' scripting engine (ExtendScript keeps running between panel
 *      reloads, so without this step changed host functions would keep their old code),
 *   2. remembers the tab you are on,
 *   3. asks js/mt-updater.js to check for a new version once the panel has reloaded (flag "mt_update_force_check"),
 *   4. reloads the panel page (HTML / CSS / JS, and the Curve tab frame with it). The opening splash plays again.
 * Not covered (needs an After Effects restart): changes to CSXS/manifest.xml. The Curve Settings / Graph Editor
 * windows are separate panels - close and reopen them to get their new files.
 * ES5 on purpose (old CEF).
 */
(function () {
  "use strict";
  var btn = document.getElementById("refresh-btn");
  if (!btn) { return; }
  var busy = false;

  function extPath() {
    try {
      var p = decodeURI(window.__adobe_cep__.getSystemPath("extension"));
      p = /^file:\/\/\/[A-Za-z]:/.test(p) ? p.replace(/^file:\/\/\//, "") : p.replace(/^file:\/\//, "");
      return p.replace(/\\/g, "/");
    } catch (e) { return ""; }
  }

  function reload() {
    try { window.location.reload(true); } catch (e) { window.location.href = window.location.href; }
  }

  btn.addEventListener("click", function () {
    if (busy) { return; }
    busy = true;
    btn.className += " is-spinning";

    try {
      var act = document.querySelector(".tabs .tab.is-active");
      if (act) { localStorage.setItem("mt_reopen_tab", act.getAttribute("data-tab")); }
      localStorage.setItem("mt_update_force_check", "1");     // js/mt-updater.js: check for updates right after this reload (ignores its 6 h throttle)
    } catch (e) { }

    var fired = false;
    function go() { if (fired) { return; } fired = true; setTimeout(reload, 380); }

    var p = extPath();
    if (p && window.__adobe_cep__ && window.__adobe_cep__.evalScript) {
      try {
        window.__adobe_cep__.evalScript('try { $.evalFile(' + JSON.stringify(p + "/jsx/host.jsx") + '); "ok"; } catch (e) { "err"; }', go);
      } catch (e) { go(); }
      setTimeout(go, 1500);                         // never hang if After Effects does not answer
    } else {
      go();                                         // plain browser preview: just reload
    }
  });
})();
