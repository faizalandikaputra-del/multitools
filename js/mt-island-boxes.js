/* Multi Tool - mt-island-boxes.js (v1: BOXES IN THE ISLAND)
   Every box (".ta-group" card, built by PanelRefinements.groupifyTaSections) of a tab listed in PIN_TABS can be dragged by its header onto the
   dynamic island. The box MOVES (it is not copied): the live element, with all its handlers, lives in the island's Pin view, and the tab shows a
   small "Pinned" row with a "Bring back" button in its place. The island x button, "Bring back", turning the island off in Settings
   (boxes return to the tab) and closing the panel (the list is remembered, key mtx.island.boxes) all keep the box usable.
   Why a shim: the tab modules read their inputs with wrap.querySelector("#id") on the element they built. Once a box has left that element the
   lookup would fail, so every tab root gets a querySelector / querySelectorAll that also searches the boxes that were moved away.
   Hooks:  main.js renderTab() -> MTBoxes.afterRender(tabId, built)      (after groupifyTaSections, before FormState.restore)
           main.js __MT.renderDetached(tabId) -> used once at start to rebuild the remembered boxes
           js/mt-island.js -> MTIsland.boxHost(), MTIsland.boxesChanged(n), MTIsland.isEnabled(); drop of "text/mt-box" calls MTBoxes.pin(key)
   Chromium-74 safe (no optional chaining, no flex gap). */
(function () {
  "use strict";
  var KEY = "mtx.island.boxes", MIME = "text/mt-box";
  var PIN_TABS = { "tools": 1 };                      // add a tab id here to make its boxes movable (its render() must keep using the element it returned)
  var pinned = [], hosted = {}, known = {}, started = false;

  function load() { try { var a = JSON.parse(localStorage.getItem(KEY) || "[]"); pinned = (Object.prototype.toString.call(a) === "[object Array]") ? a.filter(function (x) { return typeof x === "string"; }) : []; } catch (e) { pinned = []; } }
  function save() { try { if (pinned.length) { localStorage.setItem(KEY, JSON.stringify(pinned)); } else { localStorage.removeItem(KEY); } } catch (e) { } }
  function isle() { return window.MTIsland || null; }
  function enabled() { var i = isle(); return !!(i && i.isEnabled && i.isEnabled()); }
  function toast(m, bad) { try { window.__MT.toast(m, !!bad); } catch (e) { } }
  function el(tag, cls, html) { var e = document.createElement(tag); if (cls) { e.className = cls; } if (html) { e.innerHTML = html; } return e; }
  function count() { var n = 0, k; for (k in hosted) { if (hosted.hasOwnProperty(k)) { n++; } } return n; }
  function esc(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }

  function keyOf(tabId, group) {
    var l = group.querySelector(".ta-group-label"), t = l ? l.textContent : "";
    return tabId + "::" + t.replace(/\s+/g, " ").trim().replace(/\s*\(\d+\)\s*$/, "");
  }
  function labelOf(key) { return key.substring(key.indexOf("::") + 2); }
  function tabOf(key) { return key.substring(0, key.indexOf("::")); }

  /* ---- shim: a tab root can still find the elements of boxes that were moved out of it ---- */
  function shim(root) {
    if (!root || root.__mtBoxShim) { return; }
    root.__mtBoxShim = 1;
    var q = root.querySelector, qa = root.querySelectorAll;
    root.querySelector = function (s) {
      var r = q.call(this, s), k, g;
      if (r) { return r; }
      for (k in known) { if (!known.hasOwnProperty(k)) { continue; } g = known[k]; if (this.contains(g)) { continue; } if (g.matches(s)) { return g; } r = q.call(g, s); if (r) { return r; } }
      return null;
    };
    root.querySelectorAll = function (s) {
      var out = Array.prototype.slice.call(qa.call(this, s)), k, g;
      for (k in known) { if (!known.hasOwnProperty(k)) { continue; } g = known[k]; if (this.contains(g)) { continue; } if (g.matches(s)) { out.push(g); } out = out.concat(Array.prototype.slice.call(g.querySelectorAll(s))); }
      return out;
    };
  }

  /* ---- drag source: the header of every box ---- */
  function decorate(group, key) {
    var head = group.querySelector(".ta-group-head");
    group.setAttribute("data-box-key", key);
    if (!head || head.__mtDrag) { return; }
    head.__mtDrag = 1; head.draggable = true;
    head.addEventListener("dragstart", function (e) {
      try { e.dataTransfer.setData(MIME, key); e.dataTransfer.setData("text/plain", labelOf(key)); e.dataTransfer.effectAllowed = "move"; } catch (er) { }
      document.documentElement.classList.add("mt-dragging-tool");
    });
    head.addEventListener("dragend", function () { document.documentElement.classList.remove("mt-dragging-tool"); });
  }

  /* ---- the row that stays in the tab ---- */
  function placeholder(key) {
    var p = el("div", "mi-moved"), b = el("button", "mi-moved-back", "Bring back");
    p.setAttribute("data-box-moved", key);
    p.appendChild(el("span", "mi-moved-label", esc(labelOf(key))));
    p.appendChild(el("span", "mi-moved-note", "Pinned"));
    b.type = "button"; b.setAttribute("aria-label", "Bring " + labelOf(key) + " back to the tab");
    b.addEventListener("click", function () { unpin(key); });
    p.appendChild(b);
    return p;
  }
  function findPlaceholder(key) { var all = document.querySelectorAll(".mi-moved[data-box-moved]"), i; for (i = 0; i < all.length; i++) { if (all[i].getAttribute("data-box-moved") === key) { return all[i]; } } return null; }
  function findGroup(key) { var all = document.querySelectorAll(".ta-group[data-box-key]"), i; for (i = 0; i < all.length; i++) { if (all[i].getAttribute("data-box-key") === key) { return all[i]; } } return null; }

  /* ---- island side ---- */
  function host(group, key) {
    var i = isle(), box, rm, h = i && i.boxHost ? i.boxHost() : null;
    if (!h) { return false; }
    box = el("div", "mi-box"); rm = el("button", "mi-boxrm", '<svg viewBox="0 0 24 24" width="10" height="10" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round"/></svg>');
    rm.type = "button"; rm.title = "Bring back to the tab"; rm.setAttribute("aria-label", "Bring " + labelOf(key) + " back to the tab");
    rm.addEventListener("click", function (e) { e.stopPropagation(); unpin(key); });
    box.appendChild(group); box.appendChild(rm);
    box.addEventListener("keydown", function (e) { if (e.key !== "Escape") { e.stopPropagation(); } });      // typing in a field must not trigger panel shortcuts
    h.appendChild(box);
    known[key] = group; hosted[key] = box;
    if (i.boxesChanged) { i.boxesChanged(count()); }
    return true;
  }

  function pin(key) {
    var g, ph, i = isle();
    if (!key || key.indexOf("::") < 0) { return false; }
    if (!enabled()) { toast("Turn on the dynamic island in Settings first.", true); return false; }
    if (hosted[key]) { return false; }
    g = findGroup(key);
    if (!g) { toast("That box is not on screen.", true); return false; }
    ph = placeholder(key);
    g.parentNode.replaceChild(ph, g);
    if (!host(g, key)) { ph.parentNode.replaceChild(g, ph); return false; }
    if (pinned.indexOf(key) < 0) { pinned.push(key); save(); }
    if (i && i.focusBoxes) { i.focusBoxes(); }
    return true;
  }

  function unpin(key) {
    var box = hosted[key], g = box && box.firstChild, ph = findPlaceholder(key), at = pinned.indexOf(key);
    if (at >= 0) { pinned.splice(at, 1); save(); }
    if (!box) { if (ph && ph.parentNode) { ph.parentNode.removeChild(ph); } return; }
    delete hosted[key];
    if (ph && ph.parentNode) { ph.parentNode.replaceChild(g, ph); } else if (box.parentNode) { box.parentNode.removeChild(box); }
    if (box.parentNode) { box.parentNode.removeChild(box); }
    var i = isle(); if (i && i.boxesChanged) { i.boxesChanged(count()); }
  }

  /* island turned off: every box goes back to its tab (the remembered list stays, so turning it on again moves them back) */
  function sync() {
    var k, all, i, key;
    if (!enabled()) { for (k in hosted) { if (hosted.hasOwnProperty(k)) { returnToTab(k); } } return; }
    all = document.querySelectorAll(".ta-group[data-box-key]");                                    // turned on again: boxes that are on screen and remembered go back in
    for (i = 0; i < all.length; i++) {
      key = all[i].getAttribute("data-box-key");
      if (pinned.indexOf(key) >= 0 && !hosted[key]) { var ph = placeholder(key); all[i].parentNode.replaceChild(ph, all[i]); if (!host(all[i], key)) { ph.parentNode.replaceChild(all[i], ph); } }
    }
  }
  function returnToTab(key) {
    var box = hosted[key], g = box && box.firstChild, ph = findPlaceholder(key);
    if (!box) { return; }
    delete hosted[key];
    if (ph && ph.parentNode) { ph.parentNode.replaceChild(g, ph); }
    if (box.parentNode) { box.parentNode.removeChild(box); }
    var i = isle(); if (i && i.boxesChanged) { i.boxesChanged(count()); }
  }

  /* ---- called for every tab render (and once for a detached render at start) ---- */
  function afterRender(tabId, built) {
    var groups, i, g, key, on;
    if (!PIN_TABS[tabId] || !built) { return; }
    shim(built);
    groups = Element.prototype.querySelectorAll.call(built, ":scope > .ta-group");
    on = enabled();
    for (i = 0; i < groups.length; i++) {
      g = groups[i]; key = keyOf(tabId, g); decorate(g, key);
      if (!on || pinned.indexOf(key) < 0) { continue; }
      if (hosted[key]) { g.parentNode.replaceChild(placeholder(key), g); continue; }              // the live one is already in the island: this fresh copy is dropped
      g.parentNode.replaceChild(placeholder(key), g); host(g, key);                               // first time since start: this copy becomes the live one
    }
  }

  function start() {
    var t, ids = [], k, seen = {};
    if (started) { return; } started = true; load();
    if (!pinned.length) { return; }
    pinned.forEach(function (p) { var id = tabOf(p); if (!seen[id]) { seen[id] = 1; ids.push(id); } });
    ids.forEach(function (id) {                                                                    // rebuild the remembered boxes without showing the tab
      if (window.__MT && window.__MT.renderDetached) { try { var b = window.__MT.renderDetached(id); if (b) { afterRender(id, b); } } catch (e) { } }
    });
  }

  window.MTBoxes = { pin: pin, unpin: unpin, afterRender: afterRender, sync: sync, count: count, mime: MIME };
  function boot() { setTimeout(start, 700); }                                                      // after main.js and mt-island.js have built their UI
  if (document.readyState === "complete") { boot(); } else { window.addEventListener("load", boot); }
})();
