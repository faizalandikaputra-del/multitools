/* Multi Tool - mt-sheet.js (v1)  -  companion of css/mt-sheet.css ("Sheet" look).
   Flag: localStorage mtx.sheetUI = "0" -> off (previous v3 look). Anything else = on.
   Does: sets html[data-sheet="1"]; swaps the Animation Presets / Anchor / Settings rail icons for the sheet icon set; adds small right-hand
   hints to section headers. Idempotent, no layout reads in the hot path, Chromium-74 safe (no ?. / ??). */
(function () {
  "use strict";
  var de = document.documentElement;
  function on() { try { return localStorage.getItem("mtx.sheetUI") !== "0"; } catch (e) { return true; } }
  if (!on()) { return; }
  de.setAttribute("data-sheet", "1");

  var ICONS = {
    "presets": '<path d="M12 3c.7 4.9 2.6 6.8 7.5 7.5-4.9.7-6.8 2.6-7.5 7.5-.7-4.9-2.6-6.8-7.5-7.5C9.4 9.8 11.3 7.9 12 3Z"/>',
    "anchor-align": '<circle cx="12" cy="12" r="2.4"/><path d="M12 3v4.6M12 16.4V21M3 12h4.6M16.4 12H21"/>'
  };
  var SUN = '<circle cx="12" cy="12" r="3.6"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.64 5.64l1.42 1.42M16.94 16.94l1.42 1.42M5.64 18.36l1.42-1.42M16.94 7.06l1.42-1.42"/>';
  var META = { "color-palette": { "Layer label": "Click to set label" } };

  function icons() {
    var k, b, s;
    for (k in ICONS) {
      b = document.querySelector('.sidebar .tab[data-tab="' + k + '"]'); s = b && b.querySelector("svg");
      if (s && s.getAttribute("data-sh") !== "1") { s.innerHTML = ICONS[k]; s.setAttribute("data-sh", "1"); }
    }
    b = document.getElementById("settings-btn"); s = b && b.querySelector("svg");
    if (s && s.getAttribute("data-sh") !== "1") { s.innerHTML = SUN; s.setAttribute("data-sh", "1"); }
  }
  function meta() {
    var tab = de.getAttribute("data-mt-tab"), m = META[tab], panel = document.getElementById("panel");
    if (!m || !panel) { return; }
    var labs = panel.querySelectorAll(".ta-group-label");
    for (var i = 0; i < labs.length; i++) {
      var t = (labs[i].textContent || "").trim(), head = labs[i].parentNode;
      if (m[t] && head && !head.querySelector(".sh-meta")) {
        var sp = document.createElement("span"); sp.className = "sh-meta"; sp.textContent = m[t]; head.insertBefore(sp, head.querySelector("svg"));
      }
    }
  }

  /* ---- Expression Code: Save beside Apply, Clear as a small X at the end of the name field ---- */
  var X_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>';
  function exprTab(panel) {
    var act = panel.querySelector(".field-actions"), save = panel.querySelector("#expr-save"), clr = panel.querySelector("#expr-clear-form"), name = panel.querySelector("#expr-name");
    if (act && save && save.parentNode !== act) { act.appendChild(save); save.textContent = "Save"; save.className = "btn"; }
    if (name && clr && !name.parentNode.classList.contains("sh-namerow")) {
      var row = document.createElement("div"); row.className = "sh-namerow";
      name.parentNode.insertBefore(row, name); row.appendChild(name); row.appendChild(clr);
      clr.innerHTML = X_SVG; clr.setAttribute("aria-label", "Clear snippet form"); clr.title = "Clear form"; clr.classList.add("sh-xbtn");
    }
  }
  /* ---- Animation Presets: Save / Import / Check Support in a sticky bar at the bottom ---- */
  var BAR = [
    ["preset-save", "Save as preset", '<path d="M12 5v14M5 12h14"/>'],
    ["preset-import", "Import", '<path d="M12 4v11M7.5 10.5 12 15l4.5-4.5M5 19h14"/>'],
    ["preset-support-btn", "Check support", '<circle cx="12" cy="12" r="8.5"/><path d="m8.5 12.3 2.4 2.4 4.6-5"/>']
  ];
  function presetsTab(panel) {
    var ta = panel.querySelector(".ta"); if (!ta || panel.querySelector(".sh-actionbar")) { return; }
    var bar = document.createElement("div"), n = 0; bar.className = "sh-actionbar";
    BAR.forEach(function (b) {
      var el = panel.querySelector("#" + b[0]); if (!el) { return; }
      el.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true">' + b[2] + "</svg><span>" + b[1] + "</span>"; el.classList.add("sh-barbtn"); bar.appendChild(el); n++;
    });
    if (n) { panel.appendChild(bar); }
    var rf = panel.querySelector("#preset-refresh");
    if (rf && !rf.getAttribute("data-sh")) { rf.setAttribute("data-sh", "1"); rf.setAttribute("aria-label", "Refresh presets"); rf.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11a8 8 0 0 0-14.3-4.5L4 8.5M4 4v4.5h4.5M4 13a8 8 0 0 0 14.3 4.5l1.7-2M20 20v-4.5h-4.5"/></svg>'; }
  }
  /* ---- Color Palette: hex text sits on the colour chip, ink follows its brightness ---- */
  var cwObs = null;
  function ink(cw, chip) {
    var m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(getComputedStyle(chip).backgroundColor || ""); if (!m) { return; }
    var l = (0.299 * m[1] + 0.587 * m[2] + 0.114 * m[3]) / 255; cw.style.setProperty("--cw-ink", l > 0.58 ? "#111114" : "#ffffff");
  }
  function colorTab(panel) {
    var cw = panel.querySelector(".cw"), chip = cw && cw.querySelector(".cw-chip"); if (!chip || chip.getAttribute("data-sh")) { return; }
    chip.setAttribute("data-sh", "1"); ink(cw, chip);
    try { if (cwObs) { cwObs.disconnect(); } cwObs = new MutationObserver(function () { ink(cw, chip); }); cwObs.observe(chip, { attributes: true, attributeFilter: ["style"] }); } catch (e) { }
  }
  var raf = 0;
  function run() { raf = 0; try { icons(); meta(); var t = de.getAttribute("data-mt-tab"), pn = document.getElementById("panel"); if (pn) { if (t === "expr-code") { exprTab(pn); } else if (t === "presets") { presetsTab(pn); } else if (t === "color-palette") { colorTab(pn); } } } catch (e) { try { console.warn("mt-sheet", e); } catch (e2) { } } }
  function queue() { if (!raf) { raf = requestAnimationFrame(run); } }
  function start() {
    run();
    try { new MutationObserver(queue).observe(document.getElementById("panel") || document.body, { childList: true, subtree: true }); } catch (e) { }
    try { new MutationObserver(queue).observe(de, { attributes: true, attributeFilter: ["data-mt-tab"] }); } catch (e) { }
  }
  if (document.readyState === "loading") { document.addEventListener("DOMContentLoaded", start); } else { start(); }
})();
