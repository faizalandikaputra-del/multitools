/**
 * Multi Tool - main.js
 * Modules: Store, Bridge, Images, Toast, Panel (tabs + grid),
 *          Curve (NeuCurve tab, hosted in an iframe),
 *          ContextMenu (right-click images), Settings (modal - also owns the global background
 *          opacity slider, applied via the --app-bg-opacity CSS variable), Theme.
 */
(function () {
  "use strict";

  var FOLLOW_HOST_THEME = true;   // set false to always stay dark
  var VERSION = "1.8.1";   // fallback only: Info / About shows the real installed version from version.json (see infoVersion)
  function infoVersion() {
    try { var v = window.MTUpdater && window.MTUpdater.version && window.MTUpdater.version(); if (v && v !== "0.0.0") { return v; } } catch (e) { }
    return VERSION;
  }

  // ---------------------------------------------------------
  // Tool definitions - add/rename tools here.
  // jsx: function name in host.jsx, args: values passed to it.
  // ---------------------------------------------------------
  var TABS = {
    "easy-layer": {
      title: "Easy Layer",
      hint: "Click to create a layer. Right-click a tool to set a custom image.",
      tools: [
        { id: "adj", code: "ADJ", name: "Adjustment", jsx: "EL_create", args: ["ADJ"] },
        { id: "sol", code: "SOL", name: "Solid",      jsx: "EL_create", args: ["SOL"], autoFill: true },   // Solid + Fill effect in the active Color Palette color
        { id: "txt", code: "TXT", name: "Text",       jsx: "EL_create", args: ["TXT"] },
        { id: "nul", code: "NUL", name: "Null",       jsx: "EL_create", args: ["NUL"] },
        { id: "shp", code: "SHP", name: "Shape",      jsx: "EL_create", args: ["SHP"] },
        { id: "cam", code: "CAM", name: "Camera",     jsx: "EL_create", args: ["CAM"] },
        { id: "lgt", code: "LGT", name: "Light",      jsx: "EL_create", args: ["LGT"] },
        { id: "bg",  code: "BG",  name: "Background", jsx: "EL_create", args: ["BG"] },
        { id: "crv", code: "CRV", name: "Curve",      jsx: "EL_create", args: ["CRV"] }
      ]
    },
    "color-palette": {
      title: "Color Palette",
      hint: "Click a Layer Label color to apply it to the selection. Click a HEX swatch to copy or apply it.",
      tools: [],
      custom: "colorPalette"
    },
    "expr-code": {
      title: "Expression Code",
      hint: "Write or save an expression snippet, then apply it to the selected properties.",
      tools: [],
      custom: "exprCode"
    },
    "presets": {
      title: "Animation Presets",
      hint: "Pick your preset folder, select a layer, then click Apply.",
      tools: [],
      custom: "presets"
    },
    "quick-comp-edit": {
      title: "Quick Comp Edit",
      hint: "Set the start timecode and duration, jump into Composition Settings, or match the comp to a selected layer.",
      tools: [],
      custom: "quickCompEdit"
    },
    "anchor-align": {
      title: "Anchor Point & Align",
      hint: "Select one or more layers, then set the anchor point or align to the composition.",
      tools: [],
      custom: "anchorAlign"
    },
    "tools": {
      title: "Tools",
      hint: "Handy one-click utilities for editing and motion graphics.",
      tools: [],
      custom: "utilityTools"
    },
    "textflex": {
      title: "Animator Text",
      hint: "Select a text layer, pick what should move, then click Animate.",
      tools: [],
      custom: "textFlex"
    },
    "shortcutz": {
      title: "Shortcutz",
      hint: "Speed Dial: one-click expressions, effects and utilities, pinned presets and snippets, and your own shortcuts.",
      tools: [],
      custom: "shortcutz"
    },
    "curve": {
      title: "Curve",
      hint: "",
      tools: [],
      custom: "curve"      // NeuCurve: full tool, hosted by the Curve module below
    },
    "info": { title: "Info / About", hint: "", tools: [], info: true }
  };

  // ---------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------
  function $(id) { return document.getElementById(id); }

  var cs = null;
  try { if (typeof CSInterface === "function" && window.__adobe_cep__) { cs = new CSInterface(); } } catch (e) { cs = null; }

  // ---------- Store (localStorage, never throws) ----------
  var Store = {
    prefix: "mtx.",
    get: function (k) { try { return localStorage.getItem(this.prefix + k); } catch (e) { return null; } },
    set: function (k, v) { try { localStorage.setItem(this.prefix + k, v); return true; } catch (e) { return false; } },
    remove: function (k) { try { localStorage.removeItem(this.prefix + k); } catch (e) {} },
    removeMatching: function (start) {
      try {
        var full = this.prefix + start, keys = [], i;
        for (i = 0; i < localStorage.length; i++) { if (localStorage.key(i).indexOf(full) === 0) { keys.push(localStorage.key(i)); } }
        keys.forEach(function (k) { localStorage.removeItem(k); });
      } catch (e) {}
    }
  };

  // ---------- Motion (Settings > Animations toggle) ----------
  // Single switch for every animation/transition in the panel (and the Curve tab iframe). Default is ON,
  // regardless of the OS "Show animations" / "Reduce motion" setting, which is deliberately ignored.
  // OFF = <html data-reduce-motion="true">, which css/*.css, tab-motion, smooth-scroll, ambient-orbs and the
  // NeuCurve iframe all react to. ON = the attribute is removed entirely (never "false").
  var Motion = {
    key: "animations",
    isOn: function () { return Store.get(this.key) !== "0"; },
    apply: function (on) {
      var de = document.documentElement;
      if (on) { de.removeAttribute("data-reduce-motion"); } else { de.setAttribute("data-reduce-motion", "true"); }
      try { if (typeof Curve !== "undefined" && Curve && Curve.sync) { Curve.sync(); } } catch (e) { }
    },
    set: function (on) {
      if (on) { Store.remove(this.key); } else { Store.set(this.key, "0"); }
      this.apply(on);
    }
  };
  Motion.apply(Motion.isOn());

  // ---------- Node (persistent background storage) ----------
  // The panel's CSXS/manifest.xml enables --enable-nodejs, which makes require()
  // available directly in this page's JS. That lets us copy a chosen background
  // file to a permanent folder in the user's Documents instead of relying on
  // blob: URLs (session-only) or localStorage data URLs (small size limit).
  // Every call site below feature-detects this module and falls back to the
  // old in-browser behavior when it's null (e.g. a build without Node enabled).
  var Node = (function () {
    var fs, path, os;
    try {
      fs = require("fs");
      path = require("path");
      os = require("os");
    } catch (e) {
      return null; // Node integration not available in this environment
    }

    var dir = path.join(os.homedir(), "Documents", "MyMultitoolExtension", "Backgrounds");
    var backupsRoot = path.join(os.homedir(), "Documents", "MyMultitoolExtension", "Backups");
    var mediaBackupDir = path.join(os.homedir(), "Documents", "MultiTools");

    function ensureDir(d) {
      try { fs.mkdirSync(d, { recursive: true }); } catch (e) {}
    }

    // ---------- Auto-Backup: any media file (image/video/GIF) fed into the panel ----------
    // Separate from persist()/backupCopy() below on purpose: this keeps the ORIGINAL file name
    // (not a slot-renamed working copy) in its own flat folder, exactly as a "just in case" safety
    // net someone can browse straight from Explorer/Finder. Best-effort: a failed backup must
    // never crash or block whatever the panel was actually doing with the file.
    function backupMedia(sourcePath) {
      if (!sourcePath) { return null; }
      try {
        ensureDir(mediaBackupDir);
        var base = path.basename(sourcePath);
        var dest = path.join(mediaBackupDir, base);
        if (fs.existsSync(dest)) {
          // Name collision: append a timestamp instead of overwriting an earlier backup.
          var ext = path.extname(base);
          var stem = ext ? base.slice(0, -ext.length) : base;
          dest = path.join(mediaBackupDir, stem + "-" + Date.now() + ext);
        }
        fs.copyFileSync(sourcePath, dest);
        return dest;
      } catch (e) {
        return null; // e.g. the source file is locked, or the disk ran out of space
      }
    }

    // ---------- Auto-Backup (Presets / Expression snippets) ----------
    // Best-effort by design: a failed backup must never block or fail the actual save, so every
    // function here swallows its own errors and just returns null on failure.

    // Copies an existing file (absolute source path) into Backups/<category>/, timestamped so
    // re-saving the same name never overwrites an earlier backup.
    function backupCopy(sourcePath, category) {
      if (!sourcePath) { return null; }
      try {
        var destDir = path.join(backupsRoot, category);
        ensureDir(destDir);
        var base = path.basename(sourcePath);
        var ext = path.extname(base);
        var stem = ext ? base.slice(0, -ext.length) : base;
        var dest = path.join(destDir, stem + "-" + Date.now() + ext);
        fs.copyFileSync(sourcePath, dest);
        return dest;
      } catch (e) {
        return null;
      }
    }

    // Same as backupCopy, but takes the source as a folder + file name pair (so callers never
    // have to worry about OS-specific path separators themselves).
    function backupCopyFromParts(folder, fileName, category) {
      try { return backupCopy(path.join(folder, fileName), category); } catch (e) { return null; }
    }

    // Writes text content that has no file of its own (an Expression Code snippet) straight into
    // Backups/<category>/<name>-<timestamp><ext>.
    function backupWrite(text, category, name, ext) {
      try {
        var destDir = path.join(backupsRoot, category);
        ensureDir(destDir);
        var safe = String(name).replace(/[\\/:*?"<>|]/g, "_").trim() || "snippet";
        var dest = path.join(destDir, safe + "-" + Date.now() + (ext || ".txt"));
        fs.writeFileSync(dest, text, "utf8");
        return dest;
      } catch (e) {
        return null;
      }
    }

    // Removes any file previously saved for this slot (name/extension may differ
    // from the new one), so the Backgrounds folder never accumulates old copies.
    function clearSlot(slot) {
      try {
        fs.readdirSync(dir).forEach(function (name) {
          if (name.indexOf(slot + "-") === 0) {
            try { fs.unlinkSync(path.join(dir, name)); } catch (e) {}
          }
        });
      } catch (e) {}
    }

    // Copies `file` (from an <input type="file">; CEP's Node integration gives
    // File objects a native .path) into the persistent folder for `slot`
    // ("bg-image" | "bg-motion-video"). Returns the new absolute path, or null
    // if there's no native path to copy from or the copy failed.
    function persist(file, slot) {
      if (!file || !file.path) { return null; }
      try {
        ensureDir(dir);
        clearSlot(slot);
        var dest = path.join(dir, slot + "-" + Date.now() + (path.extname(file.path) || ""));
        fs.copyFileSync(file.path, dest);
        return dest;
      } catch (e) {
        return null;
      }
    }

    // ---------- .ffx reader (Presets > support check) ----------
    // An .ffx is a RIFX container ("RIFX" + size + "FaFX", then chunks: 4-char id, 4-byte big-endian size, data,
    // padded to an even length; LIST chunks start with a 4-char type and hold more chunks). Every property group
    // is a LIST "tdgp" whose first "tdmn" chunk is its match name. Each effect in the preset is a "tdgp" sitting
    // directly under the "ADBE Effect Parade" group, so its match name is the effect's match name - exactly what
    // app.effects lists in After Effects. Returns { ok, effects: [matchName], sig } or { ok: false }.
    function ffxSig(p) {
      try { var st = fs.statSync(p); return st.size + ":" + Math.round(st.mtimeMs); } catch (e) { return ""; }
    }
    function ffxEffects(p) {
      try {
        var st = fs.statSync(p);
        if (!st.isFile() || st.size < 16 || st.size > 25 * 1024 * 1024) { return { ok: false }; }
        var buf = fs.readFileSync(p);
        if (buf.toString("latin1", 0, 4) !== "RIFX" || buf.toString("latin1", 8, 12) !== "FaFX") { return { ok: false }; }
        var found = [], seen = {}, extra = [], extraSeen = {}, sawParade = false;
        function cstr(a, b) { var e = a; while (e < b && buf[e] !== 0) { e++; } return buf.toString("latin1", a, e); }
        function firstName(a, b) {          // match name = first direct "tdmn" child of this group
          var pos = a, id, size;
          while (pos + 8 <= b) {
            id = buf.toString("latin1", pos, pos + 4); size = buf.readUInt32BE(pos + 4);
            if (id === "tdmn") { return cstr(pos + 8, Math.min(pos + 8 + size, b)); }
            if (pos + 8 + size > b) { break; }
            pos += 8 + size + (size & 1);
          }
          return "";
        }
        function walk(a, b, parent, depth) {
          var pos = a, id, size, start, end, type, own;
          if (depth > 64) { return; }
          while (pos + 8 <= b) {
            id = buf.toString("latin1", pos, pos + 4); size = buf.readUInt32BE(pos + 4);
            start = pos + 8; end = start + size;
            if (end > b) { break; }
            if (id === "LIST" && size >= 4) {
              type = buf.toString("latin1", start, start + 4);
              if (type === "tdgp") {
                own = firstName(start + 4, end);
                if (own === "ADBE Effect Parade") { sawParade = true; }
                if (own && parent === "ADBE Effect Parade" && !seen[own]) { seen[own] = 1; found.push(own); }
                walk(start + 4, end, own || parent, depth + 1);
              } else {
                walk(start + 4, end, parent, depth + 1);
              }
            } else if (id === "tdmn") {
              own = cstr(start, end);
              // Fallback for builds where the group layout differs: a match name that is not an Adobe built-in
              // property and not a "...-0001" parameter id can only be a plugin effect.
              if (own && !/^ADBE /.test(own) && !/-\d{4}$/.test(own) && !extraSeen[own]) { extraSeen[own] = 1; extra.push(own); }
            }
            pos = end + (size & 1);
          }
        }
        walk(12, Math.min(buf.length, 8 + buf.readUInt32BE(4)), "", 0);
        return { ok: true, effects: sawParade ? found : extra, sig: st.size + ":" + Math.round(st.mtimeMs) };
      } catch (e) {
        return { ok: false };
      }
    }

    // Opens the OS file manager with `file` (relative to the preset `folder`) selected: Explorer on Windows,
    // Finder on macOS. Arguments go straight to the program (no shell), and the resolved path must stay inside
    // the preset folder. Returns true when the file manager was launched.
    function revealPreset(folder, file, onFail) {
      try {
        var cp = require("child_process"), child, inside, dirOnly = false, abs = "", c, k, names, base, dir;
        // true when `p` is a real path INSIDE the preset folder (no ../ escape)
        inside = function (p) { var r = path.relative(folder, p); return !!r && r.indexOf("..") !== 0 && !path.isAbsolute(r); };
        // 1) the name as listed, then URL-decoded (File.name is URI-encoded in ExtendScript: "%20", "%2B")
        var cands = [String(file)];
        try { c = decodeURIComponent(String(file)); if (c !== cands[0]) { cands.push(c); } } catch (eDec) { }
        for (k = 0; k < cands.length && !abs; k++) {
          c = path.resolve(folder, cands[k]);
          if (inside(c) && fs.existsSync(c)) { abs = c; }
        }
        // 2) same file with different letter case / encoding: look through its folder
        if (!abs) {
          c = path.resolve(folder, cands[cands.length - 1]);
          if (!inside(c)) { return false; }
          dir = path.dirname(c); base = path.basename(c).toLowerCase();
          if (fs.existsSync(dir)) {
            names = fs.readdirSync(dir);
            for (k = 0; k < names.length; k++) { if (names[k].toLowerCase() === base) { abs = path.join(dir, names[k]); break; } }
            // 3) file really gone (deleted / renamed outside): at least open its folder
            if (!abs) { abs = dir; dirOnly = true; }
          }
        }
        if (!abs) { return false; }
        if (process.platform === "win32") {
          // explorer.exe wants one raw "/select,\"<path>\"" argument: no extra quoting from Node.
          child = dirOnly
            ? cp.spawn("explorer.exe", [abs], { detached: true, stdio: "ignore" })
            : cp.spawn("explorer.exe", ["/select,\"" + abs + "\""], { windowsVerbatimArguments: true, detached: true, stdio: "ignore" });
          child.on("error", function () { if (onFail) { onFail(); } });   // explorer.exe could not start: let the caller try the ExtendScript route
          child.unref();
        } else if (process.platform === "darwin") {
          cp.execFile("open", dirOnly ? [abs] : ["-R", abs], function (err) { if (err && onFail) { onFail(); } });
        } else {
          cp.execFile("xdg-open", [dirOnly ? abs : path.dirname(abs)], function (err) { if (err && onFail) { onFail(); } });
        }
        return true;
      } catch (e) {
        return false;
      }
    }

    // True if the saved path is still there (handles manual deletion / a moved Documents folder).
    function exists(p) {
      try { return !!p && fs.existsSync(p); } catch (e) { return false; }
    }

    // Absolute OS path -> file:// URL usable as an <img>/<video> src.
    // Normalizes Windows backslashes (C:\a\b -> file:///C:/a/b) and percent-encodes the rest.
    function toFileUrl(p) {
      var normalized = String(p).replace(/\\/g, "/");
      if (normalized.charAt(0) !== "/") { normalized = "/" + normalized; }
      return "file://" + encodeURI(normalized).replace(/#/g, "%23");
    }

    return {
      persist: persist, clearSlot: clearSlot, exists: exists, toFileUrl: toFileUrl,
      backupCopy: backupCopy, backupCopyFromParts: backupCopyFromParts, backupWrite: backupWrite,
      backupMedia: backupMedia, revealPreset: revealPreset, ffxEffects: ffxEffects, ffxSig: ffxSig, joinPath: function (a, b) { return path.join(a, b); }
    };
  })();

  // ---------- Bridge (JS -> JSX, promise based) ----------
  var Bridge = {
    call: function (fn, args) {
      return new Promise(function (resolve) {
        if (!cs) { resolve({ ok: true, message: "Preview mode - " + fn + " was not sent to After Effects." }); return; }
        // \uXXXX-escape every non-ASCII char inside the JSON so big payloads (copied text animators, with the
        // "TextMulti \u00b7 " names and any expression text) reach ExtendScript intact.
        var script = fn + "(" + (args || []).map(function (a) {
          return JSON.stringify(a).replace(/[\u0080-\uffff]/g, function (ch) { return "\\u" + ("0000" + ch.charCodeAt(0).toString(16)).slice(-4); });
        }).join(",") + ")";
        cs.evalScript(script, function (res) {
          if (!res || res === "EvalScript error.") { resolve({ ok: false, message: "Script error. Check host.jsx." }); return; }
          try { resolve(JSON.parse(res)); } catch (e) { resolve({ ok: false, message: String(res) }); }
        });
      });
    }
  };

  // ---------- Button in-flight / result state (Feature C) ----------
  // btn.classList carries "is-pending" while an operation is running (a horizontal fill-sweep -
  // see css/panel-refinements.css), then briefly "is-success" or "is-error" (shake) on settle
  // before clearing back to the resting state. No badge/icon is shown for either outcome anymore
  // (dropped for buggy rendering on several tabs) - the toast already carries the pass/fail
  // message, and is-error still gets its shake for tactile feedback. Wired panel-wide, on every
  // actionable button that reports a real Bridge/host success-or-fail outcome: tool tile Apply
  // (buildTool), Anchor Point/Align to Composition/Fit to Composition, Quick Comp Edit's Match
  // Comp + resolution presets, Color Palette's Layer Label swatches + image color extraction,
  // Expression Code's Apply button, the Tools-tab and Power Boosters action groups, Preset Select
  // Folder/Save/Apply, and Settings > Expression Backup export/import. Preset DELETE is the one
  // deliberate holdout - it keeps the plain opacity-pulse plus its own arm/confirm press feedback.
  // A handful of non-outcome loading spinners (image/iframe loading, drag reorder, the live
  // polling refresh in Quick Comp Edit) are left on the older pattern too, since they aren't a
  // single button reporting pass/fail.
  var RESULT_FLASH_MS = 900;
  function flashButtonResult(btn, ok) {
    btn.classList.remove("is-pending");
    btn.classList.add(ok ? "is-success" : "is-error");
    setTimeout(function () {
      btn.classList.remove("is-success", "is-error");
    }, RESULT_FLASH_MS);
  }

  // ---------- External links (Info/About social buttons, etc.) ----------
  // A CEP panel is an embedded browser: window.open()/location.href just load the URL INSIDE
  // the panel, which is never what a "visit my Instagram" button means. openURLInDefaultBrowser()
  // is the correct CEP API for this, but the bundled js/CSInterface.js in this project is a
  // minimal shim (see the comment at its top) that doesn't implement it - so this feature-detects
  // it first, falls back to spawning the OS's own "open a URL" command via Node (already enabled
  // for this panel through CSXS/manifest.xml's --enable-nodejs), and only as a last resort tries
  // window.open, so a click never silently does nothing.
  function openExternalUrl(url) {
    if (!url) { return; }
    if (cs && typeof cs.openURLInDefaultBrowser === "function") {
      try { cs.openURLInDefaultBrowser(url); return; } catch (e) { /* fall through */ }
    }
    try {
      var cp = require("child_process");
      var plat = (typeof process !== "undefined" && process.platform) || "";
      if (plat === "darwin") { cp.exec('open "' + url + '"'); }
      else if (plat === "win32") { cp.exec('start "" "' + url + '"'); }
      else { cp.exec('xdg-open "' + url + '"'); }
      return;
    } catch (e) { /* Node not available - fall through */ }
    try { window.open(url, "_blank", "noopener"); } catch (e) {}
  }

  // ---------- Images (resize before saving to keep localStorage small) ----------
  function fileToDataURL(file, maxSize, quality) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onerror = reject;
      reader.onload = function () {
        var img = new Image();
        img.onerror = reject;
        img.onload = function () {
          var scale = Math.min(1, maxSize / Math.max(img.width, img.height));
          var c = document.createElement("canvas");
          c.width = Math.max(1, Math.round(img.width * scale));
          c.height = Math.max(1, Math.round(img.height * scale));
          var ctx = c.getContext("2d");
          ctx.fillStyle = "#000";
          ctx.fillRect(0, 0, c.width, c.height);
          ctx.drawImage(img, 0, 0, c.width, c.height);
          resolve(c.toDataURL("image/jpeg", quality));
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  // ---------- Raw file -> data URL (no canvas pass) ----------
  // Used for animated GIFs: drawing to a canvas would flatten them to a
  // single static frame, so this reads the original bytes untouched.
  function fileToRawDataURL(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onerror = reject;
      reader.onload = function () { resolve(reader.result); };
      reader.readAsDataURL(file);
    });
  }

  // ---------- Clipboard ----------
  function copyToClipboard(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).catch(function () { return legacyCopy(text); });
    }
    return legacyCopy(text);
  }

  function legacyCopy(text) {
    return new Promise(function (resolve) {
      var ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.focus(); ta.select();
      try { document.execCommand("copy"); } catch (e) {}
      document.body.removeChild(ta);
      resolve();
    });
  }

  // ---------- Toast ----------
  var toastTimer = null;
  // Themed text prompt (replaces window.prompt, which opened the operating system's dialog).
  // askText({ title, hint, value, ok }, function (text) { ... }) : callback gets the trimmed text, or nothing happens on Cancel / Esc / empty.
  function askText(opts, done) {
    var back = document.createElement("div"), box = document.createElement("div"), h = document.createElement("h3"), inp = document.createElement("input"),
        row = document.createElement("div"), cancel = document.createElement("button"), ok = document.createElement("button"), shut = false;
    back.className = "mt-dlg-back"; box.className = "mt-dlg"; box.setAttribute("role", "dialog"); box.setAttribute("aria-modal", "true");
    h.textContent = opts.title || "";
    box.appendChild(h);
    if (opts.hint) { var p = document.createElement("p"); p.textContent = opts.hint; box.appendChild(p); }
    inp.type = "text"; inp.maxLength = opts.max || 60; inp.value = opts.value || ""; inp.setAttribute("aria-label", opts.title || "Name"); inp.autocomplete = "off"; inp.spellcheck = false;
    row.className = "mt-dlg-actions";
    cancel.type = "button"; cancel.textContent = "Cancel"; ok.type = "button"; ok.className = "mt-dlg-ok"; ok.textContent = opts.ok || "Save";
    row.appendChild(cancel); row.appendChild(ok); box.appendChild(inp); box.appendChild(row); back.appendChild(box); document.body.appendChild(back);
    function close(val) {
      if (shut) { return; } shut = true;
      document.removeEventListener("keydown", onKey, true);
      back.classList.remove("is-open");
      setTimeout(function () { if (back.parentNode) { back.parentNode.removeChild(back); } }, 200);
      if (val) { done(val); }
    }
    function submit() { var t = inp.value.trim(); if (t) { close(t); } else { inp.focus(); } }
    function onKey(e) {
      if (e.key === "Escape" || e.keyCode === 27) { e.stopPropagation(); e.preventDefault(); close(""); }
      else if ((e.key === "Enter" || e.keyCode === 13) && box.contains(e.target) && e.target !== cancel) { e.preventDefault(); submit(); }
    }
    document.addEventListener("keydown", onKey, true);
    ok.addEventListener("click", submit); cancel.addEventListener("click", function () { close(""); });
    back.addEventListener("mousedown", function (e) { if (e.target === back) { close(""); } });
    void back.offsetWidth; back.classList.add("is-open");
    setTimeout(function () { try { inp.focus(); inp.select(); } catch (e) { } }, 30);
  }

  function toast(message, isError) {
    var el = $("toast");
    el.textContent = message;
    el.classList.toggle("is-error", !!isError);
    el.classList.add("is-show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove("is-show"); }, (window.MTPro && window.MTPro.toastMs ? window.MTPro.toastMs() : 2400));   // Settings > Toast > Time (js/mt-pro.js)
  }
  // Small bridge for js/mt-pro.js (Settings profile): the tool table, the tile builder and the current tab.
  window.__MT = {
    TABS: TABS, buildTool: buildTool, toast: toast, runTool: runTool,
    toolImg: function (tabId, toolId) { return Store.get(imgKey(tabId, toolId)); },
    current: function () { return currentTab; },
    panel: function () { return panel; },
    // Builds a tab's content WITHOUT showing it (js/mt-island-boxes.js uses it once at start to rebuild the boxes that were left in the island).
    renderDetached: function (tabId) {
      var cfg = TABS[tabId], b = null;
      if (cfg && cfg.custom === "utilityTools") { b = UtilityTools.render(); }
      if (b && window.PanelRefinements && window.PanelRefinements.groupifyTaSections) { window.PanelRefinements.groupifyTaSections(b, { tabId: tabId }); }
      return b;
    }
  };


  // ---------------------------------------------------------
  // Panel: tab switching + grid rendering
  // ---------------------------------------------------------
  var panel = $("panel");
  var currentTab = "easy-layer";

  function imgKey(tabId, toolId) { return "toolImg." + tabId + "." + toolId; }

  function applyToolImage(el, dataUrl) {
    el.querySelector(".tool-img").style.backgroundImage = dataUrl ? 'url("' + dataUrl + '")' : "";
    el.classList.toggle("has-img", !!dataUrl);
  }

  // Runs one tool tile. btn may be a grid tile or a tile in the dynamic island (any element with classList / flashButtonResult support).
  function runTool(btn, tabId, tool) {
    if (btn && btn.classList.contains("is-pending")) { return; }
    if (btn) { btn.classList.add("is-pending"); }

    var args = tool.args.slice();
    // Easy Layer: label color (Settings > Easy Layer Label) and the Auto Parent switch travel with every click
    if (tabId === "easy-layer") { args.push(EasyLayerLabels.get(tool.id)); args.push(AutoParent.get()); }
    if (tool.autoFill) { args.push(ActivePalette.get()); }   // EL_create(type, label, autoParent, colorHex)

    Bridge.call(tool.jsx, args).then(function (res) {
      if (btn) { flashButtonResult(btn, !!res.ok); }
      toast(res.message || (res.ok ? "Done." : "Something went wrong."), !res.ok);
    });
  }

  function buildTool(tabId, tool) {
    var btn = document.createElement("button");
    btn.className = "tool";
    btn.setAttribute("data-tab", tabId);
    btn.setAttribute("data-tool", tool.id);
    btn.setAttribute("aria-label", tool.name);
    btn.setAttribute("title", tool.name);     // custom tooltip (js/mt-tooltip.js) shows the tile's full name
    btn.innerHTML = '<span class="tool-img"></span><span class="tool-code"></span><span class="tool-name"></span>';
    btn.querySelector(".tool-code").textContent = tool.code;
    btn.querySelector(".tool-name").textContent = tool.name;
    applyToolImage(btn, Store.get(imgKey(tabId, tool.id)));

    // autoFill tile (SOL): live dot showing the active Color Palette color (no success checkmark badge).
    if (tool.autoFill) {
      btn.classList.add("has-fill-dot");
      btn.title = "Create a comp-size Solid with a Fill effect in the active Color Palette color";
      btn.insertAdjacentHTML("beforeend",
        '<span class="tool-fill-dot" style="background:' + ActivePalette.get() + '"></span>');
    }

    btn.addEventListener("click", function () { runTool(btn, tabId, tool); });
    // Drag a tile onto the dynamic island = pin it there (island "Pin" view, click it to run the tool from anywhere)
    btn.draggable = true;
    btn.addEventListener("dragstart", function (e) {
      try { e.dataTransfer.setData("text/mt-tool", tabId + "|" + tool.id); e.dataTransfer.setData("text/plain", tool.name); e.dataTransfer.effectAllowed = "copy"; } catch (er) { }
      document.documentElement.classList.add("mt-dragging-tool");
    });
    btn.addEventListener("dragend", function () { document.documentElement.classList.remove("mt-dragging-tool"); });
    btn.addEventListener("contextmenu", function (e) { e.preventDefault(); ContextMenu.open(e.clientX, e.clientY, btn); });
    return btn;
  }

  // Developer profile shown on the Info/About tab. Swap the URLs below for your own handles;
  // the avatar image itself lives at html/assets/profile.jpg (see the fallback below for what
  // happens if that file is missing or removed).
  var DEV_PROFILE = {
    name: "zalfndk",
    tagline: "Editor \u00b7 Motion Designer \u00b7 ExtendScript / CEP Extension Developer",
    avatar: "assets/profile.jpg"
  };
  var SOCIAL_LINKS = [
    {
      code: "instagram", label: "Instagram", url: "https://instagram.com/zalfndk",
      icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5.5"/><circle cx="12" cy="12" r="4.2"/><circle cx="17.3" cy="6.7" r="1" fill="currentColor" stroke="none"/></svg>'
    },
    {
      code: "tiktok", label: "TikTok", url: "https://tiktok.com/@zalfndk",
      icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 3.5v10.7a3.8 3.8 0 1 1-3.2-3.75"/><path d="M14 3.5c.4 2.6 2.3 4.5 4.8 4.8"/></svg>'
    }
  ];

  function renderInfo() {
    var box = document.createElement("div");
    box.className = "info";

    var socialBtns = SOCIAL_LINKS.map(function (s) {
      return '<button type="button" class="social-btn" data-url="' + s.url + '" title="' + s.label + '" aria-label="Open ' + s.label + '">' +
        s.icon + '</button>';
    }).join("");

    box.innerHTML =
      '<div class="info-profile">' +
        '<div class="info-avatar" id="info-avatar">' +
          '<img id="profile-pic" src="' + DEV_PROFILE.avatar + '" alt="' + DEV_PROFILE.name + '">' +
        '</div>' +
        '<div class="info-id">' +
          '<h2 class="info-name">' + DEV_PROFILE.name + '</h2>' +
          '<p class="info-tagline">' + DEV_PROFILE.tagline + '</p>' +
        '</div>' +
      '</div>' +
      '<div class="info-socials">' + socialBtns + '</div>' +
      '<div class="info-divider"></div>' +
      '<p><strong>Multi Tool</strong> v' + infoVersion() + '</p>' +
      '<p class="info-caps">Includes Quick Comp Edit, Anchor Point &amp; Align, Color Palette Pro, and other layer utilities.</p>' +
      '<p>Left-click a tool to run it. Right-click a tool to set its image.</p>' +
      '<p>Use the gear icon to change the background.</p>';

    // Placeholder-image safety net: if assets/profile.jpg hasn't been swapped in yet (or was
    // removed), show a plain initial instead of a broken-image icon.
    var avatarEl = box.querySelector("#info-avatar");
    box.querySelector("#profile-pic").addEventListener("error", function () {
      this.style.display = "none";
      avatarEl.classList.add("is-empty");
      avatarEl.setAttribute("data-initial", DEV_PROFILE.name.charAt(0).toUpperCase());
    }, { once: true });

    // Every social button opens in the OS's default browser, never inside the panel itself.
    Array.prototype.forEach.call(box.querySelectorAll(".social-btn"), function (btn) {
      btn.addEventListener("click", function () { openExternalUrl(btn.getAttribute("data-url")); });
    });

    return box;
  }

  // Slides the highlight circle behind the active tab (up or down)
  var indicatorPlaced = false;
  function moveIndicator() {
    var ind = $("tab-indicator");
    var active = document.querySelector(".tabs .tab.is-active");
    if (!ind || !active) { return; }
    if (!indicatorPlaced) { ind.style.transition = "none"; }   // first placement: no animation
    // The highlight takes the active tab's own box (offsetTop/offsetHeight share the layout units of .tabs, also
    // when UI scale is not 100%). A fixed highlight height used to stick out below a tab that had been squeezed.
    var top = active.offsetTop, h = active.offsetHeight;
    ind.style.height = h ? h + "px" : "";
    ind.style.transform = "translate(-50%, " + top + "px)";
    if (!indicatorPlaced) { void ind.offsetWidth; ind.style.transition = ""; indicatorPlaced = true; }
  }

  // Brings the given tab into view inside the scrollable .tabs list.
  // No explicit "smooth" option needed: scrollIntoView() defers to the
  // element's CSS scroll-behavior (set to smooth in style.css) whenever
  // the behavior option is left unset, so this animates automatically.
  function scrollTabIntoView(tabId) {
    var el = document.querySelector('.tabs .tab[data-tab="' + tabId + '"]');
    if (!el || typeof el.scrollIntoView !== "function") { return; }
    el.scrollIntoView({ block: "nearest", inline: "nearest" });
  }


  // ---------------------------------------------------------
  // Anchor Point & Align tab
  // ---------------------------------------------------------
  var ANCHOR_POINTS = [
    { code: "tl", row: 0, col: 0, label: "Top Left" },
    { code: "tc", row: 0, col: 1, label: "Top Center" },
    { code: "tr", row: 0, col: 2, label: "Top Right" },
    { code: "ml", row: 1, col: 0, label: "Middle Left" },
    { code: "mm", row: 1, col: 1, label: "Center" },
    { code: "mr", row: 1, col: 2, label: "Middle Right" },
    { code: "bl", row: 2, col: 0, label: "Bottom Left" },
    { code: "bc", row: 2, col: 1, label: "Bottom Center" },
    { code: "br", row: 2, col: 2, label: "Bottom Right" }
  ];

  // Icons follow After Effects' own Align panel: a solid reference edge (or centre line) and two bars of
  // different length lined up on it. Bars are <rect> (filled with the accent by css/mt-ae-icons.css), the
  // reference line is a <path class="align-edge">.
  var ALIGN_BUTTONS = [
    { code: "left",    label: "Align Left",           icon: '<path class="align-edge" d="M4 3v18"/><rect x="7" y="6" width="13" height="4.5" rx="0.8"/><rect x="7" y="13.5" width="8" height="4.5" rx="0.8"/>' },
    { code: "hcenter", label: "Align Horizontal Center", icon: '<path class="align-edge" d="M12 3v18"/><rect x="4" y="6" width="16" height="4.5" rx="0.8"/><rect x="7" y="13.5" width="10" height="4.5" rx="0.8"/>' },
    { code: "right",   label: "Align Right",          icon: '<path class="align-edge" d="M20 3v18"/><rect x="4" y="6" width="13" height="4.5" rx="0.8"/><rect x="9" y="13.5" width="8" height="4.5" rx="0.8"/>' },
    { code: "top",     label: "Align Top",            icon: '<path class="align-edge" d="M3 4h18"/><rect x="6" y="7" width="4.5" height="13" rx="0.8"/><rect x="13.5" y="7" width="4.5" height="8" rx="0.8"/>' },
    { code: "vcenter", label: "Align Vertical Center", icon: '<path class="align-edge" d="M3 12h18"/><rect x="6" y="4" width="4.5" height="16" rx="0.8"/><rect x="13.5" y="7" width="4.5" height="10" rx="0.8"/>' },
    { code: "bottom",  label: "Align Bottom",         icon: '<path class="align-edge" d="M3 20h18"/><rect x="6" y="4" width="4.5" height="13" rx="0.8"/><rect x="13.5" y="9" width="4.5" height="8" rx="0.8"/>' }
  ];

  var FIT_BUTTONS = [
    { code: "comp",   label: "Fit to Comp", tip: "Scale to fit inside the composition (aspect ratio kept)", icon: '<rect x="6" y="7" width="12" height="10" rx="1"/>' },
    { code: "width",  label: "Fit Width",   tip: "Scale so the layer width matches the composition width",   icon: '<rect x="2" y="8" width="20" height="8" rx="1"/>' },
    { code: "height", label: "Fit Height",  tip: "Scale so the layer height matches the composition height", icon: '<rect x="8" y="2" width="8" height="20" rx="1"/>' }
  ];

  // Easy Layer: Flip Horizontal / Flip Vertical row, shown beneath the layer creation grid.
  // Dashed center line + opposing arrows reads as "mirror across this axis" at a glance, same
  // visual language as the anchor/align icons above (stroke-only, currentColor).
  var FLIP_BUTTONS = [
    { code: "h", label: "Flip Horizontal", tip: "Mirror the selected layer(s) left-to-right (inverts Scale X)", icon: '<path d="M12 3v18" stroke-dasharray="2 2"/><path d="M9 8 5 12l4 4M15 8l4 4-4 4"/>' },
    { code: "v", label: "Flip Vertical",   tip: "Mirror the selected layer(s) top-to-bottom (inverts Scale Y)", icon: '<path d="M3 12h18" stroke-dasharray="2 2"/><path d="M8 9 12 5l4 4M8 15l4 4 4-4"/>' }
  ];

  // A faint bounding box with a small reference dot at each of the 9 handle positions, and a bold
  // target-crosshair glyph over the one this button actually sets - reads at a glance as "anchor
  // point alignment" instead of the old plain 3x3 dot grid.
  function _anchorIconSvg(activeRow, activeCol) {
    var dots = "";
    for (var r = 0; r < 3; r++) {
      for (var c = 0; c < 3; c++) {
        if (r === activeRow && c === activeCol) { continue; } // the active spot gets the crosshair instead
        var x = 4.5 + c * 7.5, y = 4.5 + r * 7.5;
        dots += '<circle cx="' + x + '" cy="' + y + '" r="1" fill="currentColor" stroke="none" opacity="0.4"/>';
      }
    }
    var ax = 4.5 + activeCol * 7.5, ay = 4.5 + activeRow * 7.5;
    var crosshair =
      '<circle cx="' + ax + '" cy="' + ay + '" r="3.4" stroke="var(--accent-strong)"/>' +
      '<path d="M' + ax + ' ' + (ay - 6) + 'V' + (ay - 4.2) +
        'M' + ax + ' ' + (ay + 4.2) + 'V' + (ay + 6) +
        'M' + (ax - 6) + ' ' + ay + 'H' + (ax - 4.2) +
        'M' + (ax + 4.2) + ' ' + ay + 'H' + (ax + 6) +
        '" stroke="var(--accent-strong)"/>';
    return '<svg viewBox="0 0 24 24" aria-hidden="true">' +
      '<rect x="2.75" y="2.75" width="18.5" height="18.5" rx="2.5" opacity="0.5"/>' +
      dots + crosshair +
      '</svg>';
  }

  var AnchorAlign = {
    render: function () {
      var wrap = document.createElement("div");
      wrap.className = "ta"; // reuse the same vertical section layout as Text Animation

      var anchorBtns = ANCHOR_POINTS.map(function (a) {
        return '<button class="anchor-btn" data-anchor="' + a.code + '" title="' + a.label + '" aria-label="' + a.label + '">' +
          _anchorIconSvg(a.row, a.col) +
          '</button>';
      }).join("");

      var alignBtns = ALIGN_BUTTONS.map(function (a) {
        return '<button class="align-btn" data-align="' + a.code + '" title="' + a.label + '">' +
          '<span class="align-icon"><svg viewBox="0 0 24 24" aria-hidden="true">' + a.icon +
          '</svg></span>' +
          '<span class="align-text">' + a.label.replace("Align ", "") + '</span>' +
          '</button>';
      }).join("");

      wrap.innerHTML =
        '<div class="ta-section">' +
          '<h2 class="ta-title">Anchor Point</h2>' +
          '<div class="anchor-grid">' + anchorBtns + '</div>' +
        '</div>' +
        '<div class="ta-section">' +
          '<h2 class="ta-title">Align to Composition</h2>' +
          '<div class="align-grid">' + alignBtns + '</div>' +
        '</div>';

      Array.prototype.forEach.call(wrap.querySelectorAll(".anchor-btn"), function (btn) {
        btn.addEventListener("click", function () {
          if (btn.classList.contains("is-pending")) { return; }
          btn.classList.add("is-pending");
          Bridge.call("AA_setAnchor", [btn.getAttribute("data-anchor")]).then(function (res) {
            flashButtonResult(btn, !!res.ok);
            toast(res.message || (res.ok ? "Done." : "Something went wrong."), !res.ok);
          });
        });
      });

      Array.prototype.forEach.call(wrap.querySelectorAll(".align-btn"), function (btn) {
        btn.addEventListener("click", function () {
          if (btn.classList.contains("is-pending")) { return; }
          btn.classList.add("is-pending");
          Bridge.call("AA_align", [btn.getAttribute("data-align")]).then(function (res) {
            flashButtonResult(btn, !!res.ok);
            toast(res.message || (res.ok ? "Done." : "Something went wrong."), !res.ok);
          });
        });
      });

      return wrap;
    }
  };

  // ---------------------------------------------------------
  // Quick Comp Edit tab: start timecode + duration controller, a Composition
  // Settings shortcut, Fit to Composition (relocated from the Anchor Point & Align tab), and
  // Match Comp to Layer (relocated from the Tools tab).
  // ---------------------------------------------------------
  function _qceSettingsIconSvg() {
    // A comp frame with a small gear badge - reads as "Composition Settings" at a glance.
    return '<svg viewBox="0 0 24 24" aria-hidden="true">' +
      '<rect x="3" y="4" width="13" height="11" rx="1.5"/>' +
      '<path d="M6.5 15v2M11.5 15v2M5 19h8"/>' +
      '<circle cx="18.5" cy="16.2" r="3.1"/>' +
      '<path d="M18.5 13.7v.75M18.5 17.95v.75M20.85 16.2h-.75M16.9 16.2h-.75M20.16 14.54l-.53.53M17.37 17.33l-.53.53M20.16 17.86l-.53-.53M17.37 15.07l-.53-.53"/>' +
    '</svg>';
  }

  // Frame count -> "HH:MM:SS:FF" for display.
  function _qcePad2(n) { return (n < 10 ? "0" : "") + n; }
  function _qceFormatTimecode(frames, fps) {
    frames = Math.max(0, Math.round(frames || 0));
    var fr = Math.max(1, Math.round(fps || 30));
    var totalSeconds = Math.floor(frames / fr);
    var ff = frames % fr;
    var hh = Math.floor(totalSeconds / 3600);
    var mm = Math.floor((totalSeconds % 3600) / 60);
    var ss = totalSeconds % 60;
    return _qcePad2(hh) + ":" + _qcePad2(mm) + ":" + _qcePad2(ss) + ":" + _qcePad2(ff);
  }
  // "HH:MM:SS:FF" (or "MM:SS:FF" / "SS:FF" / a plain frame count) -> total frames.
  // Returns NaN for anything blank or unparsable, so the caller can tell "left alone" from 0.
  function _qceParseTimecode(str, fps) {
    if (str == null) { return NaN; }
    str = String(str).trim();
    if (str === "") { return NaN; }
    var fr = Math.max(1, Math.round(fps || 30));
    if (str.indexOf(":") === -1 && str.indexOf(";") === -1) {
      var plain = parseFloat(str);
      return isNaN(plain) ? NaN : Math.round(plain);
    }
    var parts = str.replace(/;/g, ":").split(":");
    var i, hh = 0, mm = 0, ss = 0, ff = 0;
    for (i = 0; i < parts.length; i++) { parts[i] = parseInt(parts[i], 10); if (isNaN(parts[i])) { return NaN; } }
    if (parts.length === 4) { hh = parts[0]; mm = parts[1]; ss = parts[2]; ff = parts[3]; }
    else if (parts.length === 3) { mm = parts[0]; ss = parts[1]; ff = parts[2]; }
    else if (parts.length === 2) { ss = parts[0]; ff = parts[1]; }
    else { return NaN; }
    return ((hh * 3600 + mm * 60 + ss) * fr) + ff;
  }

  // Aspect-ratio presets for the "Quick Resolution Presets" grid. "shape" buckets each preset
  // into landscape/portrait/square so the tile's inner glyph (.qce-res-shape) hints at its real
  // proportions even though every tile card itself is now a uniform, grid-aligned size.
  var QCE_RES_PRESETS = [
    { ratio: "16:9", w: 1920, h: 1080, shape: "landscape", name: "Landscape" },
    { ratio: "9:16", w: 1080, h: 1920, shape: "portrait",  name: "Portrait / TikTok / Reels" },
    { ratio: "4:5",  w: 1080, h: 1350, shape: "portrait",  name: "Instagram Feed" },
    { ratio: "1:1",  w: 1080, h: 1080, shape: "square",    name: "Square" },
    { ratio: "4:3",  w: 1440, h: 1080, shape: "landscape", name: "Standard" }
  ];
  function _qceResTileHtml(p) {
    return '<button type="button" class="qce-res-tile is-' + p.shape + '" data-w="' + p.w + '" data-h="' + p.h + '"' +
      ' title="' + p.name + ' \u2014 ' + p.w + '\u00d7' + p.h + 'px"' +
      ' aria-label="' + p.ratio + ', ' + p.name + ', ' + p.w + ' by ' + p.h + ' pixels">' +
        '<span class="qce-res-corner qce-res-corner-tl"></span>' +
        '<span class="qce-res-corner qce-res-corner-tr"></span>' +
        '<span class="qce-res-corner qce-res-corner-bl"></span>' +
        '<span class="qce-res-corner qce-res-corner-br"></span>' +
        '<span class="qce-res-shape"></span>' +
        '<span class="qce-res-label">' + p.ratio + '</span>' +
      '</button>';
  }

  var QuickCompEdit = {
    render: function () {
      var wrap = document.createElement("div");
      wrap.className = "ta"; // reuse the same vertical section layout as Text Animation
      var lastFps = 30;      // updated on every refresh; used to parse/format the timecode fields
      // "layer" auto-detects + edits the selected layer's inPoint/outPoint; "comp" is the original
      // composition-level behavior. Remembered across sessions like the panel's other toggles.
      var target = Store.get("qceTarget") === "comp" ? "comp" : "layer";

      var fitBtns = FIT_BUTTONS.map(function (a) {
        return '<button class="fit-btn" data-fit="' + a.code + '" title="' + a.label + '" aria-label="' + a.label + '">' +
          '<span class="align-icon"><svg viewBox="0 0 24 24" aria-hidden="true">' +
            '<rect x="2" y="2" width="20" height="20" rx="2" class="align-bounds"/>' + a.icon +
          '</svg></span>' +
          '<span class="align-text">' + a.label + '</span>' +
          '</button>';
      }).join("");

      wrap.innerHTML =
        '<div class="ta-section">' +
          '<h2 class="ta-title">Timing</h2>' +
          '<div class="chips" id="qce-target-toggle">' +
            '<label class="chip"><input type="radio" name="qce-target" value="layer"><span>Selected Layer</span></label>' +
            '<label class="chip"><input type="radio" name="qce-target" value="comp"><span>Active Composition</span></label>' +
          '</div>' +
          '<p class="field-note" id="qce-current">Loading current settings&hellip;</p>' +
          '<div class="qce-grid">' +
            '<div class="qce-field">' +
              '<label for="qce-start-tc">Start Timecode</label>' +
              '<input type="text" class="text-input qce-pill" id="qce-start-tc" placeholder="00:00:00:00" aria-label="Start timecode">' +
            '</div>' +
            '<div class="qce-field">' +
              '<label for="qce-duration-tc">Duration</label>' +
              '<input type="text" class="text-input qce-pill" id="qce-duration-tc" placeholder="00:00:00:00" aria-label="Duration timecode">' +
            '</div>' +
          '</div>' +
          '<div class="split-btn" id="qce-duration-actions">' +
            '<button class="split-main" type="button" id="qce-set-duration">Apply</button>' +
            '<button class="split-icon" type="button" id="qce-comp-settings" title="Open Composition Settings" aria-label="Open Composition Settings">' +
              _qceSettingsIconSvg() +
            '</button>' +
          '</div>' +
        '</div>' +

        '<div class="ta-section">' +
          '<h2 class="ta-title">Quick Resolution Presets</h2>' +
          '<p class="field-note" id="qce-res-current">Loading current resolution&hellip;</p>' +
          '<div class="qce-res-row" id="qce-res-row">' +
            QCE_RES_PRESETS.map(_qceResTileHtml).join("") +
          '</div>' +
        '</div>' +

        '<div class="ta-section">' +
          '<h2 class="ta-title">Fit to Composition</h2>' +
          '<p class="field-note">Adjusts Scale on the selected layer(s) without distorting their aspect ratio.</p>' +
          '<div class="fit-grid">' + fitBtns + '</div>' +
        '</div>' +

        '<div class="ta-section">' +
          '<h2 class="ta-title">Match Comp to Layer</h2>' +
          '<p class="field-note">Select a footage, image or pre-comp layer. FPS and Resolution are matched to its source. Duration matches the layer\'s trimmed in/out span (not the full source length): the layer is moved to the start of the comp and the work area is set to that span.</p>' +
          '<div class="chips chips-3">' +
            '<label class="chip"><input type="checkbox" id="qce-match-fps" checked><span>FPS</span></label>' +
            '<label class="chip"><input type="checkbox" id="qce-match-duration" checked><span>Duration</span></label>' +
            '<label class="chip"><input type="checkbox" id="qce-match-res" checked><span>Resolution</span></label>' +
          '</div>' +
          '<button class="btn-apply" id="qce-match-layer">Match Comp to Layer</button>' +
        '</div>';

      var noteEl = wrap.querySelector("#qce-current");
      var startEl = wrap.querySelector("#qce-start-tc");
      var durEl = wrap.querySelector("#qce-duration-tc");
      var actionsEl = wrap.querySelector("#qce-duration-actions");
      var matchBtn = wrap.querySelector("#qce-match-layer");
      var targetRadios = wrap.querySelectorAll('input[name="qce-target"]');
      var startDirty = false, durDirty = false; // set on user input, cleared once a commit is sent

      var resNoteEl = wrap.querySelector("#qce-res-current");
      var resTiles = wrap.querySelectorAll(".qce-res-tile");
      var resBusy = false;

      function isBusy() { return actionsEl.classList.contains("is-loading"); }

      function setFieldsEnabled(on) {
        startEl.disabled = !on;
        durEl.disabled = !on;
        actionsEl.classList.toggle("is-disabled", !on);
      }

      // Highlights whichever preset tile matches the comp's current width/height (exact match
      // only - anything else, including no comp open, is "Custom"/no highlight). Called from
      // every place the comp's resolution is known: on open, on every poll tick, after Apply/
      // Match Comp to Layer, and right after a tile itself is clicked - so it stays correct no
      // matter which of Quick Comp Edit's two targets ("Selected Layer" / "Active Composition")
      // is active, since both now report the comp's width/height alongside their own data.
      function updateResTiles(width, height) {
        var w = Math.round(width || 0), h = Math.round(height || 0);
        var matched = null;
        Array.prototype.forEach.call(resTiles, function (t) {
          var isMatch = w > 0 && h > 0 &&
            parseInt(t.getAttribute("data-w"), 10) === w && parseInt(t.getAttribute("data-h"), 10) === h;
          t.classList.toggle("is-active", isMatch);
          if (isMatch) { matched = t; }
        });
        if (!resNoteEl) { return; }
        if (!w || !h) { resNoteEl.textContent = "Open a composition to see its resolution."; return; }
        var label = matched ? matched.querySelector(".qce-res-label").textContent : "Custom";
        resNoteEl.textContent = w + " \u00d7 " + h + " \u00b7 " + label;
      }

      // Never writes "undefined"/stale values into the DOM: a missing or unusable payload just
      // clears the fields and disables editing until something valid comes back.
      function setEmptyState(message) {
        startEl.value = "";
        durEl.value = "";
        noteEl.textContent = message;
        setFieldsEnabled(false);
        updateResTiles(0, 0);
      }

      function applyCompInfo(data) {
        if (!data || data.duration === undefined || data.frameRate === undefined) { return; }
        lastFps = data.frameRate || 30;
        setFieldsEnabled(true);
        startEl.value = _qceFormatTimecode(data.startFrame || 0, lastFps);
        durEl.value = _qceFormatTimecode(data.durationFrames || 0, lastFps);
        var name = data.name || "Composition";
        noteEl.textContent = '"' + name + '" - ' + (data.durationFrames || 0) + " frames @ " + lastFps.toFixed(2) + " fps.";
        updateResTiles(data.width, data.height);
      }

      function applyLayerInfo(data) {
        if (!data) { return; }
        if (data.frameRate) { lastFps = data.frameRate; }
        if (!data.hasSelection) {
          setEmptyState("Select a layer to see and edit its Start Timecode / Duration.");
          updateResTiles(data.compWidth, data.compHeight); // comp itself is still known even with no layer selected
          return;
        }
        setFieldsEnabled(true);
        startEl.value = _qceFormatTimecode(data.startFrame || 0, lastFps);
        durEl.value = _qceFormatTimecode(data.durationFrames || 0, lastFps);
        var suffix = data.multiple ? " (topmost of " + data.selectedCount + " selected layers)" : "";
        noteEl.textContent = '"' + data.layerName + '" - ' + (data.durationFrames || 0) + " frames @ " + lastFps.toFixed(2) + " fps." + suffix;
        updateResTiles(data.compWidth, data.compHeight);
      }

      // Re-fetches from ExtendScript for whichever target is active. Called on open, on target
      // switch, after every commit, and on every poll tick (see below) - so the fields always
      // reflect whatever is actually selected in After Effects right now.
      function refresh() {
        if (target === "layer") {
          Bridge.call("QCE_getLayerInfo", []).then(function (res) {
            if (res && res.ok && res.data) { applyLayerInfo(res.data); }
            else { setEmptyState((res && res.message) || "Open a composition first."); }
          });
        } else {
          Bridge.call("QCE_getInfo", []).then(function (res) {
            if (res && res.ok && res.data) { applyCompInfo(res.data); }
            else { setEmptyState((res && res.message) || "Open a composition to see its settings."); }
          });
        }
      }

      // Sends whichever start/duration frame counts are given (NaN = "leave that one alone") to
      // the JSX function for the active target, then refreshes so the fields reflect the real
      // post-edit state instead of an assumed one.
      function commit(startFrames, durFrames) {
        if (isBusy()) { return; }
        startDirty = false; durDirty = false;
        actionsEl.classList.add("is-loading");
        var fn = target === "layer" ? "updateSelectedLayerTiming" : "updateCompSettings";
        Bridge.call(fn, [isNaN(startFrames) ? "" : startFrames, isNaN(durFrames) ? "" : durFrames]).then(function (res) {
          actionsEl.classList.remove("is-loading");
          toast((res && res.message) || (res && res.ok ? "Done." : "Something went wrong."), !(res && res.ok));
          refresh();
        });
      }

      function commitStart() {
        if (isBusy() || startEl.value.trim() === "") { return; }
        var frames = _qceParseTimecode(startEl.value, lastFps);
        if (isNaN(frames)) { toast("Enter a valid start timecode, e.g. 00:00:01:00.", true); return; }
        commit(frames, NaN);
      }

      function commitDuration() {
        if (isBusy() || durEl.value.trim() === "") { return; }
        var frames = _qceParseTimecode(durEl.value, lastFps);
        if (isNaN(frames)) { toast("Enter a valid duration, e.g. 00:00:02:00.", true); return; }
        if (frames <= 0) { toast("Duration must be greater than 0.", true); return; }
        commit(NaN, frames);
      }

      // Start/Duration fields are individually editable: Enter or leaving the field (onblur)
      // commits just that field, without touching the other one, unless it was left unchanged.
      startEl.addEventListener("input", function () { startDirty = true; });
      durEl.addEventListener("input", function () { durDirty = true; });
      startEl.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); startEl.blur(); } });
      durEl.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); durEl.blur(); } });
      startEl.addEventListener("blur", function () { if (startDirty) { commitStart(); } });
      durEl.addEventListener("blur", function () { if (durDirty) { commitDuration(); } });

      // Toggle which target (the selected layer, or the active composition) the fields read from
      // and the Apply button writes to.
      Array.prototype.forEach.call(targetRadios, function (r) {
        r.checked = r.value === target;
        r.addEventListener("change", function () {
          if (!r.checked) { return; }
          target = r.value;
          Store.set("qceTarget", target);
          startDirty = false; durDirty = false;
          noteEl.textContent = target === "layer" ? "Loading layer info\u2026" : "Loading composition info\u2026";
          refresh();
        });
      });

      refresh();

      // Real-time auto-detection: as the user selects different layers (or nothing) in AE, the
      // fields update on their own. Polling is the only option here - CEP has no native
      // "selection changed" event - so this stays lightweight and self-cancels once the tab's
      // markup is no longer in the document (i.e. the user switched to another tab).
      var pollHandle = setInterval(function () {
        if (!document.body.contains(wrap)) { clearInterval(pollHandle); return; }
        if (isBusy()) { return; }
        if (document.activeElement === startEl || document.activeElement === durEl) { return; } // don't clobber typing
        refresh();
      }, 700);

      wrap.querySelector("#qce-set-duration").addEventListener("click", function () {
        if (isBusy()) { return; }
        var startFrames = _qceParseTimecode(startEl.value, lastFps);
        var durFrames = _qceParseTimecode(durEl.value, lastFps);
        if (isNaN(startFrames) && isNaN(durFrames)) {
          toast("Enter a start timecode, a duration, or both.", true);
          return;
        }
        if (!isNaN(durFrames) && durFrames <= 0) {
          toast("Duration must be greater than 0.", true);
          return;
        }
        commit(startFrames, durFrames);
      });

      wrap.querySelector("#qce-comp-settings").addEventListener("click", function () {
        if (isBusy()) { return; }
        actionsEl.classList.add("is-loading");
        Bridge.call("QCE_openCompSettings", []).then(function (res) {
          actionsEl.classList.remove("is-loading");
          toast((res && res.message) || (res && res.ok ? "Done." : "Something went wrong."), !(res && res.ok));
          refresh();
        });
      });

      // Quick Resolution Presets: one click applies that tile's width/height to the active comp,
      // no Composition Settings dialog and no typing. Independent of the Timing controls above
      // (isBusy()/actionsEl), so it stays clickable while a timecode commit is in flight.
      Array.prototype.forEach.call(resTiles, function (tile) {
        tile.addEventListener("click", function () {
          if (resBusy) { return; }
          var w = parseInt(tile.getAttribute("data-w"), 10);
          var h = parseInt(tile.getAttribute("data-h"), 10);
          resBusy = true;
          tile.classList.add("is-pending");
          Bridge.call("setCompResolution", [w, h]).then(function (res) {
            resBusy = false;
            flashButtonResult(tile, !!(res && res.ok));
            toast((res && res.message) || (res && res.ok ? "Done." : "Something went wrong."), !(res && res.ok));
            if (res && res.ok && res.data) { updateResTiles(res.data.width, res.data.height); }
            refresh();
            // Settle passes: AE can recentre 3D layers by itself a moment after the resize. Each pass checks every layer
            // against its target and corrects only what is off (see _qceSettlePass in host.jsx).
            if (res && res.ok && res.data && res.data.job) {
              [150, 500, 1000, 2000, 3500].forEach(function (ms, idx, arr) {
                setTimeout(function () {
                  Bridge.call("QCE_settleResize", [res.data.job, idx === arr.length - 1]).then(function (r2) {
                    if (r2 && r2.ok && r2.data && r2.data.fixed) { toast("Re-centered " + r2.data.fixed + " position value(s) after the resize.", false); }
                    else if (r2 && !r2.ok && r2.message) { toast(r2.message, true); }
                  });
                }, ms);
              });
            }
          });
        });
      });

      // Fit to Composition (relocated here from Anchor Point & Align) - independent of the
      // Timing/resolution controls above, same as the resolution tiles.
      Array.prototype.forEach.call(wrap.querySelectorAll(".fit-btn"), function (btn) {
        btn.addEventListener("click", function () {
          if (btn.classList.contains("is-pending")) { return; }
          btn.classList.add("is-pending");
          Bridge.call("AA_fit", [btn.getAttribute("data-fit")]).then(function (res) {
            flashButtonResult(btn, !!res.ok);
            toast(res.message || (res.ok ? "Done." : "Something went wrong."), !res.ok);
          });
        });
      });

      matchBtn.addEventListener("click", function () {
        if (matchBtn.classList.contains("is-pending")) { return; }
        var mFps = wrap.querySelector("#qce-match-fps").checked;
        var mDuration = wrap.querySelector("#qce-match-duration").checked;
        var mRes = wrap.querySelector("#qce-match-res").checked;
        if (!mFps && !mDuration && !mRes) {
          toast("Select FPS, Duration, Resolution, or any combination.", true);
          return;
        }
        matchBtn.classList.add("is-pending");
        Bridge.call("matchCompToSelectedLayer", [{ fps: mFps, duration: mDuration, resolution: mRes }]).then(function (res) {
          flashButtonResult(matchBtn, !!(res && res.ok));
          toast((res && res.message) || (res && res.ok ? "Done." : "Something went wrong."), !(res && res.ok));
          refresh();
        });
      });

      return wrap;
    }
  };

  // ---------------------------------------------------------
  // Standard After Effects Layer Label colors (index = AE's own label id, 1-16)
  // ---------------------------------------------------------
  var LAYER_LABELS = [
    { index: 1,  name: "Red",        hex: "#F53232" },
    { index: 2,  name: "Yellow",     hex: "#E6E64B" },
    { index: 3,  name: "Aqua",       hex: "#64D8D8" },
    { index: 4,  name: "Pink",       hex: "#FF80C8" },
    { index: 5,  name: "Lavender",   hex: "#C696E8" },
    { index: 6,  name: "Peach",      hex: "#FFB27A" },
    { index: 7,  name: "Sea Foam",   hex: "#7ADCC0" },
    { index: 8,  name: "Blue",       hex: "#4F9DE0" },
    { index: 9,  name: "Green",      hex: "#7ACC5A" },
    { index: 10, name: "Purple",     hex: "#A25AC8" },
    { index: 11, name: "Orange",     hex: "#FF9633" },
    { index: 12, name: "Brown",      hex: "#9F7A4B" },
    { index: 13, name: "Fuchsia",    hex: "#E040A0" },
    { index: 14, name: "Cyan",       hex: "#4BC8E6" },
    { index: 15, name: "Sandstone",  hex: "#D8C89B" },
    { index: 16, name: "Dark Green", hex: "#4B8264" }
  ];

  // ---------------------------------------------------------
  // Easy Layer -> default label color assignments (per tool id)
  // Persisted in localStorage; read by buildTool() before every
  // Easy Layer run and passed to host.jsx so the new layer gets labeled.
  // ---------------------------------------------------------
  var EasyLayerLabels = {
    key: "easyLayerLabels",
    defaults: { adj: 13, sol: 14 }, // ADJ -> Fuchsia, SOL -> Cyan (per the spec example)

    load: function () {
      try {
        var saved = JSON.parse(Store.get(this.key) || "null");
        return saved && typeof saved === "object" ? saved : this.defaults;
      } catch (e) { return this.defaults; }
    },
    save: function (map) { Store.set(this.key, JSON.stringify(map)); },

    // Returns the assigned label index for a tool id, or "" if none is set.
    get: function (toolId) {
      var map = this.load();
      return map.hasOwnProperty(toolId) ? map[toolId] : "";
    },
    set: function (toolId, labelIndex) {
      var map = this.load();
      if (labelIndex === "" || labelIndex === null || labelIndex === undefined) { delete map[toolId]; }
      else { map[toolId] = parseInt(labelIndex, 10); }
      this.save(map);
    }
  };

  // ---------------------------------------------------------
  // Color Palette tab
  // ---------------------------------------------------------
  var PALETTE_PRESET = [
    "#F94144", "#F3722C", "#F8961E", "#F9C74F", "#90BE6D", "#43AA8B",
    "#4D908E", "#577590", "#277DA1", "#8B6CF7", "#B983FF", "#E85D75",
    "#FF6B9D", "#FFD166", "#06D6A0", "#118AB2", "#073B4C", "#EF476F",
    "#1E1E21", "#2B2B31", "#9A9AA2", "#E7E7EA", "#FFFFFF", "#000000"
  ];

  // ---------------------------------------------------------
  // Shared: HTML escaping, small icon set
  // ---------------------------------------------------------
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  var ICON_EDIT_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L18.5 9.5a2.1 2.1 0 0 0-3-3L5 17v3Z"/></svg>';
  var ICON_DELETE_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/></svg>';
  var ICON_COPY_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></svg>';
  var ICON_CLEAR_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
  var ICON_STAR_SVG = '<svg class="icon-star-fill" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5l2.9 6.16 6.6.62-5 4.53 1.5 6.6L12 16.9l-5.99 3.51 1.5-6.6-5-4.53 6.6-.62L12 2.5Z"/></svg>';
  var ICON_FOLDER_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7a1 1 0 0 1 1-1h5l2 2h9a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7Z"/></svg>';
  var ICON_CHEVRON_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>';
  var ICON_PIN_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5l2.9 6.16 6.6.62-5 4.53 1.5 6.6L12 16.9l-5.99 3.51 1.5-6.6-5-4.53 6.6-.62L12 2.5Z"/></svg>';
  // Push-pin glyph (distinct from the star, which on the Animation Presets rows now means "favorite").
  var ICON_MORE_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="19" cy="12" r="1.7"/></svg>';
  var REVEAL_LABEL = /Mac/i.test(navigator.platform || "") ? "Show in Finder" : "Show in Explorer";
  var ICON_PUSHPIN_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 17v5M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1Z"/></svg>';
  var ICON_JSX_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 8-4 4 4 4M15 8l4 4-4 4"/></svg>';
  var ICON_UTIL_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L4 17l3 3 5.3-5.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2-2Z"/></svg>';

  // ---------------------------------------------------------
  // Category store - generic categorized-list persistence, shared by the
  // Color Palette "Custom Colors" section and the Expression Code snippet
  // manager. Shape kept in localStorage:
  //   { activeId: "<id>", cats: [ { id, name, items: [...] }, ... ] }
  // For colors, items is an array of HEX strings. For snippets, items is an
  // array of { id, name, code }.
  // ---------------------------------------------------------
  function CategoryStore(key) {
    return {
      key: key,
      load: function () {
        try {
          var data = JSON.parse(Store.get(this.key) || "null");
          if (data && data.cats && data.cats.length) { return data; }
        } catch (e) { /* fall through to null */ }
        return null;
      },
      save: function (data) { Store.set(this.key, JSON.stringify(data)); },
      // Creates the categorized store, seeded once from legacy flat data, if it
      // doesn't exist yet. Safe to call on every render.
      ensure: function (defaultName, seedItems) {
        var data = this.load();
        if (!data) {
          data = { activeId: "c0", cats: [{ id: "c0", name: defaultName, items: seedItems || [] }] };
          this.save(data);
        }
        return data;
      },
      activeCat: function (data) {
        for (var i = 0; i < data.cats.length; i++) { if (data.cats[i].id === data.activeId) { return data.cats[i]; } }
        return data.cats[0];
      },
      setActive: function (data, id) { data.activeId = id; this.save(data); },
      addCat: function (data, name) {
        var id = "c" + Date.now() + Math.floor(Math.random() * 1000);
        data.cats.push({ id: id, name: name, items: [] });
        data.activeId = id;
        this.save(data);
        return id;
      },
      renameCat: function (data, id, name) {
        for (var i = 0; i < data.cats.length; i++) { if (data.cats[i].id === id) { data.cats[i].name = name; break; } }
        this.save(data);
      },
      deleteCat: function (data, id) {
        if (data.cats.length <= 1) { return false; } // always keep at least one category
        data.cats = data.cats.filter(function (c) { return c.id !== id; });
        if (data.activeId === id) { data.activeId = data.cats[0].id; }
        this.save(data);
        return true;
      }
    };
  }

  // Renders the category pill-tab row + "new category" form + rename/delete
  // toolbar into `container`, and wires up the callbacks in `opts`:
  //   id (unique DOM id prefix), escape (html-escape fn), activeCat,
  //   onSwitch(id), onAdd(name), onRename(id, name), onDelete(id)
  function renderCatTabs(container, data, opts) {
    var tabsHtml = data.cats.map(function (c) {
      var active = c.id === data.activeId;
      return '<button class="cat-tab' + (active ? " is-active" : "") + '" data-cat="' + c.id + '" role="tab" aria-selected="' + active + '">' +
        '<span class="cat-tab-label">' + opts.escape(c.name) + "</span></button>";
    }).join("");

    container.innerHTML =
      '<div class="cat-bar">' +
        '<div class="cat-tabs" id="' + opts.id + '-tabs" role="tablist">' + tabsHtml + "</div>" +
        '<button class="cat-tab cat-tab-add" id="' + opts.id + '-add-btn" type="button" title="New category" aria-label="New category">+</button>' +
      "</div>" +
      '<div class="cat-add-row" id="' + opts.id + '-add-row" hidden>' +
        '<input type="text" class="text-input" id="' + opts.id + '-add-input" placeholder="Category name" maxlength="40">' +
        '<button class="btn" id="' + opts.id + '-add-confirm">Add</button>' +
        '<button class="btn btn-ghost" id="' + opts.id + '-add-cancel" type="button">Cancel</button>' +
      "</div>" +
      '<div class="cat-toolbar">' +
        '<span class="cat-toolbar-name" id="' + opts.id + '-active-name">' + opts.escape(opts.activeCat.name) + "</span>" +
        '<div class="cat-toolbar-actions">' +
          '<button class="icon-btn" id="' + opts.id + '-rename" title="Rename category" aria-label="Rename category">' + ICON_EDIT_SVG + "</button>" +
          (data.cats.length > 1 ? '<button class="icon-btn" id="' + opts.id + '-delete" title="Delete category" aria-label="Delete category">' + ICON_DELETE_SVG + "</button>" : "") +
        "</div>" +
      "</div>";

    container.querySelector("#" + opts.id + "-tabs").addEventListener("click", function (e) {
      var btn = e.target.closest ? e.target.closest("[data-cat]") : null;
      if (btn) { opts.onSwitch(btn.getAttribute("data-cat")); }
    });

    var addBtn = container.querySelector("#" + opts.id + "-add-btn");
    var addRow = container.querySelector("#" + opts.id + "-add-row");
    var addInput = container.querySelector("#" + opts.id + "-add-input");
    addBtn.addEventListener("click", function () { addRow.hidden = false; addInput.value = ""; addInput.focus(); });
    container.querySelector("#" + opts.id + "-add-cancel").addEventListener("click", function () { addRow.hidden = true; });
    function confirmAdd() {
      var name = addInput.value.trim();
      if (!name) { toast("Give the category a name first.", true); return; }
      addRow.hidden = true;
      opts.onAdd(name);
    }
    container.querySelector("#" + opts.id + "-add-confirm").addEventListener("click", confirmAdd);
    addInput.addEventListener("keydown", function (e) {
      if (e.key === "Enter") { confirmAdd(); }
      if (e.key === "Escape") { addRow.hidden = true; }
    });

    var renameBtn = container.querySelector("#" + opts.id + "-rename");
    if (renameBtn) {
      renameBtn.addEventListener("click", function () {
        var current = opts.activeCat.name;
        var nameEl = container.querySelector("#" + opts.id + "-active-name");
        nameEl.outerHTML = '<input type="text" class="text-input cat-rename-input" id="' + opts.id + '-active-name" value="' +
          opts.escape(current).replace(/"/g, "&quot;") + '" maxlength="40">';
        var input = container.querySelector("#" + opts.id + "-active-name");
        input.focus();
        input.select();
        function commit() { opts.onRename(opts.activeCat.id, input.value.trim() || current); }
        input.addEventListener("keydown", function (e) { if (e.key === "Enter") { input.blur(); } });
        input.addEventListener("blur", commit);
      });
    }

    var deleteBtn = container.querySelector("#" + opts.id + "-delete");
    if (deleteBtn) { deleteBtn.addEventListener("click", function () { opts.onDelete(opts.activeCat.id); }); }
  }

  // ---------------------------------------------------------
  // Image color extraction (HTML5 Canvas)
  // Downsamples the image onto a small offscreen canvas, buckets pixels by
  // quantized RGB, then returns the most frequent bucket averages as HEX -
  // a lightweight, dependency-free stand-in for full k-means quantization.
  // ---------------------------------------------------------
  function rgbToHex(r, g, b) {
    function h(n) { n = Math.max(0, Math.min(255, n)); var s = n.toString(16); return s.length === 1 ? "0" + s : s; }
    return ("#" + h(r) + h(g) + h(b)).toUpperCase();
  }
  function hexToRgbParts(hex) {
    var n = parseInt(hex.replace("#", ""), 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }
  function hexDistance(a, b) {
    var ca = hexToRgbParts(a), cb = hexToRgbParts(b);
    return Math.sqrt(Math.pow(ca.r - cb.r, 2) + Math.pow(ca.g - cb.g, 2) + Math.pow(ca.b - cb.b, 2));
  }
  function extractDominantColors(imgEl, count) {
    var W = 120;
    var ratio = (imgEl.height / imgEl.width) || 1;
    var w = W, h = Math.max(1, Math.round(W * ratio));

    var canvas = document.createElement("canvas");
    canvas.width = w; canvas.height = h;
    var ctx = canvas.getContext("2d");
    ctx.drawImage(imgEl, 0, 0, w, h);

    var data;
    try { data = ctx.getImageData(0, 0, w, h).data; } catch (e) { return []; } // tainted canvas / read failure

    var STEP = 24; // quantization bucket size per channel (0-255)
    var buckets = {};
    for (var i = 0; i < data.length; i += 4) {
      if (data[i + 3] < 125) { continue; } // skip mostly-transparent pixels
      var r = data[i], g = data[i + 1], b = data[i + 2];
      var key = Math.round(r / STEP) + "," + Math.round(g / STEP) + "," + Math.round(b / STEP);
      var bucket = buckets[key];
      if (!bucket) { bucket = buckets[key] = { r: 0, g: 0, b: 0, n: 0 }; }
      bucket.r += r; bucket.g += g; bucket.b += b; bucket.n++;
    }

    var sorted = [];
    for (var k in buckets) { if (buckets.hasOwnProperty(k)) { sorted.push(buckets[k]); } }
    sorted.sort(function (x, y) { return y.n - x.n; });

    var results = [];
    for (var j = 0; j < sorted.length && results.length < count; j++) {
      var bk = sorted[j];
      var hex = rgbToHex(Math.round(bk.r / bk.n), Math.round(bk.g / bk.n), Math.round(bk.b / bk.n));
      var tooClose = false;
      for (var m = 0; m < results.length; m++) { if (hexDistance(results[m], hex) < 18) { tooClose = true; break; } }
      if (!tooClose) { results.push(hex); }
    }
    return results;
  }

  // ---------------------------------------------------------
  // Color Palette tab
  // ---------------------------------------------------------
  // ---------------------------------------------------------
  // Active palette color: the last swatch picked in the Color Palette tab. Mirrored on
  // window.activePaletteColor (e.g. "#FF5E5E") so any tool can read it, persisted via Store so it
  // survives a panel reload. The Easy Layer SOL tile sends it to host.jsx, and every pick also recolors Fill effects on the selected layers.
  // ---------------------------------------------------------
  var ActivePalette = {
    KEY: "activePaletteColor",
    DEFAULT: "#FFFFFF",
    isValid: function (v) { return /^#?[0-9a-f]{6}$/i.test(v || ""); },
    norm: function (v) { v = String(v).trim(); if (v.charAt(0) !== "#") { v = "#" + v; } return v.toUpperCase(); },
    get: function () {
      return this.isValid(window.activePaletteColor) ? this.norm(window.activePaletteColor) : this.DEFAULT;
    },
    listeners: [],
    // fn(hex, source) runs on every set(); returns an unsubscribe function.
    subscribe: function (fn) {
      var list = this.listeners;
      list.push(fn);
      return function () { var i = list.indexOf(fn); if (i !== -1) { list.splice(i, 1); } };
    },
    // opts.persist === false skips the localStorage write (used per-frame while dragging the color wheel);
    // opts.source tags who changed it so that component doesn't react to its own update.
    set: function (hex, opts) {
      if (!this.isValid(hex)) { return; }
      opts = opts || {};
      hex = this.norm(hex);
      window.activePaletteColor = hex;
      if (opts.persist !== false) { Store.set(this.KEY, hex); }
      this.paint(hex);
      var copy = this.listeners.slice(), i;
      for (i = 0; i < copy.length; i++) { try { copy[i](hex, opts.source || ""); } catch (e) { /* one bad listener must not stop the rest */ } }
    },
    // Keeps every live consumer in sync without re-rendering: selected-swatch ring + the SOL tile's color dot.
    paint: function (hex) {
      Array.prototype.forEach.call(document.querySelectorAll(".swatch"), function (sw) {
        sw.classList.toggle("is-selected", (sw.getAttribute("data-hex") || "").toUpperCase() === hex);
      });
      Array.prototype.forEach.call(document.querySelectorAll(".tool-fill-dot"), function (d) { d.style.background = hex; });
    },
    init: function () {
      var saved = Store.get(this.KEY);
      window.activePaletteColor = this.isValid(saved) ? this.norm(saved) : this.DEFAULT;
    }
  };
  ActivePalette.init();

  // ---------------------------------------------------------
  // Color Wheel (Custom Colors section): HSV picker on plain Canvas 2D + DOM - no libraries, and only
  // APIs CEF 74 (After Effects 2021+) has (Pointer Events, canvas, requestAnimationFrame; no ?. / ?? / inset /
  // aspect-ratio). Hue = angle, Saturation = distance from the center, Value = the vertical slider.
  // Every change updates ActivePalette (window.activePaletteColor) each frame, and - throttled to one
  // ExtendScript call per LIVE_MS with at most one in flight - recolors Fill effects on the selected layers
  // via applyColorToSelectionOrFill(hex). The last value is always flushed on release.
  // ---------------------------------------------------------
  var ColorWheel = (function () {
    // Dial geometry (px of the N x N canvas; the canvas is scaled to the card width by CSS). Disc = hue (angle) +
    // saturation (distance); brightness lives on the arc hugging the right side of the bezel (A0..A1 degrees, y down).
    var N = 340, K = N / 272, C = N / 2, RD = 98 * K, RA = 122 * K, A0 = -56, A1 = 56;
    var LIVE_MS = 60, LIVE_KEY = "cwLiveFill", uid = 0;
    var baseImg = null, baseLight = null;

    function clamp01(v) { return v < 0 ? 0 : (v > 1 ? 1 : v); }
    function hsvToRgb(h, s, v) {
      h = ((h % 360) + 360) % 360;
      var c = v * s, x = c * (1 - Math.abs((h / 60) % 2 - 1)), m = v - c, r = 0, g = 0, b = 0;
      if (h < 60) { r = c; g = x; } else if (h < 120) { r = x; g = c; } else if (h < 180) { g = c; b = x; }
      else if (h < 240) { g = x; b = c; } else if (h < 300) { r = x; b = c; } else { r = c; b = x; }
      return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
    }
    function rgbToHsv(r, g, b) {
      r /= 255; g /= 255; b /= 255;
      var max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min, h = 0;
      if (d) {
        if (max === r) { h = ((g - b) / d) % 6; } else if (max === g) { h = (b - r) / d + 2; } else { h = (r - g) / d + 4; }
        h *= 60; if (h < 0) { h += 360; }
      }
      return { h: h, s: max ? d / max : 0, v: max };
    }
    function hexToRgb(hex) { var n = parseInt(hex.replace("#", ""), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
    function rgbToHex(c) { return "#" + ((1 << 24) + (c[0] << 16) + (c[1] << 8) + c[2]).toString(16).slice(1).toUpperCase(); }

    function isLightTheme() { return document.documentElement.getAttribute("data-theme") === "light"; }
    // Static layer, rendered once per theme and reused by every dial: bezel ticks, the disc's drop shadow and the
    // full-brightness hue/saturation disc (darkening for lower Value is a cheap alpha overlay at draw time, so a drag
    // never recomputes pixels).
    function buildBase() {
      var light = isLightTheme();
      if (baseImg && baseLight === light) { return baseImg; }
      var cv = document.createElement("canvas"); cv.width = N; cv.height = N;
      var ctx = cv.getContext("2d"), a, rel, major, r0, r1, rad;
      for (a = 0; a < 360; a += 4) {
        rel = ((a + 180) % 360) - 180;
        if (Math.abs(rel) < A1 + 8) { continue; }   // the brightness arc lives here
        major = a % 30 === 0; rad = a * Math.PI / 180;
        r0 = RD + (major ? 11 : 14) * K; r1 = RD + 19 * K;
        ctx.beginPath(); ctx.moveTo(C + Math.cos(rad) * r0, C + Math.sin(rad) * r0); ctx.lineTo(C + Math.cos(rad) * r1, C + Math.sin(rad) * r1);
        ctx.lineWidth = major ? 1.6 * K : K;
        ctx.strokeStyle = light ? (major ? "rgba(0,0,0,0.42)" : "rgba(0,0,0,0.2)") : (major ? "rgba(255,255,255,0.42)" : "rgba(255,255,255,0.2)");
        ctx.stroke();
      }
      ctx.save();
      ctx.shadowColor = light ? "rgba(0,0,0,0.3)" : "rgba(0,0,0,0.55)"; ctx.shadowBlur = 18 * K; ctx.shadowOffsetY = 5 * K;
      ctx.beginPath(); ctx.arc(C, C, RD, 0, Math.PI * 2); ctx.fillStyle = "#000"; ctx.fill();
      ctx.restore();
      var img = ctx.createImageData(N, N), d = img.data, x, y, dx, dy, r, i2, rgb, al;
      // only the disc is written; the shadow underneath stays, so composite the disc on a scratch canvas
      var sc = document.createElement("canvas"); sc.width = N; sc.height = N;
      var sctx = sc.getContext("2d");
      for (y = 0; y < N; y++) {
        for (x = 0; x < N; x++) {
          dx = x + 0.5 - C; dy = y + 0.5 - C; r = Math.sqrt(dx * dx + dy * dy);
          if (r > RD + 1) { continue; }
          rgb = hsvToRgb(Math.atan2(-dy, dx) * 180 / Math.PI, Math.min(1, r / RD), 1);
          al = r <= RD - 0.5 ? 255 : Math.max(0, Math.round((RD + 0.5 - r) * 255));   // soft edge
          i2 = (y * N + x) * 4; d[i2] = rgb[0]; d[i2 + 1] = rgb[1]; d[i2 + 2] = rgb[2]; d[i2 + 3] = al;
        }
      }
      sctx.putImageData(img, 0, 0);
      ctx.drawImage(sc, 0, 0);
      baseImg = cv; baseLight = light;
      return cv;
    }

    // ---- live Fill sync (shared): throttle + one call in flight + trailing flush ----
    var live = { timer: 0, inFlight: false, pending: null, last: 0, lastSent: "" };
    function pump() {
      if (live.inFlight || !live.pending) { return; }
      var wait = LIVE_MS - (Date.now() - live.last);
      if (wait > 0) { if (!live.timer) { live.timer = setTimeout(function () { live.timer = 0; pump(); }, wait); } return; }
      var hex = live.pending; live.pending = null;
      if (hex === live.lastSent) { return; }
      live.lastSent = hex; live.inFlight = true; live.last = Date.now();
      Bridge.call("applyColorToSelectionOrFill", [hex]).then(function () { live.inFlight = false; pump(); });
    }
    function queueFill(hex) { live.pending = hex; pump(); }

    // ---- pointer -> element coordinates, immune to CSS zoom ----
    // ".app { zoom: var(--ui-scale) }" (css/style.css) scales the whole panel. Older Chromium/CEF builds (CEP hosts
    // before ~Chrome 128) return getBoundingClientRect() already DIVIDED by that zoom while event.clientX/Y stay in real
    // screen pixels, so with any UI scale other than 100% the picked point drifted away from the mouse (and the drift
    // grew with distance from the top-left of the panel). Newer builds report both in screen pixels. pointerBox() finds
    // out which convention this host uses (rect.width vs offsetWidth: ~1 = old, ~zoom = new) and always returns the
    // rect in the same pixels as clientX/Y. At 100% scale it is a plain getBoundingClientRect().
    function zoomOf(el) {
      var z = 1, n, v;
      for (n = el; n && n.nodeType === 1; n = n.parentElement) {
        v = parseFloat(window.getComputedStyle(n).zoom);
        if (v && v > 0 && v !== 1) { z *= v; }
      }
      if (z === 1) {
        v = parseFloat(window.getComputedStyle(document.documentElement).getPropertyValue("--ui-scale"));
        if (v && v > 0) { z = v; }
      }
      return z;
    }
    // Zoom-proof screen edge of el, found with hit-testing (elementFromPoint uses the same pixels as clientX/Y, so no
    // zoom maths is involved). Gallop outward from the pointer, then bisect. Returns px from (x,y) to the last hit pixel.
    function hitReach(el, x, y, dx, dy) {
      var lo = 0, step = 4, hi, mid, MAXD = 900;
      function hit(d) {
        var h = document.elementFromPoint(x + dx * d, y + dy * d);
        return !!h && (h === el || el.contains(h));
      }
      while (step <= MAXD && hit(step)) { lo = step; step *= 2; }
      hi = Math.min(step, MAXD + 1);
      while (hi - lo > 1) { mid = (lo + hi) >> 1; if (hit(mid)) { lo = mid; } else { hi = mid; } }
      return lo;
    }
    // Rect of el in the same pixels as clientX/Y. With e (a pointerdown event) the rect is verified against the real
    // on-screen edges, so a wrong zoom guess can no longer shift the picked point away from the mouse.
    function pointerBox(el, e) {
      var r = el.getBoundingClientRect(), z = zoomOf(el), k = 1, ratio, cands, best, bestErr = 1e9, i, c, err, m, hb;
      if (Math.abs(z - 1) > 0.001 && el.offsetWidth > 0) {
        ratio = r.width / el.offsetWidth;                       // old engines: ~1   new engines: ~z
        if (Math.abs(ratio - 1) < Math.abs(ratio - z)) { k = z; }
      }
      best = { left: r.left * k, top: r.top * k, width: r.width * k, height: r.height * k };
      if (!e || typeof document.elementFromPoint !== "function") { return best; }
      try {
        if (!hitEl0(el, e.clientX, e.clientY)) { return best; }
        m = {
          left: e.clientX - hitReach(el, e.clientX, e.clientY, -1, 0),
          top: e.clientY - hitReach(el, e.clientX, e.clientY, 0, -1),
          right: e.clientX + hitReach(el, e.clientX, e.clientY, 1, 0) + 1,
          bottom: e.clientY + hitReach(el, e.clientX, e.clientY, 0, 1) + 1
        };
        hb = { left: m.left, top: m.top, width: m.right - m.left, height: m.bottom - m.top };
        cands = [{ left: r.left, top: r.top, width: r.width, height: r.height }];
        if (Math.abs(z - 1) > 0.001) { cands.push({ left: r.left * z, top: r.top * z, width: r.width * z, height: r.height * z }); }
        cands.push(best);
        for (i = 0; i < cands.length; i++) {
          c = cands[i];
          err = Math.abs(c.left - hb.left) + Math.abs(c.top - hb.top) + Math.abs(c.width - hb.width) + Math.abs(c.height - hb.height);
          if (err < bestErr) { bestErr = err; best = c; }
        }
        if (bestErr > 8) { best = hb; }   // no candidate matches the screen (odd host / transform): trust the measured edges
      } catch (err2) { /* keep the heuristic box */ }
      return best;
    }
    function hitEl0(el, x, y) {
      var h = document.elementFromPoint(x, y);
      return !!h && (h === el || el.contains(h));
    }

    function create(opts) {
      opts = opts || {};
      var id = "cw-live-" + (++uid);
      var start = rgbToHsv.apply(null, hexToRgb(ActivePalette.get()));
      var st = { h: start.h, s: start.s, v: start.v };
      var liveOn = Store.get(LIVE_KEY) !== "0";

      var root = document.createElement("div");
      root.className = "cw";
      root.innerHTML =
        '<div class="cw-dial"><canvas class="cw-wheel" width="' + N + '" height="' + N + '" tabindex="0" role="slider" aria-valuemin="0" aria-valuemax="100" ' +
          'aria-label="Color wheel. Drag for hue and saturation, drag the arc or press Up and Down for brightness"></canvas></div>' +
        '<div class="cw-bar">' +
          '<span class="cw-chip" aria-hidden="true"></span>' +
          '<input type="text" class="cw-hex" maxlength="7" spellcheck="false" aria-label="HEX color">' +
          '<span class="cw-rgb"></span>' +
        '</div>' +
        '<div class="cw-actions">' +
          '<button type="button" class="btn btn-primary cw-save">Save color</button>' +
          '<button type="button" class="btn cw-reset" title="Set the color back to neutral white (#FFFFFF)" aria-label="Reset color to white">Reset</button>' +
        '</div>' +
        '<label class="switch-row" for="' + id + '"><span>Live Fill update while dragging</span>' +
          '<input type="checkbox" id="' + id + '"' + (liveOn ? " checked" : "") + '><span class="switch-track"></span></label>';

      var canvas = root.querySelector(".cw-wheel"), ctx = canvas.getContext("2d");
      var hexEl = root.querySelector(".cw-hex"), rgbEl = root.querySelector(".cw-rgb");
      var raf = 0, dragging = false, dragBox = null, mode = "", lastHex = "";
      var sinA1 = Math.sin(A1 * Math.PI / 180);

      function current() { return rgbToHex(hsvToRgb(st.h, st.s, st.v)); }

      function draw() {
        raf = 0;
        var hex = current(), rgb = hexToRgb(hex), full = rgbToHex(hsvToRgb(st.h, st.s, 1));
        var light = isLightTheme(), hr = st.h * Math.PI / 180, ka = (A0 + (1 - st.v) * (A1 - A0)) * Math.PI / 180;
        var kx = C + Math.cos(ka) * RA, ky = C + Math.sin(ka) * RA, mx = C + st.s * RD * Math.cos(hr), my = C - st.s * RD * Math.sin(hr);
        ctx.clearRect(0, 0, N, N);
        if (isMaterial()) { drawMaterial(ctx, hex, full, kx, ky, ka, mx, my); finishDraw(hex, rgb); return; }
        ctx.drawImage(buildBase(), 0, 0);

        // brightness arc: track + gradient (full-brightness color -> black), knob carries the picked color
        var g = ctx.createLinearGradient(0, C - RA * sinA1, 0, C + RA * sinA1);
        g.addColorStop(0, full); g.addColorStop(1, "#000");
        ctx.lineCap = "round";
        ctx.beginPath(); ctx.arc(C, C, RA, A0 * Math.PI / 180, A1 * Math.PI / 180); ctx.lineWidth = 13 * K; ctx.strokeStyle = light ? "rgba(0,0,0,0.14)" : "rgba(255,255,255,0.16)"; ctx.stroke();
        ctx.beginPath(); ctx.arc(C, C, RA, A0 * Math.PI / 180, A1 * Math.PI / 180); ctx.lineWidth = 10 * K; ctx.strokeStyle = g; ctx.stroke();
        ctx.beginPath(); ctx.arc(kx, ky, 10.5 * K, 0, Math.PI * 2); ctx.fillStyle = "rgba(0,0,0,0.5)"; ctx.fill();
        ctx.beginPath(); ctx.arc(kx, ky, 8.5 * K, 0, Math.PI * 2); ctx.fillStyle = hex; ctx.fill();
        ctx.lineWidth = 3 * K; ctx.strokeStyle = "#fff"; ctx.stroke();

        // disc: darkening overlay for Value < 1, edge, hue/saturation marker
        if (st.v < 1) {
          ctx.fillStyle = "rgba(0,0,0," + (1 - st.v).toFixed(3) + ")";
          ctx.beginPath(); ctx.arc(C, C, RD, 0, Math.PI * 2); ctx.fill();
        }
        ctx.beginPath(); ctx.arc(C, C, RD - 0.5, 0, Math.PI * 2); ctx.lineWidth = 1; ctx.strokeStyle = "rgba(255,255,255,0.28)"; ctx.stroke();
        ctx.beginPath(); ctx.arc(mx, my, 12 * K, 0, Math.PI * 2); ctx.lineWidth = 2 * K; ctx.strokeStyle = "rgba(0,0,0,0.55)"; ctx.stroke();
        ctx.beginPath(); ctx.arc(mx, my, 10 * K, 0, Math.PI * 2); ctx.fillStyle = hex; ctx.fill();
        ctx.lineWidth = 3 * K; ctx.strokeStyle = "#fff"; ctx.stroke();

        finishDraw(hex, rgb);
      }
      function finishDraw(hex, rgb) {
        if (hex !== lastHex) {   // card glow + bar follow the picked color
          lastHex = hex;
          root.style.setProperty("--cur", hex);
          root.style.setProperty("--cur-rgb", rgb[0] + "," + rgb[1] + "," + rgb[2]);
          rgbEl.textContent = "rgb(" + rgb[0] + ", " + rgb[1] + ", " + rgb[2] + ")";
        }
        canvas.setAttribute("aria-valuenow", String(Math.round(st.v * 100)));
        if (document.activeElement !== hexEl) { hexEl.value = hex; }
        ActivePalette.set(hex, { persist: false, source: "wheel" });   // window.activePaletteColor, every frame
      }

      // ---- Material You face: same geometry + hit-testing as Glass (disc RD, arc A0..A1), different drawing ----
      // Hue/saturation = 5 rings of rounded colour cells with a neutral centre dot (like the cells of a Material
      // tonal palette); brightness = a thick pill track with a slim radial handle, haloed in the card colour.
      var MAT_RINGS = 5, mc = null;
      function isMaterial() { return document.documentElement.getAttribute("data-ui-theme") === "material"; }
      function matColors() {
        if (mc) { return mc; }
        var cs = window.getComputedStyle(document.documentElement);
        function v(n, d) { var x = cs.getPropertyValue(n); return x && x.trim() ? x.trim() : d; }
        mc = { card: v("--md-surface-low", "#f3f2fe"), track: v("--md-surface-highest", "#e2e1ed"), handle: v("--md-primary", "#6843cb"),
               ring: v("--md-surface-lowest", "#ffffff"), ink: v("--md-on-surface", "#1b1b23") };
        return mc;
      }
      function pill(c, x, y, w, h, r) {   // rounded rect without ctx.roundRect (CEF 74)
        c.beginPath();
        c.moveTo(x + r, y); c.lineTo(x + w - r, y); c.arc(x + w - r, y + r, r, -Math.PI / 2, 0);
        c.lineTo(x + w, y + h - r); c.arc(x + w - r, y + h - r, r, 0, Math.PI / 2);
        c.lineTo(x + r, y + h); c.arc(x + r, y + h - r, r, Math.PI / 2, Math.PI);
        c.lineTo(x, y + r); c.arc(x + r, y + r, r, Math.PI, Math.PI * 1.5); c.closePath();
      }
      function drawMaterial(c, hex, full, kx, ky, ka, mx, my) {
        var col = matColors(), t = RD / (MAT_RINGS + 1), gap = 3.2 * K, k, j, n, rm, w, span, capA, a0, a1, hc, rgbc, ang;
        // brightness track: wide pill, gradient fill inset by 2px
        c.lineCap = "round";
        c.beginPath(); c.arc(C, C, RA, A0 * Math.PI / 180, A1 * Math.PI / 180); c.lineWidth = 18 * K; c.strokeStyle = col.track; c.stroke();
        var g = c.createLinearGradient(0, C - RA * sinA1, 0, C + RA * sinA1);
        g.addColorStop(0, full); g.addColorStop(1, "#000");
        c.beginPath(); c.arc(C, C, RA, A0 * Math.PI / 180, A1 * Math.PI / 180); c.lineWidth = 12 * K; c.strokeStyle = g; c.stroke();
        // neutral centre dot (saturation 0)
        rgbc = hsvToRgb(st.h, 0, st.v);
        c.beginPath(); c.arc(C, C, t - gap / 2, 0, Math.PI * 2); c.fillStyle = rgbToHex(rgbc); c.fill();
        // colour cells
        for (k = 1; k <= MAT_RINGS; k++) {
          n = 6 * k; rm = (k + 0.5) * t; w = t - gap; span = 360 / n;
          capA = (gap / 2 + w / 2) / rm * 180 / Math.PI;                 // degrees eaten by the gap and the round caps
          c.lineWidth = w;
          for (j = 0; j < n; j++) {
            hc = j * span; rgbc = hsvToRgb(hc, k / MAT_RINGS, st.v);
            a1 = -(hc - span / 2) - capA; a0 = -(hc + span / 2) + capA;   // canvas angles run opposite to hue
            c.strokeStyle = rgbToHex(rgbc);
            c.beginPath();
            if (a1 <= a0) { ang = -hc * Math.PI / 180; c.arc(C + Math.cos(ang) * rm, C + Math.sin(ang) * rm, w / 2, 0, Math.PI * 2); c.fillStyle = c.strokeStyle; c.fill(); continue; }
            c.arc(C, C, rm, a0 * Math.PI / 180, a1 * Math.PI / 180); c.stroke();
          }
        }
        // handle on the track: card-coloured halo + slim primary pill lying along the radius
        c.save(); c.translate(kx, ky); c.rotate(ka);
        pill(c, -17 * K, -6 * K, 34 * K, 12 * K, 6 * K); c.fillStyle = col.card; c.fill();
        pill(c, -14 * K, -3 * K, 28 * K, 6 * K, 3 * K); c.fillStyle = col.handle; c.fill();
        c.restore();
        // picked point: card ring + coloured core
        c.beginPath(); c.arc(mx, my, 13 * K, 0, Math.PI * 2); c.fillStyle = "rgba(0,0,0,0.28)"; c.fill();
        c.beginPath(); c.arc(mx, my, 12 * K, 0, Math.PI * 2); c.fillStyle = col.ring; c.fill();
        c.beginPath(); c.arc(mx, my, 8.5 * K, 0, Math.PI * 2); c.fillStyle = hex; c.fill();
      }
      try {   // repaint when the style / palette changes (colours are cached per theme)
        var mo = new MutationObserver(function () { mc = null; if (root.isConnected) { schedule(); } else { mo.disconnect(); } });
        mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "data-ui-theme", "data-md-scheme", "data-md-bg", "style"] });
        document.addEventListener("mt-palette", function () { mc = null; schedule(); });
      } catch (eMo) { }
      function schedule() { if (!raf) { raf = requestAnimationFrame(draw); } }

      // called after every user change: repaint next frame + (optionally) push to the selected Fill effects
      function changed(force) {
        schedule();
        if (force || liveOn) { queueFill(current()); }
      }
      function commit() {
        var hex = current();
        ActivePalette.set(hex, { persist: true, source: "wheel" });
        queueFill(hex);   // flush the exact final color even when live updates are off / throttled
      }

      // ---- dragging (Pointer Events + capture, so a drag can leave the canvas). Where the press lands decides
      // what the drag edits: on the brightness arc = Value, anywhere else = hue + saturation. ----
      function local(e) {
        return { x: (e.clientX - dragBox.left) / dragBox.width * N - C, y: (e.clientY - dragBox.top) / dragBox.height * N - C };
      }
      function applyPointer(e) {
        if (!dragBox || !dragBox.width) { return; }
        var p = local(e), dist = Math.sqrt(p.x * p.x + p.y * p.y), a;
        if (mode === "val") {
          a = Math.atan2(p.y, p.x) * 180 / Math.PI;                 // 0 = right, y down
          a = a < A0 ? A0 : (a > A1 ? A1 : a);
          st.v = clamp01(1 - (a - A0) / (A1 - A0));
        } else {
          st.s = Math.min(1, dist / RD);
          if (dist > 1) { st.h = (Math.atan2(-p.y, p.x) * 180 / Math.PI + 360) % 360; }
        }
        changed(false);
      }
      canvas.addEventListener("pointerdown", function (e) {
        if (e.button !== undefined && e.button !== 0) { return; }
        e.preventDefault();
        dragBox = pointerBox(canvas, e);   // measured once at pointerdown, reused for the whole drag
        if (!dragBox.width) { dragBox = null; return; }
        var p = local(e), dist = Math.sqrt(p.x * p.x + p.y * p.y), ang = Math.atan2(p.y, p.x) * 180 / Math.PI;
        mode = (dist > RD + 6 * K && Math.abs(ang) <= A1 + 14) ? "val" : "wheel";
        dragging = true;
        try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* older hosts */ }
        root.classList.add("is-dragging");
        applyPointer(e);
      });
      canvas.addEventListener("pointermove", function (e) { if (dragging) { applyPointer(e); } });
      function end() {
        if (!dragging) { return; }
        dragging = false; dragBox = null; mode = "";
        root.classList.remove("is-dragging");
        commit();
      }
      canvas.addEventListener("pointerup", end);
      canvas.addEventListener("pointercancel", end);
      canvas.addEventListener("lostpointercapture", end);

      canvas.addEventListener("keydown", function (e) {
        var step = e.shiftKey ? 0.1 : 0.02, k = e.key, nv = st.v;
        if (k === "ArrowUp" || k === "ArrowRight") { nv += step; }
        else if (k === "ArrowDown" || k === "ArrowLeft") { nv -= step; }
        else if (k === "Home") { nv = 1; } else if (k === "End") { nv = 0; }
        else { return; }
        e.preventDefault();
        st.v = clamp01(nv);
        changed(true); commit();
      });

      // ---- typed HEX ----
      hexEl.addEventListener("input", function () {
        if (!ActivePalette.isValid(hexEl.value)) { return; }
        var hsv = rgbToHsv.apply(null, hexToRgb(ActivePalette.norm(hexEl.value)));
        if (hsv.s > 0) { st.h = hsv.h; } st.s = hsv.s; st.v = hsv.v;
        changed(true); commit();
      });
      hexEl.addEventListener("blur", function () { hexEl.value = current(); });

      root.querySelector("#" + id).addEventListener("change", function (e) {
        liveOn = e.target.checked;
        Store.set(LIVE_KEY, liveOn ? "1" : "0");
      });
      // Reset: back to neutral white (no hue, no saturation, full brightness). Same path as typing #FFFFFF: Fill effects follow, then it is stored.
      root.querySelector(".cw-reset").addEventListener("click", function () {
        st.s = 0; st.v = 1;
        changed(true); commit();
        toast("Color reset to white.");
      });
      root.querySelector(".cw-save").addEventListener("click", function () { if (opts.onSave) { opts.onSave(current()); } });

      // ---- follow swatch clicks / other pickers (ignore our own updates) ----
      var seenConnected = false, unsub = ActivePalette.subscribe(function (hex, source) {
        if (root.isConnected) { seenConnected = true; } else if (seenConnected) { unsub(); return; }   // tab re-rendered: drop this instance
        if (source === "wheel" || hex === current()) { return; }
        var hsv = rgbToHsv.apply(null, hexToRgb(hex));
        if (hsv.s > 0 && hsv.v > 0) { st.h = hsv.h; }
        st.s = hsv.s; st.v = hsv.v;
        schedule();
      });

      draw();
      return root;
    }

    return { create: create };
  })();

  var colorCatStore = CategoryStore("customColorCats");

  var ColorPalette = {
    isValidHex: function (v) { return /^#?[0-9a-f]{6}$/i.test(v || ""); },
    normalizeHex: function (v) { v = v.trim(); if (v.charAt(0) !== "#") { v = "#" + v; } return v.toUpperCase(); },

    // action: null (plain preset/curated swatch), "remove" (custom colors), "add" (extracted colors)
    swatchHtml: function (hex, action) {
      var overlay = "";
      if (action === "remove") { overlay = '<span class="swatch-remove" data-remove-hex="' + hex + '" title="Remove">&times;</span>'; }
      else if (action === "add") { overlay = '<span class="swatch-add" data-add-hex="' + hex + '" title="Save to category">+</span>'; }
      var sel = (String(hex).toUpperCase() === ActivePalette.get()) ? " is-selected" : "";
      return '<button class="swatch' + sel + '" data-hex="' + hex + '" style="background:' + hex + '" title="' + hex + '" aria-label="' + hex + '">' + overlay + "</button>";
    },

    render: function () {
      var self = this;
      var wrap = document.createElement("div");
      wrap.className = "ta";
      wrap.setAttribute("data-open-first", "0");   // Layer Label Colors starts collapsed; the dial + Swatches card are the main area

      // Legacy migration: earlier versions kept one flat "customColors" list.
      // The first time the categorized store runs, that list becomes the seed
      // for a single "Custom Colors" category - nothing is lost.
      var legacy = null;
      try { legacy = JSON.parse(Store.get("customColors") || "null"); } catch (e) { legacy = null; }
      var catData = colorCatStore.ensure("Custom Colors", legacy || []);

      var presetHtml = PALETTE_PRESET.map(function (hex) { return self.swatchHtml(hex, null); }).join("");
      var labelHtml = LAYER_LABELS.map(function (l) {
        return '<button class="label-swatch" data-label="' + l.index + '" style="background:' + l.hex + '" title="' + l.name + '" aria-label="' + l.name + '">' +
          '<span class="label-name">' + l.name + "</span></button>";
      }).join("");

      // One "Swatches" card, three sources: Curated (fixed palette), Saved (categories) and From image (extracted colors).
      var activeTab = Store.get("cpSwatchTab");
      if (activeTab !== "cur" && activeTab !== "sav" && activeTab !== "img") { activeTab = "cur"; }
      function segBtn(key, label) {
        var on = key === activeTab;
        return '<button type="button" class="cp-seg-btn' + (on ? " is-active" : "") + '" role="tab" aria-selected="' + on + '" data-cp-tab="' + key + '">' + label + "</button>";
      }
      function pane(key, inner) {
        return '<div class="cp-pane" data-cp-pane="' + key + '"' + (key === activeTab ? "" : " hidden") + ">" + inner + "</div>";
      }

      wrap.innerHTML =
        '<div id="palette-wheel-mount"></div>' +
        '<div class="ta-section">' +
          '<h2 class="ta-title">Layer Label Colors</h2>' +
          '<div class="label-grid">' + labelHtml + "</div>" +
          '<p class="field-note">Click a color to set it as the Layer Label of the currently selected layer(s) in After Effects.</p>' +
        "</div>" +
        '<div class="cp-card">' +
          '<div class="cp-seg" role="tablist" aria-label="Swatch source">' + segBtn("cur", "Curated") + segBtn("sav", "Saved") + segBtn("img", "From image") + "</div>" +
          pane("cur", '<div class="cp-grid">' + presetHtml + "</div>") +
          pane("sav", '<div id="palette-cat-controls"></div><div class="cp-grid" id="palette-custom-grid"></div>') +
          pane("img",
            '<div class="cp-drop">' +
              '<div class="cp-thumb" id="palette-image-thumb"></div>' +
              '<div class="cp-drop-text"><b id="palette-image-name">No image selected</b><small id="palette-image-count">JPG or PNG</small></div>' +
              '<button class="btn" id="palette-image-choose">Choose image</button>' +
            "</div>" +
            '<div class="cp-grid" id="palette-extracted-grid" hidden></div>' +
            '<p class="field-note" id="palette-extract-hint" hidden>Click + on a color to save it to Saved.</p>') +
        "</div>" +
        '<p class="field-note">Clicking any swatch copies its HEX to the clipboard. If a layer (Solid/Text) or a color property (like Fill Color) is selected in the Timeline, it\'s applied there too.</p>';

      var customGrid = wrap.querySelector("#palette-custom-grid");
      var catControls = wrap.querySelector("#palette-cat-controls");

      function saveColor(hex) {
        var cat = colorCatStore.activeCat(catData);
        if (cat.items.indexOf(hex) !== -1) { toast(hex + " is already in " + cat.name + "."); return; }
        addHexToActiveCat(hex);
        toast("Saved " + hex + " to " + cat.name + ".");
      }

      // Dial: picks drive window.activePaletteColor + live Fill updates; Save appends to the active category.
      wrap.querySelector("#palette-wheel-mount").appendChild(ColorWheel.create({ onSave: saveColor }));

      // ---- Swatches card: source tabs ----
      wrap.querySelector(".cp-seg").addEventListener("click", function (e) {
        var b = e.target.closest ? e.target.closest("[data-cp-tab]") : null;
        if (!b) { return; }
        var key = b.getAttribute("data-cp-tab");
        Array.prototype.forEach.call(wrap.querySelectorAll("[data-cp-tab]"), function (x) {
          var on = x === b;
          x.classList.toggle("is-active", on);
          x.setAttribute("aria-selected", String(on));
        });
        Array.prototype.forEach.call(wrap.querySelectorAll("[data-cp-pane]"), function (pn) { pn.hidden = pn.getAttribute("data-cp-pane") !== key; });
        Store.set("cpSwatchTab", key);
      });

      function renderCustomGrid() {
        var cat = colorCatStore.activeCat(catData);
        customGrid.innerHTML = cat.items.map(function (hex) { return self.swatchHtml(hex, "remove"); }).join("") +
          '<button type="button" class="swatch cp-add-tile" data-cp-addcur title="Save the current color here" aria-label="Save the current color">+</button>';
      }

      function renderCats() {
        renderCatTabs(catControls, catData, {
          id: "palette-cat",
          escape: escapeHtml,
          activeCat: colorCatStore.activeCat(catData),
          onSwitch: function (id) { colorCatStore.setActive(catData, id); renderCats(); renderCustomGrid(); },
          onAdd: function (name) { colorCatStore.addCat(catData, name); renderCats(); renderCustomGrid(); toast("Category added."); },
          onRename: function (id, name) { colorCatStore.renameCat(catData, id, name); renderCats(); },
          onDelete: function (id) {
            if (!colorCatStore.deleteCat(catData, id)) { toast("Keep at least one category.", true); return; }
            renderCats(); renderCustomGrid(); toast("Category deleted.");
          }
        });
      }
      renderCats();
      renderCustomGrid();

      function addHexToActiveCat(hex) {
        var cat = colorCatStore.activeCat(catData);
        if (cat.items.indexOf(hex) === -1) {
          cat.items.push(hex);
          colorCatStore.save(catData);
          renderCustomGrid();
        }
      }

      function handleSwatchClick(hex) {
        ActivePalette.set(hex);   // becomes the color of the next SOL press
        copyToClipboard(hex);
        // 1) Fill effects on the selected layer(s) follow the pick in place (no new layer).
        // 2) Otherwise fall back to the original behavior: selected color property / Solid / Text.
        Bridge.call("applyColorToSelectionOrFill", [hex]).then(function (fillRes) {
          var d = fillRes && fillRes.data;
          if (!fillRes || !fillRes.ok || !d || d.mode === "fill" || d.mode === "nocomp") {
            toast((fillRes && fillRes.message) || "Something went wrong.", !(fillRes && fillRes.ok));
            return;
          }
          Bridge.call("COLOR_applyToSelection", [hex]).then(function (res) {
            toast(res.message || (res.ok ? "HEX copied." : "Something went wrong."), !res.ok);
          });
        });
      }

      wrap.addEventListener("click", function (e) {
        var labelBtn = e.target.closest ? e.target.closest("[data-label]") : null;
        if (labelBtn) {
          var labelIndex = labelBtn.getAttribute("data-label");
          labelBtn.classList.add("is-pending");
          Bridge.call("LBL_applyToSelection", [parseInt(labelIndex, 10)]).then(function (res) {
            flashButtonResult(labelBtn, !!res.ok);
            toast(res.message || (res.ok ? "Label applied." : "Something went wrong."), !res.ok);
          });
          return;
        }

        var addCur = e.target.closest ? e.target.closest("[data-cp-addcur]") : null;
        if (addCur) { e.stopPropagation(); saveColor(ActivePalette.get()); return; }

        var removeBtn = e.target.closest ? e.target.closest("[data-remove-hex]") : null;
        if (removeBtn) {
          e.stopPropagation();
          var hexToRemove = removeBtn.getAttribute("data-remove-hex");
          var cat = colorCatStore.activeCat(catData);
          cat.items = cat.items.filter(function (h) { return h !== hexToRemove; });
          colorCatStore.save(catData);
          removeBtn.parentElement.remove();
          return;
        }

        var addBtn = e.target.closest ? e.target.closest("[data-add-hex]") : null;
        if (addBtn) {
          e.stopPropagation();
          var hexToAdd = addBtn.getAttribute("data-add-hex");
          addHexToActiveCat(hexToAdd);
          toast("Added to " + colorCatStore.activeCat(catData).name + ".");
          return;
        }

        var sw = e.target.closest ? e.target.closest(".swatch") : null;
        if (sw) { handleSwatchClick(sw.getAttribute("data-hex")); }
      });

      // ---- Image color extraction ----
      var imgFileInput = document.createElement("input");
      imgFileInput.type = "file";
      imgFileInput.accept = "image/png,image/jpeg,image/jpg";
      imgFileInput.hidden = true;
      wrap.appendChild(imgFileInput);

      var chooseBtn = wrap.querySelector("#palette-image-choose");
      var nameEl = wrap.querySelector("#palette-image-name");
      var countEl = wrap.querySelector("#palette-image-count");
      var thumbEl = wrap.querySelector("#palette-image-thumb");
      var extractedGrid = wrap.querySelector("#palette-extracted-grid");
      var extractHint = wrap.querySelector("#palette-extract-hint");

      chooseBtn.addEventListener("click", function () { imgFileInput.click(); });

      imgFileInput.addEventListener("change", function (e) {
        var file = e.target.files && e.target.files[0];
        if (!file) { return; }
        if (!/^image\/(png|jpe?g)$/i.test(file.type)) { toast("Please choose a JPG or PNG image.", true); return; }

        chooseBtn.classList.add("is-pending");
        nameEl.textContent = file.name;
        countEl.textContent = "Reading...";

        var reader = new FileReader();
        reader.onerror = function () {
          flashButtonResult(chooseBtn, false);
          countEl.textContent = "Could not read that image.";
          toast("Could not read that image.", true);
        };
        reader.onload = function () {
          var img = new Image();
          img.onerror = function () {
            flashButtonResult(chooseBtn, false);
            countEl.textContent = "Could not decode that image.";
            toast("Could not decode that image.", true);
          };
          img.onload = function () {
            var colors = extractDominantColors(img, 8);
            flashButtonResult(chooseBtn, !!colors.length);
            thumbEl.style.backgroundImage = "url(" + reader.result + ")";
            if (!colors.length) { countEl.textContent = "No usable colors found."; toast("No usable colors found in that image.", true); return; }
            countEl.textContent = colors.length + " colors found";
            extractedGrid.hidden = false;
            extractHint.hidden = false;
            extractedGrid.innerHTML = colors.map(function (hex) { return self.swatchHtml(hex, "add"); }).join("");
          };
          img.src = reader.result;
        };
        reader.readAsDataURL(file);
        imgFileInput.value = "";
      });

      return wrap;
    }
  };

  // ---------------------------------------------------------
  // Expression Code - external file-based persistence
  // Mirrors the categorized snippet store (exprSnippetCats in localStorage) out to
  // ~/Documents/Multitool_CEP_Data/saved_expressions.json via host.jsx, so custom expressions
  // survive an extension uninstall/reinstall/update instead of living only in localStorage.
  // Every call is best-effort and silent: if there's no CSInterface (browser preview) or the
  // file write fails, the panel keeps working off localStorage exactly as before.
  // ---------------------------------------------------------
  var ExprFile = {
    initialized: false,

    // Fire-and-forget write, called every time the snippet store changes.
    save: function (data) {
      if (!cs) { return; } // preview mode - nothing to sync
      try {
        Bridge.call("EXPR_FILE_save", [JSON.stringify(data)]).then(function (res) {
          if (!res.ok) { console.warn("Expression backup file not saved: " + res.message); }
        });
      } catch (e) { /* never let a sync failure affect the UI */ }
    },

    // data.json is the raw text of saved_expressions.json (or null). Parses it into the same
    // {activeId, cats:[...]} shape the panel uses, or returns null if it's missing/invalid/empty.
    parse: function (json) {
      if (!json || typeof json !== "string" || json.length > this.MAX_CHARS) { return null; }
      try { return this.sanitize(JSON.parse(json), true); } catch (e) {}
      return null;
    },

    // Hard limits so a wrong/huge JSON can never freeze After Effects (every byte goes through
    // evalScript, which blocks AE's main thread) or flood the panel with DOM nodes.
    MAX_CHARS: 5000000, MAX_CATS: 200, MAX_ITEMS: 5000, MAX_CODE: 300000,

    // Checks that `data` really is an Expression Code store: {activeId, cats:[{id,name,items:[{id,name,code}]}]}.
    // Other CategoryStore JSON (e.g. the Color Palette backup, items = hex strings) has the same
    // outer shape but fails here. strict=true (import/restore from file): any bad item rejects the
    // whole file (returns null) so nothing gets overwritten. strict=false (reading localStorage):
    // bad items are dropped instead, so an already-corrupted store heals itself.
    sanitize: function (data, strict) {
      if (!data || typeof data !== "object" || !Array.isArray(data.cats) || !data.cats.length) { return null; }
      if (data.cats.length > this.MAX_CATS) { return null; }
      var seenCat = {}, total = 0, chars = 0, cats = [];
      for (var i = 0; i < data.cats.length; i++) {
        var c = data.cats[i];
        if (!c || typeof c !== "object" || !Array.isArray(c.items)) { if (strict) { return null; } continue; }
        var cid = (typeof c.id === "string" || typeof c.id === "number") ? String(c.id) : "";
        if (!cid || seenCat[cid]) { cid = "c" + Date.now() + "_" + i; }
        seenCat[cid] = true;
        var seenItem = {}, items = [];
        for (var j = 0; j < c.items.length; j++) {
          var it = c.items[j];
          if (!it || typeof it !== "object" || typeof it.code !== "string" || it.code.length > this.MAX_CODE) {
            if (strict) { return null; }
            continue;
          }
          total++; chars += it.code.length;
          if (total > this.MAX_ITEMS || chars > this.MAX_CHARS) { return null; }
          var iid = (typeof it.id === "string" || typeof it.id === "number") ? String(it.id) : "";
          if (!iid || seenItem[iid]) { iid = "s" + Date.now() + "_" + i + "_" + j; }
          seenItem[iid] = true;
          var out = { id: iid, name: typeof it.name === "string" ? it.name : "Untitled", code: it.code };
          if (it.favorite === true) { out.favorite = true; }
          items.push(out);
        }
        cats.push({ id: cid, name: typeof c.name === "string" && c.name ? c.name : "Category " + (i + 1), items: items });
      }
      if (!cats.length) { return null; }
      var active = String(data.activeId);
      var ok = false;
      for (var k = 0; k < cats.length; k++) { if (cats[k].id === active) { ok = true; break; } }
      return { activeId: ok ? active : cats[0].id, cats: cats };
    },

    // A freshly-seeded store (default single empty category) - the state a wiped localStorage
    // ends up in right after a reinstall. Anything more than that is real user data worth keeping.
    isEmpty: function (data) {
      if (!data || !data.cats) { return true; }
      for (var i = 0; i < data.cats.length; i++) {
        if (data.cats[i].items && data.cats[i].items.length) { return false; }
      }
      return true;
    },

    // Requirement 3 ("On Panel Launch / Tab Load"): if localStorage has no real snippets (fresh
    // install, or the extension folder was deleted/updated), pull whatever's in the persistent
    // JSON file instead and re-seed localStorage from it. Calls onRestored(data) only when it
    // actually replaced something, so the caller can re-render.
    restoreIfNeeded: function (currentData, onRestored) {
      if (!cs) { return; }
      if (!this.isEmpty(currentData)) { return; } // localStorage already has real data - file is only a mirror
      var self = this;
      Bridge.call(this.initialized ? "EXPR_FILE_load" : "EXPR_FILE_init", []).then(function (res) {
        self.initialized = true;
        if (!res.ok || !res.data) { return; }
        var restored = self.parse(res.data.json);
        if (!restored || self.isEmpty(restored)) { return; }
        exprCatStore.save(restored);
        if (onRestored) { onRestored(restored); }
      });
    }
  };

  // ---------------------------------------------------------
  // Expression Code tab (snippet manager, organized into categories)
  // ---------------------------------------------------------
  var exprCatStore = CategoryStore("exprSnippetCats");
  // Every save (add/edit/delete snippet, favorite toggle, category add/rename/delete/switch)
  // also mirrors the whole store out to saved_expressions.json - see ExprFile above.
  (function () {
    var originalSave = exprCatStore.save;
    exprCatStore.save = function (data) {
      originalSave.call(exprCatStore, data);
      ExprFile.save(data);
    };
    // Reading validates too: a wrongly-imported store already sitting in localStorage is cleaned
    // (invalid items dropped) or, if unusable, discarded so the panel reseeds instead of throwing.
    exprCatStore.load = function () {
      var raw = Store.get(this.key);
      if (!raw) { return null; }
      var clean = null;
      try { clean = ExprFile.sanitize(JSON.parse(raw), false); } catch (e) { clean = null; }
      if (!clean) { Store.remove(this.key); return null; }
      return clean;
    };
  })();

  var ExprCode = {
    escapeHtml: function (s) { return escapeHtml(s); },

    render: function () {
      var self = this;
      var wrap = document.createElement("div");
      wrap.className = "ta";
      var editingId = null;

      // Legacy migration: earlier versions kept one flat "exprSnippets" list.
      // The first time the categorized store runs, that list becomes the seed
      // for a single "Snippets" category - nothing is lost.
      var legacy = null;
      try { legacy = JSON.parse(Store.get("exprSnippets") || "null"); } catch (e) { legacy = null; }
      var catData = exprCatStore.ensure("Snippets", legacy || []);

      wrap.innerHTML =
        '<div class="ta-section snippet-card">' +
          '<h2 class="ta-title">New / Edit Snippet</h2>' +
          '<input type="text" id="expr-name" class="text-input" placeholder="Snippet name (e.g. Elastic Scale)">' +
          '<div class="saber-wrap saber-wrap--code is-active">' +
            '<div class="code-editor">' +
              '<div class="code-editor-head">' +
                '<span class="code-editor-lang"><span class="code-editor-dot"></span>JavaScript / ExtendScript</span>' +
                '<div class="code-editor-tools">' +
                  '<button class="icon-btn" id="expr-copy" type="button" title="Copy code">' + ICON_COPY_SVG + "</button>" +
                  '<button class="icon-btn" id="expr-clear-code" type="button" title="Clear code">' + ICON_CLEAR_SVG + "</button>" +
                "</div>" +
              "</div>" +
              '<textarea id="expr-code" class="code-area" rows="6" placeholder="wiggle(2, 30)"></textarea>' +
            "</div>" +
          "</div>" +
          '<div class="field-actions">' +
            '<button class="btn" id="expr-apply-current">Apply to Selected Properties</button>' +
            '<button class="btn btn-ghost" id="expr-clear-form" type="button">Clear</button>' +
          "</div>" +
          '<button class="btn-apply" id="expr-save">Save Snippet</button>' +
        "</div>" +
        '<div class="ta-section">' +
          '<h2 class="ta-title">Saved Snippets</h2>' +
          '<div id="expr-cat-controls"></div>' +
          '<div id="expr-list" class="expr-list"></div>' +
        "</div>";

      var nameInput = wrap.querySelector("#expr-name");
      var codeInput = wrap.querySelector("#expr-code");
      var listEl = wrap.querySelector("#expr-list");
      var catControls = wrap.querySelector("#expr-cat-controls");

      function iconSvg(name) {
        if (name === "apply") { return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7Z"/></svg>'; }
        if (name === "edit") { return ICON_EDIT_SVG; }
        return ICON_DELETE_SVG; // delete
      }

      function renderCats() {
        renderCatTabs(catControls, catData, {
          id: "expr-cat",
          escape: escapeHtml,
          activeCat: exprCatStore.activeCat(catData),
          onSwitch: function (id) { exprCatStore.setActive(catData, id); renderCats(); renderList(); },
          onAdd: function (name) { exprCatStore.addCat(catData, name); renderCats(); renderList(); toast("Category added."); },
          onRename: function (id, name) { exprCatStore.renameCat(catData, id, name); renderCats(); },
          onDelete: function (id) {
            if (!exprCatStore.deleteCat(catData, id)) { toast("Keep at least one category.", true); return; }
            renderCats(); renderList(); toast("Category deleted.");
          }
        });
      }

      // Favorites float to the top; original save order is kept stable within
      // each group (favorite / not) so favoriting something doesn't shuffle
      // the rest of the list around it.
      function orderedItems(items) {
        return items
          .map(function (it, i) { return { it: it, i: i }; })
          .sort(function (a, b) {
            var fa = a.it.favorite ? 1 : 0, fb = b.it.favorite ? 1 : 0;
            return fa !== fb ? (fb - fa) : (a.i - b.i);
          })
          .map(function (x) { return x.it; });
      }

      // Stagger the entrance animation per card (capped so a long list doesn't
      // take forever to finish appearing) - see .expr-item in style.css.
      var ENTER_STAGGER_MS = 35, ENTER_STAGGER_CAP_MS = 350;

      function renderList() {
        var items = exprCatStore.activeCat(catData).items;
        if (!items.length) {
          listEl.innerHTML = '<p class="field-note">No saved snippets in this category yet - write one above and hit Save.</p>';
          return;
        }
        listEl.innerHTML = orderedItems(items).map(function (it, idx) {
          var delay = Math.min(idx * ENTER_STAGGER_MS, ENTER_STAGGER_CAP_MS);
          return '<div class="expr-item' + (it.favorite ? " is-favorite" : "") + '" data-id="' + it.id + '" style="animation-delay:' + delay + 'ms">' +
            '<div class="expr-item-head">' +
              (it.favorite ? '<span class="expr-item-fav-badge" title="Favorite">' + ICON_STAR_SVG + "</span>" : "") +
              '<span class="expr-item-name">' + escapeHtml(it.name) + "</span>" +
              '<div class="expr-item-actions">' +
                '<button class="icon-btn" data-action="pin" title="Pin to Shortcutz" aria-label="Pin ' + escapeHtml(it.name) + ' to Shortcutz">' + ICON_PIN_SVG + "</button>" +
                '<button class="icon-btn" data-action="apply" title="Apply">' + iconSvg("apply") + "</button>" +
                '<button class="icon-btn" data-action="edit" title="Edit">' + iconSvg("edit") + "</button>" +
                '<button class="icon-btn preset-del" type="button" data-action="delete" title="Delete">' + iconSvg("delete") + "</button>" +
              "</div>" +
            "</div>" +
            '<pre class="expr-item-code">' + escapeHtml(it.code) + "</pre>" +
          "</div>";
        }).join("");
      }

      // Press-and-hold anywhere on a snippet card (outside its buttons) to toggle
      // "favorite". Pointer Events cover mouse + touch/pen in one listener set.
      // A hold that moves too far or lands on a button is treated as a drag/click,
      // not a favorite toggle.
      var LONG_PRESS_MS = 550, LONG_PRESS_MOVE_TOLERANCE = 10;
      var lpTimer = null, lpEl = null, lpStartX = 0, lpStartY = 0, lpFired = false;

      function lpClear() {
        clearTimeout(lpTimer);
        lpTimer = null;
        if (lpEl) { lpEl.classList.remove("is-pressing"); }
        lpEl = null;
      }

      function toggleFavorite(id) {
        var cat = exprCatStore.activeCat(catData);
        var item = null;
        for (var i = 0; i < cat.items.length; i++) { if (cat.items[i].id === id) { item = cat.items[i]; break; } }
        if (!item) { return; }
        item.favorite = !item.favorite;
        exprCatStore.save(catData);
        renderList();
        toast(item.favorite ? "Added to favorites." : "Removed from favorites.");
      }

      listEl.addEventListener("pointerdown", function (e) {
        if (e.button !== undefined && e.button !== 0) { return; } // left click / touch / pen only
        var itemEl = e.target.closest ? e.target.closest(".expr-item") : null;
        if (!itemEl || (e.target.closest && e.target.closest("[data-action]"))) { return; }
        lpClear();
        lpEl = itemEl; lpStartX = e.clientX; lpStartY = e.clientY; lpFired = false;
        itemEl.classList.add("is-pressing");
        lpTimer = setTimeout(function () {
          lpFired = true;
          var id = itemEl.getAttribute("data-id");
          itemEl.classList.remove("is-pressing");
          toggleFavorite(id);
        }, LONG_PRESS_MS);
      });
      listEl.addEventListener("pointermove", function (e) {
        if (!lpEl) { return; }
        if (Math.abs(e.clientX - lpStartX) > LONG_PRESS_MOVE_TOLERANCE || Math.abs(e.clientY - lpStartY) > LONG_PRESS_MOVE_TOLERANCE) {
          lpClear();
        }
      });
      ["pointerup", "pointercancel", "pointerleave"].forEach(function (evt) {
        listEl.addEventListener(evt, function () { lpClear(); });
      });
      // A long-press that already toggled the favorite shouldn't also fire the
      // trailing click as if it were a normal tap on the card.
      listEl.addEventListener("click", function (e) {
        if (lpFired && !(e.target.closest && e.target.closest("[data-action]"))) {
          lpFired = false;
          e.stopImmediatePropagation();
          e.preventDefault();
        }
      }, true);

      renderCats();
      renderList();

      // Requirement 3: on every load of this tab, check whether the persistent JSON file has
      // data that localStorage doesn't (e.g. right after the extension was reinstalled/updated
      // and localStorage came back empty) and restore it automatically.
      ExprFile.restoreIfNeeded(catData, function (restored) {
        catData = restored;
        renderCats();
        renderList();
        toast("Restored saved expressions from your backup file.");
      });

      wrap.querySelector("#expr-clear-form").addEventListener("click", function () {
        editingId = null; nameInput.value = ""; codeInput.value = "";
      });

      wrap.querySelector("#expr-clear-code").addEventListener("click", function () {
        codeInput.value = ""; codeInput.focus();
      });

      wrap.querySelector("#expr-copy").addEventListener("click", function () {
        var code = codeInput.value;
        if (!code) { toast("Nothing to copy yet.", true); return; }
        var done = function () { toast("Code copied."); };
        var fail = function () {
          // Fallback for CEF builds without the async Clipboard API: select + execCommand.
          try {
            codeInput.focus(); codeInput.select();
            if (document.execCommand("copy")) { done(); } else { toast("Couldn't copy.", true); }
          } catch (e2) { toast("Couldn't copy.", true); }
        };
        try {
          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(code).then(done, fail);
          } else {
            fail();
          }
        } catch (e) { fail(); }
      });

      wrap.querySelector("#expr-save").addEventListener("click", function () {
        var name = nameInput.value.trim(), code = codeInput.value;
        if (!name) { toast("Give the snippet a name first.", true); return; }
        if (!code.trim()) { toast("The snippet is empty.", true); return; }

        var cat = exprCatStore.activeCat(catData);
        if (editingId) {
          var idx = -1;
          for (var i = 0; i < cat.items.length; i++) { if (cat.items[i].id === editingId) { idx = i; break; } }
          if (idx !== -1) { cat.items[idx].name = name; cat.items[idx].code = code; }
        } else {
          cat.items.push({ id: "s" + Date.now() + Math.floor(Math.random() * 1000), name: name, code: code });
        }
        exprCatStore.save(catData);
        // Requirement 1: expression snippets only ever lived in localStorage - this also drops a
        // real .jsx copy into the Documents backup folder. Best-effort and silent.
        if (Node) { Node.backupWrite(code, "Expressions", name, ".jsx"); }
        renderList();
        editingId = null; nameInput.value = ""; codeInput.value = "";
        toast("Snippet saved.");
      });

      wrap.querySelector("#expr-apply-current").addEventListener("click", function (e) {
        var code = codeInput.value;
        if (!code.trim()) { toast("Write or load a snippet first.", true); return; }
        applyCode(code, e.target);
      });

      function applyCode(code, btn) {
        if (btn) { btn.classList.add("is-pending"); }
        Bridge.call("EXPR_applyCode", [code]).then(function (res) {
          if (btn) { flashButtonResult(btn, !!res.ok); }
          toast(res.message || (res.ok ? "Applied." : "Something went wrong."), !res.ok);
        });
      }

      var confirmTimer = 0, CONFIRM_MS = 3000;
      function disarmAll() {
        clearTimeout(confirmTimer);
        Array.prototype.forEach.call(listEl.querySelectorAll(".preset-del.is-confirm"), function (b) {
          b.classList.remove("is-confirm");
          b.innerHTML = iconSvg("delete");
          b.title = "Delete";
        });
      }
      function arm(btn) {
        disarmAll();
        btn.classList.add("is-confirm");
        btn.textContent = "Delete?";
        btn.title = "Click again to permanently delete this snippet";
        confirmTimer = setTimeout(disarmAll, CONFIRM_MS);
      }

      listEl.addEventListener("click", function (e) {
        var btn = e.target.closest ? e.target.closest("[data-action]") : null;
        if (!btn) { return; }
        var itemEl = btn.closest(".expr-item");
        var id = itemEl.getAttribute("data-id");
        var cat = exprCatStore.activeCat(catData);
        var item = null;
        for (var i = 0; i < cat.items.length; i++) { if (cat.items[i].id === id) { item = cat.items[i]; break; } }
        if (!item) { return; }

        var action = btn.getAttribute("data-action");
        if (action === "pin") {
          Shortcutz.pinExpr({ name: item.name, code: item.code });
        } else if (action === "apply") {
          disarmAll();
          applyCode(item.code, btn);
        } else if (action === "edit") {
          disarmAll();
          editingId = item.id;
          nameInput.value = item.name;
          codeInput.value = item.code;
          nameInput.focus();
        } else if (action === "delete") {
          if (!btn.classList.contains("is-confirm")) { arm(btn); return; }   // 1st click: arm, don't delete yet
          disarmAll();                                                       // 2nd click within 3s: actually delete
          cat.items = cat.items.filter(function (it) { return it.id !== id; });
          exprCatStore.save(catData);
          renderList();
          if (editingId === id) { editingId = null; nameInput.value = ""; codeInput.value = ""; }
        }
      });

      return wrap;
    }
  };

  // ---------------------------------------------------------
  // Save Frame: remembered folder + silent save
  // The folder path lives in localStorage ("mtx.lastSavedDirectory" via Store). The icon on each button
  // opens the folder picker (ExtendScript Folder dialog); the main part of the button saves silently
  // into the remembered folder and only opens the picker first when there is none yet (or it vanished).
  // ---------------------------------------------------------
  var SaveFrame = {
    KEY: "lastSavedDirectory",
    busy: false,

    getDir: function () { var d = Store.get(this.KEY); return (d && d.length) ? d : null; },
    setDir: function (p) { Store.set(this.KEY, p); },
    clearDir: function () { Store.remove(this.KEY); },

    // "C:\Users\me\Pictures\Frames" -> "…/Pictures/Frames" (full path stays in the tooltip)
    shortPath: function (p) {
      var parts = String(p).replace(/[\\\/]+$/, "").split(/[\\\/]/).filter(function (x) { return x.length; });
      if (!parts.length) { return String(p); }
      return parts.length > 2 ? "\u2026/" + parts.slice(-2).join("/") : parts.join("/");
    },

    // Change Directory: opens the picker (at the previous folder), stores the result.
    // Resolves {ok, message, path?, cancelled?}
    changeDirectory: function () {
      var self = this;
      return Bridge.call("TOOLS_chooseSaveFolder", [this.getDir()]).then(function (res) {
        var path = res && res.data && res.data.path;
        if (path) {
          self.setDir(path);
          return { ok: true, path: path, message: 'Save folder set to "' + path + '".' };
        }
        return { ok: !!(res && res.ok), cancelled: true, message: (res && res.message) || "Cancelled." };
      });
    },

    // Auto-Save: silent save into the remembered folder; asks for a folder first if there is none.
    autoSave: function (format, retried) {
      var self = this, dir = this.getDir();

      if (!dir) {
        return this.changeDirectory().then(function (r) { return r.path ? self.autoSave(format, true) : r; });
      }
      return Bridge.call("TOOLS_saveFrame", [format, dir]).then(function (res) {
        // The remembered folder was deleted / is on a drive that is gone: forget it and ask once more.
        if (res && res.ok === false && res.code === "NO_FOLDER" && !retried) {
          self.clearDir();
          return self.changeDirectory().then(function (r) {
            return r.path ? self.autoSave(format, true) : { ok: false, message: res.message };
          });
        }
        return res;
      });
    }
  };

  // ---------------------------------------------------------
  // Tools tab (Save Frame, Export GIF, Split Text, Stagger, Pre-compose, Unprecompose, Match Comp, Trim, Optimize)
  // ---------------------------------------------------------
  var UtilityTools = {
    render: function () {
      var wrap = document.createElement("div");
      wrap.className = "ta"; // reuse the same vertical section layout as Text Animation

      // One split button: the main part auto-saves in this format, the folder icon changes the save folder.
      function splitButton(fmt, label) {
        return '<div class="split-btn">' +
          '<button class="split-main" type="button" data-frame-action="save" data-format="' + fmt + '" title="Save the current frame as ' + label + '">Save as ' + label + '</button>' +
          '<button class="split-icon" type="button" data-frame-action="folder" data-format="' + fmt + '" title="Change save folder" aria-label="Change save folder">' +
            '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H9l2 2.2h7.5A2.5 2.5 0 0 1 21 9.7v7.8a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17.5z"/></svg>' +
          '</button>' +
        '</div>';
      }

      wrap.innerHTML =
        '<div class="ta-section">' +
          '<h2 class="ta-title">Save Frame as Image</h2>' +
          '<p class="field-note">Saves the frame at the current time indicator as a still image, without asking. The folder icon sets where files go; you are asked once, then it is remembered.</p>' +
          '<div class="split-row">' + splitButton("png", "PNG") + splitButton("jpg", "JPG") + '</div>' +
          '<p class="field-note save-dir" id="save-dir"></p>' +
        '</div>' +

        // ===================== Export GIF =====================
        // Settings -> js/mt-gif.js (PNG sequence rendered by host.jsx TOOLS_gifRender, encoded to .gif in the panel).
        '<div class="ta-section">' +
          '<h2 class="ta-title">Export GIF</h2>' +
          '<p class="field-note">Renders the active composition as an animated GIF. After Effects is busy while it renders, then the panel encodes the file. The save folder is shared with Save Frame.</p>' +
          '<span class="gif-label">Range</span>' +
          '<div class="chips">' +
            '<label class="chip"><input type="radio" name="gif-range" value="work" checked><span>Work Area</span></label>' +
            '<label class="chip"><input type="radio" name="gif-range" value="comp"><span>Entire Comp</span></label>' +
          '</div>' +
          '<div class="param">' +
            '<label for="gif-width">Width (px)</label>' +
            '<input class="num" type="number" id="gif-width" min="16" max="4096" step="10" value="480">' +
          '</div>' +
          '<div class="param">' +
            '<label for="gif-fps">Frame rate (fps)</label>' +
            '<input class="num" type="number" id="gif-fps" min="1" max="50" step="1" value="15">' +
          '</div>' +
          '<span class="gif-label">Colors</span>' +
          '<div class="chips chips-3">' +
            '<label class="chip"><input type="radio" name="gif-colors" value="256" checked><span>256</span></label>' +
            '<label class="chip"><input type="radio" name="gif-colors" value="128"><span>128</span></label>' +
            '<label class="chip"><input type="radio" name="gif-colors" value="64"><span>64</span></label>' +
          '</div>' +
          '<span class="gif-label">Background</span>' +
          '<div class="chips chips-3">' +
            '<label class="chip"><input type="radio" name="gif-bg" value="transparent" checked><span>Transparent</span></label>' +
            '<label class="chip"><input type="radio" name="gif-bg" value="white"><span>White</span></label>' +
            '<label class="chip"><input type="radio" name="gif-bg" value="black"><span>Black</span></label>' +
          '</div>' +
          '<label class="switch-row" for="gif-loop"><span>Loop forever</span><input type="checkbox" id="gif-loop" checked><span class="switch-track"></span></label>' +
          '<label class="switch-row" for="gif-dither"><span>Dither (smoother gradients, bigger file)</span><input type="checkbox" id="gif-dither"><span class="switch-track"></span></label>' +
          '<label class="switch-row" for="gif-optimize"><span>Optimize file size</span><input type="checkbox" id="gif-optimize" checked><span class="switch-track"></span></label>' +
          '<p class="field-note">Transparent GIFs only support fully on/off pixels (no soft edges), and "Optimize file size" is skipped for them.</p>' +
          '<div class="gif-progress" id="gif-progress" hidden>' +
            '<div class="gif-progress-bar"><span class="gif-progress-fill" id="gif-progress-fill"></span></div>' +
            '<p class="field-note gif-progress-text" id="gif-progress-text"></p>' +
          '</div>' +
          '<div class="split-btn" id="gif-split">' +
            '<button class="split-main" type="button" data-gif-action="export" id="gif-main" title="Render and save the composition as a GIF">Export GIF</button>' +
            '<button class="split-icon" type="button" data-gif-action="folder" title="Change save folder" aria-label="Change save folder">' +
              '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H9l2 2.2h7.5A2.5 2.5 0 0 1 21 9.7v7.8a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17.5z"/></svg>' +
            '</button>' +
          '</div>' +
          '<p class="field-note save-dir" id="gif-dir"></p>' +
        '</div>' +

        '<div class="ta-section">' +
          '<h2 class="ta-title">Split Text</h2>' +
          '<p class="field-note">Splits the selected text layer(s) into separate layers, one per character or word, keeping their on-screen position. The original layer is disabled, not deleted.</p>' +
          '<div class="chips">' +
            '<label class="chip"><input type="radio" name="split-mode" value="char" checked><span>Character</span></label>' +
            '<label class="chip"><input type="radio" name="split-mode" value="word"><span>Word</span></label>' +
          '</div>' +
          '<button class="btn-apply" data-tool-action="split-text">Split Text</button>' +
        '</div>' +

        '<div class="ta-section">' +
          '<h2 class="ta-title">Stagger / Sequence Layers</h2>' +
          '<p class="field-note">Offsets each selected layer\'s start time sequentially by a set number of frames.</p>' +
          '<div class="param">' +
            '<label for="stagger-offset">Offset (frames)</label>' +
            '<input class="num" type="number" id="stagger-offset" min="0" max="240" step="1" value="2">' +
          '</div>' +
          '<div class="chips">' +
            '<label class="chip"><input type="radio" name="stagger-order" value="top-down" checked><span>Top &rarr; Bottom</span></label>' +
            '<label class="chip"><input type="radio" name="stagger-order" value="bottom-up"><span>Bottom &rarr; Top</span></label>' +
          '</div>' +
          '<button class="btn-apply" data-tool-action="stagger">Stagger Layers</button>' +
        '</div>' +

        '<div class="ta-section">' +
          '<h2 class="ta-title">Auto Morph</h2>' +
          '<p class="field-note">Select two shape layers. The upper one morphs into the lower one: its path (and fill / stroke colors) are keyframed from the playhead. Paths with different vertex counts are matched automatically. Rectangle, Ellipse and Star shapes need Convert to Bezier Path first.</p>' +
          '<div class="param">' +
            '<label for="morph-frames">Duration (frames)</label>' +
            '<input class="num" type="number" id="morph-frames" min="1" max="600" step="1" value="20">' +
          '</div>' +
          '<label class="switch-row" for="morph-ease"><span>Easy Ease</span><input type="checkbox" id="morph-ease" checked><span class="switch-track"></span></label>' +
          '<label class="switch-row" for="morph-hide"><span>Hide the lower layer afterward</span><input type="checkbox" id="morph-hide" checked><span class="switch-track"></span></label>' +
          '<button class="btn-apply" data-tool-action="automorph">Auto Morph</button>' +
        '</div>' +

        '<div class="ta-section">' +
          '<h2 class="ta-title">Pre-compose</h2>' +
          '<p class="field-note"><strong>Each Layer:</strong> wraps every selected layer into its own new composition, one by one. <strong>Together:</strong> wraps all selected layers into ONE composition. Each new comp is trimmed to the time span of its layers, like the native "Adjust composition duration" option.</p>' +
          '<label class="chip chip-solo"><input type="checkbox" id="precomp-move-attrs" checked><span>Move all attributes</span></label>' +
          '<div class="btn-pair">' +
            '<button class="btn-apply" data-tool-action="precompose" title="Each selected layer becomes its own pre-comp">Each Layer</button>' +
            '<button class="btn-apply" data-tool-action="precompose-together" title="All selected layers go into one pre-comp">Together</button>' +
          '</div>' +
        '</div>' +

        '<div class="ta-section">' +
          '<h2 class="ta-title">Unprecompose</h2>' +
          '<p class="field-note">Extracts every layer inside the selected pre-comp back into this composition, timed to where the pre-comp sat. The pre-comp layer is disabled, not deleted.</p>' +
          '<div class="chips">' +
            '<label class="chip"><input type="radio" name="unpre-mode" value="copy" checked><span>Copy Attributes</span></label>' +
            '<label class="chip"><input type="radio" name="unpre-mode" value="delete"><span>Delete Attributes</span></label>' +
          '</div>' +
          '<p class="field-note"><strong>Copy:</strong> the pre-comp\'s transform is merged into each extracted layer and its effects are copied onto them. <strong>Delete:</strong> the pre-comp\'s effects, masks and transform are discarded, so the layers come out raw. (2D transforms only; Stretch %/time remap isn\'t compensated for.)</p>' +
          '<button class="btn-apply" data-tool-action="unprecompose">Unprecompose Selected Layer</button>' +
        '</div>' +

        '<div class="ta-section">' +
          '<h2 class="ta-title">Duplicate Precomp (Deep)</h2>' +
          '<p class="field-note">Duplicates each selected pre-comp layer as a new layer on the timeline (effects, masks and transform are copied too). The new layer uses its own copy of the pre-comp <strong>and every pre-comp inside it</strong>, so you can edit the inside without changing the original. The original layer and comps stay untouched. Footage is still shared. Expressions like comp("Name") still point to the old comp.</p>' +
          '<label class="chip chip-solo"><input type="checkbox" id="dupdeep-folder" checked><span>Put copies in a "Deep Copies" folder</span></label>' +
          '<button class="btn-apply" data-tool-action="duplicate-precomp-deep">Duplicate Pre-comp Layer</button>' +
        '</div>' +

        '<div class="ta-section">' +
          '<h2 class="ta-title">Trim to Playhead</h2>' +
          '<p class="field-note">Trims the In or Out point of selected layers to the current time indicator.</p>' +
          '<div class="chips">' +
            '<label class="chip"><input type="radio" name="trim-edge" value="in" checked><span>In Point</span></label>' +
            '<label class="chip"><input type="radio" name="trim-edge" value="out"><span>Out Point</span></label>' +
          '</div>' +
          '<button class="btn-apply" data-tool-action="trim">Trim to Playhead</button>' +
        '</div>' +

        '<div class="ta-section">' +
          '<h2 class="ta-title">Optimize AE</h2>' +
          '<p class="field-note">Purges all memory and disk cache and can lower the active comp\'s preview resolution, so the project feels lighter. Purging may also clear the undo history, so save first.</p>' +
          '<div class="chips chips-3">' +
            '<label class="chip"><input type="radio" name="optimize-res" value="keep"><span>Keep</span></label>' +
            '<label class="chip"><input type="radio" name="optimize-res" value="half"><span>Half</span></label>' +
            '<label class="chip"><input type="radio" name="optimize-res" value="quarter" checked><span>Quarter</span></label>' +
          '</div>' +
          '<button class="btn-apply" data-tool-action="optimize">Optimize AE (Purge)</button>' +
        '</div>' +

        // ===================== Batch Rename + Smart Color Coder =====================
        // Backend: host.jsx TOOLS_batchRename(opts) and TOOLS_autoColorCode(scope).
        '<div class="ta-section">' +
          '<h2 class="ta-title">Batch Rename Layers</h2>' +
          '<p class="field-note">Renames the selected layers, top to bottom. Find &amp; Replace is literal text (no regex). Numbering replaces the name with Base + number.</p>' +
          '<div class="param"><label for="br-find">Find</label><input class="text-input" type="text" id="br-find" autocomplete="off" spellcheck="false"></div>' +
          '<div class="param"><label for="br-replace">Replace</label><input class="text-input" type="text" id="br-replace" autocomplete="off" spellcheck="false"></div>' +
          '<div class="param"><label for="br-prefix">Prefix</label><input class="text-input" type="text" id="br-prefix" autocomplete="off" spellcheck="false"></div>' +
          '<div class="param"><label for="br-suffix">Suffix</label><input class="text-input" type="text" id="br-suffix" autocomplete="off" spellcheck="false"></div>' +
          '<label class="switch-row" for="br-seq"><span>Numbering</span><input type="checkbox" id="br-seq"><span class="switch-track"></span></label>' +
          '<div class="br-seq-fields" id="br-seq-fields" hidden>' +
            '<div class="param"><label for="br-base">Base name</label><input class="text-input" type="text" id="br-base" placeholder="Layer" autocomplete="off" spellcheck="false"></div>' +
            '<div class="param"><label for="br-start">Start at</label><input class="num" type="number" id="br-start" min="0" max="9999" step="1" value="1"></div>' +
            '<div class="param"><label for="br-digits">Digits</label><input class="num" type="number" id="br-digits" min="1" max="6" step="1" value="2"></div>' +
          '</div>' +
          '<button class="btn-apply" data-tool-action="batch-rename">Rename Layers</button>' +
        '</div>' +

        '<div class="ta-section">' +
          '<h2 class="ta-title">Smart Layer Color Coder</h2>' +
          '<p class="field-note">Sets the layer label color by type: Shape = Blue, Text = Yellow, Audio only = Green, Adjustment = Purple. Other layers are left as they are.</p>' +
          '<div class="chips">' +
            '<label class="chip"><input type="radio" name="acc-scope" value="selected" checked><span>Selected</span></label>' +
            '<label class="chip"><input type="radio" name="acc-scope" value="all"><span>Whole Comp</span></label>' +
          '</div>' +
          '<button class="btn-apply" data-tool-action="auto-color">Color-Code Layers</button>' +
        '</div>' +

        // ===================== Randomize Transform =====================
        // Backend: host.jsx SHTZ_randomize(what, a, b). Static values only (layers whose property has keyframes are skipped).
        '<div class="ta-section">' +
          '<h2 class="ta-title">Randomize Transform</h2>' +
          '<p class="field-note" id="rnd-note">Offsets each selected layer by a random amount, so copies do not look identical. Layers whose value is animated are skipped.</p>' +
          '<div class="chips chips-4">' +
            '<label class="chip"><input type="radio" name="rnd-what" value="position" checked><span>Position</span></label>' +
            '<label class="chip"><input type="radio" name="rnd-what" value="rotation"><span>Rotation</span></label>' +
            '<label class="chip"><input type="radio" name="rnd-what" value="scale"><span>Scale</span></label>' +
            '<label class="chip"><input type="radio" name="rnd-what" value="opacity"><span>Opacity</span></label>' +
          '</div>' +
          '<div class="param"><label for="rnd-a" id="rnd-a-label">Amount (px, plus or minus)</label><input class="num" type="number" id="rnd-a" min="0" max="10000" step="1" value="100"></div>' +
          '<div class="param" id="rnd-b-row" hidden><label for="rnd-b">Maximum (%)</label><input class="num" type="number" id="rnd-b" min="0" max="10000" step="1" value="120"></div>' +
          '<button class="btn-apply" data-tool-action="randomize">Randomize</button>' +
        '</div>' +

        // ===================== Project Cleaner & Sanitizer =====================
        // Relocated here from the (removed) Power Workflow Boosters tab - same markup and
        // same Bridge call (TOOLS_projectCleanup), styled via the shared .beat-card class so
        // it keeps the standard panel surface + animated saber border, like every other boxed
        // card in this tab (e.g. Beat Marker below).
        '<div class="ta-section">' +
          '<div class="beat-card">' +
            '<h3 class="ta-title ta-title-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/></svg><span>Project Cleaner &amp; Sanitizer</span></h3>' +
            '<p class="beat-card-note">Check only what you want, then run. This edits the Project panel itself - save your project first.</p>' +
            '<label class="switch-row" for="pc-clean-unused"><span>Remove Unused Footage</span><input type="checkbox" id="pc-clean-unused" checked><span class="switch-track"></span></label>' +
            '<label class="switch-row" for="pc-clean-dupes"><span>Consolidate Duplicate Footage</span><input type="checkbox" id="pc-clean-dupes" checked><span class="switch-track"></span></label>' +
            '<label class="switch-row" for="pc-clean-folders"><span>Delete Empty Folders</span><input type="checkbox" id="pc-clean-folders" checked><span class="switch-track"></span></label>' +
            '<label class="switch-row" for="pc-clean-purge"><span>Purge Memory &amp; Disk Cache</span><input type="checkbox" id="pc-clean-purge"><span class="switch-track"></span></label>' +
            '<button class="btn-apply" data-tool-action="cleanup">Run Cleanup</button>' +
          '</div>' +
        '</div>' +

        '<div class="ta-section">' +
          '<div class="beat-card">' +
            '<h2 class="ta-title ta-title-icon">' +
              '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>' +
              '<span>Beat Marker</span>' +
            '</h2>' +
            '<p class="beat-card-note">Note: Markers rely on audio waveform peaks and may not perfectly match the beat.</p>' +
            '<div class="param">' +
              '<label for="beat-threshold">Threshold</label>' +
              '<input class="num" type="number" id="beat-threshold" min="1" max="100" step="1" value="25">' +
            '</div>' +
            '<label class="switch-row beat-target-row" for="beat-target-comp">' +
              '<span>Layer</span>' +
              '<input type="checkbox" id="beat-target-comp">' +
              '<span class="switch-track"></span>' +
              '<span>Comp</span>' +
            '</label>' +
            '<button class="btn-apply" data-tool-action="audioToKeyframes">Generate</button>' +
          '</div>' +
        '</div>';

      (function () {
        var RND = {
          position: { a: "Amount (px, plus or minus)", av: 100, range: false },
          rotation: { a: "Amount (degrees, plus or minus)", av: 15, range: false },
          scale: { a: "Minimum (%)", av: 80, b: "Maximum (%)", bv: 120, range: true },
          opacity: { a: "Minimum (%)", av: 40, b: "Maximum (%)", bv: 100, range: true }
        };
        var rndChips = wrap.querySelectorAll('input[name="rnd-what"]'), ri;
        function rndSync(kind) {
          var c = RND[kind], bRow = wrap.querySelector("#rnd-b-row");
          if (!c || !bRow) { return; }
          wrap.querySelector("#rnd-a-label").textContent = c.a;
          wrap.querySelector("#rnd-a").value = c.av;
          bRow.hidden = !c.range;
          if (c.range) { wrap.querySelector('label[for="rnd-b"]').textContent = c.b; wrap.querySelector("#rnd-b").value = c.bv; }
        }
        for (ri = 0; ri < rndChips.length; ri++) { rndChips[ri].addEventListener("change", function (e) { if (e.target.checked) { rndSync(e.target.value); } }); }
      })();

      (function () {
        var seqBox = wrap.querySelector("#br-seq"), seqFields = wrap.querySelector("#br-seq-fields");
        if (seqBox && seqFields) { seqBox.addEventListener("change", function () { seqFields.hidden = !seqBox.checked; }); }
      })();

      Array.prototype.forEach.call(wrap.querySelectorAll("[data-tool-action]"), function (btn) {
        btn.addEventListener("click", function () {
          if (btn.classList.contains("is-pending")) { return; }
          btn.classList.add("is-pending");

          var action = btn.getAttribute("data-tool-action");
          var call;

          if (action === "split-text") {
            var mode = wrap.querySelector('input[name="split-mode"]:checked').value;
            call = Bridge.call("TOOLS_splitText", [mode]);
          } else if (action === "stagger") {
            var offset = parseInt(wrap.querySelector("#stagger-offset").value, 10);
            if (!isFinite(offset) || offset < 0) { offset = 0; }
            var order = wrap.querySelector('input[name="stagger-order"]:checked').value;
            call = Bridge.call("TOOLS_stagger", [offset, order]);
          } else if (action === "automorph") {
            var morphFrames = parseInt(wrap.querySelector("#morph-frames").value, 10);
            if (!isFinite(morphFrames) || morphFrames < 1) { morphFrames = 20; }
            call = Bridge.call("TOOLS_autoMorph", [morphFrames, wrap.querySelector("#morph-ease").checked, wrap.querySelector("#morph-hide").checked]);
          } else if (action === "precompose") {
            var moveAttrs = wrap.querySelector("#precomp-move-attrs").checked;
            call = Bridge.call("TOOLS_precomposeEach", [moveAttrs]);
          } else if (action === "precompose-together") {
            call = Bridge.call("TOOLS_precomposeTogether", [wrap.querySelector("#precomp-move-attrs").checked]);
          } else if (action === "duplicate-precomp-deep") {
            call = Bridge.call("TOOLS_duplicatePrecompDeep", [wrap.querySelector("#dupdeep-folder").checked]);
          } else if (action === "trim") {
            var edge = wrap.querySelector('input[name="trim-edge"]:checked').value;
            call = Bridge.call("TOOLS_trimToPlayhead", [edge]);
          } else if (action === "unprecompose") {
            var attrMode = wrap.querySelector('input[name="unpre-mode"]:checked').value;
            call = Bridge.call("TOOLS_unprecompose", [attrMode]);
          } else if (action === "optimize") {
            var optRes = wrap.querySelector('input[name="optimize-res"]:checked').value;
            call = Bridge.call("TOOLS_optimizeAE", [optRes]);
          } else if (action === "audioToKeyframes") {
            var threshold = parseInt(wrap.querySelector("#beat-threshold").value, 10);
            if (!isFinite(threshold)) { threshold = 25; }
            if (threshold < 1) { threshold = 1; }
            if (threshold > 100) { threshold = 100; }
            var markerTarget = wrap.querySelector("#beat-target-comp").checked ? "comp" : "layer";
            call = Bridge.call("TOOLS_convertAudioToKeyframes", [threshold, markerTarget]);
          } else if (action === "batch-rename") {
            var brSeq = wrap.querySelector("#br-seq").checked;
            call = Bridge.call("TOOLS_batchRename", [{
              find: wrap.querySelector("#br-find").value,
              replace: wrap.querySelector("#br-replace").value,
              prefix: wrap.querySelector("#br-prefix").value,
              suffix: wrap.querySelector("#br-suffix").value,
              seq: {
                enabled: brSeq,
                base: wrap.querySelector("#br-base").value,
                start: parseInt(wrap.querySelector("#br-start").value, 10),
                digits: parseInt(wrap.querySelector("#br-digits").value, 10)
              }
            }]);
          } else if (action === "randomize") {
            var rndWhat = wrap.querySelector('input[name="rnd-what"]:checked').value;
            call = Bridge.call("SHTZ_randomize", [rndWhat, parseFloat(wrap.querySelector("#rnd-a").value), parseFloat(wrap.querySelector("#rnd-b").value)]);
          } else if (action === "auto-color") {
            call = Bridge.call("TOOLS_autoColorCode", [wrap.querySelector('input[name="acc-scope"]:checked').value]);
          } else if (action === "cleanup") {
            call = Bridge.call("TOOLS_projectCleanup", [{
              removeUnused: wrap.querySelector("#pc-clean-unused").checked,
              consolidateDuplicates: wrap.querySelector("#pc-clean-dupes").checked,
              deleteEmptyFolders: wrap.querySelector("#pc-clean-folders").checked,
              purgeCache: wrap.querySelector("#pc-clean-purge").checked
            }]);
          }

          call.then(function (res) {
            flashButtonResult(btn, !!res.ok);
            toast(res.message || (res.ok ? "Done." : "Something went wrong."), !res.ok);
          });
        });
      });

      // Feature B (collapsible ".ta-group" capsule cards for this tab's 8 stacked sections -
      // Save Frame, Split Text, Stagger, Pre-compose, Unprecompose, Trim, Optimize, Beat Marker)
      // now runs centrally from showTab() in the main tab-switch dispatcher, once every tab's
      // render() has returned and been appended - see the comment there. No longer called here.

      // ---- Save Frame split buttons (main = auto-save, icon = change directory) ----
      var dirNote = wrap.querySelector("#save-dir");
      function refreshDirNote() {
        var d = SaveFrame.getDir();
        dirNote.textContent = d ? "Saving to " + SaveFrame.shortPath(d) : "No save folder yet. Click a button to choose one.";
        dirNote.title = d || "";
        refreshGifDirNote();
      }
      refreshDirNote();

      Array.prototype.forEach.call(wrap.querySelectorAll("[data-frame-action]"), function (btn) {
        btn.addEventListener("click", function () {
          if (SaveFrame.busy) { return; }                       // one job at a time (the picker and the render both block AE)
          var box = btn.parentNode;
          var action = btn.getAttribute("data-frame-action");
          var format = btn.getAttribute("data-format");

          function finish(res) {
            SaveFrame.busy = false;
            box.classList.remove("is-loading");
            refreshDirNote();
            if (res) { toast(res.message || (res.ok ? "Done." : "Something went wrong."), !res.ok); }
          }

          SaveFrame.busy = true;
          box.classList.add("is-loading");
          (action === "folder" ? SaveFrame.changeDirectory() : SaveFrame.autoSave(format))
            .then(finish, function (err) { finish({ ok: false, message: String(err) }); });
        });
      });

      // ---- Export GIF ----
      // Flow: pick/confirm the save folder -> TOOLS_gifRender (AE renders the PNG sequence) -> MTGif.exportFolder
      // (palette + LZW, written to disk) -> temp folder removed. While encoding the main button becomes "Cancel".
      var GIF_KEY = "gifOptions";
      var gifSplit = wrap.querySelector("#gif-split");
      var gifMain = wrap.querySelector("#gif-main");
      var gifDirNote = wrap.querySelector("#gif-dir");
      var gifProg = wrap.querySelector("#gif-progress");
      var gifFill = wrap.querySelector("#gif-progress-fill");
      var gifText = wrap.querySelector("#gif-progress-text");
      var gifJob = null, gifRunning = false;

      function refreshGifDirNote() {
        if (!gifDirNote) { return; }
        var d = SaveFrame.getDir();
        gifDirNote.textContent = d ? "Saving to " + SaveFrame.shortPath(d) : "No save folder yet. Click Export GIF to choose one.";
        gifDirNote.title = d || "";
      }
      refreshGifDirNote();

      function gifRadio(name) { var el = wrap.querySelector('input[name="' + name + '"]:checked'); return el ? el.value : ""; }
      function gifClamp(v, lo, hi, def) { v = parseFloat(v); if (!isFinite(v)) { v = def; } return Math.min(hi, Math.max(lo, Math.round(v))); }

      function gifReadOptions() {
        return {
          range: gifRadio("gif-range") === "comp" ? "comp" : "work",
          width: gifClamp(wrap.querySelector("#gif-width").value, 16, 4096, 480),
          fps: gifClamp(wrap.querySelector("#gif-fps").value, 1, 50, 15),
          colors: gifClamp(gifRadio("gif-colors"), 64, 256, 256),
          background: gifRadio("gif-bg") || "transparent",
          loop: wrap.querySelector("#gif-loop").checked,
          dither: wrap.querySelector("#gif-dither").checked,
          optimize: wrap.querySelector("#gif-optimize").checked
        };
      }

      // Remember the choices between sessions
      function gifApplyOptions(o) {
        function pick(name, val) {
          var el = wrap.querySelector('input[name="' + name + '"][value="' + val + '"]');
          if (el) { el.checked = true; }
        }
        pick("gif-range", o.range); pick("gif-colors", o.colors); pick("gif-bg", o.background);
        if (o.width) { wrap.querySelector("#gif-width").value = o.width; }
        if (o.fps) { wrap.querySelector("#gif-fps").value = o.fps; }
        if (typeof o.loop === "boolean") { wrap.querySelector("#gif-loop").checked = o.loop; }
        if (typeof o.dither === "boolean") { wrap.querySelector("#gif-dither").checked = o.dither; }
        if (typeof o.optimize === "boolean") { wrap.querySelector("#gif-optimize").checked = o.optimize; }
      }
      try { var savedGif = JSON.parse(Store.get(GIF_KEY) || "null"); if (savedGif) { gifApplyOptions(savedGif); } } catch (eGifLoad) { }
      Array.prototype.forEach.call(wrap.querySelectorAll("#gif-width, #gif-fps, #gif-loop, #gif-dither, #gif-optimize, input[name^='gif-']"), function (el) {
        el.addEventListener("change", function () { try { Store.set(GIF_KEY, JSON.stringify(gifReadOptions())); } catch (e) { } });
      });

      function gifShow(on) { gifProg.hidden = !on; if (!on) { gifFill.style.transform = "scaleX(0)"; } }
      function gifProgress(frac, text) {
        gifFill.style.transform = "scaleX(" + Math.max(0, Math.min(1, frac)) + ")";
        if (text) { gifText.textContent = text; }
      }
      function gifFormatSize(bytes) { return bytes >= 1048576 ? (bytes / 1048576).toFixed(2) + " MB" : Math.max(1, Math.round(bytes / 1024)) + " KB"; }

      function gifFinish(res, cancelled) {
        gifRunning = false; gifJob = null; SaveFrame.busy = false;
        gifSplit.classList.remove("is-working");
        gifMain.textContent = "Export GIF";
        gifShow(false);
        refreshDirNote();
        if (cancelled) { toast("GIF export cancelled."); return; }
        flashButtonResult(gifMain, !!res.ok);
        toast(res.message || (res.ok ? "Done." : "Something went wrong."), !res.ok);
      }

      // Resolves the save folder, asking once when there is none (or it vanished).
      function gifEnsureDir() {
        var d = SaveFrame.getDir();
        if (d && MTGif.dirExists(d)) { return Promise.resolve(d); }
        if (d) { SaveFrame.clearDir(); }
        return SaveFrame.changeDirectory().then(function (r) { return r.path || null; });
      }

      function gifExport() {
        if (gifRunning) { if (gifJob) { gifJob.cancel(); } return; }     // 2nd click while encoding = cancel
        if (SaveFrame.busy) { return; }
        if (!window.MTGif || !MTGif.available()) { toast("GIF export needs Node.js, which is not available in this panel.", true); return; }

        SaveFrame.busy = true;
        gifRunning = true;
        gifSplit.classList.add("is-working");
        var o = gifReadOptions();
        var tmpDir = null;

        gifEnsureDir().then(function (dir) {
          if (!dir) { gifFinish(null, true); return null; }
          gifShow(true);
          gifProgress(0.04, "Rendering frames in After Effects. The panel pauses until this finishes\u2026");
          // let the progress bar paint before the (blocking) render call starts
          return new Promise(function (r) { setTimeout(r, 80); }).then(function () {
            return Bridge.call("TOOLS_gifRender", [{ range: o.range, fps: o.fps, width: o.width }]);
          }).then(function (res) {
            if (!res || !res.ok || !res.data) { gifFinish({ ok: false, message: (res && res.message) || "The render failed." }); return null; }
            var data = res.data;
            tmpDir = data.dir;
            gifMain.textContent = "Cancel";
            gifJob = MTGif.exportFolder({
              dir: data.dir, files: data.files, duration: data.duration, fps: data.fps || o.fps,
              width: Math.min(o.width, data.width || o.width), colors: o.colors, background: o.background,
              dither: o.dither, optimize: o.optimize, loop: o.loop,
              outPath: MTGif.joinPath(dir, data.safeName + "_" + data.stamp + ".gif"),
              onProgress: function (p) {
                if (p.stage === "analyze") { gifProgress(0.05 + 0.1 * (p.done / p.total), "Analyzing colors\u2026"); }
                else if (p.stage === "encode") { gifProgress(0.15 + 0.8 * (p.done / p.total), "Encoding frame " + p.done + " / " + p.total); }
                else { gifProgress(1, "Writing file\u2026"); }
              }
            });
            return gifJob.promise.then(function (r) {
              MTGif.removeDir(tmpDir);
              gifFinish({ ok: true, message: 'Saved "' + r.path.replace(/^.*[\\\/]/, "") + '" (' + gifFormatSize(r.bytes) + ", " + r.frames + " frames, " + r.width + "\u00d7" + r.height + ")." });
            }, function (err) {
              MTGif.removeDir(tmpDir);
              if (err && err.message === "Cancelled") { gifFinish(null, true); }
              else { gifFinish({ ok: false, message: "GIF export failed: " + ((err && err.message) || err) }); }
            });
          });
        }).catch(function (err) {
          if (tmpDir) { MTGif.removeDir(tmpDir); }
          gifFinish({ ok: false, message: "GIF export failed: " + ((err && err.message) || err) });
        });
      }

      Array.prototype.forEach.call(gifSplit.querySelectorAll("[data-gif-action]"), function (btn) {
        btn.addEventListener("click", function () {
          if (btn.getAttribute("data-gif-action") === "export") { gifExport(); return; }
          if (gifRunning || SaveFrame.busy) { return; }                  // picker and render both block AE
          SaveFrame.busy = true;
          SaveFrame.changeDirectory().then(function (r) {
            SaveFrame.busy = false; refreshDirNote();
            if (r) { toast(r.message || "Done.", r.ok === false && !r.cancelled); }
          }, function (err) { SaveFrame.busy = false; toast(String(err), true); });
        });
      });

      return wrap;
    }
  };

  // ---------------------------------------------------------
  // TextFlex tab: per-character/word/line text animator. The panel only collects the UI values and
  // sends them to jsx/host.jsx (TF_apply). There ONE animator ("TextFlex_Animator") is built: an
  // Expression Selector Amount expression does the stagger + bounce/ease (textIndex/textTotal only
  // exist there), and the checked animator properties get the static values typed in this tab.
  // ---------------------------------------------------------
  var ICON_IMPORT_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v11M8 10.5l4 4 4-4M4.5 16.5v2.5a1.5 1.5 0 0 0 1.5 1.5h12a1.5 1.5 0 0 0 1.5-1.5v-2.5"/></svg>';
  var ICON_REFRESH_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12a8 8 0 0 1 13.66-5.66M20 12a8 8 0 0 1-13.66 5.66M4 4v5h5M20 20v-5h-5"/></svg>';

  var TextFlex = {
    PRESET_KEY: "textflexPresets",
    last: null,         // last collected settings of this tab (kept across tab switches, see render())
    lastPreset: "",     // preset dropdown selection at that time
    snapshot: null,     // set by render(): re-reads the live fields into `last`

    readPresets: function () {
      try { return JSON.parse(Store.get(this.PRESET_KEY) || "{}") || {}; } catch (e) { return {}; }
    },
    writePresets: function (obj) { Store.set(this.PRESET_KEY, JSON.stringify(obj)); },

    // One property-selector row: a pill checkbox ("Position", "Opacity", ...) plus 1-3 small
    // coordinate number inputs (X/Y/Z, or Angle/Axis for Skew, or a single "Value" field).
    propRow: function (key, title, fields, checkedByDefault) {
      var coords = fields.map(function (f) {
        return '<label class="coord"><span>' + f.label + '</span>' +
          '<input class="num" type="number" step="1" data-axis="' + f.axis + '" value="' + f.def + '"></label>';
      }).join("");
      return '<div class="prop-row" data-prop="' + key + '">' +
        '<label class="chip chip-solo prop-chip"><input type="checkbox" class="prop-on"' + (checkedByDefault ? " checked" : "") + '><span>' + title + '</span></label>' +
        '<div class="prop-coords">' + coords + '</div>' +
      '</div>';
    },

    // Keeps a range slider and its number box mirrored both ways, clamped to [min,max].
    linkSlider: function (wrap, id, min, max) {
      var range = wrap.querySelector("#" + id), num = wrap.querySelector("#" + id + "-num");
      function clamp(v) { v = parseFloat(v); if (!isFinite(v)) { return min; } return Math.min(max, Math.max(min, v)); }
      range.addEventListener("input", function () { num.value = range.value; });
      num.addEventListener("input", function () { var v = clamp(num.value); range.value = v; });
      num.addEventListener("blur", function () { num.value = clamp(num.value); range.value = num.value; });
    },

    render: function () {
      var self = this;
      var wrap = document.createElement("div");
      wrap.className = "ta";

      function slider(id, label, def, min, max, step) {
        return '<div class="param">' +
          '<label for="' + id + '">' + label + '</label>' +
          '<input class="num" type="number" id="' + id + '-num" min="' + min + '" max="' + max + '" step="' + step + '" value="' + def + '">' +
          '<input type="range" id="' + id + '" min="' + min + '" max="' + max + '" step="' + step + '" value="' + def + '">' +
        '</div>';
      }

      wrap.innerHTML =
        '<div class="ta-section">' +
          '<h2 class="ta-title">Animation Properties</h2>' +
          '<div class="preset-bar">' +
            '<button class="btn" type="button" id="tf-preset-save">Save</button>' +
            '<select class="select" id="tf-preset-select"><option value="">Select Preset…</option></select>' +
            '<button class="icon-btn" type="button" id="tf-preset-delete" title="Delete preset" aria-label="Delete preset">' + ICON_DELETE_SVG + '</button>' +
            '<button class="icon-btn" type="button" id="tf-preset-refresh" title="Refresh preset list" aria-label="Refresh preset list">' + ICON_REFRESH_SVG + '</button>' +
          '</div>' +
          '<button class="btn tf-import" type="button" id="tf-import" title="Read the TextFlex settings from the selected text layer">' + ICON_IMPORT_SVG + '<span>Import from layer</span></button>' +
          '<div class="field field-column">' +
            '<span class="field-label">Based on</span>' +
            '<select class="select" id="tf-based-on">' +
              '<option value="characters">Characters</option>' +
              '<option value="words">Words</option>' +
              '<option value="lines">Lines</option>' +
            '</select>' +
          '</div>' +
          '<div class="field field-column">' +
            '<span class="field-label">Direction</span>' +
            '<select class="select" id="tf-direction">' +
              '<option value="ltr">Left to Right</option>' +
              '<option value="rtl">Right to Left</option>' +
              '<option value="centerOut">Center Out</option>' +
              '<option value="endsToCenter">Ends to Center</option>' +
              '<option value="random">Random</option>' +
            '</select>' +
          '</div>' +
          slider("tf-frequency", "Frequency", 4, 0, 20, 0.1) +
          slider("tf-decay", "Decay", 5, 0.1, 20, 0.1) +
          slider("tf-duration", "Duration", 2, 0.1, 10, 0.1) +
          slider("tf-delay", "Delay", 2, 0, 30, 1) +
        '</div>' +

        '<div class="ta-section">' +
          '<h2 class="ta-title">Text Properties</h2>' +
          '<div class="chips chips-3">' +
            '<label class="chip"><input type="radio" name="tf-mode" value="in" checked><span>In</span></label>' +
            '<label class="chip"><input type="radio" name="tf-mode" value="inout"><span>In/Out</span></label>' +
            '<label class="chip"><input type="radio" name="tf-mode" value="out"><span>Out</span></label>' +
          '</div>' +
          '<div class="field-actions" style="justify-content:flex-start">' +
            '<label class="chip chip-solo"><input type="checkbox" id="tf-markers"><span>Markers</span></label>' +
            '<label class="chip chip-solo"><input type="checkbox" id="tf-3d"><span>3D</span></label>' +
          '</div>' +
          '<div class="field field-column">' +
            '<span class="field-label">Motion Style</span>' +
            '<div class="chips chips-2">' +
              '<label class="chip"><input type="radio" name="tf-style" value="overshoot" checked><span>Overshoot</span></label>' +
              '<label class="chip"><input type="radio" name="tf-style" value="ease"><span>Ease</span></label>' +
            '</div>' +
          '</div>' +

          '<div class="prop-list">' +
            self.propRow("position", "Position", [{ axis: "x", label: "X", def: 0 }, { axis: "y", label: "Y", def: 30 }, { axis: "z", label: "Z", def: 0 }], true) +
            self.propRow("anchor",   "Anchor Point", [{ axis: "x", label: "X", def: 0 }, { axis: "y", label: "Y", def: 0 }, { axis: "z", label: "Z", def: 0 }], false) +
            self.propRow("rotation", "Rotation", [{ axis: "x", label: "X", def: 0 }, { axis: "y", label: "Y", def: 0 }, { axis: "z", label: "Z", def: 0 }], false) +
            self.propRow("scale",    "Scale", [{ axis: "x", label: "X", def: 0 }, { axis: "y", label: "Y", def: 0 }], false) +
            self.propRow("skew",     "Skew", [{ axis: "angle", label: "Angle", def: 0 }, { axis: "axis", label: "Axis", def: 0 }], false) +
            self.propRow("tracking", "Tracking", [{ axis: "value", label: "Amt", def: 0 }], false) +
            self.propRow("blur",     "Blur", [{ axis: "value", label: "Amt", def: 0 }], false) +
            self.propRow("opacity",  "Opacity", [{ axis: "value", label: "Val", def: 0 }], true) +
          '</div>' +

          '<div class="field-actions">' +
            '<button class="btn btn-ghost" type="button" id="tf-help">Help</button>' +
          '</div>' +
          '<button class="btn-apply" id="tf-animate">Animate</button>' +
        '</div>';

      ["tf-frequency", "tf-decay", "tf-duration", "tf-delay"].forEach(function (id) {
        var el = wrap.querySelector("#" + id);
        self.linkSlider(wrap, id, parseFloat(el.min), parseFloat(el.max));
      });

      // TextFlex keeps its own copy of every value (see "keep every value" below), so the generic FormState
      // restore must not touch these fields: it only knew about trusted input events and could overwrite newer values.
      Array.prototype.forEach.call(wrap.querySelectorAll("input, select, textarea"), function (el) { el.setAttribute("data-no-restore", ""); });

      // ---- collect every field into the config object the JSX side expects ----
      function collect() {
        function num(id) { var v = parseFloat(wrap.querySelector("#" + id + "-num").value); return isFinite(v) ? v : 0; }
        function prop(key) {
          var row = wrap.querySelector('.prop-row[data-prop="' + key + '"]');
          var on = row.querySelector(".prop-on").checked;
          var vals = {};
          Array.prototype.forEach.call(row.querySelectorAll("[data-axis]"), function (inp) {
            var v = parseFloat(inp.value);
            vals[inp.getAttribute("data-axis")] = isFinite(v) ? v : 0;
          });
          return { on: on, v: vals };
        }
        return {
          basedOn: wrap.querySelector("#tf-based-on").value,
          direction: wrap.querySelector("#tf-direction").value,
          frequency: num("tf-frequency"),
          decay: num("tf-decay"),
          duration: num("tf-duration"),
          delay: num("tf-delay"),
          mode: wrap.querySelector('input[name="tf-mode"]:checked').value,
          markers: wrap.querySelector("#tf-markers").checked,
          threeD: wrap.querySelector("#tf-3d").checked,
          style: wrap.querySelector('input[name="tf-style"]:checked').value,
          props: {
            position: prop("position"), anchor: prop("anchor"), rotation: prop("rotation"),
            scale: prop("scale"), skew: prop("skew"), tracking: prop("tracking"),
            blur: prop("blur"), opacity: prop("opacity")
          }
        };
      }

      // ---- apply a saved config back onto every field ----
      function apply(cfg) {
        if (!cfg) { return; }
        wrap.querySelector("#tf-based-on").value = cfg.basedOn || "characters";
        wrap.querySelector("#tf-direction").value = cfg.direction || "ltr";
        [["tf-frequency", cfg.frequency, 4], ["tf-decay", cfg.decay, 5], ["tf-duration", cfg.duration, 2], ["tf-delay", cfg.delay, 2]]
          .forEach(function (t) {
            var v = (typeof t[1] === "number" && isFinite(t[1])) ? t[1] : t[2];
            wrap.querySelector("#" + t[0] + "-num").value = v;
            wrap.querySelector("#" + t[0]).value = v;
          });
        var modeEl = wrap.querySelector('input[name="tf-mode"][value="' + (cfg.mode || "in") + '"]');
        if (modeEl) { modeEl.checked = true; }
        wrap.querySelector("#tf-markers").checked = !!cfg.markers;
        wrap.querySelector("#tf-3d").checked = !!cfg.threeD;
        var styleEl = wrap.querySelector('input[name="tf-style"][value="' + (cfg.style || "overshoot") + '"]');
        if (styleEl) { styleEl.checked = true; }
        var p = cfg.props || {};
        ["position", "anchor", "rotation", "scale", "skew", "tracking", "blur", "opacity"].forEach(function (key) {
          var row = wrap.querySelector('.prop-row[data-prop="' + key + '"]');
          var saved = p[key] || {};
          row.querySelector(".prop-on").checked = !!saved.on;
          Array.prototype.forEach.call(row.querySelectorAll("[data-axis]"), function (inp) {
            var axis = inp.getAttribute("data-axis");
            var v = saved.v && saved.v[axis];
            inp.value = (typeof v === "number" && isFinite(v)) ? v : 0;
          });
        });
      }

      // ---- preset bar ----
      var presetSelect = wrap.querySelector("#tf-preset-select");
      function refreshPresetList() {
        var presets = self.readPresets();
        var names = Object.keys(presets).sort(function (a, b) { return a.toLowerCase() < b.toLowerCase() ? -1 : 1; });
        var current = presetSelect.value;
        presetSelect.innerHTML = '<option value="">Select Preset…</option>' +
          names.map(function (n) { return '<option value="' + escapeHtml(n) + '">' + escapeHtml(n) + '</option>'; }).join("");
        if (names.indexOf(current) !== -1) { presetSelect.value = current; }
      }
      refreshPresetList();

      wrap.querySelector("#tf-preset-save").addEventListener("click", function () {
        askText({ title: "Save preset", hint: "Give this preset a name. Using an existing name replaces it.", value: presetSelect.value || "", ok: "Save" }, function (name) {
          var presets = self.readPresets();
          presets[name] = collect();
          self.writePresets(presets);
          refreshPresetList();
          presetSelect.value = name;
          toast('Preset "' + name + '" saved.');
        });
      });

      // Picking a preset in the dropdown loads it right away (there is no Load button any more).
      presetSelect.addEventListener("change", function () {
        var name = presetSelect.value;
        if (!name) { return; }
        var presets = self.readPresets();
        if (!presets[name]) { toast("That preset no longer exists.", true); refreshPresetList(); return; }
        apply(presets[name]);
        toast('Preset "' + name + '" loaded.');
      });

      wrap.querySelector("#tf-preset-delete").addEventListener("click", function () {
        var name = presetSelect.value;
        if (!name) { toast("Pick a preset to delete first.", true); return; }
        var presets = self.readPresets();
        delete presets[name];
        self.writePresets(presets);
        refreshPresetList();
        toast('Preset "' + name + '" deleted.');
      });

      wrap.querySelector("#tf-preset-refresh").addEventListener("click", function () {
        refreshPresetList();
        toast("Preset list refreshed.");
      });

      wrap.querySelector("#tf-help").addEventListener("click", function () {
        toast("Select a text layer, check the properties to animate, then click Animate. Markers uses the layer's first and last markers as in and out points. Re-applying replaces the old animator.");
      });

      wrap.querySelector("#tf-animate").addEventListener("click", function () {
        var btn = wrap.querySelector("#tf-animate");
        if (btn.classList.contains("is-loading")) { return; }
        btn.classList.add("is-loading");
        Bridge.call("TF_apply", [collect()]).then(function (res) {
          btn.classList.remove("is-loading");
          toast(res.message || (res.ok ? "Done." : "Something went wrong."), !res.ok);
        });
      });

      // ---- Import from layer: read the TextFlex animator of the selected text layer back into the fields ----
      // Only the values the layer actually provides are changed; everything else keeps its current value.
      function fire(el, type) { try { el.dispatchEvent(new Event(type, { bubbles: true })); } catch (eFire) { } }
      function merge(cfg) {
        if (!cfg) { return; }
        function setSelect(id, v) {
          var el = wrap.querySelector(id), o;
          if (!el || !v) { return; }
          for (o = 0; o < el.options.length; o++) {
            if (el.options[o].value === v) { el.value = v; fire(el, "change"); return; }
          }
        }
        function setRadio(name, v) {
          var el = v ? wrap.querySelector('input[name="' + name + '"][value="' + v + '"]') : null;
          if (el) { el.checked = true; }
        }
        setSelect("#tf-based-on", cfg.basedOn);
        setSelect("#tf-direction", cfg.direction);
        [["tf-frequency", cfg.frequency], ["tf-decay", cfg.decay], ["tf-duration", cfg.duration], ["tf-delay", cfg.delay]].forEach(function (t) {
          if (typeof t[1] === "number" && isFinite(t[1])) {
            wrap.querySelector("#" + t[0] + "-num").value = t[1];
            wrap.querySelector("#" + t[0]).value = t[1];
          }
        });
        setRadio("tf-mode", cfg.mode);
        setRadio("tf-style", cfg.style);
        if (typeof cfg.markers === "boolean") { wrap.querySelector("#tf-markers").checked = cfg.markers; }
        if (typeof cfg.threeD === "boolean") { wrap.querySelector("#tf-3d").checked = cfg.threeD; }
        var p = cfg.props || {};
        Object.keys(p).forEach(function (key) {
          var row = wrap.querySelector('.prop-row[data-prop="' + key + '"]');
          if (!row || !p[key]) { return; }
          row.querySelector(".prop-on").checked = !!p[key].on;
          Array.prototype.forEach.call(row.querySelectorAll("[data-axis]"), function (inp) {
            var v = p[key].v && p[key].v[inp.getAttribute("data-axis")];
            if (typeof v === "number" && isFinite(v)) { inp.value = v; }
          });
        });
        snapshot();
      }

      var importBtn = wrap.querySelector("#tf-import");
      importBtn.addEventListener("click", function () {
        if (importBtn.classList.contains("is-pending")) { return; }
        importBtn.classList.add("is-pending");
        Bridge.call("TF_readFromLayer", []).then(function (res) {
          var ok = !!(res && res.ok && res.data && res.data.cfg);
          if (ok) { merge(res.data.cfg); }
          flashButtonResult(importBtn, ok);
          toast(ok ? 'Imported from "' + res.data.layer + '".' : ((res && res.message) || "Something went wrong."), !ok);
        });
      });

      // ---- keep every value across tab switches ----
      // renderTab() rebuilds this tab from scratch. The generic FormState only remembers fields changed by a TRUSTED
      // input event, but the custom dropdowns, number spinners and drag-scrub set their values from script, and presets
      // and Import fill the fields from code - so all of those were lost on the next tab switch. TextFlex therefore keeps
      // its own copy (self.last): refreshed after every input / change / pointer / key event in this tab, once more right
      // before the tab is torn down (renderTab -> TextFlex.snapshot), and re-applied below each time the tab is built.
      function snapshot() {
        try { self.last = collect(); self.lastPreset = presetSelect.value; } catch (eSnap) { }
      }
      self.snapshot = snapshot;
      ["input", "change", "pointerup", "keyup"].forEach(function (type) {
        wrap.addEventListener(type, function () { setTimeout(snapshot, 0); }, true);
      });
      if (self.last) {
        apply(self.last);
        if (self.lastPreset) { presetSelect.value = self.lastPreset; }
      }

      return wrap;
    }
  };

  // ---------------------------------------------------------
  // Shortcutz tab - "Speed Dial" hub.
  //   - Built-in cards (Expression / Quick Effect / Utility Shortcuts): fixed, always shown,
  //     each just a thin wrapper around an existing Bridge call.
  //   - Pinned Animation Presets (.ffx): populated by the pin icon on the Animation Presets tab
  //     (Presets module) - reuses PRE_apply, so it stays in sync with that tab's preset folder.
  //   - My Shortcuts: pinned Expression Code snippets (pin icon on the Code Expression tab) plus
  //     anything made with "+ Add Custom Shortcut" (Expression code / .ffx path / raw JSX script).
  //     Persisted as one ordered array in localStorage; drag to reorder.
  // ---------------------------------------------------------
  function sanitizeSlotKey(key) { return String(key).replace(/[^a-zA-Z0-9_-]/g, "_"); }

  // ---------------------------------------------------------
  // TileCustom - per-tile customization overlay for Shortcutz cards (both built-in and "My
  // Shortcuts" tiles). Keyed by "group:id" for a built-in tile (e.g. "expr:bounce") or "c:<itemId>"
  // for a My Shortcuts tile - two separate key spaces that never collide since genId() ids never
  // contain a plain "group:" prefix. Fields per key: icon {type,src}, bg {src}, accent (hex),
  // fn {type,name,code/path/commandId} (built-in "Edit Shortcut Function" override only), and
  // hidden (built-in "Delete Shortcut" - built-ins can't really be deleted, only hidden/restored).
  // An in-memory cache is kept alongside localStorage so a customization still shows for the rest
  // of this session even if the write itself fails (e.g. quota, for a large inline GIF fallback).
  // ---------------------------------------------------------
  var TileCustom = {
    KEY: "shortcutz.tileCustom",
    _cache: null,
    _load: function () {
      if (this._cache) { return this._cache; }
      try { var v = JSON.parse(Store.get(this.KEY) || "{}"); this._cache = (v && typeof v === "object") ? v : {}; }
      catch (e) { this._cache = {}; }
      return this._cache;
    },
    getFor: function (key) { return this._load()[key] || null; },
    set: function (key, field, value) {
      var all = this._load();
      var entry = all[key] || {};
      if (value === null || value === undefined) { delete entry[field]; } else { entry[field] = value; }
      if (Object.keys(entry).length === 0) { delete all[key]; } else { all[key] = entry; }
      this._cache = all;
      return Store.set(this.KEY, JSON.stringify(all));
    },
    hiddenCount: function () {
      var all = this._load(), n = 0;
      Object.keys(all).forEach(function (k) { if (all[k] && all[k].hidden) { n++; } });
      return n;
    },
    clearAllHidden: function () {
      var all = this._load();
      Object.keys(all).forEach(function (k) {
        if (all[k] && all[k].hidden) { delete all[k].hidden; if (Object.keys(all[k]).length === 0) { delete all[k]; } }
      });
      Store.set(this.KEY, JSON.stringify(all));
    }
  };

  // ---------------------------------------------------------
  // Custom right-click menu for Shortcutz tiles (separate from the tool-tile #ctx-menu elsewhere in
  // the panel, which only handles the simple 2-item icon menu). Built once and reused for every
  // tile; self.target holds who it's currently open for: { kind: "builtin"|"custom", key, group?,
  // id?, item? }.
  // ---------------------------------------------------------
  var ShortcutzMenu = {
    built: false, el: null, iconInput: null, bgInput: null, target: null,

    build: function () {
      if (this.built) { return; }
      this.built = true;
      var self = this;

      var el = document.createElement("div");
      el.id = "shortcutz-ctx-menu";
      el.className = "ctx-menu ctx-menu--shortcutz";
      el.setAttribute("role", "menu");
      el.setAttribute("aria-hidden", "true");
      el.innerHTML =
        '<button class="ctx-item" role="menuitem" id="scm-icon" type="button">Change Icon Image</button>' +
        '<button class="ctx-item" role="menuitem" id="scm-iconclear" type="button">Reset Icon Image</button>' +
        '<button class="ctx-item" role="menuitem" id="scm-bg" type="button">Set Background GIF / Image</button>' +
        '<button class="ctx-item" role="menuitem" id="scm-edit" type="button">Edit Shortcut Function</button>' +
        '<button class="ctx-item" role="menuitem" id="scm-bgclear" type="button">Remove Background GIF</button>' +
        '<div class="ctx-menu-sep"></div>' +
        '<button class="ctx-item is-danger" role="menuitem" id="scm-delete" type="button">Delete Shortcut</button>';
      document.body.appendChild(el);
      this.el = el;

      var iconInput = document.createElement("input");
      iconInput.type = "file";
      iconInput.accept = "image/png,image/jpeg,image/jpg,image/svg+xml,.png,.jpg,.jpeg,.svg";
      iconInput.hidden = true;
      document.body.appendChild(iconInput);
      this.iconInput = iconInput;

      var bgInput = document.createElement("input");
      bgInput.type = "file";
      bgInput.accept = "image/*,.gif";
      bgInput.hidden = true;
      document.body.appendChild(bgInput);
      this.bgInput = bgInput;

      el.querySelector("#scm-icon").addEventListener("click", function () { self.iconInput.click(); self.close(); });
      el.querySelector("#scm-iconclear").addEventListener("click", function () { if (self.target) { Shortcutz.clearIcon(self.target); } self.close(); });
      el.querySelector("#scm-bg").addEventListener("click", function () { self.bgInput.click(); self.close(); });
      el.querySelector("#scm-edit").addEventListener("click", function () { if (self.target) { Shortcutz.openEditModal(self.target); } self.close(); });
      el.querySelector("#scm-bgclear").addEventListener("click", function () { if (self.target) { Shortcutz.clearBg(self.target); } self.close(); });
      el.querySelector("#scm-delete").addEventListener("click", function () { if (self.target) { Shortcutz.deleteTile(self.target); } self.close(); });

      iconInput.addEventListener("change", function (e) {
        var file = e.target.files && e.target.files[0];
        e.target.value = "";
        if (!file || !self.target) { return; }
        Shortcutz.setIcon(self.target, file);
      });
      bgInput.addEventListener("change", function (e) {
        var file = e.target.files && e.target.files[0];
        e.target.value = "";
        if (!file || !self.target) { return; }
        Shortcutz.setBg(self.target, file);
      });

      document.addEventListener("mousedown", function (e) { if (!self.el.contains(e.target)) { self.close(); } });
      document.addEventListener("keydown", function (e) { if (e.key === "Escape") { self.close(); } });
      window.addEventListener("blur", function () { self.close(); });
      window.addEventListener("resize", function () { self.close(); });
      panel.addEventListener("scroll", function () { self.close(); });
      document.addEventListener("scroll", function () { self.close(); }, true);   // any scroller, incl. nested lists
      document.addEventListener("mtx:ctx-open", function (e) { if (!e.detail || e.detail.id !== "shortcutz") { self.close(); } });
    },

    open: function (x, y, target) {
      this.build();
      document.dispatchEvent(new CustomEvent("mtx:ctx-open", { detail: { id: "shortcutz" } }));   // only one menu at a time
      this.target = target;
      var ov = TileCustom.getFor(target.key);
      this.el.querySelector("#scm-bgclear").disabled = !(ov && ov.bg);
      this.el.querySelector("#scm-iconclear").disabled = !(ov && ov.icon);
      this.el.querySelector("#scm-delete").textContent = target.kind === "builtin" ? "Hide Shortcut" : "Delete Shortcut";
      this.el.classList.add("is-open");
      this.el.setAttribute("aria-hidden", "false");
      var w = this.el.offsetWidth, h = this.el.offsetHeight;
      var px = Math.max(4, Math.min(x, window.innerWidth - w - 4));
      var py = Math.max(4, Math.min(y, window.innerHeight - h - 4));
      this.el.style.left = px + "px";
      this.el.style.top = py + "px";
    },

    close: function () {
      if (!this.el) { return; }
      this.el.classList.remove("is-open");
      this.el.setAttribute("aria-hidden", "true");
    }
  };

  var Shortcutz = {
    KEY: "shortcutz.items",
    modalBuilt: false,

    // ---- storage ----
    getItems: function () {
      try { var v = JSON.parse(Store.get(this.KEY) || "[]"); return Array.isArray(v) ? v : []; }
      catch (e) { return []; }
    },
    saveItems: function (items) { Store.set(this.KEY, JSON.stringify(items)); },
    genId: function () { return "sc_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); },

    addItem: function (item) {
      var items = this.getItems();
      item.id = this.genId();
      items.push(item);
      this.saveItems(items);
      this.refresh();
      return item;
    },
    removeItem: function (id) {
      var items = this.getItems().filter(function (it) { return it.id !== id; });
      this.saveItems(items);
      this.refresh();
    },
    reorder: function (idsInNewOrder) {
      var items = this.getItems();
      var byId = {};
      items.forEach(function (it) { byId[it.id] = it; });
      var next = [];
      idsInNewOrder.forEach(function (id) { if (byId[id]) { next.push(byId[id]); delete byId[id]; } });
      Object.keys(byId).forEach(function (id) { next.push(byId[id]); });   // anything missed goes at the end
      this.saveItems(next);
    },

    // ---- called from the pin icon on Presets / ExprCode ----
    pinFfx: function (o) {
      var dupe = this.getItems().some(function (it) { return it.type === "ffx" && it.folder === o.folder && it.file === o.file; });
      if (dupe) { toast("Already pinned to Shortcutz."); return; }
      this.addItem({ type: "ffx", name: o.name, folder: o.folder, file: o.file });
      toast('Pinned "' + o.name + '" to Shortcutz.');
    },
    pinExpr: function (o) {
      var dupe = this.getItems().some(function (it) { return it.type === "expr" && it.name === o.name && it.code === o.code; });
      if (dupe) { toast("Already pinned to Shortcutz."); return; }
      this.addItem({ type: "expr", name: o.name, code: o.code });
      toast('Pinned "' + o.name + '" to Shortcutz.');
    },

    // Re-renders the grid in place if the Shortcutz tab happens to be open right now (e.g. pinning
    // from another tab while Shortcutz is already visible in a second undocked window/instance).
    refresh: function () {
      var host = document.getElementById("shortcutz-my-grid");
      if (host) {
        host.outerHTML = this.myGridHtml();
        this.wireMyGrid(document.getElementById("panel"));
        var newHost = document.getElementById("shortcutz-my-grid");
        if (newHost) { this.applyTileCustomizations(newHost); }
      }
    },

    // Full re-render of the Shortcutz tab content in place (used after anything that changes a
    // BUILT-IN tile's look/behavior - custom icon, background, override, or hide/restore - since
    // those sections are otherwise only built once by render() and never touched by refresh()).
    rerender: function () {
      if (currentTab !== "shortcutz") { return; }
      var scrollTop = panel.scrollTop;
      panel.innerHTML = "";
      panel.appendChild(this.render());
      panel.scrollTop = scrollTop;
    },

    // ---- built-in shortcut definitions ----
    EXPR_PRESETS: [
      { id: "bounce", name: "Inertial Bounce",
        note: "Adds an elastic rebound after each keyframe on the selected property.",
        code: "n = 0;\nif (numKeys > 0){\n  n = nearestKey(time).index;\n  if (key(n).time > time) n--;\n}\nif (n == 0){\n  t = 0;\n}else{\n  t = time - key(n).time;\n}\nif (n > 0 && t < 4){\n  v = velocityAtTime(key(n).time - thisComp.frameDuration/10);\n  amp = 0.15;\n  freq = 3;\n  decay = 8;\n  value + v*amp*Math.sin(freq*t*2*Math.PI)/Math.exp(decay*t);\n}else{\n  value;\n}",
        icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 16c2-6 4 6 6 0s4-10 6 0 4-6 4-6"/></svg>' },
      { id: "wiggle", name: "Wiggle(2, 30)",
        note: "Quick jitter: value + wiggle(2, 30).",
        code: "wiggle(2, 30)",
        icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12c2-5 4 5 6 0s4-5 6 0 4-5 6 0"/></svg>' },
      { id: "loopout", name: "Loop Out",
        note: 'loopOut("cycle") - repeats the property\u2019s existing keyframes forever.',
        code: 'loopOut("cycle");',
        icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4a8 8 0 1 1-6.3 3.1M5.5 3v4.5H10"/></svg>' },
      { id: "autorotate", name: "Auto Rotate",
        note: "Spins Rotation continuously (time * 90deg/sec) - no keyframes needed.",
        code: "value + time * 90;",
        icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/></svg>' },
      { id: "pingpong", name: "Loop Ping-Pong",
        note: 'loopOut("pingpong") - plays the keyframes forward, then backward, forever.',
        code: 'loopOut("pingpong");',
        icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12h16M8 8l-4 4 4 4M16 8l4 4-4 4"/></svg>' },
      { id: "loopcontinue", name: "Loop Continue",
        note: 'loopOut("continue") - keeps moving at the speed of the last keyframe.',
        code: 'loopOut("continue");',
        icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 18l8-8 8 0M16 6l4 4-4 4"/></svg>' },
      { id: "choppy", name: "Choppy Wiggle",
        note: "Wiggle at 12 steps per second, like hand-drawn jitter.",
        code: "posterizeTime(12);\nwiggle(5, 20);",
        icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 14h3v-5h3v8h3v-6h3v4h3v-3h3"/></svg>' },
      { id: "fadeio", name: "Fade In / Out",
        note: "Opacity only: fades in at the layer's in point and out at its out point (0.3 s each) - no keyframes. Edit fadeIn / fadeOut after applying.",
        code: "fadeIn = 0.3;\nfadeOut = 0.3;\na = linear(time, inPoint, inPoint + fadeIn, 0, 100);\nb = linear(time, outPoint - fadeOut, outPoint, 100, 0);\nMath.min(a, b);",
        icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 18L9 6h6l6 12"/></svg>' },
      { id: "blink", name: "Blink",
        note: "Opacity only: switches the layer on and off 4 times per second.",
        code: "Math.floor(time * 4) % 2 == 0 ? value : 0;",
        icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3"/></svg>' }
    ],
    EFFECT_PRESETS: [
      { id: "boxblur", name: "Add Fast Box Blur", matchName: "ADBE Box Blur2" },
      { id: "fill", name: "Add Fill", matchName: "ADBE Fill" },
      { id: "curves", name: "Add Curves", matchName: "ADBE CurvesCustom" },
      { id: "dropshadow", name: "Add Drop Shadow", matchName: "ADBE Drop Shadow" },
      { id: "glow", name: "Add Glow", matchName: "ADBE Glo2" },
      { id: "gblur", name: "Add Gaussian Blur", matchName: "ADBE Gaussian Blur 2" },
      { id: "tint", name: "Add Tint", matchName: "ADBE Tint" },
      { id: "levels", name: "Add Levels", matchName: "ADBE Pro Levels2" },
      { id: "huesat", name: "Add Hue/Saturation", matchName: "ADBE HUE SATURATION" },
      { id: "ramp", name: "Add Gradient Ramp", matchName: "ADBE Ramp" },
      { id: "fxtransform", name: "Add Transform", matchName: "ADBE Geometry2" },
      { id: "turbulent", name: "Add Turbulent Displace", matchName: "ADBE Turbulent Displace" },
      { id: "slider", name: "Add Slider Control", matchName: "ADBE Slider Control" },
      { id: "checkbox", name: "Add Checkbox Control", matchName: "ADBE Checkbox Control" },
      { id: "colorctl", name: "Add Color Control", matchName: "ADBE Color Control" },
      { id: "anglectl", name: "Add Angle Control", matchName: "ADBE Angle Control" }
    ],
    UTIL_PRESETS: [
      { id: "centeranchor", name: "Center Anchor Point", note: "Centers the anchor point of every selected layer.",
        run: function () { return Bridge.call("AA_setAnchor", ["mm"]); } },
      { id: "autoparent", name: "Auto Parent", note: "Parents every other selected layer to the topmost selected one.",
        run: function () { return Bridge.call("SHTZ_autoParentToTop", []); } },
      { id: "audiobeats", name: "Convert Audio to Beats", note: "Adds keyframes or markers at audio peaks with default settings. The Tools tab has full control.",
        run: function () { return Bridge.call("TOOLS_convertAudioToKeyframes", [25, "layer"]); } },
      { id: "easyease", name: "Easy Ease", note: "Easy Ease (in and out) on the selected keyframes.",
        run: function () { return Bridge.call("SHTZ_easyEase", ["both"]); } },
      { id: "easein", name: "Easy Ease In", note: "Easy Ease on the incoming side of the selected keyframes.",
        run: function () { return Bridge.call("SHTZ_easyEase", ["in"]); } },
      { id: "easeout", name: "Easy Ease Out", note: "Easy Ease on the outgoing side of the selected keyframes.",
        run: function () { return Bridge.call("SHTZ_easyEase", ["out"]); } },
      { id: "revkeys", name: "Reverse Keyframes", note: "Time-Reverse the selected keyframes (Animation > Keyframe Assistant). Uses the English menu name.",
        run: function () { return Bridge.call("SHTZ_runMenuCommand", ["Time-Reverse Keyframes"]); } },
      { id: "revlayer", name: "Reverse Layer", note: "Time-Reverse the selected layers (Layer > Time). Uses the English menu name.",
        run: function () { return Bridge.call("SHTZ_runMenuCommand", ["Time-Reverse Layer"]); } },
      { id: "timeremap", name: "Time Remap", note: "Enable Time Remapping on the selected layers. Uses the English menu name.",
        run: function () { return Bridge.call("SHTZ_runMenuCommand", ["Enable Time Remapping"]); } },
      { id: "freeze", name: "Freeze Frame", note: "Freezes the selected layer at the current time. Uses the English menu name.",
        run: function () { return Bridge.call("SHTZ_runMenuCommand", ["Freeze Frame"]); } },
      { id: "splitlayer", name: "Split Layer", note: "Splits the selected layers at the current time. Uses the English menu name.",
        run: function () { return Bridge.call("SHTZ_runMenuCommand", ["Split Layer"]); } },
      { id: "parentnull", name: "Parent to Null", note: "Creates a Null at the center and parents the selected layers to it. Layers stay in place.",
        run: function () { return Bridge.call("SHTZ_parentToNull", []); } },
      { id: "lock", name: "Lock / Unlock", note: "Flips the Lock switch on the selected layers.",
        run: function () { return Bridge.call("SHTZ_toggleSwitch", ["locked"]); } },
      { id: "shy", name: "Shy / Unshy", note: "Flips the Shy switch on the selected layers.",
        run: function () { return Bridge.call("SHTZ_toggleSwitch", ["shy"]); } },
      { id: "solo", name: "Solo / Unsolo", note: "Flips the Solo switch on the selected layers.",
        run: function () { return Bridge.call("SHTZ_toggleSwitch", ["solo"]); } },
      { id: "guide", name: "Guide Layer", note: "Flips the Guide Layer switch on the selected layers.",
        run: function () { return Bridge.call("SHTZ_toggleSwitch", ["guideLayer"]); } },
      { id: "markcomp", name: "Comp Marker", note: "Adds an empty composition marker at the current time.",
        run: function () { return Bridge.call("SHTZ_addMarker", ["comp"]); } },
      { id: "marklayer", name: "Layer Marker", note: "Adds an empty marker at the current time on the selected layers.",
        run: function () { return Bridge.call("SHTZ_addMarker", ["layer"]); } },
      { id: "workarea", name: "Work Area to Layers", note: "Sets the work area to the span of the selected layers.",
        run: function () { return Bridge.call("SHTZ_workAreaToLayers", []); } },
      { id: "renderq", name: "Add to Render Queue", note: "Adds the active composition to the Render Queue.",
        run: function () { return Bridge.call("SHTZ_addToRenderQueue", []); } },
      { id: "keyplay", name: "Keys to Playhead", note: "Moves the selected keyframes so the earliest one sits on the current time. Spacing between them stays.",
        run: function () { return Bridge.call("SHTZ_moveKeys", ["playhead", 0]); } },
      { id: "keyp1", name: "Keys +1 Frame", note: "Shifts the selected keyframes 1 frame later.",
        run: function () { return Bridge.call("SHTZ_moveKeys", ["offset", 1]); } },
      { id: "keym1", name: "Keys -1 Frame", note: "Shifts the selected keyframes 1 frame earlier.",
        run: function () { return Bridge.call("SHTZ_moveKeys", ["offset", -1]); } },
      { id: "keyp5", name: "Keys +5 Frames", note: "Shifts the selected keyframes 5 frames later.",
        run: function () { return Bridge.call("SHTZ_moveKeys", ["offset", 5]); } },
      { id: "keym5", name: "Keys -5 Frames", note: "Shifts the selected keyframes 5 frames earlier.",
        run: function () { return Bridge.call("SHTZ_moveKeys", ["offset", -5]); } },
      { id: "keyseq", name: "Sequence Keys", note: "Select the same keyframes on several layers. Each layer's keys move 2 frames more than the layer above it.",
        run: function () { return Bridge.call("SHTZ_moveKeys", ["sequence", 2]); } },
      { id: "seltype", name: "Select Same Type", note: "Selects every layer of the same type as the first selected layer (text, shape, solid, null ...).",
        run: function () { return Bridge.call("SHTZ_selectLayers", ["type"]); } },
      { id: "sellabel", name: "Select Same Label", note: "Selects every layer with the same label color as the first selected layer.",
        run: function () { return Bridge.call("SHTZ_selectLayers", ["label"]); } },
      { id: "selinvert", name: "Invert Selection", note: "Selects the layers that are not selected and deselects the rest.",
        run: function () { return Bridge.call("SHTZ_selectLayers", ["invert"]); } },
      { id: "distx", name: "Distribute Horizontally", note: "Spaces 3 or more selected layers evenly between the outer two (static Position only).",
        run: function () { return Bridge.call("SHTZ_distributeLayers", ["x"]); } },
      { id: "disty", name: "Distribute Vertically", note: "Spaces 3 or more selected layers evenly between the outer two (static Position only).",
        run: function () { return Bridge.call("SHTZ_distributeLayers", ["y"]); } },
      { id: "addkey", name: "Add Keyframe", note: "Adds a keyframe at the current time on every selected property, keeping its current value.",
        run: function () { return Bridge.call("SHTZ_addKeyAtTime", []); } },
      { id: "rmkeys", name: "Remove Keyframes", note: "Removes all keyframes of the selected properties and keeps the value at the current time.",
        run: function () { return Bridge.call("SHTZ_removeKeys", []); } },
      { id: "startplay", name: "Layer Start to Playhead", note: "Slides each selected layer so its In point sits on the current time.",
        run: function () { return Bridge.call("SHTZ_layerToPlayhead", ["start"]); } },
      { id: "endplay", name: "Layer End to Playhead", note: "Slides each selected layer so its Out point sits on the current time.",
        run: function () { return Bridge.call("SHTZ_layerToPlayhead", ["end"]); } },
      { id: "revorder", name: "Reverse Layer Order", note: "Reverses the stacking order of the selected layers (they keep the same slots).",
        run: function () { return Bridge.call("SHTZ_reverseLayerOrder", []); } },
      { id: "mblur", name: "Motion Blur", note: "Turns Motion Blur on for the selected layers and the comp. All already on: turns it off.",
        run: function () { return Bridge.call("SHTZ_motionBlur", []); } },
      { id: "sw3d", name: "3D Layer", note: "Flips the 3D Layer switch on the selected layers.",
        run: function () { return Bridge.call("SHTZ_toggleSwitch", ["threeDLayer"]); } },
      { id: "swvis", name: "Show / Hide Layer", note: "Flips the Video (eye) switch on the selected layers.",
        run: function () { return Bridge.call("SHTZ_toggleSwitch", ["enabled"]); } },
      { id: "swcollapse", name: "Collapse Transform", note: "Flips Collapse Transformations on the selected pre-comp or shape layers.",
        run: function () { return Bridge.call("SHTZ_toggleSwitch", ["collapseTransformation"]); } },
      { id: "caseup", name: "UPPERCASE", note: "Changes the text of the selected text layers to capitals. Text with animated source text is skipped.",
        run: function () { return Bridge.call("SHTZ_textCase", ["upper"]); } },
      { id: "caselow", name: "lowercase", note: "Changes the text of the selected text layers to small letters.",
        run: function () { return Bridge.call("SHTZ_textCase", ["lower"]); } },
      { id: "casetitle", name: "Title Case", note: "Capitalizes the first letter of every word in the selected text layers.",
        run: function () { return Bridge.call("SHTZ_textCase", ["title"]); } },
      { id: "incsave", name: "Incremental Save", note: "Saves the project as name_v001, name_v002 ... and keeps working in the new file.",
        run: function () { return Bridge.call("SHTZ_incrementalSave", []); } }
    ],

    typeIcon: function (type) {
      if (type === "ffx" || type === "ffx-path") { return ICON_FOLDER_SVG; }
      if (type === "jsx") { return ICON_JSX_SVG; }
      return ICON_UTIL_SVG;
    },
    typeLabel: function (type) {
      if (type === "ffx" || type === "ffx-path") { return "Animation Preset"; }
      if (type === "jsx") { return "JSX Script"; }
      if (type === "cmd") { return "Native Command"; }
      return "Expression";
    },

    // Applies any TileCustom overlay (custom icon, background GIF/image, accent color, and - for
    // built-ins - a renamed/overridden display) onto already-inserted tile DOM nodes. Run once
    // right after a batch of tile HTML is inserted (render(), refresh()) rather than baked into the
    // HTML strings themselves, so a data:/file:// src never has to survive being embedded in a raw
    // HTML attribute (matches how applyToolImage() sets images elsewhere in this file).
    applyTileCustomizations: function (containerEl) {
      Array.prototype.forEach.call(containerEl.querySelectorAll("[data-sc-key]"), function (el) {
        var key = el.getAttribute("data-sc-key");
        var ov = TileCustom.getFor(key);
        if (!ov) { return; }
        var wrap = el.closest ? el.closest(".saber-wrap--tile") : null;
        var iconEl = el.querySelector(".shortcut-tile-icon");
        if (ov.icon && ov.icon.src && iconEl) {
          iconEl.classList.add("has-custom-icon");
          iconEl.style.backgroundImage = 'url("' + ov.icon.src + '")';
          iconEl.innerHTML = "";
        }
        if (ov.bg && ov.bg.src) {
          el.classList.add("has-bg");
          el.style.backgroundImage = 'url("' + ov.bg.src + '")';
        }
        if (ov.accent && wrap) {
          wrap.classList.add("has-custom-accent");
          wrap.style.setProperty("--tile-accent", ov.accent);
        }
        if (ov.fn && ov.fn.name) {
          var nameEl = el.querySelector(".shortcut-tile-name");
          if (nameEl) { nameEl.textContent = ov.fn.name; }
          el.title = ov.fn.name;
        }
      });
    },

    builtinTileHtml: function (group, def) {
      var key = group + ":" + def.id;
      return '<div class="saber-wrap saber-wrap--tile">' +
        '<button type="button" class="shortcut-tile" data-sc-builtin="' + group + ":" + def.id + '" data-sc-key="' + key + '" title="' + escapeHtml(def.note || def.name) + '">' +
          '<span class="shortcut-tile-icon">' + (def.icon || this.typeIcon(group)) + "</span>" +
          '<span class="shortcut-tile-name">' + escapeHtml(def.name) + "</span>" +
        "</button>" +
      "</div>";
    },

    itemTileHtml: function (item) {
      var styleAttr = item.color ? ' style="--tile-accent:' + escapeHtml(item.color) + '"' : "";
      return '<div class="saber-wrap saber-wrap--tile' + (item.color ? " has-custom-accent" : "") + '" draggable="true" data-sc-id="' + item.id + '"' + styleAttr + '>' +
        '<div class="shortcut-tile" data-sc-run="' + item.id + '" data-sc-key="c:' + item.id + '" tabindex="0" role="button" title="' + escapeHtml(this.typeLabel(item.type) + ": " + item.name) + '">' +
          '<button type="button" class="shortcut-tile-remove" data-sc-remove="' + item.id + '" title="Remove from Shortcutz" aria-label="Remove ' + escapeHtml(item.name) + '">' + ICON_CLEAR_SVG + "</button>" +
          '<span class="shortcut-tile-icon">' + this.typeIcon(item.type) + "</span>" +
          '<span class="shortcut-tile-name">' + escapeHtml(item.name) + "</span>" +
        "</div>" +
      "</div>";
    },

    myGridHtml: function () {
      var items = this.getItems();
      var inner = items.length
        ? items.map(this.itemTileHtml.bind(this)).join("")
        : '<p class="shortcutz-empty">No custom shortcuts yet. Click &quot;+ Add Custom Shortcut&quot; above or right-click cards to pin your favorites.</p>';
      return '<div class="shortcut-list" id="shortcutz-my-grid">' + inner + "</div>";
    },

    // ---- "+ Add Custom Shortcut" modal (built once, appended to <body>) ----
    buildModal: function () {
      if (this.modalBuilt) { return; }
      this.modalBuilt = true;
      var self = this;

      var back = document.createElement("div");
      back.className = "modal-backdrop";
      back.id = "shortcut-add-modal";
      back.setAttribute("aria-hidden", "true");
      back.innerHTML =
        '<div class="modal" role="dialog" aria-modal="true" aria-labelledby="shortcut-add-title">' +
          '<h2 id="shortcut-add-title">Add Custom Shortcut</h2>' +
          '<div class="field field-column">' +
            '<span class="field-label">Shortcut Display Name</span>' +
            '<input type="text" id="sc-add-name" class="text-input" placeholder="e.g. My Signature Bounce">' +
          "</div>" +
          '<div class="field field-column">' +
            '<span class="field-label">Target Function Type</span>' +
            '<select class="select" id="sc-add-type">' +
              '<option value="expr">Expression Code</option>' +
              '<option value="ffx-path">.ffx File Path</option>' +
              '<option value="jsx">JSX Script</option>' +
              '<option value="cmd">Native Menu Command ID</option>' +
            "</select>" +
          "</div>" +
          '<div class="field field-column" id="sc-add-field-expr">' +
            '<span class="field-label">Expression Code</span>' +
            '<textarea id="sc-add-code" class="code-area" rows="4" placeholder="wiggle(2, 30)"></textarea>' +
          "</div>" +
          '<div class="field field-column" id="sc-add-field-ffx" style="display:none">' +
            '<span class="field-label">.ffx File Path</span>' +
            '<div class="field-actions" style="justify-content:stretch">' +
              '<input type="text" id="sc-add-ffxpath" class="text-input" placeholder="C:\\...\\MyPreset.ffx" style="flex:1 1 auto">' +
              '<button class="btn" type="button" id="sc-add-ffxbrowse">Browse&hellip;</button>' +
            "</div>" +
          "</div>" +
          '<div class="field field-column" id="sc-add-field-jsx" style="display:none">' +
            '<span class="field-label">JSX Script / AE Command</span>' +
            '<textarea id="sc-add-jsxcode" class="code-area" rows="4" placeholder="alert(app.project.file.name);"></textarea>' +
            '<p class="field-note">Runs inside its own Undo Group automatically - no need to add app.beginUndoGroup() yourself.</p>' +
          "</div>" +
          '<div class="field field-column" id="sc-add-field-cmd" style="display:none">' +
            '<span class="field-label">Native Menu Command ID</span>' +
            '<input type="number" id="sc-add-cmdid" class="text-input" placeholder="e.g. 2265" step="1" min="1">' +
            '<p class="field-note">The numeric id After Effects uses internally for a menu command (app.executeCommand) - look it up with a command-id lister script, then paste it here.</p>' +
          "</div>" +
          '<div class="field field-column" id="sc-add-field-pinned" style="display:none">' +
            '<span class="field-label">Pinned Animation Preset</span>' +
            '<p class="field-note" id="sc-add-pinned-info"></p>' +
            '<p class="field-note">This shortcut runs a pinned .ffx preset, so the preset file itself can only be changed by removing this shortcut and pinning a new one - name and color accent can still be edited here.</p>' +
          "</div>" +
          '<div class="field">' +
            '<span class="field-label">Color Accent</span>' +
            '<input type="color" id="sc-add-color" value="#ffffff">' +
          "</div>" +
          '<div class="modal-footer">' +
            '<button class="btn btn-ghost" id="sc-add-cancel" type="button">Cancel</button>' +
            '<button class="btn btn-primary" id="sc-add-save" type="button">Add Shortcut</button>' +
          "</div>" +
        "</div>";
      document.body.appendChild(back);

      var titleEl = back.querySelector("#shortcut-add-title");
      var nameEl = back.querySelector("#sc-add-name");
      var typeEl = back.querySelector("#sc-add-type");
      var codeEl = back.querySelector("#sc-add-code");
      var ffxPathEl = back.querySelector("#sc-add-ffxpath");
      var jsxCodeEl = back.querySelector("#sc-add-jsxcode");
      var cmdIdEl = back.querySelector("#sc-add-cmdid");
      var colorEl = back.querySelector("#sc-add-color");
      var saveBtn = back.querySelector("#sc-add-save");
      var fieldExpr = back.querySelector("#sc-add-field-expr");
      var fieldFfx = back.querySelector("#sc-add-field-ffx");
      var fieldJsx = back.querySelector("#sc-add-field-jsx");
      var fieldCmd = back.querySelector("#sc-add-field-cmd");
      var fieldPinned = back.querySelector("#sc-add-field-pinned");

      this._editTarget = null; // null = Add mode; a context-menu target object = Edit mode

      function isPinnedFfxTarget(t) { return !!(t && t.kind === "custom" && t.item && t.item.type === "ffx"); }

      function syncFields() {
        var t = typeEl.value;
        fieldExpr.style.display = t === "expr" ? "" : "none";
        fieldFfx.style.display = t === "ffx-path" ? "" : "none";
        fieldJsx.style.display = t === "jsx" ? "" : "none";
        fieldCmd.style.display = t === "cmd" ? "" : "none";
      }
      typeEl.addEventListener("change", syncFields);

      function closeModal() { back.classList.remove("is-open"); back.setAttribute("aria-hidden", "true"); self._editTarget = null; }

      function openModal() {
        self._editTarget = null;
        titleEl.textContent = "Add Custom Shortcut";
        saveBtn.textContent = "Add Shortcut";
        typeEl.disabled = false;
        fieldPinned.style.display = "none";
        nameEl.value = ""; codeEl.value = ""; ffxPathEl.value = ""; jsxCodeEl.value = ""; cmdIdEl.value = "";
        typeEl.value = "expr"; colorEl.value = "#ffffff";
        syncFields();
        back.classList.add("is-open"); back.setAttribute("aria-hidden", "false");
        nameEl.focus();
      }
      this.openAddModal = openModal;

      function openEditModal(target) {
        self._editTarget = target;
        titleEl.textContent = "Edit Shortcut Function";
        saveBtn.textContent = "Save Changes";

        if (isPinnedFfxTarget(target)) {
          typeEl.disabled = true;
          fieldExpr.style.display = "none"; fieldFfx.style.display = "none";
          fieldJsx.style.display = "none"; fieldCmd.style.display = "none";
          fieldPinned.style.display = "";
          back.querySelector("#sc-add-pinned-info").textContent = target.item.file + " (in " + target.item.folder + ")";
          nameEl.value = target.item.name;
          colorEl.value = target.item.color || "#ffffff";
        } else {
          typeEl.disabled = false;
          fieldPinned.style.display = "none";
          if (target.kind === "custom") {
            var it = target.item;
            nameEl.value = it.name;
            typeEl.value = it.type;
            codeEl.value = it.type === "expr" ? (it.code || "") : "";
            ffxPathEl.value = it.type === "ffx-path" ? (it.path || "") : "";
            jsxCodeEl.value = it.type === "jsx" ? (it.code || "") : "";
            cmdIdEl.value = it.type === "cmd" ? (it.commandId || "") : "";
            colorEl.value = it.color || "#ffffff";
          } else {
            var ov = TileCustom.getFor(target.key) || {};
            var fn = ov.fn;
            var def = null;
            if (target.group === "expr") { def = self.EXPR_PRESETS.filter(function (d) { return d.id === target.id; })[0]; }
            else if (target.group === "effect") { def = self.EFFECT_PRESETS.filter(function (d) { return d.id === target.id; })[0]; }
            else if (target.group === "util") { def = self.UTIL_PRESETS.filter(function (d) { return d.id === target.id; })[0]; }
            nameEl.value = fn ? fn.name : (def ? def.name : "");
            typeEl.value = fn ? fn.type : "expr";
            codeEl.value = fn && fn.type === "expr" ? fn.code : (def && target.group === "expr" ? def.code : "");
            ffxPathEl.value = fn && fn.type === "ffx-path" ? (fn.path || "") : "";
            jsxCodeEl.value = fn && fn.type === "jsx" ? (fn.code || "") : "";
            cmdIdEl.value = fn && fn.type === "cmd" ? (fn.commandId || "") : "";
            colorEl.value = ov.accent || "#ffffff";
          }
          syncFields();
        }

        back.classList.add("is-open"); back.setAttribute("aria-hidden", "false");
        nameEl.focus();
      }
      this.openEditModal = openEditModal;

      back.querySelector("#sc-add-cancel").addEventListener("click", closeModal);
      back.addEventListener("click", function (e) { if (e.target === back) { closeModal(); } });
      document.addEventListener("keydown", function (e) { if (e.key === "Escape" && back.classList.contains("is-open")) { closeModal(); } });

      back.querySelector("#sc-add-ffxbrowse").addEventListener("click", function () {
        Bridge.call("SHTZ_pickFfxFile", []).then(function (res) {
          if (res.ok && res.data && res.data.path) { ffxPathEl.value = res.data.path; }
        });
      });

      saveBtn.addEventListener("click", function () {
        var name = nameEl.value.replace(/^\s+|\s+$/g, "");
        if (!name) { toast("Give the shortcut a name.", true); nameEl.focus(); return; }
        var target = self._editTarget;

        // Pinned .ffx tiles only expose Name + Color here - the type/code fields are hidden and
        // untouched, so saving must never fall through to the generic type-based validation below.
        if (isPinnedFfxTarget(target)) {
          var pinnedItems = self.getItems();
          for (var pi = 0; pi < pinnedItems.length; pi++) {
            if (pinnedItems[pi].id === target.item.id) { pinnedItems[pi].name = name; pinnedItems[pi].color = colorEl.value; break; }
          }
          self.saveItems(pinnedItems);
          self.refresh();
          toast('Saved changes to "' + name + '".');
          closeModal();
          return;
        }

        var type = typeEl.value;
        var payload = { type: type, name: name };
        if (type === "expr") {
          var code = codeEl.value.replace(/^\s+|\s+$/g, "");
          if (!code) { toast("Enter the expression code.", true); codeEl.focus(); return; }
          payload.code = code;
        } else if (type === "ffx-path") {
          var path = ffxPathEl.value.replace(/^\s+|\s+$/g, "");
          if (!path) { toast("Enter or browse to a .ffx file.", true); ffxPathEl.focus(); return; }
          payload.path = path;
        } else if (type === "jsx") {
          var jsxCode = jsxCodeEl.value.replace(/^\s+|\s+$/g, "");
          if (!jsxCode) { toast("Enter the JSX script.", true); jsxCodeEl.focus(); return; }
          payload.code = jsxCode;
        } else if (type === "cmd") {
          var cmdId = parseInt(cmdIdEl.value, 10);
          if (!cmdId || cmdId <= 0) { toast("Enter a valid numeric Command ID.", true); cmdIdEl.focus(); return; }
          payload.commandId = cmdId;
        }

        if (!target) {
          payload.color = colorEl.value;
          self.addItem(payload);
          toast('Added "' + name + '" to Shortcutz.');
        } else if (target.kind === "custom") {
          var items = self.getItems();
          for (var i = 0; i < items.length; i++) {
            if (items[i].id === target.item.id) {
              var updated = { id: target.item.id, type: payload.type, name: payload.name, color: colorEl.value };
              if (payload.code !== undefined) { updated.code = payload.code; }
              if (payload.path !== undefined) { updated.path = payload.path; }
              if (payload.commandId !== undefined) { updated.commandId = payload.commandId; }
              items[i] = updated;
              break;
            }
          }
          self.saveItems(items);
          self.refresh();
          toast('Saved changes to "' + name + '".');
        } else {
          TileCustom.set(target.key, "fn", payload);
          TileCustom.set(target.key, "accent", colorEl.value);
          self.rerender();
          toast('Saved changes to "' + name + '".');
        }
        closeModal();
      });
    },

    runItem: function (item, tileEl) {
      if (tileEl.classList.contains("is-loading")) { return; }
      tileEl.classList.add("is-loading");
      var call;
      if (item.type === "expr") { call = Bridge.call("EXPR_applyCode", [item.code]); }
      else if (item.type === "ffx") { call = Bridge.call("PRE_apply", [item.folder, item.file]); }
      else if (item.type === "ffx-path") { call = Bridge.call("SHTZ_applyFfxPath", [item.path]); }
      else if (item.type === "jsx") { call = Bridge.call("SHTZ_runCustomScript", [item.code]); }
      else if (item.type === "cmd") { call = Bridge.call("SHTZ_runCommandId", [item.commandId]); }
      else { tileEl.classList.remove("is-loading"); return; }

      call.then(function (res) {
        tileEl.classList.remove("is-loading");
        if (res.ok && item.type === "ffx") { presetLastStore.set(item.folder, item.file); }
        toast(res.message || (res.ok ? "Done." : "Something went wrong."), !res.ok);
      });
    },

    // Turns a saved function spec (an override .fn, or a My Shortcuts item shape) into the matching
    // Bridge call. Shared by runItem() semantics and runBuiltin()'s override path below.
    callForFn: function (fn) {
      if (fn.type === "expr") { return Bridge.call("EXPR_applyCode", [fn.code]); }
      if (fn.type === "ffx-path") { return Bridge.call("SHTZ_applyFfxPath", [fn.path]); }
      if (fn.type === "jsx") { return Bridge.call("SHTZ_runCustomScript", [fn.code]); }
      if (fn.type === "cmd") { return Bridge.call("SHTZ_runCommandId", [fn.commandId]); }
      return null;
    },

    runBuiltin: function (group, id, tileEl) {
      if (tileEl.classList.contains("is-loading")) { return; }
      var ov = TileCustom.getFor(group + ":" + id);
      var call = (ov && ov.fn) ? this.callForFn(ov.fn) : null;
      if (!call) {
        if (group === "expr") {
          var def = this.EXPR_PRESETS.filter(function (d) { return d.id === id; })[0];
          if (!def) { return; }
          call = Bridge.call("EXPR_applyCode", [def.code]);
        } else if (group === "effect") {
          var edef = this.EFFECT_PRESETS.filter(function (d) { return d.id === id; })[0];
          if (!edef) { return; }
          call = Bridge.call("SHTZ_addEffect", [edef.matchName, edef.name]);
        } else if (group === "util") {
          var udef = this.UTIL_PRESETS.filter(function (d) { return d.id === id; })[0];
          if (!udef) { return; }
          call = udef.run();
        } else {
          return;
        }
      }
      tileEl.classList.add("is-loading");
      call.then(function (res) {
        tileEl.classList.remove("is-loading");
        toast(res.message || (res.ok ? "Done." : "Something went wrong."), !res.ok);
      });
    },

    // ---- context-menu actions: icon / background / hide-delete (shared by built-in + custom tiles) ----
    setIcon: function (target, file) {
      var self = this;
      function applied(value) {
        if (!TileCustom.set(target.key, "icon", value)) { toast("Storage is full. The icon will not be kept after closing.", true); }
        if (target.kind === "custom") { self.refresh(); } else { self.rerender(); }
      }
      if (Node && file.path) {
        var dest = Node.persist(file, "tile-icon-" + sanitizeSlotKey(target.key));
        if (dest) { applied({ type: "path", src: Node.toFileUrl(dest) }); return; }
      }
      fileToDataURL(file, 160, 0.85).then(function (url) {
        applied({ type: "data", src: url });
      }).catch(function () { toast("Could not read that image.", true); });
    },

    setBg: function (target, file) {
      var self = this;
      function applied(value) {
        if (!TileCustom.set(target.key, "bg", value)) { toast("Storage is full. The background will not be kept after closing.", true); }
        if (target.kind === "custom") { self.refresh(); } else { self.rerender(); }
      }
      if (Node && file.path) {
        var dest = Node.persist(file, "tile-bg-" + sanitizeSlotKey(target.key));
        if (dest) { applied({ src: Node.toFileUrl(dest) }); return; }
      }
      // Fallback: raw (unresized) data URL, so an animated GIF keeps animating - resizing through a
      // canvas the way fileToDataURL does for icons would flatten it to a single still frame.
      fileToRawDataURL(file).then(function (url) {
        applied({ src: url });
      }).catch(function () { toast("Could not read that file.", true); });
    },

    // Removes the custom icon image so the tile falls back to its default glyph (mirror of clearBg).
    clearIcon: function (target) {
      TileCustom.set(target.key, "icon", null);
      if (target.kind === "custom") { this.refresh(); } else { this.rerender(); }
    },

    clearBg: function (target) {
      TileCustom.set(target.key, "bg", null);
      if (target.kind === "custom") { this.refresh(); } else { this.rerender(); }
    },

    deleteTile: function (target) {
      if (target.kind === "custom") {
        this.removeItem(target.item.id);
      } else {
        TileCustom.set(target.key, "hidden", true);
        this.rerender();
      }
    },

    // Wires clicks + drag-reorder for the "My Shortcuts" grid only (built-in grids are wired once,
    // from render(), since they never change shape).
    wireMyGrid: function (scopeEl) {
      var self = this;
      var grid = scopeEl.querySelector("#shortcutz-my-grid");
      if (!grid) { return; }

      grid.addEventListener("click", function (e) {
        var removeBtn = e.target.closest ? e.target.closest("[data-sc-remove]") : null;
        if (removeBtn) {
          self.removeItem(removeBtn.getAttribute("data-sc-remove"));
          return;
        }
        var runEl = e.target.closest ? e.target.closest("[data-sc-run]") : null;
        if (!runEl) { return; }
        var id = runEl.getAttribute("data-sc-run");
        var item = self.getItems().filter(function (it) { return it.id === id; })[0];
        if (item) { self.runItem(item, runEl); }
      });
      grid.addEventListener("keydown", function (e) {
        if (e.key !== "Enter" && e.key !== " ") { return; }
        var runEl = e.target.closest ? e.target.closest("[data-sc-run]") : null;
        if (!runEl) { return; }
        e.preventDefault();
        var item = self.getItems().filter(function (it) { return it.id === runEl.getAttribute("data-sc-run"); })[0];
        if (item) { self.runItem(item, runEl); }
      });
      grid.addEventListener("contextmenu", function (e) {
        var runEl = e.target.closest ? e.target.closest("[data-sc-run]") : null;
        if (!runEl) { return; }
        e.preventDefault();
        var item = self.getItems().filter(function (it) { return it.id === runEl.getAttribute("data-sc-run"); })[0];
        if (!item) { return; }
        ShortcutzMenu.open(e.clientX, e.clientY, { kind: "custom", key: "c:" + item.id, item: item });
      });

      // ---- drag-and-drop reordering ----
      var dragWrap = null;
      Array.prototype.forEach.call(grid.querySelectorAll(".saber-wrap--tile[draggable=\"true\"]"), function (wrapEl) {
        wrapEl.addEventListener("dragstart", function (e) {
          dragWrap = wrapEl;
          wrapEl.classList.add("is-dragging");
          try { e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", wrapEl.getAttribute("data-sc-id")); } catch (err) {}
        });
        wrapEl.addEventListener("dragend", function () {
          wrapEl.classList.remove("is-dragging");
          Array.prototype.forEach.call(grid.querySelectorAll(".saber-wrap--tile"), function (w) { w.classList.remove("drag-over-before", "drag-over-after"); });
          if (dragWrap) {
            var ids = Array.prototype.map.call(grid.querySelectorAll("[data-sc-id]"), function (w) { return w.getAttribute("data-sc-id"); });
            self.reorder(ids);
          }
          dragWrap = null;
        });
        wrapEl.addEventListener("dragover", function (e) {
          if (!dragWrap || dragWrap === wrapEl) { return; }
          e.preventDefault();
          try { e.dataTransfer.dropEffect = "move"; } catch (err) {}
          var rect = wrapEl.getBoundingClientRect();
          var before = (e.clientY - rect.top) < rect.height / 2;
          Array.prototype.forEach.call(grid.querySelectorAll(".saber-wrap--tile"), function (w) { w.classList.remove("drag-over-before", "drag-over-after"); });
          wrapEl.classList.add(before ? "drag-over-before" : "drag-over-after");
        });
        wrapEl.addEventListener("drop", function (e) {
          e.preventDefault();
          if (!dragWrap || dragWrap === wrapEl) { return; }
          var before = wrapEl.classList.contains("drag-over-before");
          wrapEl.parentNode.insertBefore(dragWrap, before ? wrapEl : wrapEl.nextSibling);
        });
      });
    },

    render: function () {
      var self = this;
      this.buildModal();

      var wrap = document.createElement("div");
      wrap.className = "ta shortcutz-tab"; // "shortcutz-tab" scopes the compact section/title styling in style.css to just this tab

      function builtinSection(title, hint, group, defs) {
        // Right-click "Hide Shortcut" on a built-in tile hides it here (restored via the link
        // below the My Shortcuts grid) - it can't be truly deleted since it's fixed panel code.
        var visible = defs.filter(function (d) { var ov = TileCustom.getFor(group + ":" + d.id); return !(ov && ov.hidden); });
        if (!visible.length) { return ""; }
        return '<div class="ta-section">' +
          '<h2 class="ta-title">' + title + "</h2>" +
          (hint ? '<p class="field-note">' + hint + "</p>" : "") +
          '<div class="shortcut-list" data-sc-group="' + group + '">' +
            visible.map(function (d) { return self.builtinTileHtml(group, d); }).join("") +
          "</div>" +
        "</div>";
      }

      var hiddenCount = TileCustom.hiddenCount();
      var restoreHtml = hiddenCount
        ? '<button type="button" class="btn" id="shortcutz-restore-hidden">Restore ' + hiddenCount + " hidden shortcut" + (hiddenCount === 1 ? "" : "s") + "</button>"
        : "";

      wrap.innerHTML =
        '<button class="btn-apply shortcutz-add-btn" id="shortcutz-add-btn" type="button">+ Add Custom Shortcut</button>' +
        '<div class="ta-section shortcutz-my-section">' +
          '<h2 class="ta-title">My Shortcuts</h2>' +
          '<p class="field-note">Pinned Animation Presets, pinned Code Expression snippets, and anything you add above. Drag a tile to reorder; the &times; removes it from Shortcutz only (the original preset/snippet is untouched). Right-click any tile - built-in or custom - to change its icon, set a background GIF/image, edit its function, or delete/hide it.</p>' +
          this.myGridHtml() +
          restoreHtml +
        "</div>" +
        builtinSection("Expression Shortcuts", "Select the target properties, then click a card to apply that expression.", "expr", this.EXPR_PRESETS) +
        builtinSection("Quick Effect Shortcuts", "Adds the native effect to every selected layer's Effect Parade.", "effect", this.EFFECT_PRESETS) +
        builtinSection("Utility Shortcuts", "Instant one-click workflow commands.", "util", this.UTIL_PRESETS);

      // Built-in tiles: click + right-click delegation on each fixed group (never re-rendered
      // in place - a customization instead triggers rerender(), which rebuilds this whole tab -
      // so wired once here).
      Array.prototype.forEach.call(wrap.querySelectorAll("[data-sc-group]"), function (gridEl) {
        var group = gridEl.getAttribute("data-sc-group");
        gridEl.addEventListener("click", function (e) {
          var btn = e.target.closest ? e.target.closest("[data-sc-builtin]") : null;
          if (!btn) { return; }
          var id = btn.getAttribute("data-sc-builtin").split(":")[1];
          self.runBuiltin(group, id, btn);
        });
        gridEl.addEventListener("contextmenu", function (e) {
          var btn = e.target.closest ? e.target.closest("[data-sc-builtin]") : null;
          if (!btn) { return; }
          e.preventDefault();
          var parts = btn.getAttribute("data-sc-builtin").split(":");
          ShortcutzMenu.open(e.clientX, e.clientY, { kind: "builtin", group: parts[0], id: parts[1], key: btn.getAttribute("data-sc-key") });
        });
      });

      wrap.querySelector("#shortcutz-add-btn").addEventListener("click", function () { self.openAddModal(); });

      var restoreBtn = wrap.querySelector("#shortcutz-restore-hidden");
      if (restoreBtn) { restoreBtn.addEventListener("click", function () { TileCustom.clearAllHidden(); self.rerender(); }); }

      this.wireMyGrid(wrap);
      this.applyTileCustomizations(wrap);

      return wrap;
    }
  };

  // ---------------------------------------------------------
  // Curve tab (NeuCurve)
  // NeuCurve ships as its own compiled app (../neucurve/). It runs inside a persistent iframe so its
  // CSS, scripts and window-level listeners are fully isolated from Multi Tool, and so it keeps its
  // state (graph, engine, unsaved edits) while you switch to other tabs. The frame is loaded the
  // first time the tab is opened, then only shown/hidden - never rebuilt.
  // ---------------------------------------------------------
  // Shared background + theme state. Settings writes it; the Curve tab (a separate document inside an iframe,
  // so it can't see this page's CSS variables) receives it by postMessage. opacity is 0-1; hasMedia is true
  // when a background image / GIF / video is set. themeHex/themeRgb are the CURRENT accent (custom, or the
  // default when never set / reset) - see neucurve/nc-theme-sync.js for what it does with them there.
  // bgHex/bgRgb are the Settings > Background COLOR picker's value - null/null when unset (Reset, or the panel
  // is on its automatic light/dark default), never a synthesized value, so NeuCurve only ever overrides its own
  // (dark-only) native colors when the user explicitly picked one - see applyColor() below and the note there
  // about why the auto light-theme case is deliberately excluded.
  var BgState = { opacity: 1, hasMedia: false, bgHex: null, bgRgb: null };
  var ThemeState = { hex: null, rgb: null };

  var Curve = {
    pane: $("curve-pane"),
    frame: $("curve-frame"),
    started: false,

    scheme: function () {
      return document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark";
    },

    // The panel's real background color right now (custom pick, Material You palette, or the light/dark default) as #rrggbb.
    panelBg: function () {
      var raw = "";
      try { raw = (getComputedStyle(document.documentElement).getPropertyValue("--bg") || "").trim(); } catch (e) { }
      var m = /^#([0-9a-f]{6})$/i.exec(raw);
      if (m) { return "#" + m[1].toLowerCase(); }
      m = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(raw);
      if (m) { return ("#" + m[1] + m[1] + m[2] + m[2] + m[3] + m[3]).toLowerCase(); }
      try { raw = getComputedStyle(document.body).backgroundColor || ""; } catch (e2) { raw = ""; }
      m = /rgba?\(\s*(\d+)[ ,]+(\d+)[ ,]+(\d+)/.exec(raw);
      if (!m) { return null; }
      return "#" + [m[1], m[2], m[3]].map(function (n) { n = Math.max(0, Math.min(255, +n)); return (n < 16 ? "0" : "") + n.toString(16); }).join("");
    },

    // Re-sync whenever the panel's style/scheme changes (Settings > Style, Light/Dark, Material You palette, AE UI brightness).
    watchScheme: function () {
      var self = this, raf = 0;
      function go() { if (raf) { return; } raf = requestAnimationFrame(function () { raf = 0; self.sync(); }); }
      try {
        new MutationObserver(go).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "data-ui-theme", "data-md-scheme", "data-md-bg"] });
      } catch (e) { }
      try { document.addEventListener("mt-palette", go); } catch (e2) { }
    },

    // Pushes the current background + theme state into the NeuCurve iframe (see neucurve/index.html and
    // neucurve/nc-theme-sync.js). postMessage works whether or not the frame counts as same-origin, so
    // nothing else is needed.
    sync: function (force) {
      var msg = {
        mtBg: true,
        opacity: BgState.opacity,
        hasMedia: BgState.hasMedia,
        themeHex: ThemeState.hex,
        themeRgb: ThemeState.rgb,
        bgHex: BgState.bgHex,
        bgRgb: BgState.bgRgb,
        // Panel style scheme ("light" | "dark", = <html data-theme>: Glass auto/pinned light-dark, or Material You's
        // scheme) + the panel's EFFECTIVE background color, so NeuCurve can switch to its light look by itself.
        scheme: Curve.scheme(),
        panelBgHex: Curve.panelBg(),
        motionOff: document.documentElement.getAttribute("data-reduce-motion") === "true"
      };
      // Flicker fix: many panel events call sync() with an unchanged state (every opacity-slider tick, bg updates...).
      // Re-posting identical data made the NeuCurve frame restyle itself for nothing, which showed as a quick blink.
      // The frame's load event / mtBgRequest pass force=true so a fresh frame always gets the state.
      var key = JSON.stringify(msg);
      if (!force && key === this._lastSync) { return; }
      this._lastSync = key;
      try {
        if (this.frame && this.frame.contentWindow) {
          this.frame.contentWindow.postMessage(msg, "*");
        }
      } catch (e) { /* frame not ready yet - it asks again when it loads */ }
      // The Large Graph Editor / NeuCurve Settings are SEPARATE CEP windows (not iframes), so postMessage never
      // reaches them. Hand them the same state through localStorage (read on load + "storage" event) and a CEP
      // application-scope event (live updates while they're open). See neucurve/nc-theme-sync.js.
      this.broadcastExternal(msg);
    },

    broadcastExternal: function (msg) {
      var json = JSON.stringify(msg);
      try { localStorage.setItem("mt_theme_state", json); } catch (e) { }
      try {
        var cep = window.__adobe_cep__;
        if (!cep || !cep.dispatchEvent) { return; }
        var host = "", extId = "";
        try { host = JSON.parse(cep.getHostEnvironment()).appName; } catch (e1) { }
        try { extId = cep.getExtensionId(); } catch (e2) { }
        cep.dispatchEvent({ type: "com.multitool.theme.sync", scope: "APPLICATION", appId: host, extensionId: extId, data: json });
      } catch (e3) { /* not running inside CEP */ }
    },

    show: function () {
      var self = this, main = $("main");
      if (!this.started) {
        this.started = true;
        this.pane.classList.add("is-loading");
        /* v28: keep the spinner until the frame says its modes are warmed up ({mtCurveReady}, see neucurve/nc-warm.js); 4 s safety net */
        this.frame.addEventListener("load", function () { self.sync(true); setTimeout(function () { self.pane.classList.remove("is-loading"); }, 4000); });
        this.frame.src = this.frame.getAttribute("data-src");
      }
      main.classList.add("is-curve");
      document.documentElement.classList.add("mt-curve-open");
      /* v27: a playing background video repaints under the NeuCurve iframe every frame - pause it while the Curve tab is open */
      try { var bv = $("bg-motion-video"); if (bv && !bv.paused) { bv.pause(); this._bvPaused = true; } } catch (e0) { }
      main.scrollTop = 0;
      this.pane.classList.add("is-active");
      this.pane.setAttribute("aria-hidden", "false");
      this.pane.classList.remove("is-entering");
      void this.pane.offsetWidth;
      this.pane.classList.add("is-entering");
    },

    hide: function () {
      $("main").classList.remove("is-curve");
      document.documentElement.classList.remove("mt-curve-open");
      try { if (this._bvPaused) { this._bvPaused = false; var bv2 = $("bg-motion-video"); if (bv2 && bv2.play) { var pr = bv2.play(); if (pr && pr.catch) { pr.catch(function () { }); } } } } catch (e1) { }
      this.pane.classList.remove("is-active", "is-entering");
      this.pane.setAttribute("aria-hidden", "true");
    }
  };

  Curve.watchScheme();

  window.addEventListener("message", function (e) {
    if (e.data && e.data.mtBgRequest && e.source === Curve.frame.contentWindow) { Curve.sync(true); }
    if (e.data && e.data.mtCurveReady && e.source === Curve.frame.contentWindow) { Curve.pane.classList.remove("is-loading"); }
  });

  // A separate NeuCurve window (Large Graph Editor / Settings) announces itself on load and asks for the current theme.
  try {
    if (window.__adobe_cep__ && window.__adobe_cep__.addEventListener) {
      window.__adobe_cep__.addEventListener("com.multitool.theme.request", function () { Curve.sync(true); });
    }
  } catch (e) { }

  // ---- Per-tab scroll memory ----
  // showTab() wipes and rebuilds the panel, which sends .main back to the top. Remember where each tab
  // was scrolled (memory only - a fresh After Effects start still opens at the top) and put it back
  // when the tab is shown again. Tabs whose content loads asynchronously (the preset list) are too
  // short at first for the saved offset to stick, so the restore is retried briefly, and re-applied
  // when the list finishes rendering; any wheel / touch / click / key press by the person cancels it.
  var tabScroll = {};
  var scrollPending = null;

  // .main has `scroll-behavior: smooth` (css/style.css), so every plain `scrollTop = n` becomes an animated scroll. A restore that is
  // retried every 80 ms would restart that animation again and again, which is what made coming back to a tab (Animation presets)
  // crawl down in jerks. Restores must jump: switch the behaviour off for the one assignment, then put it back.
  function jumpScroll(el, top) {
    if (!el) { return; }
    var prev = el.style.scrollBehavior;
    el.style.scrollBehavior = "auto";
    el.scrollTop = top;
    el.style.scrollBehavior = prev;
  }

  function applyScrollRestore() {
    if (!scrollPending) { return; }
    var m = $("main");
    jumpScroll(m, scrollPending.top);
    if (Math.abs(m.scrollTop - scrollPending.top) <= 1) { scrollPending = null; }
  }

  function queueScrollRestore(tabId) {
    var top = tabScroll[tabId];
    scrollPending = top ? { tabId: tabId, top: top, tries: 0 } : null;
    if (!scrollPending) { return; }
    (function tick() {
      if (!scrollPending || scrollPending.tabId !== currentTab) { return; }
      applyScrollRestore();
      if (scrollPending && ++scrollPending.tries < 25) { setTimeout(tick, 80); } else { scrollPending = null; }
    })();
  }

  ["wheel", "touchstart", "mousedown", "keydown"].forEach(function (evt) {
    document.addEventListener(evt, function (e) {
      var m = $("main");
      if (scrollPending && m && m.contains(e.target)) { scrollPending = null; }
    }, true);
  });

  // ---- Tab-switch motion (css/tab-motion.css) ----
  // showTab() = wrapper: highlights the clicked tab at once, plays a very short "leave" on the old
  // content (~110ms), then renderTab() swaps the content and plays the staggered card entrance.
  var MT_LEAVE_MS = 110;
  var MT_STAGGER_SEL = ".tool, .ta-group, .beat-card, .snippet-card, .info, .empty, .expr-item, " +
    ".preset-folder, .preset-item, .qce-res-tile, .saber-wrap--tile, .shortcut-tile, .switch-row, .flip-btn";   // .flip-btn: Easy Layer Flip row sits outside any .ta-group
  var MT_STAGGER_MAX = 14;
  var leaveTimer = null;
  var staggerTimer = null;

  function motionOff() {
    var de = document.documentElement;
    // Opt-in only (same policy as style.css): the OS "reduce motion" setting is deliberately ignored.
    return de.getAttribute("data-reduce-motion") === "true";
  }

  function markTabsActive(tabId) {
    var tabs = document.querySelectorAll(".tabs .tab");
    Array.prototype.forEach.call(tabs, function (t) {
      var active = t.getAttribute("data-tab") === tabId;
      t.classList.toggle("is-active", active);
      t.setAttribute("aria-selected", active ? "true" : "false");
      t.tabIndex = active ? 0 : -1;
    });
  }

  // Gives the first few visible cards of the freshly built panel an index for the CSS stagger delay
  // (see staggerWithin below; only the first MT_STAGGER_MAX get a growing delay).
  function staggerCards() {
    if (staggerTimer) { clearTimeout(staggerTimer); }
    // Drop the helper class once the entrance is over, so later display toggles (search filters,
    // collapsing cards) can never replay the animation on their own.
    staggerTimer = setTimeout(function () {
      staggerTimer = null;
      var done = panel.querySelectorAll(".mt-stagger");
      Array.prototype.forEach.call(done, function (el) { el.classList.remove("mt-stagger"); });
    }, (window.MTAnim && window.MTAnim.cleanupMs) ? window.MTAnim.cleanupMs() : 900);   // Settings > Tab animation: slower speed / Cascade need longer than 900 ms
    staggerWithin(panel, true);
  }

  // Gives each visible card under `root` an index for the CSS stagger delay. Only cards that are actually
  // on screen count: rows inside a collapsed folder (display:none) or scrolled out of view (the restored
  // scroll offset is already applied by then) used to eat the 42-slot cap, so the cards the person really
  // saw did not animate, or animated late. `viaTimer` = the caller (staggerCards) already armed the cleanup.
  function staggerWithin(root, viaTimer) {
    var nodes = root.querySelectorAll(MT_STAGGER_SEL);
    var main = $("main"), mr = main ? main.getBoundingClientRect() : null;
    var useView = !!(mr && mr.height > 1);
    var made = [], k = 0, i;
    for (i = 0; i < nodes.length && k < MT_STAGGER_MAX * 3; i++) {
      var el = nodes[i];
      if (!el.getClientRects().length) { continue; }              // display:none (collapsed folder, filtered row)
      if (useView) {
        var r = el.getBoundingClientRect();
        if (r.top > mr.bottom + 40) { break; }                    // DOM order = top-to-bottom: nothing further is on screen
        if (r.bottom < mr.top - 40) { continue; }                 // scrolled above the view
      }
      // Skip nested matches (e.g. a .tool inside an already-animated .ta-group): one animation per block.
      var p = el.parentNode, nested = false;
      while (p && p !== root) {
        if (p.classList && p.classList.contains("mt-stagger")) { nested = true; break; }
        p = p.parentNode;
      }
      if (nested) { continue; }
      el.classList.add("mt-stagger");
      el.style.setProperty("--mt-i", String(Math.min(k, MT_STAGGER_MAX)));
      made.push(el);
      k++;
    }
    if (!viaTimer && made.length) {
      // Late reveal (list that finished loading after the tab entrance): drop the class again afterwards.
      setTimeout(function () {
        for (var j = 0; j < made.length; j++) { made[j].classList.remove("mt-stagger"); }
      }, (window.MTAnim && window.MTAnim.cleanupMs) ? window.MTAnim.cleanupMs() : 900);
    }
  }

  function showTab(tabId) {
    if (!TABS[tabId]) { return; }
    if (leaveTimer) { clearTimeout(leaveTimer); leaveTimer = null; }
    var head = document.querySelector(".panel-head");
    var hasOld = panel && panel.firstChild && currentTab && currentTab !== tabId &&
                 TABS[currentTab] && TABS[currentTab].custom !== "curve";
    if (!hasOld || motionOff()) {
      panel.classList.remove("is-leaving");
      if (head) { head.classList.remove("is-leaving"); }
      renderTab(tabId);
      return;
    }
    markTabsActive(tabId);
    moveIndicator();
    scrollTabIntoView(tabId);
    panel.classList.add("is-leaving");
    if (head) { head.classList.add("is-leaving"); }
    leaveTimer = setTimeout(function () {
      leaveTimer = null;
      panel.classList.remove("is-leaving");
      if (head) { head.classList.remove("is-leaving"); }
      renderTab(tabId);
    }, MT_LEAVE_MS);
  }

  // ---- Form state across tab switches ----
  // renderTab() tears the panel down and rebuilds it, so anything typed into a tab (Expression Code, snippet
  // name, TextFlex values, Quick Comp fields, ...) used to vanish on the next tab switch. FormState remembers
  // every field the USER changed (trusted input/change events only, so auto-filled defaults are never frozen)
  // and puts it back when that tab is built again. Kept for the whole panel session (in memory).
  var FormState = {
    saved: {},          // tabId -> { key: { t: "v"|"c", v: value/checked, r: radioValue } }
    watching: false,

    watch: function (container) {
      if (this.watching) { return; }
      this.watching = true;
      var mark = function (e) {
        var el = e.target;
        if (!el || !el.tagName || e.isTrusted === false) { return; }
        var tg = el.tagName;
        if (tg === "INPUT" || tg === "TEXTAREA" || tg === "SELECT") { el._mtTouched = true; }
      };
      container.addEventListener("input", mark, true);
      container.addEventListener("change", mark, true);
    },

    fields: function (container) {
      var out = [];
      var list = container.querySelectorAll("input, textarea, select");
      Array.prototype.forEach.call(list, function (el, i) {
        var type = (el.type || "").toLowerCase();
        if (type === "file" || type === "button" || type === "submit" || type === "reset" || type === "color" || type === "password") { return; }
        if (el.hasAttribute("data-no-restore")) { return; }
        var key = el.id ? "#" + el.id : null;
        if (!key) {
          var row = el.closest ? el.closest("[data-prop]") : null;
          if (type === "radio" && el.name) { key = "r:" + el.name + "=" + el.value; }
          else if (row && el.getAttribute("data-axis")) { key = "p:" + row.getAttribute("data-prop") + "." + el.getAttribute("data-axis"); }
          else if (row) { key = "p:" + row.getAttribute("data-prop") + "." + (type || el.tagName.toLowerCase()) + i; }
          else { key = "i:" + i + (el.name ? ":" + el.name : ""); }
        }
        out.push({ key: key, el: el, type: type });
      });
      return out;
    },

    save: function (tabId, container) {
      if (!tabId || !container) { return; }
      var data = {};
      this.fields(container).forEach(function (f) {
        var el = f.el;
        if (!el._mtTouched) { return; }
        if (f.type === "checkbox" || f.type === "radio") { data[f.key] = { c: !!el.checked }; }
        else { data[f.key] = { v: el.value }; }
      });
      // Radio groups: only the checked member of a touched group carries state, and unchecked siblings
      // must not overwrite it on restore - so a touched radio stores checked=true/false as-is.
      var keys = Object.keys(data);
      if (keys.length) { this.saved[tabId] = Object.assign ? Object.assign(this.saved[tabId] || {}, data) : data; }
    },

    restore: function (tabId, container) {
      var data = this.saved[tabId];
      if (!data || !container) { return; }
      var radioHit = {};
      this.fields(container).forEach(function (f) {
        var d = data[f.key], el = f.el;
        if (!d) { return; }
        if (f.type === "checkbox") {
          if ("c" in d) { el.checked = d.c; el._mtTouched = true; }
        } else if (f.type === "radio") {
          if ("c" in d && d.c) { el.checked = true; el._mtTouched = true; }
        } else if ("v" in d) {
          if (f.el.tagName === "SELECT") {
            var has = false, o;
            for (o = 0; o < el.options.length; o++) { if (el.options[o].value === d.v) { has = true; break; } }
            if (!has) { return; }
          }
          if (el.value !== d.v) {
            el.value = d.v;
            // let listeners (live filters, dirty flags, linked number/slider pairs) see the change
            try { el.dispatchEvent(new Event("input", { bubbles: true })); } catch (e) { }
          }
          el._mtTouched = true;
        }
      });
    }
  };

  function renderTab(tabId) {
    var cfg = TABS[tabId];
    if (!cfg) { return; }
    // Save the outgoing tab's scroll offset before its panel is torn down (the Curve frame has no
    // scrolling of its own, so it is skipped).
    if (currentTab && TABS[currentTab] && TABS[currentTab].custom !== "curve") {
      tabScroll[currentTab] = $("main").scrollTop;
    }
    // Remember what the user typed in the outgoing tab before its panel is torn down (see FormState).
    if (currentTab === "textflex" && TextFlex.snapshot) { try { TextFlex.snapshot(); } catch (eTf) { } }   // TextFlex keeps its own copy of its values
    if (currentTab && TABS[currentTab] && TABS[currentTab].custom !== "curve") { FormState.save(currentTab, panel); }
    FormState.watch(panel);
    scrollPending = null;
    currentTab = tabId;

    var tabs = document.querySelectorAll(".tabs .tab");
    Array.prototype.forEach.call(tabs, function (t) {
      var active = t.getAttribute("data-tab") === tabId;
      t.classList.toggle("is-active", active);
      t.setAttribute("aria-selected", active ? "true" : "false");
      t.tabIndex = active ? 0 : -1;
    });

    moveIndicator();
    scrollTabIntoView(tabId);

    $("panel-title").textContent = cfg.title;
    $("panel-hint").textContent = cfg.hint || "";
    panel.innerHTML = "";

    // Curve is a persistent frame, not a rebuilt grid: show it and stop here.
    if (cfg.custom === "curve") { Curve.show(); return; }
    Curve.hide();

    var built = null;
    if (cfg.info) {
      built = renderInfo();
    } else if (cfg.custom === "anchorAlign") {
      built = AnchorAlign.render();
    } else if (cfg.custom === "quickCompEdit") {
      built = QuickCompEdit.render();
    } else if (cfg.custom === "colorPalette") {
      built = ColorPalette.render();
    } else if (cfg.custom === "exprCode") {
      built = ExprCode.render();
    } else if (cfg.custom === "presets") {
      built = Presets.render();
    } else if (cfg.custom === "utilityTools") {
      built = UtilityTools.render();
    } else if (cfg.custom === "textFlex") {
      built = TextFlex.render();
    } else if (cfg.custom === "shortcutz") {
      built = Shortcutz.render();
    } else if (!cfg.tools.length) {
      var empty = document.createElement("div");
      empty.className = "empty";
      empty.textContent = cfg.empty || "Nothing here yet.";
      built = empty;
    } else {
      if (tabId === "easy-layer") { panel.appendChild(EasyLayerOptions.render()); }   // Auto Parent switch above the grid
      var grid = document.createElement("div");
      grid.className = "grid";
      cfg.tools.forEach(function (t) { grid.appendChild(buildTool(tabId, t)); });
      built = grid;
    }
    panel.appendChild(built);
    if (tabId === "easy-layer") { panel.appendChild(EasyLayerFlip.render()); }   // Flip Horizontal/Vertical beneath the grid

    // Feature B: grouped capsule cards, applied panel-wide. groupifyTaSections() only wraps
    // DIRECT ".ta-section" children of the node it's given, so calling it once here on `built`
    // (the single root element every render() function above returns) covers every tab in one
    // place instead of each tab module having to call it itself. Harmless no-op on tabs with no
    // ".ta-section" markup (Info, the plain tool grids).
    if (window.PanelRefinements && window.PanelRefinements.groupifyTaSections) {
      window.PanelRefinements.groupifyTaSections(built, { tabId: tabId, openFirst: !(built.getAttribute && built.getAttribute("data-open-first") === "0") });
    }
    if (window.MTBoxes) { try { window.MTBoxes.afterRender(tabId, built); } catch (e) { } }   // boxes can be dragged onto the dynamic island (js/mt-island-boxes.js)
    FormState.restore(tabId, panel);
    queueScrollRestore(tabId);

    // fade in + slide up (panel and header; opacity + transform only)
    var head = document.querySelector(".panel-head");
    panel.classList.remove("is-entering");
    if (head) { head.classList.remove("is-entering"); }
    staggerCards();                         // per-card delay index for css/tab-motion.css
    void panel.offsetWidth;                 // restart the CSS animation on every tab switch
    panel.classList.add("is-entering");
    if (head) { head.classList.add("is-entering"); }
  }

  // ---------------------------------------------------------
  // Draggable sidebar tabs (reorder + persist order)
  // ---------------------------------------------------------
  function saveTabOrder(container) {
    var order = Array.prototype.map.call(container.querySelectorAll(".tab"), function (t) {
      return t.getAttribute("data-tab");
    });
    Store.set("tabOrder", JSON.stringify(order));
  }

  function restoreTabOrder(container) {
    var saved;
    try { saved = JSON.parse(Store.get("tabOrder") || "null"); } catch (e) { saved = null; }
    if (!saved || !saved.length) { return; }

    var tabs = Array.prototype.slice.call(container.querySelectorAll(".tab"));
    var byId = {};
    tabs.forEach(function (t) { byId[t.getAttribute("data-tab")] = t; });

    // Re-append in the saved order first...
    saved.forEach(function (id) {
      if (byId[id]) { container.appendChild(byId[id]); delete byId[id]; }
    });
    // ...then anything new (added since the order was last saved) goes at the end.
    tabs.forEach(function (t) {
      var id = t.getAttribute("data-tab");
      if (byId[id]) { container.appendChild(byId[id]); delete byId[id]; }
    });
  }

  // Tab reorder = press-and-HOLD, then drag (custom mouse handling; the native HTML5 drag was removed).
  // The old native "draggable" started a drag after only a few pixels of movement, so just gliding the mouse over
  // the sidebar icons while pressing (or a slightly shaky click) flashed the drag ghost / cursor. Now:
  //   - a normal click or a quick move never drags;
  //   - hold the button on a tab for TAB_HOLD_MS without moving more than TAB_SLOP px -> that tab "lifts"
  //     (dimmed, grabbing cursor) and can be dropped before/after another tab; Esc or leaving the window cancels.
  var TAB_HOLD_MS = 550;
  var TAB_SLOP = 5;

  function initTabDragReorder(container) {
    var pending = null;      // { tab, x, y, timer } - button is down, hold timer running
    var dragEl = null;       // tab being dragged (after the hold fired)
    var overEl = null, overBefore = true;
    var swallowClick = false;

    function clearDragOverClasses() {
      Array.prototype.forEach.call(container.querySelectorAll(".tab"), function (t) {
        t.classList.remove("drag-over-before", "drag-over-after");
      });
    }

    function cancelPending() {
      if (pending) { clearTimeout(pending.timer); pending = null; }
    }

    function endDrag() {
      if (dragEl) { dragEl.classList.remove("is-dragging"); }
      document.documentElement.classList.remove("is-tab-dragging");
      clearDragOverClasses();
      dragEl = null; overEl = null;
    }

    function tabAt(x, y) {
      var el = document.elementFromPoint(x, y);
      while (el && el !== container) {
        if (el.classList && el.classList.contains("tab") && el.parentNode === container) { return el; }
        el = el.parentNode;
      }
      return null;
    }

    container.addEventListener("mousedown", function (e) {
      if (e.button !== 0) { return; }
      var t = e.target;
      while (t && t !== container && !(t.classList && t.classList.contains("tab"))) { t = t.parentNode; }
      if (!t || t === container) { return; }
      cancelPending();
      var tab = t;
      pending = { tab: tab, x: e.clientX, y: e.clientY, timer: setTimeout(function () {
        pending = null;
        dragEl = tab;
        swallowClick = true;
        tab.classList.add("is-dragging");
        document.documentElement.classList.add("is-tab-dragging");
      }, TAB_HOLD_MS) };
    });

    document.addEventListener("mousemove", function (e) {
      if (pending) {
        if (Math.abs(e.clientX - pending.x) > TAB_SLOP || Math.abs(e.clientY - pending.y) > TAB_SLOP) { cancelPending(); }
        return;
      }
      if (!dragEl) { return; }
      var t = tabAt(e.clientX, e.clientY);
      clearDragOverClasses();
      if (!t || t === dragEl) { overEl = null; return; }
      var rect = t.getBoundingClientRect();
      overBefore = (e.clientY - rect.top) < rect.height / 2;
      overEl = t;
      t.classList.add(overBefore ? "drag-over-before" : "drag-over-after");
    });

    document.addEventListener("mouseup", function () {
      cancelPending();
      if (!dragEl) { return; }
      if (overEl && overEl !== dragEl) {
        if (overBefore) { container.insertBefore(dragEl, overEl); }
        else { container.insertBefore(dragEl, overEl.nextSibling); }
        endDrag();
        moveIndicator();       // animates to the new slot via the existing CSS transition
        saveTabOrder(container);
      } else {
        endDrag();
      }
    });

    // The click that follows a drop must not switch tabs.
    container.addEventListener("click", function (e) {
      if (swallowClick) { swallowClick = false; e.stopPropagation(); e.preventDefault(); }
    }, true);

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" || e.keyCode === 27) { cancelPending(); endDrag(); }
    });
    window.addEventListener("blur", function () { cancelPending(); endDrag(); });

    // Keep a stray native drag (images / text inside a tab) from ever starting.
    container.addEventListener("dragstart", function (e) { e.preventDefault(); });
  }

  // ---------------------------------------------------------
  // Responsive layout: real-time panel resize handling.
  // The tile/card grids reflow on their own via CSS Grid auto-fit (see style.css), so no JS is
  // needed just to keep them from breaking. This adds a JS-side hook on top of that for anything
  // that isn't pure CSS (e.g. dropping tile names on very narrow docks): a ResizeObserver on
  // .app, which - unlike window's "resize" event - reliably fires whenever the CEP panel itself
  // changes size (docking/undocking, splitter drags, floating-window drags), even on hosts where
  // the panel is resized without the containing browser window firing its own resize event.
  // ---------------------------------------------------------
  function initResponsiveLayout() {
    var appEl = document.querySelector(".app");
    if (!appEl) { return; }

    var lastSize = "";
    function applyBreakpoint(width) {
      var size = width < 260 ? "xs" : width < 340 ? "s" : width < 460 ? "m" : "l";
      if (size !== lastSize) {
        lastSize = size;
        appEl.setAttribute("data-panel-size", size);
      }
    }

    if (typeof ResizeObserver === "function") {
      var ro = new ResizeObserver(function (entries) {
        var w = (entries[0] && entries[0].contentRect) ? entries[0].contentRect.width : appEl.clientWidth;
        applyBreakpoint(w);
      });
      ro.observe(appEl);
    } else {
      // Fallback for older CEF builds (AE 2021) without ResizeObserver support.
      window.addEventListener("resize", function () { applyBreakpoint(appEl.clientWidth); });
    }

    applyBreakpoint(appEl.clientWidth);
  }

  function initTabs() {
    var tabsContainer = document.querySelector(".tabs");
    restoreTabOrder(tabsContainer);

    var tabs = Array.prototype.slice.call(tabsContainer.querySelectorAll(".tab"));
    tabs.forEach(function (t) {
      t.addEventListener("click", function () {
        if (t.getAttribute("data-tab") !== currentTab) { showTab(t.getAttribute("data-tab")); }
      });
      t.addEventListener("keydown", function (e) {
        // Query live, since drag-and-drop can change DOM order at any time.
        var live = Array.prototype.slice.call(tabsContainer.querySelectorAll(".tab"));
        var i = live.indexOf(t);
        var next = null;
        if (e.key === "ArrowDown") { next = live[(i + 1) % live.length]; }
        if (e.key === "ArrowUp") { next = live[(i - 1 + live.length) % live.length]; }
        if (next) { e.preventDefault(); next.focus(); next.click(); }
      });
    });

    initTabDragReorder(tabsContainer);

    // After "Refresh Panel" the panel reopens on the tab you were on (key is read once, then removed).
    var startTab = "easy-layer";
    try {
      var reopen = localStorage.getItem("mt_reopen_tab");
      if (reopen) { localStorage.removeItem("mt_reopen_tab"); if (TABS[reopen]) { startTab = reopen; } }
    } catch (e) { }
    showTab(startTab);
    window.addEventListener("resize", function () { indicatorPlaced = false; moveIndicator(); });
  }

  // ---------------------------------------------------------
  // Context menu (right-click on a tool square)
  // ---------------------------------------------------------
  var ContextMenu = {
    el: $("ctx-menu"),
    target: null,

    open: function (x, y, toolEl) {
      this.target = toolEl;
      $("ctx-clear").disabled = !toolEl.classList.contains("has-img");
      this.el.classList.add("is-open");
      this.el.setAttribute("aria-hidden", "false");

      document.dispatchEvent(new CustomEvent("mtx:ctx-open", { detail: { id: "tool" } }));
      // keep the menu inside the panel
      var w = this.el.offsetWidth, h = this.el.offsetHeight;
      var px = Math.max(4, Math.min(x, window.innerWidth - w - 4));
      var py = Math.max(4, Math.min(y, window.innerHeight - h - 4));
      this.el.style.left = px + "px";
      this.el.style.top = py + "px";
    },

    close: function () {
      this.el.classList.remove("is-open");
      this.el.setAttribute("aria-hidden", "true");
    },

    init: function () {
      var self = this;
      $("ctx-set").addEventListener("click", function () { $("tool-file").click(); self.close(); });
      $("ctx-clear").addEventListener("click", function () {
        var t = self.target;
        if (t) { Store.remove(imgKey(t.getAttribute("data-tab"), t.getAttribute("data-tool"))); applyToolImage(t, null); }
        self.close();
      });

      $("tool-file").addEventListener("change", function (e) {
        var file = e.target.files && e.target.files[0], t = self.target;
        e.target.value = "";
        if (!file || !t) { return; }
        fileToDataURL(file, 256, 0.82).then(function (url) {
          if (Store.set(imgKey(t.getAttribute("data-tab"), t.getAttribute("data-tool")), url)) {
            applyToolImage(t, url);
          } else {
            applyToolImage(t, url); // still show it this session
            toast("Storage is full. The image will not be kept after closing.", true);
          }
        }).catch(function () { toast("Could not read that image.", true); });
      });

      document.addEventListener("mousedown", function (e) { if (!self.el.contains(e.target)) { self.close(); } });
      document.addEventListener("keydown", function (e) { if (e.key === "Escape") { self.close(); } });
      window.addEventListener("blur", function () { self.close(); });
      window.addEventListener("resize", function () { self.close(); });
      panel.addEventListener("scroll", function () { self.close(); });
      document.addEventListener("scroll", function () { self.close(); }, true);
      document.addEventListener("mtx:ctx-open", function (e) { if (!e.detail || e.detail.id !== "tool") { self.close(); } });
    }
  };

  // ---------------------------------------------------------
  // Settings modal (background color / image)
  // ---------------------------------------------------------
  var Settings = {
    modal: $("settings-modal"),
    defaultColor: "#16161a",
    opacityKey: "bgOpacity",
    opacityPending: null,
    opacityRaf: 0,

    applyColor: function (hex) {
      if (hex) {
        document.documentElement.style.setProperty("--bg", hex);
        $("bg-color").value = hex;
        this.applyCardSurfaces(hex);
        var rgb = this.hexToRgbChannels(hex);
        BgState.bgHex = hex;
        BgState.bgRgb = rgb ? rgb.join(",") : null;
      } else {
        // No custom color: let --bg (and --surface/--surface-hover/--surface-sunken) fall back to
        // the plain CSS cascade - :root's dark defaults, or the :root[data-theme="light"] block when
        // the AE host UI is light (see the brightness check near the bottom of this file). Forcing a
        // hex here would always compute DARK-derived surfaces and override the light-theme block.
        document.documentElement.style.removeProperty("--bg");
        document.documentElement.style.removeProperty("--surface");
        document.documentElement.style.removeProperty("--surface-hover");
        document.documentElement.style.removeProperty("--surface-sunken");
        document.documentElement.style.removeProperty("--panel-bg");
        document.documentElement.style.removeProperty("--surface-card");
        document.documentElement.style.removeProperty("--surface-solid");
        document.documentElement.style.removeProperty("--surface-hover-solid");
        document.documentElement.style.removeProperty("--curve-bg");
        document.documentElement.style.removeProperty("--curve-bg-rgb");
        $("bg-color").value = this.defaultColor;
        // Also don't push a synthesized hex into NeuCurve here (see BgState's comment above): with no
        // custom pick, bgHex/bgRgb go back to null so nc-theme-sync.js removes its overrides and NeuCurve
        // shows its own native dark colors - safe in both the plain-dark-default case and the
        // automatic-light-host case, since NeuCurve has no light variant of its own to switch to.
        BgState.bgHex = null;
        BgState.bgRgb = null;
      }
      try { document.dispatchEvent(new CustomEvent("mt-palette-preview")); } catch (e) { }   // Settings > Style preview cards follow the new color
      Curve.sync();
    },

    // ---------------------------------------------------------
    // Dynamic card/box theming sink.
    // --surface / --surface-hover / --surface-sunken are the tokens every card and input in the
    // panel is built on (tool tiles in Layer Utilities, Auto Parent boxes, TextFlex property
    // inputs, Quick Comp Edit resolution tiles, preset-item, expr-item, snippet-card, code-editor,
    // .text-input, .code-area, etc - see style.css). Previously those three were plain fixed hex
    // values in :root, so picking a new background color moved --bg but left every card pinned to
    // its old fixed color - which is the exact "some container backgrounds misaligned or static"
    // bug this fixes. Called from applyColor() on every color change (custom pick AND reset), so
    // it's the single sink every card-bg update flows through.
    //
    // Each surface tier is the base color nudged by a fixed per-channel offset, matching the
    // relationship the original fixed defaults had (--bg #1e1e1e -> --surface #252525 is +7,
    // --surface-hover #2d2d2d is +15, --surface-sunken #181818 is -6), so cards keep the same
    // relative "elevation" look at any base color instead of just being re-hued flat.
    // ---------------------------------------------------------
    surfaceOffsets: { surface: 7, hover: 15, sunken: -6 },

    hexToRgbChannels: function (hex) {
      var m = /^#?([0-9a-f]{6})$/i.exec(hex || "");
      if (!m) { return null; }
      var n = parseInt(m[1], 16);
      return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    },

    offsetRgb: function (rgb, amount, alpha) {
      var ch = rgb.map(function (c) {
        return Math.max(0, Math.min(255, c + amount));
      }).join(", ");
      return alpha == null ? "rgb(" + ch + ")" : "rgba(" + ch + ", " + alpha + ")";
    },

    applyCardSurfaces: function (hex) {
      var rgb = this.hexToRgbChannels(hex) || this.hexToRgbChannels(this.defaultColor);
      var root = document.documentElement.style;
      // Glass tiers (css/glass-theme.css): --surface / --surface-hover are TRANSLUCENT (0.75 / 0.85 alpha,
      // matching --surface-card / --surface-hover there); --surface-sunken and the *-solid twins stay
      // opaque because saber-ring masks and gradient layers paint on top of them.
      root.setProperty("--panel-bg", this.offsetRgb(rgb, 0));
      root.setProperty("--surface", this.offsetRgb(rgb, this.surfaceOffsets.surface, 0.75));
      root.setProperty("--surface-card", this.offsetRgb(rgb, this.surfaceOffsets.surface, 0.75));
      root.setProperty("--surface-hover", this.offsetRgb(rgb, this.surfaceOffsets.hover, 0.85));
      root.setProperty("--surface-sunken", this.offsetRgb(rgb, this.surfaceOffsets.sunken));
      root.setProperty("--surface-solid", this.offsetRgb(rgb, this.surfaceOffsets.surface + 5));
      root.setProperty("--surface-hover-solid", this.offsetRgb(rgb, this.surfaceOffsets.hover + 5));
      // --curve-bg / --curve-bg-rgb (style.css, .curve-pane) are what the Curve tab briefly shows
      // itself, here in the PARENT document, before the NeuCurve iframe has loaded and answered its
      // own postMessage sync (see Curve.sync() / nc-theme-sync.js). Keeping this tier in step too
      // means that first paint matches instead of always flashing NeuCurve's fixed dark default.
      root.setProperty("--curve-bg", this.offsetRgb(rgb, this.surfaceOffsets.hover));
      root.setProperty("--curve-bg-rgb", rgb.map(function (c) { return Math.max(0, Math.min(255, c + 15)); }).join(", "));
    },

    applyImage: function (url) {
      var layer = $("bg-layer");
      layer.style.backgroundImage = url ? 'url("' + url + '")' : "";
      layer.classList.toggle("has-img", !!url);
      this.updateBgState();
    },

    // Tells the CSS (and the Curve iframe) whether a background image/GIF/video is currently set.
    updateBgState: function () {
      BgState.hasMedia = $("bg-layer").classList.contains("has-img") || $("bg-motion-layer").classList.contains("has-media");
      document.documentElement.classList.toggle("has-bg-media", BgState.hasMedia);
      Curve.sync();
    },

    motionObjectUrl: null, // tracks the current blob: URL so it can be revoked when replaced/cleared

    // type: "video" | "gif" | null. url: object URL (video) or data URL (gif).
    // (Opacity is independent of the media source now - see applyOpacity below.)
    applyMotion: function (type, url) {
      var layer = $("bg-motion-layer"), video = $("bg-motion-video"), img = $("bg-motion-img");

      if (type === "video" && url) {
        img.classList.remove("is-active"); img.removeAttribute("src");
        video.src = url; video.classList.add("is-active");
        layer.classList.add("has-media");
      } else if (type === "gif" && url) {
        video.classList.remove("is-active"); video.removeAttribute("src");
        img.src = url; img.classList.add("is-active");
        layer.classList.add("has-media");
      } else {
        video.classList.remove("is-active"); video.removeAttribute("src");
        img.classList.remove("is-active"); img.removeAttribute("src");
        layer.classList.remove("has-media");
      }
      this.updateBgState();
    },

    // ---------------------------------------------------------
    // Global background opacity. Writes ONE source of truth on :root:
    //   --app-bg-opacity  0-1   opacity of the background image / GIF / video layers
    //   --app-bg-veil     0-1   the inverse (1 - opacity): alpha of any tab backdrop that must give way to the
    //                           background as it fades in (the Curve tab uses it - see style.css)
    // Every tab reads these, so one slider drives the whole extension. The Curve tab lives in an iframe,
    // which cannot see this page's variables, so the same values are also posted into it (Curve.sync).
    // Saved and restored on the next launch.
    // ---------------------------------------------------------
    clampOpacity: function (raw) {
      var v = parseInt(raw, 10);
      if (isNaN(v)) { v = 100; }
      return Math.max(0, Math.min(100, v));
    },

    // Writes the CSS variable + the live "%" readout. Real-time: called
    // straight off the slider's `input` event (see init() below) so the
    // background follows the thumb as it's dragged, not just on release.
    applyOpacity: function (raw) {
      var v = this.clampOpacity(raw);
      var a = v / 100;
      document.documentElement.style.setProperty("--app-bg-opacity", String(a));
      document.documentElement.style.setProperty("--app-bg-veil", String(Math.round((1 - a) * 1000) / 1000));
      BgState.opacity = a;
      Curve.sync();
      $("bg-motion-opacity").value = v;
      if (window.__rfUpdateFill) { window.__rfUpdateFill($("bg-motion-opacity")); }
      $("bg-motion-opacity-val").textContent = v + "%";
    },

    // Coalesces to one write per animation frame while actively dragging,
    // so fast pointermove bursts don't queue up a backlog of style writes.
    scheduleOpacity: function (raw) {
      var self = this;
      this.opacityPending = raw;
      if (this.opacityRaf) { return; }
      this.opacityRaf = requestAnimationFrame(function () {
        self.opacityRaf = 0;
        self.applyOpacity(self.opacityPending);
      });
    },

    // ---------------------------------------------------------
    // Display: background position / zoom (+ the opacity slider, which now lives in the same editor).
    // State: bgView = { zoom: 100-300 (%), x: 0-100 (%), y: 0-100 (%) }, saved as bgZoom / bgPosX / bgPosY.
    // applyBgView() writes --bg-zoom / --bg-pos-x / --bg-pos-y on the two background layers only (not :root).
    // ---------------------------------------------------------
    bgView: { zoom: 100, x: 50, y: 50 },
    bgDrag: null,

    clampNum: function (raw, lo, hi, dflt) {
      var v = parseFloat(raw);
      if (!isFinite(v)) { v = dflt; }
      return Math.max(lo, Math.min(hi, v));
    },

    loadBgView: function () {
      this.bgView.zoom = this.clampNum(Store.get("bgZoom"), 100, 300, 100);
      this.bgView.x = this.clampNum(Store.get("bgPosX"), 0, 100, 50);
      this.bgView.y = this.clampNum(Store.get("bgPosY"), 0, 100, 50);
      this.applyBgView();
    },

    applyBgView: function () {
      var v = this.bgView, z = String(Math.round(v.zoom) / 100), x = (Math.round(v.x * 10) / 10) + "%", y = (Math.round(v.y * 10) / 10) + "%";
      ["bg-layer", "bg-motion-layer"].forEach(function (id) {
        var st = $(id).style;
        st.setProperty("--bg-zoom", z); st.setProperty("--bg-pos-x", x); st.setProperty("--bg-pos-y", y);
      });
      this.syncBgControls();
    },

    syncBgControls: function () {
      var v = this.bgView;
      [["bg-zoom", v.zoom], ["bg-pos-x", v.x], ["bg-pos-y", v.y]].forEach(function (p) {
        var el = $(p[0]); if (!el) { return; }
        el.value = Math.round(p[1]);
        if (window.__rfUpdateFill) { window.__rfUpdateFill(el); }
        $(p[0] + "-val").textContent = Math.round(p[1]) + "%";
      });
    },

    saveBgView: function () {
      var v = this.bgView;
      Store.set("bgZoom", String(Math.round(v.zoom)));
      Store.set("bgPosX", String(Math.round(v.x * 10) / 10));
      Store.set("bgPosY", String(Math.round(v.y * 10) / 10));
    },

    resetBgView: function () {
      this.bgView = { zoom: 100, x: 50, y: 50 };
      Store.remove("bgZoom"); Store.remove("bgPosX"); Store.remove("bgPosY");
      this.applyBgView();
    },

    isBgEditing: function () { return document.body.classList.contains("is-bg-edit"); },

    openBgEditor: function () {
      if (this.isBgEditing()) { return; }
      if (!BgState.hasMedia) { toast("Choose a background image, GIF or video first.", true); return; }
      this.close();                                        // hide the Settings modal
      this.syncBgControls();
      this.applyOpacity($("bg-motion-opacity").value);     // re-sync opacity slider + readout with the live value
      if (window.__rfResyncSliders) { window.__rfResyncSliders(); }   // refresh every slider's fill-trail (panel-refinements.js)
      document.body.classList.add("is-bg-edit");
      $("bg-editor").setAttribute("aria-hidden", "false");
    },

    closeBgEditor: function () {
      if (!this.isBgEditing()) { return; }
      this.bgDrag = null;
      document.body.classList.remove("is-bg-edit", "is-bg-dragging");
      document.documentElement.classList.remove("is-scrubbing");
      $("bg-editor").setAttribute("aria-hidden", "true");
      this.saveBgView();
      Store.set(this.opacityKey, String(this.clampOpacity($("bg-motion-opacity").value)));
      indicatorPlaced = false; moveIndicator();            // sidebar was hidden: re-measure the tab indicator
      this.open();                                         // back to Settings, where the user came from
    },

    initBgEditor: function () {
      var self = this, editor = $("bg-editor");
      if (!editor) { return; }
      this.loadBgView();

      $("bg-edit-open").addEventListener("click", function () { self.openBgEditor(); });
      $("bg-edit-done").addEventListener("click", function () { self.closeBgEditor(); });
      $("bg-view-reset").addEventListener("click", function () {
        self.resetBgView();
        self.applyOpacity(100);
        Store.remove(self.opacityKey);
      });

      // Sliders -> state (live). Saved when the editor closes / on slider release.
      [["bg-zoom", "zoom", 100, 300], ["bg-pos-x", "x", 0, 100], ["bg-pos-y", "y", 0, 100]].forEach(function (c) {
        var el = $(c[0]);
        el.addEventListener("input", function () { self.bgView[c[1]] = self.clampNum(el.value, c[2], c[3], c[2]); self.applyBgView(); });
        el.addEventListener("change", function () { self.saveBgView(); });
      });

      // Drag the background itself to pan it. Sensitivity falls as zoom rises, so a full-width drag moves
      // roughly the whole range at 100% and proportionally less when zoomed in.
      document.addEventListener("mousedown", function (e) {
        if (!self.isBgEditing() || e.button !== 0 || editor.contains(e.target)) { return; }
        self.bgDrag = { x: e.clientX, y: e.clientY, vx: self.bgView.x, vy: self.bgView.y };
        document.body.classList.add("is-bg-dragging");
        e.preventDefault();
      }, true);
      document.addEventListener("mousemove", function (e) {
        var d = self.bgDrag; if (!d) { return; }
        var k = 100 / Math.max(self.bgView.zoom / 100 - 1, 0.5);
        self.bgView.x = self.clampNum(d.vx - ((e.clientX - d.x) / Math.max(1, window.innerWidth)) * k, 0, 100, 50);
        self.bgView.y = self.clampNum(d.vy - ((e.clientY - d.y) / Math.max(1, window.innerHeight)) * k, 0, 100, 50);
        self.applyBgView();
      }, true);
      function endDrag() {
        if (!self.bgDrag) { return; }
        self.bgDrag = null;
        document.body.classList.remove("is-bg-dragging");
        self.saveBgView();
      }
      document.addEventListener("mouseup", endDrag, true);
      window.addEventListener("blur", endDrag);

      // Wheel over the background = zoom (+/-5% per notch).
      document.addEventListener("wheel", function (e) {
        if (!self.isBgEditing() || editor.contains(e.target)) { return; }
        e.preventDefault(); e.stopImmediatePropagation();
        self.bgView.zoom = self.clampNum(self.bgView.zoom + (e.deltaY < 0 ? 5 : -5), 100, 300, 100);
        self.applyBgView();
        clearTimeout(self.zoomSaveTimer);
        self.zoomSaveTimer = setTimeout(function () { self.saveBgView(); }, 400);
      }, { passive: false, capture: true });

      document.addEventListener("keydown", function (e) {
        if (e.key === "Escape" && self.isBgEditing()) { e.stopPropagation(); self.closeBgEditor(); }
      }, true);
    },

    defaultTheme: "#ffffff",

    // Updates the global CSS variables -> indicator, borders, hovers, switches all follow instantly.
    // Also pushes the same accent into the NeuCurve tab (separate iframe document) so its buttons/active
    // states AND its preview circle/curve path/glow stay in sync too - see Curve.sync() and
    // neucurve/nc-theme-sync.js/.css. NeuCurve always gets the EFFECTIVE accent: the custom color, or this
    // panel's own default (defaultTheme) when the theme is unset/reset - never "no theme".
    applyTheme: function (hex) {
      var root = document.documentElement.style;
      var m = /^#([0-9a-f]{6})$/i.exec(hex || "");
      var effectiveHex = m ? hex : this.defaultTheme;
      var em = /^#([0-9a-f]{6})$/i.exec(effectiveHex);
      var en = parseInt(em[1], 16), er = (en >> 16) & 255, eg = (en >> 8) & 255, eb = en & 255;

      if (!m) {
        root.removeProperty("--theme-accent"); root.removeProperty("--theme-accent-soft"); root.removeProperty("--theme-on-accent");
        root.removeProperty("--accent-rgb");
        $("theme-color").value = this.defaultTheme;
      } else {
        var luma = 0.299 * er + 0.587 * eg + 0.114 * eb;
        root.setProperty("--theme-accent", hex);
        root.setProperty("--theme-accent-soft", "rgba(" + er + "," + eg + "," + eb + ",0.2)");
        root.setProperty("--theme-on-accent", luma > 150 ? "#111114" : "#ffffff");
        root.setProperty("--accent-rgb", er + "," + eg + "," + eb);
        $("theme-color").value = hex;
      }

      ThemeState.hex = effectiveHex;
      ThemeState.rgb = er + "," + eg + "," + eb;
      if (window.MTMaterial) { window.MTMaterial.setSeed(effectiveHex); }   // Material You palette follows Theme color
      Curve.sync();
    },

    // Builds one row per Easy Layer tool with a <select> of the 16 AE label colors.
    buildLabelAssignRows: function () {
      var list = $("label-assign-list");
      if (!list) { return; }

      var optionsHtml = '<option value="">None</option>' +
        LAYER_LABELS.map(function (l) { return '<option value="' + l.index + '" data-hex="' + l.hex + '">' + l.name + "</option>"; }).join("");

      list.innerHTML = TABS["easy-layer"].tools.map(function (tool) {
        var current = EasyLayerLabels.get(tool.id);
        var swatchHex = "transparent";
        for (var i = 0; i < LAYER_LABELS.length; i++) {
          if (String(LAYER_LABELS[i].index) === String(current)) { swatchHex = LAYER_LABELS[i].hex; break; }
        }
        return '<div class="label-assign-row" data-tool-id="' + tool.id + '">' +
          '<span class="field-label"><span class="label-assign-swatch" style="background:' + swatchHex + '"></span>' + tool.name + "</span>" +
          '<select class="select" data-label-select="' + tool.id + '">' + optionsHtml + "</select>" +
        "</div>";
      }).join("");

      Array.prototype.forEach.call(list.querySelectorAll("select"), function (sel) {
        sel.value = EasyLayerLabels.get(sel.getAttribute("data-label-select"));
        sel.addEventListener("change", function () {
          var toolId = sel.getAttribute("data-label-select");
          EasyLayerLabels.set(toolId, sel.value);
          var row = sel.closest(".label-assign-row");
          var swatch = row ? row.querySelector(".label-assign-swatch") : null;
          if (swatch) {
            var hex = "transparent";
            for (var i = 0; i < LAYER_LABELS.length; i++) {
              if (String(LAYER_LABELS[i].index) === String(sel.value)) { hex = LAYER_LABELS[i].hex; break; }
            }
            swatch.style.background = hex;
          }
        });
      });
    },

    // "Easy Layer Label" accordion: collapsed by default, smooth open/close.
    // Height is animated through max-height (auto can't be transitioned in older CEF builds):
    //   open  -> max-height: <scrollHeight>px, then "none" once the transition ends (list can grow freely)
    //   close -> pin the current height, force a reflow, then animate to 0
    initLabelAccordion: function () {
      var btn = $("label-toggle"), region = $("label-collapse"), text = $("label-toggle-text");
      if (!btn || !region) { return; }

      region.addEventListener("transitionend", function (e) {
        if (e.target === region && e.propertyName === "max-height" && region.classList.contains("is-open")) {
          region.style.maxHeight = "none";
        }
      });

      btn.addEventListener("click", function () {
        var opening = !region.classList.contains("is-open");
        if (opening) {
          region.classList.add("is-open");
          region.style.maxHeight = region.scrollHeight + "px";
        } else {
          region.style.maxHeight = region.scrollHeight + "px";
          void region.offsetHeight;                          // commit the pinned height before animating
          region.classList.remove("is-open");
          region.style.maxHeight = "0px";
        }
        btn.setAttribute("aria-expanded", opening ? "true" : "false");
        region.setAttribute("aria-hidden", opening ? "false" : "true");
        text.textContent = opening ? "Hide Label Settings" : "Show Label Settings";
      });
    },

    // ---------- Scale UI (Settings > Scale UI) ----------
    uiScaleKey: "uiScale",
    UI_SCALE_MIN: 70,
    UI_SCALE_MAX: 150,

    clampUiScale: function (v) {
      var n = parseFloat(v);
      if (isNaN(n)) { n = 100; }
      return Math.max(this.UI_SCALE_MIN, Math.min(this.UI_SCALE_MAX, Math.round(n)));
    },

    // Writes --ui-scale on :root (css/style.css: ".app { zoom: var(--ui-scale) }") and refreshes the readout.
    applyUiScale: function (v, quiet) {
      var pct = this.clampUiScale(v);
      this.uiScale = pct;
      document.documentElement.style.setProperty("--ui-scale", String(pct / 100));
      var slider = $("ui-scale"), out = $("ui-scale-val");
      if (slider && String(slider.value) !== String(pct)) { slider.value = String(pct); }
      if (out) { out.textContent = pct + "%"; }
      if (quiet) { return; }
      // Geometry changed: re-place the sidebar tab indicator, refresh slider fills and let the responsive
      // layout (ResizeObserver / window.resize) re-measure.
      indicatorPlaced = false; moveIndicator();
      if (window.__rfResyncSliders) { window.__rfResyncSliders(); }
      try { window.dispatchEvent(new Event("resize")); } catch (e) { }
    },

    initUiScale: function () {
      var self = this, slider = $("ui-scale");
      this.applyUiScale(Store.get(this.uiScaleKey) || 100, true);
      if (!slider) { return; }
      var holding = false, keyTimer = null;

      function begin() {
        if (holding) { return; }
        holding = true;
        document.body.classList.add("is-scale-edit");     // fade the Settings window out: the UI behind is visible
        document.addEventListener("mouseup", end, true);
        document.addEventListener("pointerup", end, true);
        document.addEventListener("touchend", end, true);
        document.addEventListener("touchcancel", end, true);
        window.addEventListener("blur", end);
      }
      function end() {
        if (!holding) { return; }
        holding = false;
        document.removeEventListener("mouseup", end, true);
        document.removeEventListener("pointerup", end, true);
        document.removeEventListener("touchend", end, true);
        document.removeEventListener("touchcancel", end, true);
        window.removeEventListener("blur", end);
        document.body.classList.remove("is-scale-edit");  // bring the Settings window back
        Store.set(self.uiScaleKey, String(self.uiScale));
      }

      slider.addEventListener("mousedown", begin);
      slider.addEventListener("pointerdown", begin);
      slider.addEventListener("touchstart", begin, { passive: true });
      slider.addEventListener("input", function () { self.applyUiScale(slider.value); });
      slider.addEventListener("change", function () { Store.set(self.uiScaleKey, String(self.uiScale)); });
      // Keyboard (arrow keys): same preview, window returns shortly after the last key press.
      slider.addEventListener("keydown", function (e) {
        if (!/^(Arrow|Page|Home|End)/.test(e.key)) { return; }
        begin();
        clearTimeout(keyTimer);
        keyTimer = setTimeout(end, 700);
      });
      // A closed Settings window must never leave the UI hidden.
      document.addEventListener("keydown", function (e) { if (e.key === "Escape") { end(); } }, true);

      var reset = $("ui-scale-reset");
      if (reset) {
        reset.addEventListener("click", function () {
          Store.remove(self.uiScaleKey);
          self.applyUiScale(100);
        });
      }
    },

    open: function () {
      this.modal.classList.add("is-open"); this.modal.setAttribute("aria-hidden", "false");
      // Focus "Done" WITHOUT scrolling to it: it sits at the very bottom of a tall dialog, and a plain focus() used to
      // scroll the dialog down to it, so Settings opened at the bottom. Always start from the top.
      var done = $("settings-close");
      try { done.focus({ preventScroll: true }); } catch (e) { done.focus(); }
      var inner = this.modal.querySelector(".modal");
      this.modal.scrollTop = 0; if (inner) { inner.scrollTop = 0; }
    },
    close: function () { this.modal.classList.remove("is-open"); this.modal.setAttribute("aria-hidden", "true"); $("settings-btn").focus(); },

    init: function () {
      var self = this;

      // restore saved values
      this.applyColor(Store.get("bgColor"));
      var savedImagePath = Store.get("bgImagePath");
      if (Node && savedImagePath && Node.exists(savedImagePath)) {
        this.applyImage(Node.toFileUrl(savedImagePath));
      } else {
        this.applyImage(Store.get("bgImage")); // legacy data-URL, or nothing saved
      }
      this.applyTheme(Store.get("themeColor"));
      this.buildLabelAssignRows();
      this.initLabelAccordion();

      this.applyOpacity(Store.get(this.opacityKey));
      this.initUiScale();
      this.initBgEditor();
      var savedVideoPath = Store.get("bgMotionVideoPath");
      if (Node && savedVideoPath && Node.exists(savedVideoPath)) {
        this.applyMotion("video", Node.toFileUrl(savedVideoPath));
      } else if (Store.get("bgMotionType") === "gif" && Store.get("bgMotionGif")) {
        this.applyMotion("gif", Store.get("bgMotionGif"));
      } else {
        this.applyMotion(null, null); // no persisted video, and video is never stored as a data URL (too large)
      }

      $("theme-color").addEventListener("input", function (e) { self.applyTheme(e.target.value); Store.set("themeColor", e.target.value); });
      $("theme-reset").addEventListener("click", function () { Store.remove("themeColor"); self.applyTheme(null); });

      $("settings-btn").addEventListener("click", function () { self.open(); });

      // Use Original Media Colors (same switch as NeuCurve). Saved as "mtx.bgOrig": "0" = grayscale, anything else = original colors.
      var origToggle = $("bg-original-color");
      var applyOrig = function (on) { document.documentElement.classList.toggle("mt-bg-gray", !on); };
      if (origToggle) {
        origToggle.checked = Store.get("bgOrig") !== "0";
        applyOrig(origToggle.checked);
        origToggle.addEventListener("change", function () {
          Store.set("bgOrig", origToggle.checked ? "1" : "0");
          applyOrig(origToggle.checked);
        });
      }
      var animToggle = $("anim-enabled");
      if (animToggle) {
        animToggle.checked = Motion.isOn();
        animToggle.addEventListener("change", function () { Motion.set(animToggle.checked); });
      }
      $("settings-close").addEventListener("click", function () { self.close(); });
      this.modal.addEventListener("mousedown", function (e) { if (e.target === self.modal) { self.close(); } });
      document.addEventListener("keydown", function (e) { if (e.key === "Escape" && self.modal.classList.contains("is-open")) { self.close(); } });

      $("bg-color").addEventListener("input", function (e) {
        // ONE background colour for both styles (Glass + Material You): saved once in "mtx.bgColor" and mirrored into the
        // Material You palette (js/mt-material.js), so switching style keeps the colour you picked.
        Store.set("bgColor", e.target.value);
        if (document.documentElement.getAttribute("data-ui-theme") === "material" && window.MTMaterial) { window.MTMaterial.setBg(e.target.value); return; }   // Glass inline colour is re-applied when you switch back
        self.applyColor(e.target.value);
        if (window.MTMaterial) { window.MTMaterial.setBg(e.target.value); }
      });
      $("bg-reset").addEventListener("click", function () {         // back to the default background colour - for both styles
        Store.remove("bgColor");
        if (document.documentElement.getAttribute("data-ui-theme") === "material") { return; }   // Material You is cleared in mt-uitheme.js; Glass is re-synced when you switch back
        self.applyColor(null); $("bg-color").value = self.defaultColor;
        if (window.MTMaterial) { window.MTMaterial.setBg(null); }
      });
      document.addEventListener("mt-glass-mode", function () {      // Light/Dark picked on Glass: a custom background colour pins every surface inline and would hide the change
        if (Store.get("bgColor")) { Store.remove("bgColor"); self.applyColor(null); }
      });
      document.addEventListener("mt-uitheme", function (e) {       // back on Glass: re-apply the shared background colour (it may have been changed / reset while Material You was on)
        if (!e.detail || e.detail.name === "material") { return; }
        self.applyColor(Store.get("bgColor") || null);
      });

      // ONE "Background" picker (Settings > Background): image, GIF, MP4 or WebM through the same button. The file type decides which
      // layer shows it (still image = #bg-layer, GIF / video = #bg-motion-layer); picking one clears the other, Remove clears both.
      var loadImageFile = function (file) {
        clearMotionMedia();

        if (Node && file.path) { Node.backupMedia(file.path); }   // safety-net copy, original name, ~/Documents/MultiTools

        if (Node) {
          var dest = Node.persist(file, "bg-image");
          if (dest) {
            Store.remove("bgImage");          // drop any legacy data URL for this slot
            Store.set("bgImagePath", dest);
            self.applyImage(Node.toFileUrl(dest));
            return;
          }
        }

        // Fallback: no Node integration (or the copy failed) - old data-URL behavior.
        fileToDataURL(file, 1200, 0.8).then(function (url) {
          self.applyImage(url);
          if (!Store.set("bgImage", url)) { toast("Storage is full. The image will not be kept after closing.", true); }
        }).catch(function () { toast("Could not read that image.", true); });
      };
      var clearImageMedia = function () {
        Store.remove("bgImage"); Store.remove("bgImagePath");
        if (Node) { Node.clearSlot("bg-image"); }
        self.applyImage(null);
      };

      var loadMotionFile = function (file) {
        clearImageMedia();
        var isVideo = /^video\//.test(file.type) || /\.(mp4|webm)$/i.test(file.name);

        if (Node && file.path) { Node.backupMedia(file.path); }   // safety-net copy, original name, ~/Documents/MultiTools

        if (isVideo) {
          if (Node) {
            var destV = Node.persist(file, "bg-motion-video");
            if (destV) {
              if (self.motionObjectUrl) { URL.revokeObjectURL(self.motionObjectUrl); self.motionObjectUrl = null; }
              Store.set("bgMotionVideoPath", destV);
              Store.remove("bgMotionGif");
              Store.remove("bgMotionType");
              self.applyMotion("video", Node.toFileUrl(destV));
              $("bg-motion-note").textContent = "Video saved. It loads again next time you open the panel.";
              return;
            }
          }
          // Fallback: no Node integration (or the copy failed) - old session-only blob: URL.
          if (self.motionObjectUrl) { URL.revokeObjectURL(self.motionObjectUrl); }
          var objUrl = URL.createObjectURL(file);
          self.motionObjectUrl = objUrl;
          self.applyMotion("video", objUrl);
          Store.remove("bgMotionGif");
          Store.remove("bgMotionType");
          Store.remove("bgMotionVideoPath");
          $("bg-motion-note").textContent = "Video applied for this session only.";
        } else {
          fileToRawDataURL(file).then(function (dataUrl) {
            self.applyMotion("gif", dataUrl);
            if (self.motionObjectUrl) { URL.revokeObjectURL(self.motionObjectUrl); self.motionObjectUrl = null; }
            Store.remove("bgMotionVideoPath");
            if (Node) { Node.clearSlot("bg-motion-video"); }
            var saved = Store.set("bgMotionGif", dataUrl) && Store.set("bgMotionType", "gif");
            $("bg-motion-note").textContent = saved ? "" : "Storage is full. This GIF will not be kept after closing.";
          }).catch(function () { toast("Could not read that file.", true); });
        }
      };

      $("bg-media-set").addEventListener("click", function () { $("bg-media-file").click(); });
      $("bg-media-file").addEventListener("change", function (e) {
        var file = e.target.files && e.target.files[0];
        e.target.value = "";
        if (!file) { return; }
        var isMotion = /^video\//.test(file.type) || /\.(mp4|webm|gif)$/i.test(file.name) || file.type === "image/gif";
        if (isMotion) { loadMotionFile(file); }
        else if (/^image\//.test(file.type) || /\.(png|jpe?g|webp|bmp|avif|svg)$/i.test(file.name)) { loadImageFile(file); }
        else { toast("Choose an image, GIF, MP4 or WebM file.", true); }
      });
      $("bg-media-clear").addEventListener("click", function () { clearImageMedia(); clearMotionMedia(); });

      // Real-time, global background opacity. `input` fires continuously
      // while the thumb is dragged (unlike `change`, which only fires on
      // release) - that's what makes the background follow the slider live.
      var opacityRoot = document.documentElement;
      function endOpacityScrub() { opacityRoot.classList.remove("is-scrubbing"); }
      $("bg-motion-opacity").addEventListener("pointerdown", function () { opacityRoot.classList.add("is-scrubbing"); });
      window.addEventListener("pointerup", endOpacityScrub);
      window.addEventListener("pointercancel", endOpacityScrub);
      window.addEventListener("blur", endOpacityScrub);

      $("bg-motion-opacity").addEventListener("input", function (e) { self.scheduleOpacity(e.target.value); });
      $("bg-motion-opacity").addEventListener("change", function (e) {
        endOpacityScrub();
        self.applyOpacity(e.target.value);
        Store.set(self.opacityKey, String(self.clampOpacity(e.target.value)));
      });

      var clearMotionMedia = function () {
        if (self.motionObjectUrl) { URL.revokeObjectURL(self.motionObjectUrl); self.motionObjectUrl = null; }
        Store.remove("bgMotionGif");
        Store.remove("bgMotionType");
        Store.remove("bgMotionVideoPath");
        if (Node) { Node.clearSlot("bg-motion-video"); }
        self.applyMotion(null, null);
        $("bg-motion-note").textContent = "";
      };

      $("reset-tool-images").addEventListener("click", function () {
        Store.removeMatching("toolImg.");
        Array.prototype.forEach.call(document.querySelectorAll(".tool"), function (t) { applyToolImage(t, null); });
        toast("Tool images cleared.");
      });

      // Manual export/import of the persistent Expression Code backup file
      // (~/Documents/Multitool_CEP_Data/saved_expressions.json). Both open native OS dialogs via
      // host.jsx, so they're no-ops (with a preview-mode message) outside a real AE panel.
      $("expr-backup-export").addEventListener("click", function (e) {
        var btn = e.target; btn.classList.add("is-pending");
        Bridge.call("EXPR_FILE_backupExport", []).then(function (res) {
          flashButtonResult(btn, !!res.ok);
          toast(res.message || (res.ok ? "Backup saved." : "Something went wrong."), !res.ok);
        });
      });

      $("expr-backup-import").addEventListener("click", function (e) {
        var btn = e.target; btn.classList.add("is-pending");
        Bridge.call("EXPR_FILE_backupImport", []).then(function (res) {
          // Canceled / read error: host reports it, nothing to validate.
          if (!res.ok || !res.data || !res.data.json) {
            flashButtonResult(btn, !!res.ok);
            toast(res.message || (res.ok ? "Import complete." : "Something went wrong."), !res.ok);
            return;
          }
          // The host only READS the picked file now. Validate here first: a wrong JSON must never
          // replace the saved expressions (the old flow overwrote saved_expressions.json blindly).
          var restored = ExprFile.parse(res.data.json);
          if (!restored) {
            flashButtonResult(btn, false);
            toast("That is not an Expression Code backup (wrong or too large JSON). Nothing was changed.", true);
            return;
          }
          exprCatStore.save(restored);   // also mirrors to saved_expressions.json
          flashButtonResult(btn, true);
          toast(res.message || "Expressions imported.");
          // Re-render the Expression Code tab now if it's the one open, so the import shows up
          // immediately instead of waiting for the next tab switch.
          if (currentTab === "expr-code") { showTab("expr-code"); }
        });
      });

      $("settings-reset").addEventListener("click", function () {
        Store.remove("bgColor"); Store.remove("bgImage"); Store.remove("bgImagePath"); Store.remove("themeColor"); Store.removeMatching("toolImg.");
        Store.remove("bgMotionGif"); Store.remove("bgMotionType"); Store.remove("bgMotionVideoPath"); Store.remove(self.opacityKey); Store.remove("tabOrder");
        Store.remove("easyLayerLabels");
        Store.remove("bgOrig"); if ($("bg-original-color")) { $("bg-original-color").checked = true; } document.documentElement.classList.remove("mt-bg-gray");
        if (Node) { Node.clearSlot("bg-image"); Node.clearSlot("bg-motion-video"); }
        Idle.reset();
        if (window.MTUiTheme) { window.MTUiTheme.reset(); }      // Settings > Style back to Glass
        if (window.MTAnim) { window.MTAnim.reset(); }            // Settings > Tab animation back to Smooth / 100% / Soft
        if (window.MTNav) { window.MTNav.reset(); }              // Settings > Navigation back to Left
        if (window.MTPro) { window.MTPro.reset(); }              // Settings > Density / Glass blur / Toast back to default
        Motion.set(true);
        if ($("anim-enabled")) { $("anim-enabled").checked = true; }
        Store.remove("autoParent"); Store.remove("presetFolder");
        if ($("el-auto-parent")) { $("el-auto-parent").checked = false; }
        if (self.motionObjectUrl) { URL.revokeObjectURL(self.motionObjectUrl); self.motionObjectUrl = null; }
        self.applyColor(null); self.applyImage(null); self.applyTheme(null); self.applyMotion(null, null);
        self.applyOpacity(100);
        Store.remove(self.uiScaleKey); self.applyUiScale(100);
        self.resetBgView();
        $("bg-motion-note").textContent = "";
        Array.prototype.forEach.call(document.querySelectorAll(".tool"), function (t) { applyToolImage(t, null); });
        self.buildLabelAssignRows();
        toast("Settings reset. Reload the panel to reset the tab order too.");
      });
    }
  };

  // ---------------------------------------------------------
  // Easy Layer options: "Auto Parent" switch (state kept in localStorage, sent with every Easy Layer click)
  // ---------------------------------------------------------
  var AutoParent = {
    key: "autoParent",
    get: function () { return Store.get(this.key) === "1"; },
    set: function (on) { Store.set(this.key, on ? "1" : "0"); }
  };

  var EasyLayerOptions = {
    render: function () {
      var wrap = document.createElement("div");
      wrap.className = "el-options";
      var onNow = AutoParent.get();
      wrap.innerHTML =
        '<div class="saber-wrap' + (onNow ? " is-active" : "") + '">' +
          '<label class="switch-row" for="el-auto-parent">' +
            "<span>Auto Parent</span>" +
            '<input type="checkbox" id="el-auto-parent"' + (onNow ? " checked" : "") + ">" +
            '<span class="switch-track"></span>' +
          "</label>" +
        "</div>" +
        '<p class="field-note">When on, a new layer goes above the selected layer(s), matches their duration and becomes their parent.</p>';
      wrap.querySelector("input").addEventListener("change", function (e) {
        AutoParent.set(e.target.checked);
        e.target.closest(".saber-wrap").classList.toggle("is-active", e.target.checked);
      });
      return wrap;
    }
  };

  // ---------------------------------------------------------
  // Easy Layer: Flip Horizontal / Flip Vertical row, shown directly beneath the layer creation
  // grid. Same tile styling as Anchor Align's Fit buttons (.flip-grid/.flip-btn share the
  // .align-grid/.fit-btn rules in css/style.css) and the same Bridge -> is-pending ->
  // flashButtonResult() pending/success/error pattern as every other action button in the panel.
  // host.jsx: flipSelectedLayers(axis) - inverts Scale X ("h") or Scale Y ("v") on every
  // selected layer, wrapped in its own "Flip Layers" undo group.
  // ---------------------------------------------------------
  var EasyLayerFlip = {
    render: function () {
      var wrap = document.createElement("div");
      wrap.className = "el-flip";

      var flipBtns = FLIP_BUTTONS.map(function (a) {
        return '<button class="flip-btn" data-flip="' + a.code + '" title="' + a.label + '" aria-label="' + a.label + '">' +
          '<span class="align-icon"><svg viewBox="0 0 24 24" aria-hidden="true">' + a.icon + '</svg></span>' +
          '<span class="align-text">' + a.label + '</span>' +
          '</button>';
      }).join("");

      wrap.innerHTML = '<div class="flip-grid">' + flipBtns + '</div>';

      Array.prototype.forEach.call(wrap.querySelectorAll(".flip-btn"), function (btn) {
        btn.addEventListener("click", function () {
          if (btn.classList.contains("is-pending")) { return; }
          btn.classList.add("is-pending");
          Bridge.call("flipSelectedLayers", [btn.getAttribute("data-flip")]).then(function (res) {
            flashButtonResult(btn, !!(res && res.ok));
            toast((res && res.message) || (res && res.ok ? "Done." : "Something went wrong."), !(res && res.ok));
          });
        });
      });

      return wrap;
    }
  };

  // ---------------------------------------------------------
  // Animation Presets tab: .ffx files from a folder the user picks (host.jsx: PRE_*)
  //   localStorage "presetFolder" = the chosen folder path (set by Folder.selectDialog in host.jsx)
  //   Every open of the tab re-scans the folder, so files added/removed outside the panel show up too.
  // ---------------------------------------------------------
  // Favorite state for Animation Presets, keyed by "folder|file" since favorites
  // are really per-folder (switching preset folders shouldn't carry stale favorites
  // over onto unrelated files that happen to share a name).
  var presetFavStore = {
    KEY: "presetFavorites",
    read: function () {
      try { return JSON.parse(Store.get(this.KEY) || "{}") || {}; } catch (e) { return {}; }
    },
    keyFor: function (folder, file) { return folder + "|" + file; },
    isFav: function (folder, file) { return !!this.read()[this.keyFor(folder, file)]; },
    toggle: function (folder, file) {
      var data = this.read(), k = this.keyFor(folder, file);
      if (data[k]) { delete data[k]; } else { data[k] = true; }
      Store.set(this.KEY, JSON.stringify(data));
      return !!data[k];
    }
  };

  // Last-applied preset (one entry, persisted so the marker survives restarting After Effects),
  // keyed like favorites by "folder|file". Written by the Presets tab's Apply button and by
  // Shortcutz pinned .ffx tiles, so both routes keep the same "Last used" marker.
  var presetLastStore = {
    KEY: "presetLastUsed",
    get: function () { return Store.get(this.KEY) || ""; },
    set: function (folder, file) { Store.set(this.KEY, folder + "|" + file); },
    is: function (folder, file) { return this.get() === folder + "|" + file; }
  };

  var Presets = {
    key: "presetFolder",
    // Which folder cards are expanded, keyed by folderName. Lives on the module (not inside render())
    // so it survives switching tabs - render() runs again on every tab switch - but is deliberately
    // NOT persisted, so every fresh After Effects start still begins with all folders closed.
    openFolders: {},
    // Search text typed in the Presets search box. Kept for the session (like the open folders) so
    // coming back to the tab shows the same filtered list; empty again after an AE restart.
    query: "",
    // Support check (green / red icon per preset): on/off is remembered (Store "presetSupportOn"), the rest
    // lives for the session. results are keyed "<folder>|<file>" and carry the file's size:mtime signature.
    support: { on: Store.get("presetSupportOn") === "1", filter: "all", info: null, results: {}, running: false, token: 0 },
    // Last scan result, kept for the session ({ folder, sig, presets }). Coming back to the tab paints
    // this at once - same frame as every other tab - so the saved scroll offset and the card entrance
    // have real rows to work with. The folder is then re-scanned quietly in the background
    // (see revalidate() in render()) and the list is only rebuilt if something actually changed.
    cache: null,
    CONFIRM_MS: 3000,       // how long the delete button waits for its second click

    folder: function () { return Store.get(this.key) || ""; },

    render: function () {
      var self = this, confirmTimer = 0;
      // Expanded-folder state is shared across tab switches (see Presets.openFolders above).
      var openFolders = Presets.openFolders;
      var wrap = document.createElement("div");
      wrap.className = "ta";
      wrap.innerHTML =
        '<div class="ta-section">' +
          '<h2 class="ta-title">Preset Folder</h2>' +
          '<p class="field-note preset-path" id="preset-path"></p>' +
          '<div class="preset-toolbar">' +
            '<button class="btn btn-primary" id="preset-select" type="button">Select Preset Folder</button>' +
            '<button class="btn" id="preset-refresh" type="button">Refresh</button>' +
            '<button class="btn" id="preset-save" type="button">Save as Preset</button>' +
            '<button class="btn" id="preset-import" type="button" title="Add .ffx files to a folder in your preset folder">Import</button>' +
            '<button class="btn" id="preset-support-btn" type="button" aria-pressed="false" title="Check which presets work in your After Effects">Check Support</button>' +
          "</div>" +
          '<div class="psup" id="preset-support" hidden>' +
            '<div class="psup-head"><span class="psup-ver" id="psup-ver"></span><button type="button" class="psup-recheck" id="psup-recheck">Re-check</button></div>' +
            '<div class="psup-filter" role="group" aria-label="Filter presets by support">' +
              '<button type="button" data-psf="all" aria-pressed="true">All <span class="psup-n"></span></button>' +
              '<button type="button" data-psf="ok" aria-pressed="false"><i class="psup-dot is-ok"></i>Supported <span class="psup-n"></span></button>' +
              '<button type="button" data-psf="bad" aria-pressed="false"><i class="psup-dot is-bad"></i>Unsupported <span class="psup-n"></span></button>' +
              '<button type="button" data-psf="na" aria-pressed="false" hidden><i class="psup-dot is-na"></i>Unreadable <span class="psup-n"></span></button>' +
            "</div>" +
            '<div class="psup-actions">' +
              '<button type="button" class="psup-act" id="psup-move" hidden title="Moves the red presets into a subfolder called Unsupported">Move unsupported</button>' +
              '<button type="button" class="psup-act is-danger" id="psup-del" hidden title="Deletes the red presets from your preset folder">Delete unsupported</button>' +
            "</div>" +
            '<p class="field-note psup-note" id="psup-note" aria-live="polite"></p>' +
          "</div>" +
          '<p class="field-note">Drag .ffx files, or a folder of them, from Explorer or Finder onto this tab. Drop them on a folder to add them there.</p>' +
          '<p class="field-note">Save as Preset stores the selected layer&rsquo;s effects and animated properties (or whatever properties you have selected). After Effects opens its own Save dialog for this: save into the preset folder.</p>' +
          '<p class="field-note">Presets inside a subfolder of your preset folder show up under &ldquo;Categorized Presets&rdquo; below, grouped by that subfolder&rsquo;s name; everything else (loose .ffx files sitting directly in the preset folder) shows up under &ldquo;Ungrouped Presets.&rdquo;</p>' +
        "</div>" +
        '<div class="ta-section">' +
          '<h2 class="ta-title">Presets <span id="preset-count"></span></h2>' +
          '<div class="preset-search">' +
            '<input type="text" class="text-input preset-search-input" id="preset-search" placeholder="Search presets..." aria-label="Search presets" autocomplete="off" spellcheck="false">' +
            '<button type="button" class="icon-btn preset-search-clear" id="preset-search-clear" title="Clear search" aria-label="Clear search" hidden>' + ICON_CLEAR_SVG + "</button>" +
          "</div>" +
          '<div class="preset-area" id="preset-area"></div>' +
        "</div>";

      var pathEl = wrap.querySelector("#preset-path");
      var listEl = wrap.querySelector("#preset-area");
      var countEl = wrap.querySelector("#preset-count");
      var selectBtn = wrap.querySelector("#preset-select");
      var refreshBtn = wrap.querySelector("#preset-refresh");
      var saveBtn = wrap.querySelector("#preset-save");
      var importBtn = wrap.querySelector("#preset-import");
      var searchEl = wrap.querySelector("#preset-search");
      var searchClearBtn = wrap.querySelector("#preset-search-clear");
      searchEl.value = Presets.query;
      searchClearBtn.hidden = !Presets.query;

      // Every word typed must appear in the preset's name, its file path or its folder name
      // (case-insensitive), so "coloring cc" finds "coloring #3" inside the CC folder.
      function searchTokens() {
        return Presets.query.toLowerCase().split(/\s+/).filter(function (t) { return t; });
      }

      // Search works by hiding/showing the rows that are already in the DOM instead of rebuilding the list
      // on every keystroke: rebuilding hundreds of glass cards per key press made the panel stutter, tear
      // and throw the scroll position around. Rows whose data-search text lacks any typed word get
      // .is-filtered (display: none); folders left with no visible rows and the group headings follow.
      function applyFilter() {
        var tokens = searchTokens();
        var supFilter = Presets.support.on ? Presets.support.filter : "all";
        var searching = tokens.length > 0;
        var filtering = searching || supFilter !== "all";
        listEl.classList.toggle("is-searching", filtering);

        var items = listEl.querySelectorAll(".preset-item");
        var shown = 0, i;
        for (i = 0; i < items.length; i++) {
          var hay = items[i].getAttribute("data-search") || "";
          var ok = true;
          for (var t = 0; t < tokens.length; t++) { if (hay.indexOf(tokens[t]) === -1) { ok = false; break; } }
          if (ok && supFilter !== "all" && items[i].getAttribute("data-support") !== supFilter) { ok = false; }
          items[i].classList.toggle("is-filtered", !ok);
          if (ok) { shown++; }
        }

        var visibleFolders = 0;
        var folders = listEl.querySelectorAll(".preset-folder");
        for (i = 0; i < folders.length; i++) {
          var rows = folders[i].querySelectorAll(".preset-item");
          var vis = folders[i].querySelectorAll(".preset-item:not(.is-filtered)").length;
          folders[i].classList.toggle("is-filtered", filtering && vis === 0);
          folders[i].classList.remove("is-search-collapsed");
          if (!filtering || vis) { visibleFolders++; }
          var cnt = folders[i].querySelector(".preset-folder-count");
          if (cnt) { cnt.textContent = "(" + (filtering ? vis + "/" + rows.length : rows.length) + ")"; }
        }

        var looseVisible = listEl.querySelectorAll(".preset-list--loose .preset-item:not(.is-filtered)").length;
        var catHead = listEl.querySelector('.preset-group-heading[data-group="cat"]');
        var looseHead = listEl.querySelector('.preset-group-heading[data-group="loose"]');
        var looseList = listEl.querySelector(".preset-list--loose");
        var looseNote = listEl.querySelector(".preset-group-empty");
        if (catHead) { catHead.classList.toggle("is-filtered", filtering && visibleFolders === 0); }
        if (looseHead) { looseHead.classList.toggle("is-filtered", filtering && looseVisible === 0); }
        if (looseList) { looseList.classList.toggle("is-filtered", filtering && looseVisible === 0); }
        if (looseNote) { looseNote.classList.toggle("is-filtered", filtering); }

        var noMatch = listEl.querySelector(".preset-no-match");
        if (noMatch) {
          noMatch.hidden = !(filtering && shown === 0);
          if (filtering && shown === 0) {
            noMatch.textContent = searching ? "No presets match \u201c" + Presets.query.trim() + "\u201d." : "No presets in this group.";
          }
        }
        if (items.length) { countEl.textContent = filtering ? "(" + shown + " of " + items.length + ")" : "(" + items.length + ")"; }
      }

      // After the list shrinks the browser clamps the scroll offset, which can leave the search box and the
      // first hits above the viewport; pull the box back to the top so results start right under it.
      function keepSearchInView() {
        var m = $("main");
        if (!m) { return; }
        var r = searchEl.getBoundingClientRect(), mr = m.getBoundingClientRect();
        if (r.top < mr.top || r.bottom > mr.bottom) { jumpScroll(m, m.scrollTop + r.top - mr.top - 8); }
      }

      function busy(btn, promise, done) {
        btn.classList.add("is-loading");
        promise.then(function (res) { btn.classList.remove("is-loading"); done(res); });
      }

      // Feature C variant of busy() above: same shape, but flashes the new is-pending ->
      // is-success/is-error states instead of the plain opacity pulse. Used by Select Preset
      // Folder, Save as Preset, and Preset Apply (data-action "apply"). Refresh keeps the plain
      // busy() above (a background list re-read, not a discrete pass/fail action), and Preset
      // Delete (data-action "delete") deliberately keeps it too - it already has its own
      // two-step "arm/confirm" press feedback, and a destructive action getting a cheerful
      // green checkmark would send the wrong signal.
      function busyResult(btn, promise, done) {
        btn.classList.add("is-pending");
        promise.then(function (res) {
          flashButtonResult(btn, !!(res && res.ok));
          done(res);
        });
      }

      function syncToolbar() {
        var f = self.folder();
        pathEl.textContent = f || "No folder selected yet.";
        pathEl.title = f;
        refreshBtn.disabled = !f;
        saveBtn.disabled = !f;
        importBtn.disabled = !f;
        supportBtn.disabled = !f;
      }

      var lastPresets = null;   // { uncategorized, categorized } cached so toggling a favorite can re-render instantly, without re-hitting the host

      function showMessage(text) {
        countEl.textContent = "";
        lastPresets = null;
        listEl.classList.remove("is-loading");
        listEl.innerHTML = '<div class="empty">' + escapeHtml(text) + "</div>";
      }

      function orderedPresets(presets, folder) {
        // Favorites float to the top; original scan order kept stable within each group.
        return presets
          .map(function (p, i) { return { p: p, i: i }; })
          .sort(function (a, b) {
            var fa = presetFavStore.isFav(folder, a.p.file) ? 1 : 0;
            var fb = presetFavStore.isFav(folder, b.p.file) ? 1 : 0;
            return fa !== fb ? (fb - fa) : (a.i - b.i);
          })
          .map(function (x) { return x.p; });
      }

      function presetItemHtml(p, folderName) {
        var folder = self.folder();
        var fav = presetFavStore.isFav(folder, p.file);
        var last = presetLastStore.is(folder, p.file);
        var sup = supportResult(p.file);
        return '<div class="preset-item' + (fav ? " is-favorite" : "") + (last ? " is-last-used" : "") + '" data-file="' + escapeHtml(p.file) + '" data-support="' + (sup ? sup.state : "") + '" data-search="' + escapeHtml((p.name + " " + p.file + " " + (folderName || "")).toLowerCase()) + '">' +
          (fav ? '<span class="preset-item-fav-badge" title="Favorite">' + ICON_STAR_SVG + "</span>" : "") +
          supportIconHtml(sup) +
          '<span class="preset-name" title="' + escapeHtml(p.file) + '">' + escapeHtml(p.name) + "</span>" +
          (last ? '<span class="preset-last-badge">Last used</span>' : "") +
          '<div class="preset-actions">' +
            '<div class="preset-tray" role="group" aria-label="Actions for ' + escapeHtml(p.name) + '">' +
              '<button class="icon-btn preset-fav-btn' + (fav ? " is-on" : "") + '" type="button" data-action="fav" aria-pressed="' + fav + '" title="' + (fav ? "Remove from favorites" : "Favorite (moves to top)") + '" aria-label="' + (fav ? "Unfavorite " : "Favorite ") + escapeHtml(p.name) + '">' + ICON_STAR_SVG + "</button>" +
              '<button class="icon-btn" type="button" data-action="pin" title="Pin to Shortcutz" aria-label="Pin ' + escapeHtml(p.name) + ' to Shortcutz">' + ICON_PUSHPIN_SVG + "</button>" +
              '<button class="icon-btn" type="button" data-action="reveal" title="' + REVEAL_LABEL + '" aria-label="' + REVEAL_LABEL + ': ' + escapeHtml(p.name) + '">' + ICON_FOLDER_SVG + "</button>" +
              '<button class="icon-btn preset-del" type="button" data-action="delete" title="Delete preset" aria-label="Delete ' + escapeHtml(p.name) + '">' + ICON_DELETE_SVG + "</button>" +
              '<button class="preset-apply" type="button" data-action="apply" aria-label="Apply ' + escapeHtml(p.name) + '">Apply</button>' +
            "</div>" +
            '<button class="icon-btn preset-more" type="button" data-action="more" aria-expanded="false" aria-haspopup="true" title="Actions" aria-label="Actions for ' + escapeHtml(p.name) + '">' + ICON_MORE_SVG + "</button>" +
          "</div>" +
        "</div>";
      }

      function folderCardHtml(group) {
        var folder = self.folder();
        // Defaults to collapsed the first time a folder name is seen this tab-open; sticky after that.
        var isOpen = openFolders.hasOwnProperty(group.folderName) ? openFolders[group.folderName] : false;
        var hasLast = group.files.some(function (p) { return presetLastStore.is(folder, p.file); });
        return '<div class="preset-folder' + (isOpen ? " is-open" : "") + '" data-folder-name="' + escapeHtml(group.folderName) + '">' +
          '<div class="saber-wrap saber-wrap--folder is-active">' +
            '<button type="button" class="preset-folder-header" data-action="toggle-folder" aria-expanded="' + isOpen + '">' +
              '<span class="preset-folder-icon">' + ICON_FOLDER_SVG + "</span>" +
              '<span class="preset-folder-name" title="' + escapeHtml(group.folderName) + '">' + escapeHtml(group.folderName) + "</span>" +
              (hasLast ? '<span class="preset-folder-lastdot" title="Contains the last used preset"></span>' : "") +
              '<span class="preset-folder-count">(' + group.files.length + ")</span>" +
              '<span class="preset-folder-chevron">' + ICON_CHEVRON_SVG + "</span>" +
            "</button>" +
          "</div>" +
          '<div class="preset-folder-body">' +
            '<div class="preset-list">' + orderedPresets(group.files, folder).map(function (p) { return presetItemHtml(p, group.folderName); }).join("") + "</div>" +
          "</div>" +
        "</div>";
      }

      function showList(presets) {
        var categorized = (presets && presets.categorized) || [];
        var uncategorized = (presets && presets.uncategorized) || [];
        var total = uncategorized.length + categorized.reduce(function (n, g) { return n + g.files.length; }, 0);
        if (!total) {
          showMessage("No .ffx files in this folder yet. Drag some in from Explorer or Finder, use Import, or use Save as Preset.");
          return;
        }
        lastPresets = { categorized: categorized, uncategorized: uncategorized };
        Presets.cache = { folder: self.folder(), sig: JSON.stringify({ c: categorized, u: uncategorized }), presets: { categorized: categorized, uncategorized: uncategorized } };
        countEl.textContent = "(" + total + ")";
        var folder = self.folder();
        var html = "";
        if (categorized.length) {
          html += '<div class="preset-group-heading" data-group="cat">Categorized Presets</div>' + categorized.map(folderCardHtml).join("");
        }
        html += '<div class="preset-group-heading" data-group="loose">Ungrouped Presets</div>';
        html += uncategorized.length
          ? '<div class="preset-list preset-list--loose">' + orderedPresets(uncategorized, folder).map(function (p) { return presetItemHtml(p, ""); }).join("") + "</div>"
          : '<p class="field-note preset-group-empty">No loose presets directly in the preset folder.</p>';
        html += '<div class="empty preset-no-match" hidden></div>';
        var wasLoading = listEl.classList.contains("is-loading");
        listEl.classList.remove("is-loading");
        listEl.innerHTML = html;
        applyFilter();   // re-applies the current search (if any) to the freshly built rows
        if (Presets.support.on) { scheduleSupport(); } else { supBar.hidden = true; supportBtn.setAttribute("aria-pressed", "false"); }
        applyScrollRestore();   // only does anything while a tab-switch scroll restore is still pending
        // First scan of the session: the rows arrive after the tab entrance already ran, so give them
        // the same card entrance the other tabs get (after the saved scroll offset has been applied).
        if (wasLoading && !motionOff()) { staggerWithin(listEl, false); }
      }

      // Cold open (nothing cached yet): placeholder rows instead of an empty box while the folder is scanned.
      function showSkeleton() {
        var rows = "";
        for (var i = 0; i < 5; i++) { rows += '<div class="preset-skel" aria-hidden="true"></div>'; }
        listEl.classList.add("is-loading");
        listEl.innerHTML = rows;
      }

      // Moves the "Last used" pill/tint (and the folder-header dot) to `row` without re-rendering the list.
      function markLastUsedInDom(row) {
        Array.prototype.forEach.call(listEl.querySelectorAll(".preset-item.is-last-used"), function (el) {
          el.classList.remove("is-last-used");
          var old = el.querySelector(".preset-last-badge");
          if (old) { old.parentNode.removeChild(old); }
        });
        Array.prototype.forEach.call(listEl.querySelectorAll(".preset-folder-lastdot"), function (el) {
          el.parentNode.removeChild(el);
        });
        if (!row) { return; }
        row.classList.add("is-last-used");
        var badge = document.createElement("span");
        badge.className = "preset-last-badge";
        badge.textContent = "Last used";
        row.insertBefore(badge, row.querySelector(".preset-actions"));
        var card = row.closest(".preset-folder");
        var head = card ? card.querySelector(".preset-folder-header") : null;
        if (head) {
          var dot = document.createElement("span");
          dot.className = "preset-folder-lastdot";
          dot.title = "Contains the last used preset";
          head.insertBefore(dot, head.querySelector(".preset-folder-count"));
        }
      }

      function toggleFavorite(file) {
        var folder = self.folder();
        if (!folder || !file || !lastPresets) { return; }
        var nowFav = presetFavStore.toggle(folder, file);
        showList(lastPresets);   // re-render from cache, no network round-trip
        toast(nowFav ? "Added to favorites." : "Removed from favorites.");
      }

      // Press-and-hold anywhere on a preset card (outside Apply/Delete) toggles favorite -
      // same interaction as the saved snippet cards in the Code Expression tab.
      var LONG_PRESS_MS = 550, LONG_PRESS_MOVE_TOLERANCE = 10;
      var lpTimer = null, lpEl = null, lpStartX = 0, lpStartY = 0, lpFired = false;

      function lpClear() {
        clearTimeout(lpTimer);
        lpTimer = null;
        if (lpEl) { lpEl.classList.remove("is-pressing"); }
        lpEl = null;
      }

      function refresh() {
        var folder = self.folder();
        syncToolbar();
        if (!folder) { showMessage("Choose the folder that contains your .ffx animation presets."); return Promise.resolve(); }
        if (!listEl.children.length) { showSkeleton(); }
        return Bridge.call("PRE_list", [folder]).then(function (res) {
          if (!res.ok) { showMessage(res.message || "Could not read the preset folder."); return; }
          showList(res.data && res.data.presets);       // no data in preview mode -> shows the empty state
        });
      }

      // Quiet re-scan after the list is already on screen from the cache: files added or removed outside
      // the panel still show up, but nothing flickers and the scroll offset is kept. Waits until the tab
      // entrance is over because the ExtendScript call blocks After Effects' UI thread while it reads the folder.
      function revalidate() {
        var folder = self.folder();
        if (!folder || !document.body.contains(wrap)) { return; }
        Bridge.call("PRE_list", [folder]).then(function (res) {
          if (!document.body.contains(wrap) || self.folder() !== folder) { return; }   // person left the tab meanwhile
          if (!res.ok) { showMessage(res.message || "Could not read the preset folder."); return; }
          var pr = res.data && res.data.presets;
          if (!pr) { return; }
          var sig = JSON.stringify({ c: pr.categorized || [], u: pr.uncategorized || [] });
          if (Presets.cache && Presets.cache.folder === folder && Presets.cache.sig === sig) { return; }   // unchanged: leave the DOM alone
          var m = $("main"), top = m ? m.scrollTop : 0;
          showList(pr);
          if (m) { jumpScroll(m, top); }
        });
      }

      // ----- delete needs a second click (File.remove() is permanent) -----
      function disarmAll() {
        clearTimeout(confirmTimer);
        Array.prototype.forEach.call(listEl.querySelectorAll(".preset-del.is-confirm"), function (b) {
          b.classList.remove("is-confirm");
          b.innerHTML = ICON_DELETE_SVG;
          b.title = "Delete preset";
        });
      }
      function arm(btn) {
        disarmAll();
        btn.classList.add("is-confirm");
        btn.textContent = "Delete?";
        btn.title = "Click again to permanently delete this file";
        confirmTimer = setTimeout(disarmAll, self.CONFIRM_MS);
      }

      // The row actions live behind one "more" button; only one row's tray is open at a time.
      function closeActions() {
        disarmAll();
        Array.prototype.forEach.call(listEl.querySelectorAll(".preset-item.is-actions-open"), function (r) {
          r.classList.remove("is-actions-open");
          var t = r.querySelector(".preset-more");
          if (t) { t.setAttribute("aria-expanded", "false"); }
        });
      }
      function onDocDown(e) {
        if (!live()) { document.removeEventListener("pointerdown", onDocDown, true); return; }
        if (!listEl.querySelector(".preset-item.is-actions-open")) { return; }
        if (e.target.closest && e.target.closest(".preset-actions")) { return; }
        closeActions();
      }
      document.addEventListener("pointerdown", onDocDown, true);
      listEl.addEventListener("keydown", function (e) {
        if (e.key !== "Escape" || !listEl.querySelector(".preset-item.is-actions-open")) { return; }
        var openRow = listEl.querySelector(".preset-item.is-actions-open"), toggle = openRow.querySelector(".preset-more");
        e.stopPropagation();
        closeActions();
        if (toggle) { toggle.focus(); }
      });

      selectBtn.addEventListener("click", function () {
        busyResult(selectBtn, Bridge.call("PRE_selectFolder", []), function (res) {
          if (!res.ok) { toast(res.message || "Could not open the folder dialog.", true); return; }
          if (res.data && res.data.cancelled) { return; }
          if (!res.data || !res.data.path) { toast(res.message || "No folder returned.", true); return; }
          Store.set(self.key, res.data.path);           // remember the folder
          syncToolbar();
          showList(res.data.presets);
          toast("Preset folder set.");
        });
      });

      // ----- Floating Refresh button -----
      // The toolbar (and its Refresh button) sits at the top of the tab, so after scrolling down a long preset
      // list you had to scroll all the way back up. This second Refresh button is docked at the bottom edge of
      // the panel (position: sticky, see css/mt-preset-fab.css) and fades in only while the toolbar one is
      // scrolled out of view. It is mounted into the panel right after renderTab() has attached this tab, and
      // it disappears with the tab (the panel is emptied on every tab switch), so nothing is left behind.
      var fabDock = document.createElement("div");
      fabDock.className = "preset-fab-dock";
      fabDock.innerHTML = '<button class="preset-fab" id="preset-fab-refresh" type="button" title="Refresh presets" aria-label="Refresh presets" tabindex="-1">' + ICON_REFRESH_SVG + "</button>";
      var fabBtn = fabDock.firstChild;
      var fabRaf = 0;

      function updateFab() {
        fabRaf = 0;
        var m = $("main");
        if (!m || !document.body.contains(wrap)) {
          if (m) { m.removeEventListener("scroll", onFabScroll); }
          return;
        }
        var r = refreshBtn.getBoundingClientRect(), mr = m.getBoundingClientRect();
        // Toolbar card collapsed (zero-size button): fall back to a plain scroll distance.
        var out = (r.width === 0 && r.height === 0) ? m.scrollTop > 120 : r.bottom < mr.top + 4;
        fabBtn.classList.toggle("is-shown", out && !!self.folder());
        fabBtn.tabIndex = fabBtn.classList.contains("is-shown") ? 0 : -1;
      }
      function onFabScroll() { if (!fabRaf) { fabRaf = requestAnimationFrame(updateFab); } }

      setTimeout(function () {
        var m = $("main"), host = wrap.parentNode;
        if (!m || !host) { return; }
        host.appendChild(fabDock);
        m.addEventListener("scroll", onFabScroll, { passive: true });
        updateFab();
      }, 0);

      refreshBtn.addEventListener("click", function () {
        var m = $("main"), top = m ? m.scrollTop : 0;      // keep the scroll position while the list is rebuilt
        fabBtn.classList.add("is-loading");
        busy(refreshBtn, refresh(), function () {
          fabBtn.classList.remove("is-loading");
          if (m) { jumpScroll(m, top); }
          updateFab();
          toast("Preset list refreshed.");
        });
      });
      fabBtn.addEventListener("click", function () {
        if (fabBtn.classList.contains("is-loading")) { return; }
        refreshBtn.click();                                // same handler, same toast
      });

      saveBtn.addEventListener("click", function () {
        var folder = self.folder();
        if (!folder) { return; }
        busyResult(saveBtn, Bridge.call("PRE_saveSelection", [folder]), function (res) {
          if (res.data && res.data.presets) { showList(res.data.presets); }   // list updates right away
          // Requirement 1: copy every newly-written .ffx straight into the Documents backup
          // folder too. Best-effort and silent - a failed backup never blocks the real save.
          if (Node && res.ok && res.data && res.data.added && res.data.added.length) {
            res.data.added.forEach(function (name) { Node.backupCopyFromParts(folder, name + ".ffx", "Presets"); });
          }
          toast(res.message || (res.ok ? "Done." : "Something went wrong."), !res.ok);
        });
      });

      // Live search: re-render the list from the cached scan on every keystroke (no host round-trip).
      searchEl.addEventListener("input", function () {
        Presets.query = searchEl.value;
        searchClearBtn.hidden = !Presets.query;
        applyFilter();
        keepSearchInView();
      });
      searchEl.addEventListener("keydown", function (e) {
        if (e.key === "Escape" && Presets.query) { e.stopPropagation(); searchClearBtn.click(); }
      });
      searchClearBtn.addEventListener("click", function () {
        Presets.query = "";
        searchEl.value = "";
        searchClearBtn.hidden = true;
        applyFilter();
        searchEl.focus();
      });

      listEl.addEventListener("click", function (e) {
        var btn = e.target.closest ? e.target.closest("[data-action]") : null;
        if (!btn || btn.classList.contains("is-loading")) { return; }

        if (btn.getAttribute("data-action") === "toggle-folder") {
          var card = btn.closest(".preset-folder");
          if (!card) { return; }
          if (listEl.classList.contains("is-searching")) {
            // While searching every folder with hits is shown open; the header just folds it for now
            // and the remembered open/closed state (openFolders) is left alone.
            card.classList.toggle("is-search-collapsed");
            return;
          }
          var name = card.getAttribute("data-folder-name");
          var nowOpen = !card.classList.contains("is-open");
          // The enclosing collapsible card (.ta-group-body) may still have a pinned pixel max-height
          // from its open animation; release it so an expanding folder is never clipped.
          var grpBody = card.closest(".ta-group-body");
          if (grpBody) { grpBody.style.maxHeight = "none"; }
          card.classList.toggle("is-open", nowOpen);
          btn.setAttribute("aria-expanded", String(nowOpen));
          openFolders[name] = nowOpen;
          return;
        }

        var row = btn.closest(".preset-item");
        var file = row ? row.getAttribute("data-file") : "";
        var folder = self.folder();
        if (!file || !folder) { return; }

        if (btn.getAttribute("data-action") === "more") {
          var willOpen = !row.classList.contains("is-actions-open");
          closeActions();
          if (willOpen) { row.classList.add("is-actions-open"); btn.setAttribute("aria-expanded", "true"); }
        } else if (btn.getAttribute("data-action") === "reveal") {
          closeActions();
          // Node route first; when it cannot start (or is missing) the ExtendScript route (PRE_reveal) takes over, so the toast only shows when BOTH fail.
          var revealViaAE = function () {
            Bridge.call("PRE_reveal", [folder, file]).then(function (res) { if (!res.ok) { toast(res.message || "Couldn't open that file location.", true); } });
          };
          if (!Node || !Node.revealPreset(folder, file, revealViaAE)) { revealViaAE(); }
        } else if (btn.getAttribute("data-action") === "fav") {
          toggleFavorite(file);   // re-renders the list; favorites sort to the top of their folder / group
        } else if (btn.getAttribute("data-action") === "pin") {
          var pinName = row.querySelector(".preset-name") ? row.querySelector(".preset-name").textContent : file;
          closeActions();
          Shortcutz.pinFfx({ folder: folder, file: file, name: pinName });
        } else if (btn.getAttribute("data-action") === "apply") {
          disarmAll();
          busyResult(btn, Bridge.call("PRE_apply", [folder, file]), function (res) {
            if (res.ok) {
              presetLastStore.set(folder, file);
              markWorks(folder, file);   // applied without an error: a red support mark was wrong
              markLastUsedInDom(row);   // DOM-only update so the Apply button's success flash isn't wiped by a re-render
            }
            var tooNew = !res.ok && /newer version of After Effects/i.test(String(res.message || ""));
            if (tooNew) { markTooNew(folder, file); }   // the green check only knows about effects, not the file's version: learn it from AE's answer
            toast(tooNew ? "This preset was saved in a newer After Effects than yours, so it can't be applied here. It is now marked as not supported."
              : (res.message || (res.ok ? "Applied." : "Something went wrong.")), !res.ok);
            setTimeout(closeActions, 600);   // let the Apply button's pass/fail flash finish first
          });
        } else if (btn.getAttribute("data-action") === "delete") {
          if (!btn.classList.contains("is-confirm")) { arm(btn); return; }
          disarmAll();
          busy(btn, Bridge.call("PRE_delete", [folder, file]), function (res) {
            if (res.ok && res.data && res.data.presets) { showList(res.data.presets); }   // list updates right away
            toast(res.message || (res.ok ? "Deleted." : "Something went wrong."), !res.ok);
          });
        }
      });

      // Long-press to favorite: mirrors listEl's own action-button click handler above,
      // but for a press-and-hold anywhere else on the card.
      listEl.addEventListener("pointerdown", function (e) {
        if (e.button !== undefined && e.button !== 0) { return; }   // left click / touch / pen only
        var itemEl = e.target.closest ? e.target.closest(".preset-item") : null;
        if (!itemEl || (e.target.closest && (e.target.closest("[data-action]") || e.target.closest(".preset-tray")))) { return; }
        lpClear();
        lpEl = itemEl; lpStartX = e.clientX; lpStartY = e.clientY; lpFired = false;
        itemEl.classList.add("is-pressing");
        lpTimer = setTimeout(function () {
          lpFired = true;
          itemEl.classList.remove("is-pressing");
          toggleFavorite(itemEl.getAttribute("data-file"));
        }, LONG_PRESS_MS);
      });
      listEl.addEventListener("pointermove", function (e) {
        if (!lpEl) { return; }
        if (Math.abs(e.clientX - lpStartX) > LONG_PRESS_MOVE_TOLERANCE || Math.abs(e.clientY - lpStartY) > LONG_PRESS_MOVE_TOLERANCE) {
          lpClear();
        }
      });
      ["pointerup", "pointercancel", "pointerleave"].forEach(function (evt) {
        listEl.addEventListener(evt, function () { lpClear(); });
      });
      // A long-press that already toggled the favorite shouldn't also fire a trailing click.
      listEl.addEventListener("click", function (e) {
        if (lpFired && !(e.target.closest && e.target.closest("[data-action]"))) {
          lpFired = false;
          e.stopImmediatePropagation();
          e.preventDefault();
        }
      }, true);

      // ----- Support check (which presets work in this After Effects) -----
      // Reads every .ffx in the list (Node), collects the effects it uses and compares them with app.effects
      // from After Effects (PRE_supportInfo). All effects installed = green check, any missing = red cross
      // (the tooltip names them), unreadable file = grey dash. Results are cached per file (size + modified
      // time), so re-opening the tab, favoriting or importing only re-reads what changed.
      var supportBtn = wrap.querySelector("#preset-support-btn");
      var supBar = wrap.querySelector("#preset-support");
      var supVer = wrap.querySelector("#psup-ver");
      var supNote = wrap.querySelector("#psup-note");
      var supRecheck = wrap.querySelector("#psup-recheck");
      var supFilterBtns = supBar.querySelectorAll("[data-psf]");
      var supMove = wrap.querySelector("#psup-move");
      var supDel = wrap.querySelector("#psup-del");
      var UNSUP_DIR = "Unsupported";      // subfolder the red presets are moved to
      var SUP_CHUNK = 30;
      var SUP_ICONS = {
        ok: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.7 2.7L16 9.8"/></svg>',
        bad: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M9 9l6 6M15 9l-6 6"/></svg>',
        na: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M8.5 12h7"/></svg>'
      };

      function supportOn() { return !!Presets.support.on; }

      function supportResult(file) {
        var S = Presets.support;
        return (S.on && S.results[self.folder() + "|" + file]) || null;
      }

      function supportTitle(r) {
        if (r.state === "ok" && r.verified) { return "Works: it applied without an error in this After Effects"; }
        if (r.state === "ok") { return r.effects.length ? "Supported: uses " + r.effects.length + (r.effects.length === 1 ? " effect" : " effects") + ", all installed" : "Supported: needs no effects"; }
        if (r.state === "bad" && r.reason) { return "Not supported: " + r.reason; }
        if (r.state === "bad") { return "Some effects are not installed: " + r.missing.join(", ") + ". The preset may still apply, without them."; }
        return "Couldn't read this file";
      }

      function supportIconHtml(r) {
        if (!r) { return ""; }
        var label = r.state === "ok" ? "Supported" : (r.state === "bad" ? "Not supported" : "Unreadable");
        return '<span class="preset-support is-' + r.state + '" role="img" aria-label="' + label + '" title="' + escapeHtml(supportTitle(r)) + '">' + SUP_ICONS[r.state] + "</span>";
      }

      function aeVersionLabel(v) {
        var years = { 16: "2019", 17: "2020", 18: "2021", 22: "2022", 23: "2023", 24: "2024", 25: "2025", 26: "2026" };
        var num = String(v || "").split("x")[0].split(".").slice(0, 2).join(".");
        var major = parseInt(num, 10);
        return "After Effects " + (years[major] ? years[major] + " (" + num + ")" : num);
      }

      function allPresetFiles() {
        var out = [];
        if (!lastPresets) { return out; }
        lastPresets.uncategorized.forEach(function (p) { out.push(p.file); });
        lastPresets.categorized.forEach(function (g) { g.files.forEach(function (p) { out.push(p.file); }); });
        return out;
      }

      // Presets that After Effects itself refused with "created with a newer version" (the effects check cannot see a file's version).
      // Remembered per file + size/modified time, so the red mark survives a restart and goes away when the file is replaced.
      var TOO_NEW_REASON = "saved in a newer After Effects than this one";
      function tooNewMap() { try { return JSON.parse(Store.get("presetTooNew") || "{}") || {}; } catch (e) { return {}; } }
      function markTooNew(folder, file, noPaint) {
        var key = folder + "|" + file, sig = Node ? Node.ffxSig(Node.joinPath(folder, file)) : "", m = tooNewMap();
        m[key] = sig; try { Store.set("presetTooNew", JSON.stringify(m)); } catch (e) { }
        var wm = worksMap(); if (wm.hasOwnProperty(key)) { delete wm[key]; try { Store.set("presetWorks", JSON.stringify(wm)); } catch (e3) { } }
        if (Presets.support.on) { Presets.support.results[key] = { state: "bad", missing: [], effects: [], sig: sig, reason: TOO_NEW_REASON }; if (!noPaint) { paintSupport(); } }
      }

      // Presets in the "Unsupported" folder are red on purpose (their file signature changed when they were moved).
      function inUnsupDir(file) { return String(file).indexOf(UNSUP_DIR + "/") === 0; }
      function filesByState(state, withUnsupDir) {
        return allPresetFiles().filter(function (f) {
          var r = supportResult(f);
          return r && r.state === state && (withUnsupDir || !inUnsupDir(f));
        });
      }

      // The effect list is only a guess; applying is the real test. A preset that applies without an error is remembered as working
      // (per file + size/modified time) and shows green even if the effect check said red; the "newer version" mark is dropped then.
      function worksMap() { try { return JSON.parse(Store.get("presetWorks") || "{}") || {}; } catch (e) { return {}; } }
      function markWorks(folder, file) {
        var key = folder + "|" + file, S = Presets.support, sig = Node ? Node.ffxSig(Node.joinPath(folder, file)) : "";
        var tn = tooNewMap(), hadNew = tn.hasOwnProperty(key), r = S.on ? S.results[key] : null, wm;
        if (hadNew) { delete tn[key]; try { Store.set("presetTooNew", JSON.stringify(tn)); } catch (e1) { } }
        if (!hadNew && !(r && r.state === "bad")) { return; }
        wm = worksMap(); wm[key] = sig; try { Store.set("presetWorks", JSON.stringify(wm)); } catch (e2) { }
        if (S.on) { S.results[key] = { state: "ok", missing: [], effects: [], sig: sig, verified: true }; paintSupport(); }
      }

      function checkOne(file) {
        var S = Presets.support, folder = self.folder(), key = folder + "|" + file;
        var abs = Node.joinPath(folder, file), sig = Node.ffxSig(abs), prev = S.results[key];
        if (prev && prev.sig === sig) { return; }
        if (worksMap()[key] === sig) { S.results[key] = { state: "ok", missing: [], effects: [], sig: sig, verified: true }; return; }
        if (inUnsupDir(file)) { S.results[key] = { state: "bad", missing: [], effects: [], sig: sig, reason: "kept in the Unsupported folder" }; return; }
        if (tooNewMap()[key] === sig) { S.results[key] = { state: "bad", missing: [], effects: [], sig: sig, reason: TOO_NEW_REASON }; return; }
        var r = Node.ffxEffects(abs), missing = [];
        if (!r.ok) { S.results[key] = { state: "na", missing: [], effects: [], sig: sig }; return; }
        r.effects.forEach(function (m) { if (!S.info.set[m] && m.indexOf("Pseudo/") !== 0) { missing.push(m); } });
        S.results[key] = { state: missing.length ? "bad" : "ok", missing: missing, effects: r.effects, sig: sig };
      }

      // Updates icons, counts and the bar in place (no list rebuild, so scroll and open folders stay put).
      function paintSupport() {
        var S = Presets.support, on = supportOn();
        supBar.hidden = !on;
        supportBtn.setAttribute("aria-pressed", on ? "true" : "false");
        supportBtn.classList.toggle("is-active", on);
        listEl.classList.toggle("has-support", on);
        var rows = listEl.querySelectorAll(".preset-item"), i, counts = { ok: 0, bad: 0, na: 0 };
        for (i = 0; i < rows.length; i++) {
          var r = supportResult(rows[i].getAttribute("data-file")), old = rows[i].querySelector(".preset-support");
          if (old) { old.parentNode.removeChild(old); }
          rows[i].setAttribute("data-support", r ? r.state : "");
          if (r) {
            counts[r.state]++;
            var name = rows[i].querySelector(".preset-name");
            if (name) { name.insertAdjacentHTML("beforebegin", supportIconHtml(r)); }
          }
        }
        if (on) {
          supVer.textContent = S.info ? aeVersionLabel(S.info.version) : "After Effects";
          var total = counts.ok + counts.bad + counts.na;
          Array.prototype.forEach.call(supFilterBtns, function (b) {
            var f = b.getAttribute("data-psf"), n = f === "all" ? total : counts[f];
            b.querySelector(".psup-n").textContent = String(n);
            b.classList.toggle("is-on", S.filter === f);
            b.setAttribute("aria-pressed", S.filter === f ? "true" : "false");
            if (f === "na") { b.hidden = !counts.na && S.filter !== "na"; }
          });
          supNote.textContent = S.running ? "Checking presets\u2026"
            : (counts.bad ? "Hover a red icon to see why. Red is a guess from the effect list: a preset that applies fine turns green by itself."
              : (total ? "Every effect these presets use is installed." : ""));
          supRecheck.disabled = S.running;
          var nMove = filesByState("bad", false).length, nDel = filesByState("bad", true).length;
          supMove.hidden = !nMove; supDel.hidden = !nDel;
          supMove.textContent = "Move unsupported (" + nMove + ")";
          if (!supDel.classList.contains("is-confirm")) { supDel.textContent = "Delete unsupported (" + nDel + ")"; }
        }
        applyFilter();
      }

      // Reads the effect list from AE when needed (first run, or `reload`), then checks files in small batches.
      function runSupport(reload) {
        var S = Presets.support, folder = self.folder(), token = ++S.token;
        if (!folder || !supportOn()) { return Promise.resolve(); }
        if (!Node) {
          S.on = false; Store.set("presetSupportOn", "0"); paintSupport();
          toast("The support check needs Node.js, which isn't available in this build.", true);
          return Promise.resolve();
        }
        function checkFiles() {
          return new Promise(function (resolve) {
            var files = allPresetFiles(), i = 0;
            function step() {
              if (token !== S.token || !live()) { resolve(); return; }
              var end = Math.min(i + SUP_CHUNK, files.length);
              for (; i < end; i++) { checkOne(files[i]); }
              if (i < files.length) { setTimeout(step, 0); return; }
              S.running = false; paintSupport(); resolve();
            }
            step();
          });
        }
        S.running = true;
        paintSupport();
        if (S.info && !reload) { return checkFiles(); }
        return Bridge.call("PRE_supportInfo", []).then(function (res) {
          if (token !== S.token) { return; }
          if (!res.ok || !res.data || !res.data.effects) {
            S.running = false; S.on = false; Store.set("presetSupportOn", "0"); paintSupport();
            toast(res.message || "Couldn't read the effect list from After Effects.", true);
            return;
          }
          var set = {}, sig = res.data.aeVersion + "|" + res.data.effects.length;
          res.data.effects.forEach(function (m) { set[m] = 1; });
          if (!S.info || S.info.sig !== sig) { S.results = {}; }   // new AE or plugin set: results no longer apply
          S.info = { version: res.data.aeVersion, sig: sig, set: set };
          return checkFiles();
        });
      }

      var supTimer = 0;
      function scheduleSupport() {            // called after every list rebuild
        clearTimeout(supTimer);
        supTimer = setTimeout(function () { if (live()) { runSupport(false); } }, 0);
      }

      supportBtn.addEventListener("click", function () {
        var S = Presets.support;
        if (!self.folder()) { return; }
        S.on = !S.on;
        Store.set("presetSupportOn", S.on ? "1" : "0");
        if (!S.on) { S.filter = "all"; S.token++; S.running = false; paintSupport(); return; }
        runSupport(false);
      });
      supRecheck.addEventListener("click", function () { runSupport(true); });

      function afterBulk(res, okText) {
        if (res && res.ok && res.data && res.data.presets) { showList(res.data.presets); }
        toast((res && res.message) || (res && res.ok ? okText : "Something went wrong."), !(res && res.ok));
      }
      supMove.addEventListener("click", function () {
        var folder = self.folder(), files = filesByState("bad", false);
        if (!folder || !files.length) { return; }
        busy(supMove, Bridge.call("PRE_moveMany", [folder, JSON.stringify(files), UNSUP_DIR]), function (res) { afterBulk(res, "Moved."); });
      });
      var delTimer = 0;
      function disarmDel() { clearTimeout(delTimer); delTimer = 0; supDel.classList.remove("is-confirm"); paintSupport(); }
      supDel.addEventListener("click", function () {
        var folder = self.folder(), files = filesByState("bad", true);
        if (!folder || !files.length) { return; }
        if (!supDel.classList.contains("is-confirm")) {          // first click arms, second click deletes
          supDel.classList.add("is-confirm");
          supDel.textContent = "Click again to delete " + files.length;
          delTimer = setTimeout(disarmDel, 4000);
          return;
        }
        clearTimeout(delTimer); delTimer = 0; supDel.classList.remove("is-confirm");
        busy(supDel, Bridge.call("PRE_deleteMany", [folder, JSON.stringify(files)]), function (res) { afterBulk(res, "Deleted."); });
      });
      supBar.addEventListener("click", function (e) {
        var b = e.target.closest ? e.target.closest("[data-psf]") : null;
        if (!b) { return; }
        Presets.support.filter = b.getAttribute("data-psf");
        paintSupport();
      });

      // ----- Drop to import -----
      // Drag .ffx files (or a folder of them) from Explorer / Finder onto this tab: a tray of folder tiles
      // slides up from the bottom edge, and the folder cards in the list light up as targets too. Drop on a
      // tile or a card = copied straight into that folder; "New folder" asks for a name first. The toolbar's
      // Import button feeds the same tray (File.openDialog, then click a tile), which is also the fallback
      // if a host build never delivers file drops to the panel. The copy itself is PRE_import in host.jsx.
      var PDROP_IDLE_MS = 900;
      var ICON_DROP_ROOT_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/></svg>';
      var ICON_DROP_NEW_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>';
      var tray = document.createElement("div");
      tray.className = "pdrop";
      tray.setAttribute("role", "group");
      tray.setAttribute("aria-label", "Choose a folder for the presets");
      tray.setAttribute("aria-hidden", "true");
      var trayMode = "";          // "", "drag", "pick" (Import button) or "name" (waiting for a new folder name)
      var pendingPaths = null;    // files waiting for a tile click (pick) or a folder name (name)
      var dropDepth = 0, dragCount = 0, idleTimer = 0, markedEl = null;

      function live() { return document.body.contains(wrap); }

      function trayTilesHtml() {
        var cats = (lastPresets && lastPresets.categorized) || [];
        var rootCount = (lastPresets && lastPresets.uncategorized) ? lastPresets.uncategorized.length : 0;
        var html = '<button type="button" class="pdrop-tile" data-target="root">' + ICON_DROP_ROOT_SVG +
          '<span class="pdrop-name">Ungrouped</span><span class="pdrop-count">' + rootCount + '</span><span class="pdrop-plus">+</span></button>';
        cats.forEach(function (g) {
          html += '<button type="button" class="pdrop-tile" data-target="folder" data-name="' + escapeHtml(g.folderName) + '" title="' + escapeHtml(g.folderName) + '">' + ICON_FOLDER_SVG +
            '<span class="pdrop-name">' + escapeHtml(g.folderName) + '</span><span class="pdrop-count">' + g.files.length + '</span><span class="pdrop-plus">+</span></button>';
        });
        html += '<button type="button" class="pdrop-tile pdrop-tile--new" data-target="new">' + ICON_DROP_NEW_SVG +
          '<span class="pdrop-name">New folder</span><span class="pdrop-plus">+</span></button>';
        return html;
      }

      function placeTray() {
        var m = $("main"), r = m ? m.getBoundingClientRect() : null;
        tray.style.left = (r ? r.left : 0) + "px";
        tray.style.width = (r ? r.width : window.innerWidth) + "px";
        tray.style.bottom = (r ? Math.max(0, window.innerHeight - r.bottom) : 0) + "px";
      }

      function showTray(mode, paths) {
        trayMode = mode;
        pendingPaths = paths || null;
        var n = paths ? paths.length : 0;
        var head = mode === "pick"
          ? '<span class="pdrop-title">Add ' + n + (n === 1 ? " item" : " items") + ' to</span><button type="button" class="pdrop-cancel" data-pdrop="cancel">Cancel</button>'
          : '<span class="pdrop-title">Drop on a folder</span>';
        tray.innerHTML = '<div class="pdrop-head">' + head + '</div><div class="pdrop-grid">' + trayTilesHtml() + "</div>";
        if (!tray.parentNode) { document.body.appendChild(tray); }
        placeTray();
        void tray.offsetWidth;   // commit the closed state so the slide-up transition runs
        tray.classList.add("is-open");
        tray.setAttribute("aria-hidden", "false");
        if (mode === "pick") {
          var first = tray.querySelector(".pdrop-tile");
          if (first) { first.focus(); }
        }
      }

      function hideTray() {
        clearTimeout(idleTimer);
        trayMode = "";
        pendingPaths = null;
        dropDepth = 0;
        markTarget(null);
        tray.classList.remove("is-open");
        tray.setAttribute("aria-hidden", "true");
      }

      function showName(paths) {
        trayMode = "name";
        pendingPaths = paths;
        clearTimeout(idleTimer);
        markTarget(null);
        tray.innerHTML = '<div class="pdrop-head"><span class="pdrop-title">Name the new folder</span><button type="button" class="pdrop-cancel" data-pdrop="cancel">Cancel</button></div>' +
          '<div class="pdrop-name-row"><input type="text" class="text-input pdrop-name-input" maxlength="60" placeholder="Folder name" aria-label="New folder name" autocomplete="off" spellcheck="false">' +
          '<button type="button" class="btn btn-primary" data-pdrop="create">Add presets</button></div>';
        placeTray();
        tray.classList.add("is-open");
        tray.setAttribute("aria-hidden", "false");
        var inp = tray.querySelector(".pdrop-name-input");
        if (inp) { inp.focus(); }
      }

      function markTarget(t) {
        var el = t ? t.el : null;
        if (el === markedEl) { return; }
        if (markedEl) { markedEl.classList.remove("is-drop-target"); }
        markedEl = el;
        if (el) {
          el.classList.add("is-drop-target");
          var pl = el.querySelector ? el.querySelector(".pdrop-plus") : null;
          if (pl) { pl.textContent = dragCount > 0 ? "+" + dragCount : "+"; }
        }
      }

      function hasFiles(e) {
        var t = e.dataTransfer && e.dataTransfer.types, i;
        if (!t) { return false; }
        for (i = 0; i < t.length; i++) { if (t[i] === "Files") { return true; } }
        return false;
      }

      function collectPaths(e) {
        var fl = e.dataTransfer && e.dataTransfer.files, out = [], i;
        if (!fl) { return out; }
        for (i = 0; i < fl.length; i++) { if (fl[i] && fl[i].path) { out.push(String(fl[i].path).replace(/\\/g, "/")); } }
        return out;
      }

      // What is under the pointer: a tray tile, a folder card in the list, or the Ungrouped part of the list.
      function targetFromEl(el) {
        if (!el || !el.closest) { return null; }
        var tile = el.closest(".pdrop-tile");
        if (tile && tray.contains(tile)) {
          return { kind: tile.getAttribute("data-target"), name: tile.getAttribute("data-name") || "", el: tile };
        }
        if (!listEl.contains(el)) { return null; }
        var card = el.closest(".preset-folder");
        if (card) { return { kind: "folder", name: card.getAttribute("data-folder-name"), el: card }; }
        var loose = el.closest(".preset-list--loose") || el.closest('.preset-group-heading[data-group="loose"]') || el.closest(".preset-group-empty");
        if (loose) { return { kind: "root", name: "", el: loose }; }
        return null;
      }

      // After the copy: open the folders that received files, scroll to the first new row and flash the new rows.
      function revealAdded(files) {
        var rows = listEl.querySelectorAll(".preset-item"), hits = [], i;
        for (i = 0; i < rows.length; i++) {
          if (files.indexOf(rows[i].getAttribute("data-file")) !== -1) { hits.push(rows[i]); }
        }
        if (!hits.length) { return; }
        hits.forEach(function (r) { r.classList.add("is-just-added"); });
        setTimeout(function () { hits.forEach(function (r) { r.classList.remove("is-just-added"); }); }, 2400);
        requestAnimationFrame(function () {
          var m = $("main");
          if (!m) { return; }
          var r = hits[0].getBoundingClientRect(), mr = m.getBoundingClientRect();
          if (r.top < mr.top + 40 || r.bottom > mr.bottom - 40) { jumpScroll(m, m.scrollTop + r.top - mr.top - mr.height * 0.3); }
        });
      }

      function runImport(paths, sub) {
        var folder = self.folder();
        if (!folder) { toast("Select a preset folder first.", true); return; }
        hideTray();
        Bridge.call("PRE_import", [folder, JSON.stringify(paths), sub || ""]).then(function (res) {
          if (res.ok && res.data && res.data.presets) {
            ((res.data.folders) || []).forEach(function (n) { openFolders[n] = true; });
            if (Presets.query) {          // a filter would hide the new rows
              Presets.query = ""; searchEl.value = ""; searchClearBtn.hidden = true;
            }
            var grp = listEl.closest ? listEl.closest(".ta-group-body") : null;
            if (grp) { grp.style.maxHeight = "none"; }
            showList(res.data.presets);
            revealAdded(res.data.files || []);
          }
          toast(res.message || (res.ok ? "Done." : "Something went wrong."), !res.ok);
        });
      }

      function dropOn(t, paths) {
        if (t.kind === "new") { showName(paths); return; }
        runImport(paths, t.kind === "folder" ? t.name : "");
      }

      function detachDrop() {
        window.removeEventListener("dragenter", onDragEnter, true);
        window.removeEventListener("dragover", onDragOver, true);
        window.removeEventListener("dragleave", onDragLeave, true);
        window.removeEventListener("drop", onDrop, true);
        clearTimeout(idleTimer);
        if (tray.parentNode) { tray.parentNode.removeChild(tray); }
      }

      function onDragEnter(e) {
        if (!live()) { detachDrop(); return; }
        if (!hasFiles(e)) { return; }
        e.preventDefault();                       // never let the panel navigate to a dropped file
        if (!self.folder() || trayMode === "pick" || trayMode === "name") { return; }
        dropDepth++;
        dragCount = (e.dataTransfer.items && e.dataTransfer.items.length) || 0;
        if (dropDepth === 1) { showTray("drag"); }
      }

      function onDragOver(e) {
        if (!live()) { detachDrop(); return; }
        if (!hasFiles(e)) { return; }
        e.preventDefault();
        var t = (self.folder() && trayMode === "drag") ? targetFromEl(e.target) : null;
        try { e.dataTransfer.dropEffect = t ? "copy" : "none"; } catch (x) { /* read-only in some builds */ }
        markTarget(t);
        if (trayMode === "drag") {
          clearTimeout(idleTimer);
          idleTimer = setTimeout(function () { if (trayMode === "drag") { hideTray(); } }, PDROP_IDLE_MS);   // drag ended without a drop
        }
      }

      function onDragLeave(e) {
        if (!live()) { detachDrop(); return; }
        if (!hasFiles(e) || trayMode !== "drag") { return; }
        dropDepth = Math.max(0, dropDepth - 1);
        if (!dropDepth) { hideTray(); }
      }

      function onDrop(e) {
        if (!live()) { detachDrop(); return; }
        if (!hasFiles(e)) { return; }
        e.preventDefault();
        if (trayMode !== "drag") { return; }
        var t = targetFromEl(e.target), paths = collectPaths(e);
        dropDepth = 0;
        clearTimeout(idleTimer);
        if (!t) { hideTray(); return; }
        if (!paths.length) {
          hideTray();
          toast("Couldn't read the dropped files. Use Import instead.", true);
          return;
        }
        markTarget(null);
        dropOn(t, paths);
      }

      window.addEventListener("dragenter", onDragEnter, true);
      window.addEventListener("dragover", onDragOver, true);
      window.addEventListener("dragleave", onDragLeave, true);
      window.addEventListener("drop", onDrop, true);

      tray.addEventListener("click", function (e) {
        var btn = e.target.closest ? e.target.closest("button") : null;
        if (!btn) { return; }
        var act = btn.getAttribute("data-pdrop");
        if (act === "cancel") { hideTray(); return; }
        if (act === "create") {
          var inp = tray.querySelector(".pdrop-name-input"), nm = inp ? inp.value.replace(/^\s+|\s+$/g, "") : "";
          if (!nm) { if (inp) { inp.focus(); } toast("Enter a folder name.", true); return; }
          runImport(pendingPaths || [], nm);
          return;
        }
        if (trayMode === "pick" && btn.classList.contains("pdrop-tile") && pendingPaths) {
          dropOn({ kind: btn.getAttribute("data-target"), name: btn.getAttribute("data-name") || "" }, pendingPaths);
        }
      });
      tray.addEventListener("keydown", function (e) {
        if (e.key === "Escape") { e.stopPropagation(); hideTray(); }
        else if (e.key === "Enter" && trayMode === "name" && e.target.classList && e.target.classList.contains("pdrop-name-input")) {
          e.preventDefault();
          var ok = tray.querySelector('[data-pdrop="create"]');
          if (ok) { ok.click(); }
        }
      });

      importBtn.addEventListener("click", function () {
        if (!self.folder()) { return; }
        busyResult(importBtn, Bridge.call("PRE_pickImport", []), function (res) {
          if (!res.ok) { toast(res.message || "Could not open the file dialog.", true); return; }
          if (!res.data || res.data.cancelled) { return; }
          var picked = res.data.paths || [];
          if (!picked.length) { toast("No files selected.", true); return; }
          showTray("pick", picked);
        });
      });

      var cached = (Presets.cache && Presets.cache.folder === self.folder()) ? Presets.cache : null;
      if (cached) {
        syncToolbar();
        showList(cached.presets);   // instant paint, same frame as the tab itself
        setTimeout(revalidate, motionOff() ? 0 : 450);
      } else {
        refresh();
      }
      return wrap;
    }
  };

  // ---------------------------------------------------------
  // Wheel-scroll forwarding (bugfix: scrolling stopped working over cards/tiles/buttons)
  // Some CEP/CEF builds silently swallow the wheel event once the cursor is over a button or an
  // inner card/tile instead of letting it bubble up, so mouse-wheel scrolling only worked when the
  // cursor happened to be over empty background. This listens on the document in the CAPTURE phase
  // (fires before anything on the target itself could intercept it) and, unless the cursor is over
  // a genuine inner scroll area that can still move in that direction (an open accordion body, the
  // expression-code preview box, the horizontal category-tab strip, ...), manually scrolls the
  // panel's one true scroll container (`.main`) by the wheel's deltaY itself.
  // NeuCurve is explicitly excluded (per requirement 3): its tab sets `.main.is-curve`, and its
  // canvas lives in an isolated <iframe> anyway, so wheel there is left completely alone for curve
  // manipulation/zoom.
  // ---------------------------------------------------------
  var ScrollForward = {
    init: function () {
      var mainEl = $("main");
      if (!mainEl) { return; }

      // Walks up from `el` (stopping at `mainEl`) looking for a genuine nested scroll area -
      // something with overflow-y:auto/scroll that actually has more content than it can show.
      function findScroller(el) {
        while (el && el !== mainEl && el !== document.body && el.nodeType === 1) {
          var cs = getComputedStyle(el);
          if ((cs.overflowY === "auto" || cs.overflowY === "scroll") && el.scrollHeight > el.clientHeight + 1) {
            return el;
          }
          el = el.parentNode;
        }
        return null;
      }

      document.addEventListener("wheel", function (e) {
        if (document.body.classList.contains("is-bg-edit")) { return; }   // wheel = background zoom there
        if (e.defaultPrevented) { return; }   // already handled (js/smooth-scroll.js glides it) - never scroll twice
        if (mainEl.classList.contains("is-curve")) { return; } // NeuCurve: hands off entirely
        if (!mainEl.contains(e.target)) { return; } // sidebar tab list, settings modal, etc. keep native behavior

        var scroller = findScroller(e.target);
        if (scroller) {
          // It's a real inner scroller (e.g. an open accordion, the code preview box): only steal
          // the wheel from it once it's maxed out in that direction, same as normal scroll-chaining.
          var goingDown = e.deltaY > 0;
          var atBottom = scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 1;
          var atTop = scroller.scrollTop <= 0;
          if ((goingDown && !atBottom) || (!goingDown && !atTop)) { return; }
        }

        // Smooth glide (js/smooth-scroll.js, loaded after this file - it exists by the time any wheel
        // event fires). Falls back to the old instant jump if that script is missing.
        if (!(window.SmoothScroll && window.SmoothScroll.scrollBy(mainEl, e))) { mainEl.scrollTop += e.deltaY; }
        e.preventDefault();
      }, { passive: false, capture: true });
    }
  };

  // ---------------------------------------------------------
  // Idle Screensaver
  // After N seconds without mouse activity the whole UI (.app) fades out and is then display:none'd, so
  // CEF stops styling / laying out / painting it - the only thing still animating is the background
  // video/GIF, which keeps playing underneath the clock overlay (#idle-clock). Any mouse movement brings
  // the UI back only through the unlock bar at the bottom ("slide", "tap" or "both"), or Esc.
  // Mouse movement does not leave Idle Mode, so notes and tasks on the idle screen can be clicked and edited.
  // Saved in localStorage (via Store): "idleEnabled" = "1"/"0", "idleTimeout" = seconds, "idleExit" = "both"/"slide"/"tap".
  // ---------------------------------------------------------
  var Idle = {
    enabledKey: "idleEnabled",
    timeoutKey: "idleTimeout",
    messageKey: "idleMessage",
    positionKey: "idlePosition",
    scaleKey: "idleScale",
    exitKey: "idleExit",
    DEFAULT_EXIT: "both",
    EXITS: ["both", "slide", "tap", "move"],
    SLIDE_DONE: 0.88,        // handle released past this share of the track = unlock
    DEFAULT_SECONDS: 60,
    MIN_SECONDS: 5,
    MAX_SECONDS: 3600,
    DEFAULT_POSITION: "top-left",
    POSITIONS: ["top-left", "top-right", "bottom-left", "bottom-right", "center"],
    DEFAULT_SCALE: 100,
    MIN_SCALE: 60,
    MAX_SCALE: 160,
    MOVE_THRESHOLD: 2,       // px - smaller moves count as jitter / browser-synthesized mouse events
    PARK_DELAY_MS: 450,      // > the .app fade-out in css/mt-idle-motion.css (0.3s): parked (off-screen) only after the fade
    CLOCK_24H: true,         // false = 12-hour clock without AM/PM (like the iPhone)
    DAYS: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
    MONTHS: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],

    enabled: false,
    seconds: 60,
    isIdle: false,
    lastActive: 0,
    lastX: null,
    lastY: null,
    checkTimer: 0,
    clockTimer: 0,
    parkTimer: 0,
    msgTimer: 0,             // delayed removal of the message card class after the exit fade
    savedScroll: [],
    SESSION_START_KEY: "sessionStart",   // epoch ms - mulai sesi editing (disimpan, bertahan walau panel ditutup sebentar)
    SESSION_BEAT_KEY: "sessionBeat",     // epoch ms - detak terakhir panel hidup
    SESSION_BEAT_MS: 30000,              // seberapa sering detak ditulis
    SESSION_GAP_MS: 180000,              // detak terakhir lebih tua dari ini = AE sempat ditutup -> sesi baru
    sessionStart: 0,
    frameInside: false,      // mouse is over the Curve iframe (its events don't reach this document)
    frameHooked: false,      // ...unless we could attach listeners inside it (same-origin)

    clamp: function (v) {
      var n = parseInt(v, 10);
      if (!isFinite(n)) { n = this.DEFAULT_SECONDS; }
      return Math.max(this.MIN_SECONDS, Math.min(this.MAX_SECONDS, n));
    },

    clampScale: function (v) {
      var n = parseInt(v, 10);
      if (!isFinite(n)) { n = this.DEFAULT_SCALE; }
      return Math.max(this.MIN_SCALE, Math.min(this.MAX_SCALE, n));
    },

    clampPosition: function (v) {
      return this.POSITIONS.indexOf(v) !== -1 ? v : this.DEFAULT_POSITION;
    },

    clampExit: function (v) {
      return this.EXITS.indexOf(v) !== -1 ? v : this.DEFAULT_EXIT;
    },

    init: function () {
      var self = this, root = document.documentElement, frame = $("curve-frame");
      this.appEl = document.querySelector(".app");
      this.clockEl = $("idle-clock");
      this.timeEl = $("idle-time");
      this.dateEl = $("idle-date");
      this.toggleEl = $("idle-enabled");
      this.inputEl = $("idle-timeout");
      this.rowEl = $("idle-timeout-row");
      this.messageEl = $("idle-message-el");
      this.messageInputEl = $("idle-message");
      this.sessionEl = $("idle-session");
      this.positionEl = $("idle-position");
      this.scaleEl = $("idle-scale");
      this.scaleValEl = $("idle-scale-val");
      this.exitEl = $("idle-exit");
      this.unlockEl = $("idle-unlock");
      this.unlockTrack = $("iu-track");
      this.unlockFill = $("iu-fill");
      this.unlockLabel = $("iu-label");
      this.unlockHandle = $("iu-handle");
      this.canUnlock = !!(this.unlockEl && this.unlockTrack && this.unlockHandle);
      if (!this.appEl || !this.clockEl || !this.timeEl || !this.dateEl || !this.toggleEl || !this.inputEl) { return; }

      this.initSession();
      this.enabled = Store.get(this.enabledKey) === "1";
      this.seconds = this.clamp(Store.get(this.timeoutKey));
      this.position = this.clampPosition(Store.get(this.positionKey));
      this.scale = this.DEFAULT_SCALE; Store.remove(this.scaleKey);   // the Clock Scale slider is gone: size is set with the Adjust button (js/mt-idle-adjust.js)
      this.exitMode = this.clampExit(Store.get(this.exitKey));
      this.lastActive = Date.now();
      this.syncControls();
      this.applyPosition();
      this.applyScale();
      this.applyExitMode();
      this.bindUnlock();
      this.bindLeave();
      if (this.messageInputEl) { this.messageInputEl.value = Store.get(this.messageKey) || ""; }

      this.onCheck = function () { self.check(); };
      this.onMove = function (e) { self.handleMove(e); };
      this.onActivity = function () { self.markActive(); };
      this.onEdge = function () { self.lastX = null; self.lastY = null; self.markActive(); };

      // Activity tracking. Handlers return immediately while the feature is off.
      document.addEventListener("mousemove", this.onMove, true);
      root.addEventListener("mouseenter", this.onEdge);
      root.addEventListener("mouseleave", this.onEdge);
      // Extras so the screensaver never kicks in while you are clicking, scrolling or typing:
      document.addEventListener("mousedown", this.onActivity, true);
      document.addEventListener("wheel", this.onActivity, true);
      window.addEventListener("mt-wheel-activity", this.onActivity);   // wheel over the tab bar (js/tab-wheel.js stops the real event)
      document.addEventListener("keydown", this.onActivity, true);
      // Esc always leaves Idle Mode .
      document.addEventListener("keydown", function (e) {
        if ((e.key === "Escape" || e.keyCode === 27) && self.isIdle) { e.stopPropagation(); self.exit(); }
      }, true);

      // The Curve tab is an <iframe>: mouse events inside it never reach this document.
      if (frame) {
        frame.addEventListener("mouseenter", function () { self.frameInside = true; self.markActive(); });
        frame.addEventListener("mouseleave", function () { self.frameInside = false; self.markActive(); });
        frame.addEventListener("load", function () { self.hookFrame(frame); });
      }

      // Settings controls
      this.toggleEl.addEventListener("change", function () { self.setEnabled(self.toggleEl.checked); });
      this.inputEl.addEventListener("change", function () { self.setSeconds(self.inputEl.value); });
      if (this.positionEl) {
        this.positionEl.addEventListener("change", function () { self.setPosition(self.positionEl.value); });
      }
      if (this.exitEl) {
        this.exitEl.addEventListener("change", function () { self.setExitMode(self.exitEl.value); });
      }
      if (this.scaleEl) {
        // live preview while dragging ("input"), persisted once released ("change") - same split as the
        // Display editor's zoom/position sliders (applyBgView() vs saveBgView()).
        this.scaleEl.addEventListener("input", function () { self.scale = self.clampScale(self.scaleEl.value); self.applyScale(); });
        this.scaleEl.addEventListener("change", function () { Store.set(self.scaleKey, String(self.scale)); });
      }
      if (this.messageInputEl) {
        this.messageInputEl.addEventListener("input", function () {
          var saved = Store.set(self.messageKey, self.messageInputEl.value.slice(0, 140));
          if (!saved) { toast("Storage is full. This message will not be kept after closing. Remove the GIF background to free space.", true); }
        });
      }

      this.arm();
    },

    // ----- editing session length ("You've been in After Effects for ...") -----
    // Panel menulis "detak" ke localStorage tiap 30 dtk. Saat panel dimuat: kalau detak terakhir masih
    // baru (< 3 mnt) berarti AE masih sesi yang sama -> lanjutkan hitungan; kalau tidak ada / sudah lama
    // berarti AE baru dibuka -> mulai dari 0. Catatan: bila panel ditutup > 3 mnt di tengah sesi AE,
    // hitungan mulai ulang (panel tidak bisa tahu kapan proses AE dimulai).
    initSession: function () {
      var self = this, now = Date.now();
      var start = parseInt(Store.get(this.SESSION_START_KEY), 10);
      var beat = parseInt(Store.get(this.SESSION_BEAT_KEY), 10);
      if (!isFinite(start) || !isFinite(beat) || start > now || beat > now + 60000 || now - beat > this.SESSION_GAP_MS) {
        start = now;
      }
      this.sessionStart = start;
      Store.set(this.SESSION_START_KEY, String(start));
      Store.set(this.SESSION_BEAT_KEY, String(now));
      setInterval(function () { Store.set(self.SESSION_BEAT_KEY, String(Date.now())); }, this.SESSION_BEAT_MS);
    },

    // 0 -> "less than 1 minute", 45 -> "45 minutes", 83 -> "1 hour 23 minutes", 120 -> "2 hours", 1500 -> "1 day 1 hour"
    formatSession: function (ms) {
      var min = Math.max(0, Math.floor(ms / 60000));
      if (min < 1) { return "less than 1 minute"; }
      function unit(n, word) { return n + " " + word + (n === 1 ? "" : "s"); }
      var d = Math.floor(min / 1440), h = Math.floor((min % 1440) / 60), m = min % 60, out = [];
      if (d) { out.push(unit(d, "day")); }
      if (h) { out.push(unit(h, "hour")); }
      if (m && !d) { out.push(unit(m, "minute")); }
      return out.join(" ");
    },

    // Same-origin iframe: listen inside it too, so working in the graph editor counts as activity.
    hookFrame: function (frame) {
      this.frameHooked = false;
      try {
        var doc = frame.contentWindow.document;      // throws when the frame is cross-origin
        doc.addEventListener("mousemove", this.onMove, true);
        doc.addEventListener("mousedown", this.onActivity, true);
        doc.addEventListener("wheel", this.onActivity, true);
        doc.addEventListener("keydown", this.onActivity, true);
        this.frameHooked = true;
      } catch (e) { /* fall back to the enter/leave tracking above */ }
    },

    // ----- activity -----
    handleMove: function (e) {
      if (!this.enabled) { return; }
      if (this.isIdle && this.exitMode !== "move") { return; }          // mouse movement leaves Idle Mode only in "move" mode
      var x = e.screenX, y = e.screenY;
      // Hiding the UI makes Chromium fire a synthetic mousemove at the SAME coordinates (the element under
      // the cursor changed). Requiring real movement stops that from instantly ending Idle Mode.
      if (this.lastX !== null && Math.abs(x - this.lastX) + Math.abs(y - this.lastY) < this.MOVE_THRESHOLD) { return; }
      this.lastX = x; this.lastY = y;
      this.markActive();
    },

    markActive: function () {
      if (!this.enabled) { return; }
      if (this.isIdle && this.exitMode !== "move") { return; }          // only the unlock bar / Esc leave Idle Mode (any activity in "move" mode)
      this.lastActive = Date.now();       // cheap: no timer is touched on every mousemove
      if (this.isIdle) { if (Date.now() - this.idleSince < 700) { return; } this.exit(); }   // "move" mode: ignore the synthetic mousemove Chromium fires while the UI hides
    },

    // ----- idle timer: ONE pending timeout that re-checks itself, never one per mousemove -----
    arm: function () {
      clearTimeout(this.checkTimer);
      this.checkTimer = 0;
      if (!this.enabled || this.isIdle) { return; }
      this.checkTimer = setTimeout(this.onCheck, this.seconds * 1000);
    },

    disarm: function () { clearTimeout(this.checkTimer); this.checkTimer = 0; },

    check: function () {
      this.checkTimer = 0;
      if (!this.enabled || this.isIdle) { return; }
      var wait = this.seconds * 1000 - (Date.now() - this.lastActive);
      if (wait > 0) { this.checkTimer = setTimeout(this.onCheck, wait); return; }   // there was activity meanwhile
      if (this.blocked()) { this.checkTimer = setTimeout(this.onCheck, 1000); return; }
      this.enter();
    },

    // Never start while something interactive is open or the mouse is inside the Curve iframe.
    blocked: function () {
      return document.body.classList.contains("is-bg-edit") ||     // Settings > Display editor is open
        $("settings-modal").classList.contains("is-open") ||
        ContextMenu.el.classList.contains("is-open") ||
        !!document.querySelector(".is-loading, .is-pending") ||   // a host call / AE dialog (camera, preset save...) is running
        (this.frameInside && !this.frameHooked);
    },

    // ----- enter / exit -----
    enter: function () {
      var self = this;
      if (this.isIdle) { return; }
      this.isIdle = true;
      this.idleSince = Date.now();
      try { if (document.activeElement && document.activeElement !== document.body) { document.activeElement.blur(); } } catch (eB) { }
      this.resetUnlock();                                  // handle back at the start, no transition
      if (this.unlockEl) { this.unlockEl.setAttribute("aria-hidden", "false"); }
      this.startClock();                                   // text is ready before the fade-in
      this.showMessage();
      this.clockEl.setAttribute("aria-hidden", "false");
      clearTimeout(this.msgTimer);                         // a late "message out" from the previous exit must not hit this entry
      document.body.classList.add("is-idle");              // CSS (css/mt-idle-motion.css): panel leaves, clock + widgets arrive
      clearTimeout(this.parkTimer);
      this.parkTimer = setTimeout(function () {
        self.saveScroll();                                 // belt and braces: scroll offsets are restored on exit
        document.body.classList.add("is-idle-parked");     // CSS: UI moves off-screen (keeps its size) -> no paint
      }, this.PARK_DELAY_MS);
    },

    exit: function () {
      var self = this;
      if (!this.isIdle) { return; }
      this.isIdle = false;
      clearTimeout(this.parkTimer);
      this.stopClock();
      // The message card leaves WITH the clock (css fade, 0.22 s) instead of vanishing on the first frame: its "is-in" class is
      // dropped only after the fade. showMessage() restarts the animation on the next entry anyway.
      if (this.messageEl) {
        clearTimeout(this.msgTimer);
        this.msgTimer = setTimeout(function () { if (!self.isIdle && self.messageEl) { self.messageEl.classList.remove("is-in"); } }, 360);
      }
      // Un-park WITHOUT a transition: .app jumps from far off-screen to its hidden rest spot (still opacity 0), and only then
      // do the transitions come back, so the panel rises + fades in from where it left instead of sliding in from -200vw.
      this.appEl.style.transition = "none";
      document.body.classList.remove("is-idle-parked");
      void this.appEl.offsetWidth;                         // committed here, with transitions off
      this.appEl.style.transition = "";
      document.body.classList.remove("is-idle");
      this.clockEl.setAttribute("aria-hidden", "true");
      if (this.unlockEl) { this.unlockEl.setAttribute("aria-hidden", "true"); }
      this.dragging = false;
      try { if (document.activeElement && this.clockEl.contains(document.activeElement)) { document.activeElement.blur(); } } catch (eC) { }
      this.restoreScroll();
      indicatorPlaced = false; moveIndicator();            // tab indicator was measured as 0 while hidden
      this.lastActive = Date.now();
      this.arm();
    },

    // display:none throws away scroll offsets, so remember them (one-off scan, only when parking).
    saveScroll: function () {
      var all = this.appEl.querySelectorAll("*"), i, el;
      this.savedScroll = [];
      if (this.appEl.scrollTop || this.appEl.scrollLeft) { this.savedScroll.push([this.appEl, this.appEl.scrollTop, this.appEl.scrollLeft]); }
      for (i = 0; i < all.length; i++) {
        el = all[i];
        if (el.scrollTop || el.scrollLeft) { this.savedScroll.push([el, el.scrollTop, el.scrollLeft]); }
      }
    },

    restoreScroll: function () {
      var i, s;
      for (i = 0; i < this.savedScroll.length; i++) {
        s = this.savedScroll[i];
        s[0].style.scrollBehavior = "auto"; s[0].scrollTop = s[1]; s[0].scrollLeft = s[2]; s[0].style.scrollBehavior = "";   // jump, never animate
      }
      this.savedScroll = [];
    },

    // ----- clock (runs ONLY while idle; re-arms itself for the next minute boundary) -----
    pad: function (n) { return n < 10 ? "0" + n : String(n); },

    // The time is drawn as one slot per character (.it-c). When a character changes while the idle screen is on, the old one rolls
    // up and out and the new one rises in from below (css/mt-idle-time.css). The text is kept in this._timeStr, not read back from the DOM
    // (during the roll a slot holds both the old and the new character).
    renderTime: function (time) {
      var el = this.timeEl, prev = this._timeStr, i, k = 0, slot, o, n, kids;
      if (!el || prev === time) { return; }
      this._timeStr = time;
      kids = el.children;
      if (!prev || prev.length !== time.length || kids.length !== time.length) {          // first draw (or a different length): plain, no motion
        el.textContent = "";
        for (i = 0; i < time.length; i++) {
          slot = document.createElement("span"); slot.className = "it-c" + (time.charAt(i) === ":" ? " it-colon" : "");
          n = document.createElement("span"); n.className = "it-n"; n.textContent = time.charAt(i);
          slot.appendChild(n); el.appendChild(slot);
        }
        return;
      }
      var self = this;
      for (i = 0; i < time.length; i++) {
        if (prev.charAt(i) === time.charAt(i)) { continue; }
        slot = kids[i];
        if (slot._rt) { clearTimeout(slot._rt); slot._rt = 0; }
        slot.textContent = "";
        o = document.createElement("span"); o.className = "it-o"; o.textContent = prev.charAt(i);
        n = document.createElement("span"); n.className = "it-n"; n.textContent = time.charAt(i);
        o.style.animationDelay = (k * 70) + "ms"; n.style.animationDelay = (k * 70 + 60) + "ms";   // changed digits follow each other, left to right; the new one starts 60 ms after the old one
        slot.appendChild(o); slot.appendChild(n);
        slot.classList.remove("is-roll"); void slot.offsetWidth; slot.classList.add("is-roll");
        slot._rt = setTimeout((function (sl) { return function () { sl._rt = 0; if (sl.firstChild && sl.firstChild.className === "it-o") { sl.removeChild(sl.firstChild); } sl.classList.remove("is-roll"); }; })(slot), 900 + k * 70);
        k++;
      }
    },

    updateClock: function () {
      var d = new Date(), h = d.getHours();
      if (!this.CLOCK_24H) { h = h % 12 || 12; }
      var time = (this.CLOCK_24H ? this.pad(h) : String(h)) + ":" + this.pad(d.getMinutes());
      var date = this.DAYS[d.getDay()] + ", " + d.getDate() + " " + this.MONTHS[d.getMonth()];
      this.renderTime(time);                                                      // no DOM write unless it changed
      if (window.MTRoll) { window.MTRoll.set(this.dateEl, date); }                   // changed digits of the date roll (js/mt-idle-roll.js)
      else if (this.dateEl.textContent !== date) { this.dateEl.textContent = date; }
      if (this.sessionEl) {
        var sess = "You've been in After Effects for " + this.formatSession(d.getTime() - this.sessionStart);
        if (this.sessionEl.textContent !== sess) { this.sessionEl.textContent = sess; }
      }
    },

    startClock: function () {
      var self = this, d;
      clearTimeout(this.clockTimer);
      this.updateClock();
      d = new Date();
      this.clockTimer = setTimeout(function () { self.startClock(); }, 60000 - (d.getSeconds() * 1000 + d.getMilliseconds()) + 30);
    },

    stopClock: function () { clearTimeout(this.clockTimer); this.clockTimer = 0; this._timeStr = ""; if (window.MTRoll) { window.MTRoll.reset(this.dateEl); } },   // next idle start draws the time plain, without a roll

    // Reads the saved custom message and (re)plays its slide-up/fade-in animation.
    // Removing the class, forcing a reflow, then re-adding it is the same trick
    // used elsewhere in this file (see the label accordion) to restart a CSS
    // animation that already ran once - without it, only the FIRST idle entry
    // of the session would animate.
    showMessage: function () {
      if (!this.messageEl) { return; }
      var msg = (Store.get(this.messageKey) || "").trim();
      this.messageEl.textContent = msg;
      this.messageEl.classList.remove("is-in");
      if (!msg) { return; }
      void this.messageEl.offsetWidth;
      this.messageEl.classList.add("is-in");
    },

    // ----- settings -----
    syncControls: function () {
      this.toggleEl.checked = this.enabled;
      this.inputEl.value = this.seconds;
      this.inputEl.disabled = !this.enabled;
      if (this.rowEl) { this.rowEl.classList.toggle("is-disabled", !this.enabled); }
      if (this.positionEl) { this.positionEl.value = this.position; }
      if (this.exitEl) { this.exitEl.value = this.exitMode; }
      if (this.scaleEl) {
        this.scaleEl.value = this.scale;
        if (window.__rfUpdateFill) { window.__rfUpdateFill(this.scaleEl); }   // slider fill-trail, see panel-refinements.js
      }
      if (this.scaleValEl) { this.scaleValEl.textContent = this.scale + "%"; }
    },

    // Clock Position (Settings > Idle Screensaver): which corner (or center) the clock,
    // session chip and message card are anchored to. Applied via [data-position] on
    // .idle-clock - see the .idle-clock[data-position="..."] rules in style.css.
    applyPosition: function () {
      if (this.clockEl) { this.clockEl.setAttribute("data-position", this.position); }
    },

    setPosition: function (pos) {
      this.position = this.clampPosition(pos);
      Store.set(this.positionKey, this.position);
      this.applyPosition();
      this.syncControls();
    },

    // Clock Scale (Settings > Idle Screensaver): multiplies the date/time/session/message
    // font sizes via the --idle-scale custom property read by each of their font-size: calc(...).
    applyScale: function () {
      if (this.clockEl) { this.clockEl.style.setProperty("--idle-scale", this.scale / 100); }
      if (this.scaleValEl) { this.scaleValEl.textContent = this.scale + "%"; }
    },

    // ----- unlock bar (bottom of the idle screen) -----
    // Slide: drag the round handle to the end of the bar (>= SLIDE_DONE of the way) and release.
    // Tap: click the bar. Both: keyboard Enter / Space / Right arrow on the handle.
    applyExitMode: function () {
      if (!this.unlockEl) { return; }
      var txt = this.exitMode === "move" ? "Move the mouse to open" : this.exitMode === "tap" ? "Tap to open" : (this.exitMode === "slide" ? "Slide to open" : "Slide or tap");
      this.unlockEl.setAttribute("data-mode", this.exitMode);
      if (this.unlockLabel) { this.unlockLabel.textContent = txt; }
      if (this.unlockHandle) { this.unlockHandle.setAttribute("aria-label", txt); }
      this.resetUnlock();
    },

    setExitMode: function (mode) {
      this.exitMode = this.clampExit(mode);
      Store.set(this.exitKey, this.exitMode);
      this.applyExitMode();
      this.syncControls();
    },

    // Move the handle / fill to progress p (0..1) with no transition.
    setUnlockProgress: function (p) {
      if (!this.canUnlock) { return; }
      var max = this.slideMax(), x = Math.max(0, Math.min(1, p)) * max;
      this.unlockHandle.style.transform = "translate3d(" + x + "px,0,0)";
      if (this.unlockFill) { this.unlockFill.style.transform = "scaleX(" + ((x + this.unlockHandle.offsetWidth + 4) / Math.max(1, this.unlockTrack.clientWidth)) + ")"; }
      if (this.unlockLabel) { this.unlockLabel.style.opacity = String(Math.max(0, 1 - p * 1.6)); }
      this.unlockProgress = p;
    },

    slideMax: function () {
      return Math.max(1, this.unlockTrack.clientWidth - this.unlockHandle.offsetWidth - 8);   // 4px padding each side
    },

    resetUnlock: function () {
      if (!this.canUnlock) { return; }
      this.unlockEl.classList.remove("is-dragging", "is-releasing");
      this.unlockHandle.style.transform = "";
      if (this.unlockFill) { this.unlockFill.style.transform = ""; }
      if (this.unlockLabel) { this.unlockLabel.style.opacity = ""; }
      this.unlockProgress = 0;
      this.dragging = false;
    },

    bindUnlock: function () {
      if (!this.canUnlock) { return; }
      var self = this, startX = 0, startP = 0;
      function px(e) { return e.touches && e.touches.length ? e.touches[0].clientX : (e.changedTouches && e.changedTouches.length ? e.changedTouches[0].clientX : e.clientX); }
      function begin(e) {
        if (self.exitMode === "tap" || !self.isIdle) { return; }
        if (e.type === "mousedown" && e.button !== 0) { return; }
        self.dragging = true; self.didDrag = false; startX = px(e); startP = self.unlockProgress || 0;
        self.unlockEl.classList.add("is-dragging"); self.unlockEl.classList.remove("is-releasing");
        e.preventDefault();
      }
      function move(e) {
        if (!self.dragging) { return; }
        if (e.type === "mousemove" && e.buttons === 0) { finish(); return; }     // button released outside the panel
        self.setUnlockProgress(startP + (px(e) - startX) / self.slideMax());
        if (Math.abs(self.unlockProgress) > 0.02) { self.didDrag = true; }
        if (e.cancelable) { e.preventDefault(); }
      }
      function finish() {
        if (!self.dragging) { return; }
        self.dragging = false;
        self.unlockEl.classList.remove("is-dragging"); self.unlockEl.classList.add("is-releasing");
        if ((self.unlockProgress || 0) >= self.SLIDE_DONE) {
          self.setUnlockProgress(1);
          setTimeout(function () { self.exit(); }, 140);
        } else {
          self.setUnlockProgress(0);                                              // spring back (CSS transition)
        }
      }
      this.unlockHandle.addEventListener("mousedown", begin);
      this.unlockHandle.addEventListener("touchstart", begin, { passive: false });
      document.addEventListener("mousemove", move, true);
      document.addEventListener("touchmove", move, { passive: false, capture: true });
      document.addEventListener("mouseup", finish, true);
      document.addEventListener("touchend", finish, true);
      document.addEventListener("touchcancel", finish, true);
      window.addEventListener("blur", finish);

      // Tap mode: the whole bar is the button. Slide mode: a plain click only nudges the handle to show it must be dragged.
      this.unlockTrack.addEventListener("click", function (e) {
        if (!self.isIdle) { return; }
        if (self.exitMode === "tap" || (self.exitMode === "both" && !self.didDrag)) { self.exit(); return; }
      });
      this.unlockHandle.addEventListener("click", function (e) {
        if (!self.isIdle) { return; }
        if (self.exitMode === "slide" && e.detail !== 0 && !self.didDrag) {       // real mouse click (no drag): hint only
          self.unlockEl.classList.remove("is-hint"); void self.unlockEl.offsetWidth; self.unlockEl.classList.add("is-hint");
        }
      });
      this.unlockHandle.addEventListener("keydown", function (e) {
        if (e.key === "Enter" || e.key === " " || e.key === "ArrowRight" || e.keyCode === 13 || e.keyCode === 32 || e.keyCode === 39) {
          e.preventDefault(); e.stopPropagation(); self.exit();
        }
      });
      this.unlockEl.addEventListener("animationend", function () { self.unlockEl.classList.remove("is-hint"); });
    },

    // ----- leaving the idle screen -----
    // Leaving is ONLY done by: the unlock bar (bindUnlock), Esc (bound in init) or, in "move" mode, mouse activity.
    // A click on an empty spot of the idle screen does NOT leave any more: it used to open the panel even when the click was
    // nowhere near the "Tap to open" / "Slide to open" bar (tap + slide modes). Clicks on cards, chips and buttons never left either.
    bindLeave: function () { /* intentionally empty: see above */ },

    setEnabled: function (on) {
      this.enabled = !!on;
      Store.set(this.enabledKey, this.enabled ? "1" : "0");
      this.lastX = null; this.lastY = null;
      this.lastActive = Date.now();
      this.syncControls();
      if (this.enabled) { this.arm(); } else { this.disarm(); this.exit(); }
    },

    setSeconds: function (raw) {
      this.seconds = this.clamp(raw);
      this.inputEl.value = this.seconds;                  // show the clamped value
      Store.set(this.timeoutKey, String(this.seconds));
      this.lastActive = Date.now();
      this.arm();
    },

    // Settings > "Reset everything"
    reset: function () {
      Store.remove(this.enabledKey);
      Store.remove(this.timeoutKey);
      Store.remove(this.messageKey);
      Store.remove(this.positionKey);
      Store.remove(this.scaleKey);
      Store.remove(this.exitKey);
      this.exitMode = this.DEFAULT_EXIT;
      this.enabled = false;
      this.seconds = this.DEFAULT_SECONDS;
      this.position = this.DEFAULT_POSITION;
      this.scale = this.DEFAULT_SCALE;
      if (this.messageInputEl) { this.messageInputEl.value = ""; }
      if (this.messageEl) { this.messageEl.textContent = ""; this.messageEl.classList.remove("is-in"); }
      this.disarm();
      this.exit();
      this.applyPosition();
      this.applyScale();
      this.applyExitMode();
      this.syncControls();
    }
  };

  // ---------------------------------------------------------
  // Theme sync with the After Effects UI brightness
  // ---------------------------------------------------------
  function syncTheme() {
    // Glass: Settings > Light / Dark can pin the scheme ("mtx.glassMode" light|dark); "Auto" = follow the AE UI below.
    if (document.documentElement.getAttribute("data-ui-theme") !== "material") {
      var gm = null; try { gm = localStorage.getItem("mtx.glassMode"); } catch (e) {}
      if (gm === "light" || gm === "dark") { document.documentElement.setAttribute("data-theme", gm); return; }
    }
    if (!cs || !FOLLOW_HOST_THEME) { return; }
    // Material You (Settings > Style) has its own light/dark scheme (js/mt-material.js): ignore the AE host UI brightness.
    if (document.documentElement.getAttribute("data-ui-theme") === "material") { document.documentElement.setAttribute("data-theme", document.documentElement.getAttribute("data-md-scheme") === "dark" ? "dark" : "light"); return; }
    try {
      var c = cs.getHostEnvironment().appSkinInfo.panelBackgroundColor.color;
      var brightness = (c.red + c.green + c.blue) / 3;
      document.documentElement.setAttribute("data-theme", brightness > 128 ? "light" : "dark");
    } catch (e) {}
  }
  window.mtSyncTheme = syncTheme;                       // js/mt-uitheme.js calls this when leaving Material You

  // ---------------------------------------------------------
  // Core API for js/mt-hotkeys.js (command palette + keyboard shortcuts).
  // Read-only handles: the hotkey module builds its command list from these, it never changes panel state itself.
  // ---------------------------------------------------------
  window.MTCore = {
    Bridge: Bridge,
    toast: toast,
    TABS: TABS,
    showTab: showTab,
    runTool: runTool,
    SaveFrame: SaveFrame,
    Shortcutz: Shortcutz,
    currentTab: function () { return currentTab; }
  };

  // ---------------------------------------------------------
  // Boot
  // ---------------------------------------------------------
  document.addEventListener("DOMContentLoaded", function () {
    syncTheme();
    if (cs) { try { cs.addEventListener(CSInterface.THEME_COLOR_CHANGED_EVENT, syncTheme); } catch (e) {} }
    initTabs();
    initResponsiveLayout();
    ContextMenu.init();
    Settings.init();
    Idle.init();
    ScrollForward.init();

    // Requirement 1: create ~/Documents/Multitool_CEP_Data/saved_expressions.json (if missing) and,
    // if this is a fresh/reinstalled panel with nothing in localStorage yet, restore from it right
    // away - not just when the user happens to open the Expression Code tab.
    try {
      var legacy = null;
      try { legacy = JSON.parse(Store.get("exprSnippets") || "null"); } catch (e) {}
      var seed = exprCatStore.ensure("Snippets", legacy || []);
      ExprFile.restoreIfNeeded(seed, null);
    } catch (e) {}
  });
})();
