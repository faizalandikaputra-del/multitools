/* Multi Tool - mt-shape.js  (PANEL side of the Shape tab)
   Tab "Shape": 103 shapes in 7 groups (data: js/mt-shape-data.js). Pick a tile, set Style / Insert as / Size / Stroke and the
   Modifiers, press "Add <name>" (or double-click a tile). host.jsx SHAPE_insert does the work in AE inside ONE undo group.
   Insert as:  Layer = new shape layer at the comp center | Mask = a mask on every selected layer | Matte = shape above the selected
               layer(s), set as alpha track matte.
   Modifiers (Layer + Matte): Animate in (Pop / Draw / Fade) + Duration, Repeater (Grid / Radial / Line, Count, Spacing), Round corners,
               Fit to text layer, Pulse on markers. Fit and Repeater cannot be combined.
   Group "Mine" = your own shapes: the "+" button next to the search opens a Save bar; "Save" reads the shape you selected in After Effects
   (host.jsx SHAPE_capture) and keeps it in localStorage mtx.shapeMine (max 60). A saved tile has a delete cross (press twice).
   Storage: localStorage mtx.shapeState (JSON). Look: css/mt-shape.css. Needs window.__MT.Bridge / Store (js/main.js). ES5, Chromium-74 safe.
   Only transform, opacity and box-shadow are animated (plus the Modifiers card height); html[data-reduce-motion] turns every animation off. */
(function (w) {
  "use strict";
  var DATA = w.MTShapes;
  if (!DATA) { return; }
  var KEY = "shapeState";
  var DEF = { sel: "basic-hexagon", group: "All", style: "fill", mode: "layer", size: 240, stroke: 6, color: "#22E5F2",
              anim: "none", dur: 0.6, rep: "off", count: 6, spacing: 60, round: 0, fit: false, pulse: false, mods: false };
  var ICON_CHEV = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>';
  var ICON_X = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7l10 10M17 7L7 17"/></svg>';
  var ICON_PLUS = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>';
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

  /* ---------------- Mine: the user's own shapes ---------------- */
  var MINE_KEY = "shapeMine", MINE_ID = "Mine", MINE_MAX = 60, MINE_NOTE = "Shapes you saved from After Effects";
  function mineList() {
    var raw = null, out = [], i, sh;
    try { raw = JSON.parse((mt().Store && mt().Store.get(MINE_KEY)) || "[]"); } catch (e) { raw = []; }
    if (!(raw instanceof Array)) { return out; }
    for (i = 0; i < raw.length && out.length < MINE_MAX; i++) {
      sh = raw[i];
      if (sh && typeof sh.id === "string" && typeof sh.name === "string" && sh.w > 0 && sh.h > 0 && sh.parts instanceof Array && sh.parts.length) { sh.group = MINE_ID; out.push(sh); }
    }
    return out;
  }
  function mineSync(list) {      // DATA.shapes / byId always mirror the saved list (called on start and after every save / delete)
    var i, keep = [];
    for (i = 0; i < DATA.shapes.length; i++) { if (DATA.shapes[i].group === MINE_ID) { delete DATA.byId[DATA.shapes[i].id]; } else { keep.push(DATA.shapes[i]); } }
    DATA.shapes.length = 0;
    for (i = 0; i < keep.length; i++) { DATA.shapes.push(keep[i]); }
    for (i = 0; i < list.length; i++) { DATA.shapes.push(list[i]); DATA.byId[list[i].id] = list[i]; }
  }
  function mineEnsure() {
    var has = false, i;
    for (i = 0; i < DATA.groups.length; i++) { if (DATA.groups[i].id === MINE_ID) { has = true; } }
    if (!has) { DATA.groups.push({ id: MINE_ID, note: MINE_NOTE }); }
    mineSync(mineList());
  }
  function mineStore(list) { try { return !!(mt().Store && mt().Store.set(MINE_KEY, JSON.stringify(list))); } catch (e) { return false; } }
  function nz(a) { return Math.abs(a[0]) > 0.001 || Math.abs(a[1]) > 0.001; }
  function contourD(c, dx, dy) {      // nodes -> "M L C Z" (what MTShapes.toNodes reads back)
    var n = c.v.length, k, d, a, b, e;
    function pt(x, y) { return f2(x - dx) + " " + f2(y - dy); }
    d = "M" + pt(c.v[0][0], c.v[0][1]);
    for (k = 1; k < n; k++) {
      a = c.o[k - 1]; b = c.i[k]; e = c.v[k];
      d += (nz(a) || nz(b)) ? "C" + pt(c.v[k - 1][0] + a[0], c.v[k - 1][1] + a[1]) + " " + pt(e[0] + b[0], e[1] + b[1]) + " " + pt(e[0], e[1]) : "L" + pt(e[0], e[1]);
    }
    if (c.c) {
      a = c.o[n - 1]; b = c.i[0];
      if (nz(a) || nz(b)) { d += "C" + pt(c.v[n - 1][0] + a[0], c.v[n - 1][1] + a[1]) + " " + pt(c.v[0][0] + b[0], c.v[0][1] + b[1]) + " " + pt(c.v[0][0], c.v[0][1]); }
      d += "Z";
    }
    return d;
  }
  // SHAPE_capture data (AE px) -> a shape of the Shape tab: moved so its top-left is 0,0, w x h = its size
  function mineBuild(cap, name) {
    var x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9, i, j, k, p, c, parts = [], d, closedAll, W, H, np;
    function ext(x, y) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
    for (i = 0; i < cap.parts.length; i++) {
      p = cap.parts[i];
      if (p.t === "p") { for (j = 0; j < p.paths.length; j++) { for (k = 0; k < p.paths[j].v.length; k++) { ext(p.paths[j].v[k][0], p.paths[j].v[k][1]); } } }
      else if (p.t === "r") { ext(p.x, p.y); ext(p.x + p.w, p.y + p.h); }
      else if (p.t === "e") { ext(p.x - p.w / 2, p.y - p.h / 2); ext(p.x + p.w / 2, p.y + p.h / 2); }
    }
    if (!(x1 >= x0 && y1 >= y0)) { return null; }
    W = Math.max(1, f2(x1 - x0)); H = Math.max(1, f2(y1 - y0));
    for (i = 0; i < cap.parts.length; i++) {
      p = cap.parts[i]; np = { n: String(p.n || "Part").slice(0, 40), f: p.fill ? "c" : "n" };
      if (p.t === "p") {
        d = ""; closedAll = true;
        for (j = 0; j < p.paths.length; j++) { c = p.paths[j]; if (c.v.length < 2) { continue; } d += contourD(c, x0, y0); if (!c.c) { closedAll = false; } }
        if (!d) { continue; }
        np.t = "p"; np.d = d; if (!closedAll) { np.f = "n"; }
      } else if (p.t === "r") { np.t = "r"; np.x = f2(p.x - x0); np.y = f2(p.y - y0); np.w = f2(p.w); np.h = f2(p.h); np.r = f2(p.r || 0); }
      else if (p.t === "e") { np.t = "e"; np.x = f2(p.x - x0); np.y = f2(p.y - y0); np.w = f2(p.w); np.h = f2(p.h); }
      else { continue; }
      parts.push(np);
    }
    if (!parts.length) { return null; }
    return { id: "mine-" + Date.now().toString(36) + Math.floor(Math.random() * 1296).toString(36), name: name, group: MINE_ID, w: W, h: H, parts: parts };
  }

  /* ---------------- the tab ---------------- */
  var activeOff = null;   // removes the floating button of the tab that is currently shown
  function render() {
    mineEnsure();
    var st = load(), M = mt(), Bridge = M.Bridge, Store = M.Store;
    var wrap = document.createElement("div");
    wrap.className = "ta sh-root";
    var busy = false, selSh = DATA.byId[st.sel];

    function save() { try { Store.set(KEY, JSON.stringify(st)); } catch (e) { } }
    function toast(m, err) { if (M.toast) { M.toast(m, !!err); } }

    var pop = document.createElement("div");
    wrap.innerHTML =
      '<div class="sh-top">' +
        '<div class="sh-sel"><select id="sh-group" class="sh-select" aria-label="Shape type"></select><span class="sh-sel-chev" aria-hidden="true">' + ICON_CHEV + "</span></div>" +
        '<button type="button" class="sh-mine-add" id="sh-mine-add" aria-expanded="false" aria-controls="sh-save" title="Save my own shape" aria-label="Save my own shape">' + ICON_PLUS + "</button>" +
      "</div>" +
      '<div class="sh-save" id="sh-save" hidden>' +
        '<p class="sh-save-t"><b>Save my shape</b></p>' +
        '<div class="sh-save-r"><input type="text" id="sh-save-name" maxlength="40" placeholder="Name (optional)" spellcheck="false" autocomplete="off" aria-label="Shape name"><button type="button" class="btn btn-primary sh-save-go" id="sh-save-go">Save</button></div>' +
      "</div>" +
      '<label class="sh-search">' + ICON_SEARCH + '<input type="text" id="sh-q" placeholder="Search shapes" spellcheck="false" autocomplete="off" aria-label="Search shapes"><span class="sh-count" id="sh-count"></span></label>' +
      '<div class="sh-list" id="sh-list"></div>';
    pop.className = "sh-popbox";
    pop.innerHTML =
      '<div class="sh-pop-scroll">' +
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
          '<div class="sh-two">' + slider("size", "Size", 10, 2000, 1, " px") + slider("stroke", "Stroke", 1, 80, 1, " px") + "</div>" +
        "</section>" +
      "</div>" +
      '<button type="button" class="btn btn-primary sh-add" id="sh-add"></button>';

    function seg(key, opts) {
      var i, h = '<div class="sh-seg" data-seg="' + key + '" role="radiogroup" style="--n:' + opts.length + '"><i class="sh-seg-ind" aria-hidden="true"></i>';
      for (i = 0; i < opts.length; i++) { h += '<button type="button" role="radio" class="sh-seg-b" data-v="' + opts[i][0] + '">' + opts[i][1] + "</button>"; }
      return h + "</div>";
    }
    function slider(key, label, min, max, step, unit) {
      return '<div class="sh-sl" data-sl="' + key + '"><div class="sh-sl-h"><label for="sh-r-' + key + '">' + label + '</label><output id="sh-o-' + key + '"></output></div>' +
        '<input type="range" id="sh-r-' + key + '" min="' + min + '" max="' + max + '" step="' + step + '" data-unit="' + unit + '"></div>';
    }
    function q(sel) { return wrap.querySelector(sel) || pop.querySelector(sel); }
    function qa(sel) { return Array.prototype.slice.call(wrap.querySelectorAll(sel)).concat(Array.prototype.slice.call(pop.querySelectorAll(sel))); }

    /* ----- type dropdown + list ----- */
    var gsel = q("#sh-group"), list = q("#sh-list"), search = q("#sh-q"), query = "";
    function groupCount(id) { var i, n = 0; for (i = 0; i < DATA.shapes.length; i++) { if (id === "All" || DATA.shapes[i].group === id) { n++; } } return n; }
    function paintChips() {      // (name kept) rebuilds the type options with their counts and shows the current one
      var h = '<option value="All">All types (' + groupCount("All") + ")</option>", i, id;
      for (i = 0; i < DATA.groups.length; i++) { id = DATA.groups[i].id; h += '<option value="' + id + '">' + id + " (" + groupCount(id) + ")</option>"; }
      gsel.innerHTML = h; gsel.value = st.group;
      if (gsel.value !== st.group) { st.group = "All"; gsel.value = "All"; }
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
        h += '<div class="sh-gh"><b>' + g.id + '</b></div><div class="sh-grid">';
        for (si = 0; si < items.length; si++) {
          sh = items[si];
          h += '<button type="button" class="sh-tile' + (sh.id === st.sel ? " is-sel" : "") + '" data-id="' + sh.id + '" style="--d:' + (Math.min(n++, 20) * 16) + 'ms" title="' + esc(sh.name) + '" aria-label="' + esc(sh.name) + '">' +
            '<span class="sh-tile-ico">' + shapeSvg(sh, "icon") + "</span><span class='sh-tile-n'>" + esc(sh.name) + "</span>" +
            (sh.group === MINE_ID ? '<span class="sh-tile-x" role="button" tabindex="-1" data-del="' + sh.id + '" title="Delete this shape" aria-label="Delete ' + esc(sh.name) + '">' + ICON_X + "</span>" : "") + "</button>";
        }
        h += "</div>";
      }
      if (!h && st.group === MINE_ID && !query) {
        h = '<div class="sh-mine-empty"><b>No shapes of your own yet</b><button type="button" class="btn sh-mine-open" id="sh-mine-open">Save a shape</button></div>';
      }
      list.innerHTML = h || '<p class="sh-empty">No shapes match "' + esc(query) + '".</p>';
      q("#sh-count").textContent = query || st.group !== "All" ? total + "/" + DATA.shapes.length : String(DATA.shapes.length);
      q("#sh-count").title = DATA.shapes.length + " shapes in total";
    }

    /* ----- preview + controls ----- */
    function paintPreview(pop) {
      var ico = q("#sh-prev-ico"), parts = selSh.parts.length;
      ico.innerHTML = shapeSvg(selSh, "color", st);
      if (pop) { ico.classList.remove("sh-pop"); void ico.offsetWidth; ico.classList.add("sh-pop"); }
      q("#sh-prev-name").textContent = selSh.name;
      q("#sh-prev-sub").textContent = selSh.group + (parts > 1 ? " - " + parts + " parts" : "");
      q("#sh-add").textContent = "Add " + selSh.name;
      fabPaint();
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
    mhead.addEventListener("click", function () { st.mods = !mods.classList.contains("is-open"); save(); setMods(st.mods, false); [60, 200, 440].forEach(function (ms) { setTimeout(fabOrient, ms); }); });

    /* ----- events ----- */
    gsel.addEventListener("change", function () {
      st.group = gsel.value; save(); renderList();
      list.classList.remove("sh-swap"); void list.offsetWidth; list.classList.add("sh-swap");
    });
    search.addEventListener("input", function () { query = search.value.trim().toLowerCase(); renderList(); });
    list.addEventListener("click", function (e) {
      var x = e.target.closest ? e.target.closest(".sh-tile-x") : null, t;
      if (x) { e.stopPropagation(); mineDelete(x); return; }
      if (e.target.closest && e.target.closest("#sh-mine-open")) { setSave(true); return; }
      t = e.target.closest ? e.target.closest(".sh-tile") : null; if (t) { select(t.getAttribute("data-id")); }
    });
    list.addEventListener("dblclick", function (e) {
      if (e.target.closest && e.target.closest(".sh-tile-x")) { return; }
      var t = e.target.closest ? e.target.closest(".sh-tile") : null; if (t) { select(t.getAttribute("data-id"), false); add(); }
    });

    /* ----- Mine: save bar, save, delete ----- */
    var saveBar = q("#sh-save"), saveBtn = q("#sh-save-go"), saveName = q("#sh-save-name"), plusBtn = q("#sh-mine-add"), saving = false, delTimer = 0;
    function setSave(on) {
      saveBar.hidden = !on; plusBtn.classList.toggle("is-on", on); plusBtn.setAttribute("aria-expanded", String(on));
      if (on) { saveBar.classList.remove("sh-swap"); void saveBar.offsetWidth; saveBar.classList.add("sh-swap"); try { saveName.focus(); } catch (e) { } }
    }
    function afterMineChange(pickId) {
      if (pickId) { st.group = MINE_ID; st.sel = pickId; selSh = DATA.byId[pickId]; save(); }
      else if (!DATA.byId[st.sel]) { st.sel = DEF.sel; selSh = DATA.byId[st.sel]; save(); }
      paintChips(); renderList(); paintPreview(!!pickId);
    }
    function mineSave() {
      if (saving) { return; }
      saving = true; saveBtn.classList.add("is-pending");
      Bridge.call("SHAPE_capture", []).then(function (res) {
        saving = false; saveBtn.classList.remove("is-pending");
        if (!res || !res.ok || !res.data || !res.data.parts) { toast((res && res.message) || "Could not read the shape.", true); return; }
        var list = mineList(), name = (saveName.value || "").replace(/^\s+|\s+$/g, "") || String(res.data.name || "").replace(/^\s+|\s+$/g, "") || ("My shape " + (list.length + 1)), sh;
        if (list.length >= MINE_MAX) { toast("Mine is full (" + MINE_MAX + " shapes). Delete one first.", true); return; }
        sh = mineBuild(res.data, name.slice(0, 40));
        if (!sh) { toast("That selection has no usable path.", true); return; }
        list.push(sh);
        if (!mineStore(list)) { toast("Could not save the shape.", true); return; }
        mineSync(list); saveName.value = ""; setSave(false); afterMineChange(sh.id);
        toast("Saved \"" + sh.name + "\" to Mine." + (res.data.skipped ? " (" + res.data.skipped + " star shape" + (res.data.skipped === 1 ? "" : "s") + " skipped)" : ""));
      });
    }
    function mineDelete(x) {
      var id = x.getAttribute("data-del"), list, name = "";
      if (!x.classList.contains("is-confirm")) {      // first press arms it, second press deletes
        qa(".sh-tile-x.is-confirm").forEach(function (o) { o.classList.remove("is-confirm"); });
        x.classList.add("is-confirm"); clearTimeout(delTimer);
        delTimer = setTimeout(function () { x.classList.remove("is-confirm"); }, 2400);
        return;
      }
      clearTimeout(delTimer);
      list = mineList().filter(function (sh) { if (sh.id === id) { name = sh.name; } return sh.id !== id; });
      if (!mineStore(list)) { toast("Could not delete the shape.", true); return; }
      mineSync(list); afterMineChange(null); toast("Deleted \"" + name + "\".");
    }
    plusBtn.addEventListener("click", function () { setSave(saveBar.hidden); });
    saveBtn.addEventListener("click", mineSave);
    saveName.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); mineSave(); } else if (e.key === "Escape") { setSave(false); } });
    function onSeg(e) {
      var b = e.target.closest ? e.target.closest(".sh-seg-b") : null; if (!b || b.disabled) { return; }
      var key = b.parentNode.getAttribute("data-seg"), v = b.getAttribute("data-v");
      st[key] = v;
      if (key === "rep" && v !== "off") { st.fit = false; }
      save(); paintControls(); if (key === "style") { paintPreview(false); }
    }
    wrap.addEventListener("click", onSeg); pop.addEventListener("click", onSeg);
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

    /* ----- floating button: the options live in a popover, so nothing needs scrolling ----- */
    var fabEl = null, fabOpen = false, fabOffs = [], FAB_KEY = "shapeFabPos";
    function zoomK() { var v = parseFloat(window.getComputedStyle(document.documentElement).getPropertyValue("--ui-scale")); return v && v > 0 ? v : 1; }
    function appEl() { return document.querySelector(".app"); }
    function bounds() {
      var app = appEl(), sb = document.querySelector(".sidebar"), fw = fabEl ? fabEl.offsetWidth : 48, L = 6, R = app.clientWidth - 6;
      if (sb && sb.offsetWidth) { var sl = sb.offsetLeft; if (sl + sb.offsetWidth / 2 > app.clientWidth / 2) { R = Math.min(R, sl - 6); } else { L = Math.max(L, sl + sb.offsetWidth + 6); } }
      R = Math.max(L, R);
      return { minX: L, minY: 6, maxX: Math.max(L, R - fw), maxY: Math.max(6, app.clientHeight - fw - 6), right: R };
    }
    function savedPos() {
      var o = null; try { o = JSON.parse(Store.get(FAB_KEY) || "null"); } catch (e) { o = null; }
      return (o && typeof o.x === "number" && typeof o.y === "number") ? { x: clamp(o.x, 0, 1, 1), y: clamp(o.y, 0, 1, 1) } : { x: 1, y: 1 };
    }
    function fabPlace(fx, fy) {
      if (!fabEl || !appEl()) { return; }
      var bd = bounds();
      fabEl.style.left = Math.round(bd.minX + (bd.maxX - bd.minX) * fx) + "px";
      fabEl.style.top = Math.round(bd.minY + (bd.maxY - bd.minY) * fy) + "px";
      fabOrient();
    }
    function fabOrient() {
      if (!fabEl) { return; }
      var app = appEl(), bd = bounds(), pp = fabEl.querySelector(".cw-pop"), fab = fabEl.querySelector(".cw-fab");
      var x = parseFloat(fabEl.style.left) || 0, y = parseFloat(fabEl.style.top) || 0, f = fab.offsetWidth;
      var up = (y + f / 2) > app.clientHeight / 2, right = (x + f / 2) > (bd.minX + bd.right) / 2;
      fabEl.setAttribute("data-v", up ? "up" : "down"); fabEl.setAttribute("data-h", right ? "r" : "l");
      var pw = Math.min(pp.offsetWidth || 285, bd.right - bd.minX), off = right ? (x + f) - pw : x;
      off = clamp(off, bd.minX, bd.right - pw, bd.minX);
      pp.style.left = Math.round(off - x) + "px"; pp.style.right = "auto";
      pp.style.maxHeight = Math.max(180, (up ? (y - 16) : (app.clientHeight - (y + f) - 16))) + "px";
    }
    function fabSetOpen(on) {
      if (!fabEl) { return; }
      fabOpen = !!on;
      if (fabOpen) { fabOrient(); }
      fabEl.classList.toggle("is-open", fabOpen);
      fabEl.querySelector(".cw-fab").setAttribute("aria-expanded", String(fabOpen));
      fabEl.querySelector(".cw-pop").setAttribute("aria-hidden", String(!fabOpen));
    }
    function fabPaint() {
      if (!fabEl) { return; }
      var ico = fabEl.querySelector(".sh-fab-ico");
      ico.innerHTML = shapeSvg(selSh, "color", st);
      ico.classList.remove("sh-pop"); void ico.offsetWidth; ico.classList.add("sh-pop");
      fabEl.style.setProperty("--sh-cur", st.color);
    }
    function fabOff() {
      fabOffs.forEach(function (fn) { try { fn(); } catch (e) { } }); fabOffs = [];
      if (fabEl && fabEl.parentNode) { fabEl.parentNode.removeChild(fabEl); }
      fabEl = null; fabOpen = false;
    }
    function fabOn() {
      var app = appEl(); if (!app) { return; }
      fabEl = document.createElement("div");
      fabEl.className = "cw-dock sh-fabdock";
      fabEl.innerHTML =
        '<div class="cw-pop sh-fabpop" aria-hidden="true" role="dialog" aria-label="Shape options"></div>' +
        '<button type="button" class="cw-fab sh-fab" aria-label="Shape options. Drag to move" aria-expanded="false" title="Shape options (drag to move)"><span class="sh-fab-ring"></span><span class="sh-fab-ico"></span></button>';
      fabEl.querySelector(".cw-pop").appendChild(pop);
      app.appendChild(fabEl);
      var sp = savedPos(); fabPlace(sp.x, sp.y);
      var fab = fabEl.querySelector(".cw-fab"), drag = null, justDragged = false;
      fab.addEventListener("pointerdown", function (e) {
        if (e.button !== undefined && e.button !== 0) { return; }
        drag = { cx: e.clientX, cy: e.clientY, x: parseFloat(fabEl.style.left) || 0, y: parseFloat(fabEl.style.top) || 0, moved: false, k: zoomK() };
        try { fab.setPointerCapture(e.pointerId); } catch (e1) { }
      });
      fab.addEventListener("pointermove", function (e) {
        if (!drag) { return; }
        var dx = e.clientX - drag.cx, dy = e.clientY - drag.cy;
        if (!drag.moved && Math.abs(dx) + Math.abs(dy) < 5) { return; }
        if (!drag.moved) { drag.moved = true; fabEl.classList.add("is-dragging"); if (fabOpen) { fabSetOpen(false); } }
        var bd = bounds();
        fabEl.style.left = Math.round(clamp(drag.x + dx / drag.k, bd.minX, bd.maxX, bd.minX)) + "px";
        fabEl.style.top = Math.round(clamp(drag.y + dy / drag.k, bd.minY, bd.maxY, bd.minY)) + "px";
      });
      function endDrag() {
        if (!drag) { return; }
        var was = drag.moved; drag = null; fabEl.classList.remove("is-dragging");
        if (!was) { return; }
        justDragged = true; setTimeout(function () { justDragged = false; }, 60);
        var bd = bounds(), x = parseFloat(fabEl.style.left) || 0, y = parseFloat(fabEl.style.top) || 0;
        var fx = clamp(bd.maxX > bd.minX ? (x - bd.minX) / (bd.maxX - bd.minX) : 1, 0, 1, 1), fy = clamp(bd.maxY > bd.minY ? (y - bd.minY) / (bd.maxY - bd.minY) : 1, 0, 1, 1);
        Store.set(FAB_KEY, JSON.stringify({ x: Math.round(fx * 1000) / 1000, y: Math.round(fy * 1000) / 1000 }));
        fabPlace(fx, fy);
      }
      fab.addEventListener("pointerup", endDrag); fab.addEventListener("pointercancel", endDrag); fab.addEventListener("lostpointercapture", endDrag);
      fab.addEventListener("click", function () { if (!justDragged) { fabSetOpen(!fabOpen); } });
      function onDown(e) {
        if (!fabOpen || fabEl.contains(e.target)) { return; }
        if (e.target.closest && e.target.closest(".sh-tile") && false) { return; }
        fabSetOpen(false);
      }
      function onKey(e) { if (e.key === "Escape" && fabOpen) { fabSetOpen(false); fab.focus(); } }
      function onResize() { var p2 = savedPos(); fabPlace(p2.x, p2.y); }
      document.addEventListener("pointerdown", onDown, true); document.addEventListener("keydown", onKey, true); window.addEventListener("resize", onResize);
      fabOffs.push(function () { document.removeEventListener("pointerdown", onDown, true); document.removeEventListener("keydown", onKey, true); window.removeEventListener("resize", onResize); });
    }
    if (activeOff) { activeOff(); }
    activeOff = fabOff;

    /* ----- first paint ----- */
    paintChips(); renderList(); paintControls(); setMods(!!st.mods, true); fabOn(); paintPreview(true);
    return wrap;
  }

  w.MTShapeTab = { dockOff: function () { if (activeOff) { activeOff(); activeOff = null; } }, render: render, buildPayload: buildPayload, shapeSvg: shapeSvg };
})(window);
