/*!
 * panel-refinements.js - Grouped capsule cards (Feature B) + range slider fill-trail /
 * floating value bubble (Feature E) + per-card accent-color context menu (Feature F).
 *
 * Feature C (button pending/success/error state) is NOT in this file - it hooks straight into
 * the existing Bridge/is-loading call sites in js/main.js, so it lives there instead (see the
 * flashButtonResult() comment in main.js).
 *
 * Feature B exposes window.PanelRefinements.groupifyTaSections() - main.js's showTab()
 * dispatcher (js/main.js) calls it once, centrally, on every tab's rendered root element right
 * after it's appended to the panel, so every tab gets the collapsible-card treatment
 * automatically. It's a safe no-op on tabs with no ".ta-section" children (Info, the plain tool
 * grids) or where sections were already moved into groups by the time it runs.
 *
 * Feature E needs no per-tab wiring at all: it binds itself to every input[type="range"]
 * already in the document plus any added later (dynamic sliders, tab switches, the Settings
 * modal) via one MutationObserver.
 *
 * Feature F also needs no separate wiring: groupifyTaSections() (Feature B) calls straight into
 * it for every card it builds, right-clicking a card's header or empty padding opens a small
 * swatch menu to override that one card's left-edge accent color (persisted in localStorage).
 *
 * ES5 on purpose (older CEF builds bundled with CEP - see README.txt "AE 2021 COMPATIBILITY
 * FIX"); no dependencies. Loaded last in html/index.html, after main.js and falling-stars.js.
 */
(function () {
  "use strict";

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  // ============================================================================
  // Feature B - Grouped capsule cards
  // ============================================================================
  // Wraps every top-level ".ta-section" child of `container` into a collapsible ".ta-group"
  // capsule (colored left accent cycling by DOM order, a header button with a live
  // control-count badge, and a precise scrollHeight-based open/close - the same technique
  // main.js's own Settings > Easy Layer Label accordion already uses, so the motion matches
  // the rest of the app). Purely a DOM re-parenting pass: every existing id/element inside a
  // section is MOVED, never cloned, so any querySelector/getElementById/addEventListener the
  // caller already relies on (whether wired before or after this runs) keeps working exactly
  // as before.
  // `opts.openFirst` (default true) leaves the first group expanded so the tab never opens
  // looking empty. `opts.tabId` (optional) is folded into each group's accent-color storage
  // key (see Feature F below) so two different tabs that happen to have a same-named section
  // don't share one saved color.
  // Open/closed state of every capsule card, keyed "tabId::label". Kept in memory only: a tab's panel is
  // rebuilt on every tab switch, so without this a card the person opened (e.g. "Presets") would snap
  // shut when they come back, while a fresh After Effects start still begins with the default layout.
  var groupOpenState = {};

  function groupifyTaSections(container, opts) {
    if (!container) { return; }
    opts = opts || {};
    var openFirst = opts.openFirst !== false;
    var tabId = opts.tabId || "tab";
    var sections = Array.prototype.slice.call(container.querySelectorAll(":scope > .ta-section"));

    sections.forEach(function (section, i) {
      var heading = section.querySelector(".ta-title");
      var label = heading ? heading.textContent.replace(/\s+/g, " ").trim() : "Section";
      var stateKey = tabId + "::" + label;
      var willOpen = groupOpenState.hasOwnProperty(stateKey) ? groupOpenState[stateKey] : (openFirst && i === 0);

      var group = document.createElement("div");
      group.className = "ta-group" + (willOpen ? " is-open" : "");

      var head = document.createElement("button");
      head.type = "button";
      head.className = "ta-group-head";
      head.setAttribute("aria-expanded", willOpen ? "true" : "false");
      head.innerHTML =
        '<span class="ta-group-label">' + escapeHtml(label) + "</span>" +
        '<svg class="ta-group-chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>';

      var body = document.createElement("div");
      body.className = "ta-group-body";
      body.setAttribute("aria-hidden", willOpen ? "false" : "true");
      var inner = document.createElement("div");
      inner.className = "ta-group-body-inner";

      // The original <h2 class="ta-title"> stays in the DOM (still findable by anything that
      // queries it) but hidden - the new header button above already shows its text.
      if (heading) { heading.style.display = "none"; }
      while (section.firstChild) { inner.appendChild(section.firstChild); }
      body.appendChild(inner);
      group.appendChild(head);
      group.appendChild(body);
      section.parentNode.replaceChild(group, section);

      if (willOpen) { body.style.maxHeight = "none"; }

      // Same "pin height -> flip class -> animate" pattern as initLabelAccordion in main.js:
      // max-height auto can't be transitioned in older CEF builds, so it is set explicitly on
      // open/close and released back to "none" once the open transition finishes, so content
      // that grows later (e.g. a dynamically-added slider) is never clipped by a stale value.
      body.addEventListener("transitionend", function (e) {
        if (e.target === body && e.propertyName === "max-height" && group.classList.contains("is-open")) {
          body.style.maxHeight = "none";
        }
      });

      head.addEventListener("click", function () {
        var opening = !group.classList.contains("is-open");
        if (opening) {
          group.classList.add("is-open");
          body.style.maxHeight = body.scrollHeight + "px";
          // Fallback: "transitionend" never fires when the transition is disabled/interrupted
          // (prefers-reduced-motion, no height change, tab hidden...), which would leave the
          // pixel max-height pinned and clip anything that grows later (e.g. an expanded preset
          // folder). Release it after the transition time regardless.
          clearTimeout(body._releaseTimer);
          body._releaseTimer = setTimeout(function () {
            if (group.classList.contains("is-open")) { body.style.maxHeight = "none"; }
          }, 450);
        } else {
          clearTimeout(body._releaseTimer);
          body.style.maxHeight = body.scrollHeight + "px";
          void body.offsetHeight; // commit the pinned height before animating to 0
          group.classList.remove("is-open");
          body.style.maxHeight = "0px";
        }
        head.setAttribute("aria-expanded", String(opening));
        body.setAttribute("aria-hidden", String(!opening));
        groupOpenState[stateKey] = opening;
      });

      // Feature F: right-click accent color override for this card - see below.
      var accentKey = tabId + "::" + label;
      applyStoredAccent(group, accentKey);
      wireAccentMenu(group, accentKey);
    });
  }

  window.PanelRefinements = window.PanelRefinements || {};
  window.PanelRefinements.groupifyTaSections = groupifyTaSections;

  // ============================================================================
  // Feature F - Custom accent-color context menu for capsule cards (".ta-group")
  // ============================================================================
  // Right-click any card built by groupifyTaSections() above (the same colored-left-edge
  // capsules that wrap ExpressFlex-style tool groups, Project Cleaner, Beat Marker, etc.)
  // to pick a custom accent color for that one card, overriding the automatic nth-of-type
  // cycle. One shared menu is built lazily and reused for every card, the same pattern as
  // main.js's own ShortcutzMenu. Colors persist in one JSON blob in localStorage, keyed by
  // "<tabId>::<card label>", so they survive tab switches and panel reloads.
  //
  // Right-clicking an actual form control inside the card (a slider, a text field, the
  // Apply button...) is left alone - only the header and empty card padding open this menu -
  // so the card's own inputs keep their native browser context menu (cut/copy/paste, etc.).
  var ACCENT_STORE_KEY = "mtx.taGroupAccent";
  var ACCENT_PRESETS = [
    { color: "#5ea1ff", name: "Blue" },
    { color: "#ff9f5e", name: "Orange" },
    { color: "#a85eff", name: "Purple" },
    { color: "#00e676", name: "Green" },
    { color: "#ff5e5e", name: "Red" }
  ];

  var AccentColor = {
    _cache: null,
    _load: function () {
      if (this._cache) { return this._cache; }
      try {
        var v = JSON.parse(localStorage.getItem(ACCENT_STORE_KEY) || "{}");
        this._cache = (v && typeof v === "object") ? v : {};
      } catch (e) { this._cache = {}; }
      return this._cache;
    },
    get: function (key) { return this._load()[key] || null; },
    set: function (key, color) {
      var all = this._load();
      if (color) { all[key] = color; } else { delete all[key]; }
      this._cache = all;
      try { localStorage.setItem(ACCENT_STORE_KEY, JSON.stringify(all)); } catch (e) {}
    }
  };

  function applyStoredAccent(group, key) {
    var c = AccentColor.get(key);
    group.style.borderLeftColor = c || ""; // "" releases back to the CSS nth-of-type default
  }

  // True if `el` (or an ancestor up to but not including `boundary`) is a real form control -
  // i.e. anything except the card's own header button, which should still open this menu.
  function isInteractiveTarget(el, boundary) {
    var node = el;
    while (node && node !== boundary) {
      if (node.nodeType === 1) {
        var tag = node.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || tag === "A" ||
            (tag === "BUTTON" && !(node.classList && node.classList.contains("ta-group-head")))) {
          return true;
        }
      }
      node = node.parentNode;
    }
    return false;
  }

  var AccentMenu = {
    built: false, el: null, colorInput: null, target: null, targetKey: null,

    build: function () {
      if (this.built) { return; }
      this.built = true;
      var self = this;

      var el = document.createElement("div");
      el.id = "accent-ctx-menu";
      el.className = "ctx-menu ctx-menu--accent";
      el.setAttribute("role", "menu");
      el.setAttribute("aria-hidden", "true");
      el.innerHTML =
        '<div class="ctx-menu-label">Change Accent Color</div>' +
        '<div class="accent-swatch-row">' +
          ACCENT_PRESETS.map(function (p) {
            return '<button class="accent-swatch" type="button" role="menuitem" data-color="' + p.color +
              '" style="background:' + p.color + '" title="' + p.name + '" aria-label="' + p.name + '"></button>';
          }).join("") +
          '<button class="accent-swatch accent-swatch--custom" type="button" role="menuitem" id="accent-custom-btn" title="Custom Color" aria-label="Custom Color">' +
            '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/></svg>' +
          '</button>' +
        '</div>' +
        '<div class="ctx-menu-sep"></div>' +
        '<button class="ctx-item" role="menuitem" id="accent-reset-btn" type="button">Reset to Default</button>';
      document.body.appendChild(el);
      this.el = el;

      // Hidden native color input (Option A from the spec) - kept off-screen and opened via
      // .click() from the swatch row's "Custom Color" button instead of being shown directly.
      var colorInput = document.createElement("input");
      colorInput.type = "color";
      colorInput.value = "#ff9f5e";
      colorInput.setAttribute("aria-hidden", "true");
      colorInput.tabIndex = -1;
      colorInput.style.cssText = "position:fixed;left:-9999px;top:-9999px;width:0;height:0;opacity:0;pointer-events:none;";
      document.body.appendChild(colorInput);
      this.colorInput = colorInput;

      Array.prototype.forEach.call(el.querySelectorAll(".accent-swatch[data-color]"), function (btn) {
        btn.addEventListener("click", function () {
          self.apply(btn.getAttribute("data-color"));
          self.close();
        });
      });
      el.querySelector("#accent-custom-btn").addEventListener("click", function () {
        try { self.colorInput.click(); } catch (e) {}
      });
      colorInput.addEventListener("input", function () { self.apply(colorInput.value); });
      colorInput.addEventListener("change", function () { self.close(); });

      el.querySelector("#accent-reset-btn").addEventListener("click", function () {
        self.apply(null);
        self.close();
      });

      document.addEventListener("mousedown", function (e) {
        if (self.el.contains(e.target) || e.target === self.colorInput) { return; }
        self.close();
      });
      document.addEventListener("keydown", function (e) { if (e.key === "Escape") { self.close(); } });
      window.addEventListener("blur", function () { self.close(); });
      window.addEventListener("resize", function () { self.close(); });
      // Scrolling anything (the panel, a nested list) closes the menu; capture = true because scroll doesn't bubble.
      document.addEventListener("scroll", function () { self.close(); }, true);
      document.addEventListener("mtx:ctx-open", function (e) { if (!e.detail || e.detail.id !== "accent") { self.close(); } });
    },

    apply: function (color) {
      if (!this.target || !this.targetKey) { return; }
      this.target.style.borderLeftColor = color || "";
      AccentColor.set(this.targetKey, color);
    },

    open: function (x, y, group, key) {
      this.build();
      document.dispatchEvent(new CustomEvent("mtx:ctx-open", { detail: { id: "accent" } }));   // close any other menu first
      this.target = group;
      this.targetKey = key;
      this.el.classList.add("is-open");
      this.el.setAttribute("aria-hidden", "false");
      var w = this.el.offsetWidth, h = this.el.offsetHeight;
      var px = Math.max(4, Math.min(x, window.innerWidth - w - 4));
      var py = Math.max(4, Math.min(y, window.innerHeight - h - 4));
      this.el.style.left = px + "px";
      this.el.style.top = py + "px";
    },

    close: function () {
      if (!this.el) { return; }
      this.el.classList.remove("is-open");
      this.el.setAttribute("aria-hidden", "true");
    }
  };

  function wireAccentMenu(group, key) {
    group.addEventListener("contextmenu", function (e) {
      // A tile inside the card (Shortcutz rows etc.) already opened its own menu and called preventDefault -
      // the event then bubbles up here. Without this check BOTH menus opened at the same spot and overlapped
      // (the "Change Accent Color" menu stacked on top of the Shortcutz menu).
      if (e.defaultPrevented) { return; }
      if (e.target.closest && e.target.closest(".shortcut-tile, [data-sc-run], [data-sc-builtin]")) { return; }
      if (isInteractiveTarget(e.target, group)) { return; } // real controls keep their native menu
      e.preventDefault();
      AccentMenu.open(e.clientX, e.clientY, group, key);
    });
  }

  // ============================================================================
  // Feature E - Range slider fill-trail + floating value bubble
  // ============================================================================
  // Fully delegated: binds itself to every input[type="range"] currently in the document AND
  // any added later (dynamic Text Animation / Power Boosters sliders, Settings modal, tab
  // switches) via one lightweight MutationObserver, so nothing elsewhere needs to call an init
  // function per slider or per tab.
  var activeBubbleSlider = null;
  var bubbleEl = null;

  function ensureBubble() {
    if (bubbleEl) { return bubbleEl; }
    bubbleEl = document.createElement("div");
    bubbleEl.className = "range-value-bubble";
    bubbleEl.setAttribute("aria-hidden", "true");
    document.body.appendChild(bubbleEl);
    return bubbleEl;
  }

  function updateFill(input) {
    var min = parseFloat(input.min);
    if (!isFinite(min)) { min = 0; }
    var max = parseFloat(input.max);
    if (!isFinite(max)) { max = 100; }
    var val = parseFloat(input.value);
    if (!isFinite(val)) { val = min; }
    var pct = max > min ? ((val - min) / (max - min)) * 100 : 0;
    pct = Math.max(0, Math.min(100, pct));
    input.style.setProperty("--_pct", pct + "%");
    return pct;
  }

  function positionBubble(input, pct) {
    var rect = input.getBoundingClientRect();
    var b = ensureBubble();
    b.textContent = input.value;
    // Clamp so the bubble can't overshoot the slider's own left/right edge on the first/last tick.
    var x = rect.left + (rect.width * pct / 100);
    x = Math.max(rect.left + 8, Math.min(rect.right - 8, x));
    b.style.left = x + "px";
    b.style.top = rect.top + "px";
  }

  function showBubble(input) {
    activeBubbleSlider = input;
    var pct = updateFill(input);
    positionBubble(input, pct);
    ensureBubble().classList.add("is-visible");
  }
  function hideBubble() {
    activeBubbleSlider = null;
    if (bubbleEl) { bubbleEl.classList.remove("is-visible"); }
  }

  function initSlider(input) {
    if (input.__rfBound) { return; }
    input.__rfBound = true;
    input.classList.add("rf-slider");
    updateFill(input);
  }

  function scanForSliders(root) {
    var list = (root.nodeType === 1 ? root : document).querySelectorAll('input[type="range"]');
    Array.prototype.forEach.call(list, initSlider);
  }

  // FIX (sliders looked "buggy" right after the panel opened): the fill-trail (--_pct) used to be updated ONLY
  // from the user's own `input` events. Setting `slider.value = x` from JavaScript fires no event, so every
  // programmatic change left the fill stale while the thumb moved: the saved background opacity / zoom /
  // position restored at startup (main.js runs on DOMContentLoaded, AFTER this file's first scan, which had
  // read the HTML defaults), the Reset button, and dragging / wheel-zooming the background itself.
  // Hooking the `value` setter once keeps every range slider (current and future) in sync, with no
  // per-slider calls needed in main.js.
  (function hookRangeValueSetter() {
    try {
      var proto = window.HTMLInputElement && window.HTMLInputElement.prototype;
      var desc = proto && Object.getOwnPropertyDescriptor(proto, "value");
      if (!desc || !desc.set || !desc.get || proto.__rfValueHooked) { return; }
      Object.defineProperty(proto, "value", {
        configurable: true,
        enumerable: desc.enumerable,
        get: function () { return desc.get.call(this); },
        set: function (v) {
          desc.set.call(this, v);
          if (this.type === "range") {
            var pct = updateFill(this);
            if (activeBubbleSlider === this) { positionBubble(this, pct); }
          }
        }
      });
      proto.__rfValueHooked = true;
    } catch (err) { /* worst case: falls back to the safety-net resync below */ }
  })();

  // Safety net: once everything has booted (main.js init + restored settings), re-read every slider once.
  function resyncAllSliders() {
    var list = document.querySelectorAll('input[type="range"]');
    Array.prototype.forEach.call(list, function (el) { initSlider(el); updateFill(el); });
  }
  window.addEventListener("load", function () { resyncAllSliders(); setTimeout(resyncAllSliders, 250); });
  window.__rfResyncSliders = resyncAllSliders;
  window.__rfUpdateFill = function (el) { if (el) { initSlider(el); updateFill(el); } };   // explicit call, independent of the value-setter hook

  document.addEventListener("input", function (e) {
    var t = e.target;
    if (!t || t.tagName !== "INPUT" || t.type !== "range") { return; }
    initSlider(t);
    var pct = updateFill(t);
    if (activeBubbleSlider === t) { positionBubble(t, pct); }
  });
  ["pointerdown", "mousedown", "touchstart"].forEach(function (evt) {
    document.addEventListener(evt, function (e) {
      var t = e.target;
      if (!t || t.tagName !== "INPUT" || t.type !== "range") { return; }
      initSlider(t);
      showBubble(t);
    }, { passive: true });
  });
  ["pointerup", "mouseup", "touchend", "touchcancel"].forEach(function (evt) {
    document.addEventListener(evt, function () {
      if (activeBubbleSlider) { hideBubble(); }
    });
  });
  window.addEventListener("blur", hideBubble);

  scanForSliders(document);
  var sliderObserver = new MutationObserver(function (mutations) {
    for (var i = 0; i < mutations.length; i++) {
      var added = mutations[i].addedNodes;
      for (var j = 0; j < added.length; j++) {
        var node = added[j];
        if (node.nodeType !== 1) { continue; }
        if (node.matches && node.matches('input[type="range"]')) { initSlider(node); }
        if (node.querySelectorAll) { scanForSliders(node); }
      }
    }
  });
  sliderObserver.observe(document.body, { childList: true, subtree: true });
})();
