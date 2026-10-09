/* Multi Tool - mt-bg-preview.js  (WINDOW side of html/settings.html)
   "Adjust background" in the Settings window, built like NeuCurve's (neucurve/nc-bg.js): the whole window becomes a
   preview of the background, a bright frame marks exactly what the panel shows (same shape as the panel), the rest is
   dimmed. Drag = move, scroll = zoom, Esc = Done. A card with Opacity / Zoom / Position X / Position Y, Reset, Done.
   Values go to the real panel controls (#bg-zoom, #bg-pos-x, #bg-pos-y, #bg-motion-opacity) through the same
   "act" messages every other setting uses, so the panel behind updates live. State comes from the panel ("bgview",
   "bgsrc", see js/mt-settings-remote.js). ES5, Chromium-74 safe. */
(function () {
  "use strict";
  var bus = window.MTSettingsBus, btn = document.getElementById("bg-edit-open");
  if (!bus || !btn) { return; }

  var view = { id: 0, kind: "", has: false, blob: false, z: 100, x: 50, y: 50, op: 100, aw: 4, ah: 5, gray: false };
  var media = { id: -1, kind: "", src: "" }, nat = null, el = null;   // el = <img> or <video> in the preview
  var box, frame, card, editing = false, drag = null, frameW = 0, frameH = 0, fx = 0, fy = 0, asked = 0;
  var ROWS = [["op", "Opacity", 0, 100, "#bg-motion-opacity"], ["z", "Zoom", 100, 300, "#bg-zoom"], ["x", "Position X", 0, 100, "#bg-pos-x"], ["y", "Position Y", 0, 100, "#bg-pos-y"]];

  function num(v, lo, hi, d) { v = parseFloat(v); if (!isFinite(v)) { v = d; } return Math.max(lo, Math.min(hi, v)); }
  function send(key, v, final) { bus.send("act", { t: "value", k: key, v: String(Math.round(v * 10) / 10), f: !!final }); }

  // ---------- messages from the panel ----------
  bus.on("bgview", function (m) {
    if (!m) { return; }
    var changedMedia = m.id !== view.id || m.has !== view.has;
    for (var k in m) { if (m.hasOwnProperty(k)) { view[k] = m[k]; } }
    btn.disabled = !view.has;
    if (changedMedia && view.has && media.id !== view.id && !view.blob) { bus.send("bgreq", {}); }
    if (editing) { layout(); sync(); }
  });
  bus.on("bgsrc", function (m) {
    if (!m || m.id !== view.id) { return; }
    media = m; nat = null; mount();
  });

  // ---------- preview ----------
  function mount() {
    if (!box) { return; }
    if (el && el.parentNode) { el.parentNode.removeChild(el); }
    el = null;
    if (!media.src) { return; }
    el = document.createElement(media.kind === "video" ? "video" : "img");
    el.className = "bgp-media"; el.draggable = false;
    if (media.kind === "video") {
      el.muted = true; el.loop = true; el.autoplay = true; el.setAttribute("playsinline", "");
      el.addEventListener("loadedmetadata", function () { nat = { w: el.videoWidth || 1, h: el.videoHeight || 1 }; layout(); });
    } else {
      el.addEventListener("load", function () { nat = { w: el.naturalWidth || 1, h: el.naturalHeight || 1 }; layout(); });
    }
    el.src = media.src;
    box.insertBefore(el, frame);
  }

  // the panel draws: CSS "cover" in a box W x H, then scale(zoom) about the point (posX%, posY%) of that box
  // -> drawn size = cover * zoom, top-left = (W - drawnW) * pos / 100 (same maths as NeuCurve's place())
  function place(W, H, n) {
    var s = Math.max(W / n.w, H / n.h) * (view.z / 100), dw = n.w * s, dh = n.h * s;
    return { x: (W - dw) * view.x / 100, y: (H - dh) * view.y / 100, w: dw, h: dh, rx: W - dw, ry: H - dh };
  }
  function layout() {
    if (!editing || !box) { return; }
    var asp = num(view.aw / view.ah, 0.3, 4, 0.8), winW = window.innerWidth, winH = window.innerHeight;
    var availW = Math.max(120, winW - 24), availH = Math.max(90, winH - 215);       // keep the card clear
    frameW = Math.min(availW, availH * asp); frameH = frameW / asp;
    fx = (winW - frameW) / 2; fy = 12 + Math.max(0, (availH - frameH) / 2);
    frame.style.left = fx + "px"; frame.style.top = fy + "px"; frame.style.width = frameW + "px"; frame.style.height = frameH + "px";
    box.classList.toggle("is-gray", !!view.gray);
    box.classList.toggle("no-preview", !el);
    if (!el || !nat) { return; }
    var p = place(frameW, frameH, nat);
    el.style.left = (fx + p.x) + "px"; el.style.top = (fy + p.y) + "px"; el.style.width = p.w + "px"; el.style.height = p.h + "px";
    el.style.opacity = String(view.op / 100);
  }
  function sync() {
    if (!card) { return; }
    var inputs = card.querySelectorAll("input[data-k]");
    for (var i = 0; i < inputs.length; i++) {
      var k = inputs[i].getAttribute("data-k"), v = Math.round(view[k]);
      if (document.activeElement !== inputs[i]) { inputs[i].value = v; }
      var o = card.querySelector('output[data-o="' + k + '"]'); if (o) { o.textContent = v + "%"; }
    }
  }

  function build() {
    if (box) { return; }
    box = document.createElement("div"); box.id = "bgp";
    frame = document.createElement("div"); frame.id = "bgp-frame"; box.appendChild(frame);
    var note = document.createElement("div"); note.id = "bgp-note"; note.textContent = "Preview not available for this background in this session. The sliders still adjust the panel."; box.appendChild(note);
    card = document.createElement("div"); card.id = "bgp-card";
    var h = '<div class="bgp-head"><strong>Adjust Background</strong><span>Drag to move &middot; scroll to zoom</span></div>';
    ROWS.forEach(function (r) {
      h += '<div class="bgp-row"><label>' + r[1] + '</label><input type="range" data-k="' + r[0] + '" min="' + r[2] + '" max="' + r[3] + '" step="1"><output data-o="' + r[0] + '"></output></div>';
    });
    h += '<div class="bgp-actions"><button type="button" id="bgp-reset">Reset</button><button type="button" id="bgp-done" class="primary">Done</button></div>';
    card.innerHTML = h;
    document.body.appendChild(box); document.body.appendChild(card);

    card.addEventListener("input", function (e) {
      var k = e.target.getAttribute && e.target.getAttribute("data-k"); if (!k) { return; }
      view[k] = parseFloat(e.target.value); setLocal(k);
    });
    card.addEventListener("change", function (e) {
      var k = e.target.getAttribute && e.target.getAttribute("data-k"); if (k) { send(rowKey(k), view[k], true); }
    });
    document.getElementById("bgp-reset").addEventListener("click", function () {
      view.op = 100; view.z = 100; view.x = 50; view.y = 50;
      bus.send("act", { t: "click", k: "#bg-view-reset" });
      layout(); sync();
    });
    document.getElementById("bgp-done").addEventListener("click", close);

    document.addEventListener("mousedown", function (e) {
      if (!editing || e.button !== 0 || card.contains(e.target)) { return; }
      drag = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y }; document.body.classList.add("is-bgp-dragging"); e.preventDefault();
    }, true);
    document.addEventListener("mousemove", function (e) {
      if (!drag || !nat) { return; }
      var p = place(frameW, frameH, nat);          // image follows the cursor: dx px = (W - drawnW) * dPos / 100
      if (Math.abs(p.rx) > 0.5) { view.x = num(drag.vx + (e.clientX - drag.x) / p.rx * 100, 0, 100, 50); }
      if (Math.abs(p.ry) > 0.5) { view.y = num(drag.vy + (e.clientY - drag.y) / p.ry * 100, 0, 100, 50); }
      setLocal("x"); setLocal("y");
    }, true);
    function endDrag() {
      if (!drag) { return; }
      drag = null; document.body.classList.remove("is-bgp-dragging");
      send("#bg-pos-x", view.x, true); send("#bg-pos-y", view.y, true);
    }
    document.addEventListener("mouseup", endDrag, true);
    window.addEventListener("blur", endDrag);
    document.addEventListener("wheel", function (e) {
      if (!editing || card.contains(e.target)) { return; }
      e.preventDefault();
      view.z = num(view.z + (e.deltaY < 0 ? 5 : -5), 100, 300, 100); setLocal("z"); send("#bg-zoom", view.z, true);
    }, { passive: false, capture: true });
    window.addEventListener("resize", layout);
    document.addEventListener("keydown", function (e) { if (e.key === "Escape" && editing) { close(); } }, true);
    mount();
  }
  function rowKey(k) { for (var i = 0; i < ROWS.length; i++) { if (ROWS[i][0] === k) { return ROWS[i][4]; } } return ""; }
  // local value changed (slider / drag / wheel): redraw now, forward to the panel while dragging a slider
  function setLocal(k) { layout(); sync(); if (k === "op" || k === "z" || k === "x" || k === "y") { send(rowKey(k), view[k], false); } }

  function open() {
    if (editing || !view.has) { return; }
    build(); editing = true;
    document.body.classList.add("is-bgp");
    layout(); sync();
  }
  function close() {
    if (!editing) { return; }
    editing = false; drag = null;
    document.body.classList.remove("is-bgp", "is-bgp-dragging");
  }

  // the panel must NOT enter its own full-screen editor any more: swallow the click before the generic forwarder sees it
  document.addEventListener("click", function (e) {
    var t = e.target; while (t && t.nodeType === 1 && t !== document.body) { if (t.id === "bg-edit-open") { e.stopImmediatePropagation(); e.preventDefault(); open(); return; } t = t.parentNode; }
  }, true);
  btn.setAttribute("data-local", "");
  btn.disabled = true;
})();
