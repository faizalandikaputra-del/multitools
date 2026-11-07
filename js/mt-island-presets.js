/* Multi Tool - mt-island-presets.js (v1)  -  pinned Animation Presets inside the dynamic island (Pin view, "Presets" grid).
   Drag a row of the Animation Presets list onto the island (drag type "text/mt-preset", set in js/main.js, Presets.render, "dragstart"):
   js/mt-island.js opens its Pin view and calls MTIslandPresets.add({ folder, file, name }). Click a pinned preset = PRE_apply (jsx/host.jsx) on
   the selected layer(s), same call as the Apply button. x = unpin. Order = pin order. Saved in localStorage "mtx.islandPresets" (part of the
   settings profile: key prefix mtx.). The row in the preset list is never touched. API: window.MTIslandPresets { add, remove, list }.
   Hooks in js/mt-island.js: MTIsland.presetHost() (the grid), MTIsland.presetsChanged(n). ES5 (old CEF). */
(function () {
  "use strict";
  var KEY = "mtx.islandPresets", list = [], prev = [], host = null, first = true, cs = null;
  var ICO = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12l5 5L19 7"/></svg>';
  var X = '<svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';

  function isle() { return window.MTIsland || null; }
  function id(o) { return o.folder + "\u0001" + o.file; }
  function load() {
    var a = [], i, raw;
    try { raw = JSON.parse(localStorage.getItem(KEY) || "[]"); } catch (e) { raw = []; }
    if (!(raw instanceof Array)) { raw = []; }
    for (i = 0; i < raw.length; i++) { if (raw[i] && typeof raw[i].file === "string" && typeof raw[i].folder === "string") { a.push({ folder: raw[i].folder, file: raw[i].file, name: String(raw[i].name || raw[i].file) }); } }
    list = a;
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(list)); } catch (e) { } }
  function indexOf(o) { var i; for (i = 0; i < list.length; i++) { if (id(list[i]) === id(o)) { return i; } } return -1; }
  function toast(m, err) { try { window.__MT.toast(m, err); } catch (e) { } }

  function apply(o, b) {
    var esc = function (v) { return JSON.stringify(v).replace(/[\u0080-\uffff]/g, function (ch) { return "\\u" + ("0000" + ch.charCodeAt(0).toString(16)).slice(-4); }); };
    if (b.classList.contains("is-pending")) { return; }
    try { if (!cs) { cs = new CSInterface(); } } catch (e) { toast("Preview mode - not inside After Effects.", true); return; }
    b.classList.add("is-pending");
    function done(ok, msg) {
      b.classList.remove("is-pending");
      b.classList.add(ok ? "is-success" : "is-error");
      setTimeout(function () { b.classList.remove("is-success", "is-error"); }, 900);
      toast(msg || (ok ? "Applied " + o.name + "." : "Could not apply " + o.name + "."), !ok);
    }
    try {
      cs.evalScript("PRE_apply(" + esc(o.folder) + "," + esc(o.file) + ")", function (res) {
        var r;
        if (!res || res === "EvalScript error.") { done(false, "Script error. Check host.jsx."); return; }
        try { r = JSON.parse(res); } catch (e2) { r = { ok: false, message: String(res) }; }
        done(!!r.ok, r.message);
      });
    } catch (e3) { done(false, "Could not reach After Effects."); }
  }

  function render() {
    var n = list.length, ids = [], i, fresh = first;
    if (!host) { return; }
    host.innerHTML = "";
    host.classList.toggle("is-stag", first && n > 0);
    list.forEach(function (o, k) {
      var t = document.createElement("div"), b = document.createElement("button"), rm = document.createElement("button"), key = id(o);
      ids.push(key);
      t.className = "mi-ptile"; t.style.setProperty("--i", String(Math.min(k, 7)));
      if (!fresh && prev.indexOf(key) < 0) { t.className += " is-new"; }
      b.type = "button"; b.className = "mi-pbtn"; b.title = o.name;
      b.innerHTML = '<span class="mi-pico">' + ICO + '</span><span class="mi-pname"></span>';
      b.lastChild.textContent = o.name;
      b.addEventListener("click", function (e) { e.stopPropagation(); apply(o, b); });
      rm.type = "button"; rm.className = "mi-prm"; rm.title = "Unpin"; rm.setAttribute("aria-label", "Unpin " + o.name); rm.innerHTML = X;
      rm.addEventListener("click", function (e) {
        e.stopPropagation();
        var go = function () { remove(o); };
        if (document.documentElement.getAttribute("data-reduce-motion") === "true") { go(); return; }
        t.className += " is-out"; setTimeout(go, 150);
      });
      t.appendChild(b); t.appendChild(rm); host.appendChild(t);
    });
    prev = ids; first = false;
    if (isle() && isle().presetsChanged) { isle().presetsChanged(n); }
  }

  function add(o) {
    if (!o || typeof o.file !== "string" || !o.file) { return false; }
    var item = { folder: String(o.folder || ""), file: o.file, name: String(o.name || o.file) };
    if (indexOf(item) >= 0) { return false; }
    list.push(item); save(); render(); return true;
  }
  function remove(o) { var i = indexOf(o); if (i < 0) { return false; } list.splice(i, 1); save(); render(); return true; }

  function boot() {
    var i = isle();
    load();
    host = i && i.presetHost ? i.presetHost() : null;
    render();
    window.addEventListener("storage", function (e) { if (e && e.key === KEY) { load(); render(); } });
  }
  window.MTIslandPresets = { add: add, remove: remove, list: function () { return list.slice(); } };
  if (document.readyState === "complete") { boot(); } else { window.addEventListener("load", boot); }
})();
