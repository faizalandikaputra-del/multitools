/* Multi Tool - mt-spinbox.js : smooth, themed spin buttons for every <input type="number">.
   The OS spinner (tiny stacked arrows) is hidden; the right edge of the field becomes a two-part stepper drawn by
   css/mt-spinbox.css. This file drives it:
     - hover: the half under the pointer (up / down) lights up in the theme colour; press = stronger tint + a small
       pulse of the field; value changes by step (input.stepUp / stepDown, so min / max / step are respected);
     - hold: repeats after a short delay and speeds up the longer you hold (x1 -> x2 -> x5);
     - Shift = x10 on clicks, ArrowUp / ArrowDown and the wheel (always in multiples of the field's step);
     - mouse wheel over a FOCUSED number field steps it (an unfocused field never hijacks page scrolling);
     - fires "input" on every step and "change" when you let go, like the native spinner.
   Event delegation on document: fields created later (tabs built on demand) work with no setup.
   Opt out for one field with data-native="true". Plain ES5 for old CEP hosts. */
(function () {
  "use strict";
  var ZONE = 18;                       // px width of the stepper strip on the right edge of a field
  var hold = null;                     // { el, dir, timer, ticks, shift }

  function isNum(t) { return t && t.tagName === "INPUT" && t.type === "number" && !t.disabled && !t.readOnly && t.getAttribute("data-native") !== "true"; }
  function fire(el, type) {
    var ev;
    try { ev = new Event(type, { bubbles: true }); } catch (e) { ev = document.createEvent("Event"); ev.initEvent(type, true, false); }
    el.dispatchEvent(ev);
  }
  function zone(el, e) {
    var r = el.getBoundingClientRect();
    if (e.clientX < r.right - ZONE - 1 || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) { return ""; }
    return (e.clientY - r.top) < r.height / 2 ? "up" : "down";
  }
  function bump(el) {
    el.classList.remove("mt-bump");
    void el.offsetWidth;
    el.classList.add("mt-bump");
  }
  function step(el, dir, n) {
    var before = el.value;
    try { if (dir === "up") { el.stepUp(n || 1); } else { el.stepDown(n || 1); } } catch (e) { return; }
    if (el.value !== before) { bump(el); fire(el, "input"); }
  }

  function stop() {
    if (!hold) { return; }
    clearTimeout(hold.timer);
    var el = hold.el;
    el.removeAttribute("data-mt-press");
    hold = null;
    fire(el, "change");
  }
  function tick() {
    if (!hold) { return; }
    hold.ticks++;
    var mult = hold.ticks > 36 ? 5 : (hold.ticks > 14 ? 2 : 1);
    step(hold.el, hold.dir, mult * (hold.shift ? 10 : 1));
    hold.timer = setTimeout(tick, hold.ticks > 14 ? 55 : 85);
  }

  document.addEventListener("mousemove", function (e) {
    var t = e.target;
    if (!isNum(t)) { return; }
    var z = zone(t, e);
    if (z) { if (t.getAttribute("data-mt-spin") !== z) { t.setAttribute("data-mt-spin", z); } }
    else if (t.hasAttribute("data-mt-spin")) { t.removeAttribute("data-mt-spin"); }
  }, true);
  document.addEventListener("mouseout", function (e) {
    var t = e.target;
    if (t && t.tagName === "INPUT" && t.hasAttribute && t.hasAttribute("data-mt-spin") && !(hold && hold.el === t)) { t.removeAttribute("data-mt-spin"); }
  }, true);

  document.addEventListener("mousedown", function (e) {
    var t = e.target, z;
    if (e.button !== 0 || !isNum(t)) { return; }
    z = zone(t, e);
    if (!z) { return; }
    e.preventDefault();                                    // no caret / selection change from the strip
    try { t.focus({ preventScroll: true }); } catch (er) { try { t.focus(); } catch (e2) { } }
    stop();
    t.setAttribute("data-mt-spin", z);
    t.setAttribute("data-mt-press", z);
    hold = { el: t, dir: z, ticks: 0, shift: !!e.shiftKey, timer: 0 };
    step(t, z, e.shiftKey ? 10 : 1);
    hold.timer = setTimeout(tick, 380);
  }, true);
  document.addEventListener("mouseup", stop, true);
  window.addEventListener("blur", stop);

  document.addEventListener("keydown", function (e) {
    var t = e.target;
    if (!isNum(t) || !e.shiftKey || (e.key !== "ArrowUp" && e.key !== "ArrowDown")) { return; }
    e.preventDefault();
    step(t, e.key === "ArrowUp" ? "up" : "down", 10);
    fire(t, "change");
  }, true);

  document.addEventListener("wheel", function (e) {
    var t = e.target;
    if (!isNum(t) || document.activeElement !== t || !e.deltaY) { return; }
    e.preventDefault(); e.stopPropagation();
    step(t, e.deltaY < 0 ? "up" : "down", e.shiftKey ? 10 : 1);
    fire(t, "change");
  }, { passive: false, capture: true });
})();
