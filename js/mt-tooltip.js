/**
 * mt-tooltip.js (v10, rebuilt) - custom tooltip (name only) that replaces the native browser tooltip.
 * Loaded by html/index.html (main panel) AND neucurve/index.html (Curve tab / its popup windows).
 *
 * Rebuilt for one reason: the mouse cursor flipped from the hand to the arrow ~0.3 s after the pointer rested on a button, exactly when
 * the old tooltip appeared, and came back only when the mouse moved. The old script did ~40 hit tests (elementFromPoint) per show, polled
 * every 120 / 250 ms, tracked the element every frame, animated transform with an overshoot, and blurred what is behind it. The tip is now
 * as quiet as possible while it is on screen:
 *   - ZERO hit tests (no elementFromPoint anywhere), no timers or requestAnimationFrame loop while shown, no watchdog interval;
 *   - the tip element is created once at start-up, so showing it inserts nothing into the DOM;
 *   - it is placed with transform only and fades with opacity only (no scale pop, no will-change, no backdrop-filter);
 *   - the pointer position comes from mouse events only; a tip is dropped on mouse out / press / key / wheel / blur.
 * How it works (unchanged): on hover it borrows the element's title="" (keeps the text in el.__mtTitle, gives it back on leave), shows only
 * the NAME (explanations after " - ", ":" or "(" are cut, long sentences mapped by RULES), icon-only buttons fall back to aria-label.
 * Appears when the pointer rests (~0.3 s); moving to a neighbour swaps instantly. The left navigation and the Curve pane never show a tip. ES5.
 */
(function () {
  "use strict";
  if (window.__mtTipLoaded) { return; }
  window.__mtTipLoaded = true;

  var DELAY = 300;        // ms the pointer must rest before the first tooltip shows
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

  /* Settings > Show tooltips (checkbox #tooltip-enabled, key mtx.tooltipOn, "0" = off). Off: nothing is ever shown and no timer starts; the title
     is still borrowed while the pointer is on an element, so the browser's own tooltip does not take over. Read on every hover (one localStorage
     read), so the Curve pane follows the panel without a message. */
  var ON_KEY = "mtx.tooltipOn";
  function enabled() { try { return window.localStorage.getItem(ON_KEY) !== "0"; } catch (e) { return true; } }

  var tip = null, textEl = null;
  var cur = null;          // { el, text, suppressed }
  var shown = false, showTimer = 0, hideStamp = 0;
  var mx = 0, my = 0, startX = 0, startY = 0;

  /* Element rect in the SAME pixels as clientX/Y and as this tooltip (position:fixed, outside .app).
     css/style.css has ".app { zoom: var(--ui-scale) }". Older CEF (before ~Chrome 128) returns getBoundingClientRect()
     already DIVIDED by that zoom, so the tooltip landed beside its tile and the old "cursor is outside the tile" check
     failed, which gave the title back to the browser (native tooltip).
     Which convention the host uses is measured ONCE per --ui-scale on a hidden probe inside .app (a tile cannot be
     used: it scales 1.07 on hover, which fakes the ratio), then double-checked against the real cursor position
     (calibrate). Elements outside .app (toast, menus, Curve iframe) are never scaled: k = 1. */
  var gk = { key: null, k: 1, z: 1, cal: false, tries: 0 };

  function convK() {
    var key = document.documentElement.style.getPropertyValue("--ui-scale") || "";
    var app, probe, z, ratio, v;
    if (gk.key === key) { return gk.k; }
    gk.key = key; gk.k = 1; gk.z = 1; gk.cal = false; gk.tries = 0;
    app = document.querySelector(".app");
    if (!app) { return 1; }
    z = parseFloat(window.getComputedStyle(document.documentElement).getPropertyValue("--ui-scale"));
    v = parseFloat(window.getComputedStyle(app).zoom);
    if (!(z > 0)) { z = (v > 0) ? v : 1; }
    gk.z = z;
    if (Math.abs(z - 1) < 0.001) { return 1; }
    probe = document.createElement("div");
    probe.style.cssText = "position:absolute;left:0;top:0;width:100px;height:10px;visibility:hidden;pointer-events:none;transform:none;";
    app.appendChild(probe);
    if (probe.offsetWidth > 0) {
      ratio = probe.getBoundingClientRect().width / probe.offsetWidth;   // old engine ~1, new engine ~z
      gk.k = (Math.abs(ratio - 1) < Math.abs(ratio - z)) ? z : 1;
    }
    app.removeChild(probe);
    return gk.k;
  }

  function box(el) {
    var r = el.getBoundingClientRect();
    var k = (el.closest && el.closest(".app")) ? convK() : 1;
    return { left: r.left * k, top: r.top * k, right: r.right * k, bottom: r.bottom * k, width: r.width * k, height: r.height * k };
  }

  /* Walk up from the hovered node to the nearest element that has a name to show. */
  function findTarget(node) {
    var n = node, t;
    // v4: an <iframe> (the NeuCurve pane has title="NeuCurve") draws its own tooltips inside its own document; the cursor resting over it
    // must never raise one here - it popped up a stray "NeuCurve" pill above the pane (the 120 ms watchdog below found the iframe under the cursor).
    if (node && node.nodeType === 1 && (node.tagName === "IFRAME" || (node.closest && node.closest(".curve-pane")))) { return null; }
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

  function ensure() {
    if (tip || !document.body) { return !!tip; }
    tip = document.createElement("div");
    tip.className = "mt-tip";
    tip.setAttribute("role", "tooltip");
    textEl = document.createElement("span");
    textEl.className = "mt-tip-text";
    textEl.appendChild(document.createTextNode(""));
    tip.appendChild(textEl);
    document.body.appendChild(tip);
    return true;
  }

  /* Placed with transform only (the element sits at left:0 / top:0, position:fixed): nothing else on the page is touched. */
  function place(el) {
    var r = box(el);
    var vw = document.documentElement.clientWidth, vh = document.documentElement.clientHeight;
    var w = tip.offsetWidth, h = tip.offsetHeight;
    var side = "top", x, y, ax, ay, anchorX;
    var inSidebar = !!(el.closest && el.closest(".sidebar"));

    if (inSidebar && document.documentElement.getAttribute("data-nav") === "right" && r.left - GAP - w > EDGE) {
      side = "left";
      x = r.left - GAP - w;
      y = Math.max(EDGE, Math.min(vh - h - EDGE, r.top + r.height / 2 - h / 2));
      ay = Math.max(9, Math.min(h - 9, r.top + r.height / 2 - y));
      tip.style.setProperty("--mt-a", ay + "px");
    } else if (inSidebar && r.right + GAP + w < vw - EDGE) {
      side = "right";
      x = r.right + GAP;
      y = Math.max(EDGE, Math.min(vh - h - EDGE, r.top + r.height / 2 - h / 2));
      ay = Math.max(9, Math.min(h - 9, r.top + r.height / 2 - y));
      tip.style.setProperty("--mt-a", ay + "px");
    } else {
      anchorX = r.width > 170 ? Math.max(r.left + 8, Math.min(r.right - 8, mx)) : r.left + r.width / 2;
      x = Math.max(EDGE, Math.min(vw - w - EDGE, anchorX - w / 2));
      if (r.top - GAP - h >= EDGE) { side = "top"; y = r.top - GAP - h; }
      else { side = "bottom"; y = r.bottom + GAP; }
      ax = Math.max(9, Math.min(w - 9, anchorX - x));
      tip.style.setProperty("--mt-a", ax + "px");
    }
    tip.style.transform = "translate3d(" + Math.round(x) + "px," + Math.round(y) + "px,0)";
    tip.className = "mt-tip is-" + side + (shown ? " is-in" : "");
  }

  function show() {
    showTimer = 0;
    if (!cur || cur.suppressed || !cur.text || !enabled() || !ensure()) { return; }
    if (!document.documentElement.contains(cur.el)) { leave(); return; }
    textEl.firstChild.nodeValue = cur.text;
    shown = false;
    place(cur.el);                              // measured while still invisible
    shown = true;
    tip.className = tip.className + " is-in";
  }

  function hide() {
    if (showTimer) { clearTimeout(showTimer); showTimer = 0; }
    if (shown && tip) { tip.className = tip.className.replace(/\s*is-in/g, ""); hideStamp = Date.now(); }
    shown = false;
  }

  function leave() {
    hide();
    if (cur) { restore(cur.el); }
    cur = null;
  }

  function enter(found, e) {
    var wasShown = shown;
    if (cur) { restore(cur.el); }
    if (!found.aria) { found.el.__mtTitle = found.raw; found.el.removeAttribute("title"); }
    cur = { el: found.el, text: shorten(found.raw), suppressed: false };
    startX = mx = e.clientX; startY = my = e.clientY;
    if (showTimer) { clearTimeout(showTimer); showTimer = 0; }
    if (!cur.text || !enabled()) { hide(); return; }
    if (wasShown || Date.now() - hideStamp < WARM) { show(); }
    else { shown = false; showTimer = setTimeout(show, DELAY); }
  }

  document.addEventListener("mouseover", function (e) {
    var t = e.target, found = findTarget(t);
    if (!found) { stripSidebar(t); if (cur) { leave(); } return; }
    if (cur && cur.el === found.el) { return; }
    enter(found, e);
  }, true);

  document.addEventListener("mouseout", function (e) {
    var to = e.relatedTarget;
    if (!cur) { return; }
    if (to && cur.el.contains(to)) { return; }
    if (to && findTarget(to)) { return; }                 // the next mouseover swaps the tooltip
    leave();
  }, true);

  document.addEventListener("mousemove", function (e) {
    var found, moved;
    mx = e.clientX; my = e.clientY;
    if (!cur) {
      // self-heal: no mouseover arrives after a panel re-render or a tab switch
      found = findTarget(e.target);
      if (found) { enter(found, e); }
      return;
    }
    if (shown) {
      if (!document.documentElement.contains(cur.el)) { leave(); }      // the app re-rendered the element under the pointer
      return;
    }
    moved = Math.abs(mx - startX) + Math.abs(my - startY) > 4;
    if (cur.suppressed) {                                  // hidden by a press / key: back as soon as the pointer really moves
      if (!moved) { return; }
      cur.suppressed = false;
    } else if (!moved && showTimer) { return; }
    if (!enabled()) { return; }
    startX = mx; startY = my;
    if (showTimer) { clearTimeout(showTimer); }
    showTimer = setTimeout(show, DELAY);                   // wait for the pointer to rest
  }, true);

  function quiet() {
    if (cur) { cur.suppressed = true; startX = mx; startY = my; }
    hide();
  }
  document.addEventListener("mousedown", quiet, true);
  document.addEventListener("keydown", quiet, true);
  document.addEventListener("wheel", quiet, true);
  window.addEventListener("blur", leave);
  document.addEventListener("mouseleave", leave);
  window.addEventListener("resize", function () { gk.key = null; quiet(); });

  /* Create the tip element and measure the zoom convention while nothing is hovered, so a tooltip never inserts DOM or probes at show time. */
  function bindSetting() {          // main panel only: the checkbox lives in #settings-modal (the Settings window mirrors it)
    var c = document.getElementById("tooltip-enabled"), rs = document.getElementById("settings-reset");
    if (c) {
      c.checked = enabled();
      c.addEventListener("change", function () {
        try { if (c.checked) { window.localStorage.removeItem(ON_KEY); } else { window.localStorage.setItem(ON_KEY, "0"); } } catch (e) { }
        if (!c.checked) { quiet(); }
      });
    }
    if (rs) { rs.addEventListener("click", function () { try { window.localStorage.removeItem(ON_KEY); } catch (e) { } if (c) { c.checked = true; } }); }   // Reset everything
  }
  if (document.readyState === "loading") { document.addEventListener("DOMContentLoaded", bindSetting); } else { bindSetting(); }

  function warmUp() { ensure(); try { convK(); } catch (e) { } }
  if (document.readyState === "loading") { document.addEventListener("DOMContentLoaded", function () { setTimeout(warmUp, 600); }); }
  else { setTimeout(warmUp, 600); }
})();
