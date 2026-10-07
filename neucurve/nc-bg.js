/* NeuCurve - nc-bg.js   (v10 - rebuilt)
   "Adjust Background" for NeuCurve's Graph Background image/GIF.

   What it adjusts: the REAL graph background - the <image> that NeuCurve itself draws inside the graph SVG
   (svg.curve-svg > image, the same element Opacity already controlled). Earlier versions added a second layer behind
   the graph, so Zoom / Position moved a layer you could not see while the real image stayed put. Now this file
   rewrites x / y / width / height of that very <image>, with the same maths as CSS "background-size: cover":
       cover scale = max(W / imgW, H / imgH) * zoom      (zoom 100..300 %)
       x = (W - drawnW) * posX / 100,  y = (H - drawnH) * posY / 100        (posX/posY 0..100 %, 50 = centred)
   so it works in the Curve tab AND the Large Graph Editor window, for png / jpg / gif (GIFs keep animating).

   Stored in localStorage (prefix "neucurve_"), synced Settings <-> Curve tab through NeuCurve's own stores
   (assets/index.js: window.__ncBgStores = { op, img, zoom, x, y }):
     bgImagePath  image chosen in Settings > Graph Background         bgOpacity  0..1
     bgZoom       100..300 (%)                                         bgPosX / bgPosY  0..100 (%)
     bgAspect     graph width / height, written by the Curve tab so the Settings preview has the same shape.
   Settings > "Adjust Background": a FULL-window preview (bright frame = the graph's shape, rest dimmed) (drag = move, scroll = zoom, Esc = Done)
   plus Opacity / Zoom / Position X / Position Y sliders, Reset and Done. */
(function () {
  var root = document.documentElement;
  var IS_SETTINGS = /[?&]ext=settings/.test(location.search);
  var editor = null, prevBox = null, prevImg = null, prevFrame = null, frameW = 0, frameH = 0, editing = false, drag = null, ready = false;
  var sizes = {};                       // path -> { w, h } natural size (loaded once)
  var mo = null, moEl = null, fitting = false, lastAspect = "";

  function read(key, def) { try { var v = localStorage.getItem("neucurve_" + key); return v === null ? def : v; } catch (e) { return def; } }
  function write(key, val) { try { localStorage.setItem("neucurve_" + key, String(val)); } catch (e) { } }
  function num(v, lo, hi, d) { v = parseFloat(v); if (!isFinite(v)) { v = d; } return Math.max(lo, Math.min(hi, v)); }

  function broadcast(key, val) {
    try {
      var CE = window.CSEvent || (typeof CSEvent !== "undefined" ? CSEvent : null);
      if (!CE || !window.CSInterface) { return; }
      var ev = new CE("com.neucurve.sync", "APPLICATION");
      ev.data = JSON.stringify({ key: key, val: String(val), appId: "nc-bg" });
      new window.CSInterface().dispatchEvent(ev);
    } catch (e) { }
  }
  // opacity / zoom / position go through NeuCurve's own stores: persisted + synced to the other window by the
  // proven code path in assets/index.js (same as the opacity always did).
  var STORE_OF = { bgOpacity: "op", bgZoom: "zoom", bgPosX: "x", bgPosY: "y" };
  function setVal(key, val) {
    var S = window.__ncBgStores, st = S && S[STORE_OF[key]];
    write(key, val);
    if (st && st.set) { st.set(parseFloat(val)); } else { broadcast(key, val); }
  }
  function pushPos() {                  // after a drag (only localStorage was written while dragging)
    setVal("bgPosX", read("bgPosX", "50")); setVal("bgPosY", read("bgPosY", "50"));
  }

  function state() {
    return {
      path: String(read("bgImagePath", "") || ""),
      op: num(read("bgOpacity", "1"), 0, 1, 1),
      zoom: num(read("bgZoom", "100"), 100, 300, 100),
      x: num(read("bgPosX", "50"), 0, 100, 50),
      y: num(read("bgPosY", "50"), 0, 100, 50)
    };
  }

  /* ---------- natural image size ---------- */
  function withSize(path, cb) {
    if (sizes[path]) { cb(sizes[path]); return; }
    var im = new Image();
    im.onload = function () { sizes[path] = { w: im.naturalWidth || 1, h: im.naturalHeight || 1 }; cb(sizes[path]); };
    im.onerror = function () { };
    im.src = path;
  }
  // box (W x H) + natural size + zoom/pos -> drawn rectangle (CSS "cover" semantics)
  function place(W, H, nat, st) {
    var s = Math.max(W / nat.w, H / nat.h) * (st.zoom / 100);
    var dw = nat.w * s, dh = nat.h * s;
    return { x: (W - dw) * st.x / 100, y: (H - dh) * st.y / 100, w: dw, h: dh, range: { x: W - dw, y: H - dh } };
  }

  /* ---------- the REAL background: the <image> inside the graph SVG ---------- */
  function findImages(path) {
    var out = [], svgs = document.querySelectorAll("svg.curve-svg");
    for (var i = 0; i < svgs.length; i++) {
      var ims = svgs[i].querySelectorAll(":scope > image");
      for (var j = 0; j < ims.length; j++) {
        var h = ims[j].getAttribute("href") || ims[j].getAttributeNS("http://www.w3.org/1999/xlink", "href") || "";
        if (h === path || ims[j].getAttribute("data-ncbg") === "1") { out.push({ svg: svgs[i], img: ims[j] }); }
      }
    }
    return out;
  }
  function svgBox(svg) {
    var W = parseFloat(svg.getAttribute("width")), H = parseFloat(svg.getAttribute("height"));
    if (!(W > 0 && H > 0)) { var vb = (svg.getAttribute("viewBox") || "").split(/[\s,]+/); W = parseFloat(vb[2]); H = parseFloat(vb[3]); }
    return (W > 0 && H > 0) ? { w: W, h: H } : null;
  }
  function setAttr(el, k, v) { v = String(v); if (el.getAttribute(k) !== v) { el.setAttribute(k, v); } }

  function fitGraph() {
    if (IS_SETTINGS) { return; }
    var st = state(); if (!st.path) { return; }
    var found = findImages(st.path);
    if (!found.length) { return; }
    withSize(st.path, function (nat) {
      fitting = true;
      found.forEach(function (f) {
        var box = svgBox(f.svg); if (!box) { return; }
        var p = place(box.w, box.h, nat, st);
        setAttr(f.img, "data-ncbg", "1");   /* guarded: an identical write every 300 ms still fires mutation observers */
        setAttr(f.img, "preserveAspectRatio", "none");
        setAttr(f.img, "x", p.x.toFixed(2)); setAttr(f.img, "y", p.y.toFixed(2));
        setAttr(f.img, "width", p.w.toFixed(2)); setAttr(f.img, "height", p.h.toFixed(2));
        var asp = (box.w / box.h).toFixed(3);
        if (asp !== lastAspect) { lastAspect = asp; write("bgAspect", asp); broadcast("bgAspect", asp); }
      });
      if (mo) { mo.takeRecords(); }
      fitting = false;
      watchImage(found[0].img);
    });
  }
  // NeuCurve re-sets width/height/preserveAspectRatio itself when the graph is resized -> put our values back at once
  function watchImage(img) {
    if (typeof MutationObserver === "undefined" || moEl === img) { return; }
    if (mo) { mo.disconnect(); }
    moEl = img;
    mo = new MutationObserver(function () { if (!fitting) { fitGraph(); } });
    mo.observe(img, { attributes: true, attributeFilter: ["x", "y", "width", "height", "preserveAspectRatio", "href"] });
  }

  /* ---------- Settings window: preview frame with the graph's shape ---------- */
  // FULL-window preview: the whole Settings window shows the image; the bright frame is exactly what the graph
  // shows (same shape as the real graph), everything outside it is dimmed so you still see what is cropped away.
  function buildPreview() {
    if (prevBox) { return; }
    prevBox = document.createElement("div"); prevBox.id = "nc-bg-prev";
    prevImg = document.createElement("img"); prevImg.alt = ""; prevImg.draggable = false;
    prevFrame = document.createElement("div"); prevFrame.id = "nc-bg-frame";
    prevBox.appendChild(prevImg); prevBox.appendChild(prevFrame); document.body.appendChild(prevBox);
  }
  function layoutPreview() {
    if (!prevBox || !editing) { return; }
    var st = state();
    var asp = num(read("bgAspect", "1.385"), 0.4, 4, 1.385);
    var winW = window.innerWidth, winH = window.innerHeight;
    var availW = Math.max(120, winW - 24), availH = Math.max(90, winH - 215);   // keep the control panel clear
    frameW = Math.min(availW, availH * asp); frameH = frameW / asp;
    var fx = (winW - frameW) / 2, fy = 12 + Math.max(0, (availH - frameH) / 2);
    prevFrame.style.left = fx + "px"; prevFrame.style.top = fy + "px";
    prevFrame.style.width = frameW + "px"; prevFrame.style.height = frameH + "px";
    prevBox.style.display = st.path ? "block" : "none";
    if (prevImg.getAttribute("data-src") !== st.path) { prevImg.setAttribute("data-src", st.path); prevImg.src = st.path; }
    prevImg.style.opacity = String(st.op);
    withSize(st.path, function (nat) {
      var p = place(frameW, frameH, nat, st);
      prevImg.style.left = (fx + p.x) + "px"; prevImg.style.top = (fy + p.y) + "px";
      prevImg.style.width = p.w + "px"; prevImg.style.height = p.h + "px";
    });
  }

  var ROWS = [["op", "Opacity", 0, 100], ["zoom", "Zoom", 100, 300], ["x", "Position X", 0, 100], ["y", "Position Y", 0, 100]];
  function buildEditor() {
    if (editor) { return; }
    buildPreview();
    editor = document.createElement("div");
    editor.id = "nc-bg-editor";
    var h = '<div class="nc-bge-head"><strong>Adjust Background</strong><span>Drag to move &middot; scroll to zoom</span></div>';
    ROWS.forEach(function (r) {
      h += '<div class="nc-bge-row"><label>' + r[1] + '</label><input type="range" data-k="' + r[0] + '" min="' + r[2] + '" max="' + r[3] + '" step="1"><output data-o="' + r[0] + '"></output></div>';
    });
    h += '<div class="nc-bge-actions"><button type="button" id="nc-bge-reset">Reset</button><button type="button" id="nc-bge-done" class="primary">Done</button></div>';
    editor.innerHTML = h;
    document.body.appendChild(editor);

    editor.addEventListener("input", function (e) {
      var k = e.target.getAttribute && e.target.getAttribute("data-k"); if (!k) { return; }
      var v = parseFloat(e.target.value);
      if (k === "op") { setVal("bgOpacity", Math.round(v) / 100); }
      else { setVal(k === "zoom" ? "bgZoom" : k === "x" ? "bgPosX" : "bgPosY", v); }
      refresh();
    });
    document.getElementById("nc-bge-reset").addEventListener("click", function () {
      setVal("bgOpacity", 1); setVal("bgZoom", 100); setVal("bgPosX", 50); setVal("bgPosY", 50); refresh();
    });
    document.getElementById("nc-bge-done").addEventListener("click", closeEditor);

    document.addEventListener("mousedown", function (e) {
      if (!editing || e.button !== 0 || editor.contains(e.target)) { return; }
      var st = state(); drag = { x: e.clientX, y: e.clientY, vx: st.x, vy: st.y };
      document.body.classList.add("nc-bg-dragging"); e.preventDefault();
    }, true);
    document.addEventListener("mousemove", function (e) {
      if (!drag) { return; }
      var st = state(), nat = sizes[st.path]; if (!nat) { return; }
      var p = place(frameW, frameH, nat, st);
      // image follows the cursor: dx px = (W - drawnW) * dPos / 100
      if (Math.abs(p.range.x) > 0.5) { write("bgPosX", num(drag.vx + (e.clientX - drag.x) / p.range.x * 100, 0, 100, 50).toFixed(1)); }
      if (Math.abs(p.range.y) > 0.5) { write("bgPosY", num(drag.vy + (e.clientY - drag.y) / p.range.y * 100, 0, 100, 50).toFixed(1)); }
      refresh();
    }, true);
    function endDrag() {
      if (!drag) { return; }
      drag = null; document.body.classList.remove("nc-bg-dragging"); pushPos();
    }
    document.addEventListener("mouseup", endDrag, true);
    window.addEventListener("blur", endDrag);
    document.addEventListener("wheel", function (e) {
      if (!editing || editor.contains(e.target)) { return; }
      e.preventDefault();
      setVal("bgZoom", num(state().zoom + (e.deltaY < 0 ? 5 : -5), 100, 300, 100)); refresh();
    }, { passive: false, capture: true });
    window.addEventListener("resize", layoutPreview);
    document.addEventListener("keydown", function (e) { if (e.key === "Escape" && editing) { closeEditor(); } }, true);
  }

  function syncControls(st) {
    if (!editor) { return; }
    var vals = { op: Math.round(st.op * 100), zoom: Math.round(st.zoom), x: Math.round(st.x), y: Math.round(st.y) };
    Array.prototype.forEach.call(editor.querySelectorAll("input[data-k]"), function (el) {
      var k = el.getAttribute("data-k"); if (document.activeElement !== el) { el.value = vals[k]; }
      var o = editor.querySelector('output[data-o="' + k + '"]'); if (o) { o.textContent = vals[k] + "%"; }
    });
  }

  function refresh() {
    var st = state();
    if (IS_SETTINGS) { layoutPreview(); syncControls(st); } else { fitGraph(); }
  }

  function openEditor() {
    if (editing || !state().path) { return; }
    buildEditor(); editing = true;
    document.body.classList.add("nc-bg-edit");
    refresh();
  }
  function closeEditor() {
    if (!editing) { return; }
    editing = false; drag = null;
    document.body.classList.remove("nc-bg-edit", "nc-bg-dragging");
    if (prevBox) { prevBox.style.display = "none"; }
  }

  function onSync(ev) {
    try {
      var d = ev && ev.data; if (typeof d === "string") { d = JSON.parse(d); }
      if (d && /^(bgImagePath|bgOpacity|bgZoom|bgPosX|bgPosY|bgAspect)$/.test(d.key)) { write(d.key, d.val); refresh(); }
    } catch (e) { }
  }

  function init() {
    if (ready) { return; } ready = true;
    document.addEventListener("click", function (e) {
      var t = e.target; while (t && t !== document) { if (t.id === "nc-bg-edit-open") { openEditor(); return; } t = t.parentNode; }
    }, true);
    window.addEventListener("storage", function (e) { if (!e.key || e.key.indexOf("neucurve_bg") === 0) { refresh(); } });
    try { if (window.CSInterface) { new window.CSInterface().addEventListener("com.neucurve.sync", onSync); } } catch (e) { }
    var last = "";
    setInterval(function () {      // catches missed events + the graph being (re)created / resized
      if (window.__ncAway && window.__ncAway()) { return; }
      var st = state(), box = "";
      if (!IS_SETTINGS) { var s = document.querySelector("svg.curve-svg"); if (s) { box = s.getAttribute("width") + "x" + s.getAttribute("height"); } }
      var k = JSON.stringify(st) + box;
      if (k !== last) { last = k; refresh(); }
      else if (!IS_SETTINGS && st.path) { fitGraph(); }
    }, 300);
    refresh();
  }

  if (document.readyState === "loading") { document.addEventListener("DOMContentLoaded", init); } else { init(); }
})();
