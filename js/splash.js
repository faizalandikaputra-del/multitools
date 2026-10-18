/**
 * splash.js - opening splash + boot progress (css/splash.css, css/mt-boot.css).
 * The splash used to leave on a fixed timer. Now it stays until the panel has really finished loading (stages below, reported by
 * js/main.js through window.MTBoot), then leaves. Click / key press skips it at once. Hard cap: HARD_CAP ms, so it can never trap the panel.
 * Stages (weight): ui .08, bridge .12 (first call to After Effects), tabs .25 (every tab built once), curve .55 (NeuCurve frame + mode warm-up).
 * MTBoot.paint(el, 0..1, label) also drives the loader inside the Curve pane. ES5 on purpose (old CEF).
 */
(function () {
  "use strict";
  var s = document.getElementById("mt-splash");
  var MIN_SHOW = 1500, HARD_CAP = 14000;
  var W = { ui: 0.08, bridge: 0.12, tabs: 0.25, curve: 0.55 };
  var st = { ui: 0, bridge: 0, tabs: 0, curve: 0 };
  var fin = { ui: false, bridge: false, tabs: false, curve: false };
  var t0 = 0, loadedAt = Date.now(), shown = 0, target = 0, label = "Starting panel";
  var gone = false, leaving = false, skipped = false, timer = 0, skipCbs = [];
  var loader = document.getElementById("mts-load");
  var raf = window.requestAnimationFrame || function (cb) { return setTimeout(cb, 16); };

  function clamp(p) { return p < 0 ? 0 : (p > 1 ? 1 : p); }
  function cache(el) {
    if (el._mtl) { return el._mtl; }
    var fill = el.querySelector(".mtl-fill"), len = 163.4;
    try { len = 2 * Math.PI * parseFloat(fill.getAttribute("r")); } catch (e) { }
    fill.style.strokeDasharray = len; fill.style.strokeDashoffset = len;
    el._mtl = { fill: fill, orbit: el.querySelector(".mtl-orbit"), len: len, lbl: el.querySelector(".mtl-lbl"), pct: el.querySelector(".mtl-pct") };
    return el._mtl;
  }
  // Paints one ring: the accent arc grows clockwise from 12 o'clock, the dot rides its tip, the centre shows the percent.
  function paint(el, p, text) {
    if (!el) { return; }
    var c = cache(el);
    p = clamp(p);
    c.fill.style.strokeDashoffset = c.len * (1 - p);
    if (c.orbit) { c.orbit.setAttribute("transform", "rotate(" + (p * 360).toFixed(2) + " 32 32)"); }
    if (text !== undefined && text !== null && c.lbl && c.lbl.textContent !== text) { c.lbl.textContent = text; }
    if (c.pct) { c.pct.textContent = Math.round(p * 100) + "%"; }
    if (p >= 0.999) { if (el.className.indexOf("is-full") < 0) { el.className += " is-full"; } }
    else if (el.className.indexOf("is-full") >= 0) { el.className = el.className.replace(/\s*is-full/g, ""); }
    el.setAttribute("aria-valuenow", String(Math.round(p * 100)));
  }
  function overall() { var k, t = 0; for (k in W) { if (W.hasOwnProperty(k)) { t += W[k] * (fin[k] ? 1 : clamp(st[k])); } } return t; }
  function allDone() { var k; for (k in fin) { if (fin.hasOwnProperty(k) && !fin[k]) { return false; } } return true; }

  function done() {
    if (gone) { return; }
    gone = true; clearInterval(timer); clearTimeout(timer);
    if (s) { s.className += " is-done"; if (s.parentNode) { s.parentNode.removeChild(s); } }
  }
  function leave() {
    if (gone || leaving) { return; }
    leaving = true;
    if (!s) { done(); return; }
    s.className += " is-leaving";
    setTimeout(done, 700);                       // if animationend never fires
  }
  function skip() {
    if (gone || skipped) { return; }
    skipped = true;
    var i; for (i = 0; i < skipCbs.length; i++) { try { skipCbs[i](); } catch (e) { } }
    s.style.transition = "opacity 0.2s ease";
    s.style.animation = "none";
    s.style.opacity = "0";
    clearInterval(timer); timer = setTimeout(done, 220);
  }
  function tick() {
    if (gone || skipped) { return; }
    if (!t0) { t0 = Date.now(); }                // clock starts at the first painted frame: a panel that opens hidden (docked behind another tab) only counts once it is seen
    target = overall();
    var d = target - shown;
    if (d > 0) { shown += Math.max(d * 0.14, 0.004); if (shown > target) { shown = target; } }
    paint(loader, shown, label);
    if (allDone() && shown >= 0.999 && Date.now() - t0 >= MIN_SHOW) { leave(); return; }
    if (Date.now() - t0 >= HARD_CAP) { leave(); return; }
    raf(tick);
  }

  window.MTBoot = {
    paint: paint,
    // true while the splash is actually on screen (it is hidden by CSS when Reduce motion is on)
    visible: function () { try { return !!s && !gone && window.getComputedStyle(s).display !== "none"; } catch (e) { return !!s && !gone; } },
    skipped: function () { return skipped; },
    onSkip: function (cb) { skipCbs.push(cb); },
    set: function (name, f, text) { if (!W.hasOwnProperty(name)) { return; } if (f > st[name]) { st[name] = f; } if (text) { label = text; } },
    done: function (name) { if (W.hasOwnProperty(name)) { st[name] = 1; fin[name] = true; } },
    finish: function () { var k; for (k in fin) { if (fin.hasOwnProperty(k)) { fin[k] = true; } } shown = 1; MIN_SHOW = 0; if (!t0) { t0 = Date.now(); } }
  };

  if (!s) { return; }
  s.addEventListener("animationend", function (e) { if (e.target === s && e.animationName === "mts-out") { done(); } });
  s.addEventListener("mousedown", skip);
  document.addEventListener("keydown", skip);
  timer = setInterval(function () {                               // safety net if the loop above never runs
    if (gone) { clearInterval(timer); return; }
    if ((t0 && Date.now() - t0 > HARD_CAP + 1500) || (!t0 && Date.now() - loadedAt > 90000)) { clearInterval(timer); leave(); }
  }, 500);
  paint(loader, 0, label);
  raf(tick);
})();
