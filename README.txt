Multi Tool - After Effects CEP panel
====================================

INSTALL
1. Copy the whole "MultiTool" folder to:
   Windows: C:\Users\<you>\AppData\Roaming\Adobe\CEP\extensions\
   macOS:   ~/Library/Application Support/Adobe/CEP/extensions/
2. Enable unsigned extensions (once):
   Windows registry: HKEY_CURRENT_USER\Software\Adobe\CSXS.<version>  ->  PlayerDebugMode = "1" (String)
   macOS: defaults write com.adobe.CSXS.<version> PlayerDebugMode 1
   (CSXS version: 10 for After Effects 2021, 9 for 2019-2020, 11 for 2022+)
3. Restart After Effects -> Window > Extensions > Multi Tool.

DEBUG: open http://localhost:8088 in Chrome (port set in .debug).

CURVE TAB (NeuCurve)
The "Curve" tab hosts the full NeuCurve tool (folder "neucurve/"). Its Settings popup and
Graph Editor open as separate windows and are registered in CSXS/manifest.xml. If you still
have the standalone NeuCurve extension installed, remove it so the two do not both run.
Extra debug ports: 8089 (Curve settings), 8090 (Curve graph editor).

CURVE TAB BACKGROUND
---------------------
The Curve tab is always solid now - it no longer turns transparent to show the panel's background image / GIF /
video through it, and ignores the Settings > Background opacity slider entirely. It keeps NeuCurve's own native
dark look (#0a0a0a body, #0e0e0e graph canvas, #1a1a1a panels/side column, #141414 rails), same as the stand-alone
windows (Settings popup, Graph Editor). This used to work the other way (transparent, matching every other tab) via
a "mt-embed-bg" veil style block + a stricter "mt-embed-transparent" style block + a JS backstop in
neucurve/index.html - all three were removed on purpose. If transparency is ever wanted back, restore that block
from an earlier copy of index.html rather than rebuilding it from scratch.

CURVE TAB ADJUSTABLE BACKGROUND (supersedes "CURVE TAB BACKGROUND" above)
------------------------------------------------------------------------
NeuCurve Settings (gear icon) > Graph Background: choose the image/GIF, then press "Adjust Background". It opens
a "Display" editor like the MultiTool one: Opacity, Zoom (100-300%), Position X / Y, Reset, Done. Drag the
background to move it, scroll to zoom, Esc = Done. The old plain opacity slider was removed; opacity now
defaults to 100% (Reset returns everything to 100% / 100% / 50% / 50%).
neucurve/nc-bg.js + nc-bg.css draw the background behind the graph in the Curve tab / graph window and sync live
from the Settings window (localStorage neucurve_bgImagePath / bgOpacity / bgZoom / bgPosX / bgPosY + the
com.neucurve.sync event). With no image chosen the tab stays solid. The compiled bundle (assets/index.js) was
patched in two places only: the opacity slider block became the "Adjust Background" button, and the opacity
default changed 0.2 -> 1 (plus window.__ncBgStores so the editor can drive the existing opacity store).

CURVE TAB OVERSHOOT TOGGLE
--------------------------
NeuCurve Settings has an "Allow Overshoot" switch (default ON = previous behavior). OFF: the Bezier handles and
the Custom-curve anchors/handles can no longer be dragged above 1 or below 0 (the graph stays inside the box),
and turning it OFF pulls any existing out-of-range Bezier/Custom values back into 0..1. Stored as
localStorage neucurve_overshoot and synced between windows like the other NeuCurve settings. Elastic / Bounce /
Wave are overshoot BY DEFINITION and are not affected. Bundle patch: Zo() clamp helper replaces the y-clamps
in the drag code of assets/index.js (search "Zo(" / "ncOvEl").

CURVE TAB BACKGROUND GRADIENT + HANDLE STYLE
--------------------------------------------
NeuCurve Settings (gear icon) has two more sections (built by neucurve/nc-extras.js, styled by nc-extras.css,
mounted into the Settings page through window.__ncExtraUI() from the one-line hook in assets/index.js):
- Background Gradient: on/off, Color 1, Color 2, Direction (0-360 deg), Intensity (0-100%). Drawn behind the graph
  (below the Graph Background image, which stays on top of it).
- Handle Style: Circle (default) / Heart / Square / Diamond / Star / PNG-GIF image, Size (2-9, default 4.5),
  Line thickness (0.5-6, default 1.2) and a Reset button. Works on the Bezier / Custom handles and on the
  Elastic / Bounce / Wave / Steps handles. Hit area (dragging) is unchanged. With the defaults nothing is replaced.
  "PNG / GIF": choose a file (animated GIF supported); path is stored like the Graph Background path.
localStorage keys (prefix neucurve_): gradOn gradC1 gradC2 gradDir gradInt hStyle hSize hLine hImg.

CURVE TAB PREVIEW-DOT COLOR
----------------------------
neucurve/nc-theme-sync.css also re-colors the value-preview strip's scrubbing dot (".ball") and its trail from
--mt-accent (they were hardcoded blue in the compiled bundle and never read --ui-color/--accent like the rest of
NeuCurve does). Same theming pipeline as everything else - see nc-theme-sync.js/.css.

CURVE TAB ICON SIZE
-------------------
neucurve/nc-icons.css sets the tool-row icons to 18px glyphs (26px buttons) and the APPLY-row buttons (download / close / settings).
All sizes are CSS variables at the top of that file (--nc-icon-btn, --nc-icon-svg, --nc-util-btn, ...).

CURVE GLOW
----------
- Main graph curve: neucurve/nc-glow.js. AE's embedded Chromium does not render CSS filter/drop-shadow on SVG paths,
  so the glow is drawn with 4 stacked, wider, low-opacity strokes (<g class="nc-glow"> inserted before the curve path).
  It copies the curve's "d" and "stroke", so it follows dragging and the curve color. Tune LAYERS at the top of the file.
  To switch it off, remove the <script src="./nc-glow.js"> line in neucurve/index.html.
- Preset thumbnails (<canvas>): neucurve/assets/index.js has a small patch (search for globalAlpha=.06) that draws
  3 wider, faint strokes under the curve. If the bundle is rebuilt or replaced, re-apply it.

CURVE PARTICLES
---------------
neucurve/nc-particles.js draws soft circle particles that fall from the top of the lower area (tool row + APPLY row +
Library) and fade out. One click-through <canvas>, clipped to ".action-container" + ".variable-section" (measured live,
so it follows resizing / divider drag / landscape). Tune density, size, speed, opacity, color in CONFIG at the top of the
file. Off: remove the <script src="./nc-particles.js"> line in neucurve/index.html.

APPLY BUTTON GLOW
-----------------
Soft white top-highlight (like the "Auto Parent" toggle-row reference: a bright edge along the top fading down,
no color, no spin) that slowly breathes in and out (2.6s, faster on hover: 1.3s), patched into
neucurve/assets/index.js - search for "apply-glow-breathe". Replaced the earlier spinning cyan conic-gradient ring.
Tune speed/strength: the 2.6s / 1.3s durations, and the box-shadow alpha values (.14/.3 at rest, .32/.65 at peak) in
the @keyframes block. If the bundle is rebuilt or replaced, re-apply the patch.

AE 2021 COMPATIBILITY FIX (CSXS 10 / Chromium 74)
--------------------------------------------------
The panel's UI used to look broken on After Effects 2021 (spacing collapsed, tool tiles
not square, idle-clock text mis-sized) while looking fine on AE 2022+. Root cause: AE 2021
ships CEP 10, whose embedded Chromium is version 74 (2019), which predates several CSS
features this panel's CSS relies on:
  - `gap` on flex containers          -> shipped in Chrome 84 (2020)
  - `aspect-ratio`                    -> shipped in Chrome 88 (2021)
  - `clamp()` / `min()` / `max()`     -> shipped in Chrome 79 (2019)
  - the `inset` shorthand             -> shipped in Chrome 87 (2020)
On Chromium 74 those declarations are either inert or fully invalid, which is what made
the layout collapse (spacing gone, tiles not square, full-screen overlays not covering
their container, idle-clock fonts wrong size).

Fixes applied (UI/visuals themselves were NOT changed - these only restore compatibility):
  1. `inset: 0` -> replaced with explicit `top/right/bottom/left: 0` everywhere (css/style.css
     and the one occurrence inside neucurve/assets/index.js). Identical result on every
     Chromium version, so nothing changes on AE 2022+.
  2. New file js/ae2021-compat.js: a small, self-contained runtime shim, included in both
     html/index.html and neucurve/index.html. It feature-detects flex-gap and aspect-ratio
     support on load; on a host that already supports them (AE 2022+) it does nothing at
     all. On an old host (AE 2021) it:
       - converts every `gap`/`row-gap`/`column-gap` flex declaration into equivalent
         margins between the existing children (no markup changes, same visual spacing),
       - keeps every `aspect-ratio` element square via a ResizeObserver-driven inline
         `height`,
       - re-applies both automatically whenever the panel's DOM changes (tab switches,
         dynamic lists, NeuCurve's own re-renders) and on window resize.
  3. css/style.css: added an `@supports not (width: clamp(1px,1px,1px))` fallback block
     (bottom of the file) giving the idle-clock text and the sidebar tab gap plain static
     values for hosts that can't parse clamp()/min() at all. Skipped entirely on any host
     that supports them, so AE 2022+ is unaffected.

Tested by loading the panel (and clicking through every tab, including Curve/NeuCurve) in
a modern headless Chromium with the compat script's detection logic force-disabled to
verify the fallback math (margins/heights) matches the native gap/aspect-ratio layout
exactly, and separately confirming the script no-ops with zero DOM changes and zero
console errors when real support is detected (the normal AE 2022+/2024 case).

SHORTCUTZ TAB
-------------
New "Shortcutz" tab: a Speed Dial / Favorites Hub.
- Expression Shortcuts / Quick Effect Shortcuts / Utility Shortcuts: fixed built-in cards, always
  present (host.jsx: SHTZ_addEffect, SHTZ_autoParentToTop; also reuses EXPR_applyCode, AA_setAnchor,
  TOOLS_convertAudioToKeyframes).
- Pin icon added to cards in Animation Presets (presets) and Code Expression (saved snippets) - pins
  that .ffx / expression into Shortcutz's "My Shortcuts" grid (js/main.js: Shortcutz.pinFfx / pinExpr).
- "+ Add Custom Shortcut": Name, Type (Expression / .ffx Path / JSX Script), Color Accent. .ffx Path
  has a Browse button (host.jsx: SHTZ_pickFfxFile). JSX Script runs via host.jsx: SHTZ_runCustomScript,
  wrapped in its own Undo Group.
- Everything in "My Shortcuts" persists in localStorage ("mtx.shortcutz.items") and can be dragged to
  reorder. The x on a tile only unpins/removes the shortcut - it never touches the original preset
  file or saved snippet.
- Tiles use the same rotating "saber" glow border as elsewhere (see CURVE GLOW note above), but as a
  hover/focus-only variant (.saber-wrap--tile) so an idle grid of many tiles isn't all glowing at once.

EXPRESSION CODE - FILE-BASED PERSISTENCE (survives uninstall/reinstall/update)
-------------------------------------------------------------------------------
Custom expression snippets used to live only in localStorage, which is wiped whenever the
extension folder is deleted, updated, or reinstalled. They now also get mirrored to a plain
JSON file in the user's Documents folder:
  ~/Documents/Multitool_CEP_Data/saved_expressions.json

- host.jsx: _exprFilePaths/_ensureExpressionsFile create the folder + file on first run.
  saveExpressionsToFile(jsonString) / loadExpressionsFromFile() do the raw file I/O (both wrapped
  in try/catch, both fail soft). Bridge-facing wrappers: EXPR_FILE_init, EXPR_FILE_load,
  EXPR_FILE_save, EXPR_FILE_backupExport (Settings > "Backup Expressions", native Save dialog),
  EXPR_FILE_backupImport (Settings > "Import Expressions", native Open dialog).
- js/main.js: ExprFile module. exprCatStore.save() is wrapped so every add/edit/delete/favorite/
  category change also fires EXPR_FILE_save in the background. On panel boot and every time the
  Expression Code tab is opened, ExprFile.restoreIfNeeded() checks whether localStorage's snippet
  store is empty (fresh install) and, if so, restores it from the JSON file automatically.
- Settings modal: new "Expression Backups" field with the two manual buttons described above.

All file I/O is best-effort - if Documents isn't writable or the file gets locked, the panel just
keeps working off localStorage as before and shows a toast/console warning instead of crashing.

BUGFIX - "Function parts.some is undefined" WHEN APPLYING ANIMATION PRESETS
-----------------------------------------------------------------------------
jsx/host.jsx's _preFind() (used by PRE_apply / PRE_delete to resolve a chosen .ffx file, including
ones inside a preset subfolder) validated the path with parts.some(...). ExtendScript's ES3 engine
has no Array.prototype.some, so applying/deleting any preset threw "Function parts.some is
undefined" at runtime. Replaced with a plain ES3 for-loop helper, _arrayHasInvalidPart(arr), that
does the same "reject empty/'.'/'..' segments" check. Confirmed this was the only ES6+ array method
(.some/.find/.includes/.filter) anywhere in host.jsx.

BUGFIX - MOUSE WHEEL SCROLL BLOCKED OVER CARDS/TILES/BUTTONS (all tabs except NeuCurve)
-----------------------------------------------------------------------------------------
Reported: scrolling only worked with the cursor over empty background: hovering any card, tile,
tool button or inner box swallowed the wheel event instead of letting it reach the panel's scroll
container. Audited every overflow declaration and every wheel/stopPropagation/preventDefault call
in css/style.css and js/main.js - no CSS overflow rule or JS handler here was actually capturing
wheel input (the various overflow:hidden uses are all for rounded-corner/text clipping, not scroll
containers), which points to CEP's underlying CEF build occasionally swallowing wheel events once
the pointer is over a native form control (button/input) instead of bubbling them, rather than a
markup bug.
Fix: js/main.js, new ScrollForward module (wired in on DOMContentLoaded). A single document-level
"wheel" listener in the CAPTURE phase (so it always runs first, regardless of what's under the
cursor) walks up from the event target looking for a genuine nested scroll area (open accordion,
the expression-code preview box, ...); if none is found, or the one found is already scrolled to
its limit in that direction, it manually applies e.deltaY to `.main`'s scrollTop and calls
preventDefault(). NeuCurve is fully excluded (checks `.main.is-curve`), and anything outside
`.main` (sidebar tab rail, Settings modal) is untouched. css/style.css: added
-webkit-overflow-scrolling:touch on `.main` for smoother momentum scrolling alongside it.

UI/UX POLISH PASS - SHIMMER, EASING, GPU HINTS (css/fluid-polish.css, neucurve/nc-fluid-polish.css)
-------------------------------------------------------------------------------------------------------
Two new stylesheets, both purely additive (nothing removed/rewritten in style.css or NeuCurve's own
files) and both loaded LAST so they layer on top:
- css/fluid-polish.css (linked in html/index.html, right after css/style.css): adds a hover shimmer
  sweep to tool tiles, Shortcutz tiles, preset/expression/snippet cards and Quick Comp Edit resolution
  tiles (a second background-image animated via background-position, not a new DOM element or
  pseudo-element - .tool's existing ::before/::after glow layers were already spoken for); re-tunes the
  tab-switch fade+slide (panel-in/head-in) onto a slightly snappier cubic-bezier(0.25,1,0.5,1) curve;
  adds backface-visibility+will-change GPU compositing hints to the busiest animated elements (saber
  borders, cards, the modal, tab indicator); fills in a couple of card types that had a hover state but
  no :active press feedback; and extends the existing neon accent focus glow to native
  select/range/number/color inputs. All new motion respects prefers-reduced-motion.
- neucurve/nc-fluid-polish.css (linked last in neucurve/index.html, after nc-apply-glow.css): much
  smaller and deliberately conservative - just a tactile press-scale on plain buttons (excluding
  .apply-btn, which already has its own glow-trace feedback) and the same neon focus glow on native
  inputs. Does not touch nc-glow/nc-apply-glow/nc-particles/nc-theme-sync - see their own notes above.
Tune the shimmer's opacity/size/speed or the new easing curve at the top of css/fluid-polish.css
(--fluid, --shimmer-dur custom properties and the two linear-gradient rules in section 3).

PREMIUM VISUAL ORNAMENT PASS (css/premium-ornaments.css)
---------------------------------------------------------
Third additive stylesheet, linked in html/index.html right after css/fluid-polish.css (loaded
last, so it layers on top of both style.css and fluid-polish.css - nothing in either is
rewritten). Adds:
- Ambient blurred accent-color mesh glow + a faint 16px dot-grid texture on .app itself (behind
  .sidebar/.main, in front of the custom background image/GIF/canvas layers), so it shows on
  every tab even when no custom background is set.
- Cyberpunk corner-bracket accents on the panel header, the Expression Code "new snippet" card,
  the Info/About card, and the code editor (inside its rounded corners instead of outside, since
  it clips - see the file's own comment).
- Glassmorphism (backdrop-filter blur + translucent tint), guarded behind @supports so AE 2021's
  Chromium 74 (predates backdrop-filter) just keeps the normal solid surface: applied ONLY to the
  Settings modal and the right-click context menu, deliberately not to any card whose background
  main.js's Settings.applyCardSurfaces keeps live-synced to the panel's background color (see
  that function's own comments) - giving those a hardcoded translucent tint would quietly break
  that sync.
- A small pulsing green "active" status dot before the current tab's title (fixed color, not the
  theme accent, so it always reads as a status light rather than a re-themeable decoration).
- A neon icon halo on hover/active sidebar tabs and icon buttons - box-shadow on the icon's own
  box, NOT filter:drop-shadow, which the CEF note in neucurve/nc-glow.js already established
  doesn't render on SVG paths inside After Effects.
- A literal 1px gradient-stroke border (the padding-box/border-box double-background trick) on
  the code editor when focused, layered on top of its existing glow box-shadow. The panel's
  existing rotating .saber-wrap conic-gradient ring (Shortcutz tiles, toggles, preset folders) is
  untouched and still the primary "signature" active-card treatment; this is a calmer static
  alternative for a text-input surface where a spinning ring while typing would be distracting.
Tune colors/opacity at the top of css/premium-ornaments.css (--ornament-glow, --grid-dot-color,
--glass-surface, --glass-border custom properties, both dark and the :root[data-theme="light"]
override).

FALLING STARS / METEOR SHOWER BACKGROUND (css/falling-stars.css, js/falling-stars.js)
----------------------------------------------------------------------------------------
New scoped ambient background: thin, glowing streaks drift from the upper-right toward the
lower-left at a shallow diagonal, across every tab EXCEPT Curve/NeuCurve.
- Canvas (#falling-stars-canvas, class "falling-stars-bg") lives as the first child of .app in
  html/index.html: position:absolute, z-index:0, so it paints behind .sidebar (z-index 30) and
  .main (z-index 1) - see css/falling-stars.css.
- js/falling-stars.js runs its own rAF loop, 15-25 particles (PARTICLE_COUNT), each with
  randomized speed/length/opacity(0.2-0.6)/lifetime(2-5s), fading in/out at the start/end of
  its life so nothing "pops" on/off screen.
- Tab scoping: watches #main for the "is-curve" class (toggled by Curve.show()/hide() in
  js/main.js whenever the Curve tab is entered/left) via a MutationObserver - no edits to
  main.js were needed. Stops the loop AND clears the canvas the instant Curve becomes active,
  so NeuCurve's bezier canvas gets a fully clear background and the full CPU/GPU budget back;
  resumes automatically on leaving Curve. Also pauses while the panel document itself is
  hidden/backgrounded (document.hidden), and never starts at all if the user has
  prefers-reduced-motion enabled.
- This is a SEPARATE, additive layer from the pre-existing js/global-bg.js "shooting star"
  canvas (position:fixed to the OS window, always running regardless of tab, sparse - max 3
  concurrent streaks, faster/brighter). global-bg.js was NOT modified. Running both together is
  a deliberate two-layer effect (a sparse bright system + a denser subtle one); to go back to
  just one, remove this feature's <link>/<canvas>/<script> tags from html/index.html rather than
  editing global-bg.js.
- Tune density/speed/size/opacity/lifetime in the CONFIG-style constants at the top of
  js/falling-stars.js (PARTICLE_COUNT, the rand() ranges in MeteorParticle.prototype.reset).

GLASS THEME (css/glass-theme.css)
---------------------------------
Final stylesheet (loaded last in html/index.html): "Clean Dark Glassmorphism Minimalist". Design tokens live at the top of the file
(--panel-bg, --surface-card, --surface-hover, --border-subtle, --accent-glow, --radius-card, --radius-btn). It remaps the legacy tokens the
rest of the CSS already used (--bg, --surface, --border, --shadow-card*, --radius-m/-l), so tabs re-theme together; delete the file (and its
<link>) to get the previous look back. --accent-glow follows Settings > Theme color. Cards under a rotating "saber" ring (code editor, preset
folder header, Shortcutz tiles, toggles) intentionally use the OPAQUE --surface-solid so the ring mask keeps working.
Settings > Background color still re-tints everything: Settings.applyCardSurfaces() (js/main.js) now writes translucent --surface/--surface-hover
plus opaque --surface-sunken/--surface-solid tiers. neucurve/nc-glass.css gives the Curve tab the same base palette (solid, no blur).

TAB MOTION (kotak-kotak per tab)
--------------------------------
css/tab-motion.css + showTab()/renderTab()/staggerCards() in js/main.js. Masuk tab: kartu/kotak muncul
berurutan (fade + naik 14px + scale 0.94, stagger 26ms, maks 14 item). Pindah tab: isi lama fade out ~110ms
lalu isi baru masuk. Hanya opacity+transform (ringan, tanpa blur/shadow animasi). Tuning: --mt-card-dur,
--mt-leave-dur di tab-motion.css; MT_LEAVE_MS / MT_STAGGER_MAX di main.js. Mati hanya bila
data-reduce-motion="true" (opt-in; setting OS "Show animations" diabaikan, sama seperti style.css).

SMOOTH SCROLL (roda mouse)
--------------------------
js/smooth-scroll.js: scroll roda mouse halus (easing eksponensial, 1 rAF) untuk semua area scroll -
.main, daftar preset/ekspresi, modal Settings, preview kode. Dipanggil dari ScrollForward (main.js).
Touchpad tetap native/instan; Ctrl/Shift+wheel, slider yang pakai wheel sendiri, dan tab Curve tidak disentuh.
Tuning: TAU (lembut/lambat) dan STEP (jarak per klik) di bagian atas file.

LAMA SESI DI TAMPILAN JAM (Idle / hemat GPU)
--------------------------------------------
Di bawah jam muncul teks "You've been in After Effects for 1 hour 23 minutes" (bahasa Inggris). Kode: Idle.initSession()/
formatSession()/updateClock() di js/main.js, elemen #idle-session di html/index.html, gaya .idle-session
di css/style.css. Panel menulis "detak" ke localStorage tiap 30 dtk; saat panel dimuat, bila detak terakhir
< 3 mnt hitungan dilanjutkan, bila lebih lama dianggap AE baru dibuka (mulai dari 0). Bila panel ditutup
> 3 mnt di tengah sesi AE, hitungan mulai ulang. Ubah SESSION_GAP_MS untuk toleransi lain. Teks ikut
update tiap menit (tidak ada timer tambahan).

DISPLAY (Settings > Adjust background): posisi / zoom / opacity background
--------------------------------------------------------------------------
Tombol "Adjust background" di Settings menyembunyikan UI dan menampilkan background penuh + panel kecil
(#bg-editor) berisi slider Opacity (dipindah dari Settings), Zoom 100-300%, Position X/Y 0-100%, Reset, Done.
Drag background = geser posisi, scroll roda = zoom, Esc/Done = kembali ke Settings. Disimpan di localStorage
(mtx.bgZoom / mtx.bgPosX / mtx.bgPosY / mtx.bgOpacity). Kode: Settings.initBgEditor() di js/main.js,
CSS "Background editor" di css/style.css. Variabel --bg-zoom/--bg-pos-x/--bg-pos-y hanya ditulis ke
#bg-layer dan #bg-motion-layer (bukan :root) supaya drag tetap ringan. Berlaku untuk gambar dan GIF/video.
Tanpa background yang dipilih, tombolnya hanya memunculkan pesan.


[fixed9] Slider fix (Adjust background): fill-trail synced on JS value changes (hook in js/panel-refinements.js + explicit calls in Settings.applyOpacity/syncBgControls), assets cache-busted with ?v=8 in html/index.html.


[fixed10] REMOVED: falling stars / shooting stars (js/falling-stars.js, js/global-bg.js, css/falling-stars.css + their canvases). ADDED: ambient circles now move to random positions (js/ambient-orbs.js) and blink slowly (css/ambient-orbs.css). Tune speed in MOVE_MIN_S / MOVE_MAX_S (js) and the orbBlink durations + opacity range in css. The Curve tab (neucurve/nc-particles.js) still has its own small falling-circle particles; delete the nc-particles.js script line in neucurve/index.html to remove them too.


FIX: NEUCURVE BACKGROUND GRADIENT + LARGE GRAPH EDITOR THEME (fixed15)
----------------------------------------------------------------------
1) Background Gradient not visible (Settings > Background Gradient):
   - With a custom Background color set in the panel, nc-theme-sync.js generates opaque rules for ".canvas-area"
     (the graph floor) that out-ranked the see-through rules in nc-bg.css, hiding the gradient (and the Graph
     Background image) completely. nc-bg.css now has higher-specificity see-through rules for .canvas-area,
     .fixed-section, .content-wrapper and .main-container under html.nc-has-grad / html.nc-has-bg + .mt-bg-themed.
   - .extension-wrapper was 72% opaque over the whole widget and dimmed the gradient to almost nothing; it is now
     transparent while the gradient is on (.side-column / .model-rail / .hint keep their own translucent tint).
   - The NeuCurve Settings window itself stays solid on purpose; the preview strip in Settings shows the gradient.
2) "Open Large Graph Editor" ignored the panel theme:
   - That editor is its own CEP window (neucurve/index.html?ext=graph), not an iframe, so the panel's postMessage
     never reached it (same for the Settings window). js/main.js Curve.sync() now ALSO writes the theme/background
     state to localStorage ("mt_theme_state") and fires the CEP event "com.multitool.theme.sync"; the panel also
     answers "com.multitool.theme.request". neucurve/nc-theme-sync.js applies that state (accent + Background color)
     in standalone windows exactly as it does in the iframe, reads it on load, follows it live, and asks the panel
     for a fresh copy on open. Iframe behavior is unchanged.
   - html/index.html: main.js cache-bust bumped to ?v=10.


LIVE AUTO APPLY (fixed16)
-------------------------
NeuCurve Settings > Auto Apply (existing toggle) now behaves like a live link to After Effects:
- Click a keyframe (or several) in the timeline, then move/edit the graph in NeuCurve: the selected keyframes are
  updated continuously WHILE you drag (Bezier model: at most one update every ~70 ms, ~130 ms on AE 2019/2021),
  so the After Effects Graph Editor follows in real time. The final value is always sent when you let go.
- The LAST keyframes you clicked are remembered (jsx/host.jsx: NC_liveStatus / NC_liveRun). If you deselect or click
  elsewhere, Auto Apply keeps targeting them and re-selects them for you (Bezier model). If they no longer exist
  (deleted / moved), it asks you to click a keyframe again.
- A small badge on the graph shows the target: green = keyframes currently selected, yellow = using the last ones you
  clicked, red = nothing to target yet ("click a keyframe"). The dot turns blue while an update is running.
- Works in the Curve tab AND in the Large Graph Editor window (before, Auto Apply never ran in that window).
  A change that only arrives by sync from the other NeuCurve window is NOT applied again (no double apply).
- Elastic / Bounce / Wave / Steps / Custom(bake) create keyframes, so they do not run on every mouse move: they
  re-apply 450 ms after you stop changing, on the keyframes that are currently selected.
- Live updates are silent (no "Applying..." toast); errors are shown at most once every 3 s. The manual APPLY button
  is unchanged. Each live update is its own undo step in AE (identical repeats are skipped).
Files: neucurve/nc-live.js + nc-live.css (new), assets/index.js (small patches: __ncLive hooks, ZL(), NC_liveRun
bridge), jsx/host.jsx (end of file).


TEXTFLEX (fixed: "textTotal is not defined")
-----------------------------------------
After Effects only defines textIndex / textTotal inside an Expression Selector's Amount, so an expression written
directly on an animator property (Position, Opacity, ...) errors out. TextFlex therefore builds ONE animator named
"TextFlex_Animator": the Expression Selector Amount holds the stagger + bounce/ease math (Direction, Delay, In/Out/
In-Out, Markers, Overshoot/Ease), and each checked property just holds the value typed in the panel. Text > More
Options > Anchor Point Alignment is set to [0,0] and Grouping follows Based On. Re-applying replaces the old animator.
Files: jsx/host.jsx (TF_apply, _tfAmountExpr), js/main.js (TextFlex tab - UI unchanged).


CURVE TAB: GRADIENT ONLY BEHIND THE GRAPH + COMPACT LIVE BADGE
--------------------------------------------------------------
1) Background Gradient (NeuCurve Settings) used to be a full-window layer, with the preset / Save / library boxes made
   translucent on top of it, so the gradient showed through those boxes. It is now mounted INSIDE the graph area
   (.canvas-area, see placeGrad() in neucurve/nc-extras.js) so it is the curve's own background, and the Apply / Save
   row, library cards, rail and hint bar keep their normal solid colours (or the panel Background-color tint).
   neucurve/nc-bg.css: the gradient-only rules now make just .canvas-area / .canvas-container / .curve-svg see-through.
   (The Graph Background IMAGE keeps its previous full-window behaviour.)
2) The LIVE badge (neucurve/nc-live.js + nc-live.css) no longer prints the layer / property name. It shows a short
   phrase ("LIVE · 3 keys", "LIVE · last", "LIVE · pick key", "LIVE · no comp"), is smaller and slightly transparent, and
   sits in the bottom-right corner of the graph instead of the top (clear of the curve start and the model tabs).

CURVE TAB AUTO APPLY v3 (cursor flicker fix)
--------------------------------------------
Auto Apply (NeuCurve Settings) was rewritten in neucurve/nc-live.js. The old version polled After Effects
(NC_liveStatus) every ~350 ms while the Curve tab was open and Auto Apply was ON; each poll runs on AE's main thread
and made AE reset the mouse cursor (arrow <-> I-beam flicker over the expression box). Now there is NO timer: the
last clicked keyframes are remembered with a single request when the pointer enters the panel (180 ms dwell, max once
per 2 s), and NC_liveRun reads the selection itself on every apply. Auto Apply OFF = nothing is sent to AE.
Live applying while you edit the graph works exactly as before.

CURVE TAB FALLING EFFECT (PARTICLES / RAIN) SETTINGS
----------------------------------------------------
NeuCurve Settings > "Falling Effect": choose Off / Particles / Rain, plus Color and Opacity (0-100%). It falls over
the preset Library area of the Curve tab (same zone as before; default = white Particles, 100% = unchanged look).
Stored as localStorage neucurve_pEffect / neucurve_pColor / neucurve_pAlpha and synced live between windows.
UI: neucurve/nc-extras.js (+ nc-extras.css). Effect: neucurve/nc-particles.js. "Reset effect" restores defaults.

FIX: BACKGROUND GRADIENT = WHOLE CURVE-TAB BACKGROUND (v5)
----------------------------------------------------------
The gradient used to be mounted inside .canvas-area, so it only filled the graph box. It is now a full-window layer
behind #app (neucurve/nc-extras.js placeGrad), and with it ON neucurve/nc-bg.css makes the graph, side panels, Apply /
tool row, library header and preset grid translucent so the gradient shows around and behind them. Gradient OFF =
unchanged. A Graph Background image is still drawn on top of the gradient.

UPDATE (v6): the gradient no longer shows inside the graph box - the graph keeps its own solid background and the
gradient only fills the area below it (tool row, Apply, library). Rule lives in neucurve/nc-bg.css (nc-has-grad).

ANIMATOR TEXT TAB (v7)
----------------------
- The "TextFlex" tab is now named "Animator Text" (tab tooltip/label in html/index.html, panel title in js/main.js,
  After Effects undo step + success message in jsx/host.jsx). Internal ids (data-tab="textflex", the
  "TextFlex_Animator" animator name, saved presets key) are unchanged so existing presets and layers keep working.
- Preset bar: the Load button is gone. Choosing a preset in the dropdown loads it immediately (js/main.js, TextFlex
  render, #tf-preset-select "change"). Save / Delete / Refresh work as before.

v8 - ADJUST BACKGROUND + GRADIENT LOOK
--------------------------------------
- Adjust Background (Settings > Graph Background): Zoom / Position X / Position Y now go through NeuCurve's own
  synced stores (assets/index.js: NcBz / NcBx / NcBy, next to the opacity store) instead of a separate event path, so
  they update the Curve tab and the graph window exactly like Opacity does (persist + live sync + storage event).
  nc-bg.js setVal() uses those stores; dragging writes localStorage live and pushes the stores on mouse-up.
- Gradient look (nc-bg.css, nc-has-grad): below the graph it is now one continuous surface - rows, library header
  and grid are transparent; only the tool pill, Apply group, library select and preset tiles get a soft dark glass.

v9 - BACKGROUND GRADIENT REMOVED
--------------------------------
The "Background Gradient" setting (NeuCurve Settings) and all its code (nc-extras.js, nc-bg.css, #nc-grad-layer)
are gone. Settings now: colors, Auto Apply, Overshoot, Handle Style, Falling Effect, Layout, Graph Background.
Old neucurve_grad* values left in localStorage are ignored.
Graph Background (image/GIF + Adjust Background): tested with two separate simulated windows (Settings -> Curve tab):
image, opacity, zoom and position all reach the Curve tab live (nc-bg.js + NcBz/NcBx/NcBy stores in assets/index.js).

v10 - ADJUST BACKGROUND REBUILT (adjusts the REAL NeuCurve background)
----------------------------------------------------------------------
Root cause of "Zoom / Position do nothing, only Opacity works": NeuCurve draws its Graph Background itself, as an
<image> inside the graph SVG (svg.curve-svg > image, bound to the opacity store). Older nc-bg.js added a second layer
behind the graph and moved THAT, so the visible image never changed.
Now neucurve/nc-bg.js rewrites x / y / width / height of that very <image> (CSS "cover" maths, zoom 100-300 %,
position 0-100 %), in the Curve tab and the Large Graph Editor, png/jpg/gif. No extra layer / nc-has-bg class any more.
Settings > Graph Background > Adjust Background: preview frame with the graph's real shape (aspect is reported by the
Curve tab), drag = move, scroll = zoom, Esc = Done, sliders Opacity / Zoom / Position X / Position Y, Reset, Done.
Note: at Zoom 100 % only the axis the image overflows can move (same as CSS background-position).
Tested with two simulated windows (Settings -> Curve tab): opacity, zoom, X, Y and preview drag all update the Curve tab.

v11 - ADJUST BACKGROUND: FULL-WINDOW PREVIEW
--------------------------------------------
The preview now covers the whole Settings window. The bright frame is exactly what the graph shows (same shape as the
real graph); everything outside it is dimmed, so you can see the rest of the image while dragging / scrolling / using
the sliders. Files: neucurve/nc-bg.js (buildPreview/layoutPreview), neucurve/nc-bg.css (#nc-bg-prev, #nc-bg-frame).

v12 - Rain is calmer: fall speed reduced ~37% (neucurve/nc-particles.js CONFIG.rain.speed 300-520 -> 190-330 px/s).
Tweak that one line to taste.



CURVE TAB: "FLOW" LOOK (neucurve/nc-flow.css + nc-flow.js)
-----------------------------------------------------------
The Curve (NeuCurve) tab now follows the Flow reference layout:
  model tabs (rounded, active = lighter box)  >  rounded graph with heart handles + corner expand icon
  >  row 1: reset | import (Read from AE) | speed graph | [x1, y1, x2, y2] value pill | star
  >  row 2: << | hourglass (Invert) | >> | APPLY | settings
  >  accent divider bar  >  scrub slider  >  toolbar: library select, templates, expression, preview, bake, live,
     options  >  preset tiles (rounded squares, selected = accent border, names hidden - hover shows the title).
nc-flow.js MOVES the original buttons (it does not clone them), so every handler / active / disabled state of the
compiled bundle keeps working. New behaviour: the value pill is computed live from the Bezier handles (click = copy
cubic-bezier(...)); << >> select the previous / next preset; the star saves the current curve as a preset (switches
the library to "Sav" and presses its + tile). Reset icon = Remove Expressions, import icon = Read from AE (same
functions as before, new icons). The "Open Large Graph Editor" button now sits in the graph's bottom-right corner.
First run only (localStorage flag neucurve_flowInit): curve + handle color and the UI color default to Flow yellow
(#FFD21F) and the handle style to Heart; change them afterwards in NeuCurve Settings as usual. Buttons/APPLY/active
states follow the panel Theme color (--mt-accent) and fall back to the same yellow.
Tune: variables at the top of nc-flow.css (--fl-accent, --fl-bg, --fl-btn, --fl-radius ...).
Off switch: remove the nc-flow.css <link> and the nc-flow.js <script> lines in neucurve/index.html (and, if you want
the old defaults back, delete localStorage keys neucurve_flowInit/uiColor/graphLineColor/handleColor/hStyle/hSize).

CURVE TAB: AUTO APPLY BUTTON STATE (nc-flow.js syncAuto + end of nc-flow.css)
-----------------------------------------------------------------------------
When NeuCurve Settings > Auto Apply is ON, the APPLY button turns gray and reads "AUTO APPLY" (html gets class
"nc-auto-on"; the label is a CSS ::after, the button's own text/handlers are untouched, so a click still applies
manually). Turning it OFF restores the yellow APPLY. State is read from localStorage neucurve_autoApply on the
storage event, the com.neucurve.sync event, window focus and a cheap 0.8 s poll (never sent to After Effects).
Colors: html.nc-auto-on rules at the bottom of nc-flow.css.

CURVE TAB: GLOW (Flow reference)
--------------------------------
neucurve/nc-glow.js: the curve glow is now 6 wider/softer stacked strokes blended with mix-blend-mode:screen (it also
lightens the Graph Background image under the curve) + a radial-gradient halo behind every handle (HALO_R / HALO_A).
neucurve/nc-flow.css (end): glow under the selected preset tile, under the active model tab, the accent divider bar,
the star and a light one on APPLY. Tune LAYERS/HALO_* in nc-glow.js; remove the "GLOW" block in nc-flow.css to drop the rest.


v13 - SMOOTHER CURVE GLOW, NEUCURVE COLORS INDEPENDENT, SCALE UI
-----------------------------------------------------------------
1) Curve glow smoother (neucurve/nc-glow.js): the glow is now 22 thin stacked strokes whose opacities are computed
   so the sum follows a Gaussian falloff (no more visible rings/bands). The handle halo gradient also has 8 eased
   stops instead of 2. Tune GLOW_PEAK (brightness), GLOW_SIGMA (spread), GLOW_RADIUS (cut-off), GLOW_STEPS
   (smoothness vs. work) at the top of the file; HALO_R / HALO_A for the handle halos.
2) NeuCurve colors no longer follow the Multi Tool Theme color. The accent (buttons, active states, preset borders,
   APPLY, preview dot) now comes only from NeuCurve Settings > UI Color (--ui-color, written by the bundle); the
   curve from Graph Line Color and the handles from Handle & Node Color. Files: nc-theme-sync.js (theme hex is
   ignored; new --nc-ui-rgb helper var), nc-theme-sync.css, nc-flow.css (--fl-accent = var(--ui-color)),
   nc-fluid-polish.css. Settings > Background color still re-tints the Curve tab base as before.
3) Settings > Scale UI (70-150%, default 100%): zooms the whole interface (text, boxes, buttons) via CSS `zoom` on
   .app driven by --ui-scale (css/style.css end of file; Settings.initUiScale/applyUiScale in js/main.js; markup
   #ui-scale-field in html/index.html; saved as localStorage mtx.uiScale; "Reset everything" resets it too).
   While the slider is held (mouse, touch or arrow keys) the Settings window fades out (body.is-scale-edit) so the
   real UI can be seen; it returns on release. The Settings window itself, toast and context menu are not scaled.
   The NeuCurve iframe is not scaled by it (its box still fills the Curve tab).
   Cache-bust bumped: style.css ?v=10, main.js ?v=12.

v14 - LANDSCAPE: LEFT SIDE OF THE CURVE TAB CONTROLS CUT OFF
-------------------------------------------------------------
In landscape mode (graph left, presets right) the left ~32px of the control rows under the graph (reset button, "<<",
library select / "Sav", book icon) was covered by a dark strip: NeuCurve's .sidebar-extension-bg (absolute, left:0,
width 32px, #141414) that extends the model rail downward. The Flow layout removes the 40px left padding of the action
area, so the strip ended up on top of the buttons. Fix: neucurve/nc-flow.css hides .sidebar-extension-bg
(next to the "landscape" rule near the end of the layout section).


CURVE TAB - EASE BUTTONS, INVERT, LANDSCAPE LAYOUT
---------------------------------------------------
- Row under the value pill is now:  [Ease Out] [Ease] [Ease In]  APPLY  gear.  They apply NeuCurve's built-in
  presets "Ease Out" / "Ease" / "Ease In" no matter which library is showing (hook window.__ncApplyDefault added
  to assets/index.js right after "Lr.subscribe"; nc-flow.js applyDefault() falls back to clicking the tile).
- Invert (hourglass) moved to the library toolbar, right after Live Playhead.
- Landscape (panel wider than 480px, or Settings > layout = landscape): model tabs are a horizontal pill bar above the
  graph, the scrub slider + library toolbar sit at the top of the right column above the preset grid, preset names
  are shown under each tile (portrait too), tiles have no dark box (thumbnail canvas fill removed in assets/index.js).
  navStripWidth patched 32 -> 0 (2 places) because the old vertical rail no longer lives inside the graph.
- nc-flow.js remeasure(): re-fires the bundle's resize listener when the graph box changes size, otherwise the graph
  stayed at its old height and was cut off at the bottom.


CURVE TAB - THINNER GLOW + PREVIEW BALL RANGE
---------------------------------------------
- Glow is much lighter now. Curve: neucurve/nc-glow.js  GLOW_PEAK .50->.26, GLOW_SIGMA 11->4.5, GLOW_RADIUS 36->15,
  GLOW_STEPS 14, handle halo HALO_R 11 / HALO_A .22. Preset tiles: thumbnail glow strokes reduced (assets/index.js, search
  "ze.lineWidth=7"). Selected tile / active tab / divider / star / APPLY glows reduced in nc-flow.css.
- Preview ball (the white circle on the scrub slider) used to move only between 15% and 85% of the track, so it looked
  "ahead" of the line at the start and stopped short at the end. It now covers the full track: at t=0 its left edge
  touches the start of the line and at t=1 its right edge touches the end (assets/index.js, component with
  "preview-track-wrapper": calc(5px + (100% - 10px) * value); 5px = half of the 10px ball in nc-flow.css).


CURVE TAB - EASE BUTTON ICONS
-----------------------------
Ease Out / Ease / Ease In buttons use the keyframe-shaped icons copied from the Flow reference (nc-flow.js: kf() helper +
ICON.easeOut / ease / easeIn, 25x25 filled SVG paths; sized in nc-flow.css, "Ease Out / Ease / Ease In: keyframe icons").


CURVE TAB: GRAPH MORPH ANIMATION (neucurve/nc-morph.js + nc-morph.css)
-----------------------------------------------------------------------
Switching the curve mode (Bezier / Custom / Elastic / Bounce / Wave / Steps) now morphs the old graph into the new one
(380 ms, cubic ease-out with a tiny overshoot, the same feel as Flow) instead of jumping. The handles fade out while the
graph morphs and fade back in afterwards. NeuCurve's own Y-axis easing keeps running underneath; the morph always blends
towards the newest shape, so the last frame is exactly the app's own graph. Switching tabs again mid-morph continues from
the in-between shape. Dragging / loading a preset is untouched. Turns off with Settings > Animations = off.
Tune: DURATION (ms) / GRID (samples) at the top of nc-morph.js. Remove: delete the <script src="./nc-morph.js"> and
<link href="./nc-morph.css"> lines in neucurve/index.html.

MOTION TOOLS TAB: removed (tab, css/motion-tools.css, js/motion-tools.js, jsx/motion-tools.jsx and their hooks in
index.html, main.js, host.jsx).

CURVE TAB: HANDLE GLIDE + WHEEL TAB SWITCH (neucurve/nc-morph.js)
------------------------------------------------------------------
- Handles no longer fade: during the mode morph every handle glides from where the old mode had it to where the new
  mode wants it (same 380 ms easing as the curve). Extra handles sprout from the last old handle. The thin handle /
  guide lines fade back in after the glide.
- Mouse wheel over the mode tabs (Bezier / Custom / Elastic / Bounce / Wave / Steps) switches the mode: wheel down =
  next tab, wheel up = previous tab (stops at the first / last). Works for the horizontal bar and the vertical rail.
  Tune STEP (wheel distance per switch) and COOLDOWN (ms) in the wheel block of nc-morph.js.

NEUCURVE SETTINGS: GUIDE TAB + "VISIT WEBSITE" REMOVED
------------------------------------------------------
The Settings popup (neucurve/assets/index.js, component with the "Settings | Guide" header) no longer has the Guide tab
(the header now only shows "Settings") and the "Visit Website" button above the version number is gone. The version
label (v2.10.0) stays.


v15 - CURVE TAB: LANDSCAPE MODE TABS (WHEEL + MORPH), RIGHT SIDE CUT OFF, FLICKER GUARDS
-----------------------------------------------------------------------------------------
1) Landscape: mouse wheel over the mode tabs did nothing and switching modes did not animate. Root cause: the compiled
   bundle has two different tab markups - portrait = ".mtab" in ".model-tabs-horizontal", landscape = ".nav-tab" in
   ".model-nav-strip" (nc-flow.js turns it into the pill bar). nc-morph.js only knew ".mtab". It now handles both
   (TAB_SEL / TAB_BOX_SEL at the top of nc-morph.js): the morph/handle glide starts on either, and the wheel switches
   the mode inside whichever tab box the pointer is over (also the Graph Editor window's .model-rail).
2) Landscape: right side cut off (last toolbar icons beside the library select were clipped). The library toolbar
   (.fl-side .library-header) now wraps instead of overflowing, the right column can shrink (min-width:0) and the preset
   grid scrolls vertically only. See the "v15" block at the end of nc-flow.css.
3) Fast flicker guards (nc-flow.js): (a) build() rewrote class="fl-expand" on every pass; a same-value write still queues a
   MutationObserver record and that observer watches "class", so build() re-armed itself every frame forever - now only
   written when different (same for the APPLY button title); (b) the observer ignores "d" writes and anything inside
   g.nc-glow (nc-glow / nc-morph rewrite those constantly); (c) remeasure() stops firing resize if the graph box keeps
   changing size (more than 6 times in 1 s), which would otherwise show as blinking. Cache-bust ?v=15 added to
   nc-flow / nc-morph in neucurve/index.html.


[v17] NEUCURVE: RIGHT COLUMN, ICONS, GRADIENT MENU, HOVER POLISH
-----------------------------------------------------------------
1) Landscape right column: the preset dropdown has its own full-width row; the tool icons (templates, expression, preview,
   bake, live, options) sit in a row BELOW it, equal widths, nothing clipped (neucurve/nc-polish.css + .fl-toolrow in nc-flow.js).
2) New icons that match each button's function (ICON table at the top of neucurve/nc-flow.js).
3) NeuCurve Settings > Background Gradient: on/off, 6 presets, Color 1/2, Glow, Direction, Intensity, Area (Whole panel / Graph only),
   Reset. Code: neucurve/nc-extras.js (UI + engine), neucurve/nc-grad.css (translucent surfaces). Keys: neucurve_grad*.
4) Hover / press / focus polish: css/hover-polish.css (main panel, all tabs) and the end of neucurve/nc-polish.css (Curve tab).
   Delete the file + its <link> to undo any of these.

[v18] NEUCURVE: FREE GRAPH SIZE (all layouts)
---------------------------------------------
Drag the small grip at the bottom-right corner of the graph (Curve tab / large graph window) to resize the plot with no fixed
aspect: wider, taller, square, anything. Shift = keep proportions, double-click = back to auto. Remembered separately for
portrait and landscape; "auto" layout simply uses whichever is showing. Also in NeuCurve Settings > Graph Size (4 sliders + reset).
Files: neucurve/nc-gsize.js (grip + storage/sync), nc-grad.css (grip style), nc-extras.js (Settings sliders), and a small patch in
assets/index.js (search "__ncGS": plot-size calc now asks window.__ncGS(isLandscape) and skips the old 0.8-1.3 aspect clamp when
a custom size is set; window.__ncGBump / __ncGPlot are exposed). Keys: neucurve_gWp gHp gWl gHl (25-100, empty = auto).

TOOLTIP + LEFT NAVIGATION (build fixed14)
-----------------------------------------
- Tooltip fix (js/mt-tooltip.js): it used to stay hidden after a click / scroll / wheel until the cursor left the
  element, and never came back after a panel re-render or window blur. Now it returns as soon as the cursor
  moves again, and picks up the element under the cursor on mousemove (self-heal).
- The left navigation has no tooltips any more (title="" removed from the sidebar buttons, mt-tooltip ignores .sidebar).
- Menu tiles (.tool) now have a tooltip with the tile's full name (title set in buildTool() in js/main.js).
- Left navigation auto-expands after 5 s of hovering (css/sidebar-expand.css + js/sidebar-expand.js) and shows the
  tab names; it collapses smoothly when the cursor leaves. Change DWELL (ms) in js/sidebar-expand.js and
  --sbx-w / --sbx-dur in css/sidebar-expand.css.

LEFT NAVIGATION: CENTRED HIGHLIGHT (build fixed15)
--------------------------------------------------
- The icon / name looked pushed down inside the active highlight. Causes: the highlight glow was offset 4px downward,
  the icon and name had no common centre line, and on a short panel / other UI scale the tab buttons were squeezed
  (flex-shrink) while the highlight kept its fixed height, so it stuck out below the icon + name.
- css/sidebar-center.css (new, linked after sidebar-expand.css): icon + name are block boxes centred by flexbox,
  symmetric glow. Delete the file + its <link> to undo.
- css/sidebar-center.css also stops the tabs from shrinking (the list scrolls instead).
- js/main.js moveIndicator(): the highlight copies the active tab's offsetHeight, so both always match.

FIX 16 (Curve tab, right column)
--------------------------------
neucurve/nc-fix16.css (linked last in neucurve/index.html): preset tiles no longer show a dark block - only the square
preset-graph thumbnail gets a box (hover / selected), the name stays outside it, and the selected glow fits the thumbnail.
The scrub (preview) circle has no black box / dark ring behind it any more.

FIX 17 (Curve tab, preset area)
-------------------------------
neucurve/nc-fix17.css (linked after nc-fix16.css): the big dark block behind the preset grid is gone; every saved
(user) preset graph has its own box around the thumbnail (name outside); a soft white ambient glow sits on the right
side of the preset area. Tune --nc-amb-white / --nc-amb-width at the top of the file (0 = no glow).

FIX 18 (Curve tab, control bar)
-------------------------------
neucurve/nc-fix18.css (linked after nc-fix17.css): the gray boxes (value pill, Ease Out/Ease/Ease In buttons, AUTO APPLY,
library select) use the same fill/border/hover as the saved preset tiles. Variables --nc-box-* at the top of the file.

CURVE TAB PRESET BOXES (fix19)
------------------------------
Every preset graph tile (built-in AND saved) now has a rounded translucent box behind the graph, like the reference
photo; the preset name stays below the box. neucurve/nc-fix19.css (loaded last) replaces the old rule of nc-fix17.css
that boxed only saved presets. Hover = lighter fill + #3a3a3a border, selected = accent border + glow. Colors come from
--nc-box-* in nc-fix18.css; corner radius is 12px in nc-fix19.css.

TOOLTIP (fix20)
---------------
css/mt-tooltip.css: the custom tooltip now uses the same box as the preset tiles (10px corners, 1.5px soft white border,
inset highlight; in the Curve tab it follows --nc-box-border). js/mt-tooltip.js: the native browser tooltip no longer
slips through - a titled child inside a titled parent gets its own custom tooltip, a 120 ms watchdog takes over the
title of whatever is really under the cursor (re-created nodes, disabled buttons, titles the app puts back), and a
leftover title on the left navigation is removed instead of popping the native tooltip.

NEUCURVE STUCK-DRAG FIX (idle / screensaver)
--------------------------------------------
If a mouse button release never reached the panel (released outside the CEP panel, screensaver, lock screen), the
bundle kept its drag active; the first mouse move afterwards (buttons = 0) applied a huge delta and the Bezier
handles slammed to 0/1 (S-shaped curve with both handles at the extremes). assets/index.js, function Q (mousemove
handler): a mousemove with no button pressed while a drag / box-select is active now ends the drag (calls Ve) instead
of moving anything.

TEXTFLEX "BASED ON WORDS/LINES" EXPRESSION FIX
----------------------------------------------
The Amount expression read the layer text with text.sourceText.value.text, which is undefined inside an expression
("Cannot read property 'length' of undefined"). It now uses String(thisLayer.text.sourceText) (jsx/host.jsx _tfAmountExpr).

TEXTFLEX WORDS/LINES GROUPING FIX
---------------------------------
jsx/host.jsx _tfAmountExpr: the word/line grouping now detects whether After Effects counts line-break characters in
textIndex/textTotal (textTotal vs source length) so Words/Lines stay correct on multi-line text; spaces and line breaks
take the group of the word before them. Verified by running the generated expressions in Node against mocks
(230,400 combinations of Based On / Direction / Mode / Style / Markers: no errors, no NaN).

SMOOTH DROPDOWN MENUS (js/mt-select.js + css/mt-select.css)
-----------------------------------------------------------
Every <select> (TextFlex Based on / Direction / Preset, Add Shortcut type, Easy Layer label colors, Clock Position...)
now opens a themed, animated menu instead of the OS popup: fade + scale from the field, staggered items, hover and
keyboard highlight, check mark on the current value, flips above when there is no room, type-ahead, Esc / outside
click closes. The native <select> stays in place, so .value and "change" listeners are unchanged. Opt out for one
select with data-native="true". The same CSS file also softens the right-click menus (.ctx-menu) and the accordion
bodies (.collapse). Respects data-reduce-motion="true".

THEMED COLOR PICKER (js/mt-colorpicker.js + css/mt-colorpicker.css)
-------------------------------------------------------------------
Every <input type="color"> (Settings > Theme color / Background color, Add Shortcut colour, the accent menu's
"Custom Color") opens a themed popover instead of the OS colour dialog: saturation/brightness field, hue slider,
old/new preview, HEX + RGB fields, quick swatches, recent colours, eyedropper where supported. The input keeps
working (value, "input" while dragging, "change" on close). The Color Palette > Custom Color wheel (.cw) is NOT
changed. Opt out per input with data-native="true".

SMOOTH SPIN BOXES (js/mt-spinbox.js + css/mt-spinbox.css)
---------------------------------------------------------
Every <input type="number"> loses the tiny OS arrows and gets a two-part stepper on its right edge: the half under
the pointer lights up in the theme colour, a press pulses the field, holding repeats and accelerates (x1 -> x2 -> x5),
Shift = x10 (click, ArrowUp/ArrowDown, wheel), and the mouse wheel steps a FOCUSED field only. min / max / step are
respected and "input" / "change" events fire as before. Opt out per field with data-native="true".


v13 - Curve tab Particles: denser and smoother (neucurve/nc-particles.js). CONFIG.density 1/7000 -> 1/2600, max 70 -> 160, min 8 -> 22; fades use smoothstep easing, sideways sway is time-based (no jitter when speed varies), softer sprite edge, high-quality image smoothing, re-entry pause 1.8s -> 0.6s, frame dt clamp 50ms -> 34ms. Too busy? lower CONFIG.density (e.g. 1/3500) or CONFIG.max. Rain is unchanged.


AUTO UPDATE ("Update Now")  -  v1.1.0
-------------------------------------
Files: js/mt-updater.js, css/mt-updater.css, version.json, plus the banner / Settings > Updates markup in html/index.html.

What the user sees: a small banner slides in at the top of the panel when a newer version exists:
"Update available  v1.1.0 -> v1.2.0"  [Update Now] [Later] [What's new]. Settings > Updates has "Check for updates"
(and an "Update Now" button once something newer is found). Update Now downloads the new zip, installs it over the
current folder and reloads the panel by itself. If manifest.xml or jsx/host.jsx changed, it asks to restart
After Effects instead. Nothing is installed without the user pressing Update Now.

ONE-TIME SETUP (publisher)
1. Create a free GitHub account + a repository (e.g. "multitool"). It must be PUBLIC so the panel can read the releases.
2. Edit version.json:  { "version": "1.1.0", "repo": "YOUR-USERNAME/multitool" }   then install that build once by hand.
3. To publish an update: raise "version" in version.json (and ExtensionBundleVersion / Extension Version in
   CSXS/manifest.xml to match), zip the CONTENTS of the MultiTool folder (CSXS, html, css, js, jsx, neucurve,
   version.json, README.txt at the zip's top level), then on GitHub: Releases > Draft a new release > tag "v1.2.0"
   (same number as version.json) > attach the .zip > write what changed in the description (shown under
   "What's new") > Publish release. Tick nothing as pre-release / draft (those are ignored on purpose).
4. Everyone running an older version gets the banner on their next panel start (silent check, at most every
   6 hours; "Check for updates" in Settings checks immediately).

HOW IT STAYS SAFE
- HTTPS only, from github.com. The zip's SHA-256 is verified against the checksum GitHub stores for the asset
  (or a line "sha256: <64 hex>" in the release description); a mismatch discards the download untouched.
- The current install is copied to ~/Documents/MyMultitoolExtension/UpdateBackup before anything is overwritten.
  If copying fails half-way, the backup is restored automatically. Settings, backgrounds, snippets and presets live
  outside the extension folder (Documents / localStorage), so they are not touched.
- The installed "repo" in version.json is kept even if a new zip ships the OWNER/REPO placeholder.
- Files are only overwritten / added, never deleted, so a removed file in a new version can remain as an unused leftover.
- Unpacking uses the operating system's own tool (PowerShell Expand-Archive on Windows, ditto on macOS): no extra libraries.
- Needs write permission to the extension folder: fine in %APPDATA%\Adobe\CEP\extensions (Windows) or
  ~/Library/Application Support/Adobe/CEP/extensions (macOS); the system-wide CEP folders need admin rights.
- Until "repo" is set to a real value the feature stays idle (Settings > Updates says it is not set up).

v1.1.1+ note: "Check update" now sits in the Settings footer (between "Reset everything" and "Done"). The sidebar
Refresh Panel button also checks for updates: it sets localStorage "mt_update_force_check", and after the reload
js/mt-updater.js checks immediately (ignoring the 6 h throttle) and shows either the update banner or a toast
"Panel refreshed. You are up to date (vX)". Errors / offline stay silent in this path.

v1.1.2 note - spin box in the Curve tab: neucurve/index.html is a separate page, so it never loaded js/mt-spinbox.js / css/mt-spinbox.css
and its number fields kept the tiny native arrows. It now loads both (plus neucurve/nc-spinbox.css, which tints the stepper with NeuCurve's
own UI colour via --nc-ui-rgb). Any new page added to the extension must load these two files too to get the same stepper.

v1.1.3 note - Settings now always opens from the top: Settings.open() in js/main.js focused the "Done" button (bottom of the dialog) with a plain
focus(), which scrolled the dialog down to it. It now uses focus({ preventScroll: true }) and resets the dialog's scrollTop to 0.


INTERFACE STYLE: GLASS / MATERIAL YOU  (Settings > Style)
---------------------------------------------------------
Files: js/mt-uitheme.js, css/mt-uitheme.css (the picker), css/material-theme.css (the Material You look), small hooks in html/index.html
and js/main.js. Saved in localStorage "mtx.uiTheme" ("material"; no value = Glass). Settings > Reset everything puts it back to Glass.
- Glass = the original look (css/glass-theme.css), still the default and untouched.
- Material You = light pastel-lavender canvas with a faint grid, pill buttons with soft raised shadows, rounded cards, navy text, filled accent
  buttons. Active only under <html data-ui-theme="material">; delete css/material-theme.css (+ its <link>) to remove it entirely.
- Material You is a LIGHT style: it pins <html data-theme> to "light" (main.js syncTheme() respects that; leaving it re-syncs with the AE UI).
- Settings > Theme color still sets the accent (tonal states are that colour at low alpha). Settings > Background color is NOT used in
  Material You (its tokens are overridden with !important); a Background image / animated background still shows.
- The Curve tab (NeuCurve) is a dark app with no light variant, so in Material You it sits in a rounded dark card.
- To tweak the look: the --mu-* tokens at the top of css/material-theme.css (canvas, ink, shadows, pill gradient).

MATERIAL YOU (Settings > Style > Material You)
-----------------------------------------------
A Pixel-style dynamic palette. js/mt-material.js turns Settings > Theme color into a tonal palette (primary / secondary /
tertiary + tinted neutrals) and writes --md-* variables on <html>; css/material-theme.css only reads them. Flat tonal cards,
24-28px corners, pill indicator on the sidebar, filled-tonal buttons, Material switches. Glass is untouched.
 - Palette: 8 quick swatches under Theme color (or any colour via the Theme color picker).
 - Light / Dark: picks the scheme. Choosing one resets the Background color to the palette's own.
 - Background color: now works in Material You. Cards, borders and text are derived from it, and text flips to
   light/dark automatically depending on how bright the colour is. "Default" next to it goes back to the palette's background.
   It is stored separately (mtx.mdBg) from the Glass background colour, so switching styles never changes the other one.
 - The Curve (NeuCurve) tab stays a dark rounded card in both styles.

EXPORT GIF (Tools tab)
----------------------
Tools > "Export GIF" renders the active comp as an animated .gif, no Media Encoder / ffmpeg / plug-in needed.
 - Options: Range (Work Area / Entire Comp), Width, Frame rate, Colors (256/128/64), Background (Transparent / White / Black),
   Loop forever, Dither, Optimize file size. They are remembered between sessions (mtx.gifOptions).
 - Flow: jsx/host.jsx TOOLS_gifRender renders a PNG sequence (RGB + straight alpha) into a temp folder through a temporary
   Render Queue item (removed afterwards, other queued items are paused and restored). js/mt-gif.js then builds ONE shared
   palette (median cut), maps every frame to it (optional Floyd-Steinberg dithering), stores only the changed rectangle per
   frame when "Optimize" is on, LZW-encodes and writes <CompName>_<YYYYMMDD-HHMMSS>.gif. The temp folder is deleted at the end.
 - The save folder is the SAME one Save Frame uses (folder icon on either button changes it). An existing file is never
   overwritten (name_2.gif ...). While encoding, the Export GIF button turns into "Cancel".
 - Playback speed is exact: the GIF's total duration equals the rendered time range (delays are distributed in 1/100 s steps).
 - Limits: GIF has 1-bit transparency only (no soft edges; "Optimize" is skipped for Transparent), max 1000 frames per export
   (lower the fps or use a shorter range), needs Node.js in the panel (already enabled via --enable-nodejs in the manifest).
 - Files: js/mt-gif.js (encoder), css/mt-gif-export.css, Export GIF section in UtilityTools (js/main.js), TOOLS_gifRender (jsx/host.jsx).

IDLE SCREENSAVER + CURVE TAB FIX
--------------------------------
Idle Mode used to park the whole UI with display:none. That shrank the NeuCurve iframe to 0x0, and when you came back
the graph measured a wrong height (plot sat too high at the bottom). Parking now moves the UI off-screen with a
transform (css/style.css, body.is-idle-parked .app) so every box keeps its real size and nothing is re-measured.

SCRUBBY NUMBER FIELDS (js/mt-scrub.js + css/mt-scrub.css)
---------------------------------------------------------
Every number field in the panel (Animator Text: Position X/Y/Z, Anchor Point, Rotation, Scale, Skew, Tracking, Blur, Opacity;
Tools, Quick Comp Edit, Export GIF ...) can be changed by dragging left / right, like After Effects:
 - drag the small label next to the field (X, Y, Z, Width ...), or drag the field itself while it is not focused;
 - 1 px = one "step" of the field, Shift = x10, Alt = x0.1; min / max are respected;
 - a plain click still focuses and selects the field for typing; the right edge strip stays the up / down stepper (mt-spinbox.js);
 - "input" fires while dragging and "change" on release, so the values are read exactly as if typed (and are kept across tab switches).
Opt out for a field with data-no-scrub="true".

SETTINGS > STYLE PREVIEW + GLASS COLOUR SETTINGS
------------------------------------------------
- The "Material You" card in Settings > Style is now a miniature of the real style (navigation rail with pill indicator,
  flat tonal card, filled primary pill + tonal pill, no shadows). It is painted with the live Material You palette, so it
  follows Theme color, Light/Dark and Background color - also while Glass is the active style (js/mt-uitheme.js paintPreview(),
  fed by the "mt-palette-preview" event from js/mt-material.js; markup in html/index.html, look in css/mt-uitheme.css).
- The colour settings keep the GLASS look under Material You: the colour swatch inputs (Theme color / Background color) and the
  colour picker popup (translucent blur, hairline border, small radii). See section 10 of css/material-theme.css.

CURVE TAB AUTO LIGHT STYLE
--------------------------
NeuCurve now follows the panel's style automatically. When the panel is light (Settings > Style: Glass light / auto-light,
Material You light, or a light Background color) the Curve tab switches to a light look too: light surfaces taken from the
panel's real background color, dark text, dark hairlines/grid, dark preset graphs. Switching back to dark restores the
native dark look. Nothing to configure.
 - js/main.js (Curve.sync) now also posts { scheme, panelBgHex } and re-syncs when data-theme / Material palette change.
 - neucurve/nc-light.js (new) builds the light override stylesheet at runtime from NeuCurve's own CSS (neutral colors
   inverted, accent yellow untouched, dark text on the yellow APPLY button kept) - so future NeuCurve CSS is covered too.
 - neucurve/nc-theme-sync.js decides light/dark (scheme === "light", or a light picked Background color).

SETTINGS > STYLE PREVIEW FOLLOWS BACKGROUND COLOR
The Glass preview card in Settings > Style now takes the Background color you pick (and switches its light/dark look by that
color's brightness); previously it stayed fixed. The Material You card already followed its own background color.

CURVE TAB LIGHT LOOK - STATIC STYLESHEET
neucurve/nc-light.css is the pre-generated light look (all rules scoped to html.mt-light). nc-theme-sync.js adds that class itself
whenever the panel style is light (or a light Background color is picked), so the dark tab bar / borders / text flip even when
nc-light.js cannot read NeuCurve's stylesheets at runtime. nc-light.js still adds a runtime pass on top.

IDLE SCREENSAVER IN LIGHT STYLE
In a light style with no background image/GIF/video, the idle clock, date and the "You've been in After Effects for ..." chip
use dark text on a frosted white chip (css/style.css) instead of the old fixed white, which disappeared on the light panel color.
With a background media set, the clock keeps its white look. Dark style is unchanged.


FIX: NEUCURVE GRAPH SQUASHED IN LANDSCAPE WHEN THE PRESET PANEL IS DRAGGED LEFT
-------------------------------------------------------------------------------
Dragging the vertical divider to the left makes the graph column narrow. A saved Graph Size (Settings > Graph Size, also the
bottom-right grip; the sliders default to 100/100) used to switch the plot to "custom" mode, which bypassed the aspect limit and
let the plot fill the whole narrow-and-tall column (squashed). Now custom mode also caps the height at 1.25x the width (more
only if you deliberately chose H% > W%), so the graph stays proportioned and is centred in the column.
 - neucurve/assets/index.js: size block next to "__ncGS" (also exposes window.__ncGAv = free space before the cap).
 - neucurve/nc-gsize.js: the corner-grip drag now measures against __ncGAv (fixes the size jump after the first drag in auto mode).
 - neucurve/index.html: cache-bust ?v bumped (nc-gsize.js v=2, assets/index.js v=3).

FIX (follow-up): GRAPH STRETCHED WIDE WHEN THE PRESET PANEL IS DRAGGED RIGHT
Same cause, opposite direction: a wide graph column let the custom-size plot stretch horizontally. Custom mode now also caps the
width at 1.3x the height (more only if you chose W% > H%), matching the auto-mode limit. neucurve/assets/index.js (size block
next to "__ncGS"); cache-bust assets/index.js?v=4.

FIX: UPDATE NOT DETECTED UNTIL AFTER EFFECTS IS RESTARTED / "CHECKING..." STUCK (js/mt-updater.js, v=14)
- The silent check used to run ONCE, 5 s after the panel opened. A release uploaded while After Effects was already open was
  never noticed (and a panel refresh did not help if the Node network stack was stuck for the session). Now it re-checks quietly
  every 20 min and whenever the panel regains focus / becomes visible (at most every 5 min). "Check update" and Refresh Panel
  still check immediately.
- Network: the Node request and the OS network stack (PowerShell on Windows / curl on macOS) now RACE: the OS stack starts after
  4 s if Node has not answered, first good answer wins, a definite GitHub answer (rate limit / no release) is final, and the
  whole check always ends within 40 s (old worst case: Node 12 s, THEN PowerShell 45 s, in a row). Requests carry no-cache
  headers and a cache-busting query so no proxy/CDN copy is used.
- A failed automatic check is no longer silent: Settings > Updates shows "Automatic update check failed: ..." with the reason.
- Reminder: an update is only offered when the newest GitHub Release tag is HIGHER than version.json "version" of the installed copy.

FIX: QUICK SUDDEN GLITCH / HITCH IN THE CURVE TAB (js/ae2021-compat.js, ?v=10)
On After Effects 2021 (Chromium 74) js/ae2021-compat.js is active (gap / aspect-ratio fallback; it does nothing on newer hosts,
which is why it never showed in a modern browser). It watched every "style" change in the page, but its own fix-ups ARE style
changes: every pass reset the margins to empty and set them again, so the observer re-armed itself forever (measured with the
shim forced on: ~1,200 style writes per second on NeuCurve's buttons, ~12,000/s in the main panel) and it also re-parsed all
stylesheets on each pass. NeuCurve's APPLY glow (60 style writes/s on an SVG path) kept it busy as well.
Now: (1) writes only happen when the value really changes (no reset-then-set); (2) the shim discards the records caused by its
own writes (takeRecords); (3) mutations on SVG elements, the graph-size grip and canvases are ignored; (4) stylesheets are
re-scanned only when a sheet / rule count changes. Layout result is pixel-identical to before (checked at 3 panel sizes with
the shim forced on); style writes dropped from ~50,000 to ~24 per 4 s in the main panel. neucurve/nc-gsize.js (?v=3) also stops
re-measuring the graph for the APPLY glow animation.

FIX (follow-up): "Could not reach GitHub ... (timeout / timeout)" WHILE AFTER EFFECTS IS OPEN (js/mt-updater.js, ?v=15)
Both the Node request AND the PowerShell/curl request timed out for api.github.com, yet it worked right after restarting AE:
typical when ONE of GitHub's several addresses is unreachable from the user's network (ISP block / routing) - the old code
connected to a single resolved address, so a dead one meant a timeout, and a later attempt could land on a good one by luck.
- request(): resolves ALL IPv4 addresses of the host and tries them one after another (a new one every 2.5 s or as soon as
  the previous fails; 10 s per address); first answer wins; TLS still verifies the certificate for the real host name.
  Used for the release lookup AND the download.
- Second source that does not touch api.github.com: github.com/<repo>/releases.atom (newest tag) + releases/expanded_assets/<tag>
  (the .zip link). Started after 3 s or at once if the API fails; first good answer wins. (No SHA-256 from that source; the
  package is still validated before anything is copied.)
- The error text now says what was tried, e.g. "api: node: 140.82.x.x ETIMEDOUT, ... / os: ps-noreply | web: ...".
- PowerShell request timeout 30 s -> 25 s (so it reports its own result before the 45 s overall limit).


AUTO UPDATE v2 (RE-Faster style)  -  supersedes "AUTO UPDATE" above
-------------------------------------------------------------------
js/mt-updater.js now updates with plain fetch() + cep.fs.writeFile, exactly like RE-Faster: no Node, no zip, no PowerShell.
- Notice: the panel downloads update.json (a small feed) from, at the same time: version.json "feed" (optional, e.g. a Gist raw link),
  raw.githubusercontent.com/<repo>/<branch>/update.json, and cdn.jsdelivr.net (backup host). First good answer wins.
- Update Now: downloads every file listed in update.json (raw.githubusercontent.com, then jsDelivr), verifies each SHA-256, and only
  when ALL files are downloaded and verified writes the changed ones. If a write fails, the old files are restored. version.json is
  written last. If CSXS/manifest.xml changed in a way that matters, After Effects must be restarted.
- Publisher steps: 1) edit changelog.txt, 2) run Make-Update.bat (asks for the new version, writes update.json + version.json),
  3) push the whole folder (including update.json) to the PUBLIC repo in version.json ("repo", optional "branch", default "main").
  update.json may also contain "remove": ["old/file.js"] to delete files, and "ref" (a commit/tag) to pin the download source.
- Install / manual update on a PC: Auto-Install.bat (copies the folder into %APPDATA%\Adobe\CEP\extensions\MultiTool).
- Safety: HTTPS only; paths in the feed must be plain relative paths (no "..", no drive letters); hashes are checked; no token is
  needed or stored. Whoever controls the repo controls what runs in the panel, so keep the GitHub account protected (2FA).

SPEED GRAPH ICON STAYS LIT WHILE OFF (fix21)
--------------------------------------------
The Speed Graph button only works in Bezier mode. In other modes the app marks it .disabled but keeps the old .active flag, and
the Flow layout (.fl-ico) had no .disabled style, so the icon stayed lit (accent colour, tinted square, filled bell) although its
position was OFF. neucurve/nc-fix21.css (loaded after nc-fix20.css) makes a disabled Speed Graph look OFF: dimmed, idle colour,
no tinted square, no filled bell, no hover lift (light theme included). It lights up only when .active and NOT .disabled.
No bundle (assets/index.js) change. Tune the dimming with "opacity: .3" at the top of nc-fix21.css.

Part 2 (nc-fix21.css v2): the graph had left speed mode (button state OFF) but the icon still looked lit. Cause: hover looked exactly
like ON - nc-polish.css gave .fl-ico:hover the accent colour + tinted square + lift, and nc-icons-pro.css filled the bell on hover just
like on .active - and after a click the pointer (or, on touch screens, a sticky :hover) is still on the button. Now only .active is
accent + filled; hover on an OFF icon is a faint white lift with no accent / fill, and @media (hover: none) removes hover looks entirely.

EASE / EASE IN / EASE OUT ICONS = AFTER EFFECTS KEYFRAMES (fix22)
-----------------------------------------------------------------
The three buttons under the graph (Ease Out | Ease | Ease In) now use the keyframe shapes After Effects shows in the timeline instead of
little curves: Ease = hourglass; Ease In = hourglass half on the left narrowing into a point on the right; Ease Out = the mirror. Filled, softly rounded corners, same
colour / hover / active behaviour as before. Edit the paths in BY_CLASS (neucurve/nc-icons-pro.js; the same shapes are kept in ICON of
neucurve/nc-flow.js as fallback); stroke width / corner softness = ".ncp-k" in neucurve/nc-icons-pro.css (stroke-width 1.4).

BATCH FIXES AFTER THE UI REVIEW (build fixed17)
-----------------------------------------------
- Ease In / Ease Out icons redrawn (neucurve/nc-icons-pro.js BY_CLASS + nc-flow.js ICON): no centre step any more, so they no longer
  read as rewind / fast-forward buttons; deeper concave sides so they read as the two halves of the Ease hourglass.
- Info / About now shows the installed version from version.json (js/mt-updater.js exposes MTUpdater.version(); js/main.js infoVersion()).
  Fallback constant VERSION in main.js = "1.8.1". Note: CSXS/manifest.xml still says 1.1.0 - harmless, the updater never touches it.
- Expression Code: "Propert(ies)" -> "Properties" (button, tab hint, Shortcutz hint).
- css/mt-gif-export.css: the GIF progress fill used "inset: 0" (not supported by Chromium 74 / AE 2021); now top/right/bottom/left: 0.

NEUCURVE: INVERT SPAM FIX (v1.8.12, bundle index.js?v=5)
--------------------------------------------------------
Spamming Invert in the Curve tab slowly deformed the graph (e.g. 0.8,0.1,0.9,0.4 drifted toward 0.45,0.35,0.55,0.65). Cause: Invert
animates the params over 300 ms, and each extra click inverted the in-between value of the running animation instead of its final value.
Fix (neucurve/assets/index.js, no UI change): si() remembers the final target of the running animation (NcInvTgt) and writes the exact
target when it ends; ni() (Invert) inverts that target while an animation is running. An odd number of clicks now always ends as the
exact inverse, an even number as the original. Custom / Steps were never affected (they are not animated).

SMOOTHER MOTION (v1.8.13: css/mt-smooth.css + js/mt-smooth.js)
---------------------------------------------------------------
Additive layer, loaded after mt-motion-fix.css (material-theme.css is still the last stylesheet). Only transform / opacity animate.
- Sidebar highlight: cubic-bezier(0.65, 0, 0.35, 1), no bounce; duration 240-440 ms grows with the distance (mt-smooth.js sets --mt-ind-dur).
- Tab switch: cards 0.38 s + 18 ms stagger (was 0.44 s + 22 ms). --mt-leave-dur is left alone: showTab() in main.js waits for it.
- Settings modal: opens 240 ms ease-out (no elastic overshoot), closes 140 ms; the backdrop waits until the card is gone.
- Finished flash: when an action button / tile loses .is-loading, a soft accent veil plays for 0.5 s (skipped if an error toast is showing).
  Which elements: DONE_SEL at the top of js/mt-smooth.js.
- Animations OFF (data-reduce-motion="true") disables all of it.
Off switch: delete css/mt-smooth.css + js/mt-smooth.js and their two tags in html/index.html.

GRID TILES: ELASTIC SPRING RESTORED (v1.8.14, css/mt-smooth.css section 5)
---------------------------------------------------------------------------
hover-polish.css sets "transform .18s ease-out" on every clickable element, which replaced the intended
"transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)" of .tool (style.css) for hover and press - so the Easy Layer grid
tiles stopped springing back on release. mt-smooth.css now restores the elastic transform timing on .tool only
(colour / shadow / opacity keep the hover-polish timing). Verified by reading the computed transition in Chromium with the
real stylesheet order.


TAB ANIMATION MENU (Settings > Tab animation)
---------------------------------------------
Pick how cards enter when you switch tabs: Smooth (default, unchanged), Glide (follows the sidebar: down = cards rise from
below, up = they drop from above), Pop, Fade, Cascade, None. Speed 50-200% and Easing (Soft / Even / Spring) apply to every
style and to the way the Settings window opens. Each card previews its own motion on hover. Greyed out while
Enable Animations is OFF; "Reset animation" and "Reset everything" return to Smooth / 100% / Soft.
Files: css/mt-anim-styles.css, js/mt-anim.js (stored in localStorage mtx.animStyle / mtx.animSpeed / mtx.animEase).
With the default choice nothing is set on <html>, so the panel behaves exactly as before. Two small hooks in js/main.js:
staggerCards() keeps .mt-stagger as long as MTAnim.cleanupMs() says (slow speeds / Cascade need more than 900 ms), and the
settings-reset handler calls MTAnim.reset(). Not scaled by Speed: the sidebar highlight (mt-smooth.js sets its own duration)
and the 110 ms leave fade (showTab() waits for exactly that long).


CURVE SETTINGS WINDOW = FLOW STYLE
--------------------------------------------
The NeuCurve Settings window (gear icon) is now a standalone page copied from Flow's settings window:
neucurve/settings.html + nc-settings.css (Flow's stylesheet) + nc-settings-extra.css + nc-settings.js.
Layout: sidebar tabs (Appearance / Background / Handles / Behavior) + Profile card at the bottom, header with
title, grouped rows, Edit/Close color editor (hue / saturation / value + hex), quick preset swatches, custom dropdowns.
manifest.xml: the settings extension now opens ./neucurve/settings.html?ext=settings at a fixed 585 x 625 like Flow.
It does NOT load the Svelte bundle any more. Every control uses the SAME localStorage keys (prefix neucurve_) and the
same "com.neucurve.sync" event as before, so the Curve tab, Graph Editor, nc-extras.js, nc-bg.js (Adjust Background),
nc-gsize.js and nc-particles.js are untouched.
Tabs: Appearance = UI / Graph line / Handle colors, Quick Presets, Preset Glow (wgDir wgInt wgSize).
Background = gradient (gradOn gradC1 gradC2 gradGlow gradDir gradInt gradArea) + graph image (bgImagePath, bgOpacity,
"Adjust Background" button = nc-bg.js editor). Handles = hStyle hSize hLine hImg. Behavior = layoutMode, autoApply,
overshoot, falling effect (pEffect pColor pAlpha), graph size (gWp gHp gWl gHl). Profile = name / bio / picture
(neucurve_profile, local to this window only).
Not ported on purpose: Language (NeuCurve UI stays English), RGB Mode, Hide Home Indicator, home-indicator color,
video background (NeuCurve has no such feature). The old Svelte settings page is still inside assets/index.js but
is no longer opened. Restart After Effects once so CEP reloads the manifest.

CURVE TAB PRESET BOXES AUTO-FIT (nc-fix22.css)
-----------------------------------------------
The boxes behind the preset graphs now auto-fit the panel like Flow: columns = repeat(auto-fill, minmax(44px, 1fr)),
so the panel width decides how many boxes fit in a row, every box stays square and fills the leftover width.
The old "Grid Columns" slider (3-8) no longer changes anything. Smallest box size: --nc-tile-min in nc-fix22.css.
To go back to fixed columns, delete the nc-fix22.css line from neucurve/index.html.


CURVE TAB VIEW: GRAPH ONLY / PRESETS ONLY (nc-view.css + nc-view.js)
----------------------------------------------------------------------
Curve Settings > Behavior > "Curve Tab View" has two toggles that exclude each other (turning one on turns the other off):
  Hide Preset Graphs   -> only the graph column stays (mode tabs, graph, tools, Apply, gear); the preset column and divider are gone.
  Hide Graph Settings  -> only the preset graphs stay (slider, library toolbar, preset grid). The Apply bar and the gear stay on
                          purpose: presets still need Apply, and the gear is the way back to Settings.
Both off (default) = the normal two-column Curve tab, unchanged.
Works in portrait and landscape. Not applied to the Large Graph Editor window or the Settings window.
Storage: localStorage neucurve_hidePresets / neucurve_hideGraph ("true"/"false"), synced live through the same
"com.neucurve.sync" event as every other NeuCurve setting (no restart of the panel needed).
Files: neucurve/nc-view.css, neucurve/nc-view.js (linked at the end of neucurve/index.html), neucurve/settings.html (new group),
neucurve/nc-settings.js (two toggles + the exclusion), neucurve/nc-settings-extra.css (hint text under a toggle label).
To remove the feature: delete the nc-view.css / nc-view.js lines from neucurve/index.html.


CURVE TAB: TOOL ROWS FIT THE GRAPH COLUMN IN LANDSCAPE (nc-fix23.css)
----------------------------------------------------------------------
In the side-by-side layout the rows under the graph used to overflow the narrow graph column (save-preset icon over the divider,
value pill squeezed to "0", Apply 0px wide, gear outside). Both rows now wrap: icons shrink 30 -> 24px, the value pill and Apply
keep a minimum width and move to their own line when the column is narrow. Wide columns keep single-line rows. Portrait untouched.
To go back, delete the nc-fix23.css line from neucurve/index.html.


SETTINGS DROPDOWNS NO LONGER CUT OFF (nc-settings.js place(), nc-settings.css .is-up)
----------------------------------------------------------------------
The Background Effect list always opened upward, so near the top of the scroll area its first items were clipped and could not
be scrolled to. Every Settings dropdown (Layout Mode, Background Effect) now opens downward when it fits, otherwise upward,
and if neither side has room the list gets its own scrollbar.


HANDLE NUMBERS, DROPDOWN CLIP, AUTO WINDOW SIZE (nc-handle.css/js, nc-settings.*, manifest.xml)
----------------------------------------------------------------------
- Handle numbers: press (or drag) a handle in the Curve tab and its value ("0.38, 0.43") shows next to it, plus the 0 / 1 axis
  numbers; release = clean Flow look again. The label was always drawn by the bundle but nc-flow.css hides every <text> in the
  graph; nc-handle.css un-hides the value label and nc-handle.js sets html.nc-press while the pointer is down.
  Files: neucurve/nc-handle.css, neucurve/nc-handle.js (linked in neucurve/index.html).
- Falling Effect / Layout Mode list cut off: the card (.settings-group, overflow:hidden) clipped the open list. The open card now
  gets .has-dd-open (overflow visible, raised above the next cards) and the list picks up / down / scrolls (place()).
- Settings window fits its content: after opening, switching tab, opening a color editor or any layout change, nc-settings.js
  fitWindow() calls CSInterface.resizeContent(585, height) so the active tab fits, limited to the screen height (min 420).
  manifest.xml: settings window is now 585 x 420-1400 (was fixed 585 x 625) and the window box in nc-settings-extra.css follows
  the window height. Restart After Effects once so CEP reloads the manifest.


GRAPH SIZE MENU REMOVED FROM CURVE SETTINGS
----------------------------------------------------------------------
Behavior no longer has the "Graph Size" group (4 sliders + "Reset to Auto"). The graph can still be resized by dragging the small grip
at the graph's bottom-right corner in the Curve tab (nc-gsize.js is untouched, same neucurve_gWp/gHp/gWl/gHl keys).


SETTINGS WINDOW (separate window, like NeuCurve Settings)
---------------------------------------------------------
The gear button now opens Settings in its own window (html/settings.html, extension id com.ogatt.multitool.settings,
registered in CSXS/manifest.xml as Modeless). Sections: Appearance, Background, Motion, Idle screen, Easy Layer, Data and updates.
The controls themselves still live in #settings-modal inside the panel (never shown now), so every existing handler keeps working.
js/mt-settings-remote.js (panel) replays what you do in the window on those controls and sends their state back;
js/mt-settings-window.js (window) mirrors it. Transport: js/mt-settings-bus.js (CEP event "com.multitool.settings.*").
Controls are matched by id or data-* attribute, so a new control needs the same id in html/index.html and html/settings.html.
After updating, restart After Effects (the manifest changed).

Settings > Background > "Use original media colors" (same switch as NeuCurve)
- ON (default, same look as before): image / GIF / video keep their own colors.
- OFF: background goes grayscale + contrast(1.05), like NeuCurve. Saved in localStorage "mtx.bgOrig"; Reset settings turns it back ON.
- Files: html/index.html + html/settings.html (#bg-original-color), js/main.js (Settings.init), css/style.css (html.mt-bg-gray).

NeuCurve > Settings > Adjust Background: preview fix
- The full-window preview stayed blank when the Settings window did not get "?ext=settings" in its URL. nc-bg.js now also detects
  settings.html itself. "Done" label now picks a readable color on a white/light UI color (--nc-bge-on).

NeuCurve > Settings > Adjust Background now matches Multi Tool's Background "Display" editor
- Same card (solid, 14px radius, 22rem), title "Display", dim labels + bold values, sliders with accent fill-trail, pill Reset/Done buttons.
- Files: neucurve/nc-bg.css, neucurve/nc-bg.js (fill-trail --_pct).

Multi Tool > Settings > Background > Adjust background now looks like NeuCurve's editor (the reference)
- css/mt-bg-editor.css (loaded before material-theme.css): same card, sizes, thin slider, mono readout and buttons. Title "Adjust Background".
- NeuCurve's own editor is back to its original look (only the earlier preview fix + readable Done label are kept).

Multi Tool Settings window > Background > Adjust background: NeuCurve-style preview (js/mt-bg-preview.js, css/mt-bg-preview.css)
- The Settings window turns into a full-window preview of the background; the bright frame = the shape of the panel, the rest is dimmed.
  Drag = move, scroll = zoom, Esc / Done = close. Card: Opacity, Zoom, Position X/Y, Reset, Done. The panel behind updates live.
- The panel no longer hides its UI for this; the old in-panel editor (#bg-editor) stays as a fallback (opened from the panel's own Settings modal).
- Panel side: js/mt-settings-remote.js sends "bgview" (view/opacity/panel shape) and, on request, "bgsrc" (file / data URL).
  A session-only video (blob: URL) cannot be shown in another window: the sliders still work, the preview shows a note.

Idle screen: time in After Effects, timer, notes, daily list (js/mt-idle-focus.js, css/mt-idle-focus.css)
- Idle screen now shows, under the clock: live Hours / Minutes / Seconds in After Effects, the timer (progress bar, pulses when done),
  a "Today" daily list (up to 8 tasks) and your notes. The idle screen is display-only; edit everything in Settings > Idle screen.
- Timer: set hours + minutes, Start / Pause / Resume / Reset. Keeps running while the panel is open (survives a panel reload; if it ran out
  while the panel was closed it shows "Time is up"). When time is up: toast + sound (switch + volume + Test sound in the same section).
- Sound: "Anime girl voice + chime" = a rising sparkle chime, then a female voice installed on the computer (Japanese if available,
  otherwise English), pitched up, saying a short "time's up". "My own file" copies a chosen audio file to Documents/MyMultitoolExtension/Sounds
  (use a real anime voice clip here). If no voice exists on the computer the chime alone plays.
- Daily list ticks clear at the start of a new day (tasks stay). "Reset everything" clears all of it.
- The old one-line session chip (.idle-session) is hidden; the live segments replace it.

[settingsfix] Settings window did nothing (Multi Tool) + NeuCurve Settings cut off.
- js/mt-settings-bus.js: every message now travels over BOTH the CEP event AND a localStorage mailbox (+ storage event + 250 ms poll),
  de-duplicated by sender id / counter. If CEP events are dropped, the settings still reach the panel and the panel state still reaches the window.
  Old requests left in storage from an earlier session are never replayed. Cache-bust ?v=2.
- neucurve/nc-settings-fit.css (new, loaded last in neucurve/settings.html): removes the hard-coded 583 x 620 / 559 x 596 / 383 px boxes.
  The window now follows its real size; rows wrap; below 560 px wide the sidebar becomes icons only (scaled displays have a narrower CSS viewport than 585).
- CSXS/manifest.xml: Curve settings window MinSize width 585 -> 380, MaxSize 585 -> 900 so it can be resized. Restart After Effects after installing.

[motionfix] Animations ignored when Windows "Show animations" is off; NeuCurve color dots; "Use Original Media Colors".
- Removed the remaining @media (prefers-reduced-motion) blocks (hover-polish, mt-settings-pro, mt-settings-window, nc-flowfx, nc-gbox,
  nc-icons-pro, nc-polish). They froze hover lifts, settings-window transitions, NeuCurve falling particles/rain and icon motion whenever the
  OS animation setting was off. Animations now only stop through Settings > Enable animations (<html data-reduce-motion="true">).
- neucurve/nc-settings.js: the colored dot on every "Edit" color button (UI / Theme, Graph Line, Handle & Node, Effect) now follows its color
  (only the two gradient buttons were painted before, the rest stayed black).
- neucurve/nc-bg.js: "Use Original Media Colors" off now really grayscales the background. A CSS filter on an SVG <image> is ignored by older
  CEP Chromium, so an SVG feColorMatrix filter (#nc-gray-f) is set inline on the graph image and on the Adjust-background preview.

[cardsize] Curve tab > preset options (three dots) > Card Size slider did nothing.
- neucurve/nc-fix22.css forced grid-template-columns to auto-fill and overrode the slider's --grid-cols. It now uses repeat(var(--grid-cols, 4), 1fr),
  so the slider (3-8 columns) changes the card size again. Tiles stay square. Cache-bust ?v=2.

[dropdowns+sound] Settings-window dropdowns match Multi Tool; anime voice removed; custom sound option.
- html/settings.html now loads js/mt-select.js + css/mt-select.css + css/mt-settings-dd.css: every <select> in the Multi Tool Settings window opens the same
  animated menu as the panel (pop-in, staggered items, accent highlight bar, check mark) and follows the theme color live.
- neucurve/nc-settings-dd.css (new, last in neucurve/settings.html): Layout Mode / Background Effect menus restyled to the same look, tinted by the NeuCurve
  UI / Theme Color (--p-rgb). Behavior unchanged.
- Idle timer sound (Settings > Idle screen > Sound): "Anime girl voice" and its speech code were deleted. Options are now "Chime (built-in)" and
  "Custom sound file". Choosing Custom with no file opens the file chooser at once; until a file exists the chime plays. A saved old "voice" value becomes "chime".


IDLE SCREEN: SLIDE / TAP TO LEAVE, EDITABLE NOTES + TASKS, UNFINISHED HISTORY
Mouse movement no longer leaves the idle screen. A bar at the bottom does: Settings > Idle screen > "Leave idle screen by"
= Slide (drag the round handle to the end of the bar and release) or Tap (click the bar). Esc leaves in both modes.
Code: Idle.applyExitMode()/bindUnlock() in js/main.js, #idle-unlock in html/index.html, .idle-unlock in css/mt-idle-focus.css.
Key: mtx.idleExit = "slide" | "tap" (default slide).
While idle, the Today list and the Notes card take clicks and typing: tick a task, edit its text, add (max 8) or remove it,
type in Notes. Edits are mirrored into the Settings controls (same mtx.todoN / mtx.todoDoneN / mtx.notes keys).
Daily tasks no longer get lost: tasks, ticks, notes and history are kept in memory, in localStorage and in
Documents/MyMultitoolExtension/DailyTasks.json (written 0.4 s after each change). On start, the file is used when
localStorage is empty or older (cleared, or full because of a big GIF background).
Unfinished history (mtx.missed, JSON): when the date changes, every task that was not ticked moves there with the date it
was missed (same task missed again = one entry, day count goes up), the ticks reset, the tasks stay. Open it with
"Unfinished (n)" under the Today list. Finish = done today (leaves the history and ticks today's task with the same text);
x = remove. Ticking today's task also clears its history entry. Settings > Idle screen > Daily list shows the count and
has "Clear history". Code: newDay()/readMissed()/finishMissed() in js/mt-idle-focus.js.

SETTINGS WINDOWS: NO NATIVE CONTROLS (Multi Tool + NeuCurve)
-------------------------------------------------------------
Both Settings windows now use the same controls as the Multi Tool panel:
- Color fields open the themed picker popover (js/mt-colorpicker.js). NeuCurve "Edit" buttons use it too; the old inline
  hue/saturation/value sliders are gone (nc-settings.js openColorEditor, anchored through an invisible input).
- Number fields get the themed stepper (js/mt-spinbox.js, Multi Tool window).
- Dropdowns use the themed menu (js/mt-select.js in Multi Tool, nc-settings.js dropdown + nc-settings-dd.css in NeuCurve).
- Sliders (.settings-range and the Adjust Background preview) use the panel slider: sunken track, accent fill, round thumb.
- Checkboxes (.settings-check) are drawn custom, with an accent fill and tick.
Styles: css/mt-settings-controls.css (shared, loaded last) + neucurve/nc-settings-controls.css (NeuCurve accent bridge).
Only the OS file chooser (Choose image / Browse) stays native; CEP has no themed replacement for it.

IDLE SCREEN: TAP MODE LOOK
--------------------------
Settings > Idle screen > Leave idle screen by > Tap now shows a round beacon button (pulsing rings, "Tap to open" under it,
no bar) instead of the slide-style pill. Slide mode is unchanged. Styles: css/mt-idle-focus.css ([data-mode="tap"] block);
the extra tap icon sits next to the chevron inside #iu-handle in html/index.html and is shown only in tap mode.


CURVE DRAG SMOOTHNESS, MOVE CURSOR, SETTINGS CONTROLS, MINIMAL TAP SCREEN
--------------------------------------------------------------------------
- Dragging a handle / the curve was heavy because neucurve/nc-glow.js re-synced 14 wide blended strokes (plus a forced
  getComputedStyle) synchronously on every mutation. Now: 8 glow steps, no mix-blend-mode, one sync per animation frame,
  cached curve colour, and only every 3rd glow layer is drawn/updated while a drag runs (nc-glow.css html.nc-graph-drag;
  full glow returns on release).
- Handles and anchors show the Move cursor on hover and for the whole drag (nc-live.js adds html.nc-handle-drag, nc-live.css).
  Dragging the empty graph keeps the crosshair.
- css/mt-final-controls.css (last in html/settings.html and neucurve/settings.html): every range slider and scrollbar in both
  Settings windows is themed; color-scheme is set so nothing falls back to the OS look. js/mt-settings-polish.js now sets --fill
  on every range (also when its value is set from code).
- Idle screen, Tap mode: the filled accent disc + two pulsing rings + caps label became one hairline ring with a dot, one slow
  ring and a quiet label (css/mt-idle-focus.css). Height fits the space the idle box reserves, so it no longer overlaps the cards.

GRAPH RESIZE GRIP MOVED (Curve tab)
-----------------------------------
The resize grip (nc-gsize.js) no longer sits on the plot's bottom-right corner. It is now a faint 14px mark in the box's corner
cluster, directly left of the expand icon, and turns solid on hover. Drag, Shift = keep proportions, double-click = auto: unchanged.
Styles: neucurve/nc-gbox.css (v21 block).

CURVE TAB: OVERSHOOT RESISTANCE
-------------------------------
With "Allow Overshoot" ON, dragging a Bezier handle or a Custom anchor/handle above 1 or below 0 now feels heavy: inside 0..1 the
handle follows the pointer 1:1, outside it only follows a fraction that shrinks fast (pointer 0.5 past the edge = handle 0.14 past,
and it can never pass about 0.37 beyond the edge). That discourages overshoot without removing it. Allow Overshoot OFF still clamps
hard to 0..1. Elastic / Bounce / Wave are unchanged. Bundle patch: ncClampOv() / ncClampOvInc() / ncOvG() in assets/index.js.
Switch the resistance off (plain free overshoot again): localStorage neucurve_ovResist = "0".

CURVE TAB: FLOOR FILLS THE GRAPH BOX + SETTINGS DROPDOWN FIX
------------------------------------------------------------
1) Graph floor / background fills the whole graph box (neucurve/nc-gfill.js, nc-gbox.css v20, nc-bg.js v16).
   The plot (curve, handles, grid, 0..1 range) keeps its size. Only the floor rect and the Graph Background image are stretched
   to the .canvas-area box plus OVERSHOOT px on every side (default 6, constant at the top of nc-gfill.js), so the background
   shows edge to edge with no seam. .canvas-area crops the overshoot. Off: localStorage neucurve_gFill = "0".
   Settings > Graph Background > Adjust Background now previews the shape of the whole box (bgAspect follows the box).
2) NeuCurve Settings dropdowns (Layout Mode / Background Effect), nc-settings.js v9:
   - the open list is moved to <body> with position:fixed (class is-floating), bounded by the window, so no card / scroll area /
     transformed ancestor can clip or offset it; small windows open up or down with the most room.
   - ":focus-visible" removed from dropdown selector lists in nc-settings.css / nc-settings-pro.css / nc-settings-dd.css: old CEP
     (Chromium < 86) drops the whole rule when one selector in the list is unknown, which killed the hover / open styles.

CURVE TAB: NO OVERSHOOT RESISTANCE + LANDSCAPE PLOT FILLS THE BOX
-----------------------------------------------------------------
Supersedes "CURVE TAB: OVERSHOOT RESISTANCE" above.
1) Resistance is now OPT-IN. Dragging a Bezier handle / Custom anchor past 0 or 1 follows the pointer 1:1, exactly like inside 0..1,
   so entering overshoot no longer feels different or heavy. Bring the old rubber-band back: localStorage neucurve_ovResist = "1".
   Allow Overshoot OFF still clamps hard to 0..1. Bundle patch: ncOvRes() in assets/index.js.
2) Landscape layout: the plot was only (windowWidth * 50%) wide using a stale width, then capped again by the 1.3 aspect rule, which left
   wide empty bands left/right of the plot. Now the plot width is the measured width of the graph box (bundle: r(12,s=se||...)) and
   "fit" (no aspect cap, no 300px cap) applies to landscape too (nc-gsize.js v8: __ncGS / __ncGClamp(nw,nh,panelW,land)).
   Together with nc-gfill.js the floor and the Graph Background reach the box edge plus 6px overshoot.
   Old landscape look: localStorage neucurve_gFit = "0".

CURVE TAB: PREVIEW STRIP INSIDE THE GRAPH BOX WHEN "HIDE PRESET GRAPHS" IS ON
-----------------------------------------------------------------------------
The scrub strip (track line + ball that previews the animation of the curve) used to disappear together with the presets. In the
graph-only view it is now docked inside the graph box, along the bottom edge (left of the resize grip / expand icon).
Click the strip = Preview (it presses the Preview button that is hidden with the preset toolbar; the ball runs along the track).
Turning Hide Preset Graphs off hands the strip back to nc-flow.js (under the graph / above the presets) as before.
Files: neucurve/nc-view.js v3 (dock + click), nc-view.css v3, nc-flow.js v24 (does not re-park the strip while nc-view-graph is on).

CURVE TAB LIVE PREVIEW BALL + GRAPH RESIZE GRIP FIX
---------------------------------------------------
Live Preview Ball (neucurve/nc-ball.js + nc-ball.css): the ball that ran on the scrub strip under the graph now runs INSIDE the
graph, looping forever along the drawn curve (x = time, y = value) with a short comet tail. It follows every edit live and works in
all modes (Bezier, Custom, Elastic, Bounce, Wave, Steps) and in the Large Graph Editor. The strip under the graph is hidden while it
is on. The Preview (play) button restarts the run. Settings > Behavior > "Live Preview Ball" (neucurve_liveBall, default 1);
OFF = ball removed, strip comes back.

Resize grip fix (neucurve/nc-gsize.js v24): the square box cap used to switch off on the first drag step, so the box jumped to the
full panel width, the plot jumped, the grip left the cursor, and it flickered at 100%. The box now stays put while resizing; only the
plot inside it changes (25-100% per axis). Make the whole box bigger with the divider under it. Double-click the grip = auto.

Idle screen: slider and "About" removed
The unlock slider/tap bar (#idle-unlock), the "Leave idle screen by" setting (mtx.idleExit) and the About info button/popover
are gone. Leave the idle screen with Esc or by clicking an empty spot (Idle.bindLeave() in js/main.js). Mouse movement does not leave.

IDLE SCREEN WIDGETS (adjust)
----------------------------
Idle screen > small button bottom right = "Adjust widgets" (css/mt-idle-adjust.css, js/mt-idle-adjust.js).
Drag the grip under a widget to resize it (the width snaps to a 12-column grid with equal gaps; text scales with the width), eye button = show / hide it, "Reset sizes"
= defaults, button again or Esc = done. The Timer now always shows on the idle screen with play / pause / reset
(js/mt-idle-focus.js renderTimerChip). Clicking a button that redraws its own icon (stopwatch / timer) no longer
counts as an empty-spot click that leaves the idle screen (bindLeave in js/main.js uses event.composedPath()).

Idle screen motion + auto-hide (css/mt-idle-adjust.css, js/mt-idle-adjust.js)
After a few seconds without movement the Hide-panels switch, every box and the adjust button fade + slide away (staggered),
so the wallpaper shows; mouse move / touch / key brings them back (the first tap on a hidden UI only reveals it).
Not while adjusting, hovering a box, typing in one, or in "Mouse move" exit mode. Adjust mode > "Auto-hide" pill: off / 3 / 6 / 10 s
(key mtx.autoHide, default 6). Changing a box width glides (FLIP, 280 ms); reduce-motion switches all of it off.

Idle screen: move boxes, no more "Hide panels" (fix19)
The "Hide panels" switch is removed; the cards are always open. Adjust button > drag any box anywhere (eased follow, lift, soft snap
to the other boxes / its own place with guide lines; double-click = back; arrow keys nudge a focused box). Stored as an offset from the
box's grid place in mtx.wLayout (x, y). "Reset layout" puts every box back (position + size). Show / hide per box: eye button.

Idle screen: no stacking + self-hiding adjust button (fix20)
A box dropped / resized / reset onto another one glides to the nearest free spot (red outline while dragging over another box);
saved layouts are checked when the idle screen opens and when the panel is resized. The adjust button hides itself after ~2.5 s
without mouse movement (not while adjusting) and returns on the next move.

fix21: clicking the adjust button froze / crashed the panel. The body class observer in js/mt-idle-adjust.js re-wrote a body class on every
callback while adjusting, which queued a new mutation record, forever. It now reacts only to the idle screen opening / closing, and body
classes are written only when they really change (setClass).
