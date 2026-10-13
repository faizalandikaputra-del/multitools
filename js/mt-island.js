/* Multi Tool - mt-island.js (v1)
   "Dynamic island" for a running Timer / Stopwatch. A black capsule at the top centre of the panel that shows the NAME and the live digits.
   Shown while a timer / stopwatch is active AND (the panel is not in idle mode  OR  the idle UI is auto-hidden = body.is-quiet).
   While the idle widgets are visible the island is hidden (the widgets show the same numbers).
   Fed by js/mt-idle-focus.js:  MTIsland.update({ timer: null | {name, text, frac, done, paused, running}, sw: null | {name, text, running} }).
   Each segment has a round play / pause button; a press calls MTIsland.onToggle("timer" | "sw") (set by js/mt-idle-focus.js).
   When the idle UI auto-hides, the live widgets fly up into the island (CSS vars --mi-dx / --mi-dy, css/mt-island.css) and fly back out when it returns.
   Digits use MTRoll (js/mt-idle-roll.js) when it is loaded. Styles: css/mt-island.css. Chromium-74 safe. */
(function () {
  "use strict";
  var root, inner, segT, segS, nameT, nameS, timeT, timeS, icoT, icoS, btnT, btnS, data = { timer: null, sw: null };
  var PLAY = '<svg viewBox="0 0 24 24" width="12" height="12" aria-hidden="true"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z" fill="currentColor"/></svg>';
  var PAUSE = '<svg viewBox="0 0 24 24" width="12" height="12" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1.2" fill="currentColor"/><rect x="14" y="5" width="4" height="14" rx="1.2" fill="currentColor"/></svg>';
  var shown = false, wasDone = false;

  function $(id) { return document.getElementById(id); }
  function body() { return document.body; }
  function idle() { return body().classList.contains("is-idle"); }
  function quiet() { return body().classList.contains("is-quiet"); }

  function build() {
    if (root) { return; }
    root = document.createElement("div"); root.id = "mt-island"; root.className = "mt-island"; root.setAttribute("role", "status"); root.setAttribute("aria-live", "off");
    inner = document.createElement("div"); inner.className = "mi-in";
    function seg(cls, name) {
      var s = document.createElement("div"), i = document.createElement("span"), n = document.createElement("span"), t = document.createElement("span");
      s.className = "mi-seg " + cls; s.hidden = true;
      i.className = "mi-ico"; n.className = "mi-name"; n.textContent = name; t.className = "mi-time";
      var btn = document.createElement("button"); btn.type = "button"; btn.className = "mi-btn"; btn.innerHTML = PLAY; btn._ic = "play";
      btn.addEventListener("click", function (e) { e.stopPropagation(); if (window.MTIsland && window.MTIsland.onToggle) { window.MTIsland.onToggle(cls.indexOf("timer") >= 0 ? "timer" : "sw"); } });
      s.appendChild(i); s.appendChild(n); s.appendChild(t); s.appendChild(btn); inner.appendChild(s);
      return { s: s, i: i, n: n, t: t, b: btn };
    }
    var a = seg("mi-timer", "Timer"), b = seg("mi-sw", "Stopwatch");
    segT = a.s; icoT = a.i; nameT = a.n; timeT = a.t; btnT = a.b;
    segS = b.s; icoS = b.i; nameS = b.n; timeS = b.t; btnS = b.b;
    root.appendChild(inner); body().appendChild(root);
  }

  function setTxt(node, t) { if (node.textContent !== t) { node.textContent = t; } }
  function digits(node, t) { if (window.MTRoll) { window.MTRoll.set(node, t, "fast"); } else { setTxt(node, t); } }

  function btnState(btn, running, label) {                       // running -> pause icon; else play icon
    var ic = running ? "pause" : "play";
    if (btn._ic !== ic) { btn.innerHTML = running ? PAUSE : PLAY; btn._ic = ic; }
    btn.setAttribute("aria-label", label);
  }
  function width() {
    if (!root) { return; }
    var w = inner.offsetWidth;                                  // .mi-in is max-content: its width is the content width
    if (w > 0) { root.style.setProperty("--mi-w", (w + 2 * 16) + "px"); }
  }

  // widgets that are live fly toward the island when the idle UI hides: where is the island centre relative to each widget centre?
  function aim() {
    var ids = [["idle-timer", data.timer], ["idle-sw", data.sw]], i, el, r, cx = window.innerWidth / 2, cy = 8 + 18;
    for (i = 0; i < ids.length; i++) {
      el = $(ids[i][0]); if (!el) { continue; }
      if (!ids[i][1] || !el.offsetParent) { continue; }
      r = el.getBoundingClientRect();
      el.style.setProperty("--mi-dx", Math.round(cx - (r.left + r.width / 2)) + "px");
      el.style.setProperty("--mi-dy", Math.round(cy - (r.top + r.height / 2)) + "px");
    }
  }

  function visibleWanted() { return !!(data.timer || data.sw) && (!idle() || quiet()); }

  function paint() {
    build();
    var t = data.timer, s = data.sw, want = visibleWanted(), was = shown;
    segT.hidden = !t; segS.hidden = !s;
    if (t) {
      setTxt(nameT, t.name); digits(timeT, t.text);
      icoT.style.setProperty("--p", String(Math.max(0, Math.min(1, t.frac || 0)) * 360) + "deg");
      segT.classList.toggle("is-done", !!t.done); segT.classList.toggle("is-paused", !!t.paused);
      btnState(btnT, !!t.running, t.running ? "Pause timer" : (t.paused ? "Resume timer" : "Start timer again"));
    }
    if (s) {
      setTxt(nameS, s.name); digits(timeS, s.text);
      segS.classList.toggle("is-running", !!s.running); segS.classList.toggle("is-paused", !s.running);
      btnState(btnS, !!s.running, s.running ? "Pause stopwatch" : "Resume stopwatch");
    }
    root.classList.toggle("has-two", !!(t && s));
    width();
    if (want !== shown) { shown = want; root.classList.toggle("is-on", want); }
    var done = !!(t && t.done);
    if (done && !wasDone && want && root.animate && !reduce()) {            // time is up: one jelly pulse
      try { root.animate([{ transform: "translate3d(-50%,0,0) scale(1)" }, { transform: "translate3d(-50%,0,0) scale(1.09,1.12)", offset: 0.35 }, { transform: "translate3d(-50%,0,0) scale(0.98,0.97)", offset: 0.65 }, { transform: "translate3d(-50%,0,0) scale(1)" }], { duration: 620, easing: "cubic-bezier(0.34, 1.3, 0.64, 1)" }); } catch (e) { }
    }
    wasDone = done;
    return was !== shown;
  }
  function reduce() { return document.documentElement.getAttribute("data-reduce-motion") === "true"; }

  function update(d) { data = { timer: d && d.timer || null, sw: d && d.sw || null }; paint(); }

  function init() {
    build();
    try {
      new MutationObserver(function () { aim(); paint(); }).observe(body(), { attributes: true, attributeFilter: ["class"] });   // idle / quiet changed
    } catch (e) { }
    window.addEventListener("resize", function () { aim(); width(); });
    paint();
  }

  window.MTIsland = { update: update, aim: aim, onToggle: null };   // onToggle("timer" | "sw") is set by js/mt-idle-focus.js
  if (document.readyState === "loading") { document.addEventListener("DOMContentLoaded", init); } else { init(); }
})();
