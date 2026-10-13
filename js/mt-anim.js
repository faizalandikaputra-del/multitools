/**
 * mt-anim.js - Settings > "Tab animation": choose how cards enter when you switch tabs.
 *
 *   Style   Smooth (default, the original) | Glide | Pop | Fade | Cascade | None     localStorage "mtx.animStyle"
 *   Speed   50% - 200% (100% = default)                                              localStorage "mtx.animSpeed"
 *   Easing  Soft (default) | Even | Spring                                           localStorage "mtx.animEase"
 *
 * What it does: sets attributes / CSS variables on <html>; the look itself lives in css/mt-anim-styles.css.
 * With every choice at its default NOTHING is set, so the panel behaves exactly as before this file existed.
 *   data-anim-style, data-anim-ease, data-anim-dir, --mtx-k, --mtx-dur, --mtx-step, --mt-ease-out, --mt-modal-in
 *
 * Other files that know about it:
 *   js/main.js    staggerCards() asks MTAnim.cleanupMs() how long to keep the .mt-stagger class (slow speeds + Cascade need more
 *                 than the old fixed 900 ms, otherwise the last cards would snap to their end state);
 *                 "Reset everything" calls MTAnim.reset().
 *   html/index.html  the menu markup (#mtx-anim) and the two tags for this script / stylesheet.
 *
 * The whole menu is greyed out while Settings > Enable Animations is OFF (<html data-reduce-motion="true">), which also
 * beats every style in CSS. Plain ES5 for old CEP hosts (AE 2021 = Chromium 74).
 */
(function () {
  "use strict";

  var K_STYLE = "mtx.animStyle", K_SPEED = "mtx.animSpeed", K_EASE = "mtx.animEase";
  var root = document.documentElement;

  // dur = seconds of one card, step = ms between cards (before the Speed multiplier). Smooth = the values the panel already uses.
  var STYLES = {
    smooth:  { dur: 0.38, step: 18 },
    glide:   { dur: 0.40, step: 20 },
    pop:     { dur: 0.36, step: 22 },
    fade:    { dur: 0.30, step: 14 },
    cascade: { dur: 0.42, step: 44 },
    none:    { dur: 0,    step: 0 }
  };
  var EASES = {
    soft:   "cubic-bezier(0.22, 1, 0.36, 1)",
    even:   "cubic-bezier(0.65, 0, 0.35, 1)",
    spring: "cubic-bezier(0.34, 1.56, 0.64, 1)"
  };
  var STAGGER_MAX = 14;   // same cap as MT_STAGGER_MAX in main.js

  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { } }
  function lsDel(k) { try { localStorage.removeItem(k); } catch (e) { } }

  function getStyle() { var v = lsGet(K_STYLE); return STYLES.hasOwnProperty(v) ? v : "smooth"; }
  function getEase() { var v = lsGet(K_EASE); return EASES.hasOwnProperty(v) ? v : "soft"; }
  function getSpeed() { var n = parseInt(lsGet(K_SPEED), 10); return (n >= 50 && n <= 200) ? n : 100; }

  /* ---------- apply to <html> ---------- */
  function apply() {
    var st = getStyle(), ea = getEase(), sp = getSpeed(), k = 100 / sp, s = STYLES[st];
    var style = root.style;
    var isDefault = (st === "smooth" && ea === "soft" && sp === 100);

    if (isDefault) {
      root.removeAttribute("data-anim-style");
      root.removeAttribute("data-anim-ease");
      style.removeProperty("--mtx-k");
      style.removeProperty("--mtx-dur");
      style.removeProperty("--mtx-step");
      style.removeProperty("--mt-ease-out");
      style.removeProperty("--mt-modal-in");
      return;
    }

    root.setAttribute("data-anim-style", st);
    style.setProperty("--mtx-k", String(Math.round(k * 1000) / 1000));
    style.setProperty("--mtx-dur", s.dur + "s");
    style.setProperty("--mtx-step", s.step + "ms");

    if (ea === "soft") {
      root.removeAttribute("data-anim-ease");
      style.removeProperty("--mt-ease-out");
    } else {
      root.setAttribute("data-anim-ease", ea);
      style.setProperty("--mt-ease-out", EASES[ea]);
    }

    if (sp === 100) { style.removeProperty("--mt-modal-in"); }
    else { style.setProperty("--mt-modal-in", (Math.round(0.24 * k * 1000) / 1000) + "s"); }   // Settings window open time (0.24 s default)
  }

  // How long staggerCards() in main.js must keep .mt-stagger: last card starts at STAGGER_MAX * step, then runs dur.
  function cleanupMs() {
    var s = STYLES[getStyle()], k = 100 / getSpeed();
    return Math.max(900, Math.round((s.dur * 1000 + STAGGER_MAX * s.step) * k) + 250);
  }

  /* ---------- Glide: which way did the sidebar highlight move? ---------- */
  function readY(t) {
    var m = /,\s*(-?[\d.]+)px/.exec(t || "");
    return m ? parseFloat(m[1]) : null;
  }
  function watchDirection() {
    var ind = document.getElementById("tab-indicator");
    if (!ind || !window.MutationObserver) { return; }
    var lastY = readY(ind.style.transform);
    new MutationObserver(function () {
      var y = readY(ind.style.transform);
      if (y === null) { return; }
      if (lastY !== null && y !== lastY) { root.setAttribute("data-anim-dir", y > lastY ? "down" : "up"); }
      lastY = y;
    }).observe(ind, { attributes: true, attributeFilter: ["style"] });
  }

  /* ---------- Settings menu ---------- */
  var box;

  function qa(sel) { return box ? box.querySelectorAll(sel) : []; }

  function replay(card) {
    if (!card) { return; }
    card.classList.remove("is-play");
    void card.offsetWidth;               // restart the CSS animation
    card.classList.add("is-play");
  }

  function paint(attr, value) {
    var list = qa("[" + attr + "]"), i;
    for (i = 0; i < list.length; i++) {
      var on = list[i].getAttribute(attr) === value;
      list[i].setAttribute("aria-checked", on ? "true" : "false");
      list[i].tabIndex = on ? 0 : -1;
    }
  }

  function paintAll() {
    paint("data-anim-style-opt", getStyle());
    paint("data-anim-ease-opt", getEase());
    var sl = document.getElementById("anim-speed"), out = document.getElementById("anim-speed-val");
    if (sl) { sl.value = String(getSpeed()); sl.dispatchEvent(new Event("input")); }   // dispatch keeps the fill trail of panel-refinements.js in sync
    if (out) { out.textContent = getSpeed() + "%"; }
  }

  function syncDisabled() {
    if (!box) { return; }
    var off = root.getAttribute("data-reduce-motion") === "true";
    if (off) { box.classList.add("is-disabled"); } else { box.classList.remove("is-disabled"); }
    box.setAttribute("aria-disabled", off ? "true" : "false");
  }

  function pickStyle(name, card) {
    if (!STYLES.hasOwnProperty(name)) { return; }
    if (name === "smooth") { lsDel(K_STYLE); } else { lsSet(K_STYLE, name); }
    apply(); paint("data-anim-style-opt", name);
    replay(card);
  }
  function pickEase(name) {
    if (!EASES.hasOwnProperty(name)) { return; }
    if (name === "soft") { lsDel(K_EASE); } else { lsSet(K_EASE, name); }
    apply(); paint("data-anim-ease-opt", name);
    replay(box.querySelector('[data-anim-style-opt][aria-checked="true"]'));   // show the new easing on the chosen style
  }

  // Arrow keys move inside a radio group, like a native radio
  function arrowNav(e, attr) {
    var k = e.keyCode;
    if (k !== 37 && k !== 38 && k !== 39 && k !== 40) { return; }
    var cards = Array.prototype.slice.call(box.querySelectorAll("[" + attr + "]"));
    var i = cards.indexOf(e.currentTarget);
    if (i < 0) { return; }
    var next = (k === 37 || k === 38) ? (i + cards.length - 1) % cards.length : (i + 1) % cards.length;
    e.preventDefault();
    cards[next].focus();
    cards[next].click();
  }

  function bind() {
    box = document.getElementById("mtx-anim");
    if (!box) { return; }
    var i, cards = box.querySelectorAll("[data-anim-style-opt]"), eases = box.querySelectorAll("[data-anim-ease-opt]");

    for (i = 0; i < cards.length; i++) {
      (function (card) {
        card.addEventListener("click", function () { pickStyle(card.getAttribute("data-anim-style-opt"), card); });
        card.addEventListener("mouseenter", function () { replay(card); });
        card.addEventListener("keydown", function (e) { arrowNav(e, "data-anim-style-opt"); });
      })(cards[i]);
    }
    for (i = 0; i < eases.length; i++) {
      (function (card) {
        card.addEventListener("click", function () { pickEase(card.getAttribute("data-anim-ease-opt")); });
        card.addEventListener("keydown", function (e) { arrowNav(e, "data-anim-ease-opt"); });
      })(eases[i]);
    }

    var sl = document.getElementById("anim-speed"), out = document.getElementById("anim-speed-val");
    if (sl) {
      sl.addEventListener("input", function () {
        var n = parseInt(sl.value, 10);
        if (!(n >= 50 && n <= 200)) { return; }
        if (n === 100) { lsDel(K_SPEED); } else { lsSet(K_SPEED, String(n)); }
        if (out) { out.textContent = n + "%"; }
        apply();
      });
      sl.addEventListener("change", function () { replay(box.querySelector('[data-anim-style-opt][aria-checked="true"]')); });
    }

    var rs = document.getElementById("anim-reset");
    if (rs) { rs.addEventListener("click", function () { reset(); replay(box.querySelector('[data-anim-style-opt][aria-checked="true"]')); }); }

    paintAll();
    syncDisabled();
    // Follows Settings > Enable Animations (main.js toggles <html data-reduce-motion>)
    if (window.MutationObserver) {
      new MutationObserver(syncDisabled).observe(root, { attributes: true, attributeFilter: ["data-reduce-motion"] });
    }
  }

  function reset() {
    lsDel(K_STYLE); lsDel(K_SPEED); lsDel(K_EASE);
    apply();
    if (box) { paintAll(); }
  }

  window.MTAnim = { apply: apply, reset: reset, cleanupMs: cleanupMs, style: getStyle, speed: getSpeed, ease: getEase };

  apply();                      // before main.js builds the first tab
  watchDirection();
  if (document.readyState === "loading") { document.addEventListener("DOMContentLoaded", bind); } else { bind(); }
})();
