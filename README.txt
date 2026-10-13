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
   (On Windows, Install.bat does steps 1-2.)

DEBUG: open http://localhost:8088 in Chrome. Extra ports: 8089 (Curve settings), 8090 (Curve graph editor).

RULES FOR EDITING THE CODE
--------------------------
- manifest.xml: after any change, restart After Effects (CEP caches it). The two Settings windows have no <ScriptPath>
  on purpose (they never call ExtendScript). The Curve settings window is 380-900 px wide, 420-1400 px high.
- jsx/host.jsx is ExtendScript (ES3): no .some / .find / .includes / .filter. Close and reopen the panel after a change.
- AE 2021 runs Chromium 74. Do not use: gap on flex, aspect-ratio, min() / max() / clamp() without a fallback, the
  "inset" shorthand (write top/right/bottom/left), backdrop-filter without @supports, :focus-visible inside a selector
  list (the whole rule is dropped). js/ae2021-compat.js converts flex gap to margins and keeps aspect-ratio boxes
  square; on AE 2022+ it does nothing. style.css ends with an @supports-not-clamp fallback block.
- Animations stop ONLY through Settings > Enable animations (<html data-reduce-motion="true">). The OS "Show animations"
  setting is ignored; no @media (prefers-reduced-motion) blocks.
- A new page must load js/mt-spinbox.js and css/mt-spinbox.css to get the themed number stepper.
- Any control in a Settings window needs the same id in html/index.html and html/settings.html.
- Opt out of a themed control with data-native="true" (select, color, number) or data-no-scrub="true" (scrub).

MULTI TOOL PANEL
================

Shortcutz tab
- Speed-dial hub. Built-in cards: Expression, Quick Effect and Utility shortcuts (host.jsx SHTZ_*).
- Pin icon on Animation Presets and Code Expression cards adds that .ffx / snippet to "My Shortcuts".
- "+ Add Custom Shortcut": Name, Type (Expression / .ffx Path / JSX Script), Color. Stored in localStorage
  "mtx.shortcutz.items"; drag to reorder. The x only removes the shortcut, never the original preset or snippet.

Expression Code backup
- Snippets are mirrored to ~/Documents/Multitool_CEP_Data/saved_expressions.json (ExprFile in js/main.js,
  EXPR_FILE_* in host.jsx) and restored when localStorage is empty (fresh install).
- Settings > Expression Backups: Backup / Import. File I/O is best-effort; the panel keeps working on localStorage.

Animator Text tab (internal id "textflex")
- Builds ONE animator "TextFlex_Animator". The Expression Selector Amount holds the stagger and bounce / ease math
  (textIndex / textTotal exist only there); each checked property holds the typed value. Applying again replaces it.
- Anchor Point Alignment is set to [0,0]; Grouping follows Based On. Words / Lines detect whether AE counts line breaks.
- Choosing a preset loads it at once (no Load button). Code: TF_apply, _tfAmountExpr (host.jsx), TextFlex (main.js).

Export GIF (Tools tab)
- Options: Range, Width, Frame rate, Colors, Background, Loop, Dither, Optimize (saved in mtx.gifOptions).
- TOOLS_gifRender renders a PNG sequence through a temporary Render Queue item; js/mt-gif.js builds one shared palette,
  encodes and writes <CompName>_<YYYYMMDD-HHMMSS>.gif into the Save Frame folder. It never overwrites (name_2.gif).
- Limits: 1-bit transparency, 1000 frames max, needs Node (--enable-nodejs in the manifest).

Settings window (gear button)
- Separate window: html/settings.html (com.ogatt.multitool.settings, Modeless). The real controls stay in the hidden
  #settings-modal. js/mt-settings-remote.js (panel) replays the window's actions; js/mt-settings-window.js mirrors state;
  js/mt-settings-bus.js sends every message over the CEP event AND a localStorage mailbox.
- Sections: Appearance, Background, Motion, Idle screen, Easy Layer, Data and updates.
- Scale UI 70-150% (CSS zoom on .app via --ui-scale; mtx.uiScale). The window fades out while the slider is held.
- Controls are themed: color picker (mt-colorpicker), number stepper (mt-spinbox), dropdown menu (mt-select), sliders,
  checkboxes (mt-settings-controls.css, mt-final-controls.css). Only the OS file chooser stays native.

Style (Settings > Style)
- Glass (default, css/glass-theme.css) or Material You (css/material-theme.css, js/mt-material.js, js/mt-uitheme.js;
  key mtx.uiTheme). Delete a theme's files and its <link> to remove it.
- Material You builds a tonal palette from Theme color, has Light / Dark and its own Background color (mtx.mdBg).
  It pins data-theme to "light" or "dark" itself. The colour settings keep the Glass look.

Background
- One "Background" row: image, GIF, MP4 or WebM. Only one is active; Remove clears it.
- "Use original media colors" (mtx.bgOrig): OFF = grayscale + contrast(1.05).
- Adjust background: Opacity, Zoom 100-300%, Position X / Y; drag = move, scroll = zoom, Esc = Done (keys mtx.bgZoom,
  mtx.bgPosX, mtx.bgPosY, mtx.bgOpacity). The Settings window shows a full-window preview (js/mt-bg-preview.js);
  a session-only video cannot be previewed there.
- Ambient orbs (js/ambient-orbs.js, css/ambient-orbs.css) move to random spots and blink. Tune MOVE_MIN_S / MOVE_MAX_S.

Motion and scrolling
- Settings > Tab animation: Smooth (default), Glide, Pop, Fade, Cascade, None; Speed 50-200%; Easing Soft / Even / Spring
  (css/mt-anim-styles.css, js/mt-anim.js; keys mtx.animStyle / animSpeed / animEase).
- css/tab-motion.css + showTab() / staggerCards() in main.js: cards enter one by one; the old tab fades out in ~110 ms.
- css/mt-smooth.css + js/mt-smooth.js: sidebar highlight easing, "finished" flash on action buttons (DONE_SEL),
  elastic spring on .tool tiles.
- js/smooth-scroll.js: eased mouse-wheel scroll (TAU, STEP). Touchpad, Ctrl / Shift + wheel and the Curve tab are untouched.
- ScrollForward (main.js) passes the wheel to .main when the pointer is over a button or card.
- Left navigation: expands after 5 s of hovering (DWELL in js/sidebar-expand.js); has no tooltips;
  css/sidebar-center.css keeps the highlight centred. js/tab-wheel.js reports wheel use as "mt-wheel-activity".
- js/mt-tooltip.js: custom tooltips that replace native titles (menu tiles show their full name).
- js/mt-scrub.js: every number field can be dragged (Shift = x10, Alt = x0.1).

Idle screen
- Shows clock, date, "Time in After Effects" (live hours / minutes / seconds), Timer, Stopwatch, Alarms, Today list
  (8 tasks max) and Notes. Leave with Esc or by clicking an empty spot; mouse movement does not leave.
- Session time: heartbeat in localStorage every 30 s; a gap over 3 min (SESSION_GAP_MS) starts a new session.
- Timer: hours + minutes, Start / Pause / Resume / Reset. Sound: Chime (built-in) or Custom file (copied to
  Documents/MyMultitoolExtension/Sounds). At 00:00:00 it shows "Time is up" for 3 s, then the digits roll back.
- Daily list: ticks reset each day, tasks stay. Missed tasks go to "Unfinished" history (mtx.missed). Data is saved in
  localStorage and Documents/MyMultitoolExtension/DailyTasks.json.
- Adjust (button at the bottom right): free canvas. Drag, resize (grip), eye = show / hide, Reset layout. Widgets never
  overlap; the panel scrolls. Clock grip = text scale 50-220%. Layout key mtx.wLayout (v3, fractions of the panel width).
  The UI auto-hides after 3 / 6 / 10 s (mtx.autoHide, default 6). Code: js/mt-idle-adjust.js, css/mt-idle-adjust.css.
- Digits roll when they change (js/mt-idle-roll.js: MTRoll.set / reset). Files: css/mt-idle-time.css, mt-idle-roll.css,
  mt-idle-motion.css, mt-idle-icons.css, mt-idle-focus.css.
- Dynamic island (js/mt-island.js): black capsule at the top centre, closed = one icon (timer / stopwatch). Click = it grows into
  a card: ONE switch (left = feature in use, right = where a click goes; the feature changes only when it is clicked, never
  by itself), big digits, Start / Pause / Reset, timer H : M : S steppers (key mtx.tS = seconds). A dot beside the closed icon
  means the other feature is running. Click outside or Esc closes it. Shown whenever the panel is not idle; in idle mode only
  while the idle UI is auto-hidden and one is live. On / off: Settings > Motion > Show dynamic island (key mtx.island).
- Update card: while the island is on, "Update available / Update Now / Later / Notes", the download progress, the result and
  the "Updated to vX" confirmation are shown in the island (MTIsland.notice, called by js/mt-updater.js). The closed island
  shows an update icon with a progress ring. With the island off, the old banner (#mt-update) is used.
- Idle parking moves .app off-screen with a transform (not display:none), so the Curve iframe keeps its size.

Auto update ("Update Now", js/mt-updater.js)
- Uses fetch() + cep.fs.writeFile. No Node, zip or PowerShell for the update itself.
- Feed update.json is read from version.json "feed" (optional), raw.githubusercontent.com/<repo>/<branch>/update.json
  and cdn.jsdelivr.net at the same time; the first good answer wins. update.json may hold "remove": [...] and "ref".
- Update Now downloads every listed file, checks each SHA-256, writes only when ALL pass, and restores the old files if
  a write fails. version.json is written last. If CSXS/manifest.xml changed, restart After Effects.
- Banner on start, Settings > Updates, "Check update" in the Settings footer, Refresh Panel checks at once.
  Silent re-check every 20 min and on focus (at most every 5 min). A failed check shows its reason.
- Safe by design: HTTPS only, plain relative paths, hashes checked, no token stored. Whoever controls the repo controls
  the code in the panel, so protect the GitHub account (2FA).
- Info shows the version from version.json (fallback VERSION in main.js). manifest.xml still says 1.1.0; that is harmless.
- Publish: put Multi_Tool.zip in the work folder and run Update.bat.

CURVE TAB (NeuCurve, folder neucurve/)
======================================
- The Curve tab hosts NeuCurve in an iframe. Its Settings window (neucurve/settings.html) and Graph Editor
  (neucurve/index.html?ext=graph) are separate CEP windows. Remove the stand-alone NeuCurve extension if installed.
- Theme: the iframe gets the panel state by postMessage; separate windows get it from localStorage "mt_theme_state" and
  the event "com.multitool.theme.sync" (js/main.js Curve.sync, neucurve/nc-theme-sync.js).
- Accent = NeuCurve Settings > UI Color only (not the panel Theme color). Panel Background color re-tints the base.
- Light panel = light Curve tab (neucurve/nc-light.css under html.mt-light, plus the runtime pass in nc-light.js).
- The compiled bundle neucurve/assets/index.js is patched. After a rebuild, search for these markers and re-apply:
  globalAlpha=.06 and ze.lineWidth=7 (thumbnail glow), apply-glow-breathe, Zo( / ncOvEl / ncOvRes (overshoot),
  __ncLive / ZL() / NC_liveRun (Auto Apply), __ncGS (graph size), NcBz / NcBx / NcBy (background stores),
  NcInvTgt (Invert), __ncApplyDefault (after "Lr.subscribe"), preview-track-wrapper (ball range), navStripWidth 32 -> 0,
  the mousemove stuck-drag guard in function Q, and "inset: 0" written as top/right/bottom/left.

Layout (nc-flow.css / nc-flow.js)
- Flow look: mode tabs, rounded graph, value pill (click = copy cubic-bezier(...)), Ease Out / Ease / Ease In, APPLY,
  gear, library toolbar, preset tiles. nc-flow.js MOVES the original buttons (no clones), so bundle handlers keep working.
- Landscape = panel wider than 480 px or Settings > Layout = landscape: tabs become a pill bar above the graph, the toolbar
  moves above the preset grid.
- Icons: nc-icons.css (sizes), nc-icons-pro.js / .css (Ease icons: BY_CLASS; copy in nc-flow.js ICON).
- Colors and sizes: --fl-* at the top of nc-flow.css. Off: remove the nc-flow lines in neucurve/index.html.
- Preset tiles: nc-fix16 to nc-fix19 (rounded boxes, name outside), nc-fix22 (square tiles, Card Size slider 3-8),
  nc-fix24 (portrait auto-fit ~54 px). nc-fix21: a disabled Speed Graph icon looks OFF. nc-fix23: tool rows wrap.
  nc-fix25: .canvas-area is position:relative. Delete a file's line to undo it.
- APPLY turns gray and reads "AUTO APPLY" while Auto Apply is ON (html.nc-auto-on).

Graph
- Glow (nc-glow.js): AE's Chromium ignores CSS filter on SVG paths, so the glow is stacked strokes. Tune GLOW_PEAK,
  GLOW_SIGMA, GLOW_RADIUS, GLOW_STEPS, HALO_R, HALO_A. Fewer layers are drawn while dragging. Off: remove the script tag.
- Morph (nc-morph.js): mode switch blends the old graph into the new one (500 ms, ease-out-expo; handles glide).
  Mouse wheel over the mode tabs switches the mode. Tune DURATION / GRID. Works for .mtab and .nav-tab.
- Warm-up (nc-warm.js): cycles every mode twice behind the spinner on first open. Off: WARM = false or
  localStorage neucurve_noWarm = "1".
- Live ball (nc-ball.js): loops along the curve. Setting neucurve_liveBall (default 1); OFF brings the scrub strip back.
- Graph size: grip next to the expand icon (nc-gsize.js); Shift = keep proportions, double-click = auto. Keys neucurve_gWp,
  gHp, gWl, gHl. The self-healing fit check keeps the plot inside its box. Old landscape look: neucurve_gFit = "0".
- Floor fill (nc-gfill.js): floor and Graph Background fill the whole box + 6 px. Off: neucurve_gFill = "0".
- Overshoot: Settings > Allow Overshoot (neucurve_overshoot). OFF clamps handles to 0..1. Elastic / Bounce / Wave are
  unaffected. Rubber-band resistance is opt-in: neucurve_ovResist = "1".
- Falling effect (nc-particles.js, CONFIG at the top): Off / Particles / Rain with color and opacity (neucurve_pEffect,
  pColor, pAlpha). Falls over the preset area.
- Handles (nc-extras.js): Circle / Heart / Square / Diamond / Star / PNG-GIF, size, line thickness (keys hStyle, hSize,
  hLine, hImg). Pressing a handle shows its value (nc-handle.js).
- Background gradient (nc-extras.js + nc-grad.css): on/off, 6 presets, 2 colors, Glow, Direction, Intensity, Area
  (Whole panel / Graph only). Keys neucurve_grad*.
- Graph Background image: nc-bg.js rewrites x / y / width / height of the graph's own <image>. Adjust Background has
  Opacity, Zoom, Position X / Y and a full-window preview. "Use Original Media Colors" OFF uses the SVG filter #nc-gray-f.
- Curve Tab View (nc-view.js / .css; keys neucurve_hidePresets, hideGraph): Hide Preset Graphs or Hide Graph Settings,
  never both. With presets hidden, the preview strip docks in the graph's bottom edge.

Auto Apply (nc-live.js, host.jsx NC_liveStatus / NC_liveRun)
- With Auto Apply ON, dragging in the graph updates the selected keyframes live (Bezier: about every 70 ms; 130 ms on
  AE 2019 / 2021). The last clicked keyframes are remembered and re-selected. Works in the Curve tab and the Graph Editor.
- Bezier uses the fast path applyCubicBezierProps (selected properties only), with a fallback to the full walk.
  Elastic / Bounce / Wave / Steps / Custom re-apply 450 ms after you stop.
- A badge shows the target: green = selected, yellow = last ones, red = none. There is no polling timer (it made AE's
  cursor flicker). Auto Apply OFF sends nothing.

NeuCurve Settings window (Flow style: settings.html, nc-settings.js, nc-settings*.css)
- Tabs: Appearance, Background, Handles, Behavior, plus a Profile card. It does not load the Svelte bundle.
- Every control uses the same neucurve_ localStorage keys and the "com.neucurve.sync" event as before.
- The window resizes itself to its content (fitWindow). Dropdown lists open as floating, window-bounded menus.
- Not ported on purpose: Language, RGB Mode, home indicator, video background, Graph Size sliders, Guide tab,
  "Visit Website". Version label v2.10.0 stays.

CHANGE LOG (newest at the end; style "fixN (version): what / cause / fix")
--------------------------------------------------------------------------
Removed features: falling / shooting stars (js/falling-stars.js, js/global-bg.js), Motion Tools tab.
fix (ES3): "Function parts.some is undefined" when applying presets. Cause: ES3 has no Array.some. Fix: _arrayHasInvalidPart().
fix (wheel): wheel blocked over cards and buttons. Cause: CEF swallows wheel events over native controls. Fix: ScrollForward.
fix (Invert): spamming Invert drifted the curve. Cause: it inverted the in-between value. Fix: invert the animation target.
fix (drag): handles slammed to 0 / 1 after a lost mouse-up. Cause: stale drag. Fix: a mousemove with no button ends the drag.
fix (updater): "Could not reach GitHub" while AE is open. Cause: one dead address. Fix: try all IPv4 addresses + second source.
fix (compat): glitch in the Curve tab on AE 2021. Cause: ae2021-compat.js re-triggered its own observer. Fix: write on change only.
fix (manifest): slow Settings windows. Cause: they loaded host.jsx. Fix: no <ScriptPath> for both.
fix (idle): widgets squashed on leaving idle, stacked or jumping in Adjust, timer finish popping the UI back.
  Fix: fixed full-screen idle geometry, free solid canvas, no wake on finish.
fix46 (README): README had grown to about 1660 lines. Fix: rewrote it sentence by sentence into current-state notes
  (no removed features, no superseded text, no test reports). HAND-OFF RULES (zip name Multi_Tool.zip) kept as they were.
fix47 (island switch): new option Settings > Motion > "Show dynamic island" (key mtx.island, "0" = off, default on). Off hides the capsule
  (html.mt-island-off, MTIsland.setEnabled) and the Curve tab returns to its original layout (no --mi-reserve strip, frame fills the pane).
  Idle widgets no longer fly to the island when it is off. "Reset everything" turns it back on.
fix48 (island): Timer / Stopwatch tabs became ONE switch with rolling labels and a fade-out / rise-in view change; it no longer
  jumps to the feature that just started (a dot shows when the other one runs). Update banner moved into the island
  (update card, progress, retry, restart note, "Updated" confirmation); banner kept as fallback when the island is off.
fix49 (navigation position): new option Settings > Appearance > "Navigation position" (cards Left / Right / Top / Bottom, key mtx.navPos,
  missing = left). Logic: js/mt-navpos.js (sets <html data-nav-pos>, aria-orientation on .tabs, MTNavPos.get/set/reset), layout: css/mt-navpos.css
  (loaded after every other stylesheet; an inline script at the top of html/index.html applies the saved side before first paint).
  The cards exist in #settings-modal and in html/settings.html (key attribute data-nav-pos-opt, added to KEY_ATTRS / the selector list in
  js/mt-settings-remote.js and js/mt-settings-window.js). "Reset everything" puts it back on Left (MTNavPos.reset in main.js).
  Right: same rail on the right edge, icons stay on the right edge, names open towards the left (still after 5 s of hovering).
  Top / Bottom: the rail becomes a bar as thick as the rail was wide (--nav-bar-h = --sidebar-w). Tabs scroll sideways when the panel is narrow
  (active tab is scrolled into view), Refresh + Settings sit at the end, names never expand (sidebar-expand.js skips it) so the tab name is a tooltip
  instead (mt-tooltip.js findTarget; a rail still shows no tooltip). The dynamic island moves below a top bar (mt-island.js barDrop for the idle fly-to point).
  Highlight: main.js moveIndicator writes translate(-50%, Ypx) in a rail and translate(Xpx, -50%) + width in a bar; mt-smooth.js (spring) and mt-anim.js
  (Glide direction, moving right = "down") read the one px value. Drag-to-reorder uses X in a bar; ArrowLeft / ArrowRight switch tabs too.
  AE 2021 (Chromium 74): bar spacing is margins with !important, not flex gap, because ae2021-compat.js writes inline margins for the vertical list.

fix50 (top / bottom bar: tab names + cut tabs): two bugs in Settings > Navigation position = Top / Bottom.
  1) Tab name tooltip never showed (worst in the Bottom bar, glitchy in the Top bar) whenever UI scale was not 100%.
     Cause: ".app { zoom: var(--ui-scale) }" - older Chromium/CEF (AE 2021) returns getBoundingClientRect() already divided by the zoom, but the
     mouse x/y and the fixed tooltip use real screen pixels, so mt-tooltip.js decided "cursor is not on the tab" and dropped the tooltip.
     Fix: js/mt-tooltip.js vrect() / zoomOf() (same idea as pointerBox() in main.js) used in track(), show() and place().
  2) Tab list was cut through the middle of an icon at its left / right end (tabs overflow the bar and the list scrolled by pixels).
     Fix: js/mt-navpos.js fit() gives .tabs the exact width of N whole tabs, css/mt-navpos.css adds scroll-snap (x mandatory, snap-align start),
     no margin after the last tab, and two quiet arrows (.mt-nav-arrow, hidden when every tab fits). reveal(el) scrolls by whole tabs; main.js
     scrollTabIntoView() calls MTNavPos.reveal() in a bar. fit() runs on resize, load, nav change and a ResizeObserver on .sidebar (UI scale).
  Refresh stays on the far edge (margin-left:auto) even when every tab fits. Cache-busting: mt-tooltip.js ?v=5 (index.html + neucurve/index.html),
  mt-navpos.js/css ?v=2 (index.html, settings.html), main.js ?v=34.

fix51 (idle stopwatch Hide / Show animation): clicking Hide / Show on the idle-screen stopwatch now plays the same motion as the dynamic island's
  eye button: the digits flip in out of a blur (sw-flip = island mi-flip, 0.42s, cubic-bezier(0.05,0.7,0.1,1)) and the label pops (sw-pop = mi-pop, 0.4s
  spring). Classes is-flip / is-pop are added by js/mt-idle-focus.js (bindStopwatch > swAnim), keyframes in css/mt-idle-focus.css. The dimmed
  "masked" look also eases (opacity 0.3s, letter-spacing 0.42s). Off when Settings > Enable animations is off. mt-idle-focus.css ?v=15, .js ?v=20.

fix52 (navigation style): new option Settings > Appearance > "Navigation style" (cards Classic / Dock / Line / Square, key mtx.navStyle, missing = classic),
  works with every Navigation position. Logic: js/mt-navstyle.js (sets <html data-nav-style>, MTNavStyle.get/set/reset; an inline script at the top of
  html/index.html applies the saved style before first paint), looks: css/mt-navstyle.css (also loaded by html/settings.html for the card previews).
  The cards exist in #settings-modal and in html/settings.html (key attribute data-nav-style-opt, added to KEY_ATTRS / the selector lists in
  js/mt-settings-remote.js and js/mt-settings-window.js). "Reset everything" puts it back on Classic (MTNavStyle.reset in main.js).
  Classic = original circle highlight. Dock = the navigation floats as one glass capsule (.sidebar::before), icons grow 1x to 1.5x as the pointer nears
  (--dk written on each .sidebar .tab, zoom-aware rect maths), a dot on the screen-edge side marks the active tab, names are tooltips: findTarget() in
  mt-tooltip.js now also serves a Dock rail (right rail opens the tooltip to the left, new .is-left in mt-tooltip.css) and sidebar-expand.js never
  expands a Dock rail. Line = no circles, thin accent line on the screen-edge side of the active tab. Square = rounded-square highlights.
  Colours follow Glass and Material You (--nv-line / --nv-fg). Cache-busting: mt-navstyle.css/js ?v=1, mt-tooltip.js ?v=6, mt-tooltip.css ?v=4,
  sidebar-expand.js ?v=3, main.js ?v=35.

fix53 (freeze with Dock style): panel froze / hitched while the pointer moved over the navigation (Settings > Navigation style = Dock), worst on AE 2021.
  Cause: Dock writes --dk on every .sidebar .tab on each pointer move; the MutationObserver in js/ae2021-compat.js watches "style" on the whole
  document, so every move re-ran the full flex-gap / aspect-ratio shim (many getComputedStyle + forced layouts per frame). mt-navstyle.js also
  read the zoom of every tab through the whole ancestor chain each frame.
  Fix: ae2021-compat.js relevant() ignores style-only changes on .sidebar .tab and #tab-indicator; mt-navstyle.js grow() looks up the zoom once per
  frame and writes --dk only when the value changed (2 decimals). Measured on a forced AE 2021 fallback, 4x CPU throttle: 200 pointer moves
  19.7 s -> 4.7 s. Cache-busting: ae2021-compat.js ?v=11 (all four html files), mt-navstyle.js ?v=2.
