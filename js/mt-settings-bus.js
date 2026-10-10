/* Multi Tool - mt-settings-bus.js
   Message bus between the panel and the separate Settings window (html/settings.html).
   Two channels carry every message at the same time, so one failing cannot freeze the settings:
     1. CEP application-scope events ("com.multitool.settings.<type>")
     2. localStorage mailbox ("mtbus.<type>") + the "storage" event + a 250 ms poll
        (both windows load from file:// so they share the same localStorage - the Curve theme sync already relies on this)
   Every message has a sender id + counter; the receiver drops a message it already handled, so it is delivered once.
   Outside CEP (plain browser, for debugging) a BroadcastChannel is used as well. ES5. */
(function (w) {
  "use strict";
  var cep = w.__adobe_cep__ || null;
  var host = "", extId = "", bc = null, PREFIX = "com.multitool.settings.", LS = "mtbus.";
  var uid = Math.random().toString(36).slice(2, 8), seq = 0;
  var handlers = {}, last = {}, started = 0, pollTimer = 0, lastRaw = {};   // lastRaw: mailbox text seen at the last read, so the 250 ms poll parses only when it changed
  var BASELINE = { act: 1, hello: 1, bgreq: 1 };          // never replay old requests left over from an earlier session
  var KEEP_ONE = { state: 1, bgsrc: 1, bgview: 1 };       // big / "latest wins" messages
  if (cep) {
    try { host = JSON.parse(cep.getHostEnvironment()).appName; } catch (e1) { }
    try { extId = cep.getExtensionId(); } catch (e2) { }
  }
  if (w.BroadcastChannel) { try { bc = new w.BroadcastChannel("mt-settings"); } catch (e3) { bc = null; } }

  function parse(s) { if (s && typeof s === "object") { return s; } try { return JSON.parse(s || "{}"); } catch (e) { return {}; } }

  function deliver(type, env) {
    if (!env || env.o === uid || typeof env.i !== "number") { return; }
    var key = type + "|" + env.o;
    if (last[key] !== undefined && env.i <= last[key]) { return; }
    last[key] = env.i;
    var list = handlers[type] || [], i;
    for (i = 0; i < list.length; i++) { try { list[i](env.d || {}); } catch (e) { } }
  }

  function readLs(type, first) {
    var raw; try { raw = w.localStorage.getItem(LS + type); } catch (e) { return; }
    if (!raw) { return; }
    if (!first && lastRaw[type] === raw) { return; }          // same text as last time: nothing new (a bgsrc can be 400 KB)
    lastRaw[type] = raw;
    var arr; try { arr = JSON.parse(raw); } catch (e2) { return; }
    if (!arr || !arr.length) { return; }
    var i, env;
    if (first) {
      if (BASELINE[type]) {                                       // remember what is already there, deliver nothing
        for (i = 0; i < arr.length; i++) { env = arr[i]; if (env && env.o !== uid) { var k = type + "|" + env.o; if (last[k] === undefined || env.i > last[k]) { last[k] = env.i; } } }
        return;
      }
      env = arr[arr.length - 1];                                  // state-like: only the newest one, and only if it is fresh
      if (env && Date.now() - (env.t || 0) < 15000) { deliver(type, env); }
      return;
    }
    for (i = 0; i < arr.length; i++) { deliver(type, arr[i]); }
  }

  function writeLs(type, env) {
    var arr = [], raw, max = KEEP_ONE[type] ? 1 : 20;
    if (max > 1) {
      try { raw = w.localStorage.getItem(LS + type); if (raw) { arr = JSON.parse(raw) || []; } } catch (e) { arr = []; }
    }
    arr.push(env); if (arr.length > max) { arr = arr.slice(arr.length - max); }
    try { w.localStorage.setItem(LS + type, JSON.stringify(arr)); } catch (e2) { }
  }

  function poll() { var t; for (t in handlers) { if (handlers.hasOwnProperty(t)) { readLs(t, false); } } }
  function start() {
    if (started) { return; } started = 1;
    pollTimer = setInterval(poll, 250);
    w.addEventListener("storage", function (e) {
      if (!e.key || e.key.indexOf(LS) !== 0) { return; }
      var t = e.key.slice(LS.length); if (handlers[t]) { readLs(t, false); }
    });
  }

  w.MTSettingsBus = {
    inCep: !!cep,
    send: function (type, obj) {
      var env = { o: uid, i: ++seq, t: Date.now(), d: obj || {} }, json = JSON.stringify(env);
      if (cep && cep.dispatchEvent) {
        try { cep.dispatchEvent({ type: PREFIX + type, scope: "APPLICATION", appId: host, extensionId: extId, data: json }); } catch (e) { }
      }
      if (bc) { try { bc.postMessage({ t: type, d: json }); } catch (e1) { } }
      if (type !== "bgsrc" || json.length < 400000) { writeLs(type, env); }
    },
    on: function (type, fn) {
      var first = !handlers[type];
      (handlers[type] = handlers[type] || []).push(fn);
      if (first) {
        if (cep && cep.addEventListener) {
          cep.addEventListener(PREFIX + type, function (ev) { deliver(type, parse(ev && ev.data)); });
        }
        if (bc) { bc.addEventListener("message", function (m) { if (m.data && m.data.t === type) { deliver(type, parse(m.data.d)); } }); }
        readLs(type, true);
      }
      start();
    },
    openWindow: function () {
      try { if (cep) { cep.requestOpenExtension("com.ogatt.multitool.settings", ""); } } catch (e) { }
    },
    closeWindow: function () {
      try { if (cep) { cep.closeExtension(); } else { w.close(); } } catch (e) { }
    }
  };
})(window);
