/* Multi Tool - mt-param-ui.js
   Same value control as the Motion Tile Generator's Scale row, on the whole Tools tab and the Animator Text tab:
   a big number box (bold value, stepper, drag left / right to scrub) with a slider underneath.
   - Every ".param" row that holds a label + one number box gets the big box (class mtn-p). Rows that have no slider
     get one, mirrored both ways with the box. Rows that already have a slider (Animator Text Frequency / Decay /
     Duration / Delay) keep it and only get the big box.
   - slider range = the box's min / max; when that span is wider than 1000 the slider covers min .. min + 1000 and parks
     at its end for bigger values (the box still takes any value in its own min / max).
   - rows with anything else in them (the Stagger seed row has a "New" button) get the big box but no slider
   - dragging the slider fires "input" on the box, like typing, so each card reads the value as before
   - opt out of the slider for one row with data-no-slider on the row. Loaded after mt-newtools.js. ES5. */
(function () {
  "use strict";
  var panel = document.getElementById("panel");
  if (!panel) { return; }
  var TABS = ["Tools", "Animator Text"];

  function qa(root, sel) { return Array.prototype.slice.call(root.querySelectorAll(sel)); }
  function fire(el, type) {
    var ev;
    try { ev = new Event(type, { bubbles: true }); } catch (e) { ev = document.createEvent("Event"); ev.initEvent(type, true, false); }
    el.dispatchEvent(ev);
  }
  function attr(el, name, def) { var v = parseFloat(el.getAttribute(name)); return isFinite(v) ? v : def; }

  function decorate(row) {
    if (row.getAttribute("data-pui")) { return; }
    var nums = qa(row, 'input[type="number"]');
    if (nums.length !== 1) { return; }
    var num = nums[0];
    row.setAttribute("data-pui", "1");
    row.classList.add("mtn-p");
    if (row.querySelector('input[type="range"]') || row.hasAttribute("data-no-slider")) { return; }
    var kids = Array.prototype.slice.call(row.children).filter(function (c) { return c !== num && c.tagName !== "LABEL"; });
    if (kids.length) { return; }   // extra controls in the row (button, chips): no slider

    var min = attr(num, "min", 0), max = attr(num, "max", min + 100), step = attr(num, "step", 1);
    if (max - min > 1000) { max = min + 1000; }
    if ((max - min) / step > 2000) { step = (max - min) / 200; }
    var rng = document.createElement("input");
    rng.type = "range"; rng.min = String(min); rng.max = String(max); rng.step = String(step);
    rng.value = num.value; rng.setAttribute("data-no-reset", ""); rng.setAttribute("aria-label", "Slider");
    row.appendChild(rng);

    function toSlider() { rng.value = num.value; }
    rng.addEventListener("input", function () { num.value = rng.value; fire(num, "input"); });
    rng.addEventListener("change", function () { fire(num, "change"); });
    num.addEventListener("input", toSlider);
    num.addEventListener("change", toSlider);
    // some cards set the box from code without an event (Randomize Transform swaps its range): catch up when the row is touched
    row.addEventListener("pointerenter", toSlider);
    row.addEventListener("focusin", toSlider);
  }

  function enhance() {
    var title = document.getElementById("panel-title"), name = title ? title.textContent : "";
    if (TABS.indexOf(name) < 0) { panel.removeAttribute("data-mtn-pui"); return; }
    panel.setAttribute("data-mtn-pui", "1");
    qa(panel, ".param").forEach(decorate);
    qa(panel, ".ta-group-body").forEach(function (b) { if (b.parentNode.classList.contains("is-open")) { b.style.maxHeight = "none"; } });
  }
  var timers = [];
  function schedule() {
    timers.forEach(clearTimeout); timers = [];
    [0, 150, 450].forEach(function (ms) { timers.push(setTimeout(function () { try { enhance(); } catch (e) { if (window.console) { console.warn("mt-param-ui:", e); } } }, ms)); });
  }
  try { new MutationObserver(schedule).observe(panel, { childList: true, subtree: true }); } catch (e) { }
  schedule();
})();
