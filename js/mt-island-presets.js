/* Multi Tool - mt-island-presets.js (v1: PRESET CHIPS IN THE ISLAND)
   A preset tile (.ffx) of the Animation Presets tab can be dragged onto the dynamic island (js/main.js sets the drag type "text/mt-preset", js/mt-island.js
   drops it into MTIslandPresets.add()). The island's Pin view then shows a chip per preset: click = apply it to the selected layer(s), x = remove the chip.
   The tile stays in the tab (copy, not move), so the folder list never changes. Apply runs through window.__MT.runPreset (same call as a pinned Shortcutz preset:
   PRE_apply, "Last used" marker, toast). The list is remembered (key mtx.island.presets). Island off in Settings = chips are hidden with the island.
   Chromium-74 safe (no optional chaining, no flex gap). */
(function () {
  "use strict";
  var KEY = "mtx.island.presets", MAX = 24, list = [], started = false, subs = [];

  function load() {
    var a; try { a = JSON.parse(localStorage.getItem(KEY) || "[]"); } catch (e) { a = []; }
    list = (Object.prototype.toString.call(a) === "[object Array]") ? a.filter(function (x) { return x && typeof x.file === "string" && typeof x.folder === "string"; }) : [];
  }
  function save() { try { if (list.length) { localStorage.setItem(KEY, JSON.stringify(list)); } else { localStorage.removeItem(KEY); } } catch (e) { } }
  function isle() { return window.MTIsland || null; }
  function enabled() { var i = isle(); return !!(i && i.isEnabled && i.isEnabled()); }
  function el(tag, cls, html) { var n = document.createElement(tag); if (cls) { n.className = cls; } if (html) { n.innerHTML = html; } return n; }
  function idx(o) { var i; for (i = 0; i < list.length; i++) { if (list[i].folder === o.folder && list[i].file === o.file) { return i; } } return -1; }
  var X_SVG = '<svg viewBox="0 0 24 24" width="10" height="10" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round"/></svg>';

  function render() {
    var i = isle(), host = i && i.presetHost ? i.presetHost() : null;
    if (!host) { return; }
    host.innerHTML = "";
    list.forEach(function (o) {
      var row = el("div", "mi-prerow"), b = el("button", "mi-prebtn"), rm = el("button", "mi-prerm", X_SVG), nm = el("span", "mi-prename"), ap = el("span", "mi-preap", "Apply");
      b.type = "button"; rm.type = "button";
      nm.textContent = o.name || o.file; b.title = "Apply " + (o.name || o.file); b.setAttribute("aria-label", "Apply " + (o.name || o.file));
      b.appendChild(nm); b.appendChild(ap);
      b.addEventListener("click", function (e) {
        e.stopPropagation();
        if (!window.__MT || !window.__MT.runPreset) { return; }
        window.__MT.runPreset(o, b);
      });
      rm.title = "Remove from the island"; rm.setAttribute("aria-label", "Remove " + (o.name || o.file) + " from the island");
      rm.addEventListener("click", function (e) { e.stopPropagation(); remove(o); });
      row.appendChild(b); row.appendChild(rm); host.appendChild(row);
    });
    if (i.presetsChanged) { i.presetsChanged(list.length); }
    subs.forEach(function (f) { try { f(); } catch (e) { } });
  }

  function add(json) {                       // 1 = added, 2 = already there, 0 = rejected
    var o; try { o = JSON.parse(json); } catch (e) { return 0; }
    if (!o || typeof o.file !== "string" || typeof o.folder !== "string" || !o.file) { return 0; }
    if (!enabled()) { try { window.__MT.toast("Turn on the dynamic island in Settings first.", true); } catch (e2) { } return 0; }
    if (idx(o) >= 0) { return 2; }
    if (list.length >= MAX) { try { window.__MT.toast("The island holds " + MAX + " presets at most.", true); } catch (e3) { } return 0; }
    list.push({ folder: o.folder, file: o.file, name: String(o.name || o.file) });
    save(); render();
    var i = isle(); if (i && i.focusBoxes) { i.focusBoxes(); }
    return 1;
  }
  function remove(o) { var at = idx(o); if (at >= 0) { list.splice(at, 1); save(); render(); } }

  function start() { if (started) { return; } started = true; load(); if (list.length) { render(); } else { subs.forEach(function (f) { try { f(); } catch (e) { } }); } }
  window.MTIslandPresets = { add: add, remove: remove, count: function () { return list.length; }, list: function () { return list.slice(); }, onChange: function (f) { subs.push(f); } };
  function boot() { setTimeout(start, 700); }                                                       // after main.js and mt-island.js have built their UI
  if (document.readyState === "complete") { boot(); } else { window.addEventListener("load", boot); }
})();
