/* Multi Tool - mt-shape.js  (PANEL side of the Shape tab)
   Tab "Shape": 103 shapes in 7 groups (data: js/mt-shape-data.js). Pick a tile, set Style / Insert as / Size / Stroke and the
   Modifiers, press "Add <name>" (or double-click a tile). host.jsx SHAPE_insert does the work in AE inside ONE undo group.
   Insert as:  Layer = new shape layer at the comp center | Mask = a mask on every selected layer | Matte = shape above the selected
               layer(s), set as alpha track matte.
   Modifiers (Layer + Matte): Animate in (Pop / Draw / Fade) + Duration, Repeater (Grid / Radial / Line, Count, Spacing), Round corners,
               Fit to text layer, Pulse on markers. Fit and Repeater cannot be combined.
   Storage: localStorage mtx.shapeState (JSON). Look: css/mt-shape.css. Needs window.__MT.Bridge / Store (js/main.js). ES5, Chromium-74 safe.
   Only transform, opacity and box-shadow are animated (plus the Modifiers card height); html[data-reduce-motion] turns every animation off. */
(function (w) {
  "use strict";
  var DATA = w.MTShapes;
  if (!DATA) { return; }
  var KEY = "shapeState";
  var DEF = { sel: "basic-hexagon", group: "All", style: "fill", mode: "layer", size: 240, stroke: 6, color: "#22E5F2",
              anim: "none", dur: 0.6, rep: "off", count: 6, spacing: 60, round: 0, fit: false, pulse: false, mods: false };
  var NOTE = {
    layer: "Creates a new shape layer at the center of the comp.",
    mask: "Adds the shape as a mask on every selected layer.",
    matte: "Creates the shape above the selected layer and sets it as the track matte."
  };
  var ICON_CHEV = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>';
  var ICON_SEARCH = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/></svg>';

  function mt() { return w.__MT || {}; }
  function load() {
    var st = {}, k, o = null;
    try { o = JSON.parse((mt().Store && mt().Store.get(KEY)) || "null"); } catch (e) { o = null; }
    for (k in DEF) { if (DEF.hasOwnProperty(k)) { st[k] = (o && typeof o[k] === typeof DEF[k]) ? o[k] : DEF[k]; } }
    if (!DATA.byId[st.sel]) { st.sel = DEF.sel; }
    if (st.group !== "All" && !groupById(st.group)) { st.group = "All"; }
    if (!/^#[0-9a-f]{6}$/i.test(st.color)) { st.color = DEF.color; }
    if (["fill", "stroke", "both"].indexOf(st.style) < 0) { st.style = "fill"; }
    if (["layer", "mask", "matte"].indexOf(st.mode) < 0) { st.mode = "layer"; }
    if (["none", "pop", "draw", "fade"].indexOf(st.anim) < 0) { st.anim = "none"; }
    if (["off", "grid", "radial", "line"].indexOf(st.rep) < 0) { st.rep = "off"; }
    if (st.rep !== "off" && st.fit) { st.fit = false; }
    return st;
  }
  function groupById(id) { var i; for (i = 0; i < DATA.groups.length; i++) { if (DATA.groups[i].id === id) { return DATA.groups[i]; } } return null; }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function clamp(v, lo, hi, d) { v = parseFloat(v); if (!isFinite(v)) { v = d; } return Math.max(lo, Math.min(hi, v)); }
  function f2(n) { return Math.round(n * 100) / 100; }

  /* ---------------- colors ---------------- */
  function rgb(hex) { var n = parseInt(hex.replace("#", ""), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  function hex(c) { return "#" + ((1 << 24) + (Math.round(c[0]) << 16) + (Math.round(c[1]) << 8) + Math.round(c[2])).toString(16).slice(1).toUpperCase(); }
  function mix(a, b, t) { var x = rgb(a), y = rgb(b); return hex([x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t]); }
  function tone(base, t) {
    if (t === "d") { return mix(base, "#000000", 0.62); }
    if (t === "k") { return mix(base, "#000000", 0.9); }
    if (t === "l") { return mix(base, "#FFFFFF", 0.8); }
    return base;
  }
  var ICON_OP = { c: 1, d: 0.34, k: 0.62, l: 0.82 };

  /* ---------------- SVG (tiles, preview) ---------------- */
  function geomSvg(p, attrs) {
    if (p.t === "r") { return '<rect x="' + p.x + '" y="' + p.y + '" width="' + p.w + '" height="' + p.h + '"' + (p.r ? ' rx="' + p.r + '"' : "") + attrs + "/>"; }
    if (p.t === "e") { return '<ellipse cx="' + p.x + '" cy="' + p.y + '" rx="' + (p.w / 2) + '" ry="' + (p.h / 2) + '"' + attrs + "/>"; }
    return '<path d="' + p.d + '"' + attrs + "/>";
  }
  // mode "icon": monochrome (currentColor); "color": the real colors of the chosen Style
  function shapeSvg(sh, mode, st) {
    var pad = Math.max(sh.w, sh.h) * 0.05, sw, i, p, a, out = "", base = st ? st.color : "#FFFFFF";
    sw = mode === "icon" ? Math.max(sh.w, sh.h) * 0.05 : Math.max(0.6, st.stroke / st.size * Math.max(sh.w, sh.h));
    for (i = 0; i < sh.parts.length; i++) {
      p = sh.parts[i];
      if (mode === "icon") {
        a = p.f === "n" ? ' fill="none" stroke="currentColor" stroke-width="' + f2(sw) + '"' : ' fill="currentColor" fill-opacity="' + ICON_OP[p.f] + '"';
      } else if (st.style === "stroke" || p.f === "n") {
        a = ' fill="none" stroke="' + base + '" stroke-width="' + f2(sw) + '"';
      } else {
        a = ' fill="' + tone(base, p.f) + '"' + (st.style === "both" ? ' stroke="' + base + '" stroke-width="' + f2(sw) + '"' : "");
      }
      out += geomSvg(p, a + ' stroke-linecap="round" stroke-linejoin="round"');
    }
    return '<svg viewBox="' + f2(-pad) + " " + f2(-pad) + " " + f2(sh.w + pad * 2) + " " + f2(sh.h + pad * 2) + '" aria-hidden="true" preserveAspectRatio="xMidYMid meet">' + out + "</svg>";
  }

  /* ---------------- payload for host.jsx (px, centered on the shape's own center) ---------------- */
  function buildPayload(sh, st) {
    var s = st.size / Math.max(sh.w, sh.h), cx = sh.w / 2, cy = sh.h / 2, parts = [], i, j, p, g, c, nodes, k, base = st.color;
    for (i = 0; i < sh.parts.length; i++) {
      p = sh.parts[i];
      if (p.t === "r") {
        g = { t: "r", x: f2((p.x + p.w / 2 - cx) * s), y: f2((p.y + p.h / 2 - cy) * s), w: f2(p.w * s), h: f2(p.h * s), r: f2(Math.min(p.r * s, p.w * s / 2, p.h * s / 2)) };
      } else if (p.t === "e") {
        g = { t: "e", x: f2((p.x - cx) * s), y: f2((p.y - cy) * s), w: f2(p.w * s), h: f2(p.h * s) };
      } else {
        nodes = DATA.toNodes(p.d); c = [];
        for (j = 0; j < nodes.length; j++) {
          k = nodes[j];
          c.push({ c: k.c, v: k.v.map(function (q) { return [f2((q[0] - cx) * s), f2((q[1] - cy) * s)]; }),
                   i: k.i.map(function (q) { return [f2(q[0] * s), f2(q[1] * s)]; }), o: k.o.map(function (q) { return [f2(q[0] * s), f2(q[1] * s)]; }) });
        }
        g = { t: "p", paths: c };
      }
      g.n = p.n;
      if (st.style === "stroke" || p.f === "n") { g.fill = null; g.stroke = base; }
      else { g.fill = tone(base, p.f); g.stroke = st.style === "both" ? base : null; }
      parts.push(g);
    }
    return {
      name: sh.name, group: sh.group, w: f2(sh.w * s), h: f2(sh.h * s), mode: st.mode, strokeW: st.stroke, parts: parts,
      anim: st.anim, dur: st.dur, rep: st.rep, count: st.count, spacing: st.spacing, round: st.round, fit: !!st.fit, pulse: !!st.pulse
    };
  }

  /* ---------------- the tab ---------------- */
  function render() {
    var st = load(), M = mt(), Bridge = M.Bridge, Store = M.Store;
    var wrap = document.createElement("div");
    wrap.className = "ta sh-root";
    var busy = false, selSh = DATA.byId[st.sel];

    function save() { try { Store.set(KEY, JSON.stringify(st)); } catch (e) { } }
    function toast(m, err) { if (M.toast) { M.toast(m, !!err); } }

    wrap.innerHTML =
      '<div class="sh-top">' +
        '<span class="sh-count" id="sh-count"></span>' +
        '<label class="sh-search">' + ICON_SEARCH + '<input type="text" id="sh-q" placeholder="Search shapes" spellcheck="false" autocomplete="off" aria-label="Search shapes"></label>' +
      "</div>" +
      '<div class="sh-chips" id="sh-chips" role="tablist" aria-label="Shape groups"></div>' +
      '<div class="sh-list" id="sh-list"></div>' +
      '<section class="sh-mods" id="sh-mods">' +
        '<button type="button" class="sh-mods-head" id="sh-mods-head" aria-expanded="false"><b>Modifiers</b>' + ICON_CHEV + "</button>" +
        '<div class="sh-mods-body" id="sh-mods-body"><div class="sh-mods-in">' +
          '<div class="sh-lab">Animate in</div>' + seg("anim", [["none", "None"], ["pop", "Pop"], ["draw", "Draw"], ["fade", "Fade"]]) +
          slider("dur", "Duration", 0.1, 3, 0.1, "s") +
          '<div class="sh-lab">Repeater</div>' + seg("rep", [["off", "Off"], ["grid", "Grid"], ["radial", "Radial"], ["line", "Line"]]) +
          '<div class="sh-two">' + slider("count", "Count", 2, 24, 1, "") + slider("spacing", "Spacing", 0, 600, 1, " px") + "</div>" +
          slider("round", "Round corners", 0, 200, 1, " px") +
          '<label class="sh-check"><input type="checkbox" id="sh-fit"><span class="sh-box"></span><span>Fit to text layer (box follows the text)</span></label>' +
          '<label class="sh-check"><input type="checkbox" id="sh-pulse"><span class="sh-box"></span><span>Pulse on markers (beat sync)</span></label>' +
          '<p class="sh-hint" id="sh-mods-hint"></p>' +
        "</div></div>" +
      "</section>" +
      '<section class="sh-dock">' +
        '<div class="sh-prev"><div class="sh-prev-ico" id="sh-prev-ico"></div>' +
          '<div class="sh-prev-txt"><b id="sh-prev-name"></b><span id="sh-prev-sub"></span></div>' +
          '<label class="sh-color" title="Shape color"><input type="color" id="sh-color" aria-label="Shape color"><span></span></label></div>' +
        '<div class="sh-opts">' +
          '<div><div class="sh-lab">Style</div>' + seg("style", [["fill", "Fill"], ["stroke", "Stroke"], ["both", "Both"]]) + "</div>" +
          '<div><div class="sh-lab">Insert as</div>' + seg("mode", [["layer", "Layer"], ["mask", "Mask"], ["matte", "Matte"]]) + "</div>" +
        "</div>" +
        '<p class="sh-desc" id="sh-desc"></p>' +
        '<div class="sh-two">' + slider("size", "Size", 10, 2000, 1, " px") + slider("stroke", "Stroke", 1, 80, 1, " px") + "</div>" +
        '<button type="button" class="btn btn-primary sh-add" id="sh-add"></button>' +
      "</section>";

    function seg(key, opts) {
      var i, h = '<div class="sh-seg" data-seg="' + key + '" role="radiogroup" style="--n:' + opts.length + '"><i class="sh-seg-ind" aria-hidden="true"></i>';
      for (i = 0; i < opts.length; i++) { h += '<button type="button" role="radio" class="sh-seg-b" data-v="' + opts[i][0] + '">' + opts[i][1] + "</button>"; }
      return h + "</div>";
    }
    function slider(key, label, min, max, step, unit) {
      return '<div class="sh-sl" data-sl="' + key + '"><div class="sh-sl-h"><label for="sh-r-' + key + '">' + label + '</label><output id="sh-o-' + key + '"></output></div>' +
        '<input type="range" id="sh-r-' + key + '" min="' + min + '" max="' + max + '" step="' + step + '" data-unit="' + unit + '"></div>';
    }
    function q(sel) { return wrap.querySelector(sel); }
    function qa(sel) { return Array.prototype.slice.call(wrap.querySelectorAll(sel)); }

    /* ----- chips + list ----- */
    var chips = q("#sh-chips"), list = q("#sh-list"), search = q("#sh-q"), query = "";
    (function () {
      var h = '<button type="button" role="tab" class="sh-chip" data-g="All">All</button>', i;
      for (i = 0; i < DATA.groups.length; i++) { h += '<button type="button" role="tab" class="sh-chip" data-g="' + DATA.groups[i].id + '">' + DATA.groups[i].id + "</button>"; }
      chips.innerHTML = h;
    })();
    function paintChips() {
      qa(".sh-chip").forEach(function (b) { var on = b.getAttribute("data-g") === st.group; b.classList.toggle("is-active", on); b.setAttribute("aria-selected", String(on)); });
    }
    function matches(sh) { return !query || sh.name.toLowerCase().indexOf(query) >= 0 || sh.group.toLowerCase().indexOf(query) >= 0; }
    function renderList() {
      var h = "", total = 0, gi, si, g, items, n = 0, sh;
      for (gi = 0; gi < DATA.groups.length; gi++) {
        g = DATA.groups[gi];
        if (st.group !== "All" && st.group !== g.id) { continue; }
        items = DATA.shapes.filter(function (s) { return s.group === g.id && matches(s); });
        if (!items.length) { continue; }
        total += items.length;
        h += '<div class="sh-gh"><b>' + g.id + "</b><span>" + esc(g.note) + '</span></div><div class="sh-grid">';
        for (si = 0; si < items.length; si++) {
          sh = items[si];
          h += '<button type="button" class="sh-tile' + (sh.id === st.sel ? " is-sel" : "") + '" data-id="' + sh.id + '" style="--d:' + (Math.min(n++, 20) * 16) + 'ms" title="' + esc(sh.name) + '" aria-label="' + esc(sh.name) + '">' +
            '<span class="sh-tile-ico">' + shapeSvg(sh, "icon") + "</span><span class='sh-tile-n'>" + esc(sh.name) + "</span></button>";
        }
        h += "</div>";
      }
      list.innerHTML = h || '<p class="sh-empty">No shapes match "' + esc(query) + '".</p>';
      q("#sh-count").textContent = (query || st.group !== "All" ? total + " of " : "") + DATA.shapes.length + " shapes";
    }

    /* ----- preview + controls ----- */
    function paintPreview(pop) {
      var ico = q("#sh-prev-ico"), parts = selSh.parts.length;
      ico.innerHTML = shapeSvg(selSh, "color", st);
      if (pop) { ico.classList.remove("sh-pop"); void ico.offsetWidth; ico.classList.add("sh-pop"); }
      q("#sh-prev-name").textContent = selSh.name;
      q("#sh-prev-sub").textContent = selSh.group + (parts > 1 ? " - " + parts + " parts" : "");
      q("#sh-add").textContent = "Add " + selSh.name;
    }
    function fmt(key, v) { var u = q("#sh-r-" + key).getAttribute("data-unit"); return (key === "dur" ? f2(v) : Math.round(v)) + u; }
    function paintControls() {
      qa(".sh-seg").forEach(function (sg) {
        var key = sg.getAttribute("data-seg"), btns = sg.querySelectorAll(".sh-seg-b"), i, idx = 0;
        for (i = 0; i < btns.length; i++) { var on = btns[i].getAttribute("data-v") === String(st[key]); btns[i].classList.toggle("is-active", on); btns[i].setAttribute("aria-checked", String(on)); if (on) { idx = i; } }
        sg.querySelector(".sh-seg-ind").style.transform = "translateX(" + (idx * 100) + "%)";
      });
      ["dur", "count", "spacing", "round", "size", "stroke"].forEach(function (k) { var r = q("#sh-r-" + k); r.value = st[k]; q("#sh-o-" + k).textContent = fmt(k, st[k]); });
      q("#sh-color").value = st.color; q(".sh-color span").style.background = st.color;
      q("#sh-fit").checked = !!st.fit; q("#sh-pulse").checked = !!st.pulse;
      q("#sh-desc").textContent = NOTE[st.mode];
      var repOn = st.rep !== "off";
      q('[data-sl="count"]').classList.toggle("is-off", !repOn);
      q('[data-sl="spacing"]').classList.toggle("is-off", !repOn);
      q('[data-sl="dur"]').classList.toggle("is-off", st.anim === "none");
      q("#sh-fit").disabled = repOn; q("#sh-fit").parentNode.classList.toggle("is-off", repOn);
      var fitOn = !!st.fit;
      qa('[data-seg="rep"] .sh-seg-b').forEach(function (b) { if (b.getAttribute("data-v") !== "off") { b.disabled = fitOn; } });
      q('[data-seg="rep"]').classList.toggle("is-off", fitOn);
      q("#sh-mods-hint").textContent = st.mode === "mask" ? "Mask mode only adds the path: modifiers are ignored." :
        (st.anim === "draw" && st.style === "fill" ? "Draw works best with Stroke or Both." : (fitOn ? "Select the text layer first. The box is placed behind it." : ""));
      q("#sh-mods").classList.toggle("is-ignored", st.mode === "mask");
    }
    function select(id, pop) {
      var sh = DATA.byId[id]; if (!sh) { return; }
      st.sel = id; selSh = sh; save();
      qa(".sh-tile.is-sel").forEach(function (t) { t.classList.remove("is-sel"); });
      var t = q('.sh-tile[data-id="' + id + '"]');
      if (t) { t.classList.add("is-sel"); t.classList.remove("sh-flash"); void t.offsetWidth; t.classList.add("sh-flash"); }
      paintPreview(pop !== false);
    }

    /* ----- Modifiers card open / close (height tween) ----- */
    var mods = q("#sh-mods"), mbody = q("#sh-mods-body"), mhead = q("#sh-mods-head");
    function setMods(open, instant) {
      mods.classList.toggle("is-open", open);
      mhead.setAttribute("aria-expanded", String(open));
      if (instant) { mbody.style.maxHeight = open ? "none" : "0px"; return; }
      if (open) {
        mbody.style.maxHeight = mbody.scrollHeight + "px";
        setTimeout(function () { if (mods.classList.contains("is-open")) { mbody.style.maxHeight = "none"; } }, 420);
      } else {
        mbody.style.maxHeight = mbody.scrollHeight + "px"; void mbody.offsetWidth; mbody.style.maxHeight = "0px";
      }
    }
    mhead.addEventListener("click", function () { st.mods = !mods.classList.contains("is-open"); save(); setMods(st.mods, false); });

    /* ----- events ----- */
    chips.addEventListener("click", function (e) {
      var b = e.target.closest ? e.target.closest(".sh-chip") : null; if (!b) { return; }
      st.group = b.getAttribute("data-g"); save(); paintChips(); renderList();
      list.classList.remove("sh-swap"); void list.offsetWidth; list.classList.add("sh-swap");
    });
    search.addEventListener("input", function () { query = search.value.trim().toLowerCase(); renderList(); });
    list.addEventListener("click", function (e) { var t = e.target.closest ? e.target.closest(".sh-tile") : null; if (t) { select(t.getAttribute("data-id")); } });
    list.addEventListener("dblclick", function (e) { var t = e.target.closest ? e.target.closest(".sh-tile") : null; if (t) { select(t.getAttribute("data-id"), false); add(); } });
    wrap.addEventListener("click", function (e) {
      var b = e.target.closest ? e.target.closest(".sh-seg-b") : null; if (!b || b.disabled) { return; }
      var key = b.parentNode.getAttribute("data-seg"), v = b.getAttribute("data-v");
      st[key] = v;
      if (key === "rep" && v !== "off") { st.fit = false; }
      save(); paintControls(); if (key === "style") { paintPreview(false); }
    });
    ["dur", "count", "spacing", "round", "size", "stroke"].forEach(function (k) {
      var r = q("#sh-r-" + k);
      r.addEventListener("input", function () { st[k] = parseFloat(r.value); q("#sh-o-" + k).textContent = fmt(k, st[k]); if (k === "stroke" || k === "size") { paintPreview(false); } });
      r.addEventListener("change", save);
    });
    q("#sh-fit").addEventListener("change", function (e) { st.fit = e.target.checked; if (st.fit) { st.rep = "off"; } save(); paintControls(); });
    q("#sh-pulse").addEventListener("change", function (e) { st.pulse = e.target.checked; save(); });
    q("#sh-color").addEventListener("input", function (e) { st.color = e.target.value.toUpperCase(); q(".sh-color span").style.background = st.color; paintPreview(false); });
    q("#sh-color").addEventListener("change", function (e) { st.color = e.target.value.toUpperCase(); save(); });

    function add() {
      if (busy) { return; }
      var btn = q("#sh-add"), payload = buildPayload(selSh, st);
      busy = true; btn.classList.add("is-pending");
      Bridge.call("SHAPE_insert", [JSON.stringify(payload)]).then(function (res) {
        busy = false; btn.classList.remove("is-pending");
        toast(res.message || (res.ok ? "Shape added." : "Something went wrong."), !res.ok);
        if (res.ok) { btn.classList.remove("sh-done"); void btn.offsetWidth; btn.classList.add("sh-done"); }
      });
    }
    q("#sh-add").addEventListener("click", add);

    /* ----- first paint ----- */
    paintChips(); renderList(); paintControls(); paintPreview(true); setMods(!!st.mods, true);
    return wrap;
  }

  w.MTShapeTab = { render: render, buildPayload: buildPayload, shapeSvg: shapeSvg };
})(window);
