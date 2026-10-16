/* mt-persist.js v1 - keeps localStorage alive when Windows "Temporary Files" are cleaned.
   Cause: CEP stores each panel's localStorage in %TEMP%\cep_cache. Disk Cleanup / Storage Sense / manual
   deletion of Temp empties it, so every Multi Tool and NeuCurve setting (keys mtx.*, nc*, mtbus.* ...) is lost.
   Fix: mirror the whole localStorage to ~/Documents/MyMultitoolExtension/settings-backup.json (outside Temp)
   and restore any missing key from that file, synchronously, BEFORE any other script reads localStorage.
   Must be the first script in every page. No Node available = does nothing (old behaviour). */
(function () {
  "use strict";
  var w = window, fs, path, os, file, dir;
  try {
    var req = (typeof w.require === "function") ? w.require
      : (w.cep_node && w.cep_node.require) ? w.cep_node.require
      : (w.parent && w.parent !== w && typeof w.parent.require === "function") ? w.parent.require
      : (w.parent && w.parent !== w && w.parent.cep_node && w.parent.cep_node.require) ? w.parent.cep_node.require : null;
    if (!req) { return; }
    fs = req("fs"); path = req("path"); os = req("os");
    dir = path.join(os.homedir(), "Documents", "MyMultitoolExtension");
    file = path.join(dir, "settings-backup.json");
  } catch (e) { return; }

  var LS; try { LS = w.localStorage; LS.length; } catch (e) { return; }
  var SKIP = /^mtbus\./;   // settings-window <-> panel message mailbox: temporary, never worth a full backup dump
  var SP = Storage.prototype, rawSet = SP.setItem, rawRemove = SP.removeItem, rawClear = SP.clear;

  // ---- restore: file fills every key localStorage lost ----
  try {
    if (fs.existsSync(file)) {
      var saved = JSON.parse(fs.readFileSync(file, "utf8"));
      if (saved && typeof saved === "object") {
        Object.keys(saved).forEach(function (k) {
          if (!SKIP.test(k) && typeof saved[k] === "string" && LS.getItem(k) === null) { try { rawSet.call(LS, k, saved[k]); } catch (e) { } }
        });
      }
    }
  } catch (e) { }

  // ---- mirror: every change writes the full dump (debounced, atomic) ----
  var timer = null;
  function dump() {
    var o = {}, i, k;
    try { for (i = 0; i < LS.length; i++) { k = LS.key(i); if (SKIP.test(k)) { continue; } o[k] = LS.getItem(k); } } catch (e) { }
    return o;
  }
  function flush() {
    timer = null;
    try {
      var o = dump();
      var json = JSON.stringify(o);
      // never replace a good backup with an empty one (e.g. storage failed to load)
      if (!Object.keys(o).length && fs.existsSync(file)) { return; }
      try { fs.mkdirSync(dir, { recursive: true }); } catch (e) { }
      var tmp = file + ".tmp";
      fs.writeFileSync(tmp, json, "utf8");
      try { fs.renameSync(tmp, file); } catch (e) { fs.writeFileSync(file, json, "utf8"); }
    } catch (e) { }
  }
  function schedule() { if (timer === null) { timer = setTimeout(flush, 400); } }
  function isLS(o) { try { return o === LS; } catch (e) { return false; } }

  SP.setItem = function (k, v) { var r = rawSet.apply(this, arguments); if (isLS(this) && !SKIP.test(String(k))) { schedule(); } return r; };
  SP.removeItem = function (k) { var r = rawRemove.apply(this, arguments); if (isLS(this) && !SKIP.test(String(k))) { schedule(); } return r; };
  SP.clear = function () { var r = rawClear.apply(this, arguments); if (isLS(this)) { schedule(); } return r; };

  w.addEventListener("beforeunload", function () { if (timer !== null) { clearTimeout(timer); flush(); } });
  w.addEventListener("storage", function (e) { if (e.key && SKIP.test(e.key)) { return; } schedule(); });   // changes made by another window of the same origin
  schedule();                                 // first run: create the backup right away
})();
