/**
 * smooth-scroll.js - scroll mouse-wheel yang halus (inersia) untuk SEMUA area scroll di panel.
 * ------------------------------------------------------------------------------------------
 * Kenapa perlu JS: `scroll-behavior: smooth` di CSS hanya menghaluskan scrollTo()/scrollIntoView(),
 * TIDAK roda mouse. Di CEP (Chromium 74) roda mouse melompat 100px per klik. Modul ini
 * mengumpulkan jarak roda jadi "target", lalu menggeser scrollTop ke target itu tiap frame dengan
 * easing eksponensial berbasis waktu (frame-rate independent, tidak berat: 1 rAF, 1 tulis
 * scrollTop per frame, berhenti sendiri saat sampai).
 *
 * - Punya listener wheel sendiri (capture di document) untuk SEMUA area scroll: .main, daftar
 *   preset/ekspresi, modal Settings, kotak preview kode, dll. ScrollForward di js/main.js hanya
 *   cadangan: ia melewati event yang sudah di-preventDefault, dan memanggil
 *   window.SmoothScroll.scrollBy() bila event belum ditangani.
 * - Touchpad (nilai wheelDelta bukan kelipatan 120) dibiarkan native/instan: sudah halus dari OS.
 * - Di-skip: Ctrl+wheel (zoom), Shift+wheel / geser horizontal, event yang sudah di-preventDefault
 *   (mis. slider/warna yang memakai wheel sendiri), tab Curve (.main.is-curve), dan
 *   data-reduce-motion="true" (opt-in, setting OS diabaikan - sama seperti style.css).
 * - Berhenti seketika bila user drag scrollbar / klik / sentuh / tekan tombol, atau konten
 *   diganti (ganti tab) - terdeteksi dari scrollTop yang menyimpang dari yang kita tulis.
 * Tuning: TAU (makin besar = makin lembut/lambat), STEP (pengali jarak per klik roda).
 * ES5 sengaja (CEF lama di AE 2021).
 */
(function () {
  "use strict";

  var TAU = 95;        // ms - konstanta waktu easing (~0.3-0.4s sampai berhenti)
  var STEP = 1;        // pengali jarak roda (1 = sama dengan scroll native)
  var EPS = 0.4;       // px - di bawah ini dianggap sudah sampai
  var DRIFT = 3;       // px - toleransi beda scrollTop (pembulatan) sebelum dianggap scroll dari luar

  var state = null;    // { el, pos, target, last, prevBehavior, raf }

  function now() { return (window.performance && performance.now) ? performance.now() : +new Date(); }
  function raf(fn) { return (window.requestAnimationFrame || function (f) { return setTimeout(f, 16); })(fn); }
  function caf(id) { (window.cancelAnimationFrame || clearTimeout)(id); }

  function disabled() {
    return document.documentElement.getAttribute("data-reduce-motion") === "true";
  }
  function maxScroll(el) { return Math.max(0, el.scrollHeight - el.clientHeight); }

  function stop() {
    if (!state) { return; }
    caf(state.raf);
    state.el.style.scrollBehavior = state.prevBehavior;   // kembalikan `scroll-behavior: smooth` dari CSS
    state = null;
  }

  function frame(t) {
    if (!state) { return; }
    var s = state, el = s.el;
    var dt = Math.min(64, Math.max(1, t - s.t0));
    s.t0 = t;

    // scrollTop berubah dari luar (drag scrollbar, ganti tab, scrollIntoView) -> lepaskan.
    if (Math.abs(el.scrollTop - s.last) > DRIFT) { stop(); return; }

    var max = maxScroll(el);
    if (s.target > max) { s.target = max; }
    if (s.target < 0) { s.target = 0; }

    var diff = s.target - s.pos;
    if (Math.abs(diff) <= EPS) {
      el.scrollTop = s.target;
      stop();
      return;
    }
    s.pos += diff * (1 - Math.exp(-dt / TAU));
    el.scrollTop = s.pos;
    s.last = el.scrollTop;
    s.raf = raf(frame);
  }

  function pixels(e, el) {
    var d = e.deltaY;
    if (e.deltaMode === 1) { d *= 40; }                    // baris
    else if (e.deltaMode === 2) { d *= el.clientHeight; }  // halaman
    return d;
  }

  function isTouchpad(e) {
    // Roda mouse: wheelDeltaY kelipatan 120. Touchpad presisi: nilai kecil/acak.
    var w = e.wheelDeltaY;
    return !!w && (w % 120 !== 0);
  }

  // Scroll `el` mengikuti event roda `e`. Return true bila event ditangani (caller memanggil preventDefault).
  function scrollBy(el, e) {
    if (!el || e.ctrlKey || e.shiftKey || e.defaultPrevented) { return false; }
    if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) { return false; }   // geser horizontal: native
    var dy = pixels(e, el) * STEP;
    if (!dy) { return false; }

    if (disabled() || isTouchpad(e)) {
      // Touchpad / reduce-motion: instan (tetap lewat sini supaya perilaku ScrollForward lama sama).
      stop();
      var pb = el.style.scrollBehavior;
      el.style.scrollBehavior = "auto";
      el.scrollTop += dy;
      el.style.scrollBehavior = pb;
      return true;
    }

    if (!state || state.el !== el || Math.abs(el.scrollTop - state.last) > DRIFT) {
      stop();
      state = { el: el, pos: el.scrollTop, target: el.scrollTop, last: el.scrollTop,
                prevBehavior: el.style.scrollBehavior, t0: now(), raf: 0 };
      el.style.scrollBehavior = "auto";   // kalau tidak, tiap tulis scrollTop ikut di-animasikan CSS dan bentrok
      state.raf = raf(frame);
    }
    var max = maxScroll(el);
    state.target = Math.min(max, Math.max(0, state.target + dy));
    return true;
  }

  // Cari elemen scroll vertikal terdekat yang MASIH bisa bergerak ke arah roda (scroll chaining).
  function findScroller(start, dy) {
    var el = start;
    while (el && el.nodeType === 1 && el !== document.documentElement) {
      var cs = getComputedStyle(el);
      var oy = cs.overflowY;
      if ((oy === "auto" || oy === "scroll") && el.scrollHeight > el.clientHeight + 1) {
        var pos = (state && state.el === el) ? state.target : el.scrollTop;
        var canDown = pos + el.clientHeight < el.scrollHeight - 1;
        var canUp = pos > 0;
        if ((dy > 0 && canDown) || (dy < 0 && canUp)) { return el; }
      }
      el = el.parentNode;
    }
    return null;
  }

  function onWheel(e) {
    if (e.defaultPrevented || e.ctrlKey || e.shiftKey) { return; }
    var main = document.getElementById("main");
    if (main && main.classList.contains("is-curve") && main.contains(e.target)) { return; }   // NeuCurve: jangan ganggu
    if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) { return; }
    var dir = e.deltaY;
    if (!dir) { return; }
    var el = findScroller(e.target, dir);
    if (!el) { return; }
    if (scrollBy(el, e)) { e.preventDefault(); }
  }

  document.addEventListener("wheel", onWheel, { passive: false, capture: true });
  // Berhenti hanya untuk interaksi yang benar-benar mengambil alih scroll: drag scrollbar, atau
  // tombol scroll keyboard (PgUp/PgDn/End/Home/panah). Klik biasa pada kartu TIDAK menghentikan glide.
  document.addEventListener("mousedown", function (e) {
    if (state && e.target === state.el && e.offsetX >= state.el.clientWidth) { stop(); }
  }, true);
  document.addEventListener("keydown", function (e) {
    if (state && e.keyCode >= 33 && e.keyCode <= 40) { stop(); }
  }, true);

  window.SmoothScroll = { scrollBy: scrollBy, stop: stop };
})();
