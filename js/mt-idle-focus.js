/* Multi Tool - mt-idle-focus.js
   Idle screen extras:
     - live "time in After Effects" (hours / minutes / seconds), from the session start the Idle module in main.js saves
       (localStorage mtx.sessionStart)
     - countdown timer (hours + minutes target, start / pause / reset) that plays a notification sound when time is up
     - notes and a daily list (8 tasks; the ticks clear themselves when the date changes)
   The controls live in #settings-modal (mirrored into the Settings window by js/mt-settings-remote.js); the idle screen
   itself is display-only. Load AFTER js/main.js. ES5, Chromium-74 safe.
   Keys (all prefixed "mtx."): showElapsed, tH, tM, tState (idle|running|paused|done), tEnd, tRemain, tTotal,
   tSound, tVoice (chime|custom), tVolume, tSoundPath, notes, todo1..8, todoDone1..8, todoDay. */
(function () {
  "use strict";
  var P = "mtx.", TODOS = 8;
  function $(id) { return document.getElementById(id); }
  function get(k) { try { return localStorage.getItem(P + k); } catch (e) { return null; } }
  function set(k, v) { try { localStorage.setItem(P + k, String(v)); return true; } catch (e) { return false; } }
  function del(k) { try { localStorage.removeItem(P + k); } catch (e) { } }
  function pad(n) { return n < 10 ? "0" + n : String(n); }
  function num(v, lo, hi, d) { v = parseInt(v, 10); if (!isFinite(v)) { v = d; } return Math.max(lo, Math.min(hi, v)); }
  function split(ms) { var s = Math.max(0, Math.floor(ms / 1000)); return { h: Math.floor(s / 3600), m: Math.floor((s % 3600) / 60), s: s % 60 }; }
  function clock(ms) { var t = split(ms); return pad(t.h) + ":" + pad(t.m) + ":" + pad(t.s); }
  function toast(msg) {
    var el = $("toast"); if (!el) { return; }
    el.textContent = msg; el.classList.remove("is-error"); el.classList.add("is-show");
    clearTimeout(toast.t); toast.t = setTimeout(function () { el.classList.remove("is-show"); }, 3200);
  }

  var el = {}, state = "idle", ticker = 0;

  // ================= timer =================
  function cfgMs() { return (num(get("tH"), 0, 23, 1) * 3600 + num(get("tM"), 0, 59, 0) * 60) * 1000; }
  function leftMs() {
    if (state === "running") { return Math.max(0, num0(get("tEnd")) - Date.now()); }
    if (state === "paused") { return Math.max(0, num0(get("tRemain"))); }
    if (state === "done") { return 0; }
    return cfgMs();
  }
  function num0(v) { v = parseFloat(v); return isFinite(v) ? v : 0; }

  function start() {
    if (state === "running") { pause(); return; }
    if (state === "paused") { set("tEnd", Date.now() + num0(get("tRemain"))); setState("running"); return; }
    var total = cfgMs();
    if (total <= 0) { toast("Set hours or minutes for the timer first."); return; }
    set("tTotal", total); set("tEnd", Date.now() + total); setState("running");
  }
  function pause() { set("tRemain", Math.max(0, num0(get("tEnd")) - Date.now())); setState("paused"); }
  function reset() { del("tEnd"); del("tRemain"); setState("idle"); }
  function setState(s) { state = s; set("tState", s); render(); tickerCheck(); }
  function finish() {
    state = "done"; set("tState", "done"); render();
    toast("Time is up!");
    if (get("tSound") !== "0") { playSound(); }
    tickerCheck();
  }

  // ================= sound =================
  var ac = null, audio = null;
  function audioCtx() {
    if (!ac) { try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { ac = null; } }
    if (ac && ac.state === "suspended") { try { ac.resume(); } catch (e2) { } }
    return ac;
  }
  function volume() { return num(get("tVolume"), 0, 100, 80) / 100; }

  // soft sparkle: five rising bell notes (E6 G6 C7 E7 G7), each with a quiet octave overtone
  function chime(vol) {
    var c = audioCtx(); if (!c || vol <= 0) { return 0; }
    var notes = [1318.5, 1568, 2093, 2637, 3136], t0 = c.currentTime + 0.03, i;
    for (i = 0; i < notes.length; i++) {
      var at = t0 + i * 0.11, len = i === notes.length - 1 ? 1.1 : 0.5;
      [[1, 0.34], [2, 0.09]].forEach(function (p) {
        var o = c.createOscillator(), g = c.createGain();
        o.type = p[0] === 1 ? "sine" : "triangle"; o.frequency.value = notes[i] * p[0];
        g.gain.setValueAtTime(0.0001, at);
        g.gain.exponentialRampToValueAtTime(vol * p[1], at + 0.012);
        g.gain.exponentialRampToValueAtTime(0.0001, at + len);
        o.connect(g); g.connect(c.destination); o.start(at); o.stop(at + len + 0.05);
      });
    }
    return (notes.length - 1) * 0.11 + 1.1;
  }

  // sound mode: "chime" (built-in) or "custom" (your own file). The old anime-girl voice ("voice") was removed; saved "voice" becomes "chime".
  function soundMode() { var m = get("tVoice"); return m === "custom" ? "custom" : "chime"; }

  function soundUrl() {
    var p = get("tSoundPath");
    if (p && nodeApi && nodeApi.exists(p)) { return nodeApi.toFileUrl(p); }
    return window.__mtIdleSoundBlob || "";
  }
  function playSound() {
    var vol = volume();
    if (soundMode() === "custom") {
      var url = soundUrl();
      if (url) {
        try { if (audio) { audio.pause(); } audio = new Audio(url); audio.volume = vol; audio.play(); return; } catch (e) { }
      }
    }
    chime(vol);   // built-in sound (also the fallback while no custom file is chosen)
  }

  // ---- custom sound file (copied next to the backgrounds so it survives restarts) ----
  var nodeApi = (function () {
    var fs, path, os;
    try { fs = require("fs"); path = require("path"); os = require("os"); } catch (e) { return null; }
    var dir = path.join(os.homedir(), "Documents", "MyMultitoolExtension", "Sounds");
    return {
      persist: function (file) {
        if (!file || !file.path) { return null; }
        try {
          try { fs.mkdirSync(dir, { recursive: true }); } catch (e1) { }
          try { fs.readdirSync(dir).forEach(function (n) { if (n.indexOf("timer-sound-") === 0) { try { fs.unlinkSync(path.join(dir, n)); } catch (e2) { } } }); } catch (e3) { }
          var dest = path.join(dir, "timer-sound-" + Date.now() + (path.extname(file.path) || ""));
          fs.copyFileSync(file.path, dest); return dest;
        } catch (e) { return null; }
      },
      clear: function () { try { fs.readdirSync(dir).forEach(function (n) { if (n.indexOf("timer-sound-") === 0) { try { fs.unlinkSync(path.join(dir, n)); } catch (e) { } } }); } catch (e4) { } },
      exists: function (p) { try { return !!p && fs.existsSync(p); } catch (e) { return false; } },
      toFileUrl: function (p) { var n = String(p).replace(/\\/g, "/"); if (n.charAt(0) !== "/") { n = "/" + n; } return "file://" + encodeURI(n).replace(/#/g, "%23"); }
    };
  })();
  function soundNote() {
    var n = "";
    if (soundMode() === "custom") {
      n = (get("tSoundPath") && nodeApi && nodeApi.exists(get("tSoundPath"))) ? "Using your file." : (window.__mtIdleSoundBlob ? "Using your file for this session only." : "No file chosen yet. Press Choose file. The built-in chime plays until then.");
    }
    if (el.note && el.note.textContent !== n) { el.note.textContent = n; }
  }

  // ================= daily list / notes =================
  function today() { var d = new Date(); return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
  function newDay() {
    if (get("todoDay") === today()) { return false; }
    var i; for (i = 1; i <= TODOS; i++) { del("todoDone" + i); }
    set("todoDay", today()); return true;
  }

  // ================= idle screen rendering =================
  function isIdle() { return document.body.classList.contains("is-idle"); }
  function setText(node, t) { if (node && node.textContent !== t) { node.textContent = t; } }

  function renderElapsed() {
    var show = get("showElapsed") !== "0", box = el.elapsed;
    if (!box) { return; }
    box.hidden = !show;
    if (!show) { return; }
    var start = parseInt(get("sessionStart"), 10), now = Date.now();
    if (!isFinite(start) || start > now) { start = now; }
    var t = split(now - start);
    setText(el.eh, pad(t.h)); setText(el.em, pad(t.m)); setText(el.es, pad(t.s));
  }
  function renderTimerChip() {
    var box = el.timerBox; if (!box) { return; }
    if (state === "idle") { box.hidden = true; return; }
    box.hidden = false;
    box.classList.toggle("is-paused", state === "paused");
    box.classList.toggle("is-done", state === "done");
    var left = leftMs(), total = num0(get("tTotal")) || 1;
    setText(el.timerLabel, state === "done" ? "Time is up" : (state === "paused" ? "Timer paused" : "Timer"));
    setText(el.timerTime, state === "done" ? "00:00:00" : clock(left));
    el.timerFill.style.width = (state === "done" ? 100 : Math.max(0, Math.min(100, (1 - left / total) * 100))) + "%";
  }
  function renderLists() {
    var items = [], i, done = 0;
    for (i = 1; i <= TODOS; i++) {
      var t = (get("todo" + i) || "").trim();
      if (t) { var d = get("todoDone" + i) === "1"; items.push({ t: t, d: d }); if (d) { done++; } }
    }
    if (el.todos) {
      el.todos.hidden = !items.length;
      if (items.length) {
        var ul = el.todoList; while (ul.firstChild) { ul.removeChild(ul.firstChild); }
        items.forEach(function (it) { var li = document.createElement("li"); li.textContent = it.t; if (it.d) { li.className = "is-done"; } ul.appendChild(li); });
        setText(el.todoCount, done + " of " + items.length + " done");
      }
    }
    var note = (get("notes") || "").trim();
    if (el.notesCard) { el.notesCard.hidden = !note; setText(el.notesText, note); }
  }
  function renderIdle() { if (!isIdle()) { return; } renderElapsed(); renderTimerChip(); }

  // ================= settings controls =================
  function startLabel() { return state === "running" ? "Pause" : state === "paused" ? "Resume" : state === "done" ? "Start again" : "Start"; }
  function render() {
    if (el.start) { setText(el.start, startLabel()); }
    if (el.reset) { el.reset.disabled = state === "idle"; }
    var lock = state === "running" || state === "paused";
    if (el.h) { el.h.disabled = lock; } if (el.m) { el.m.disabled = lock; }
    if (el.readout) { setText(el.readout, state === "done" ? "Time is up" : clock(leftMs())); }
    renderIdle();
  }
  function bindControls() {
    var i;
    function bindCheck(id, key, def) {
      var c = $(id); if (!c) { return; }
      c.checked = get(key) === null ? def : get(key) !== "0";
      c.addEventListener("change", function () { set(key, c.checked ? "1" : "0"); renderIdle(); });
    }
    bindCheck("idle-show-elapsed", "showElapsed", true);
    bindCheck("idle-timer-sound", "tSound", true);

    if (el.h) { el.h.value = num(get("tH"), 0, 23, 1); el.h.addEventListener("change", function () { el.h.value = num(el.h.value, 0, 23, 1); set("tH", el.h.value); render(); }); }
    if (el.m) { el.m.value = num(get("tM"), 0, 59, 0); el.m.addEventListener("change", function () { el.m.value = num(el.m.value, 0, 59, 0); set("tM", el.m.value); render(); }); }
    if (el.start) { el.start.addEventListener("click", start); }
    if (el.reset) { el.reset.addEventListener("click", reset); }

    if (el.voice) {
      el.voice.value = soundMode();
      el.voice.addEventListener("change", function () {
        set("tVoice", el.voice.value); soundNote();
        // Custom without a file yet: open the file chooser right away
        if (el.voice.value === "custom" && !(get("tSoundPath") && nodeApi && nodeApi.exists(get("tSoundPath"))) && !window.__mtIdleSoundBlob) {
          var fi = $("idle-timer-file"); if (fi) { fi.click(); }
        }
      });
    }
    if (el.vol) {
      el.vol.value = num(get("tVolume"), 0, 100, 80);
      if ($("idle-timer-volume-val")) { $("idle-timer-volume-val").textContent = el.vol.value + "%"; }
      el.vol.addEventListener("input", function () {
        set("tVolume", el.vol.value);
        if ($("idle-timer-volume-val")) { $("idle-timer-volume-val").textContent = el.vol.value + "%"; }
        if (window.__rfUpdateFill) { window.__rfUpdateFill(el.vol); }
      });
      if (window.__rfUpdateFill) { window.__rfUpdateFill(el.vol); }
    }
    if ($("idle-timer-test")) { $("idle-timer-test").addEventListener("click", playSound); }
    var fileIn = $("idle-timer-file");
    if ($("idle-timer-sound-set") && fileIn) {
      $("idle-timer-sound-set").addEventListener("click", function () { fileIn.click(); });
      fileIn.addEventListener("change", function () {
        var f = fileIn.files && fileIn.files[0]; fileIn.value = ""; if (!f) { return; }
        var saved = nodeApi ? nodeApi.persist(f) : null;
        if (saved) { set("tSoundPath", saved); window.__mtIdleSoundBlob = ""; }
        else { try { window.__mtIdleSoundBlob = URL.createObjectURL(f); } catch (e) { } }
        set("tVoice", "custom"); if (el.voice) { el.voice.value = "custom"; }
        soundNote(); playSound();
      });
    }
    if ($("idle-timer-sound-clear")) {
      $("idle-timer-sound-clear").addEventListener("click", function () {
        if (nodeApi) { nodeApi.clear(); } del("tSoundPath"); window.__mtIdleSoundBlob = "";
        if (get("tVoice") === "custom") { set("tVoice", "chime"); if (el.voice) { el.voice.value = "chime"; } }
        soundNote();
      });
    }

    var notes = $("idle-notes");
    if (notes) { notes.value = get("notes") || ""; notes.addEventListener("input", function () { set("notes", notes.value.slice(0, 400)); renderLists(); }); }
    for (i = 1; i <= TODOS; i++) { bindTodo(i); }
  }
  function bindTodo(i) {
    var t = $("idle-todo-" + i), c = $("idle-todo-done-" + i);
    if (t) { t.value = get("todo" + i) || ""; t.addEventListener("input", function () { set("todo" + i, t.value.slice(0, 80)); renderLists(); }); }
    if (c) { c.checked = get("todoDone" + i) === "1"; c.addEventListener("change", function () { if (c.checked) { set("todoDone" + i, "1"); } else { del("todoDone" + i); } renderLists(); }); }
  }
  function refreshTodoControls() {
    var i; for (i = 1; i <= TODOS; i++) {
      var c = $("idle-todo-done-" + i), t = $("idle-todo-" + i);
      if (c) { c.checked = get("todoDone" + i) === "1"; } if (t && document.activeElement !== t) { t.value = get("todo" + i) || ""; }
    }
  }

  // ================= clock =================
  function tick() {
    if (newDay()) { refreshTodoControls(); renderLists(); }
    if (state === "running" && num0(get("tEnd")) - Date.now() <= 0) { finish(); return; }
    if (state === "running") { setText(el.readout, clock(leftMs())); }
    renderIdle();
  }
  // one 1-second interval, only while something needs it: a running timer, or the idle screen showing seconds
  function tickerCheck() {
    var need = state === "running" || isIdle();
    if (need && !ticker) { ticker = setInterval(tick, 1000); }
    else if (!need && ticker) { clearInterval(ticker); ticker = 0; }
  }

  function init() {
    el.elapsed = $("idle-elapsed"); el.eh = $("ie-h"); el.em = $("ie-m"); el.es = $("ie-s");
    el.timerBox = $("idle-timer"); el.timerLabel = $("idle-timer-label"); el.timerTime = $("idle-timer-time"); el.timerFill = $("idle-timer-fill");
    el.todos = $("idle-todos"); el.todoList = $("idle-todos-list"); el.todoCount = $("idle-todos-count");
    el.notesCard = $("idle-notes-card"); el.notesText = $("idle-notes-text");
    el.h = $("idle-timer-h"); el.m = $("idle-timer-m"); el.start = $("idle-timer-start"); el.reset = $("idle-timer-reset");
    el.readout = $("idle-timer-readout"); el.voice = $("idle-timer-voice"); el.vol = $("idle-timer-volume"); el.note = $("idle-timer-sound-note");

    newDay();
    state = get("tState") || "idle";
    if (state === "running" && num0(get("tEnd")) - Date.now() <= 0) { state = "done"; set("tState", "done"); }   // ran out while the panel was closed
    bindControls(); renderLists(); soundNote(); render(); tickerCheck();

    // idle screen shown / hidden -> refresh content once, start/stop the 1-second tick
    try {
      new MutationObserver(function () { if (isIdle()) { renderLists(); renderElapsed(); renderTimerChip(); } tickerCheck(); })
        .observe(document.body, { attributes: true, attributeFilter: ["class"] });
    } catch (e2) { }
    // "Reset everything" in Settings
    var rs = $("settings-reset");
    if (rs) {
      rs.addEventListener("click", function () {
        ["showElapsed", "tH", "tM", "tState", "tEnd", "tRemain", "tTotal", "tSound", "tVoice", "tVolume", "tSoundPath", "notes", "todoDay"].forEach(del);
        var i; for (i = 1; i <= TODOS; i++) { del("todo" + i); del("todoDone" + i); }
        if (nodeApi) { nodeApi.clear(); } window.__mtIdleSoundBlob = "";
        state = "idle"; newDay();
        ["idle-show-elapsed", "idle-timer-sound"].forEach(function (id) { if ($(id)) { $(id).checked = true; } });
        if (el.h) { el.h.value = 1; } if (el.m) { el.m.value = 0; } if (el.voice) { el.voice.value = "chime"; }
        if (el.vol) { el.vol.value = 80; el.vol.dispatchEvent(new Event("input")); }
        if ($("idle-notes")) { $("idle-notes").value = ""; }
        refreshTodoControls(); var j; for (j = 1; j <= TODOS; j++) { if ($("idle-todo-" + j)) { $("idle-todo-" + j).value = ""; } }
        renderLists(); soundNote(); render(); tickerCheck();
      });
    }
  }
  if (document.readyState === "loading") { document.addEventListener("DOMContentLoaded", init); } else { init(); }
})();
