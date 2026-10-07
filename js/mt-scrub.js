/* Multi Tool - mt-scrub.js : drag left / right to change a number, like After Effects' scrubby values.
   Works on every <input type="number"> in the panel (Animator Text: Position / Anchor Point / Rotation / Scale / ...,
   Tools, Quick Comp Edit, ...):
     - drag the small LABEL next to a field (X, Y, Z, Width, Offset ...)  -> scrubs it
     - drag the FIELD itself while it is not focused                      -> scrubs it (a plain click still focuses + selects it)
   Speed: 1 px = one `step` of the field. Hold Shift = x10 (fast), Alt = x0.1 (fine). min / max are respected.
   Fires "input" while dragging and "change" on release, exactly like typing, so every tab reads the value as before.
   The right edge of a field is left alone (that strip is mt-spinbox.js's up / down stepper).
   Opt out for one field with data-no-scrub="true". Event delegation on document, plain ES5 for old CEP hosts. */
(function () {
  "use strict";
  var ZONE = 18;          // px strip on the right edge owned by mt-spinbox.js
  var THRESHOLD = 3;      // px of movement before a press becomes a drag (below that it is a click)
  var drag = null;
  var justDragged = false;

  function isNum(el) {
    return !!el && el.tagName === "INPUT" && el.type === "number" && !el.disabled && !el.readOnly &&
      el.getAttribute("data-native") !== "true" && el.getAttribute("data-no-scrub") !== "true";
  }
  function fire(el, type) {
    var ev;
    try { ev = new Event(type, { bubbles: true }); } catch (e) { ev = document.createEvent("Event"); ev.initEvent(type, true, false); }
    el.dispatchEvent(ev);
  }
  function stepOf(el) { var s = parseFloat(el.step); return (isFinite(s) && s > 0) ? s : 1; }
  function decimals(n) { var s = String(n), i = s.indexOf("."); return i < 0 ? 0 : s.length - i - 1; }
  function limit(el, name, def) { var v = parseFloat(el.getAttribute(name)); return isFinite(v) ? v : def; }

  // The number field a mousedown belongs to: the field itself, or the field of the <label> that was pressed.
  function resolve(t) {
    if (isNum(t)) { return { input: t, viaLabel: false }; }
    var lab = t && t.closest ? t.closest("label") : null;
    if (lab && lab.control && lab.control !== t && isNum(lab.control)) { return { input: lab.control, viaLabel: true }; }
    return null;
  }

  function end(commit) {
    if (!drag) { return; }
    var d = drag; drag = null;
    document.documentElement.classList.remove("mt-scrubbing");
    if (d.active) {
      justDragged = true; setTimeout(function () { justDragged = false; }, 0);   // swallow the click that follows a drag
      if (commit) { d.input._mtTouched = true; fire(d.input, "change"); }
    } else if (!d.viaLabel) {
      try { d.input.focus(); d.input.select(); } catch (e) { }                    // plain click on the field = edit it
    }
  }

  document.addEventListener("mousedown", function (e) {
    if (e.button !== 0) { return; }
    var r = resolve(e.target);
    if (!r) { return; }
    var input = r.input;
    if (!r.viaLabel) {
      if (document.activeElement === input) { return; }                          // already editing: normal caret / selection
      var rect = input.getBoundingClientRect();
      if (e.clientX > rect.right - ZONE - 1) { return; }                         // spinbox strip
    }
    e.preventDefault();                                                           // no text selection / early focus while pressing
    var v0 = parseFloat(input.value);
    drag = {
      input: input, viaLabel: r.viaLabel, active: false,
      x0: e.clientX, lastX: e.clientX,
      value: isFinite(v0) ? v0 : (parseFloat(input.getAttribute("value")) || 0)
    };
  }, true);

  document.addEventListener("mousemove", function (e) {
    if (!drag) { return; }
    if (e.buttons === 0) { end(true); return; }                                   // button released outside the panel
    if (!drag.active) {
      if (Math.abs(e.clientX - drag.x0) < THRESHOLD) { return; }
      drag.active = true;
      drag.lastX = e.clientX;                                                     // start counting from here: no jump
      document.documentElement.classList.add("mt-scrubbing");
      try { if (document.activeElement && document.activeElement !== drag.input && document.activeElement.blur) { document.activeElement.blur(); } } catch (er) { }
      return;
    }
    var input = drag.input, step = stepOf(input);
    var mult = e.shiftKey ? 10 : (e.altKey ? 0.1 : 1);
    drag.value += (e.clientX - drag.lastX) * step * mult;                         // accumulated, so Shift / Alt can change mid-drag
    drag.lastX = e.clientX;
    var v = Math.max(limit(input, "min", -Infinity), Math.min(limit(input, "max", Infinity), drag.value));
    var dec = Math.max(decimals(step), e.altKey && step >= 1 ? 1 : 0);
    var out = Number(v.toFixed(dec));
    if (String(out) !== input.value) {
      input.value = String(out);
      input._mtTouched = true;                                                    // FormState ignores synthetic events: mark it by hand
      fire(input, "input");
    }
  }, true);

  document.addEventListener("mouseup", function () { end(true); }, true);
  window.addEventListener("blur", function () { end(false); });
  document.addEventListener("click", function (e) {
    if (justDragged) { e.preventDefault(); e.stopPropagation(); }
  }, true);
})();
