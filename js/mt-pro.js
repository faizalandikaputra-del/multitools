/* Multi Tool - mt-pro.js  (PANEL side)
   Four additions, all controlled from the Settings window (the real controls live in a hidden block inside #settings-modal,
   created below, so js/mt-settings-remote.js mirrors them to html/settings.html exactly like every other control):
     1. Density        compact / normal / roomy spacing  (html[data-mtp-density], tokens in css/mt-pro.css)
     2. Glass blur     slider that scales the Glass blur (a <style> that overrides --glass-blur-card / --sidebar-glass-blur)
     3. Toast          position + how long it stays (main.js toast() asks MTPro.toastMs())
     4. Settings profile  export / import every Multi Tool + NeuCurve setting as one .json file (host.jsx PROFILE_FILE_*)
   Storage keys: mtx.pro.*  (plain localStorage, mirrored to disk by js/mt-persist.js). ES5, Chromium-74 safe. */
(function () {
  "use strict";
  var root = document.documentElement;
  var K = { density: "mtx.pro.density", blur: "mtx.pro.blur", tpos: "mtx.pro.toastPos", tdur: "mtx.pro.toastMs" };
  var D = { density: "normal", blur: "50", tpos: "bottom", tdur: "2400" };
  var TOAST_POS = { "bottom": 1, "top": 1, "bottom-right": 1, "top-right": 1, "bottom-left": 1, "top-left": 1 };

  function $(id) { return document.getElementById(id); }
  function get(k, d) { try { var v = localStorage.getItem(k); return v === null ? d : v; } catch (e) { return d; } }
  function set(k, v) { try { localStorage.setItem(k, String(v)); } catch (e) { } }
  function del(k) { try { localStorage.removeItem(k); } catch (e) { } }
  function clamp(v, lo, hi, d) { v = parseFloat(v); if (!isFinite(v)) { v = d; } return Math.max(lo, Math.min(hi, v)); }
  function toast(msg, err) { try { if (window.__MT && window.__MT.toast) { window.__MT.toast(msg, !!err); } } catch (e) { } }

  /* ---------------- 1. density ---------------- */
  function density() { var v = get(K.density, D.density); return v === "compact" || v === "roomy" ? v : "normal"; }
  function applyDensity(v) {
    if (v === "compact" || v === "roomy") { root.setAttribute("data-mtp-density", v); } else { root.removeAttribute("data-mtp-density"); }
    try { window.dispatchEvent(new Event("resize")); } catch (e) { }          /* tab indicator + tooltips re-measure */
  }

  /* ---------------- 2. glass blur ---------------- */
  var dyn = document.createElement("style"); dyn.id = "mtp-dyn";
  (document.head || root).appendChild(dyn);
  function blurVal() { return Math.round(clamp(get(K.blur, D.blur), 0, 100, 50)); }
  function applyBlur(v) {
    v = Math.round(clamp(v, 0, 100, 50));
    if (v === 50) { dyn.textContent = ""; return; }
    var f = v / 50, card = Math.round(14 * f * 10) / 10, side = Math.round(20 * f * 10) / 10;
    dyn.textContent = ':root:not([data-ui-theme="material"]){--glass-blur-card:' + card + 'px !important;--sidebar-glass-blur:' + side + 'px !important}';
  }

  /* ---------------- 3. toast ---------------- */
  function toastPos() { var v = get(K.tpos, D.tpos); return TOAST_POS[v] ? v : D.tpos; }
  function toastMs() { return Math.round(clamp(get(K.tdur, D.tdur), 800, 15000, 2400)); }
  function applyToastPos(v) { if (v === "bottom") { root.removeAttribute("data-mtp-toast-pos"); } else { root.setAttribute("data-mtp-toast-pos", v); } }

  /* ---------------- 4. settings profile ---------------- */
  var KEEP = /^(mtx\.|neucurve_|curveEditorPresets$)/;
  var SKIP = /^mtx\.(bgImage|bgMotionGif|toolImg\.)/;
  function note(txt) { var n = $("mtp-profile-note"); if (n) { n.textContent = txt || ""; } }
  function evalHost(fn, arg, cb) {
    var cs, a;
    try { if (!window.__adobe_cep__) { throw new Error("no host"); } cs = new CSInterface(); } catch (e) { cb({ ok: false, message: "Preview mode - not inside After Effects." }); return; }
    a = arg === undefined ? "" : JSON.stringify(arg).replace(/[\u0080-\uffff]/g, function (ch) { return "\\u" + ("0000" + ch.charCodeAt(0).toString(16)).slice(-4); });
    try {
      cs.evalScript(fn + "(" + a + ")", function (res) {
        if (!res || res === "EvalScript error.") { cb({ ok: false, message: "Script error. Check host.jsx." }); return; }
        try { cb(JSON.parse(res)); } catch (e2) { cb({ ok: false, message: String(res) }); }
      });
    } catch (e3) { cb({ ok: false, message: "Could not reach After Effects." }); }
  }
  function collectProfile() {
    var out = {}, n = 0, skipped = 0, i, k, v;
    try {
      for (i = 0; i < localStorage.length; i++) {
        k = localStorage.key(i);
        if (!k || !KEEP.test(k)) { continue; }
        if (SKIP.test(k)) { skipped++; continue; }
        v = localStorage.getItem(k);
        if (v === null) { continue; }
        if (v.length > 150000) { skipped++; continue; }       /* images / GIFs stay out: the file stays small and readable */
        out[k] = v; n++;
      }
    } catch (e) { }
    return { json: JSON.stringify({ app: "MultiToolProfile", v: 1, saved: new Date().toISOString(), keys: out }), count: n, skipped: skipped };
  }
  function exportProfile(btn) {
    var p = collectProfile();
    if (btn) { btn.classList.add("is-pending"); }
    evalHost("PROFILE_FILE_export", p.json, function (res) {
      if (btn) { btn.classList.remove("is-pending"); }
      var msg = res.message || (res.ok ? "Profile saved." : "Something went wrong.");
      if (res.ok && res.data && res.data.saved) { msg += " " + p.count + " settings" + (p.skipped ? " (" + p.skipped + " large images left out)" : "") + "."; }
      note(msg); toast(msg, !res.ok);
    });
  }
  function importProfile(btn) {
    if (btn) { btn.classList.add("is-pending"); }
    evalHost("PROFILE_FILE_import", undefined, function (res) {
      if (btn) { btn.classList.remove("is-pending"); }
      if (!res.ok || !res.data || !res.data.json) { var m0 = res.message || (res.ok ? "Import canceled." : "Something went wrong."); note(m0); toast(m0, !res.ok); return; }
      var obj = null, n = 0, k;
      try { obj = JSON.parse(res.data.json); } catch (e) { obj = null; }
      if (!obj || obj.app !== "MultiToolProfile" || !obj.keys || typeof obj.keys !== "object") {
        note("That is not a Multi Tool profile. Nothing was changed."); toast("That is not a Multi Tool profile. Nothing was changed.", true); return;
      }
      for (k in obj.keys) {
        if (!Object.prototype.hasOwnProperty.call(obj.keys, k)) { continue; }
        if (!KEEP.test(k) || SKIP.test(k) || typeof obj.keys[k] !== "string" || obj.keys[k].length > 150000) { continue; }
        set(k, obj.keys[k]); n++;
      }
      var m = "Profile imported (" + n + " settings). Reloading the panel...";
      note(m); toast(m);
      setTimeout(function () { try { window.location.reload(); } catch (e3) { } }, 900);
    });
  }

  /* ---------------- hidden real controls (mirrored by mt-settings-remote.js) ---------------- */
  function buildControls() {
    var box = document.querySelector("#settings-modal .modal");
    if (!box || $("mtp-fields")) { return; }
    var d = document.createElement("div"); d.id = "mtp-fields"; d.className = "mtp-fields"; d.hidden = true;
    d.innerHTML =
      '<button type="button" role="radio" aria-checked="false" id="mtp-density-compact">Compact</button>' +
      '<button type="button" role="radio" aria-checked="false" id="mtp-density-normal">Normal</button>' +
      '<button type="button" role="radio" aria-checked="false" id="mtp-density-roomy">Roomy</button>' +
      '<input type="range" id="mtp-blur" min="0" max="100" step="1" value="50" aria-label="Glass blur strength">' +
      '<button type="button" id="mtp-blur-reset">Default blur</button>' +
      '<select id="mtp-toast-pos" aria-label="Toast position">' +
        '<option value="bottom">Bottom center</option><option value="top">Top center</option>' +
        '<option value="bottom-right">Bottom right</option><option value="top-right">Top right</option>' +
        '<option value="bottom-left">Bottom left</option><option value="top-left">Top left</option></select>' +
      '<select id="mtp-toast-dur" aria-label="Toast time">' +
        '<option value="1500">Short (1.5 s)</option><option value="2400">Normal (2.4 s)</option>' +
        '<option value="4000">Long (4 s)</option><option value="6000">Very long (6 s)</option></select>' +
      '<button type="button" id="mtp-toast-test">Show a test toast</button>' +
      '<button type="button" id="mtp-profile-export">Export profile</button>' +
      '<button type="button" id="mtp-profile-import">Import profile</button>' +
      '<p id="mtp-profile-note"></p>';
    box.appendChild(d);
  }
  function syncControls() {
    var dv = density(), ids = { compact: "mtp-density-compact", normal: "mtp-density-normal", roomy: "mtp-density-roomy" }, k, el;
    for (k in ids) { if (ids.hasOwnProperty(k) && (el = $(ids[k]))) { el.setAttribute("aria-checked", k === dv ? "true" : "false"); } }
    if ((el = $("mtp-blur"))) { el.value = String(blurVal()); }
    if ((el = $("mtp-toast-pos"))) { el.value = toastPos(); }
    if ((el = $("mtp-toast-dur"))) {
      var ms = String(toastMs()); el.value = ms;
      if (el.value !== ms) { el.value = "2400"; }
    }
  }
  function bind() {
    function on(id, ev, fn) { var el = $(id); if (el) { el.addEventListener(ev, fn); } }
    ["compact", "normal", "roomy"].forEach(function (name) {
      on("mtp-density-" + name, "click", function () {
        if (name === "normal") { del(K.density); } else { set(K.density, name); }
        applyDensity(name); syncControls();
      });
    });
    on("mtp-blur", "input", function (e) { applyBlur(e.target.value); });
    on("mtp-blur", "change", function (e) { var v = Math.round(clamp(e.target.value, 0, 100, 50)); if (v === 50) { del(K.blur); } else { set(K.blur, v); } applyBlur(v); });
    on("mtp-blur-reset", "click", function () { del(K.blur); applyBlur(50); syncControls(); });
    on("mtp-toast-pos", "change", function (e) { var v = TOAST_POS[e.target.value] ? e.target.value : "bottom"; if (v === "bottom") { del(K.tpos); } else { set(K.tpos, v); } applyToastPos(v); toast("Toasts will appear here."); });
    on("mtp-toast-dur", "change", function (e) { var v = String(Math.round(clamp(e.target.value, 800, 15000, 2400))); if (v === "2400") { del(K.tdur); } else { set(K.tdur, v); } toast("Toasts stay this long."); });
    on("mtp-toast-test", "click", function () { toast("This is how a toast looks."); });
    on("mtp-profile-export", "click", function (e) { exportProfile(e.currentTarget); });
    on("mtp-profile-import", "click", function (e) { importProfile(e.currentTarget); });
  }

  function reset() {
    [K.density, K.blur, K.tpos, K.tdur, "mtx.pro.favBar", "mtx.pro.fav"].forEach(del);   // the two old favorite keys are still wiped
    applyDensity("normal"); applyBlur(50); applyToastPos("bottom");
    syncControls();
  }

  /* first paint: apply stored values right away (this script loads before main.js) */
  applyDensity(density()); applyBlur(blurVal()); applyToastPos(toastPos());
  function init() { buildControls(); syncControls(); bind(); }
  if (document.readyState === "loading") { document.addEventListener("DOMContentLoaded", init); } else { init(); }

  window.MTPro = { toastMs: toastMs, reset: reset };
})();
