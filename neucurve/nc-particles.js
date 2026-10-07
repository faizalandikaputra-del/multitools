/* NeuCurve - falling circle particles over the lower part of the panel (tool row + APPLY row + Library).
   Small soft circles spawn at the top of that area, drift down, and fade out before/at the bottom.
   One full-viewport <canvas> (pointer-events: none, so it never blocks a click/drag) is clipped to the area each
   frame. The area is measured from the DOM every frame batch, so it follows panel resizing, the section divider
   drag, and landscape / portrait switches:
     - .variable-section  (Library / presets)
   .action-container (tool row + APPLY row) is deliberately NOT a zone: particles used to drift across the APPLY
   button and the toolbar icons, sitting on top of their text/glyphs and the APPLY button's own spinning glow ring
   (the two soft white blobs on APPLY in the bug report) - harmless to clicks (pointer-events: none throughout)
   but it read as broken. Keeping particles only over the Library grid avoids that while leaving the sparkle look
   where there's no small text/controls to cover.
   Tune with the CONFIG block. To switch it off: delete the <script src="./nc-particles.js"> line in index.html.
   Console helpers: __ncParticles.stop() / .start()

   v3 - denser + smoother Particles: ~2.7x more (density 1/2600, max 160), smoothstep fade in/out, time-based sway,
   softer sprite falloff, high-quality image smoothing, shorter re-entry pause. Rain look is unchanged.

   v2 - configurable from NeuCurve Settings > Falling Effect (UI built by nc-extras.js). localStorage keys:
     neucurve_pEffect  "particles" (default) | "rain" | "off"
     neucurve_pColor   "#rrggbb" (default #ffffff)
     neucurve_pAlpha   0-100 (default 100) - overall opacity of the effect
   Changes are picked up from the "storage" event, the com.neucurve.sync event and a cheap re-check ~7x per second. */
(function () {
  "use strict";

  var CONFIG = {
    areas: [".variable-section"],
    density: 1 / 2600,        // particles per px^2 of area (v3: was 1/7000 - ~2.7x denser)
    max: 160,                 // cap per area (v3: was 70)
    min: 22,                  // (v3: was 8)
    radius: [1.0, 3.2],       // px, core radius (slightly finer so the denser field stays airy)
    speed: [14, 40],          // px per second, falling (v3: a touch slower = smoother to the eye)
    sway: 9,                  // px, sideways drift amplitude
    alpha: [0.25, 0.70],      // peak opacity
    fadeIn: 0.18,             // fraction of the fall used to fade in (v3: longer = no pop-in)
    fadeOutFrom: 0.45,        // fraction of the fall where fading out starts
    travel: [0.55, 1.0],      // how far (fraction of area height) a particle falls before it is gone
    color: "255,255,255",     // r,g,b (overridden by Settings > Falling Effect)
    rain: {
      density: 1 / 3800, max: 120, min: 14,
      len: [7, 15],           // px, streak length
      speed: [190, 330],      // px per second (slower, calmer rain)
      slant: 0.16,            // sideways px per falling px
      alpha: [0.40, 0.85],
      width: 1.3
    }
  };

  var DEF = { pEffect: "particles", pColor: "#ffffff", pAlpha: "100" };
  var effect = "particles", opacity = 1, spriteKey = "";

  function readSetting(k) { try { var v = localStorage.getItem("neucurve_" + k); return v === null ? DEF[k] : v; } catch (e) { return DEF[k]; } }
  function hexToRgb(h) {
    var m = /^#?([0-9a-f]{6})$/i.exec(String(h || ""));
    if (!m) { return "255,255,255"; }
    var n = parseInt(m[1], 16);
    return ((n >> 16) & 255) + "," + ((n >> 8) & 255) + "," + (n & 255);
  }
  // returns true when something changed
  function loadSettings() {
    var e = readSetting("pEffect"); if (e !== "rain" && e !== "off") { e = "particles"; }
    var a = parseFloat(readSetting("pAlpha")); if (!isFinite(a)) { a = 100; }
    a = Math.max(0, Math.min(100, a)) / 100;
    var rgb = hexToRgb(readSetting("pColor"));
    var changed = e !== effect || a !== opacity || rgb !== CONFIG.color;
    if (e !== effect) { sets = []; }              // different effect = different particles
    effect = e; opacity = a;
    if (rgb !== CONFIG.color) { CONFIG.color = rgb; }
    return changed;
  }

  var canvas, ctx, sprite, dpr = 1, vw = 0, vh = 0;
  var zones = [], sets = [], last = 0, tick = 0, raf = 0, running = false;

  function rnd(a, b) { return a + Math.random() * (b - a); }
  function ease(t) { t = t < 0 ? 0 : (t > 1 ? 1 : t); return t * t * (3 - 2 * t); }   // smoothstep: soft in/out, no linear 'pop'

  function makeSprite() {
    var s = document.createElement("canvas"), n = 64, c = s.getContext("2d");
    s.width = s.height = n;
    var g = c.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2);
    g.addColorStop(0, "rgba(" + CONFIG.color + ",1)");
    g.addColorStop(0.22, "rgba(" + CONFIG.color + ",0.92)");
    g.addColorStop(0.40, "rgba(" + CONFIG.color + ",0.45)");
    g.addColorStop(0.65, "rgba(" + CONFIG.color + ",0.12)");
    g.addColorStop(1, "rgba(" + CONFIG.color + ",0)");
    c.fillStyle = g; c.fillRect(0, 0, n, n);
    return s;
  }

  function rectOf(sel) {
    var el = document.querySelector(sel);
    if (!el) { return null; }
    var r = el.getBoundingClientRect();
    if (r.width < 30 || r.height < 30) { return null; }
    return { l: r.left, t: r.top, r: r.right, b: r.bottom };
  }

  function computeZones() {
    var a = rectOf(CONFIG.areas[0]), b = rectOf(CONFIG.areas[1]), z = [];
    if (a && b && Math.abs(b.t - a.b) < 24 && Math.min(a.r, b.r) - Math.max(a.l, b.l) > 30) {
      z.push({ l: Math.min(a.l, b.l), t: Math.min(a.t, b.t), r: Math.max(a.r, b.r), b: Math.max(a.b, b.b) });
    } else {
      if (a) { z.push(a); }
      if (b) { z.push(b); }
    }
    return z;
  }

  function resetRain(p, z, initial) {
    var R = CONFIG.rain, h = z.b - z.t;
    p.len = rnd(R.len[0], R.len[1]);
    p.x = Math.random();
    p.travel = Math.max(40, h * rnd(0.6, 1.0));
    p.vy = rnd(R.speed[0], R.speed[1]) * (0.8 + p.len / 40);
    p.a = rnd(R.alpha[0], R.alpha[1]);
    p.y = initial ? Math.random() * p.travel : -p.len;
    p.wait = initial ? 0 : Math.random() * 0.9;
  }

  function reset(p, z, initial) {
    if (effect === "rain") { return resetRain(p, z, initial); }
    var h = z.b - z.t;
    p.rad = rnd(CONFIG.radius[0], CONFIG.radius[1]);
    p.x = Math.random();                              // 0..1 across the area width
    p.travel = Math.max(40, h * rnd(CONFIG.travel[0], CONFIG.travel[1]));
    p.vy = rnd(CONFIG.speed[0], CONFIG.speed[1]) * (0.7 + p.rad / 6);   // bigger = a little faster (depth feel)
    p.a = rnd(CONFIG.alpha[0], CONFIG.alpha[1]);
    p.ph = Math.random() * 6.283; p.sf = rnd(0.5, 1.3);
    p.y = initial ? Math.random() * p.travel : -p.rad;
    p.wait = initial ? 0 : Math.random() * 0.6;       // short pause before it re-enters at the top (v3: was up to 1.8s)
  }

  function syncSets() {
    var i, n, set;
    for (i = 0; i < zones.length; i++) {
      var z = zones[i], area = (z.r - z.l) * (z.b - z.t);
      var cfg = effect === "rain" ? CONFIG.rain : CONFIG;
      n = Math.max(cfg.min, Math.min(cfg.max, Math.round(area * cfg.density)));
      set = sets[i] || (sets[i] = []);
      while (set.length < n) { var p = {}; reset(p, z, true); set.push(p); }
      if (set.length > n) { set.length = n; }
    }
    sets.length = zones.length;
  }

  function resize() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    vw = window.innerWidth; vh = window.innerHeight;
    canvas.width = Math.round(vw * dpr); canvas.height = Math.round(vh * dpr);
    canvas.style.width = vw + "px"; canvas.style.height = vh + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function frame(now) {
    if (!running) { return; }
    if (window.__ncAway && window.__ncAway()) { raf = 0; return; }   // paused while the pointer is away (nc-away.js)
    raf = requestAnimationFrame(frame);
    var dt = Math.min(0.034, (now - last) / 1000 || 0.016);   // v3: tighter clamp = no big position jumps after a hitch
    last = now;
    if (tick++ % 8 === 0) {                                          // re-measure ~7x per second
      if (loadSettings() || spriteKey !== CONFIG.color) { sprite = makeSprite(); spriteKey = CONFIG.color; }
      zones = computeZones(); syncSets();
    }
    ctx.clearRect(0, 0, vw, vh);
    if (effect === "off" || opacity <= 0) { return; }
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = "high";
    var rain = effect === "rain";
    if (rain) { ctx.strokeStyle = "rgb(" + CONFIG.color + ")"; ctx.lineWidth = CONFIG.rain.width; ctx.lineCap = "round"; }
    for (var i = 0; i < zones.length; i++) {
      var z = zones[i], set = sets[i], w = z.r - z.l;
      ctx.save();
      ctx.beginPath(); ctx.rect(z.l, z.t, w, z.b - z.t); ctx.clip();
      for (var k = 0; k < set.length; k++) {
        var p = set[k];
        if (p.wait > 0) { p.wait -= dt; continue; }
        p.y += p.vy * dt;
        var f = p.y / p.travel;
        if (f >= 1) { reset(p, z, false); continue; }
        var a = p.a * opacity;
        if (rain) {
          if (f < 0.06) { a *= Math.max(0, f) / 0.06; }
          if (f > 0.8) { a *= 1 - (f - 0.8) / 0.2; }
          if (a <= 0.01) { continue; }
          var rx = z.l + p.x * w + p.y * CONFIG.rain.slant, ry = z.t + p.y;
          ctx.globalAlpha = a;
          ctx.beginPath(); ctx.moveTo(rx, ry); ctx.lineTo(rx + p.len * CONFIG.rain.slant, ry + p.len); ctx.stroke();
          continue;
        }
        a *= ease(f / CONFIG.fadeIn) * ease((1 - f) / (1 - CONFIG.fadeOutFrom));
        if (a <= 0.01) { continue; }
        var px = z.l + p.x * w + Math.sin(p.ph + now * 0.00055 * p.sf) * CONFIG.sway;
        var py = z.t + p.y, d = p.rad * 4.2;
        ctx.globalAlpha = a;
        ctx.drawImage(sprite, px - d / 2, py - d / 2, d, d);
      }
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  function start() {
    if (running) { return; }
    running = true; last = performance.now(); raf = requestAnimationFrame(frame);
  }
  function stop() {
    running = false; if (raf) { cancelAnimationFrame(raf); raf = 0; }
    if (ctx) { ctx.clearRect(0, 0, vw, vh); }
  }

  function init() {
    canvas = document.createElement("canvas");
    canvas.setAttribute("aria-hidden", "true");
    canvas.style.cssText = "position:fixed;left:0;top:0;pointer-events:none;z-index:50;background:transparent;";
    document.body.appendChild(canvas);
    ctx = canvas.getContext("2d");
    loadSettings(); sprite = makeSprite(); spriteKey = CONFIG.color;
    resize();
    window.addEventListener("resize", resize);
    window.addEventListener("storage", function (e) { if (!e.key || /^neucurve_p(Effect|Color|Alpha)$/.test(e.key)) { tick = 0; } });
    try {
      if (window.CSInterface) {
        new window.CSInterface().addEventListener("com.neucurve.sync", function (ev) {
          try {
            var d = ev && ev.data; if (typeof d === "string") { d = JSON.parse(d); }
            if (d && /^p(Effect|Color|Alpha)$/.test(d.key)) { localStorage.setItem("neucurve_" + d.key, String(d.val)); tick = 0; }
          } catch (e) { }
        });
      }
    } catch (e) { }
    document.addEventListener("visibilitychange", function () { if (document.hidden) { stop(); } else { start(); } });
    window.addEventListener("nc-away", function () { if (running && !raf && !(window.__ncAway && window.__ncAway())) { last = performance.now(); raf = requestAnimationFrame(frame); } });
    window.__ncParticles = { start: start, stop: stop, config: CONFIG };
    start();
  }

  if (document.readyState === "loading") { document.addEventListener("DOMContentLoaded", init); } else { init(); }
})();
