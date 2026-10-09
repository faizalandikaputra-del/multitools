/* Multi Tool - mt-settings-window.js  (WINDOW side of html/settings.html)
   Mirrors the panel's Settings controls (see js/mt-settings-remote.js) and forwards what you do here to them.
   Controls are matched by id, or by their data-* option attribute. Nothing is stored in this window. ES5. */
(function () {
  "use strict";
  var bus = window.MTSettingsBus, root = document.documentElement, body = document.getElementById("settingsBody");
  var KEY_ATTRS = ["data-ui-theme-opt", "data-mu-seed", "data-mu-mode", "data-anim-style-opt", "data-anim-ease-opt", "data-label-select"];
  var KEYED = "[id],[data-ui-theme-opt],[data-mu-seed],[data-mu-mode],[data-anim-style-opt],[data-anim-ease-opt],[data-label-select]";

  function keyOf(el) {
    if (el.id && el.id.indexOf("win") !== 0 && el.id.indexOf("settings") !== 0 || el.id === "settings-reset") { return "#" + el.id; }
    for (var i = 0; i < KEY_ATTRS.length; i++) {
      var v = el.getAttribute(KEY_ATTRS[i]);
      if (v !== null) { return "[" + KEY_ATTRS[i] + "=\"" + v + "\"]"; }
    }
    return null;
  }
  function keyedAncestor(el) {
    while (el && el.nodeType === 1 && el !== body) { if (keyOf(el)) { return el; } el = el.parentNode; }
    return null;
  }

  // ---------- navigation (local) ----------
  var navs = document.querySelectorAll(".settings-navigation-item"), secs = document.querySelectorAll(".settings-section");
  var titleEl = document.getElementById("settingsSectionTitle"), descEl = document.getElementById("settingsSectionDescription");
  function show(name) {
    var i, hit = null;
    for (i = 0; i < secs.length; i++) {
      var on = secs[i].getAttribute("data-settings-section") === name;
      secs[i].classList.toggle("is-active", on);
      if (on) { hit = secs[i]; }
    }
    if (!hit) { return; }
    for (i = 0; i < navs.length; i++) { navs[i].classList.toggle("is-active", navs[i].getAttribute("data-settings-tab") === name); }
    titleEl.textContent = hit.getAttribute("data-settings-title");
    descEl.textContent = hit.getAttribute("data-settings-description");
    body.scrollTop = 0;
    try { sessionStorage.setItem("mt.settings.section", name); } catch (e) { }
  }
  for (var n = 0; n < navs.length; n++) {
    navs[n].addEventListener("click", function (e) { show(e.currentTarget.getAttribute("data-settings-tab")); });
  }
  try { var saved = sessionStorage.getItem("mt.settings.section"); if (saved) { show(saved); } } catch (e) { }

  // ---------- forward user actions to the panel ----------
  var dragging = null;
  function sendValue(el, final) {
    var k = keyOf(el); if (!k) { return; }
    bus.send("act", { t: "value", k: k, v: el.value, f: !!final });
  }
  body.addEventListener("pointerdown", function (e) { if (e.target.type === "range") { dragging = e.target; } }, true);
  window.addEventListener("pointerup", function () { dragging = null; }, true);
  body.addEventListener("click", function (e) {
    var el = e.target; while (el && el !== body && !(el.tagName === "BUTTON")) { el = el.parentNode; }
    if (!el || el === body || el.disabled) { return; }
    var k = keyOf(el); if (!k) { return; }
    if (el.classList.contains("mtx-anim-card")) { playPreview(el); }
    bus.send("act", { t: "click", k: k });
    // optimistic highlight inside a radio group so the click feels instant; the panel's state then confirms it
    var grp = el.parentNode;
    if (el.getAttribute("role") === "radio" && grp) {
      var sib = grp.querySelectorAll("[role=radio]"); for (var i = 0; i < sib.length; i++) { sib[i].setAttribute("aria-checked", sib[i] === el ? "true" : "false"); }
    }
  });
  body.addEventListener("input", function (e) {
    var el = e.target, t = el.type;
    if (el.tagName === "TEXTAREA") { sendValue(el, false); return; }
    if (el.tagName === "INPUT" && (t === "range" || t === "text" || t === "number" || t === "color")) {
      if (t === "range") { var o = document.getElementById(el.id + "-val"); if (o) { o.textContent = el.value + "%"; } }
      sendValue(el, false);
    }
  });
  body.addEventListener("change", function (e) {
    var el = e.target, t = el.type, k = keyOf(el);
    if (!k) { return; }
    if (el.tagName === "INPUT" && t === "checkbox") { bus.send("act", { t: "check", k: k, c: el.checked }); }
    else if (el.tagName === "SELECT" || el.tagName === "INPUT" || el.tagName === "TEXTAREA") { sendValue(el, true); }
  });

  // two-step "Reset everything"
  var ask = document.getElementById("win-reset-ask"), real = document.getElementById("settings-reset"), armTimer = 0;
  function disarm() { real.hidden = true; ask.hidden = false; clearTimeout(armTimer); }
  ask.addEventListener("click", function () { ask.hidden = true; real.hidden = false; armTimer = setTimeout(disarm, 4000); });
  real.addEventListener("click", function () { setTimeout(disarm, 200); });

  // animation card preview (the panel plays it on hover / pick)
  function playPreview(card) { card.classList.remove("is-play"); void card.offsetWidth; card.classList.add("is-play"); setTimeout(function () { card.classList.remove("is-play"); }, 1200); }
  var animCards = document.querySelectorAll(".mtx-anim-card");
  for (var a = 0; a < animCards.length; a++) { animCards[a].addEventListener("mouseenter", function (e) { playPreview(e.currentTarget); }); }

  // ---------- apply the panel's state ----------
  var lastList = null;
  function apply(s) {
    if (!s) { return; }
    var attrs = s.attrs || {}, vars = s.vars || {}, key, i, el;
    for (key in attrs) { if (attrs.hasOwnProperty(key)) { root.setAttribute(key, attrs[key]); } }
    for (key in vars) { if (vars.hasOwnProperty(key)) { root.style.setProperty(key, vars[key]); } }
    var sw = s.sw || {};
    for (key in sw) {
      if (!sw.hasOwnProperty(key)) { continue; }
      var target = document.querySelector("[data-ui-theme-opt=\"" + key + "\"] .ui-theme-swatch");
      if (!target) { continue; }
      target.setAttribute("style", sw[key].style || "");
      if (sw[key].scheme) { target.setAttribute("data-gp-scheme", sw[key].scheme); } else { target.removeAttribute("data-gp-scheme"); }
    }
    var list = document.getElementById("label-assign-list");
    if (list && typeof s.list === "string" && s.list !== lastList && s.list.length) {
      var openSel = document.activeElement && document.activeElement.tagName === "SELECT" && list.contains(document.activeElement);
      if (!openSel) { list.innerHTML = s.list; lastList = s.list; }
    }
    var k = s.k || {};
    for (key in k) {
      if (!k.hasOwnProperty(key)) { continue; }
      try { el = document.querySelector(key); } catch (e) { el = null; }
      if (!el) { continue; }
      var o = k[key], tag = el.tagName, type = (el.type || "").toLowerCase();
      if (o.c !== undefined && el.checked !== o.c) { el.checked = o.c; }
      if (o.v !== undefined && el.value !== o.v && el !== dragging && el !== document.activeElement) { el.value = o.v; }
      if (o.a !== undefined) { el.setAttribute("aria-checked", o.a); }
      if (tag !== "INPUT" && tag !== "SELECT" && o.t !== undefined && el.hasAttribute("data-mirror") && el.textContent !== o.t) { el.textContent = o.t; }
      if (el.hasAttribute("data-mirror-hidden")) { el.hidden = !!o.h; }
      if (tag === "INPUT" || tag === "SELECT" || tag === "BUTTON") { if (!el.hasAttribute("data-local")) { el.disabled = !!o.d; } }
      if (type === "range" && el.id) {
        var out = document.getElementById(el.id + "-val"); if (out && el !== dragging) { out.textContent = el.value + "%"; }
      }
    }
    var animOn = document.getElementById("anim-enabled"), anim = document.getElementById("mtx-anim");
    if (animOn && anim) { anim.classList.toggle("is-disabled", !animOn.checked); }
    setStatus(true);
  }

  // ---------- connection ----------
  var statusEl = document.getElementById("winStatus"), lastState = 0, helloTimer = 0;
  function setStatus(ok) {
    lastState = ok ? Date.now() : lastState;
    var txt = ok ? "Multi Tool / Settings" : "Multi Tool / Settings - waiting for the panel";
    if (statusEl.textContent !== txt) { statusEl.textContent = txt; }
    root.classList.toggle("is-offline", !ok);
  }
  bus.on("state", apply);
  function hello() { bus.send("hello", {}); if (Date.now() - lastState > 2500) { setStatus(false); } }
  hello(); helloTimer = setInterval(hello, 2000);
  setTimeout(hello, 400);
  window.addEventListener("focus", hello);

  // version in the sidebar footer
  try {
    var xhr = new XMLHttpRequest(); xhr.open("GET", "../version.json", true);
    xhr.onload = function () { try { var v = JSON.parse(xhr.responseText).version; if (v) { document.getElementById("winVersion").textContent = "Version " + v; } } catch (e) { } };
    xhr.send();
  } catch (e) { }
})();
