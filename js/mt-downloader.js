/* Multi Tool - mt-downloader.js : the Downloader tab (replaces the old Shortcutz tab).
   Copy a TikTok link and the panel downloads the video / photos into your folder and (optionally) adds them to the
   timeline at the playhead. Everything runs inside the panel with Node.js (https + fs); After Effects is only asked
   to pick the folder (host.jsx TOOLS_chooseSaveFolder) and to import the files (host.jsx DL_importFiles).

   Public API (window.MTDl):
     MTDl.init(ctx)      once at boot. ctx = { Bridge, toast }. Starts the clipboard watcher when "Auto" is on.
     MTDl.render(ctx)    returns the tab's root element (same .ta / .ta-section markup as the other tabs, so the
                         capsule cards and the Compact icon bar work with no extra code).
     MTDl.add(url)       queue one link (what the Download button and the clipboard watcher call).

   Download service: tikwm.com (free web downloader, no key). POST https://www.tikwm.com/api/  url=<link>&hd=1
   returns JSON { code, msg, data: { id, title, play, hdplay, images[], author{unique_id} } }.
   The service allows about 1 request per second, so requests are spaced out.

   Storage (localStorage, prefix mtx.):  dlDir (save folder)  dlAuto  dlTl (add to timeline)  dlHd  dlHist (recent)
   Clipboard watcher: Windows = one hidden long-lived PowerShell that prints a line when the clipboard text changes
   (it exits by itself when After Effects closes); macOS = pbpaste every second. ES5. */
(function (global) {
  "use strict";

  var ctx = null;
  // Without --mixed-context CEP only exposes require() as window.cep_node.require, and Buffer / process are not
  // globals, so they are taken from require() too (same pattern as js/mt-gif.js).
  var req = null, fs = null, pathMod = null, https = null, http = null, cp = null, urlMod = null, BufferCtor = null, plat = "", ownPid = 0;
  try {
    req = (typeof global.require === "function") ? global.require : (global.cep_node && global.cep_node.require);
    if (req) {
      fs = req("fs"); pathMod = req("path"); https = req("https"); http = req("http"); cp = req("child_process");
      urlMod = req("url"); BufferCtor = req("buffer").Buffer;
      var proc = req("process"); plat = proc.platform || ""; ownPid = proc.pid || 0;
    }
  } catch (e) { fs = null; }

  var API_HOST = "www.tikwm.com";
  var UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";
  var URL_RE = /https?:\/\/(?:[a-z0-9-]+\.)?tiktok\.com\/[^\s"'<>]+/i;
  var API_GAP_MS = 1150;

  // ---------------------------------------------------------------- tiny helpers
  function get(k) { try { return localStorage.getItem("mtx." + k); } catch (e) { return null; } }
  function set(k, v) { try { localStorage.setItem("mtx." + k, String(v)); } catch (e) { } }
  function del(k) { try { localStorage.removeItem("mtx." + k); } catch (e) { } }
  function flag(k, dflt) { var v = get(k); return v === null ? dflt : v === "1"; }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function toast(msg, isErr) { try { if (ctx && ctx.toast) { ctx.toast(msg, !!isErr); } } catch (e) { } }
  function bridge(fn, args) { return (ctx && ctx.Bridge) ? ctx.Bridge.call(fn, args) : Promise.resolve({ ok: false, message: "Panel not ready." }); }
  function shortPath(p) {
    var parts = String(p).replace(/[\\\/]+$/, "").split(/[\\\/]/).filter(function (x) { return x.length; });
    if (!parts.length) { return String(p); }
    return parts.length > 2 ? "\u2026/" + parts.slice(-2).join("/") : parts.join("/");
  }
  function pickUrl(text) {
    var m = URL_RE.exec(String(text || ""));
    return m ? m[0].replace(/[)\].,;]+$/, "") : null;
  }
  function safeName(s) { return String(s || "").replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 60) || "tiktok"; }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  // ---------------------------------------------------------------- state
  var jobs = [];            // newest first, each { id, url, title, status, pct, msg, files[] }
  var queue = [];
  var busy = false;
  var seq = 0;
  var lastApiAt = 0;
  var listeners = [];
  var history = [];
  try { history = JSON.parse(get("dlHist") || "[]") || []; } catch (e) { history = []; }

  function saveHistory() { try { set("dlHist", JSON.stringify(history.slice(0, 12))); } catch (e) { } }
  function emit() { listeners = listeners.filter(function (fn) { try { return fn() !== false; } catch (e) { return false; } }); }

  // ---------------------------------------------------------------- http (Node)
  function request(url, opts, depth) {
    opts = opts || {};
    depth = depth || 0;
    return new Promise(function (resolve, reject) {
      var u;
      try { u = new urlMod.URL(url); } catch (e) { reject(new Error("Bad link.")); return; }
      var lib = u.protocol === "http:" ? http : https;
      var headers = { "User-Agent": UA, "Accept": "*/*" };
      var body = opts.body || null, k;
      if (body) { headers["Content-Type"] = "application/x-www-form-urlencoded; charset=UTF-8"; headers["Content-Length"] = BufferCtor.byteLength(body); }
      if (opts.referer) { headers["Referer"] = opts.referer; }
      var r = lib.request({ protocol: u.protocol, hostname: u.hostname, port: u.port || undefined, path: u.pathname + u.search, method: body ? "POST" : "GET", headers: headers }, function (res) {
        var code = res.statusCode || 0;
        if (code >= 300 && code < 400 && res.headers.location && depth < 6) {
          res.resume();
          var next = res.headers.location;
          if (next.charAt(0) === "/") { next = u.protocol + "//" + u.host + next; }
          request(next, { referer: opts.referer }, depth + 1).then(resolve, reject);   // redirects are always plain GETs
          return;
        }
        if (code < 200 || code >= 300) { res.resume(); reject(new Error("Server answered " + code + ".")); return; }
        resolve(res);
      });
      r.setTimeout(30000, function () { r.abort(); reject(new Error("Timed out.")); });
      r.on("error", function (err) { reject(new Error(err && err.code === "ENOTFOUND" ? "No internet connection." : (err && err.message) || "Network error.")); });
      if (body) { r.write(body); }
      r.end();
    });
  }
  function postJson(url, body) {
    return request(url, { body: body }).then(function (res) {
      return new Promise(function (resolve, reject) {
        var chunks = [];
        res.on("data", function (c) { chunks.push(c); });
        res.on("end", function () {
          try { resolve(JSON.parse(BufferCtor.concat(chunks).toString("utf8"))); } catch (e) { reject(new Error("The download service sent an unreadable answer.")); }
        });
        res.on("error", reject);
      });
    });
  }
  function toFile(url, dest, onPct) {
    return request(url, { referer: "https://www.tiktok.com/" }).then(function (res) {
      return new Promise(function (resolve, reject) {
        var total = parseInt(res.headers["content-length"], 10) || 0, got = 0, part = dest + ".part";
        var out = fs.createWriteStream(part);
        res.on("data", function (c) { got += c.length; if (total && onPct) { onPct(Math.min(99, Math.round(got * 100 / total))); } });
        res.on("error", function (e) { try { out.destroy(); fs.unlinkSync(part); } catch (x) { } reject(e); });
        out.on("error", function (e) { reject(new Error("Cannot write to the save folder.")); });
        out.on("finish", function () {
          try { fs.renameSync(part, dest); resolve(dest); } catch (e) { reject(new Error("Cannot write to the save folder.")); }
        });
        res.pipe(out);
      });
    });
  }
  function uniquePath(dir, base, ext) {
    var p = pathMod.join(dir, base + ext), n = 2;
    while (fs.existsSync(p) && n < 1000) { p = pathMod.join(dir, base + "_" + n + ext); n++; }
    return p;
  }
  function extOf(url, dflt) {
    var m = /\.(jpe?g|png|webp|heic|mp4|mov)(?:$|\?)/i.exec(String(url).split("#")[0]);
    return m ? "." + m[1].toLowerCase() : dflt;
  }
  function absUrl(u) { u = String(u || ""); return u.charAt(0) === "/" ? "https://" + API_HOST + u : u; }

  // ---------------------------------------------------------------- save folder
  var pendingPick = null;
  function getDir() { var d = get("dlDir"); return d && d.length ? d : null; }
  function chooseFolder() {
    if (pendingPick) { return pendingPick; }      // one dialog at a time, even when several links arrive
    pendingPick = bridge("TOOLS_chooseSaveFolder", [getDir()]).then(function (res) {
      pendingPick = null;
      var p = res && res.data && res.data.path;
      if (p) { set("dlDir", p); emit(); return p; }
      return null;
    }, function () { pendingPick = null; return null; });
    return pendingPick;
  }
  function ensureDir() {
    var d = getDir();
    if (d) { try { if (fs && fs.existsSync(d)) { return Promise.resolve(d); } } catch (e) { } del("dlDir"); }
    toast("Choose a folder for your downloads.");
    return chooseFolder();
  }
  function openFolder(p) {
    p = p || getDir();
    if (!p || !cp) { return; }
    try {
      if (plat === "darwin") { cp.execFile("open", [p]); }
      else if (plat === "win32") { cp.spawn("explorer.exe", [p], { detached: true, stdio: "ignore" }).unref(); }
      else { cp.execFile("xdg-open", [p]); }
    } catch (e) { }
  }

  // ---------------------------------------------------------------- one job
  function patch(job, o) { var k; for (k in o) { if (o.hasOwnProperty(k)) { job[k] = o[k]; } } emit(); }

  function runJob(job) {
    var dir, wantTl = flag("dlTl", true), hd = flag("dlHd", true), info;
    return ensureDir().then(function (d) {
      if (!d) { throw new Error("No save folder chosen."); }
      dir = d;
      patch(job, { status: "fetching", msg: "Getting the link\u2026", pct: 0 });
      var wait = Math.max(0, API_GAP_MS - (Date.now() - lastApiAt));
      return sleep(wait);
    }).then(function () {
      lastApiAt = Date.now();
      return postJson("https://" + API_HOST + "/api/", "url=" + encodeURIComponent(job.url) + "&count=12&cursor=0&web=1&hd=" + (hd ? "1" : "0"));
    }).then(function (j) {
      if (!j || j.code !== 0 || !j.data) { throw new Error((j && j.msg) ? String(j.msg).replace(/^.*?:\s*/, "") : "The service could not read this link."); }
      info = j.data;
      var author = safeName(info.author && (info.author.unique_id || info.author.nickname)), base = author + "_" + safeName(info.id);
      var media = [], i;
      if (info.images && info.images.length) {
        for (i = 0; i < info.images.length; i++) { media.push({ url: absUrl(info.images[i]), dest: null, base: base + "_" + (i < 9 ? "0" : "") + (i + 1), ext: extOf(info.images[i], ".jpg") }); }
      } else {
        var v = (hd && info.hdplay) ? info.hdplay : (info.play || info.hdplay);
        if (!v) { throw new Error("No video found in this post."); }
        media.push({ url: absUrl(v), base: base, ext: ".mp4" });
      }
      patch(job, { title: String(info.title || base).replace(/\s+/g, " ").slice(0, 80) || base, kind: media.length > 1 || (info.images && info.images.length) ? "photo" : "video" });
      var files = [], n = 0;
      return media.reduce(function (chain, m) {
        return chain.then(function () {
          n++;
          patch(job, { status: "downloading", msg: media.length > 1 ? "Downloading photo " + n + " of " + media.length + "\u2026" : "Downloading\u2026" });
          return toFile(m.url, uniquePath(dir, m.base, m.ext), function (pct) { job.pct = pct; emit(); }).then(function (f) { files.push(f); });
        });
      }, Promise.resolve()).then(function () { return files; });
    }).then(function (files) {
      job.files = files;
      if (!wantTl) { patch(job, { status: "done", pct: 100, msg: "Saved to " + shortPath(dir) + "." }); return; }
      patch(job, { status: "importing", pct: 100, msg: "Adding to timeline\u2026" });
      return bridge("DL_importFiles", [files, true]).then(function (res) {
        var ok = !!(res && res.ok);
        patch(job, { status: ok ? "done" : "error", msg: ok ? ((res && res.message) || "Added to timeline.") : ("Saved, but import failed: " + ((res && res.message) || "unknown error")) });
      });
    }).then(function () {
      finish(job);
    }, function (err) {
      patch(job, { status: "error", msg: (err && err.message) || "Download failed." });
      toast(job.msg, true);
      finish(job);
    });
  }

  function finish(job) {
    history.unshift({ id: job.id, url: job.url, title: job.title || job.url, status: job.status, kind: job.kind || "video", files: job.files || [], at: Date.now() });
    history = history.slice(0, 12);
    saveHistory();
    if (job.status === "done") { toast(job.msg); }
    emit();
  }

  function pump() {
    if (busy || !queue.length) { return; }
    busy = true;
    var job = queue.shift();
    runJob(job).then(function () { busy = false; pump(); }, function () { busy = false; pump(); });
  }

  function add(url) {
    url = pickUrl(url);
    if (!url) { toast("That is not a TikTok link.", true); return false; }
    if (!fs) { toast("Downloads need Node.js, which is not available in this panel.", true); return false; }
    var job = { id: ++seq + "-" + Date.now(), url: url, title: "", status: "queued", pct: 0, msg: "Waiting\u2026", files: [] };
    jobs.unshift(job);
    jobs = jobs.slice(0, 6);
    queue.push(job);
    emit();
    pump();
    return true;
  }

  // ---------------------------------------------------------------- clipboard watcher
  var watcher = null, macTimer = null, webTimer = null, lastClip = null;

  function onClip(text) {
    if (!flag("dlAuto", false)) { return; }
    var url = pickUrl(text);
    if (url) { add(url); }
  }
  function stopWatch() {
    if (watcher) { try { watcher.kill(); } catch (e) { } watcher = null; }
    if (macTimer) { clearInterval(macTimer); macTimer = null; }
    if (webTimer) { clearInterval(webTimer); webTimer = null; }
    lastClip = null;
  }
  function startWatch() {
    stopWatch();
    if (!flag("dlAuto", false)) { return; }
    try {
      if (cp && plat === "win32") {
        var ps = [
          "Add-Type -AssemblyName System.Windows.Forms",
          "$parent = " + ownPid,
          "function Get-Clip { try { if ([System.Windows.Forms.Clipboard]::ContainsText()) { return [System.Windows.Forms.Clipboard]::GetText() } } catch {} return $null }",
          "$last = Get-Clip",
          "[Console]::Out.WriteLine('INIT'); [Console]::Out.Flush()",
          "while ($true) {",
          "  if ($parent -gt 0 -and -not (Get-Process -Id $parent -ErrorAction SilentlyContinue)) { exit }",
          "  $t = Get-Clip",
          "  if ($t -ne $last) { $last = $t; if ($t) { [Console]::Out.WriteLine('CB:' + [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($t))); [Console]::Out.Flush() } }",
          "  Start-Sleep -Milliseconds 600",
          "}"
        ].join("\n");
        var enc = BufferCtor.from(ps, "utf16le").toString("base64");
        watcher = cp.spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-STA", "-ExecutionPolicy", "Bypass", "-WindowStyle", "Hidden", "-EncodedCommand", enc], { windowsHide: true, stdio: ["ignore", "pipe", "ignore"] });
        var buf = "";
        watcher.stdout.on("data", function (d) {
          buf += d.toString("utf8");
          var lines = buf.split(/\r?\n/);
          buf = lines.pop();
          lines.forEach(function (ln) {
            if (ln.indexOf("CB:") === 0) { try { onClip(BufferCtor.from(ln.slice(3), "base64").toString("utf8")); } catch (e) { } }
          });
        });
        watcher.on("error", function () { watcher = null; startWebWatch(); });
        watcher.on("exit", function () { watcher = null; });
        return;
      }
      if (cp && plat === "darwin") {
        macTimer = setInterval(function () {
          cp.exec("pbpaste", { timeout: 1500 }, function (err, out) {
            if (err) { return; }
            if (lastClip === null) { lastClip = out; return; }     // first read = baseline, never downloads
            if (out !== lastClip) { lastClip = out; onClip(out); }
          });
        }, 1000);
        return;
      }
    } catch (e) { /* fall through to the browser clipboard */ }
    startWebWatch();
  }
  // Last resort (no Node): the browser clipboard API. Works only while the panel has focus.
  function startWebWatch() {
    if (webTimer || !flag("dlAuto", false) || !(navigator.clipboard && navigator.clipboard.readText)) { return; }
    webTimer = setInterval(function () {
      navigator.clipboard.readText().then(function (t) {
        if (lastClip === null) { lastClip = t; return; }
        if (t !== lastClip) { lastClip = t; onClip(t); }
      }, function () { });
    }, 1000);
  }
  function setAuto(on) {
    set("dlAuto", on ? "1" : "0");
    if (on) {
      if (!getDir()) { ensureDir(); }            // ask for the folder right away, before the first link arrives
      startWatch();
    } else { stopWatch(); }
  }

  // ---------------------------------------------------------------- tab UI
  var ICON = {
    down: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v11M7.5 10.5 12 15l4.5-4.5M5 19.5h14"/></svg>',
    paste: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="5" width="12" height="15" rx="2.5"/><path d="M9.5 5V4h5v1M9.5 11h5M9.5 14.5h3"/></svg>',
    folder: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H9l2 2.2h7.5A2.5 2.5 0 0 1 21 9.7v7.8a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17.5z"/></svg>',
    open: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 4h6v6M20 4l-8 8M18 14v4.5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6H10"/></svg>',
    list: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></svg>',
    add: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
    clear: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>'
  };

  function render(c) {
    if (c) { ctx = c; }
    var wrap = document.createElement("div");
    wrap.className = "ta dl-tab";

    wrap.innerHTML =
      '<div class="ta-section">' +
        '<h2 class="ta-title ta-title-icon">' + ICON.down + '<span>Download</span></h2>' +
        '<p class="field-note">Turn on Auto, then copy a TikTok link. The video or photos download and land on your timeline.</p>' +
        '<input type="text" class="text-input" id="dl-url" data-no-restore placeholder="Paste a TikTok link" aria-label="TikTok link" spellcheck="false" autocomplete="off">' +
        '<div class="split-btn">' +
          '<button class="split-main" type="button" id="dl-go" title="Download this link">Download</button>' +
          '<button class="split-icon" type="button" id="dl-paste" title="Paste from clipboard and download" aria-label="Paste from clipboard and download">' + ICON.paste + '</button>' +
        '</div>' +
        '<div class="chips dl-chips">' +
          '<label class="chip" title="Download by itself when you copy a TikTok link"><input type="checkbox" id="dl-auto" data-no-restore><span>Auto</span></label>' +
          '<label class="chip" title="Add the file to the active comp at the playhead"><input type="checkbox" id="dl-tl" data-no-restore><span>Timeline</span></label>' +
          '<label class="chip" title="Ask for the HD video when it exists"><input type="checkbox" id="dl-hd" data-no-restore><span>HD</span></label>' +
        '</div>' +
        '<p class="field-note dl-status" id="dl-status" aria-live="polite"></p>' +
      '</div>' +

      '<div class="ta-section">' +
        '<h2 class="ta-title ta-title-icon">' + ICON.folder + '<span>Save Folder</span></h2>' +
        '<p class="field-note">Videos and photos are saved here. You are asked once, then it is remembered.</p>' +
        '<p class="field-note save-dir" id="dl-dir"></p>' +
        '<div class="split-btn">' +
          '<button class="split-main" type="button" id="dl-choose" title="Choose the save folder">Choose Folder</button>' +
          '<button class="split-icon" type="button" id="dl-open" title="Open the save folder" aria-label="Open the save folder">' + ICON.open + '</button>' +
        '</div>' +
      '</div>' +

      '<div class="ta-section">' +
        '<h2 class="ta-title ta-title-icon">' + ICON.list + '<span>Recent</span></h2>' +
        '<div class="dl-list" id="dl-list"></div>' +
        '<button class="btn" type="button" id="dl-clear">Clear list</button>' +
      '</div>';

    function $(id) { return wrap.querySelector("#" + id); }
    var autoEl = $("dl-auto"), tlEl = $("dl-tl"), hdEl = $("dl-hd");
    autoEl.checked = flag("dlAuto", false);
    tlEl.checked = flag("dlTl", true);
    hdEl.checked = flag("dlHd", true);
    autoEl.addEventListener("change", function () { setAuto(autoEl.checked); paint(); });
    tlEl.addEventListener("change", function () { set("dlTl", tlEl.checked ? "1" : "0"); });
    hdEl.addEventListener("change", function () { set("dlHd", hdEl.checked ? "1" : "0"); });

    var goBtn = $("dl-go");
    function go(text) {
      if (add(text)) { $("dl-url").value = ""; }
    }
    goBtn.addEventListener("click", function () { go($("dl-url").value); });
    $("dl-url").addEventListener("keydown", function (e) { if (e.key === "Enter") { go(this.value); } });
    $("dl-paste").addEventListener("click", function () {
      var done = function (t) { if (t) { go(t); } else { toast("The clipboard has no text.", true); } };
      try {
        if (cp && plat === "win32") { cp.exec('powershell.exe -NoProfile -STA -Command "Get-Clipboard -Raw"', { timeout: 4000, windowsHide: true }, function (err, out) { done(err ? "" : out); }); return; }
        if (cp && plat === "darwin") { cp.exec("pbpaste", { timeout: 2000 }, function (err, out) { done(err ? "" : out); }); return; }
      } catch (e) { }
      if (navigator.clipboard && navigator.clipboard.readText) { navigator.clipboard.readText().then(done, function () { toast("Cannot read the clipboard. Paste into the box instead.", true); }); }
    });
    $("dl-choose").addEventListener("click", function () {
      chooseFolder().then(function (p) { toast(p ? "Save folder set to \"" + p + "\"." : "Cancelled. Save folder unchanged."); });
    });
    $("dl-open").addEventListener("click", function () {
      if (!getDir()) { toast("Choose a folder first.", true); return; }
      openFolder();
    });
    $("dl-clear").addEventListener("click", function () { history = []; jobs = jobs.filter(function (j) { return j.status !== "done" && j.status !== "error"; }); saveHistory(); paint(); });

    $("dl-list").addEventListener("click", function (e) {
      var b = e.target;
      while (b && b !== this && !(b.getAttribute && b.getAttribute("data-dl"))) { b = b.parentNode; }
      if (!b || b === this) { return; }
      var item = null, i, id = b.getAttribute("data-id"), act = b.getAttribute("data-dl");
      for (i = 0; i < history.length; i++) { if (history[i].id === id) { item = history[i]; } }
      if (!item) { return; }
      if (act === "add") {
        if (b.classList.contains("is-pending")) { return; }
        b.classList.add("is-pending");
        bridge("DL_importFiles", [item.files, true]).then(function (res) {
          if (ctx && ctx.flashButtonResult) { ctx.flashButtonResult(b, !!(res && res.ok)); } else { b.classList.remove("is-pending"); }
          toast((res && res.message) || "Done.", !(res && res.ok));
        });
      } else if (act === "open" && item.files[0]) {
        openFolder(pathMod ? pathMod.dirname(item.files[0]) : null);
      }
    });

    function paint() {
      var dir = getDir(), st = $("dl-status"), list = $("dl-list");
      if (!wrap.isConnected && wrap.__seen) { return false; }       // tab was rebuilt: drop this listener
      if (wrap.isConnected) { wrap.__seen = true; }
      $("dl-dir").textContent = dir ? shortPath(dir) : "No folder chosen yet.";
      $("dl-dir").title = dir || "";
      autoEl.checked = flag("dlAuto", false);

      var live = jobs.filter(function (j) { return j.status !== "done" && j.status !== "error"; })[0] || jobs[0];
      if (live) {
        st.textContent = (live.status === "downloading" && live.pct ? live.msg.replace(/\u2026$/, "") + " " + live.pct + "%" : live.msg);
        st.setAttribute("data-state", live.status);
      } else {
        st.textContent = autoEl.checked ? "Watching the clipboard." : "";
        st.setAttribute("data-state", autoEl.checked ? "watch" : "idle");
      }

      var rows = [], seen = {};
      jobs.forEach(function (j) {
        if (j.status === "done" || j.status === "error") { return; }
        seen[j.id] = 1;
        rows.push('<div class="dl-row is-live"><span class="dl-dot" data-state="' + j.status + '"></span><span class="dl-name" title="' + esc(j.url) + '">' + esc(j.title || j.url) + '</span></div>');
      });
      history.forEach(function (h) {
        var ok = h.status === "done" && h.files && h.files.length;
        rows.push(
          '<div class="dl-row"><span class="dl-dot" data-state="' + (ok ? "done" : "error") + '"></span>' +
          '<span class="dl-name" title="' + esc(h.title) + '">' + esc(h.title) + '</span>' +
          (ok ? '<button class="icon-btn" type="button" data-dl="add" data-id="' + esc(h.id) + '" title="Add to timeline" aria-label="Add to timeline">' + ICON.add + '</button>' +
                '<button class="icon-btn" type="button" data-dl="open" data-id="' + esc(h.id) + '" title="Show in folder" aria-label="Show in folder">' + ICON.folder + '</button>' : '') +
          '</div>');
      });
      list.innerHTML = rows.length ? rows.join("") : '<p class="field-note">Nothing downloaded yet.</p>';
      $("dl-clear").style.display = history.length ? "" : "none";
      return true;
    }

    listeners.push(paint);
    paint();
    return wrap;
  }

  function init(c) {
    ctx = c || ctx;
    if (flag("dlAuto", false)) { startWatch(); }
    try { global.addEventListener("unload", stopWatch); } catch (e) { }
  }

  global.MTDl = { init: init, render: render, add: add, setAuto: setAuto, parse: pickUrl };
})(window);
