/* NeuCurve - nc-quick.js (v1)   Favorites + preset keys for the preset grid.
   - Long-press (about 0.45 s) a preset to add / remove it from Favorites (same gesture as Multi Tool's Animation Presets). A small star marks it.
   - A star button in the library tool row (left of Preset Options) shows only the favorites of the open library.
   - Window.NCQuick is used by nc-pro.js hotkeys:  next() / prev() select the neighbouring preset,  fav(n) selects favorite n and presses APPLY,
     toggleFav() adds / removes the selected preset.
   Stored in localStorage "neucurve_favs" = [{lib:"default", name:"Ease"}, ...] and "neucurve_favOnly" = "1".
   The preset grid is a Svelte component, so this file only reads and clicks its DOM (.preset-item, .preset-thumbnail, .lib-select, .apply-btn).
   Plain ES5. */
(function () {
  "use strict";
  var root = document.documentElement, KEY = "neucurve_favs", KEY_ONLY = "neucurve_favOnly", LP_MS = 450, lpTimer = 0, lpFired = false, lpStart = null, markQueued = false;

  function lsGet(k) { try { return window.localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { window.localStorage.setItem(k, v); } catch (e) { } }
  function favs() { var a; try { a = JSON.parse(lsGet(KEY) || "[]"); } catch (e) { a = []; } return Array.isArray(a) ? a : []; }
  function saveFavs(a) { lsSet(KEY, JSON.stringify(a)); }
  function libSel() { return document.querySelector(".lib-select"); }
  function lib() { var s = libSel(); return s ? s.value : "default"; }
  function items() { return Array.prototype.slice.call(document.querySelectorAll(".preset-item")); }
  function nameOf(it) {
    var t = it && it.querySelector(".preset-thumbnail"), n = it && it.querySelector(".preset-name");
    return (t && t.getAttribute("title")) || (n && n.textContent) || "";
  }
  function indexOfFav(l, name) { var a = favs(), i; for (i = 0; i < a.length; i++) { if (a[i].lib === l && a[i].name === name) { return i; } } return -1; }
  function flash(el) {
    if (!el) { return; }
    el.classList.remove("nc-hk-flash"); void el.offsetWidth; el.classList.add("nc-hk-flash");
    setTimeout(function () { el.classList.remove("nc-hk-flash"); }, 260);
  }

  // ---------- star badges + favorites-only filter ----------
  function mark() {
    markQueued = false;
    var l = lib(), list = items(), i, n;
    for (i = 0; i < list.length; i++) {
      n = nameOf(list[i]);
      list[i].classList.toggle("nc-fav", !!n && indexOfFav(l, n) >= 0);
    }
    /* filter on but this library has no favorites: keep the grid visible (CSS ignores the filter while data-nc-favempty is set) */
    if (favCount()) { if (root.hasAttribute("data-nc-favempty")) { root.removeAttribute("data-nc-favempty"); } }
    else if (!root.hasAttribute("data-nc-favempty")) { root.setAttribute("data-nc-favempty", "1"); }
    paintToggle();
  }
  function queueMark() { if (!markQueued) { markQueued = true; (window.requestAnimationFrame || setTimeout)(mark); } }
  function favCount() { var a = favs(), l = lib(), n = 0, i; for (i = 0; i < a.length; i++) { if (a[i].lib === l) { n++; } } return n; }
  function setOnly(on) { if (on) { root.setAttribute("data-nc-favonly", "1"); } else { root.removeAttribute("data-nc-favonly"); } lsSet(KEY_ONLY, on ? "1" : "0"); paintToggle(); }
  var TIP_ON = "Show all presets", TIP_OFF = "Show favorites only", TIP_EMPTY = "No favorites yet - long-press a preset to add one";
  function paintToggle() {
    var b = document.querySelector(".nc-favtoggle"); if (!b) { return; }
    var on = root.getAttribute("data-nc-favonly") === "1", tip = on ? TIP_ON : TIP_OFF;
    if (b.classList.contains("is-on") !== on) { b.classList.toggle("is-on", on); b.classList.toggle("active", on); }
    if (b.getAttribute("aria-pressed") !== (on ? "true" : "false")) { b.setAttribute("aria-pressed", on ? "true" : "false"); }
    /* the tooltip script (mt-tooltip.js) keeps the text in __mtTitle; writing the same value again would re-trigger the observer */
    if ((b.getAttribute("title") || b.__mtTitle || "") !== tip && b.getAttribute("data-nc-tip") !== tip) { b.setAttribute("data-nc-tip", tip); b.title = tip; b.setAttribute("aria-label", tip); }
  }
  /* The star lives in the library tool row (next to Preset Options), as one more .fl-tool, so it has the size, hover and accent of
     the other icons. Before nc-flow.js has built that row it waits in .lib-actions and is moved the moment the row exists. */
  function toggleHome() {
    var head = document.querySelector(".library-header"), row = head && head.querySelector(".fl-toolrow");
    if (row) { return { host: row, before: row.querySelector(".options-menu-container") }; }
    var acts = head && head.querySelector(".lib-actions");
    return acts ? { host: acts, before: acts.querySelector(".options-menu-container") } : null;
  }
  function ensureToggle() {
    var home = toggleHome(), b = document.querySelector(".nc-favtoggle");
    if (!home) { return; }
    if (!b) {
      b = document.createElement("button");
      b.type = "button"; b.className = "fl-tool nc-favtoggle"; b.title = TIP_OFF; b.setAttribute("aria-label", TIP_OFF);
      b.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" aria-hidden="true"><path d="M12 3.2l2.6 5.3 5.8.85-4.2 4.1 1 5.8L12 16.5l-5.2 2.75 1-5.8-4.2-4.1 5.8-.85z"/></svg>';
      b.addEventListener("click", function (e) {
        e.stopPropagation();
        var on = root.getAttribute("data-nc-favonly") === "1";
        if (!on && !favCount()) { flash(b); b.title = TIP_EMPTY; b.setAttribute("data-nc-tip", TIP_EMPTY); return; }   /* nothing to show: do not blank the grid */
        setOnly(!on);
      });
    }
    /* move only when the place is wrong - a same-place insert still fires the MutationObserver (endless loop) */
    if (b.parentNode !== home.host || (home.before ? b.nextElementSibling !== home.before : b.nextElementSibling)) {
      if (home.before && home.before.parentNode === home.host) { home.host.insertBefore(b, home.before); } else { home.host.appendChild(b); }
    }
    paintToggle();
  }

  // ---------- favorites ----------
  function toggleFavFor(it) {
    var n = nameOf(it), l = lib(), a = favs(), i;
    if (!n) { return false; }
    i = indexOfFav(l, n);
    if (i >= 0) { a.splice(i, 1); } else { a.push({ lib: l, name: n }); }
    saveFavs(a); mark();
    it.classList.remove("nc-fav-pop"); void it.offsetWidth; it.classList.add("nc-fav-pop");
    setTimeout(function () { it.classList.remove("nc-fav-pop"); }, 260);
    return true;
  }
  function selectedItem() { return document.querySelector(".preset-item.selected"); }
  function toggleFav() { var it = selectedItem(); if (it) { toggleFavFor(it); } }

  // ---------- select / apply ----------
  function pick(it) {
    var th = it && it.querySelector(".preset-thumbnail");
    if (!th) { return false; }
    th.click(); flash(it);
    try { it.scrollIntoView({ block: "nearest" }); } catch (e) { }
    return true;
  }
  function visible(list) { return list.filter(function (it) { return it.offsetWidth > 0 && it.offsetHeight > 0; }); }
  function step(d) {
    var list = visible(items()), cur = selectedItem(), i = list.indexOf(cur);
    if (!list.length) { return; }
    i = (i < 0) ? (d > 0 ? 0 : list.length - 1) : (i + d + list.length) % list.length;
    pick(list[i]);
  }
  function pressApply() { var b = document.querySelector(".apply-btn"); if (b && !b.disabled) { flash(b); b.click(); } }
  function findByName(name) { var list = items(), i; for (i = 0; i < list.length; i++) { if (nameOf(list[i]) === name) { return list[i]; } } return null; }
  function fav(n) {
    var f = favs()[n - 1], s, it;
    if (!f) { return; }
    function go() { it = findByName(f.name); if (it && pick(it)) { setTimeout(pressApply, 90); } }
    s = libSel();
    if (s && s.value !== f.lib) {
      s.value = f.lib;
      s.dispatchEvent(new Event("change", { bubbles: true }));
      s.dispatchEvent(new Event("input", { bubbles: true }));
      setTimeout(go, 160);
    } else { go(); }
  }

  // ---------- long press ----------
  function itemOf(t) { while (t && t.nodeType === 1) { if (t.classList && t.classList.contains("preset-item")) { return t; } t = t.parentNode; } return null; }
  document.addEventListener("pointerdown", function (e) {
    var it = itemOf(e.target); if (!it || e.button !== 0) { return; }
    lpFired = false; lpStart = { x: e.clientX, y: e.clientY };
    clearTimeout(lpTimer);
    lpTimer = setTimeout(function () { lpFired = toggleFavFor(it); }, LP_MS);
  }, true);
  document.addEventListener("pointermove", function (e) {
    if (lpStart && (Math.abs(e.clientX - lpStart.x) > 6 || Math.abs(e.clientY - lpStart.y) > 6)) { clearTimeout(lpTimer); lpStart = null; }
  }, true);
  function endPress() { clearTimeout(lpTimer); lpStart = null; }
  document.addEventListener("pointerup", endPress, true);
  document.addEventListener("pointercancel", endPress, true);
  document.addEventListener("click", function (e) {            // the click that ends a long press must not also select the preset
    if (lpFired) { lpFired = false; e.stopPropagation(); e.preventDefault(); }
  }, true);

  // ---------- boot: the grid is built by Svelte after load and rebuilt when the library or the list changes ----------
  function boot() {
    if (lsGet(KEY_ONLY) === "1") { root.setAttribute("data-nc-favonly", "1"); }
    ensureToggle(); mark();
    try { new MutationObserver(function () { ensureToggle(); queueMark(); }).observe(document.body, { childList: true, subtree: true }); } catch (e) { }
    document.addEventListener("change", function (e) { if (e.target && e.target.classList && e.target.classList.contains("lib-select")) { setTimeout(queueMark, 60); } }, true);
  }
  if (document.readyState === "loading") { document.addEventListener("DOMContentLoaded", boot); } else { boot(); }

  window.NCQuick = { next: function () { step(1); }, prev: function () { step(-1); }, fav: fav, toggleFav: toggleFav, favs: favs };
})();
