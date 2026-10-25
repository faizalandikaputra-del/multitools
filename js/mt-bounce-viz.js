/* Multi Tool - mt-bounce-viz.js
   Adds a live "Bounce preview" graph to the Animator Text (TextFlex) tab, just above the Frequency slider.
   It draws the SAME curve host.jsx writes into the text animator (see TF_apply > curveAt):
     overshoot : 100 * k * cos(t * freq * 2PI) / e^(decay * t),  k ramps 1 -> 1.7 over 0.08 s
     ease      : 100 * (1 - t / duration)^2
   One line per letter (first 3 letters, Left to Right), offset by Delay frames. Y axis = animator Amount in %.
   Reads #tf-frequency-num, #tf-decay-num, #tf-duration-num, #tf-delay-num, tf-style, tf-mode. Changes nothing in main.js.
   Needs: nothing but the DOM. Optional: CSInterface (to read the active comp fps; falls back to 30). ES5. */
(function (global) {
  "use strict";

  /* ---------------- pure math (also exposed for testing) ---------------- */
  function curveAt(style, t, p) {
    if (style === "ease") { var q = Math.min(Math.max(t / p.dur, 0), 1); return 100 * (1 - q) * (1 - q); }
    var w = p.freq * Math.PI * 2, k = 1 + 0.7 * Math.min(t / 0.08, 1);
    return 100 * k * Math.cos(t * w) / Math.exp(p.decay * t);
  }
  function settleTime(style, p) {
    if (style === "ease") { return Math.max(0.1, p.dur); }
    return Math.min(3, Math.max(0.2, Math.log(200) / Math.max(0.1, p.decay)));
  }
  // Amount (%) of letter `i` (0-based, Left to Right) at time x of a layer that is `total` seconds long.
  function valueAt(x, i, o) {
    var v = 0, step = o.step, left;
    if (o.doIn) { var inStart = i * step; v += (x < inStart) ? 100 : curveAt(o.style, x - inStart, o); }
    if (o.doOut) {
      left = (o.total - (2 - i) * step) - x;
      if (left <= 0) { v += 100; } else if (left < o.dur + 0.08) { v += curveAt(o.style, left, o); }
    }
    return v;
  }
  function plan(o) {
    var T = settleTime(o.style, o) + 2 * o.step + 0.05;
    o.doIn = o.mode !== "out"; o.doOut = o.mode !== "in";
    o.total = (o.doIn && o.doOut) ? 2 * T + 0.25 : T;
    return o;
  }
  global.MTBounceViz = { curveAt: curveAt, valueAt: valueAt, plan: plan, settleTime: settleTime };

  var panel = document.getElementById("panel");
  if (!panel) { return; }

  /* ---------------- helpers ---------------- */
  var NS = "http://www.w3.org/2000/svg";
  var W = 300, H = 128, PL = 30, PR = 8, PT = 8, PB = 16, N = 120;
  var REPLAY_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12a8 8 0 1 0 2.6-5.9M4 4v4h4"/></svg>';
  var reduce = false;
  try { reduce = !!(global.matchMedia && global.matchMedia("(prefers-reduced-motion: reduce)").matches); } catch (e) { }

  function el(name, attrs, parent) {
    var n = document.createElementNS(NS, name), k;
    for (k in attrs) { if (attrs.hasOwnProperty(k)) { n.setAttribute(k, attrs[k]); } }
    if (parent) { parent.appendChild(n); }
    return n;
  }
  function num(wrap, id, def) { var e = wrap.querySelector("#" + id + "-num"), v = e ? parseFloat(e.value) : NaN; return isFinite(v) ? v : def; }
  function radio(wrap, name, def) { var e = wrap.querySelector('input[name="' + name + '"]:checked'); return e ? e.value : def; }
  function fmt(v, d) { return (Math.round(v * Math.pow(10, d)) / Math.pow(10, d)).toString(); }

  var fps = 30, fpsKnown = false;
  function readFps(cb) {
    try {
      new global.CSInterface().evalScript("(app.project && app.project.activeItem && app.project.activeItem.frameRate) || 0", function (r) {
        var v = parseFloat(r);
        if (isFinite(v) && v > 0) { fps = v; fpsKnown = true; }
        if (cb) { cb(); }
      });
    } catch (e) { if (cb) { cb(); } }
  }

  /* ---------------- card ---------------- */
  function build(wrap, anchor) {
    var card = document.createElement("div");
    card.className = "mtbv";
    card.innerHTML =
      '<div class="mtbv-head"><span class="mtbv-title">Bounce preview</span><span class="mtbv-meta"></span>' +
      '<button class="icon-btn mtbv-replay" type="button" title="Replay preview" aria-label="Replay preview">' + REPLAY_SVG + '</button></div>' +
      '<svg class="mtbv-svg" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Animator amount over time, first three letters"></svg>' +
      '<div class="mtbv-foot"><span class="mtbv-over"></span><span class="mtbv-settle"></span></div>';
    anchor.parentNode.insertBefore(card, anchor);

    var svg = card.querySelector(".mtbv-svg"), meta = card.querySelector(".mtbv-meta");
    var over = card.querySelector(".mtbv-over"), settle = card.querySelector(".mtbv-settle");
    var state = { sig: "", dots: [], headLine: null, raf: 0, scale: null, o: null, yOf: null };

    function read() {
      return plan({
        freq: num(wrap, "tf-frequency", 4), decay: Math.max(0.1, num(wrap, "tf-decay", 5)),
        dur: Math.max(0.1, num(wrap, "tf-duration", 2)),
        step: Math.max(0, num(wrap, "tf-delay", 2)) / fps,
        style: radio(wrap, "tf-style", "overshoot"), mode: radio(wrap, "tf-mode", "in")
      });
    }
    function signature(o) { return [o.freq, o.decay, o.dur, o.step, o.style, o.mode].join("|"); }

    function draw(o) {
      var i, j, x, v, lo = 0, hi = 100, series = [[], [], []], minV = 0;
      for (i = 0; i < 3; i++) {
        for (j = 0; j <= N; j++) {
          x = o.total * j / N; v = valueAt(x, i, o);
          series[i].push(v); if (v < lo) { lo = v; } if (v > hi) { hi = v; }
          if (i === 0 && x > 0.001 && v < minV) { minV = v; }
        }
      }
      var pad = (hi - lo) * 0.08; lo -= pad; hi += pad;
      var xOf = function (t) { return PL + (t / o.total) * (W - PL - PR); };
      var yOf = function (val) { return PT + (1 - (val - lo) / (hi - lo)) * (H - PT - PB); };
      while (svg.firstChild) { svg.removeChild(svg.firstChild); }
      el("line", { "class": "mtbv-grid", x1: PL, x2: W - PR, y1: yOf(100), y2: yOf(100) }, svg);
      el("line", { "class": "mtbv-zero", x1: PL, x2: W - PR, y1: yOf(0), y2: yOf(0) }, svg);
      el("text", { "class": "mtbv-lbl", x: PL - 5, y: yOf(100) + 3, "text-anchor": "end" }, svg).textContent = "100%";
      el("text", { "class": "mtbv-lbl", x: PL - 5, y: yOf(0) + 3, "text-anchor": "end" }, svg).textContent = "0%";
      el("text", { "class": "mtbv-lbl", x: PL, y: H - 3 }, svg).textContent = "0s";
      el("text", { "class": "mtbv-lbl", x: W - PR, y: H - 3, "text-anchor": "end" }, svg).textContent = fmt(o.total, 1) + "s";
      for (i = 2; i >= 0; i--) {
        var pts = [];
        for (j = 0; j <= N; j++) { pts.push(fmt(xOf(o.total * j / N), 1) + "," + fmt(yOf(series[i][j]), 1)); }
        el("polyline", { "class": "mtbv-line mtbv-l" + i, points: pts.join(" ") }, svg);
      }
      state.headLine = el("line", { "class": "mtbv-head-line", x1: PL, x2: PL, y1: PT, y2: H - PB, visibility: "hidden" }, svg);
      state.dots = [];
      for (i = 2; i >= 0; i--) { state.dots[i] = el("circle", { "class": "mtbv-dot d" + i, r: i === 0 ? 3.2 : 2.6, cx: PL, cy: yOf(series[i][0]), visibility: "hidden" }, svg); }
      state.o = o; state.xOf = xOf; state.yOf = yOf;

      meta.textContent = fmt(fps, fps % 1 ? 2 : 0) + " fps" + (fpsKnown ? "" : " (assumed)");
      if (o.style === "ease") { over.innerHTML = "No overshoot"; }
      else { over.innerHTML = "Overshoot <b>" + Math.round(-minV) + "%</b> of offset"; }
      settle.innerHTML = "Settles in <b>" + fmt(settleTime(o.style, o), 1) + "s</b>";
    }

    function replay() {
      if (reduce || !state.o) { return; }
      cancelAnimationFrame(state.raf);
      var o = state.o, ms = Math.min(1800, Math.max(600, o.total * 1000)), t0 = 0;
      state.headLine.setAttribute("visibility", "visible");
      var i; for (i = 0; i < 3; i++) { state.dots[i].setAttribute("visibility", "visible"); }
      function tick(ts) {
        if (!t0) { t0 = ts; }
        var p = Math.min(1, (ts - t0) / ms), t = p * o.total, k, px = state.xOf(t);
        state.headLine.setAttribute("x1", px); state.headLine.setAttribute("x2", px);
        for (k = 0; k < 3; k++) { state.dots[k].setAttribute("cx", px); state.dots[k].setAttribute("cy", state.yOf(valueAt(t, k, o))); }
        if (p < 1) { state.raf = requestAnimationFrame(tick); }
        else { state.headLine.setAttribute("visibility", "hidden"); for (k = 0; k < 3; k++) { state.dots[k].setAttribute("visibility", "hidden"); } }
      }
      state.raf = requestAnimationFrame(tick);
    }

    var redrawQueued = false, replayTimer = null;
    function refresh(withReplay) {
      var o = read(), s = signature(o);
      if (s === state.sig && !withReplay) { return; }
      var changed = s !== state.sig; state.sig = s;
      if (changed) { draw(o); }
      clearTimeout(replayTimer);
      replayTimer = setTimeout(replay, 220);
    }
    function queue() { if (redrawQueued) { return; } redrawQueued = true; requestAnimationFrame(function () { redrawQueued = false; refresh(false); }); }

    wrap.addEventListener("input", queue);
    wrap.addEventListener("change", queue);
    card.querySelector(".mtbv-replay").addEventListener("click", function () { refresh(true); });

    // Programmatic changes (presets, Import from layer) fire no events: a 300 ms signature check covers them.
    var poll = setInterval(function () {
      if (!card.isConnected) { clearInterval(poll); cancelAnimationFrame(state.raf); return; }
      if (!document.hidden) { queue(); }
    }, 300);

    refresh(false);
    readFps(function () { state.sig = ""; refresh(false); });
  }

  function scan() {
    var f = panel.querySelector("#tf-frequency");
    if (!f || panel.querySelector(".mtbv")) { return; }
    var param = f.closest(".param"), wrap = f.closest(".ta");
    if (!param || !wrap) { return; }
    build(wrap, param);
  }

  var scheduled = false;
  new MutationObserver(function () {
    if (scheduled) { return; }
    scheduled = true;
    requestAnimationFrame(function () { scheduled = false; scan(); });
  }).observe(panel, { childList: true, subtree: true });
  scan();
})(window);
