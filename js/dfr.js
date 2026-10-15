/**
 * Multi Tool - dfr.js  (tab: Auto Smooth)
 * Removes dead frames (duplicate frames in anime shot on 2s/3s) and lets Twixtor Pro rebuild the motion,
 * so the result is smooth and the duration stays the same.
 *
 *   ffprobe  -> real file frame rates          (Node child_process, bin/ inside the extension)
 *   ffmpeg   -> mpdecimate (duplicates) + scene filter (cuts) in ONE decode pass, then the unique-frame export
 *   host.jsx -> DFR_* functions (import, comp, Twixtor, markers, cleanup); the whole job is ONE undo group (DFR_run)
 *
 * Rules kept: lazy (nothing runs until the tab is opened), no heavy polling (one tiny call every 2 s while the tab
 * is visible, ffprobe only when the selection really changed), no focus() calls, no UI text outside English,
 * ids/classes prefixed "dfr", animations = transform + opacity only. Plain ES5 on purpose (AE 2021 = Chromium 74).
 * Public API: window.DFR.render() -> returns the tab's root element (called from js/main.js, like every other tab).
 */
(function () {
  "use strict";
  if (window.DFR) { return; }

  // ---------------------------------------------------------------------------------------------
  // Environment
  // ---------------------------------------------------------------------------------------------
  var cs = null;
  try { if (typeof CSInterface === "function" && window.__adobe_cep__) { cs = new CSInterface(); } } catch (e0) { cs = null; }

  function nreq(name) {
    try {
      if (typeof window.require === "function") { return window.require(name); }
      if (window.cep_node && window.cep_node.require) { return window.cep_node.require(name); }
    } catch (e) { }
    return null;
  }
  function $(id) { return document.getElementById(id); }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  var STORE = "mtx.dfr.";
  function sget(k, d) { try { var v = localStorage.getItem(STORE + k); return v === null ? d : v; } catch (e) { return d; } }
  function sset(k, v) { try { localStorage.setItem(STORE + k, String(v)); } catch (e) { } }

  var toastTimer = 0;
  function toast(msg, isErr) {
    var el = $("toast");
    if (!el) { return; }
    el.textContent = msg;
    if (isErr) { el.classList.add("is-error"); } else { el.classList.remove("is-error"); }
    el.classList.add("is-show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove("is-show"); }, 2800);
  }

  // Same wire format as Bridge in main.js: JSON args, \uXXXX-escaped, JSON result.
  function host(fn, args) {
    return new Promise(function (resolve) {
      if (!cs) { resolve({ ok: false, message: "Preview mode: After Effects is not connected." }); return; }
      var script = fn + "(" + (args || []).map(function (a) {
        return JSON.stringify(a).replace(/[\u0080-\uffff]/g, function (ch) { return "\\u" + ("0000" + ch.charCodeAt(0).toString(16)).slice(-4); });
      }).join(",") + ")";
      cs.evalScript(script, function (res) {
        if (!res || res === "EvalScript error.") { resolve({ ok: false, message: "Script error. Check host.jsx." }); return; }
        try { resolve(JSON.parse(res)); } catch (e) { resolve({ ok: false, message: String(res) }); }
      });
    });
  }

  // ---------------------------------------------------------------------------------------------
  // Frame-rate helpers (NTSC tolerant, exact value always shown)
  // ---------------------------------------------------------------------------------------------
  function parseRate(s) {
    if (typeof s === "number") { return s; }
    var m = /^(\d+(?:\.\d+)?)\/(\d+(?:\.\d+)?)$/.exec(String(s || "").trim());
    if (m) { var d = parseFloat(m[2]); return d ? parseFloat(m[1]) / d : 0; }
    var f = parseFloat(s);
    return isFinite(f) ? f : 0;
  }
  function fmtFps(f) {
    if (!f || !isFinite(f)) { return "-"; }
    var r = Math.round(f * 1000) / 1000;
    return String(r);
  }
  function isNtsc(f) {
    var i, n = [23.976, 29.97, 59.94, 119.88];
    for (i = 0; i < n.length; i++) { if (Math.abs(f - n[i]) < 0.005) { return true; } }
    return false;
  }
  function sameFps(a, b) {
    if (!a || !b) { return true; }
    if (Math.abs(a - b) < 0.01) { return true; }
    return Math.abs(a / b - 1.001) < 0.0004 || Math.abs(b / a - 1.001) < 0.0004;   // 23.976 <-> 24, 29.97 <-> 30, 59.94 <-> 60
  }
  function fpsArg(f) {      // exact rational for the NTSC rates so ffmpeg does not round them
    var table = [[23.976, "24000/1001"], [29.97, "30000/1001"], [59.94, "60000/1001"], [47.952, "48000/1001"], [119.88, "120000/1001"]], i;
    for (i = 0; i < table.length; i++) { if (Math.abs(f - table[i][0]) < 0.005) { return table[i][1]; } }
    return String(Math.round(f * 1000) / 1000);
  }
  function pad(n, l) { n = String(n); while (n.length < l) { n = "0" + n; } return n; }
  function esc(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
  function safeName(s) { return String(s).replace(/\.[^.]+$/, "").replace(/[^A-Za-z0-9_-]+/g, "_").slice(0, 40) || "clip"; }

  // ---------------------------------------------------------------------------------------------
  // Presets (levels are 0..1 of each Twixtor parameter's OWN range, resolved in host.jsx: nothing hardcoded)
  // ---------------------------------------------------------------------------------------------
  var PRESETS = {
    smooth:   { label: "Smooth",       interp: 1,   sens: 0.7, prep: 1,   codec: "prores" },
    balanced: { label: "Balanced",     interp: 1,   sens: 0.5, prep: 0.5, codec: "prores" },
    fast:     { label: "Fast preview", interp: 0.5, sens: 0.3, prep: 0,   codec: "x264" }
  };

  // ---------------------------------------------------------------------------------------------
  // State (survives tab switches; the DOM is rebuilt every time the tab opens)
  // ---------------------------------------------------------------------------------------------
  var S = {
    cfg: {
      sens: clamp(parseInt(sget("sens", "50"), 10) || 50, 1, 100),
      minDur: clamp(parseInt(sget("minDur", "1"), 10) || 1, 1, 8),
      range: sget("range", "layer") === "work" ? "work" : "layer",
      preset: PRESETS[sget("preset", "balanced")] ? sget("preset", "balanced") : "balanced",
      target: /^(same|24|30|60)$/.test(sget("target", "same")) ? sget("target", "same") : "same",
      inputFps: sget("inputFps", "clip") === "effective" ? "effective" : "clip",
      keep: sget("keep", "1") === "1",
      precomp: sget("precomp", "1") === "1",
      quick: sget("quick", "0") === "1",
      queue: sget("queue", "0") === "1",
      markers: sget("markers", "1") === "1"
    },
    comp: null, sig: "", layers: [], picked: -1,
    probe: {}, detecting: false,
    scan: null, scanKey: "",
    busy: "", prog: null, child: null, cancelled: false,
    dismiss: "", report: null, twx: null,
    root: null, ref: {}, timer: 0, armClear: 0, bins: null
  };

  function save(k, v) { S.cfg[k] = v; sset(k, typeof v === "boolean" ? (v ? "1" : "0") : v); }

  // ---------------------------------------------------------------------------------------------
  // Files: extension folder, bin/, cache
  // ---------------------------------------------------------------------------------------------
  function extDir() {
    try {
      var p = decodeURI(window.__adobe_cep__.getSystemPath("extension"));
      p = /^file:\/\/\/[A-Za-z]:/.test(p) ? p.replace(/^file:\/\/\//, "") : p.replace(/^file:\/\//, "");
      return p.replace(/\/+$/, "");
    } catch (e) { return ""; }
  }

  function findBins() {
    var fs = nreq("fs"), path = nreq("path"), res = { ok: false, msg: "", ffmpeg: "", ffprobe: "" };
    if (!fs || !path) { res.msg = "Node.js is not available in this panel. Reload the panel after updating the extension."; return res; }
    var win = (typeof process !== "undefined" && process.platform === "win32");
    var dir = path.join(extDir(), "bin"), a = path.join(dir, win ? "ffmpeg.exe" : "ffmpeg"), b = path.join(dir, win ? "ffprobe.exe" : "ffprobe");
    if (!fs.existsSync(a) || !fs.existsSync(b)) {
      res.msg = "Put " + (win ? "ffmpeg.exe and ffprobe.exe" : "ffmpeg and ffprobe") + " in the extension's bin folder to use Auto Smooth.";
      return res;
    }
    if (!win) { try { fs.chmodSync(a, 493); fs.chmodSync(b, 493); } catch (e) { } }     // 493 = 0755
    res.ok = true; res.ffmpeg = a; res.ffprobe = b;
    return res;
  }

  function mkdirp(p) {
    var fs = nreq("fs"), path = nreq("path");
    if (fs.existsSync(p)) { return; }
    mkdirp(path.dirname(p));
    try { fs.mkdirSync(p); } catch (e) { if (!fs.existsSync(p)) { throw e; } }
  }
  function cacheDir() {
    var os = nreq("os"), path = nreq("path");
    var d = path.join(os.homedir(), "Documents", "MultiTool", "DeadFrameCache");
    mkdirp(d);
    return d;
  }

  // ---------------------------------------------------------------------------------------------
  // Process runner (never blocks the UI: spawn + streams)
  // ---------------------------------------------------------------------------------------------
  // handlers: onErrLine(line), onOutLine(line). Resolves {code, out, err(last 4 KB)}.
  function runProc(cmd, args, handlers) {
    return new Promise(function (resolve) {
      var cp = nreq("child_process"), proc, out = "", errTail = "", eb = "", ob = "", done = false;
      handlers = handlers || {};
      if (!cp) { resolve({ code: -1, out: "", err: "Node.js is not available." }); return; }
      function finish(code) {
        if (done) { return; }
        done = true;
        if (eb && handlers.onErrLine) { handlers.onErrLine(eb); }
        if (ob && handlers.onOutLine) { handlers.onOutLine(ob); }
        if (S.child === proc) { S.child = null; }
        resolve({ code: code, out: out, err: errTail });
      }
      try { proc = cp.spawn(cmd, args, { windowsHide: true }); } catch (e) { resolve({ code: -1, out: "", err: String(e && e.message || e) }); return; }
      S.child = proc;
      proc.stdout.on("data", function (d) {
        var s = d.toString();
        if (handlers.keepOut) { out += s; if (out.length > 200000) { out = out.slice(-200000); } }
        if (!handlers.onOutLine) { return; }
        ob += s;
        var parts = ob.split(/\r\n|\n|\r/);
        ob = parts.pop();
        for (var i = 0; i < parts.length; i++) { handlers.onOutLine(parts[i]); }
      });
      proc.stderr.on("data", function (d) {
        var s = d.toString();
        errTail = (errTail + s).slice(-4096);
        if (!handlers.onErrLine) { return; }
        eb += s;
        var parts = eb.split(/\r\n|\n|\r/);
        eb = parts.pop();
        for (var i = 0; i < parts.length; i++) { handlers.onErrLine(parts[i]); }
      });
      proc.on("error", function (e) { errTail += String(e && e.message || e); finish(-1); });
      proc.on("close", function (code) { finish(code); });
    });
  }

  function killChild() { try { if (S.child) { S.child.kill(); } } catch (e) { } }

  // ---------------------------------------------------------------------------------------------
  // ffprobe: real file frame rates
  // ---------------------------------------------------------------------------------------------
  function probeFile(path) {
    if (S.probe[path]) { return Promise.resolve(S.probe[path]); }
    var b = S.bins;
    if (!b || !b.ok) { return Promise.resolve({ error: b ? b.msg : "ffprobe is not available." }); }
    return runProc(b.ffprobe, ["-v", "error", "-select_streams", "v:0", "-show_entries",
      "stream=r_frame_rate,avg_frame_rate,nb_frames,duration,width,height,codec_name", "-of", "json", path], { keepOut: true })
      .then(function (r) {
        var info;
        try {
          var j = JSON.parse(r.out), st = j.streams && j.streams[0];
          if (!st) { throw new Error("no video stream"); }
          info = { rRaw: st.r_frame_rate || "", avgRaw: st.avg_frame_rate || "", r: parseRate(st.r_frame_rate), avg: parseRate(st.avg_frame_rate),
                   nb: parseInt(st.nb_frames, 10) || 0, duration: parseFloat(st.duration) || 0, w: st.width || 0, h: st.height || 0, codec: st.codec_name || "" };
        } catch (e) { info = { error: "ffprobe could not read this file." }; }
        S.probe[path] = info;
        return info;
      });
  }

  // ---------------------------------------------------------------------------------------------
  // Scan: ONE ffmpeg decode, mpdecimate (duplicates) + scene filter (cuts), parsed from showinfo
  // ---------------------------------------------------------------------------------------------
  function sensToParams(sens) {
    // higher sensitivity = smaller thresholds = more frames count as different = fewer duplicates
    var k = Math.pow(2, (50 - sens) / 20);
    return { hi: Math.round(768 * k), lo: Math.round(320 * k), frac: 0.33, scene: Math.round((0.6 - 0.4 * (sens / 100)) * 1000) / 1000 };
  }

  var SHOW_RE = /\[showinfo@(all|dec|scn) @ [^\]]+\]\s+n:\s*(\d+)\s+pts:\s*(-?\d+)\s+pts_time:\s*(-?[0-9.eE+-]+)/;

  function pickedLayer() { return (S.picked >= 0 && S.layers[S.picked]) || null; }
  function layerKey(L) { return L ? [L.index, L.name, L.path, L.inPoint, L.outPoint].join("|") : ""; }

  function scanWindow(L) {
    var c = S.comp, a = L.inPoint, b = L.outPoint;
    if (S.cfg.range === "work" && c) {
      a = Math.max(a, c.workAreaStart);
      b = Math.min(b, c.workAreaStart + c.workAreaDuration);
    }
    return { a: a, b: b, srcStart: Math.max(0, a - L.startTime), srcDur: b - a, full: Math.abs(a - L.inPoint) < 1e-6 && Math.abs(b - L.outPoint) < 1e-6 };
  }

  function layerBlock(L) {
    if (!L) { return "Select a footage layer in the active composition."; }
    if (!L.ok) { return L.reason || "This layer cannot be scanned."; }
    if (Math.abs(L.stretch - 100) > 0.001 || L.timeRemap) { return "Reset Time Stretch and Time Remap on this layer first. They are not supported."; }
    return "";
  }

  function setProg(text, pct) {
    S.prog = text === null ? null : { text: text, pct: pct || 0 };
    paintProgress();
  }

  function startScan() {
    if (S.busy) { return; }
    var L = pickedLayer(), block = layerBlock(L), b = S.bins;
    if (block) { toast(block, true); return; }
    if (!b || !b.ok) { toast(b ? b.msg : "ffmpeg is not available.", true); return; }
    var win = scanWindow(L);
    if (win.srcDur < 0.1) { toast("The scan range is empty. Check the layer and the work area.", true); return; }

    var P = sensToParams(S.cfg.sens), key = layerKey(L) + "|" + S.cfg.range, frames = [], decKeys = [], scnKeys = [], lastPct = 0;
    S.busy = "scan"; S.cancelled = false; S.report = null;
    paintAll(); setProg("Scanning " + L.name + "...", 0);

    var graph = "[0:v:0]showinfo@all,split=2[a][b];" +
      "[a]mpdecimate=hi=" + P.hi + ":lo=" + P.lo + ":frac=" + P.frac + ",showinfo@dec[dec];" +
      "[b]select='gt(scene," + P.scene + ")',showinfo@scn[scn]";
    var args = ["-hide_banner", "-nostdin", "-progress", "pipe:1", "-nostats", "-ss", win.srcStart.toFixed(6), "-t", win.srcDur.toFixed(6),
      "-i", L.path, "-an", "-filter_complex", graph, "-map", "[dec]", "-f", "null", "-", "-map", "[scn]", "-f", "null", "-"];

    runProc(b.ffmpeg, args, {
      onErrLine: function (line) {
        var m = SHOW_RE.exec(line);
        if (!m) { return; }
        var t = parseFloat(m[4]);
        if (!isFinite(t)) { return; }
        var k = t.toFixed(6);
        if (m[1] === "all") { frames.push({ k: k, t: t }); }
        else if (m[1] === "dec") { decKeys.push(k); }
        else { scnKeys.push(k); }
      },
      onOutLine: function (line) {
        var m = /^out_time_(?:us|ms)=(-?\d+)/.exec(line);
        if (!m) { return; }
        var pct = clamp(parseInt(m[1], 10) / 1e6 / win.srcDur, 0, 1);
        if (pct - lastPct >= 0.01) { lastPct = pct; setProg("Scanning " + L.name + "...", pct); }
      }
    }).then(function (r) {
      S.busy = "";
      if (S.cancelled) { setProg(null); paintAll(); toast("Scan cancelled."); return; }
      if (r.code !== 0 || frames.length < 2) {
        setProg(null); paintAll();
        toast("The scan failed. " + (/Invalid data|moov atom|No such file/i.test(r.err) ? "ffmpeg could not read the file." : "Check the file and try again."), true);
        return;
      }
      var res;
      try { res = analyze(frames, decKeys, scnKeys, S.cfg.minDur, S.probe[L.path]); } catch (e) { res = null; }
      if (!res) { setProg(null); paintAll(); toast("The scan result could not be read.", true); return; }
      res.win = win; res.layerIndex = L.index; res.layerName = L.name; res.path = L.path;
      S.scan = res; S.scanKey = key;
      setProg(null);
      paintAll();
      toast("Scan done: " + res.unique + " unique of " + res.total + " frames.");
      if (S.cfg.markers) { sendMarkers(true); }
    });
  }

  function classify(holds) {
    var cnt = {}, i, h, n = holds.length, best = 1, bc = 0, k, second = 0, sc = 0;
    if (!n) { return { label: "On 1s", cls: "1", mode: 1 }; }
    for (i = 0; i < n; i++) { h = Math.min(holds[i], 6); cnt[h] = (cnt[h] || 0) + 1; }
    for (k in cnt) { if (cnt.hasOwnProperty(k) && cnt[k] > bc) { bc = cnt[k]; best = parseInt(k, 10); } }
    for (k in cnt) { if (cnt.hasOwnProperty(k) && parseInt(k, 10) !== best && cnt[k] > sc) { sc = cnt[k]; second = parseInt(k, 10); } }
    if (bc / n >= 0.7 || !second) { return { label: "On " + best + "s", cls: best >= 4 ? "4" : String(best), mode: best }; }
    return { label: "Mixed (" + Math.min(best, second) + "s/" + Math.max(best, second) + "s)", cls: "m", mode: best };
  }

  function analyze(frames, decKeys, scnKeys, minDur, probe) {
    var total = frames.length, i, idxOf = {}, times = [], keep = {}, cutSet = {}, deltas = [], med, vfrCount = 0, native;
    for (i = 0; i < total; i++) { idxOf[frames[i].k] = i; times.push(frames[i].t); }
    for (i = 0; i < decKeys.length; i++) { if (idxOf[decKeys[i]] !== undefined) { keep[idxOf[decKeys[i]]] = 1; } }
    keep[0] = 1;
    for (i = 0; i < scnKeys.length; i++) { if (idxOf[scnKeys[i]] !== undefined) { cutSet[idxOf[scnKeys[i]]] = 1; } }

    for (i = 1; i < total; i++) { deltas.push(times[i] - times[i - 1]); }
    var sorted = deltas.slice().sort(function (x, y) { return x - y; });
    med = sorted[Math.floor(sorted.length / 2)] || 0;
    native = med > 0 ? 1 / med : (probe && probe.avg) || 0;
    if (probe && probe.avg && Math.abs(native - probe.avg) / probe.avg < 0.02) { native = probe.avg; }       // keep the exact container value when it agrees
    for (i = 0; i < deltas.length; i++) { if (med > 0 && Math.abs(deltas[i] - med) / med > 0.35) { vfrCount++; } }
    var vfr = deltas.length > 0 && vfrCount / deltas.length > 0.02;
    if (probe && probe.r && probe.avg && !sameFps(probe.r, probe.avg)) { vfr = true; }

    // scene boundaries: a cut counts only when both sides keep at least 4 frames
    var cuts = [0], c, list = [], MIN = 4;
    for (c in cutSet) { if (cutSet.hasOwnProperty(c)) { list.push(parseInt(c, 10)); } }
    list.sort(function (x, y) { return x - y; });
    for (i = 0; i < list.length; i++) { if (list[i] - cuts[cuts.length - 1] >= MIN && total - list[i] >= MIN) { cuts.push(list[i]); } }
    cuts.push(total);

    var scenes = [], allHolds = [], uniqueTotal = 0, s, a, b, uniq, final, j, k, next, hold, dups, holds, cl;
    for (s = 0; s < cuts.length - 1; s++) {
      a = cuts[s]; b = cuts[s + 1]; uniq = [];
      for (i = a; i < b; i++) { if (keep[i] || i === a) { uniq.push(i); } }
      final = [];
      for (k = 0; k < uniq.length; k++) {
        next = k + 1 < uniq.length ? uniq[k + 1] : b;
        hold = next - uniq[k]; dups = hold - 1;
        if (dups > 0 && dups < minDur) { for (j = uniq[k]; j < next; j++) { final.push(j); } }     // short holds stay untouched
        else { final.push(uniq[k]); }
      }
      holds = [];
      for (k = 0; k < final.length; k++) { next = k + 1 < final.length ? final[k + 1] : b; holds.push(next - final[k]); }
      for (k = 0; k < holds.length; k++) { allHolds.push(holds[k]); }
      cl = classify(holds);
      scenes.push({ a: a, b: b, T: b - a, keep: final, U: final.length, cad: cl.label, cls: cl.cls });
      uniqueTotal += final.length;
    }
    var overall = classify(allHolds);
    return { total: total, unique: uniqueTotal, times: times, native: native, vfr: vfr, scenes: scenes, cad: overall.label, cls: overall.cls, eff: native * uniqueTotal / total };
  }

  // ---------------------------------------------------------------------------------------------
  // Plan = scan + current settings (target fps, quick check). Speed % keeps the duration identical:
  //   clip is built at F fps (unique frames back to back), output must last T/native seconds
  //   speed = (U / F) / (T / native) * 100
  // ---------------------------------------------------------------------------------------------
  function targetFps() {
    var c = S.comp ? S.comp.fps : 0;
    if (S.cfg.target === "same") { return c || (S.scan && S.scan.native) || 24; }
    return parseFloat(S.cfg.target);
  }

  function buildPlan(limitFrames) {
    var sc = S.scan, F = targetFps(), total, out = [], uniqueAll = [], i, s, keep, T, U, k;
    if (!sc) { return null; }
    total = limitFrames ? Math.min(limitFrames, sc.total) : sc.total;
    for (i = 0; i < sc.scenes.length; i++) {
      s = sc.scenes[i];
      if (s.a >= total) { break; }
      keep = [];
      for (k = 0; k < s.keep.length; k++) { if (s.keep[k] < total) { keep.push(s.keep[k]); } }
      T = Math.min(s.b, total) - s.a; U = keep.length;
      if (!U) { continue; }
      out.push({ a: s.a, T: T, U: U, keep: keep, cad: s.cad, cls: s.cls,
        t: sc.times[s.a] - sc.times[0], speed: Math.round(U / T * 100 * (sc.native / F) * 100) / 100,
        eff: sc.native * U / T });
      for (k = 0; k < keep.length; k++) { uniqueAll.push(keep[k]); }
    }
    return { F: F, total: total, unique: uniqueAll.length, removed: total - uniqueAll.length, scenes: out, uniqueAll: uniqueAll,
             duration: limitFrames ? total / sc.native : sc.win.srcDur };
  }

  function sceneCompTime(sc, idx) { return sc.win.a + (sc.times[idx] - sc.times[0]); }

  // ---------------------------------------------------------------------------------------------
  // Preview markers (coloured by cadence) + jump to time
  // ---------------------------------------------------------------------------------------------
  var LABEL_BY_CLS = { "1": 9, "2": 8, "3": 2, "4": 1, "m": 5 };     // AE label colour indexes: green, blue, yellow, red, lavender

  function sendMarkers(quiet) {
    var sc = S.scan, L = pickedLayer(), plan, markers = [], i, s, t0, t1;
    if (!sc || !L || layerKey(L) + "|" + S.cfg.range !== S.scanKey) { if (!quiet) { toast("Scan the selected layer first.", true); } return Promise.resolve(); }
    plan = buildPlan(0);
    for (i = 0; i < plan.scenes.length; i++) {
      s = plan.scenes[i];
      t0 = sceneCompTime(sc, s.a);
      t1 = i + 1 < plan.scenes.length ? sceneCompTime(sc, plan.scenes[i + 1].a) : sc.win.b;
      markers.push({ t: t0, dur: Math.max(0, t1 - t0), comment: "Scene " + (i + 1) + " - " + s.cad + " - " + s.U + "/" + s.T + " frames", label: LABEL_BY_CLS[s.cls] || 0 });
    }
    return host("DFR_addMarkers", [L.index, markers]).then(function (r) {
      if (!quiet) { toast(r.message, !r.ok); }
      else if (!r.ok) { toast(r.message, true); }
    });
  }

  function jumpTo(t) { host("DFR_gotoTime", [t]); }

  // ---------------------------------------------------------------------------------------------
  // Auto Smooth pipeline
  // ---------------------------------------------------------------------------------------------
  function selectExpr(idxs) {
    var parts = [], i = 0, s, e;
    while (i < idxs.length) {
      s = idxs[i]; e = s;
      while (i + 1 < idxs.length && idxs[i + 1] === e + 1) { i++; e++; }
      parts.push(s === e ? "eq(n," + s + ")" : "between(n," + s + "," + e + ")");
      i++;
    }
    return parts.join("+");
  }

  function codecArgs(kind) {
    if (kind === "x264") { return { ext: "mp4", args: ["-c:v", "libx264", "-preset", "veryfast", "-crf", "18", "-pix_fmt", "yuv420p"] }; }
    return { ext: "mov", args: ["-c:v", "prores_ks", "-profile:v", "3", "-pix_fmt", "yuv422p10le"] };
  }

  function exportClip(plan, L, preset) {
    var b = S.bins, fs = nreq("fs"), path = nreq("path"), dir, stamp = Date.now(), base, filt, filtFile, F = fpsArg(plan.F), outDur = plan.unique / plan.F, sc = S.scan;
    try { dir = cacheDir(); } catch (e) { return Promise.reject(new Error("The cache folder could not be created.")); }
    base = "dfr_" + safeName(L.name) + "_" + stamp;
    filt = "select='" + selectExpr(plan.uniqueAll) + "',setpts=N/(" + F + "*TB)";
    filtFile = path.join(dir, base + ".txt");
    try { fs.writeFileSync(filtFile, filt); } catch (e2) { return Promise.reject(new Error("The cache folder is not writable.")); }

    var useSrcDur = sc.win.srcDur;
    if (plan.total < sc.total) { useSrcDur = (plan.total + 0.5) / sc.native; }

    function attempt(codec, scriptOpt, syncArgs) {
      var cd = codecArgs(codec), out = path.join(dir, base + "." + cd.ext), lastPct = 0;
      var args = ["-hide_banner", "-nostdin", "-y", "-progress", "pipe:1", "-nostats", "-ss", sc.win.srcStart.toFixed(6), "-t", useSrcDur.toFixed(6), "-i", L.path,
        "-an", scriptOpt, filtFile].concat(syncArgs).concat(["-r", F]).concat(cd.args).concat([out]);
      return runProc(b.ffmpeg, args, {
        onOutLine: function (line) {
          var m = /^out_time_(?:us|ms)=(-?\d+)/.exec(line);
          if (!m) { return; }
          var pct = clamp(parseInt(m[1], 10) / 1e6 / outDur, 0, 1);
          if (pct - lastPct >= 0.01) { lastPct = pct; setProg("Exporting unique frames...", pct * 0.9); }
        }
      }).then(function (r) {
        r.out = out;
        return r;
      });
    }

    // Fallbacks for different ffmpeg builds: -fps_mode (5.1+) vs -vsync, -filter_script vs -/filter (7.0+), missing ProRes encoder.
    var codec = preset.codec, script = "-filter_script:v", sync = ["-fps_mode", "passthrough"];
    function again(r) {
      if (S.cancelled || r.code === 0) { return r; }
      if (/Unrecognized option 'fps_mode'|Option fps_mode not found/i.test(r.err) && sync[0] === "-fps_mode") { sync = ["-vsync", "0"]; return attempt(codec, script, sync).then(again); }
      if (/Unrecognized option 'filter_script|Option filter_script.* not found/i.test(r.err) && script === "-filter_script:v") { script = "-/filter:v"; return attempt(codec, script, sync).then(again); }
      if (/Unknown encoder 'prores_ks'|Encoder not found/i.test(r.err) && codec !== "x264") { codec = "x264"; return attempt(codec, script, sync).then(again); }
      return r;
    }
    return attempt(codec, script, sync).then(again).then(function (r) {
      try { fs.unlinkSync(filtFile); } catch (e3) { }
      if (S.cancelled) { try { fs.unlinkSync(r.out); } catch (e4) { } throw new Error("cancelled"); }
      if (r.code !== 0) { throw new Error("ffmpeg could not export the unique frames."); }
      return r.out;
    });
  }

  function startSmooth() {
    if (S.busy) { return; }
    var L = pickedLayer(), block = layerBlock(L), sc = S.scan, c = S.comp;
    if (block) { toast(block, true); return; }
    if (!sc || layerKey(L) + "|" + S.cfg.range !== S.scanKey) { toast("Scan the selected layer first.", true); return; }
    if (!c) { toast("Open a composition first.", true); return; }

    var quick = S.cfg.quick, limit = quick ? Math.max(8, Math.round(2 * sc.native)) : 0, plan = buildPlan(limit), preset = PRESETS[S.cfg.preset];
    if (!plan || plan.removed <= 0) { toast("No dead frames were found. Raise the sensitivity or lower Min duration, then scan again.", true); return; }

    S.busy = "smooth"; S.cancelled = false; S.report = null;
    paintAll(); setProg("Checking Twixtor...", 0);

    host("DFR_checkTwixtor", []).then(function (r) {
      var tw = r.ok && r.data ? r.data : { found: false, effects: [], pick: -1, timewarp: false };
      S.twx = tw; paintPlugin();
      if (!tw.found && !tw.timewarp) { throw new Error("Neither Twixtor nor Timewarp is available."); }
      return exportClip(plan, L, preset);
    }).then(function (clipPath) {
      setProg("Building the comp...", 0.92);
      var tw = S.twx, eff = (tw.found && tw.pick >= 0) ? tw.effects[tw.pick] : null, inputFps = S.cfg.inputFps === "effective" ? sc.native * plan.unique / plan.total : plan.F;
      var name = L.name.replace(/\.[^.]+$/, "") + (quick ? " - Smooth QC" : " - Smooth");
      var opts = {
        footagePath: clipPath,
        comp: { name: name, width: L.srcWidth, height: L.srcHeight, fps: plan.F, duration: plan.duration, pixelAspect: 1 },
        apply: { effectMatch: eff ? eff.matchName : "", levels: { interp: preset.interp, sens: preset.sens, prep: preset.prep }, inputFps: Math.round(inputFps * 1000) / 1000,
                 scenes: plan.scenes.map(function (s) { return { t: Math.round(s.t * 1000) / 1000, speed: s.speed }; }) },
        place: { sourceCompId: c.id, layerIndex: L.index, winStart: sc.win.a, precomp: !quick && S.cfg.precomp, keepOriginal: S.cfg.keep, fullCover: sc.win.full },
        renderQueue: !quick && S.cfg.queue
      };
      return host("DFR_run", [opts]).then(function (r) { return { r: r, plan: plan, eff: eff, clip: clipPath, quick: quick }; });
    }).then(function (o) {
      S.busy = ""; setProg(null);
      if (!o.r.ok) { paintAll(); toast(o.r.message, true); return; }
      var d = o.r.data;
      S.report = { removed: o.plan.removed, total: o.plan.total, scenes: o.plan.scenes, comp: d.compName, engine: d.engine, fallback: d.fallback, missing: d.missing || [],
                   set: d.set || [], original: d.originalAction, queued: d.queued, placed: d.placed, quick: o.quick, notes: d.notes || [] };
      paintAll();
      toast(o.quick ? "Quick check comp is ready." : "Auto Smooth finished.");
      flash(S.ref.run, true);
      tick(true);
    }).catch(function (e) {
      S.busy = ""; setProg(null); paintAll();
      if (S.cancelled || (e && e.message === "cancelled")) { toast("Cancelled."); return; }
      toast(e && e.message ? e.message : "Auto Smooth failed.", true);
      flash(S.ref.run, false);
    });
  }

  function cancelJob() {
    if (!S.busy) { return; }
    S.cancelled = true;
    killChild();
  }

  // ---------------------------------------------------------------------------------------------
  // Detection of the selection (light poll, ffprobe only when something changed)
  // ---------------------------------------------------------------------------------------------
  function tick(force) {
    if (!S.root || !document.body.contains(S.root)) { stopPoll(); return Promise.resolve(); }
    if (S.busy && !force) { return Promise.resolve(); }
    return host("DFR_getCompInfo", []).then(function (r) {
      if (!S.root || !document.body.contains(S.root)) { return; }
      var d = r.ok ? r.data : null;
      if (!d || !d.hasComp) {
        if (S.sig !== "none") { S.sig = "none"; S.comp = null; S.layers = []; S.picked = -1; paintAll(); }
        return;
      }
      if (S.sig === d.sig && !force) { return; }
      S.sig = d.sig;
      return loadLayers();
    });
  }

  function loadLayers() {
    return host("DFR_getSelectedLayers", []).then(function (r) {
      if (!r.ok) { S.layers = []; S.comp = null; S.picked = -1; paintAll(); return; }
      var prev = layerKey(pickedLayer()), i, found = -1, first = -1;
      S.comp = r.data.comp; S.layers = r.data.layers;
      for (i = 0; i < S.layers.length; i++) {
        if (S.layers[i].ok && first < 0) { first = i; }
        if (prev && layerKey(S.layers[i]) === prev) { found = i; }
      }
      S.picked = found >= 0 ? found : (first >= 0 ? first : (S.layers.length ? 0 : -1));
      if (S.scan && S.scanKey !== layerKey(pickedLayer()) + "|" + S.cfg.range) { S.scan = null; S.scanKey = ""; }
      paintAll();
      return detectFiles();
    });
  }

  function detectFiles() {
    var todo = [], i;
    for (i = 0; i < S.layers.length; i++) { if (S.layers[i].ok && !S.probe[S.layers[i].path]) { todo.push(S.layers[i].path); } }
    if (!todo.length || !S.bins || !S.bins.ok) { return Promise.resolve(); }
    S.detecting = true; paintStats();
    var chain = Promise.resolve();
    todo.forEach(function (p) { chain = chain.then(function () { return probeFile(p); }); });
    return chain.then(function () { S.detecting = false; paintAll(); });
  }

  function startPoll() {
    stopPoll();
    S.timer = setInterval(function () { if (!document.hidden) { tick(false); } }, 2000);
  }
  function stopPoll() { if (S.timer) { clearInterval(S.timer); S.timer = 0; } }

  // ---------------------------------------------------------------------------------------------
  // Rendering
  // ---------------------------------------------------------------------------------------------
  function chip(name, value, label, checked) {
    return '<label class="chip" title="' + esc(label) + '"><input type="radio" name="' + name + '" value="' + value + '" data-no-restore' + (checked ? " checked" : "") + '><span>' + esc(label) + '</span></label>';
  }
  function sw(id, label, on) {
    return '<div class="saber-wrap' + (on ? " is-active" : "") + '"><label class="switch-row" for="' + id + '"><span>' + esc(label) + '</span>' +
      '<input type="checkbox" id="' + id + '" data-no-restore' + (on ? " checked" : "") + '><span class="switch-track"></span></label></div>';
  }

  function render() {
    var root = document.createElement("div"), c = S.cfg, k;
    root.className = "ta dfr";
    S.root = root;
    S.bins = findBins();

    var presetChips = "", rangeChips, targetChips;
    for (k in PRESETS) { if (PRESETS.hasOwnProperty(k)) { presetChips += chip("dfr-preset", k, PRESETS[k].label, c.preset === k); } }
    rangeChips = chip("dfr-range", "layer", "Whole layer", c.range === "layer") + chip("dfr-range", "work", "Work area", c.range === "work");
    targetChips = chip("dfr-target", "same", "Same as source", c.target === "same") + chip("dfr-target", "24", "24", c.target === "24") +
      chip("dfr-target", "30", "30", c.target === "30") + chip("dfr-target", "60", "60", c.target === "60");

    root.innerHTML =
      '<div class="ta-section">' +
        '<div class="dfr-row"><h2 class="ta-title">Source</h2><span class="dfr-spin" aria-hidden="true"></span></div>' +
        '<div class="dfr-layers" id="dfr-layers"></div>' +
        '<div class="dfr-warn" id="dfr-warn" role="alert">' +
          '<p id="dfr-warn-text"></p>' +
          '<div class="dfr-warn-actions">' +
            '<button class="dfr-btn" type="button" id="dfr-match" title="Match comp">Match comp to source</button>' +
            '<button class="dfr-btn" type="button" id="dfr-keepfps" title="Keep comp">Keep and recalculate</button>' +
          '</div>' +
        '</div>' +
        '<div class="dfr-stats" id="dfr-stats"></div>' +
        '<p class="dfr-note" id="dfr-binnote"></p>' +
      '</div>' +

      '<div class="ta-section">' +
        '<h2 class="ta-title">Scan</h2>' +
        '<div class="dfr-field"><div class="dfr-row"><span class="dfr-label">Sensitivity</span><span class="dfr-value" id="dfr-sens-val"></span></div>' +
          '<input type="range" id="dfr-sens" min="1" max="100" step="1" value="' + c.sens + '" data-no-restore aria-label="Sensitivity"></div>' +
        '<p class="dfr-note">Higher finds fewer duplicates. Lower treats small changes as duplicates.</p>' +
        '<div class="dfr-field"><div class="dfr-row"><span class="dfr-label">Min duration (frames)</span></div>' +
          '<input type="number" class="text-input" id="dfr-mindur" min="1" max="8" step="1" value="' + c.minDur + '" data-no-restore aria-label="Min duration"></div>' +
        '<p class="dfr-note">Held runs with fewer duplicate frames than this are left alone.</p>' +
        '<div class="chips chips-2">' + rangeChips + '</div>' +
        '<button class="dfr-btn is-main" type="button" id="dfr-scan" title="Scan">Scan</button>' +
        '<div class="dfr-prog" id="dfr-prog">' +
          '<div class="dfr-prog-top"><span class="dfr-prog-text" id="dfr-prog-text"></span>' +
          '<button class="dfr-prog-cancel" type="button" id="dfr-cancel" title="Cancel">Cancel</button></div>' +
          '<div class="dfr-track"><i class="dfr-bar" id="dfr-bar"></i></div>' +
        '</div>' +
      '</div>' +

      '<div class="ta-section">' +
        '<h2 class="ta-title">Result</h2>' +
        '<div class="dfr-strip-wrap" id="dfr-strip-wrap" title="Jump"><canvas class="dfr-strip" id="dfr-strip"></canvas><span class="dfr-strip-empty">Scan to see unique and dead frames</span></div>' +
        '<div class="dfr-legend"><span><i class="u"></i>Unique frame</span><span><i class="d"></i>Dead frame</span></div>' +
        '<div class="dfr-stats" id="dfr-rstats"></div>' +
        '<div class="dfr-scenes" id="dfr-scenes"></div>' +
        '<div class="dfr-actions">' +
          '<button class="dfr-btn" type="button" id="dfr-mk" title="Preview markers">Preview markers</button>' +
          '<button class="dfr-btn" type="button" id="dfr-mkclear" title="Clear markers">Clear markers</button>' +
        '</div>' +
      '</div>' +

      '<div class="ta-section">' +
        '<h2 class="ta-title">Auto Smooth</h2>' +
        '<div class="chips chips-3">' + presetChips + '</div>' +
        '<span class="dfr-label">Target fps</span>' +
        '<div class="chips chips-3">' + targetChips + '</div>' +
        '<div class="dfr-field"><div class="dfr-row"><span class="dfr-label">Twixtor input frame rate</span></div>' +
          '<select class="select" id="dfr-infps" data-no-restore aria-label="Input frame rate">' +
            '<option value="clip"' + (c.inputFps === "clip" ? " selected" : "") + '>Clip fps (recommended)</option>' +
            '<option value="effective"' + (c.inputFps === "effective" ? " selected" : "") + '>Effective fps</option>' +
          '</select></div>' +
        sw("dfr-o-keep", "Keep original layer", c.keep) +
        sw("dfr-o-pre", "Place result in source comp", c.precomp) +
        sw("dfr-o-quick", "Quick check (2 seconds)", c.quick) +
        sw("dfr-o-queue", "Send to Render Queue", c.queue) +
        sw("dfr-o-mk", "Preview markers after scan", c.markers) +
        '<p class="dfr-note" id="dfr-plugin"></p>' +
        '<button class="dfr-btn is-main" type="button" id="dfr-run" title="Auto Smooth">Auto Smooth</button>' +
        '<button class="dfr-btn" type="button" id="dfr-clear" title="Clear cache">Clear cache</button>' +
        '<div class="dfr-report" id="dfr-report"></div>' +
      '</div>';

    var R = S.ref = {
      layers: root.querySelector("#dfr-layers"), warn: root.querySelector("#dfr-warn"), warnText: root.querySelector("#dfr-warn-text"),
      stats: root.querySelector("#dfr-stats"), binnote: root.querySelector("#dfr-binnote"),
      sens: root.querySelector("#dfr-sens"), sensVal: root.querySelector("#dfr-sens-val"), minDur: root.querySelector("#dfr-mindur"),
      scan: root.querySelector("#dfr-scan"), prog: root.querySelector("#dfr-prog"), progText: root.querySelector("#dfr-prog-text"), bar: root.querySelector("#dfr-bar"),
      stripWrap: root.querySelector("#dfr-strip-wrap"), strip: root.querySelector("#dfr-strip"), rstats: root.querySelector("#dfr-rstats"), scenes: root.querySelector("#dfr-scenes"),
      mk: root.querySelector("#dfr-mk"), mkClear: root.querySelector("#dfr-mkclear"), plugin: root.querySelector("#dfr-plugin"),
      run: root.querySelector("#dfr-run"), clear: root.querySelector("#dfr-clear"), report: root.querySelector("#dfr-report")
    };

    wire(root);
    paintAll();
    // run detection after the first paint so opening the tab never blocks
    setTimeout(function () { if (document.body.contains(root)) { paintResult(); tick(true); startPoll(); } }, 60);
    return root;
  }

  function radio(root, name, cb) {
    var list = root.querySelectorAll('input[name="' + name + '"]'), i;
    for (i = 0; i < list.length; i++) { list[i].addEventListener("change", function (e) { if (e.target.checked) { cb(e.target.value); } }); }
  }
  function toggle(root, id, key, after) {
    var el = root.querySelector("#" + id);
    el.addEventListener("change", function (e) {
      save(key, e.target.checked);
      var wrap = e.target.closest(".saber-wrap");
      if (wrap) { wrap.classList.toggle("is-active", e.target.checked); }
      if (after) { after(); }
    });
  }

  function wire(root) {
    var R = S.ref;
    R.sens.addEventListener("input", function () { save("sens", parseInt(R.sens.value, 10) || 50); paintSens(); });
    R.minDur.addEventListener("change", function () { var v = clamp(parseInt(R.minDur.value, 10) || 1, 1, 8); R.minDur.value = v; save("minDur", v); });
    radio(root, "dfr-range", function (v) { save("range", v); if (S.scan) { S.scan = null; S.scanKey = ""; paintAll(); } });
    radio(root, "dfr-preset", function (v) { save("preset", v); });
    radio(root, "dfr-target", function (v) { save("target", v); paintAll(); });
    root.querySelector("#dfr-infps").addEventListener("change", function (e) { save("inputFps", e.target.value === "effective" ? "effective" : "clip"); });
    toggle(root, "dfr-o-keep", "keep"); toggle(root, "dfr-o-pre", "precomp"); toggle(root, "dfr-o-quick", "quick"); toggle(root, "dfr-o-queue", "queue"); toggle(root, "dfr-o-mk", "markers");

    R.scan.addEventListener("click", startScan);
    R.run.addEventListener("click", startSmooth);
    root.querySelector("#dfr-cancel").addEventListener("click", cancelJob);
    R.mk.addEventListener("click", function () { pending(R.mk, true); sendMarkers(false).then(function () { pending(R.mk, false); }); });
    R.mkClear.addEventListener("click", function () {
      pending(R.mkClear, true);
      host("DFR_cleanup", [{ removeMarkers: true }]).then(function (r) { pending(R.mkClear, false); flash(R.mkClear, r.ok); toast(r.ok ? "Removed " + (r.data ? r.data.markersRemoved : 0) + " marker(s)." : r.message, !r.ok); });
    });
    R.clear.addEventListener("click", clearCache);
    root.querySelector("#dfr-match").addEventListener("click", function () {
      var L = pickedLayer();
      if (!L) { return; }
      host("DFR_setCompFps", [L.srcFps]).then(function (r) { toast(r.message, !r.ok); tick(true); });
    });
    root.querySelector("#dfr-keepfps").addEventListener("click", function () {
      var L = pickedLayer();
      if (L && S.comp) { S.dismiss = fmtFps(S.comp.fps) + "|" + fmtFps(L.srcFps); }
      paintAll();
      toast("Keeping the comp at " + fmtFps(S.comp ? S.comp.fps : 0) + " fps. Results use that rate.");
    });
    R.stripWrap.addEventListener("click", function (e) {
      var sc = S.scan;
      if (!sc) { return; }
      var r = R.stripWrap.getBoundingClientRect(), x = clamp((e.clientX - r.left) / Math.max(1, r.width), 0, 1);
      jumpTo(sceneCompTime(sc, clamp(Math.floor(x * sc.total), 0, sc.total - 1)));
    });
    R.scenes.addEventListener("click", function (e) {
      var b = e.target.closest ? e.target.closest(".dfr-scene") : null, sc = S.scan;
      if (!b || !sc) { return; }
      jumpTo(sceneCompTime(sc, parseInt(b.getAttribute("data-a"), 10) || 0));
    });
  }

  function pending(btn, on) { if (btn) { btn.classList.toggle("is-pending", !!on); } }
  function flash(btn, ok) {
    if (!btn) { return; }
    btn.classList.remove("is-pending");
    btn.classList.add(ok ? "is-success" : "is-error");
    setTimeout(function () { btn.classList.remove("is-success", "is-error"); }, 900);
  }

  // refs are valid as soon as render() ran (painting a not-yet-attached tree is harmless); attached() = really on screen
  function alive() { return !!S.root && !!S.ref.layers; }
  function attached() { return !!S.root && document.body.contains(S.root); }

  function paintAll() {
    if (!alive()) { return; }
    paintLayers(); paintWarn(); paintStats(); paintSens(); paintButtons(); paintProgress(); paintResult(); paintPlugin(); paintReport();
  }

  function paintSens() { if (alive()) { S.ref.sensVal.textContent = S.cfg.sens; } }

  function paintLayers() {
    var box = S.ref.layers, html = "", i, L;
    if (!S.comp) { box.innerHTML = '<div class="dfr-empty">Open a composition and select a footage layer.</div>'; return; }
    if (!S.layers.length) { box.innerHTML = '<div class="dfr-empty">Select a footage layer in the timeline.</div>'; return; }
    for (i = 0; i < S.layers.length; i++) {
      L = S.layers[i];
      html += '<button type="button" class="dfr-layer' + (i === S.picked ? " is-picked" : "") + (L.ok ? "" : " is-bad") + '" data-i="' + i + '" title="' + esc(L.ok ? L.name : L.reason) + '">' +
        '<span class="dfr-layer-dot"></span><span class="dfr-layer-name">' + esc(L.name) + '</span>' +
        '<span class="dfr-layer-fps">' + (L.srcFps ? fmtFps(L.srcFps) + " fps" : "-") + '</span></button>';
    }
    box.innerHTML = html;
    var btns = box.querySelectorAll(".dfr-layer"), j;
    for (j = 0; j < btns.length; j++) {
      btns[j].addEventListener("click", function (e) {
        var n = parseInt(e.currentTarget.getAttribute("data-i"), 10);
        if (n === S.picked || S.busy) { return; }
        S.picked = n;
        if (S.scan && S.scanKey !== layerKey(pickedLayer()) + "|" + S.cfg.range) { S.scan = null; S.scanKey = ""; }
        paintAll();
      });
    }
  }

  function paintWarn() {
    var L = pickedLayer(), c = S.comp, R = S.ref, open = false;
    if (L && c && L.srcFps && !sameFps(c.fps, L.srcFps) && S.dismiss !== fmtFps(c.fps) + "|" + fmtFps(L.srcFps)) {
      R.warnText.textContent = "The comp runs at " + fmtFps(c.fps) + " fps but this source is " + fmtFps(L.srcFps) + " fps.";
      open = true;
    }
    R.warn.classList.toggle("is-open", open);
  }

  function cell(value, label, wide, badge, warn) {
    return '<div class="dfr-stat' + (wide ? " is-wide" : "") + '"><b>' + esc(value) + (badge ? '<span class="dfr-badge' + (warn ? " is-warn" : "") + '">' + esc(badge) + '</span>' : "") + '</b><span>' + esc(label) + '</span></div>';
  }

  function paintStats() {
    if (!alive()) { return; }
    var L = pickedLayer(), c = S.comp, p = L && L.ok ? S.probe[L.path] : null, sc = S.scan && L && S.scanKey === layerKey(L) + "|" + S.cfg.range ? S.scan : null, h = "";
    S.root.classList.toggle("is-detecting", !!S.detecting);
    h += cell(c ? fmtFps(c.fps) + " fps" : "-", c && isNtsc(c.fps) ? "Comp (NTSC)" : "Comp");
    h += cell(L && L.srcFps ? fmtFps(L.srcFps) + " fps" : "-", L && isNtsc(L.srcFps) ? "Layer source (NTSC)" : "Layer source");
    if (p && !p.error) {
      h += cell(p.rRaw + "  (" + fmtFps(p.r) + ")", "File r_frame_rate", true);
      h += cell(p.avgRaw + "  (" + fmtFps(p.avg) + ")", "File avg_frame_rate", true);
    } else {
      h += cell(L && L.ok ? (p && p.error ? p.error : (S.bins && S.bins.ok ? "Reading..." : "-")) : "-", "File frame rates", true);
    }
    h += cell(sc ? fmtFps(sc.eff) + " fps" : "Not scanned", "Effective");
    h += cell(sc ? sc.cad : "Not scanned", "Cadence");
    var vfr = sc ? sc.vfr : (p && !p.error && p.r && p.avg && !sameFps(p.r, p.avg));
    h += cell(vfr ? "Variable (VFR)" : (p && !p.error || sc ? "Constant (CFR)" : "-"), "Frame rate type", true);
    S.ref.stats.innerHTML = h;
    var note = "";
    if (S.bins && !S.bins.ok) { note = S.bins.msg; }
    else if (L && layerBlock(L)) { note = layerBlock(L); }
    S.ref.binnote.textContent = note;
    S.ref.binnote.classList.toggle("is-warn", !!note);
  }

  function paintButtons() {
    var R = S.ref, L = pickedLayer(), can = !S.busy && !layerBlock(L) && S.bins && S.bins.ok, has = !!S.scan && L && S.scanKey === layerKey(L) + "|" + S.cfg.range;
    R.scan.classList.toggle("is-disabled", !can);
    R.run.classList.toggle("is-disabled", !(can && has));
    R.mk.classList.toggle("is-disabled", !(has && !S.busy));
    R.clear.classList.toggle("is-disabled", !!S.busy);
    R.scan.classList.toggle("is-pending", S.busy === "scan");
    R.run.classList.toggle("is-pending", S.busy === "smooth");
  }

  function paintProgress() {
    if (!alive()) { return; }
    var R = S.ref, p = S.prog;
    R.prog.classList.toggle("is-open", !!p);
    if (p) { R.progText.textContent = p.text; R.bar.style.transform = "scaleX(" + clamp(p.pct, 0, 1).toFixed(3) + ")"; }
    else { R.bar.style.transform = "scaleX(0)"; }
  }

  function cssVar(name, fallback) {
    var v = "";
    try { v = getComputedStyle(S.root).getPropertyValue(name); } catch (e) { }
    v = (v || "").replace(/^\s+|\s+$/g, "");
    return v || fallback;
  }

  function drawStrip() {
    var cv = S.ref.strip, sc = S.scan, W, H, ctx, dpr = window.devicePixelRatio || 1, cols, i, f, u, a, b, k, uniqSet, cell0, scn, accent, dim;
    if (!cv) { return; }
    W = cv.clientWidth; H = cv.clientHeight;
    if (!W || !H) { return; }
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    ctx = cv.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    S.ref.stripWrap.classList.toggle("has-data", !!sc);
    if (!sc) { return; }
    accent = cssVar("--accent", "#ffffff"); dim = cssVar("--text-faint", "#666666");
    uniqSet = {};
    for (i = 0; i < sc.scenes.length; i++) { for (k = 0; k < sc.scenes[i].keep.length; k++) { uniqSet[sc.scenes[i].keep[k]] = 1; } }
    cols = Math.min(sc.total, Math.floor(W / 2));
    cell0 = W / cols;
    for (i = 0; i < cols; i++) {
      a = Math.floor(i * sc.total / cols); b = Math.max(a + 1, Math.floor((i + 1) * sc.total / cols)); u = 0;
      for (f = a; f < b; f++) { if (uniqSet[f]) { u++; } }
      ctx.globalAlpha = 0.28 + 0.72 * (u / (b - a));
      ctx.fillStyle = u ? accent : dim;
      if (!u) { ctx.globalAlpha = 0.35; }
      ctx.fillRect(i * cell0, 4, Math.max(1, cell0 - 1), H - 12);
    }
    ctx.globalAlpha = 1;
    var colors = { "1": "#5fd38d", "2": "#5aa8ff", "3": "#ffd166", "4": "#ff6b7a", "m": "#b99cff" };
    for (i = 0; i < sc.scenes.length; i++) {
      scn = sc.scenes[i];
      ctx.fillStyle = colors[scn.cls] || accent;
      ctx.fillRect(scn.a / sc.total * W, H - 5, Math.max(2, (scn.b - scn.a) / sc.total * W - 1), 3);
    }
  }

  function paintResult() {
    if (!alive()) { return; }
    var R = S.ref, L = pickedLayer(), sc = S.scan && L && S.scanKey === layerKey(L) + "|" + S.cfg.range ? S.scan : null, plan, h = "", i, s;
    drawStrip();
    if (!sc) { R.rstats.innerHTML = ""; R.scenes.innerHTML = ""; R.rstats.style.display = "none"; R.scenes.style.display = "none"; return; }
    R.rstats.style.display = ""; R.scenes.style.display = "";
    plan = buildPlan(0);
    R.rstats.innerHTML = cell(String(sc.total), "Total frames") + cell(String(sc.unique), "Unique frames") + cell(String(plan.removed), "Dead frames") + cell(String(plan.scenes.length), plan.scenes.length === 1 ? "Scene" : "Scenes");
    for (i = 0; i < plan.scenes.length; i++) {
      s = plan.scenes[i];
      h += '<button type="button" class="dfr-scene" data-a="' + s.a + '" title="Jump">' +
        '<span class="dfr-scene-chip dfr-c' + s.cls + '"></span>' +
        '<span class="dfr-scene-main"><span class="dfr-scene-title">Scene ' + (i + 1) + '  ' + esc(s.cad) + '</span>' +
        '<span class="dfr-scene-sub">' + s.U + ' of ' + s.T + ' frames, ' + fmtFps(s.eff) + ' fps</span></span>' +
        '<span class="dfr-scene-speed">' + s.speed + '%</span></button>';
    }
    R.scenes.innerHTML = h;
  }

  function paintPlugin() {
    if (!alive()) { return; }
    var tw = S.twx, el = S.ref.plugin;
    if (!tw) { el.textContent = "Twixtor Pro is detected when you run Auto Smooth."; el.classList.remove("is-warn"); return; }
    if (tw.found) { el.textContent = "Using " + tw.effects[tw.pick].name + "."; el.classList.remove("is-warn"); }
    else if (tw.timewarp) { el.textContent = "Twixtor is not installed. Timewarp (Pixel Motion) will be used instead."; el.classList.add("is-warn"); }
    else { el.textContent = "Twixtor and Timewarp are both unavailable."; el.classList.add("is-warn"); }
  }

  function paintReport() {
    if (!alive()) { return; }
    var el = S.ref.report, r = S.report, h, i, rows = [], sp = [];
    if (!r) { el.classList.remove("is-open"); el.innerHTML = ""; return; }
    for (i = 0; i < r.scenes.length && i < 8; i++) { sp.push("S" + (i + 1) + " " + r.scenes[i].speed + "%"); }
    if (r.scenes.length > 8) { sp.push("+" + (r.scenes.length - 8) + " more"); }
    rows.push(["Frames removed", r.removed + " of " + r.total]);
    rows.push(["Speed %", sp.join(", ")]);
    rows.push(["Result comp", r.comp]);
    rows.push(["Engine", r.engine + (r.fallback ? " (fallback)" : "")]);
    if (r.placed) { rows.push(["Original layer", r.original]); }
    if (r.queued) { rows.push(["Render Queue", "Added"]); }
    if (r.missing.length) { rows.push(["Not found in plugin", r.missing.join(", ")]); }
    for (i = 0; i < r.notes.length; i++) { rows.push(["Note", r.notes[i]]); }
    h = "<h3>" + (r.quick ? "Quick check report" : "Report") + "</h3><ul>";
    for (i = 0; i < rows.length; i++) { h += "<li><span>" + esc(rows[i][0]) + "</span><b>" + esc(rows[i][1]) + "</b></li>"; }
    el.innerHTML = h + "</ul>";
    el.classList.add("is-open");
  }

  // ---------------------------------------------------------------------------------------------
  // Clear cache (two clicks)
  // ---------------------------------------------------------------------------------------------
  function clearCache() {
    var R = S.ref;
    if (S.busy) { return; }
    if (!S.armClear) {
      R.clear.textContent = "Click again to confirm";
      R.clear.classList.add("is-armed");
      S.armClear = setTimeout(function () { S.armClear = 0; if (alive()) { R.clear.textContent = "Clear cache"; R.clear.classList.remove("is-armed"); } }, 3000);
      return;
    }
    clearTimeout(S.armClear); S.armClear = 0;
    R.clear.textContent = "Clear cache"; R.clear.classList.remove("is-armed");
    var fs = nreq("fs"), path = nreq("path"), dir, files, n = 0, i;
    try { dir = cacheDir(); files = fs.readdirSync(dir); } catch (e) { toast("The cache folder could not be read.", true); return; }
    host("DFR_cleanup", [{ cachePath: dir }]).then(function (r) {
      for (i = 0; i < files.length; i++) {
        if (/^dfr_/.test(files[i])) { try { fs.unlinkSync(path.join(dir, files[i])); n++; } catch (e2) { } }
      }
      var inUse = r.ok && r.data ? r.data.footageInUse : 0;
      toast("Deleted " + n + " cached file(s)." + (inUse ? " " + inUse + " clip(s) in this project are now offline." : ""), false);
    });
  }

  var rz = 0;
  window.addEventListener("resize", function () {
    if (rz || !attached()) { return; }
    rz = window.requestAnimationFrame(function () { rz = 0; if (attached()) { drawStrip(); } });
  });

  window.DFR = { render: render };
})();
