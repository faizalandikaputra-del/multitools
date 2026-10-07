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

  function position() {
    if (!cur || !menu) { return; }
    var r = cur.getBoundingClientRect(), vw = window.innerWidth, vh = window.innerHeight, gap = 6, pad = 8;
    var want = Math.max(r.width, 120);
    menu.style.minWidth = r.width + "px";
    menu.style.maxWidth = Math.max(r.width, Math.min(vw - pad * 2, 360)) + "px";
    list.style.maxHeight = "";
    var natural = list.scrollHeight + 12;
    var below = vh - r.bottom - gap - pad, above = r.top - gap - pad;
    var up = natural > below && above > below;
    var room = Math.max(90, Math.min(300, up ? above : below));
    list.style.maxHeight = Math.min(natural, room) - 12 + "px";
    var h = Math.min(natural, room);
    var left = Math.max(pad, Math.min(r.left, vw - Math.max(want, menu.offsetWidth) - pad));
    menu.style.left = left + "px";
    menu.style.top = (up ? r.top - gap - h : r.bottom + gap) + "px";
    menu.className = "mt-menu" + (up ? " is-up" : "") + (menu.className.indexOf("is-open") >= 0 ? " is-open" : "");
    menu.style.transformOrigin = (r.left + r.width / 2 - left) + "px " + (up ? "100%" : "0%");
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
    document.body.appendChild(menu);
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
