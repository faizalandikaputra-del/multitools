/* NeuCurve - nc-particles.js   (v7 - Flow-style ambient effects, ported from Flow's panel/css/style.css)
   Replaces the old canvas sprite loop (small white blobs falling only over the Library grid).
   Now: one fixed, click-through layer (#nc-fx) over the whole Curve tab holding pure-CSS animated dots, exactly like
   Flow's .flow-particles / .flow-snow / .flow-rain layers:
     particles : 26 soft dots that float up/down in place (alternate ease-in-out), box-shadow glow, pulse in opacity
     snow      : 18 six-arm crystals that fall and spin
     rain      : 28 streaks with a fading tail
   Positions, sizes, durations and delays are generated once from a fixed seed, so the field looks the same every start.
   The CSS lives in nc-flowfx.css. No JS per frame: animations run on the compositor and keep running while the pointer is away
   (exempt from nc-away.css, like Flow) and stop only when "reduce motion" is on.
   Settings (unchanged keys, localStorage prefix "neucurve_"):
     pEffect  "particles" (default) | "circles" | "snow" | "rain" | "off"
     pColor   "#rrggbb" (default #ffffff) - dot colour; glow / halo are derived from it like Flow's --curve-theme-*
     pAlpha   0-100 (default 100) - opacity of the whole layer
   Console helpers: __ncParticles.stop() / .start() */
(function () {
  "use strict";

  var DEF = { pEffect: "particles", pColor: "#ffffff", pAlpha: "100" };
  var COUNT = { particles: 26, snow: 18, rain: 28, circles: 22 };
  var layer = null, built = "", color = "", running = true;

  function readSetting(k) { try { var v = localStorage.getItem("neucurve_" + k); return v === null ? DEF[k] : v; } catch (e) { return DEF[k]; } }
  function hexToRgb(h) {
    var m = /^#?([0-9a-f]{6})$/i.exec(String(h || ""));
    if (!m) { return [255, 255, 255]; }
    var n = parseInt(m[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function rgba(c, a) { return "rgba(" + c[0] + "," + c[1] + "," + c[2] + "," + a + ")"; }

  // small seeded generator: same field every launch (Math.random would reshuffle on each reload)
  function rng(seed) { var s = seed >>> 0; return function () { s = (s + 0x6D2B79F5) >>> 0; var t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function pick(r, a, b) { return a + r() * (b - a); }
  function f(n, d) { return n.toFixed(d === undefined ? 1 : d); }

  function setVars(el, o) { for (var k in o) { if (o.hasOwnProperty(k)) { el.style.setProperty(k, o[k]); } } }

  // values follow the ranges of Flow's nth-child rules
  function makeParticle(i, n, r) {
    var s = document.createElement("span");
    setVars(s, {
      "--p-x": f(3 + (i + r() * 0.8) * (94 / n)) + "%",           // spread across the width, jittered
      "--p-y": f(pick(r, 6, 94)) + "%",
      "--p-size": Math.round(pick(r, 2, 5.4)) + "px",
      "--p-dur": f(pick(r, 5.5, 8.4)) + "s",
      "--p-delay": "-" + f(pick(r, 0.5, 6)) + "s",
      "--p-dx": Math.round(pick(r, 12, 25) * (r() < 0.5 ? -1 : 1)) + "px",
      "--p-dy": "-" + Math.round(pick(r, 22, 40)) + "px",
      "--p-alpha": f(pick(r, 0.58, 0.87), 2)
    });
    return s;
  }
  function makeSnow(i, n, r) {
    var s = document.createElement("span");
    setVars(s, {
      "--s-x": f(4 + (i + r() * 0.7) * (92 / n)) + "%",
      "--s-size": Math.round(pick(r, 6, 12)) + "px",
      "--s-dur": f(pick(r, 10, 17)) + "s",
      "--s-delay": "-" + f(pick(r, 0, 16)) + "s",
      "--s-drift": Math.round(pick(r, 18, 34) * (r() < 0.5 ? -1 : 1)) + "px",
      "--s-alpha": f(pick(r, 0.28, 0.52), 2)
    });
    return s;
  }
  function makeRain(i, n, r) {
    var s = document.createElement("span");
    setVars(s, {
      "--r-x": f(2 + (i + r() * 0.5) * (96 / n)) + "%",
      "--r-dur": f(pick(r, 0.76, 1.22), 2) + "s",
      "--r-delay": "-" + f(pick(r, 0, 1), 2) + "s",
      "--r-len": Math.round(pick(r, 7, 22)) + "px",
      "--r-width": f(pick(r, 0.45, 1.15), 2) + "px",
      "--r-alpha": f(pick(r, 0.3, 0.52), 2),
      "--r-drift": "-" + Math.round(pick(r, 6, 16)) + "px"
    });
    return s;
  }

  /* v8 "circles": plain flat circles (no glow) that rise slowly and fade in / out */
  function makeCircle(i, n, r) {
    var s = document.createElement("span");
    setVars(s, {
      "--c-x": f(3 + (i + r() * 0.8) * (94 / n)) + "%",
      "--c-size": Math.round(pick(r, 4, 14)) + "px",
      "--c-dur": f(pick(r, 9, 18)) + "s",
      "--c-delay": "-" + f(pick(r, 0, 18)) + "s",
      "--c-drift": Math.round(pick(r, 8, 26) * (r() < 0.5 ? -1 : 1)) + "px",
      "--c-alpha": f(pick(r, 0.22, 0.5), 2)
    });
    return s;
  }

  function build(effect) {
    var mk = effect === "snow" ? makeSnow : (effect === "rain" ? makeRain : (effect === "circles" ? makeCircle : makeParticle));
    var n = COUNT[effect], r = rng(effect === "snow" ? 7 : (effect === "rain" ? 13 : (effect === "circles" ? 41 : 29))), frag = document.createDocumentFragment();
    layer.textContent = "";
    for (var i = 0; i < n; i++) { frag.appendChild(mk(i, n, r)); }
    layer.appendChild(frag);
    built = effect;
  }

  function apply() {
    var e = readSetting("pEffect"); if (e !== "rain" && e !== "snow" && e !== "circles" && e !== "off") { e = "particles"; }
    var a = parseFloat(readSetting("pAlpha")); if (!isFinite(a)) { a = 100; }
    a = Math.max(0, Math.min(100, a)) / 100;
    var c = hexToRgb(readSetting("pColor")), key = c.join(",");
    if (!layer) { return; }
    var on = !(e === "off" || a <= 0 || !running);
    document.documentElement.classList.toggle("nc-fx-on", on);
    if (!on) { layer.style.display = "none"; layer.setAttribute("data-fx", "off"); return; }
    layer.style.display = "";
    layer.setAttribute("data-fx", e);
    layer.style.opacity = String(a);
    if (key !== color) {                        // Flow: --curve-theme-color / -glow (0.44) / -soft (0.22)
      color = key;
      layer.style.setProperty("--fx-color", rgba(c, 1));
      layer.style.setProperty("--fx-glow", rgba(c, 0.44));
      layer.style.setProperty("--fx-soft", rgba(c, 0.22));
    }
    if (built !== e) { build(e); }
  }

  function init() {
    layer = document.createElement("div");
    layer.id = "nc-fx";
    layer.setAttribute("aria-hidden", "true");
    document.body.appendChild(layer);
    apply();
    window.addEventListener("storage", function (e) { if (!e.key || /^neucurve_p(Effect|Color|Alpha)$/.test(e.key)) { apply(); } });
    try {
      if (window.CSInterface) {
        new window.CSInterface().addEventListener("com.neucurve.sync", function (ev) {
          try {
            var d = ev && ev.data; if (typeof d === "string") { d = JSON.parse(d); }
            if (d && /^p(Effect|Color|Alpha)$/.test(d.key)) { localStorage.setItem("neucurve_" + d.key, String(d.val)); apply(); }
          } catch (e) { }
        });
      }
    } catch (e) { }
    window.__ncParticles = { start: function () { running = true; apply(); }, stop: function () { running = false; apply(); }, apply: apply };
  }

  if (document.readyState === "loading") { document.addEventListener("DOMContentLoaded", init); } else { init(); }
})();
