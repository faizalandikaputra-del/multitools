/* NeuCurve - nc-extras.js
   Settings that live in NeuCurve's Settings window and apply to the graph (Curve tab / graph window):
     1. Handle Style        : circle (default) / heart / square / diamond / star / PNG-GIF image,
                              plus handle size and handle-line thickness.
     2. Falling Effect      : Off / Particles / Rain + color + opacity (drawn by nc-particles.js).
   3. Background Gradient : on/off, 6 presets (Amber Night = default look), Color 1/2, Glow, Direction, Intensity, Area
                              (Whole panel / Graph only). Keys: gradOn gradP gradC1 gradC2 gradGlow gradDir gradInt gradArea.
   4. White Glow          : direction / strength / reach of the white light behind the preset tiles. Keys: wgDir wgInt wgSize.
   Values are stored in localStorage (prefix "neucurve_") and synced between windows with the same
   "storage" + "com.neucurve.sync" mechanism as the other NeuCurve settings.
     hStyle hSize(2-9, default 4.5) hLine(0.5-6, default 1.2) hImg(file:/// path or data URL)
   The Settings UI is mounted by the bundle through window.__ncExtraUI() (see assets/index.js). */
(function () {
  var root = document.documentElement;
  var IS_SETTINGS = /[?&]ext=settings/.test(location.search);
  var KEYS = /^(hStyle|hSize|hLine|hImg|pEffect|pColor|pAlpha|gradOn|gradP|gradC1|gradC2|gradGlow|gradDir|gradInt|gradArea|wgDir|wgInt|wgSize|gWp|gHp|gWl|gHl)$/;
  var DEF = { hStyle: "circle", hSize: "4.5", hLine: "1.2", hImg: "", pEffect: "particles", pColor: "#ffffff", pAlpha: "100",
    gradOn: "0", gradP: "amber", gradC1: "#1a120a", gradC2: "#3d2810", gradGlow: "#e0a420", gradDir: "160", gradInt: "100", gradArea: "panel", wgDir: "90", wgInt: "45", wgSize: "55", gWp: "100", gHp: "100", gWl: "100", gHl: "100" };
  var NS = "http://www.w3.org/2000/svg";

  function read(k) { try { var v = localStorage.getItem("neucurve_" + k); return v === null ? DEF[k] : v; } catch (e) { return DEF[k]; } }
  function write(k, v) { try { localStorage.setItem("neucurve_" + k, String(v)); } catch (e) { } }
  function num(v, lo, hi, d) { v = parseFloat(v); if (!isFinite(v)) { v = d; } return Math.max(lo, Math.min(hi, v)); }
  function broadcast(k, v) {
    try {
      var CE = window.CSEvent || (typeof CSEvent !== "undefined" ? CSEvent : null);
      if (!CE || !window.CSInterface) { return; }
      var ev = new CE("com.neucurve.sync", "APPLICATION");
      ev.data = JSON.stringify({ key: k, val: String(v), appId: "nc-extras" });
      new window.CSInterface().dispatchEvent(ev);
    } catch (e) { }
  }
  function set(k, v) { write(k, v); broadcast(k, v); applyAll(); }

  function S() {
    return {
      style: read("hStyle"), size: num(read("hSize"), 2, 9, 4.5), line: num(read("hLine"), 0.5, 6, 1.2), img: read("hImg"),
      pEffect: read("pEffect"), pColor: read("pColor"), pAlpha: num(read("pAlpha"), 0, 100, 100),
      gOn: read("gradOn") === "1", gP: read("gradP"), gC1: read("gradC1"), gC2: read("gradC2"), gGlow: read("gradGlow"),
      gDir: num(read("gradDir"), 0, 360, 160), gInt: num(read("gradInt"), 0, 100, 100), gArea: read("gradArea") === "graph" ? "graph" : "panel",
      wDir: num(read("wgDir"), 0, 360, 90), wInt: num(read("wgInt"), 0, 100, 45), wSize: num(read("wgSize"), 20, 100, 55)
    };
  }


  /* ---------------- handle style ---------------- */
  function starPts(R) {
    var p = [], i, a, r;
    for (i = 0; i < 10; i++) { a = -Math.PI / 2 + i * Math.PI / 5; r = i % 2 ? R * 0.56 : R * 1.35; p.push((Math.cos(a) * r).toFixed(2) + "," + (Math.sin(a) * r).toFixed(2)); }
    return p.join(" ");
  }
  var HEART = "M0 0.95C-0.2 0.8 -1 0.2 -1 -0.35C-1 -0.75 -0.7 -1 -0.4 -1C-0.2 -1 -0.05 -0.9 0 -0.7C0.05 -0.9 0.2 -1 0.4 -1C0.7 -1 1 -0.75 1 -0.35C1 0.2 0.2 0.8 0 0.95Z";

  function isDefault(st) { return (st.style === "circle" || (st.style === "image" && !st.img)) && Math.abs(st.size - 4.5) < 0.01; }

  function makeShape(st, R) {
    var el, kind = st.style === "image" && !st.img ? "circle" : st.style;
    if (kind === "image") {
      el = document.createElementNS(NS, "image");
      el.setAttribute("href", st.img); el.setAttributeNS("http://www.w3.org/1999/xlink", "href", st.img);
      var s = R * 2.6; el.setAttribute("x", -s / 2); el.setAttribute("y", -s / 2); el.setAttribute("width", s); el.setAttribute("height", s);
      el.setAttribute("preserveAspectRatio", "xMidYMid meet");
    } else if (kind === "square") {
      el = document.createElementNS(NS, "rect"); el.setAttribute("x", -R); el.setAttribute("y", -R); el.setAttribute("width", 2 * R); el.setAttribute("height", 2 * R); el.setAttribute("rx", 0.8);
    } else if (kind === "diamond") {
      el = document.createElementNS(NS, "polygon"); var d = R * 1.35; el.setAttribute("points", "0," + -d + " " + d + ",0 0," + d + " " + -d + ",0");
    } else if (kind === "star") {
      el = document.createElementNS(NS, "polygon"); el.setAttribute("points", starPts(R)); el.setAttribute("stroke-linejoin", "round");
    } else if (kind === "heart") {
      el = document.createElementNS(NS, "path"); el.setAttribute("d", HEART); el.setAttribute("transform", "scale(" + (R * 1.2) + ")"); el.setAttribute("stroke-linejoin", "round");
      el.setAttribute("vector-effect", "non-scaling-stroke");
    } else {
      el = document.createElementNS(NS, "circle"); el.setAttribute("r", R);
    }
    el.setAttribute("class", "nc-hs");
    return el;
  }

  function sync(circle) {
    var sh = circle.__ncShape; if (!sh || sh.tagName === "image") { return; }
    ["fill", "stroke", "stroke-width", "opacity"].forEach(function (a) {
      var v = circle.getAttribute(a); if (v === null) { sh.removeAttribute(a); } else { sh.setAttribute(a, v); }
    });
  }

  function decorate(circle, st) {
    var base = parseFloat(circle.getAttribute("r")) || 4.5;
    if (circle.__ncKey === JSON.stringify([st.style, st.size, st.img, base])) { return; }
    undecorate(circle);
    if (isDefault(st)) { return; }
    var R = base * (st.size / 4.5);
    var sh = makeShape(st, R);
    circle.parentNode.insertBefore(sh, circle.nextSibling);
    circle.__ncShape = sh; circle.__ncKey = JSON.stringify([st.style, st.size, st.img, base]);
    circle.style.display = "none"; sync(circle);
    if (!circle.__ncObs) {
      circle.__ncObs = new MutationObserver(function () { sync(circle); });
      circle.__ncObs.observe(circle, { attributes: true, attributeFilter: ["fill", "stroke", "stroke-width", "opacity"] });
    }
  }
  function undecorate(circle) {
    if (circle.__ncShape && circle.__ncShape.parentNode) { circle.__ncShape.parentNode.removeChild(circle.__ncShape); }
    circle.__ncShape = null; circle.__ncKey = null; circle.style.display = "";
  }

  var scanning = false;
  function scan() {
    var st = S(), svg = document.querySelector("svg.curve-svg"); if (!svg) { return; }
    scanning = true;
    // (a) Bezier / Custom handles: shared <g id="handle-pt"> and <g id="handle-pt-active"> in <defs>
    ["handle-pt", "handle-pt-active"].forEach(function (id) {
      var g = svg.querySelector("#" + id), c = g && g.querySelector("circle:not(.nc-hs)"); if (c) { decorate(c, st); }
    });
    // (b) Elastic / Bounce / Wave / Steps: each handle is <g style="cursor:pointer"><circle r=10 transparent/><circle r=4 .../></g>
    Array.prototype.forEach.call(svg.querySelectorAll("g"), function (g) {
      if (g.id === "handle-pt" || g.id === "handle-pt-active" || !/cursor:\s*pointer/.test(g.getAttribute("style") || "")) { return; }
      var cs = g.querySelectorAll(":scope > circle:not(.nc-hs)"); if (cs.length < 2) { return; }
      var vis = cs[cs.length - 1]; if (parseFloat(vis.getAttribute("r")) <= 6) { decorate(vis, st); }
    });
    scanning = false;
  }

  var styleEl = null;
  function applyHandleCss(st) {
    if (!styleEl) { styleEl = document.createElement("style"); styleEl.id = "nc-handle-css"; document.head.appendChild(styleEl); }
    styleEl.textContent = Math.abs(st.line - 1.2) < 0.01 ? "" :
      "svg.curve-svg g.handles > line { stroke-width: " + st.line + "px; }";
  }


  /* ---------------- background gradient ---------------- */
  var GRAD_PRESETS = [
    ["amber", "Amber Night", "#1a120a", "#3d2810", "#e0a420"],
    ["violet", "Violet Dusk", "#140f24", "#2d1b52", "#9b6bff"],
    ["ocean", "Deep Ocean", "#0a1620", "#0f3350", "#37b6ff"],
    ["rose", "Rose Ember", "#1f0f16", "#4a1730", "#ff5d8f"],
    ["forest", "Forest Mist", "#0c1712", "#14382a", "#3ddc97"],
    ["mono", "Graphite", "#0c0c0e", "#26262c", "#c9c9d4"]
  ];
  function hexRgb(h) {
    h = String(h || "").replace("#", "");
    if (h.length === 3) { h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2]; }
    var n = parseInt(h, 16); if (!isFinite(n)) { n = 0; }
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function rgba(h, a) { var c = hexRgb(h); return "rgba(" + c[0] + "," + c[1] + "," + c[2] + "," + a + ")"; }
  function gradCss(st) {
    var k = st.gInt / 100;
    var glowA = (0.34 * k).toFixed(3), glowA2 = (0.18 * k).toFixed(3);
    return "radial-gradient(ellipse 85% 55% at 88% 102%, " + rgba(st.gGlow, glowA) + ", rgba(0,0,0,0) 70%)," +
           "radial-gradient(ellipse 60% 40% at 8% -4%, " + rgba(st.gGlow, glowA2) + ", rgba(0,0,0,0) 70%)," +
           "linear-gradient(" + st.gDir + "deg, " + rgba(st.gC1, k.toFixed(3)) + " 0%, " + rgba(st.gC2, k.toFixed(3)) + " 100%)";
  }
  /* White glow behind the preset tiles. Direction = the side it comes from, clockwise from the top
     (0 = top, 90 = right (default), 180 = bottom, 270 = left; in-between angles aim at a corner). */
  function whiteCss(st) {
    var a = st.wInt / 100 * 0.4;            // 45 -> 0.18 (the old fixed look)
    if (a <= 0.001) { return "none"; }
    var th = st.wDir * Math.PI / 180, dx = Math.sin(th), dy = -Math.cos(th);
    var m = Math.max(Math.abs(dx), Math.abs(dy)) || 1;
    var ex = 50 + 50 * dx / m, ey = 50 + 50 * dy / m;        // the edge / corner point the glow starts from
    var tx = -dy, ty = dx;                                   // unit tangent along that edge
    var rx = 46 + (st.wSize - 46) * Math.abs(dx), ry = 46 + (st.wSize - 46) * Math.abs(dy);
    function blob(off, k, sc) {
      return "radial-gradient(ellipse " + (rx * (1 - (1 - sc) * Math.abs(dy))).toFixed(1) + "% " + (ry * (1 - (1 - sc) * Math.abs(dx))).toFixed(1) + "% at " +
             Math.max(0, Math.min(100, ex + tx * off)).toFixed(1) + "% " + Math.max(0, Math.min(100, ey + ty * off)).toFixed(1) + "%, rgba(255,255,255," + (a * k).toFixed(3) + "), rgba(255,255,255,0) 70%)";
    }
    return blob(-20, 1, 1) + "," + blob(32, 0.7, 0.87);
  }
  function applyWhite(st) {
    if (IS_SETTINGS) { return; }
    document.documentElement.style.setProperty("--nc-amb-bg", whiteCss(st));
  }
  var gradEl = null;
  function applyGradient(st) {
    var R = document.documentElement;
    var on = st.gOn;
    if (IS_SETTINGS) {   /* Settings window stays solid; no gradient preview is drawn here */
      return;
    }
    R.classList.toggle("nc-grad-on", on);
    R.classList.toggle("nc-grad-panel", on && st.gArea === "panel");
    R.classList.toggle("nc-grad-graph", on && st.gArea === "graph");
    if (!on) { if (gradEl && gradEl.parentNode) { gradEl.parentNode.removeChild(gradEl); } gradEl = null; return; }
    if (!gradEl) { gradEl = document.createElement("div"); gradEl.id = "nc-grad"; }
    gradEl.style.background = gradCss(st);
    var host = st.gArea === "graph" ? document.querySelector(".canvas-area") : document.body;
    if (!host) { return; }
    if (gradEl.parentNode !== host) { host.insertBefore(gradEl, host.firstChild); }
    gradEl.className = st.gArea === "graph" ? "nc-grad-in-graph" : "nc-grad-in-panel";
  }

  function keepGrad() {
    if (IS_SETTINGS || !gradEl) { return; }
    var st = S(); if (!st.gOn) { return; }
    var host = st.gArea === "graph" ? document.querySelector(".canvas-area") : document.body;
    if (host && gradEl.parentNode !== host) { host.insertBefore(gradEl, host.firstChild); }
  }
  var obs = null, pending = false;
  function schedule() { if (pending) { return; } pending = true; requestAnimationFrame(function () { pending = false; scan(); keepGrad(); }); }
  function watch() {
    if (obs || IS_SETTINGS) { return; }
    obs = new MutationObserver(function () { if (!scanning) { schedule(); } });
    obs.observe(document.documentElement, { childList: true, subtree: true });
  }

  function applyAll() {
    var st = S(); applyHandleCss(st); applyGradient(st); applyWhite(st);
    if (!IS_SETTINGS) { watch(); scan(); }
    refreshUI();
  }

  /* ---------------- settings UI ---------------- */
  var ui = null;
  var SHAPES = [
    ["circle", "Circle", '<circle cx="12" cy="12" r="7"/>'],
    ["heart", "Heart", '<path d="M12 20.5C5 15 3 11.5 3 8.6 3 6 5 4.5 7.2 4.5c1.9 0 3.7 1.1 4.8 3 1.1-1.9 2.9-3 4.8-3C19 4.5 21 6 21 8.6c0 2.9-2 6.4-9 11.9z"/>'],
    ["square", "Square", '<rect x="5" y="5" width="14" height="14" rx="1.5"/>'],
    ["diamond", "Diamond", '<path d="M12 3l9 9-9 9-9-9z"/>'],
    ["star", "Star", '<path d="M12 2.8l2.8 6 6.5.7-4.8 4.5 1.3 6.5L12 17.2 6.2 20.5l1.3-6.5L2.7 9.5l6.5-.7z"/>'],
    ["image", "PNG / GIF", '<rect x="3.5" y="4.5" width="17" height="15" rx="2" fill="none"/><circle cx="9" cy="10" r="1.6"/><path d="M4.5 18l5-5 3.5 3.5 2.5-2.5 4 4" fill="none"/>']
  ];

  var FX = [
    ["off", "Off", '<circle cx="12" cy="12" r="7.5" fill="none"/><path d="M6.7 17.3L17.3 6.7" fill="none"/>'],
    ["particles", "Particles", '<circle cx="7" cy="8" r="2.2" stroke="none"/><circle cx="16" cy="6.5" r="1.6" stroke="none"/><circle cx="12" cy="13" r="2.8" stroke="none"/><circle cx="18" cy="17" r="2" stroke="none"/><circle cx="6.5" cy="18" r="1.5" stroke="none"/>'],
    ["rain", "Rain", '<path d="M8 4l-2 6M14 3l-2.4 7.2M20 5l-2 6M10 13l-2 6M17 14l-2.2 6.6" fill="none"/>']
  ];

  function el(tag, cls, html) { var e = document.createElement(tag); if (cls) { e.className = cls; } if (html !== undefined) { e.innerHTML = html; } return e; }
  function slider(label, key, min, max, step, fmt) {
    var row = el("div", "nc-x-row"), lab = el("span", "nc-x-lab", label), inp = el("input", "nc-x-range"), out = el("span", "nc-x-val");
    inp.type = "range"; inp.min = min; inp.max = max; inp.step = step; inp.setAttribute("data-k", key);
    inp.addEventListener("input", function () { set(key, inp.value); });
    row.appendChild(lab); row.appendChild(inp); row.appendChild(out);
    row._sync = function (v) { if (document.activeElement !== inp) { inp.value = v; } out.textContent = fmt(parseFloat(v)); };
    return row;
  }
  function colorRow(label, key) {
    var row = el("div", "nc-x-row"), lab = el("span", "nc-x-lab", label), inp = el("input", "nc-x-color"), hex = el("span", "nc-x-val");
    inp.type = "color"; inp.addEventListener("input", function () { set(key, inp.value); });
    row.appendChild(lab); row.appendChild(el("span", "nc-x-fill")); row.appendChild(inp); row.appendChild(hex);
    row._sync = function (v) { inp.value = v; hex.textContent = v.toUpperCase(); };
    return row;
  }
  function header(title) {
    var h = el("div", "section-header svelte-9ghi9u"); h.appendChild(el("span", "label svelte-9ghi9u", title)); return h;
  }

  function pickImage() {
    if (window.cep && window.cep.fs && window.cep.fs.showOpenDialogEx) {
      var r = window.cep.fs.showOpenDialogEx(false, false, "Select Handle Image (PNG / GIF)", "", ["png", "gif"]);
      if (r.err === 0 && r.data && r.data.length) {
        var p = r.data[0].replace(/\\/g, "/"); if (p.indexOf("file://") !== 0) { p = "file:///" + p.replace(/^\/+/, ""); }
        set("hImg", p); set("hStyle", "image");
      }
    } else {
      var f = document.createElement("input"); f.type = "file"; f.accept = "image/png,image/gif";
      f.onchange = function () {
        var file = f.files && f.files[0]; if (!file) { return; }
        var fr = new FileReader(); fr.onload = function () { set("hImg", fr.result); set("hStyle", "image"); }; fr.readAsDataURL(file);
      };
      f.click();
    }
  }

  function buildUI() {
    var wrap = el("div", "nc-x-wrap");

    // --- graph size (also: drag the grip at the graph's bottom-right corner)
    var gz = el("div", "section mt-4 svelte-9ghi9u nc-x-sec");
    gz.appendChild(header("Graph Size"));
    function gsl(label, key) {
      var r = slider(label, key, 25, 100, 1, function (v) { return Math.round(v) + "%"; });
      var inp = r.querySelector("input"); inp.addEventListener("input", function () { try { if (window.__ncGBump) { window.__ncGBump(); } } catch (e) { } });
      return r;
    }
    var gwp = gsl("Portrait W", "gWp"), ghp = gsl("Portrait H", "gHp"), gwl = gsl("Landscape W", "gWl"), ghl = gsl("Landscape H", "gHl");
    gz.appendChild(gwp); gz.appendChild(ghp); gz.appendChild(gwl); gz.appendChild(ghl);
    var gzr = el("button", "nc-x-btn nc-x-btn-ghost", "Reset to auto"); gzr.type = "button";
    gzr.addEventListener("click", function () { ["gWp", "gHp", "gWl", "gHl"].forEach(function (k) { set(k, "100"); try { localStorage.removeItem("neucurve_" + k); } catch (e) { } }); refreshUI(); });
    var gza = el("div", "nc-x-actions"); gza.appendChild(gzr); gz.appendChild(gza);
    gz.appendChild(el("p", "nc-x-note", "Width / height of the graph itself, any proportion. Easier: drag the small grip at the graph's bottom-right corner in the Curve tab (Shift = keep proportions, double-click = auto). Applies to portrait, landscape and auto."));
    wrap.appendChild(gz);

    // --- background gradient
    var gs = el("div", "section mt-4 svelte-9ghi9u nc-x-sec");
    gs.appendChild(header("Background Gradient"));
    var gOnRow = el("div", "nc-x-row"), gOnLab = el("span", "nc-x-lab", "Enable"), gOnFill = el("span", "nc-x-fill"), gTog = el("button", "nc-x-toggle", "<i></i>");
    gTog.type = "button"; gTog.addEventListener("click", function () { set("gradOn", S().gOn ? "0" : "1"); });
    gOnRow.appendChild(gOnLab); gOnRow.appendChild(gOnFill); gOnRow.appendChild(gTog); gs.appendChild(gOnRow);
    var gps = el("div", "nc-x-gpresets");
    GRAD_PRESETS.forEach(function (g) {
      var b = el("button", "nc-x-gp", "<span></span><em>" + g[1] + "</em>"); b.type = "button"; b.setAttribute("data-g", g[0]); b.title = g[1];
      b.firstChild.style.background = "radial-gradient(circle at 80% 100%," + rgba(g[4], 0.7) + ",rgba(0,0,0,0) 65%),linear-gradient(160deg," + g[2] + "," + g[3] + ")";
      b.addEventListener("click", function () { set("gradP", g[0]); set("gradC1", g[2]); set("gradC2", g[3]); set("gradGlow", g[4]); set("gradOn", "1"); });
      gps.appendChild(b);
    });
    /* preset swatches are no longer shown in Settings (gps stays detached so the sync code below keeps working) */
    var gc1 = colorRow("Color 1", "gradC1"), gc2 = colorRow("Color 2", "gradC2"), gcg = colorRow("Glow", "gradGlow");
    var gdir = slider("Direction", "gradDir", 0, 360, 1, function (v) { return Math.round(v) + "\u00b0"; });
    var gint = slider("Intensity", "gradInt", 0, 100, 1, function (v) { return Math.round(v) + "%"; });
    gs.appendChild(gc1); gs.appendChild(gc2); gs.appendChild(gcg); gs.appendChild(gdir); gs.appendChild(gint);
    var garea = el("div", "nc-x-seg");
    [["panel", "Whole panel"], ["graph", "Graph only"]].forEach(function (a) {
      var b = el("button", "nc-x-segbtn", a[1]); b.type = "button"; b.setAttribute("data-a", a[0]);
      b.addEventListener("click", function () { set("gradArea", a[0]); }); garea.appendChild(b);
    });
    var gaRow = el("div", "nc-x-row"); gaRow.appendChild(el("span", "nc-x-lab", "Area")); gaRow.appendChild(garea); gs.appendChild(gaRow);
    var grs = el("button", "nc-x-btn nc-x-btn-ghost", "Reset gradient"); grs.type = "button";
    grs.addEventListener("click", function () { set("gradP", "amber"); set("gradC1", "#1a120a"); set("gradC2", "#3d2810"); set("gradGlow", "#e0a420"); set("gradDir", "160"); set("gradInt", "100"); set("gradArea", "panel"); set("gradOn", "0"); });
    var gra = el("div", "nc-x-actions"); gra.appendChild(grs); gs.appendChild(gra);
    gs.appendChild(el("p", "nc-x-note", "Paints a soft gradient with a warm glow behind the whole Curve tab (or only behind the graph). Panels turn translucent so it shows through."));
    wrap.appendChild(gs);

    // --- white glow (the soft white light behind the preset tiles)
    var ws = el("div", "section mt-4 svelte-9ghi9u nc-x-sec");
    ws.appendChild(header("White Glow"));
    var wdir = slider("Direction", "wgDir", 0, 360, 1, function (v) { return Math.round(v) + "\u00b0"; });
    var wint = slider("Strength", "wgInt", 0, 100, 1, function (v) { return Math.round(v) + "%"; });
    var wsz = slider("Reach", "wgSize", 20, 100, 1, function (v) { return Math.round(v) + "%"; });
    var wsides = el("div", "nc-x-seg");
    [["0", "Top"], ["90", "Right"], ["180", "Bottom"], ["270", "Left"]].forEach(function (a) {
      var b = el("button", "nc-x-segbtn", a[1]); b.type = "button"; b.setAttribute("data-a", a[0]);
      b.addEventListener("click", function () { set("wgDir", a[0]); }); wsides.appendChild(b);
    });
    var wsRow = el("div", "nc-x-row"); wsRow.appendChild(el("span", "nc-x-lab", "Side")); wsRow.appendChild(wsides);
    ws.appendChild(wsRow); ws.appendChild(wdir); ws.appendChild(wint); ws.appendChild(wsz);
    var wrs = el("button", "nc-x-btn nc-x-btn-ghost", "Reset white glow"); wrs.type = "button";
    wrs.addEventListener("click", function () { set("wgDir", "90"); set("wgInt", "45"); set("wgSize", "55"); });
    var wra = el("div", "nc-x-actions"); wra.appendChild(wrs); ws.appendChild(wra);
    ws.appendChild(el("p", "nc-x-note", "Direction is the side the white light comes from (0\u00b0 top, 90\u00b0 right, 180\u00b0 bottom, 270\u00b0 left; angles in between aim at a corner). Strength 0 turns it off."));
    wrap.appendChild(ws);

    // --- handle style
    var h = el("div", "section mt-4 svelte-9ghi9u nc-x-sec");
    h.appendChild(header("Handle Style"));
    var shapes = el("div", "nc-x-shapes");
    SHAPES.forEach(function (s) {
      var b = el("button", "nc-x-shape", '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round">' + s[2] + '</svg><span>' + s[1] + '</span>');
      b.type = "button"; b.setAttribute("data-s", s[0]);
      b.addEventListener("click", function () { if (s[0] === "image" && !S().img) { pickImage(); } else { set("hStyle", s[0]); } });
      shapes.appendChild(b);
    });
    h.appendChild(shapes);
    var imgRow = el("div", "nc-x-imgrow"), choose = el("button", "nc-x-btn", "Choose PNG / GIF"), clr = el("button", "nc-x-btn nc-x-btn-ghost", "Clear"), nm = el("span", "nc-x-name", "No image");
    choose.type = clr.type = "button"; choose.addEventListener("click", pickImage);
    clr.addEventListener("click", function () { set("hImg", ""); if (S().style === "image") { set("hStyle", "circle"); } });
    imgRow.appendChild(choose); imgRow.appendChild(clr); imgRow.appendChild(nm); h.appendChild(imgRow);
    var size = slider("Size", "hSize", 2, 9, 0.5, function (v) { return v.toFixed(1); });
    var line = slider("Line thickness", "hLine", 0.5, 6, 0.1, function (v) { return v.toFixed(1); });
    h.appendChild(size); h.appendChild(line);
    var rs = el("button", "nc-x-btn nc-x-btn-ghost", "Reset handle style"); rs.type = "button";
    rs.addEventListener("click", function () { set("hStyle", "circle"); set("hSize", "4.5"); set("hLine", "1.2"); set("hImg", ""); });
    var ra = el("div", "nc-x-actions"); ra.appendChild(rs); h.appendChild(ra);
    h.appendChild(el("p", "nc-x-note", "Animated GIFs play on the handles. Use small images (about 64×64 px) for best performance."));
    wrap.appendChild(h);

    // --- falling effect (particles / rain)
    var fx = el("div", "section mt-4 svelte-9ghi9u nc-x-sec");
    fx.appendChild(header("Falling Effect"));
    var fxs = el("div", "nc-x-shapes");
    FX.forEach(function (f) {
      var b = el("button", "nc-x-shape", '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round">' + f[2] + '</svg><span>' + f[1] + '</span>');
      b.type = "button"; b.setAttribute("data-s", f[0]);
      b.addEventListener("click", function () { set("pEffect", f[0]); });
      fxs.appendChild(b);
    });
    fx.appendChild(fxs);
    var pc = colorRow("Color", "pColor");
    var pa = slider("Opacity", "pAlpha", 0, 100, 1, function (v) { return Math.round(v) + "%"; });
    fx.appendChild(pc); fx.appendChild(pa);
    var prs = el("button", "nc-x-btn nc-x-btn-ghost", "Reset effect"); prs.type = "button";
    prs.addEventListener("click", function () { set("pEffect", "particles"); set("pColor", "#ffffff"); set("pAlpha", "100"); });
    var pra = el("div", "nc-x-actions"); pra.appendChild(prs); fx.appendChild(pra);
    fx.appendChild(el("p", "nc-x-note", "Falls over the preset Library area of the Curve tab. Color and opacity apply to both Particles and Rain."));
    wrap.appendChild(fx);

    ui = { wdir: wdir, wint: wint, wsz: wsz, wsides: wsides, gsz: [[gwp, "gWp"], [ghp, "gHp"], [gwl, "gWl"], [ghl, "gHl"]], gTog: gTog, gps: gps, gc1: gc1, gc2: gc2, gcg: gcg, gdir: gdir, gint: gint, garea: garea, fxs: fxs, pc: pc, pa: pa, wrap: wrap, shapes: shapes, size: size, line: line, nm: nm, clr: clr };
    return wrap;
  }

  function refreshUI() {
    if (!ui || !ui.wrap.isConnected && ui.__seen) { return; }
    ui.__seen = true;
    var st = S();
    ui.size._sync(st.size); ui.line._sync(st.line);
    Array.prototype.forEach.call(ui.shapes.children, function (b) { b.classList.toggle("active", b.getAttribute("data-s") === st.style); });
    ui.gsz.forEach(function (a) { a[0]._sync(parseFloat(localStorage.getItem("neucurve_" + a[1])) || 100); });
    ui.gTog.classList.toggle("on", st.gOn);
    ui.gc1._sync(st.gC1); ui.gc2._sync(st.gC2); ui.gcg._sync(st.gGlow); ui.gdir._sync(st.gDir); ui.gint._sync(st.gInt);
    Array.prototype.forEach.call(ui.gps.children, function (b) { b.classList.toggle("active", b.getAttribute("data-g") === st.gP); });
    Array.prototype.forEach.call(ui.garea.children, function (b) { b.classList.toggle("active", b.getAttribute("data-a") === st.gArea); });
    applyGradient(st);
    ui.wdir._sync(st.wDir); ui.wint._sync(st.wInt); ui.wsz._sync(st.wSize);
    Array.prototype.forEach.call(ui.wsides.children, function (b) { b.classList.toggle("active", parseFloat(b.getAttribute("data-a")) === Math.round(st.wDir) % 360); });
    ui.pc._sync(st.pColor); ui.pa._sync(st.pAlpha);
    Array.prototype.forEach.call(ui.fxs.children, function (b) { b.classList.toggle("active", b.getAttribute("data-s") === st.pEffect); });
    ui.nm.textContent = st.img ? (st.img.indexOf("data:") === 0 ? "Custom image" : decodeURIComponent(st.img.split("/").pop())) : "No image";
    ui.clr.style.visibility = st.img ? "visible" : "hidden";
  }

  window.__ncExtraUI = function () { var w = buildUI(); setTimeout(refreshUI, 0); return w; };

  /* ---------------- init / sync ---------------- */
  function onSync(ev) {
    try {
      var d = ev && ev.data; if (typeof d === "string") { d = JSON.parse(d); }
      if (d && KEYS.test(d.key)) { write(d.key, d.val); applyAll(); }
    } catch (e) { }
  }
  function init() {
    applyAll();
    window.addEventListener("storage", function (e) { if (!e.key || /^neucurve_(h[SLI]|p(Effect|Color|Alpha)|grad|wg)/.test(e.key)) { applyAll(); } });
    try { if (window.CSInterface) { new window.CSInterface().addEventListener("com.neucurve.sync", onSync); } } catch (e) { }
    var last = "";
    setInterval(function () { if (window.__ncAway && window.__ncAway()) { return; } var k = JSON.stringify(S()); if (k !== last) { last = k; applyAll(); } }, 400);
  }
  if (document.readyState === "loading") { document.addEventListener("DOMContentLoaded", init); } else { init(); }
})();
