Multi Tool - After Effects CEP panel
====================================

HAND-OFF RULES FOR ANY AI (Claude, Gemini, ChatGPT, ...)  -  READ THIS FIRST
----------------------------------------------------------------------------
The owner may switch between AI assistants at any time. Whoever you are, follow these rules so the owner's
release scripts keep working.
1. ZIP NAME: deliver the result as ONE zip named exactly   Multi_Tool.zip
   Never add the AI name, a version, a fix name or a date (no Multi_Tool_Gemini.zip, Multi_Tool_v1.9.zip,
   MultiTool_Fix.zip, Multi_Tool (1).zip). The name stays Multi_Tool.zip no matter which AI made it.
2. ZIP CONTENT: the COMPLETE extension, not only the changed files. Put CSXS/, html/, css/, js/, jsx/, neucurve/,
   README.txt (and every other extension file) at the top level of the zip. One wrapper folder is also accepted.
   Do NOT include: .git, update.json, version.json, changelog.txt, any .bat, make-update.ps1. Those belong to the
   owner's work folder and are handled by the scripts. The release script refuses a zip that has far fewer files
   than the repo, so nothing gets deleted by accident.
3. VERSION: do not bump or edit version numbers. Update.bat asks the owner (continue from the previous version, or
   type one).
4. README.txt: always ship the full, updated README.txt in the zip. Append what you changed at the END, in the
   existing style ("fixN (version): what / cause / fix"), and keep this section at the top.
5. Do not write new release / update / zip scripts. They already exist (see below).

OWNER'S WORK FOLDER (not part of the extension; lives next to the repo clone)
  Update.bat      drop Multi_Tool.zip in the folder, double-click. It unpacks the zip into the repo clone ("repo"),
                  shows the current version, lets the owner choose [1] continue (+1 on the last number) or
                  [2] type a version, asks for a one-line changelog, builds update.json and pushes to GitHub.
                  Nothing changed in the zip = nothing is released. The used zip is renamed terpakai.zip.
  Install.bat     installs into After Effects (registry + copy to %APPDATA%\Adobe\CEP\extensions\MultiTool).
                  Uses Multi_Tool.zip if it is in the folder (test before releasing), otherwise the repo clone.
  Downgrade.bat   puts the files of an older release back and publishes them as a NEW, higher version.
  Share-Zip.bat   makes MultiTool-Share-<version>.zip (Install.bat + MultiTool folder) in Downloads for friends.
  make-update.ps1 helper used by Update.bat and Downgrade.bat. Not run by hand.
  config.txt      GitHub repo URL (asked once). repo\ is the clone, tmp\ is a temporary unpack folder.

INSTALL
1. Copy the whole "MultiTool" folder to:
   Windows: C:\Users\<you>\AppData\Roaming\Adobe\CEP\extensions\
   macOS:   ~/Library/Application Support/Adobe/CEP/extensions/
2. Enable unsigned extensions (once):
   Windows registry: HKEY_CURRENT_USER\Software\Adobe\CSXS.<version>  ->  PlayerDebugMode = "1" (String)
   macOS: defaults write com.adobe.CSXS.<version> PlayerDebugMode 1
   (CSXS version: 10 for After Effects 2021, 9 for 2019-2020, 11 for 2022+)
3. Restart After Effects -> Window > Extensions > Multi Tool.
   (Shortcut for steps 1-2 on Windows: run Install.bat.)

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
- Publisher steps: put Multi_Tool.zip in the work folder and run Update.bat (see HAND-OFF RULES at the top). It writes
  update.json + version.json and pushes everything to the PUBLIC repo in version.json ("repo", optional "branch", default "main").
  update.json may also contain "remove": ["old/file.js"] to delete files, and "ref" (a commit/tag) to pin the download source.
- Install / manual update on a PC: Install.bat (copies the extension into %APPDATA%\Adobe\CEP\extensions\MultiTool).
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

fix25: scrolling the left tab bar could drop the panel into the idle screen. js/tab-wheel.js handles that wheel on the window
(capture) and stops the event, so the Idle timer (document capture listener in main.js) and js/mt-away.js never saw it, and the
countdown kept running while you scrolled with a still mouse. tab-wheel now dispatches "mt-wheel-activity" before swallowing the
event; Idle (main.js) and mt-away.js listen for it and count it as activity.

fix26: coming back to Animation Presets now lands on the old scroll position at once, like the Tools tab. The "Presets" card title
carries a live count ("Presets (60)", filled in as soon as the tab is painted from the cache), so its open/closed memory key
("Presets" on a cold open, "Presets (60)" on the next visit) never matched and the card came back closed; there was nothing tall
to scroll to, so the offset stayed at the top until the card was reopened. js/panel-refinements.js now ignores a trailing "(n)" in
the key (open state and card accent colour), so the card returns open and the saved offset applies on the first frame.

fix27: NeuCurve lag.
- Mode switch (Bezier -> Custom and back): the morph (nc-morph.js) and the live ball (nc-ball.js) sampled the Custom path with
  getTotalLength + up to 1200 getPointAtLength calls (about 70 ms per switch, far more on a cold JS engine right after AE starts;
  nc-ball.js did 260 of them on EVERY Custom drag frame). New sampleCubicPath() evaluates the M / L / C path analytically; the
  geometric sampler stays as a fallback for any other command and is capped at 400 points. Measured: no getPointAtLength left in
  a mode switch, switch time about 100 ms -> 50 ms, no long task.
- Constant background work: the live ball (nc-ball.js) and the APPLY glow (nc-apply-glow.js) wrote ~2000 attributes a second. Both now
  run at ~30 fps, stop writing while the graph is being dragged (the ball is hidden for that time, nc-glow.css), and the ball no
  longer forces a layout every frame. Mutations at rest: 1239 -> 630 per 3 s; graph drag keeps a steady 60 fps in the test.

fix31: NeuCurve portrait preset tiles looked wrong (huge cards, cut off at the bottom). nc-fix22.css forced repeat(--grid-cols, 1fr),
so on a wide panel the default 5 columns became ~150px squares with thick curves. New neucurve/nc-fix24.css (linked after nc-fix23.css
in neucurve/index.html), portrait only (.content-wrapper:not(.is-landscape)): repeat(auto-fill, minmax(270px / --grid-cols, 1fr)), so
the default is ~54px tiles and the panel width decides how many fit per row (787px = 12). Card Size slider still works (3 = bigger,
8 = smaller). Radius 10px, name line 9px. Landscape is untouched. calc() only, no min()/max()/clamp() (Chromium 74 / AE 2021 safe).

fix32: NeuCurve graph cut off in landscape / auto mode (left, right and 1,1 end clipped, plot bigger than its box).
Two causes, both in the Curve tab:
1) .canvas-area has the class "relative" but the utility class is not in the built CSS, so it computed to position:static. The bundle
   measures the box with Svelte's hidden resize <iframe> (absolute inside .canvas-area); with a static parent that frame covered the whole
   window, so the plot was sized from the window (e.g. 840 x 700) instead of the box (420 x 509). New neucurve/nc-fix25.css (linked after
   nc-fix24.css in neucurve/index.html): .canvas-area { position: relative }.
2) The plot was sized once at start-up. When nc-flow.js then docked the toolbar / buttons under the graph, the box shrank but no resize
   event reached the bundle, so the plot kept the old size (e.g. 198 x 521 in a 216 x 409 box). neucurve/nc-gsize.js v25: place() now runs
   fitCheck(): if the SVG is bigger than .canvas-area it shrinks the box by 1px for two frames (min/max-height) so the resize frame fires,
   then calls __ncGBump(). At most 3 tries per box/plot size pair (no loop). nc-gsize.js query bumped to ?v=14.
Both are needed: CSS alone and JS alone each left auto mode clipped. Checked at 491x627, 700x500, 900x700, 560x900, 400x700 in
portrait, landscape and auto: the SVG always fits the box. Portrait and the Settings / graph windows are unchanged.

fix33: NeuCurve landscape graph still came up cut off / not filling its box in the real host until the panel was reloaded AND the divider
between graph and presets was dragged. The fix32 fit check only ran when a DOM mutation or a window resize happened to call place(); if
Svelte's hidden resize frame missed a change and nothing else fired, the stale plot stayed. neucurve/nc-gsize.js v26 (query ?v=15):
- fitCheck() now also catches a plot that is too SMALL (landscape, automatic size, gFit on: the plot must fill the box; portrait caps and
  custom Graph Size % are left alone).
- Self-healing: a ResizeObserver on .canvas-area plus a light 800 ms watchdog (reads only, skipped while the document is hidden or a drag is
  running) call the check, so a stale plot heals by itself within about a second.
- Escalation: try 1 shrinks .canvas-area by 1px for two frames; try 2+ also shrinks .fixed-section by 1px for two frames, which is what
  a 1px divider drag does. 3 tries, then a 2 s pause before it may try again (no loop).
Tested in headless Chromium: 15/15 size x layout combos fit, 5 aggressive resize-timing scenarios fit, injected too-big / too-small SVG
heals, 0 nudges in 6 s of idle. The exact host event that leaves the plot stale could not be reproduced outside After Effects.

fix37: lag when opening the Multi Tool Settings window and the NeuCurve Settings window.
Found by reading the code (not measured inside After Effects, which is not available here). Causes, biggest first:
1) CSXS/manifest.xml: both Settings windows loaded jsx/host.jsx (357 KB) into their own ExtendScript engine on every open, on After
   Effects' main thread. They never call ExtendScript, so <ScriptPath> is removed from com.ogatt.multitool.settings and
   com.ogatt.multitool.curve.settings. The panel and the Graph Editor keep it. After Effects must be restarted once (CEP caches the manifest).
2) neucurve/settings.html: the Google Fonts <link> blocked the first paint (blank window until the request finished or timed out offline).
   It now loads with media="print" onload="this.media='all'": same Inter font when online, nothing blocked.
3) neucurve/nc-settings.js: the window resized itself 4 times while opening (resizeContent at 0 / 250 / 500 ms + the fit). It now resizes
   only when its size really differs from the wanted size (fitWindow and resizeWindow both check window.innerWidth / innerHeight).
4) js/mt-settings-bus.js v3: the 250 ms mailbox poll parsed every stored message on every tick (a background image "bgsrc" is up to
   400 KB of JSON). It now remembers the text it read and parses only when it changed. Delivery is identical.
5) js/mt-settings-remote.js v3 (panel side): while the window is open the panel read getComputedStyle() for about 200 controls every
   350 ms. Only the 3 controls the window mirrors as hidden/shown (data-mirror-hidden) are checked now.
6) css/mt-settings-pro.css v3 + js/mt-settings-polish.js v4: the card stagger (up to 280 ms delay + 340 ms) ran on the first open, so the
   window looked half empty while loading. It now runs only after a tab was clicked (html.p-anim). The title animation no longer animates
   letter-spacing (re-laid out the text each frame); opacity + transform only.
Not changed: CEFCommandLine flags (changing them could change how the windows share localStorage with the panel), the AE 2021 shim.

fix3 (1.8.30): CURVE TAB - graph mode switch now morphs with RE-Faster's logic, and no lag on the first switches.
Source of the logic: RE-Faster's category morph (updateGraphCategoryUI): 500 ms, ease-out-expo (1 - 2^(-10 t)), no overshoot, the shape
is always blended from what is on screen right now (so switching again mid-morph never snaps), plus its "is-morphing" frame-drop guard.
- neucurve/nc-morph.js v22: DURATION 380 -> 500 ms, ease = ease-out-expo (was cubic + small overshoot), GRID 420 -> 200 points.
  One render per frame: the observer render (needed so the app's own "d" write never reaches the screen) and the rAF render used to run
  twice per frame while the app eases its Y viewport; the rAF render now steps aside while the app is writing.
  Idle-time warm-up (3 slices of ~2-4 ms, 1.2 s after load, no DOM, no app state): runs the parser / sampler / frame builder on
  synthetic Bezier / Custom / Elastic-like curves so the first real switch after AE starts already hits optimised code.
- Frame-drop guard (RE-Faster's body.is-morphing): while a morph runs, the 8-stroke glow, the handle halos and the live ball are not
  painted or updated (nc-morph.css on svg.curve-svg.nc-morphing; window.__ncMorphUntil read by nc-glow.js, nc-ball.js,
  nc-apply-glow.js). The glow fades back in over 0.3 s at the end (.nc-morph-out). The flag expires by itself (250 ms, refreshed
  every frame), so a hidden frame can never leave the glow switched off.
- Not ported: RE-Faster's fake motion blur (blur() on the whole svg). It re-rasterises the graph every frame, which is the opposite of
  this fix. Off-switches: DURATION / GRID at the top of nc-morph.js; delete the "html.nc-morph..." block at the end of nc-morph.css to keep
  the glow during morphs.
Cache-bust: nc-morph.js ?v=22, nc-morph.css ?v=16, nc-glow.js ?v=4, nc-ball.js ?v=4, nc-apply-glow.js ?v=3 (neucurve/index.html).

fix4 (1.8.30): CURVE TAB - first mode switches heavy in After Effects only (fine in a browser tab).
Cause: cold engine. The first time each mode is shown, the bundle builds that mode's UI, the stylesheets resolve for it and every helper
script (nc-flow, nc-gsize, nc-icons-pro, nc-extras ...) runs its mutation handlers for the first time on unoptimised code in a
software-rendered CEF. A desktop browser hides this; AE shows it until each mode has been used a few times.
Fix: neucurve/nc-warm.js + nc-warm.css (new). Right after the graph is up, the Curve frame clicks through every mode tab once and ends on
the mode you were on (the app only stores the active mode), while the page is hidden. The host keeps its existing loading spinner
meanwhile (js/main.js, Curve.show / message handler: removed on {mtCurveReady} from the frame, 4 s safety timeout). The page then fades
in (opacity only). Touching the panel (mouse, key, wheel, touch) stops it at once and restores the mode.
- Only inside the Curve tab frame. The Large Graph Editor and Settings windows are never cycled (they are synced with the main panel).
- nc-morph.js v23: no morph while warming. Cost: about a second of spinner the first time the Curve tab is opened in a session.
- Off: WARM = false at the top of nc-warm.js, or localStorage neucurve_noWarm = "1", or delete the nc-warm lines in neucurve/index.html.
Not measured inside AE (no AE / CEF here): the warm-up logic itself was tested with stubs (order, restore, flags, failsafe).

fix5 (1.8.30): IDLE SCREENSAVER enter / exit smooth + squashed widgets on exit; CURVE TAB first mode switch lag.
1) Squashed widgets when leaving idle. Cause: .idle-clock only had its full-screen box (top/right/bottom/left: 0) while body.is-idle was set.
   When is-idle was removed the box collapsed to hug its content while it was still fading out (0.25 s); the widget grids use
   width: min(100%, 36rem) (a percentage of a shrink-to-fit parent), so they were re-laid out narrow and short = "gepeng".
   Fix: css/mt-idle-motion.css (new) keeps the SAME full-screen geometry in both states. Nothing resizes, only opacity + transform move.
2) Idle enter / exit motion (motion-design: calm / premium, same curves as css/mt-idle-adjust.css --ia-in / --ia-out):
   - enter: panel fades + sinks 0.5 rem (300 ms accelerate), clock arrives 120 ms later (480 ms decelerate); date, time, then the five boxes
     rise in one after the other (45 ms apart, 225 ms total). Panel is parked after the fade (PARK_DELAY_MS 450 > 300).
   - leave: clock fades + sinks (220 ms accelerate); the panel rises + fades in (360 ms decelerate, 60 ms delay). It no longer pops in.
   - js/main.js v30 Idle.exit(): .app is un-parked with transitions switched off for one frame, so it never slides in from -200vw; the
     message card keeps its "is-in" class until the clock has faded (was removed on the first frame = it vanished at once).
   - js/mt-idle-adjust.js v8: the auto-hide state (is-quiet) is cleared 420 ms AFTER leaving idle (was at once): hidden boxes no longer
     jump back to visible, nor replay their entrance, while the clock is still fading out. Cleared again at once on the next entry.
   - prefers-reduced-motion and Settings > Animations OFF: no transform, no stagger, instant.
   Cache-bust: css/mt-idle-motion.css ?v=1 (new), js/main.js ?v=30, js/mt-idle-adjust.js ?v=8 (html/index.html).
3) Curve tab: first graph mode switch after opening AE lagged. Cause: nc-warm.js (fix4) cycled every mode behind the spinner, but nc-morph.js
   was switched OFF while warming, so the morph itself (start / render / moveHandles / fadeBack and the .nc-morphing / .nc-morph-out style
   changes) was still cold on the first real switch.
   Fix: nc-morph.js v24 runs the real morph while warming, 70 ms long (WARM_DURATION). nc-warm.js v2 (comment only). neucurve/index.html:
   nc-morph.js ?v=24, nc-warm.js ?v=2. Adds well under a second to the first-open spinner; the 4 s safety timeout is unchanged.
Not measured inside AE (no AE / CEF here): syntax-checked only (node --check). If a widget still looks off on exit, tell me the idle position
(Settings > Clock Position) and whether Auto-hide was on at that moment.

fix6 (1.8.30): CURVE TAB - the graph got heavy while changing the curve on a layer (Auto Apply / live).
Cause: every live apply ran applyCubicBezier, which walks EVERY layer and EVERY property of the comp (thousands of After Effects DOM calls
in a busy comp) and checks keySelected on each key, only to skip everything that has no selected keyframe. While dragging, that ran every
500 ms (Bezier) and kept AE's main thread busy, so AE and the panel graph stuttered.
Fix (jsx/host.jsx only):
- _ncCollectSel() now also returns the Property objects it already found (transient, never stored in __NC_LIVE).
- applyCubicBezierProps(jsonParams, props) (new): same undo group + the same applyBezierSimple() code, but only on those properties.
- NC_liveRun(): Bezier live apply uses the fast path. If it errors or modifies 0 keyframes it falls back to the old full walk, so the
  result is never worse than before. The manual APPLY button and the other models (Elastic / Bounce / Wave / Steps / Custom) are unchanged.
- The mock test (stubbed AE objects) covered: fast path, identical-request skip, new params, zero-keyframe fallback.
host.jsx is read when the panel loads: close and reopen the MultiTool panel (or restart AE) after installing.
Not measured inside AE. If it is still heavy, tell me: comp size (layers), how many keyframes are selected, and whether the lag is in the
graph itself or in AE's timeline.

fix7 (1.8.30): CURVE TAB - the first mode switch (e.g. Bezier -> Custom) after the warm-up spinner still lagged once.
Cause: during the warm-up the page was visibility:hidden. A hidden page is not painted, so paint / raster of the morphing curve stayed
cold and the first REAL switch paid for it. The morph code itself was already warmed (fix5), only 70 ms long.
- neucurve/nc-warm.css v2: while warming, body is opacity 0.01 (invisible, but still painted) instead of visibility:hidden.
- neucurve/nc-warm.js v3: the mode cycle runs twice (2nd pass runs on code the engine has started to optimise). Still ends on your mode.
- neucurve/nc-morph.js v25: WARM_DURATION 70 -> 120 ms (more frames per warm-up morph).
Cost: the first-open spinner is a little longer (about 0.3 - 0.5 s). Touching the panel still stops it at once.
Off: WARM = false at the top of nc-warm.js, or localStorage neucurve_noWarm = "1".
Not measured inside AE. If the first switch still lags, tell me which mode pair (from -> to) and whether it is every time or once.

fix26 (idle icons): IDLE SCREENSAVER - icons had no motion (they just appeared / swapped / jumped).
New css/mt-idle-icons.css v1 (CSS only, linked in html/index.html after mt-idle-motion.css; no JS touched). Calm / premium, light-icon timing.
- Play <-> pause (stopwatch + timer): new icon pops in with a small turn (0.34 s). Hover leans the icon forward, press sinks it.
- "+" (alarm / note / task): turns 90 deg on hover. Alarm "+" turns into "x" (135 deg) and takes the accent colour while the form is open.
- Delete "x": turns 90 deg on hover. Task check: pops when ticked. "Unfinished" chevron: premium curve.
- Adjust button: grid leans on hover, the check draws itself when Adjust is on.
- Unlock arrow: leans on hover, glides gently while idle (slide / both mode).
- Running stopwatch / timer button: soft ring breathes (2.6 s), only while idle. Round buttons pop in 0.6 s after idle starts.
- Off: prefers-reduced-motion and the app's Animations switch (data-reduce-motion) disable all of it. To remove: delete the <link> line.
Not run inside AE (no AE / CEF here): CSS only, Chromium-74 safe syntax. If an icon looks off, tell me which one.

fix27 (idle adjust): IDLE SCREEN - after moving widgets and pressing Done, boxes ended up on top of each other (e.g. Alarms over Time in After Effects).
Cause: while adjusting, hidden widgets stay on screen as dimmed ghosts, and the no-stacking check (resolveAll) ran with the ghosts present.
Pressing Done removes the ghosts, the grid reflows, and a moved box (stored as an offset from its old grid place) landed on another box.
Nothing re-checked the layout at that moment.
Fix (js/mt-idle-adjust.js, setAdjust): when adjust mode ends, settle() runs once (resolveAll + FLIP glide + save), so no box stays stacked.
Not run inside AE (no AE / CEF here): syntax-checked only (node --check). If boxes still overlap, tell me which widgets were hidden / moved.

fix28 (idle screen): the CLOCK and the cards are now set only with the Adjust button; Settings > Clock Scale and Card Scale are removed.
- html/index.html: date, time, session chip and message are wrapped in #idle-hero (one widget). html/settings.html: both sliders removed.
- js/mt-idle-adjust.js: new widget "clock" (first in WIDGETS). Move = drag (snap, guides, never stacked, like the cards). Resize = the grip, which
  changes the TEXT SCALE 50 - 220 % (it grows away from the edge the clock is anchored to; a readout shows the %; arrow keys 5 %, Shift 10 %;
  double-click the grip = 100 %; near 100 % it snaps). The eye hides the clock (key mtx.showClock). "Reset layout" brings it back.
  Layout key mtx.wLayout gets "clock":{"s":scale,"x":..,"y":..}. The cards keep their own resize (columns + height) and move.
- css/mt-idle-adjust.css v8: .idle-hero (inherits the Clock Position alignment) + the adjust outline / ghost styles.
- js/main.js: a saved idleScale is ignored and removed (no slider to change it any more). js/mt-idle-focus.js: cardScale() is fixed at 100.
Clock Position (Settings) stays: it picks the corner the clock is anchored to; Adjust then moves / sizes it from there.
Not run inside AE (no AE / CEF here): syntax-checked only (node --check). If the clock jumps when resized, tell me the Clock Position.

fix29 (settings > Background): "Background image" and "Animated background" are now ONE row "Background": a single Choose file + Remove.
- html/index.html + html/settings.html: ids bg-media-set / bg-media-clear / bg-media-file (replace bg-image-set / -clear, bg-motion-set / -clear, bg-file,
  bg-motion-file). The hint line (#bg-motion-note) stays under it.
- js/main.js: the picker accepts image, GIF, MP4 and WebM. The type decides the layer (still image = #bg-layer, GIF / video = #bg-motion-layer).
  Picking one now clears the other, so only one background is ever active; Remove clears both. The save / backup logic of each type is unchanged
  (loadImageFile / loadMotionFile / clearImageMedia / clearMotionMedia).
- Tested in headless Chromium: png -> gif -> png -> Remove switch layers correctly, no JS error. Not run inside AE.
Note: an image and a GIF can no longer be shown together (the GIF used to sit on top of the image).

fix30 (idle screen): the clock sat slightly to the right of the widgets (date, time and message did not line up with the cards' edge).
Cause: fix28 gave the clock block (#idle-hero) 0.4 rem of side padding (room for the adjust outline), pushing the text in.
Fix (css/mt-idle-adjust.css v9): no side padding on .idle-hero; the big time digits are pulled out by their side bearing (-0.05em) so the ink lines up too.
Measured in headless Chromium: date, message chip and the Time-in-After-Effects card share the same left edge (16 px) for Top left, and the same right edge for Top right.

fix31 (idle clock): when the time changes, each changed digit now rolls: the old digit moves UP and fades out, the new digit rises in FROM BELOW.
- js/main.js: Idle.renderTime() draws #idle-time as one slot per character (.it-c > .it-n, plus .it-o while rolling). The text is compared with
  this._timeStr (not read back from the DOM). First draw after the idle screen opens is plain; only a real change while idle rolls.
- css/mt-idle-time.css v1 (new, linked after mt-idle-icons.css): out 380 ms accelerate (--ia-out), in 520 ms decelerate (--ia-in) starting 60 ms later,
  several digits (18:59 -> 19:00) follow 70 ms apart, left to right. Slot is clipped (clip-path) only while rolling, so the resting text-shadow is
  never cut and the baseline never moves. prefers-reduced-motion / the Animations switch: the digit just changes.
- Tested in headless Chromium with a fake clock (18:59 -> 19:00): 3 digits rolled with the right stagger, slots collapsed to plain text afterwards, no JS error. Not run inside AE.

fix32 (idle screen): the digit roll of the clock (fix31) now also runs on every other live number of the idle screen.
Numbers: date (day number), Time in After Effects (hours / minutes / seconds), Timer, Stopwatch, To-Do count ("3 of 8 done"), "Unfinished (n)".
- js/mt-idle-roll.js (new, loaded before main.js): MTRoll.set(node, text [, "fast"]) / MTRoll.reset(node). One slot per digit (.mr-c > .mr-n, + .mr-o while rolling),
  words around the numbers (.mr-s) just change. First draw of every idle session is plain; a change in the number of digits (9 -> 10) is drawn plain;
  outside idle mode it is always plain. The text is kept in node._mr, never read back from the DOM.
- css/mt-idle-roll.css (new, linked after mt-idle-time.css): same motion as the clock. Standard (date, counts): out 380 ms / in 520 ms, travel 85 %, 60 ms apart.
  "fast" (stopwatch, timer, time in AE; they tick every second): out 180 ms / in 260 ms, travel 60 %, 35 ms apart. No overshoot. Clip only while rolling.
  Animations switch / prefers-reduced-motion: the digit just changes.
- js/mt-idle-focus.js: rollText() helper; renderElapsed, renderTimerChip, renderStopwatch, the To-Do count and the Unfinished label use it (v=15).
- js/main.js: Idle.updateClock() draws the date with MTRoll; Idle.stopClock() resets it (v=31). html/index.html: new link + script, cache versions bumped.
- Not changed: the big clock (Idle.renderTime, css/mt-idle-time.css), alarm times (static), Settings readouts (not on the idle screen).
- Tested in headless Chromium (MTRoll alone): plain when not idle / first draw, 1 and 2 digits roll with the right delays, slots collapse afterwards, words change in place,
  digit-count change and reset draw plain, no JS error. node --check on all changed JS. Not run inside AE.

fix33 (idle screen > Adjust): opening Adjust made visible widgets jump (e.g. the stopwatch moved down ~200 px).
Cause: Adjust shows every hidden widget (Time in After Effects, Timer, ...) as a dimmed ghost IN its normal place in the flow, so the ghosts pushed the visible widgets down.
Fix: ghosts never take space above a visible widget.
- js/mt-idle-adjust.js (v9): ghostsApart() (called from refresh() and when Adjust closes). While adjusting, ghosts of the chips row (#idle-elapsed, #idle-timer) are moved into
  #idle-ghost-tray (a second .idle-chips row built on demand, below the dashboard); they go back to .idle-chips when switched on (eye) or when Adjust closes.
  A dashboard made only of ghosts gets .wa-allghost.
- css/mt-idle-adjust.css (v10): ghosts inside the dashboard get order 2 (after the visible boxes); .idle-fold.wa-allghost, #idle-ghost-tray and the hidden clock block (.idle-hero.wa-off) are ordered after the visible blocks.
- Tested in headless Chromium (312 px wide, real html/index.html): elapsed+timer hidden / only one hidden / all shown / stopwatch+alarms hidden too: no visible widget moves when Adjust opens;
  eye on a ghost moves it into its row (the widgets below make room, as intended); Done puts every ghost back. No JS error. Not run inside AE.
Not reproduced: the clock block shifting ~15 px sideways in the screenshot (the hero stays at the same x in both modes here). If it still happens, send the Clock Position setting.

fix34 (idle screen > Adjust): dragging a widget left a big gap (as tall as the widget) between the other widgets.
Cause: a moved box is only OFFSET (relative left / top) from its grid place, so its old slot kept its full height and the boxes below did not move up.
Fix: a moved box gives its slot back. js/mt-idle-adjust.js (v10): setFloat() / syncFloat() put .wa-float + margin-bottom = -height on a box while it is dragged
and while it has an x / y offset (a ResizeObserver keeps the margin in step with its height); applySize() toggles it. startMove() collapses the slot first (the boxes below
glide up, FLIP) and measures the snap / clash targets AFTER that. finishMove() applies size + resolveAll in one flip, so dropping a box back on its own place reopens the slot
and the boxes glide down again. No red clash outline while the box sits on its own place.
css/mt-idle-adjust.css (v11): .idle-chips > .wa-float, .idle-dash > .wa-float { align-self: start } (stretch + a negative margin would make the box taller).
Tested in headless Chromium (312 px wide, real html/index.html): drag Time in After Effects up / drag Stopwatch down: the boxes below close up while dragging, no gap; drop on its
own place: everything back to the original rows; no leftover .wa-float; no JS error. Not run inside AE.

fix35 (idle screen > Adjust): hide a widget, move another one, show the first again: the moved widget "flew away" (even off the screen) and the shown widget only looked right after Done.
Cause: a moved box is an OFFSET from its grid slot. Hiding / showing a widget (a ghost joins or leaves the grid / the ghost tray), opening or closing Adjust changes the flow, the slot moves and the box moved with it.
Also: resolveOne() / fitInside() had no bottom limit (a box could be pushed below the panel, or under the "Slide or tap" bar), and nothing was re-resolved until Done.
Fix (js/mt-idle-adjust.js v11):
- keepMoved(mutate): measures every moved box, runs the flow change, turns the difference into a new x / y offset -> the box stays on the same screen spot. Used by the eye (setOn -> toggleFlow), the Settings switches (change listener) and by setAdjust() (open / close).
- toggleFlow(): flip() + keepMoved() + resolveAll() in one go: neighbours glide, the toggled box fades in place (flip(mutate, still) skips it, so it no longer flies in from the ghost tray), a moved box that now overlaps the shown widget is pushed aside immediately.
- bottomEdge(): lowest allowed y = top of the unlock bar (#idle-unlock) or the panel bottom. Used by the drag clamp, resolveOne() (candidates + the "put it under everything" fallback) and fitInside() (bottom edge).
Tested in headless Chromium (312 x 720, real html/index.html): hide Stopwatch -> move Alarms -> show Stopwatch; hide Time in After Effects -> move Stopwatch -> show; hide Alarms -> move Stopwatch -> show; then Done. Moved box stays put on show (before: it jumped 168 px down, off screen), shown widget is visible at once, Done moves nothing, every box ends above the unlock bar. No JS error. Not run inside AE.

fix36 (idle screen > Adjust): dragging or resizing one widget (e.g. the Stopwatch) made the OTHER moved widgets move too, and the layout turned messy.
Cause: a moved box is an offset from its grid slot. Resizing the Stopwatch (height / column step / arrow keys / scale), closing its slot at the start of a drag (fix34), dropping it back on its place or resetting it
shifted the slots of the boxes below, and every moved box (Timer, Alarms, Notes ...) shifted with its slot. Only show / hide and Adjust open / close were anchored (fix35).
Fix (js/mt-idle-adjust.js v12): keepMoved(mutate, skip) now wraps every size / position change: grip resize (width, height, clock scale), arrow-key resize and nudge, reset size / reset position,
the slot collapse at the start of a drag and the settle after a drop (skip = the box being changed on purpose). Moved boxes keep their screen spot; resolveAll() still pushes a box aside when something really overlaps.
Tested in headless Chromium (830 x 600, real html/index.html): Timer / Alarms / Notes moved to the right, then Stopwatch resized 158 -> 248 px and dragged down 120 px: Timer, Alarms and Notes did not move
(before: Notes followed the resize by 90 px, Timer jumped 77 px up and Alarms 63 px down when the Stopwatch was dragged). Earlier scenarios (fix33 - fix35) re-run: unchanged. No JS error. Not run inside AE.
Known limit: in a very crowded panel (no free spot left) a box that must be pushed is kept inside the panel, so two boxes can still overlap until one is moved or made smaller.

fix37 (idle screen > Adjust): hiding a widget with the eye made it jump to the bottom (below the other widgets); showing it again made it jump back up.
Cause: ghosts (hidden widgets shown dimmed while adjusting) are ordered AFTER the visible boxes (fix33), and ghosts of the chips row go to a tray below the dashboard. That was meant for widgets that were already hidden when Adjust opened,
but it also hit the widget the person had just hidden. Also css/mt-idle-focus.css widens the neighbour of a hidden Stopwatch / Alarms card to the full row, so it dropped below the ghost and changed size.
Fix:
- js/mt-idle-adjust.js (v13): toggleFlow() marks a box hidden / shown during this Adjust session with .wa-stay. A .wa-stay box keeps its own grid place (dimmed only); ghostsApart() does not send it to the tray and it does not count for .wa-allghost.
  Marks are cleared whenever Adjust opens or closes, so a widget that was already hidden when Adjust opens still sits in the ghost area (fix33 stays valid: ghosts never push visible widgets).
- css/mt-idle-adjust.css (v12): .wa-stay ghosts get order 0; while Adjust is open the neighbour of a hidden Stopwatch / Alarms keeps span 6 (it widens at Done, like on the normal idle screen). A width set by hand still wins.
Tested in headless Chromium (830 x 700 and 312 x 720, real html/index.html): hide + show of Stopwatch, Alarms and Time in After Effects, then hide Stopwatch again, Done, open Adjust again: no other box moves while hiding / showing (positions identical, only opacity changes);
Done: Alarms moves into the Stopwatch place (normal idle layout); a widget hidden before Adjust opens is dimmed in the ghost area. No JS error. Not run inside AE.

fix38 (idle screen > Adjust): resizing the Timer (drag its grip) also made Time in After Effects taller (and the other way round).
Cause: .idle-chips is a grid with align-items: stretch (equal height for the cards of one row, css/mt-idle-adjust.css). A min-height set by hand on one card therefore stretched its neighbour.
Fix: js/mt-idle-adjust.js (v14) syncRows() (called from applySize() and ghostsApart()) puts .wa-free on a chips row as soon as one of its cards has a height set by hand; css/mt-idle-adjust.css (v13): .idle-chips.wa-free { align-items: start }.
Each card then keeps its own height. Double-click on the grip (default size) removes the hand-set height, the row stretches again (equal heights).
Tested in headless Chromium (830 x 700, real html/index.html): Timer resized 104 -> 184 px: Time in After Effects stays at its own height (before: 184 too); and the other way round; reset returns both to 104 px. No JS error. Not run inside AE.
Note: Time in After Effects is 101 px at its natural height (the row stretched it to 104 px), so it shrinks 3 px when the row stops stretching.

fix39 (idle screen > Adjust): moving a widget made the whole layout messy; widgets are now FREE to place anywhere.
Cause: widgets lived in a 12-column grid and a "moved" widget was only an offset (relative left / top) from its grid slot. Every other change (resize, hide / show, another widget moved, Adjust open / close)
shifted the slots, so moved widgets jumped, left holes or overlapped. fix33 - fix38 patched this one symptom at a time.
Fix: free canvas instead of grid + offsets (js/mt-idle-adjust.js v15 rewritten, css/mt-idle-adjust.css v14 "FREE CANVAS").
- Nothing adjusted yet: the normal flow layout, unchanged.
- Adjust opens: every visible widget is frozen where it stands (position: absolute inside #idle-clock, class .wa-canvas). Each widget has its own left / top / width / height; no widget depends on another.
  Hidden widgets (ghosts) get a free spot of their own while adjusting. Show / hide never moves anything else.
- Move: drag anywhere inside the panel (snap to panel edges and other widgets, guide lines, arrow keys nudge). Resize: free width and height from the grip (text scale follows the width); double-click the grip = default size.
  Clock: grip = text scale. A widget dropped / resized / shown on top of another one glides to the nearest free spot; nothing leaves the panel (also after the panel is resized).
- Layout key mtx.wLayout is now {"v":2,"items":{id:{x,y,w,w0,h}}} in FRACTIONS of the panel (follows a resized panel). Old layouts are ignored (back to the flow layout once).
- Reset layout: back to the original flow. Press Done without changing anything: the flow layout stays, nothing is saved.
- Removed: slot collapse (wa-float), keepMoved, ghost tray, row stretch fix, FLIP: not needed any more.
Not run inside AE.

fix40 (idle screen > Adjust): a widget could not be put at the bottom, and crowded layouts stayed messy because widgets were pushed away from each other.
Cause: fix39 still (a) stopped widgets above the "Slide or tap" bar and (b) pushed a widget to the "nearest free spot" when it touched another one; in a short panel there is no free spot, so it jumped back.
Fix (js/mt-idle-adjust.js v16): widgets go anywhere down to the panel bottom, may overlap, and the one touched last is on top (z-index). They are only kept inside the panel. Hidden widgets still get a free spot when first placed.
Tested in headless Chromium (721 x 548): Stopwatch and Notes dragged to the bottom edge stay there; other widgets do not move. Not run inside AE.

fix41 (idle screen > Adjust): the idle screen could not scroll down and widgets could not be moved below the first screen; the move / drop motion was gone.
Cause: fix39 / fix40 kept every widget inside the visible panel (overflow hidden, bottom = panel height) and moved boxes without easing or settle animation.
Fix (js/mt-idle-adjust.js v17, css/mt-idle-adjust.css v15):
- The idle panel scrolls down (overflow-y: auto, mouse wheel) when the canvas is active. #idle-canvas-end (1 px marker, 160 px under the lowest widget) gives the scroll room, so the canvas grows with the widgets.
- Dragging a widget near the top / bottom edge of the panel (56 px zone) scrolls the panel (up to 11 px per frame) and the widget follows: it can be put anywhere below the first screen.
- Layout v3: x, w = fraction of the panel WIDTH, y, h = fraction of the panel width too (the canvas is taller than the view). v2 layouts (made in fix39 / fix40) are ignored: press Reset layout once.
- Motion (Premium archetype, same curves as the rest of the idle UI): drag eases toward the pointer (36 % per frame); drop = lift 1.025 -> press 0.992 -> rest (300 ms); a shown widget or a ghost rises 0.6 rem + scales from 96 % (420 ms);
  Reset layout glides every widget from its old place to the new one (420 ms); a widget pushed back inside glides (300 ms). Reduced-motion switches everything off. The idle enter / leave / auto-hide animations were checked in canvas mode: they run.
Tested in headless Chromium (721 x 548): drag Stopwatch to the bottom edge and hold: panel scrolls, widget ends ~1750 px down, others did not move; wheel scrolls the panel; re-entering idle plays im-rise / ii-in. Not run inside AE.

fix42 (idle screen > Adjust): a widget made bigger covered other widgets; Reset layout gave a strange layout (hidden widgets thrown into free corners).
Fix (js/mt-idle-adjust.js v18, css/mt-idle-adjust.css v16):
- Widgets are solid again (min gap 6 px, GAP2): a drag slides along another widget and stops at the last free spot (red outline = blocked); a resize grows only until it meets a neighbour (bisection, width then height);
  the clock scale stops at a neighbour; arrow keys do not move onto a widget; a widget shown on top of another one, or a saved / older layout that overlaps, glides to the nearest free spot (settleOne / resolveAll, also when Adjust opens).
  The canvas has no bottom limit (it scrolls), so a free spot always exists.
- Reset layout: measures the ORIGINAL flow with all six widgets in it (hidden ones keep their own slot, css .wa-measure: no reorder, Stopwatch / Alarms always span 6), so showing a hidden widget later never overlaps anything.
  Done without any change: the compact flow layout comes back and nothing is saved.
Tested in headless Chromium (760 x 600): Stopwatch hidden + Reset layout = original positions, no overlap; Timer / Time in After Effects resized far: stop at the neighbour; Alarms dragged onto others stays free; Stopwatch shown again: no overlap. Not run inside AE.

fix43 (idle screen > Timer): when the timer reached 00:00:00 it vanished and popped back.
Cause: auto-hide (body.is-quiet) had hidden the Timer box; the finish wake() (MutationObserver on .is-done in js/mt-idle-adjust.js) made the whole UI fade back in.
Fix:
- js/mt-idle-focus.js: the Timer box gets .is-live while running / paused / done. finish() shows 00:00:00 + "Time is up" for 2.2 s (DONE_HOLD), then reset() runs: the digits ROLL back to the set time (MTRoll "fast"). setState() cancels that wait.
- css/mt-idle-adjust.css (v17): body.is-quiet .idle-chips > #idle-timer.is-live stays visible (opacity 1, no transform) while the rest auto-hides.
- js/mt-idle-adjust.js: the "finished timer wakes the UI" observer is removed.
Syntax checked. Not run inside AE.

fix44 (idle screen > Timer / Stopwatch): auto-hide now turns a running Timer / Stopwatch into a "dynamic island" (iOS style); idle screen scrolled although every widget was at the top; timer finish disturbed the layout.
- NEW js/mt-island.js + css/mt-island.css (v1): black capsule, top centre, shows the NAME + live digits of the Timer ("Timer", "Timer paused", "Time is up") and / or the Stopwatch (two segments, divider between them; timer icon = progress ring, stopwatch icon = breathing dot).
  Shown while a timer / stopwatch is active AND (the panel is NOT in idle mode OR the idle UI is auto-hidden). So the remaining time stays visible after leaving the idle screen. Hidden while the idle widgets are visible (they show the same numbers).
  Motion (playful spring): capsule drops in with ~10 % overshoot (560 ms), content fades in 150 ms later (blur 6 -> 0), width follows the content with the same spring (480 ms), exit = content first, then the capsule shrinks up (300 ms); time is up = one jelly pulse + pulsing ring.
  On auto-hide the live Timer / Stopwatch widgets fly up into the island (css vars --mi-dx / --mi-dy set by JS) and fly back out when the UI returns. Reduced-motion switches everything off.
- js/mt-idle-focus.js (v16): renderIsland() feeds the island (called by renderIdle / renderStopwatch / every tick); the 1 s ticker also runs while only the stopwatch runs; .is-live on the Timer and Stopwatch cards; DONE_HOLD 3000 ms (finished timer shows 00:00:00, then the digits roll back to the set time).
- Scroll: js/mt-idle-adjust.js (v19) syncEnd(): the 160 px scroll room under the lowest widget exists only while Adjust is open; otherwise 12 px, so the idle panel scrolls only when a widget really sticks out. syncEnd() also runs when Adjust opens / closes.
- Layout on timer finish: the cause was the finished timer calling wake() (whole UI popped back from auto-hide). That is gone (fix43); the timer never changes size or position at the end, only the island pulses and the digits roll.
- css/mt-idle-adjust.css (v17): the temporary "is-live stays visible" rule of fix43 is removed (the island replaces it). html/index.html loads the new files.
Tested in headless Chromium (760 x 600, fake clock): island shows in idle quiet and outside idle, hides when the idle UI is awake, timer -> done -> reset, two segments, no JS error. Not run inside AE; I could not reproduce a layout jump at timer finish apart from the wake pop.

fix45 (dynamic island): Timer / Stopwatch can be paused / played outside the idle screen.
- js/mt-island.js (v2) + css/mt-island.css (v2): every island segment has a round play / pause button (Timer = accent colour, Stopwatch = amber; icon pops on change, press = scale 0.86, keyboard focus ring). A press calls MTIsland.onToggle("timer" | "sw").
- js/mt-idle-focus.js (v17): sets MTIsland.onToggle: timer -> start() (pause / resume / start again), stopwatch -> swToggle() + tickerCheck() (the 1 s ticker starts again when the stopwatch is resumed outside idle). The island data now carries timer "running".
- Works in idle auto-hide too (a tap on the island also wakes the idle UI, like any tap).
Tested in headless Chromium: pause / resume of both from the island, state keys and aria-labels follow, stopwatch digits stop while paused, no JS error. Not run inside AE.

fix46 (dynamic island): content not centred; two tools shown at once; no way to open it or set the timer.
- js/mt-island.js (v3) + css/mt-island.css (v3): the capsule now shows ONE tool (one icon + digits, symmetric padding, centred with left:0 / right:0 / margin:auto, so width grows from the middle).
  A click (or Enter / Space) EXPANDS it: width, height and corner radius morph together (0.58 s ease-out, no wobble); small content fades out, panel content fades + un-blurs in.
  Expanded panel: switch Timer | Stopwatch (sliding thumb, green dot = active; the pick is remembered, mtx.islandSel, and is what the collapsed capsule shows).
  Timer not started: hours / minutes steppers (click, press-and-hold, mouse wheel, type, arrow keys), presets (5 min, 10 min, 25 min, 1 h), Start. Started: big countdown, progress bar, Reset + Pause / Resume.
  Stopwatch: big digits, Reset + Start / Pause. Esc, a click outside or tapping elsewhere collapses it; it stays on screen while open and leaves after the collapse animation.
- Motion no longer depends on prefers-reduced-motion (Windows "animation effects" off froze it); only the app's Animations switch (data-reduce-motion) stops it.
- js/mt-idle-focus.js: renderIsland() feeds both tools (active flag + timer h / m); new callbacks MTIsland.onReset and MTIsland.onSetTime (set only while the timer is not started, same rule as the Settings fields).
- html/index.html: ?v=3 on the island css / js.
Note: the capsule still appears only while a timer / stopwatch is active (and outside idle, or while the idle UI is auto-hidden). To start a Timer from the island, have the Stopwatch (or a Timer) active, or open it while visible.
Tested in jsdom (logic: open, switch, presets, steppers, start / reset, outside click). Not run inside AE; the animation was not seen in a real browser.

fix47 (dynamic island): opening the island lagged; two switch buttons.
- Lag cause: blur() filters on big layers, a transitioned big box-shadow (repainted every frame), and the 1 s tick updating the hidden panel + reading layout.
  Fix (css/mt-island.css v4, js/mt-island.js v4): no filter at all (opacity + transform only, layers promoted with will-change), box-shadow no longer transitions, contain: layout paint on the capsule,
  size (width / height / radius) is written only when it changes (no layout read on the tick), and only the visible part (capsule OR the shown tool) is updated each second.
- ONE switch button: press = Timer <-> Stopwatch. The two labels slide up / down in a window, the arrows turn half a turn, the new tool slides in from the side (right = forward, left = back) while the panel height morphs.
Tested in jsdom (logic only). Not run inside AE; the smoothness was not seen in a real browser.

fix48 (dynamic island): the update notification now lives in the dynamic island.
- js/mt-island.js (v5) + css/mt-island.css (v5): at start the island MOVES the old banner element (#mt-update) into its panel and restyles it. js/mt-updater.js is NOT changed: same ids, same classes
  (is-show / is-busy / is-open), same buttons. A MutationObserver on the banner tells the island when an update is offered, installing, done or failed.
- Collapsed: no timer / stopwatch running -> pulsing dot + "Update v1.9.0". A timer / stopwatch is running -> it stays in the capsule and a small pulsing dot marks the pending update.
  The capsule appears with one jelly pulse when an update is found. While installing the capsule shows a spinner + the step ("Downloading update...").
- Expanded: opens on the Update view when one is pending: title, "v1.8 -> v1.9.0", [Later] [Update Now], What's new (notes slide open, panel grows), progress bar while installing.
  The ONE switch button now cycles Timer -> Stopwatch -> Update (the Update row exists only while an update is pending). Later / OK collapses the island. Update Now (also from Settings > Updates) opens the island to show progress.
- html/index.html: ?v=5 on the island css / js.
Tested in jsdom (logic only: banner adopted, collapsed text, open on Update, cycle, Later closes + island leaves, busy auto-opens). Not run inside AE; the look was not checked in a real browser.

fix49 (dynamic island): island vanished after the timer finished; always show the time.
- Cause: the island showed only while a timer / stopwatch was active. When the finished timer reset itself (3 s after 00:00:00) nothing was active any more, so the island hid and had no reason to come back.
- Fix (js/mt-island.js v6, css/mt-island.css v6): the island is ALWAYS on screen (idle with visible widgets hides it, as before: the widgets show the same numbers; idle auto-hide shows it). With nothing running it shows the set timer time / 00:00:00 stopwatch.
  The "is-on" class is now written on every update, so a missed change can never leave it hidden.
- Simpler look: the pointer OUTSIDE the island = icon only (small round pill, symmetric). Pointer ON the island = the digits (or "Update v1.9.0") open out smoothly (width + fade, same curve). Update dot / spinner stay visible in the icon pill.
Tested in jsdom (logic only: timer done -> reset keeps island on, hover class on / off, idle / quiet rules). Not run inside AE.

fix50 (NeuCurve + dynamic island + idle screen): island covered the NeuCurve toolbar; digit roll in the island; stopwatch Hide / Show motion; tidier widget layout on the idle screen.
- css/mt-island.css (v7): .curve-pane { top: 50px } - the NeuCurve pane starts BELOW the island (8 + 36 + 6 px), so its toolbar is never covered.
- Digit roll: js/mt-idle-roll.js (v2) MTRoll.set(node, text, mode, ALWAYS): the island passes always = true and rolls its digits exactly like the idle screen (old digit up and out, new one rises from below), also outside idle mode.
  A node that comes into view (island opened / closed, tool switched) draws plain once. css/mt-idle-roll.css (v2): the prefers-reduced-motion block is removed (it turned the roll off when Windows animation effects are off); the app's Animations switch still stops it.
- Stopwatch Hide / Show: new MTRoll.swap(node, text, mode, always): every character leaves up (staggered 32 ms, 190 ms), the new text rises in from below (300 ms). Used by the idle Stopwatch (js/mt-idle-focus.js v18) and by the island.
  The island's Stopwatch view got a "Hide time" / "Show time" button (same switch mtx.swHidden, MTIsland.onToggleHide); the collapsed capsule swaps too.
- Idle screen > Adjust (js/mt-idle-adjust.js v20, css v18, html: new "Tidy up" pill above "Reset layout"):
  * Snap (10 px, guide lines): edges / centres of other widgets, EXACTLY the same gap (8 px) next to a neighbour, a 12-column grid (6 on a narrow panel) for x and an 8 px grid for y; widgets pull a little stronger than the grid.
  * Resize snaps too: the right edge to a line, the same width / height as a neighbour, bottom edge to 8 px rows, with guide lines.
  * Tidy up: widgets on about the same height become a row, a row that does not fit wraps, each row is stretched to the panel width (text scale kept within 0.68 - 1.3), every widget of a row gets the row height, equal 8 px gaps, rows centred; glides there (0.3 s). Saved like any layout.
  * reduceMotion() in js/mt-idle-adjust.js reads only the app's Animations switch (OS setting ignored), so glide / drop / pop-in run with Windows animations off.
Other idle css files (mt-idle-motion.css, mt-idle-time.css, mt-idle-icons.css, mt-idle-adjust.css) still contain their own prefers-reduced-motion blocks; not touched.
Tested in jsdom (logic only: roll outside idle, swap, island Hide button). The tidy-up / snap math and all motion were NOT run in a browser or AE.

fix51 (idle screen + NeuCurve + stopwatch): a click on the idle screen opened the panel; NeuCurve status pill moved; fast Hide / Show of the stopwatch.
- Idle screen (js/main.js, Idle.bindLeave): a click on an EMPTY spot of the idle screen left Idle Mode in every mode (tap, slide, both), also far away from the "Tap to open" / "Slide to open" bar.
  Cause: bindLeave() had a click listener on #idle-clock that called exit() for anything that was not a card / chip / button.
  Fix: bindLeave() is empty now. The ways out are only: the unlock bar (slide / tap / both), Esc, and mouse activity in "Mouse move" mode. Comments and the Settings note (html/index.html) no longer mention the empty-spot click.
  Also touched (comments only): js/mt-idle-adjust.js, js/mt-idle-focus.js, css/mt-idle-focus.css.
- NeuCurve status pill (neucurve/nc-status.css v1 + neucurve/nc-status.js v1, linked in neucurve/index.html): the red (and green) message pill sat at top:-10px with a 7px font, half on the graph edge, half on the toolbar.
  Now it sits exactly on the APPLY button (js copies the button's box; CSS has a fallback), 11px, pointer-events: none so APPLY stays clickable underneath. Red = error, green = success, light theme has its own colours.
  The bundle (neucurve/assets/index.js) is not touched. Off switch: remove the <link> / <script> in neucurve/index.html.
- Stopwatch Hide / Show pressed quickly (js/mt-idle-roll.js, MTRoll.swap; used by the idle screen and the island):
  Cause: a second swap() restarted from node._mr.text, which is only refreshed when the whole swap ends. So the text from BEFORE the first swap snapped back on screen, then left and rose in again.
  Fix: a running swap is never restarted. Pressed during the leave phase: only the newest text is remembered (it is drawn when the leave ends). Pressed during the rise phase: that phase finishes, then ONE more swap plays, only if the kind of text changed (digits <-> dots).
  Tested with a mock DOM + fake timers (logic only). The motion itself was NOT run in a browser or AE.

fix52 (NeuCurve status pill v2 + Settings > Navigation + stopwatch swap): the pill is small and in the graph corner; the tab rail can sit on the right; digits and dots can no longer mix.
- NeuCurve status pill (neucurve/nc-status.css v2, nc-status.js v2): v1 laid the pill over the APPLY button, which looked odd. Now it is a SMALL pill (9px, 16px high) in the top-left corner INSIDE the graph box (.canvas-area): the emptiest corner of an easing graph.
  nc-status.js copies that corner into left / top and the box width into max-width; with no graph on screen (presets-only view) it falls back to just above the action bar. pointer-events: none. Entrance: 180 ms, rises 4px + fades (MD3 emphasized curve). Red = error, green = success.
- Settings > Appearance > Navigation (new): Left (default) / Right.  Files: css/mt-nav.css v1, js/mt-nav.js v1 (localStorage "mtx.navPos" -> data-nav="right" on <html>), cards [data-nav-opt] in html/index.html (modal) and html/settings.html (window),
  "data-nav-opt" added to the key lists of js/mt-settings-remote.js and js/mt-settings-window.js (that is how the window mirrors a control), reset hook in js/main.js (Reset everything -> MTNav.reset()), tooltip of a rail tab opens to the LEFT when the rail is on the right (js/mt-tooltip.js, class .mt-tip.is-left in css/mt-nav.css).
  Right = .app is row-reverse, the edge line moves to the other side, a tab has its icon on the right and its name on the left, the rail opens towards the LEFT over the tools (margin-left instead of margin-right).
  Switching slides the rail and the tools past each other (FLIP, 380 ms, cubic-bezier(0.2, 0, 0, 1)); no slide when data-reduce-motion="true".
  Only left / right. Top / bottom would need the vertical tab list, the sliding highlight (moveIndicator in js/main.js) and the tab drag-reorder rebuilt for a horizontal bar.
- Stopwatch Hide / Show pressed fast (js/mt-idle-roll.js, MTRoll.swap v3): the fix of fix51 made the display wait for the running swap, so it lagged behind the buttons and numbers / dots showed in the wrong order.
  Now a second press RETARGETS at once: running animations are cancelled, the half-gone characters are dropped and the newest text rises in immediately (200 ms, 16 ms stagger). Only one layer of characters exists, so digits and dots can never be on screen together.
  css/mt-idle-focus.css: .sw-time now eases opacity + letter-spacing (0.22 s) when Hide / Show flips the .is-hidden class (it jumped before).
  Tested with a mock DOM + fake timers (logic only). Motion, the nav slide and the pill position were NOT run in a browser or AE.

fix53 (Settings > Navigation animation + NeuCurve status pill v3 + idle widgets on panel resize):
- Navigation switch (js/mt-nav.js v2): the old slide swept the whole rail across the tools. Now the rail fades out through its old edge (150 ms, accelerate), the side flips while the rail is invisible,
  the tools glide to their new place (440 ms, cubic-bezier(0.2, 0, 0, 1), dim 0.82 -> 1) and the rail fades in from 28 px beyond the new edge (380 ms, MD3 emphasized decelerate), every tab following 28 ms after the previous one (max 170 ms).
  Only transform + opacity. A second click while it plays lands the first one at once. No motion when data-reduce-motion="true".
- NeuCurve status pill (neucurve/nc-status.css v3, nc-status.js v3): it sat in the graph corner and covered the top handle / end of the curve. Now it is a 14 px pill in the strip UNDER the graph, centred between the "0" and "1" labels,
  max-width = space between the labels. Re-centres when its text changes. Fallback (no graph on screen) unchanged. Checked at 420x700, 300x520 and 760x420.
- Idle widgets, panel resized (js/mt-idle-adjust.js v19, css/mt-idle-focus.css v15): boxes followed the panel width but their text kept its size, so text wrapped more, boxes grew taller, the overlap check then threw widgets around.
  Cause: x / y / w / h are fractions of the panel width, content is not. Fix: the layout stores the panel width it was made at ("ref" in mtx.wLayout, v3 stays valid; a layout without it adopts the first width it is shown at).
  The cards are zoomed by panel width / ref (--wa-zoom, the same CSS zoom as Card scale), the clock text scale is multiplied by the same factor, so the whole canvas scales like one picture: same wrapping, heights and gaps, no overlap, no re-sorting.
  Resize runs one frame per burst (window resize + ResizeObserver), no 160 ms delay. The overlap gap shrinks with the zoom (g2()). Zoom is limited to 0.4 - 2.4 (beyond that ref follows and the layout is checked once).
  Tested in headless Chromium (real html/index.html): layout made at 800 px shown at 500 / 380 / 1000 px: every box is exactly 0.625 / 0.475 / 1.25 of its size and position, nothing overlaps. Nav switch sampled at 60 / 140 / 240 / 380 / 600 ms and with 3 quick clicks.
  Not run inside AE.

fix54 (idle screen > Adjust): hidden widgets are grouped as icons in a shelf and no longer get a box on the canvas.
Cause: a widget switched off with the eye stayed on the canvas as a dimmed ghost box, so it took space, had to be moved around and got in the way of arranging the visible ones.
Fix (js/mt-idle-adjust.js v22, css/mt-idle-adjust.css v19):
- While adjusting, a hidden widget is really hidden (the ghost CSS is gone). Nothing else moves when a widget is hidden.
- Shelf #ia-shelf (bottom left, vertical glass capsule, only while something is hidden and Adjust is open): one round icon per hidden widget (clock, hourglass, timer, stopwatch, bell, notes). Hover / focus shows the name beside it.
  Click = widget returns to the canvas (its old place if free, else the nearest free spot) with the usual rise-in. A newly hidden widget's icon pops in (420 ms). Hidden when the unlock mode is "Mouse move"; no motion with data-reduce-motion="true".
- Reset layout no longer reserves slots for hidden widgets; they are placed when shown.
Tested in headless Chromium (640 x 620): hide Stopwatch, Alarms, Timer: no other widget moved, 3 icons in the shelf; click Timer icon: it returns, icon leaves the shelf. Not run inside AE.

fix55 (idle screen > Adjust): hide and show of a widget are animated (js/mt-idle-adjust.js v23).
- Hide (the eye): the widget shrinks into the shelf corner (scale 1 -> 0.18, fades out, 260 ms, accelerate cubic-bezier(0.3, 0, 1, 1)) and is switched off only when that ends, so its shelf icon appears where it vanished.
  A second click during the 260 ms is ignored. A guard timer (380 ms) finishes the switch if the animation never ends.
- Show (shelf icon): the widget grows out of the clicked icon (scale 0.18 -> 1, opacity 0 -> 1, 380 ms, decelerate cubic-bezier(0.05, 0.7, 0.1, 1)); the icon leaves at once. A widget switched on from the Settings window keeps the old rise-in (0.6 rem, 420 ms).
- Light: Web Animations on ONE element, transform + opacity only, no layout, no extra DOM, no clone. No motion with data-reduce-motion="true".
Tested in headless Chromium (640 x 620): Stopwatch hide sampled at 60 / 130 / 200 / 260 ms (opacity 0.87 -> 0.23, moves toward the bottom left, then hidden, icon in the shelf); show sampled at 30 - 630 ms (grows from the icon to its place); double click on the eye ends hidden. Not run inside AE.

fix56 (Settings > Idle screen > Dynamic island): new switch "Show dynamic island" (js/mt-island.js v9, css/mt-island.css v8).
- Key mtx.islandOn ("0" = off, default on). Control #island-enabled in html/index.html (modal: field "Dynamic island") and html/settings.html (Settings window: group "Dynamic island", before "Idle screen cards"); the window mirrors it by id like every other switch.
- Off: the capsule never shows for the timer / stopwatch, an open timer / stopwatch panel closes, <html data-island="off"> is set. The live idle widgets then fade with the others on auto-hide instead of flying up (css/mt-island.css).
  An update notice STILL uses the capsule (it is where the updater banner lives), so an update is never missed.
- Settings > Reset everything switches it on again. MTIsland.refresh() re-applies the setting.
Tested in headless Chromium: stopwatch active -> island on; switch off -> island off; update notice shown -> island on; notice gone -> off; switch on -> on, key removed. Not run inside AE.

fix57 (dynamic island off = NeuCurve default layout, island switch moved to Appearance, settings text flicker).
1. Island off: the Curve tab starts 50 px below the top only while the island is on. With Settings > Appearance > Show dynamic island off (<html data-island="off">), .curve-pane is back to top 0 (css/style.css default) and the solid band behind the island (css/mt-curve-top.css) is hidden. Files: css/mt-island.css v9, css/mt-curve-top.css v2. An update notice still opens the island while it is off; it then covers the top of the Curve tab until dismissed.
2. The "Dynamic island" group of html/settings.html moved from the Idle screen section to the Appearance section (between Navigation and Colors). Same control id #island-enabled, so js/mt-island.js and the mirror in js/mt-settings-remote.js are unchanged in behaviour.
3. Flicker, Multi Tool settings window. Cause: the panel only sends a state message when something changed, but the window switched its header text to "Multi Tool / Settings - waiting for the panel" after 2.5 s without a state, then back on the next change. Fix: js/mt-settings-remote.js v5 answers every keep-alive hello with a small "alive" message; js/mt-settings-window.js v4 treats it as proof the panel is there and only shows "waiting" after 7 s of silence.
4. Flicker, NeuCurve settings window. Cause: refreshAll() runs every second and rewrote the same text again (slider values, dropdown labels, profile name / bio) and reassigned the avatar src, which repaints the text each time. Fix (neucurve/nc-settings.js v16): new helper txt() writes only when the text changed; avatar src is only set when different.
Tested in headless Chromium: Curve pane top 50 px with the island on, 0 px off, 50 px again after switching back; the island switch sits in the Appearance section; Settings window header text stayed unchanged for 15 s. Not run inside AE.

fix58 (settings lost after deleting Windows Temporary Files).
Cause: CEP keeps the panel's localStorage in %TEMP%\cep_cache. Cleaning Temp (Settings > Storage, Disk Cleanup, manual) empties it, so every setting (mtx.*, NeuCurve nc*, presets, favorites, theme, widgets layout) reset.
Fix: new js/mt-persist.js v1, loaded FIRST in html/index.html, html/settings.html, neucurve/index.html, neucurve/settings.html. It restores any missing localStorage key, synchronously, from ~/Documents/MyMultitoolExtension/settings-backup.json, then mirrors every setItem/removeItem/clear back to that file (400 ms debounce, atomic write, never overwrites a good backup with an empty one). Needs Node (already enabled in the manifest); without Node it does nothing.
First run after update: the backup is created from the current settings. Settings lost BEFORE this update cannot be recovered.

fix59 (dynamic island is also a clock).
Request: see the time without entering the idle screen.
- Nothing running (no timer / stopwatch): the collapsed capsule shows a tiny dial (hour / minute hands, accent second hand that ticks) + HH:MM, always open (no hover needed). A running timer / stopwatch still takes the capsule over; an update notice still wins when nothing runs.
- Expanded: new third tool "Clock" in the switch (Timer / Stopwatch / Clock / Update): dial with ticks, big HH:MM, seconds, date, 24 h / 12 h chips. Key mtx.islandClock12 ("1" = 12 h, default 24 h). Opening with nothing running shows the last chosen tool (default Clock).
- The island repaints once a second only while the clock is what is on screen. Off in Settings > Show dynamic island = no clock either. Second hand never spins back at 59 -> 0; no motion with data-reduce-motion="true".
Files: js/mt-island.js v11, css/mt-island.css v10, html/index.html + html/settings.html (texts).
Tested in headless Chromium: capsule 16:59 with dial, expanded Clock view, 12 h switch (04:59 PM). Not run inside AE.

fix60 (Quick Resolution Presets: Null / 3D layers no longer off-centre after a resolution change).
Cause: setCompResolution() only set comp.width / comp.height. From a script AE anchors the frame at its top-left corner, so every layer kept its old Position: a Null (and its 3D layers) that sat in the middle of the old frame was off-centre in the new one. A NEW comp worked because the Null was added after the resize.
Fix (jsx/host.jsx _qceRecenterLayers + helpers, called from setCompResolution): after the resize every layer WITHOUT a parent moves by half of the size change (same as Composition Settings > Advanced > Anchor centre). Position keyframes and separated X / Y move too; camera / light Point of Interest moves with them; Z is untouched; parented layers follow their parent. Layers with a Position expression or a lock are not moved and are reported in the toast. One undo step ("Change Comp Resolution").
Camera Zoom is not changed (it is in pixels, so the field of view changes with the frame, as in AE's own dialog).
Tested: the shift logic in Node with stub layers (plain, keyframed, parented). Not run inside AE.

fix61 (dynamic island, Update view looked cut off).
Cause: the old update banner (#mt-update) lives inside the island. css/material-theme.css (Style: Material You) paints .mt-update with a grey surface, radius and shadow at a HIGHER specificity than the island's plain-class reset, so a grey card showed inside the black island, with no padding, and the pulsing dot sat on its edge, clipped by overflow of .mi-views. The Material colours for the sub text / notes also won over the island's.
Fix (css/mt-island.css v11): every island rule for the update banner now starts with .mt-island .mi-view-u #mt-update (id specificity), the banner also resets background colour / image / overflow / height / offsets; head row got 8 px left padding and a softer dot glow so the pulse is not clipped.
Tested in headless Chromium with Material You dark + light: no grey card, dot fully visible. Not run inside AE.

fix62 (dynamic island: "Update Now" / Start label melted into its button).
Cause: the button background is the theme --accent, the label is --theme-on-accent. Material You and custom colours can make both light (or both dark), so the label had the same colour as the button.
Fix (js/mt-island.js v12, fixOn()): read the colour the button is really painted with (getComputedStyle backgroundColor), compute its luminance and set --mi-on on the island to dark (#0b0b0d) or white. Runs at start and every time the island opens. Applies to Start / Pause / Update Now.
Tested in headless Chromium (Material You, accent and on-accent both white): label dark and readable. Not run inside AE.

fix63 (dynamic island: mouse wheel switches the tool).
With the island open, scroll the mouse wheel over it: down = next, up = previous in the order Timer, Stopwatch, Clock, Update (Update only while an update is offered). One notch = one step, a touchpad collects ~60 px per step, 380 ms pause after each switch, stops at the first / last tool (no wrap). Same slide animation as the switch button.
js/mt-island.js v13: window-capture wheel listener (runs before js/smooth-scroll.js, so the panel behind does not scroll). Not intercepted: the hour / minute steppers (wheel changes the number there) and the scrollable release notes; Ctrl+wheel is left alone.
Tested in headless Chromium: wheel down/up walks the tools and stops at both ends, three fast notches = one step. Not run inside AE.

fix (Quick Resolution Presets rebuilt - Null / 3D layer drifted off-centre after a preset click):
  cause: setCompResolution added half of the size change to every layer's Position, but AE recentres 3D layers
         (and cameras/lights) by itself, so those moved twice. Earlier patches that measured AE's move failed
         because the timing of AE's own move is not predictable.
  fix:   jsx/host.jsx - whole Quick Resolution block rewritten. Before the resize every parentless layer gets an
         ABSOLUTE target (Position + half the size change, X/Y only; camera/light Point of Interest too). 2D layers
         are written to the target at once; 3D layers / cameras / lights are left to AE first. QCE_settleResize(jobId,
         last) then checks every channel and corrects only what is off AND no longer changing; the last pass fixes
         the rest and reports anything impossible (red toast). Writes are "set to target", never "add", so a pass
         can never move a layer twice. Old helpers (_qceRecenterLayers, _qceShiftProp, _qceShiftScalar) removed.
         js/main.js - resolution tile starts the settle passes (150/500/1000/2000/3500 ms) using the job id that
         setCompResolution returns. Simulated against 3 AE behaviours (moves 3D at once / later / never): all end centred.

fix (host.jsx: "Illegal use of reserved word" at line 527):
  cause: _qceSettlePass used the parameter name "final", an ES3 reserved word that ExtendScript rejects.
  fix:   jsx/host.jsx - parameter renamed to isLast (same position, callers unchanged).

fix64 (tooltip: tip sat beside its tile + native browser tooltip leaked through):
  cause 1: js/mt-tooltip.js guessed whether the host reports element rects in screen pixels or divided by the UI scale
           (".app { zoom: var(--ui-scale) }"). The guess was only corrected when the cursor lay OUTSIDE the guessed rect,
           so near the middle of a tile a wrong guess stayed and the tip appeared beside the tile (looked like it belonged
           to the neighbour).
  fix 1:   calibrate() now finds the tile's real left / right / top / bottom edge on screen with elementFromPoint and
           uses the convention (k = 1 or k = zoom) whose rect matches those edges. Skipped only when both candidates
           are almost identical (error then below ~8 px).
  cause 2: leave() gave the title back to the browser whenever the hit test said "cursor not on the tile" (re-render,
           tile scaling on hover, edge pixels), so the NATIVE tooltip popped up.
  fix 2:   the title is only given back when a real mouseout / blur / document leave happens. While the last mouse event
           target is still inside the tile the title stays removed (tooltip just hides, comes back on the next move).
  files:   js/mt-tooltip.js (v7); cache-buster ?v=7 in html/index.html and neucurve/index.html.
  Tested in headless Chromium at UI scale 110% / 120%, rect convention new, old and old-with-wrong-probe (old code was
  13 px off in the last case, new code exact). Not run inside AE.


feature (new settings + Favorite pin; Multi Tool and NeuCurve):
  Multi Tool > Settings
    Density        Compact / Normal / Roomy. Scales the spacing tokens (--space-*, --gap-fluid-*) and the tile size.
    Glass blur     0-100% slider (50% = the old look). Overrides --glass-blur-card / --sidebar-glass-blur, Glass style only.
    Toast          position (6 places) and time on screen (1.5 / 2.4 / 4 / 6 s) + a "Show a test toast" button.
    Favorites      hover a tool tile and click its star. Pinned tools appear in a bar at the top of every tab except Curve.
                   Settings has a switch to hide the bar and a "Clear all favorites" button. Pins work on tool tiles (Easy Layer).
    Settings profile  Data and updates > Export / Import profile. One .json with every mtx.* and neucurve_* setting plus the
                   saved NeuCurve presets. Images / GIFs (mtx.bgImage, mtx.bgMotionGif, mtx.toolImg.*, anything over 150 KB) are
                   left out. Import only accepts keys with those prefixes, then reloads the panel.
  NeuCurve > Settings
    Graph (new tab)  Grid: show / numbers / columns 2-16 / rows 2-16 / solid-dashed-dotted / opacity / thickness / color.
                     Curve line: thickness / solid-dashed-dotted / glow.
    Handles          new "Handle Effects": glow, grow on hover, guide lines (show, style, opacity), value labels.
    Hotkeys (new tab) 10 actions (Apply, Ease, Ease In, Ease Out, Invert, Preview, Read from AE, Save as preset, Remove expressions,
                   Speed graph). Click a button, press the keys; Esc cancels, Backspace clears; a key already used moves to
                   the new action. Hotkeys are ignored while typing in a field. All unassigned by default.
  How it is built (nothing existing was rewritten):
    js/mt-pro.js, css/mt-pro.css, css/mt-pro-settings.css            Multi Tool side. The real controls are created inside the hidden
                                                                      #settings-modal, so js/mt-settings-remote.js mirrors them to html/settings.html.
    neucurve/nc-pro.js, nc-pro.css, nc-pro-settings.js, nc-pro-settings.css   NeuCurve side. Same neucurve_* keys and the same
                                                                      com.neucurve.sync event as the other NeuCurve modules.
    js/main.js       toast() reads MTPro.toastMs(); window.__MT bridge; buildTool() decorates tiles; renderTab() calls MTPro.afterRender();
                     "Reset everything" calls MTPro.reset().
    jsx/host.jsx     PROFILE_FILE_export / PROFILE_FILE_import (file dialogs only).
    neucurve/assets/index.js  three small patches: grid columns / rows / color read window.__ncGD, and window.__ncGRedraw exposes the
                     existing viewport nudge so a changed grid redraws at once. Defaults give the exact old grid (7 x 6 lines).
    Cache-busters raised: html/index.html main.js ?v=32, neucurve/index.html assets/index.js ?v=18, neucurve/settings.html nc-settings.js ?v=17.
  Tested in headless Chromium (not inside After Effects): pins + bar on every tab, density / blur / toast position and time, profile
  export + import with a faked host (hostile keys and wrong files rejected, images left out), NeuCurve grid 6x5 -> 10x8 with a new
  color, line / handle CSS, hotkeys fire and stop when switched off, both settings windows. Not verified here: the real File dialogs in
  AE, and CEP key interception (registerKeyEventsInterest) - if a hotkey does nothing in AE, that is the first place to look.

fix (island favorites + NeuCurve preset cards + resets):
  1. DYNAMIC ISLAND "Favorites" (4th tool, between Clock and Update). It shows the tools pinned as favorites (same list as the star on a tool tile,
     key mtx.pro.fav). Drag a tile (Easy Layer Null, Solid, ...) onto the island = add it; the tile STAYS in Easy Layer (copy, not move). Click a
     tile in the island = run that tool (works while the NeuCurve tab is open). Every tile has a x button (remove), the header has "Clear all".
     The wheel switches tools as before (the favorites grid scrolls with the wheel only when it is taller than its box).
     Files: js/mt-island.js v14, css/mt-island.css v12, js/mt-pro.js v2 (favAdd / favRemove / favItems, event mtx-fav-change),
            js/main.js v33 (runTool() split out of buildTool(), tiles are draggable, window.__MT.runTool / toolImg).
  2. NEUCURVE SETTINGS > Behavior > "Preset Cards": Card Style Grid / List / Compact (keys neucurve_cardStyle) and Card Corners
     Square / Soft / Round (neucurve_cardShape), plus Show Preset Names. Files: neucurve/nc-cards.css (new, loaded last), nc-view.js v6,
     settings.html, nc-pro-settings.js v2 / .css v2.
  3. NEUCURVE SETTINGS "reset per section": a Reset button on every group (Interface Colors, Graph Background Media, Handle Style,
     Panel Behavior, Curve Tab View, Preset Cards were new) and "Reset this page" top right (two clicks) which presses every Reset of the
     open page. The Clear buttons only clear the image; the group Reset also restores size / opacity / position.
  Tested in headless Chromium (not inside After Effects): drag + drop of the Null tile (fav saved, tile stays), click runs the tool, remove,
  clear all, empty state; all three card styles and corner shapes on the real NeuCurve page (21 presets); group + page resets.
  Not verified here: real HTML5 drag from the AE panel into the island (CEP Chromium) - if dragging does nothing, press the star on the tile instead.

BOXES IN THE DYNAMIC ISLAND (fix: boxes-island)
What: every box (collapsible card) of the Tools tab can be dragged by its header onto the dynamic island. The box MOVES: the live card (all its
controls still work) sits in the island's Favorites view under the tool tiles; the tab shows a "In the island / Bring back" row in its place.
The x in the island or "Bring back" returns it. The list is remembered (key mtx.island.boxes) and rebuilt at start. Turning the island off in
Settings returns the boxes to the tab.
Cause of the design: tab modules read their inputs with wrap.querySelector(...) on the element they built, so a moved box would break. Every tab
root gets a querySelector / querySelectorAll shim that also searches moved boxes (js/mt-island-boxes.js).
Files: NEW js/mt-island-boxes.js, NEW css/mt-island-boxes.css. Changed: js/mt-island.js (v15: boxHost, boxesChanged, focusBoxes, isEnabled, drop type
"text/mt-box", wheel over the boxes area scrolls it), js/main.js (MTBoxes.afterRender hook in renderTab, __MT.renderDetached), html/index.html (links).
Other tabs: add the tab id to PIN_TABS in js/mt-island-boxes.js (only for tabs whose render() keeps using the element it returned).

COLOR WHEEL RESET (fix: color-reset-white)
What: Color Palette tab > Custom Colors: a "Reset" button next to "Save to Custom Swatches". It sets the wheel colour back to neutral white (#FFFFFF),
same path as typing the hex: the active palette colour (SOL tile dot), the selected Fill effects and the stored colour all follow. Saved custom swatches are not touched.
Files: js/main.js (ColorWheel.create: .cw-actions row, .cw-reset handler), css/panel-refinements.css (v10), html/index.html (cache version).


fixCopy (wording pass): shortened long help texts and messages in html/index.html, html/settings.html, neucurve/settings.html, js/main.js, js/mt-updater.js, js/mt-bg-preview.js, js/mt-idle-focus.js, jsx/host.jsx, neucurve/nc-extras.js, nc-flow.js. Cause: wordy or inconsistent UI copy, some Indonesian error messages in an English UI. Fix: text only, no logic changed. Indonesian errors in host.jsx and neucurve/assets/index.js now English. "Colour" became "Color". Removed "Enjoy the new features!" from the update toast.


NEUCURVE SETTINGS THAT DID NOTHING IN AFTER EFFECTS (fix: nc-settings-live)
What: Settings > Handle Effects > Handle Glow and Settings > Curve Line > Glow had no visible effect in After Effects. Settings > Handle Effects >
Show Value Labels and Settings > Graph > Show Numbers / Show Grid did not hide the numbers while a handle was pressed.
Cause: (1) both glows were CSS "filter: drop-shadow()" rules in nc-pro.css. After Effects' CEF does not render drop-shadow on SVG elements (same
reason nc-glow.js already draws the built-in glow with stacked strokes). (2) nc-handle.css shows the value / axis numbers with a much more specific
selector than the "off" rules in nc-pro.css, so those rules never won.
Fix: nc-glow.js (v5) now draws both glows with plain SVG: g.nc-uglow (extra stacked strokes behind the curve, size and strength follow the Glow
slider) and circle.nc-hglow-u (radial-gradient halo behind every handle, colour = handle colour, stays visible while dragging). nc-pro.js (v2) hands
the two slider values over in window.__ncUG and calls window.__ncGlowSync(). nc-pro.css (v2): drop-shadow rules removed, label / axis-number "off"
rules now out-rank nc-handle.css. nc-glow.css (v5): hides g.nc-uglow during drag / morph like the built-in glow. nc-flow.js (v26): its observer
ignores g.nc-uglow too. neucurve/index.html: cache versions bumped.
Checked by reading every Settings key -> consumer pair: grid (show, numbers, columns, rows, style, opacity, thickness, colour), line (thickness,
style), handle guide lines (show, style, opacity), grow on hover, hotkeys targets, colours, handle style / size / line, background, preset cards,
live ball, view toggles all reach their code and work. Only the four items above were broken.
Tested in headless Chromium (not inside After Effects): glow on / off / max, no duplicate halos, value labels and axis numbers hidden while pressed.
Not verified here: the look inside AE's CEF. If the glow looks too strong or too weak, tune userLayers() (line) and syncUserHalos() (handle) in
neucurve/nc-glow.js.


NEUCURVE HANDLE EFFECTS + GRAPH SETTINGS NEVER REACHED THE PANEL (fix: nc-pro-sync)
What: after the glow fix, Settings > Handle Effects and Settings > Graph (grid, curve line) still changed nothing in the Curve tab or in the
Large Graph Editor window.
Cause: the Settings window, the Large Graph Editor and the main panel are separate CEP extensions with separate localStorage, so the "storage"
event never fires between them. The only link is the "com.neucurve.sync" CSEvent, which carries {key, val}. nc-pro.js ignored that payload and
only re-read its own (unchanged) localStorage. nc-ball.js, nc-view.js, nc-extras.js and nc-particles.js already write the payload first.
Fix: nc-pro.js (v3) onSync() writes {key, val} into this window's localStorage (only keys nc-pro.js owns), then applies. neucurve/index.html:
nc-pro.js?v=3.
Tested in headless Chromium with a stub CSInterface: events from "another window" now apply handle glow, line glow, guide lines, grid and hover
in index.html and in index.html?ext=graph. Before the fix none of them did. Not verified inside After Effects.


NEUCURVE HOTKEYS DID NOTHING IN AFTER EFFECTS (fix: nc-hotkey-focus)
What: shortcuts set in NeuCurve Settings > Hotkeys did not press the buttons in the panel.
Cause (likely): the Curve tab is an iframe inside the Multi Tool panel. After a click on the tab bar or another part of the panel the keyboard focus
sits in the parent document, so the iframe never received the key. The list of keys given to After Effects (registerKeyEventsInterest) was only sent
once, so it could also get lost when the panel was hidden or re-docked.
Fix: nc-pro.js (v4): while the Curve tab is visible it also listens for keydown on the parent document; a click inside the tab focuses it; the key
list is sent again on focus, mouseenter, visibilitychange and every 5 s. Console helper: NCPro.debug() shows the stored hotkeys, what AE was told,
and whether the CEP bridge exists. neucurve/index.html: nc-pro.js?v=4.
Tested in headless Chromium: key pressed with focus in the parent panel clicks APPLY in the Curve iframe. Not verified inside After Effects.
Note: if After Effects itself uses the same key combination it keeps it; pick a free combination (for example Ctrl+Shift+letter).

fix (Favorites removed, island view "Pin"):
  1. Favorite feature removed from Multi Tool: no star on tool tiles, no favorites bar above the tabs, no Settings > Favorites group, tool tiles can no longer be
     dragged onto the island. Files: js/mt-pro.js (favorite code deleted, window.MTPro now only exposes toastMs + reset; reset() still wipes the old keys
     mtx.pro.favBar / mtx.pro.fav), css/mt-pro.css, html/settings.html, js/main.js (tile dragstart, decorateTool, afterRender calls removed).
     NOT touched: the long-press favorites of Animation Presets and of the Expression snippets (separate feature, presetFavStore / it.favorite).
  2. Dynamic island: the 4th view (key "fav" kept internally so the saved selection still works) is now called "Pin" and shows only the boxes dragged from
     the Tools tab. Empty text "Drag a box here to pin it.", toast "Pinned.", the placeholder left in the tab says "Pinned" + "Bring back". The yellow star
     icon in the switcher is now a pin shape. Files: js/mt-island.js v16, js/mt-island-boxes.js, css/mt-island.css, css/mt-island-boxes.css.

fix (island clock always visible):
  Bug: the collapsed dynamic island kept showing the time of day even when the pointer was away from it.
  Cause: class .is-k (clock) forced the time wrapper (.mi-tw) open in css/mt-island.css and collapsedSize() in js/mt-island.js widened the capsule for it.
  Fix: both removed. The time (clock, timer, stopwatch) now opens only while the pointer is on the island; pointer away = small icon only (the dial hands still move).
  Files: js/mt-island.js v17, css/mt-island.css. Syntax-checked only; not tested inside After Effects.

fix (tool tiles can be pinned to the dynamic island again):
  Bug: after the "Favorites removed" change, tool tiles could no longer be dragged onto the island, so a tool could not be run from the island.
  Now: drag any tool tile from any tab onto the island (it opens on the "Pin" view) -> the tile is pinned there. In the island: click a tile = run the tool
  (no need to open its tab), x on a tile = unpin, "Unpin all". Boxes dragged from the Tools tab live in the same Pin view.
  Still removed: the star on tiles, the favorites bar above the tabs, the Settings > Favorites group.
  Storage: pinned tiles keep the old key mtx.pro.fav, so tiles pinned in earlier versions show up again.
  Motion (css/mt-island.css): tiles stagger in when the view opens (240 ms, 35 ms apart), a new pin pops (340 ms, small overshoot), an unpinned tile shrinks out (150 ms),
  the grid dims while a drag is over the island. All off when Settings > Animations is off.
  Files: js/mt-pro.js (pin store only), js/main.js (tile dragstart), js/mt-island.js v18, css/mt-island.css. Syntax-checked only; not tested inside After Effects.

fix (pinned tile did not show in the island):
  Cause 1: js/mt-island.js lost the X_SVG constant in v16, so painting the first tile threw "X_SVG is not defined" and the Pin view stayed empty. Re-added.
  Cause 2: html/index.html still pointed at the old cached files (?v=). Cache-bust bumped: mt-island.css ?v=14, mt-island.js ?v=16, mt-island-boxes.css/js ?v=2,
  mt-pro.js ?v=3, mt-pro.css ?v=2, main.js ?v=34. Also restored ".mi-fgrid[hidden]" in css/mt-island-boxes.css.
  Tested in headless Chromium (html/index.html): drop a tile on the island -> 1 tile in the Pin view, 2nd tile pops, x unpins, Unpin all empties it, no page errors.

fix (lag when opening Multi Tool Settings; NeuCurve settings were fine):
  Cause: the Multi Tool settings window mirrors ~200 controls from the panel, and opening it did the same work twice and touched the DOM too much:
   - the window sent "hello first" twice (at start and again after 400 ms), so the panel rebuilt + re-sent the whole state twice and the window re-applied it;
   - apply() rewrote root attributes, 21 CSS variables, aria-checked, hidden, disabled ... even when the value was the same (each root write restyles the whole window);
   - the panel read getComputedStyle(root) + 3 element styles every 500 ms, which forces the browser to finish every pending style change of the animated panel;
   - the background check ran a regex over the whole background image string (can be MBs for a data: URL) every 500 ms.
  Fix: js/mt-settings-window.js (v5: 2nd hello only when the panel did not answer, writes only when changed) and js/mt-settings-remote.js (v6: theme variables and
  hidden flags re-read only when the root element changed or every 4 s; no regex on the background string). Cache-bust: mt-settings-window.js ?v=5, mt-settings-remote.js ?v=6.
  Measured in headless Chromium with the CPU slowed 6x: long-task time while opening Settings about 20-30 % lower (still noisy). Theme sync checked both ways.
  Not changed: the time CEP needs to create the separate window itself (requestOpenExtension).

fix (Multi Tool Settings still lagged a few seconds when clicking a menu item; NeuCurve settings were fine):
  Cause: js/mt-persist.js mirrors the WHOLE localStorage to Documents/MyMultitoolExtension/settings-backup.json (synchronous writeFileSync, debounced 400 ms).
   The Multi Tool settings window talks to the panel through js/mt-settings-bus.js, which also writes every message (hello every 2 s, alive, state, bgview,
   bgsrc up to 400 KB) into localStorage keys "mtbus.*". Each of those writes (and each "storage" event from the other window) re-scheduled a full dump, so with a big
   localStorage (background image, tool images as data URLs) the main thread was blocked for seconds, right when a menu item was clicked.
   NeuCurve settings does not use the bus, so it never triggered the dump.
  Fix: js/mt-persist.js v2 ignores keys "mtbus.*" everywhere (restore, dump, setItem/removeItem hook, storage event). Real settings are still backed up as before.
   Cache-bust: mt-persist.js ?v=2 in html/index.html, html/settings.html, neucurve/index.html, neucurve/settings.html.
  Checked: script syntax only (node). Not measured inside After Effects.

fix2 (Settings window still lagged right after opening / clicking a menu item such as Background):
  Cause (most likely, not measured inside After Effects): as soon as the Settings window opened, js/mt-bg-preview.js asked the panel for the whole background media ("bgreq").
   The panel then sent it ("bgsrc": the image / GIF as a data: URL, can be MBs) through three channels (CEP event, BroadcastChannel, localStorage), and the window parsed it
   twice - all of this on the main thread of both windows, even if "Adjust background" was never opened. Also every "storage" event from the other window re-ran a full
   localStorage dump to disk in the Settings window too.
  Fix: js/mt-bg-preview.js v2 asks for the media only when "Adjust background" is opened (or when the media changes while the editor is open).
   js/mt-persist.js v3: "storage" events from another window schedule the dump 4 s later (coalesced) instead of 400 ms; own writes still 400 ms; mtbus.* still ignored.
   Cache-bust: mt-bg-preview.js ?v=2 (html/settings.html), mt-persist.js ?v=3 (4 pages).
  Quick check if lag remains: Settings > Background > Remove, reopen Settings. Lag gone = the big background media was the cause.

new (Batch Rename + Color Coder UI, Keyboard shortcuts, Command Palette, more Shortcutz tiles):
  1. Tools tab: two new cards, "Batch Rename Layers" and "Smart Layer Color Coder". The backend (TOOLS_batchRename, TOOLS_autoColorCode in jsx/host.jsx)
     already existed but nothing called it. js/main.js: new markup before the Project Cleaner card, 2 new branches in the data-tool-action click handler
     ("batch-rename", "auto-color"), and a small toggle that shows / hides the numbering fields (#br-seq, #br-seq-fields).
  2. Settings > "Keyboard shortcuts" (new section in html/settings.html, js/mt-hotkeys-settings.js, css/mt-hotkeys-settings.css).
     Any command can get a key (click Set, press keys; Delete clears, Esc cancels). Rules: Ctrl or Alt (or an F key) is required, a key already used is refused,
     a key NeuCurve uses is allowed with a note (inside the Curve tab NeuCurve wins). The controls have no id on purpose, so js/mt-settings-window.js does not forward them.
  3. js/mt-hotkeys.js (panel side, loaded after js/mt-settings-remote.js) builds ONE command list (tabs, Easy Layer, anchor / align / fit / flip, Tools actions,
     every Shortcutz tile incl. custom ones), runs the keys, registers them with registerKeyEventsInterest, and owns the Command Palette (default Ctrl+K, also changeable).
     Data: localStorage "mt.hotkeys" = {on, palette, map:{commandId:{c:"Ctrl+Alt+1", k:49}}}; recent palette picks: "mt.hotkeys.recent". Both travel with Settings > Export profile.
     Window <-> panel messages over js/mt-settings-bus.js: hkreq, hkstate, hkset (v4: these two are "latest wins", added to KEEP_ONE).
     js/main.js now exposes window.MTCore (Bridge, toast, TABS, showTab, runTool, SaveFrame, Shortcutz, currentTab) for that module.
     Keys only reach the panel while it has keyboard focus (CEP limit). Not run inside After Effects.
  4. Shortcutz: new built-in tiles. Expressions: Loop Ping-Pong, Loop Continue, Choppy Wiggle, Fade In / Out (opacity), Blink (opacity). Effects: Glow, Gaussian Blur, Tint,
     Levels, Hue/Saturation, Gradient Ramp, Transform, Turbulent Displace, Slider / Checkbox / Color / Angle Control. Utilities: Easy Ease (both / in / out), Reverse Keyframes,
     Reverse Layer, Time Remap, Freeze Frame, Split Layer, Parent to Null, Lock, Shy, Solo, Guide, Comp Marker, Layer Marker, Work Area to Layers, Add to Render Queue, Incremental Save.
     New host functions at the end of jsx/host.jsx (ES3): SHTZ_easyEase, SHTZ_runMenuCommand, SHTZ_toggleSwitch, SHTZ_parentToNull, SHTZ_addMarker,
     SHTZ_workAreaToLayers, SHTZ_addToRenderQueue, SHTZ_incrementalSave. Reverse Keyframes / Reverse Layer / Time Remap / Freeze Frame / Split Layer look the menu command up by its
     ENGLISH name (app.findMenuCommandId); on a localized After Effects they report "not found" instead of failing silently.
  Motion (Corporate): palette opens in 200 ms (opacity, 8 px rise, 1.5% scale, decelerating), closes in 130 ms, row hover 100 ms; the conflict shake in Settings is 360 ms without overshoot.
   "Animations off" (html[data-reduce-motion="true"]) removes the transitions, the listening pulse and the shake.
  Cache-bust: mt-settings-bus.js ?v=4 (html/index.html, html/settings.html); new files css/mt-hotkeys.css, js/mt-hotkeys.js (index), css/mt-hotkeys-settings.css, js/mt-hotkeys-settings.js (settings).
  Checked: node --check on every changed script; in a headless Chromium preview (no After Effects) the palette opens with Ctrl+K, filters, runs; a key set in the Settings window reaches the
  panel and runs; conflict and plain-key refusals show; the two new Tools cards call the right Bridge functions. NOT run inside After Effects: the SHTZ_* host functions and registerKeyEventsInterest are untested there.

new (faster editing: keyframe moves, layer selection, distribute, repeat last command):
  Shortcutz > Utility Shortcuts, and therefore also the Command Palette and Settings > Keyboard shortcuts, got 11 tiles:
   Keys to Playhead, Keys +1 / -1 / +5 / -5 Frames, Sequence Keys (2 frames per layer), Select Same Type, Select Same Label, Invert Selection,
   Distribute Horizontally / Vertically.
  New host functions at the end of jsx/host.jsx (ES3): SHTZ_moveKeys(mode, frames), SHTZ_distributeLayers(axis), SHTZ_selectLayers(mode).
   SHTZ_moveKeys reads each selected key (value, interpolation, temporal ease, spatial tangents), removes it, adds it at the new time and restores those settings,
   then re-selects it. A key that lands on an UNselected key overwrites it (same as dragging in the timeline). Distribute only handles layers whose Position has no keyframes.
  js/mt-hotkeys.js: new command "Repeat last command" (General). It repeats the last command run from the palette or a hotkey and never replaces it as "last".
   No key is assigned by default: set one in Settings > Keyboard shortcuts.
  Checked: node --check; SHTZ_moveKeys exercised against a mock of the AE key API in Node (offset and playhead modes, spacing kept, selection restored);
   palette / repeat / new tiles in a headless Chromium preview. NOT run inside After Effects.

new + fix (NeuCurve favorites and preset keys; hotkeys of the panel and NeuCurve no longer erase each other):
  Fix: registerKeyEventsInterest REPLACES the previous key list. The Curve tab (iframe, neucurve/nc-pro.js) and the panel (js/mt-hotkeys.js) are the same CEP extension and each
   re-sent ONLY its own keys every 5 s, so using hotkeys in both would have made one side stop working. Both now send the union: js/mt-hotkeys.js adds the keys stored in
   "neucurve_hotkeys" (when "neucurve_hotkeysOn" is not "0"); neucurve/nc-pro.js adds "mt.hotkeys" (command palette key and the panel's shortcuts). Cache-bust: nc-pro.js ?v=5.
  New: neucurve/nc-quick.js + nc-quick.css (loaded from neucurve/index.html after nc-pro.js).
   - Long-press (0.45 s) a preset in the grid = add / remove it from Favorites (a star appears). The click that ends the long-press does not select the preset.
   - A star button next to the library menu (.nc-favtoggle) shows only the favorites of the open library.
   - New NeuCurve hotkey actions (Settings > Hotkeys, list in neucurve/nc-pro-settings.js ?v=3, handlers in TARGET of nc-pro.js): Next preset, Previous preset, Favorite on / off,
     Apply favorite 1 to 5 (selects the favorite, switches the library if needed, then presses APPLY).
   - Data: localStorage "neucurve_favs" = [{lib, name}], "neucurve_favOnly". Favorites are matched by library + preset name; renaming a preset drops it from Favorites.
   - The preset grid is Svelte; nc-quick.js only reads and clicks its DOM (.preset-item, .preset-thumbnail, .lib-select, .apply-btn), so a change in that markup would stop it.
   - Motion: star pop 220 ms. Only "data-reduce-motion" turns it off (not the OS setting, same policy as the rest of NeuCurve).
  Checked: node --check; headless Chromium preview of neucurve/index.html: long-press adds a star and does not select, normal click still selects, next / prev move the selection,
   fav 1 selects and clicks APPLY, the star filter hides the other presets. NOT run inside After Effects (key delivery and the real APPLY).

new (timeline speed-ups: keyframes at playhead, layer order, motion blur, text case, randomize):
  Shortcutz > Utility Shortcuts (so also the Command Palette and Settings > Keyboard shortcuts) got 12 tiles:
   Add Keyframe, Remove Keyframes, Layer Start to Playhead, Layer End to Playhead, Reverse Layer Order, Motion Blur, 3D Layer, Show / Hide Layer,
   Collapse Transform, UPPERCASE, lowercase, Title Case.
  New host functions at the end of jsx/host.jsx (ES3): SHTZ_addKeyAtTime, SHTZ_removeKeys, SHTZ_layerToPlayhead(mode), SHTZ_reverseLayerOrder, SHTZ_motionBlur,
   SHTZ_textCase(mode), SHTZ_randomize(what, a, b). 3D Layer / Show-Hide / Collapse Transform reuse SHTZ_toggleSwitch.
   Add Keyframe uses valueAtTime(t, true), so an expression is not baked into the key. Remove Keyframes keeps the value at the current time.
   Text Case and Randomize only touch static values: a text layer with animated Source Text, or a property with keyframes, is skipped and counted in the message.
   Randomize on Position changes X and Y only (Z is left alone); on a layer with separated dimensions it reports "skipped".
  Tools tab: new card "Randomize Transform" (Position +-px, Rotation +-deg, Scale min-max %, Opacity min-max %). Choosing a chip fills sensible defaults and shows / hides the Maximum row.
  css/style.css: .chips-4 (4 equal chips) and .param[hidden] { display: none !important } - .param is display:flex, which made the hidden attribute do nothing.
  Checked: node --check; Reverse Layer Order (contiguous and non-contiguous selections), text case and Layer Start to Playhead run against a Node mock of the AE layer API;
   headless Chromium preview: the Randomize chips switch labels and the Maximum row, and the call reaches the Bridge; 122 palette commands, 69 Shortcutz tiles.
   NOT run inside After Effects.

fix (NeuCurve favorites toggle: new icon, new place):
  What: the "show favorites only" star sat next to the Def / Sav dropdown, and in landscape it floated alone in the corner of the preset column. It looked like a second preset menu and
   gave no feedback when there were no favorites (all presets vanished).
  Cause: neucurve/nc-quick.js inserted it into .lib-actions; nc-flow.js moves the Preset Options container into .fl-toolrow in landscape, so the star was left outside the row.
  Fix: neucurve/nc-quick.js puts the star into .fl-toolrow as one more .fl-tool, right before Preset Options (waits in .lib-actions until the row exists, moves only when the place is wrong).
   Clicking it with no favorites in the open library does not turn the filter on (button flashes, tooltip explains). With the filter on and no favorites in a library, the grid stays
   visible (html[data-nc-favempty], set in mark()). On state also sets .active.
  Icon: neucurve/nc-icons-pro.js has the star in the NeuCurve family (1.7 stroke, soft tone fill) under three titles: "Show favorites only", "Show all presets",
   "No favorites yet - long-press a preset to add one". neucurve/nc-quick.css: on state = favorite colour + filled tone + glow, light-theme variant.
  Cache-bust: nc-quick.js ?v=2, nc-quick.css ?v=2, nc-icons-pro.js ?v=6.
  Checked: node --check; headless Chromium (portrait and forced landscape): one star in .fl-toolrow before Preset Options, long-press adds a favorite, filter shows only it, empty click is ignored.
   Only one Preset Options menu exists in the DOM; a second menu could not be reproduced. NOT run inside After Effects.

fix (NeuCurve: duplicate library header after leaving Expression Templates):
  What: entering Expression Templates and leaving it again showed TWO library bars: the moved one (Def dropdown, tool icons, Preset Options) and a second old-style "LIB / DEF / dots" bar under it,
   with a second Preset Options that did nothing.
  Cause: neucurve/nc-flow.js MOVES .library-header out of .preset-container into .fl-bar / .fl-side. Expression Templates destroys the preset block; Svelte removes only its own root, so the moved
   header stayed as a dead copy. On leaving the mode Svelte built a fresh header inside a fresh .preset-container, and nc-flow.js kept using the first (dead) one.
  Fix: build() in nc-flow.js now looks for more than one .library-header. The fresh one (parent .preset-container) is kept, our .fl-toolrow (with the favorites star) is carried over into it, the dead
   Preset Options is dropped, the dead header is removed. Cache-bust: nc-flow.js ?v=27.
  Checked: headless Chromium, portrait and landscape: enter and leave Expression Templates, header count stays 1 (before: 2), 21 presets back, Preset Options opens (3 cycles, landscape).
   NOT run inside After Effects.

fix (NeuCurve Expression mode: native scrollbar in the code box):
  What: the expression code box showed the operating system's scrollbar (white track, arrow buttons) when the code is longer than the box.
  Cause: .expr-box (compiled Svelte, neucurve/assets/index.js) had no scrollbar styling.
  Fix: new neucurve/nc-expr.css (linked in neucurve/index.html after nc-quick.css, ?v=1): thin 8 px rounded thumb tinted with --nc-ui-rgb, transparent track, no arrow buttons, light-theme variant.
   Only ::-webkit-scrollbar rules are used (the standard scrollbar-width / scrollbar-color are left out on purpose: in new Chromium they would switch the webkit rules off).
  Checked: headless Chromium with real (non-overlay) scrollbars, before / after crop of the box: white native bar with arrows -> thin themed bar. NOT run inside After Effects.

fix (NeuCurve mode switches lagged after the background preload; panel opens like before again):
  Cause: an earlier change loaded the NeuCurve frame in the background at panel start and built every tab behind a held splash. The frame was then loaded and
   "warmed" while its pane was hidden (visibility:hidden, often 0 px while After Effects restores the workspace), so the graph was measured at the wrong size,
   the mode warm-up gave up or ran unpainted, and the first real mode switches (Bezier / Custom / Elastic / Bounce / Wave / Steps) were cold again.
  Fix: opening the panel is back to the old, plain behaviour: the opening splash runs on its fixed timer (js/splash.js, css/splash.css are the originals), nothing is
   preloaded, no tab is cycled. The NeuCurve frame loads the first time the Curve tab is opened, when it is visible and has its real size, and neucurve/nc-warm.js
   warms every mode behind the loader (two passes, as before). nc-warm.js now also waits while the frame has no size (innerWidth/innerHeight < 120) and its
   8 s give-up clock only runs while the frame is really shown.
  Loader: the spinner in the Curve pane is now a ring (css/mt-boot.css, markup in html/index.html, Curve.progress() in js/main.js): the arc fills with the real
   warm-up progress ("Warming Elastic" ...), a faint sweep keeps turning, one settle pulse at 100 %. nc-warm.js posts {mtCurveProgress:{f,label}} to the panel.
   Off when Settings > Animations is off (sweep and pulse stop).
  Side effect: NeuCurve's own keys (neucurve/nc-pro.js) work again only after the Curve tab has been opened once per session (the frame does not exist before that).
   The panel's keys (js/mt-hotkeys.js, Ctrl+K and every command key) work on every tab; a combo that NeuCurve also uses belongs to NeuCurve once its frame is loaded.
  Cache-bust: main.js ?v=39, mt-boot.css ?v=3, nc-warm.js ?v=100. Syntax-checked only (node --check); not run inside After Effects.

fix (blank panel after the previous change; NeuCurve load logic is now a copy of the working zip):
  Cause: while putting the opening splash back, an edit of html/index.html removed one closing </div> of the splash block. The splash then never closed, the whole panel sat
   inside it and was removed together with the splash, so nothing showed.
  Fix: the </div> is back (div count balanced). Checked in headless Chromium (html/index.html): 11 tabs, tool grid rendered, splash removed, Curve tab opens and the frame loads on first visit.
  NeuCurve load logic: js/main.js Curve block (show / hide / frame load / loading spinner flag) and the "message" handler are now identical to the zip that worked;
   neucurve/nc-warm.js is the same file as in that zip (no progress messages, no size wait). Nothing preloads and no extra Curve.start / Curve.progress exist any more.
  Loader UI only: the spinner in the Curve pane is a ring (css/mt-boot.css, markup in html/index.html) that turns by CSS alone, with the text "Loading NeuCurve". It shows and hides with the same
   .is-loading flag as before. The progress percent / "Warming Elastic" text of the earlier entry is gone.
  Cache-bust: main.js ?v=40, mt-boot.css ?v=4, nc-warm.js ?v=3.

new (minimal loader in the Curve tab: outlined pill + light bar, "LOADING..."):
  The ring spinner of the Curve pane is replaced by a minimal pill loader (reference screenshot from the owner): a thin outlined rounded track, a light bar that glides through it
  (1.5 s, ease in-out, loops) and a small letter-spaced "LOADING" line whose dots count up. Pure CSS, colors follow --text / --text-dim / --text-faint so it fits the dark and the light style.
  Animations off (html[data-reduce-motion="true"]): the bar rests and the dots stay still. Files: css/mt-boot.css (rewritten), html/index.html (markup inside .curve-loading). Cache-bust: mt-boot.css ?v=5.
  Only the look changed: it is still shown by the same .is-loading flag, js/main.js and neucurve/nc-warm.js are untouched. Checked in headless Chromium; not run inside After Effects.

new (Curve tab loader redrawn as an open ring with percent, from the owner's reference image):
  A thick ring without track fills clockwise from 12 o'clock, the percent sits in its centre, "LOADING" (wide letter-spacing) under it. Replaces the pill bar of the previous entry.
  Files: css/mt-boot.css (rewritten), html/index.html (markup in .curve-loading + <script src="../js/mt-loader.js?v=1"> after main.js), js/mt-loader.js (new). Cache-bust: mt-boot.css ?v=6.
  js/mt-loader.js is visual only: it watches the .is-loading flag of #curve-pane and the load event of #curve-frame; it does not start, stop or change NeuCurve's loading (js/main.js and neucurve/nc-warm.js are untouched).
  The number eases toward 55 % while the frame loads, toward 92 % once the frame has loaded (modes warming), and the loader disappears with the flag. Colors follow --text (dark and light style).
  Checked in headless Chromium (percent grows, loader hides when loading ends); not run inside After Effects.

fix (Curve tab loader was too big, now smaller):
  Ring 88 -> 54 px, percent 17 -> 11 px, LOADING text 12 -> 8.5 px, smaller gaps (css/mt-boot.css only). Look and behaviour are unchanged. Cache-bust: mt-boot.css ?v=7.

fixN (color wheel pointer): Color Palette > Custom Colors, lingkaran penanda tidak pas dengan kursor saat drag / what: js/main.js ColorWheel.pointerBox() / cause: posisi kursor -> koordinat canvas dihitung dari getBoundingClientRect() lalu ditebak skala zoom (.app { zoom: var(--ui-scale) }); tebakan bisa meleset di host CEF tertentu sehingga titik bergeser dari mouse / fix: pointerBox(el, e) sekarang mengukur tepi canvas asli di layar lewat elementFromPoint (gallop + bisect, piksel sama dengan clientX/Y, tanpa asumsi zoom) saat pointerdown, lalu memilih kandidat rect yang cocok; hasil ukur dipakai ulang selama drag (juga untuk slider Brightness). Bagian lain tidak diubah.

fix (NeuCurve favorite): favorit hilang setelah Apply, dan tanda bintang di kotak preset diganti garis tepi kuning
  Files: neucurve/nc-quick.css (bintang ::after dihapus; favorit = border + ring kuning di .preset-thumbnail, !important supaya tetap kuning saat hover / selected / setelah Apply, ada varian html.mt-light), neucurve/nc-quick.js (penanda .nc-fav kini dicek ulang lewat MutationObserver atribut class pada .preset-item + re-mark 30 ms dan 300 ms setelah setiap klik, jadi tidak bisa hilang setelah Apply / render ulang grid). Tombol bintang filter "Show favorites only" di tool row tidak diubah. Data favorit (localStorage neucurve_favs) tidak diubah. Cache-bust: nc-quick.css/js ?v=3.
  Penyebab hilang: penanda hanya dipasang saat daftar preset (childList) berubah; perubahan class pada item setelah Apply tidak memicu pemasangan ulang. Belum dites di After Effects.

new (Animation Presets: floating Refresh button at the bottom):
  Problem: the Refresh button sits in the toolbar at the top of the tab; with a long preset list you had to scroll back up to refresh.
  What: a second, round Refresh button is docked at the bottom-right edge of the panel. It fades in only while the toolbar Refresh button is scrolled out of view, and fades out again when you are back at the top. Click = same action and toast as the toolbar button (icon spins while scanning). The scroll position is kept while the list is rebuilt, so you stay where you were. Hidden while no preset folder is selected.
  How: js/main.js Presets.render() ("Floating Refresh button"): a zero-height sticky dock (.preset-fab-dock) is appended to the panel right after the tab is mounted; scroll listener (rAF throttled, passive) on #main toggles .is-shown and removes itself when the tab is left. Only opacity + transform animate; no inset / gap / min() / clamp() (AE 2021 safe).
  Files: js/main.js, css/mt-preset-fab.css (new), html/index.html (stylesheet link). Cache-bust: main.js ?v=41, mt-preset-fab.css ?v=1. Not run inside After Effects.

new (Tools: Duplicate Precomp (Deep)):
  Problem: duplicating a pre-comp with comp.duplicate() only copies the top comp; pre-comps nested inside stay shared with the original, so editing the inside changes other layers too.
  What: new Tools section "Duplicate Precomp (Deep)". Select one or more pre-comp layers and click "Duplicate Pre-comp Layer": each layer is duplicated as a NEW layer in the timeline (above the original, selected afterwards; effects, masks, transform and keyframes are copied by layer.duplicate()), and that new layer is re-pointed to its own copy of the pre-comp AND every pre-comp nested inside it, at any depth. The original layer and comps are not touched. If a layer fails, its half-made duplicate is removed. Option "Put copies in a 'Deep Copies' folder" (on by default). One undo step. Hotkey list entry: "Duplicate precomp (deep, nested too)".
  How: jsx/host.jsx TOOLS_duplicatePrecompDeep() + _dpClone() (recursive duplicate, replaceSource(copy, false) on each nested comp layer, a comp used twice inside one tree gets one copy, cycle guard, locked layers unlocked and re-locked) + _dpFolder(). Each selected layer gets its own tree, so two layers using the same pre-comp do not end up sharing copies. Footage/solids stay shared.
  Limit: expressions that call comp("Name") still point to the old comp (replaceSource is called with fixExpressions = false).
  Files: jsx/host.jsx, js/main.js (section + handler), js/mt-hotkeys.js, html/index.html (cache-bust main.js ?v=42, mt-hotkeys.js ?v=3). Syntax checked only; not run inside After Effects.

fix (NeuCurve: Large Graph Editor kept the OLD graph background after changing Settings > Background > Graph Background Media):
  Cause: the Large Graph Editor ("?ext=graph") is a separate CEP window with its own localStorage. It learned about a new background
  only from the live "com.neucurve.sync" event, so if the window was closed at that moment (or the event was not delivered) it kept
  the old image / zoom / position until the same change was made again while it was open. Nothing ever asked for the current value.
  Fix: neucurve/nc-bg.js - in the Large Graph Editor the window now sends "com.neucurve.bgrequest" when it opens (again after 1.2 s and 4 s,
  because the other windows may still be loading), and whenever it gets focus / becomes visible. The Curve tab frame and the Settings window
  answer with bgImagePath, bgOpacity, bgZoom, bgPosX, bgPosY and bgOrig through the existing "com.neucurve.sync" event, which the window
  already applies. A cleared background is sent as well (empty path). Settings window and Curve tab behave as before.
  Files: neucurve/nc-bg.js, neucurve/index.html + neucurve/settings.html (cache-bust nc-bg.js ?v=18), README.txt.
  Limit: a background picked with the drag-and-drop / file-input fallback is stored as a data: URL (can be several MB); CEP events may drop
  very large payloads. Picking the image with the file dialog (stored as a file path) always works. Syntax checked only; not run inside After Effects.

fix (Animation Presets: "Show in Explorer" showed "Couldn't open that file location."):
  Cause: js/main.js revealPreset() returned false as soon as ONE check failed (the file name as listed was not found on disk, e.g. different
  letter case / URI encoding like %20 %2B, or any exception), and nothing else was tried; an Explorer start error after that was ignored.
  Fix: (1) the name is tried as listed and URL-decoded, then matched case-insensitively inside its folder; if the file is really gone the
  folder is opened instead. (2) If Explorer / Finder cannot be started, or Node is missing, the ExtendScript route PRE_reveal now runs
  (jsx/host.jsx: selects the file through system.callSystem, else opens the folder). The red toast shows only when both routes fail.
  Files: js/main.js (revealPreset + reveal click handler), jsx/host.jsx (PRE_reveal), html/index.html (cache-bust main.js ?v=43).
  Cause not reproduced inside After Effects (no Windows / AE here); syntax checked only. If the toast still appears, the message now comes from PRE_reveal and says why.

fix (Animation Presets: green check, but Apply says "this file was created with a newer version of After Effects"):
  Cause: the support check (green check / red cross) only compares the EFFECTS a preset uses with the effects installed in this After Effects.
  It never looks at the version the .ffx was saved in, so a preset made in a newer AE has all its effects installed (green) and is still refused by AE on Apply.
  Fix: js/main.js - when Apply fails with that AE message, the preset is marked red at once ("Not supported: saved in a newer After Effects than this one"),
  the toast explains it in plain words, and the mark is remembered (Store key presetTooNew, per file + size/modified time: it survives a restart and is dropped when the file is replaced).
  The Support filter / counters treat it like any red preset. Limit: AE only tells us on the first Apply; reading the version from the .ffx header up front was not done (the header layout is not
  verified against AE 2021 / 2022+ files). Files: js/main.js, html/index.html (cache-bust main.js ?v=44). Syntax checked only; not run inside After Effects.

new (Animation Presets: find, separate or delete presets this After Effects can't use):
  Problem: after the last fix some presets were still green (all effects installed) but After Effects refused them on Apply ("created with a newer version").
  What (Check Support bar): 
    - "Test in After Effects": applies every green preset once to a throw-away solid in a throw-away comp, 8 at a time, and marks the ones AE refuses with the
      "newer version" error red (reason: "saved in a newer After Effects than this one"; remembered per file, same store as the Apply-time mark). The comp, the solid and an empty
      "Solids" folder are removed again in the same call; nothing is left in the project (one undo step "Check Presets"). Other errors (e.g. a text preset on a solid) are ignored.
    - "Move unsupported (n)": moves all red presets into a subfolder "Unsupported" of the preset folder (shows up as its own category). Copy + delete, name clashes get " (2)".
    - "Delete unsupported (n)": two clicks (first arms for 4 s, second deletes), also removes red presets already in "Unsupported".
    Presets sitting in the "Unsupported" folder always show red, so they are not offered again for moving.
  How: jsx/host.jsx PRE_probe / PRE_moveMany / PRE_deleteMany; js/main.js (support bar buttons, handlers); css/mt-preset-support.css (.psup-actions / .psup-act).
  Files: jsx/host.jsx, js/main.js, css/mt-preset-support.css, html/index.html (cache-bust main.js ?v=45, mt-preset-support.css ?v=2).
  Limit: applying a preset can in rare cases touch the project (e.g. presets that add expression-control comps); the test comp is removed, anything else such a preset adds stays. Not run inside After Effects; syntax checked only.

change (Animation Presets: "Test in After Effects" removed, support check revised):
  Removed: the "Test in After Effects" button and PRE_probe (jsx/host.jsx). It applied presets to a temporary layer and was risky (After Effects could force-close).
  The earlier README entry about it is outdated; Move / Delete unsupported stay.
  Revised: a red icon comes from the effect list only, so it is a guess (a preset with a missing effect can still apply). Now:
    - an Apply that succeeds clears a red mark (also the "newer version" mark) and the preset shows green ("Works: it applied without an error in this After Effects"); remembered per
      file + size/modified time in Store key presetWorks, so Re-check and restarts keep it green; replacing the file resets it.
    - an Apply that fails with the "newer version" error marks it red again and drops the "works" memory.
    - the red tooltip now reads "Some effects are not installed: ... The preset may still apply, without them." and the note says red is a guess.
  Files: js/main.js (markWorks / worksMap, apply handler, support bar), jsx/host.jsx, html/index.html (cache-bust main.js ?v=46). Not run inside After Effects; syntax checked only.

change (Color Palette: the colour wheel looks different under Settings > Style > Material You):
  What: Glass keeps the HSV disc + thin brightness arc. Material You now draws the dial as 5 rings of rounded colour cells (6/12/18/24/30 per ring, neutral dot in the centre),
  a thick pill brightness track and a slim radial handle haloed in the card colour; the picked point is a ring with a colour core. The card becomes a tonal surface (28px radius, no colour glow)
  and the HEX row a pill, all from the --md-* palette, so it follows Theme color and Light/Dark.
  Behaviour is unchanged: same geometry and hit-testing (drag disc = hue + saturation, drag the arc / Up/Down = brightness), live Fill update, typed HEX, Reset, Save. Cells show the current brightness.
  Repaints when the style, palette or Light/Dark changes.
  Files: js/main.js (ColorWheel: isMaterial / drawMaterial / finishDraw), css/material-theme.css (section 9), html/index.html (cache-bust main.js ?v=49, material-theme.css ?v=7). Rendered in a headless browser only; not run inside After Effects.
