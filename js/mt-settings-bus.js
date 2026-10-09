/* Multi Tool - mt-settings-bus.js
   Tiny message bus between the panel and the separate Settings window (html/settings.html).
   Inside After Effects it uses CEP application-scope events ("com.multitool.settings.<type>").
   Outside CEP (plain browser, for debugging) it falls back to a BroadcastChannel. ES5. */
(function (w) {
  "use strict";
  var cep = w.__adobe_cep__ || null;
  var host = "", extId = "", bc = null, PREFIX = "com.multitool.settings.";
  if (cep) {
    try { host = JSON.parse(cep.getHostEnvironment()).appName; } catch (e1) { }
    try { extId = cep.getExtensionId(); } catch (e2) { }
  } else if (w.BroadcastChannel) {
    try { bc = new w.BroadcastChannel("mt-settings"); } catch (e3) { bc = null; }
  }
  function parse(s) { try { return JSON.parse(s || "{}"); } catch (e) { return {}; } }
  w.MTSettingsBus = {
    inCep: !!cep,
    send: function (type, obj) {
      var json = JSON.stringify(obj || {});
      if (cep && cep.dispatchEvent) {
        try { cep.dispatchEvent({ type: PREFIX + type, scope: "APPLICATION", appId: host, extensionId: extId, data: json }); } catch (e) { }
      } else if (bc) { bc.postMessage({ t: type, d: json }); }
    },
    on: function (type, fn) {
      if (cep && cep.addEventListener) {
        cep.addEventListener(PREFIX + type, function (ev) { fn(parse(ev && ev.data)); });
      } else if (bc) {
        bc.addEventListener("message", function (m) { if (m.data && m.data.t === type) { fn(parse(m.data.d)); } });
      }
    },
    openWindow: function () {
      try { if (cep) { cep.requestOpenExtension("com.ogatt.multitool.settings", ""); } } catch (e) { }
    },
    closeWindow: function () {
      try { if (cep) { cep.closeExtension(); } else { w.close(); } } catch (e) { }
    }
  };
})(window);
