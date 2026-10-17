/* Multi Tool - mt-hotkeys-settings.js   (WINDOW side of Settings > Keyboard shortcuts, html/settings.html)
   The panel owns the data (js/mt-hotkeys.js). This window asks for it ("hkreq"), shows it ("hkstate") and sends every change back ("hkset").
   Controls here have no id on purpose: js/mt-settings-window.js forwards only controls with an id, and these are not panel controls.
   Plain ES5. */
(function () {
  "use strict";
  var bus = window.MTSettingsBus, sec = document.querySelector('[data-settings-section="hotkeys"]');
  if (!bus || !sec) { return; }

  var st = null, cap = null, query = "", armTimer = 0, msgTimer = 0, gotState = false;
  function q(name) { return sec.querySelector('[data-hk="' + name + '"]'); }
  function esc(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }

  function comboOf(e) {
    var k = e.key, code = e.code || "", name;
    if (k === "Control" || k === "Shift" || k === "Alt" || k === "Meta" || k === "AltGraph" || k === "OS") { return ""; }
    if (/^Key[A-Z]$/.test(code)) { name = code.charAt(3); }
    else if (/^Digit[0-9]$/.test(code)) { name = code.charAt(5); }
    else if (k === " ") { name = "Space"; }
    else if (k && k.length === 1) { name = k.toUpperCase(); }
    else { name = k || ""; }
    if (!name) { return ""; }
    return (e.ctrlKey || e.metaKey ? "Ctrl+" : "") + (e.altKey ? "Alt+" : "") + (e.shiftKey ? "Shift+" : "") + name;
  }

  // ---------- messages ----------
  function say(text, isErr) {
    var el = q("status"); if (!el) { return; }
    el.textContent = text || ""; el.classList.toggle("is-err", !!isErr);
    clearTimeout(msgTimer);
    if (text && gotState) { msgTimer = setTimeout(function () { el.textContent = ""; el.classList.remove("is-err"); }, 5000); }
  }
  function shake(el) {
    if (!el) { return; }
    el.classList.remove("hk-shake"); void el.offsetWidth; el.classList.add("hk-shake");
    setTimeout(function () { el.classList.remove("hk-shake"); }, 380);
  }
  function save() { if (st) { bus.send("hkset", { on: st.on, palette: st.palette, map: st.map }); } }

  // ---------- who uses a key ----------
  function owner(combo, exceptId) {
    var a, i;
    if (st.palette && st.palette.c === combo && exceptId !== "palette") { return "the command palette"; }
    for (a in st.map) {
      if (st.map.hasOwnProperty(a) && st.map[a] && st.map[a].c === combo && a !== exceptId) {
        for (i = 0; i < st.cmds.length; i++) { if (st.cmds[i].id === a) { return "\"" + st.cmds[i].t + "\""; } }
        return "another command";
      }
    }
    return "";
  }

  // ---------- render ----------
  function paintPalette() {
    var b = q("palette"); if (!b || !st) { return; }
    b.textContent = st.palette ? st.palette.c : "Not set";
    b.classList.toggle("is-empty", !st.palette);
  }
  function paintList() {
    var host = q("list"); if (!host || !st) { return; }
    var needle = query.toLowerCase().replace(/^\s+|\s+$/g, ""), html = "", lastG = "", i, c, k, n = 0, scroll = host.scrollTop;
    for (i = 0; i < st.cmds.length; i++) {
      c = st.cmds[i];
      if (needle && (c.t + " " + c.g).toLowerCase().indexOf(needle) < 0) { continue; }
      if (c.g !== lastG) { lastG = c.g; html += '<div class="hk-group">' + esc(c.g) + "</div>"; }
      k = st.map[c.id] && st.map[c.id].c ? st.map[c.id].c : "";
      html += '<div class="hk-row' + (k ? " has-key" : "") + '"><span class="hk-name">' + esc(c.t) + "</span>" +
        '<button type="button" class="wbtn hk-key' + (k ? "" : " is-empty") + '" data-hk="key" data-hkid="' + esc(c.id) + '">' + (k ? esc(k) : "Set") + "</button>" +
        '<button type="button" class="hk-x" data-hk="x" data-hkid="' + esc(c.id) + '" title="Clear" aria-label="Clear shortcut"' + (k ? "" : " hidden") + ">&times;</button></div>";
      n++;
    }
    if (!n) { html = '<p class="settings-tip">No command matches.</p>'; }
    host.innerHTML = html;
    host.scrollTop = scroll;
  }
  function render() {
    if (!st) { return; }
    var t = q("on"); if (t) { t.checked = !!st.on; }
    sec.classList.toggle("hk-off", !st.on);
    paintPalette();
    if (!cap) { paintList(); }
  }

  // ---------- key capture ----------
  function endCapture() {
    cap = null;
    var all = sec.querySelectorAll(".is-cap"), i;
    for (i = 0; i < all.length; i++) { all[i].classList.remove("is-cap"); }
    render();
  }
  function startCapture(btn, id) {
    if (cap) { endCapture(); }
    cap = { id: id, btn: btn };
    btn.classList.add("is-cap"); btn.textContent = "Press keys...";
    say("Press the keys. Esc cancels, Delete clears.", false);
  }
  window.addEventListener("keydown", function (e) {
    if (!cap) { return; }
    e.preventDefault(); e.stopImmediatePropagation();
    var k = e.key, combo, name, btn = cap.btn, id = cap.id, who;
    if (k === "Escape") { say("", false); endCapture(); return; }
    if (k === "Delete" || k === "Backspace") {
      if (id === "palette") { st.palette = null; } else { delete st.map[id]; }
      save(); say("Shortcut cleared.", false); endCapture(); return;
    }
    combo = comboOf(e); if (!combo) { return; }                    // only a modifier so far: keep waiting
    name = combo.split("+").pop();
    if (!(e.ctrlKey || e.metaKey || e.altKey) && !/^F\d{1,2}$/.test(name)) {
      say("Use Ctrl or Alt with another key, or an F key. Plain letters would block typing.", true); shake(btn); return;
    }
    who = owner(combo, id);
    if (who) { say(combo + " is already used by " + who + ". Pick another key.", true); shake(btn); return; }
    var entry = { c: combo, k: e.keyCode };
    if (id === "palette") { st.palette = entry; } else { st.map[id] = entry; }
    save();
    if (st.reserved && st.reserved.indexOf(combo) >= 0) { say(combo + " saved. NeuCurve uses it too, so inside the Curve tab NeuCurve wins.", false); }
    else { say(combo + " saved.", false); }
    endCapture();
  }, true);
  window.addEventListener("blur", function () { if (cap) { endCapture(); } });

  // ---------- clicks ----------
  sec.addEventListener("click", function (e) {
    var el = e.target, name, id;
    while (el && el !== sec && !(el.getAttribute && el.getAttribute("data-hk"))) { el = el.parentNode; }
    if (!el || el === sec || !st) { return; }
    name = el.getAttribute("data-hk"); id = el.getAttribute("data-hkid");
    if (name === "palette") { startCapture(el, "palette"); }
    else if (name === "palette-reset") { st.palette = st.defPalette; save(); say("Palette key reset to " + st.defPalette.c + ".", false); render(); }
    else if (name === "key") { startCapture(el, id); }
    else if (name === "x") { delete st.map[id]; save(); render(); }
    else if (name === "clear-all") {
      if (!el.classList.contains("is-armed")) {
        el.classList.add("is-armed"); el.textContent = "Click again to clear all";
        armTimer = setTimeout(function () { el.classList.remove("is-armed"); el.textContent = "Clear all shortcuts"; }, 4000);
      } else {
        clearTimeout(armTimer); el.classList.remove("is-armed"); el.textContent = "Clear all shortcuts";
        st.map = {}; save(); say("All shortcuts cleared.", false); render();
      }
    }
  });
  sec.addEventListener("change", function (e) {
    var el = e.target;
    if (el && el.getAttribute && el.getAttribute("data-hk") === "on" && st) { st.on = !!el.checked; save(); render(); }
  });
  sec.addEventListener("input", function (e) {
    var el = e.target;
    if (el && el.getAttribute && el.getAttribute("data-hk") === "search") { query = el.value; if (!cap) { paintList(); } }
  });

  // ---------- panel sync ----------
  bus.on("hkstate", function (d) {
    if (!d || !d.cmds) { return; }
    gotState = true;
    st = { on: d.on !== false, palette: d.palette || null, defPalette: d.defPalette || { c: "Ctrl+K", k: 75 }, map: d.map || {}, cmds: d.cmds, reserved: d.reserved || [] };
    var s = q("status"); if (s && s.getAttribute("data-wait")) { s.removeAttribute("data-wait"); s.textContent = ""; }
    render();
  });
  function ask() { bus.send("hkreq", {}); }
  ask();
  var tries = 0, tick = 0;
  setInterval(function () {
    if (!gotState) {
      tries++;
      ask();
      if (tries === 3) { var s = q("status"); if (s) { s.setAttribute("data-wait", "1"); s.textContent = "Waiting for the Multi Tool panel. Open the panel in After Effects."; } }
    } else if (!cap && (++tick % 4) === 0) { ask(); }     // every 10 s: picks up shortcuts added in the panel meanwhile
  }, 2500);
})();
