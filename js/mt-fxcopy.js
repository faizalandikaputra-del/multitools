/* Multi Tool - mt-fxcopy.js (v2)  -  Copy Effects
   1. DOT + "EFFECTS" TAB in the dynamic island (js/mt-island.js). While one or more effects are selected in the After Effects timeline a 7 px violet dot shows inside the island
      (the capsule never changes size). A click on the island opens it on the Effects tab: the effect names + "Save" (Ctrl+C does the same while the panel has focus). After Save the row
      crossfades (140 ms) to "N effects saved" + "Paste"; the dot stays until the Paste is done. Select a layer, press Paste (or Ctrl+V): the island closes and the dot goes.
      The tab closes by itself when the pointer leaves the island. No wide chip, no bounce, nothing that covers the panel.
   2. EASY LAYER section (MTFx.renderSection, called from showTab in main.js): Copy from layer / Paste to layer, paste mode (Add / Replace all) and the last saved stack.
   After Effects cannot be asked for its clipboard and never sends Ctrl+C to a panel that is not focused, so the "detection" is a light poll (host.jsx FX_peek, ~0.7 s, only while the panel
   is visible and the island is switched on). Copy / Paste themselves use After Effects' own Copy / Paste commands (host.jsx FX_copy / FX_paste), so Curves, Levels, keyframes and
   expressions travel intact. The stash keeps only a small record per entry (localStorage mtx.fxStash, max 8). Paste from the island / Ctrl+V always uses the newest save.
   Off switch: localStorage mtx.fxChip = "0" (dot + polling stop; the Easy Layer section keeps working). Island off in Settings = no dot either (the Easy Layer section still works). */
(function () {
  "use strict";
  var STASH_KEY = "mtx.fxStash", MODE_KEY = "mtx.fxPasteMode", ON_KEY = "mtx.fxChip";
  var MAX = 8, POLL_MS = 700;

  var cs = null;
  try { if (typeof CSInterface === "function" && window.__adobe_cep__) { cs = new CSInterface(); } } catch (e) { cs = null; }

  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { } }
  function chipOn() { return lsGet(ON_KEY) !== "0"; }
  function el(tag, cls, html) { var n = document.createElement(tag); if (cls) { n.className = cls; } if (html) { n.innerHTML = html; } return n; }
  function plural(n) { return n + " effect" + (n === 1 ? "" : "s"); }

  function call(fn, args) {
    return new Promise(function (resolve) {
      if (!cs) { resolve({ ok: false, message: "Open the panel inside After Effects." }); return; }
      var script = fn + "(" + (args || []).map(function (a) {
        return JSON.stringify(a).replace(/[\u0080-\uffff]/g, function (ch) { return "\\u" + ("0000" + ch.charCodeAt(0).toString(16)).slice(-4); });
      }).join(",") + ")";
      cs.evalScript(script, function (res) {
        if (!res || res === "EvalScript error.") { resolve({ ok: false, message: "Script error. Check host.jsx." }); return; }
        try { resolve(JSON.parse(res)); } catch (e) { resolve({ ok: false, message: String(res) }); }
      });
    });
  }

  /* ---------- stash (newest first) ---------- */
  var stash = [], listeners = [];
  try { stash = JSON.parse(lsGet(STASH_KEY) || "[]") || []; } catch (e) { stash = []; }
  if (!(stash instanceof Array)) { stash = []; }
  function saveStash() { lsSet(STASH_KEY, JSON.stringify(stash)); }
  function sigOf(e) { return e.compId + "|" + e.layerIndex + "|" + e.fx.map(function (f) { return f.n; }).join("\u0001"); }
  var skip = {};                                              // unticked effects (in memory): sigOf(entry) + "|" + index
  function pickOf(e) {
    var s = sigOf(e), out = [], i;
    for (i = 0; i < e.fx.length; i++) { if (!skip[s + "|" + i]) { out.push(i); } }
    return out;
  }
  function addEntry(e) {
    var s = sigOf(e), i;
    for (i = 0; i < e.fx.length; i++) { delete skip[s + "|" + i]; }          // a fresh copy starts fully ticked
    stash = stash.filter(function (x) { return sigOf(x) !== s; });
    stash.unshift(e);
    if (stash.length > MAX) { stash.length = MAX; }
    saveStash(); notify();
  }
  function notify() {
    listeners = listeners.filter(function (l) { return !l.node || document.body.contains(l.node); });
    listeners.forEach(function (l) { try { l.fn(); } catch (e) { } });
  }
  function onChange(node, fn) { listeners.push({ node: node, fn: fn }); }
  function labelOf(e) { return e.fx.map(function (f) { return f.n; }).join(" + "); }
  function subOf(e) { return plural(e.fx.length) + " from \u201c" + e.layerName + "\u201d"; }
  function getMode() { return lsGet(MODE_KEY) === "replace" ? "replace" : "add"; }

  /* ---------- actions ---------- */
  function copy(mode) {
    return call("FX_copy", [mode]).then(function (res) {
      if (res && res.ok && res.data && res.data.fx) { addEntry(res.data); }
      return res;
    });
  }
  function paste(idx) {
    var e = stash[idx];
    if (!e) { return Promise.resolve({ ok: false, message: "Nothing saved yet." }); }
    var pick = pickOf(e);
    if (!pick.length) { return Promise.resolve({ ok: false, message: "Tick at least one effect to paste." }); }
    return call("FX_paste", [e, getMode(), idx === 0, pick]);
  }

  /* ---------- island: violet dot + "Effects" tab (js/mt-island.js owns the capsule, this file owns the state and the tab's content) ---------- */
  var vw, aEl, bEl, btnEl, hintEl, state = "off", peek = null, curSig = "", dismissedSig = "", savedSig = "", pending = false;
  var busy = false, msgText = "", msgT = 0, offT = 0, lastPaint = "", inflight = false, fails = 0, pollT = 0;
  var CHECK = '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  var HINT = {
    none: "Select an effect in the timeline to save it.",
    sel: "Save, then select the destination layer.",
    saved: "Select a layer, then Paste. Closes when you move away."
  };

  function isl() { return window.MTIsland || null; }
  function islandOn() { var I = isl(); return !!(I && I.isEnabled && I.isEnabled()); }

  function build() {
    if (vw) { return; }
    var I = isl(), host = I && I.fxHost ? I.fxHost() : null;
    if (!host) { return; }
    vw = el("div", "fxv"); vw.setAttribute("data-fx", "none");
    vw.innerHTML = '<div class="fxv-row"><span class="fxv-badge">fx</span><span class="fxv-lab" aria-live="polite"><span class="fxv-a"></span><span class="fxv-b"></span></span>' +
      '<button type="button" class="fxv-btn"><span class="fxv-sa">Save</span><span class="fxv-sb">Paste</span></button></div><p class="fxv-hint"></p>';
    aEl = vw.querySelector(".fxv-a"); bEl = vw.querySelector(".fxv-b"); btnEl = vw.querySelector(".fxv-btn"); hintEl = vw.querySelector(".fxv-hint");
    host.appendChild(vw);
    btnEl.addEventListener("click", function () { if (state === "saved") { doPaste(0); } else if (state === "sel") { doSave(); } });
    document.addEventListener("keydown", function (e) {
      if (!(e.ctrlKey || e.metaKey) || e.shiftKey || e.altKey) { return; }
      var k = e.key, t = e.target, tag = t && t.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || (t && t.isContentEditable)) { return; }
      if ((k === "v" || k === "V") && state === "saved") { doPaste(0); return; }
      if ((k === "c" || k === "C") && state === "sel") {
        var sel = window.getSelection ? String(window.getSelection()) : "";
        if (!sel) { doSave(); }
      }
    });
  }

  function paintView() {
    if (!vw) { return; }
    var m = state === "off" ? "none" : state, e0 = stash[0], a, b = "", hint = msgText || HINT[m], dis = busy || m === "none", sig;
    if (m === "none") { a = "No effect selected"; }
    else if (m === "saved") { a = e0 ? labelOf(e0) : ""; b = e0 ? plural(e0.fx.length) + " saved" : ""; }
    else { a = peek && peek.names ? peek.names.join(", ") : ""; }
    sig = [m, a, b, hint, dis, busy].join("\u0001");
    if (sig === lastPaint) { return; }                                        // the poll repaints nothing when nothing changed
    lastPaint = sig;
    vw.setAttribute("data-fx", m);
    if (aEl.textContent !== a) { aEl.textContent = a; }
    if (m === "saved") { bEl.innerHTML = '<span class="fxv-ok">' + CHECK + "</span>" + b; }
    hintEl.textContent = hint; hintEl.classList.toggle("is-error", !!msgText);
    btnEl.disabled = dis; btnEl.classList.toggle("is-busy", busy);
    var I = isl(); if (I && I.fxChanged) { I.fxChanged(); }
  }

  // what the island should show: effects selected = "sel" (Save); nothing selected but a save waits for its Paste = "saved"; otherwise "off" (no dot)
  function wanted() {
    var selNow = curSig && curSig !== dismissedSig && !(pending && curSig === savedSig);
    return selNow ? "sel" : (pending ? "saved" : "off");
  }
  function sync() {
    build();
    var m = wanted(), I = isl();
    if (m !== state) {
      state = m;
      if (I && I.fxDot) { I.fxDot(m !== "off"); }
      if (offT) { clearTimeout(offT); offT = 0; }
      if (m === "off") { offT = setTimeout(function () { offT = 0; if (state === "off") { paintView(); } }, 520); return; }   // the island fades out first, then the tab resets
    }
    paintView();
  }
  function say(res) {
    msgText = (res && res.message) || "Something went wrong.";
    if (msgT) { clearTimeout(msgT); }
    msgT = setTimeout(function () { msgT = 0; msgText = ""; paintView(); }, 4200);
    paintView();
  }

  function doSave() {
    if (busy || state !== "sel") { return; }
    busy = true; paintView();
    copy("sel").then(function (res) {
      busy = false;
      if (res && res.ok) { pending = true; savedSig = curSig; msgText = ""; sync(); } else { say(res); }
    });
  }
  function doPaste(idx) {
    if (busy) { return; }
    busy = true; paintView();
    paste(idx).then(function (res) {
      busy = false;
      if (res && res.ok) {
        pending = false; dismissedSig = curSig; msgText = "";
        try { window.__MT.toast((res && res.message) || "Pasted.", false); } catch (e) { }
        var I = isl(); if (I && I.fxClose) { I.fxClose(); }
        sync();
      } else { say(res); }
    });
  }

  /* ---------- poll: which effects are selected? ---------- */
  function onPeek(d) {
    peek = d;
    var sig = d && d.count > 0 ? (d.layer + "|" + d.names.join("\u0001")) : "";
    if (sig !== curSig) { curSig = sig; if (sig !== dismissedSig) { dismissedSig = ""; } }
    sync();
  }
  function schedule() { if (!pollT) { pollT = setTimeout(tick, fails > 3 ? 4000 : POLL_MS); } }
  window.addEventListener("mt-motion-state", function () { if (!window.__mtMoving && pollT) { clearTimeout(pollT); pollT = 0; tick(); } });   // pointer left the panel: peek now
  function tick() {
    pollT = 0;
    /* fixCursor-H: every host call (FX_peek) makes After Effects reset the mouse cursor (hand -> arrow). No call while the pointer is in the panel;
       the poll resumes (with one immediate peek) when the pointer leaves it. */
    if (window.__mtMoving || !chipOn() || !islandOn() || document.hidden || !cs || inflight) { schedule(); return; }
    inflight = true;
    call("FX_peek", []).then(function (res) {
      inflight = false;
      if (res && res.ok && res.data) { fails = 0; onPeek(res.data); } else { fails++; }
      schedule();
    });
  }

  /* ---------- Easy Layer section ---------- */
  var COPY_ICO = '<path d="M9 9h10v10H9z"/><path d="M5 15V5h10"/>';
  var PASTE_ICO = '<path d="M9 4h6v3H9z"/><path d="M7 5.5H6v14h12v-14h-1"/><path d="M9 12h6M9 15.5h4"/>';
  function tile(act, label, icon) {
    return '<button type="button" class="flip-btn" data-act="' + act + '" title="' + label + '" aria-label="' + label + '">' +
      '<span class="align-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + icon + '</svg></span>' +
      '<span class="align-text">' + label + '</span></button>';
  }
  function renderSection(h) {
    h = h || {};
    var wrap = el("div", "el-fx");
    wrap.innerHTML = '<button type="button" class="el-fx-head" aria-expanded="true"><span class="el-fx-title">Copy Effects</span>' +
      '<svg class="el-fx-chev" viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg></button>' +
      '<div class="el-fx-body"><div class="flip-grid">' + tile("copy", "Copy from layer", COPY_ICO) + tile("paste", "Paste to layer", PASTE_ICO) + '</div>' +
      '<div class="el-fx-mode"><span class="el-fx-mlabel">Paste mode</span>' +
      '<div class="el-fx-seg" role="radiogroup" aria-label="Paste mode">' +
      '<button type="button" role="radio" data-mode="add">Add</button>' +
      '<button type="button" role="radio" data-mode="replace">Replace all</button></div></div>' +
      '<p class="el-fx-from"></p><div class="el-fx-list"></div></div>';
    // Collapsible box. The state is remembered per tab (mtx.fxBox.<key>); h.collapsed = the default for a tab that has no saved state.
    var head = wrap.querySelector(".el-fx-head"), boxKey = "mtx.fxBox." + (h.key || "default"), saved = lsGet(boxKey);
    function setOpen(o, remember) {
      wrap.classList.toggle("is-collapsed", !o); head.setAttribute("aria-expanded", o ? "true" : "false");
      if (remember) { lsSet(boxKey, o ? "0" : "1"); }
    }
    setOpen(saved === null ? !h.collapsed : saved === "0", false);
    head.addEventListener("click", function () { setOpen(wrap.classList.contains("is-collapsed"), true); });
    var from = wrap.querySelector(".el-fx-from"), list = wrap.querySelector(".el-fx-list"), segBtns = wrap.querySelectorAll(".el-fx-seg button");
    function paint() {
      Array.prototype.forEach.call(segBtns, function (b) {
        var on = b.getAttribute("data-mode") === getMode();
        b.classList.toggle("is-on", on); b.setAttribute("aria-checked", on ? "true" : "false");
      });
      var e = stash[0];
      list.innerHTML = "";
      if (!e) { from.textContent = "Nothing copied yet."; return; }
      from.textContent = "Paste these effects, from \u201c" + e.layerName + "\u201d:";
      var sg = sigOf(e);
      e.fx.forEach(function (f, i) {
        var row = el("label", "el-fx-row"), cb = el("input"), box = el("span", "el-fx-box"), nm = el("span", "el-fx-name");
        cb.type = "checkbox"; cb.checked = !skip[sg + "|" + i];
        cb.addEventListener("change", function () { if (cb.checked) { delete skip[sg + "|" + i]; } else { skip[sg + "|" + i] = true; } });
        nm.textContent = f.n;
        row.appendChild(cb); row.appendChild(box); row.appendChild(nm); list.appendChild(row);
      });
    }
    Array.prototype.forEach.call(segBtns, function (b) {
      b.addEventListener("click", function () { lsSet(MODE_KEY, b.getAttribute("data-mode")); paint(); });
    });
    function report(btn, res) {
      if (h.flash) { h.flash(btn, !!(res && res.ok)); } else { btn.classList.remove("is-pending"); }
      var m = (res && res.message) || (res && res.ok ? "Done." : "Something went wrong.");
      if (h.toast) { h.toast(m, !(res && res.ok)); }
    }
    Array.prototype.forEach.call(wrap.querySelectorAll(".flip-btn"), function (btn) {
      btn.addEventListener("click", function () {
        if (btn.classList.contains("is-pending")) { return; }
        btn.classList.add("is-pending");
        var p = btn.getAttribute("data-act") === "copy" ? copy("layer") : paste(0);
        p.then(function (res) { report(btn, res); });
      });
    });
    onChange(wrap, paint);
    paint();
    return wrap;
  }

  window.MTFx = { renderSection: renderSection, copy: copy, paste: paste, list: function () { return stash.slice(); } };

  function init() { build(); schedule(); }
  if (document.readyState === "loading") { document.addEventListener("DOMContentLoaded", init); } else { init(); }
})();
