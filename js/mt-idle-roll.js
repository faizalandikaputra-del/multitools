/* Multi Tool - mt-idle-roll.js (v1)
   Digit roll for every live number on the idle screen (same motion as the big clock, see css/mt-idle-time.css):
   the old digit rolls UP and out, the new digit rises in FROM BELOW. Styles: css/mt-idle-roll.css.
   API:  MTRoll.set(node, text [, "fast"])   draws text into node; changed digits roll, everything else is written as is.
         MTRoll.reset(node)                  next set() on this node draws plain (no roll).
   "fast" = counters that tick every second (stopwatch, timer, time in After Effects): shorter and smaller travel.
   Rules: the first draw of every idle session is plain (the idle entry animation already moves everything); a change in the
   NUMBER of digits (9 -> 10) or in the shape of the text is drawn plain; outside idle mode it is always plain.
   The text is kept in node._mr, never read back from the DOM (a rolling slot holds the old and the new digit at once).
   Chromium-74 safe (CEP). */
(function () {
  "use strict";
  var epoch = 0, wasIdle = false;

  function idleNow() {
    var on = !!(document.body && document.body.classList.contains("is-idle"));
    if (on !== wasIdle) { wasIdle = on; epoch++; }      // a new idle session: every node draws plain once
    return on;
  }

  // "Sunday, 11 October" -> [s "Sunday, ", d 1, d 1, s " October"]; each digit is its own token, other characters are grouped.
  function tokens(text) {
    var out = [], last = null, i, c, isD;
    for (i = 0; i < text.length; i++) {
      c = text.charAt(i); isD = c >= "0" && c <= "9";
      if (isD) { out.push({ d: true, t: c }); last = null; }
      else if (last) { last.t += c; }
      else { last = { d: false, t: c }; out.push(last); }
    }
    return out;
  }

  function sameShape(a, b) {
    var i;
    if (a.length !== b.length) { return false; }
    for (i = 0; i < a.length; i++) { if (a[i].d !== b[i].d) { return false; } }
    return true;
  }

  function plain(node, text, toks) {
    var i, s, n;
    node.textContent = "";
    for (i = 0; i < toks.length; i++) {
      s = document.createElement("span");
      if (toks[i].d) {
        s.className = "mr-c";
        n = document.createElement("span"); n.className = "mr-n"; n.textContent = toks[i].t;
        s.appendChild(n);
      } else { s.className = "mr-s"; s.textContent = toks[i].t; }
      node.appendChild(s);
    }
    node.setAttribute("data-mr", "");
    node._mr = { text: text, toks: toks, epoch: epoch };
  }

  function set(node, text, mode) {
    if (!node) { return; }
    text = String(text);
    var st = node._mr, on, toks, kids, i, k = 0, slot, o, n, fast, step, self;
    on = idleNow();
    if (st && st.text === text) { st.epoch = epoch; return; }                          // same text: nothing to draw, but it is now "drawn" for this idle session
    toks = tokens(text);
    kids = node.children;
    if (!st || !on || st.epoch !== epoch || !sameShape(st.toks, toks) || kids.length !== toks.length) { plain(node, text, toks); return; }
    fast = mode === "fast"; step = fast ? 35 : 60;
    for (i = 0; i < toks.length; i++) {
      slot = kids[i];
      if (!toks[i].d) { if (st.toks[i].t !== toks[i].t) { slot.textContent = toks[i].t; } continue; }   // words around the numbers just change
      if (st.toks[i].t === toks[i].t) { continue; }
      if (slot._rt) { clearTimeout(slot._rt); slot._rt = 0; }
      slot.textContent = "";
      o = document.createElement("span"); o.className = "mr-o"; o.setAttribute("aria-hidden", "true"); o.textContent = st.toks[i].t;
      n = document.createElement("span"); n.className = "mr-n"; n.textContent = toks[i].t;
      o.style.animationDelay = (Math.min(k, 5) * step) + "ms";                            // changed digits follow each other, left to right
      n.style.animationDelay = (Math.min(k, 5) * step + (fast ? 40 : 60)) + "ms";         // the new one starts a little after the old one
      slot.appendChild(o); slot.appendChild(n);
      slot.classList.toggle("mr-fast", fast);
      slot.classList.remove("is-roll"); void slot.offsetWidth; slot.classList.add("is-roll");
      slot._rt = setTimeout((function (sl) {
        return function () { sl._rt = 0; if (sl.firstChild && sl.firstChild.className === "mr-o") { sl.removeChild(sl.firstChild); } sl.classList.remove("is-roll"); };
      })(slot), (fast ? 520 : 900) + Math.min(k, 5) * step);
      k++;
    }
    node._mr = { text: text, toks: toks, epoch: epoch };
  }

  function reset(node) { if (node) { node._mr = null; } }

  window.MTRoll = { set: set, reset: reset };
})();
