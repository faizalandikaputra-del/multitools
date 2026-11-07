/* Multi Tool - mt-layout-v3.js (v1)  -  DOM touches for css/mt-layout-v3.css (8 tabs; Easy Layer, Curve and Animator Text are left alone).
   Flag: localStorage mtx.layoutV3 = "0" -> v2 layout again. Anything else = on.
   What it does (all idempotent, re-run when the panel re-renders): sections that should always be open get class v3-flat;
   search boxes (Expression Code, Tools, Shortcutz) filter existing rows by hiding them; Shortcutz gets category chips and the
   "+ Add Custom Shortcut" button moves next to the search; Tools gets three quick tiles that click the real Save PNG / Save JPG / Export GIF buttons;
   Info gets a version row with "Check for updates". Nothing is rebuilt, so existing handlers keep working. Chromium-74 safe (no ?. or ??). */
(function () {
  "use strict";
  var de = document.documentElement;
  var FLAT = {
    "color-palette": ["Layer Label Colors"],
    "expr-code": ["New / Edit Snippet", "Saved Snippets"],
    "presets": ["Preset Folder", "Presets"],
    "quick-comp-edit": ["Timing", "Quick Resolution Presets", "Fit to Composition"],
    "anchor-align": ["Anchor Point", "Align to Composition"],
    "shortcutz": ["My Shortcuts", "Expression Shortcuts", "Quick Effect Shortcuts", "Utility Shortcuts"]
  };
  var NAMES = { "Layer Label Colors": "Layer label", "New / Edit Snippet": "Editor", "Saved Snippets": "Snippets", "Quick Resolution Presets": "Resolution", "Fit to Composition": "Fit layer", "Align to Composition": "Align to composition", "Anchor Point": "Anchor point", "Preset Folder": "Folder" };
  var state = { q: { expr: "", tools: "", sc: "" }, cat: "all" };
  var busy = false, timer = 0, obs = null;

  function on() { try { return localStorage.getItem("mtx.layoutV3") !== "0"; } catch (e) { return true; } }
  function apply() { if (on()) { de.setAttribute("data-layout", "v3"); } else if (de.getAttribute("data-layout") === "v3") { de.setAttribute("data-layout", "v2"); } }
  function el(tag, cls, html) { var n = document.createElement(tag); if (cls) { n.className = cls; } if (html != null) { n.innerHTML = html; } return n; }
  var SEARCH_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="m20 20-4-4"/></svg>';
  function txt(n) { return (n.textContent || "").replace(/\s+/g, " ").trim(); }
  function search(ph, key, onInput) {
    var w = el("label", "v3-search", SEARCH_SVG), i = el("input"); i.type = "text"; i.placeholder = ph; i.value = state.q[key] || ""; i.spellcheck = false; i.setAttribute("aria-label", ph);
    i.addEventListener("input", function () { state.q[key] = i.value; onInput(); });
    w.appendChild(i); return w;
  }

  /* ---- sections that are always open ---- */
  function flatten(panel, tab) {
    var want = FLAT[tab]; if (!want) { return; }
    var groups = panel.querySelectorAll(".ta-group");
    for (var i = 0; i < groups.length; i++) {
      var g = groups[i], lab = g.querySelector(".ta-group-label"), name = lab ? txt(lab) : "";
      if (want.indexOf(name) < 0) { continue; }
      g.classList.add("v3-flat"); g.classList.add("is-open");
      var head = g.querySelector(".ta-group-head"), body = g.querySelector(".ta-group-body");
      if (head) { head.setAttribute("aria-expanded", "true"); head.setAttribute("tabindex", "-1"); head.setAttribute("draggable", "false"); }
      if (body) { body.setAttribute("aria-hidden", "false"); body.style.maxHeight = "none"; }
      if (lab && NAMES[name] && lab.getAttribute("data-v3") !== "1") { lab.textContent = NAMES[name]; lab.setAttribute("data-v3", "1"); }
    }
    var notes = panel.querySelectorAll(".ta-group.v3-flat .field-note:not(#preset-path):not(#qce-current):not(#qce-res-current):not(.psup-note):not(.shortcutz-empty)");
    for (var k = 0; k < notes.length; k++) { notes[k].classList.add("v3-help"); }
  }

  /* ---- generic filter: hide rows whose text lacks the query ---- */
  function filterRows(rows, q) {
    q = (q || "").toLowerCase().trim();
    for (var i = 0; i < rows.length; i++) { rows[i].classList.toggle("v3-hidden", !!q && txt(rows[i]).toLowerCase().indexOf(q) < 0); }
  }

  /* ---- Color Palette: shorter label so the button fits beside the wheel ---- */
  function colorTab(panel) {
    var b = panel.querySelector(".cw-save");
    if (b && b.getAttribute("data-v3") !== "1") { b.setAttribute("data-v3", "1"); b.setAttribute("title", "Save color"); b.textContent = "Save"; }
  }

  /* ---- Expression Code ---- */
  function exprTab(panel) {
    var list = panel.querySelector("#expr-list"); if (!list) { return; }
    var host = panel.querySelector("#expr-cat-controls");
    if (host && !panel.querySelector(".v3-search--expr")) {
      var s = search("Search snippets", "expr", function () { exprFilter(panel); }); s.classList.add("v3-search--expr"); s.style.marginBottom = "8px";
      host.parentNode.insertBefore(s, host);
    }
    exprFilter(panel);
  }
  function exprFilter(panel) {
    var list = panel.querySelector("#expr-list"); if (!list) { return; }
    var rows = []; for (var i = 0; i < list.children.length; i++) { if (list.children[i].tagName !== "P") { rows.push(list.children[i]); } }
    filterRows(rows, state.q.expr);
  }

  /* ---- Animation Presets: Copy Effects goes below the preset list ---- */
  function presetsTab(panel) {
    var fx = panel.querySelector(".el-fx"), ta = panel.querySelector(".ta");
    if (fx && ta && ta.nextElementSibling !== fx && fx.getAttribute("data-v3") !== "1") {
      fx.setAttribute("data-v3", "1");
      if (ta.parentNode) { ta.parentNode.insertBefore(fx, ta.nextSibling); }
    }
  }

  /* ---- Tools: quick tiles + search over the tool list ---- */
  var TILE_ICON = { png: '<path d="M3 5h18v14H3z"/><circle cx="9" cy="10" r="1.6"/><path d="m21 16-5-5-8 8"/>', gif: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M8 10v4M11 10h2M11 14v-4M16 10h-2v4"/>' };
  function toolsTab(panel) {
    var ta = panel.querySelector(".ta"); if (!ta) { return; }
    if (!panel.querySelector(".v3-tiles")) {
      var tiles = el("div", "v3-tiles");
      [["Save PNG", '[data-frame-action="save"][data-format="png"]', "png"], ["Save JPG", '[data-frame-action="save"][data-format="jpg"]', "png"], ["Export GIF", "#gif-main", "gif"]].forEach(function (d) {
        var b = el("button", "v3-tile", '<svg viewBox="0 0 24 24" aria-hidden="true">' + TILE_ICON[d[2]] + "</svg>" + d[0]); b.type = "button";
        b.addEventListener("click", function () { var real = panel.querySelector(d[1]); if (real) { real.click(); } });
        tiles.appendChild(b);
      });
      var s = search("Search tools", "tools", function () { toolsFilter(panel); });
      ta.insertBefore(s, ta.firstChild); ta.insertBefore(tiles, ta.firstChild);
    }
    toolsFilter(panel);
  }
  function toolsFilter(panel) {
    var g = panel.querySelectorAll(".ta > .ta-group"), rows = [];
    for (var i = 0; i < g.length; i++) { var l = g[i].querySelector(".ta-group-label"); g[i].setAttribute("data-v3-name", l ? txt(l) : ""); rows.push(g[i]); }
    var q = (state.q.tools || "").toLowerCase().trim();
    for (var j = 0; j < rows.length; j++) { rows[j].classList.toggle("v3-hidden", !!q && rows[j].getAttribute("data-v3-name").toLowerCase().indexOf(q) < 0); }
  }

  /* ---- Shortcutz: search + category chips + add button in one bar ---- */
  var CATS = [["all", "All"], ["mine", "Mine"], ["expr", "Expression"], ["fx", "Effects"], ["util", "Utility"]];
  function scGroup(g) {
    var l = g.querySelector(".ta-group-label"), n = l ? txt(l) : "";
    return /^My/.test(n) ? "mine" : /^Expression/.test(n) ? "expr" : /^Quick Effect/.test(n) ? "fx" : /^Utility/.test(n) ? "util" : "other";
  }
  function shortcutzTab(panel) {
    var ta = panel.querySelector(".ta"); if (!ta) { return; }
    if (!panel.querySelector(".v3-bar")) {
      var bar = el("div", "v3-bar"), add = panel.querySelector("#shortcutz-add-btn");
      bar.appendChild(search("Search shortcuts", "sc", function () { scFilter(panel); }));
      if (add) { add.textContent = "+ Add"; add.title = "Add Custom Shortcut"; bar.appendChild(add); }
      var clr = panel.querySelector("#shortcutz-clear-all");
      if (clr) { clr.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/></svg>'; bar.appendChild(clr); }
      var chips = el("div", "v3-chips");
      CATS.forEach(function (c) {
        var b = el("button", "v3-chip", c[1]); b.type = "button"; b.setAttribute("data-cat", c[0]);
        b.addEventListener("click", function () { state.cat = c[0]; scFilter(panel); });
        chips.appendChild(b);
      });
      ta.insertBefore(chips, ta.firstChild); ta.insertBefore(bar, ta.firstChild);
      bar.style.marginBottom = "8px";
    }
    scFilter(panel);
  }
  function scFilter(panel) {
    var chips = panel.querySelectorAll(".v3-chip"), i;
    for (i = 0; i < chips.length; i++) { chips[i].classList.toggle("is-on", chips[i].getAttribute("data-cat") === state.cat); }
    var q = (state.q.sc || "").toLowerCase().trim(), groups = panel.querySelectorAll(".ta > .ta-group");
    for (i = 0; i < groups.length; i++) {
      var g = groups[i], kind = scGroup(g), show = state.cat === "all" || state.cat === kind, tiles = g.querySelectorAll(".saber-wrap--tile, .shortcut-tile"), any = false;
      for (var t = 0; t < tiles.length; t++) {
        var tile = tiles[t];
        if (tile.classList.contains("shortcut-tile") && tile.parentNode && tile.parentNode.classList.contains("saber-wrap--tile")) { continue; }
        var hit = !q || txt(tile).toLowerCase().indexOf(q) >= 0 || ((tile.getAttribute("title") || "").toLowerCase().indexOf(q) >= 0);
        tile.classList.toggle("v3-hidden", !hit); if (hit) { any = true; }
      }
      g.classList.toggle("v3-hidden", !show || (!!q && tiles.length > 0 && !any));
    }
  }

  /* ---- Info: version row ---- */
  function infoTab(panel) {
    var info = panel.querySelector(".info"); if (!info || info.querySelector(".v3-ver")) { return; }
    var v = ""; try { v = window.MTUpdater && window.MTUpdater.version ? window.MTUpdater.version() : ""; } catch (e) { v = ""; }
    if (!v || v === "0.0.0") { var m = /v(\d[\d.]*)/.exec(txt(info)); v = m ? m[1] : (v || ""); }
    var row = el("div", "v3-ver", "<div><small>Installed version</small><b>Multi Tool " + (v ? "v" + v : "") + "</b></div>");
    var b = el("button", null, "Check for updates"); b.type = "button";
    b.addEventListener("click", function () { try { if (window.MTUpdater && window.MTUpdater.check) { window.MTUpdater.check(true); } } catch (e) { } });
    row.appendChild(b);
    var socials = info.querySelector(".info-socials");
    info.insertBefore(row, socials || null);
    info.appendChild(el("p", "v3-note", "One panel with Easy Layer, Color Palette, Expression Code, Animation Presets, Quick Comp Edit, Anchor Point &amp; Align, Tools, Animator Text, Shortcutz and NeuCurve. Right-click a tool to set its image; use the gear for the background."));
  }

  /* ---- run ---- */
  function run() {
    busy = true;
    try {
      var panel = document.getElementById("panel"), tab = de.getAttribute("data-mt-tab");
      if (panel && on() && tab && !de.hasAttribute("data-mt-skip")) {
        if (obs) { obs.disconnect(); }
        flatten(panel, tab);
        if (tab === "color-palette") { colorTab(panel); }
        else if (tab === "expr-code") { exprTab(panel); }
        else if (tab === "presets") { presetsTab(panel); }
        else if (tab === "tools") { toolsTab(panel); }
        else if (tab === "shortcutz") { shortcutzTab(panel); }
        else if (tab === "info") { infoTab(panel); }
      }
    } catch (e) { try { console.warn("mt-layout-v3", e); } catch (e2) { } }
    watch(); busy = false;
  }
  function schedule() { if (timer) { return; } timer = setTimeout(function () { timer = 0; run(); }, 40); }
  function watch() {
    var panel = document.getElementById("panel"); if (!panel) { return; }
    if (!obs) { obs = new MutationObserver(function () { if (!busy) { schedule(); } }); }
    obs.observe(panel, { childList: true, subtree: true });
  }

  apply();
  if (window.MTLayoutV2) {
    var v2apply = window.MTLayoutV2.apply, v2tab = window.MTLayoutV2.tab;
    window.MTLayoutV2.apply = function () { v2apply(); apply(); };
    window.MTLayoutV2.tab = function (id) { v2tab(id); apply(); schedule(); };
  }
  window.MTLayoutV3 = { apply: apply, run: run, isOn: on };
  if (document.readyState === "loading") { document.addEventListener("DOMContentLoaded", function () { run(); }); } else { run(); }
})();
