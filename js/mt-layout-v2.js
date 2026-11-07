/* Multi Tool - mt-layout-v2.js (v2)  -  switch, current-tab marker and small DOM touches for css/mt-layout-v2.css.
   Flag: localStorage mtx.layoutV2 = "0" -> old layout (html[data-layout] is not set). Anything else = on.
   main.js showTab() calls MTLayoutV2.tab(tabId): html[data-mt-tab] = tab id, html[data-mt-skip] = "1" for the tabs that keep their old look, html[data-mt-sub] = short subtitle
   (the CSS shows it instead of the long hint). main.js renderTab() calls MTLayoutV2.decorate(tabId, panel): the Animation Presets tab gets an "On the island" card on top
   (the presets pinned to the dynamic island, js/mt-island-presets.js; click Apply = same call as the island row). Chromium-74 safe. */
(function () {
  "use strict";
  var KEEP = { "easy-layer": 1, "curve": 1, "textflex": 1 };
  var SUB = { "color-palette": "Pick, copy and label colors", "expr-code": "Write, save and apply expressions", "presets": "Apply .ffx presets to layers", "quick-comp-edit": "Timecode, duration and size",
    "anchor-align": "Anchor point and align", "tools": "Everyday layer utilities", "shortcutz": "One-click speed dial", "info": "About and updates" };
  var de = document.documentElement;
  function on() { try { return localStorage.getItem("mtx.layoutV2") !== "0"; } catch (e) { return true; } }
  function apply() { if (on()) { de.setAttribute("data-layout", "v2"); } else { de.removeAttribute("data-layout"); } }
  function tab(id) {
    de.setAttribute("data-mt-tab", id);
    if (KEEP[id]) { de.setAttribute("data-mt-skip", "1"); de.removeAttribute("data-mt-sub"); } else { de.removeAttribute("data-mt-skip"); if (SUB[id]) { de.setAttribute("data-mt-sub", SUB[id]); } else { de.removeAttribute("data-mt-sub"); } }
    var ph = document.getElementById("panel-hint"); if (ph) { if (SUB[id] && !KEEP[id]) { ph.setAttribute("data-x", SUB[id]); } else { ph.removeAttribute("data-x"); } }
  }
  function el(tag, cls, txt) { var n = document.createElement(tag); if (cls) { n.className = cls; } if (txt) { n.textContent = txt; } return n; }

  /* ---- Animation Presets: "On the island" card ---- */
  var islCard = null;
  function paintIsland() {
    var I = window.MTIslandPresets, body, list;
    if (!islCard || !document.body.contains(islCard)) { return; }
    list = I && I.list ? I.list() : [];
    body = islCard.querySelector(".v2-isl-body"); body.innerHTML = "";
    islCard.hidden = !list.length;
    list.forEach(function (o) {
      var row = el("div", "v2-isl-row"), nm = el("span", "v2-isl-name", o.name || o.file), ap = el("button", "v2-isl-apply", "Apply"), rm = el("button", "v2-isl-rm", "\u00d7");
      ap.type = "button"; rm.type = "button"; rm.title = "Remove from the island"; rm.setAttribute("aria-label", "Remove " + (o.name || o.file) + " from the island");
      ap.addEventListener("click", function () { if (window.__MT && window.__MT.runPreset) { window.__MT.runPreset(o, ap); } });
      rm.addEventListener("click", function () { I.remove(o); });
      row.appendChild(nm); row.appendChild(ap); row.appendChild(rm); body.appendChild(row);
    });
  }
  function decorate(tabId, panel) {
    if (!on() || tabId !== "presets" || !panel) { return; }
    var old = panel.querySelector(".v2-isl"); if (old && old.parentNode) { old.parentNode.removeChild(old); }
    islCard = el("div", "v2-isl"); islCard.appendChild(el("div", "v2-isl-title", "On the island")); islCard.appendChild(el("div", "v2-isl-body"));
    panel.insertBefore(islCard, panel.firstChild);
    paintIsland();
    if (!decorate.sub && window.MTIslandPresets && window.MTIslandPresets.onChange) { decorate.sub = 1; window.MTIslandPresets.onChange(paintIsland); }
  }
  apply();
  window.MTLayoutV2 = { tab: tab, decorate: decorate, apply: apply, isOn: on };
})();
