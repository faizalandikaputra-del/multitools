/**
 * Multi Tool - mt-shape.js
 * "Shape" tab: a library of shapes (basic, mograph, typography, AMV, devices, UI, frames) that are built
 * as REAL After Effects shape groups (jsx/host.jsx > SHAPE_insert), not images.
 *
 * Insert as:  Layer = new shape layer | Mask = mask on every selected layer | Matte = shape above the
 *             selected layer, used as its alpha track matte.
 * Modifiers:  Animate in (Pop / Draw / Fade), Repeater (Grid / Radial / Line), Round corners,
 *             Fit to text layer (follows the text with an expression), Pulse on markers (beat sync).
 *
 * Data + geometry: js/mt-shape-data.js (window.MTShapeData). This file only draws the panel and sends
 * the numbers to After Effects. Panel state is kept in localStorage "mtx.shape.state".
 */
(function () {
  "use strict";
  var D = window.MTShapeData;
  if (!D) { return; }

  var KEY = "mtx.shape.state";
  var DEF = {
    cat: "All", sel: "hexagon", q: "", style: "Fill", ins: "Layer", size: 240, sw: 6, color: "#19e3f0",
    anim: "None", dur: 0.6, rep: "Off", count: 6, spacing: 60, round: 0, fit: false, pad: 16, pulse: false, amt: 20, mods: false
  };
  var st = load();
  var els = {};

  function load() {
    var s = {}, k, saved = null;
    try { saved = JSON.parse(localStorage.getItem(KEY) || "null"); } catch (e) { saved = null; }
    for (k in DEF) { if (DEF.hasOwnProperty(k)) { s[k] = (saved && saved[k] !== undefined && typeof saved[k] === typeof DEF[k]) ? saved[k] : DEF[k]; } }
    s.q = "";
    return s;
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) { } }

  function esc(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;"); }
  function mk(tag, cls, html) {
    var n = document.createElement(tag);
    if (cls) { n.className = cls; }
    if (html !== undefined) { n.innerHTML = html; }
    return n;
  }

  // ---------- lookups ----------
  function all() { return D.allItems(); }
  function current() {
    var list = all(), i;
    for (i = 0; i < list.length; i++) { if (list[i].item.id === st.sel) { return list[i]; } }
    return list[0];
  }

  // ---------- svg glyphs ----------
  function pathsOf(item) { return item.parts.map(function (p) { return p.d; }).join(""); }
  // one-color icon used on tiles: every part merged, even-odd so screens and holes read as cut-outs
  function tileSvg(item) {
    var d = esc(pathsOf(item));
    if (item.kind === "f") { return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="' + d + '" fill="currentColor" fill-rule="evenodd"/></svg>'; }
    var dash = item.dash ? ' stroke-dasharray="2 2.4"' : "";
    var sw = item.kind === "d" ? 3.2 : 1.7;
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="' + d + '" fill="none" stroke="currentColor" stroke-width="' + sw + '" stroke-linecap="round" stroke-linejoin="round"' + dash + "/></svg>";
  }
  // preview in the dock: roles keep their colors, the style switch changes fill / outline
  function roleColor(r) { return r === "b" ? st.color : D.ROLE_COLOR[r] || st.color; }
  function previewSvg(item) {
    var out = '<svg viewBox="0 0 24 24" aria-hidden="true">';
    var sw = Math.max(0.6, Math.min(2.2, st.sw / 4));
    item.parts.forEach(function (p) {
      var c = roleColor(p.r), d = esc(p.d);
      if (item.kind !== "f") {
        out += '<path d="' + d + '" fill="none" stroke="' + c + '" stroke-width="' + (item.kind === "d" ? 3.2 : 1.7) + '" stroke-linecap="round" stroke-linejoin="round"' + (item.dash ? ' stroke-dasharray="2 2.4"' : "") + "/>";
      } else if (st.style === "Fill") {
        out += '<path d="' + d + '" fill="' + c + '" fill-rule="evenodd"/>';
      } else if (st.style === "Stroke") {
        out += '<path d="' + d + '" fill="none" stroke="' + c + '" stroke-width="' + sw + '" stroke-linejoin="round"/>';
      } else {
        out += '<path d="' + d + '" fill="' + c + '" fill-opacity="' + (p.r === "b" ? 0.33 : 1) + '" fill-rule="evenodd" stroke="' + c + '" stroke-width="' + sw + '" stroke-linejoin="round"/>';
      }
    });
    return out + "</svg>";
  }

  // ---------- small controls ----------
  function segment(label, options, key, onChange) {
    var wrap = mk("div", "shp-field");
    wrap.appendChild(mk("span", "shp-label", label));
    var bar = mk("div", "shp-seg");
    bar.setAttribute("role", "group");
    bar.setAttribute("aria-label", label);
    options.forEach(function (o) {
      var b = mk("button", "shp-segb", o);
      b.type = "button";
      b.setAttribute("aria-pressed", st[key] === o ? "true" : "false");
      b.addEventListener("click", function () {
        st[key] = o; save();
        Array.prototype.forEach.call(bar.children, function (x) { x.setAttribute("aria-pressed", x.textContent === o ? "true" : "false"); });
        if (onChange) { onChange(o); }
      });
      bar.appendChild(b);
    });
    wrap.appendChild(bar);
    return wrap;
  }
  function slider(label, key, min, max, step, unit, onChange) {
    var wrap = mk("div", "shp-field");
    var head = mk("label", "shp-label shp-label--row");
    var name = mk("span", "", label), val = mk("span", "shp-val", fmt(st[key]) + unit);
    head.appendChild(name); head.appendChild(val);
    var input = mk("input", "shp-range");
    input.type = "range"; input.min = min; input.max = max; input.step = step; input.value = st[key];
    input.setAttribute("aria-label", label);
    input.addEventListener("input", function () {
      st[key] = Number(input.value); val.textContent = fmt(st[key]) + unit; save();
      if (onChange) { onChange(); }
    });
    wrap.appendChild(head); wrap.appendChild(input);
    wrap._set = function () { input.value = st[key]; val.textContent = fmt(st[key]) + unit; };
    return wrap;
  }
  function fmt(v) { return (Math.round(v * 10) / 10).toString(); }
  function check(label, key, onChange) {
    var wrap = mk("label", "shp-check");
    var input = mk("input");
    input.type = "checkbox"; input.checked = !!st[key];
    input.addEventListener("change", function () { st[key] = input.checked; save(); if (onChange) { onChange(); } });
    wrap.appendChild(input);
    wrap.appendChild(mk("span", "shp-check-box"));
    wrap.appendChild(mk("span", "shp-check-text", label));
    return wrap;
  }

  // ---------- grid ----------
  function buildGrid() {
    var q = st.q.trim().toLowerCase(), any = false;
    els.grid.innerHTML = "";
    D.GROUPS.forEach(function (g) {
      if (st.cat !== "All" && st.cat !== g.key) { return; }
      var items = g.items.filter(function (it) { return !q || it.name.toLowerCase().indexOf(q) !== -1; });
      if (!items.length) { return; }
      any = true;
      var sec = mk("section", "shp-group");
      sec.appendChild(mk("div", "shp-group-head", "<h3>" + esc(g.label) + "</h3><span>" + esc(g.hint) + "</span>"));
      var grid = mk("div", "shp-tiles");
      items.forEach(function (it) {
        var b = mk("button", "shp-tile", tileSvg(it) + "<span>" + esc(it.name) + "</span>");
        b.type = "button";
        b.setAttribute("aria-label", it.name);
        b.setAttribute("data-id", it.id);
        b.setAttribute("aria-pressed", it.id === st.sel ? "true" : "false");
        b.addEventListener("click", function () { select(it.id); });
        b.addEventListener("dblclick", function () { select(it.id); insert(); });
        grid.appendChild(b);
      });
      sec.appendChild(grid);
      els.grid.appendChild(sec);
    });
    if (!any) { els.grid.appendChild(mk("p", "shp-empty", "No shape matches this search. Clear the search field to see every shape.")); }
  }

  function select(id) {
    st.sel = id; save();
    Array.prototype.forEach.call(els.grid.querySelectorAll(".shp-tile"), function (t) {
      t.setAttribute("aria-pressed", t.getAttribute("data-id") === id ? "true" : "false");
    });
    updateDock(true);
  }

  function updateDock(pop) {
    var c = current();
    els.pvBox.innerHTML = previewSvg(c.item);
    els.pvName.textContent = c.item.name;
    els.pvGroup.textContent = c.group.label + (c.item.parts.length > 1 ? " - " + c.item.parts.length + " parts" : "");
    els.add.setAttribute("aria-label", "Add " + c.item.name);
    els.add.title = "Add " + c.item.name;
    var hints = {
      Layer: "Creates a new shape layer at the center of the comp.",
      Mask: "Adds the shape as a mask on every selected layer.",
      Matte: "Creates the shape above the selected layer and sets it as the track matte."
    };
    els.hint.textContent = hints[st.ins];
    if (pop) {
      els.pvBox.classList.remove("shp-pv-pop");
      void els.pvBox.offsetWidth;
      els.pvBox.classList.add("shp-pv-pop");
    }
  }

  function syncMods() {
    els.repRow.hidden = st.rep === "Off";
    els.padRow.hidden = !st.fit;
    els.amtRow.hidden = !st.pulse;
    els.durRow.hidden = st.anim === "None";
    els.mods.setAttribute("data-open", st.mods ? "true" : "false");
    els.modsBtn.setAttribute("aria-expanded", st.mods ? "true" : "false");
  }

  // ---------- send to After Effects ----------
  function payload() {
    var c = current().item;
    return {
      name: c.name, mode: st.ins, style: st.style, color: st.color, sw: st.sw,
      roles: D.ROLE_COLOR, shape: D.toPayload(c, { size: st.size, center: st.fit }),
      anim: st.anim, dur: st.dur,
      rep: { kind: st.rep, count: st.count, spacing: st.spacing },
      round: st.round, fit: st.fit, pad: st.pad, pulse: st.pulse, amt: st.amt
    };
  }
  function insert() {
    var core = window.MTCore, btn = els.add;
    if (!core || !core.Bridge) { return; }
    btn.classList.remove("is-success", "is-error");
    btn.classList.add("is-pending");
    core.Bridge.call("SHAPE_insert", [payload()]).then(function (res) {
      btn.classList.remove("is-pending");
      var ok = !!(res && res.ok);
      btn.classList.add(ok ? "is-success" : "is-error");
      setTimeout(function () { btn.classList.remove("is-success", "is-error"); }, 900);
      core.toast((res && res.message) || (ok ? "Shape added." : "Could not add the shape."), !ok);
    });
  }

  // ---------- render ----------
  function render() {
    var root = mk("div", "shp"), i;
    root.setAttribute("data-open-first", "0");
    els = {};

    // search + chips
    var top = mk("div", "shp-top");
    var search = mk("input", "shp-search");
    search.type = "text"; search.placeholder = "Search shapes"; search.setAttribute("aria-label", "Search shapes");
    search.addEventListener("input", function () { st.q = search.value; buildGrid(); });
    var count = mk("span", "shp-count", all().length + " shapes");
    top.appendChild(count); top.appendChild(search);
    root.appendChild(top);

    var chips = mk("div", "shp-chips");
    chips.setAttribute("role", "tablist");
    chips.setAttribute("aria-label", "Shape category");
    var cats = [{ key: "All", label: "All" }].concat(D.GROUPS.map(function (g) { return { key: g.key, label: g.label }; }));
    cats.forEach(function (c) {
      var b = mk("button", "shp-chip", esc(c.label));
      b.type = "button"; b.setAttribute("role", "tab");
      b.setAttribute("aria-selected", st.cat === c.key ? "true" : "false");
      b.addEventListener("click", function () {
        st.cat = c.key; save();
        Array.prototype.forEach.call(chips.children, function (x) { x.setAttribute("aria-selected", x === b ? "true" : "false"); });
        buildGrid();
      });
      chips.appendChild(b);
    });
    root.appendChild(chips);

    // order: search, chips, settings card, scrolling grid, modifiers. The card is NOT sticky: a sticky layer over the animated
    // background made the pointer flicker, and it hid tiles behind a solid band.
    var dockSlot = mk("div", "shp-dock-slot");
    root.appendChild(dockSlot);
    els.grid = mk("div", "shp-grid");
    root.appendChild(els.grid);

    // modifiers (collapsible, below the grid)
    var mods = mk("section", "shp-mods");
    els.mods = mods;
    els.modsBtn = mk("button", "shp-mods-head", "<span>Modifiers</span><svg viewBox=\"0 0 24 24\" aria-hidden=\"true\"><path d=\"m7 10 5 5 5-5\"/></svg>");
    els.modsBtn.type = "button";
    els.modsBtn.addEventListener("click", function () { st.mods = !st.mods; save(); syncMods(); });
    mods.appendChild(els.modsBtn);
    var body = mk("div", "shp-mods-body");
    var inner = mk("div", "shp-mods-inner");
    inner.appendChild(segment("Animate in", ["None", "Pop", "Draw", "Fade"], "anim", syncMods));
    els.durRow = slider("Duration", "dur", 0.1, 3, 0.1, " s");
    inner.appendChild(els.durRow);
    inner.appendChild(segment("Repeater", ["Off", "Grid", "Radial", "Line"], "rep", syncMods));
    els.repRow = mk("div", "shp-row2");
    els.repRow.appendChild(slider("Count", "count", 2, 36, 1, ""));
    els.repRow.appendChild(slider("Spacing", "spacing", 10, 400, 1, " px"));
    inner.appendChild(els.repRow);
    inner.appendChild(slider("Round corners", "round", 0, 100, 1, " px"));
    inner.appendChild(check("Fit to text layer (box follows the text)", "fit", syncMods));
    els.padRow = slider("Padding", "pad", 0, 120, 1, " px");
    inner.appendChild(els.padRow);
    inner.appendChild(check("Pulse on markers (beat sync)", "pulse", syncMods));
    els.amtRow = slider("Pulse amount", "amt", 1, 100, 1, " %");
    inner.appendChild(els.amtRow);
    body.appendChild(inner);
    mods.appendChild(body);
    root.appendChild(mods);

    // settings card: preview + Add, style, insert mode, size
    var dock = mk("section", "shp-dock");
    dock.setAttribute("aria-label", "Insert settings");
    var pv = mk("div", "shp-pv");
    els.pvBox = mk("div", "shp-pv-box");
    var info = mk("div", "shp-pv-info");
    els.pvName = mk("strong"); els.pvGroup = mk("span");
    info.appendChild(els.pvName); info.appendChild(els.pvGroup);
    var colorWrap = mk("label", "shp-color");
    var colorIn = mk("input");
    colorIn.type = "color"; colorIn.value = st.color; colorIn.setAttribute("aria-label", "Shape color");
    colorIn.addEventListener("input", function () { st.color = colorIn.value; save(); updateDock(false); });
    colorWrap.appendChild(colorIn);
    els.add = mk("button", "shp-add", "Add");
    els.add.type = "button";
    els.add.addEventListener("click", insert);
    pv.appendChild(els.pvBox); pv.appendChild(info); pv.appendChild(colorWrap); pv.appendChild(els.add);
    dock.appendChild(pv);

    var two = mk("div", "shp-row2");
    two.appendChild(segment("Style", ["Fill", "Stroke", "Both"], "style", function () { updateDock(false); }));
    two.appendChild(segment("Insert as", ["Layer", "Mask", "Matte"], "ins", function () { updateDock(false); }));
    dock.appendChild(two);
    els.hint = mk("p", "shp-hint");
    dock.appendChild(els.hint);

    var sl = mk("div", "shp-row2");
    sl.appendChild(slider("Size", "size", 20, 1200, 1, " px"));
    sl.appendChild(slider("Stroke", "sw", 0, 60, 1, " px", function () { updateDock(false); }));
    dock.appendChild(sl);

    dockSlot.appendChild(dock);

    buildGrid();
    updateDock(false);
    syncMods();
    return root;
  }

  window.MTShape = { render: render };
})();
