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

  function set(node, text, mode, always) {
    if (!node) { return; }
    text = String(text);
    if (node._swBusy) { node._swPend = text; return; }                                  // a show / hide swap is playing: it draws the latest text when it ends
    var st = node._mr, on, toks, kids, i, k = 0, slot, o, n, fast, step, self;
    on = idleNow() || !!always;                                                         // always: the Dynamic Island rolls its digits outside idle mode too
    if (st && st.text === text) { st.epoch = epoch; return; }                          // same text: nothing to draw, but it is now "drawn" for this idle session
    toks = tokens(text);
    kids = node.children;
    if (!st || !on || (!always && st.epoch !== epoch) || !sameShape(st.toks, toks) || kids.length !== toks.length) { plain(node, text, toks); return; }
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

  // Show / hide swap (stopwatch "Hide" / "Show"): every character leaves UP (staggered, accelerate), the new text rises in FROM BELOW (decelerate).
  // Same motion language as the digit roll. While it plays, set() only remembers the newest text; at the end the node is rebuilt in the normal roll markup.
  function chars(node, text) {
    var i, s, out = [];
    node.textContent = ""; node.removeAttribute("data-mr");
    for (i = 0; i < text.length; i++) {
      s = document.createElement("span"); s.textContent = text.charAt(i);
      s.style.display = "inline-block"; s.style.whiteSpace = "pre"; node.appendChild(s); out.push(s);
    }
    return out;
  }
  function swap(node, text, mode, always) {
    if (!node) { return; }
    text = String(text);
    var reduce = document.documentElement.getAttribute("data-reduce-motion") === "true";
    if (!node.animate || reduce) { reset(node); set(node, text, mode, always); return; }
    var old = node._mr ? node._mr.text : node.textContent, out, EASE_OUT = "cubic-bezier(0.3, 0, 1, 1)", EASE_IN = "cubic-bezier(0.05, 0.7, 0.1, 1)", st = 32;
    if (node._swT) { clearTimeout(node._swT); node._swT = 0; }
    node._swBusy = true; node._swPend = text;
    out = chars(node, old);
    out.forEach(function (c, i) { c.animate([{ opacity: 1, transform: "none" }, { opacity: 0, transform: "translate3d(0,-60%,0)" }], { duration: 190, delay: i * st, easing: EASE_OUT, fill: "forwards" }); });
    node._swT = setTimeout(function () {
      var inn = chars(node, node._swPend), last = 0;
      inn.forEach(function (c, i) { last = 300 + i * st; c.animate([{ opacity: 0, transform: "translate3d(0,60%,0)" }, { opacity: 1, transform: "none" }], { duration: 300, delay: i * st, easing: EASE_IN, fill: "backwards" }); });
      node._swT = setTimeout(function () {
        node._swT = 0; node._swBusy = false; var t = node._swPend; node._swPend = null; reset(node); set(node, t, mode, always);
      }, last + 30);
    }, 190 + Math.max(0, old.length - 1) * st);
  }

  window.MTRoll = { set: set, reset: reset, swap: swap };
})();
