/* Multi Tool - mt-cursor.js : keeps the mouse cursor in step with what is under it.
   In CEF (After Effects) the cursor can stay stuck on the arrow over buttons, tiles and links: the browser only re-reads the cursor when
   the page asks for it, and a repaint under a resting or slowly moving pointer (animations, panel entrance, menus opening) can leave the
   arrow behind. This module reads the real cursor of the element under the pointer and mirrors it on <html>, so the cursor value the
   browser holds always changes together with the target, and re-checks a moment after every DOM change under a resting pointer.
   Nothing here changes how anything looks. Drag states that set their own cursor (!important on html.*) still win. */
(function () {
  "use strict";
  var root = document.documentElement, last = "", x = -1, y = -1, raf = 0, inside = false;

  function wanted(el) {
    var c = "auto";
    try { c = window.getComputedStyle(el).cursor || "auto"; } catch (e) { }
    return c;
  }
  function sync() {
    raf = 0;
    if (!inside || x < 0) { return; }
    var el = document.elementFromPoint(x, y), c;
    if (!el) { return; }
    root.style.cursor = "";            // read the element's own cursor, not the value this module mirrored on <html> last time
    c = wanted(el);
    last = c;
    root.style.cursor = c;
  }
  function schedule() { if (!raf) { raf = window.requestAnimationFrame(sync); } }

  document.addEventListener("mousemove", function (e) { x = e.clientX; y = e.clientY; inside = true; schedule(); }, true);
  document.addEventListener("mouseover", function (e) { x = e.clientX; y = e.clientY; inside = true; schedule(); }, true);
  document.addEventListener("mouseleave", function () { inside = false; last = ""; root.style.cursor = ""; }, true);
  window.addEventListener("blur", function () { inside = false; last = ""; root.style.cursor = ""; });

  /* Pointer resting while the page changes under it (tab switch, menu open, card entrance): look again shortly after. */
  if (window.MutationObserver) {
    var t = 0;
    new MutationObserver(function () {
      if (!inside || t) { return; }
      t = window.setTimeout(function () { t = 0; last = ""; schedule(); }, 90);
    }).observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] });
  }
})();
