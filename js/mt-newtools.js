/* Multi Tool - mt-newtools.js (panel side)
   Upgrades the Tools tab in place:
     - Stagger / Sequence Layers      -> Stagger Pro      (host.jsx TOOLS_staggerPro)
     - Batch Rename Layers            -> Rename & Label   (host.jsx TOOLS_renamePreview / TOOLS_renamePro)
     - Project Cleaner & Sanitizer    -> + scan report    (host.jsx TOOLS_cleanerScan / TOOLS_cleanerRun)
     - Pre-compose                    -> + Pre-comp Smart (host.jsx TOOLS_precompSmart)
   The tabs are rebuilt on every tab switch, so a MutationObserver on #panel re-applies the upgrade each time.
   Loaded after main.js and panel-refinements.js. Needs window.MTCore (Bridge) and window.__MT (toast). ES5. */
(function () {
  "use strict";
  var panel = document.getElementById("panel");
  if (!panel) { return; }

  /* ---------------- helpers ---------------- */
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function q(root, sel) { return root.querySelector(sel); }
  function qa(root, sel) { return Array.prototype.slice.call(root.querySelectorAll(sel)); }
  function toast(msg, isErr) { try { if (window.__MT && window.__MT.toast) { window.__MT.toast(msg, !!isErr); } } catch (e) { } }
  function call(fn, args) {
    if (window.MTCore && window.MTCore.Bridge) { return window.MTCore.Bridge.call(fn, args || []); }
    return Promise.resolve({ ok: false, message: "Not connected to After Effects." });
  }
  function debounce(fn, ms) { var t = null; return function () { var a = arguments, s = this; clearTimeout(t); t = setTimeout(function () { fn.apply(s, a); }, ms); }; }
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { } }
  function chipsRadio(name, items, checked, cls) {
    return '<div class="chips ' + (cls || "") + '">' + items.map(function (it) {
      return '<label class="chip"><input type="radio" name="' + name + '" value="' + it[0] + '"' + (it[0] === checked ? " checked" : "") + '><span>' + it[1] + '</span></label>';
    }).join("") + "</div>";
  }
  function pressed(btn, p) { if (btn) { btn.classList.toggle("is-pending", !!p); } }
  function finish(btn, res) {
    pressed(btn, false);
    var ok = !!(res && res.ok);
    toast((res && res.message) || (ok ? "Done." : "Something went wrong."), !ok);
    return ok;
  }
  // Finds a capsule card (.ta-group) by its header label.
  function groupByLabel(label) {
    var groups = qa(panel, ".ta-group"), i, l;
    for (i = 0; i < groups.length; i++) {
      l = q(groups[i], ".ta-group-label");
      if (l && l.textContent.replace(/\s+/g, " ").trim() === label) { return groups[i]; }
    }
    return null;
  }
  // Replaces everything inside a card except its hidden original heading, then re-measures the card height.
  function setBody(group, html, newLabel) {
    var inner = q(group, ".ta-group-body-inner"), heading = q(inner, ".ta-title");
    inner.innerHTML = "";
    if (heading) { inner.appendChild(heading); }
    var box = document.createElement("div");
    box.className = "mtn-body";
    box.innerHTML = html;
    inner.appendChild(box);
    if (newLabel) { var l = q(group, ".ta-group-label"); if (l) { l.textContent = newLabel; } }
    group.setAttribute("data-mtn", "1");
    return box;
  }
  function refit(el) {   // open cards pin max-height while animating; after content grows, let it flow again
    var body = el.closest ? el.closest(".ta-group-body") : null;
    if (body && body.parentNode.classList.contains("is-open")) { body.style.maxHeight = "none"; }
  }

  /* ---------------- 4. Stagger Pro ---------------- */
  var CURVES = [["linear", "Linear"], ["ease-in", "Ease in"], ["ease-out", "Ease out"], ["ease-in-out", "Ease in-out"]];
  function curveVal(kind, t) {
    if (t < 0) { t = 0; } if (t > 1) { t = 1; }
    if (kind === "ease-in") { return t * t; }
    if (kind === "ease-out") { return 1 - (1 - t) * (1 - t); }
    if (kind === "ease-in-out") { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }
    return t;
  }
  function ranksFor(n, order, seed) {   // same math as host.jsx _ntRanks, so the preview matches the result
    var r = [], i, j, tmp, s;
    for (i = 0; i < n; i++) { r.push(i); }
    if (order === "bottom-up") { for (i = 0; i < n; i++) { r[i] = n - 1 - i; } }
    else if (order === "center") {
      var c = (n - 1) / 2, idx = [];
      for (i = 0; i < n; i++) { idx.push(i); }
      idx.sort(function (a, b) { var d = Math.abs(a - c) - Math.abs(b - c); return d !== 0 ? d : a - b; });
      for (i = 0; i < n; i++) { r[idx[i]] = i; }
    } else if (order === "random") {
      s = (Number(seed) >>> 0) || 1;
      for (i = n - 1; i > 0; i--) { s = (s * 1664525 + 1013904223) >>> 0; j = Math.floor((s / 4294967296) * (i + 1)); tmp = r[i]; r[i] = r[j]; r[j] = tmp; }
    }
    return r;
  }
  function upgradeStagger(group) {
    var box = setBody(group,
      '<p class="field-note">Moves each selected layer, or its selected keyframes, one step after the other. The curve shapes the spacing.</p>' +
      '<div class="mtn-label">Apply to</div>' + chipsRadio("mtn-st-target", [["layers", "Layers"], ["keys", "Keyframes"]], "layers") +
      '<div class="mtn-label">Order</div>' + chipsRadio("mtn-st-order", [["top-down", "Top down"], ["bottom-up", "Bottom up"], ["center", "From center"], ["random", "Random"]], "top-down", "chips-4") +
      '<div class="param"><label for="mtn-st-offset">Offset</label><input class="num" type="number" id="mtn-st-offset" min="0" max="2400" step="0.5" value="2"></div>' +
      '<div class="mtn-label">Unit</div>' + chipsRadio("mtn-st-unit", [["f", "Frames"], ["s", "Seconds"]], "f") +
      '<div class="mtn-label">Spacing curve</div>' + chipsRadio("mtn-st-curve", CURVES, "linear", "chips-4") +
      '<div class="param" id="mtn-st-seed-row" hidden><label for="mtn-st-seed">Seed</label><input class="num" type="number" id="mtn-st-seed" min="1" max="99999" step="1" value="4821">' +
        '<button type="button" class="mtn-mini" id="mtn-st-dice" title="New random order">New</button></div>' +
      '<div class="mtn-stg" id="mtn-st-prev" aria-hidden="true"></div>' +
      '<button class="btn-apply" id="mtn-st-apply" type="button">Apply stagger</button>', "Stagger Pro");
    var prev = q(box, "#mtn-st-prev");
    function val(name) { var e = q(box, 'input[name="' + name + '"]:checked'); return e ? e.value : ""; }
    function draw() {
      var order = val("mtn-st-order"), curve = val("mtn-st-curve"), seed = q(box, "#mtn-st-seed").value, n = 6, i, html = "", r;
      q(box, "#mtn-st-seed-row").hidden = order !== "random";
      r = ranksFor(n, order, seed);
      for (i = 0; i < n; i++) {
        var left = curveVal(curve, r[i] / (n - 1)) * 46;
        html += '<div class="mtn-stg-row"><span>Layer ' + (i + 1) + '</span><div class="mtn-stg-lane"><i style="left:' + left.toFixed(1) + '%;width:54%"></i></div></div>';
      }
      prev.innerHTML = html;
      refit(box);
    }
    qa(box, "input").forEach(function (i) { i.addEventListener("input", draw); i.addEventListener("change", draw); });
    q(box, "#mtn-st-dice").addEventListener("click", function () { q(box, "#mtn-st-seed").value = String(1 + Math.floor(Math.random() * 99998)); draw(); });
    draw();
    q(box, "#mtn-st-apply").addEventListener("click", function (e) {
      var btn = e.currentTarget, offset = parseFloat(q(box, "#mtn-st-offset").value);
      if (btn.classList.contains("is-pending")) { return; }
      if (!isFinite(offset) || offset < 0) { offset = 0; }
      pressed(btn, true);
      var go = function (frames) {
        call("TOOLS_staggerPro", [{ target: val("mtn-st-target"), order: val("mtn-st-order"), curve: val("mtn-st-curve"), offset: frames, seed: parseInt(q(box, "#mtn-st-seed").value, 10) || 1 }])
          .then(function (res) { finish(btn, res); });
      };
      if (val("mtn-st-unit") === "s") {
        call("NT_compInfo", []).then(function (r) {
          var fps = r && r.ok && r.data && r.data.fps ? r.data.fps : 30;
          go(offset * fps);
        });
      } else { go(offset); }
    });
  }

  /* ---------------- 5. Rename & Label ---------------- */
  var LABELS = [[-1, "Keep"], [1, "Red"], [2, "Yellow"], [3, "Aqua"], [4, "Pink"], [5, "Lavender"], [6, "Peach"], [7, "Sea Foam"], [8, "Blue"], [9, "Green"], [10, "Purple"], [11, "Orange"], [12, "Brown"], [13, "Fuchsia"], [14, "Cyan"], [15, "Sandstone"], [16, "Dark Green"]];
  var LABEL_TYPES = [["text", "Text", 2], ["shape", "Shape", 8], ["null", "Null", -1], ["solid", "Solid", -1], ["adjust", "Adjustment", 10], ["camera", "Camera", -1]];
  function labelSelect(id, def) {
    return '<select class="text-input mtn-sel" id="' + id + '">' + LABELS.map(function (l) { return '<option value="' + l[0] + '"' + (l[0] === def ? " selected" : "") + ">" + l[1] + "</option>"; }).join("") + "</select>";
  }
  function upgradeRename(group) {
    var box = setBody(group,
      '<p class="field-note">Renames the selected layers, top to bottom, with a live preview. One Undo step covers the whole batch.</p>' +
      '<div class="param"><label for="mtn-rn-pattern">Name pattern</label><input class="text-input" type="text" id="mtn-rn-pattern" placeholder="{name}" value="{name}" autocomplete="off" spellcheck="false"></div>' +
      '<div class="mtn-tokens">' + ["{name}", "{n}", "{n:02}", "{type}", "{comp}", "{date}"].map(function (t) { return '<button type="button" class="mtn-chip" data-token="' + t + '">' + t + "</button>"; }).join("") + "</div>" +
      '<div class="param"><label for="mtn-rn-find">Find</label><input class="text-input" type="text" id="mtn-rn-find" autocomplete="off" spellcheck="false"></div>' +
      '<div class="param"><label for="mtn-rn-replace">Replace</label><input class="text-input" type="text" id="mtn-rn-replace" autocomplete="off" spellcheck="false"></div>' +
      '<label class="switch-row" for="mtn-rn-regex"><span>Regex</span><input type="checkbox" id="mtn-rn-regex"><span class="switch-track"></span></label>' +
      '<label class="switch-row" for="mtn-rn-case"><span>Match case</span><input type="checkbox" id="mtn-rn-case"><span class="switch-track"></span></label>' +
      '<div class="param"><label for="mtn-rn-start">Start at</label><input class="num" type="number" id="mtn-rn-start" min="0" max="99999" step="1" value="1"></div>' +
      '<div class="mtn-label">Preview <button type="button" class="mtn-mini" id="mtn-rn-refresh">Refresh</button></div>' +
      '<div class="mtn-pv" id="mtn-rn-pv"><div class="mtn-pv-empty">Select layers to see the new names.</div></div>' +
      '<label class="switch-row" for="mtn-rn-labels-on"><span>Label color by type</span><input type="checkbox" id="mtn-rn-labels-on"><span class="switch-track"></span></label>' +
      '<div class="mtn-labels" id="mtn-rn-labels" hidden>' + LABEL_TYPES.map(function (t) {
        return '<label class="mtn-labelrow" for="mtn-rn-l-' + t[0] + '"><span>' + t[1] + "</span>" + labelSelect("mtn-rn-l-" + t[0], t[2]) + "</label>";
      }).join("") + "</div>" +
      '<div class="btn-pair"><button class="btn-apply" id="mtn-rn-labels-only" type="button">Labels only</button><button class="btn-apply" id="mtn-rn-apply" type="button">Rename layers</button></div>', "Rename & Label");

    function opts() {
      return { pattern: q(box, "#mtn-rn-pattern").value, find: q(box, "#mtn-rn-find").value, replace: q(box, "#mtn-rn-replace").value,
        regex: q(box, "#mtn-rn-regex").checked, matchCase: q(box, "#mtn-rn-case").checked, start: parseInt(q(box, "#mtn-rn-start").value, 10) };
    }
    function labelMap() {
      if (!q(box, "#mtn-rn-labels-on").checked) { return null; }
      var m = {};
      LABEL_TYPES.forEach(function (t) { m[t[0]] = parseInt(q(box, "#mtn-rn-l-" + t[0]).value, 10); });
      return m;
    }
    var pv = q(box, "#mtn-rn-pv"), seq = 0;
    function refresh() {
      var my = ++seq, o = opts();
      try { if (o.find && o.regex) { new RegExp(o.find); } } catch (e) { pv.innerHTML = '<div class="mtn-pv-empty is-bad">That regex is not valid.</div>'; return; }
      call("TOOLS_renamePreview", [o]).then(function (res) {
        if (my !== seq) { return; }
        if (!res || !res.ok || !res.data || !res.data.items) { pv.innerHTML = '<div class="mtn-pv-empty">' + esc((res && res.message) || "Select layers to see the new names.") + "</div>"; q(box, "#mtn-rn-apply").textContent = "Rename layers"; return; }
        var html = res.data.items.slice(0, 7).map(function (it) {
          return '<div class="mtn-pv-row"><span class="mtn-pv-old">' + esc(it.from) + '</span><span class="mtn-pv-to">to</span><span class="mtn-pv-new' + (it.from === it.to ? " is-same" : "") + '">' + esc(it.to) + "</span></div>";
        }).join("");
        if (res.data.total > 7) { html += '<div class="mtn-pv-more">' + (res.data.total - 7) + " more</div>"; }
        pv.innerHTML = html;
        q(box, "#mtn-rn-apply").textContent = "Rename " + res.data.total + " layer" + (res.data.total === 1 ? "" : "s");
        refit(box);
      });
    }
    var refreshSoon = debounce(refresh, 250);
    qa(box, ".text-input, .num, input[type=checkbox]").forEach(function (i) { i.addEventListener("input", refreshSoon); i.addEventListener("change", refreshSoon); });
    q(box, "#mtn-rn-labels-on").addEventListener("change", function (e) { q(box, "#mtn-rn-labels").hidden = !e.target.checked; refit(box); });
    q(box, "#mtn-rn-refresh").addEventListener("click", refresh);
    qa(box, "[data-token]").forEach(function (b) {
      b.addEventListener("click", function () {
        var inp = q(box, "#mtn-rn-pattern"), t = b.getAttribute("data-token"), s = inp.selectionStart, e2 = inp.selectionEnd;
        if (typeof s !== "number") { s = e2 = inp.value.length; }
        inp.value = inp.value.slice(0, s) + t + inp.value.slice(e2);
        inp.focus(); try { inp.setSelectionRange(s + t.length, s + t.length); } catch (e) { }
        refreshSoon();
      });
    });
    function run(btn, labelsOnly) {
      if (btn.classList.contains("is-pending")) { return; }
      var o = opts(), lm = labelMap();
      if (labelsOnly && !lm) { toast("Turn on Label color by type first.", true); return; }
      o.labels = lm; o.labelsOnly = !!labelsOnly;
      pressed(btn, true);
      call("TOOLS_renamePro", [o]).then(function (res) { finish(btn, res); refresh(); });
    }
    q(box, "#mtn-rn-apply").addEventListener("click", function (e) { run(e.currentTarget, false); });
    q(box, "#mtn-rn-labels-only").addEventListener("click", function (e) { run(e.currentTarget, true); });
    refresh();
  }

  /* ---------------- 6. Project Cleaner report ---------------- */
  function fmtSize(b) { if (!b) { return ""; } if (b >= 1048576) { return (b / 1048576).toFixed(b >= 10485760 ? 0 : 1) + " MB"; } return Math.max(1, Math.round(b / 1024)) + " KB"; }
  function upgradeCleaner(group) {
    var inner = q(group, ".ta-group-body-inner");
    if (q(inner, "#mtn-pc-scan")) { return; }
    var wrap = document.createElement("div");
    wrap.className = "mtn-body";
    wrap.innerHTML =
      '<p class="field-note">Scan first to see exactly what would go. Nothing is removed until you press Remove.</p>' +
      '<button class="btn-apply" id="mtn-pc-scan" type="button">Scan project</button>' +
      '<div class="mtn-report" id="mtn-pc-report" hidden></div>';
    var card = q(inner, ".beat-card");
    inner.insertBefore(wrap, card || inner.firstChild.nextSibling);
    group.setAttribute("data-mtn", "1");
    var rep = q(wrap, "#mtn-pc-report"), scanBtn = q(wrap, "#mtn-pc-scan"), data = null;

    function groups() {
      return [
        { key: "missing", title: "Missing footage", tone: "bad", items: data.missing, pre: function (it) { return !it.used; }, meta: function (it) { return it.used ? "used in a comp" : "offline"; } },
        { key: "unused", title: "Unused footage", items: data.unused, pre: function () { return true; }, meta: function (it) { return it.solid ? "solid" : fmtSize(it.size); } },
        { key: "empty", title: "Empty comps", items: data.empty, pre: function (it) { return !it.used; }, meta: function (it) { return it.used ? "used in a comp" : ""; } }
      ];
    }
    function count() {
      var n = 0; qa(rep, ".mtn-item input:checked").forEach(function () { n++; });
      var btn = q(rep, "#mtn-pc-remove"), cons = q(rep, "#mtn-pc-cons");
      btn.textContent = n ? "Remove " + n + " item" + (n === 1 ? "" : "s") : (cons && cons.checked ? "Merge duplicates" : "Nothing selected");
      btn.disabled = !n && !(cons && cons.checked);
    }
    function render() {
      var gs = groups(), dup = data.dupes.length;
      var html = '<div class="mtn-stats">' +
        '<div><b class="' + (data.missing.length ? "is-bad" : "") + '">' + data.missing.length + "</b><span>Missing</span></div>" +
        "<div><b>" + data.unused.length + "</b><span>Unused</span></div>" +
        "<div><b>" + data.empty.length + "</b><span>Empty comps</span></div>" +
        "<div><b>" + dup + "</b><span>Duplicates</span></div></div>";
      if (data.unusedBytes) { html += '<p class="field-note">Unused footage on disk: ' + fmtSize(data.unusedBytes) + ".</p>"; }
      gs.forEach(function (g) {
        if (!g.items.length) { return; }
        html += '<div class="mtn-grp" data-grp="' + g.key + '"><label class="mtn-grp-head"><input type="checkbox" class="mtn-grp-all" checked><b class="' + (g.tone === "bad" ? "is-bad" : "") + '">' + g.title + "</b><em>" + g.items.length + "</em></label>" +
          '<div class="mtn-items">' + g.items.map(function (it) {
            return '<label class="mtn-item"><input type="checkbox" data-id="' + it.id + '"' + (g.pre(it) ? " checked" : "") + '><span class="mtn-nm">' + esc(it.name) + '</span><span class="mtn-sz">' + esc(g.meta(it)) + "</span></label>";
          }).join("") + "</div></div>";
      });
      if (dup) { html += '<label class="switch-row" for="mtn-pc-cons"><span>Merge ' + dup + " duplicate footage item" + (dup === 1 ? "" : "s") + "</span><input type=\"checkbox\" id=\"mtn-pc-cons\"><span class=\"switch-track\"></span></label>"; }
      if (!gs.some(function (g) { return g.items.length; }) && !dup) { html += '<p class="field-note">Nothing to clean. The project looks tidy.</p>'; }
      html += '<div class="btn-pair"><button class="btn-apply" id="mtn-pc-rescan" type="button">Scan again</button><button class="btn-apply mtn-danger" id="mtn-pc-remove" type="button">Remove</button></div>';
      rep.innerHTML = html; rep.hidden = false;
      qa(rep, ".mtn-grp").forEach(function (g) {
        var all = q(g, ".mtn-grp-all");
        // each group's master box ticks / unticks its items; start state follows the items
        var boxes = qa(g, ".mtn-item input");
        all.checked = boxes.length && boxes.every(function (b) { return b.checked; });
        all.addEventListener("change", function () { boxes.forEach(function (b) { b.checked = all.checked; }); count(); });
        boxes.forEach(function (b) { b.addEventListener("change", function () { all.checked = boxes.every(function (x) { return x.checked; }); count(); }); });
      });
      var cons = q(rep, "#mtn-pc-cons"); if (cons) { cons.addEventListener("change", count); }
      q(rep, "#mtn-pc-rescan").addEventListener("click", scan);
      q(rep, "#mtn-pc-remove").addEventListener("click", function (e) {
        var btn = e.currentTarget; if (btn.classList.contains("is-pending") || btn.disabled) { return; }
        var ids = qa(rep, ".mtn-item input:checked").map(function (b) { return parseInt(b.getAttribute("data-id"), 10); });
        pressed(btn, true);
        call("TOOLS_cleanerRun", [{ ids: ids, consolidate: !!(q(rep, "#mtn-pc-cons") && q(rep, "#mtn-pc-cons").checked) }]).then(function (res) {
          if (finish(btn, res)) { scan(); }
        });
      });
      count(); refit(wrap);
    }
    function scan() {
      pressed(scanBtn, true);
      call("TOOLS_cleanerScan", []).then(function (res) {
        pressed(scanBtn, false);
        if (!res || !res.ok || !res.data) { toast((res && res.message) || "Scan failed.", true); return; }
        data = res.data; render();
      });
    }
    scanBtn.addEventListener("click", scan);
  }

  /* ---------------- 10. Pre-comp Smart ---------------- */
  function upgradePrecomp(group) {
    var inner = q(group, ".ta-group-body-inner");
    if (q(inner, "#mtn-pre-apply")) { return; }
    var box = document.createElement("div");
    box.className = "mtn-body mtn-sub";
    box.innerHTML =
      '<div class="mtn-label">Pre-comp Smart</div>' +
      '<p class="field-note">All selected layers go into one new comp with a name you choose. It lands in a project folder that is created if missing.</p>' +
      '<div class="param"><label for="mtn-pre-name">Name</label><input class="text-input" type="text" id="mtn-pre-name" value="{top}_pre" autocomplete="off" spellcheck="false"></div>' +
      '<div class="mtn-tokens"><button type="button" class="mtn-chip" data-token="{top}">{top}</button><button type="button" class="mtn-chip" data-token="{n}">{n}</button><button type="button" class="mtn-chip" data-token="{comp}">{comp}</button></div>' +
      '<div class="param"><label for="mtn-pre-folder">Folder</label><input class="text-input" type="text" id="mtn-pre-folder" value="Precomps" placeholder="Leave empty to skip" autocomplete="off" spellcheck="false"></div>' +
      '<label class="switch-row" for="mtn-pre-open"><span>Open new comp after</span><input type="checkbox" id="mtn-pre-open"><span class="switch-track"></span></label>' +
      '<button class="btn-apply" id="mtn-pre-apply" type="button">Pre-compose smart</button>';
    inner.appendChild(box);
    group.setAttribute("data-mtn", "1");
    qa(box, "[data-token]").forEach(function (b) {
      b.addEventListener("click", function () { var i = q(box, "#mtn-pre-name"); i.value += b.getAttribute("data-token"); i.focus(); });
    });
    q(box, "#mtn-pre-apply").addEventListener("click", function (e) {
      var btn = e.currentTarget; if (btn.classList.contains("is-pending")) { return; }
      pressed(btn, true);
      call("TOOLS_precompSmart", [{ name: q(box, "#mtn-pre-name").value, folder: q(box, "#mtn-pre-folder").value.trim(), openAfter: q(box, "#mtn-pre-open").checked }])
        .then(function (res) { finish(btn, res); });
    });
  }

  /* ---------------- apply to each freshly built tab ---------------- */
  function enhance() {
    var title = document.getElementById("panel-title");
    var name = title ? title.textContent : "";
    if (name === "Tools") {
      var g;
      if ((g = groupByLabel("Stagger / Sequence Layers") || groupByLabel("Stagger Pro")) && !g.getAttribute("data-mtn")) { upgradeStagger(g); }
      if ((g = groupByLabel("Batch Rename Layers")) && !g.getAttribute("data-mtn")) { upgradeRename(g); }
      if ((g = groupByLabel("Project Cleaner & Sanitizer")) && !g.getAttribute("data-mtn")) { upgradeCleaner(g); }
      if ((g = groupByLabel("Pre-compose")) && !g.getAttribute("data-mtn")) { upgradePrecomp(g); }
    }
  }
  var scheduled = false;
  function schedule() { if (scheduled) { return; } scheduled = true; setTimeout(function () { scheduled = false; try { enhance(); } catch (e) { if (window.console) { console.warn("mt-newtools:", e); } } }, 0); }
  try { new MutationObserver(schedule).observe(panel, { childList: true }); } catch (e) { }
  schedule();
})();
