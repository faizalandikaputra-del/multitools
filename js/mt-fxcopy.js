/* Multi Tool - mt-fxcopy.js (v1)  -  Copy Effects
   1. CHIP under the dynamic island: while one or more effects are selected in the After Effects timeline the chip
      shows their names and a "Save" button (Ctrl+C does the same while the panel has focus). After saving it turns
      into "N effects saved" + "Paste". The "fx" badge opens a tray with the last saved stacks.
   2. EASY LAYER section (MTFx.renderSection, called from showTab in main.js): Copy from layer / Paste to layer,
      paste mode (Add / Replace all) and the last saved stack.
   After Effects cannot be asked for its clipboard and never sends Ctrl+C to a panel that is not focused, so the
   "detection" is a light poll (host.jsx FX_peek, ~0.7 s, only while the panel is visible). Copy / Paste themselves use
   After Effects' own Copy / Paste commands (host.jsx FX_copy / FX_paste), so Curves, Levels, keyframes and
   expressions travel intact. The stash keeps only a small record per entry (localStorage mtx.fxStash, max 8).
   READY state: with nothing but layers selected and something saved, the chip stays as "Paste <effects>" (x hides it until the next copy
   or until the layer selection is cleared), so one chip does the whole job: select effects > Save, select layers > Paste.
   Off switch: localStorage mtx.fxChip = "0" (chip + polling stop; the Easy Layer section keeps working). */
(function () {
  "use strict";
  var STASH_KEY = "mtx.fxStash", MODE_KEY = "mtx.fxPasteMode", ON_KEY = "mtx.fxChip";
  var MAX = 8, POLL_MS = 700, SAVED_MS = 7000, MSG_MS = 2600;

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
    readyOff = false;
    saveStash(); notify();
  }
  function notify() {
    listeners = listeners.filter(function (l) { return !l.node || document.body.contains(l.node); });
    listeners.forEach(function (l) { try { l.fn(); } catch (e) { } });
    paintTray();
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

  /* ---------- chip ---------- */
  var chip, txtEl, btnEl, icoEl, tray, trayList, trayOpen = false;
  var state = "off", peek = null, curSig = "", dismissedSig = "", savedSig = "", readyOff = false, closeEl;
  var inflight = false, fails = 0, pollT = 0, timer = 0;
  var CHECK = '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  function build() {
    if (chip || !document.body) { return; }
    chip = el("div", "mt-fxchip"); chip.setAttribute("role", "group"); chip.setAttribute("aria-label", "Copy effects");
    icoEl = el("button", "fxc-ico", "fx"); icoEl.type = "button"; icoEl.setAttribute("aria-label", "Saved effects"); icoEl.setAttribute("aria-expanded", "false");
    txtEl = el("span", "fxc-txt"); txtEl.setAttribute("aria-live", "polite");
    btnEl = el("button", "fxc-btn", "Save"); btnEl.type = "button";
    closeEl = el("button", "fxc-x", '<svg viewBox="0 0 24 24" width="12" height="12" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>');
    closeEl.type = "button"; closeEl.setAttribute("aria-label", "Hide"); closeEl.hidden = true;
    chip.appendChild(icoEl); chip.appendChild(txtEl); chip.appendChild(btnEl); chip.appendChild(closeEl);
    tray = el("div", "mt-fxtray"); tray.setAttribute("aria-label", "Saved effects");
    trayList = el("div", "fxt-list"); tray.appendChild(el("div", "fxt-head", "Saved effects")); tray.appendChild(trayList);
    var clr = el("button", "fxt-clear", "Clear all"); clr.type = "button";
    clr.addEventListener("click", function () { stash = []; saveStash(); notify(); });
    tray.appendChild(clr);
    document.body.appendChild(chip); document.body.appendChild(tray);

    btnEl.addEventListener("click", function () { if (state === "sel") { doSave(); } else if (state === "saved" || state === "ready") { doPaste(0); } });
    closeEl.addEventListener("click", function () { readyOff = true; setState("off"); });
    icoEl.addEventListener("click", function () { setTray(!trayOpen); });
    document.addEventListener("pointerdown", function (e) {
      if (trayOpen && !tray.contains(e.target) && !icoEl.contains(e.target)) { setTray(false); }
    }, true);
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && trayOpen) { setTray(false); return; }
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && (e.key === "v" || e.key === "V") && (state === "ready" || state === "saved")) {
        var tv = e.target, tagv = tv && tv.tagName;
        if (tagv === "INPUT" || tagv === "TEXTAREA" || (tv && tv.isContentEditable)) { return; }
        doPaste(0); return;
      }
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && (e.key === "c" || e.key === "C") && state === "sel") {
        var t = e.target, tag = t && t.tagName;
        var sel = window.getSelection ? String(window.getSelection()) : "";
        if (tag === "INPUT" || tag === "TEXTAREA" || (t && t.isContentEditable) || sel) { return; }
        doSave();
      }
    });
    document.addEventListener("transitionend", function (e) { if (e.target && e.target.id === "mt-island") { place(); } });
    window.addEventListener("resize", place);
  }

  function place() {
    if (!chip) { return; }
    var isl = document.getElementById("mt-island"), top = 8;
    if (isl && isl.classList.contains("is-on")) { top = Math.round(isl.getBoundingClientRect().bottom + 8); }
    chip.style.top = top + "px";
    tray.style.top = (top + 46) + "px";
  }

  function clearTimer() { if (timer) { clearTimeout(timer); timer = 0; } }
  function setState(s, text, ms) {
    build(); if (!chip) { return; }
    clearTimer();
    state = s;
    if (s !== "off") { place(); }
    chip.classList.toggle("is-on", s !== "off");
    chip.setAttribute("data-state", s);
    closeEl.hidden = (s !== "ready");
    if (s === "off") { setTray(false); return; }
    if (s === "ready") {
      txtEl.textContent = stash[0] ? labelOf(stash[0]) : "";
      btnEl.textContent = "Paste"; btnEl.hidden = false; btnEl.disabled = false;
    } else if (s === "sel") {
      txtEl.textContent = peek && peek.names ? peek.names.join(", ") : "";
      btnEl.textContent = "Save"; btnEl.hidden = false; btnEl.disabled = false;
    } else if (s === "saved") {
      txtEl.innerHTML = '<span class="fxc-ok">' + CHECK + "</span>" + plural(stash[0] ? stash[0].fx.length : 0) + " saved";
      btnEl.textContent = "Paste"; btnEl.hidden = false; btnEl.disabled = false;
      timer = setTimeout(function () { dismissedSig = curSig; setState("off"); }, SAVED_MS);
    } else if (s === "msg") {
      txtEl.textContent = text || "";
      btnEl.hidden = true;
      timer = setTimeout(function () { dismissedSig = curSig; setState("off"); }, ms || MSG_MS);
    }
  }
  function say(res) {
    var text = (res && res.message) || (res && res.ok ? "Done." : "Something went wrong.");
    setState("msg", text, res && res.ok ? MSG_MS : 4200);
    chip.classList.toggle("is-error", !(res && res.ok));
  }

  function doSave() {
    if (btnEl.disabled) { return; }
    btnEl.disabled = true;
    copy("sel").then(function (res) {
      if (res && res.ok) { savedSig = curSig; setState("saved"); } else { say(res); }
    });
  }
  function doPaste(idx) {
    if (btnEl) { btnEl.disabled = true; }
    setTray(false);
    paste(idx).then(function (res) { say(res); });
  }

  /* ---------- tray ---------- */
  function setTray(o) {
    trayOpen = !!o && !!stash.length; if (!tray) { return; }
    tray.classList.toggle("is-on", trayOpen);
    icoEl.setAttribute("aria-expanded", trayOpen ? "true" : "false");
    if (trayOpen) { place(); }
  }
  function paintTray() {
    if (!trayList) { return; }
    trayList.innerHTML = "";
    stash.forEach(function (e, i) {
      var row = el("div", "fxt-row");
      var badge = el("span", "fxc-ico fxt-ico", "fx");
      var info = el("span", "fxt-info");
      var l = el("span", "fxt-name"); l.textContent = labelOf(e);
      var s = el("span", "fxt-sub"); s.textContent = subOf(e);
      info.appendChild(l); info.appendChild(s);
      var b = el("button", "fxc-btn", "Paste"); b.type = "button";
      b.addEventListener("click", function () { doPaste(i); });
      row.appendChild(badge); row.appendChild(info); row.appendChild(b);
      trayList.appendChild(row);
    });
    if (!stash.length) { setTray(false); }
  }

  /* ---------- poll: which effects are selected? ---------- */
  function onPeek(d) {
    peek = d;
    var sig = d && d.count > 0 ? (d.layer + "|" + d.names.join("\u0001")) : "";
    var layers = d ? (d.layers || 0) : 0;
    if (sig !== curSig) { curSig = sig; if (sig !== dismissedSig) { dismissedSig = ""; } }
    if (!layers && !sig) { readyOff = false; }                                   // nothing selected: the x is forgotten
    if (!sig) {
      dismissedSig = "";
      if (state === "sel") { setState("off"); }
      var ready = layers > 0 && stash.length > 0 && !readyOff;
      if (ready && state === "off") { setState("ready"); }
      else if (ready && state === "ready") { txtEl.textContent = labelOf(stash[0]); }
      else if (!ready && state === "ready") { setState("off"); }
      return;
    }
    if (state === "off" || state === "ready") { if (sig !== dismissedSig) { setState("sel"); } else if (state === "ready") { setState("off"); } }
    else if (state === "saved") { if (sig !== savedSig) { setState("sel"); } }
    else if (state === "sel") { txtEl.textContent = d.names.join(", "); }
  }
  function schedule() { if (!pollT) { pollT = setTimeout(tick, fails > 3 ? 4000 : POLL_MS); } }
  function tick() {
    pollT = 0;
    if (!chipOn() || document.hidden || !cs || inflight) { schedule(); return; }
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

  function init() { build(); paintTray(); schedule(); }
  if (document.readyState === "loading") { document.addEventListener("DOMContentLoaded", init); } else { init(); }
})();
