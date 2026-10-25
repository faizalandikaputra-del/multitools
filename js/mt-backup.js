/* Multi Tool - mt-backup.js
   Settings > Backup: choose which groups of settings to export / import, plus automatic snapshots (last 3).
   - Runs in two places: the Settings window (builds the page inside #winbk-root) and the panel (writes the daily snapshot and
     reloads itself after a restore).  Both share the same localStorage.
   - Files are written with Node (fs). Without Node the page says so and the old "Settings profile" export (Data and updates) still works.
   - Snapshots live in  <Documents>/MyMultitoolExtension/backups/  and leave out the background image / GIF so they stay small.
   ES5. */
(function (w) {
  "use strict";
  var KEEP = /^(mtx\.|neucurve_|curveEditorPresets$|mt\.hotkeys|mtRecentColors|mt_theme_state)/;
  var KEEP_SKIP = /^mtx\.(ctlLock\.|backup\.)/;   // lock flags are per-layer, backup bookkeeping is local to this computer
  var GROUPS = [
    { id: "hotkeys", label: "Hotkeys", re: /^(mt\.hotkeys|neucurve_hotkeys)/ },
    { id: "curve", label: "Curve (NeuCurve) settings", re: /^(neucurve_|curveEditorPresets$)/ },
    { id: "palettes", label: "Color palettes", re: /^(mtRecentColors|mtx\.(cpSwatchTab|palette|cp))/ },
    { id: "background", label: "Background image, GIF and position", re: /^mtx\.bg(?!Color)/, heavy: true },
    { id: "shortcutz", label: "Shortcutz cards and tool images", re: /^mtx\.(toolImg\.|shortcutz)/, heavy: true },
    { id: "style", label: "Style, theme, layout and animation", re: /^(mtx\.(uiTheme|glassMode|mdScheme|mdBg|mdMode|themeColor|bgColor|navPos|taGroupAccent|tabOrder|pro\.|island|anim|uiScale)|mt_theme_state)/ },
    { id: "other", label: "Everything else", re: /^/ }
  ];
  function groupOf(key) { var i; for (i = 0; i < GROUPS.length; i++) { if (GROUPS[i].re.test(key)) { return GROUPS[i].id; } } return "other"; }
  function lsGet(k) { try { return w.localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { w.localStorage.setItem(k, v); } catch (e) { } }

  /* ---------- Node ---------- */
  var fs = null, path = null, os = null, dir = null;
  try {
    var req = (typeof w.require === "function") ? w.require
      : (w.cep_node && w.cep_node.require) ? w.cep_node.require
      : (w.parent && w.parent !== w && typeof w.parent.require === "function") ? w.parent.require : null;
    if (req) { fs = req("fs"); path = req("path"); os = req("os"); dir = path.join(os.homedir(), "Documents", "MyMultitoolExtension", "backups"); }
  } catch (eN) { fs = null; }
  function mkdir(d) { try { fs.mkdirSync(d, { recursive: true }); } catch (e) { } }

  /* ---------- collect / apply ---------- */
  function collect(groupIds) {   // -> { keys, bytes: {group: n}, count: {group: n} }
    var keys = {}, bytes = {}, count = {}, i, k, v, g;
    try {
      for (i = 0; i < w.localStorage.length; i++) {
        k = w.localStorage.key(i);
        if (!k || !KEEP.test(k) || KEEP_SKIP.test(k)) { continue; }
        v = w.localStorage.getItem(k);
        if (typeof v !== "string") { continue; }
        g = groupOf(k);
        bytes[g] = (bytes[g] || 0) + v.length + k.length; count[g] = (count[g] || 0) + 1;
        if (!groupIds || groupIds.indexOf(g) !== -1) { keys[k] = v; }
      }
    } catch (e) { }
    return { keys: keys, bytes: bytes, count: count };
  }
  function pack(keys) { return JSON.stringify({ app: "MultiToolBackup", v: 2, saved: new Date().toISOString(), keys: keys }); }
  function unpack(text) {
    var o; try { o = JSON.parse(text); } catch (e) { return null; }
    if (!o || (o.app !== "MultiToolBackup" && o.app !== "MultiToolProfile") || !o.keys || typeof o.keys !== "object") { return null; }
    return o;
  }
  function applyKeys(keys, groupIds) {
    var n = 0, k;
    for (k in keys) {
      if (!Object.prototype.hasOwnProperty.call(keys, k)) { continue; }
      if (!KEEP.test(k) || KEEP_SKIP.test(k) || typeof keys[k] !== "string") { continue; }
      if (groupIds && groupIds.indexOf(groupOf(k)) === -1) { continue; }
      lsSet(k, keys[k]); n++;
    }
    return n;
  }
  function human(b) { if (b >= 1048576) { return (b / 1048576).toFixed(1) + " MB"; } if (b >= 1024) { return Math.round(b / 1024) + " KB"; } return (b || 0) + " B"; }
  function stamp(d) {
    function p(n) { return (n < 10 ? "0" : "") + n; }
    return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + "-" + p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds());
  }

  /* ---------- snapshots ---------- */
  function listSnaps() {
    var out = [];
    if (!fs) { return out; }
    try {
      fs.readdirSync(dir).forEach(function (f) {
        if (!/^snap-\d{8}-\d{6}\.json$/.test(f)) { return; }
        var st = fs.statSync(path.join(dir, f));
        out.push({ file: f, size: st.size, time: st.mtime.getTime() });
      });
    } catch (e) { }
    out.sort(function (a, b) { return b.time - a.time; });
    return out;
  }
  function writeSnapshot() {
    if (!fs) { return false; }
    try {
      var all = collect(GROUPS.filter(function (g) { return g.id !== "background"; }).map(function (g) { return g.id; })), keys = {}, k;
      for (k in all.keys) { if (all.keys[k].length <= 400000) { keys[k] = all.keys[k]; } }
      if (!Object.keys(keys).length) { return false; }
      mkdir(dir);
      fs.writeFileSync(path.join(dir, "snap-" + stamp(new Date()) + ".json"), pack(keys), "utf8");
      var snaps = listSnaps(), i;
      for (i = 3; i < snaps.length; i++) { try { fs.unlinkSync(path.join(dir, snaps[i].file)); } catch (e1) { } }
      return true;
    } catch (e) { return false; }
  }
  function autoOn() { return lsGet("mtx.backup.auto") !== "0"; }

  var isPanel = !!document.getElementById("panel");
  var loadedAt = Date.now();
  if (isPanel) {
    // one snapshot per 12 hours, a few seconds after the panel opens
    setTimeout(function () {
      if (!autoOn() || !fs) { return; }
      var s = listSnaps();
      if (!s.length || Date.now() - s[0].time > 12 * 3600 * 1000) { writeSnapshot(); }
    }, 6000);
    // the Settings window asks the panel to reload after a restore
    try {
      if (w.MTSettingsBus) {
        w.MTSettingsBus.on("backupreload", function (d) {
          if (d && typeof d.t === "number" && d.t > loadedAt) { setTimeout(function () { try { w.location.reload(); } catch (e) { } }, 300); }
        });
      }
    } catch (eB) { }
  }

  /* ---------- Settings window page ---------- */
  var root = document.getElementById("winbk-root");
  if (!root) { return; }

  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  var picked = {}, noteEl;
  GROUPS.forEach(function (g) { picked[g.id] = !g.heavy || g.id === "shortcutz"; });
  picked.background = false;

  function note(t, bad) { if (noteEl) { noteEl.textContent = t || ""; noteEl.style.color = bad ? "var(--danger)" : ""; } }
  function chosen() { return GROUPS.filter(function (g) { return picked[g.id]; }).map(function (g) { return g.id; }); }
  function reloadAll() {
    try { if (w.MTSettingsBus) { w.MTSettingsBus.send("backupreload", { t: Date.now() }); } } catch (e) { }
    setTimeout(function () { try { w.location.reload(); } catch (e2) { } }, 900);
  }

  function build() {
    var info = collect(null), total = 0, rows = "";
    GROUPS.forEach(function (g) {
      var b = info.bytes[g.id] || 0, c = info.count[g.id] || 0;
      if (!c) { return; }
      if (picked[g.id]) { total += b; }
      rows += '<label class="settings-toggle-row" for="winbk-g-' + g.id + '"><span class="settings-row-copy"><b>' + g.label + "</b><small>" + c + " setting" + (c === 1 ? "" : "s") + ", " + human(b) + '</small></span><input type="checkbox" id="winbk-g-' + g.id + '" data-g="' + g.id + '"' + (picked[g.id] ? " checked" : "") + "><i></i></label>";
    });
    if (!rows) { rows = '<p class="settings-tip">No saved settings found yet.</p>'; }
    var snaps = listSnaps();
    var snapHtml = !fs ? '<p class="settings-tip">Automatic backups need Node.js, which is not available here.</p>'
      : (!snaps.length ? '<p class="settings-tip">No automatic backup yet. The first one is made a few seconds after the panel opens.</p>'
        : snaps.map(function (s) {
          var d = new Date(s.time);
          return '<div class="settings-row"><span class="settings-row-copy"><b>' + esc(d.toLocaleDateString() + ", " + d.toLocaleTimeString().replace(/:\d\d(\s|$)/, "$1")) + "</b><small>" + human(s.size) + '</small></span><div class="settings-row-ctrl"><button type="button" class="wbtn wbtn-ghost" data-restore="' + esc(s.file) + '">Restore</button></div></div>';
        }).join(""));
    root.innerHTML =
      '<div class="settings-group"><header class="settings-group-header"><div><h2>What to include</h2><p>Pick the groups for the next export or import. The background image and GIF are off by default because they are large.</p></div></header>' + rows +
      '<div class="settings-row"><span class="settings-row-copy"><b>Selected size</b></span><div class="settings-row-ctrl"><b id="winbk-total">' + human(total) + "</b></div></div></div>" +
      '<div class="settings-group"><header class="settings-group-header"><div><h2>Backup file</h2></div></header><div class="settings-row"><span class="settings-row-copy"><b>Export or import</b><small>A .json file you can keep or move to another computer.</small></span><div class="settings-row-ctrl"><button type="button" class="wbtn" id="winbk-export">Export to file</button><button type="button" class="wbtn wbtn-ghost" id="winbk-import">Import from file</button></div></div><p class="settings-tip" id="winbk-note"></p></div>' +
      '<div class="settings-group"><header class="settings-group-header"><div><h2>Automatic backup</h2><p>Saves a snapshot once every 12 hours, when the panel opens. The last 3 are kept.</p></div></header>' +
      '<label class="settings-toggle-row" for="winbk-auto"><span class="settings-row-copy"><b>Make automatic backups</b></span><input type="checkbox" id="winbk-auto"' + (autoOn() ? " checked" : "") + "><i></i></label>" + snapHtml +
      '<div class="settings-row"><span class="settings-row-copy"><b>Backup now</b></span><div class="settings-row-ctrl"><button type="button" class="wbtn wbtn-ghost" id="winbk-now">Save a snapshot</button></div></div></div>';
    noteEl = root.querySelector("#winbk-note");
    Array.prototype.forEach.call(root.querySelectorAll("[data-g]"), function (cb) {
      cb.addEventListener("change", function () { picked[cb.getAttribute("data-g")] = cb.checked; var t = 0; GROUPS.forEach(function (g) { if (picked[g.id]) { t += info.bytes[g.id] || 0; } }); root.querySelector("#winbk-total").textContent = human(t); });
    });
    root.querySelector("#winbk-auto").addEventListener("change", function (e) { lsSet("mtx.backup.auto", e.target.checked ? "1" : "0"); });
    root.querySelector("#winbk-now").addEventListener("click", function () { note(writeSnapshot() ? "Snapshot saved." : "Could not save a snapshot.", false); build(); });
    Array.prototype.forEach.call(root.querySelectorAll("[data-restore]"), function (b) {
      b.addEventListener("click", function () {
        if (!b.classList.contains("is-armed")) { b.classList.add("is-armed"); b.textContent = "Click again to restore"; setTimeout(function () { b.classList.remove("is-armed"); b.textContent = "Restore"; }, 3500); return; }
        try {
          var o = unpack(fs.readFileSync(path.join(dir, b.getAttribute("data-restore")), "utf8"));
          if (!o) { note("That snapshot is not readable.", true); return; }
          var n = applyKeys(o.keys, null);
          note("Restored " + n + " settings. Reloading...");
          reloadAll();
        } catch (e) { note("Could not read that snapshot.", true); }
      });
    });
    root.querySelector("#winbk-export").addEventListener("click", doExport);
    root.querySelector("#winbk-import").addEventListener("click", doImport);
  }

  function doExport() {
    var ids = chosen();
    if (!ids.length) { note("Tick at least one group.", true); return; }
    var data = collect(ids), n = Object.keys(data.keys).length, text = pack(data.keys), def = "MultiTool-backup-" + new Date().toISOString().slice(0, 10) + ".json";
    if (!n) { note("Nothing to export in those groups.", true); return; }
    try {
      if (fs && w.cep && w.cep.fs && w.cep.fs.showSaveDialogEx) {
        var r = w.cep.fs.showSaveDialogEx("Save Multi Tool backup", os.homedir(), ["json"], def, "Multi Tool backup");
        if (!r || !r.data) { note("Export canceled."); return; }
        var p = r.data; if (!/\.json$/i.test(p)) { p += ".json"; }
        fs.writeFileSync(p, text, "utf8");
        note("Saved " + n + " settings to " + p + ".");
        return;
      }
      var a = document.createElement("a");   // fallback outside CEP: browser download
      a.href = "data:application/json;charset=utf-8," + encodeURIComponent(text); a.download = def;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      note("Exported " + n + " settings.");
    } catch (e) { note("Could not write the file. " + (e && e.message ? e.message : ""), true); }
  }

  function doImport() {
    var ids = chosen();
    if (!ids.length) { note("Tick at least one group.", true); return; }
    try {
      if (!(fs && w.cep && w.cep.fs && w.cep.fs.showOpenDialogEx)) { note("Importing needs After Effects with Node.js. Use Data and updates > Import profile instead.", true); return; }
      var r = w.cep.fs.showOpenDialogEx(false, false, "Select a Multi Tool backup", os.homedir(), ["json"], "Multi Tool backup");
      if (!r || !r.data || !r.data.length) { note("Import canceled."); return; }
      var st = fs.statSync(r.data[0]);
      if (st.size > 60 * 1048576) { note("That file is too large to be a backup.", true); return; }
      var o = unpack(fs.readFileSync(r.data[0], "utf8"));
      if (!o) { note("That is not a Multi Tool backup. Nothing was changed.", true); return; }
      var n = applyKeys(o.keys, ids);
      if (!n) { note("The file has nothing for the ticked groups."); return; }
      note("Imported " + n + " settings. Reloading...");
      reloadAll();
    } catch (e) { note("Could not read the file. " + (e && e.message ? e.message : ""), true); }
  }

  build();
})(window);
