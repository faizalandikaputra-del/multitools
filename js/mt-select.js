/* Multi Tool - mt-select.js : smooth custom dropdown for every <select> in the panel.
   The native <select> stays in the page (so layout, value text, hover/focus styling, .value / .selectedIndex and
   "change" listeners all keep working untouched); only its OS popup is replaced by a themed, animated menu.
   - mousedown / click / Space / Enter / Alt+Down on a select opens the menu (arrow keys on a closed select still
     change the value natively, as before).
   - menu: opens under the field (flips above when there is no room), fades + scales in from the field, items
     stagger in, hover and keyboard highlight, check mark on the current value, <optgroup> labels, disabled options,
     type-ahead, Home/End/PageUp/PageDown, Esc / outside click / scroll / resize / blur closes it.
   - choosing an option sets select.selectedIndex and fires "input" + "change" (bubbling), like a native pick.
   Event delegation on document: selects created later (tabs built on demand, preset lists) work with no setup.
   Opt out for one select: add data-native="true". Plain ES5 for old CEP hosts (AE 2019/2021). */
(function () {
  "use strict";
  var menu = null, list = null, cur = null, items = [], active = -1, typed = "", typedAt = 0, closeTimer = 0;
  var CHECK = '<svg class="mt-opt-check" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';

  function esc(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
  function eligible(t) {
    return t && t.tagName === "SELECT" && !t.multiple && !(t.size > 1) && !t.disabled && t.getAttribute("data-native") !== "true";
  }
  function fire(el, type) {
    var ev;
    try { ev = new Event(type, { bubbles: true }); } catch (e) { ev = document.createEvent("Event"); ev.initEvent(type, true, false); }
    el.dispatchEvent(ev);
  }

  function build(sel) {
    var html = "", i, j, n = 0, node, kids = sel.children, opt, grp;
    function row(o) {
      var cls = "mt-opt" + (o.selected ? " is-selected" : "") + (o.disabled ? " is-disabled" : "");
      var d = Math.min(n, 14) * 14;
      html += '<div class="' + cls + '" role="option" data-i="' + o.index + '" style="--d:' + d + 'ms">' +
        '<span class="mt-opt-text">' + esc(o.text || " ") + "</span>" + CHECK + "</div>";
      n++;
    }
    for (i = 0; i < kids.length; i++) {
      node = kids[i];
      if (node.tagName === "OPTGROUP") {
        html += '<div class="mt-group">' + esc(node.label) + "</div>";
        for (j = 0; j < node.children.length; j++) {
          opt = node.children[j];
          if (opt.tagName === "OPTION") { row({ index: opt.index, text: opt.text, selected: opt.selected, disabled: opt.disabled || node.disabled }); }
        }
      } else if (node.tagName === "OPTION") {
        row({ index: node.index, text: node.text, selected: node.selected, disabled: node.disabled });
      }
    }
    return html;
  }

  function setActive(i, scroll) {
    var k, el;
    if (active >= 0 && items[active]) { items[active].classList.remove("is-active"); }
    active = i;
    if (active < 0 || !items[active]) { active = -1; return; }
    el = items[active];
    el.classList.add("is-active");
    if (scroll !== false) {
      k = list;
      if (el.offsetTop < k.scrollTop + 4) { k.scrollTop = Math.max(0, el.offsetTop - 4); }
      else if (el.offsetTop + el.offsetHeight > k.scrollTop + k.clientHeight - 4) { k.scrollTop = el.offsetTop + el.offsetHeight - k.clientHeight + 4; }
    }
  }
  function step(from, dir) {
    var i = from + dir;
    while (i >= 0 && i < items.length) { if (!items[i].classList.contains("is-disabled")) { return i; } i += dir; }
    return from;
  }
  function firstEnabled() { return step(-1, 1); }

  /* The panel is zoomed (".app { zoom: var(--ui-scale) }", css/style.css) but this menu lives in <body>, outside the zoom. Old CEF (AE 2019/2021)
     returns getBoundingClientRect() already divided by that zoom, newer builds return real screen px, so with a UI scale other than 100% the
     menu landed lower / wider than its field and ran off the panel (Text Animation > Direction). realRect() gives the field's rect in real px
     for both conventions (rect.width vs offsetWidth: ~1 = old, ~zoom = new, same test as ColorWheel in js/main.js), and the menu gets the same
     zoom, so its text matches the panel; every length below is computed in real px and divided by z when written. At 100% nothing changes. */
  function zoomOf(el) {
    var z = 1, n, v;
    for (n = el; n && n.nodeType === 1; n = n.parentElement) {
      v = parseFloat(window.getComputedStyle(n).zoom);
      if (v && v > 0 && v !== 1) { z *= v; }
    }
    if (z === 1) {
      v = parseFloat(window.getComputedStyle(document.documentElement).getPropertyValue("--ui-scale"));
      if (v && v > 0) { z = v; }
    }
    return z;
  }
  /* Which convention does getBoundingClientRect() use under CSS zoom? Measured with a probe of known CSS width placed in the same zoomed
     context: ~z x its width = real screen px (k = 1), ~1 x = divided by the zoom (k = z). The old test compared rect.width with
     offsetWidth, but some CEF builds scale offsetWidth too, so it picked k = z on a rect that was already real px: the menu came out
     z times too wide and too low (Animator Text > Based on / Direction). */
  function rectK(el, z) {
    var host = el.parentNode, pr, w = 0, ratio, ow, r;
    if (z === 1) { return 1; }
    if (host && host.appendChild) {
      pr = document.createElement("i");
      pr.style.cssText = "position:absolute;left:0;top:0;width:100px;height:1px;visibility:hidden;pointer-events:none;margin:0;padding:0;border:0";
      try { host.appendChild(pr); w = pr.getBoundingClientRect().width; } catch (e) { w = 0; }
      if (pr.parentNode) { pr.parentNode.removeChild(pr); }
    }
    if (w > 0) { ratio = w / 100; return Math.abs(ratio - z) <= Math.abs(ratio - 1) ? 1 : z; }
    r = el.getBoundingClientRect(); ow = el.offsetWidth || 0; ratio = ow ? r.width / ow : 1;   // fallback: the old heuristic
    return Math.abs(ratio - 1) < Math.abs(ratio - z) ? z : 1;
  }
  function realRect(el, z) {
    var r = el.getBoundingClientRect(), k = rectK(el, z);
    return { left: r.left * k, right: r.right * k, top: r.top * k, bottom: r.bottom * k, width: r.width * k, height: r.height * k };
  }

  /* The menu lives in the SAME zoom context as the select (inside .app when the select is, else <body>) and carries no zoom of its own, so
     select and menu always report rects in the same units whatever the CEF build does with CSS zoom. Everything is then computed in those
     "rect units": the menu is moved by 100 style px to learn rect units per style px (u), the viewport edge is read from a fixed probe,
     and after placing the menu rect is compared with the target once more and corrected. */
  function position() {
    if (!cur || !menu) { return; }
    var r = cur.getBoundingClientRect(), gap = 6, pad = 8, host = (cur.closest && cur.closest(".app")) || document.body;
    var vp, vwR, vhR, m0, m1, u, natural, below, above, up, room, h, left, top, mr, keepT = menu.style.transform, keepTr = menu.style.transition;
    if (menu.parentNode !== host) { host.appendChild(menu); }
    menu.style.zoom = "";
    vp = document.createElement("i");
    vp.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;visibility:hidden;pointer-events:none";
    host.appendChild(vp); mr = vp.getBoundingClientRect(); vwR = mr.right; vhR = mr.bottom; host.removeChild(vp);
    menu.style.transition = "none"; menu.style.transform = "none";     // measure at rest, not in the scaled "closed" pose
    menu.style.left = "0px"; menu.style.top = "0px"; m0 = menu.getBoundingClientRect();
    menu.style.left = "100px"; menu.style.top = "100px"; m1 = menu.getBoundingClientRect();
    u = (m1.left - m0.left) / 100; if (!(u > 0.05)) { u = 1; }
    menu.style.minWidth = (r.width / u) + "px";
    menu.style.maxWidth = (Math.max(r.width, Math.min(vwR - pad * u * 2, 360 * u)) / u) + "px";
    list.style.maxHeight = "";
    natural = (list.scrollHeight + 12) * u;
    below = vhR - r.bottom - (gap + pad) * u; above = r.top - (gap + pad) * u;
    up = natural > below && above > below;
    room = Math.max(90 * u, Math.min(300 * u, up ? above : below));
    h = Math.min(natural, room);
    list.style.maxHeight = (h / u - 12) + "px";
    mr = menu.getBoundingClientRect();
    left = Math.max(pad * u, Math.min(r.left, vwR - Math.max(r.width, mr.width) - pad * u));
    top = up ? r.top - gap * u - h : r.bottom + gap * u;
    menu.style.left = ((left - m0.left) / u) + "px";
    menu.style.top = ((top - m0.top) / u) + "px";
    mr = menu.getBoundingClientRect();                                     // verify and correct once
    if (Math.abs(mr.left - left) > 0.5) { menu.style.left = (parseFloat(menu.style.left) + (left - mr.left) / u) + "px"; }
    if (Math.abs(mr.top - top) > 0.5) { menu.style.top = (parseFloat(menu.style.top) + (top - mr.top) / u) + "px"; }
    menu.style.transform = keepT; menu.style.transition = keepTr;
    menu.className = "mt-menu" + (up ? " is-up" : "") + (menu.className.indexOf("is-open") >= 0 ? " is-open" : "");
    menu.style.transformOrigin = ((r.left + r.width / 2 - left) / u) + "px " + (up ? "100%" : "0%");
  }

  function open(sel) {
    if (cur === sel && menu) { close(); return; }
    close(true);
    cur = sel;
    menu = document.createElement("div");
    menu.className = "mt-menu";
    menu.setAttribute("role", "listbox");
    list = document.createElement("div");
    list.className = "mt-list";
    list.innerHTML = build(sel);
    menu.appendChild(list);
    (sel.closest ? (sel.closest(".app") || document.body) : document.body).appendChild(menu);   // same zoom context as the select: identical rect units, no zoom maths
    items = Array.prototype.slice.call(list.querySelectorAll(".mt-opt"));
    sel.classList.add("mt-open");
    position();
    var s = -1, k;
    for (k = 0; k < items.length; k++) { if (items[k].classList.contains("is-selected")) { s = k; break; } }
    setActive(s >= 0 ? s : firstEnabled(), true);
    // two frames: first paint at the "closed" pose, then transition to open
    window.requestAnimationFrame(function () { window.requestAnimationFrame(function () { if (menu) { menu.className += " is-open"; } }); });
  }

  function close(instant) {
    if (!menu) { return; }
    var m = menu, s = cur;
    menu = null; list = null; cur = null; items = []; active = -1;
    if (s) { s.classList.remove("mt-open"); }
    clearTimeout(closeTimer);
    if (instant) { if (m.parentNode) { m.parentNode.removeChild(m); } return; }
    m.className = m.className.replace(/\s*is-open/, "") + " is-closing";
    closeTimer = setTimeout(function () { if (m.parentNode) { m.parentNode.removeChild(m); } }, 170);
  }

  function choose(i) {
    var s = cur, o;
    if (!s || !items[i] || items[i].classList.contains("is-disabled")) { return; }
    o = parseInt(items[i].getAttribute("data-i"), 10);
    close();
    if (s.selectedIndex !== o) {
      s.selectedIndex = o;
      fire(s, "input");
      fire(s, "change");
    }
    try { s.focus(); } catch (e) { }
  }

  /* ---------- events (delegated) ---------- */
  document.addEventListener("mousedown", function (e) {
    var t = e.target;
    if (menu && menu.contains(t)) { e.preventDefault(); return; }       // keep focus on the select while clicking in the menu
    if (eligible(t) && e.button === 0) {
      e.preventDefault();                                                // stop the native OS popup
      try { t.focus(); } catch (er) { }
      open(t);
      return;
    }
    if (menu) { close(); }
  }, true);

  document.addEventListener("click", function (e) {
    var t = e.target, o;
    if (menu && menu.contains(t)) {
      o = t.closest ? t.closest(".mt-opt") : null;
      if (o) { choose(items.indexOf(o)); }
    }
  }, true);

  document.addEventListener("mouseover", function (e) {
    if (!menu || !menu.contains(e.target)) { return; }
    var o = e.target.closest ? e.target.closest(".mt-opt") : null;
    if (o && !o.classList.contains("is-disabled")) { setActive(items.indexOf(o), false); }
  });

  document.addEventListener("keydown", function (e) {
    var t = e.target, k = e.key, i, now, ch, n;
    if (!menu) {
      if (eligible(t) && (k === "Enter" || k === " " || k === "Spacebar" || (e.altKey && (k === "ArrowDown" || k === "ArrowUp")))) {
        e.preventDefault(); open(t);
      }
      return;
    }
    if (k === "Escape" || k === "Esc") { e.preventDefault(); e.stopPropagation(); var s0 = cur; close(); try { s0.focus(); } catch (er) { } return; }
    if (k === "Tab") { close(); return; }
    if (k === "ArrowDown") { e.preventDefault(); setActive(step(active, 1)); return; }
    if (k === "ArrowUp") { e.preventDefault(); setActive(step(active, -1)); return; }
    if (k === "Home") { e.preventDefault(); setActive(firstEnabled()); return; }
    if (k === "End") { e.preventDefault(); setActive(step(items.length, -1)); return; }
    if (k === "PageDown") { e.preventDefault(); n = active; for (i = 0; i < 5; i++) { n = step(n, 1); } setActive(n); return; }
    if (k === "PageUp") { e.preventDefault(); n = active; for (i = 0; i < 5; i++) { n = step(n, -1); } setActive(n); return; }
    if (k === "Enter" || k === " " || k === "Spacebar") { e.preventDefault(); choose(active); return; }
    if (k && k.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {            // type-ahead
      now = Date.now(); if (now - typedAt > 700) { typed = ""; } typedAt = now; typed += k.toLowerCase();
      ch = typed.length > 1 && items.length ? active : active + 1;
      for (i = 0; i < items.length; i++) {
        n = (ch + i) % items.length;
        if (!items[n].classList.contains("is-disabled") && items[n].textContent.toLowerCase().indexOf(typed) === 0) { setActive(n); break; }
      }
      e.preventDefault();
    }
  }, true);

  window.addEventListener("scroll", function (e) { if (menu && !(menu.contains(e.target))) { close(); } }, true);
  window.addEventListener("resize", function () { if (menu) { position(); } });
  window.addEventListener("blur", function () { close(); });
  document.addEventListener("wheel", function (e) { if (menu && !menu.contains(e.target)) { close(); } }, { passive: true, capture: true });
})();
