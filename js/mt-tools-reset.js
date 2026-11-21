/* Multi Tool - mt-tools-reset.js
   Tools tab: a "Reset" button at the bottom of every card that has settings (number boxes, switches, chips, dropdowns,
   text fields). One click puts every control in that card back to its normal value and fires "input" / "change" like
   typing would, so previews, saved options and the card's own code all follow.
   - normal value = the value the card was built with (the markup default); a control can override it with
       data-reset-value="150"  (number / text / range / select)   data-reset-checked="1" | "0"  (checkbox / radio)
   - cards with nothing to set (Anchor Point, Align to Composition) get no button; a card that already has its own
     Reset button (e.g. Keyframe Timing) is left alone; a control can opt out with data-no-reset
   - the button is added a moment after the tab is built, because mt-newtools.js rebuilds some card bodies first
   Loaded after mt-newtools.js. Needs window.__MT (toast). ES5. */
(function () {
  "use strict";
  var panel = document.getElementById("panel");
  if (!panel) { return; }
  var SKIP_TYPES = { button: 1, submit: 1, reset: 1, file: 1, hidden: 1, image: 1 };
  var ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12a8 8 0 1 0 2.34-5.66M4 4v5h5"/></svg>';

  function qa(root, sel) { return Array.prototype.slice.call(root.querySelectorAll(sel)); }
  function toast(msg) { try { if (window.__MT && window.__MT.toast) { window.__MT.toast(msg, false); } } catch (e) { } }
  function fire(el, type) {
    var ev;
    try { ev = new Event(type, { bubbles: true }); } catch (e) { ev = document.createEvent("Event"); ev.initEvent(type, true, false); }
    el.dispatchEvent(ev);
  }
  function controls(scope) {
    return qa(scope, "input, select, textarea").filter(function (el) {
      var t = (el.type || "").toLowerCase();
      return !SKIP_TYPES[t] && !el.hasAttribute("data-no-reset") && !el.hasAttribute("data-no-restore") && !(el.closest && el.closest(".mtn-report"));   // .mtn-report = Cleaner scan results, not settings
    });
  }
  function labelOf(group) {
    var l = group.querySelector(".ta-group-label");
    return l ? l.textContent.replace(/\s+/g, " ").trim() : "Card";
  }
  function hasOwnReset(group) {
    return qa(group, "button").some(function (b) { return !b.classList.contains("mtn-reset") && /reset/i.test(b.textContent + " " + (b.getAttribute("aria-label") || "")); });
  }

  function resetGroup(group) {
    var changed = [];
    controls(group).forEach(function (el) {
      var t = (el.type || "").toLowerCase(), want, now;
      if (t === "checkbox" || t === "radio") {
        want = el.hasAttribute("data-reset-checked") ? el.getAttribute("data-reset-checked") === "1" : el.defaultChecked;
        if (el.checked !== want) { el.checked = want; changed.push(el); }
      } else if (el.tagName === "SELECT") {
        if (el.hasAttribute("data-reset-value")) { now = el.value; el.value = el.getAttribute("data-reset-value"); if (el.value !== now) { changed.push(el); } }
        else {
          var i, idx = 0, found = false;
          for (i = 0; i < el.options.length; i++) { if (el.options[i].defaultSelected) { idx = i; found = true; break; } }
          if (found || el.selectedIndex !== 0) { if (el.selectedIndex !== idx) { el.selectedIndex = idx; changed.push(el); } }
        }
      } else {
        want = el.hasAttribute("data-reset-value") ? el.getAttribute("data-reset-value") : el.defaultValue;
        if (el.value !== want) { el.value = want; changed.push(el); }
      }
    });
    changed.forEach(function (el) { fire(el, "input"); fire(el, "change"); });
    return changed.length;
  }

  function addButton(group) {
    var inner = group.querySelector(".ta-group-body-inner");
    if (!inner || inner.querySelector(".mtn-reset-row") || hasOwnReset(group)) { return; }
    if (!controls(inner).length) { return; }
    var row = document.createElement("div");
    row.className = "mtn-reset-row";
    row.innerHTML = '<button type="button" class="mtn-mini mtn-reset" title="Put every setting in this card back to its normal value">' + ICON + '<span>Reset</span></button>';
    inner.appendChild(row);
    row.firstChild.addEventListener("click", function () {
      var n = resetGroup(group);
      toast(n ? labelOf(group) + " reset to normal." : labelOf(group) + " is already at its normal values.");
    });
    var body = group.querySelector(".ta-group-body");
    if (body && group.classList.contains("is-open")) { body.style.maxHeight = "none"; }
  }

  function enhance() {
    var title = document.getElementById("panel-title");
    if (!title || title.textContent !== "Tools") { return; }
    qa(panel, ".ta-group").forEach(addButton);
  }
  var timers = [];
  function schedule() {
    timers.forEach(clearTimeout); timers = [];
    [200, 600].forEach(function (ms) { timers.push(setTimeout(function () { try { enhance(); } catch (e) { if (window.console) { console.warn("mt-tools-reset:", e); } } }, ms)); });
  }
  try { new MutationObserver(schedule).observe(panel, { childList: true }); } catch (e) { }
  schedule();
})();
