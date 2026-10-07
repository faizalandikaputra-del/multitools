/**
 * Minimal CSInterface shim (same API surface used by this panel).
 * You can safely replace this file with Adobe's official CSInterface.js
 * from https://github.com/Adobe-CEP/CEP-Resources - nothing else changes.
 */
function CSInterface() {}

CSInterface.THEME_COLOR_CHANGED_EVENT = "com.adobe.csxs.events.ThemeColorChanged";

CSInterface.prototype.evalScript = function (script, callback) {
  if (callback === null || callback === undefined) { callback = function () {}; }
  window.__adobe_cep__.evalScript(script, callback);
};

CSInterface.prototype.getHostEnvironment = function () {
  return JSON.parse(window.__adobe_cep__.getHostEnvironment());
};

CSInterface.prototype.addEventListener = function (type, listener, obj) {
  window.__adobe_cep__.addEventListener(type, listener, obj);
};
