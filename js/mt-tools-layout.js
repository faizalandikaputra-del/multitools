/* Multi Tool - mt-tools-layout.js
   Settings > Appearance > "Tools layout": Normal (all tool cards stacked, as before) or Compact (a row of icon buttons;
   only the chosen tool's card is shown below). Only the Tools tab is affected.
   - setting      localStorage mtx.toolsLayout = "compact" (absent = normal); chosen tool index in mtx.toolsSel
   - hidden real controls (#mtt-layout-normal / #mtt-layout-compact) live in #settings-modal and are mirrored into the
     Settings window by js/mt-settings-remote.js, exactly like the Density cards in js/mt-pro.js
   - the icon bar is built from the capsule cards PanelRefinements already made (.ta-group): each card's own header icon
     and label are reused, so a new Tools section shows up here with no extra code
   - look: css/mt-tools-layout.css (Glass + Material You). Load AFTER js/mt-newtools.js. ES5. */
(function () {
  "use strict";
  var root = document.documentElement, panel = document.getElementById("panel");
  var KEY = "mtx.toolsLayout", SEL = "mtx.toolsSel";
  function $(id) { return document.getElementById(id); }
  function get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function set(k, v) { try { localStorage.setItem(k, String(v)); } catch (e) { } }
  function del(k) { try { localStorage.removeItem(k); } catch (e) { } }
  function qa(el, sel) { return Array.prototype.slice.call(el.querySelectorAll(sel)); }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }

  function layout() { return get(KEY) === "compact" ? "compact" : "normal"; }
  function apply(v) { if (v === "compact") { root.setAttribute("data-mtt-layout", "compact"); } else { root.removeAttribute("data-mtt-layout"); } }
  apply(layout());   // first paint

  function isTools() { var t = $("panel-title"); return !!t && t.textContent === "Tools"; }
  function labelOf(g) { var l = g.querySelector(".ta-group-label"); return l ? l.textContent.replace(/\s+/g, " ").trim() : ""; }
  function iconOf(g) {
    var s = g.querySelector(".ta-group-ico svg");
    return s ? s.outerHTML : '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3"/></svg>';
  }

  // A card the bar had to open (it was collapsed) is closed again when it is deselected / the layout goes back to Normal.
  function openCard(g) {
    var body = g.querySelector(".ta-group-body"), head = g.querySelector(".ta-group-head");
    if (g.classList.contains("is-open")) { return; }
    g.setAttribute("data-mtt-opened", "1");
    g.classList.add("is-open");
    if (body) { body.style.maxHeight = "none"; body.setAttribute("aria-hidden", "false"); }
    if (head) { head.setAttribute("aria-expanded", "true"); }
  }
  function restoreCard(g) {
    if (g.getAttribute("data-mtt-opened") !== "1") { return; }
    var body = g.querySelector(".ta-group-body"), head = g.querySelector(".ta-group-head");
    g.removeAttribute("data-mtt-opened");
    g.classList.remove("is-open");
    if (body) { body.style.maxHeight = "0px"; body.setAttribute("aria-hidden", "true"); }
    if (head) { head.setAttribute("aria-expanded", "false"); }
  }

  function host() { var g = panel && panel.querySelector(".ta-group"); return g ? g.parentNode : null; }

  function select(h, i) {
    var groups = qa(h, ":scope > .ta-group"), btns = qa(h, ":scope > .mtt-bar .mtt-ico"), k;
    if (i < 0 || i >= groups.length) { i = 0; }
    for (k = 0; k < groups.length; k++) {
      var on = k === i;
      groups[k].classList.toggle("mtt-on", on);
      if (on) { openCard(groups[k]); } else { restoreCard(groups[k]); }
      if (btns[k]) { btns[k].setAttribute("aria-selected", on ? "true" : "false"); btns[k].tabIndex = on ? 0 : -1; }
    }
    set(SEL, i);
  }

  function teardown(h) {
    var bar = h.querySelector(":scope > .mtt-bar");
    if (bar) { bar.parentNode.removeChild(bar); }
    h.classList.remove("mtt-host");
    qa(h, ":scope > .ta-group").forEach(function (g) { g.classList.remove("mtt-on"); restoreCard(g); });
  }

  function enhance() {
    var h = host();
    if (!h || !isTools()) { return; }
    if (layout() !== "compact") { teardown(h); return; }
    var groups = qa(h, ":scope > .ta-group");
    if (!groups.length) { return; }
    var sig = groups.map(labelOf).join("|"), bar = h.querySelector(":scope > .mtt-bar");
    if (bar && bar.getAttribute("data-sig") === sig) { return; }
    var cur = parseInt(get(SEL), 10);
    if (!isFinite(cur) || cur < 0 || cur >= groups.length) { cur = 0; }
    if (bar) { bar.parentNode.removeChild(bar); }
    bar = document.createElement("div");
    bar.className = "mtt-bar";
    bar.setAttribute("role", "tablist");
    bar.setAttribute("aria-label", "Tools");
    bar.setAttribute("data-sig", sig);
    bar.innerHTML = groups.map(function (g, i) {
      var name = esc(labelOf(g));
      return '<button type="button" class="mtt-ico" role="tab" aria-selected="false" data-i="' + i + '" style="--i:' + i + '" title="' + name + '" aria-label="' + name + '">' + iconOf(g) + "</button>";
    }).join("");
    bar.addEventListener("click", function (e) {
      var b = e.target; while (b && b !== bar && !(b.classList && b.classList.contains("mtt-ico"))) { b = b.parentNode; }
      if (b && b !== bar) { select(h, parseInt(b.getAttribute("data-i"), 10)); }
    });
    bar.addEventListener("keydown", function (e) {   // arrow keys move between the icons, like any tab list
      var d = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
      if (!d) { return; }
      var n = groups.length, next = (parseInt(get(SEL), 10) + d + n) % n;
      e.preventDefault(); select(h, next);
      var nb = qa(bar, ".mtt-ico")[next]; if (nb) { nb.focus(); }
    });
    h.classList.add("mtt-host");
    h.insertBefore(bar, h.firstChild);
    // Entrance: the icons pop in one after another (css .mtt-bar.is-fresh). The class is dropped afterwards so a held
    // animation never overrides the hover / press transforms.
    bar.classList.add("is-fresh");
    setTimeout(function () { bar.classList.remove("is-fresh"); }, 420 + groups.length * 28);
    select(h, cur);
  }

  // The tab is rebuilt on every tab switch, and mt-newtools.js renames / rebuilds some cards a moment later: run again.
  var timers = [];
  function schedule() {
    timers.forEach(clearTimeout); timers = [];
    [0, 120, 450].forEach(function (ms) { timers.push(setTimeout(function () { try { enhance(); } catch (e) { if (window.console) { console.warn("mt-tools-layout:", e); } } }, ms)); });
  }
  if (panel) { try { new MutationObserver(schedule).observe(panel, { childList: true }); } catch (e) { } }

  /* ---------------- hidden real controls (mirrored by mt-settings-remote.js) ---------------- */
  function buildControls() {
    var box = document.querySelector("#settings-modal .modal");
    if (!box || $("mtt-fields")) { return; }
    var d = document.createElement("div"); d.id = "mtt-fields"; d.hidden = true;
    d.innerHTML =
      '<button type="button" role="radio" aria-checked="false" id="mtt-layout-normal">Normal</button>' +
      '<button type="button" role="radio" aria-checked="false" id="mtt-layout-compact">Compact</button>';
    box.appendChild(d);
  }
  function syncControls() {
    var v = layout(), a = $("mtt-layout-normal"), b = $("mtt-layout-compact");
    if (a) { a.setAttribute("aria-checked", v === "normal" ? "true" : "false"); }
    if (b) { b.setAttribute("aria-checked", v === "compact" ? "true" : "false"); }
  }
  function choose(v) {
    if (v === "compact") { set(KEY, "compact"); } else { del(KEY); }
    apply(v); syncControls(); schedule();
  }
  buildControls();
  syncControls();
  if ($("mtt-layout-normal")) { $("mtt-layout-normal").addEventListener("click", function () { choose("normal"); }); }
  if ($("mtt-layout-compact")) { $("mtt-layout-compact").addEventListener("click", function () { choose("compact"); }); }
  schedule();
})();
