/**
 * mt-tooltip.js - custom tooltip (name only, smooth pop) that replaces the native browser tooltip.
 * Loaded by html/index.html (main panel) AND neucurve/index.html (Curve tab / its popup windows),
 * so every tab shows the same tooltip.
 *
 * How it works
 * - On hover it takes the element's title="" text, removes the attribute (so the ugly native
 *   tooltip never shows) and gives the text back as soon as the cursor leaves. The original text
 *   stays readable as el.__mtTitle while it is borrowed.
 * - Only the NAME is shown: explanations after " - ", ":" or "(" are cut, and a few long
 *   sentences are mapped to short names (see RULES).
 * - Icon-only buttons without a title fall back to their aria-label.
 * - Appears when the cursor rests (~0.3s); moving to a neighbour button swaps instantly.
 * - Animation: transform + opacity only (GPU), no layout work. ES5 on purpose (old CEF).
 */
(function () {
  "use strict";
  if (window.__mtTipLoaded) { return; }
  window.__mtTipLoaded = true;

  var DELAY = 300;        // ms the cursor must rest before the first tooltip shows
  var WARM = 450;         // ms after hiding during which the next tooltip shows instantly
  var GAP = 9;            // px between element and tooltip
  var EDGE = 5;           // px kept free at the viewport edge

  /* Long titles -> short names. First match wins. */
  var RULES = [
    [/^Mode:\s*(Bake to Keyframes|Expression)/i, "$1"],
    [/^(Off|On):/i, "Overshoot"],
    [/^Paste expression/i, "Paste Expression"],
    [/^Create a comp-size Solid/i, "Fill Solid"],
    [/^Save the current frame as (.+)$/i, "Save as $1"],
    [/^Click again to permanently delete/i, "Confirm Delete"],
    [/^Click to copy/i, "Copy Curve"],
    [/^Auto Apply is ON/i, "Auto Apply"],
    [/^Drag to resize the graph/i, "Resize Graph"],
    [/^Save current curve as preset/i, "Save Preset"],
    [/^Contains the last used preset/i, "Last Used"],
    [/^Auto: layout/i, "Auto Layout"]
  ];

  function shorten(text) {
    var s = String(text).replace(/\s+/g, " ").replace(/^\s+|\s+$/g, "");
    var i, m;
    for (i = 0; i < RULES.length; i++) {
      m = RULES[i][0].exec(s);
      if (m) { return RULES[i][1].replace("$1", m[1] || ""); }   // whole text is replaced by the short name
    }
    m = s.search(/\s[\u2014\u2013]\s|\s-\s|:\s|\s\(/);   // " - ", " - ", ": ", " ("
    if (m > 0) { s = s.slice(0, m); }
    return s;
  }

  var tip = null, textEl = null;
  var cur = null;          // { el, text, suppressed }
  var shown = false;
  var showTimer = 0, aliveTimer = 0, hideStamp = 0;
  var mx = 0, my = 0, startX = 0, startY = 0;
  var mo = null;
  var rafId = 0, lastR = null;

  function raf(fn) { return (window.requestAnimationFrame || function (f) { return setTimeout(f, 16); })(fn); }
  function caf(id) { (window.cancelAnimationFrame || clearTimeout)(id); }

  /* While the tooltip is visible, follow its element every frame. The sidebar list scrolls smoothly
     when the tab changes (mouse wheel / click), so the icon can move after the tooltip was placed.
     If the element slides out from under the cursor the tooltip is dropped instead of lingering. */
  function track() {
    rafId = 0;
    if (!shown || !cur) { return; }
    var r = cur.el.getBoundingClientRect();
    if (!lastR || r.left !== lastR.left || r.top !== lastR.top || r.width !== lastR.width || r.height !== lastR.height) {
      lastR = { left: r.left, top: r.top, width: r.width, height: r.height };
      if (mx < r.left - 3 || mx > r.right + 3 || my < r.top - 3 || my > r.bottom + 3) { leave(); return; }
      place(cur.el);
    }
    rafId = raf(track);
  }

  function ensure() {
    if (tip || !document.body) { return !!tip; }
    tip = document.createElement("div");
    tip.className = "mt-tip";
    tip.setAttribute("role", "tooltip");
    textEl = document.createElement("span");
    textEl.className = "mt-tip-text";
    tip.appendChild(textEl);
    document.body.appendChild(tip);
    return true;
  }

  /* Walk up from the hovered node to the nearest element that has a name to show. */
  function findTarget(node) {
    var n = node, t;
    // The left navigation never shows tooltips (its expanded view shows the tab names instead).
    if (node && node.nodeType === 1 && node.closest && node.closest(".sidebar")) { return null; }
    while (n && n.nodeType === 1 && n !== document.documentElement) {
      if (n.hasAttribute && n.hasAttribute("title")) {
        t = n.getAttribute("title");
        if (t && t.replace(/\s+/g, "")) { return { el: n, raw: t }; }
      }
      if (n.__mtTitle) { return { el: n, raw: n.__mtTitle }; }      // already borrowed
      if (n.getAttribute && n.matches && n.matches('button,[role="button"],[role="tab"],a') &&
          !n.hasAttribute("title")) {
        t = n.getAttribute("aria-label");
        if (t && !(n.textContent || "").replace(/\s+/g, "") && t.length <= 40) {
          return { el: n, raw: t, aria: true };
        }
      }
      n = n.parentNode;
    }
    return null;
  }

  /* The left navigation shows no tooltip, but a title left on it would pop the NATIVE one. Remove it for good. */
  function stripSidebar(node) {
    var n = node;
    if (!(node && node.nodeType === 1 && node.closest && node.closest(".sidebar"))) { return; }
    while (n && n.nodeType === 1 && n !== document.documentElement) {
      if (n.hasAttribute && n.hasAttribute("title")) {
        n.setAttribute("data-mt-title", n.getAttribute("title"));
        n.removeAttribute("title");
      }
      n = n.parentNode;
    }
  }

  function restore(el) {
    if (el && el.__mtTitle != null) {
      if (!el.hasAttribute("title")) { el.setAttribute("title", el.__mtTitle); }
      el.__mtTitle = null;
    }
  }

  function watch(on) {
    if (!window.MutationObserver) { return; }
    if (!on) { if (mo) { mo.disconnect(); } return; }
    if (!mo) {
      mo = new MutationObserver(function (list) {
        var i, t, r;
        for (i = 0; i < list.length; i++) {
          t = list[i].target;
          if (!cur || t !== cur.el || !t.hasAttribute("title")) { continue; }
          r = t.getAttribute("title");
          t.__mtTitle = r;
          t.removeAttribute("title");               // app set a new title while hovered
          cur.text = shorten(r);
          if (!cur.text) { hide(); }
          else if (shown) { textEl.firstChild.nodeValue = cur.text; place(cur.el); }
        }
      });
    }
    mo.observe(document, { attributes: true, attributeFilter: ["title"], subtree: true });
  }

  function place(el) {
    var r = el.getBoundingClientRect();
    var vw = document.documentElement.clientWidth, vh = document.documentElement.clientHeight;
    var w = tip.offsetWidth, h = tip.offsetHeight;
    var side = "top", x, y, ax, ay, anchorX;
    var inSidebar = !!(el.closest && el.closest(".sidebar"));

    if (inSidebar && r.right + GAP + w < vw - EDGE) {
      side = "right";
      x = r.right + GAP;
      y = r.top + r.height / 2 - h / 2;
      y = Math.max(EDGE, Math.min(vh - h - EDGE, y));
      ay = Math.max(9, Math.min(h - 9, r.top + r.height / 2 - y));
      tip.style.setProperty("--mt-a", ay + "px");
    } else {
      anchorX = r.width > 170 ? Math.max(r.left + 8, Math.min(r.right - 8, mx)) : r.left + r.width / 2;
      x = anchorX - w / 2;
      x = Math.max(EDGE, Math.min(vw - w - EDGE, x));
      if (r.top - GAP - h >= EDGE) { side = "top"; y = r.top - GAP - h; }
      else { side = "bottom"; y = r.bottom + GAP; }
      ax = Math.max(9, Math.min(w - 9, anchorX - x));
      tip.style.setProperty("--mt-a", ax + "px");
    }
    tip.style.left = Math.round(x) + "px";
    tip.style.top = Math.round(y) + "px";
    tip.className = "mt-tip is-" + side + (shown ? " is-in" : "");
  }

  function show() {
    showTimer = 0;
    if (!cur || cur.suppressed || !cur.text || !ensure()) { return; }
    if (!document.documentElement.contains(cur.el)) { leave(); return; }
    var rr = cur.el.getBoundingClientRect();
    if (mx < rr.left - 3 || mx > rr.right + 3 || my < rr.top - 3 || my > rr.bottom + 3) { leave(); return; }
    if (!textEl.firstChild) { textEl.appendChild(document.createTextNode("")); }
    textEl.firstChild.nodeValue = cur.text;
    // measure while hidden, then pop
    shown = false;
    tip.className = "mt-tip is-top";
    place(cur.el);
    void tip.offsetWidth;                       // flush so the pop transition really runs
    shown = true;
    tip.className = tip.className + " is-in";
    lastR = null;
    if (rafId) { caf(rafId); }
    rafId = raf(track);
    clearInterval(aliveTimer);
    aliveTimer = setInterval(function () {      // element re-rendered / removed while hovered
      if (!cur || !document.documentElement.contains(cur.el)) { leave(); }
    }, 250);
  }

  function hide() {
    if (showTimer) { clearTimeout(showTimer); showTimer = 0; }
    clearInterval(aliveTimer);
    if (rafId) { caf(rafId); rafId = 0; }
    if (shown && tip) { tip.className = tip.className.replace(/\s*is-in/g, ""); hideStamp = Date.now(); }
    shown = false;
  }

  function leave() {
    hide();
    if (cur) { restore(cur.el); }
    cur = null;
    watch(false);
  }

  function enter(found, e) {
    var wasShown = shown;
    if (cur) { restore(cur.el); }
    if (!found.aria) { found.el.__mtTitle = found.raw; found.el.removeAttribute("title"); }
    cur = { el: found.el, text: shorten(found.raw), suppressed: false };
    startX = mx = e.clientX; startY = my = e.clientY;
    watch(true);
    if (showTimer) { clearTimeout(showTimer); showTimer = 0; }
    if (!cur.text) { hide(); return; }
    if (wasShown || Date.now() - hideStamp < WARM) { show(); }
    else { shown = false; showTimer = setTimeout(show, DELAY); }
  }

  document.addEventListener("mouseover", function (e) {
    var t = e.target, found;
    found = findTarget(t);
    if (!found) { stripSidebar(t); if (cur) { leave(); } return; }
    if (cur && cur.el === found.el) { return; }
    enter(found, e);
  }, true);

  document.addEventListener("mouseout", function (e) {
    if (!cur) { return; }
    var to = e.relatedTarget;
    if (to && cur.el.contains(to)) { return; }
    if (to && findTarget(to)) { return; }                 // next mouseover swaps the tooltip
    leave();
  }, true);

  document.addEventListener("mousemove", function (e) {
    mx = e.clientX; my = e.clientY;
    var found;
    if (!cur) {
      // Self-heal: no mouseover arrives after a panel re-render, a tab switch or a window blur,
      // so pick the element under the cursor up here (this was the "sometimes shows, sometimes not").
      found = findTarget(e.target);
      if (found) { enter(found, e); }
      return;
    }
    if (shown) { return; }
    var moved = Math.abs(mx - startX) + Math.abs(my - startY) > 4;
    if (cur.suppressed) {
      // hidden by a click / key press: come back as soon as the cursor really moves again
      if (!moved) { return; }
      cur.suppressed = false;
      startX = mx; startY = my;
      if (showTimer) { clearTimeout(showTimer); }
      showTimer = setTimeout(show, DELAY);
      return;
    }
    if (!showTimer) {
      // timer was lost (e.g. hide() from a resize): start again
      startX = mx; startY = my;
      showTimer = setTimeout(show, DELAY);
      return;
    }
    // wait for the cursor to rest: restart the timer after a real move
    if (moved) {
      startX = mx; startY = my;
      clearTimeout(showTimer);
      showTimer = setTimeout(show, DELAY);
    }
  }, true);

  function quiet() {
    if (cur) { cur.suppressed = true; startX = mx; startY = my; }
    hide();
  }
  document.addEventListener("mousedown", quiet, true);
  document.addEventListener("keydown", quiet, true);
  // wheel / scroll: not suppressed any more. While visible, track() follows the element each frame and drops
  // the tooltip if it slides out from under the cursor; a pending one is re-checked in show().
  window.addEventListener("blur", leave);
  window.addEventListener("resize", quiet);
  document.addEventListener("mouseleave", function () { inside = false; leave(); });

  /* Watchdog: the native tooltip used to slip through whenever no mouseover reached us - a node re-created by the
     app under a resting cursor, a disabled button (browsers send it no mouse events), a titled child inside a
     titled parent. Every 120 ms, while the cursor is in this document, look at what is REALLY under it and take
     over its title the same way a mouseover would. Cheap: one elementFromPoint + a short parent walk. */
  var inside = false;
  document.addEventListener("mousemove", function () { inside = true; }, true);
  window.addEventListener("blur", function () { inside = false; });
  setInterval(function () {
    var el, found;
    if (!inside || !document.elementFromPoint) { return; }
    el = document.elementFromPoint(mx, my);
    if (!el) { return; }
    found = findTarget(el);
    if (!found) { stripSidebar(el); return; }
    if (found.aria) { return; }
    if (!cur || cur.el !== found.el) { enter(found, { clientX: mx, clientY: my }); return; }
    if (found.el.hasAttribute("title")) {                   // same element, but the app put its title back
      found.el.__mtTitle = found.el.getAttribute("title");
      found.el.removeAttribute("title");
      cur.text = shorten(found.el.__mtTitle);
      if (shown && cur.text) { textEl.firstChild.nodeValue = cur.text; place(cur.el); }
    }
  }, 120);
})();
