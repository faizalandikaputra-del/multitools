/* Multi Tool - mt-colorpicker.js : themed colour picker popover that replaces the OS colour dialog.
   Applies to every <input type="color"> (Settings > Theme color / Background color, Add Shortcut colour, the
   "Custom Color" button of the accent-colour menu ...). The input stays in the page and keeps working: the picker
   writes input.value and fires "input" while you drag and "change" when you finish, exactly like the native dialog.
   It does NOT touch the Color Palette > Custom Color wheel (.cw, drawn on a canvas by main.js) - that one is separate.
   Picker: saturation/brightness field, hue slider, current vs new preview, HEX + RGB fields, quick swatches,
   recent colours (localStorage "mtRecentColors"), eyedropper when the host supports window.EyeDropper.
   Close: Esc, click outside, scroll, resize. Opt out for one input: data-native="true". Plain ES5 (old CEP hosts). */
(function () {
  "use strict";
  var pop = null, input = null, st = null, startHex = "", dirty = false, closeTimer = 0, lastPt = { x: 40, y: 40 };
  var QUICK = ["#8b6cf7", "#5b8def", "#2dd4bf", "#4ade80", "#facc15", "#fb923c", "#f87171", "#f472b6", "#ffffff", "#16161a"];
  var RECENT_KEY = "mtRecentColors";

  /* ---------- colour math ---------- */
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function hex2rgb(h) {
    h = String(h || "").replace("#", "");
    if (h.length === 3) { h = h.charAt(0) + h.charAt(0) + h.charAt(1) + h.charAt(1) + h.charAt(2) + h.charAt(2); }
    if (!/^[0-9a-f]{6}$/i.test(h)) { return null; }
    return { r: parseInt(h.substr(0, 2), 16), g: parseInt(h.substr(2, 2), 16), b: parseInt(h.substr(4, 2), 16) };
  }
  function rgb2hex(r, g, b) {
    function x(n) { n = Math.round(clamp(n, 0, 255)); return (n < 16 ? "0" : "") + n.toString(16); }
    return "#" + x(r) + x(g) + x(b);
  }
  function rgb2hsv(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    var mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn, h = 0;
    if (d) {
      if (mx === r) { h = ((g - b) / d) % 6; } else if (mx === g) { h = (b - r) / d + 2; } else { h = (r - g) / d + 4; }
      h *= 60; if (h < 0) { h += 360; }
    }
    return { h: h, s: mx ? d / mx : 0, v: mx };
  }
  function hsv2rgb(h, s, v) {
    var c = v * s, x = c * (1 - Math.abs((h / 60) % 2 - 1)), m = v - c, r = 0, g = 0, b = 0;
    if (h < 60) { r = c; g = x; } else if (h < 120) { r = x; g = c; } else if (h < 180) { g = c; b = x; }
    else if (h < 240) { g = x; b = c; } else if (h < 300) { r = x; b = c; } else { r = c; b = x; }
    return { r: (r + m) * 255, g: (g + m) * 255, b: (b + m) * 255 };
  }
  function curHex() { var c = hsv2rgb(st.h, st.s, st.v); return rgb2hex(c.r, c.g, c.b); }

  function recent() { try { return JSON.parse(localStorage.getItem(RECENT_KEY) || "[]") || []; } catch (e) { return []; } }
  function pushRecent(hex) {
    try {
      var r = recent().filter(function (c) { return c !== hex; });
      r.unshift(hex);
      localStorage.setItem(RECENT_KEY, JSON.stringify(r.slice(0, 10)));
    } catch (e) { }
  }

  function fire(el, type) {
    var ev;
    try { ev = new Event(type, { bubbles: true }); } catch (e) { ev = document.createEvent("Event"); ev.initEvent(type, true, false); }
    el.dispatchEvent(ev);
  }

  /* ---------- DOM ---------- */
  var EYE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m2 22 1-1h3l9-9M3 21v-3l9-9"/><path d="m15 6 3.4-3.4a2.1 2.1 0 1 1 3 3L18 9l.4.4a2.1 2.1 0 1 1-3 3l-3.8-3.8a2.1 2.1 0 1 1 3-3z"/></svg>';
  function swatches(list) {
    return list.map(function (c) { return '<button type="button" class="mt-cp-sw" data-c="' + c + '" style="--c:' + c + '" title="' + c.toUpperCase() + '"></button>'; }).join("");
  }
  function build() {
    var el = document.createElement("div");
    el.className = "mt-cp";
    el.setAttribute("role", "dialog");
    el.setAttribute("aria-label", "Color picker");
    var rec = recent();
    el.innerHTML =
      '<div class="mt-cp-sv" tabindex="0" role="slider" aria-label="Saturation and brightness"><span class="mt-cp-knob"></span></div>' +
      '<div class="mt-cp-hue" tabindex="0" role="slider" aria-label="Hue" aria-valuemin="0" aria-valuemax="360"><span class="mt-cp-hknob"></span></div>' +
      '<div class="mt-cp-row">' +
        '<div class="mt-cp-prev" title="Old / New"><span class="mt-cp-old"></span><span class="mt-cp-new"></span></div>' +
        '<input class="mt-cp-hex" type="text" maxlength="7" spellcheck="false" aria-label="Hex">' +
        (window.EyeDropper ? '<button type="button" class="mt-cp-eye" title="Pick from screen">' + EYE + '</button>' : "") +
      '</div>' +
      '<div class="mt-cp-rgb">' +
        '<label><span>R</span><input type="text" inputmode="numeric" maxlength="3" data-ch="r"></label>' +
        '<label><span>G</span><input type="text" inputmode="numeric" maxlength="3" data-ch="g"></label>' +
        '<label><span>B</span><input type="text" inputmode="numeric" maxlength="3" data-ch="b"></label>' +
      '</div>' +
      '<div class="mt-cp-label">Quick colors</div><div class="mt-cp-sws">' + swatches(QUICK) + '</div>' +
      (rec.length ? '<div class="mt-cp-label">Recent</div><div class="mt-cp-sws">' + swatches(rec) + '</div>' : "");
    return el;
  }
  function q(sel) { return pop.querySelector(sel); }

  function paint(skipFields) {
    var hex = curHex(), c = hsv2rgb(st.h, st.s, st.v), svEl = q(".mt-cp-sv");
    svEl.style.setProperty("--hue", "hsl(" + st.h + ",100%,50%)");
    q(".mt-cp-knob").style.left = (st.s * 100) + "%";
    q(".mt-cp-knob").style.top = ((1 - st.v) * 100) + "%";
    q(".mt-cp-knob").style.background = hex;
    q(".mt-cp-hknob").style.left = (st.h / 360 * 100) + "%";
    q(".mt-cp-hknob").style.background = "hsl(" + st.h + ",100%,50%)";
    q(".mt-cp-new").style.background = hex;
    pop.setAttribute("data-mt-color", hex);
    if (!skipFields) {
      q(".mt-cp-hex").value = hex.toUpperCase();
      var f = pop.querySelectorAll(".mt-cp-rgb input");
      f[0].value = Math.round(c.r); f[1].value = Math.round(c.g); f[2].value = Math.round(c.b);
    }
  }
  function commit(live) {
    var hex = curHex();
    if (!input) { return; }
    if (input.value.toLowerCase() !== hex) { input.value = hex; dirty = true; fire(input, "input"); }
  }
  function setHex(h, keepHue) {
    var c = hex2rgb(h);
    if (!c) { return false; }
    var v = rgb2hsv(c.r, c.g, c.b);
    st.s = v.s; st.v = v.v;
    if (!keepHue && v.s > 0.001 && v.v > 0.001) { st.h = v.h; }
    paint(); commit();
    return true;
  }

  /* ---------- dragging (mouse) ---------- */
  function drag(el, onMove) {
    el.addEventListener("mousedown", function (e) {
      if (e.button !== 0) { return; }
      e.preventDefault();
      try { el.focus(); } catch (er) { }
      pop.classList.add("is-dragging");
      function mv(ev) { var r = el.getBoundingClientRect(); onMove(clamp((ev.clientX - r.left) / r.width, 0, 1), clamp((ev.clientY - r.top) / r.height, 0, 1)); }
      function up() { document.removeEventListener("mousemove", mv, true); document.removeEventListener("mouseup", up, true); if (pop) { pop.classList.remove("is-dragging"); } }
      document.addEventListener("mousemove", mv, true); document.addEventListener("mouseup", up, true);
      mv(e);
    });
  }
  function wire() {
    var sv = q(".mt-cp-sv"), hue = q(".mt-cp-hue");
    drag(sv, function (x, y) { st.s = x; st.v = 1 - y; paint(); commit(); });
    drag(hue, function (x) { st.h = x * 360; if (st.h >= 360) { st.h = 359.99; } paint(); commit(); });
    sv.addEventListener("keydown", function (e) {
      var d = e.shiftKey ? 0.1 : 0.02, k = e.key, used = true;
      if (k === "ArrowLeft") { st.s = clamp(st.s - d, 0, 1); } else if (k === "ArrowRight") { st.s = clamp(st.s + d, 0, 1); }
      else if (k === "ArrowUp") { st.v = clamp(st.v + d, 0, 1); } else if (k === "ArrowDown") { st.v = clamp(st.v - d, 0, 1); } else { used = false; }
      if (used) { e.preventDefault(); paint(); commit(); }
    });
    hue.addEventListener("keydown", function (e) {
      var d = e.shiftKey ? 20 : 4, k = e.key;
      if (k === "ArrowLeft" || k === "ArrowRight") { e.preventDefault(); st.h = clamp(st.h + (k === "ArrowRight" ? d : -d), 0, 359.99); paint(); commit(); }
    });
    var hexEl = q(".mt-cp-hex");
    hexEl.addEventListener("input", function () { var v = hexEl.value; if (/^#?[0-9a-f]{6}$/i.test(v)) { setHex(v.charAt(0) === "#" ? v : "#" + v); } });
    hexEl.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); finish(); } });
    hexEl.addEventListener("blur", function () { hexEl.value = curHex().toUpperCase(); });
    Array.prototype.forEach.call(pop.querySelectorAll(".mt-cp-rgb input"), function (f) {
      f.addEventListener("input", function () {
        var all = pop.querySelectorAll(".mt-cp-rgb input"), v = [];
        for (var i = 0; i < 3; i++) { var n = parseInt(all[i].value, 10); if (isNaN(n)) { return; } v.push(clamp(n, 0, 255)); }
        var h = rgb2hex(v[0], v[1], v[2]), c = rgb2hsv(v[0], v[1], v[2]);
        st.s = c.s; st.v = c.v; if (c.s > 0.001 && c.v > 0.001) { st.h = c.h; }
        paint(true); q(".mt-cp-hex").value = h.toUpperCase(); commit();
      });
      f.addEventListener("blur", function () { paint(); });
      f.addEventListener("keydown", function (e) {
        if (e.key === "Enter") { e.preventDefault(); finish(); }
        else if (e.key === "ArrowUp" || e.key === "ArrowDown") { e.preventDefault(); var n = clamp((parseInt(f.value, 10) || 0) + (e.key === "ArrowUp" ? 1 : -1) * (e.shiftKey ? 10 : 1), 0, 255); f.value = n; fire(f, "input"); }
      });
    });
    Array.prototype.forEach.call(pop.querySelectorAll(".mt-cp-sw"), function (b) {
      b.addEventListener("click", function () { setHex(b.getAttribute("data-c")); });
    });
    var eye = q(".mt-cp-eye");
    if (eye) {
      eye.addEventListener("click", function () {
        try { new window.EyeDropper().open().then(function (r) { if (pop && r && r.sRGBHex) { setHex(r.sRGBHex); } }, function () { }); } catch (e) { }
      });
    }
  }

  /* ---------- open / close ---------- */
  function place() {
    if (!pop || !input) { return; }
    var r = input.getBoundingClientRect(), vw = window.innerWidth, vh = window.innerHeight, pad = 8, gap = 8;
    var w = pop.offsetWidth, h = pop.offsetHeight;
    var hidden = !(r.width > 0 && r.height > 0) || r.right < 0 || r.bottom < 0 || r.left > vw || r.top > vh;
    if (hidden) { r = { left: lastPt.x, right: lastPt.x, top: lastPt.y, bottom: lastPt.y, width: 0, height: 0 }; }
    var below = vh - r.bottom - gap - pad, above = r.top - gap - pad;
    var up = h > below && above > below;
    var top = up ? Math.max(pad, r.top - gap - h) : Math.min(r.bottom + gap, Math.max(pad, vh - h - pad));
    var left = clamp(r.left + r.width / 2 - w / 2, pad, Math.max(pad, vw - w - pad));
    pop.style.left = left + "px"; pop.style.top = top + "px";
    pop.style.transformOrigin = clamp(r.left + r.width / 2 - left, 0, w) + "px " + (up ? "100%" : "0%");
    if (up) { pop.classList.add("is-up"); } else { pop.classList.remove("is-up"); }
  }

  function open(el) {
    if (pop && input === el) { finish(); return; }
    if (pop) { finish(true); }
    var c = hex2rgb(el.value) || { r: 139, g: 108, b: 247 }, hsv = rgb2hsv(c.r, c.g, c.b);
    input = el; dirty = false;
    startHex = rgb2hex(c.r, c.g, c.b);
    st = { h: hsv.h, s: hsv.s, v: hsv.v };
    pop = build();
    document.body.appendChild(pop);
    q(".mt-cp-old").style.background = startHex;
    wire(); paint(); place();
    el.classList.add("mt-cp-open");
    window.requestAnimationFrame(function () { window.requestAnimationFrame(function () { if (pop) { pop.classList.add("is-open"); } }); });
  }

  function finish(instant) {
    if (!pop) { return; }
    var p = pop, el = input, changed = dirty && el && el.value.toLowerCase() !== startHex;
    pop = null; input = null; st = null;
    if (el) { el.classList.remove("mt-cp-open"); }
    if (changed) { pushRecent(el.value.toLowerCase()); fire(el, "change"); }
    clearTimeout(closeTimer);
    if (instant === true) { if (p.parentNode) { p.parentNode.removeChild(p); } return; }
    p.classList.remove("is-open"); p.classList.add("is-closing");
    closeTimer = setTimeout(function () { if (p.parentNode) { p.parentNode.removeChild(p); } }, 170);
  }

  function eligible(t) { return t && t.tagName === "INPUT" && t.type === "color" && !t.disabled && t.getAttribute("data-native") !== "true"; }

  document.addEventListener("mousedown", function (e) {
    lastPt = { x: e.clientX, y: e.clientY };
    if (pop && pop.contains(e.target)) { return; }
    if (eligible(e.target)) { e.preventDefault(); return; }       // no native focus / dialog
    if (pop) { finish(); }
  }, true);
  document.addEventListener("click", function (e) {
    if (!eligible(e.target)) { return; }
    e.preventDefault(); e.stopPropagation();
    open(e.target);
  }, true);
  document.addEventListener("keydown", function (e) {
    if (pop && (e.key === "Escape" || e.key === "Esc")) { e.preventDefault(); e.stopPropagation(); var el = input; finish(); try { el.focus(); } catch (er) { } }
  }, true);
  window.addEventListener("scroll", function (e) { if (pop && !pop.contains(e.target)) { finish(); } }, true);
  window.addEventListener("resize", function () { if (pop) { place(); } });
  window.addEventListener("blur", function () { if (pop) { finish(); } });
})();
