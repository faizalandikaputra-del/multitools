/* Multi Tool - mt-layout-v2.js (v1)  -  switch + current-tab marker for css/mt-layout-v2.css.
   Flag: localStorage mtx.layoutV2 = "0" -> old layout (html[data-layout] is not set). Anything else = on.
   main.js showTab() calls MTLayoutV2.tab(tabId): html[data-mt-tab] = tab id, html[data-mt-skip] = "1" for the tabs that keep their old look.
   Chromium-74 safe. */
(function () {
  "use strict";
  var KEEP = { "easy-layer": 1, "curve": 1, "textflex": 1 };
  var de = document.documentElement;
  function on() { try { return localStorage.getItem("mtx.layoutV2") !== "0"; } catch (e) { return true; } }
  function apply() { if (on()) { de.setAttribute("data-layout", "v2"); } else { de.removeAttribute("data-layout"); } }
  function tab(id) {
    de.setAttribute("data-mt-tab", id);
    if (KEEP[id]) { de.setAttribute("data-mt-skip", "1"); } else { de.removeAttribute("data-mt-skip"); }
  }
  apply();
  window.MTLayoutV2 = { tab: tab, apply: apply, isOn: on };
})();
