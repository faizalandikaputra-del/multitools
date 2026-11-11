/**
 * mt-cursor-diag.js - TEMPORARY test tool to find what makes the mouse cursor change shape (hand <-> arrow).
 * A small "Cursor test" button sits in the bottom-left corner. Each switch turns ONE suspect off live (no reload).
 * Move the mouse over the tabs after each switch: when the cursor stops changing, that switch is the cause.
 * Nothing is saved; reloading the panel resets every switch. Delete this file + its <script> tag to remove it. ES5 on purpose (old CEF).
 */
(function () {
  "use strict";
  var root = document.documentElement;

  var CSS = {
    filter: "*,*::before,*::after{-webkit-backdrop-filter:none!important;backdrop-filter:none!important;-webkit-filter:none!important;filter:none!important}",
    motion: "*,*::before,*::after{animation:none!important;transition:none!important}",
    will: "*,*::before,*::after{will-change:auto!important}",
    bg: ".ambient-orbs,#bg-layer,#bg-motion-layer{display:none!important}",
    island: ".mt-island{display:none!important}",
    curve: ".curve-pane,#curve-frame{display:none!important}",
    zoom: ".app{zoom:1!important}",
    expand: ".sidebar .tab-label{display:none!important}.sidebar,.sidebar.is-expanded{width:var(--sidebar-w)!important;margin-right:0!important;margin-left:0!important}",
    hover: ".tab:hover,.tool:hover,.btn:hover,.icon-btn:hover{transform:none!important;box-shadow:none!important}"
  };
  var LABEL = {
    filter: "Blur / filter effects off",
    motion: "All animations + transitions off",
    will: "will-change off",
    bg: "Background + orbs hidden",
    island: "Dynamic Island hidden",
    curve: "Curve (NeuCurve) pane hidden",
    zoom: "UI scale zoom off",
    expand: "Sidebar stays narrow (no names)",
    hover: "Hover lift / glow off",
    host: "Stop all calls to After Effects"
  };
  var ORDER = ["host", "filter", "motion", "bg", "island", "curve", "zoom", "expand", "hover", "will"];
  var styleEls = {}, on = {};

  /* "host": drop every evalScript / key-interest call while the switch is on */
  var cep = window.__adobe_cep__, origEval = null, origKeys = null;
  function hostOff(v) {
    if (!cep) { return; }
    if (v) {
      if (!origEval) { origEval = cep.evalScript; origKeys = cep.registerKeyEventsInterest; }
      cep.evalScript = function () { };
      cep.registerKeyEventsInterest = function () { };
    } else if (origEval) {
      cep.evalScript = origEval; cep.registerKeyEventsInterest = origKeys;
    }
  }

  function set(key, v) {
    on[key] = v;
    if (key === "host") { hostOff(v); return; }
    var el = styleEls[key];
    if (v) {
      if (!el) { el = document.createElement("style"); el.textContent = CSS[key]; styleEls[key] = el; }
      document.head.appendChild(el);
    } else if (el && el.parentNode) { el.parentNode.removeChild(el); }
  }

  function build() {
    var wrap = document.createElement("div");
    wrap.id = "mt-cdiag";
    wrap.style.cssText = "position:fixed;left:6px;bottom:6px;z-index:2147483600;font:11px/1.3 Segoe UI,system-ui,sans-serif;color:#fff;";
    var btn = document.createElement("button");
    btn.type = "button"; btn.textContent = "Cursor test";
    btn.style.cssText = "all:unset;box-sizing:border-box;cursor:pointer;padding:5px 9px;border-radius:8px;background:#000c;border:1px solid #fff4;font:600 11px Segoe UI,system-ui,sans-serif;color:#fff;";
    var box = document.createElement("div");
    box.style.cssText = "display:none;margin-bottom:6px;padding:8px 10px;border-radius:10px;background:#000e;border:1px solid #fff3;min-width:200px;";
    var head = document.createElement("div");
    head.textContent = "Turn ONE on, then move the mouse over the tabs.";
    head.style.cssText = "margin-bottom:6px;color:#ddd;max-width:210px;";
    box.appendChild(head);
    ORDER.forEach(function (k) {
      var row = document.createElement("label");
      row.style.cssText = "display:flex;align-items:center;gap:7px;padding:3px 0;cursor:pointer;";
      var cb = document.createElement("input");
      cb.type = "checkbox"; cb.style.cssText = "cursor:pointer;margin:0;";
      cb.addEventListener("change", function () { set(k, cb.checked); });
      var t = document.createElement("span"); t.textContent = LABEL[k];
      row.appendChild(cb); row.appendChild(t); box.appendChild(row);
    });
    var off = document.createElement("button");
    off.type = "button"; off.textContent = "All off";
    off.style.cssText = "all:unset;cursor:pointer;margin-top:6px;padding:3px 8px;border-radius:6px;border:1px solid #fff4;";
    off.addEventListener("click", function () {
      ORDER.forEach(function (k) { set(k, false); });
      var cbs = box.querySelectorAll("input"), i; for (i = 0; i < cbs.length; i++) { cbs[i].checked = false; }
    });
    box.appendChild(off);
    btn.addEventListener("click", function () { box.style.display = box.style.display === "none" ? "block" : "none"; });
    wrap.appendChild(box); wrap.appendChild(btn);
    document.body.appendChild(wrap);
  }

  if (document.readyState === "loading") { document.addEventListener("DOMContentLoaded", build); } else { build(); }
})();
