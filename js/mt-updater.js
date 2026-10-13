/**
 * mt-updater.js - in-panel auto updater ("Update Now"), v2 - RE-Faster style (plain fetch(), no Node, no zip, no PowerShell).
 *
 * How it works (see README, section "AUTO UPDATE v2"):
 *   1. Reads the installed version + GitHub repo from <extension>/version.json  { "version", "repo", "branch"?, "feed"? }.
 *   2. Silently (and from Settings > Updates > "Check update") downloads a tiny JSON feed with fetch():
 *        { "latest_version": "1.9.0", "changelog": "...", "files": [ { "path": "js/main.js", "sha256": "..." }, ... ] }
 *      Sources, tried at the same time, first good answer wins:
 *        a) version.json "feed" (e.g. a GitHub Gist raw link - same idea as RE-Faster),
 *        b) https://raw.githubusercontent.com/<repo>/<branch>/update.json,
 *        c) https://cdn.jsdelivr.net/gh/<repo>@<branch>/update.json   (other host, used when the first two are blocked).
 *   3. Newer version -> banner "Update Now / Later / What's new".
 *   4. Update Now: downloads every file in the feed with fetch() (raw.githubusercontent.com, then jsDelivr as backup),
 *      checks each SHA-256, and ONLY IF EVERYTHING downloaded and verified writes the changed files into the extension
 *      folder with cep.fs.writeFile (a failed write restores the previous files), then re-loads host.jsx and reloads the
 *      panel. If CSXS/manifest.xml changed in a way that matters, After Effects has to be restarted instead.
 *
 * Nothing here needs Node.js: it works with the same CEP APIs RE-Faster uses (fetch + window.cep.fs).
 * User data lives outside the extension folder (Documents/... and localStorage), so settings survive.
 * Chromium-74 safe: no optional chaining / nullish coalescing, no flex gap, no inset.
 */
(function () {
  "use strict";

  var START_DELAY_MS = 5000;           // wait for the splash + first paint before the silent check
  var MIN_MINUTES_BETWEEN_CHECKS = 2;  // only stops back-to-back checks when the panel reloads twice in a row (manual / Refresh Panel ignore it)
  var SNOOZE_HOURS = 24;               // "Later" hides the banner for this version this long
  var FEED_TIMEOUT_MS = 15000, FILE_TIMEOUT_MS = 30000;
  var K_FOUND = "mt_update_found", K_LAST = "mt_update_last_check", K_SNOOZE = "mt_update_snooze", K_DONE = "mt_update_done", K_TAB = "mt_reopen_tab", K_FORCE = "mt_update_force_check";

  var $ = function (id) { return document.getElementById(id); };
  var banner = $("mt-update"), field = $("mt-update-field");
  if (!banner || !field) { return; }

  var el = {
    title: $("mt-update-title"), sub: $("mt-update-sub"), bar: $("mt-update-bar"), notes: $("mt-update-notes"),
    now: $("mt-update-now"), later: $("mt-update-later"), more: $("mt-update-more"),
    check: $("mt-update-check"), status: $("mt-update-status"), install: $("mt-update-install")
  };

  // ---------- CEP file access (no Node) ----------
  var CEP = null, FS = null, ENC = null;
  try { CEP = window.cep || (window.parent && window.parent.cep) || null; } catch (e) { CEP = null; }
  if (CEP && CEP.fs) { FS = CEP.fs; ENC = CEP.encoding || { UTF8: "UTF-8", Base64: "Base64" }; }
  var CEP_MSG = "Updates need the CEP file API (window.cep.fs), which is not available here.";

  // ---------- local info ----------
  function extDir() {
    try {
      var p = decodeURI(window.__adobe_cep__.getSystemPath("extension"));
      p = /^file:\/\/\/[A-Za-z]:/.test(p) ? p.replace(/^file:\/\/\//, "") : p.replace(/^file:\/\//, "");
      return p.replace(/\\/g, "/").replace(/\/+$/, "");
    } catch (e) { return ""; }
  }
  function readText(file) {
    try { var r = FS.readFile(file, ENC.UTF8); return (r && r.err === 0 && typeof r.data === "string") ? r.data : null; } catch (e) { return null; }
  }
  function readB64(file) {
    try { var r = FS.readFile(file, ENC.Base64); return (r && r.err === 0 && typeof r.data === "string") ? r.data : null; } catch (e) { return null; }
  }
  function readJson(file) { var t = readText(file); if (t === null) { return null; } try { return JSON.parse(t.replace(/^\uFEFF/, "")); } catch (e) { return null; } }
  function validRepo(r) { return typeof r === "string" && /^[\w.-]+\/[\w.-]+$/.test(r) && r !== "OWNER/REPO"; }
  function validBranch(b) { return typeof b === "string" && /^[\w.\/-]{1,80}$/.test(b) && b.indexOf("..") < 0; }
  function validUrl(u) { return typeof u === "string" && /^https:\/\/[^\s]+$/i.test(u); }
  function local() {
    var d = extDir(), j = (FS && d) ? readJson(d + "/version.json") : null;
    var v = (j && j.version) || "0.0.0", done = "";
    try { done = localStorage.getItem(K_DONE) || ""; } catch (e) { }
    if (done && isNewer(done, v)) { v = norm(done); }     // version.json write failed but the files were installed: do not offer the same update forever
    return { version: v, repo: (j && j.repo) || "", branch: (j && validBranch(j.branch)) ? j.branch : "main", feed: (j && validUrl(j.feed)) ? j.feed : "", raw: j || {} };
  }
  function norm(v) { return String(v || "").replace(/^[^\d]*/, "").split("-")[0]; }
  function isNewer(a, b) {        // is version a newer than b ?
    var x = norm(a).split("."), y = norm(b).split(".");
    for (var i = 0; i < Math.max(x.length, y.length); i++) {
      var m = parseInt(x[i], 10) || 0, n = parseInt(y[i], 10) || 0;
      if (m !== n) { return m > n; }
    }
    return false;
  }

  // A feed entry may only name a plain relative path inside the extension folder (no "..", no drive letters, no leading "/").
  var SEG = "[A-Za-z0-9_\\-. ()\\[\\]@+,~=%&#]+";
  var PATH_RE = new RegExp("^" + SEG + "(?:\\/" + SEG + ")*$");
  function safePath(p) {
    if (typeof p !== "string" || !PATH_RE.test(p)) { return false; }
    var parts = p.split("/"), i;
    for (i = 0; i < parts.length; i++) { if (parts[i] === "." || parts[i] === ".." || /^\.+$/.test(parts[i]) || /\.mtold$/i.test(parts[i])) { return false; } }
    return true;
  }

  // ---------- network: plain fetch() ----------
  function withTimeout(url, ms, asBytes) {
    return new Promise(function (resolve, reject) {
      var done = false, ctl = null, timer;
      try { if (typeof AbortController !== "undefined") { ctl = new AbortController(); } } catch (e) { ctl = null; }
      function fin(ok, v) { if (done) { return; } done = true; clearTimeout(timer); if (ok) { resolve(v); } else { reject(v); } }
      function offline(why) { var oe = new Error("offline"); oe.detail = why; return oe; }
      timer = setTimeout(function () { try { if (ctl) { ctl.abort(); } } catch (e) { } fin(false, offline("timeout")); }, ms);
      var opt = { cache: "no-store" }; if (ctl) { opt.signal = ctl.signal; }
      fetch(url, opt).then(function (r) {
        if (r.status === 404) { var ne = new Error("http 404"); ne.url = url; throw ne; }
        if (!r.ok) { throw new Error("http " + r.status); }
        return asBytes ? r.arrayBuffer() : r.text();
      }).then(function (v) { fin(true, v); }, function (e) {
        if (e && /^http /.test(e.message || "")) { fin(false, e); } else { fin(false, offline((e && e.message) || "network")); }
      });
    });
  }
  function bust(u) { return u + (u.indexOf("?") < 0 ? "?" : "&") + "_=" + Date.now(); }
  function firstOk(makers) {          // run all, resolve with the first success; reject (with every detail) only if all fail
    return new Promise(function (resolve, reject) {
      var left = makers.length, notes = [], settled = false, hard = null;
      if (!left) { return reject(new Error("offline")); }
      makers.forEach(function (m, i) {
        var p; try { p = m(); } catch (e) { p = Promise.reject(e); }
        p.then(function (v) { if (!settled) { settled = true; resolve(v); } }, function (e) {
          notes[i] = (e && (e.detail || e.message)) || "failed";
          if (e && e.message && e.message !== "offline" && !/^http /.test(e.message)) { hard = hard || e; }
          if (--left === 0 && !settled) {
            settled = true;
            var oe = hard || new Error("offline"); if (!hard) { oe.detail = notes.join(" | "); } reject(oe);
          }
        });
      });
    });
  }

  function feedUrls(L) {
    var out = [], base = L.repo + "/" + L.branch, bran = L.repo + "@" + L.branch;
    if (L.feed) { out.push(L.feed); }
    if (validRepo(L.repo)) {
      out.push("https://raw.githubusercontent.com/" + base + "/update.json");
      out.push("https://cdn.jsdelivr.net/gh/" + bran + "/update.json");
    }
    return out;
  }
  function parseFeed(txt) {
    var d; try { d = JSON.parse(String(txt).replace(/^\uFEFF/, "")); } catch (e) { throw new Error("badjson"); }
    if (!d || !d.latest_version) { throw new Error("badjson"); }
    return d;
  }
  function fetchFeed(L) {
    var urls = feedUrls(L);
    return firstOk(urls.map(function (u) { return function () { return withTimeout(bust(u), FEED_TIMEOUT_MS, false).then(parseFeed); }; })).then(function (d) {
      return {
        version: norm(d.latest_version), notes: String(d.changelog || ""), files: Array.isArray(d.files) ? d.files : [],
        remove: Array.isArray(d.remove) ? d.remove : [], ref: (typeof d.ref === "string" && validBranch(d.ref)) ? d.ref : L.branch,
        base: validUrl(d.base) ? d.base.replace(/\/+$/, "") : ""
      };
    });
  }

  // ---------- crypto / encoding helpers ----------
  function toHex(buf) { var a = new Uint8Array(buf), s = "", i; for (i = 0; i < a.length; i++) { s += (a[i] < 16 ? "0" : "") + a[i].toString(16); } return s; }
  function sha256(bytes) {
    try {
      if (window.crypto && window.crypto.subtle && window.crypto.subtle.digest) {
        return window.crypto.subtle.digest("SHA-256", bytes).then(toHex);
      }
    } catch (e) { }
    return Promise.resolve(null);        // no SubtleCrypto in this host: the check is skipped (the files still must download in full)
  }
  function toB64(bytes) {
    var a = new Uint8Array(bytes), s = "", i, CH = 0x8000;
    for (i = 0; i < a.length; i += CH) { s += String.fromCharCode.apply(null, a.subarray(i, i + CH)); }
    return btoa(s);
  }
  function encPath(p) { return p.split("/").map(encodeURIComponent).join("/"); }

  // One file: try each host in turn; a stale CDN copy (hash mismatch) just moves on to the next host.
  function fetchOne(info, L, f) {
    var rel = encPath(f.path), hosts = [];
    if (info.base) { hosts.push(info.base + "/" + rel); }
    if (validRepo(L.repo)) {
      hosts.push("https://raw.githubusercontent.com/" + L.repo + "/" + info.ref + "/" + rel);
      hosts.push("https://cdn.jsdelivr.net/gh/" + L.repo + "@" + info.ref + "/" + rel);
    }
    var want = (typeof f.sha256 === "string" && /^[a-f0-9]{64}$/i.test(f.sha256)) ? f.sha256.toLowerCase() : "";
    var notes = [], sawHash = false;
    function tryHost(i) {
      if (i >= hosts.length) {
        var e = new Error(sawHash ? "hash" : "offline"); e.detail = f.path + ": " + notes.join(" | "); e.file = f.path; return Promise.reject(e);
      }
      return withTimeout(bust(hosts[i]), FILE_TIMEOUT_MS, true).then(function (buf) {
        return sha256(buf).then(function (h) {
          if (want && h && h !== want) { sawHash = true; notes.push("hash mismatch"); return tryHost(i + 1); }
          return { path: f.path, buf: buf, b64: toB64(buf) };
        });
      }, function (e) {
        if (e && e.message === "http 404") { notes.push("404"); } else { notes.push((e && (e.detail || e.message)) || "failed"); }
        return tryHost(i + 1);
      });
    }
    return tryHost(0);
  }

  // ---------- cep.fs write helpers ----------
  function isDir(p) { try { var s = FS.stat(p); return !!(s && s.err === 0 && s.data && s.data.isDirectory && s.data.isDirectory()); } catch (e) { return false; } }
  function mkdirp(dir) {
    if (!dir || isDir(dir)) { return true; }
    var parent = dir.replace(/\/[^\/]*$/, "");
    if (parent && parent !== dir) { mkdirp(parent); }
    try { FS.makedir(dir); } catch (e) { }
    return isDir(dir);
  }
  function writeB64(file, b64) {
    var dir = file.replace(/\/[^\/]*$/, "");
    if (!mkdirp(dir)) { return false; }
    try { var r = FS.writeFile(file, b64, ENC.Base64); return !!(r && r.err === 0); } catch (e) { return false; }
  }
  function delFile(file) { try { var r = FS.deleteFile(file); return !!(r && r.err === 0); } catch (e) { return false; } }
  function b64ToText(b) { try { return decodeURIComponent(escape(atob(b))); } catch (e) { try { return atob(b); } catch (e2) { return ""; } } }
  function manifestCore(t) {
    return String(t).replace(/\r/g, "").replace(/ExtensionBundleVersion="[^"]*"/g, "")
                    .replace(/(<Extension\s+Id="[^"]*"\s+)Version="[^"]*"/g, "$1").replace(/\s+/g, " ");
  }

  // ---------- UI state ----------
  var state = { busy: false, latest: null };
  var toastTimer = null;
  function say(msg, isErr) {
    var t = $("toast"); if (!t) { return; }
    t.textContent = msg; t.classList.toggle("is-error", !!isErr); t.classList.add("is-show");
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.classList.remove("is-show"); }, 3200);
  }
  function prettyNotes(txt) {
    var s = String(txt || "").replace(/\r/g, "").replace(/^\s*[-*]\s+/gm, "\u2022 ").replace(/^#+\s*/gm, "").replace(/[*_`]/g, "").trim();
    return s.length > 700 ? s.slice(0, 700) + "\u2026" : (s || "No release notes provided.");
  }
  function setBar(f) { el.bar.style.transform = "scaleX(" + Math.max(0, Math.min(1, f)) + ")"; }
  function showBanner(on) { banner.classList.toggle("is-show", !!on); banner.setAttribute("aria-hidden", on ? "false" : "true"); }
  function setBusyUi(on) {
    banner.classList.toggle("is-busy", on);
    el.now.disabled = on; el.later.disabled = on; el.check.disabled = on; el.install.disabled = on;
  }
  function errText(e) {
    var m = e && e.message;
    if (m === "offline") { return "Could not reach the update server. Check your internet connection." + (e.detail ? " (" + e.detail + ")" : ""); }
    if (m === "hash") { return "A downloaded file did not match its checksum, so nothing was installed" + (e.file ? " (" + e.file + ")" : "") + ". The server may still be updating: try again in a few minutes."; }
    if (m === "http 404") { return "The update file was not found (404). Check that update.json and the files are pushed to the public repository." + (e.url ? " " + e.url : ""); }
    if (m === "badjson") { return "The update information is not valid JSON. Run Make-Update.bat again and push update.json."; }
    if (m === "nofiles") { return "update.json has no file list. Run Make-Update.bat and push update.json."; }
    if (m === "badpath") { return "update.json contains a file path that is not allowed, so the update was refused."; }
    if (m === "write") { return "Could not write " + (e.file || "a file") + " into the extension folder. Run Auto-Install.bat instead (the previous files were restored)."; }
    if (/^http /.test(m || "")) { return "The update server answered with an error (" + m.slice(5) + ")."; }
    return "Update failed" + (m ? " (" + m + ")" : "") + ".";
  }
  function offerUpdate(info, cur) {
    state.latest = info;
    el.title.textContent = "Update available";
    el.sub.textContent = "v" + norm(cur) + "  \u2192  v" + info.version;
    el.notes.textContent = prettyNotes(info.notes);
    banner.classList.remove("is-open"); setBar(0);
    el.status.textContent = "Version " + norm(cur) + " installed. v" + info.version + " is available.";
    el.install.hidden = false;
    var sn = null; try { sn = JSON.parse(localStorage.getItem(K_SNOOZE) || "null"); } catch (e) { }
    return !(sn && sn.v === info.version && sn.until > Date.now());
  }

  // ---------- check ----------
  function check(manual, fromRefresh) {          // fromRefresh: the sidebar Refresh button asked for it - same as manual, plus a toast
    var L = local();
    if (!FS) { if (manual) { el.status.textContent = CEP_MSG; } if (fromRefresh) { say(CEP_MSG, true); } return Promise.resolve(); }
    el.status.textContent = "Version " + norm(L.version) + " installed.";
    if (!validRepo(L.repo) && !L.feed) {
      if (manual) { el.status.textContent = "Updates are not set up yet: add your GitHub repository to version.json."; }
      if (fromRefresh) { say("Updates are not set up yet (version.json).", true); }
      return Promise.resolve();
    }
    if (state.busy) { return Promise.resolve(); }
    if (!manual) {
      var last = parseInt(localStorage.getItem(K_LAST) || "0", 10);
      if (Date.now() - last < MIN_MINUTES_BETWEEN_CHECKS * 60000) {
        var cached = null; try { cached = JSON.parse(localStorage.getItem(K_FOUND) || "null"); } catch (e) { }
        if (cached && cached.files && isNewer(cached.version, L.version) && offerUpdate(cached, L.version)) { showBanner(true); }
        return Promise.resolve();
      }
    }
    if (manual) { el.status.textContent = "Checking for updates\u2026"; el.check.disabled = true; el.check.textContent = "Checking\u2026"; }
    return fetchFeed(L).then(function (info) {
      try { localStorage.setItem(K_LAST, String(Date.now())); } catch (e) { }
      if (isNewer(info.version, L.version)) {
        try { localStorage.setItem(K_FOUND, JSON.stringify(info)); } catch (e) { }
        var show = offerUpdate(info, L.version);
        if (show || manual) { showBanner(true); }
        if (fromRefresh) { say("Panel refreshed. Update available: v" + info.version); }
      } else {
        state.latest = null; el.install.hidden = true; showBanner(false);
        try { localStorage.removeItem(K_FOUND); } catch (e) { }
        if (manual) { el.status.textContent = "You are up to date (v" + norm(L.version) + ")."; }
        if (fromRefresh) { say("Panel refreshed. You are up to date (v" + norm(L.version) + ")."); }
      }
    }).catch(function (e) {
      if (manual) { el.status.textContent = errText(e); if (fromRefresh) { say("Panel refreshed. Update check failed: " + errText(e), true); } }
      else { el.status.textContent = "Version " + norm(L.version) + " installed. Automatic update check failed: " + errText(e); }
      try { console.log("[MTUpdater] check failed:", e && e.message, e && e.detail); } catch (x) { }
    }).then(function () { el.check.disabled = false; el.check.textContent = "Check update"; }, function () { el.check.disabled = false; el.check.textContent = "Check update"; });
  }

  // ---------- install ----------
  function progress(title, sub, f) {
    el.title.textContent = title; el.sub.textContent = sub; if (f !== null) { setBar(f); }
    el.status.textContent = title + (sub ? " " + sub : "");
  }
  function install() {
    var info = state.latest;
    if (!info || state.busy || !FS) { return; }
    state.busy = true; setBusyUi(true); showBanner(true);
    var ext = extDir(), L = local(), downloaded = [], written = [], restartNeeded = false;

    function rollback() {
      written.forEach(function (w) {
        if (w.old === null) { delFile(w.file); } else { writeB64(w.file, w.old); }
      });
    }

    Promise.resolve().then(function () {
      if (!ext) { throw new Error("write"); }
      progress("Checking latest version\u2026", "", 0);
      // the info saved by the last check can be stale (files re-pushed meanwhile): read the feed again
      return fetchFeed(L).then(function (fresh) { if (fresh && fresh.files && fresh.files.length) { info = fresh; } }, function () { });
    }).then(function () {
      var files = info.files || [], i;
      if (!files.length) { throw new Error("nofiles"); }
      for (i = 0; i < files.length; i++) { if (!files[i] || !safePath(files[i].path)) { throw new Error("badpath"); } }
      for (i = 0; i < (info.remove || []).length; i++) { if (!safePath(info.remove[i])) { throw new Error("badpath"); } }
      // download EVERYTHING first (a few at a time). Nothing is written until every file arrived and verified.
      var idx = 0, done = 0, total = files.length, lanes = 4, failed = null;
      progress("Downloading update\u2026", "0 / " + total, 0);
      return new Promise(function (resolve, reject) {
        function next() {
          if (failed) { return; }
          if (idx >= total) { if (done >= total) { resolve(); } return; }
          var f = files[idx++];
          fetchOne(info, L, f).then(function (r) {
            if (failed) { return; }          // another file already failed: do not overwrite the error message
            downloaded.push(r); done++;
            progress("Downloading update\u2026", done + " / " + total, (done / total) * 0.9);
            next();
          }, function (e) { if (!failed) { failed = e; reject(e); } });
        }
        var n = Math.min(lanes, total), k; for (k = 0; k < n; k++) { next(); }
      });
    }).then(function () {
      progress("Installing\u2026", "", 0.92);
      var i, d, target, oldB64, newManifest = "", oldManifest = "";
      for (i = 0; i < downloaded.length; i++) {
        d = downloaded[i]; target = ext + "/" + d.path; oldB64 = readB64(target);
        if (d.path === "CSXS/manifest.xml") { newManifest = b64ToText(d.b64); oldManifest = oldB64 === null ? "" : b64ToText(oldB64); }
        if (oldB64 !== null && oldB64 === d.b64) { continue; }          // identical: leave it alone
        written.push({ file: target, old: oldB64 });
        if (!writeB64(target, d.b64)) { var we = new Error("write"); we.file = d.path; throw we; }
      }
      (info.remove || []).forEach(function (p) {
        var t = ext + "/" + p, ob = readB64(t);
        if (ob !== null) { written.push({ file: t, old: ob }); delFile(t); }
      });
      restartNeeded = !!newManifest && manifestCore(newManifest) !== manifestCore(oldManifest);
      // version.json last (so a failed update never claims to be the new version); keep repo / branch / feed
      var raw = L.raw || {}, out = {}, k;
      for (k in raw) { if (Object.prototype.hasOwnProperty.call(raw, k)) { out[k] = raw[k]; } }
      out.version = info.version; if (!out.repo && L.repo) { out.repo = L.repo; }
      var vf = ext + "/version.json", vOld = readB64(vf);
      written.push({ file: vf, old: vOld });
      if (!writeB64(vf, btoa(unescape(encodeURIComponent(JSON.stringify(out, null, 2)))))) { var ve = new Error("write"); ve.file = "version.json"; throw ve; }
    }).then(function () {
      state.busy = false; state.latest = null; el.install.hidden = true;
      try { localStorage.setItem(K_DONE, info.version); localStorage.removeItem(K_FOUND); } catch (e) { }
      if (restartNeeded) {
        setBusyUi(false); el.now.hidden = true; el.later.textContent = "OK";
        el.title.textContent = "Updated to v" + info.version;
        el.sub.textContent = "This update changed the panel manifest: restart After Effects to finish.";
        el.status.textContent = "Updated to v" + info.version + ". Restart After Effects to finish.";
        setBar(1);
      } else {
        progress("Updated to v" + info.version, "Reloading\u2026", 1);
        setTimeout(reloadPanel, 900);
      }
    }).catch(function (e) {
      rollback();
      state.busy = false; setBusyUi(false); setBar(0);
      el.title.textContent = "Update failed";
      el.sub.textContent = errText(e);
      el.status.textContent = errText(e);
      el.now.textContent = "Retry";
      try { console.log("[MTUpdater] install failed:", e && e.message, e && e.detail); } catch (x) { }
    });
  }

  // same reload sequence as the sidebar "Refresh Panel" button (js/panel-refresh.js)
  function reloadPanel() {
    try {
      var act = document.querySelector(".tabs .tab.is-active");
      if (act) { localStorage.setItem(K_TAB, act.getAttribute("data-tab")); }
    } catch (e) { }
    var fired = false;
    function go() { if (fired) { return; } fired = true; try { window.location.reload(true); } catch (e) { window.location.href = window.location.href; } }
    var p = extDir();
    if (p && window.__adobe_cep__ && window.__adobe_cep__.evalScript) {
      try { window.__adobe_cep__.evalScript('try { $.evalFile(' + JSON.stringify(p + "/jsx/host.jsx") + '); "ok"; } catch (e) { "err"; }', go); } catch (e) { go(); }
      setTimeout(go, 1500);
    } else { go(); }
  }

  // ---------- wiring ----------
  el.now.addEventListener("click", install);
  el.install.addEventListener("click", install);
  el.check.addEventListener("click", function () { check(true); });
  el.more.addEventListener("click", function () {
    var open = banner.classList.toggle("is-open");
    el.more.textContent = open ? "Hide notes" : "What\u2019s new";
  });
  el.later.addEventListener("click", function () {
    if (state.busy) { return; }
    if (state.latest) {
      try { localStorage.setItem(K_SNOOZE, JSON.stringify({ v: state.latest.version, until: Date.now() + SNOOZE_HOURS * 3600000 })); } catch (e) { }
    }
    showBanner(false);
  });

  var L0 = local();
  el.status.textContent = FS ? ("Version " + norm(L0.version) + " installed." + ((validRepo(L0.repo) || L0.feed) ? "" : " Updates are not set up yet (see README).")) : CEP_MSG;

  // just-updated confirmation after the reload
  try {
    var done = localStorage.getItem(K_DONE);
    if (done) { localStorage.removeItem(K_DONE); setTimeout(function () { say("Updated to v" + done + ". Enjoy the new features!"); }, 1600); }
  } catch (e) { }

  var forced = false;
  try { forced = localStorage.getItem(K_FORCE) === "1"; localStorage.removeItem(K_FORCE); } catch (e) { }
  if (forced) { setTimeout(function () { check(true, true); }, 2200); }          // after Refresh: check now, skip the throttle
  else { setTimeout(function () { check(false); }, START_DELAY_MS); }

  // A release pushed while After Effects is already open used to be noticed only after a restart: keep checking quietly,
  // every PERIODIC_MIN minutes and whenever the panel gets focus / becomes visible again (at most every FOCUS_MIN minutes).
  var PERIODIC_MIN = 20, FOCUS_MIN = 5, lastAuto = Date.now();
  function autoCheck(minGapMin) {
    if (state.busy || Date.now() - lastAuto < minGapMin * 60000) { return; }
    lastAuto = Date.now(); check(false);
  }
  setInterval(function () { autoCheck(PERIODIC_MIN - 1); }, PERIODIC_MIN * 60000);
  window.addEventListener("focus", function () { autoCheck(FOCUS_MIN); });
  document.addEventListener("visibilitychange", function () { if (!document.hidden) { autoCheck(FOCUS_MIN); } });
  window.MTUpdater = { check: check, install: install, version: function () { try { return local().version; } catch (e) { return ""; } } };
})();
