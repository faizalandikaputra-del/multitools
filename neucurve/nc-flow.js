/* NeuCurve - nc-flow.js  (companion of nc-flow.css)
   Re-arranges NeuCurve's existing controls into the "Flow" layout:
     row 1 : reset | import | speed | [ x1, y1, x2, y2 ] | star
     row 2 : Ease Out | Ease | Ease In | APPLY | settings      (apply the default presets of the same name)
     bar   : divider, scrub slider, library toolbar (select + tool icons; Invert now lives in row 1 next to Remove Expressions)
   Landscape (wide panel): model tabs become a horizontal pill bar above the graph; the scrub slider + library toolbar
   move to the top of the right column (above the preset grid), like the Flow reference.
   The ORIGINAL buttons are MOVED (not cloned), so every click handler / active / disabled state of the compiled
   bundle keeps working. Only three things are new: the value pill (computed from the Bezier handles), the
   Ease Out / Ease / Ease In buttons and the star (= "save current curve as preset").
   First run only: sets the default curve/handle look (yellow line, heart handles); change it afterwards in
   NeuCurve Settings as usual. Written in plain ES5 for old CEP hosts (AE 2019/2021).
   Off switch: remove the <script src="./nc-flow.js"> and <link href="./nc-flow.css"> lines in index.html. */
(function () {
  "use strict";

  /* ---------------- first-run defaults (runs before the bundle reads localStorage) ---------------- */
  try {
    if (window.parent === window || true) {
      if (!localStorage.getItem("neucurve_flowInit")) {
        localStorage.setItem("neucurve_graphLineColor", "#FFD21F");
        localStorage.setItem("neucurve_handleColor", "#FFD21F");
        localStorage.setItem("neucurve_uiColor", "#FFD21F");
        localStorage.setItem("neucurve_hStyle", "heart");
        localStorage.setItem("neucurve_hSize", "5");
        localStorage.setItem("neucurve_flowInit", "1");
      }
    }
  } catch (e) { }

  /* ---------------- icons (24x24, stroke = currentColor) ---------------- */
  function svg(inner, extra) {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"' + (extra || "") + ">" + inner + "</svg>";
  }
  function kf(d) { return '<svg viewBox="0 0 25 25" fill="currentColor" stroke="none"><path d="' + d + '"/></svg>'; }
  var ICON = {
    /* v17: every icon now says what the button does (hover tooltips are unchanged) */
    reset: svg('<path d="m7 21-4.3-4.3a2 2 0 0 1 0-2.8l9.6-9.6a2 2 0 0 1 2.8 0l5.6 5.6a2 2 0 0 1 0 2.8L13 21"/><path d="M22 21H7"/><path d="m5 11 9 9"/>'),            /* Remove Expressions = eraser */
    imp: svg('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/><path d="M12 15V3"/>'),                                                             /* Read from AE = download into panel */
    speed: svg('<path d="M2.5 20C7 20 8.4 4 12 4s5 16 9.5 16"/><path d="M2.5 20h19" stroke-opacity=".5"/>'),                                                                                                   /* Speed Graph = gauge */
    star: svg('<path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/><path d="M12 7.5v6"/><path d="M9 10.5h6"/>'),                                                          /* Save as preset = bookmark + */
    easeOut: svg('<path d=\"M19.5 4.5Q14.5 9.4 10.5 10.1L4.5 12L10.5 13.9Q14.5 14.6 19.5 19.5Z\" fill=\"currentColor\" stroke-width=\"1.4\"/>'),   /* AE keyframe: point left, hourglass half right */
    ease: svg('<path d=\"M4.5 4.5Q10 9 12 9Q14 9 19.5 4.5V19.5Q14 15 12 15Q10 15 4.5 19.5Z\" fill=\"currentColor\" stroke-width=\"1.4\"/>'),   /* AE keyframe: hourglass */
    easeIn: svg('<path d=\"M4.5 4.5Q9.5 9.4 13.5 10.1L19.5 12L13.5 13.9Q9.5 14.6 4.5 19.5Z\" fill=\"currentColor\" stroke-width=\"1.4\"/>'),   /* AE keyframe: hourglass half left, point right */
    hourglass: svg('<path d="m21 16-4 4-4-4"/><path d="M17 20V4"/><path d="m3 8 4-4 4 4"/><path d="M7 4v16"/>'),                                                                 /* Invert = up/down swap arrows */
    book: svg('<rect width="18" height="7" x="3" y="3" rx="1.5"/><rect width="9" height="7" x="3" y="14" rx="1.5"/><rect width="5" height="7" x="16" y="14" rx="1.5"/>'),         /* Expression Templates = template layout */
    code: svg('<rect width="18" height="18" x="3" y="3" rx="2.5"/><path d="M9 17c2 0 2.8-1 2.8-3V10c0-2 .8-3 3.2-3"/><path d="M9 11.5h6"/>'),                                    /* Expression Mode = f(x) box */
    play: svg('<path d="M7 4.5l12 7.5-12 7.5z" fill="currentColor"/>'),                                                                                                             /* Preview = play */
    bake: svg('<path d="M12 2.5l4.5 4.5-4.5 4.5L7.5 7z"/><path d="M12 12.5l4.5 4.5-4.5 4.5L7.5 17z"/>'),                                                                        /* Bake to Keyframes = stacked keyframes */
    live: svg('<circle cx="12" cy="12" r="2" fill="currentColor"/><path d="M4.9 19.1C1 15.2 1 8.8 4.9 4.9"/><path d="M7.8 16.2c-2.3-2.3-2.3-6.1 0-8.5"/><path d="M16.2 7.8c2.3 2.3 2.3 6.1 0 8.5"/><path d="M19.1 4.9c3.9 3.9 3.9 10.3 0 14.2"/>')   /* Live Playhead = live signal */
  };


  /* ---------------- helpers ---------------- */
  function q(sel, root) { return (root || document).querySelector(sel); }
  function qa(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function el(tag, cls) { var n = document.createElement(tag); if (cls) { n.className = cls; } return n; }
  function btnByTitle(title) { return q('button[title="' + title + '"]'); }
  function addCls(n, c) { if (n && n.className.indexOf(c) < 0) { n.className += " " + c; } }

  /* Moves an original button into `parent` (once), tags it with `cls`, optionally swaps its icon. */
  function place(btn, parent, cls, icon, before) {
    if (!btn) { return; }
    if (btn.parentNode !== parent) { parent.insertBefore(btn, before || null); }
    addCls(btn, cls);
    if (icon && btn.getAttribute("data-fl-icon") !== "1") {
      btn.innerHTML = icon; btn.setAttribute("data-fl-icon", "1");
    }
  }

  /* ---------------- value pill ---------------- */
  var pill = null, lastTxt = "";
  function f2(v) { return (Math.round(v * 100) / 100).toFixed(2); }
  function readValues() {
    var svgEl = q("svg.curve-svg");
    var active = q(".mtab.active") || q(".nav-tab.active");
    var model = active ? (active.getAttribute("title") || active.__mtTitle || "") : "";
    if (!svgEl) { return model; }
    var ls = qa("g.handles > line", svgEl);
    if (model.toLowerCase().indexOf("zier") >= 0 && ls.length === 2) {
      var a = ls[0], b = ls[1];
      var p0x = parseFloat(a.getAttribute("x1")), p0y = parseFloat(a.getAttribute("y1"));
      var h1x = parseFloat(a.getAttribute("x2")), h1y = parseFloat(a.getAttribute("y2"));
      var p3x = parseFloat(b.getAttribute("x1")), p3y = parseFloat(b.getAttribute("y1"));
      var h2x = parseFloat(b.getAttribute("x2")), h2y = parseFloat(b.getAttribute("y2"));
      var dx = p3x - p0x, dy = p0y - p3y;
      if (dx && dy && isFinite(dx) && isFinite(dy)) {
        return f2((h1x - p0x) / dx) + ", " + f2((p0y - h1y) / dy) + ", " + f2((h2x - p0x) / dx) + ", " + f2((p0y - h2y) / dy);
      }
    }
    return model || "Curve";
  }
  function updatePill() {
    if (!pill) { return; }
    var t = readValues();
    if (t !== lastTxt) { lastTxt = t; pill.textContent = t; pill.title = "Click to copy" + (t.indexOf(",") > 0 ? " cubic-bezier(" + t + ")" : ""); }
  }
  function copyText(txt) {
    try {
      var ta = el("textarea"); ta.value = txt; ta.style.cssText = "position:fixed;left:-999px;top:0;opacity:0";
      document.body.appendChild(ta); ta.select(); document.execCommand("copy"); document.body.removeChild(ta);
    } catch (e) { }
  }

  /* ---------------- actions ---------------- */
  /* Applies one of NeuCurve's built-in presets by name ("Ease Out" / "Ease" / "Ease In"), whatever library is showing.
     Uses the hook added to assets/index.js (window.__ncApplyDefault); falls back to clicking the matching tile. */
  function applyDefault(name) {
    if (window.__ncApplyDefault && window.__ncApplyDefault(name)) { return; }
    var items = qa(".preset-item"), i, n;
    for (i = 0; i < items.length; i++) {
      n = items[i].querySelector(".preset-name");
      if (n && n.textContent.replace(/\s+/g, "").toLowerCase() === name.replace(/\s+/g, "").toLowerCase()) { items[i].click(); return; }
    }
  }
  function saveCurrent() {
    var sel = q(".lib-select");
    if (sel && sel.value !== "saved") {
      sel.value = "saved";
      sel.dispatchEvent(new Event("change", { bubbles: true }));
    }
    setTimeout(function () { var add = q(".add-preset-btn"); if (add) { add.click(); } }, 60);
  }

  /* ---------------- build (idempotent) ---------------- */
  var built = false, row1 = null, row2 = null;

  function build() {
    var ac = q(".action-container");
    if (!ac) { return; }
    var bar = q(".fl-bar", ac);
    if (!bar) {
      bar = el("div", "fl-bar");
      row1 = el("div", "fl-row fl-row1");
      row2 = el("div", "fl-row fl-row2");
      bar.appendChild(row1); bar.appendChild(row2);
      ac.insertBefore(bar, ac.firstChild);

      pill = el("button", "fl-pill"); pill.type = "button"; pill.textContent = "0.00, 0.00, 1.00, 1.00";
      pill.addEventListener("click", function () {
        var t = pill.textContent; copyText(t.indexOf(",") > 0 ? "cubic-bezier(" + t + ")" : t);
        pill.className += " is-copied"; setTimeout(function () { pill.className = pill.className.replace(" is-copied", ""); }, 700);
      });

      var star = el("button", "fl-ico fl-star"); star.type = "button"; star.title = "Save current curve as preset";
      star.innerHTML = ICON.star; star.addEventListener("click", saveCurrent);

      function easeBtn(cls, title, name, icon) {
        var b = el("button", "fl-sq " + cls); b.type = "button"; b.title = title;
        b.innerHTML = icon; b.addEventListener("click", function () { applyDefault(name); });
        return b;
      }
      var eOut = easeBtn("fl-eout", "Ease Out", "Ease Out", ICON.easeOut);
      var eMid = easeBtn("fl-ease", "Ease", "Ease", ICON.ease);
      var eIn = easeBtn("fl-ein", "Ease In", "Ease In", ICON.easeIn);

      bar._fl = { star: star, eOut: eOut, eMid: eMid, eIn: eIn };
    }
    var X = bar._fl;
    row1 = q(".fl-row1", bar); row2 = q(".fl-row2", bar);

    /* row 1 */
    place(btnByTitle("Remove Expressions"), row1, "fl-ico", ICON.reset);
    place(btnByTitle("Invert"), row1, "fl-ico", ICON.hourglass);   /* Invert sits right next to Remove Expressions */
    place(btnByTitle("Read from AE"), row1, "fl-ico", ICON.imp);
    place(btnByTitle("Speed Graph"), row1, "fl-ico", ICON.speed);
    if (pill.parentNode !== row1) { row1.appendChild(pill); }
    if (X.star.parentNode !== row1) { row1.appendChild(X.star); }

    /* row 2 */
    if (X.eOut.parentNode !== row2) { row2.appendChild(X.eOut); }
    if (X.eMid.parentNode !== row2) { row2.appendChild(X.eMid); }
    if (X.eIn.parentNode !== row2) { row2.appendChild(X.eIn); }
    place(q(".apply-btn", ac) || q(".apply-btn"), row2, "", null);
    place(btnByTitle("Settings"), row2, "fl-ico", null);

    /* divider -> slider -> library toolbar.
       Portrait: all three live in the bottom bar. Landscape: the slider + toolbar move to the top of the right column
       (inside .variable-section, above the preset grid) and the model tabs become a pill bar above the graph. */
    var cw = q(".content-wrapper");
    var land = !!(cw && cw.className.indexOf("is-landscape") >= 0);
    var divider = q(".section-divider");
    var strip = q(".preview-strip-container");
    var head = q(".library-header");
    var host = bar, side = q(".fl-side");
    if (land) {
      var vs = q(".variable-section");
      if (!side && vs) { side = el("div", "fl-bar fl-side"); vs.insertBefore(side, vs.firstChild); }
      if (side) { host = side; }
    }
    if (divider && divider.parentNode !== bar) { bar.appendChild(divider); }
    if (strip && head) {
      if (strip.parentNode !== host || head.parentNode !== host || strip.nextElementSibling !== head) {
        host.appendChild(strip); host.appendChild(head);
      }
    } else {
      if (strip && strip.parentNode !== host) { host.appendChild(strip); }
      if (head && head.parentNode !== host) { host.appendChild(head); }
    }
    if (!land && side && side.parentNode && !side.children.length) { side.parentNode.removeChild(side); }

    var modes = q(".model-nav-strip"), fixed = q(".fixed-section");
    if (land && modes && fixed) {
      addCls(modes, "fl-modes");
      if (modes.parentNode !== fixed) { fixed.insertBefore(modes, fixed.firstChild); }
    }

    /* large graph editor -> corner of the graph */
    var area = q(".canvas-area");
    var big = btnByTitle("Open Large Graph Editor");
    if (big && area) {
      if (big.parentNode !== area) { area.appendChild(big); }
      if (big.className !== "fl-expand") { big.className = "fl-expand"; }   /* same-value writes still fire the observer -> endless rAF loop */
    }

    /* tool icons -> library toolbar */
    if (head) {
      /* v17: the tool icons live in their own .fl-toolrow (a real row UNDER the library dropdown in landscape;
         display:contents in portrait so the old single-row bar looks exactly as before) */
      var trow = q(".fl-toolrow", head);
      if (!trow) { trow = el("div", "fl-toolrow"); head.appendChild(trow); }
      place(btnByTitle("Expression Templates"), trow, "fl-tool", ICON.book);
      place(btnByTitle("Expression Mode"), trow, "fl-tool", ICON.code);
      place(btnByTitle("Preview"), trow, "fl-tool", ICON.play);
      place(q('button[title^="Bake to Keyframes"]'), trow, "fl-tool", ICON.bake);
      place(btnByTitle("Live Playhead"), trow, "fl-tool", ICON.live);
      var optBox = q(".options-menu-container", head);
      if (land && optBox && optBox.parentNode !== trow) { trow.appendChild(optBox); }
    }

    /* the old, now-empty control row / utility group / divider shell */
    var oldRow = q(".control-row", ac), oldApply = q(".apply-row", ac);
    if (oldRow) { oldRow.style.display = "none"; }
    if (oldApply) { oldApply.style.display = "none"; }

    built = true;
    updatePill();
  }

  /* ---------------- Auto Apply state -> html.nc-auto-on (APPLY turns gray and reads "AUTO APPLY", see CSS) ---------------- */
  function syncAuto() {
    var on = false;
    try { on = localStorage.getItem("neucurve_autoApply") === "true"; } catch (e) { }
    var r = document.documentElement, has = r.className.indexOf("nc-auto-on") >= 0;
    if (on && !has) { r.className += " nc-auto-on"; }
    else if (!on && has) { r.className = r.className.replace(/\s*nc-auto-on/g, ""); }
    var b = q(".apply-btn");
    if (b) {
      var tt = on ? "Auto Apply is ON - the graph is applied to After Effects live. Click to apply manually." : "";
      if ((b.title || b.__mtTitle || "") !== tt) { b.title = tt; }
    }
  }
  window.addEventListener("storage", syncAuto);
  window.addEventListener("focus", syncAuto);
  document.addEventListener("mouseenter", syncAuto, true);
  try {
    if (window.CSInterface) { new window.CSInterface().addEventListener("com.neucurve.sync", function () { setTimeout(syncAuto, 0); }); }
  } catch (e) { }
  setInterval(function () { if (window.__ncAway && window.__ncAway()) { return; } syncAuto(); }, 800);   /* cheap: one localStorage read, nothing is sent to After Effects */
  syncAuto();

  /* The bundle measures the graph through a hidden iframe that is NOT tied to the size of .canvas-area, so when this
     file moves things around (tab bar above the graph, bottom bar rows) the graph kept its old, taller size and got cut
     off at the bottom. When the graph box changes size, fire the resize event the bundle is listening for. */
  var lastBox = "", fires = [], mutedUntil = 0;
  function remeasure() {
    var area = q(".canvas-area");
    if (!area) { return; }
    var key = area.offsetWidth + "x" + area.offsetHeight;
    if (key === lastBox) { return; }
    var now = Date.now();
    if (now < mutedUntil) { return; }                 // cool-down after a detected size flip-flop (keeps lastBox so it retries)
    /* Guard: if the graph box keeps changing size right after we fire resize (graph size <-> box size feedback),
       the graph visibly blinks. More than 6 fires within 1 s = loop -> stop firing for 1.5 s. */
    fires.push(now);
    while (fires.length && now - fires[0] > 1000) { fires.shift(); }
    if (fires.length > 6) { mutedUntil = now + 1500; fires.length = 0; return; }
    lastBox = key;
    var f = q("iframe", area);
    try { if (f && f.contentWindow) { f.contentWindow.dispatchEvent(new Event("resize")); } } catch (e) { }
  }

  /* ---------------- watch ---------------- */
  var pending = false;
  function schedule() {
    if (pending) { return; }
    pending = true;
    requestAnimationFrame(function () { pending = false; try { build(); } catch (e) { if (window.console) { console.warn("[nc-flow]", e); } } updatePill(); syncAuto(); remeasure(); });
  }
  function start() {
    var app = document.getElementById("app") || document.body;
    new MutationObserver(function (list) {
      /* nc-glow.js rewrites "d" on ~20 glow paths on every curve change, nc-morph.js rewrites the main "d" every frame
         while morphing: none of that needs a re-layout pass, so skip records that only come from those. */
      for (var i = 0; i < list.length; i++) {
        var r = list[i], t = r.target;
        if (r.type === "attributes" && r.attributeName === "d") { continue; }
        if (t && t.closest && t.closest("g.nc-glow")) { continue; }
        schedule(); return;
      }
    }).observe(app, { childList: true, subtree: true, attributes: true, attributeFilter: ["x1", "y1", "x2", "y2", "class", "d"] });
    schedule();
  }
  if (document.readyState === "loading") { document.addEventListener("DOMContentLoaded", start); } else { start(); }
})();
