/* Multi Tool - mt-idle-focus.js
   Idle screen extras:
     - live "time in After Effects" (hours / minutes / seconds), from the session start the Idle module in main.js saves
       (localStorage mtx.sessionStart)
     - countdown timer (hours + minutes target, start / pause / reset) that plays a notification sound when time is up
     - notes and a daily list (8 tasks; the ticks clear themselves when the date changes). Tasks that were not ticked when
       the day changed move to "Unfinished history" (mtx.missed): finish them later from the idle screen. Ticking today's
       task with the same text also clears its history entry.
     - the Today list and the Notes card on the idle screen are interactive (tick, edit, add, remove); the way out of the
       idle screen is Esc or a click on an empty spot, handled by the Idle module in js/main.js.
     - tasks + notes + history are also written to Documents/MyMultitoolExtension/DailyTasks.json (and kept in memory), so
       they survive a cleared or full localStorage (a big GIF background can fill it) and are restored on the next start.
   - idle dashboard: stopwatch (start / pause / reset, Hide masks the digits), alarms (time, label, repeat every day; rings with the
     timer sound), Notes / To-Do tabs (several notes; the first one is the note edited in Settings), and an info popover.
     Keys: swState (idle|running|paused), swStart, swAcc, swHidden, alarms (JSON), noteList (JSON), idleTab (notes|todo).
   The other controls live in #settings-modal (mirrored into the Settings window by js/mt-settings-remote.js). Load AFTER
   js/main.js. ES5, Chromium-74 safe.
   Keys (all prefixed "mtx."): showElapsed, tH, tM, tState (idle|running|paused|done), tEnd, tRemain, tTotal,
   tSound, tVoice (chime|custom), tVolume, tSoundPath, notes, todo1..8, todoDone1..8, todoDay, todoSaved, missed (JSON). */
(function () {
  "use strict";
  var P = "mtx.", TODOS = 8;
  function $(id) { return document.getElementById(id); }
  // write-through cache: a value written here is readable even if localStorage refuses it (full)
  var mem = {};
  function has(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }
  function get(k) { if (has(mem, k)) { return mem[k]; } try { return localStorage.getItem(P + k); } catch (e) { return null; } }
  function set(k, v) { v = String(v); mem[k] = v; try { localStorage.setItem(P + k, v); return true; } catch (e) { return false; } }
  function del(k) { mem[k] = null; try { localStorage.removeItem(P + k); } catch (e) { } }
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

  // ================= daily list / notes / unfinished history =================
  var DAY_S = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"], MON_S = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  function today() { var d = new Date(); return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
  function parseDay(v) { var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v || ""); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null; }
  function dayLabel(v) { var d = parseDay(v); return d ? DAY_S[d.getDay()] + " " + d.getDate() + " " + MON_S[d.getMonth()] : ""; }
  function daysBetween(a, b) { var x = parseDay(a), y = parseDay(b); return x && y ? Math.max(1, Math.round((y - x) / 86400000)) : 1; }
  function newId(n) { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6) + n; }

  function readMissed() {
    var a; try { a = JSON.parse(get("missed") || "[]"); } catch (e) { a = []; }
    if (!Array.isArray(a)) { return []; }
    return a.filter(function (m) { return m && typeof m.t === "string" && m.t; });
  }
  function writeMissed(a) { set("missed", JSON.stringify(a.slice(-40))); }
  function addMissed(list, t, since, n) {
    var k; for (k = 0; k < list.length; k++) { if (list[k].t === t) { list[k].n = (list[k].n || 1) + n; return; } }
    list.push({ id: newId(list.length), t: t, d: since, n: n });
  }
  function dropMissedByText(t) {
    var list = readMissed(), out = list.filter(function (m) { return m.t !== t; });
    if (out.length !== list.length) { writeMissed(out); return true; }
    return false;
  }

  // First call on a new date: every task that was not ticked yesterday (or the last day the panel was open) goes to the
  // unfinished history, the ticks reset, the tasks stay.
  function newDay() {
    var td = today(), prev = get("todoDay"), i, t;
    if (prev === td) { return false; }
    if (prev) {
      var list = readMissed(), gap = daysBetween(prev, td);
      for (i = 1; i <= TODOS; i++) {
        t = (get("todo" + i) || "").trim();
        if (t && get("todoDone" + i) !== "1") { addMissed(list, t, prev, gap); }
      }
      writeMissed(list);
    }
    for (i = 1; i <= TODOS; i++) { del("todoDone" + i); }
    set("todoDay", td); persist();
    return true;
  }
  var midTimer = 0;
  function armMidnight() {                        // one timeout to just after the next midnight, re-armed each time
    clearTimeout(midTimer);
    var n = new Date(), next = new Date(n.getFullYear(), n.getMonth(), n.getDate() + 1, 0, 0, 2);
    midTimer = setTimeout(function () { dayCheck(); armMidnight(); }, Math.max(1000, next.getTime() - n.getTime()));
  }
  function dayCheck() { if (newDay()) { draft = 0; refreshTodoControls(); renderLists(); } }

  // ---- file backup (tasks, notes, history) ----
  var dataFile = (function () {
    var fs, path, os, dir, file;
    try { fs = require("fs"); path = require("path"); os = require("os"); } catch (e) { return null; }
    dir = path.join(os.homedir(), "Documents", "MyMultitoolExtension"); file = path.join(dir, "DailyTasks.json");
    return {
      read: function () { try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch (e) { return null; } },
      write: function (o) {
        try { try { fs.mkdirSync(dir, { recursive: true }); } catch (e1) { } var tmp = file + ".tmp"; fs.writeFileSync(tmp, JSON.stringify(o)); fs.renameSync(tmp, file); return true; }
        catch (e) { return false; }
      },
      remove: function () { try { fs.unlinkSync(file); } catch (e) { } }
    };
  })();
  function snapshot() {
    var todos = [], i;
    for (i = 1; i <= TODOS; i++) { todos.push({ t: get("todo" + i) || "", d: get("todoDone" + i) === "1" }); }
    return { v: 1, saved: num0(get("todoSaved")), day: get("todoDay") || "", notes: get("notes") || "", noteList: readNotes(), alarms: readAlarms(), todos: todos, missed: readMissed() };
  }
  var saveTimer = 0;
  function flushFile() { clearTimeout(saveTimer); saveTimer = 0; if (dataFile) { dataFile.write(snapshot()); } }
  function persist() { set("todoSaved", Date.now()); clearTimeout(saveTimer); saveTimer = setTimeout(flushFile, 400); }
  function hasData() {
    var i; for (i = 1; i <= TODOS; i++) { if ((get("todo" + i) || "").trim()) { return true; } }
    return !!(get("notes") || "").trim() || readMissed().length > 0 || readNotes().length > 0 || readAlarms().length > 0;
  }
  // localStorage empty / older than the file (cleared, or it was full) -> take the file
  function restoreFromFile() {
    var f = dataFile && dataFile.read(), i, it, t;
    if (!f || !f.todos || !f.todos.length) { return; }
    if (hasData() && num0(get("todoSaved")) >= num0(f.saved)) { return; }
    for (i = 1; i <= TODOS; i++) {
      it = f.todos[i - 1] || {}; t = String(it.t || "").slice(0, 80);
      if (t) { set("todo" + i, t); } else { del("todo" + i); }
      if (t && it.d) { set("todoDone" + i, "1"); } else { del("todoDone" + i); }
    }
    if (f.notes) { set("notes", String(f.notes).slice(0, 400)); } else { del("notes"); }
    if (Array.isArray(f.noteList)) {
      set("noteList", JSON.stringify(f.noteList.slice(0, NOTES_MAX)));
      set("notes", f.noteList[0] ? String(f.noteList[0].t || "").slice(0, 400) : "");
    }
    if (Array.isArray(f.alarms)) { set("alarms", JSON.stringify(f.alarms.slice(0, AL_MAX))); }
    if (f.day) { set("todoDay", f.day); }
    writeMissed(Array.isArray(f.missed) ? f.missed : []);
    set("todoSaved", num0(f.saved));
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
  var tIcon = "";
  function renderTimerChip() {
    var box = el.timerBox; if (!box) { return; }
    box.hidden = false;                              // always on the idle screen: idle shows the set duration, ready to start
    box.classList.toggle("is-paused", state === "paused");
    box.classList.toggle("is-done", state === "done");
    var left = leftMs(), total = num0(get("tTotal")) || 1;
    setText(el.timerLabel, state === "done" ? "Time is up" : (state === "paused" ? "Timer paused" : "Timer"));
    setText(el.timerTime, state === "done" ? "00:00:00" : clock(left));
    el.timerFill.style.width = (state === "idle" ? 0 : state === "done" ? 100 : Math.max(0, Math.min(100, (1 - left / total) * 100))) + "%";
    if (el.timerGo) {
      var ico = state === "running" ? "pause" : "play";
      if (ico !== tIcon) { el.timerGo.innerHTML = ico === "pause" ? ICON_PAUSE : ICON_PLAY; tIcon = ico; }
      el.timerGo.classList.toggle("is-running", state === "running");
      el.timerGo.setAttribute("aria-label", state === "running" ? "Pause timer" : (state === "paused" ? "Resume timer" : (state === "done" ? "Start timer again" : "Start timer")));
    }
    if (el.timerRst) { el.timerRst.hidden = state === "idle"; }
  }
  // ---- Today list, unfinished history and notes on the idle screen (interactive) ----
  var draft = 0, missedOpen = false, todoKey = "", missedKey = "";
  var ICON_X = '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M3 3l6 6M9 3l-6 6"/></svg>';

  function normDraft() { if (draft && (get("todo" + draft) || "").trim()) { draft = 0; } }   // the draft row became a real task
  function slots() {
    var out = [], i, t;
    normDraft();
    for (i = 1; i <= TODOS; i++) {
      t = get("todo" + i) || "";
      if (t.trim() || draft === i) { out.push({ i: i, t: t, d: get("todoDone" + i) === "1" && !!t.trim() }); }
    }
    return out;
  }
  function slotOf(node) { var li = node && node.closest ? node.closest("li") : null; return li ? parseInt(li.getAttribute("data-slot"), 10) : 0; }
  function btn(cls, label, html) {
    var b = document.createElement("button"); b.type = "button"; b.className = cls; b.setAttribute("aria-label", label);
    if (html) { b.innerHTML = html; } return b;
  }
  function buildRow(it) {
    var li = document.createElement("li"), chk = btn("ic-check", "Mark task done"), inp = document.createElement("input");
    li.className = "ic-row"; li.setAttribute("data-slot", String(it.i));
    chk.setAttribute("role", "checkbox");
    inp.type = "text"; inp.className = "ic-input"; inp.maxLength = 80; inp.placeholder = "New task"; inp.setAttribute("aria-label", "Task");
    li.appendChild(chk); li.appendChild(inp); li.appendChild(btn("ic-del", "Remove task", ICON_X));
    return li;
  }
  function renderRows(items) {
    var ul = el.todoList, key = "", i, j, rows, it, inp, focused = ul.contains(document.activeElement) && document.activeElement.tagName === "INPUT";
    for (i = 0; i < items.length; i++) { key += items[i].i + ","; }
    if (key !== todoKey && !focused) {
      while (ul.firstChild) { ul.removeChild(ul.firstChild); }
      for (i = 0; i < items.length; i++) { ul.appendChild(buildRow(items[i])); }
      todoKey = key;
    }
    rows = ul.children;
    for (i = 0; i < rows.length; i++) {
      var slot = parseInt(rows[i].getAttribute("data-slot"), 10); it = null;
      for (j = 0; j < items.length; j++) { if (items[j].i === slot) { it = items[j]; break; } }
      if (!it) { continue; }
      rows[i].classList.toggle("is-done", it.d);
      rows[i].firstChild.setAttribute("aria-checked", it.d ? "true" : "false");
      inp = rows[i].children[1];
      if (document.activeElement !== inp && inp.value !== it.t) { inp.value = it.t; }
    }
  }
  function buildMissed(m) {
    var li = document.createElement("li"), body = document.createElement("div"), lab = document.createElement("span"), meta = document.createElement("em");
    li.className = "ic-row ic-missed-row"; li.setAttribute("data-id", m.id);
    lab.className = "ic-label"; lab.textContent = m.t;
    meta.className = "ic-meta"; meta.textContent = (m.n || 1) > 1 ? "Missed " + m.n + " days, since " + dayLabel(m.d) : "Missed " + dayLabel(m.d);
    body.className = "ic-body"; body.appendChild(lab); body.appendChild(meta);
    li.appendChild(btn("ic-check", "Finish today")); li.appendChild(body); li.appendChild(btn("ic-del", "Remove from history", ICON_X));
    return li;
  }
  function renderMissed() {
    var list = readMissed(), n = list.length, i, key = "";
    setText(el.missedSummary, n ? n + (n === 1 ? " unfinished task." : " unfinished tasks.") : "Nothing unfinished.");
    if (!el.missed) { return; }
    el.missed.hidden = !n;
    if (!n) { missedOpen = false; }
    setText(el.missedLabel, "Unfinished (" + n + ")");
    el.missed.classList.toggle("is-open", missedOpen);
    el.missedToggle.setAttribute("aria-expanded", missedOpen ? "true" : "false");
    el.missedList.hidden = !(missedOpen && n);
    for (i = 0; i < n; i++) { key += list[i].id + (list[i].n || 1) + ","; }
    if (key !== missedKey) {
      while (el.missedList.firstChild) { el.missedList.removeChild(el.missedList.firstChild); }
      for (i = 0; i < n; i++) { el.missedList.appendChild(buildMissed(list[i])); }
      missedKey = key;
    }
  }
  function setProgress(n, done) {                   // To-Do progress bar: share of today's tasks that are ticked
    var bar = el.todoBar; if (!bar) { return; }
    var pct = n ? Math.round(done / n * 100) : 0;
    bar.hidden = !n;
    bar.classList.toggle("is-complete", n > 0 && done === n);
    bar.setAttribute("aria-valuenow", String(pct));
    bar.firstChild.style.width = pct + "%";
  }
  function renderLists() {
    var items = slots(), n = 0, done = 0, i;
    for (i = 0; i < items.length; i++) { if (items[i].t.trim()) { n++; if (items[i].d) { done++; } } }
    if (el.todoList) { renderRows(items); }
    setText(el.todoCount, n ? done + " of " + n + " done" : "");
    setProgress(n, done);
    if (el.todoAdd) { el.todoAdd.disabled = items.length >= TODOS && !draft; }
    renderNotes();
    renderAlarms();
    renderMissed();
  }
  // keep the panel's Settings controls (mirrored into the Settings window) in step with edits made on the idle screen
  function syncModal() {
    refreshTodoControls();
    var nm = $("idle-notes"); if (nm && document.activeElement !== nm) { nm.value = get("notes") || ""; }
  }
  function onTicked(slot) {                         // today's task done -> its unfinished-history entry is replaced
    var t = (get("todo" + slot) || "").trim();
    if (t) { dropMissedByText(t); }
  }
  function toggleTask(i) {
    if (!(get("todo" + i) || "").trim()) { return; }
    if (get("todoDone" + i) === "1") { del("todoDone" + i); } else { set("todoDone" + i, "1"); onTicked(i); }
    persist(); syncModal(); renderLists();
  }
  function removeTask(i) {
    del("todo" + i); del("todoDone" + i); if (draft === i) { draft = 0; }
    persist(); syncModal(); renderLists();
  }
  function focusRow(slot) {
    var inp = el.todoList.querySelector('li[data-slot="' + slot + '"] .ic-input'); if (inp) { inp.focus(); }
  }
  function addTask() {
    var i, free = 0;
    try { if (document.activeElement && document.activeElement.blur) { document.activeElement.blur(); } } catch (e) { }
    normDraft();
    if (draft) { renderLists(); focusRow(draft); return; }
    for (i = 1; i <= TODOS; i++) { if (!(get("todo" + i) || "").trim()) { free = i; break; } }
    if (!free) { return; }
    draft = free; del("todoDone" + free); renderLists(); focusRow(free);
  }
  function finishMissed(id, li) {                   // done today: leaves the history, and ticks today's task with the same text
    var list = readMissed(), m = null, k, i;
    if (li.classList.contains("is-finishing")) { return; }
    for (k = 0; k < list.length; k++) { if (list[k].id === id) { m = list[k]; break; } }
    if (!m) { return; }
    li.classList.add("is-finishing");
    li.firstChild.setAttribute("aria-checked", "true");
    setTimeout(function () {
      writeMissed(readMissed().filter(function (x) { return x.id !== id; }));
      for (i = 1; i <= TODOS; i++) { if ((get("todo" + i) || "").trim() === m.t) { set("todoDone" + i, "1"); } }
      persist(); syncModal(); renderLists();
    }, 420);
  }
  function dismissMissed(id) { writeMissed(readMissed().filter(function (x) { return x.id !== id; })); persist(); renderLists(); }

  function bindIdleCards() {
    if (el.todoList) {
      el.todoList.addEventListener("click", function (e) {
        var t = e.target, slot = slotOf(t);
        if (!slot) { return; }
        if (t.closest(".ic-check")) { toggleTask(slot); }
        else if (t.closest(".ic-del")) { removeTask(slot); }
      });
      el.todoList.addEventListener("input", function (e) {
        var inp = e.target, slot = slotOf(inp);
        if (!slot || !inp.classList.contains("ic-input")) { return; }
        set("todo" + slot, inp.value.slice(0, 80));
        if (!inp.value.trim()) { del("todoDone" + slot); inp.parentNode.classList.remove("is-done"); }
        persist(); syncModal();
        var n = 0, d = 0, i; for (i = 1; i <= TODOS; i++) { if ((get("todo" + i) || "").trim()) { n++; if (get("todoDone" + i) === "1") { d++; } } }
        setText(el.todoCount, n ? d + " of " + n + " done" : "");
        setProgress(n, d);
      });
      el.todoList.addEventListener("keydown", function (e) {
        if (e.target.classList && e.target.classList.contains("ic-input") && (e.key === "Enter" || e.keyCode === 13)) { e.preventDefault(); e.target.blur(); }
      });
      el.todoList.addEventListener("focusout", function (e) {
        var inp = e.target, slot = slotOf(inp);
        if (!slot || !inp.classList || !inp.classList.contains("ic-input")) { return; }
        var t = inp.value.trim();
        if (!t) { del("todo" + slot); del("todoDone" + slot); if (draft === slot) { draft = 0; } }
        else if (t !== inp.value) { inp.value = t; set("todo" + slot, t); }
        persist(); syncModal();
        setTimeout(renderLists, 0);
      });
    }
    if (el.todoAdd) { el.todoAdd.addEventListener("click", addTask); }
    if (el.missedToggle) { el.missedToggle.addEventListener("click", function () { missedOpen = !missedOpen; renderMissed(); }); }
    if (el.missedList) {
      el.missedList.addEventListener("click", function (e) {
        var li = e.target.closest ? e.target.closest("li") : null; if (!li) { return; }
        var id = li.getAttribute("data-id");
        if (e.target.closest(".ic-check")) { finishMissed(id, li); }
        else if (e.target.closest(".ic-del")) { dismissMissed(id); }
      });
    }
    var clr = $("idle-missed-clear");
    if (clr) { clr.addEventListener("click", function () { writeMissed([]); persist(); renderLists(); }); }
  }

  function renderIdle() { if (!isIdle()) { return; } renderElapsed(); renderTimerChip(); renderStopwatch(); }

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
      c.addEventListener("change", function () { set(key, c.checked ? "1" : "0"); renderIdle(); if (window.__mtApplyCards) { window.__mtApplyCards(); } });
    }
    bindCheck("idle-show-elapsed", "showElapsed", true);
    bindCheck("idle-timer-sound", "tSound", true);
    ["idle-show-sw|showSw", "idle-show-al|showAl", "idle-show-tabs|showTabs"].forEach(function (p) {
      var id = p.split("|")[0], key = p.split("|")[1], c = $(id); if (!c) { return; }
      c.checked = get(key) !== "0";
      c.addEventListener("change", function () { set(key, c.checked ? "1" : "0"); applyCards(); });
    });

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
    if (notes) { notes.value = get("notes") || ""; notes.addEventListener("input", function () { setFirstNote(notes.value.slice(0, 400)); renderLists(); }); }
    for (i = 1; i <= TODOS; i++) { bindTodo(i); }
  }
  function bindTodo(i) {
    var t = $("idle-todo-" + i), c = $("idle-todo-done-" + i);
    if (t) { t.value = get("todo" + i) || ""; t.addEventListener("input", function () { set("todo" + i, t.value.slice(0, 80)); if (!t.value.trim()) { del("todoDone" + i); if (c) { c.checked = false; } } persist(); renderLists(); }); }
    if (c) { c.checked = get("todoDone" + i) === "1"; c.addEventListener("change", function () { if (c.checked) { set("todoDone" + i, "1"); onTicked(i); } else { del("todoDone" + i); } persist(); renderLists(); }); }
  }
  function refreshTodoControls() {
    var i; for (i = 1; i <= TODOS; i++) {
      var c = $("idle-todo-done-" + i), t = $("idle-todo-" + i);
      if (c) { c.checked = get("todoDone" + i) === "1"; } if (t && document.activeElement !== t) { t.value = get("todo" + i) || ""; }
    }
  }

  // ================= idle dashboard: icons + tabs + info =================
  var ICON_PLUS = '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M6 2v8M2 6h8"/></svg>';
  var ICON_PLAY = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M5.4 3.4v9.2L12.6 8z" fill="currentColor" stroke="none"/></svg>';
  var ICON_PAUSE = '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="4" y="3" width="3" height="10" rx="0.9" fill="currentColor" stroke="none"/><rect x="9" y="3" width="3" height="10" rx="0.9" fill="currentColor" stroke="none"/></svg>';

  function setPane(name) {
    name = name === "todo" ? "todo" : "notes";
    set("idleTab", name);
    var tabs = document.querySelectorAll(".tb-tab"), i;
    for (i = 0; i < tabs.length; i++) {
      var on = tabs[i].getAttribute("data-pane") === name;
      tabs[i].classList.toggle("is-active", on);
      tabs[i].setAttribute("aria-selected", on ? "true" : "false");
      tabs[i].tabIndex = on ? 0 : -1;
    }
    if (el.paneNotes) { el.paneNotes.hidden = name !== "notes"; }
    if (el.paneTodo) { el.paneTodo.hidden = name !== "todo"; }
    if (name === "notes") { fitAllNotes(); }
  }
  function bindTabs() {
    var tabs = document.querySelectorAll(".tb-tab"), i;
    for (i = 0; i < tabs.length; i++) {
      tabs[i].addEventListener("click", function (e) { setPane(e.currentTarget.getAttribute("data-pane")); });
      tabs[i].addEventListener("keydown", function (e) {
        var k = e.key || "";
        if (k !== "ArrowLeft" && k !== "ArrowRight") { return; }
        e.preventDefault();
        var next = e.currentTarget.getAttribute("data-pane") === "notes" ? "todo" : "notes";
        setPane(next);
        var t = $(next === "todo" ? "tb-tab-todo" : "tb-tab-notes"); if (t) { t.focus(); }
      });
    }
    setPane(get("idleTab"));
  }

  // ================= stopwatch =================
  var swIcon = "";
  function swState() { var v = get("swState"); return v === "running" || v === "paused" ? v : "idle"; }
  function swElapsed() {
    var ms = Math.max(0, num0(get("swAcc")));
    if (swState() === "running") { var st = num0(get("swStart")); if (st > 0) { ms += Math.max(0, Date.now() - st); } }
    return ms;
  }
  function swToggle() {
    if (swState() === "running") { set("swAcc", swElapsed()); del("swStart"); set("swState", "paused"); }
    else { set("swStart", Date.now()); set("swState", "running"); }
    renderStopwatch();
  }
  function swReset() { del("swAcc"); del("swStart"); set("swState", "idle"); renderStopwatch(); }
  function renderStopwatch() {
    if (!el.sw) { return; }
    var st = swState(), hidden = get("swHidden") === "1", ico = st === "running" ? "pause" : "play";
    setText(el.swTime, hidden ? "\u2022\u2022:\u2022\u2022:\u2022\u2022" : clock(swElapsed()));
    el.sw.classList.toggle("is-hidden", hidden);
    el.sw.classList.toggle("is-running", st === "running");
    if (ico !== swIcon) { el.swToggle.innerHTML = ico === "pause" ? ICON_PAUSE : ICON_PLAY; swIcon = ico; }
    el.swToggle.setAttribute("aria-label", st === "running" ? "Pause stopwatch" : (st === "paused" ? "Resume stopwatch" : "Start stopwatch"));
    el.swReset.hidden = st === "idle";
    setText(el.swHide, hidden ? "Show" : "Hide");
    el.swHide.setAttribute("aria-pressed", hidden ? "true" : "false");
  }
  function bindStopwatch() {
    if (!el.sw) { return; }
    el.swToggle.addEventListener("click", swToggle);
    el.swReset.addEventListener("click", swReset);
    el.swHide.addEventListener("click", function () { set("swHidden", get("swHidden") === "1" ? "0" : "1"); renderStopwatch(); });
    renderStopwatch();
  }

  // ================= alarms =================
  var AL_MAX = 12, alKey = "";
  function readAlarms() {
    var a; try { a = JSON.parse(get("alarms") || "[]"); } catch (e) { a = []; }
    if (!Array.isArray(a)) { return []; }
    return a.filter(function (x) { return x && typeof x.tm === "string" && /^\d{2}:\d{2}$/.test(x.tm) && x.id; });
  }
  function writeAlarms(a) { set("alarms", JSON.stringify(a.slice(0, AL_MAX))); persist(); tickerCheck(); }
  function hasActiveAlarm() { return readAlarms().some(function (a) { return a.on; }); }
  function nowHM() { var d = new Date(); return pad(d.getHours()) + ":" + pad(d.getMinutes()); }
  function hmToMin(t) { return parseInt(t.slice(0, 2), 10) * 60 + parseInt(t.slice(3, 5), 10); }

  // Fires an armed alarm from its time up to 2 minutes later, once per day (a.f = "date time" of the last firing).
  function alarmCheck() {
    var list = readAlarms(); if (!list.length) { return; }
    var d = new Date(), nowM = d.getHours() * 60 + d.getMinutes(), td = today(), fired = [], i, a, diff;
    for (i = 0; i < list.length; i++) {
      a = list[i]; if (!a.on) { continue; }
      diff = nowM - hmToMin(a.tm);
      if (diff >= 0 && diff <= 2 && a.f !== td + " " + a.tm) {
        a.f = td + " " + a.tm; a.rg = Date.now(); if (!a.dy) { a.on = false; }
        fired.push(a);
      }
    }
    if (!fired.length) { return; }
    writeAlarms(list);
    toast("Alarm: " + fired.map(function (x) { return x.l || x.tm; }).join(", "));
    if (get("tSound") !== "0") { playSound(); }
    renderAlarms();
  }

  function alMeta(a, hm) {
    var parts = [], rang = a.rg && (Date.now() - a.rg) < 86400000 && new Date(a.rg).getDate() === new Date().getDate();
    if (a.l) { parts.push(a.l); }
    if (a.dy) { parts.push("Every day"); }
    else if (a.on) { parts.push(a.tm > hm ? "Today" : "Tomorrow"); }
    if (rang && !a.on) { parts.push("Rang at " + pad(new Date(a.rg).getHours()) + ":" + pad(new Date(a.rg).getMinutes())); }
    return parts.join(", ");
  }
  function buildAlarm(a, hm) {
    var li = document.createElement("li"), sw = document.createElement("button"), body = document.createElement("div"), tm = document.createElement("span"), meta = document.createElement("em");
    li.className = "al-row" + (a.on ? "" : " is-off") + (a.rg && Date.now() - a.rg < 300000 ? " is-rang" : ""); li.setAttribute("data-id", a.id);
    sw.type = "button"; sw.className = "al-switch"; sw.setAttribute("role", "switch"); sw.setAttribute("aria-checked", a.on ? "true" : "false");
    sw.setAttribute("aria-label", "Alarm " + a.tm + (a.l ? ", " + a.l : "")); sw.innerHTML = "<i></i>";
    tm.className = "al-tm"; tm.textContent = a.tm;
    meta.className = "ic-meta"; meta.textContent = alMeta(a, hm);
    body.className = "ic-body"; body.appendChild(tm); if (meta.textContent) { body.appendChild(meta); }
    li.appendChild(sw); li.appendChild(body); li.appendChild(btn("ic-del", "Delete alarm", ICON_X));
    return li;
  }
  function renderAlarms() {
    if (!el.alList) { return; }
    var list = readAlarms().sort(function (a, b) { return a.tm < b.tm ? -1 : (a.tm > b.tm ? 1 : 0); }), hm = nowHM(), key = "", i;
    for (i = 0; i < list.length; i++) { var a = list[i]; key += a.id + a.tm + (a.on ? 1 : 0) + (a.dy ? 1 : 0) + (a.l || "") + "|" + alMeta(a, hm) + (a.rg && Date.now() - a.rg < 300000 ? "r" : "") + ";"; }
    if (key !== alKey) {
      while (el.alList.firstChild) { el.alList.removeChild(el.alList.firstChild); }
      for (i = 0; i < list.length; i++) { el.alList.appendChild(buildAlarm(list[i], hm)); }
      alKey = key;
    }
    el.alEmpty.hidden = list.length > 0;
    el.alAdd.disabled = list.length >= AL_MAX;
  }
  // Alarm time: two themed dropdowns (hour, minute) instead of <input type="time">, whose popup is the operating system's. The hidden #al-time keeps "HH:MM".
  function buildTimePick() {
    var h = $("al-time-h"), m = $("al-time-m"), out = $("al-time"), i, o, cur;
    if (!h || !m || !out || h.options.length) { return; }
    for (i = 0; i < 24; i++) { o = document.createElement("option"); o.value = pad(i); o.textContent = pad(i); h.appendChild(o); }
    for (i = 0; i < 60; i++) { o = document.createElement("option"); o.value = pad(i); o.textContent = pad(i); m.appendChild(o); }
    cur = /^\d{2}:\d{2}$/.test(out.value) ? out.value : "07:00";
    h.value = cur.slice(0, 2); m.value = cur.slice(3, 5);
    function sync() { out.value = h.value + ":" + m.value; }
    h.addEventListener("change", sync); m.addEventListener("change", sync); sync();
  }
  function openAlarmForm(open) {
    el.alForm.hidden = !open;
    el.alAdd.setAttribute("aria-expanded", open ? "true" : "false");
    if (open) { try { ($("al-time-h") || el.alTime).focus(); } catch (e) { } }
  }
  function saveAlarm() {
    var tm = el.alTime.value, list = readAlarms();
    if (!/^\d{2}:\d{2}$/.test(tm)) { toast("Pick a time for the alarm."); return; }
    if (list.length >= AL_MAX) { toast("You can keep up to " + AL_MAX + " alarms."); return; }
    var a = { id: newId(list.length), tm: tm, l: el.alLabel.value.trim().slice(0, 30), on: true, dy: !!el.alDaily.checked, f: "" };
    if (tm <= nowHM()) { a.f = today() + " " + tm; }       // today's time already passed: first ring is the next occurrence
    list.push(a); writeAlarms(list);
    el.alLabel.value = ""; el.alDaily.checked = false;
    openAlarmForm(false); renderAlarms();
  }
  function bindAlarms() {
    if (!el.alList) { return; }
    buildTimePick();
    el.alAdd.innerHTML = ICON_PLUS;
    el.alAdd.addEventListener("click", function () { openAlarmForm(el.alForm.hidden); });
    el.alCancel.addEventListener("click", function () { openAlarmForm(false); });
    el.alSave.addEventListener("click", saveAlarm);
    el.alLabel.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.keyCode === 13) { e.preventDefault(); saveAlarm(); } });
    el.alList.addEventListener("click", function (e) {
      var li = e.target.closest ? e.target.closest("li") : null; if (!li) { return; }
      var id = li.getAttribute("data-id"), list = readAlarms(), k;
      for (k = 0; k < list.length; k++) { if (String(list[k].id) === id) { break; } }
      if (k >= list.length) { return; }
      if (e.target.closest(".al-switch")) {
        list[k].on = !list[k].on;
        if (list[k].on) { list[k].f = list[k].tm <= nowHM() ? today() + " " + list[k].tm : ""; }   // never fire at once for a time that already passed
        writeAlarms(list); renderAlarms();
      } else if (e.target.closest(".ic-del")) {
        list.splice(k, 1); writeAlarms(list); renderAlarms();
      }
    });
  }

  // ================= notes (several; the first one is the note edited in Settings) =================
  var NOTES_MAX = 8, noteKey = null;
  function readNotes() {
    var raw = get("noteList"), a = null;
    if (raw !== null && raw !== undefined) { try { a = JSON.parse(raw); } catch (e) { a = null; } }
    if (!Array.isArray(a)) { var old = get("notes") || ""; a = old.trim() ? [{ id: "n0", t: old }] : []; }   // the single note from older versions
    return a.filter(function (n) { return n && n.id; }).map(function (n) { return { id: String(n.id), t: String(n.t || "").slice(0, 400) }; });
  }
  function writeNotes(a) { a = a.slice(0, NOTES_MAX); set("noteList", JSON.stringify(a)); set("notes", a.length ? a[0].t : ""); persist(); }
  function setFirstNote(v) {
    var list = readNotes();
    if (list.length) { list[0].t = v; } else if (v) { list.push({ id: newId(0), t: v }); } else { return; }
    writeNotes(list);
  }
  function fit(ta) {
    ta.style.height = "auto";
    var h = ta.scrollHeight; if (h) { ta.style.height = Math.min(h + 2, 168) + "px"; }
  }
  function fitAllNotes() { if (!el.noteList) { return; } var t = el.noteList.querySelectorAll("textarea"), i; for (i = 0; i < t.length; i++) { fit(t[i]); } }
  function buildNote(n) {
    var li = document.createElement("li"), ta = document.createElement("textarea");
    li.className = "nt-item"; li.setAttribute("data-id", n.id);
    ta.className = "ic-textarea nt-text"; ta.rows = 1; ta.maxLength = 400; ta.placeholder = "Write a note"; ta.setAttribute("aria-label", "Note");
    li.appendChild(ta); li.appendChild(btn("ic-del nt-del", "Delete note", ICON_X));
    return li;
  }
  function renderNotes() {
    if (!el.noteList) { return; }
    var list = readNotes(), ul = el.noteList, ae = document.activeElement, focused = !!ae && ae.tagName === "TEXTAREA" && ul.contains(ae), key = "", i, j, rows, ta;   // only a note being typed in blocks the rebuild (a clicked Delete button must not)
    for (i = 0; i < list.length; i++) { key += list[i].id + ","; }
    if (key !== noteKey && !focused) {
      while (ul.firstChild) { ul.removeChild(ul.firstChild); }
      for (i = 0; i < list.length; i++) { ul.appendChild(buildNote(list[i])); }
      noteKey = key;
    }
    rows = ul.children;
    for (i = 0; i < rows.length; i++) {
      ta = rows[i].firstChild;
      for (j = 0; j < list.length; j++) {
        if (list[j].id === rows[i].getAttribute("data-id")) {
          if (document.activeElement !== ta && ta.value !== list[j].t) { ta.value = list[j].t; fit(ta); }
          break;
        }
      }
    }
    el.noteEmpty.hidden = list.length > 0;
    el.noteAdd.disabled = list.length >= NOTES_MAX;
  }
  function noteOf(node) { var li = node && node.closest ? node.closest("li") : null; return li ? li.getAttribute("data-id") : ""; }
  function syncNotesModal() { var nm = $("idle-notes"); if (nm && document.activeElement !== nm) { nm.value = get("notes") || ""; } }
  function bindNotes() {
    if (!el.noteList) { return; }
    el.noteAdd.innerHTML = ICON_PLUS;
    el.noteAdd.addEventListener("click", function () {
      var list = readNotes();
      if (list.length >= NOTES_MAX) { return; }
      try { if (document.activeElement && document.activeElement.blur) { document.activeElement.blur(); } } catch (e) { }
      list = readNotes();                                   // a blur may have dropped an empty note
      if (list.length >= NOTES_MAX) { return; }
      var n = { id: newId(list.length), t: "" };
      list.push(n); writeNotes(list); noteKey = null; renderNotes();
      var ta = el.noteList.lastChild ? el.noteList.lastChild.firstChild : null;
      if (ta) { ta.focus(); try { ta.parentNode.scrollIntoView({ block: "nearest" }); } catch (e2) { } }
    });
    el.noteList.addEventListener("input", function (e) {
      var ta = e.target, id = noteOf(ta); if (!id || ta.tagName !== "TEXTAREA") { return; }
      var list = readNotes(), k; for (k = 0; k < list.length; k++) { if (list[k].id === id) { list[k].t = ta.value.slice(0, 400); break; } }
      if (k < list.length) { writeNotes(list); syncNotesModal(); }
      fit(ta);
    });
    el.noteList.addEventListener("focusout", function (e) {   // an empty note is not kept
      var ta = e.target, id = noteOf(ta); if (!id || ta.tagName !== "TEXTAREA" || ta.value.trim()) { return; }
      writeNotes(readNotes().filter(function (n) { return n.id !== id; })); syncNotesModal();
      setTimeout(function () { noteKey = null; renderNotes(); }, 0);
    });
    el.noteList.addEventListener("click", function (e) {
      if (!e.target.closest || !e.target.closest(".nt-del")) { return; }
      var id = noteOf(e.target); if (!id) { return; }
      try { if (document.activeElement && document.activeElement.blur) { document.activeElement.blur(); } } catch (eB) { }
      writeNotes(readNotes().filter(function (n) { return n.id !== id; })); syncNotesModal();
      noteKey = null; renderNotes();
    });
  }

  // ================= show / hide the cards (idle screen switch) + card scale =================
  // Folded (default) = only the clock, message and an active timer show. The switch slides the dashboard open / closed.
  // Card Scale (Settings > Idle screen) zooms the cards (60-140%) through --idle-card-scale on #idle-clock.
  // Per-card show / hide: each card has a Settings switch (keys showElapsed, showSw, showAl, showTabs; default on).
  // Hidden cards keep their data. With every card off, the Show / Hide panels switch goes away too.
  function applyCards() {
    var dash = $("idle-dash"), btn = $("idle-fold-btn"), sw = get("showSw") !== "0", al = get("showAl") !== "0", tb = get("showTabs") !== "0", el0 = get("showElapsed") !== "0";
    if (dash) { dash.classList.toggle("no-sw", !sw); dash.classList.toggle("no-al", !al); dash.classList.toggle("no-tabs", !tb); dash.hidden = !(sw || al || tb); }
    if (btn) { btn.hidden = !(sw || al || tb || el0); }
  }
  window.__mtApplyCards = function () { applyCards(); };
  function folded() { return false; }   // the "Hide panels" switch is gone: the cards are always open (move / hide them with the adjust button instead)
  function applyFold(animate) {
    var box = $("idle-clock"), fold = $("idle-fold"), btn = $("idle-fold-btn"), txt = $("idle-fold-text"), shut = folded();
    if (!box || !fold || !btn) { return; }
    box.classList.toggle("is-folded", shut);
    btn.setAttribute("aria-checked", shut ? "false" : "true");
    setText(txt, shut ? "Show panels" : "Hide panels");
    clearTimeout(applyFold.t);
    if (!animate) { fold.classList.toggle("is-closed", shut); fold.style.maxHeight = shut ? "0px" : "none"; return; }
    if (shut) {
      fold.style.maxHeight = fold.scrollHeight + "px"; void fold.offsetHeight;
      fold.classList.add("is-closed"); fold.style.maxHeight = "0px";
    } else {
      fold.classList.remove("is-closed"); fold.style.maxHeight = fold.scrollHeight + "px";
      applyFold.t = setTimeout(function () { if (!folded()) { fold.style.maxHeight = "none"; } }, 560);   // free again, so a growing note list is never clipped
    }
  }
  function bindFold() {
    var btn = $("idle-fold-btn"); if (!btn) { return; }
    btn.addEventListener("click", function () { set("foldHidden", folded() ? "0" : "1"); applyFold(true); fitAllNotes(); });
    applyFold(false);
  }
  function cardScale() { return num(get("cardScale"), 60, 140, 100); }
  function applyCardScale() {
    var box = $("idle-clock"), v = cardScale(), out = $("idle-card-scale-val"), inp = $("idle-card-scale");
    if (box) { box.style.setProperty("--idle-card-scale", v / 100); }
    if (out) { out.textContent = v + "%"; }
    if (inp && String(inp.value) !== String(v)) { inp.value = v; }
    if (inp && window.__rfUpdateFill) { window.__rfUpdateFill(inp); }
  }
  function bindCardScale() {
    var inp = $("idle-card-scale"); if (!inp) { applyCardScale(); return; }
    inp.addEventListener("input", function () { set("cardScale", inp.value); applyCardScale(); });
    applyCardScale();
  }

  // ================= smooth scrolling (idle screen) =================
  // The wheel moves a target offset; a rAF loop eases scrollTop toward it (about 14% of the gap per frame), so scrolling up and
  // down glides instead of jumping in steps. Inner scrollers (notes textarea, alarm list, unfinished list) keep their own wheel.
  function bindSmoothScroll() {
    var box = $("idle-clock"), target = 0, raf = 0;
    if (!box || !window.requestAnimationFrame) { return; }
    function inner(node, dy) {
      while (node && node !== box) {
        if (node.scrollHeight > node.clientHeight + 1) {
          var oy = ""; try { oy = getComputedStyle(node).overflowY; } catch (e) { }
          if (oy === "auto" || oy === "scroll") {
            if ((dy < 0 && node.scrollTop > 0) || (dy > 0 && node.scrollTop + node.clientHeight < node.scrollHeight - 1)) { return true; }
          }
        }
        node = node.parentNode;
      }
      return false;
    }
    function step() {
      var diff = target - box.scrollTop;
      if (Math.abs(diff) < 0.5) { box.scrollTop = target; raf = 0; return; }
      box.scrollTop += diff * 0.14;
      raf = requestAnimationFrame(step);
    }
    box.addEventListener("wheel", function (e) {
      if (!isIdle() || e.ctrlKey) { return; }
      var dy = e.deltaY; if (e.deltaMode === 1) { dy *= 32; } else if (e.deltaMode === 2) { dy *= box.clientHeight; }
      if (!dy || inner(e.target, dy)) { return; }
      var max = Math.max(0, box.scrollHeight - box.clientHeight);
      if (!raf) { target = box.scrollTop; }
      target = Math.max(0, Math.min(max, target + dy));
      e.preventDefault();
      if (!raf) { raf = requestAnimationFrame(step); }
    }, { passive: false });
    box.addEventListener("scroll", function () { if (!raf) { target = box.scrollTop; } });   // keys / touch / drag keep the target in step
  }

  // ================= clock =================
  function tick() {
    dayCheck();
    alarmCheck();
    if (state === "running" && num0(get("tEnd")) - Date.now() <= 0) { finish(); return; }
    if (state === "running") { setText(el.readout, clock(leftMs())); }
    renderIdle();
  }
  // ONE interval, only while something needs it: a running timer or the idle screen (every second), or just armed alarms
  // (every 15 s is plenty: an alarm also fires up to 2 minutes late, so a throttled hidden panel never misses it)
  var tickMs = 0;
  function tickerCheck() {
    var want = (state === "running" || isIdle()) ? 1000 : (hasActiveAlarm() ? 15000 : 0);
    if (want === tickMs && !!ticker === !!want) { return; }
    if (ticker) { clearInterval(ticker); ticker = 0; }
    tickMs = want;
    if (want) { ticker = setInterval(tick, want); }
  }

  function init() {
    el.elapsed = $("idle-elapsed"); el.eh = $("ie-h"); el.em = $("ie-m"); el.es = $("ie-s");
    el.timerBox = $("idle-timer"); el.timerLabel = $("idle-timer-label"); el.timerTime = $("idle-timer-time"); el.timerFill = $("idle-timer-fill");
    el.timerGo = $("idle-timer-go"); el.timerRst = $("idle-timer-rst");
    if (el.timerGo) { el.timerGo.addEventListener("click", start); }
    if (el.timerRst) { el.timerRst.addEventListener("click", reset); }
    el.todos = $("idle-todos"); el.todoList = $("idle-todos-list"); el.todoCount = $("idle-todos-count"); el.todoAdd = $("idle-todo-add"); el.todoBar = $("idle-todos-bar");
    el.missed = $("idle-missed"); el.missedToggle = $("idle-missed-toggle"); el.missedLabel = $("idle-missed-label"); el.missedList = $("idle-missed-list");
    el.missedSummary = $("idle-missed-summary");
    el.sw = $("idle-sw"); el.swTime = $("sw-time"); el.swToggle = $("sw-toggle"); el.swReset = $("sw-reset"); el.swHide = $("sw-hide");
    el.alList = $("al-list"); el.alEmpty = $("al-empty"); el.alAdd = $("al-add"); el.alForm = $("al-form"); el.alTime = $("al-time"); el.alLabel = $("al-label");
    el.alDaily = $("al-daily"); el.alSave = $("al-save"); el.alCancel = $("al-cancel");
    el.noteList = $("note-list"); el.noteEmpty = $("note-empty"); el.noteAdd = $("note-add");
    el.paneNotes = $("tb-pane-notes"); el.paneTodo = $("tb-pane-todo");
    if (el.todoAdd) { el.todoAdd.innerHTML = ICON_PLUS; }
    el.h = $("idle-timer-h"); el.m = $("idle-timer-m"); el.start = $("idle-timer-start"); el.reset = $("idle-timer-reset");
    el.readout = $("idle-timer-readout"); el.voice = $("idle-timer-voice"); el.vol = $("idle-timer-volume"); el.note = $("idle-timer-sound-note");

    restoreFromFile();
    newDay();
    armMidnight();
    window.addEventListener("focus", dayCheck);
    window.addEventListener("beforeunload", function () { if (saveTimer) { flushFile(); } });
    state = get("tState") || "idle";
    if (state === "running" && num0(get("tEnd")) - Date.now() <= 0) { state = "done"; set("tState", "done"); }   // ran out while the panel was closed
    bindControls(); bindIdleCards(); bindTabs(); bindStopwatch(); bindAlarms(); bindNotes(); bindFold(); applyCards(); bindCardScale(); bindSmoothScroll();
    renderLists(); soundNote(); render(); tickerCheck();
    if (!dataFile || !dataFile.read()) { persist(); }   // first run of this version: write the backup file now

    // idle screen shown / hidden -> refresh content once, start/stop the 1-second tick
    try {
      new MutationObserver(function () { if (isIdle()) { renderLists(); renderElapsed(); renderTimerChip(); renderStopwatch(); fitAllNotes(); } else { openAlarmForm(false); } tickerCheck(); })
        .observe(document.body, { attributes: true, attributeFilter: ["class"] });
    } catch (e2) { }
    // "Reset everything" in Settings
    var rs = $("settings-reset");
    if (rs) {
      rs.addEventListener("click", function () {
        ["showElapsed", "tH", "tM", "tState", "tEnd", "tRemain", "tTotal", "tSound", "tVoice", "tVolume", "tSoundPath", "notes", "todoDay", "todoSaved", "missed",
         "swState", "swStart", "swAcc", "swHidden", "alarms", "noteList", "idleTab", "cardScale", "foldHidden", "showSw", "showAl", "showTabs"].forEach(del);
        draft = 0; missedOpen = false; todoKey = ""; missedKey = ""; alKey = ""; noteKey = null;
        if (dataFile) { clearTimeout(saveTimer); saveTimer = 0; dataFile.remove(); }
        var i; for (i = 1; i <= TODOS; i++) { del("todo" + i); del("todoDone" + i); }
        if (nodeApi) { nodeApi.clear(); } window.__mtIdleSoundBlob = "";
        state = "idle"; newDay();
        ["idle-show-elapsed", "idle-timer-sound", "idle-show-sw", "idle-show-al", "idle-show-tabs"].forEach(function (id) { if ($(id)) { $(id).checked = true; } });
        if (el.h) { el.h.value = 1; } if (el.m) { el.m.value = 0; } if (el.voice) { el.voice.value = "chime"; }
        if (el.vol) { el.vol.value = 80; el.vol.dispatchEvent(new Event("input")); }
        if ($("idle-notes")) { $("idle-notes").value = ""; }
        refreshTodoControls(); var j; for (j = 1; j <= TODOS; j++) { if ($("idle-todo-" + j)) { $("idle-todo-" + j).value = ""; } }
        setPane("notes"); renderStopwatch(); applyFold(false); applyCardScale(); applyCards();
        renderLists(); soundNote(); render(); tickerCheck();
      });
    }
  }
  if (document.readyState === "loading") { document.addEventListener("DOMContentLoaded", init); } else { init(); }
})();
