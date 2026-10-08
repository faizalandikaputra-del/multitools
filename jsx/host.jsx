/**
 * Multi Tool - host.jsx (ExtendScript, ES3)
 * Every public function returns a JSON string: {ok, message, data?}
 * Every AE change is wrapped in an undo group + try/catch.
 */

// ---------- Helpers ----------
function _str(s) {
  return '"' + String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"')
    .replace(/\n/g, "\\n").replace(/\r/g, "\\r").replace(/\t/g, "\\t") + '"';
}
function _json(v) {
  var t = typeof v, i, out;
  if (v === null || v === undefined) { return "null"; }
  if (t === "number" || t === "boolean") { return String(v); }
  if (t === "string") { return _str(v); }
  if (v instanceof Array) {
    out = [];
    for (i = 0; i < v.length; i++) { out.push(_json(v[i])); }
    return "[" + out.join(",") + "]";
  }
  out = [];
  for (i in v) { if (v.hasOwnProperty(i)) { out.push(_str(i) + ":" + _json(v[i])); } }
  return "{" + out.join(",") + "}";
}
function _ok(message, data) { return _json({ ok: true, message: message, data: data || null }); }
function _err(e) { return _json({ ok: false, message: (e && e.message) ? e.message : String(e) }); }
// Friendly "nothing to do" result: not an error and not thrown - the panel shows it as a plain message.
function _notice(message) { return _json({ ok: true, message: message, data: { skipped: true } }); }

function _activeComp() {
  var c = app.project.activeItem;
  if (!(c && c instanceof CompItem)) { throw new Error("Open a composition first."); }
  return c;
}

// ---------- Smart layer creation (Easy Layer, with or without its Auto Parent switch) ----------
// Adding a layer changes the comp's selection and indices, so the selection is captured FIRST.
// Returns null when nothing is selected. Otherwise:
//   top                the topmost selected layer (lowest index) - the new layer goes directly above it
//   topIn / topOut     that layer's own in / out points
//   spanIn / spanOut   the combined range of ALL selected layers (same as topIn/topOut for one layer)
//   layers             every selected layer, top to bottom
function _smartSnapshot(comp) {
  var sel = comp.selectedLayers, arr = [], i;
  if (!sel || sel.length === 0) { return null; }
  for (i = 0; i < sel.length; i++) { arr.push(sel[i]); }
  arr.sort(function (a, b) { return a.index - b.index; });

  var spanIn = arr[0].inPoint, spanOut = arr[0].outPoint;
  for (i = 1; i < arr.length; i++) {
    if (arr[i].inPoint < spanIn) { spanIn = arr[i].inPoint; }
    if (arr[i].outPoint > spanOut) { spanOut = arr[i].outPoint; }
  }
  return { top: arr[0], topIn: arr[0].inPoint, topOut: arr[0].outPoint, spanIn: spanIn, spanOut: spanOut, layers: arr };
}

// Moves newLayer directly ABOVE the snapshot's top layer and gives it the same in/out points.
// useSpan = false: match the top selected layer only (Easy Layer).
// useSpan = true : cover every selected layer (Easy Layer with Auto Parent ON - the new layer will control all of them).
// Must be called inside an undo group. Does nothing when snap is null (no selection).
function _smartPlace(newLayer, snap, useSpan) {
  if (!snap) { return; }
  newLayer.moveBefore(snap.top);

  var a = useSpan ? snap.spanIn : snap.topIn;
  var b = useSpan ? snap.spanOut : snap.topOut;
  // never pass through in > out, whichever side of the new range the layer currently sits on
  if (newLayer.outPoint <= a) { newLayer.outPoint = b; newLayer.inPoint = a; }
  else { newLayer.inPoint = a; newLayer.outPoint = b; }
}

// Creates one layer of the given type at the top of the comp with default settings.
// Returns { layer, label }. Used by Easy Layer (Auto Parent is just an option of it).
// Comp-size Solid in colorHex plus a Fill effect (ADBE Fill > ADBE Fill-0002) set to the same color.
// Must run inside an undo group. If the Fill can't be added the Solid is removed again (no half-built layer).
function _addSolidWithFill(comp, colorHex) {
  var rgb = _hexToUnit(colorHex);                    // HEX -> [r, g, b] normalized 0-1 (throws on bad HEX)
  var solid = comp.layers.addSolid(rgb, "Solid Layer", comp.width, comp.height, comp.pixelAspect, comp.duration);
  try {
    var fill = solid.property("ADBE Effect Parade").addProperty("ADBE Fill");
    var colorProp = fill.property("ADBE Fill-0002");   // Fill > Color
    if (!colorProp) { colorProp = fill.property("Color"); }
    colorProp.setValue([rgb[0], rgb[1], rgb[2], 1]);
  } catch (eFill) {
    try { solid.remove(); } catch (eRm) { /* already gone */ }
    throw new Error("Could not add the Fill effect: " + ((eFill && eFill.message) ? eFill.message : String(eFill)));
  }
  return solid;
}

function _makeLayer(comp, type, colorHex) {
  var w = comp.width, h = comp.height, pa = comp.pixelAspect, d = comp.duration;
  var layer, label;

  switch (type) {
    case "ADJ":
      layer = comp.layers.addSolid([1, 1, 1], "Adjustment Layer", w, h, pa, d);
      layer.adjustmentLayer = true;
      label = "Adjustment layer";
      break;
    case "SOL":
      if (colorHex) {
        layer = _addSolidWithFill(comp, colorHex);   // Solid + Fill effect, both in the active palette color
        label = "Solid with Fill";
      } else {
        layer = comp.layers.addSolid([0.35, 0.35, 0.42], "Solid", w, h, pa, d);
        label = "Solid";
      }
      break;
    case "TXT":
      layer = comp.layers.addText("Text");
      label = "Text layer";
      break;
    case "NUL":
      layer = comp.layers.addNull(d);
      layer.name = "Null";
      label = "Null object";
      break;
    case "SHP":
      layer = comp.layers.addShape();
      layer.name = "Shape Layer";
      label = "Shape layer";
      break;
    case "CAM":
      layer = comp.layers.addCamera("Camera", [w / 2, h / 2]);
      label = "Camera";
      break;
    case "LGT":
      layer = comp.layers.addLight("Light", [w / 2, h / 2]);
      label = "Light";
      break;
    case "BG":
      layer = comp.layers.addSolid([0.09, 0.09, 0.11], "BG", w, h, pa, d);
      layer.moveToEnd();
      label = "Background";
      break;
    case "CRV":
      layer = comp.layers.addSolid([1, 1, 1], "Curve", w, h, pa, d);
      layer.adjustmentLayer = true;
      try { layer.property("ADBE Effect Parade").addProperty("ADBE CurvesCustom"); }
      catch (eCurve) { throw new Error("Could not add the Curves effect: " + ((eCurve && eCurve.message) ? eCurve.message : String(eCurve))); }
      label = "Curve adjustment layer";
      break;
    case "CUS":
      layer = _customLayer(comp); // <- put your own logic in here
      label = "Custom layer";
      break;
    default:
      throw new Error("Unknown layer type: " + type);
  }
  return { layer: layer, label: label };
}

// ---------- Easy Layer ----------
// Called from JS as: EL_create("ADJ", 13, true) - SOL also gets a 4th arg, the active palette HEX (adds the Fill effect)
//   labelIndex  optional (0-16, AE Layer Label color; "" = none)
//   autoParent  optional boolean - the "Auto Parent" switch in the Easy Layer tab
//
// Smart placement: if a layer is selected, the new layer is moved directly above it
// (newLayer.moveBefore(selected)) and given the same in/out points. With several layers selected the topmost
// one is used. With nothing selected the layer stays at the top of the comp with default settings.
// The Background tool (BG) is exempt: it always belongs at the bottom of the stack, and is never auto-parented.
//
// Auto Parent ON (and something selected): the new layer covers the in/out range of ALL selected layers, then
// every selected layer gets `selectedLayer.parent = newLayer`. Assigning .parent keeps each child exactly where
// it is visually (AE compensates the transform values); locked layers can't be re-parented and are skipped.
// Auto Parent OFF: plain smart layer, no parenting.
function _isTrue(v) { return v === true || v === "true" || v === 1 || v === "1"; }

function EL_create(type, labelIndex, autoParent, colorHex) {
  try {
    var comp = _activeComp();
    var snap = _smartSnapshot(comp);          // selection BEFORE anything is created
    var wantParent = _isTrue(autoParent) && type !== "BG";
    var parentMode = wantParent && !!snap;
    var made, layer, above = "", pr = null;

    // Camera: AE's own "New Camera" dialog does the creating (see _EL_createCameraViaDialog).
    if (type === "CAM") { return _EL_createCameraViaDialog(comp, snap, labelIndex, parentMode); }

    app.beginUndoGroup("Easy Layer: " + type + (parentMode ? " + Auto Parent" : ""));
    try {
      made = _makeLayer(comp, type, colorHex);
      layer = made.layer;
      if (type === "NUL") { _centerInComp(layer, comp); }   // exact comp center, any resolution
      if (snap && type !== "BG") {
        _smartPlace(layer, snap, parentMode);               // parentMode: range covers every selected layer
        above = snap.top.name;
      }
      _applyLabel(layer, labelIndex);
      if (parentMode) { pr = _parentSelection(layer, snap); }
    } finally {
      app.endUndoGroup();
    }

    return _ok(_elMessage(made.label, above, pr, wantParent && !snap), { name: layer ? layer.name : "", parented: pr ? pr.parented : 0 });
  } catch (e) {
    return _err(e);
  }
}

// selectedLayer.parent = newLayer for every selected (snapshot) layer. Must run inside an undo group.
function _parentSelection(parentLayer, snap) {
  var r = { parented: 0, locked: 0, failed: 0 }, i, child;
  for (i = 0; i < snap.layers.length; i++) {
    child = snap.layers[i];
    if (child.locked) { r.locked++; continue; }
    try { child.parent = parentLayer; r.parented++; } catch (e) { r.failed++; }
  }
  return r;
}

function _elMessage(label, above, pr, noSelection) {
  var msg = label + " created" + (above ? ' above "' + above + '"' : "");
  var skipped;
  if (pr) { msg += " and set as the parent of " + pr.parented + " layer" + (pr.parented === 1 ? "" : "s"); }
  msg += ".";
  if (pr) {
    skipped = pr.locked + pr.failed;
    if (skipped) { msg += " (" + skipped + " locked or unparentable layer" + (skipped === 1 ? "" : "s") + " skipped)"; }
  }
  if (noSelection) { msg += " (No layer was selected, so nothing was parented.)"; }
  return msg;
}

// Forces Position to exactly [comp.width / 2, comp.height / 2, 0]. Works for whatever comp size is active
// (odd sizes give .5 values on purpose - that IS the true center). Handles separated X/Y dimensions too.
// Must be called inside an undo group.
function _centerInComp(layer, comp) {
  var x = comp.width / 2, y = comp.height / 2;
  var tg = layer.property("ADBE Transform Group");
  var pos = tg.property("ADBE Position");
  if (pos.dimensionsSeparated) {
    tg.property("ADBE Position_0").setValue(x);
    tg.property("ADBE Position_1").setValue(y);
    if (layer.threeDLayer) { tg.property("ADBE Position_2").setValue(0); }
  } else {
    pos.setValue([x, y, 0]);
  }
}

// ---------- Camera via the native "New Camera" dialog ----------
// Layer > New > Camera... : looked up by menu text (English AE). If the lookup fails (localized AE / renamed
// item) the numeric command ID for "New Camera" is used instead - verify 2288 in your build with
// app.findMenuCommandId("Camera...") in ExtendScript Toolkit / VS Code if the dialog ever doesn't appear.
var CAMERA_DIALOG_FALLBACK_ID = 2288;

function _cameraCommandId() {
  var id = 0;
  try { id = app.findMenuCommandId("Camera..."); } catch (e) { id = 0; }
  return (id && id > 0) ? id : CAMERA_DIALOG_FALLBACK_ID;
}

// executeCommand() is modal: the script pauses while the dialog is open, so the evalScript callback
// (and the button's loading state) only finish after OK / Cancel.
//   OK     -> AE creates and selects the camera; Smart Layer placement + label (+ Auto Parent) are then applied.
//   Cancel -> nothing is created; returns ok:true with data.cancelled = true (not an error).
// `snap` was captured BEFORE the dialog, because the new camera replaces the selection.
// Everything runs in ONE undo group, so a single Ctrl+Z removes the camera and its placement together.
function _EL_createCameraViaDialog(comp, snap, labelIndex, parentMode) {
  var before = comp.numLayers, sel, cam = null, above = "", pr = null;

  app.beginUndoGroup("Easy Layer: CAM" + (parentMode ? " + Auto Parent" : ""));
  try {
    try { comp.openInViewer(); } catch (e) { /* already in the viewer */ }

    app.executeCommand(_cameraCommandId());               // opens the native Camera Settings dialog

    if (comp.numLayers <= before) {                       // dialog cancelled
      return _ok("Camera creation cancelled.", { cancelled: true });
    }

    sel = comp.selectedLayers;                            // AE selects the new camera
    if (sel && sel.length === 1 && sel[0] instanceof CameraLayer) { cam = sel[0]; }
    if (!cam) {
      return _ok("Camera created. (Smart placement skipped - couldn't locate the new layer.)", { cancelled: false });
    }

    if (snap) {
      _smartPlace(cam, snap, parentMode);                 // directly above the selected layer, same in/out
      above = snap.top.name;
    }
    _applyLabel(cam, labelIndex);
    if (parentMode) { pr = _parentSelection(cam, snap); }
  } finally {
    app.endUndoGroup();
  }

  return _ok(_elMessage("Camera", above, pr, false), { name: cam.name, cancelled: false, parented: pr ? pr.parented : 0 });
}

// Placeholder for the CUS button - replace with anything you like.
function _customLayer(comp) {
  var l = comp.layers.addSolid([0.65, 0.55, 1], "Custom", comp.width, comp.height, comp.pixelAspect, comp.duration);
  return l;
}

// ---------- Layer Labels ----------
// AE Layer Label color indices, as shown in the Label column / Label prefs (0 = None).
var LABEL_NAMES = {
  0: "None", 1: "Red", 2: "Yellow", 3: "Aqua", 4: "Pink", 5: "Lavender",
  6: "Peach", 7: "Sea Foam", 8: "Blue", 9: "Green", 10: "Purple",
  11: "Orange", 12: "Brown", 13: "Fuchsia", 14: "Cyan", 15: "Sandstone", 16: "Dark Green"
};

// Sets layer.label if labelIndex is a valid 0-16 value. Silently does nothing otherwise.
// Must be called from inside an existing undo group.
function _applyLabel(layer, labelIndex) {
  if (!layer || labelIndex === undefined || labelIndex === null || labelIndex === "") { return; }
  var idx = parseInt(labelIndex, 10);
  if (!isNaN(idx) && idx >= 0 && idx <= 16) {
    try { layer.label = idx; } catch (e) {}
  }
}

// Called from JS as: LBL_applyToSelection(13)
// Sets the AE Layer Label color on every selected layer in the active comp.
function LBL_applyToSelection(labelIndex) {
  try {
    var comp = _activeComp();
    var idx = parseInt(labelIndex, 10);
    if (isNaN(idx) || idx < 0 || idx > 16) { throw new Error("Invalid label color."); }

    var layers = comp.selectedLayers;
    if (!layers || !layers.length) { throw new Error("Select one or more layers first."); }

    app.beginUndoGroup("Set Layer Label: " + (LABEL_NAMES[idx] || idx));
    try {
      for (var i = 0; i < layers.length; i++) { layers[i].label = idx; }
    } finally {
      app.endUndoGroup();
    }

    return _ok((LABEL_NAMES[idx] || idx) + " applied to " + layers.length + " layer" + (layers.length === 1 ? "" : "s") + ".");
  } catch (e) {
    return _err(e);
  }
}

// ---------- Quick Comp Edit ----------
var COMP_SETTINGS_FALLBACK_ID = 2150; // Composition > Composition Settings...
var QCE_MAX_DURATION_SECONDS = 10800; // 3 hours - generous safety ceiling, not a hard AE limit

function _compSettingsCommandId() {
  var id = 0;
  try { id = app.findMenuCommandId("Composition Settings..."); } catch (e) { id = 0; }
  return (id && id > 0) ? id : COMP_SETTINGS_FALLBACK_ID;
}

function _qceFrames(seconds, frameRate) { return Math.round(seconds * frameRate); }

// Calls fn() and returns its result only if it's a finite number - swallows any property-read
// error (offline/missing footage, a source type that doesn't expose the property, etc.) and
// returns fallback instead, so a single bad read never bubbles up as "undefined" to the UI.
function _qceSafeNum(fn, fallback) {
  try {
    var v = fn();
    return (typeof v === "number" && isFinite(v)) ? v : fallback;
  } catch (e) {
    return fallback;
  }
}

function _qceInfo(comp) {
  var fr = comp.frameRate;
  var startTime = _qceSafeNum(function () { return comp.displayStartTime; }, 0);
  return {
    name: comp.name,
    duration: comp.duration,
    frameRate: fr,
    durationFrames: _qceFrames(comp.duration, fr),
    startTime: startTime,
    startFrame: _qceFrames(startTime, fr),
    width: comp.width,
    height: comp.height
  };
}

function QCE_getInfo() {
  try {
    var comp = _activeComp();
    return _ok("", _qceInfo(comp));
  } catch (e) {
    return _err(e);
  }
}

// Updates the active comp's start timecode and/or duration together, from frame counts.
// Either argument may be omitted ("" / null / NaN) to leave that setting untouched, so the
// "Start Timecode" and "Duration" fields can be applied independently or together.
// Duration is clamped to at least one frame and to a generous safety ceiling; start timecode
// is clamped to zero or above - neither can hand AE a value it would reject outright.
function updateCompSettings(startFrame, durationFrames) {
  try {
    var comp = _activeComp();
    var fr = comp.frameRate;

    var sf = parseFloat(startFrame);
    var df = parseFloat(durationFrames);
    var hasStart = !isNaN(sf);
    var hasDur = !isNaN(df);
    if (!hasStart && !hasDur) { throw new Error("Enter a start timecode, a duration, or both."); }
    if (hasDur && df <= 0) { throw new Error("Duration must be greater than 0."); }

    app.beginUndoGroup("Update Composition Settings");
    try {
      if (hasStart) {
        comp.displayStartTime = Math.max(0, sf) / fr;
      }
      if (hasDur) {
        var seconds = df / fr;
        var minSeconds = 1 / fr;
        if (seconds < minSeconds) { seconds = minSeconds; }
        if (seconds > QCE_MAX_DURATION_SECONDS) { seconds = QCE_MAX_DURATION_SECONDS; }
        comp.duration = seconds;
      }
    } finally {
      app.endUndoGroup();
    }

    return _ok('"' + comp.name + '" updated.', _qceInfo(comp));
  } catch (e) {
    return _err(e);
  }
}

// ---------- Quick Comp Edit: Quick Resolution Presets ----------
var QCE_RES_MIN = 4;      // After Effects rejects a comp width/height below this
var QCE_RES_MAX = 30000;  // ...and above this

// Instantly sets the active composition's frame size (used by the aspect-ratio preset tiles in
// the panel - 16:9, 9:16, 4:5, 1:1, 4:3). Only width/height change; pixel aspect ratio, frame
// rate, duration and everything else in Composition Settings is left exactly as it was.
function setCompResolution(width, height) {
  try {
    var comp = _activeComp();

    var w = Math.round(parseFloat(width));
    var h = Math.round(parseFloat(height));
    if (!isFinite(w) || !isFinite(h)) { throw new Error("Enter a valid width and height."); }
    w = Math.max(QCE_RES_MIN, Math.min(QCE_RES_MAX, w));
    h = Math.max(QCE_RES_MIN, Math.min(QCE_RES_MAX, h));

    app.beginUndoGroup("Change Comp Resolution");
    try {
      comp.width = w;
      comp.height = h;
    } finally {
      app.endUndoGroup();
    }

    return _ok('"' + comp.name + '" resized to ' + w + " \u00d7 " + h + ".", _qceInfo(comp));
  } catch (e) {
    return _err(e);
  }
}

// executeCommand() is modal: the script pauses while the dialog is open, so the evalScript
// callback (and the button's loading state) only finish after OK / Cancel. Whatever the user
// changes in the dialog (OK) is ALREADY its own undoable AE action - AE opens and closes its
// own internal undo group for it when the dialog is applied. Wrapping that modal call in our
// own beginUndoGroup/endUndoGroup nests a second undo transaction around it, and the two don't
// close in the order AE expects, which is exactly what throws "Undo group mismatch, will
// attempt to fix." So: no manual undo group here - just let AE manage it.
function QCE_openCompSettings() {
  try {
    var comp = _activeComp();
    try { comp.openInViewer(); } catch (eViewer) { /* already in the viewer */ }

    app.executeCommand(_compSettingsCommandId());

    return _ok("Composition Settings closed.", _qceInfo(comp));
  } catch (e) {
    return _err(e);
  }
}

// Returns info about the layer used by Quick Comp Edit's "Selected Layer" mode: the topmost
// selected layer, if any. hasSelection:false is not an error - the panel shows a friendly
// placeholder for it instead of "undefined", per _qceSafeNum's guard-everything approach above.
function _qceLayerInfo(comp, layer) {
  var fr = comp.frameRate;
  var inPt = _qceSafeNum(function () { return layer.inPoint; }, 0);
  var outPt = _qceSafeNum(function () { return layer.outPoint; }, inPt);
  var dur = Math.max(0, outPt - inPt);
  return {
    hasSelection: true,
    layerName: layer.name,
    compName: comp.name,
    compWidth: comp.width,
    compHeight: comp.height,
    frameRate: fr,
    startFrame: _qceFrames(inPt, fr),
    durationFrames: _qceFrames(dur, fr)
  };
}

// Polled by the panel on a timer (see QuickCompEdit in main.js) so the Start Timecode / Duration
// fields stay in sync with whatever layer is selected, without the user having to press refresh.
function QCE_getLayerInfo() {
  try {
    var comp = _activeComp();
    var sel = comp.selectedLayers;
    if (!sel || sel.length === 0) {
      return _ok("", { hasSelection: false, compName: comp.name, compWidth: comp.width, compHeight: comp.height });
    }
    var info = _qceLayerInfo(comp, sel[0]);
    info.selectedCount = sel.length;
    info.multiple = sel.length > 1;
    return _ok("", info);
  } catch (e) {
    return _err(e);
  }
}

// Updates the topmost selected layer's in point (Start Timecode) and/or duration, from frame
// counts. Either argument may be omitted ("" / null / NaN) to leave that setting untouched -
// mirrors updateCompSettings()'s partial-update contract so the same "Apply" button and the
// per-field Enter/blur handlers in the panel can drive both.
// Moving the start point shifts the whole layer (its source timing included) by the same delta
// before re-trimming, so the layer's duration is preserved unless a new duration is given in the
// same call. Editing duration alone only moves the out point (outPoint = inPoint + newDuration),
// leaving the start where it is.
function updateSelectedLayerTiming(startFrame, durationFrames) {
  try {
    var comp = _activeComp();
    var sel = comp.selectedLayers;
    if (!sel || sel.length === 0) { throw new Error("Select a layer first."); }
    var layer = sel[0];
    var fr = comp.frameRate;

    var sf = parseFloat(startFrame);
    var df = parseFloat(durationFrames);
    var hasStart = !isNaN(sf);
    var hasDur = !isNaN(df);
    if (!hasStart && !hasDur) { throw new Error("Enter a start timecode, a duration, or both."); }
    if (hasDur && df <= 0) { throw new Error("Duration must be greater than 0."); }

    app.beginUndoGroup("Update Layer Timing");
    try {
      var curDur = Math.max(1 / fr, layer.outPoint - layer.inPoint);
      var targetDur = hasDur ? Math.max(1 / fr, Math.min(QCE_MAX_DURATION_SECONDS, df / fr)) : curDur;

      if (hasStart) {
        var newIn = Math.max(0, sf) / fr;
        var delta = newIn - layer.inPoint;
        layer.startTime += delta; // keep source timing locked to the trim, like dragging the whole clip
        layer.inPoint = newIn;
        layer.outPoint = newIn + targetDur;
      } else if (hasDur) {
        layer.outPoint = layer.inPoint + targetDur;
      }
    } finally {
      app.endUndoGroup();
    }

    var info = _qceLayerInfo(comp, layer);
    info.selectedCount = sel.length;
    info.multiple = sel.length > 1;
    return _ok('"' + layer.name + '" updated.', info);
  } catch (e) {
    return _err(e);
  }
}

// ---------- Text Animation ----------
var TA_NAME = "Bounce Text Animator";

function _num(v, d) { var n = parseFloat(v); return isNaN(n) ? d : n; }

/**
 * Amount expression for the Expression Selector.
 * Amount 100 = characters fully offset ("hidden"), 0 = resting position.
 *   IN : letters start hidden at inPoint (+ per-letter delay) and bounce to rest.
 *   OUT: the same bounce played backwards, ending fully offset at outPoint.
 *        (the last letter finishes exactly at outPoint)
 */
function _taAmountExpr(o, doIn, doOut) {
  return [
    "// ---- Settings (edit here) ----",
    "freq = " + o.freq + ";             // bounce frequency",
    "decay = " + o.decay + ";           // how fast the bounce dies out",
    "amp = " + o.amp + ";               // 1 = base bounce, 2 = stronger overshoot",
    "delay = " + o.delay + ";           // frames between letters",
    "duration = 0.05;                   // short ramp so 'amp' never causes a jump",
    "doIn = " + (doIn ? "true" : "false") + ";",
    "doOut = " + (doOut ? "true" : "false") + ";",
    "",
    "w = freq * Math.PI * 2;",
    "step = thisComp.frameDuration * delay;",
    "settle = Math.log(200) / decay;                         // time until the bounce is below 0.5%",
    "settle = Math.min(settle, (outPoint - inPoint) / 2);    // never longer than half the layer",
    "",
    "// 100 at t = 0, then a decaying cosine around 0 (elastic / bounce)",
    "function bounceAt(t) {",
    "  k = 1 + (amp - 1) * Math.min(t / duration, 1);",
    "  return 100 * k * Math.cos(t * w) / Math.exp(decay * t);",
    "}",
    "",
    "// IN: letters wait hidden, then bounce in (left-to-right stagger)",
    "inVal = 0;",
    "if (doIn) {",
    "  inStart = inPoint + (textIndex - 1) * step;",
    "  inVal = (time < inStart) ? 100 : bounceAt(time - inStart);",
    "}",
    "",
    "// OUT: mirrored bounce that finishes at outPoint (left-to-right stagger)",
    "outVal = 0;",
    "if (doOut) {",
    "  outEnd = outPoint - (textTotal - textIndex) * step;",
    "  left = outEnd - time;",
    "  if (left <= 0) { outVal = 100; }",
    "  else if (left < settle) { outVal = bounceAt(left); }",
    "}",
    "",
    "inVal + outVal;"
  ].join("\n");
}

function _taNormalize(o) {
  o = o || {};
  return {
    position: !!o.position, opacity: !!o.opacity, scale: !!o.scale, rotation: !!o.rotation,
    doIn: !!o.doIn, doOut: !!o.doOut, opposite: !!o.opposite,
    // STATIC values for the Animator's own properties (written with setValue, never as expressions)
    posX: _num(o.posX, 0), posY: _num(o.posY, 200),
    opacityValue: Math.max(0, Math.min(100, _num(o.opacityValue, 0))),
    scaleValue: Math.max(0, _num(o.scaleValue, 0)),
    rotationValue: _num(o.rotationValue, 90),
    // Expression Selector "Amount" (bounce) settings
    delay: _num(o.delay, 0.5), freq: _num(o.freq, 2.5), amp: _num(o.amp, 1),
    decay: Math.max(0.1, _num(o.decay, 8))
  };
}

/**
 * Builds ONE Text Animator with the exact hierarchy of the reference:
 *   Animator
 *   +- Selector  > Expression Selector 1 > Amount   <- the ONLY place an expression is written
 *   +- Animator properties > Position / Scale / Rotation / Opacity   <- static setValue() only
 * sign = +1 normally, -1 for the mirrored "exit on the opposite side" animator.
 */
function _taBuildAnimator(animators, name, o, doIn, doOut, sign) {
  var j;
  var animator = animators.addProperty("ADBE Text Animator");
  animator.name = name;

  // Selector: swap the default Range Selector for an Expression Selector.
  var selectors = animator.property("ADBE Text Selectors");
  selectors.addProperty("ADBE Text Expressible Selector");
  for (j = selectors.numProperties; j >= 1; j--) {
    if (selectors.property(j).matchName === "ADBE Text Selector") { selectors.property(j).remove(); }
  }
  var expSel = selectors.property("ADBE Text Expressible Selector");
  expSel.property("ADBE Text Expressible Amount").expression = _taAmountExpr(o, doIn, doOut);

  // Animator properties: static offsets only. No .expression on any of these.
  var props = animator.property("ADBE Text Animator Properties");
  if (o.position) { props.addProperty("ADBE Text Position 3D").setValue([o.posX * sign, o.posY * sign, 0]); }
  if (o.scale)    { props.addProperty("ADBE Text Scale 3D").setValue([o.scaleValue, o.scaleValue, o.scaleValue]); }
  if (o.rotation) { props.addProperty("ADBE Text Rotation").setValue(o.rotationValue * sign); }
  if (o.opacity)  { props.addProperty("ADBE Text Opacity").setValue(o.opacityValue); }
  return animator;
}

// Called from JS as: TXT_apply({position:true, posX:0, posY:200, opacityValue:0, doIn:true, ...})
function TXT_apply(opts) {
  var undoOpen = false;
  try {
    var comp = _activeComp();
    var o = _taNormalize(opts);
    if (!(o.position || o.opacity || o.scale || o.rotation)) { throw new Error("Choose at least one property to animate."); }
    if (!o.doIn && !o.doOut) { throw new Error("Enable In animation, Out animation, or both."); }

    var layers = comp.selectedLayers, targets = [], i, j;
    for (i = 0; i < layers.length; i++) { if (layers[i] instanceof TextLayer) { targets.push(layers[i]); } }
    if (targets.length === 0) { throw new Error("Select a text layer first."); }

    app.beginUndoGroup("Apply Text Animation");
    undoOpen = true;
    for (i = 0; i < targets.length; i++) {
      var animators = targets[i].property("ADBE Text Properties").property("ADBE Text Animators");

      // replace a previous run (incl. its "... Out" twin) instead of stacking animators
      for (j = animators.numProperties; j >= 1; j--) {
        if (String(animators.property(j).name).indexOf(TA_NAME) === 0) { animators.property(j).remove(); }
      }

      if (o.opposite && o.doIn && o.doOut) {
        // Different offsets for In and Out need two animators: "In" (amount plays the In bounce) and a
        // mirrored "Out" twin (negated position/rotation, amount plays the Out bounce). Still no expressions
        // outside the Expression Selector Amount.
        _taBuildAnimator(animators, TA_NAME, o, true, false, 1);
        _taBuildAnimator(animators, TA_NAME + " Out", o, false, true, -1);
      } else {
        _taBuildAnimator(animators, TA_NAME, o, o.doIn, o.doOut, 1);
      }
    }
    app.endUndoGroup();
    undoOpen = false;

    return _ok("Text animation applied to " + targets.length + " layer" + (targets.length === 1 ? "." : "s."));
  } catch (e) {
    return _err(e);
  } finally {
    if (undoOpen) { try { app.endUndoGroup(); } catch (eUndo) { /* nothing left to close */ } }
  }
}

// ============================================================================
// ---------- TextFlex: per-char/word/line bounce-or-ease reveal ----------
// ============================================================================
// Called from JS as: TF_apply(cfg) - see js/main.js TextFlex.render()/collect() for the exact shape:
//   {
//     basedOn: "characters"|"words"|"lines", direction: "ltr"|"rtl"|"centerOut"|"endsToCenter"|"random",
//     frequency, decay, duration, delay: numbers,
//     mode: "in"|"inout"|"out", markers: bool, threeD: bool, style: "overshoot"|"ease",
//     props: { position:{on,v:{x,y,z}}, anchor:{..}, rotation:{..}, scale:{on,v:{x,y}}, skew:{on,v:{angle,axis}},
//              tracking:{on,v:{value}}, blur:{on,v:{value}}, opacity:{on,v:{value}} }
//   }
//
// Builds ONE Text Animator named "TextFlex_Animator" per selected text layer.
// IMPORTANT (After Effects limitation): textIndex / textTotal exist ONLY inside an Expression Selector's
// Amount expression - an expression written directly on an animator property (Position, Opacity, ...)
// throws "ReferenceError: textIndex/textTotal is not defined". So the work is split:
//   - Expression Selector > Amount: ONE expression does the per-character/word/line stagger (Direction,
//     Delay), In / Out / In-Out, Markers and the bounce (Overshoot) or smooth (Ease) curve. It returns
//     100 = "fully in the typed start state" and settles to 0 = "at rest".
//   - Animator Properties: every checked property gets the exact value typed in the UI (static). AE
//     multiplies each by the selector Amount, so Position Y 30 slides/bounces in from 30 and Opacity 0
//     fades in from 0 - same result as expressions on the properties, without the scope problem.
//   - Text > More Options: Anchor Point Alignment [0,0] with Grouping matching Based On.
// Re-applying replaces this layer's previous TextFlex animator instead of stacking a new one.
// The whole batch (every selected text layer) is one undo step: "TextFlex Animation".

var TF_ANIMATOR_NAME = "TextFlex_Animator";
var TF_DIR_CODE = { ltr: 1, rtl: 2, centerOut: 3, endsToCenter: 4, random: 5 };
var TF_BASEDON_CODE = { characters: 1, words: 2, lines: 3 };

// Animator-property match names this tab can turn on, and how many axis values each expects.
var TF_PROP_SPECS = {
  anchor:   [{ match: "ADBE Text Anchor Point 3D", axes: ["x", "y", "z"] }],
  position: [{ match: "ADBE Text Position 3D",      axes: ["x", "y", "z"] }],
  scale:    [{ match: "ADBE Text Scale 3D",          axes: ["x", "y"], fixedZ: 100 }],
  skew:     [{ match: "ADBE Text Skew",              axes: ["angle"] }, { match: "ADBE Text Skew Axis", axes: ["axis"] }],
  rotation: [{ match: "ADBE Text Rotation",          axes: ["z"] }, { match: "ADBE Text Rotation X", axes: ["x"] }, { match: "ADBE Text Rotation Y", axes: ["y"] }],
  tracking: [{ match: "ADBE Text Tracking Amount",   axes: ["value"] }],
  blur:     [{ match: "ADBE Text Blur",              axes: ["value", "value"] }],   // same number on both axes of the point
  opacity:  [{ match: "ADBE Text Opacity",           axes: ["value"] }]
};

function _tfNum(v, fallback) { v = parseFloat(v); return isFinite(v) ? v : fallback; }

// Builds the Expression Selector "Amount" expression as a plain string, baking every UI setting in
// as a literal (consistent with this file's existing _taAmountExpr convention) rather than reading
// controls at eval time - simpler, and it's re-generated fresh on every Animate click anyway.
//
// Based on Words/Lines: an Expression Selector's expression context only ever gives textIndex/
// textTotal PER CHARACTER (there is no "Based On" on an Expression Selector the way a native Range
// Selector has one) - so for Words/Lines this re-derives the grouping itself from the layer's own
// source text (splitting on spaces/tabs for words, line breaks for lines) and uses that group's own
// index/count as n/N. Runs once per character per frame; fine for normal titles/lower-thirds, but a
// very long paragraph will re-scan its whole text that many times every frame.
function _tfAmountExpr(cfg) {
  var basedOn = TF_BASEDON_CODE[cfg.basedOn] || 1;
  var dir = TF_DIR_CODE[cfg.direction] || 1;
  var freq = _tfNum(cfg.frequency, 4);
  var decay = Math.max(0.01, _tfNum(cfg.decay, 5));
  var duration = Math.max(0.01, _tfNum(cfg.duration, 2));
  var delayFrames = _tfNum(cfg.delay, 2);
  var markers = !!cfg.markers;
  var doIn = cfg.mode !== "out";
  var doOut = cfg.mode !== "in";
  var overshoot = cfg.style !== "ease";

  var L = [];
  L.push("// TextFlex amount - generated by the panel. Re-apply from the TextFlex tab instead of hand-editing.");
  L.push("var basedOn = " + basedOn + ";   // 1 Characters, 2 Words, 3 Lines");
  L.push("var n = textIndex, N = textTotal;");
  L.push("if (basedOn != 1) {");
  L.push("  var src = \"\";");
  L.push("  try { src = String(thisLayer.text.sourceText); } catch (eSrc) { src = \"\"; }");
  L.push("  if (typeof src !== \"string\") { src = \"\"; }");
  L.push("  // AE may or may not count line-break characters in textIndex/textTotal: detect it from textTotal.");
  L.push("  var skipBrk = (textTotal != src.length);");
  L.push("  var g = 0, prevBoundary = true, myGroup = 0, idx = 0;");
  L.push("  for (var c = 1; c <= src.length; c++) {");
  L.push("    var ch = src.charAt(c - 1);");
  L.push("    var isBrk = (ch == \"\\r\" || ch == \"\\n\");");
  L.push("    if (isBrk && skipBrk) { prevBoundary = true; continue; }");
  L.push("    idx++;");
  L.push("    var isBoundary = (basedOn == 2) ? (isBrk || ch == \" \" || ch == \"\\t\") : isBrk;");
  L.push("    if (isBoundary) { prevBoundary = true; }");
  L.push("    else { if (prevBoundary) { g++; } prevBoundary = false; }");
  L.push("    if (idx == textIndex) { myGroup = Math.max(g, 1); }");
  L.push("  }");
  L.push("  if (g > 0) { n = (myGroup > 0) ? myGroup : 1; N = g; }");
  L.push("}");
  L.push("var mid = (N + 1) / 2;");
  L.push("var dir = " + dir + ";   // 1 LTR, 2 RTL, 3 Center Out, 4 Ends to Center, 5 Random");
  L.push("var order;");
  L.push("if (dir == 1) { order = n - 1; }");
  L.push("else if (dir == 2) { order = N - n; }");
  L.push("else if (dir == 3) { order = Math.abs(n - mid); }");
  L.push("else if (dir == 4) { order = (N - 1) / 2 - Math.abs(n - mid); }");
  L.push("else { seedRandom(Math.floor(n) + 1, true); order = Math.floor(random(0, N)); }");
  L.push("var step = thisComp.frameDuration * " + delayFrames + ";");
  L.push("var dur = " + duration + ";");
  L.push("function curveAt(t) {");
  if (overshoot) {
    L.push("  var w = " + freq + " * Math.PI * 2, decay = " + decay + ", amp = 1.7, rampT = 0.08;");
    L.push("  var k = 1 + (amp - 1) * Math.min(t / rampT, 1);");
    L.push("  return 100 * k * Math.cos(t * w) / Math.exp(decay * t);");
  } else {
    L.push("  var p = Math.min(Math.max(t / dur, 0), 1);");
    L.push("  return 100 * Math.pow(1 - p, 2);"); // smooth ease-out, no ringing
  }
  L.push("}");
  L.push("var inAnchor = inPoint, outAnchor = outPoint;");
  if (markers) {
    L.push("try { if (marker.numKeys > 0) { inAnchor = marker.key(1).time; } } catch (eM1) {}");
    L.push("try { if (marker.numKeys > 1) { outAnchor = marker.key(marker.numKeys).time; } } catch (eM2) {}");
  }
  L.push("var inVal = 0;");
  if (doIn) {
    L.push("var inStart = inAnchor + order * step;");
    L.push("inVal = (time < inStart) ? 100 : curveAt(time - inStart);");
  }
  L.push("var outVal = 0;");
  if (doOut) {
    L.push("var outEnd = outAnchor - (N - 1 - order) * step;");
    L.push("var left = outEnd - time;");
    L.push("if (left <= 0) { outVal = 100; }");
    L.push("else if (left < dur + 0.08) { outVal = curveAt(left); }");
  }
  L.push("inVal + outVal;");
  return L.join("\n");
}

// Removes a previous "TextFlex" animator from this layer, if any, so re-applying never stacks.
function _tfRemoveExisting(layer) {
  var animators = layer.property("ADBE Text Properties").property("ADBE Text Animators");
  for (var i = animators.numProperties; i >= 1; i--) {
    var nmOld = animators.property(i).name; if (nmOld === TF_ANIMATOR_NAME || nmOld === "TextFlex") { animators.property(i).remove(); }
  }
}

// Turns on Per-Character 3D via AE's own menu command (so this never has to guess at an internal
// flag). The command's exact capitalization has changed across AE versions, so a short list of
// known spellings is tried in order; the first one findMenuCommandId recognizes wins. No-op if the
// layer already reports 3D, and silently skipped (never fails the whole apply) if none match -
// AE's own 3D Layer switch still works fine without this, just without true per-character depth.
var TF_PERCHAR3D_NAMES = ["Enable Per-character 3D", "Enable Per-Character 3D", "Enable per-character 3D"];
function _tfEnablePerChar3D(comp, layer) {
  if (layer.threeDLayer) { return; }
  var cmdId = 0, n;
  for (n = 0; n < TF_PERCHAR3D_NAMES.length && !cmdId; n++) {
    try { cmdId = app.findMenuCommandId(TF_PERCHAR3D_NAMES[n]); } catch (e1) { cmdId = 0; }
  }
  if (!cmdId) { return; } // command not found in this AE version/language - skip quietly, don't fail the whole apply
  var prevSel = [], i;
  for (i = 1; i <= comp.numLayers; i++) { if (comp.layer(i).selected) { prevSel.push(comp.layer(i)); } }
  for (i = 1; i <= comp.numLayers; i++) { comp.layer(i).selected = (comp.layer(i) === layer); }
  try { app.executeCommand(cmdId); } catch (e2) { /* best-effort */ }
  for (i = 1; i <= comp.numLayers; i++) { comp.layer(i).selected = false; }
  for (i = 0; i < prevSel.length; i++) { try { prevSel[i].selected = true; } catch (e3) {} }
}

// Adds every checked-on property from cfg.props onto the animator's "Animator Properties" group,
// with the exact static value typed in the UI (never an expression - only the Selector Amount above
// is expression-driven).
function _tfAddProperties(animator, props) {
  var group = animator.property("ADBE Text Animator Properties");
  var keys = ["anchor", "position", "scale", "skew", "rotation", "tracking", "blur", "opacity"];
  var added = 0;
  for (var k = 0; k < keys.length; k++) {
    var key = keys[k], p = props[key];
    if (!p || !p.on) { continue; }
    var specs = TF_PROP_SPECS[key];
    for (var s = 0; s < specs.length; s++) {
      var spec = specs[s];
      try {
        var prop = group.addProperty(spec.match);
        if (spec.axes.length === 1) {
          prop.setValue(_tfNum((p.v || {})[spec.axes[0]], 0));
        } else {
          var vals = [];
          for (var a = 0; a < spec.axes.length; a++) { vals.push(_tfNum((p.v || {})[spec.axes[a]], 0)); }
          if (spec.fixedZ !== undefined) { vals.push(spec.fixedZ); }
          prop.setValue(vals);
        }
        added++;
      } catch (eAdd) { /* that sub-property isn't valid on this AE version - skip it, keep going */ }
    }
  }
  return added;
}

// Text > More Options: Anchor Point Alignment -> centre ([0,0]) and Grouping -> same unit as Based On.
var TF_BASEDON_GROUP = { characters: 1, words: 2, lines: 3 };
function _tfSetAnchorAlignment(layer, basedOn) {
  try {
    var more = layer.property("ADBE Text Properties").property("ADBE Text More Options");
    try { more.property("ADBE Text Anchor Point Option").setValue(TF_BASEDON_GROUP[basedOn] || 1); } catch (e1) {}
    try { more.property("ADBE Text Anchor Point Align").setValue([0, 0]); } catch (e2) {}
  } catch (e0) { /* More Options not reachable on this version - the animation still works */ }
}

function TF_apply(cfg) {
  var undoOpen = false;
  try {
    var comp = _activeComp();
    cfg = cfg || {};
    cfg.props = cfg.props || {};

    var hasProp = false;
    for (var pk in cfg.props) { if (cfg.props.hasOwnProperty(pk) && cfg.props[pk] && cfg.props[pk].on) { hasProp = true; break; } }
    if (!hasProp) { throw new Error("Check at least one property (Position, Opacity, ...) to animate."); }

    var layers = comp.selectedLayers, targets = [], i;
    for (i = 0; i < layers.length; i++) { if (layers[i] instanceof TextLayer) { targets.push(layers[i]); } }
    if (targets.length === 0) { throw new Error("Select a text layer first."); }

    var expr = _tfAmountExpr(cfg);
    var done = 0, propsAdded = 0;

    app.beginUndoGroup("Animator Text");
    undoOpen = true;
    for (i = 0; i < targets.length; i++) {
      var layer = targets[i];
      _tfRemoveExisting(layer);
      if (cfg.threeD) { _tfEnablePerChar3D(comp, layer); }
      _tfSetAnchorAlignment(layer, cfg.basedOn || "characters");

      var animators = layer.property("ADBE Text Properties").property("ADBE Text Animators");
      var animator = animators.addProperty("ADBE Text Animator");
      animator.name = TF_ANIMATOR_NAME;

      var selectors = animator.property("ADBE Text Selectors");
      selectors.addProperty("ADBE Text Expressible Selector");
      for (var j = selectors.numProperties; j >= 1; j--) {
        if (selectors.property(j).matchName === "ADBE Text Selector") { selectors.property(j).remove(); }
      }
      var expSel = selectors.property("ADBE Text Expressible Selector");
      expSel.property("ADBE Text Expressible Amount").expression = expr;

      propsAdded += _tfAddProperties(animator, cfg.props);
      done++;
    }
    app.endUndoGroup();
    undoOpen = false;

    if (!propsAdded) {
      return _ok("Applied to " + done + " layer" + (done === 1 ? "" : "s") + ", but no animator property could be added - check the Rotation/Skew/Blur support in this After Effects version.");
    }
    return _ok("Animator Text applied to " + done + " text layer" + (done === 1 ? "." : "s."));
  } catch (e) {
    return _err(e);
  } finally {
    if (undoOpen) { try { app.endUndoGroup(); } catch (eUndo) { /* nothing left to close */ } }
  }
}



// The panel keeps the folder path in localStorage and passes it to every call, so nothing is stored here.
// Called from JS as: PRE_selectFolder(), PRE_list(path), PRE_apply(path, fileName), PRE_delete(path, fileName),
//                    PRE_saveSelection(path)
// Every call that touches a preset takes the FILE NAME (never a full path) and looks it up inside the chosen
// folder, so a bad argument can never reach a file outside that folder.
var PRE_SAVE_COMMAND_FALLBACK_ID = 3075;    // Animation > Save Animation Preset...

function _preDecode(s) { try { return decodeURIComponent(s); } catch (e) { return s; } }

function _preFolder(path) {
  if (!path) { throw new Error("No preset folder selected."); }
  var f = new Folder(path);
  if (!f.exists) { throw new Error("Preset folder not found. Select it again."); }
  return f;
}

// .ffx files only (any letter case), no hidden / resource-fork files.
function _preFiles(folder) {
  var found = folder.getFiles(function (f) {
    return (f instanceof File) && /\.ffx$/i.test(f.name) && f.name.charAt(0) !== ".";
  });
  return found || [];
}

// -> [{ file: "Fade In.ffx", name: "Fade In" }, ...] sorted by name. (File.name is URI-encoded, hence decode.)
// One folder, no descending into subfolders - _preList below calls this once per folder (root + each
// immediate subfolder) to build the categorized/uncategorized split.
function _preListFlat(folder) {
  var files = _preFiles(folder), out = [], i, fn;
  for (i = 0; i < files.length; i++) {
    fn = _preDecode(files[i].name);
    out.push({ file: fn, name: fn.replace(/\.ffx$/i, "") });
  }
  out.sort(function (a, b) {
    var x = a.name.toLowerCase(), y = b.name.toLowerCase();
    return x < y ? -1 : (x > y ? 1 : 0);
  });
  return out;
}

// Immediate subfolders only (no dot-folders), sorted by name. One level deep - a preset folder nested
// two levels down is invisible to the panel, same as an .ffx file would be; this matches how people
// actually organize an AE preset folder (a flat pile, or one layer of category folders, never more).
function _preSubfolders(folder) {
  var found = folder.getFiles(function (f) {
    return (f instanceof Folder) && f.name.charAt(0) !== ".";
  }) || [];
  found.sort(function (a, b) {
    var x = _preDecode(a.name).toLowerCase(), y = _preDecode(b.name).toLowerCase();
    return x < y ? -1 : (x > y ? 1 : 0);
  });
  return found;
}

// { uncategorized: [{file,name}, ...],                      <- .ffx files directly in `folder`
//   categorized:   [{ folderName, files: [{file,name}, ...] }, ...] }   <- one entry per subfolder that
//                                                                          actually has .ffx files in it
// `file` for a categorized entry is "<folderName>/<fileName>.ffx" - the same string PRE_apply/PRE_delete
// take back, so the panel never needs to track path and folder separately.
function _preList(folder) {
  var subs = _preSubfolders(folder), categorized = [], i, j, sub, subName, flat, items;
  for (i = 0; i < subs.length; i++) {
    sub = subs[i];
    subName = _preDecode(sub.name);
    // ES3 engine: no Array.prototype.map here, so build `items` with a plain loop instead.
    flat = _preListFlat(sub);
    items = [];
    for (j = 0; j < flat.length; j++) { items.push({ file: subName + "/" + flat[j].file, name: flat[j].name }); }
    if (items.length) { categorized.push({ folderName: subName, files: items }); }
  }
  return { uncategorized: _preListFlat(folder), categorized: categorized };
}

// ES3 engine: no Array.prototype.some here - plain for-loop stand-in used by _preFind below to
// reject a path segment that's empty, ".", or "..".
function _arrayHasInvalidPart(arr) {
  var i;
  if (!arr || !arr.length) { return false; }
  for (i = 0; i < arr.length; i++) {
    if (!arr[i] || arr[i] === "." || arr[i] === "..") { return true; }
  }
  return false;
}

// Accepts either "Fade In.ffx" (root) or "Text Animations/Fade In.ffx" (one subfolder, exactly as
// PRE_list/_preList hands it back). Rejects anything else - no "..", no leading slash, no second slash -
// so a bad argument still can never resolve outside the chosen root folder.
function _preFind(folder, fileName) {
  var parts, subName, plainName, targetFolder, files, i;
  if (typeof fileName !== "string" || !fileName || !/\.ffx$/i.test(fileName)) {
    throw new Error("Invalid preset file.");
  }
  parts = fileName.split("/");
  if (parts.length > 2 || _arrayHasInvalidPart(parts)) {
    throw new Error("Invalid preset file.");
  }
  targetFolder = folder;
  plainName = parts[parts.length - 1];
  if (parts.length === 2) {
    subName = parts[0];
    targetFolder = new Folder(folder.fsName + "/" + subName);
    if (!targetFolder.exists) { throw new Error("That preset's subfolder is no longer there. Refresh the list."); }
  }
  files = _preFiles(targetFolder);
  for (i = 0; i < files.length; i++) {
    if (_preDecode(files[i].name) === plainName) { return files[i]; }
  }
  throw new Error("That preset is no longer in the folder. Refresh the list.");
}

// "Text Animations/Fade In.ffx" -> "Fade In" (drop any subfolder prefix, drop the extension) - for
// toast messages only, so applying/deleting a categorized preset doesn't show its folder name back.
function _preDisplayName(fileName) {
  var parts = fileName.split("/");
  return parts[parts.length - 1].replace(/\.ffx$/i, "");
}

// file name -> modified time (ms): lets us tell what the Save dialog wrote (new file OR overwritten file).
function _preSnapshot(folder) {
  var files = _preFiles(folder), map = {}, i, t;
  for (i = 0; i < files.length; i++) {
    t = 0;
    try { t = files[i].modified.getTime(); } catch (e) { t = 0; }
    map[_preDecode(files[i].name)] = t;
  }
  return map;
}

function _preChanged(folder, before) {
  var after = _preSnapshot(folder), out = [], k;
  for (k in after) {
    if (after.hasOwnProperty(k) && (!before.hasOwnProperty(k) || before[k] !== after[k])) { out.push(k.replace(/\.ffx$/i, "")); }
  }
  return out;
}

// Folder.selectDialog() -> the panel stores data.path in localStorage. Returns the scan result in the same call.
function PRE_selectFolder() {
  try {
    var f = Folder.selectDialog("Select Preset Folder");
    if (!f) { return _ok("Folder selection cancelled.", { cancelled: true }); }
    return _ok("Preset folder set.", { cancelled: false, path: f.fsName, presets: _preList(f) });
  } catch (e) {
    return _err(e);
  }
}

function PRE_list(path) {
  try {
    return _ok("OK", { presets: _preList(_preFolder(path)) });
  } catch (e) {
    return _err(e);
  }
}

// layer.applyPreset(new File(...)). NOTE: AE applies the preset to ALL selected layers of the comp - the layer it
// is called on only tells AE which comp to use - and with NOTHING selected it silently creates a new solid.
// So: require a selection, and call it exactly once.
function PRE_apply(path, fileName) {
  try {
    var folder = _preFolder(path);
    var file = _preFind(folder, fileName);
    var comp = _activeComp();
    var sel = comp.selectedLayers;
    if (!sel || sel.length === 0) { throw new Error("Select a layer first."); }

    app.beginUndoGroup("Apply Preset: " + _preDisplayName(fileName));
    try {
      sel[0].applyPreset(file);
    } finally {
      app.endUndoGroup();
    }
    return _ok('Applied "' + _preDisplayName(fileName) + '" to ' + sel.length + " layer" + (sel.length === 1 ? "" : "s") + ".");
  } catch (e) {
    return _err(e);
  }
}

// File.remove() deletes for good (no Recycle Bin / Trash) - the panel asks for a second click first.
function PRE_delete(path, fileName) {
  try {
    var folder = _preFolder(path);
    var file = _preFind(folder, fileName);
    if (!file.remove()) { throw new Error("Couldn't delete the file (it may be read-only or in use)."); }
    return _ok('Deleted "' + _preDisplayName(fileName) + '".', { presets: _preList(folder) });
  } catch (e) {
    return _err(e);
  }
}

// After Effects has NO scripting call that writes an .ffx file. The only route is its own menu command
// (Animation > Save Animation Preset...), which opens AE's Save dialog: the user names the file there, and the
// dialog starts in the last folder used (which is the preset folder after applying a preset from it, or after
// saving into it once). Afterwards we re-scan the folder and report what was written.
//
// What gets saved is what is selected in the timeline. If no properties are selected we select, on the first
// selected layer: all effects, text animators, and transform properties that have keyframes or expressions -
// and deselect them again once the dialog closes.
function _savePresetCommandId() {
  var names = ["Save Animation Preset...", "Save Animation Preset\u2026"], id = 0, i;
  for (i = 0; i < names.length && !id; i++) {
    try { id = app.findMenuCommandId(names[i]); } catch (e) { id = 0; }
  }
  return (id && id > 0) ? id : PRE_SAVE_COMMAND_FALLBACK_ID;
}

function _preHasSelectedProperties(comp) {
  var sp = comp.selectedProperties, i;
  for (i = 0; i < sp.length; i++) {
    if (sp[i] && typeof sp[i].propertyType !== "undefined" && sp[i].propertyDepth > 0) { return true; }
  }
  return false;
}

function _preSelectAnimatedProps(layer) {
  var picked = [], i, grp, p;
  function pick(prop) { try { prop.selected = true; picked.push(prop); } catch (e) { /* not selectable */ } }

  grp = layer.property("ADBE Effect Parade");
  if (grp) { for (i = 1; i <= grp.numProperties; i++) { pick(grp.property(i)); } }

  grp = layer.property("ADBE Text Properties");
  grp = grp ? grp.property("ADBE Text Animators") : null;
  if (grp) { for (i = 1; i <= grp.numProperties; i++) { pick(grp.property(i)); } }

  grp = layer.property("ADBE Transform Group");
  if (grp) {
    for (i = 1; i <= grp.numProperties; i++) {
      p = grp.property(i);
      try { if (p.numKeys > 0 || p.expressionEnabled) { pick(p); } } catch (e2) { /* group, not a property */ }
    }
  }
  return picked;
}

function PRE_saveSelection(path) {
  var picked = [], i;
  try {
    var folder = _preFolder(path);
    var comp = _activeComp();
    var sel = comp.selectedLayers;
    if (!sel || sel.length === 0) { throw new Error("Select the layer you want to save as a preset."); }

    if (!_preHasSelectedProperties(comp)) {
      picked = _preSelectAnimatedProps(sel[0]);
      if (picked.length === 0) {
        throw new Error("Nothing to save. Select effects or properties in the timeline, or pick a layer that has effects, keyframes or expressions.");
      }
    }

    var before = _preSnapshot(folder);
    try { comp.openInViewer(); } catch (e) { /* already in the viewer */ }
    app.executeCommand(_savePresetCommandId());           // AE's Save Animation Preset dialog (modal)

    var added = _preChanged(folder, before);
    var data = { added: added, presets: _preList(folder) };
    if (added.length) {
      return _ok('Saved "' + added.join('", "') + '" to the preset folder.', data);
    }
    return _ok("No new preset in this folder. Save inside the preset folder (the dialog opens in the last folder you used).", data);
  } catch (e) {
    return _err(e);
  } finally {
    for (i = 0; i < picked.length; i++) { try { picked[i].selected = false; } catch (e3) { /* ignore */ } }
  }
}

// ---------- Anchor Point & Align ----------
// Called from JS as: AA_setAnchor("tl") ... AA_setAnchor("br"), AA_align("left" | "hcenter" | "right" | "top" | "vcenter" | "bottom")
//
// Works the same for every visual layer (Solid, Footage, Pre-comp, Null, Text, Shape...): the
// bounds always come from layer.sourceRectAtTime(t, false) - {left, top, width, height} in
// layer space - never from source.width/height. For text this rect is relative to the text's own
// origin (top is usually negative), which is exactly the space Anchor Point lives in.
//
// Math: a layer maps a layer-space point X to its parent space as
//     P = position + R(rotation) * S(scale) * (X - anchorPoint)          (= matrix M below)
// * Anchor: moving the anchor from A to B without moving the layer needs
//       newPosition = position + R*S*(B - A)        (in parent space, so parents don't matter)
// * Align:  the 4 rect corners are pushed through M and every parent's M up to the comp, so
//   rotation, flips, non-uniform scale and parenting are all included. The needed comp-space
//   shift is then converted back into the layer's parent space before touching Position.
//
// Handled: Separate Dimensions (X/Y Position), keyframed Position/Anchor (a key is written at the
// playhead), parented layers, Z rotation, negative scale, playhead outside the layer's in/out range.
// Skipped WITH a reason shown in the panel: expressions on Position/Anchor, locked layers, empty
// bounds, 3D layers with X/Y rotation or Orientation, non-visual layers (camera, light, audio).

var AA_ANCHOR_FRACTIONS = {
  tl: [0, 0],   tc: [0.5, 0],   tr: [1, 0],
  ml: [0, 0.5], mm: [0.5, 0.5], mr: [1, 0.5],
  bl: [0, 1],   bc: [0.5, 1],   br: [1, 1]
};
var AA_ALIGN_MODES = { left: 1, hcenter: 1, right: 1, top: 1, vcenter: 1, bottom: 1 };
var AA_IDENTITY = [1, 0, 0, 1, 0, 0];

function _aaIsSpatialLayer(layer) {
  // Anchor/align only make sense for layers with a visual bounding box.
  //
  // NOTE: this used to be `(layer instanceof AVLayer) && ...`. TextLayer IS-A AVLayer in the
  // documented object model, but on a number of AE/ExtendScript builds "layer instanceof AVLayer"
  // is NOT reliably true for TextLayer instances (a known ExtendScript host-object quirk) - which
  // made every Text layer fail this check and get reported as "not a visual layer", even though
  // sourceRectAtTime()/the transform math below works fine on them. Duck-typing on the actual
  // capability we need (a real bounding box + video content) sidesteps that instanceof gap
  // entirely, and also naturally covers Shape layers, which have no dedicated ShapeLayer class to
  // instanceof-check against in the first place.
  if (!layer) { return false; }
  if (layer instanceof CameraLayer || layer instanceof LightLayer) { return false; }
  return (typeof layer.sourceRectAtTime === "function") && (layer.hasVideo !== false);
}

// Bounds in layer space. The playhead is clamped into the layer's active range so text/shape
// layers that don't exist at the current time still return real bounds.
function _aaSourceRect(layer, comp) {
  var t = comp.time;
  if (t < layer.inPoint) { t = layer.inPoint; }
  else if (t >= layer.outPoint) { t = Math.max(layer.inPoint, layer.outPoint - comp.frameDuration); }
  return layer.sourceRectAtTime(t, false);
}

function _aaRectOrThrow(layer, comp) {
  var r = _aaSourceRect(layer, comp);
  if (!r || (r.width === 0 && r.height === 0)) { throw new Error("empty bounds (no content)"); }
  return r;
}

// ----- transform property access (matchNames work for every layer type) -----
function _aaProp(layer, matchName) {
  var tg = layer.property("ADBE Transform Group");
  return tg ? tg.property(matchName) : null;
}

// Position is either one property or, with Separate Dimensions, X/Y properties.
function _aaPosProps(layer) {
  var pos = _aaProp(layer, "ADBE Position");
  if (!pos) { throw new Error("no Position property"); }
  if (pos.dimensionsSeparated) {
    var px = _aaProp(layer, "ADBE Position_0"), py = _aaProp(layer, "ADBE Position_1");
    if (!px || !py) { throw new Error("separated Position not accessible"); }
    return { sep: true, props: [px, py] };
  }
  return { sep: false, props: [pos] };
}
function _aaGetPos(pp) {
  if (pp.sep) { return [pp.props[0].value, pp.props[1].value]; }
  var v = pp.props[0].value;
  return [v[0], v[1]];
}
function _aaCheckNoExpression(props, label) {
  var i;
  for (i = 0; i < props.length; i++) {
    if (props[i].expressionEnabled) { throw new Error(label + " has an expression"); }
  }
}
function _aaWrite(prop, value, time) {
  if (prop.numKeys > 0) { prop.setValueAtTime(time, value); } else { prop.setValue(value); }
}
function _aaSetPos(pp, x, y, time) {
  if (pp.sep) {
    _aaWrite(pp.props[0], x, time);
    _aaWrite(pp.props[1], y, time);
  } else {
    var v = pp.props[0].value.slice(0);
    v[0] = x; v[1] = y;
    _aaWrite(pp.props[0], v, time);
  }
}

// 3D layers are only handled when they have no X/Y rotation or Orientation (Z rotation is fine).
function _aaCheck3D(layer) {
  if (!layer.threeDLayer) { return; }
  var names = ["ADBE Rotate X", "ADBE Rotate Y", "ADBE Orientation"], i, p, v;
  for (i = 0; i < names.length; i++) {
    p = _aaProp(layer, names[i]);
    if (!p) { continue; }
    v = p.value;
    if (v instanceof Array) { if (v[0] || v[1] || v[2]) { throw new Error("3D X/Y rotation or Orientation not supported"); } }
    else if (v) { throw new Error("3D X/Y rotation or Orientation not supported"); }
  }
}

function _aaPrecheck(layer) {
  if (!_aaIsSpatialLayer(layer)) { throw new Error("not a visual layer"); }
  if (layer.locked) { throw new Error("layer is locked"); }
  _aaCheck3D(layer);
}

// ----- 2D affine matrices: [a, b, c, d, e, f]  =>  x' = a*x + c*y + e,  y' = b*x + d*y + f -----
function _aaMul(P, C) {   // apply C first, then P
  return [
    P[0] * C[0] + P[2] * C[1],
    P[1] * C[0] + P[3] * C[1],
    P[0] * C[2] + P[2] * C[3],
    P[1] * C[2] + P[3] * C[3],
    P[0] * C[4] + P[2] * C[5] + P[4],
    P[1] * C[4] + P[3] * C[5] + P[5]
  ];
}

// Current (playhead) local transform of a layer.
function _aaLocalState(layer) {
  var ap = _aaProp(layer, "ADBE Anchor Point").value;
  var sc = _aaProp(layer, "ADBE Scale").value;
  var rz = _aaProp(layer, "ADBE Rotate Z").value;      // Rotation (2D) / Z Rotation (3D)
  var p = _aaGetPos(_aaPosProps(layer));
  var rad = rz * Math.PI / 180, cos = Math.cos(rad), sin = Math.sin(rad);
  var sx = sc[0] / 100, sy = sc[1] / 100;
  var a = cos * sx, b = sin * sx, c = -sin * sy, d = cos * sy;
  return {
    ax: ap[0], ay: ap[1], px: p[0], py: p[1],
    a: a, b: b, c: c, d: d,
    e: p[0] - (a * ap[0] + c * ap[1]),
    f: p[1] - (b * ap[0] + d * ap[1])
  };
}

// Layer space -> composition space (includes every parent).
function _aaToComp(layer) {
  var s = _aaLocalState(layer);
  var m = [s.a, s.b, s.c, s.d, s.e, s.f];
  if (layer.parent) { m = _aaMul(_aaToComp(layer.parent), m); }
  return m;
}

// ----- the two operations on one layer -----
function _aaApplyAnchor(layer, comp, frac) {
  _aaPrecheck(layer);
  var rect = _aaRectOrThrow(layer, comp);
  var apProp = _aaProp(layer, "ADBE Anchor Point");
  var pp = _aaPosProps(layer);
  _aaCheckNoExpression([apProp], "Anchor Point");
  _aaCheckNoExpression(pp.props, "Position");

  var st = _aaLocalState(layer);
  var bx = rect.left + rect.width * frac[0];
  var by = rect.top + rect.height * frac[1];
  var dx = bx - st.ax, dy = by - st.ay;

  var newAnchor = apProp.value.slice(0);
  newAnchor[0] = bx; newAnchor[1] = by;

  _aaWrite(apProp, newAnchor, comp.time);
  _aaSetPos(pp, st.px + st.a * dx + st.c * dy, st.py + st.b * dx + st.d * dy, comp.time);
}

function _aaApplyAlign(layer, comp, mode) {
  _aaPrecheck(layer);
  var rect = _aaRectOrThrow(layer, comp);
  var pp = _aaPosProps(layer);
  _aaCheckNoExpression(pp.props, "Position");

  // comp-space bounding box of the (possibly rotated / scaled / parented) layer
  var m = _aaToComp(layer);
  var xs = [rect.left, rect.left + rect.width], ys = [rect.top, rect.top + rect.height];
  var minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, i, j, X, Y;
  for (i = 0; i < 2; i++) {
    for (j = 0; j < 2; j++) {
      X = m[0] * xs[i] + m[2] * ys[j] + m[4];
      Y = m[1] * xs[i] + m[3] * ys[j] + m[5];
      if (X < minX) { minX = X; } if (X > maxX) { maxX = X; }
      if (Y < minY) { minY = Y; } if (Y > maxY) { maxY = Y; }
    }
  }

  var dx = 0, dy = 0;
  switch (mode) {
    case "left":    dx = 0 - minX; break;
    case "hcenter": dx = comp.width / 2 - (minX + maxX) / 2; break;
    case "right":   dx = comp.width - maxX; break;
    case "top":     dy = 0 - minY; break;
    case "vcenter": dy = comp.height / 2 - (minY + maxY) / 2; break;
    case "bottom":  dy = comp.height - maxY; break;
  }

  // comp-space shift -> shift in the layer's parent space (Position lives there)
  var P = layer.parent ? _aaToComp(layer.parent) : AA_IDENTITY;
  var det = P[0] * P[3] - P[1] * P[2];
  if (Math.abs(det) < 1e-9) { throw new Error("parent has zero scale"); }
  var lx = (P[3] * dx - P[2] * dy) / det;
  var ly = (-P[1] * dx + P[0] * dy) / det;

  var pos = _aaGetPos(pp);
  _aaSetPos(pp, pos[0] + lx, pos[1] + ly, comp.time);
}

// ----- shared runner: applies fn to every selected layer and reports WHY layers were skipped -----
function _aaRun(undoName, doneWord, fn) {
  var comp = _activeComp();
  var layers = comp.selectedLayers;
  if (!layers || layers.length === 0) { throw new Error("Select at least one layer first."); }

  var done = 0, skipped = 0, reasons = {}, i, msg, parts, k;
  app.beginUndoGroup(undoName);
  try {
    for (i = 0; i < layers.length; i++) {
      try {
        fn(layers[i], comp);
        done++;
      } catch (e) {
        skipped++;
        msg = (e && e.message) ? e.message : String(e);
        reasons[msg] = (reasons[msg] || 0) + 1;
      }
    }
  } finally {
    app.endUndoGroup();
  }

  parts = [];
  for (k in reasons) { if (reasons.hasOwnProperty(k)) { parts.push(k + (reasons[k] > 1 ? " x" + reasons[k] : "")); } }
  var skipText = skipped ? " Skipped " + skipped + ": " + parts.join("; ") + "." : "";

  if (done === 0) { throw new Error("Nothing changed." + skipText); }
  return done + " layer" + (done === 1 ? "" : "s") + " " + doneWord + "." + skipText;
}

function AA_setAnchor(anchorCode) {
  try {
    if (!AA_ANCHOR_FRACTIONS.hasOwnProperty(anchorCode)) { throw new Error("Unknown anchor position: " + anchorCode); }
    var frac = AA_ANCHOR_FRACTIONS[anchorCode];
    return _ok(_aaRun("Anchor Point: " + anchorCode.toUpperCase(), "updated", function (layer, comp) {
      _aaApplyAnchor(layer, comp, frac);
    }));
  } catch (e) {
    return _err(e);
  }
}

function AA_align(mode) {
  try {
    if (!AA_ALIGN_MODES.hasOwnProperty(mode)) { throw new Error("Unknown align mode: " + mode); }
    return _ok(_aaRun("Align: " + mode, "aligned", function (layer, comp) {
      _aaApplyAlign(layer, comp, mode);
    }));
  } catch (e) {
    return _err(e);
  }
}

// ---------- Fit to Comp / Fit Width / Fit Height ----------
// Called from JS as: AA_fit("comp") | AA_fit("width") | AA_fit("height")
//
// Only the Scale property is touched. Scale is always applied UNIFORMLY (X = Y) so the layer's
// aspect ratio is never distorted; a flipped axis (negative scale) keeps its flip.
//   comp   -> fits the whole layer inside the comp (contain, nothing cropped)
//   width  -> layer width  == comp width  (height may overflow / leave gaps)
//   height -> layer height == comp height (width may overflow / leave gaps)
// Z rotation is taken into account (the rotated bounding box is what gets fitted).
// Limits: parent transforms and 3D X/Y orientation are ignored; layers with a Scale expression
// or empty bounds (audio, empty text/shape) are skipped and counted in the result message.

var AA_FIT_LABELS = { comp: "Fit to Comp", width: "Fit Width", height: "Fit Height" };

function _aaFitLayer(layer, comp, mode) {
  var scaleProp = _aaProp(layer, "ADBE Scale");
  if (!scaleProp || scaleProp.expressionEnabled || layer.locked) { return false; }

  var rect = _aaSourceRect(layer, comp);
  if (!(rect.width > 0) || !(rect.height > 0)) { return false; }

  var rotation = _aaProp(layer, "ADBE Rotate Z").value;   // Rotation (2D) / Z Rotation (3D)
  var rad = rotation * Math.PI / 180;
  var c = Math.abs(Math.cos(rad)), s = Math.abs(Math.sin(rad));
  var extW = rect.width * c + rect.height * s;    // comp-space extents at 100% scale
  var extH = rect.width * s + rect.height * c;

  var fw = comp.width / extW;
  var fh = comp.height / extH;
  var factor = (mode === "width") ? fw : (mode === "height") ? fh : Math.min(fw, fh);
  var pct = factor * 100;

  var cur = scaleProp.value;
  var next = cur.slice(0);
  next[0] = (cur[0] < 0) ? -pct : pct;
  next[1] = (cur[1] < 0) ? -pct : pct;
  if (layer.threeDLayer && next.length > 2) { next[2] = (cur[2] < 0) ? -pct : pct; }

  if (scaleProp.numKeys > 0) { scaleProp.setValueAtTime(comp.time, next); }   // animated: key at playhead
  else { scaleProp.setValue(next); }
  return true;
}

function AA_fit(mode) {
  try {
    var comp = _activeComp();
    if (!AA_FIT_LABELS.hasOwnProperty(mode)) { throw new Error("Unknown fit mode: " + mode); }

    var layers = comp.selectedLayers;
    if (!layers || layers.length === 0) { throw new Error("Select at least one layer first."); }

    var fitted = 0, skipped = 0, i, layer;

    app.beginUndoGroup(AA_FIT_LABELS[mode]);
    try {
      for (i = 0; i < layers.length; i++) {
        layer = layers[i];
        if (!_aaIsSpatialLayer(layer)) { skipped++; continue; }
        try {
          if (_aaFitLayer(layer, comp, mode)) { fitted++; } else { skipped++; }
        } catch (innerErr) {
          skipped++;
        }
      }
    } finally {
      app.endUndoGroup();
    }

    if (fitted === 0) { throw new Error("No eligible layers to fit (need a visual layer with bounds and no Scale expression)."); }
    return _ok(AA_FIT_LABELS[mode] + ": " + fitted + " layer" + (fitted === 1 ? "" : "s") + " scaled." +
      (skipped ? " (" + skipped + " skipped)" : ""));
  } catch (e) {
    return _err(e);
  }
}

// ---------- Easy Layer: Flip Horizontal / Flip Vertical ----------
// Called from JS as: flipSelectedLayers("h") | flipSelectedLayers("v")
//
// A true mirror flip (not a resize): inverts Scale X ("h") or Scale Y ("v") on every selected
// layer by multiplying it by -1, exactly as the panel's own spec describes -
// scale.setValue([-scale[0], scale[1]]) for horizontal, [scale[0], -scale[1]] for vertical.
// Locked layers and layers with a Scale expression are skipped (and counted) rather than
// thrown, matching AA_fit's behavior just above. An animated Scale gets a new key at the
// playhead instead of moving every existing key.
var FLIP_LABELS = { h: "Flip Horizontal", v: "Flip Vertical" };

function flipSelectedLayers(axis) {
  var undoOpen = false;
  try {
    if (!FLIP_LABELS.hasOwnProperty(axis)) { throw new Error("Unknown flip axis: " + axis); }
    var comp = _activeComp();
    var layers = comp.selectedLayers;
    if (!layers || layers.length === 0) { throw new Error("Select at least one layer first."); }

    var idx = (axis === "h") ? 0 : 1;
    var flipped = 0, skipped = 0, i, layer, scaleProp, cur, next;

    app.beginUndoGroup("Flip Layers");
    undoOpen = true;
    for (i = 0; i < layers.length; i++) {
      layer = layers[i];
      if (layer.locked) { skipped++; continue; }
      try {
        scaleProp = _aaProp(layer, "ADBE Scale");
        if (!scaleProp || scaleProp.expressionEnabled) { skipped++; continue; }
        cur = scaleProp.value;
        next = cur.slice(0);
        next[idx] = -next[idx];
        if (scaleProp.numKeys > 0) { scaleProp.setValueAtTime(comp.time, next); }
        else { scaleProp.setValue(next); }
        flipped++;
      } catch (innerErr) {
        skipped++;
      }
    }
    app.endUndoGroup();
    undoOpen = false;

    if (flipped === 0) { throw new Error("No eligible layers to flip (need an unlocked layer with a Scale property and no Scale expression)."); }
    return _ok(FLIP_LABELS[axis] + ": " + flipped + " layer" + (flipped === 1 ? "" : "s") + " flipped." +
      (skipped ? " (" + skipped + " skipped)" : ""));
  } catch (e) {
    if (undoOpen) { app.endUndoGroup(); }
    return _err(e);
  }
}

// ---------- Quick Comp Edit: Match Comp to Layer ----------
// Direction of the match: the SELECTED LAYER'S SOURCE is the reference and the ACTIVE COMPOSITION is what
// changes. FPS and Resolution never touch the layer (no interpret-footage, no in/out, no time stretch).
//   FPS         comp.frameRate = layer.source.frameRate
//   Duration    comp.duration  = the layer's VISIBLE span on the timeline (layer.outPoint - layer.inPoint),
//               NOT the source file's length. inPoint/outPoint are already in comp time, so a split/trimmed
//               layer (Alt+[ / Alt+], Ctrl+Shift+D), a moved layer and a time-stretched layer are all
//               measured correctly. The layer is then slid so its in point sits at 0, and the work area is
//               set to the same span (see the doDuration block).
//   Resolution  comp.width / comp.height = layer.source.width / layer.source.height
// Only settings the source really has are applied: a still image has no frame rate or duration, audio has no
// size, and text / shape / camera / light layers have no source at all (nothing to match against).
// If several layers are selected, the first selected layer that has a source is used.
// Hardened against the layer-selection edge cases that used to surface as "undefined" in the
// panel: no active comp, nothing selected, a selected layer with no source at all, offline or
// otherwise unreadable footage, and repeat clicks once the comp already matches (previously
// thrown as an error - now a plain "already matches" message).
function matchCompToSelectedLayer(opts) {
  var undoOpen = false;
  try {
    opts = opts || {};
    var doFps = !!opts.fps, doDuration = !!opts.duration, doRes = !!opts.resolution;
    if (!doFps && !doDuration && !doRes) { throw new Error("Choose at least one setting to match (FPS, Duration or Resolution)."); }

    var comp = app.project.activeItem;
    if (!(comp && comp instanceof CompItem)) { throw new Error("Open a composition first."); }

    var layers = comp.selectedLayers;
    if (!layers || layers.length === 0) { throw new Error("Select a layer first - the comp will be matched to it."); }

    // Prefer a layer with a real source (footage/precomp); Shape/Text/Camera/Light layers have
    // none, so fall back to the first selected layer - its own in/out span still gives a usable
    // duration fallback below, even though it can't inform FPS or resolution.
    var selectedLayer = null, i, hasSource;
    for (i = 0; i < layers.length; i++) {
      hasSource = false;
      try { hasSource = layers[i].source != null; } catch (eHas) { hasSource = false; }
      if (hasSource) { selectedLayer = layers[i]; break; }
    }
    if (selectedLayer == null) { selectedLayer = layers[0]; }

    var src = null;
    try { src = selectedLayer.source; } catch (eSrc) { src = null; }

    var srcW = src ? _qceSafeNum(function () { return src.width; }, 0) : 0;
    var srcH = src ? _qceSafeNum(function () { return src.height; }, 0) : 0;
    var srcFps = src ? _qceSafeNum(function () { return src.frameRate; }, 0) : 0;

    // Duration comes from the layer's own trimmed bounds, never from src.duration (that is the full
    // length of the footage file, which is what made trimmed layers match to the wrong length).
    var layerIn = _qceSafeNum(function () { return selectedLayer.inPoint; }, 0);
    var layerOut = _qceSafeNum(function () { return selectedLayer.outPoint; }, 0);
    var layerSpan = layerOut - layerIn;

    var changed = [], skipped = [];
    var before = { w: comp.width, h: comp.height, fps: comp.frameRate, dur: comp.duration };

    app.beginUndoGroup("Match Comp to Layer");
    undoOpen = true;
    try {
      // ---- APPLY to the composition. Frame rate first: comp.duration is rounded to whole frames. ----
      if (doFps) {
        if (srcFps > 0) {
          var fps = Math.max(1, Math.min(999, srcFps));
          if (Math.abs(comp.frameRate - fps) > 0.0001) { comp.frameRate = fps; changed.push((Math.round(comp.frameRate * 100) / 100) + " fps"); }
        } else { skipped.push("FPS (source has none)"); }
      }

      if (doDuration) {
        if (layerSpan > 0) {
          // Slide the layer so its (trimmed) in point lands on comp time 0. Locked layers refuse edits,
          // so unlock for the move and put the lock back afterwards.
          if (Math.abs(layerIn) > 0.0001) {
            var wasLocked = false;
            try { wasLocked = selectedLayer.locked; if (wasLocked) { selectedLayer.locked = false; } } catch (eLk) { wasLocked = false; }
            try {
              selectedLayer.startTime = selectedLayer.startTime - layerIn;
              changed.push("layer moved to start");
            } finally {
              if (wasLocked) { try { selectedLayer.locked = true; } catch (eRelock) { /* leave unlocked */ } }
            }
          }

          var dur = Math.max(comp.frameDuration, Math.min(QCE_MAX_DURATION_SECONDS, layerSpan));
          if (Math.abs(comp.duration - dur) > 0.0001) { comp.duration = dur; changed.push((Math.round(comp.duration * 100) / 100) + " s"); }

          // Work area = exactly the trimmed span (clamped: comp.duration was rounded to whole frames).
          var waDur = Math.min(comp.duration, dur);
          if (Math.abs(comp.workAreaStart) > 0.0001 || Math.abs(comp.workAreaDuration - waDur) > 0.0001) {
            comp.workAreaStart = 0;
            comp.workAreaDuration = waDur;
            changed.push("work area");
          }
        } else { skipped.push("duration (layer has no visible length)"); }
      }

      if (doRes) {
        if (srcW > 0 && srcH > 0) {
          var w = Math.max(4, Math.min(30000, Math.round(srcW)));
          var h = Math.max(4, Math.min(30000, Math.round(srcH)));
          if (comp.width !== w || comp.height !== h) { comp.width = w; comp.height = h; changed.push(comp.width + "x" + comp.height); }
        } else { skipped.push("resolution (source has no size)"); }
      }
    } finally {
      app.endUndoGroup();
      undoOpen = false;
    }

    var notes = skipped.length ? " Skipped: " + skipped.join(", ") + "." : "";
    var layerName = selectedLayer.name || "layer";
    var info = _qceInfo(comp);
    if (changed.length === 0) {
      // Not an error: the comp already matches, which happens naturally on a repeat click.
      return _ok('"' + comp.name + '" already matches "' + layerName + '".' + notes, info);
    }
    return _ok('"' + comp.name + '" now matches "' + layerName + '": ' + changed.join(", ") + "." + notes, info);
  } catch (e) {
    return _err(e);
  } finally {
    if (undoOpen) { try { app.endUndoGroup(); } catch (eUndo) { /* nothing left to close */ } }
  }
}

// ---------- Tools tab: Split Text, Stagger, Pre-compose Individually, Trim to Playhead ----------

// Splits a text layer into one new layer per character or per word, so each
// new layer lands exactly where that character/word visually sat in the
// original string - correct kerning, tracking, and paragraph justification
// (left/center/right/justified) included, on both point and box text.
//
// How the positioning works (see _TOOLS_measureUnitPositions and
// _TOOLS_splitPositionPiece below for the full explanation): rather than
// summing measured substring widths - which drifts because a substring
// measured alone doesn't reproduce the kerning pair at its own boundary -
// every unit's true rendered bounding box is measured directly off a
// duplicate of the ORIGINAL full-text layer, by temporarily isolating it
// with a "Subtract"-mode Text Animator range selector. That keeps AE's own
// text engine responsible for layout, so the measurement can't drift.
// Vertical text is not supported.
function TOOLS_splitText(mode) {
  try {
    var comp = _activeComp();
    var layers = comp.selectedLayers;
    if (!layers || !layers.length) { throw new Error("Select at least one text layer."); }
    if (mode !== "char" && mode !== "word") { throw new Error("Unknown split mode: " + mode); }

    var createdTotal = 0, processedLayers = 0, skipped = 0;

    app.beginUndoGroup("Split Text (" + mode + ")");
    try {
      for (var li = 0; li < layers.length; li++) {
        var srcLayer = layers[li];
        if (!(srcLayer instanceof TextLayer)) { skipped++; continue; }

        var fullText = srcLayer.sourceText.value.text;
        if (!fullText || !fullText.length) { skipped++; continue; }

        // Break the string into pieces, recording each piece's index in the
        // animator's own numbering ("Characters Excluding Spaces" skips
        // spaces/line breaks the same way AE's text engine does; "Words"
        // numbers whitespace-delimited runs) - needed so the isolation
        // trick below targets the right unit.
        var pieces = [];
        if (mode === "word") {
          var re = /\S+/g, m;
          while ((m = re.exec(fullText)) !== null) {
            pieces.push({ text: m[0], unitIndex: pieces.length });
          }
        } else {
          var unitIndex = 0;
          for (var ci = 0; ci < fullText.length; ci++) {
            var ch = fullText.charAt(ci);
            if (ch === " " || ch === "\t" || ch === "\r" || ch === "\n") { continue; } // not indexed by the animator
            pieces.push({ text: ch, unitIndex: unitIndex });
            unitIndex++;
          }
        }
        if (!pieces.length) { skipped++; continue; }

        var positions = _TOOLS_measureUnitPositions(comp, srcLayer, pieces, mode);
        var controllerNull = _TOOLS_createSplitControllerNull(comp, srcLayer);
        var created = [];

        for (var pi = 0; pi < pieces.length; pi++) {
          var piece = pieces[pi];

          var newLayer = srcLayer.duplicate();
          newLayer.name = srcLayer.name + " - " + (mode === "word" ? piece.text : ('"' + piece.text + '"'));

          var newDoc = newLayer.sourceText.value;
          newDoc.text = piece.text;
          newLayer.sourceText.setValue(newDoc);

          _TOOLS_placeSplitPiece(newLayer, controllerNull, positions[pi], comp.time);
          created.push(newLayer);
          createdTotal++;
        }

        // Stacking order, top to bottom: controller null, piece 1, piece 2 ... piece N, original.
        // Each piece is moved right above the original in turn, so they end up in reading order.
        for (var oi = 0; oi < created.length; oi++) { created[oi].moveBefore(srcLayer); }
        controllerNull.moveBefore(created[0]);
        srcLayer.enabled = false; // keep the original as a disabled reference instead of deleting it
        processedLayers++;
      }
    } finally {
      app.endUndoGroup();
    }

    if (!processedLayers) { throw new Error("Select one or more text layers to split."); }
    return _ok(createdTotal + " layer" + (createdTotal === 1 ? "" : "s") + " created from " +
      processedLayers + " text layer" + (processedLayers === 1 ? "" : "s") + "." +
      (skipped ? " (" + skipped + " non-text layers skipped)" : ""));
  } catch (e) {
    return _err(e);
  }
}

// Measures each piece's TRUE rendered bounding-box center, in the source
// layer's own local content space (i.e. before Transform is applied -
// sourceRectAtTime() never reflects Position/Anchor Point/Scale/Rotation,
// only the source content and Character/Paragraph settings, so this is
// stable regardless of the layer's on-screen transform).
//
// The isolation trick: add one Text Animator to a throwaway duplicate, with
// a range selector in "Subtract" mode. Subtract mode makes the animator's
// property affect every unit EXCEPT the one inside the selector's own
// index range - so setting that animator's Scale to [0,0,100] shrinks every
// OTHER character/word to nothing while the targeted one keeps sitting
// exactly where AE's text engine laid it out (kerning/tracking/
// justification already resolved). sourceRectAtTime() on the whole layer
// then reports just that one surviving unit's box. Sweeping Index Offset
// across every piece measures them all off the same single duplicate.
function _TOOLS_measureUnitPositions(comp, srcLayer, pieces, mode) {
  var measureLayer = srcLayer.duplicate();
  measureLayer.name = "__split_measure__";
  measureLayer.enabled = false;

  try {
    var animators = measureLayer.property("ADBE Text Properties").property("ADBE Text Animators");
    var animator = animators.addProperty("ADBE Text Animator");
    animator.property("ADBE Text Animator Properties").addProperty("ADBE Text Scale 3D").setValue([0, 0, 100]);

    var rangeSelector = animator.property("ADBE Text Selectors").addProperty("ADBE Text Selector");
    var adv = rangeSelector.property("ADBE Text Range Advanced");
    adv.property("ADBE Text Range Units").setValue(2);                        // 2 = Index (not Percentage)
    adv.property("ADBE Text Range Type2").setValue(mode === "word" ? 3 : 2);  // 3 = Words, 2 = Characters Excl. Spaces
    adv.property("ADBE Text Selector Mode").setValue(2);                     // 2 = Subtract -> target stays UNaffected

    var indexStart = rangeSelector.property("ADBE Text Index Start");
    var indexEnd = rangeSelector.property("ADBE Text Index End");
    var indexOffset = rangeSelector.property("ADBE Text Index Offset");
    indexStart.setValue(0);
    indexEnd.setValue(1); // a window of exactly one unit, swept into place per-piece via the offset below

    var positions = [];
    for (var i = 0; i < pieces.length; i++) {
      indexOffset.setValue(pieces[i].unitIndex);
      var b = measureLayer.sourceRectAtTime(comp.time, false);
      positions.push({ centerX: b.left + (b.width / 2), centerY: b.top + (b.height / 2) });
    }
    return positions;
  } finally {
    measureLayer.remove();
  }
}

// Places one already-retexted single-unit duplicate so its glyph(s) land on
// the measured target center. Resetting Anchor Point to [0,0] makes Position
// map directly onto the layer's own local content space (no anchor offset to
// account for), so parenting it to a controller null that already carries
// the original layer's Anchor Point/Scale/Rotation/Opacity/Position - and
// setting Position to nothing but the delta between this isolated unit's own
// center and the measured target center - reproduces the exact on-screen
// spot that unit occupied inside the full string, while still inheriting any
// animation on the original layer's shared transform properties.
function _TOOLS_placeSplitPiece(pieceLayer, controllerNull, target, time) {
  var ownBounds = pieceLayer.sourceRectAtTime(time, false);
  var ownCenterX = ownBounds.left + (ownBounds.width / 2);
  var ownCenterY = ownBounds.top + (ownBounds.height / 2);

  pieceLayer.transform.anchorPoint.setValue([0, 0]);
  pieceLayer.parent = controllerNull;
  _TOOLS_setLayerPos(pieceLayer, target.centerX - ownCenterX, target.centerY - ownCenterY);
  pieceLayer.opened = false;
}

// One controller null per split source layer: carries the shared transform
// (Anchor Point/Scale/Rotation/Opacity/Position) and timing so every split
// piece parents to a single place, keeps responding to any existing
// animation on the original, and moves/scales/rotates together as a unit.
function _TOOLS_createSplitControllerNull(comp, srcLayer) {
  var nullLayer = comp.layers.addNull();
  nullLayer.name = srcLayer.name + " - Split Controller";

  var props = ["anchorPoint", "scale", "opacity"];
  for (var p = 0; p < props.length; p++) {
    try { nullLayer.transform[props[p]].setValue(srcLayer.transform[props[p]].value); } catch (e) { /* not present - skip */ }
  }
  try {
    if (srcLayer.threeDLayer) { nullLayer.threeDLayer = true; nullLayer.transform.zRotation.setValue(srcLayer.transform.zRotation.value); }
    else { nullLayer.transform.rotation.setValue(srcLayer.transform.rotation.value); }
  } catch (e) { /* skip */ }

  var pos = _TOOLS_getLayerPos(srcLayer);
  _TOOLS_setLayerPos(nullLayer, pos[0], pos[1]);

  nullLayer.startTime = srcLayer.startTime;
  nullLayer.inPoint = srcLayer.inPoint;
  nullLayer.outPoint = srcLayer.outPoint;

  return nullLayer;
}

// Position get/set that transparently supports Separate Dimensions, since a
// layer with X/Y Position split can't be written via a single [x,y] value.
function _TOOLS_getLayerPos(layer) {
  var pos = layer.transform.position;
  if (pos.dimensionsSeparated) { return [layer.transform.xPosition.value, layer.transform.yPosition.value]; }
  var v = pos.value;
  return [v[0], v[1]];
}
function _TOOLS_setLayerPos(layer, x, y) {
  var pos = layer.transform.position;
  if (pos.dimensionsSeparated) {
    layer.transform.xPosition.setValue(x);
    layer.transform.yPosition.setValue(y);
  } else {
    pos.setValue([x, y]);
  }
}

// Sequentially offsets each selected layer's startTime by offsetFrames,
// in the given stacking order.
function TOOLS_stagger(offsetFrames, order) {
  try {
    var comp = _activeComp();
    var layers = comp.selectedLayers;
    if (!layers || layers.length < 2) { throw new Error("Select at least 2 layers."); }

    offsetFrames = Number(offsetFrames);
    if (!isFinite(offsetFrames) || offsetFrames < 0) { offsetFrames = 0; }

    var sorted = layers.slice(0);
    sorted.sort(function (a, b) { return a.index - b.index; }); // topmost first
    if (order === "bottom-up") { sorted.reverse(); }

    var frameSeconds = comp.frameDuration;

    app.beginUndoGroup("Stagger Layers");
    try {
      for (var i = 0; i < sorted.length; i++) {
        sorted[i].startTime = sorted[i].startTime + (i * offsetFrames * frameSeconds);
      }
    } finally {
      app.endUndoGroup();
    }

    return _ok(sorted.length + " layers staggered by " + offsetFrames + " frame" + (offsetFrames === 1 ? "" : "s") + " each.");
  } catch (e) {
    return _err(e);
  }
}

// ---------- Pre-compose (with "Adjust composition duration to the time span of the selected layers") ----------
// Native AE does this itself when that box is ticked; scripting's precompose() has no such parameter, so it is
// rebuilt here:
//   1. time span   minIn = earliest inPoint, maxOut = latest outPoint of the layers being pre-composed
//   2. precompose  comp.layers.precompose(indices, name, moveAllAttributes)
//   3. new comp    duration = maxOut - minIn
//   4. align       every inner layer: startTime -= minIn (its keyframes and markers travel with it), and the new
//                  pre-comp layer in the main comp: startTime = minIn, in/out = minIn..maxOut.
//                  Result: nothing shifts visually in the main comp, the new comp is exactly as long as its content.
// Notes
//  * moveAllAttributes: with SEVERAL layers AE always moves attributes (forced true). With a SINGLE layer both
//    true and false are valid. (The previous version only allowed true when the layers were every layer in the comp,
//    which is why "Move all attributes" was silently dropped nearly every time.) If AE still refuses a single-layer
//    call, the opposite value is tried instead of failing.
//  * Layers are matched by item id, not by object identity (ExtendScript hands out fresh wrappers).
//  * Expressions that read the raw `time` value see the shifted time in the new comp, same as native AE.

// puts the layer's in/out at a -> b without ever passing through in > out
function _pcSetRange(layer, a, b) {
  if (layer.outPoint <= a) { layer.outPoint = b; layer.inPoint = a; }
  else { layer.inPoint = a; layer.outPoint = b; }
}

// layers: array of Layer objects that live in `comp`. Returns { newComp, precompLayer, moved, minIn, maxOut }.
// Does NOT open an undo group - the caller owns it.
function _pcPrecompose(comp, layers, name, moveAll) {
  var i, L, idx = [], minIn = Infinity, maxOut = -Infinity, hadLocked = false;
  var TOL = 0.000001;

  // 1) collect indices + the time span of the selection
  for (i = 0; i < layers.length; i++) {
    L = layers[i];
    if (L.inPoint < minIn) { minIn = L.inPoint; }
    if (L.outPoint > maxOut) { maxOut = L.outPoint; }
    idx.push(L.index);
    if (L.locked) { L.locked = false; hadLocked = true; }   // precompose can't take locked layers
  }
  idx.sort(function (x, y) { return x - y; });
  if (!(maxOut > minIn)) { throw new Error("The selected layer has no length (in point is not before out point)."); }

  // 2) pre-compose
  var moved = !!moveAll || idx.length > 1;                   // several layers: AE forces "move all attributes"
  var newComp;
  try {
    newComp = comp.layers.precompose(idx, name, moved);
  } catch (e1) {
    if (idx.length > 1) { throw e1; }
    moved = !moved;                                          // single layer: try the other setting once
    newComp = comp.layers.precompose(idx, name, moved);
  }
  if (!newComp) { throw new Error("After Effects did not return the new composition."); }

  // the new pre-comp layer in the main comp
  var precompLayer = null, cand;
  for (i = 1; i <= comp.numLayers; i++) {
    cand = comp.layer(i);
    if (cand.source && cand.source.id === newComp.id) { precompLayer = cand; break; }
  }
  if (!precompLayer) { throw new Error("Pre-composed, but could not find the new pre-comp layer."); }

  // 3) new comp = exactly the time span (rounded UP to whole frames so the last frame is never lost)
  var fd = newComp.frameDuration;
  var span = maxOut - minIn;
  var newDur = Math.max(fd, Math.ceil(span / fd - TOL) * fd);

  // 4a) inner layers: shift back by minIn. Keyframes/markers move with the layer.
  if (Math.abs(minIn) > TOL) {
    var inner, wasLocked;
    for (i = 1; i <= newComp.numLayers; i++) {
      inner = newComp.layer(i);
      wasLocked = inner.locked;
      if (wasLocked) { inner.locked = false; }
      try { inner.startTime = inner.startTime - minIn; }
      finally { if (wasLocked) { inner.locked = true; } }
    }
  }
  newComp.duration = newDur;

  // 4b) the pre-comp layer: begin at minIn, span minIn..maxOut in the main comp
  precompLayer.startTime = minIn;
  _pcSetRange(precompLayer, minIn, Math.min(maxOut, minIn + newComp.duration));
  if (hadLocked) { precompLayer.locked = true; }

  return { newComp: newComp, precompLayer: precompLayer, moved: moved, minIn: minIn, maxOut: maxOut };
}

// ---------- Pre-compose (the main tool): every selected layer into its OWN comp ----------
// Called from JS as: TOOLS_precomposeEach(moveAllAttributes)
// Loops over the selected layers and pre-composes them one by one. Each layer goes through the shared
// _pcPrecompose() above, so every one gets the full treatment: attributes moved (with the single-layer
// fallback), the new comp trimmed to that layer's span, inner layers re-timed, and the pre-comp layer placed
// back at the original time. The old "pre-comp selected together" tool used the same helper and was removed.
// Nothing valid to work on (no comp / no selection) -> returns a friendly notice, no exception, no changes.
function TOOLS_precomposeEach(moveAllAttributes) {
  var undoOpen = false;
  try {
    var comp = app.project ? app.project.activeItem : null;
    if (!(comp instanceof CompItem)) { return _notice("Open a composition first."); }
    var sel = comp.selectedLayers;
    if (!sel || sel.length < 1) { return _notice("Select one or more layers first."); }

    // Plain array copy: pre-composing changes the selection while we loop.
    var layers = [], i, r;
    for (i = 0; i < sel.length; i++) { layers.push(sel[i]); }
    moveAllAttributes = !!moveAllAttributes;

    var count = 0, downgraded = 0, failed = 0, lastErr = "";
    app.beginUndoGroup("Pre-compose Individually");
    undoOpen = true;
    for (i = 0; i < layers.length; i++) {
      try {
        r = _pcPrecompose(comp, [layers[i]], layers[i].name + " (precomp)", moveAllAttributes);
        count++;
        if (moveAllAttributes && !r.moved) { downgraded++; }
      } catch (eLayer) {
        failed++; lastErr = (eLayer && eLayer.message) ? eLayer.message : String(eLayer);
      }
    }
    app.endUndoGroup();
    undoOpen = false;

    if (count === 0) { throw new Error("Pre-compose failed" + (lastErr ? ": " + lastErr : ".")); }
    var msg = count + " layer" + (count === 1 ? "" : "s") + " pre-composed individually; each comp trimmed to its layer.";
    if (downgraded) { msg += " " + downgraded + " could not move attributes (After Effects refused), so they were left on the layer."; }
    if (failed) { msg += " " + failed + " failed" + (lastErr ? " (" + lastErr + ")" : "") + "."; }
    return _ok(msg);
  } catch (e) {
    return _err(e);
  } finally {
    if (undoOpen) { try { app.endUndoGroup(); } catch (eUndo) { /* nothing left to close */ } }
  }
}

// Trims the In or Out point of every selected layer to the current time
// indicator (comp.time).
function TOOLS_trimToPlayhead(edge) {
  try {
    var comp = _activeComp();
    var layers = comp.selectedLayers;
    if (!layers || !layers.length) { throw new Error("Select one or more layers."); }
    if (edge !== "in" && edge !== "out") { throw new Error("Unknown edge: " + edge); }

    var trimmed = 0, skipped = 0;

    app.beginUndoGroup("Trim to Playhead (" + edge + ")");
    try {
      for (var i = 0; i < layers.length; i++) {
        var layer = layers[i];
        try {
          if (edge === "in") { layer.inPoint = comp.time; }
          else { layer.outPoint = comp.time; }
          trimmed++;
        } catch (innerErr) {
          skipped++; // e.g. the playhead sits outside this layer's current start/end range
        }
      }
    } finally {
      app.endUndoGroup();
    }

    if (!trimmed) { throw new Error("Could not trim any layer - move the playhead within the layer's current range."); }
    return _ok(trimmed + " layer" + (trimmed === 1 ? "" : "s") + " trimmed at " + (edge === "in" ? "In" : "Out") + " Point." +
      (skipped ? " (" + skipped + " skipped)" : ""));
  } catch (e) {
    return _err(e);
  }
}

// ---------- Color Palette ----------

function _hexToUnit(hex) {
  var m = /^#?([0-9a-f]{6})$/i.exec(hex || "");
  if (!m) { throw new Error("Invalid HEX color: " + hex); }
  var n = parseInt(m[1], 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

// Real-time Fill update, called on every Color Palette swatch pick.
// Sets Fill > Color (ADBE Fill-0002) on EVERY Fill effect (ADBE Fill) of every selected layer - no new layer.
// data.mode tells the panel what happened:
//   "fill"     at least one Fill effect was recolored (data.updated effects on data.layers layers)
//   "deferred" a color PROPERTY is selected in the timeline (e.g. a Stroke Color) - COLOR_applyToSelection handles that
//   "none"     nothing to update here (no selection / selected layers have no Fill) - the pick is only the new default
//   "nocomp"   no composition open - the pick is only the new default
function applyColorToSelectionOrFill(hexColor) {
  try {
    var rgb = _hexToUnit(hexColor);
    var hexLabel = String(hexColor).toUpperCase();
    if (hexLabel.charAt(0) !== "#") { hexLabel = "#" + hexLabel; }

    var comp = app.project.activeItem;
    if (!(comp && comp instanceof CompItem)) {
      return _json({ ok: true, message: hexLabel + " set as the default for the next Solid.", data: { mode: "nocomp", updated: 0, layers: 0 } });
    }

    var props = comp.selectedProperties, pi;
    for (pi = 0; pi < (props ? props.length : 0); pi++) {
      if (props[pi] instanceof Property && props[pi].propertyValueType === PropertyValueType.COLOR) {
        return _json({ ok: true, message: "", data: { mode: "deferred", updated: 0, layers: 0 } });
      }
    }

    // Pass 1: collect every Fill color property, so the undo group is only opened when there is work to do.
    var sel = comp.selectedLayers, targets = [], layerCount = 0, li, ei, fx, cp, effects, found;
    for (li = 0; li < (sel ? sel.length : 0); li++) {
      effects = sel[li].property("ADBE Effect Parade");
      if (!effects) { continue; }
      found = false;
      for (ei = 1; ei <= effects.numProperties; ei++) {
        fx = effects.property(ei);
        if (fx && fx.matchName === "ADBE Fill") {
          cp = fx.property("ADBE Fill-0002");
          if (cp) { targets.push(cp); found = true; }
        }
      }
      if (found) { layerCount++; }
    }

    if (!targets.length) {
      return _json({ ok: true, message: "", data: { mode: "none", updated: 0, layers: 0 } });
    }

    var updated = 0, ti;
    app.beginUndoGroup("Update Fill Effect Color");
    try {
      for (ti = 0; ti < targets.length; ti++) {
        try { targets[ti].setValue([rgb[0], rgb[1], rgb[2], 1]); updated++; } catch (eSet) { /* locked / expression-driven: skip */ }
      }
    } finally {
      app.endUndoGroup();
    }

    if (!updated) { return _json({ ok: true, message: "", data: { mode: "none", updated: 0, layers: 0 } }); }
    return _json({
      ok: true,
      message: "Fill color set to " + hexLabel + " on " + updated + " effect" + (updated === 1 ? "" : "s") + " (" + layerCount + " layer" + (layerCount === 1 ? "" : "s") + ").",
      data: { mode: "fill", updated: updated, layers: layerCount }
    });
  } catch (e) {
    return _err(e);
  }
}

// Applies a HEX color to whatever makes sense given the current selection:
// 1) any selected properties of type COLOR (e.g. a Shape's Fill Color,
//    Stroke Color, or a Light's Color - select the property row in the
//    Timeline first), otherwise
// 2) selected Solid layers (recolors the underlying solid footage), and
// 3) selected Text layers (sets the whole text string's fill color).
// Layers/properties that don't match either case are silently skipped.
function COLOR_applyToSelection(hex) {
  try {
    var comp = _activeComp();
    var rgb = _hexToUnit(hex);
    var applied = 0;

    app.beginUndoGroup("Apply Color " + hex);
    try {
      var props = comp.selectedProperties;
      if (props && props.length) {
        for (var pi = 0; pi < props.length; pi++) {
          var p = props[pi];
          if (p instanceof Property && p.propertyValueType === PropertyValueType.COLOR) {
            try {
              var cur = p.value;
              var alpha = (cur && cur.length > 3) ? cur[3] : 1;
              p.setValue([rgb[0], rgb[1], rgb[2], alpha]);
              applied++;
            } catch (e1) {}
          }
        }
      }

      if (!applied) {
        var layers = comp.selectedLayers;
        for (var li = 0; li < (layers ? layers.length : 0); li++) {
          var layer = layers[li];
          try {
            if (layer instanceof TextLayer) {
              var doc = layer.sourceText.value;
              doc.fillColor = rgb;
              layer.sourceText.setValue(doc);
              applied++;
            } else if (layer instanceof AVLayer && layer.source && layer.source.mainSource instanceof SolidSource) {
              layer.source.mainSource.color = rgb;
              applied++;
            }
          } catch (e2) {}
        }
      }
    } finally {
      app.endUndoGroup();
    }

    if (!applied) {
      return _ok("HEX copied. Select a layer (Solid/Text) or a color property (like Fill Color) in the Timeline to also apply it.");
    }
    return _ok(hex.toUpperCase() + " applied to " + applied + " target" + (applied === 1 ? "" : "s") + ".");
  } catch (e) {
    return _err(e);
  }
}

// ---------- Expression Code (snippet manager) ----------

// Applies raw expression code (as text) to every selected property.
function EXPR_applyCode(code) {
  try {
    var comp = _activeComp();
    var props = comp.selectedProperties;
    if (!props || !props.length) {
      throw new Error("Select a property first (twirl down a layer in the Timeline and click a property name, e.g. Position or Opacity).");
    }

    var applied = 0, skipped = 0;
    app.beginUndoGroup("Apply Expression");
    try {
      for (var i = 0; i < props.length; i++) {
        var p = props[i];
        if (!(p instanceof Property) || !p.canSetExpression) { skipped++; continue; }
        try {
          p.expression = code;
          applied++;
        } catch (inner) {
          skipped++; // usually a syntax error in the expression itself
        }
      }
    } finally {
      app.endUndoGroup();
    }

    if (!applied) { throw new Error("Could not apply the expression to the selected propert" + (props.length === 1 ? "y" : "ies") + " - check the syntax."); }
    return _ok("Expression applied to " + applied + " propert" + (applied === 1 ? "y" : "ies") + "." +
      (skipped ? " (" + skipped + " skipped)" : ""));
  } catch (e) {
    return _err(e);
  }
}

// ---------- Expression Code (external file-based persistence) ----------
// Custom expression snippets used to live ONLY in the panel's localStorage, which is wiped the
// moment the extension folder is deleted, reinstalled or updated (CEP panels have no storage of
// their own outside that folder). Everything below mirrors that same data out to a plain JSON
// file in the user's OS Documents folder instead, which survives all of that:
//   ~/Documents/Multitool_CEP_Data/saved_expressions.json
// Every function here is try/catch-wrapped end to end so a locked file, a missing Documents
// folder, or a permissions error can never crash the panel - it just reports back ok:false and
// the JS side falls back to whatever is already in localStorage.

// Resolves the persistent folder + file, without creating anything yet.
function _exprFilePaths() {
  var dir = new Folder(Folder.myDocuments.fsName + "/Multitool_CEP_Data");
  var file = new File(dir.fsName + "/saved_expressions.json");
  return { dir: dir, file: file };
}

// Requirement 1: creates the dedicated Documents folder and the JSON file if either is missing.
// Safe to call on every panel init / tab load - a no-op once both already exist.
function _ensureExpressionsFile() {
  var p = _exprFilePaths();
  if (!p.dir.exists) { p.dir.create(); }
  if (!p.file.exists) {
    // Seed with the same empty shape the panel's CategoryStore uses, so a first-ever read
    // never has to special-case "file exists but is empty".
    saveExpressionsToFile('{"activeId":"c0","cats":[{"id":"c0","name":"Snippets","items":[]}]}');
  }
  return p;
}

// Requirement 2: writes a JSON string straight to saved_expressions.json.
// Returns true on success, false on any failure (permissions, disk full, locked file, etc.).
function saveExpressionsToFile(jsonString) {
  var f;
  try {
    var p = _exprFilePaths();
    if (!p.dir.exists) { p.dir.create(); }
    f = p.file;
    f.encoding = "UTF-8";
    if (!f.open("w")) { return false; }
    f.write(String(jsonString));
    f.close();
    return true;
  } catch (e) {
    try { if (f && f.open) { f.close(); } } catch (e2) {}
    return false;
  }
}

// Requirement 2: reads saved_expressions.json and returns its raw text (the JS side parses it -
// ExtendScript here never needs to understand the JSON, just move the bytes safely).
// Returns null if the file doesn't exist yet or can't be read.
function loadExpressionsFromFile() {
  var f;
  try {
    var p = _exprFilePaths();
    if (!p.file.exists) { return null; }
    f = p.file;
    f.encoding = "UTF-8";
    if (!f.open("r")) { return null; }
    var content = f.read();
    f.close();
    return content;
  } catch (e) {
    try { if (f && f.open) { f.close(); } } catch (e2) {}
    return null;
  }
}

// ---- Bridge-facing entry points (called from main.js via CSInterface.evalScript) ----

// Called once on panel init: makes sure the folder/file exist, then returns whatever is
// currently saved so the very first render can seed itself from disk if localStorage is empty.
function EXPR_FILE_init() {
  try {
    _ensureExpressionsFile();
    var content = loadExpressionsFromFile();
    return _ok("OK", { json: content, path: _exprFilePaths().file.fsName });
  } catch (e) {
    return _err(e);
  }
}

// Called from JS as EXPR_FILE_load(). Same as init but doesn't (re)create anything -
// used for on-demand refreshes after init has already run once.
function EXPR_FILE_load() {
  try {
    var content = loadExpressionsFromFile();
    return _ok("OK", { json: content });
  } catch (e) {
    return _err(e);
  }
}

// Called from JS as EXPR_FILE_save(jsonString) every time a snippet/category is added, edited,
// deleted, reordered (favorite) or renamed. Best-effort: failures are reported but never thrown.
function EXPR_FILE_save(jsonString) {
  try {
    var ok = saveExpressionsToFile(jsonString);
    return ok ? _ok("Saved.") : _err(new Error("Could not write saved_expressions.json (check file/folder permissions)."));
  } catch (e) {
    return _err(e);
  }
}

// "Backup Expressions" (Settings tab): copies the current saved_expressions.json to a location
// the user picks, timestamped so repeated backups never overwrite each other.
function EXPR_FILE_backupExport() {
  try {
    var p = _exprFilePaths();
    if (!p.file.exists) { throw new Error("No saved expressions yet - add a snippet first."); }
    var stamp = new Date();
    function pad(n) { return (n < 10 ? "0" : "") + n; }
    var name = "saved_expressions_backup_" + stamp.getFullYear() + pad(stamp.getMonth() + 1) + pad(stamp.getDate()) +
      "_" + pad(stamp.getHours()) + pad(stamp.getMinutes()) + ".json";
    var dest = File.saveDialog("Backup Expressions As", "JSON:*.json");
    if (!dest) { return _notice("Backup canceled."); }
    // File.saveDialog doesn't let us pre-fill a suggested file name on every OS, so if the user
    // picked a bare folder-looking target we still just use whatever path they confirmed.
    if (!p.file.copy(dest.fsName)) { throw new Error("Could not write the backup file. Check that the destination is writable."); }
    return _ok("Backup saved" + (dest.name ? (" as \"" + dest.name + "\".") : "."), { path: dest.fsName, suggestedName: name });
  } catch (e) {
    return _err(e);
  }
}

// "Import Expressions" (Settings tab): lets the user pick a .json backup and REPLACES
// saved_expressions.json with it. Returns the imported content so the JS side can also refresh
// localStorage + the on-screen list immediately, without requiring a panel reload.
function EXPR_FILE_backupImport() {
  try {
    var picked = File.openDialog("Select an Expressions Backup (.json)", "JSON:*.json");
    if (!picked) { return _notice("Import canceled."); }
    picked.encoding = "UTF-8";
    if (!picked.open("r")) { throw new Error("Could not open the selected file."); }
    var text = picked.read();
    picked.close();
    if (!text || !text.length) { throw new Error("That file is empty."); }
    if (!saveExpressionsToFile(text)) { throw new Error("Could not write to saved_expressions.json (check file/folder permissions)."); }
    return _ok("Expressions imported from \"" + picked.name + "\".", { json: text });
  } catch (e) {
    return _err(e);
  }
}

// ---------- Unprecompose ----------
// Called from JS as: TOOLS_unprecompose("copy")  or  TOOLS_unprecompose("delete")
//
// Extracts every layer inside a selected pre-composition and pastes them directly into the parent (currently
// active) composition, aligned to where the pre-comp layer sat on the timeline.
//
//   "copy"   Copy Attributes  - the pre-comp layer's transform (position/scale/rotation/opacity) is merged into
//                               each extracted layer so it lands where it visually appeared, and the pre-comp
//                               layer's effects are copied onto every extracted layer.
//   "delete" Delete Attributes - everything applied to the pre-comp layer (effects, masks, transform) is
//                               discarded. The inner layers come out in their original raw state, with their
//                               own transforms untouched (they are only re-timed to the pre-comp's start).
//
// How the cross-comp move works: ExtendScript has no "copy this layer into a different CompItem" API, so this
// uses the same Copy/Paste menu commands a person would use by hand. Effects are moved the same way (select the
// effects on the pre-comp layer, Copy, select the extracted layers, Paste), which keeps keyframes, expressions
// and settings intact.
//
// Documented limitations:
// - 2D transforms only (position/scale/rotation/opacity) in "copy" mode. 3D X/Y tilt is not compensated for.
// - The pre-comp layer's Stretch % / time remapping is ignored; only its startTime offset is used.
// - Masks on the pre-comp layer are never copied (a mask around the whole group has no per-layer equivalent).
// - Effects copied onto every layer act on each layer separately, not on the flattened result they had before.
// - Effects can't be pasted onto cameras or lights, so those are skipped.
// - Parenting relationships BETWEEN the inner layers may not survive the copy.

// A transform property of any layer type, or null when that layer type does not have it.
// (Cameras and lights have no Scale / Opacity / Anchor Point: reading them directly is what raised
// "undefined is not an object".)
function _unpreProp(layer, matchName) {
  try { var g = layer.property("ADBE Transform Group"); return g ? g.property(matchName) : null; } catch (e) { return null; }
}
function _unpreVal(layer, matchName, fallback) {
  var p = _unpreProp(layer, matchName);
  try { return p ? p.value : fallback; } catch (e) { return fallback; }
}

function _unpreClearSelection(comp) {
  var props = comp.selectedProperties, i;
  for (i = props.length - 1; i >= 0; i--) { try { props[i].selected = false; } catch (e1) {} }
  for (i = 1; i <= comp.numLayers; i++) { comp.layer(i).selected = false; }
}

// Copies every effect on preLayer onto each extractable layer. Returns a short status note.
function _unpreCopyEffects(comp, preLayer, targets, copyCmd, pasteCmd) {
  var fx = preLayer.property("ADBE Effect Parade");
  if (!fx || fx.numProperties === 0) { return ""; }

  var eligible = [], i;
  for (i = 0; i < targets.length; i++) { if (targets[i] instanceof AVLayer) { eligible.push(targets[i]); } }
  if (eligible.length === 0) { return ""; }

  try {
    _unpreClearSelection(comp);
    preLayer.selected = true;
    for (i = 1; i <= fx.numProperties; i++) { fx.property(i).selected = true; }
    app.executeCommand(copyCmd);

    _unpreClearSelection(comp);
    for (i = 0; i < eligible.length; i++) { eligible[i].selected = true; }
    app.executeCommand(pasteCmd);
    return " " + fx.numProperties + " effect" + (fx.numProperties === 1 ? "" : "s") + " copied to " + eligible.length + " layer" + (eligible.length === 1 ? "" : "s") + ".";
  } catch (fxErr) {
    return " (The effects could not be copied: " + fxErr.message + ")";
  }
}

function TOOLS_unprecompose(attrMode) {
  // ---- strict checks first: if any fails, leave quietly (no exception, nothing touched) ----
  var comp = app.project ? app.project.activeItem : null;
  if (!(comp instanceof CompItem)) { return _notice("Open a composition first."); }                       // 1) active comp
  var sel = comp.selectedLayers;
  if (!sel || sel.length < 1) { return _notice("Select a pre-comp layer first."); }                       // 2) a selected layer
  if (sel.length > 1) { return _notice("Select just one pre-comp layer to unprecompose."); }
  var preLayer = sel[0];
  if (!(preLayer instanceof AVLayer) || !(preLayer.source instanceof CompItem)) {                         // 3) it is a pre-comp
    return _notice("The selected layer isn't a pre-comp.");
  }

  try {
    var copyAttrs = (attrMode !== "delete");
    var innerComp = preLayer.source;
    if (innerComp.numLayers === 0) { return _notice("That pre-composition has no layers."); }

    var copyCmd = app.findMenuCommandId("Copy");
    var pasteCmd = app.findMenuCommandId("Paste");
    if (!copyCmd || !pasteCmd) { throw new Error("Could not find the Copy/Paste menu commands in this After Effects version."); }

    // Snapshot the precomp layer's own 2D transform + timing before anything changes.
    var preAnchor = _unpreVal(preLayer, "ADBE Anchor Point", [0, 0, 0]);
    var prePosition = _unpreVal(preLayer, "ADBE Position", [0, 0, 0]);
    var preScale = _unpreVal(preLayer, "ADBE Scale", [100, 100, 100]);
    var preRotation = _unpreVal(preLayer, "ADBE Rotate Z", 0);     // Z Rotation for 3D layers, Rotation for 2D
    var preOpacity = _unpreVal(preLayer, "ADBE Opacity", 100);
    var preStartTime = preLayer.startTime;
    var preName = preLayer.name;

    // Snapshot each inner layer's original transform/timing, top-to-bottom,
    // BEFORE we touch selection state (we'll match pasted layers back to
    // these by relative stacking order).
    var innerSnapshots = [];
    for (var ii = 1; ii <= innerComp.numLayers; ii++) {
      var il = innerComp.layer(ii);
      innerSnapshots.push({
        position: _unpreVal(il, "ADBE Position", null),
        scale: _unpreVal(il, "ADBE Scale", null),                   // null on cameras and lights
        rotation: _unpreVal(il, "ADBE Rotate Z", 0),
        opacity: _unpreVal(il, "ADBE Opacity", null),               // null on cameras and lights
        startTime: il.startTime,
        inPoint: il.inPoint,
        outPoint: il.outPoint
      });
    }

    app.beginUndoGroup('Unprecompose "' + preName + '" (' + (copyAttrs ? "copy" : "delete") + ' attributes)');
    try {
      // 1) Select every inner layer and copy them together, which preserves
      // their relative order (and any parenting between them, where possible).
      innerComp.openInViewer();
      for (var si = 1; si <= innerComp.numLayers; si++) { innerComp.layer(si).selected = true; }
      app.executeCommand(copyCmd);

      // 2) Switch the active viewer to the parent comp, select the precomp
      // layer so the paste lands right above it, then paste.
      comp.openInViewer();
      for (var di = 1; di <= comp.numLayers; di++) { comp.layer(di).selected = false; }
      preLayer.selected = true;
      app.executeCommand(pasteCmd);

      var pasted = comp.selectedLayers; // paste auto-selects exactly the new layers
      if (!pasted || !pasted.length) { throw new Error("Paste did not produce any new layers."); }

      // Match pasted layers back to their original snapshot by relative
      // top-to-bottom order, since paste preserves that ordering.
      var sortedPasted = pasted.slice(0).sort(function (a, b) { return a.index - b.index; });

      var sx = preScale[0] / 100, sy = preScale[1] / 100;
      var rad = preRotation * Math.PI / 180;
      var cos = Math.cos(rad), sin = Math.sin(rad);

      for (var k = 0; k < sortedPasted.length && k < innerSnapshots.length; k++) {
        var newLayer = sortedPasted[k];
        var snap = innerSnapshots[k];

        try {
          // Cameras / lights (no Scale or Opacity) keep their raw pasted transform; only their timing is fixed.
          var pPos = _unpreProp(newLayer, "ADBE Position"), pScale = _unpreProp(newLayer, "ADBE Scale");
          var pRot = _unpreProp(newLayer, "ADBE Rotate Z"), pOp = _unpreProp(newLayer, "ADBE Opacity");
          if (copyAttrs && snap.position && snap.scale && snap.opacity !== null && pPos && pScale && pRot && pOp) {
            // Combine the inner layer's local position with the precomp
            // layer's own transform: outer = prePosition + R*S*(inner - preAnchor)
            var dx = snap.position[0] - preAnchor[0], dy = snap.position[1] - preAnchor[1];
            var sxp = dx * sx, syp = dy * sy;
            var rx = sxp * cos - syp * sin;
            var ry = sxp * sin + syp * cos;

            var newPos = pPos.value.slice(0);
            newPos[0] = prePosition[0] + rx;
            newPos[1] = prePosition[1] + ry;
            pPos.setValue(newPos);

            var combinedScale = pScale.value.slice(0);
            combinedScale[0] = snap.scale[0] * sx;
            combinedScale[1] = snap.scale[1] * sy;
            pScale.setValue(combinedScale);

            pRot.setValue(snap.rotation + preRotation);

            pOp.setValue((snap.opacity / 100) * (preOpacity / 100) * 100);
          }
          // "delete": the transform is left exactly as it was inside the pre-comp.

          // Timing (both modes): line up the inner comp's local time 0 with
          // where the precomp layer starts in the parent comp.
          newLayer.startTime = preStartTime + snap.startTime;
          newLayer.inPoint = preStartTime + snap.inPoint;
          newLayer.outPoint = preStartTime + snap.outPoint;
        } catch (perLayerErr) {
          // leave that one layer with its raw pasted transform if the math above fails
        }
      }

      // 3) Copy Attributes: carry the pre-comp layer's effects over to the extracted layers.
      var fxNote = copyAttrs ? _unpreCopyEffects(comp, preLayer, sortedPasted, copyCmd, pasteCmd) : "";

      // 4) Hide (don't delete) the original pre-comp layer, as a safety net.
      preLayer.enabled = false;
      preLayer.name = preName + " (unprecomposed)";

      var modeNote = copyAttrs
        ? " Pre-comp transform merged in."
        : " Pre-comp effects, masks and transform were discarded (raw layers).";
      return _ok(sortedPasted.length + ' layer(s) extracted from "' + preName + '".' + modeNote + fxNote +
        " The original pre-comp layer was disabled, not deleted.");
    } finally {
      app.endUndoGroup();
    }
  } catch (e) {
    return _err(e);
  }
}

// ---------- Optimize AE (Purge) ----------
// Called from JS as: TOOLS_optimizeAE("quarter") | ("half") | ("third") | ("keep")
// 1) optionally lowers the ACTIVE comp's preview resolution (Full / Half / Third / Quarter downsample)
// 2) purges all memory and disk cache: app.purge(PurgeTarget.ALL_CACHES)
// Note: "Auto" resolution is a viewer setting that After Effects doesn't expose to scripts, so only fixed
// downsample factors are offered. Purging may also clear the undo history, and the next preview re-caches.
function TOOLS_optimizeAE(resolution) {
  try {
    var factors = { keep: 0, half: 2, third: 3, quarter: 4 };
    var labels = { half: "Half", third: "Third", quarter: "Quarter" };
    var key = factors.hasOwnProperty(resolution) ? resolution : "quarter";
    var parts = [];

    // resolution first, so the purge also clears frames cached at the old resolution
    if (factors[key] > 0) {
      var comp = app.project.activeItem;
      if (comp instanceof CompItem) {
        app.beginUndoGroup("Optimize AE: " + labels[key] + " resolution");
        try {
          comp.resolutionFactor = [factors[key], factors[key]];
        } finally {
          app.endUndoGroup();
        }
        parts.push('"' + comp.name + '" set to ' + labels[key] + " resolution.");
      } else {
        parts.push("No active composition, so the resolution was left as is.");
      }
    }

    app.purge(PurgeTarget.ALL_CACHES);
    parts.unshift("Memory & disk cache purged.");

    return _ok(parts.join(" "));
  } catch (e) {
    return _err(e);
  }
}

// ---------- Beat Marker (Convert Audio to Keyframes) ----------
// Called from JS as: TOOLS_convertAudioToKeyframes(threshold, markerTarget)
//   threshold     Number 1-100. Percentage of that channel's own keyframed peak value below which
//                 amplitude is clipped to 0 - higher = only louder hits register as a beat.
//   markerTarget  "layer" | "comp". Where the detected beat markers are placed: "layer" drops
//                 them on the new "Audio Amplitude" null (as before); "comp" drops them on the
//                 composition's own marker track instead, visible on the time ruler no matter
//                 which layer is selected.
//
// Wraps AE's native Animation > Keyframe Assistant > "Convert Audio to Keyframes" command on the
// selected Audio layer, then clips the generated amplitude curve below the threshold so quieter
// background noise doesn't register as a "beat" - cleaner input for anything pick-whipped to the
// new null's Slider properties. The threshold is computed PER CHANNEL from that channel's own
// keyframed peak value (not a fixed number), so it scales correctly whatever the source audio's
// loudness happens to be. Clipping is applied as a small expression on each Slider
// ("value < t ? 0 : value") rather than by deleting keyframes, so re-running with a different
// threshold is fully reversible.
//
// A marker is also dropped at every point the "Both Channels" (or, failing that, whichever
// channel exists) slider rises above that same threshold - one marker per beat/onset, not per
// frame. Re-running the tool replaces this tool's own markers (comment "Beat") rather than piling
// up duplicates, and a minimum gap between markers (4 frames) filters out same-hit double-triggers.
function TOOLS_convertAudioToKeyframes(threshold, markerTarget) {
  // ---- strict checks first: if any fails, leave quietly (no exception, nothing touched) ----
  var comp = app.project ? app.project.activeItem : null;
  if (!(comp instanceof CompItem)) { return _notice("Open a composition first."); }

  var sel = comp.selectedLayers;
  var audioLayer = null;
  if (sel && sel.length) {
    for (var si = 0; si < sel.length; si++) {
      if (sel[si].hasAudio) { audioLayer = sel[si]; break; }
    }
  }
  if (!audioLayer) { return _notice("Please select an active Audio layer first."); }

  var pct = parseFloat(threshold);
  if (!isFinite(pct) || pct < 1) { pct = 1; }
  if (pct > 100) { pct = 100; }
  var ratio = pct / 100;
  var onComp = (markerTarget === "comp");

  try {
    var cmdId = app.findMenuCommandId("Convert Audio to Keyframes");
    if (!cmdId) { throw new Error("Could not find the \"Convert Audio to Keyframes\" command in this After Effects version."); }

    var nullLayer = null;
    var clipped = 0;
    var markerCount = 0;

    app.beginUndoGroup("Convert Audio to Keyframes");
    try {
      var before = comp.numLayers;
      app.executeCommand(cmdId);

      // AE inserts the new "Audio Amplitude" null at the very top of the layer stack.
      if (comp.numLayers > before) { nullLayer = comp.layer(1); }
      if (!nullLayer) { throw new Error("After Effects did not create an Audio Amplitude layer."); }

      // ---- clip (or clear clipping from) each amplitude channel ----
      var channelNames = ["Both Channels", "Left Channel", "Right Channel"];
      var beatSlider = null, beatMax = 0; // the channel used for marker/onset detection below
      for (var ci = 0; ci < channelNames.length; ci++) {
        var fx = null;
        try { fx = nullLayer.effect(channelNames[ci]); } catch (eFind) { fx = null; }
        if (!fx) { continue; } // e.g. mono source: only "Both Channels" exists

        var slider = null;
        try { slider = fx.property("Slider"); } catch (eProp) { slider = null; }
        if (!slider) { continue; }

        var maxVal = 0;
        try {
          for (var ki = 1; ki <= slider.numKeys; ki++) {
            var kv = slider.keyValue(ki);
            if (kv > maxVal) { maxVal = kv; }
          }
        } catch (eScan) { maxVal = 0; }

        if (!beatSlider && maxVal > 0) { beatSlider = slider; beatMax = maxVal; } // prefer the first found - "Both Channels"

        if (ratio <= 0) {
          try { slider.expression = ""; } catch (eClr) {} // "All Beats": raw curve, no expression
          continue;
        }
        if (maxVal <= 0) { continue; }

        try {
          slider.expression = "var t = " + (maxVal * ratio) + ";\nvalue < t ? 0 : value;";
          clipped++;
        } catch (eExpr) {}
      }

      // ---- add beat markers, one per onset (rising edge above threshold) ----
      // Markers are left unnamed (blank comment) per user preference; MULTITOOL_BEAT_TAG is
      // stashed in the hidden cuePointName field instead, purely so a re-run can find and replace
      // only this tool's own markers without touching any markers the user added by hand.
      var MULTITOOL_BEAT_TAG = "MultiToolBeatMarker";
      if (beatSlider && beatMax > 0) {
        var beatThreshold = beatMax * ratio;
        var markerProp = onComp ? comp.markerProperty : nullLayer.marker;

        // Clear this tool's own previously-added markers first, so re-running it doesn't stack duplicates.
        for (var mi = markerProp.numKeys; mi >= 1; mi--) {
          try { if (markerProp.keyValue(mi).cuePointName === MULTITOOL_BEAT_TAG) { markerProp.removeKey(mi); } } catch (eRm) {}
        }

        var minGap = comp.frameDuration * 4;
        var lastMark = -minGap;
        var wasAbove = false;
        var MAX_MARKERS = 500;
        for (var bi = 1; bi <= beatSlider.numKeys && markerCount < MAX_MARKERS; bi++) {
          var bv = beatSlider.keyValue(bi);
          var bt = beatSlider.keyTime(bi);
          var isAbove = bv >= beatThreshold;
          if (isAbove && !wasAbove && (bt - lastMark) >= minGap) {
            try {
              var mv = new MarkerValue("");
              mv.cuePointName = MULTITOOL_BEAT_TAG;
              markerProp.setValueAtTime(bt, mv);
              lastMark = bt; markerCount++;
            } catch (eMk) {}
          }
          wasAbove = isAbove;
        }
      }

      // Highlight the new layer: select it alone so it's the one shown/scrolled to in the Timeline.
      for (var li = 1; li <= comp.numLayers; li++) { comp.layer(li).selected = false; }
      nullLayer.selected = true;
    } finally {
      app.endUndoGroup();
    }

    var msg = "\"" + nullLayer.name + "\" created from \"" + audioLayer.name + "\" (threshold " + pct + "%).";
    msg += clipped ? " Amplitude clipped below threshold on " + clipped + " channel" + (clipped === 1 ? "" : "s") + "."
                   : " (No keyframed channels found to clip.)";
    msg += markerCount ? " " + markerCount + " beat marker" + (markerCount === 1 ? "" : "s") + " added to the " + (onComp ? "composition." : "layer.")
                        : " (No beat markers could be placed.)";
    return _ok(msg, { layerName: nullLayer.name, threshold: pct, markerTarget: onComp ? "comp" : "layer", markerCount: markerCount });
  } catch (e) {
    return _err(e);
  }
}

// ---------- Save Frame as Image (silent) ----------
// Renders the single frame at the comp's current time (CTI) to a still image via a temporary Render Queue
// item, then removes that item again. No dialog is shown: the file name is generated and the destination
// folder is passed in by the panel (which remembers it).
//   TOOLS_chooseSaveFolder(startPath)   opens the folder picker once, returns the chosen path
//   TOOLS_saveFrame(format, dirPath)    format "png" | "jpg";  writes <CompName>_Frame_<YYYYMMDD-HHMMSS>.<ext>
//
// Why the frame is rendered into a temp folder and then copied (instead of pointing the Output Module
// straight at the user's folder):
//  * AE's image-sequence writer appends a frame number to the file name ("Name_00012.png", sometimes even
//    "Name.png00012"). Rendering to temp and copying guarantees the file lands with EXACTLY the generated name.
//  * The format is VERIFIED after switching ("PNG Sequence" is not a default template and the "Format" string
//    is localized), and the render is refused if it is not PNG/JPEG.
//  * renderQueue.render() runs AFTER the undo group is closed (no "Undo group mismatch" warning); the group
//    only covers the queue setup, and finally{} closes it if anything threw first.

// Switches an Output Module to PNG or JPEG and proves it worked. Returns the format name AE reports.
function _sfSetImageFormat(om, isPng) {
  var want = isPng ? /png/i : /jpe?g/i;
  var names = isPng ? ["PNG Sequence"] : ["JPEG Sequence"];
  var i, s, tpls;

  function currentFormat() {
    try { return String(om.getSettings(GetSettingsFormat.STRING)["Format"]); } catch (e) { return ""; }
  }

  // 1) Ask for the format directly.
  for (i = 0; i < names.length; i++) {
    try { s = {}; s["Format"] = names[i]; om.setSettings(s); } catch (eSet) { /* try the next way */ }
    if (want.test(currentFormat())) { return currentFormat(); }
  }

  // 2) Any Output Module template whose name is a PNG / JPEG one (covers localized AE and custom templates).
  try {
    tpls = om.templates;
    for (i = 0; i < tpls.length; i++) {
      if (want.test(String(tpls[i]))) {
        try { om.applyTemplate(tpls[i]); } catch (eTpl) { continue; }
        if (want.test(currentFormat())) { return currentFormat(); }
      }
    }
  } catch (eList) { /* templates not readable */ }

  throw new Error("Could not switch the Output Module to " + (isPng ? "PNG" : "JPEG") +
    " (current format: \"" + currentFormat() + "\"). Create an Output Module template for it once " +
    "(Render Queue > Output Module > Format: " + (isPng ? "PNG Sequence" : "JPEG Sequence") + " > Make Template) and try again.");
}

// Readable name of a render-queue item's status (for error messages).
function _sfStatusName(item) {
  try {
    var v = item.status, names = ["WILL_CONTINUE", "NEEDS_OUTPUT", "UNQUEUED", "QUEUED", "RENDERING", "USER_STOPPED", "ERR_STOPPED", "DONE"];
    var enums = [RQItemStatus.WILL_CONTINUE, RQItemStatus.NEEDS_OUTPUT, RQItemStatus.UNQUEUED, RQItemStatus.QUEUED, RQItemStatus.RENDERING, RQItemStatus.USER_STOPPED, RQItemStatus.ERR_STOPPED, RQItemStatus.DONE];
    for (var i = 0; i < enums.length; i++) { if (enums[i] === v) { return names[i]; } }
    return String(v);
  } catch (e) { return "unknown"; }
}

// The rendered frame inside a folder. AE's sequence writer appends the frame number to the WHOLE name we gave
// it and can drop the extension ("frame.png" -> "frame.png00003"), so accept: a real .png/.jpg, a name with the
// number after the extension, or - as a last resort - any file that starts with our base name "frame".
function _sfFindImage(folder) {
  var files = folder.getFiles(), i, f, loose = null, numbered = null;
  for (i = 0; i < files.length; i++) {
    f = files[i];
    if (!(f instanceof File)) { continue; }
    if (/\.(png|jpe?g)$/i.test(f.name)) { return f; }
    if (!numbered && /\.(png|jpe?g)\d+$/i.test(f.name)) { numbered = f; }
    if (!loose && /^frame/i.test(f.name) && f.length > 0) { loose = f; }
  }
  return numbered || loose;
}

// File-name part without characters Windows/macOS do not allow. Falls back to "Comp".
function _sfSafeName(name) {
  var s = String(name || "").replace(/[\\\/:*?"<>|\x00-\x1f]/g, "_").replace(/\s+/g, "_").replace(/_+/g, "_").replace(/^[._]+|[._]+$/g, "");
  if (s.length > 60) { s = s.substring(0, 60); }
  return s.length ? s : "Comp";
}

// Timestamp for file names: 20260920-143012
function _sfStamp() {
  var d = new Date();
  function p(n) { return (n < 10 ? "0" : "") + n; }
  return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + "-" + p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds());
}

// A File in `folder` that does not exist yet: base.ext, or base_2.ext, base_3.ext ... if two saves share a second.
function _sfUniqueFile(folder, base, ext) {
  var f = new File(folder.fsName + "/" + base + "." + ext), n = 2;
  while (f.exists && n < 1000) { f = new File(folder.fsName + "/" + base + "_" + n + "." + ext); n++; }
  return f;
}

function _sfFail(code, message) { return _json({ ok: false, code: code, message: message }); }

// Folder picker for the "change save folder" icon. Opens at the previous folder when there is one.
// Returns {ok, message, data: {path, cancelled}}; path is the native path (fsName) to store in localStorage.
function TOOLS_chooseSaveFolder(startPath) {
  try {
    var start = null, picked;
    if (startPath) { try { start = new Folder(String(startPath)); } catch (eStart) { start = null; } }
    picked = (start && start.exists) ? start.selectDlg("Choose Save Destination") : Folder.selectDialog("Choose Save Destination");
    if (!picked) { return _ok("Cancelled. Save folder unchanged.", { cancelled: true, path: null }); }
    return _ok("Save folder set to \"" + picked.fsName + "\".", { cancelled: false, path: picked.fsName });
  } catch (e) {
    return _err(e);
  }
}

// ---------- Export GIF: render step ----------
// Renders the chosen time range of the active comp as a numbered PNG sequence (RGB + straight alpha) into a
// temp folder, through a temporary Render Queue item that is removed again. The panel (js/mt-gif.js) then
// encodes those PNGs into the .gif and deletes the temp folder, so After Effects needs no GIF plug-in.
//   TOOLS_gifRender(opts)   opts = { range: "work" | "comp", fps: 1-50, width: px }
//   returns data = { dir, files[], duration, fps, width, height, compName, safeName, stamp }
// The sequence is named gif_[#####].png: AE replaces [#####] with the frame number, so the files sort in order.
// Same safety rules as TOOLS_saveFrame: queue setup lives in the undo group, render() runs after it is closed,
// every other queued item is paused during the render and restored in finally{}.
function TOOLS_gifRender(opts) {
  var rqItem = null, undoOpen = false, pausedItems = [], tmpFolder = null, success = false;
  try {
    var comp = _activeComp();
    opts = opts || {};

    var range = (opts.range === "comp") ? "comp" : "work";
    var start = (range === "work") ? comp.workAreaStart : 0;
    var dur = (range === "work") ? comp.workAreaDuration : comp.duration;
    if (!(dur > 0)) { throw new Error("The selected time range is empty."); }

    var fps = Number(opts.fps);
    if (!isFinite(fps) || fps < 1) { fps = 15; }
    if (fps > 50) { fps = 50; }
    if (fps > comp.frameRate) { fps = comp.frameRate; }

    var wantW = Math.round(Number(opts.width));
    if (!isFinite(wantW) || wantW < 16) { wantW = 480; }
    var outW = Math.min(wantW, comp.width);
    var outH = Math.max(1, Math.round(outW * comp.height / comp.width));

    var estFrames = Math.max(1, Math.round(dur * fps));
    if (estFrames > 1000) {
      throw new Error("That would be about " + estFrames + " frames. Lower the frame rate or use a shorter range (limit: 1000 frames).");
    }

    // Temp folder the PNG sequence is written into.
    tmpFolder = new Folder(Folder.temp.fsName + "/MultiToolGif_" + new Date().getTime());
    if (!tmpFolder.create()) { throw new Error("Could not create a temporary folder for the render."); }

    // ---- 1) queue setup (inside the undo group) ----
    app.beginUndoGroup("Export GIF (render)");
    undoOpen = true;

    rqItem = app.project.renderQueue.items.add(comp);
    rqItem.timeSpanStart = start;
    rqItem.timeSpanDuration = dur;

    // Render at the GIF frame rate directly (fewer frames to render). Not every AE build accepts this setting;
    // when it is refused the panel simply picks every n-th frame of the full-rate sequence instead.
    try {
      rqItem.setSettings({ "Use this frame rate": fps });
    } catch (eRate1) {
      try { rqItem.setSettings({ "Frame Rate": fps }); } catch (eRate2) { /* panel subsamples */ }
    }

    var om = rqItem.outputModules[1];
    _sfSetImageFormat(om, true);                                         // throws unless the module really is PNG
    try { om.setSettings({ "Channels": "RGB + Alpha", "Color": "Straight (Unmatted)" }); } catch (eAlpha) { /* RGB only */ }
    if (outW < comp.width) {                                             // render small right away (faster); the panel scales anyway
      try { om.setSettings({ "Resize": true, "Resize to": [outW, outH], "Resize Quality": "High" }); } catch (eResize) { /* panel scales */ }
    }
    om.file = new File(tmpFolder.fsName + "/gif_[#####].png");

    // renderQueue.render() renders EVERY queued item: un-queue the others first (restored in finally).
    var rq = app.project.renderQueue, i, other;
    for (i = 1; i <= rq.numItems; i++) {
      other = rq.items[i];
      if (other !== rqItem && other.status === RQItemStatus.QUEUED) {
        pausedItems.push(other);
        other.status = RQItemStatus.UNQUEUED;
      }
    }
    if (rqItem.status !== RQItemStatus.QUEUED) { try { rqItem.status = RQItemStatus.QUEUED; } catch (eQueue) { /* checked below */ } }
    if (rqItem.status !== RQItemStatus.QUEUED) {
      throw new Error("The render item could not be queued (status " + _sfStatusName(rqItem) + ").");
    }

    app.endUndoGroup();                                                  // close BEFORE rendering
    undoOpen = false;

    // ---- 2) render (outside any undo group) ----
    rq.render();

    // ---- 3) collect the frames ----
    var all = tmpFolder.getFiles(), names = [], f;
    for (i = 0; i < all.length; i++) {
      f = all[i];
      if ((f instanceof File) && /\.png$/i.test(f.name) && f.length > 0) { names.push(f.name); }
    }
    names.sort();
    if (!names.length) {
      throw new Error("Render finished but no PNG frames were written. Render status: " + _sfStatusName(rqItem) + ".");
    }

    success = true;
    return _ok("Rendered " + names.length + " frames.", {
      dir: tmpFolder.fsName, files: names, duration: dur, fps: fps,
      width: outW, height: outH, compName: comp.name, safeName: _sfSafeName(comp.name), stamp: _sfStamp()
    });
  } catch (e) {
    return _err(e);
  } finally {
    if (undoOpen) { try { app.endUndoGroup(); } catch (eUndo) { /* nothing left to close */ } undoOpen = false; }
    for (var p = 0; p < pausedItems.length; p++) {
      try { pausedItems[p].status = RQItemStatus.QUEUED; } catch (eRestore) { /* item removed/changed elsewhere */ }
    }
    if (rqItem) { try { rqItem.remove(); } catch (eRemove) { /* queue item already gone */ } }
    // On success the panel owns the temp folder (it deletes it after encoding). On failure clean it up here.
    if (!success && tmpFolder) {
      try {
        var left = tmpFolder.getFiles();
        for (var t = 0; t < left.length; t++) { try { left[t].remove(); } catch (eFile) { } }
        tmpFolder.remove();
      } catch (eTmp) { /* temp cleanup is best effort */ }
    }
  }
}

function TOOLS_saveFrame(format, dirPath) {
  var rqItem = null;
  var undoOpen = false;
  var pausedItems = []; // other render-queue items we temporarily un-queue so render() only touches ours
  var tmpFolder = null;
  try {
    var comp = _activeComp();

    var fmt = String(format || "png").toUpperCase();
    if (fmt !== "PNG" && fmt !== "JPG" && fmt !== "JPEG") { fmt = "PNG"; }
    var isPng = (fmt === "PNG");
    var ext = isPng ? "png" : "jpg";

    var frameTime = comp.time;
    var frameNum = Math.round(frameTime * comp.frameRate);

    // Silent destination: the panel passes the remembered folder; the file name is generated (no dialog).
    if (!dirPath) { return _sfFail("NO_FOLDER", "Choose a save folder first."); }
    var destFolder = new Folder(String(dirPath));
    if (!destFolder.exists) { return _sfFail("NO_FOLDER", "The save folder no longer exists: \"" + dirPath + "\". Choose a new one."); }
    var outFile = _sfUniqueFile(destFolder, _sfSafeName(comp.name) + "_Frame_" + _sfStamp(), ext);

    // Temp folder the sequence writer renders into (the frame number suffix never reaches the user's folder).
    tmpFolder = new Folder(Folder.temp.fsName + "/MultiToolFrame_" + new Date().getTime());
    if (!tmpFolder.create()) { throw new Error("Could not create a temporary folder for the render."); }

    // ---- 1) queue setup: the ONLY part that lives inside the undo group ----
    app.beginUndoGroup("Save Frame as " + fmt);
    undoOpen = true;

    rqItem = app.project.renderQueue.items.add(comp);

    // Render exactly one frame: the current time indicator.
    rqItem.timeSpanStart = frameTime;
    rqItem.timeSpanDuration = comp.frameDuration;

    var om = rqItem.outputModules[1];
    _sfSetImageFormat(om, isPng);                         // throws unless the OM really is PNG/JPEG
    om.file = new File(tmpFolder.fsName + "/frame." + ext);

    // renderQueue.render() renders EVERY item whose status is QUEUED, so un-queue everything else first
    // (restored in finally). Otherwise any other queued comps already sitting in the render queue would render too.
    var rq = app.project.renderQueue, i, other;
    for (i = 1; i <= rq.numItems; i++) {
      other = rq.items[i];
      if (other !== rqItem && other.status === RQItemStatus.QUEUED) {
        pausedItems.push(other);
        other.status = RQItemStatus.UNQUEUED;
      }
    }

    // The item must be QUEUED or render() silently skips it (e.g. NEEDS_OUTPUT when the Output To path was rejected).
    if (rqItem.status !== RQItemStatus.QUEUED) { try { rqItem.status = RQItemStatus.QUEUED; } catch (eQueue) { /* checked below */ } }
    if (rqItem.status !== RQItemStatus.QUEUED) {
      throw new Error("The render item could not be queued (status " + _sfStatusName(rqItem) + "). Output path: " + om.file.fsName);
    }

    app.endUndoGroup();                                   // close BEFORE rendering
    undoOpen = false;

    // ---- 2) render (outside any undo group) ----
    rq.render();

    // ---- 3) pick up the rendered frame and copy it to the generated file name in the chosen folder ----
    var rendered = _sfFindImage(tmpFolder);

    // Fallback for PNG: newer AE builds can write a still directly, without the render queue.
    if (!rendered && isPng && typeof comp.saveFrameToPng === "function") {
      var direct = new File(tmpFolder.fsName + "/direct.png");
      try { comp.saveFrameToPng(frameTime, direct); } catch (eDirect) { /* reported below if it also fails */ }
      if (direct.exists) { rendered = direct; }
    }

    if (!rendered) {
      var listing = [], tf = tmpFolder.getFiles(), k;
      for (k = 0; k < tf.length; k++) { listing.push(tf[k].name); }
      throw new Error("Render finished but no " + fmt + " file was written. Render status: " + _sfStatusName(rqItem) +
        ". Output module format: " + (function () { try { return om.getSettings(GetSettingsFormat.STRING)["Format"]; } catch (e) { return "?"; } })() +
        ". Output path: " + om.file.fsName + ". Temp folder contains: " + (listing.length ? listing.join(", ") : "nothing") + ".");
    }
    if (!rendered.copy(outFile.fsName)) { throw new Error("Rendered the frame but could not write \"" + outFile.fsName + "\"."); }

    return _ok('Saved "' + outFile.name + '" to "' + destFolder.fsName + '".', { path: outFile.fsName, dir: destFolder.fsName, frame: frameNum, format: fmt });
  } catch (e) {
    return _err(e);
  } finally {
    // Runs on success, on error and on early return. endUndoGroup is called exactly once, whatever happened.
    if (undoOpen) { try { app.endUndoGroup(); } catch (eUndo) { /* nothing left to close */ } undoOpen = false; }
    for (var p = 0; p < pausedItems.length; p++) {
      try { pausedItems[p].status = RQItemStatus.QUEUED; } catch (eRestore) { /* item was removed/changed elsewhere */ }
    }
    if (rqItem) { try { rqItem.remove(); } catch (eRemove) { /* queue item already gone */ } }
    if (tmpFolder) {
      try {
        var left = tmpFolder.getFiles();
        for (var t = 0; t < left.length; t++) { try { left[t].remove(); } catch (eFile) {} }
        tmpFolder.remove();
      } catch (eTmp) { /* temp cleanup is best effort */ }
    }
  }
}

// =====================================================================
// CURVE TAB - NeuCurve host script (migrated 1:1 from NeuCurve host/index.jsx)
// The Curve panel calls these by their bare global names through evalScript
// (ping, applyCubicBezier, applyElastic, applyBounce, applySteps, applyWave,
//  applyCustomPath, applyExpressionPreset, readGraphFromAE, removeExpressions,
//  getPlayheadInfo, showNativeColorPicker, getDebugLog, clearDebugLog ...).
// They must stay global and un-prefixed. Verified: no name in this section
// collides with anything above (Multi Tool uses EL_/EXP_/PRE_/TXT_/AA_/TOOLS_/
// RND_/LBL_/COLOR_/EXPR_ prefixes and _underscore helpers).
// =====================================================================

/**
 * host/index.jsx
 * ExtendScript — berjalan di dalam engine After Effects.
 * Semua fungsi dipanggil dari Svelte via CSInterface.evalScript().
 *
 * PENTING: File ini adalah CommonScript / ExtendScript (ES3),
 * bukan JavaScript modern. Hindari arrow function, const/let, template literal.
 */

// ─────────────────────────────────────────────
// CONSOLE SHIM untuk AE 2019
// Mencegah crash "console is undefined" jika ada library/internal yang memanggilnya.
// ─────────────────────────────────────────────
if (typeof console === "undefined") {
    console = {
        log: function () { },
        warn: function () { },
        error: function () { },
        info: function () { }
    };
}

// ─────────────────────────────────────────────
// NEUCURVE DEBUG LOGGER
// Gunakan ncLog("pesan") di mana saja di file ini.
// Ambil log via getDebugLog() dari Chrome DevTools console.
// ─────────────────────────────────────────────
var NC_DEBUG_LOGS = [];
var NC_MAX_LOGS = 200;

function ncLog(level, msg) {
    if (msg === undefined) { msg = level; level = "INFO"; }
    var ts = "";
    try { ts = (new Date()).toISOString().substr(11, 8); } catch(e) {}
    var entry = "[" + ts + "][" + level + "] " + msg;
    NC_DEBUG_LOGS.push(entry);
    if (NC_DEBUG_LOGS.length > NC_MAX_LOGS) NC_DEBUG_LOGS.shift();
    try { $.writeln(entry); } catch(e) {}
}

function getDebugLog() {
    return JSON.stringify({ logs: NC_DEBUG_LOGS });
}

function clearDebugLog() {
    NC_DEBUG_LOGS = [];
    return JSON.stringify({ success: true });
}

// ─────────────────────────────────────────────
// JSON POLYFILL untuk AE 2019 (ExtendScript ES3)
// AE 2021+ sudah memiliki JSON bawaan, polyfill ini hanya aktif jika belum ada.
// Minimal ES3-safe implementation — no "use strict", no modern JS features.
// ─────────────────────────────────────────────
if (typeof JSON !== "object" || JSON === null) {
    JSON = {};
}

if (typeof JSON.stringify !== "function") {
    JSON.stringify = function (val) {
        if (val === null || typeof val === "undefined") return "null";
        if (typeof val === "number") return isFinite(val) ? String(val) : "null";
        if (typeof val === "boolean") return String(val);
        if (typeof val === "string") {
            var escaped = val.replace(/\\/g, "\\\\")
                .replace(/"/g, '\\"')
                .replace(/\n/g, "\\n")
                .replace(/\r/g, "\\r")
                .replace(/\t/g, "\\t");
            return '"' + escaped + '"';
        }
        if (typeof val === "object") {
            // Array
            if (val instanceof Array || Object.prototype.toString.call(val) === "[object Array]") {
                var arrParts = [];
                for (var i = 0; i < val.length; i++) {
                    var item = JSON.stringify(val[i]);
                    arrParts.push(item === undefined ? "null" : item);
                }
                return "[" + arrParts.join(",") + "]";
            }
            // Object
            var objParts = [];
            for (var k in val) {
                if (val.hasOwnProperty(k)) {
                    var v = JSON.stringify(val[k]);
                    if (v !== undefined) {
                        objParts.push(JSON.stringify(k) + ":" + v);
                    }
                }
            }
            return "{" + objParts.join(",") + "}";
        }
        return undefined;
    };
}

if (typeof JSON.parse !== "function") {
    JSON.parse = function (text) {
        try {
            return eval("(" + text + ")");
        } catch (e) {
            throw new Error("JSON.parse: invalid JSON");
        }
    };
}


function showNativeColorPicker(jsonParams) {
    try {
        var initialDecimal = 0;
        if (jsonParams) {
            initialDecimal = parseInt(JSON.parse(jsonParams));
        }
        
        var result = -1;
        // Mencoba app.showColorPicker (standar AE)
        if (typeof app.showColorPicker === "function") {
            result = app.showColorPicker(initialDecimal);
        } 
        // Fallback ke $.colorPicker (standar ExtendScript) jika app.showColorPicker tidak ada
        else if (typeof $.colorPicker === "function") {
            result = $.colorPicker(initialDecimal);
        } else {
            return JSON.stringify({ error: "No color picker found in AE engine." });
        }

        if (result === -1) return JSON.stringify({ cancelled: true });

        function toHex(n) {
            var h = n.toString(16);
            while (h.length < 6) h = '0' + h;
            return "#" + h;
        }
        
        return JSON.stringify({ hex: toHex(result) });
    } catch (e) {
        return JSON.stringify({ error: e.toString() });
    }
}

// ─────────────────────────────────────────────
// UTILITIES
// ─────────────────────────────────────────────

function getSelectedKeyframes() {
    var result = [];
    var comp = app.project.activeItem;
    if (!comp || !(comp instanceof CompItem)) {
        return JSON.stringify({ error: "Tidak ada komposisi aktif." });
    }
    for (var i = 1; i <= comp.numLayers; i++) {
        var layer = comp.layer(i);
        collectSelectedKeyframes(layer, result, layer.name);
    }
    return JSON.stringify(result);
}

function collectSelectedKeyframes(propGroup, result, layerName) {
    if (!propGroup) return;
    for (var i = 1; i <= propGroup.numProperties; i++) {
        var prop = propGroup.property(i);
        if (prop.propertyType === PropertyType.PROPERTY) {
            for (var k = 1; k <= prop.numKeys; k++) {
                if (prop.keySelected(k)) {
                    result.push({
                        layer: layerName,
                        property: prop.name,
                        keyIndex: k,
                        time: prop.keyTime(k),
                        value: prop.keyValue(k).toString()
                    });
                }
            }
        } else if (prop.propertyType === PropertyType.INDEXED_GROUP ||
            prop.propertyType === PropertyType.NAMED_GROUP) {
            collectSelectedKeyframes(prop, result, layerName);
        }
    }
}

// ─────────────────────────────────────────────
// CUBIC BEZIER MATH HELPERS
// ─────────────────────────────────────────────

/**
 * Evaluasi posisi Y kurva cubic bezier pada parameter t (0-1)
 * Standard cubic bezier: B(t) = (1-t)^3*P0 + 3(1-t)^2*t*P1 + 3(1-t)*t^2*P2 + t^3*P3
 * P0=(0,0), P3=(1,1), P1=(p1x,p1y), P2=(p2x,p2y)
 */
function bezierY(t, p1x, p1y, p2x, p2y, yStart, yEnd) {
    var mt = 1 - t;
    var ys = yStart !== undefined ? yStart : 0.0;
    var ye = yEnd !== undefined ? yEnd : 1.0;
    return mt * mt * mt * ys + 3 * mt * mt * t * p1y + 3 * mt * t * t * p2y + t * t * t * ye;
}

function bezierX(t, p1x, p1y, p2x, p2y) {
    var mt = 1 - t;
    return mt * mt * mt * 0 + 3 * mt * mt * t * p1x + 3 * mt * t * t * p2x + t * t * t * 1;
}

/**
 * Turunan pertama Y terhadap t
 * dB/dt = 3(1-t)^2*(P1-P0) + 6(1-t)*t*(P2-P1) + 3t^2*(P3-P2)
 */
function bezierDY(t, p1x, p1y, p2x, p2y) {
    var mt = 1 - t;
    return 3 * mt * mt * (p1y - 0) + 6 * mt * t * (p2y - p1y) + 3 * t * t * (1 - p2y);
}

function bezierDX(t, p1x, p1y, p2x, p2y) {
    var mt = 1 - t;
    return 3 * mt * mt * (p1x - 0) + 6 * mt * t * (p2x - p1x) + 3 * t * t * (1 - p2x);
}

/**
 * Turunan kedua Y terhadap t (untuk deteksi titik balik)
 */
function bezierDDY(t, p1x, p1y, p2x, p2y) {
    return 6 * (1 - t) * (p2y - 2 * p1y + 0) + 6 * t * (1 - 2 * p2y + p1y);
}

/**
 * Cari parameter t dari nilai x menggunakan binary search
 */
function tFromX(x, p1x, p1y, p2x, p2y) {
    var lo = 0, hi = 1, t = x;
    for (var i = 0; i < 20; i++) {
        var bx = bezierX(t, p1x, p1y, p2x, p2y);
        if (Math.abs(bx - x) < 0.00001) break;
        if (bx < x) lo = t; else hi = t;
        t = (lo + hi) / 2;
    }
    return t;
}

/**
 * Hitung slope dy/dx di titik x (bukan dy/dt)
 * slope = (dy/dt) / (dx/dt)
 */
function slopeAtX(x, p1x, p1y, p2x, p2y) {
    var t = tFromX(x, p1x, p1y, p2x, p2y);
    var dx = bezierDX(t, p1x, p1y, p2x, p2y);
    var dy = bezierDY(t, p1x, p1y, p2x, p2y);
    if (Math.abs(dx) < 0.0001) return dy > 0 ? 999 : -999;
    return dy / dx;
}

/**
 * Cari semua titik kritis (puncak/lembah/titik balik) di kurva
 * Titik kritis = titik dimana dy/dt = 0
 * Kembalikan array nilai x dari titik kritis tersebut
 */
function findCriticalPoints(p1x, p1y, p2x, p2y) {
    var criticals = [];
    var SAMPLES = 500;
    var prevDY = bezierDY(0, p1x, p1y, p2x, p2y);

    for (var i = 1; i <= SAMPLES; i++) {
        var t = i / SAMPLES;
        var currDY = bezierDY(t, p1x, p1y, p2x, p2y);

        // Deteksi zero crossing (tanda berubah) = titik kritis
        if (prevDY * currDY < 0) {
            // Binary search untuk menemukan t yang tepat
            var lo = (i - 1) / SAMPLES;
            var hi = t;
            for (var j = 0; j < 20; j++) {
                var mid = (lo + hi) / 2;
                var midDY = bezierDY(mid, p1x, p1y, p2x, p2y);
                if (Math.abs(midDY) < 0.0001) break;
                if (prevDY * midDY < 0) hi = mid;
                else lo = mid;
            }
            var critT = (lo + hi) / 2;
            var critX = bezierX(critT, p1x, p1y, p2x, p2y);
            // Hanya tambahkan kalau tidak terlalu dekat dengan 0 atau 1
            if (critX > 0.02 && critX < 0.98) {
                criticals.push(critX);
            }
        }
        prevDY = currDY;
    }
    return criticals;
}

/**
 * Hitung influence (0-99) dari slope di titik x
 * Slope tinggi = kurva cepat = influence kecil
 * Slope rendah = kurva lambat = influence besar
 *
 * Ini adalah konversi slope → influence yang membuat
 * handle di AE Graph Editor sesuai dengan plugin
 */
function influenceFromSlope(slope, segmentWidth) {
    // slope dalam satuan (nilai/waktu_normalized)
    // segmentWidth = lebar segmen dalam satuan x (0-1)
    // influence = panjang handle / lebar segmen * 100
    //
    // Untuk kurva Bezier, handle length ≈ 1/3 segmen
    // dengan koreksi berdasarkan slope
    var absSlope = Math.abs(slope);

    // Konversi slope ke influence
    // slope ≈ 0 (flat) → influence besar (handle panjang)
    // slope ≈ ∞ (vertical) → influence kecil (handle pendek)
    var influence;
    if (absSlope > 100) {
        influence = 1;
    } else if (absSlope < 0.001) {
        influence = 99;
    } else {
        // influence berbanding terbalik dengan slope
        // dikalibrasi agar mirip dengan tampilan Flow
        influence = Math.min(99, Math.max(1, 33.33 / (absSlope * segmentWidth + 0.001) * 0.5));
    }
    return influence;
}

// ─────────────────────────────────────────────
// MODEL 1 — CUBIC BEZIER
// Smart critical-point baking — seperti Flow
// ─────────────────────────────────────────────

function applyCubicBezier(jsonParams) {
    var p = JSON.parse(jsonParams);
    ncLog("INFO", "applyCubicBezier: mode=" + (p.mode || "simple") + " p1=[" + p.p1x + "," + p.p1y + "] p2=[" + p.p2x + "," + p.p2y + "]");
    app.beginUndoGroup("Curve Editor: Apply Cubic Bezier");
    try {
        var comp = app.project.activeItem;
        if (!comp || !(comp instanceof CompItem)) {
            ncLog("WARN", "applyCubicBezier: no active comp");
            return JSON.stringify({ error: "Tidak ada komposisi aktif." });
        }

        var count = 0;
        for (var i = 1; i <= comp.numLayers; i++) {
            var layer = comp.layer(i);
            count += applyBezierSimple(layer, p);
        }

        ncLog("INFO", "applyCubicBezier: done, keyframesModified=" + count);
        app.endUndoGroup();
        return JSON.stringify({ success: true, keyframesModified: count });
    } catch (e) {
        ncLog("ERROR", "applyCubicBezier: " + e.toString());
        app.endUndoGroup();
        return JSON.stringify({ error: e.toString() });
    }
}

function bakeBezierSegment(prop, k, p, yStart, yEnd, stretchFactor) {
    var t1 = prop.keyTime(k);
    var t2 = prop.keyTime(k + 1);
    var v1 = prop.keyValue(k);
    var v2 = prop.keyValue(k + 1);
    var duration = t2 - t1;
    if (duration <= 0) return 0;

    var valType = prop.propertyValueType;
    var dim = (v1 !== undefined && v1.length !== undefined) ? v1.length : 1;

    var N = 10;
    var createdKeys = [];
    for (var s = 1; s < N; s++) {
        var x = s / N;
        var tParam = tFromX(x, p.p1x, p.p1y, p.p2x, p.p2y);
        var y = bezierY(tParam, p.p1x, p.p1y, p.p2x, p.p2y, yStart, yEnd);
        
        var tTime = t1 + x * duration;
        var val;
        if (dim > 1) {
            val = [];
            for (var d = 0; d < dim; d++) {
                val[d] = v1[d] + (v2[d] - v1[d]) * y;
            }
        } else {
            val = v1 + (v2 - v1) * y;
        }
        var newKeyIdx = prop.addKey(tTime);
        prop.setValueAtKey(newKeyIdx, val);
        createdKeys.push(newKeyIdx);
    }
    
    for (var i = 0; i < createdKeys.length; i++) {
        var newKey = createdKeys[i];
        try {
            prop.setInterpolationTypeAtKey(newKey, KeyframeInterpolationType.BEZIER, KeyframeInterpolationType.BEZIER);
            var easeObj = new KeyframeEase(0, 33.33);
            prop.setTemporalEaseAtKey(newKey, [easeObj], [easeObj]);
        } catch (e) { }
    }
    
    return N - 1;
}

/**
 * Mode SIMPLE — kurva normal tanpa overshoot
 * Hanya set temporalEase di keyframe yang ada, tidak tambah keyframe baru
 */
function applyBezierSimple(propGroup, p) {
    var count = 0;
    if (!propGroup) return count;
    var yStart = p.yStart !== undefined ? p.yStart : 0.0;
    var yEnd = p.yEnd !== undefined ? p.yEnd : 1.0;

    for (var i = 1; i <= propGroup.numProperties; i++) {
        var prop = propGroup.property(i);

        if (prop.propertyType === PropertyType.PROPERTY && prop.numKeys > 0) {
            var vt = prop.propertyValueType;

            var selectedKeys = [];
            for (var k = 1; k <= prop.numKeys; k++) {
                if (prop.keySelected(k)) selectedKeys.push(k);
            }
            if (selectedKeys.length === 0) continue;

            // Segments to shape: segFrom[k] = true means the segment k -> k+1 gets the graph.
            //  - two neighbouring selected keys  -> the segment between them (as before)
            //  - a selected key with NO selected neighbour (e.g. one click among many keyframes) -> the segment
            //    after it (k -> k+1); on the last keyframe, the segment before it (k-1 -> k).
            // Without this an isolated key had neither prevSelected nor nextSelected, so only its interpolation
            // type was touched and the graph never changed.
            var segFrom = {};
            var numK = prop.numKeys;
            for (var sk = 0; sk < selectedKeys.length; sk++) {
                var kk = selectedKeys[sk];
                var selNext = (kk < numK && prop.keySelected(kk + 1));
                var selPrev = (kk > 1 && prop.keySelected(kk - 1));
                if (selNext) { segFrom[kk] = true; }
                else if (!selPrev) {
                    if (kk < numK) { segFrom[kk] = true; }
                    else if (kk > 1) { segFrom[kk - 1] = true; }
                }
            }
            // Keys to process = every key touching a segment (selected ones + the unselected end of a segment).
            var touched = {}, processKeys = [];
            for (var sf in segFrom) {
                if (!segFrom.hasOwnProperty(sf)) continue;
                var sfi = parseInt(sf, 10);
                touched[sfi] = true; touched[sfi + 1] = true;
            }
            for (var tk = numK; tk >= 1; tk--) { if (touched[tk]) processKeys.push(tk); }
            // Selected keys that ended up in no segment (single-keyframe property): nothing to shape.
            if (processKeys.length === 0) continue;
            var origSelected = {};
            for (var os = 0; os < selectedKeys.length; os++) { origSelected[selectedKeys[os]] = true; }
            selectedKeys = processKeys.slice(0).reverse();   // ascending, so selectedKeys[0] stays the first key

            // Batasi nilai X agar tidak devide by zero (min 0.1% / 0.001)
            var infX1 = Math.max(0.001, Math.min(0.999, p.p1x));
            var infX2 = Math.max(0.001, Math.min(0.999, 1 - p.p2x));

            // Check if this is a Shape/Mask Path or Custom Value — needs special handling (influence only, no speed)
            var isShapeOrCustom = (vt === PropertyValueType.SHAPE || vt === PropertyValueType.CUSTOM_VALUE);

            for (var si = selectedKeys.length - 1; si >= 0; si--) {
                var k = selectedKeys[si];
                var prevSelected = (k > 1 && segFrom[k - 1] === true);
                var nextSelected = (k < prop.numKeys && segFrom[k] === true);

                if (nextSelected && infX1 <= 0.015 && infX2 <= 0.015 && p.forceBake) {
                    try {
                        var stretchFactor = 1.0;
                        try {
                            var curr = prop;
                            while (curr && curr.parentProperty && !(curr instanceof AVLayer || curr instanceof ShapeLayer || curr instanceof TextLayer || curr instanceof CameraLayer || curr instanceof LightLayer)) {
                                curr = curr.parentProperty;
                            }
                            if (curr && curr.stretch !== undefined) {
                                stretchFactor = curr.stretch / 100.0;
                            }
                        } catch (e) { }
                        if (isNaN(stretchFactor) || stretchFactor <= 0) stretchFactor = 1.0;
                        
                        count += bakeBezierSegment(prop, k, p, yStart, yEnd, stretchFactor);
                        
                        prop.setInterpolationTypeAtKey(k, KeyframeInterpolationType.BEZIER, KeyframeInterpolationType.BEZIER);
                        prop.setInterpolationTypeAtKey(k + 1, KeyframeInterpolationType.BEZIER, KeyframeInterpolationType.BEZIER);
                        var easeK = new KeyframeEase(0, 33.33);
                        prop.setTemporalEaseAtKey(k, prop.keyInTemporalEase(k), [easeK]);
                        prop.setTemporalEaseAtKey(k + 1, [easeK], prop.keyOutTemporalEase(k + 1));
                    } catch (e) { }
                    continue;
                }

                try {
                    // Read existing ease BEFORE changing interpolation type
                    // so we get the actual current values (not post-conversion defaults).
                    // Clamp influence to AE's valid range [0.1, 100] to prevent
                    // errors when keyframe was HOLD/LINEAR (influence could be 0).
                    var existingEaseIn = prop.keyInTemporalEase(k);
                    var existingEaseOut = prop.keyOutTemporalEase(k);

                    if (origSelected[k]) {
                        prop.setInterpolationTypeAtKey(k,
                            KeyframeInterpolationType.BEZIER,
                            KeyframeInterpolationType.BEZIER);
                    } else {
                        // Unselected neighbour at the end of a segment: only the side facing the segment becomes
                        // Bezier, its other side keeps whatever interpolation it had.
                        var keepIn = prop.keyInInterpolationType(k);
                        var keepOut = prop.keyOutInterpolationType(k);
                        prop.setInterpolationTypeAtKey(k,
                            prevSelected ? KeyframeInterpolationType.BEZIER : keepIn,
                            nextSelected ? KeyframeInterpolationType.BEZIER : keepOut);
                    }

                    var valType = prop.propertyValueType;
                    var dim = 1;
                    if (valType !== PropertyValueType.CUSTOM_VALUE) {
                        try {
                            var vFirst = prop.keyValue(selectedKeys[0]);
                            if (vFirst && vFirst.length !== undefined) dim = vFirst.length;
                        } catch (e) { }
                    }

                    var stretchFactor = 1.0;
                    try {
                        var curr = prop;
                        while (curr && curr.parentProperty && !(curr instanceof AVLayer || curr instanceof ShapeLayer || curr instanceof TextLayer || curr instanceof CameraLayer || curr instanceof LightLayer)) {
                            curr = curr.parentProperty;
                        }
                        if (curr && curr.stretch !== undefined) {
                            stretchFactor = curr.stretch / 100.0;
                        }
                    } catch (e) { }
                    if (isNaN(stretchFactor) || stretchFactor <= 0) stretchFactor = 1.0;

                    var isSpatial = (valType === PropertyValueType.TwoD_SPATIAL || valType === PropertyValueType.ThreeD_SPATIAL);
                    var isColorProp = (valType === PropertyValueType.COLOR);
                    var easeInArray = [];
                    var easeOutArray = [];

                    if (isShapeOrCustom || isColorProp) {
                        // For unreadable/complex values, assume a normalized delta value of 1.0
                        var dv = 1.0;
                        if (prevSelected) {
                            var dtIn = prop.keyTime(k) - prop.keyTime(k - 1);
                            var speedIn = 0;
                            if (dtIn > 0) speedIn = ((yEnd - p.p2y) / infX2) * (dv / dtIn) * stretchFactor;
                            easeInArray.push(new KeyframeEase(speedIn, infX2 * 100));
                        } else {
                            var safeInInf = Math.max(0.1, Math.min(100, existingEaseIn[0].influence));
                            easeInArray.push(new KeyframeEase(existingEaseIn[0].speed, safeInInf));
                        }
                        if (nextSelected) {
                            var dtOut = prop.keyTime(k + 1) - prop.keyTime(k);
                            var speedOut = 0;
                            if (dtOut > 0) speedOut = ((p.p1y - yStart) / infX1) * (dv / dtOut) * stretchFactor;
                            easeOutArray.push(new KeyframeEase(speedOut, infX1 * 100));
                        } else {
                            var safeOutInf = Math.max(0.1, Math.min(100, existingEaseOut[0].influence));
                            easeOutArray.push(new KeyframeEase(existingEaseOut[0].speed, safeOutInf));
                        }
                    } else if (isSpatial) {
                        // Spatial property butuh 1 Speed untuk mengontrol kecepatan sepanjang path
                        if (prevSelected) {
                            var speedIn = 0;
                            var dtIn = prop.keyTime(k) - prop.keyTime(k - 1);
                            var v1 = prop.keyValue(k - 1), v2 = prop.keyValue(k);
                            var dx = v2[0] - v1[0], dy = v2[1] - v1[1], dz = (dim === 3) ? (v2[2] - v1[2]) : 0;
                            var dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
                            if (dtIn > 0) speedIn = ((yEnd - p.p2y) / infX2) * (dist / dtIn) * stretchFactor;
                            easeInArray.push(new KeyframeEase(speedIn, infX2 * 100));
                        } else {
                            var safeInInf = Math.max(0.1, Math.min(100, existingEaseIn[0].influence));
                            easeInArray.push(new KeyframeEase(existingEaseIn[0].speed, safeInInf));
                        }
                        if (nextSelected) {
                            var speedOut = 0;
                            var dtOut = prop.keyTime(k + 1) - prop.keyTime(k);
                            var v1 = prop.keyValue(k), v2 = prop.keyValue(k + 1);
                            var dx = v2[0] - v1[0], dy = v2[1] - v1[1], dz = (dim === 3) ? (v2[2] - v1[2]) : 0;
                            var dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
                            if (dtOut > 0) speedOut = ((p.p1y - yStart) / infX1) * (dist / dtOut) * stretchFactor;
                            easeOutArray.push(new KeyframeEase(speedOut, infX1 * 100));
                        } else {
                            var safeOutInf = Math.max(0.1, Math.min(100, existingEaseOut[0].influence));
                            easeOutArray.push(new KeyframeEase(existingEaseOut[0].speed, safeOutInf));
                        }

                    } else {
                        // Multi-dimensional regular (Scale, Rotation, dll) -> hitung per sumbu
                        for (var d = 0; d < dim; d++) {
                            var safeInfX1 = infX1;
                            var safeInfX2 = infX2;
                            if (prevSelected) {
                                var speedIn = 0;
                                var dtIn = prop.keyTime(k) - prop.keyTime(k - 1);
                                var v1 = prop.keyValue(k - 1), v2 = prop.keyValue(k);
                                var dv = (dim > 1) ? (v2[d] - v1[d]) : (v2 - v1);
                                if (dtIn > 0) speedIn = ((yEnd - p.p2y) / safeInfX2) * (dv / dtIn) * stretchFactor;
                                easeInArray.push(new KeyframeEase(speedIn, infX2 * 100));
                            } else {
                                var ein = existingEaseIn.length > d ? existingEaseIn[d] : existingEaseIn[0];
                                var safeInInf = Math.max(0.1, Math.min(100, ein.influence));
                                easeInArray.push(new KeyframeEase(ein.speed, safeInInf));
                            }
                            if (nextSelected) {
                                var speedOut = 0;
                                var dtOut = prop.keyTime(k + 1) - prop.keyTime(k);
                                var v1 = prop.keyValue(k), v2 = prop.keyValue(k + 1);
                                var dv = (dim > 1) ? (v2[d] - v1[d]) : (v2 - v1);
                                if (dtOut > 0) speedOut = ((p.p1y - yStart) / safeInfX1) * (dv / dtOut) * stretchFactor;
                                easeOutArray.push(new KeyframeEase(speedOut, infX1 * 100));
                            } else {
                                var eout = existingEaseOut.length > d ? existingEaseOut[d] : existingEaseOut[0];
                                var safeOutInf = Math.max(0.1, Math.min(100, eout.influence));
                                easeOutArray.push(new KeyframeEase(eout.speed, safeOutInf));
                            }
                        }
                    }

                    prop.setTemporalEaseAtKey(k, easeInArray, easeOutArray);
                    count++;
                } catch (e) {
                    throw new Error("Error at key " + k + ": " + e.toString());
                }
            }

        } else if (prop.propertyType === PropertyType.INDEXED_GROUP ||
            prop.propertyType === PropertyType.NAMED_GROUP) {
            count += applyBezierSimple(prop, p);
        }
    }
    return count;
}


function applyBezierSmartBake(propGroup, p) {
    var count = 0;
    if (!propGroup) return count;
    var yStart = p.yStart !== undefined ? p.yStart : 0.0;
    var yEnd = p.yEnd !== undefined ? p.yEnd : 1.0;

    // Cari titik kritis sekali saja
    var criticalXs = findCriticalPoints(p.p1x, p.p1y, p.p2x, p.p2y);

    for (var i = 1; i <= propGroup.numProperties; i++) {
        var prop = propGroup.property(i);

        if (prop.propertyType === PropertyType.PROPERTY && prop.numKeys >= 2) {
            var vt = prop.propertyValueType;
            if (vt === PropertyValueType.CUSTOM_VALUE || vt === PropertyValueType.SHAPE) {
                // Fallback for properties that cannot be overshot: Apply simple influence-only easing
                var selectedKeys = [];
                for (var k = 1; k <= prop.numKeys; k++) {
                    if (prop.keySelected(k)) selectedKeys.push(k);
                }
                if (selectedKeys.length === 0) continue;

                var infX1 = Math.max(0.001, Math.min(0.999, p.p1x));
                var infX2 = Math.max(0.001, Math.min(0.999, 1 - p.p2x));

                for (var si = 0; si < selectedKeys.length; si++) {
                    var k = selectedKeys[si];
                    var prevSelected = (k > 1 && prop.keySelected(k - 1));
                    var nextSelected = (k < prop.numKeys && prop.keySelected(k + 1));
                    try {
                        var existingEaseIn = prop.keyInTemporalEase(k);
                        var existingEaseOut = prop.keyOutTemporalEase(k);
                        prop.setInterpolationTypeAtKey(k, KeyframeInterpolationType.BEZIER, KeyframeInterpolationType.BEZIER);

                        var easeInArray = [];
                        var easeOutArray = [];

                        var dv = 1.0;
                        if (prevSelected) {
                            var dtIn = prop.keyTime(k) - prop.keyTime(k - 1);
                            var speedIn = 0;
                            if (dtIn > 0) speedIn = ((yEnd - p.p2y) / infX2) * (dv / dtIn);
                            easeInArray.push(new KeyframeEase(speedIn, infX2 * 100));
                        } else {
                            var safeInInf = Math.max(0.1, Math.min(100, existingEaseIn[0].influence));
                            easeInArray.push(new KeyframeEase(existingEaseIn[0].speed, safeInInf));
                        }

                        if (nextSelected) {
                            var dtOut = prop.keyTime(k + 1) - prop.keyTime(k);
                            var speedOut = 0;
                            if (dtOut > 0) speedOut = ((p.p1y - yStart) / infX1) * (dv / dtOut);
                            easeOutArray.push(new KeyframeEase(speedOut, infX1 * 100));
                        } else {
                            var safeOutInf = Math.max(0.1, Math.min(100, existingEaseOut[0].influence));
                            easeOutArray.push(new KeyframeEase(existingEaseOut[0].speed, safeOutInf));
                        }

                        prop.setTemporalEaseAtKey(k, easeInArray, easeOutArray);
                        count++;
                    } catch (e) { }
                }
                continue;
            }

            var firstKey = -1, lastKey = -1;
            for (var k = 1; k <= prop.numKeys; k++) {
                if (prop.keySelected(k)) {
                    if (firstKey === -1) firstKey = k;
                    lastKey = k;
                }
            }
            if (firstKey === -1 || firstKey === lastKey) continue;

            var t1 = prop.keyTime(firstKey);
            var t2 = prop.keyTime(lastKey);
            var v1 = prop.keyValue(firstKey);
            var v2 = prop.keyValue(lastKey);
            var duration = t2 - t1;

            // Hapus keyframe lama di tengah
            for (var k = lastKey - 1; k > firstKey; k--) {
                prop.removeKey(k);
            }

            // Buat keyframe di setiap titik kritis
            for (var ci = 0; ci < criticalXs.length; ci++) {
                var cx = criticalXs[ci];
                var tParam = tFromX(cx, p.p1x, p.p1y, p.p2x, p.p2y);
                var cy = bezierY(tParam, p.p1x, p.p1y, p.p2x, p.p2y, yStart, yEnd);

                var tTime = t1 + cx * duration;
                var val;
                if (v1.length !== undefined) {
                    val = [];
                    for (var d = 0; d < v1.length; d++) {
                        val[d] = v1[d] + (v2[d] - v1[d]) * cy;
                    }
                } else {
                    val = v1 + (v2 - v1) * cy;
                }
                var idx = prop.addKey(tTime);
                prop.setValueAtKey(idx, val);
                count++;
            }

            // Sekarang set temporalEase untuk semua keyframe
            // Cari ulang index firstKey dan lastKey
            var fIdx = -1, lIdx = -1;
            for (var k = 1; k <= prop.numKeys; k++) {
                if (Math.abs(prop.keyTime(k) - t1) < 0.0001) fIdx = k;
                if (Math.abs(prop.keyTime(k) - t2) < 0.0001) lIdx = k;
            }
            if (fIdx === -1 || lIdx === -1) continue;

            // Semua keyframe antara fIdx dan lIdx (termasuk kritis)
            var allKeyTimes = [];
            for (var k = fIdx; k <= lIdx; k++) {
                allKeyTimes.push(prop.keyTime(k));
            }

            for (var k = fIdx; k <= lIdx; k++) {
                var ki = k - fIdx; // index dalam allKeyTimes
                var xNorm; // posisi x dalam 0-1 (normalized time)
                if (duration > 0) {
                    xNorm = (prop.keyTime(k) - t1) / duration;
                } else {
                    xNorm = 0;
                }
                xNorm = Math.max(0, Math.min(1, xNorm));

                var stretchFactor = 1.0;
                try {
                    var curr = prop;
                    while (curr && curr.parentProperty && !(curr instanceof AVLayer || curr instanceof ShapeLayer || curr instanceof TextLayer || curr instanceof CameraLayer || curr instanceof LightLayer)) {
                        curr = curr.parentProperty;
                    }
                    if (curr && curr.stretch !== undefined) {
                        stretchFactor = curr.stretch / 100.0;
                    }
                } catch (e) { }
                if (isNaN(stretchFactor) || stretchFactor <= 0) stretchFactor = 1.0;

                try {
                    prop.setInterpolationTypeAtKey(k,
                        KeyframeInterpolationType.BEZIER,
                        KeyframeInterpolationType.BEZIER);

                    // Hitung slope kurva di titik ini
                    var slope = slopeAtX(xNorm, p.p1x, p.p1y, p.p2x, p.p2y);

                    // Hitung lebar segmen kiri dan kanan
                    var segWidthLeft = (ki > 0) ? (xNorm - (prop.keyTime(fIdx + ki - 1) - t1) / duration) : xNorm;
                    var segWidthRight = (ki < allKeyTimes.length - 1) ? ((prop.keyTime(fIdx + ki + 1) - t1) / duration - xNorm) : (1 - xNorm);

                    // Influence untuk ease IN (dari kiri)
                    var inInf;
                    if (k === fIdx) {
                        inInf = 33.33; // keyframe pertama tidak punya ease in
                    } else {
                        // Slope di titik kritis = 0 (puncak/lembah)
                        // → influence besar (handle panjang, transisi halus)
                        var absSlope = Math.abs(slope);
                        if (absSlope < 0.1) {
                            inInf = 99; // flat = handle panjang
                        } else {
                            inInf = Math.max(1, Math.min(99, segWidthLeft * 100 * 0.5));
                        }
                    }

                    // Influence untuk ease OUT (ke kanan)
                    var outInf;
                    if (k === lIdx) {
                        outInf = 33.33; // keyframe terakhir tidak punya ease out
                    } else {
                        var absSlope2 = Math.abs(slope);
                        if (absSlope2 < 0.1) {
                            outInf = 99;
                        } else {
                            outInf = Math.max(1, Math.min(99, segWidthRight * 100 * 0.5));
                        }
                    }

                    // Keyframe pertama — gunakan p1x langsung
                    if (k === fIdx) {
                        outInf = Math.max(1, Math.min(99, p.p1x * 100));
                    }
                    // Keyframe terakhir — gunakan p2x langsung
                    if (k === lIdx) {
                        inInf = Math.max(1, Math.min(99, (1 - p.p2x) * 100));
                    }

                    var easeIn = new KeyframeEase(0, inInf);
                    var easeOut = new KeyframeEase(0, outInf);
                    
                    // Note: SmartBake uses speed 0 (horizontal handles), 
                    // so stretchFactor doesn't affect the speed value here, 
                    // but we keep the logic consistent for future improvements.
                    prop.setTemporalEaseAtKey(k, [easeIn], [easeOut]);

                } catch (e) {
                    throw new Error("SmartBake err key " + k + ": " + e.toString());
                }
            }

        } else if (prop.propertyType === PropertyType.INDEXED_GROUP ||
            prop.propertyType === PropertyType.NAMED_GROUP) {
            count += applyBezierSmartBake(prop, p);
        }
    }
    return count;
}

// ─────────────────────────────────────────────
// MODEL 2 — ELASTIC / OVERSHOOT
// ─────────────────────────────────────────────

function applyElastic(jsonParams) {
    var p = JSON.parse(jsonParams);
    app.beginUndoGroup("NeuCurve: Apply Elastic");
    try {
        var count = applyExpressionToSelected(p, "elastic");
        app.endUndoGroup();
        return JSON.stringify({ success: true, keyframesModified: count });
    } catch (e) {
        app.endUndoGroup();
        return JSON.stringify({ error: e.toString() });
    }
}

// ─────────────────────────────────────────────
// MODEL 3 — BOUNCE (Physical)
// ─────────────────────────────────────────────

function applyBounce(jsonParams) {
    var p = JSON.parse(jsonParams);
    app.beginUndoGroup("NeuCurve: Apply Bounce");
    try {
        var count = applyExpressionToSelected(p, "bounce");
        app.endUndoGroup();
        return JSON.stringify({ success: true, keyframesModified: count });
    } catch (e) {
        app.endUndoGroup();
        return JSON.stringify({ error: e.toString() });
    }
}

// ─────────────────────────────────────────────
// MODEL 4 — STEPS (Staircase)
// ─────────────────────────────────────────────

function applySteps(jsonParams) {
    var p = JSON.parse(jsonParams);
    var steps = Math.round(p.count);
    var position = p.position || "end";
    app.beginUndoGroup("Curve Editor: Apply Steps");
    try {
        var comp = app.project.activeItem;
        if (!comp || !(comp instanceof CompItem)) {
            return JSON.stringify({ error: "Tidak ada komposisi aktif." });
        }
        var count = 0;
        for (var i = 1; i <= comp.numLayers; i++) {
            var layer = comp.layer(i);
            count += applyStepsToGroup(layer, steps, position);
        }
        app.endUndoGroup();
        return JSON.stringify({ success: true, keyframesCreated: count });
    } catch (e) {
        app.endUndoGroup();
        return JSON.stringify({ error: e.toString() });
    }
}

function applyStepsToGroup(propGroup, steps, position) {
    var count = 0;
    if (!propGroup) return count;
    for (var i = 1; i <= propGroup.numProperties; i++) {
        var prop = propGroup.property(i);
        if (prop.propertyType === PropertyType.PROPERTY && prop.numKeys >= 2) {
            var vt = prop.propertyValueType;
            if (vt === PropertyValueType.CUSTOM_VALUE) {
                throw new Error("Cannot apply Steps to CUSTOM_VALUE properties (like Mesh Warp or Liquify). Only Bezier curves (Model 0) are supported for this property type.");
            }

            var firstKey = -1, lastKey = -1;
            for (var k = 1; k <= prop.numKeys; k++) {
                if (prop.keySelected(k)) {
                    if (firstKey === -1) firstKey = k;
                    lastKey = k;
                }
            }
            if (firstKey === -1 || firstKey === lastKey) continue;
            var t1 = prop.keyTime(firstKey);
            var t2 = prop.keyTime(lastKey);
            var v1 = prop.keyValue(firstKey);
            var v2 = prop.keyValue(lastKey);
            var duration = t2 - t1;
            for (var k = lastKey - 1; k > firstKey; k--) {
                prop.removeKey(k);
            }
            prop.setInterpolationTypeAtKey(firstKey,
                KeyframeInterpolationType.HOLD,
                KeyframeInterpolationType.HOLD);
            for (var s = 1; s < steps; s++) {
                var fraction;
                var valFraction = s / steps;

                if (position === "start") fraction = s / steps;
                else if (position === "both") fraction = (s - 0.5) / steps;
                else fraction = s / steps;

                var t = t1 + fraction * duration;
                var val = interpolateValue(prop, v1, v2, valFraction, t1, t2);
                var newKeyIdx = prop.addKey(t);
                prop.setValueAtKey(newKeyIdx, val);
                prop.setInterpolationTypeAtKey(newKeyIdx,
                    KeyframeInterpolationType.HOLD,
                    KeyframeInterpolationType.HOLD);
                count++;
            }
        } else if (prop.propertyType === PropertyType.INDEXED_GROUP ||
            prop.propertyType === PropertyType.NAMED_GROUP) {
            count += applyStepsToGroup(prop, steps, position);
        }
    }
    return count;
}

// ─────────────────────────────────────────────
// MODEL 5 — CUSTOM PATH
// ─────────────────────────────────────────────

function applyCustomPath(jsonParams) {
    var p = JSON.parse(jsonParams);
    var mode = p.mode || "bake";
    app.beginUndoGroup("NeuCurve: Apply Custom Path");
    try {
        if (mode === "bake") {
            var yStart = p.yStart !== undefined ? p.yStart : 0.0;
            var yEnd = p.yEnd !== undefined ? p.yEnd : 1.0;

            // ── 2 keyframes: delegate to proven Bezier engine ──
            // When custom path has exactly 2 nodes, it's a standard cubic bezier.
            // Convert control points and use applyBezierSimple for exact AE match.
            if (p.points && p.points.length === 2) {
                var comp = app.project.activeItem;
                if (!comp || !(comp instanceof CompItem)) {
                    app.endUndoGroup();
                    return JSON.stringify({ error: "Tidak ada komposisi aktif." });
                }
                var bezParams = {
                    p1x: p.points[0].cx2,
                    p1y: p.points[0].cy2,
                    p2x: p.points[1].cx1,
                    p2y: p.points[1].cy1,
                    yStart: yStart,
                    yEnd: yEnd,
                    noBake: true
                };
                ncLog("INFO", "applyCustomPath: 2-node → Bezier delegate p1=[" +
                    bezParams.p1x + "," + bezParams.p1y + "] p2=[" +
                    bezParams.p2x + "," + bezParams.p2y + "] yS=" + yStart + " yE=" + yEnd);
                var count = 0;
                for (var i = 1; i <= comp.numLayers; i++) {
                    count += applyBezierSimple(comp.layer(i), bezParams);
                }
                app.endUndoGroup();
                return JSON.stringify({ success: true, keyframesModified: count });
            }

            var result = bakeCustomPath(p.points, yStart, yEnd);
            app.endUndoGroup();
            return JSON.stringify(result);
        } else {
            var count = applyExpressionToSelected(p, "custom");
            app.endUndoGroup();
            return JSON.stringify({ success: true, keyframesModified: count });
        }
    } catch (e) {
        app.endUndoGroup();
        return JSON.stringify({ error: e.toString() });
    }
}

function bakeCustomPath(points, yStart, yEnd) {
    var comp = app.project.activeItem;
    if (!comp || !(comp instanceof CompItem)) {
        return { error: "Tidak ada komposisi aktif." };
    }
    var totalCreated = 0;
    for (var i = 1; i <= comp.numLayers; i++) {
        var layer = comp.layer(i);
        totalCreated += bakeToGroup(layer, points, yStart, yEnd);
    }
    return { success: true, keyframesCreated: totalCreated };
}

function bakeToGroup(propGroup, points, yStart, yEnd) {
    var count = 0;
    if (!propGroup) return count;
    var n = points.length;

    // Defensive guards for undefined or NaN values
    if (yStart === undefined || yStart === null || isNaN(yStart)) yStart = 0.0;
    if (yEnd === undefined || yEnd === null || isNaN(yEnd)) yEnd = 1.0;

    for (var i = 1; i <= propGroup.numProperties; i++) {
        var prop = propGroup.property(i);

        if (prop.propertyType === PropertyType.PROPERTY && prop.numKeys >= 2) {
            var vt = prop.propertyValueType;
            if (vt === PropertyValueType.CUSTOM_VALUE) {
                throw new Error("Cannot apply Custom Path (Model 4) to CUSTOM_VALUE properties (like Mesh Warp or Liquify). Only simple Bezier curves without intermediate keyframes are supported for this property type.");
            }

            var selectedKeys = [];
            for (var k = 1; k <= prop.numKeys; k++) {
                if (prop.keySelected(k)) {
                    selectedKeys.push(k);
                }
            }
            if (selectedKeys.length === 0) continue;
            var firstKey = selectedKeys[0];
            var lastKey = selectedKeys[selectedKeys.length - 1];
            if (firstKey === lastKey) continue;

            var t1 = prop.keyTime(firstKey);
            var t2 = prop.keyTime(lastKey);
            var v1 = prop.keyValue(firstKey);
            var v2 = prop.keyValue(lastKey);
            var duration = t2 - t1;

            var valType = prop.propertyValueType;
            var dim = (v1 !== undefined && v1.length !== undefined) ? v1.length : 1;
            var isShape = (vt === PropertyValueType.SHAPE);

            var stretchFactor = 1.0;
            try {
                var curr = prop;
                while (curr && curr.parentProperty &&
                    !(curr instanceof AVLayer || curr instanceof ShapeLayer ||
                      curr instanceof TextLayer || curr instanceof CameraLayer ||
                      curr instanceof LightLayer)) {
                    curr = curr.parentProperty;
                }
                if (curr && curr.stretch !== undefined) {
                    stretchFactor = curr.stretch / 100.0;
                }
            } catch (e) { }
            if (isNaN(stretchFactor) || stretchFactor <= 0) stretchFactor = 1.0;

            // Read original boundaries and calculate base ranges based on start and end keys
            var starts = [], baseRanges = [];
            for (var d = 0; d < dim; d++) {
                var valStart = (dim > 1) ? v1[d] : v1;
                var valEnd = (dim > 1) ? v2[d] : v2;
                var br = valEnd - valStart;

                if (Math.abs(br) <= 0.0001) {
                    var maxDev = 0;
                    var peak = valStart;
                    for (var sk = 0; sk < selectedKeys.length; sk++) {
                        var valK = prop.keyValue(selectedKeys[sk]);
                        var valD = (dim > 1) ? valK[d] : valK;
                        var dev = Math.abs(valD - valStart);
                        if (dev > maxDev) {
                            maxDev = dev;
                            peak = valD;
                        }
                    }
                    br = peak - valStart;
                }
                starts[d] = valStart;
                baseRanges[d] = br;
            }

            // Remove all existing keyframes between first and last keys to allow repositioning
            for (var k = lastKey - 1; k > firstKey; k--) {
                prop.removeKey(k);
            }

            // Create only the user-defined anchor points at their updated relative positions
            for (var pi = 1; pi < n - 1; pi++) {
                var pt = points[pi];
                var tTime = t1 + pt.x * duration;

                var val;
                if (dim > 1) {
                    val = [];
                    for (var d = 0; d < dim; d++) {
                        val[d] = starts[d] + pt.y * baseRanges[d];
                    }
                } else {
                    val = starts[0] + pt.y * baseRanges[0];
                }

                var idx = prop.addKey(tTime);
                prop.setValueAtKey(idx, val);
                count++;
            }

            // Locate keyframes for easing application
            var newFirstIdx = -1, newLastIdx = -1;
            for (var k = 1; k <= prop.numKeys; k++) {
                var kt = prop.keyTime(k);
                if (Math.abs(kt - t1) < 0.0001) newFirstIdx = k;
                if (Math.abs(kt - t2) < 0.0001) newLastIdx = k;
            }

            if (newFirstIdx !== -1 && newLastIdx !== -1) {
                // Update first and last keyframe values based on canvas points BEFORE calculating ease values
                var firstVal;
                if (dim > 1) {
                    firstVal = [];
                    for (var d = 0; d < dim; d++) {
                        firstVal[d] = starts[d] + points[0].y * baseRanges[d];
                    }
                } else {
                    firstVal = starts[0] + points[0].y * baseRanges[0];
                }
                prop.setValueAtKey(newFirstIdx, firstVal);

                var lastVal;
                if (dim > 1) {
                    lastVal = [];
                    for (var d = 0; d < dim; d++) {
                        lastVal[d] = starts[d] + points[n - 1].y * baseRanges[d];
                    }
                } else {
                    lastVal = starts[0] + points[n - 1].y * baseRanges[0];
                }
                prop.setValueAtKey(newLastIdx, lastVal);
            }

            if (newFirstIdx === -1 || newLastIdx === -1) continue;

            var keyIndices = [];
            for (var k = newFirstIdx; k <= newLastIdx; k++) {
                keyIndices.push(k);
            }

            for (var idx = 0; idx < keyIndices.length; idx++) {
                var k = keyIndices[idx];
                var pi2 = idx;
                if (pi2 < 0 || pi2 >= n) continue;
                var pt2 = points[pi2];
                try {
                    var existingEaseIn = prop.keyInTemporalEase(k);
                    var existingEaseOut = prop.keyOutTemporalEase(k);

                    prop.setInterpolationTypeAtKey(k,
                        KeyframeInterpolationType.BEZIER,
                        KeyframeInterpolationType.BEZIER);

                    var outInfluence = 33.33;
                    if (pi2 < n - 1) {
                        var segDurOut = points[pi2 + 1].x - pt2.x;
                        if (segDurOut > 0.0001) {
                            var dxOut = pt2.cx2 - pt2.x;
                            var dxOutSafe = Math.max(0.001, Math.abs(dxOut));
                            outInfluence = Math.max(0.1, Math.min(99, dxOutSafe / segDurOut * 100));
                        }
                    }

                    var inInfluence = 33.33;
                    if (pi2 > 0) {
                        var segDurIn = pt2.x - points[pi2 - 1].x;
                        if (segDurIn > 0.0001) {
                            var dxIn = pt2.x - pt2.cx1;
                            var dxInSafe = Math.max(0.001, Math.abs(dxIn));
                            inInfluence = Math.max(0.1, Math.min(99, dxInSafe / segDurIn * 100));
                        }
                    }

                    var isSpatial = (valType === PropertyValueType.TwoD_SPATIAL || valType === PropertyValueType.ThreeD_SPATIAL);
                    var isColorProp = (valType === PropertyValueType.COLOR);
                    var easeInArray = [];
                    var easeOutArray = [];

                    if (isColorProp) {
                        if (pi2 === 0) {
                            var ein = existingEaseIn[0];
                            var safeInInf = Math.max(0.1, Math.min(100, ein.influence));
                            easeInArray.push(new KeyframeEase(ein.speed, safeInInf));
                        } else {
                            easeInArray.push(new KeyframeEase(0, inInfluence));
                        }

                        if (pi2 === n - 1) {
                            var eout = existingEaseOut[0];
                            var safeOutInf = Math.max(0.1, Math.min(100, eout.influence));
                            easeOutArray.push(new KeyframeEase(eout.speed, safeOutInf));
                        } else {
                            easeOutArray.push(new KeyframeEase(0, outInfluence));
                        }
                    } else if (isSpatial) {
                        var speedIn = 0, speedOut = 0;
                        var sumSq = 0;
                        for (var d = 0; d < dim; d++) {
                            sumSq += baseRanges[d] * baseRanges[d];
                        }
                        var distG = Math.sqrt(sumSq);

                        if (pi2 > 0) {
                            var dxIn = pt2.x - pt2.cx1;
                            var dyIn = pt2.y - pt2.cy1;
                            var dxInSafe = Math.max(0.001, Math.abs(dxIn));
                            speedIn = Math.abs((dyIn / dxInSafe) * (distG / duration) * stretchFactor);
                        }
                        if (pi2 < n - 1) {
                            var dxOut = pt2.cx2 - pt2.x;
                            var dyOut = pt2.cy2 - pt2.y;
                            var dxOutSafe = Math.max(0.001, Math.abs(dxOut));
                            speedOut = Math.abs((dyOut / dxOutSafe) * (distG / duration) * stretchFactor);
                        }

                        if (pi2 === 0) {
                            var ein = existingEaseIn[0];
                            var safeInInf = Math.max(0.1, Math.min(100, ein.influence));
                            easeInArray.push(new KeyframeEase(ein.speed, safeInInf));
                        } else {
                            easeInArray.push(new KeyframeEase(speedIn, inInfluence));
                        }

                        if (pi2 === n - 1) {
                            var eout = existingEaseOut[0];
                            var safeOutInf = Math.max(0.1, Math.min(100, eout.influence));
                            easeOutArray.push(new KeyframeEase(eout.speed, safeOutInf));
                        } else {
                            easeOutArray.push(new KeyframeEase(speedOut, outInfluence));
                        }
                    } else {
                        for (var d = 0; d < dim; d++) {
                            var speedIn = 0, speedOut = 0;
                            var valScale = baseRanges[d] / duration;

                            if (pi2 > 0) {
                                var dxIn = pt2.x - pt2.cx1;
                                var dyIn = pt2.y - pt2.cy1;
                                var dxInSafe = Math.max(0.001, Math.abs(dxIn));
                                speedIn = (dyIn / dxInSafe) * valScale * stretchFactor;
                            }
                            if (pi2 < n - 1) {
                                var dxOut = pt2.cx2 - pt2.x;
                                var dyOut = pt2.cy2 - pt2.y;
                                var dxOutSafe = Math.max(0.001, Math.abs(dxOut));
                                speedOut = (dyOut / dxOutSafe) * valScale * stretchFactor;
                            }

                            if (pi2 === 0) {
                                var ein = existingEaseIn.length > d ? existingEaseIn[d] : existingEaseIn[0];
                                var safeInInf = Math.max(0.1, Math.min(100, ein.influence));
                                easeInArray.push(new KeyframeEase(ein.speed, safeInInf));
                            } else {
                                easeInArray.push(new KeyframeEase(speedIn, inInfluence));
                            }

                            if (pi2 === n - 1) {
                                var eout = existingEaseOut.length > d ? existingEaseOut[d] : existingEaseOut[0];
                                var safeOutInf = Math.max(0.1, Math.min(100, eout.influence));
                                easeOutArray.push(new KeyframeEase(eout.speed, safeOutInf));
                            } else {
                                easeOutArray.push(new KeyframeEase(speedOut, outInfluence));
                            }
                        }
                    }

                    prop.setTemporalEaseAtKey(k, easeInArray, easeOutArray);
                    count++;
                } catch (e) {
                    throw new Error("Custom ease err key " + k + ": " + e.toString());
                }
            }

            // Select all keyframes in our range to ensure selection is preserved
            if (newFirstIdx !== -1 && newLastIdx !== -1) {
                for (var k = newFirstIdx; k <= newLastIdx; k++) {
                    prop.setSelectedAtKey(k, true);
                }
            }

        } else if (prop.propertyType === PropertyType.INDEXED_GROUP ||
            prop.propertyType === PropertyType.NAMED_GROUP) {
            count += bakeToGroup(prop, points, yStart, yEnd);
        }
    }
    return count;
}

function solveCubicBezierT(x, p1x, p2x) {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    var lo = 0, hi = 1, t = x;
    for (var i = 0; i < 14; i++) {
        var mt = 1 - t;
        var bx = 3 * mt * mt * t * p1x + 3 * mt * t * t * p2x + t * t * t;
        if (Math.abs(bx - x) < 0.0005) break;
        if (bx < x) lo = t; else hi = t;
        t = (lo + hi) / 2;
    }
    return t;
}

function evalPiecewiseBezier(points, x) {
    var seg = 0;
    while (seg < points.length - 2 && x > points[seg + 1].x) {
        seg++;
    }
    var p0 = points[seg];
    var p3 = points[seg + 1];

    var dx = p3.x - p0.x;
    if (dx <= 1e-6) return p3.y;

    var localX = (x - p0.x) / dx;
    var nx1 = (p0.cx2 - p0.x) / dx;
    var nx2 = (p3.cx1 - p0.x) / dx;

    var t = solveCubicBezierT(localX, nx1, nx2);
    var mt = 1 - t;

    return mt * mt * mt * p0.y + 3 * mt * mt * t * p0.cy2 + 3 * mt * t * t * p3.cy1 + t * t * t * p3.y;
}


// ─────────────────────────────────────────────
// SHARED HELPERS
// ─────────────────────────────────────────────

function getSelectedKeyRange(prop) {
    if (!prop.numKeys) return null;
    var first = -1, last = -1;
    for (var k = 1; k <= prop.numKeys; k++) {
        if (prop.keySelected(k)) {
            if (first === -1) first = k;
            last = k;
        }
    }
    if (first === -1) return null;
    return { start: first, end: last };
}

function generateExpression(type, params, startIdx, endIdx) {
    var isMirrored = params.isMirrored || false;
    var shapeInterpolationBlock = [
        "    try {",
        "      var v1 = key(i1).value, v2 = key(i2).value;",
        "      if (v1 instanceof Array) { var r=[]; for(var ci=0;ci<v1.length;ci++) r.push(v1[ci]+(v2[ci]-v1[ci])*finalEase); r; }",
        "      else if (typeof v1 === 'object' && v1.points) {",
        "         var p1pts = v1.points(), p2pts = v2.points();",
        "         if (p1pts.length === p2pts.length) {",
        "           var p1in = v1.inTangents(), p2in = v2.inTangents();",
        "           var p1out = v1.outTangents(), p2out = v2.outTangents();",
        "           var pts=[], inT=[], outT=[];",
        "           for(var ci=0; ci<p1pts.length; ci++) {",
        "               pts.push(p1pts[ci] + (p2pts[ci]-p1pts[ci])*finalEase);",
        "               inT.push(p1in[ci] + (p2in[ci]-p1in[ci])*finalEase);",
        "               outT.push(p1out[ci] + (p2out[ci]-p1out[ci])*finalEase);",
        "           }",
        "           createPath(pts, inT, outT, v1.isClosed());",
        "         } else { valueAtTime(t1 + (t2 - t1) * finalEase); }",
        "      }",
        "      else { v1 + (v2 - v1) * finalEase; }",
        "    } catch(e) {",
        "      valueAtTime(t1 + (t2 - t1) * finalEase);",
        "    }"
    ].join("\n");

    if (type === "elastic") {
        return [
            "// Elastic / Overshoot — generated by NeuCurve" + (isMirrored ? " (Mirrored)" : ""),
            "var amp = " + params.amplitude.toFixed(4) + ";",
            "var freq = " + params.frequency.toFixed(4) + ";",
            "var decay = " + params.decay.toFixed(4) + ";",
            "var isMirrored = " + isMirrored + ";",
            "var i1 = " + startIdx + ";",
            "var i2 = " + endIdx + ";",
            "if (numKeys < i2) value;",
            "else {",
            "  var t1 = key(i1).time;",
            "  var t2 = key(i2).time;",
            "  if (time < t1 || time > t2) value;",
            "  else {",
            "    var t = (time - t1) / (t2 - t1);",
            "    if (isMirrored) t = 1 - t;",
            "    var w = Math.exp(-decay);",
            "    var err0 = 1 - amp;",
            "    var err1 = -amp * w * Math.cos(freq * Math.PI * 2);",
            "    var raw = 1 - amp * Math.exp(-decay * t) * Math.cos(freq * Math.PI * 2 * t);",
            "    var ease = raw - (err0 * Math.exp(-2.5 * decay * t) * (1 - t) + err1 * t);",
            "    var finalEase = isMirrored ? (1 - ease) : ease;",
            shapeInterpolationBlock,
            "  }",
            "}"
        ].join("\n");
    }

    if (type === "bounce") {
        return [
            "// Bounce Physical — generated by NeuCurve" + (isMirrored ? " (Mirrored)" : ""),
            "var bounces = " + Math.round(params.bounces) + ";",
            "var stiffness = " + params.stiffness.toFixed(4) + ";",
            "var isMirrored = " + isMirrored + ";",
            "var i1 = " + startIdx + ";",
            "var i2 = " + endIdx + ";",
            "if (numKeys < i2) value;",
            "else {",
            "  var t1 = key(i1).time;",
            "  var t2 = key(i2).time;",
            "  if (time < t1 || time > t2) value;",
            "  else {",
            "    var t = (time - t1) / (t2 - t1);",
            "    if (isMirrored) t = 1 - t;",
            "    var segs = bounces + 1;",
            "    var seg = Math.min(Math.floor(t * segs), segs - 1);",
            "    var ease;",
            "    if (seg == 0) {",
            "      var lt = t * segs;",
            "      ease = lt * lt;",
            "    } else {",
            "      var segMid = (seg + 0.5) / segs;",
            "      var halfWidth = 0.5 / segs;",
            "      var nt = (t - segMid) / halfWidth;",
            "      ease = 1 - Math.pow(stiffness, seg) * (1 - nt * nt);",
            "    }",
            "    var finalEase = isMirrored ? (1 - ease) : ease;",
            shapeInterpolationBlock,
            "  }",
            "}"
        ].join("\n");
    }

    if (type === "custom") {
        var pts = params.points;
        var ptsLiteral = "[";
        for (var i = 0; i < pts.length; i++) {
            var pt = pts[i];
            ptsLiteral += "[" +
                pt.x.toFixed(4) + "," + pt.y.toFixed(4) + "," +
                pt.cx1.toFixed(4) + "," + pt.cy1.toFixed(4) + "," +
                pt.cx2.toFixed(4) + "," + pt.cy2.toFixed(4) +
                "]";
            if (i < pts.length - 1) ptsLiteral += ",";
        }
        ptsLiteral += "]";

        return [
            "// Custom Path — generated by NeuCurve" + (isMirrored ? " (Mirrored)" : ""),
            "var pts = " + ptsLiteral + ";",
            "var isMirrored = " + isMirrored + ";",
            "var i1 = " + startIdx + ";",
            "var i2 = " + endIdx + ";",
            "if (numKeys < i2) value;",
            "else {",
            "  var t1 = key(i1).time;",
            "  var t2 = key(i2).time;",
            "  if (time < t1 || time > t2) value;",
            "  else {",
            "    var t = Math.max(0, Math.min(1, (time - t1) / (t2 - t1)));",
            "    if (isMirrored) t = 1 - t;",
            "    var seg = 0;",
            "    while (seg < pts.length - 2 && t > pts[seg+1][0]) {",
            "      seg++;",
            "    }",
            "    var p0 = pts[seg]; var p3 = pts[seg+1];",
            "    var dx = p3[0] - p0[0];",
            "    var ease;",
            "    if (dx <= 1e-6) {",
            "      ease = p3[1];",
            "    } else {",
            "      var localX = (t - p0[0]) / dx;",
            "      var nx1 = (p0[4] - p0[0]) / dx;",
            "      var nx2 = (p3[2] - p0[0]) / dx;",
            "      var lo = 0, hi = 1, bzT = localX;",
            "      for (var j = 0; j < 14; j++) {",
            "        var mt = 1 - bzT;",
            "        var bx = 3 * mt * mt * bzT * nx1 + 3 * mt * bzT * bzT * nx2 + bzT * bzT * bzT;",
            "        if (Math.abs(bx - localX) < 0.0005) break;",
            "        if (bx < localX) lo = bzT; else hi = bzT;",
            "        bzT = (lo + hi) / 2;",
            "      }",
            "      var bzMt = 1 - bzT;",
            "      ease = bzMt*bzMt*bzMt*p0[1] + 3*bzMt*bzMt*bzT*p0[5] + 3*bzMt*bzT*bzT*p3[3] + bzT*bzT*bzT*p3[1];",
            "    }",
            "    var finalEase = isMirrored ? (1 - ease) : ease;",
            shapeInterpolationBlock,
            "  }",
            "}"
        ].join("\n");
    }

    if (type === "wave") {
        return [
            "// Wave — generated by NeuCurve" + (isMirrored ? " (Mirrored)" : ""),
            "var freq = " + params.frequency.toFixed(4) + ";",
            "var decay = " + params.decay.toFixed(4) + ";",
            "var sharp = " + params.sharpness.toFixed(4) + ";",
            "var isMirrored = " + isMirrored + ";",
            "var i1 = " + startIdx + ";",
            "var i2 = " + endIdx + ";",
            "if (numKeys < i2) value;",
            "else {",
            "  var t1 = key(i1).time;",
            "  var t2 = key(i2).time;",
            "  var t = (time - t1) / (t2 - t1);",
            "  if (time < t1) value;",
            "  else {",
            "    if (t > 1) t = 1;",
            "    if (isMirrored) t = 1 - t;",
            "    var phase = t * freq;",
            "    var sig = Math.sin(phase * Math.PI * 2 - Math.PI / 2);",
            "    var s = 0.5 + 0.5 * sig;",
            "    var tr = Math.abs(((phase + 0.5) % 1) * 2 - 1);",
            "    var osc;",
            "    if (sharp > 0) osc = s + (tr - s) * sharp;",
            "    else {",
            "      var exponent = 1.0 / (1.0 + Math.abs(sharp));",
            "      var shaped = (sig < 0 ? -1 : 1) * Math.pow(Math.abs(sig), exponent);",
            "      osc = 0.5 + 0.5 * shaped;",
            "    }",
            "    var envelope = Math.exp(-decay * t);",
            "    var ease = 0.5 + (osc - 0.5) * 1.0 * envelope;",
            "    var finalEase = isMirrored ? (1 - ease) : ease;",
            shapeInterpolationBlock,
            "  }",
            "}"
        ].join("\n");
    }

    return "";
}

// ─────────────────────────────────────────────
// MODEL 6 — WAVE
// ─────────────────────────────────────────────

function applyWave(jsonParams) {
    var p = JSON.parse(jsonParams);
    app.beginUndoGroup("NeuCurve: Apply Wave");
    try {
        var count = applyExpressionToSelected(p, "wave");
        app.endUndoGroup();
        return JSON.stringify({ success: true, keyframesModified: count });
    } catch (e) {
        app.endUndoGroup();
        return JSON.stringify({ error: e.toString() });
    }
}

function applyExpressionToSelected(params, type) {
    var count = 0;
    var comp = app.project.activeItem;
    if (!comp || !(comp instanceof CompItem)) return count;

    // GUARD CLAUSE: Do nothing if no layers are selected
    if (comp.selectedLayers.length === 0) return count;

    for (var i = 0; i < comp.selectedLayers.length; i++) {
        var layer = comp.selectedLayers[i];
        count += applyExprToGroup(layer, params, type);
    }
    return count;
}

function applyExprToGroup(propGroup, params, type) {
    var count = 0;
    if (!propGroup) return count;
    for (var i = 1; i <= propGroup.numProperties; i++) {
        var prop = propGroup.property(i);
        if (prop.propertyType === PropertyType.PROPERTY) {
            var pvt = prop.propertyValueType;


            // CUSTOM_VALUE cannot have expressions
            if (pvt === PropertyValueType.CUSTOM_VALUE) {
                if (type === "remove") {
                    if (prop.canSetExpression && prop.expression !== "") {
                        prop.expression = "";
                        count++;
                    }
                    continue;
                }
                throw new Error("Cannot apply Elastic, Bounce, Wave, or Custom Path to CUSTOM_VALUE properties (like Mesh Warp or Liquify). Only Bezier curves (Model 0) are supported for this property type.");
            }

            if (type === "remove") {
                var comp = app.project.activeItem;
                var noPropsSelected = (comp && comp.selectedProperties.length === 0);
                
                if (prop.selected || noPropsSelected) {
                    if (prop.canSetExpression && prop.expression !== "") {
                        prop.expression = "";
                        count++;
                    }
                }
                continue;
            }

            var range = getSelectedKeyRange(prop);
            if (range && prop.canSetExpression) {
                var expr = generateExpression(type, params, range.start, range.end);
                if (expr !== "") {
                    prop.expression = expr;
                    count++;
                }
            }
        } else if (prop.propertyType === PropertyType.INDEXED_GROUP ||
            prop.propertyType === PropertyType.NAMED_GROUP) {
            count += applyExprToGroup(prop, params, type);
        }
    }
    return count;
}

function removeExpressions() {
    app.beginUndoGroup("NeuCurve: Remove Expressions/Presets");
    try {
        var count = 0;
        var comp = app.project.activeItem;
        if (!comp || !(comp instanceof CompItem)) {
             throw new Error("No active composition.");
        }
        
        // 1. Hapus ekspresi dari properti yang spesifik (misal: Position, Scale)
        count += applyExpressionToSelected(null, "remove");
        
        // 2. Deteksi apakah user menyeleksi properti spesifik atau layer utuh
        var selProps = comp.selectedProperties;
        var selLayers = comp.selectedLayers;

        if (selProps && selProps.length > 0) {
            // User menyeleksi properti spesifik.
            var toDelete = [];
            var layersToCleanSliders = []; // Lacak layer mana yang animatornya dihapus

            for (var i = 0; i < selProps.length; i++) {
                var p = selProps[i];
                if (p.propertyType === PropertyType.NAMED_GROUP || p.propertyType === PropertyType.PROPERTY) {
                    if (p.name.indexOf("NeuCurve") !== -1) {
                        toDelete.push(p);
                        // Ambil layer tempat animator ini berada
                        try {
                            layersToCleanSliders.push(p.propertyGroup(p.propertyDepth));
                        } catch(e){}
                    } else if (p.name === "Speed" || p.name === "Delay" || p.name === "Magnitude") {
                        toDelete.push(p);
                    }
                }
            }
            // Hapus dari belakang agar aman
            for (var j = toDelete.length - 1; j >= 0; j--) {
                try { toDelete[j].remove(); count++; } catch(e){}
            }
            
            // Bersihkan slider yatim-piatu dari layer yang animatornya baru saja dihapus
            for (var l = 0; l < layersToCleanSliders.length; l++) {
                var lyr = layersToCleanSliders[l];
                try {
                    var effects = lyr.property("ADBE Effect Parade");
                    if (effects) {
                        var s1 = effects.property("Speed"); if(s1) s1.remove();
                        var s2 = effects.property("Delay"); if(s2) s2.remove();
                        var s3 = effects.property("Magnitude"); if(s3) s3.remove();
                    }
                    
                    var markers = lyr.property("Marker");
                    if (markers) {
                        for (var m = markers.numKeys; m >= 1; m--) {
                            if (markers.keyValue(m).comment === "Explode Here") {
                                markers.removeKey(m);
                            }
                        }
                    }
                } catch(e){}
            }
        } else if (selLayers && selLayers.length > 0) {
            // User hanya menyeleksi layer utama (Layer Name).
            // Bersihkan semua sisa NeuCurve Presets (Animator & Sliders).
            for (var i = 0; i < selLayers.length; i++) {
                var lyr = selLayers[i];
                var cleaned = false;
                
                // Bersihkan Text Animators buatan NeuCurve
                if (lyr instanceof TextLayer) {
                    var textProps = lyr.property("ADBE Text Properties");
                    if (textProps) {
                        var animators = textProps.property("ADBE Text Animators");
                        if (animators) {
                            for (var a = animators.numProperties; a >= 1; a--) {
                                var animator = animators.property(a);
                                if (animator.name.indexOf("NeuCurve") !== -1) {
                                    animator.remove();
                                    cleaned = true;
                                }
                            }
                        }
                    }
                }
                
                // Bersihkan Slider buatan NeuCurve
                var effects = lyr.property("ADBE Effect Parade");
                if (effects) {
                    var slidersToRemove = ["Speed", "Delay", "Magnitude", "Wiggle Frequency", "Wiggle Amp (*Curve)", "Rotation Speed"];
                    for (var s = 0; s < slidersToRemove.length; s++) {
                        var slider = effects.property(slidersToRemove[s]);
                        if (slider) {
                            slider.remove();
                            cleaned = true;
                        }
                    }
                }
                
                try {
                    var markers = lyr.property("Marker");
                    if (markers) {
                        for (var m = markers.numKeys; m >= 1; m--) {
                            if (markers.keyValue(m).comment === "Explode Here") {
                                markers.removeKey(m);
                            }
                        }
                    }
                } catch(e){}
                
                if (cleaned) count++;
            }
        }
        
        app.endUndoGroup();
        return JSON.stringify({ success: true, modified: count });
    } catch (e) {
        app.endUndoGroup();
        return JSON.stringify({ error: e.toString() });
    }
}


function getPlayheadInfo() {
    var comp = app.project.activeItem;
    if (!comp || !(comp instanceof CompItem)) return JSON.stringify({ error: "no active comp" });

    var result = {
        time: comp.time,
        range: null
    };

    try {
        // Strategy 1: Check selectedProperties first (if user selected properties directly)
        var selProps = comp.selectedProperties;
        if (selProps && selProps.length > 0) {
            for (var pi = 0; pi < selProps.length; pi++) {
                var sp = selProps[pi];
                if (sp.numKeys && sp.numKeys > 1) {
                    var range = getSelectedKeyRange(sp);
                    if (range) {
                        result.range = [sp.keyTime(range.start), sp.keyTime(range.end)];
                    } else {
                        // Fallback to all keyframes if none selected
                        result.range = [sp.keyTime(1), sp.keyTime(sp.numKeys)];
                    }
                    break;
                }
            }
        }

        // Strategy 2: If still no range, scan selected layers for any animated property
        if (!result.range) {
            var layers = comp.selectedLayers;
            if (layers && layers.length > 0) {
                for (var li = 0; li < layers.length; li++) {
                    var lyr = layers[li];
                    var found = searchLayerForKeys(lyr);
                    if (found) {
                        result.range = found;
                        break;
                    }
                }
            }
        }

        // Strategy 3: Last resort — scan ALL layers
        if (!result.range) {
            for (var ai = 1; ai <= comp.numLayers; ai++) {
                var aLyr = comp.layer(ai);
                var af = searchLayerForKeys(aLyr);
                if (af) {
                    result.range = af;
                    break;
                }
            }
        }
    } catch (e) {
        result.error = e.toString();
    }

    return JSON.stringify(result);
}

function searchLayerForKeys(lyr) {
    return searchGroupForKeys(lyr, 0);
}

function searchGroupForKeys(grp, depth) {
    if (!grp || depth > 6) return null;  // max depth 6 untuk mencegah infinite loop
    try {
        for (var i = 1; i <= grp.numProperties; i++) {
            var prop = grp.property(i);
            if (!prop) continue;
            try {
                if (prop.propertyType === PropertyType.PROPERTY && prop.numKeys && prop.numKeys > 1) {
                    var range = getSelectedKeyRange(prop);
                    if (range) return [prop.keyTime(range.start), prop.keyTime(range.end)];
                    return [prop.keyTime(1), prop.keyTime(prop.numKeys)];
                }
            } catch (e) { }
            // Recurse ke sub-group
            if (prop.propertyType === PropertyType.INDEXED_GROUP ||
                prop.propertyType === PropertyType.NAMED_GROUP) {
                var found = searchGroupForKeys(prop, depth + 1);
                if (found) return found;
            }
        }
    } catch (e) { }
    return null;
}


function ping() {
    return JSON.stringify({
        status: "ok",
        aeVersion: app.version,
        activeComp: app.project.activeItem ? app.project.activeItem.name : null
    });
}

function readGraphFromAE() {
    try {
        var comp = app.project.activeItem;
        if (!comp || !(comp instanceof CompItem)) {
            return JSON.stringify({ error: "Tidak ada komposisi aktif." });
        }

        var selProps = comp.selectedProperties;
        if (!selProps || selProps.length === 0) {
            return JSON.stringify({ error: "Silakan seleksi properti yang memiliki keyframe." });
        }

        var prop = null;
        for (var i = 0; i < selProps.length; i++) {
            if (selProps[i].propertyType === PropertyType.PROPERTY && selProps[i].numKeys >= 2) {
                prop = selProps[i];
                break;
            }
        }

        if (!prop) {
            return JSON.stringify({ error: "Properti tidak memiliki cukup keyframe." });
        }

        var selKeys = [];
        for (var k = 1; k <= prop.numKeys; k++) {
            if (prop.keySelected(k)) selKeys.push(k);
        }

        // 1-Keyframe Auto-Neighborhood Detection
        if (selKeys.length === 1) {
            var kSingle = selKeys[0];
            if (kSingle > 1 && kSingle < prop.numKeys) {
                selKeys = [kSingle - 1, kSingle, kSingle + 1];
            } else if (kSingle === 1 && prop.numKeys >= 2) {
                selKeys = [kSingle, kSingle + 1];
            } else if (kSingle === prop.numKeys && prop.numKeys >= 2) {
                selKeys = [kSingle - 1, kSingle];
            }
        }

        // If less than 2 keyframes selected, try to read the first 2 keyframes or the whole property
        if (selKeys.length < 2) {
            if (prop.numKeys >= 2) {
                selKeys = [];
                for (var k = 1; k <= prop.numKeys; k++) selKeys.push(k);
            } else {
                return JSON.stringify({ error: "Butuh minimal 2 keyframe untuk membaca kurva." });
            }
        }

        var kFirst = selKeys[0];
        var kLast = selKeys[selKeys.length - 1];

        var t1 = prop.keyTime(kFirst);
        var t2 = prop.keyTime(kLast);
        var duration = t2 - t1;
        if (duration <= 0) return JSON.stringify({ error: "Durasi antar keyframe adalah 0." });

        var valType = prop.propertyValueType;
        var isCustom = (valType === PropertyValueType.CUSTOM_VALUE);
        var v1, v2;
        var dim = 1;

        if (!isCustom) {
            try {
                v1 = prop.keyValue(kFirst);
                v2 = prop.keyValue(kLast);
                if (v1 !== undefined && v1.length !== undefined) dim = v1.length;
            } catch (e) { }
        }

        var isSpatial = (valType === PropertyValueType.TwoD_SPATIAL || valType === PropertyValueType.ThreeD_SPATIAL);
        var isColorProp = (valType === PropertyValueType.COLOR);

        var distG = 0;
        if (isCustom || isColorProp) {
            distG = 1.0;
        } else if (isSpatial && v1 && v2) {
            var dxG = v2[0] - v1[0], dyG = v2[1] - v1[1], dzG = (dim === 3) ? (v2[2] - v1[2]) : 0;
            distG = Math.sqrt(dxG * dxG + dyG * dyG + dzG * dzG);
        } else if (v1 !== undefined && v2 !== undefined) {
            distG = (dim > 1) ? (v2[0] - v1[0]) : (v2 - v1);
        } else {
            distG = 1.0;
        }

        var starts = [];
        var baseRanges = [];
        var virtualDist = 1.0;
        var maxDevSpatial = 0;

        if (!isCustom && !isColorProp) {
            for (var d = 0; d < dim; d++) {
                var valStart = (dim > 1 && v1) ? v1[d] : (v1 || 0);
                var valEnd = (dim > 1 && v2) ? v2[d] : (v2 || 0);
                var br = valEnd - valStart;

                if (Math.abs(br) <= 0.0001) {
                    var maxDev = 0;
                    var peak = valStart;
                    for (var sk = 0; sk < selKeys.length; sk++) {
                        var valK = prop.keyValue(selKeys[sk]);
                        var valD = (dim > 1) ? valK[d] : valK;
                        var dev = Math.abs(valD - valStart);
                        if (dev > maxDev) {
                            maxDev = dev;
                            peak = valD;
                        }
                    }
                    br = peak - valStart;
                }
                starts[d] = valStart;
                baseRanges[d] = br;
            }

            if (isSpatial) {
                if (distG === 0) {
                    var peakSpatialDist = 0;
                    for (var k_i = 0; k_i < selKeys.length; k_i++) {
                        var kval = prop.keyValue(selKeys[k_i]);
                        var c_dx = kval[0] - v1[0], c_dy = kval[1] - v1[1], c_dz = (dim === 3) ? (kval[2] - v1[2]) : 0;
                        var c_dist = Math.sqrt(c_dx * c_dx + c_dy * c_dy + c_dz * c_dz);
                        if (c_dist > maxDevSpatial) {
                            maxDevSpatial = c_dist;
                        }
                    }
                    virtualDist = maxDevSpatial;
                } else {
                    virtualDist = distG;
                }
            } else {
                virtualDist = baseRanges[0];
            }
        } else {
            virtualDist = 1.0;
        }

        var globalSpeed = duration > 0 ? (virtualDist / duration) : 0;
        if (Math.abs(globalSpeed) < 1e-6) {
            globalSpeed = 0;
        }

        var points = [];
        for (var i = 0; i < selKeys.length; i++) {
            var kIdx = selKeys[i];
            var tTime = prop.keyTime(kIdx);
            var val;
            if (!isCustom) {
                try { val = prop.keyValue(kIdx); } catch (e) { }
            }

            var ptX = (tTime - t1) / duration;
            var ptY = 0;

            if (isCustom) {
                ptY = ptX;
            } else if (isColorProp) {
                ptY = ptX;
            } else if (isSpatial && val && v1 && v2) {
                var c_dx = val[0] - v1[0], c_dy = val[1] - v1[1], c_dz = (dim === 3) ? (val[2] - v1[2]) : 0;
                var c_dist = Math.sqrt(c_dx * c_dx + c_dy * c_dy + c_dz * c_dz);
                if (distG !== 0) {
                    var dirX = (v2[0] - v1[0]) / distG;
                    var dirY = (v2[1] - v1[1]) / distG;
                    var dirZ = (dim === 3) ? ((v2[2] - v1[2]) / distG) : 0;
                    var signedDist = c_dx * dirX + c_dy * dirY + c_dz * dirZ;
                    ptY = signedDist / distG;
                } else {
                    ptY = (maxDevSpatial > 0) ? (c_dist / maxDevSpatial) : ptX;
                }
            } else {
                var c_v = (dim > 1 && val) ? val[0] : (val || 0);
                if (Math.abs(baseRanges[0]) > 0.0001) {
                    ptY = (c_v - starts[0]) / baseRanges[0];
                } else {
                    ptY = ptX;
                }
            }

            var pt = { x: ptX, y: ptY, cx1: ptX, cy1: ptY, cx2: ptX, cy2: ptY };

            if (i > 0) {
                var inInf = 0;
                var inSpeedComp = 0;
                if (prop.keyInInterpolationType(kIdx) !== KeyframeInterpolationType.LINEAR && prop.keyInInterpolationType(kIdx) !== KeyframeInterpolationType.HOLD) {
                    var easeIn = prop.keyInTemporalEase(kIdx)[0];
                    inInf = easeIn.influence / 100;
                    
                    // Compensation for Time Stretch in READ
                    var stretchFactorRead = 1.0;
                    try {
                        var currR = prop;
                        while (currR && currR.parentProperty && !(currR instanceof AVLayer || currR instanceof ShapeLayer || currR instanceof TextLayer || currR instanceof CameraLayer || currR instanceof LightLayer)) {
                            currR = currR.parentProperty;
                        }
                        if (currR && currR.stretch !== undefined) {
                            stretchFactorRead = currR.stretch / 100.0;
                        }
                    } catch (e) { }
                    if (isNaN(stretchFactorRead) || stretchFactorRead <= 0) stretchFactorRead = 1.0;

                    // We need speed_comp for the visual graph editor
                    inSpeedComp = easeIn.speed / stretchFactorRead;
                }

                var prevT = prop.keyTime(selKeys[i - 1]);
                var segDurIn = (tTime - prevT) / duration;
                var dxIn = inInf * segDurIn;
                pt.cx1 = pt.x - dxIn;

                if (globalSpeed !== 0 && inSpeedComp !== 0) {
                    var inSlope = inSpeedComp / globalSpeed;
                    if (inSlope > 1000) inSlope = 1000;
                    else if (inSlope < -1000) inSlope = -1000;
                    pt.cy1 = pt.y - inSlope * dxIn;
                } else {
                    pt.cy1 = pt.y;
                }
            }

            if (i < selKeys.length - 1) {
                var outInf = 0;
                var outSpeedComp = 0;
                if (prop.keyOutInterpolationType(kIdx) !== KeyframeInterpolationType.LINEAR && prop.keyOutInterpolationType(kIdx) !== KeyframeInterpolationType.HOLD) {
                    var easeOut = prop.keyOutTemporalEase(kIdx)[0];
                    outInf = easeOut.influence / 100;
                    
                    // Compensation for Time Stretch in READ
                    var stretchFactorReadOut = 1.0;
                    try {
                        var currRO = prop;
                        while (currRO && currRO.parentProperty && !(currRO instanceof AVLayer || currRO instanceof ShapeLayer || currRO instanceof TextLayer || currRO instanceof CameraLayer || currRO instanceof LightLayer)) {
                            currRO = currRO.parentProperty;
                        }
                        if (currRO && currRO.stretch !== undefined) {
                            stretchFactorReadOut = currRO.stretch / 100.0;
                        }
                    } catch (e) { }
                    if (isNaN(stretchFactorReadOut) || stretchFactorReadOut <= 0) stretchFactorReadOut = 1.0;

                    // We need speed_comp for the visual graph editor
                    outSpeedComp = easeOut.speed / stretchFactorReadOut;
                }

                var nextT = prop.keyTime(selKeys[i + 1]);
                var segDurOut = (nextT - tTime) / duration;
                var dxOut = outInf * segDurOut;
                pt.cx2 = pt.x + dxOut;

                if (globalSpeed !== 0 && outSpeedComp !== 0) {
                    var outSlope = outSpeedComp / globalSpeed;
                    if (outSlope > 1000) outSlope = 1000;
                    else if (outSlope < -1000) outSlope = -1000;
                    pt.cy2 = pt.y + outSlope * dxOut;
                } else {
                    pt.cy2 = pt.y;
                }
            }

            points.push(pt);
        }

        if (selKeys.length === 2) {
            var p0 = points[0];
            var p1 = points[1];
            return JSON.stringify({
                success: true,
                model: 0,
                params: {
                    p1x: p0.cx2,
                    p1y: p0.cy2,
                    p2x: p1.cx1,
                    p2y: p1.cy1,
                    points: points,
                    yStart: 0.0,
                    yEnd: 1.0,
                    isMirrored: false
                }
            });
        } else {
            return JSON.stringify({
                success: true,
                model: 4,
                params: {
                    points: points,
                    yStart: points[0].y,
                    yEnd: points[points.length - 1].y,
                    isMirrored: false
                }
            });
        }
    } catch (e) {
        return JSON.stringify({ error: e.toString() });
    }
}

function interpolateValue(prop, v1, v2, ease, t1, t2) {
    if (v1 instanceof Array) {
        var r = [];
        for (var ci = 0; ci < v1.length; ci++) {
            r.push(v1[ci] + (v2[ci] - v1[ci]) * ease);
        }
        return r;
    } else if (typeof v1 === "object" && v1.vertices) {
        if (v1.vertices.length === v2.vertices.length) {
            var newShape = new Shape();
            newShape.closed = v1.closed;
            var pts = [], inT = [], outT = [];
            for (var ci = 0; ci < v1.vertices.length; ci++) {
                pts.push([
                    v1.vertices[ci][0] + (v2.vertices[ci][0] - v1.vertices[ci][0]) * ease,
                    v1.vertices[ci][1] + (v2.vertices[ci][1] - v1.vertices[ci][1]) * ease
                ]);
                inT.push([
                    v1.inTangents[ci][0] + (v2.inTangents[ci][0] - v1.inTangents[ci][0]) * ease,
                    v1.inTangents[ci][1] + (v2.inTangents[ci][1] - v1.inTangents[ci][1]) * ease
                ]);
                outT.push([
                    v1.outTangents[ci][0] + (v2.outTangents[ci][0] - v1.outTangents[ci][0]) * ease,
                    v1.outTangents[ci][1] + (v2.outTangents[ci][1] - v1.outTangents[ci][1]) * ease
                ]);
            }
            newShape.vertices = pts;
            newShape.inTangents = inT;
            newShape.outTangents = outT;
            return newShape;
        } else {
            return prop.valueAtTime(t1 + (t2 - t1) * ease, false);
        }
    } else {
        return v1 + (v2 - v1) * ease;
    }
}

// ─────────────────────────────────────────────
// EXPRESSION PRESETS & RIGS
// ─────────────────────────────────────────────

function applyExpressionPreset(jsonParams) {
    var p = JSON.parse(jsonParams);
    var id = p.id;
    var type = p.type;
    var code = p.code;
    var name = p.name;
    
    app.beginUndoGroup("NeuCurve: Apply " + name);
    try {
        var comp = app.project.activeItem;
        if (!comp || !(comp instanceof CompItem)) {
            throw new Error("Please select a composition.");
        }
        var selLayers = comp.selectedLayers;
        var selProps = comp.selectedProperties;

        if (type === "text_animator") {
            if (selLayers.length === 0) throw new Error("Please select at least one Text Layer.");
            var applied = 0;
            for (var i = 0; i < selLayers.length; i++) {
                var layer = selLayers[i];
                if (!(layer instanceof TextLayer)) continue;
                
                var textProps = layer.property("ADBE Text Properties");
                if (!textProps) throw new Error("Could not find Text Properties");
                var animators = textProps.property("ADBE Text Animators");
                if (!animators) throw new Error("Could not find Text Animators");
                var animator = animators.addProperty("ADBE Text Animator");
                animator.name = "NeuCurve - " + name;

                // --- AUTO-RIG SLIDERS (Robust Version) ---
                var effects = layer.property("ADBE Effect Parade");
                if (!effects) throw new Error("Could not find Effects Group (ADBE Effect Parade)");
                
                function getOrCreateSlider(name, val) {
                    var s = effects.property(name);
                    if (!s) {
                        s = effects.addProperty("ADBE Slider Control");
                        s.name = name;
                        if (s.property(1)) s.property(1).setValue(val);
                    }
                    return s;
                }
                getOrCreateSlider("Speed", 9);
                getOrCreateSlider("Delay", 0.05);
                getOrCreateSlider("Magnitude", 100);
                
                var selectors = animator.property("ADBE Text Selectors");
                if (!selectors) throw new Error("Could not find Text Selectors");
                var props = animator.property("ADBE Text Animator Properties");
                if (!props) throw new Error("Could not find Animator Properties");
                
                if (p.id === "text-explosion-marker") {
                    var exBase = 
                        "var speed = clamp(effect('Speed')('Slider'), 0.1, 15) / 15;\n" +
                        "var mTime = 99999;\n" +
                        "if (marker.numKeys > 0) mTime = marker.key(1).time;\n" +
                        "var t = time - mTime;\n";
                    
                    var codeScatter = 
                        "seedRandom(textIndex, true);\n" + exBase +
                        "if (t >= 0) {\n" +
                        "  var prog = Math.min(1, t * speed);\n" +
                        "  var ease = 1 - Math.pow(1 - prog, 5);\n" +
                        "  [random(-100, 100) * ease, random(-100, 100) * ease, random(-100, 100) * ease];\n" +
                        "} else { [0, 0, 0]; }";
                        
                    var codeFade = 
                        exBase +
                        "if (t >= 0) {\n" +
                        "  var prog = Math.min(1, t * speed * 1.5);\n" +
                        "  var ease = 1 - Math.pow(1 - prog, 5);\n" +
                        "  ease * 100;\n" +
                        "} else { 0; }";

                    // --- ANIMATOR 1: RANDOM SCATTER (Position, Scale, Rotation) ---
                    animator.name = "NeuCurve - Explosion Scatter";
                    
                    // Gunakan Expression Selector
                    if (selectors.numProperties > 0) {
                        try { selectors.property(1).remove(); } catch(e){} // Hapus range selector bawaan jika ada
                    }
                    var expr1 = selectors.addProperty("ADBE Text Expressible Selector");
                    var amount1 = expr1.property("ADBE Text Expressible Amount") || expr1.property("ADBE Text Amount") || expr1.property("Amount");
                    if (amount1) amount1.expression = codeScatter;
                    
                    var pos = props.addProperty("ADBE Text Position 3D");
                    if (pos) pos.setValue([800, 800, 400]); 
                    
                    var scale = props.addProperty("ADBE Text Scale 3D");
                    if (scale) scale.setValue([300, 300, 300]);
                    
                    var rot = props.addProperty("ADBE Text Rotation"); // Z Rotation
                    if (rot) rot.setValue(180);
                    
                    // --- ANIMATOR 2: UNIFORM EFFECTS (Fade Out) ---
                    var animator2 = animators.addProperty("ADBE Text Animator");
                    animator2.name = "NeuCurve - Explosion Fade";
                    
                    var selectors2 = animator2.property("ADBE Text Selectors");
                    var expr2 = selectors2.addProperty("ADBE Text Expressible Selector");
                    var amount2 = expr2.property("ADBE Text Expressible Amount") || expr2.property("ADBE Text Amount") || expr2.property("Amount");
                    if (amount2) amount2.expression = codeFade;
                    
                    var props2 = animator2.property("ADBE Text Animator Properties");
                    var opacity = props2.addProperty("ADBE Text Opacity");
                    if (opacity) opacity.setValue(0); // Memudar secara seragam
                    
                    // Tambahkan Marker otomatis di playhead saat ini
                    try {
                        var markerProp = layer.property("Marker");
                        if (markerProp) {
                            var mv = new MarkerValue("Explode Here");
                            markerProp.setValueAtTime(comp.time, mv);
                        }
                    } catch(e){}
                    
                } else {
                    // --- DEFAULT ANIMATORS (Typewriter, Overshoot, Elastic) ---
                    var selector = selectors.addProperty("ADBE Text Expressible Selector");
                    var amountProp = selector.property("ADBE Text Expressible Amount") || selector.property("ADBE Text Amount") || selector.property("Amount");
                    amountProp.expression = code;
                    
                    var pos = props.addProperty("ADBE Text Position 3D");
                    pos.setValue([0, 50, 0]); 
                    var opacity = props.addProperty("ADBE Text Opacity");
                    opacity.setValue(0);
                }

                
                applied++;
            }
            if (applied === 0) throw new Error("No Text Layers were selected.");
            
        } else if (type === "expression") {
            if (selProps.length === 0) throw new Error("Please select at least one property.");
            var applied = 0;
            for (var i = 0; i < selProps.length; i++) {
                var prop = selProps[i];
                if (prop.canSetExpression) {
                    // Dapatkan layer dari properti yang dipilih
                    var layer = null;
                    try { layer = prop.propertyGroup(prop.propertyDepth); } catch(e) {}
                    
                    if (layer && layer.property("ADBE Effect Parade")) {
                        var effects = layer.property("ADBE Effect Parade");
                        if (id === "util-wiggle-curve") {
                            var f = effects.property("Wiggle Frequency");
                            if (!f) { f = effects.addProperty("ADBE Slider Control"); f.name = "Wiggle Frequency"; f.property(1).setValue(100); }
                            var a = effects.property("Wiggle Amp (*Curve)");
                            if (!a) { a = effects.addProperty("ADBE Slider Control"); a.name = "Wiggle Amp (*Curve)"; a.property(1).setValue(2); }
                        } else if (id === "util-auto-rotate") {
                            var s = effects.property("Rotation Speed");
                            if (!s) { s = effects.addProperty("ADBE Slider Control"); s.name = "Rotation Speed"; s.property(1).setValue(90); }
                        } else if (id === "util-elastic") {
                            var sAmp = effects.property("Elastic Controller");
                            if (!sAmp) { sAmp = effects.addProperty("ADBE Slider Control"); sAmp.name = "Elastic Controller"; sAmp.property(1).setValue(100); }
                            
                            var sFreq = effects.property("Elastic Freq");
                            if (!sFreq) { sFreq = effects.addProperty("ADBE Slider Control"); sFreq.name = "Elastic Freq"; sFreq.property(1).setValue(300); }
                            
                            var sDecay = effects.property("Elastic Decay");
                            if (!sDecay) { sDecay = effects.addProperty("ADBE Slider Control"); sDecay.name = "Elastic Decay"; sDecay.property(1).setValue(400); }
                        }
                    }

                    prop.expression = code;
                    applied++;
                }
            }
            if (applied === 0) throw new Error("No properties selected can take expressions.");
            
        } else if (type === "advanced_rig") {
            if (selLayers.length === 0) throw new Error("Please select layers to rig.");
            
            // Helper: safely detect if position dimensions are separated
            function _isSeparated(prop) {
                try { return prop && prop.dimensionsSeparated === true; } catch(e) { return false; }
            }
            
            if (code === "carousel_rig") {
                var controller = comp.layers.addNull();
                controller.name = "Carousel Controller";
                controller.threeDLayer = true;
                
                var effects = controller.property("ADBE Effect Parade");
                if (!effects) effects = controller.Effects;
                
                function addSlider(name, val) {
                    var s = effects.addProperty("ADBE Slider Control");
                    s.name = name;
                    s.property(1).setValue(val);
                    return s;
                }
                
                addSlider("Scroll Progress (*100)", 0);
                addSlider("Spacing X", 500);
                addSlider("Depth Z", 500);
                addSlider("Angle Y", 45);
                addSlider("Opacity Falloff", 20);
                
                for (var i = 0; i < selLayers.length; i++) {
                    var l = selLayers[i];
                    l.threeDLayer = true;
                    
                    var posProp = l.property("ADBE Transform Group").property("ADBE Position");
                    
                    var commonCode = 
                        "var myIdx = " + i + ";\n" +
                        "var ctrl = thisComp.layer('Carousel Controller');\n" +
                        "var effs = ctrl('Effects');\n" +
                        "var idx = 0;\n" +
                        "for(var e=1; e<=effs.numProperties; e++){\n" +
                        "  if(effs(e).name.indexOf('Scroll Progress') > -1){\n" +
                        "    idx += effs(e)('Slider')/100;\n" +
                        "  }\n" +
                        "}\n";

                    var posCode = commonCode +
                        "var spacing = ctrl.effect('Spacing X')('Slider');\n" +
                        "var depth = ctrl.effect('Depth Z')('Slider');\n" +
                        "var offset = myIdx - idx;\n" +
                        "var x = offset * spacing;\n" +
                        "var z = Math.abs(offset) * depth;\n" +
                        "var ap = ctrl.transform.anchorPoint;\n" +
                        "var targetWorld = ctrl.toWorld([ap[0] + x, ap[1], ap[2] + z]);\n" +
                        "var localPos = thisLayer.hasParent ? thisLayer.parent.fromWorld(targetWorld) : targetWorld;\n" +
                        "localPos;";
                    
                    var rotCode = commonCode +
                        "var angle = ctrl.effect('Angle Y')('Slider');\n" +
                        "var offset = myIdx - idx;\n" +
                        "var rot = 0;\n" +
                        "if (offset > 1) rot = -angle;\n" +
                        "else if (offset < -1) rot = angle;\n" +
                        "else rot = -angle * offset;\n" +
                        "value + rot;";
                        
                    var opCode = commonCode +
                        "var falloff = ctrl.effect('Opacity Falloff')('Slider');\n" +
                        "var offset = Math.abs(myIdx - idx);\n" +
                        "value - (offset * falloff);";
                        
                    if (_isSeparated(posProp)) {
                        var sepCommonCode = commonCode +
                            "var spacing = ctrl.effect('Spacing X')('Slider');\n" +
                            "var depth = ctrl.effect('Depth Z')('Slider');\n" +
                            "var offset = myIdx - idx;\n" +
                            "var x = offset * spacing;\n" +
                            "var z = Math.abs(offset) * depth;\n" +
                            "var ap = ctrl.transform.anchorPoint;\n" +
                            "var targetWorld = ctrl.toWorld([ap[0] + x, ap[1], ap[2] + z]);\n" +
                            "var localPos = thisLayer.hasParent ? thisLayer.parent.fromWorld(targetWorld) : targetWorld;\n";
                        posProp.getSeparationFollower(0).expression = sepCommonCode + "localPos[0];";
                        posProp.getSeparationFollower(1).expression = sepCommonCode + "localPos[1];";
                        posProp.getSeparationFollower(2).expression = sepCommonCode + "localPos[2];";
                    } else {
                        posProp.expression = posCode;
                    }
                    l.property("ADBE Transform Group").property("ADBE Rotate Y").expression = rotCode;
                    l.property("ADBE Transform Group").property("ADBE Opacity").expression = opCode;
                }
            } else if (code === "orbit_rig") {
                var controller = comp.layers.addNull();
                controller.name = "Orbit Controller";
                controller.threeDLayer = true;
                
                var effects = controller.property("ADBE Effect Parade");
                if (!effects) effects = controller.Effects;
                
                function addSlider(name, val) {
                    var s = effects.addProperty("ADBE Slider Control");
                    s.name = name;
                    s.property(1).setValue(val);
                    return s;
                }
                
                addSlider("Radius", 500);
                addSlider("Angle Offset", 0);
                addSlider("Tilt X", 0);
                addSlider("Tilt Z", 0);
                
                var totalLayers = selLayers.length;
                
                for (var i = 0; i < selLayers.length; i++) {
                    var l = selLayers[i];
                    l.threeDLayer = true;
                    
                    var posProp = l.property("ADBE Transform Group").property("ADBE Position");
                    
                    // Auto-Orient Towards Camera
                    l.autoOrient = AutoOrientType.CAMERA_OR_POINT_OF_INTEREST;
                    
                    var orbitCommonBase = 
                        "var totalLayers = " + totalLayers + ";\n" +
                        "var myIdx = " + i + ";\n" +
                        "var ctrl = thisComp.layer('Orbit Controller');\n" +
                        "var effs = ctrl('Effects');\n" +
                        "var angleOffset = 0;\n" +
                        "for(var e=1; e<=effs.numProperties; e++){\n" +
                        "  if(effs(e).name.indexOf('Angle Offset') > -1){\n" +
                        "    angleOffset += effs(e)('Slider');\n" +
                        "  }\n" +
                        "}\n" +
                        "var radius = ctrl.effect('Radius')('Slider');\n" +
                        "var tiltX = ctrl.effect('Tilt X')('Slider');\n" +
                        "var tiltZ = ctrl.effect('Tilt Z')('Slider');\n" +
                        "var baseAngle = (360 / totalLayers) * myIdx;\n" +
                        "var currentAngle = degreesToRadians(baseAngle + angleOffset);\n" +
                        "var x = Math.sin(currentAngle) * radius;\n" +
                        "var z = Math.cos(currentAngle) * radius;\n" +
                        "var y = Math.sin(degreesToRadians(tiltX)) * z + Math.sin(degreesToRadians(tiltZ)) * x;\n" +
                        "var ap = ctrl.transform.anchorPoint;\n" +
                        "var targetWorld = ctrl.toWorld([ap[0] + x, ap[1] + y, ap[2] + z]);\n" +
                        "var localPos = thisLayer.hasParent ? thisLayer.parent.fromWorld(targetWorld) : targetWorld;\n";
                        
                    var posCode = orbitCommonBase + "localPos;";
                        
                    if (_isSeparated(posProp)) {
                        posProp.getSeparationFollower(0).expression = orbitCommonBase + "localPos[0];";
                        posProp.getSeparationFollower(1).expression = orbitCommonBase + "localPos[1];";
                        posProp.getSeparationFollower(2).expression = orbitCommonBase + "localPos[2];";
                    } else {
                        posProp.expression = posCode;
                    }
                }
            } else if (code === "proximity_rig") {
                var controller = comp.layers.addNull();
                controller.name = "Proximity Controller";
                
                var effects = controller.property("ADBE Effect Parade");
                if (!effects) effects = controller.Effects;
                
                function addSliderProx(name, val) {
                    var s = effects.addProperty("ADBE Slider Control");
                    s.name = name;
                    s.property(1).setValue(val);
                    return s;
                }
                
                addSliderProx("Radius", 300);
                addSliderProx("Strength", 200);
                addSliderProx("Enable Rotation", 0);
                addSliderProx("Max Rotation", 30);
                addSliderProx("Enable Scale", 0);
                addSliderProx("Scale Amount", 20);
                
                for (var i = 0; i < selLayers.length; i++) {
                    var l = selLayers[i];
                    
                    // Handle dimensionsSeparated
                    var posProp = l.property("ADBE Transform Group").property("ADBE Position");
                    
                    // Bake home position
                    var homePos = l.transform.position.value;
                    var homeX = homePos[0];
                    var homeY = homePos[1];
                    var homeZ = homePos.length > 2 ? homePos[2] : 0;
                    var homeStr = "[" + homeX + ", " + homeY + ", " + homeZ + "]";
                    
                    // --- Position Expression ---
                    var proxCommonBase =
                        "var ctrl = thisComp.layer('Proximity Controller');\n" +
                        "var radius = ctrl.effect('Radius')('Slider');\n" +
                        "var strength = ctrl.effect('Strength')('Slider');\n" +
                        "var localHome = " + homeStr + ";\n" +
                        "var r = thisLayer.sourceRectAtTime(time, false);\n" +
                        "var centerX = r.left + r.width / 2;\n" +
                        "var centerY = r.top + r.height / 2;\n" +
                        "var ap = transform.anchorPoint;\n" +
                        "var ox = centerX - ap[0];\n" +
                        "var oy = centerY - ap[1];\n" +
                        "var s = transform.scale / 100;\n" +
                        "var sx = ox * s[0];\n" +
                        "var sy = oy * s[1];\n" +
                        "var rot = transform.rotation;\n" +
                        "var rad = degreesToRadians(rot);\n" +
                        "var cosR = Math.cos(rad);\n" +
                        "var sinR = Math.sin(rad);\n" +
                        "var rx = sx * cosR - sy * sinR;\n" +
                        "var ry = sx * sinR + sy * cosR;\n" +
                        "var baseInParent = localHome.length > 2 ? [localHome[0] + rx, localHome[1] + ry, localHome[2]] : [localHome[0] + rx, localHome[1] + ry];\n" +
                        "var compHome = thisLayer.hasParent ? thisLayer.parent.toComp(baseInParent) : baseInParent;\n" +
                        "var cp = ctrl.toComp(ctrl.transform.anchorPoint);\n" +
                        "var dx = compHome[0] - cp[0];\n" +
                        "var dy = compHome[1] - cp[1];\n" +
                        "var dist = Math.sqrt(dx * dx + dy * dy);\n" +
                        "var compAnchorHome = thisLayer.hasParent ? thisLayer.parent.toComp(localHome) : localHome;\n" +
                        "var targetAnchorComp = compAnchorHome;\n" +
                        "if (dist < radius && dist > 0) {\n" +
                        "  var force = (1 - dist / radius) * strength;\n" +
                        "  var nx = dx / dist;\n" +
                        "  var ny = dy / dist;\n" +
                        "  targetAnchorComp = compAnchorHome.length > 2 ? [compAnchorHome[0] + nx * force, compAnchorHome[1] + ny * force, compAnchorHome[2]] : [compAnchorHome[0] + nx * force, compAnchorHome[1] + ny * force];\n" +
                        "}\n" +
                        "var localPos = thisLayer.hasParent ? thisLayer.parent.fromComp(targetAnchorComp) : targetAnchorComp;\n";
                        
                    var posCode = proxCommonBase + "localPos;";
                    
                    // --- Rotation Expression ---
                    var rotCode =
                        "var ctrl = thisComp.layer('Proximity Controller');\n" +
                        "var enable = ctrl.effect('Enable Rotation')('Slider');\n" +
                        "if (enable < 0.5) { value; } else {\n" +
                        "  var radius = ctrl.effect('Radius')('Slider');\n" +
                        "  var maxRot = ctrl.effect('Max Rotation')('Slider');\n" +
                        "  var localHome = " + homeStr + ";\n" +
                        "  var r = thisLayer.sourceRectAtTime(time, false);\n" +
                        "  var centerX = r.left + r.width / 2;\n" +
                        "  var centerY = r.top + r.height / 2;\n" +
                        "  var ap = transform.anchorPoint;\n" +
                        "  var ox = centerX - ap[0];\n" +
                        "  var oy = centerY - ap[1];\n" +
                        "  var s = transform.scale / 100;\n" +
                        "  var sx = ox * s[0];\n" +
                        "  var sy = oy * s[1];\n" +
                        "  var rot = transform.rotation;\n" +
                        "  var rad = degreesToRadians(rot);\n" +
                        "  var cosR = Math.cos(rad);\n" +
                        "  var sinR = Math.sin(rad);\n" +
                        "  var rx = sx * cosR - sy * sinR;\n" +
                        "  var ry = sx * sinR + sy * cosR;\n" +
                        "  var baseInParent = localHome.length > 2 ? [localHome[0] + rx, localHome[1] + ry, localHome[2]] : [localHome[0] + rx, localHome[1] + ry];\n" +
                        "  var compHome = thisLayer.hasParent ? thisLayer.parent.toComp(baseInParent) : baseInParent;\n" +
                        "  var cp = ctrl.toComp(ctrl.transform.anchorPoint);\n" +
                        "  var dx = compHome[0] - cp[0];\n" +
                        "  var dy = compHome[1] - cp[1];\n" +
                        "  var dist = Math.sqrt(dx * dx + dy * dy);\n" +
                        "  if (dist < radius && dist > 0) {\n" +
                        "    var force = (1 - dist / radius);\n" +
                        "    var angle = Math.atan2(dy, dx) * (180 / Math.PI);\n" +
                        "    value + Math.cos(angle * Math.PI / 180) * force * maxRot;\n" +
                        "  } else { value; }\n" +
                        "}";
                    
                    // --- Scale Expression ---
                    var scaleCode =
                        "var ctrl = thisComp.layer('Proximity Controller');\n" +
                        "var enable = ctrl.effect('Enable Scale')('Slider');\n" +
                        "if (enable < 0.5) { value; } else {\n" +
                        "  var radius = ctrl.effect('Radius')('Slider');\n" +
                        "  var amount = ctrl.effect('Scale Amount')('Slider');\n" +
                        "  var localHome = " + homeStr + ";\n" +
                        "  var r = thisLayer.sourceRectAtTime(time, false);\n" +
                        "  var centerX = r.left + r.width / 2;\n" +
                        "  var centerY = r.top + r.height / 2;\n" +
                        "  var ap = transform.anchorPoint;\n" +
                        "  var ox = centerX - ap[0];\n" +
                        "  var oy = centerY - ap[1];\n" +
                        "  var s = transform.scale / 100;\n" +
                        "  var sx = ox * s[0];\n" +
                        "  var sy = oy * s[1];\n" +
                        "  var rot = transform.rotation;\n" +
                        "  var rad = degreesToRadians(rot);\n" +
                        "  var cosR = Math.cos(rad);\n" +
                        "  var sinR = Math.sin(rad);\n" +
                        "  var rx = sx * cosR - sy * sinR;\n" +
                        "  var ry = sx * sinR + sy * cosR;\n" +
                        "  var baseInParent = localHome.length > 2 ? [localHome[0] + rx, localHome[1] + ry, localHome[2]] : [localHome[0] + rx, localHome[1] + ry];\n" +
                        "  var compHome = thisLayer.hasParent ? thisLayer.parent.toComp(baseInParent) : baseInParent;\n" +
                        "  var cp = ctrl.toComp(ctrl.transform.anchorPoint);\n" +
                        "  var dx = compHome[0] - cp[0];\n" +
                        "  var dy = compHome[1] - cp[1];\n" +
                        "  var dist = Math.sqrt(dx * dx + dy * dy);\n" +
                        "  if (dist < radius && dist > 0) {\n" +
                        "    var force = (1 - dist / radius) * amount;\n" +
                        "    value.length > 2 ? [value[0] + force, value[1] + force, value[2]] : [value[0] + force, value[1] + force];\n" +
                        "  } else { value; }\n" +
                        "}";
                    
                    // Apply expressions
                    if (_isSeparated(posProp)) {
                        posProp.getSeparationFollower(0).expression = proxCommonBase + "localPos[0];";
                        posProp.getSeparationFollower(1).expression = proxCommonBase + "localPos[1];";
                    } else {
                        posProp.expression = posCode;
                    }
                    var rotProp = l.property("ADBE Transform Group").property("ADBE Rotate Z");
                    if (!rotProp) {
                        rotProp = l.property("ADBE Transform Group").property("ADBE Rotation");
                    }
                    if (rotProp) {
                        rotProp.expression = rotCode;
                    }
                    l.property("ADBE Transform Group").property("ADBE Scale").expression = scaleCode;
                }
            } else if (code === "gravity_rig") {
                var controller = comp.layers.addNull();
                controller.name = "Physics Controller";
                
                var effects = controller.property("ADBE Effect Parade");
                if (!effects) effects = controller.Effects;
                
                function addSliderPhys(name, val) {
                    var s = effects.addProperty("ADBE Slider Control");
                    s.name = name;
                    s.property(1).setValue(val);
                    return s;
                }
                
                addSliderPhys("Gravity", 1000);
                addSliderPhys("Bounce Restitution", 0.5);
                addSliderPhys("Floor Friction", 0.95);
                addSliderPhys("Floor Height", comp.height);
                
                // Sort selected layers by initial Y position in descending order
                var sortedLayers = [];
                for (var k = 0; k < selLayers.length; k++) {
                    sortedLayers.push(selLayers[k]);
                }
                sortedLayers.sort(function(a, b) {
                    var posA = a.property("ADBE Transform Group").property("ADBE Position").value;
                    var posB = b.property("ADBE Transform Group").property("ADBE Position").value;
                    return posB[1] - posA[1]; // Descending order of Y
                });
                
                var stackNames = [];
                var localHomes = [];
                var radii = [];
                for (var k = 0; k < sortedLayers.length; k++) {
                    var lyr = sortedLayers[k];
                    stackNames.push("'" + lyr.name.replace(/'/g, "\\'") + "'");
                    
                    var homePos = lyr.transform.position.value;
                    var homeX = homePos[0];
                    var homeY = homePos[1];
                    var homeZ = homePos.length > 2 ? homePos[2] : 0;
                    localHomes.push("[" + homeX + ", " + homeY + ", " + homeZ + "]");
                    
                    var scaleX = lyr.transform.scale.value[0] / 100;
                    if (lyr.parent) { scaleX *= lyr.parent.transform.scale.value[0] / 100; }
                    var scaleY = lyr.transform.scale.value[1] / 100;
                    if (lyr.parent) { scaleY *= lyr.parent.transform.scale.value[1] / 100; }
                    var r = lyr.sourceRectAtTime(0, false);
                    var width = r.width * Math.abs(scaleX);
                    var height = r.height * Math.abs(scaleY);
                    var rad = (width + height) / 4;
                    radii.push(rad);
                }
                var stackNamesStr = "[" + stackNames.join(", ") + "]";
                var localHomesStr = "[" + localHomes.join(", ") + "]";
                var radiiStr = "[" + radii.join(", ") + "]";
                
                for (var i = 0; i < sortedLayers.length; i++) {
                    var l = sortedLayers[i];
                    var posProp = l.property("ADBE Transform Group").property("ADBE Position");
                    
                    // Add Mass slider to layer l
                    var lEffects = l.property("ADBE Effect Parade");
                    if (!lEffects) lEffects = l.Effects;
                    var massSlider = lEffects.addProperty("ADBE Slider Control");
                    massSlider.name = "Mass";
                    massSlider.property(1).setValue(1.0);
                    
                    var homePos = l.transform.position.value;
                    
                    var physCode =
                        "var ctrl = thisComp.layer('Physics Controller');\n" +
                        "var g = ctrl.effect('Gravity')('Slider');\n" +
                        "var e = ctrl.effect('Bounce Restitution')('Slider');\n" +
                        "var friction = ctrl.effect('Floor Friction')('Slider');\n" +
                        "var floorVal = ctrl.effect('Floor Height')('Slider');\n" +
                        "var myIdx = " + i + ";\n" +
                        "var stackNames = " + stackNamesStr + ";\n" +
                        "var localHomes = " + localHomesStr + ";\n" +
                        "var radii = " + radiiStr + ";\n" +
                        "var N = stackNames.length;\n" +
                        "var masses = [];\n" +
                        "for (var k = 0; k < N; k++) {\n" +
                        "  var lyr = thisComp.layer(stackNames[k]);\n" +
                        "  var mVal = 1.0;\n" +
                        "  try { mVal = lyr.effect('Mass')('Slider'); } catch(err) {}\n" +
                        "  masses.push(Math.max(0.1, mVal));\n" +
                        "}\n" +
                        "var homeComp = [];\n" +
                        "for (var k = 0; k < N; k++) {\n" +
                        "  var lyr = thisComp.layer(stackNames[k]);\n" +
                        "  var lh = localHomes[k];\n" +
                        "  homeComp.push(lyr.hasParent ? lyr.parent.toComp(lh) : lh);\n" +
                        "}\n" +
                        "var pos = [];\n" +
                        "var vel = [];\n" +
                        "for (var k = 0; k < N; k++) {\n" +
                        "  pos.push([homeComp[k][0], homeComp[k][1]]);\n" +
                        "  vel.push([0, 0]);\n" +
                        "}\n" +
                        "var dt = thisComp.frameDuration;\n" +
                        "var simTime = Math.min(Math.max(0, time - inPoint), 8.0);\n" +
                        "var numFrames = Math.round(simTime / dt);\n" +
                        "for (var f = 0; f < numFrames; f++) {\n" +
                        "  for (var k = 0; k < N; k++) {\n" +
                        "    vel[k][1] += g * dt;\n" +
                        "    vel[k][0] *= 0.999;\n" +
                        "    vel[k][1] *= 0.999;\n" +
                        "    pos[k][0] += vel[k][0] * dt;\n" +
                        "    pos[k][1] += vel[k][1] * dt;\n" +
                        "  }\n" +
                        "  for (var k = 0; k < N; k++) {\n" +
                        "    var r_k = radii[k];\n" +
                        "    if (pos[k][1] + r_k > floorVal) {\n" +
                        "      pos[k][1] = floorVal - r_k;\n" +
                        "      vel[k][1] = -e * vel[k][1];\n" +
                        "      vel[k][0] *= friction;\n" +
                        "    }\n" +
                        "    if (pos[k][0] - r_k < 0) {\n" +
                        "      pos[k][0] = r_k;\n" +
                        "      vel[k][0] = -e * vel[k][0];\n" +
                        "    }\n" +
                        "    if (pos[k][0] + r_k > thisComp.width) {\n" +
                        "      pos[k][0] = thisComp.width - r_k;\n" +
                        "      vel[k][0] = -e * vel[k][0];\n" +
                        "    }\n" +
                        "  }\n" +
                        "  for (var iter = 0; iter < 4; iter++) {\n" +
                        "    for (var a = 0; a < N - 1; a++) {\n" +
                        "      for (var b = a + 1; b < N; b++) {\n" +
                        "        var dx = pos[b][0] - pos[a][0];\n" +
                        "        var dy = pos[b][1] - pos[a][1];\n" +
                        "        var dist = Math.sqrt(dx * dx + dy * dy);\n" +
                        "        var minDist = radii[a] + radii[b];\n" +
                        "        if (dist < minDist) {\n" +
                        "          if (dist == 0) dist = 0.1;\n" +
                        "          var nx = dx / dist;\n" +
                        "          var ny = dy / dist;\n" +
                        "          var overlap = minDist - dist;\n" +
                        "          var m1 = masses[a];\n" +
                        "          var m2 = masses[b];\n" +
                        "          var totalM = m1 + m2;\n" +
                        "          pos[a][0] -= overlap * (m2 / totalM) * nx;\n" +
                        "          pos[a][1] -= overlap * (m2 / totalM) * ny;\n" +
                        "          pos[b][0] += overlap * (m1 / totalM) * nx;\n" +
                        "          pos[b][1] += overlap * (m1 / totalM) * ny;\n" +
                        "          var rvx = vel[a][0] - vel[b][0];\n" +
                        "          var rvy = vel[a][1] - vel[b][1];\n" +
                        "          var dot = rvx * nx + rvy * ny;\n" +
                        "          if (dot > 0) {\n" +
                        "            var impulse = (2 * dot) / (m1 + m2) * e;\n" +
                        "            vel[a][0] -= impulse * m2 * nx;\n" +
                        "            vel[a][1] -= impulse * m2 * ny;\n" +
                        "            vel[b][0] += impulse * m1 * nx;\n" +
                        "            vel[b][1] += impulse * m1 * ny;\n" +
                        "          }\n" +
                        "        }\n" +
                        "      }\n" +
                        "    }\n" +
                        "  }\n" +
                        "}\n" +
                        "var targetCompPos = homeComp[myIdx].length > 2 ? [pos[myIdx][0], pos[myIdx][1], homeComp[myIdx][2]] : [pos[myIdx][0], pos[myIdx][1]];\n" +
                        "var localPos = thisLayer.hasParent ? thisLayer.parent.fromComp(targetCompPos) : targetCompPos;\n" +
                        "localPos";
                        
                    if (_isSeparated(posProp)) {
                        posProp.getSeparationFollower(0).expression = physCode + "[0];";
                        posProp.getSeparationFollower(1).expression = physCode + "[1];";
                        if (homePos.length > 2) {
                            posProp.getSeparationFollower(2).expression = physCode + "[2];";
                        }
                    } else {
                        posProp.expression = physCode + ";";
                    }
                    
                    // Add settled marker
                    try {
                        if (l.property("ADBE Marker")) {
                            var settleTime = l.inPoint + 5.0;
                            var markerVal = new MarkerValue("Settled");
                            l.property("ADBE Marker").setValueAtTime(settleTime, markerVal);
                        }
                    } catch (markerErr) {}
                }
            } else if (code === "sphere_rig") {
                var controller = comp.layers.addNull();
                controller.name = "Sphere Controller";
                controller.threeDLayer = true;
                controller.property("ADBE Transform Group").property("ADBE Position").setValue([comp.width/2, comp.height/2, 0]);

                var effects = controller.property("ADBE Effect Parade");
                if (!effects) effects = controller.Effects;

                function addSliderSphere(name, val) {
                    var s = effects.addProperty("ADBE Slider Control");
                    s.name = name;
                    s.property(1).setValue(val);
                    return s;
                }

                addSliderSphere("Radius", 141);
                addSliderSphere("Speed", 3);
                addSliderSphere("Cascade Delay (*100)", 8.5);
                addSliderSphere("Tilt", 0);
                addSliderSphere("Depth Opacity", 50);
                addSliderSphere("Layer Scale", 100);

                var totalSphereLayers = selLayers.length;

                for (var i = 0; i < selLayers.length; i++) {
                    var l = selLayers[i];
                    l.threeDLayer = true;
                    l.autoOrient = AutoOrientType.CAMERA_OR_POINT_OF_INTEREST;

                    var posProp = l.property("ADBE Transform Group").property("ADBE Position");

                    // Fibonacci sphere distribution: even spread, no clumping at the poles
                    var sphereCommonBase =
                        "var totalLayers = " + totalSphereLayers + ";\n" +
                        "var myIdx = " + i + ";\n" +
                        "var ctrl = thisComp.layer('Sphere Controller');\n" +
                        "var R = ctrl.effect('Radius')('Slider');\n" +
                        "var speed = ctrl.effect('Speed')('Slider');\n" +
                        "var delay = ctrl.effect('Cascade Delay (*100)')('Slider') / 100;\n" +
                        "var tilt = degreesToRadians(ctrl.effect('Tilt')('Slider'));\n" +
                        "var theta = Math.acos(1 - 2 * (myIdx + 0.5) / totalLayers);\n" +
                        "var phi0 = myIdx * Math.PI * (3 - Math.sqrt(5));\n" +
                        "var ang = phi0 + (time - myIdx * delay) * speed;\n" +
                        "var x = Math.sin(theta) * Math.cos(ang) * R;\n" +
                        "var z = Math.sin(theta) * Math.sin(ang) * R;\n" +
                        "var y = Math.cos(theta) * R;\n" +
                        "var y2 = y * Math.cos(tilt) - z * Math.sin(tilt);\n" +
                        "var z2 = y * Math.sin(tilt) + z * Math.cos(tilt);\n";

                    var spherePosBase = sphereCommonBase +
                        "var ap = ctrl.transform.anchorPoint;\n" +
                        "var targetWorld = ctrl.toWorld([ap[0] + x, ap[1] - y2, ap[2] + z2]);\n" +
                        "var localPos = thisLayer.hasParent ? thisLayer.parent.fromWorld(targetWorld) : targetWorld;\n";

                    var sphereOpCode = sphereCommonBase +
                        "var depthOp = ctrl.effect('Depth Opacity')('Slider');\n" +
                        "var n = R == 0 ? 0 : Math.max(-1, Math.min(1, z2 / R));\n" +
                        "value * (1 - ((n + 1) / 2) * depthOp / 100);";

                    var sphereScaleCode =
                        "var ctrl = thisComp.layer('Sphere Controller');\n" +
                        "var s = ctrl.effect('Layer Scale')('Slider') / 100;\n" +
                        "value * s;";

                    if (_isSeparated(posProp)) {
                        posProp.getSeparationFollower(0).expression = spherePosBase + "localPos[0];";
                        posProp.getSeparationFollower(1).expression = spherePosBase + "localPos[1];";
                        posProp.getSeparationFollower(2).expression = spherePosBase + "localPos[2];";
                    } else {
                        posProp.expression = spherePosBase + "localPos;";
                    }
                    l.property("ADBE Transform Group").property("ADBE Opacity").expression = sphereOpCode;
                    l.property("ADBE Transform Group").property("ADBE Scale").expression = sphereScaleCode;
                }
            } else if (code === "number_carousel_rig") {
                // Single layer selected: auto-duplicate it up to 20 ring slots
                if (selLayers.length === 1) {
                    var carSrcLayer = selLayers[0];
                    while (selLayers.length < 20) {
                        selLayers.push(carSrcLayer.duplicate());
                    }
                }

                var carN = selLayers.length;

                // Center digital clock (MM:SS) doubles as the controller — no null needed
                var clockLayer = comp.layers.addText("00:00");
                clockLayer.name = "Carousel Clock";
                clockLayer.property("ADBE Transform Group").property("ADBE Position").setValue([comp.width/2, comp.height/2]);
                try {
                    var clockDocProp = clockLayer.property("ADBE Text Properties").property("ADBE Text Document");
                    var clockTd = clockDocProp.value;
                    try {
                        var refTd = selLayers[0].property("ADBE Text Properties").property("ADBE Text Document").value;
                        clockTd.font = refTd.font;
                        clockTd.fontSize = refTd.fontSize;
                        clockTd.fillColor = refTd.fillColor;
                    } catch (refErr) {}
                    clockTd.justification = ParagraphJustification.CENTER_JUSTIFY;
                    clockDocProp.setValue(clockTd);
                    clockDocProp.expression =
                        "var t = effect('Phase')('Slider') + time * effect('Speed')('Slider');\n" +
                        "var tot = Math.floor(t);\n" +
                        "var s = ((tot % 60) + 60) % 60;\n" +
                        "var m = ((Math.floor(tot / 60) % 60) + 60) % 60;\n" +
                        "(m < 10 ? '0' + m : '' + m) + ':' + (s < 10 ? '0' + s : '' + s);";
                } catch (clockErr) {}

                var effects = clockLayer.property("ADBE Effect Parade");
                if (!effects) effects = clockLayer.Effects;

                function addSliderTxtCar(name, val) {
                    var s = effects.addProperty("ADBE Slider Control");
                    s.name = name;
                    s.property(1).setValue(val);
                    return s;
                }

                addSliderTxtCar("Phase", 0);
                addSliderTxtCar("Speed", 0);
                addSliderTxtCar("Radius", 145);
                addSliderTxtCar("Fade (*100)", 30);
                addSliderTxtCar("Slide In", 120);
                addSliderTxtCar("Number Mode", 1);

                for (var i = 0; i < selLayers.length; i++) {
                    var l = selLayers[i];
                    var posProp = l.property("ADBE Transform Group").property("ADBE Position");

                    // Recycling ring: each layer respawns every N steps, age in [0, N)
                    var carCommonBase =
                        "var N = " + carN + ";\n" +
                        "var myIdx = " + i + ";\n" +
                        "var ctrl = thisComp.layer('Carousel Clock');\n" +
                        "var t = ctrl.effect('Phase')('Slider') + time * ctrl.effect('Speed')('Slider');\n" +
                        "var fade = ctrl.effect('Fade (*100)')('Slider') / 100;\n" +
                        "var v = myIdx + Math.floor((t - myIdx) / N) * N;\n" +
                        "var age = t - v;\n";

                    var carSrcCode = carCommonBase +
                        "var useNum = ctrl.effect('Number Mode')('Slider');\n" +
                        "if (useNum < 0.5) { value; } else {\n" +
                        "  var s = ((v % 60) + 60) % 60;\n" +
                        "  s < 10 ? '0' + s : '' + s;\n" +
                        "}";

                    var carPosBase = carCommonBase +
                        "var radius = ctrl.effect('Radius')('Slider');\n" +
                        "var slide = ctrl.effect('Slide In')('Slider');\n" +
                        "var ang = degreesToRadians(180 + age * (360 / N));\n" +
                        "var cp = ctrl.toComp(ctrl.transform.anchorPoint);\n" +
                        "var birthP = ease(age, 0, fade, 0, 1);\n" +
                        "var x = cp[0] + Math.cos(ang) * radius - slide * (1 - birthP);\n" +
                        "var y = cp[1] + Math.sin(ang) * radius;\n" +
                        "var targetComp = [x, y];\n" +
                        "var localPos = thisLayer.hasParent ? thisLayer.parent.fromComp(targetComp) : targetComp;\n";

                    var carScaleCode = carCommonBase +
                        "var birth = ease(age, 0, fade, 0, 1);\n" +
                        "var death = ease(N - age, 0, fade, 0, 1);\n" +
                        "var f = Math.min(birth, death);\n" +
                        "value * f;";

                    var carOpCode = carCommonBase +
                        "var birth = ease(age, 0, fade, 0, 100);\n" +
                        "var death = ease(N - age, 0, fade, 0, 100);\n" +
                        "value * Math.min(birth, death) / 100;";

                    var textDoc = null;
                    try {
                        var textGroup = l.property("ADBE Text Properties");
                        if (textGroup) textDoc = textGroup.property("ADBE Text Document");
                    } catch (txtErr) { textDoc = null; }
                    if (textDoc) textDoc.expression = carSrcCode;

                    if (_isSeparated(posProp)) {
                        posProp.getSeparationFollower(0).expression = carPosBase + "localPos[0];";
                        posProp.getSeparationFollower(1).expression = carPosBase + "localPos[1];";
                    } else {
                        posProp.expression = carPosBase + "value.length > 2 ? [localPos[0], localPos[1], value[2]] : localPos;";
                    }
                    l.property("ADBE Transform Group").property("ADBE Scale").expression = carScaleCode;
                    l.property("ADBE Transform Group").property("ADBE Opacity").expression = carOpCode;
                }
            } else {
                throw new Error("Rig '" + name + "' is not fully implemented yet.");
            }
        }
        
        app.endUndoGroup();
        return JSON.stringify({ success: true });
    } catch (e) {
        app.endUndoGroup();
        return JSON.stringify({ error: e.toString() });
    }
}

// ============================================================================
// ---------- TextMulti: Effect Controls + linked Animator (the "+" button) ----------
// ============================================================================
// Pure Effect Controls driver. The panel has ONE "+" button that calls TXT_applyTextMulti().
// On every selected text layer it builds:
//   1. Native Expression Controls (Slider / Point / Angle / Checkbox / Dropdown), one per TextEvo
//      parameter, added in list order so they read as one block in the Effect Controls panel.
//   2. A native Text Animator named "TextMulti" with the matching animator properties.
//   3. Plain 1:1 link expressions: animator property = its control.
//   4. ONE small piece of stagger math: an Expression Selector whose Amount is "Strength" read at a
//      per-letter time offset:  Strength.valueAtTime(time - n * Delay)   (n = letter order from "Direction").
//      With Strength static nothing moves in time; keyframe Strength (e.g. 0 -> 100) and the letters follow
//      one after another. Delay = frames between letters, Direction / From index / Random Seed pick the order.
//
// NOTE: scripting cannot create ONE effect with real collapsible Base / Transform / Style groups (that takes a
// PseudoEffect installed into AE's PresetEffects.xml), so each parameter is its own Expression Control, all
// sharing the "TextMulti \u00b7 " name prefix, and each group starts with an inert "section title" control.
// Re-applying removes the previous rig first.
//
// Called from JS as: TXT_applyTextMulti()

var TM_PREFIX = "TextMulti \u00b7 ";
var TM_ANIMATOR = "TextMulti";
var TM_DIRECTION_ITEMS = ["Reading direction", "reversed", "Outward", "Inward", "Random", "from index"];

// Animator properties the controls drive: [key, matchName]. Rotation X / Y only show on 3D text.
var TM_ANIM_PROPS = [
  ["anchor",         "ADBE Text Anchor Point 3D"],
  ["position",       "ADBE Text Position 3D"],
  ["scale",          "ADBE Text Scale 3D"],
  ["skew",           "ADBE Text Skew"],
  ["skewAxis",       "ADBE Text Skew Axis"],
  ["rotation",       "ADBE Text Rotation"],
  ["rotationX",      "ADBE Text Rotation X"],
  ["rotationY",      "ADBE Text Rotation Y"],
  ["opacity",        "ADBE Text Opacity"],
  ["strokeWidth",    "ADBE Text Stroke Width"],
  ["lineAnchor",     "ADBE Text Line Anchor"],
  ["trackingAmount", "ADBE Text Tracking Amount"],
  ["lineSpacing",    "ADBE Text Line Spacing"],
  ["charOffset",     "ADBE Text Character Offset"],
  ["charValue",      "ADBE Text Character Value"],
  ["blur",           "ADBE Text Blur"]
];

// Effect-control factory: kind -> match name of the native Expression Control.
var TM_CONTROL_MATCH = {
  slider:   "ADBE Slider Control",
  point:    "ADBE Point Control",
  angle:    "ADBE Angle Control",
  checkbox: "ADBE Checkbox Control",
  dropdown: "ADBE Dropdown Control",
  header:   "ADBE Checkbox Control"     // inert checkbox used as a section title, see _tmAddControl
};

function _tmNum(arr, i, fallback) {
  var v = (arr instanceof Array) ? arr[i] : (i === 0 ? arr : undefined);
  return (typeof v === "number" && isFinite(v)) ? v : fallback;
}

// The complete control list, in Effect Controls order.
// `d` = the animator properties' own default values, so a fresh rig changes nothing on screen.
// Scale X/Y/Z and Rotation X/Y are the sub-controls that make "Separate XYZ" and "3D rotation" do something.
function _tmControlSpecs(d) {
  return [
    // ---- Base ----
    { name: "Base",              kind: "header",   value: 0 },
    { name: "Strength",          kind: "slider",   value: 100 },
    { name: "Delay",             kind: "slider",   value: 1.2 },
    { name: "Direction",         kind: "dropdown", value: 1, items: TM_DIRECTION_ITEMS },
    { name: "From index",        kind: "slider",   value: 1 },
    { name: "Random Seed",       kind: "slider",   value: 0 },
    // ---- Transform ----
    { name: "Transform",         kind: "header",   value: 0 },
    { name: "AnchorPoint",       kind: "point",    value: [_tmNum(d.anchor, 0, 0), _tmNum(d.anchor, 1, 0)] },
    { name: "Position X",        kind: "slider",   value: _tmNum(d.position, 0, 0) },
    { name: "Position Y",        kind: "slider",   value: _tmNum(d.position, 1, 0) },
    { name: "Position Z",        kind: "slider",   value: _tmNum(d.position, 2, 0) },
    { name: "Scale",             kind: "slider",   value: _tmNum(d.scale, 0, 100) },
    { name: "Separate XYZ",      kind: "checkbox", value: 0 },
    { name: "Scale X",           kind: "slider",   value: _tmNum(d.scale, 0, 100) },
    { name: "Scale Y",           kind: "slider",   value: _tmNum(d.scale, 1, 100) },
    { name: "Scale Z",           kind: "slider",   value: _tmNum(d.scale, 2, 100) },
    { name: "Skew Angle",        kind: "angle",    value: _tmNum(d.skew, 0, 0) },
    { name: "Skew Axis",         kind: "angle",    value: _tmNum(d.skewAxis, 0, 0) },
    { name: "Rotation",          kind: "angle",    value: _tmNum(d.rotation, 0, 0) },
    { name: "3D rotation",       kind: "checkbox", value: 0 },
    { name: "Rotation X",        kind: "angle",    value: _tmNum(d.rotationX, 0, 0) },
    { name: "Rotation Y",        kind: "angle",    value: _tmNum(d.rotationY, 0, 0) },
    { name: "Opacity",           kind: "slider",   value: _tmNum(d.opacity, 0, 100) },
    // ---- Style ----
    { name: "Style",             kind: "header",   value: 0 },
    { name: "Stroke Width",      kind: "slider",   value: _tmNum(d.strokeWidth, 0, 0) },
    { name: "Line Anchor",       kind: "slider",   value: _tmNum(d.lineAnchor, 0, 0) },
    { name: "Tracking Amount",   kind: "slider",   value: _tmNum(d.trackingAmount, 0, 0) },
    { name: "Line Spacing",      kind: "point",    value: [_tmNum(d.lineSpacing, 0, 0), _tmNum(d.lineSpacing, 1, 0)] },
    { name: "Character Offset",  kind: "slider",   value: _tmNum(d.charOffset, 0, 0) },
    { name: "Character Replace", kind: "slider",   value: _tmNum(d.charValue, 0, 0) },
    { name: "Blur",              kind: "point",    value: [_tmNum(d.blur, 0, 0), _tmNum(d.blur, 1, 0)] }
  ];
}

// Adds ONE native Expression Control and returns {name, note}. It never leaves a half-made effect behind.
// If AE refuses to set the Dropdown's items (older builds) it swaps in a 1..N slider, so Direction still works.
function _tmAddControl(layer, spec) {
  var parade = layer.property("ADBE Effect Parade"), fx = null, main, note = "";
  // Scripting cannot nest Effect Controls in real collapsible groups (that needs a PseudoEffect installed in
  // AE's PresetEffects.xml), so each group starts with an inert "section title" control instead.
  var label = (spec.kind === "header") ? "\u2500\u2500 " + spec.name + " \u2500\u2500" : spec.name;
  try {
    fx = parade.addProperty(TM_CONTROL_MATCH[spec.kind]);
    fx.name = TM_PREFIX + label;
    main = fx.property(1);
    if (spec.kind === "dropdown") {
      try {
        main.setPropertyParameters(spec.items);
      } catch (eItems) {
        fx.remove();
        fx = parade.addProperty(TM_CONTROL_MATCH.slider);
        fx.name = TM_PREFIX + spec.name + " (1-" + spec.items.length + ")";
        main = fx.property(1);
        note = spec.name + " dropdown unavailable (" + eItems.message + "): using a 1-" + spec.items.length + " slider";
      }
    }
    main.setValue(spec.value);
  } catch (e) {
    try { if (fx) { fx.remove(); } } catch (eRm) { /* nothing to clean */ }
    throw e;
  }
  return { name: fx.name, note: note };
}

// Removes any earlier TextMulti rig (also the old "Text 1" / "Text 2" one) so re-applying never stacks.
function _tmRemoveExisting(layer) {
  var fx = layer.property("ADBE Effect Parade"), i, p;
  for (i = fx.numProperties; i >= 1; i--) {
    p = fx.property(i);
    if (String(p.name).indexOf(TM_PREFIX) === 0) { p.remove(); }
  }
  var animators = layer.property("ADBE Text Properties").property("ADBE Text Animators");
  for (i = animators.numProperties; i >= 1; i--) {
    if (animators.property(i).name === TM_ANIMATOR) { animators.property(i).remove(); }
  }
}

// Depth-first search for a property by match name (or English display name) inside a group.
function _tmFind(group, matchNames, displayName) {
  var i, p, hit, k;
  for (i = 1; i <= group.numProperties; i++) {
    p = group.property(i);
    for (k = 0; k < matchNames.length; k++) { if (p.matchName === matchNames[k]) { return p; } }
    if (p.propertyType !== PropertyType.PROPERTY) {
      hit = _tmFind(p, matchNames, displayName);
      if (hit) { return hit; }
    } else if (displayName && p.name === displayName) {
      return p;
    }
  }
  return null;
}

function _tmExprString(name) { return String(name).replace(/\\/g, "\\\\").replace(/"/g, '\\"'); }

// Amount expression of the Expression Selector: Strength, read Delay-frames later for every letter.
//   Direction items: 1 Reading direction, 2 reversed, 3 Outward, 4 Inward, 5 Random, 6 from index
function _tmAmountExpr(ref) {
  return [
    "var s = " + ref("Strength") + ";",
    "var dl = " + ref("Delay") + " * thisComp.frameDuration;      // Delay = frames between letters",
    "var dir = Math.round(" + ref("Direction") + ");",
    "var i = textIndex, N = textTotal, mid = (N + 1) / 2, n;",
    "if (dir == 2) { n = N - i; }                                   // reversed",
    "else if (dir == 3) { n = Math.abs(i - mid); }                  // Outward (from the middle)",
    "else if (dir == 4) { n = (N - 1) / 2 - Math.abs(i - mid); }    // Inward (from both ends)",
    "else if (dir == 5) { seedRandom(" + ref("Random Seed") + " * 1000 + i, true); n = Math.floor(random(0, N)); }   // Random",
    "else if (dir == 6) { n = Math.abs(i - " + ref("From index") + "); }   // from index",
    "else { n = i - 1; }                                            // Reading direction",
    "s.valueAtTime(time - n * dl)"
  ].join("\n");
}

// Link expressions: animator property -> expression that reads its Effect Controls value.
// `ref(name)` is the effect("...")(1) reference (or the control's default value if that control could not be made).
function _tmLinkExpressions(ref) {
  return {
    anchor:         "var p = " + ref("AnchorPoint") + ";\n[p[0], p[1], 0]",
    position:       "[" + ref("Position X") + ", " + ref("Position Y") + ", " + ref("Position Z") + "]",
    // "Separate XYZ" off: one uniform Scale.  On: Scale X / Y / Z.
    scale:          "var s = " + ref("Scale") + ";\n" +
                    "var sep = " + ref("Separate XYZ") + ";\n" +
                    "sep ? [" + ref("Scale X") + ", " + ref("Scale Y") + ", " + ref("Scale Z") + "] : [s, s, s]",
    skew:           ref("Skew Angle"),
    skewAxis:       ref("Skew Axis"),
    rotation:       ref("Rotation"),
    // "3D rotation" off: only the flat Rotation.  On: Rotation X / Y as well (3D text).
    rotationX:      "var on = " + ref("3D rotation") + ";\non ? " + ref("Rotation X") + " : 0",
    rotationY:      "var on = " + ref("3D rotation") + ";\non ? " + ref("Rotation Y") + " : 0",
    opacity:        ref("Opacity"),
    strokeWidth:    ref("Stroke Width"),
    lineAnchor:     ref("Line Anchor"),
    trackingAmount: ref("Tracking Amount"),
    lineSpacing:    ref("Line Spacing"),
    charOffset:     ref("Character Offset"),
    charValue:      ref("Character Replace"),
    blur:           ref("Blur")
  };
}

// Builds the whole rig on one text layer. Returns {controls, links, skipped[], notes[], broken}.
// Each control is created on its own: one that AE refuses is skipped (its property then reads the control's
// default value) instead of aborting the rest. A failure in the animator itself removes the half-made rig.
function _tmBuildRig(layer) {
  var skipped = [], notes = [], links = 0, broken = 0, controls = 0, i, r, spec;

  _tmRemoveExisting(layer);
  try {
    // ---- 1. Text Animator + its properties ----
    var animators = layer.property("ADBE Text Properties").property("ADBE Text Animators");
    var animator = animators.addProperty("ADBE Text Animator");
    animator.name = TM_ANIMATOR;
    var animProps = animator.property("ADBE Text Animator Properties");

    var props = {}, defaults = {};
    for (i = 0; i < TM_ANIM_PROPS.length; i++) {
      try {
        props[TM_ANIM_PROPS[i][0]] = animProps.addProperty(TM_ANIM_PROPS[i][1]);
        try { defaults[TM_ANIM_PROPS[i][0]] = props[TM_ANIM_PROPS[i][0]].value; } catch (eVal) { /* keep fallback */ }
      } catch (eAdd) {
        skipped.push(TM_ANIM_PROPS[i][0] + " property");
      }
    }

    // ---- 2. Expression Controls (exact list, exact order) ----
    var specs = _tmControlSpecs(defaults), names = {}, byName = {};
    for (i = 0; i < specs.length; i++) {
      spec = specs[i];
      byName[spec.name] = spec;
      try {
        r = _tmAddControl(layer, spec);
        names[spec.name] = r.name;
        if (spec.kind !== "header") { controls++; }
        if (r.note) { notes.push(r.note); }
      } catch (eCtl) {
        skipped.push(spec.name + " (" + eCtl.message + ")");
      }
    }

    function lit(v) { return (v instanceof Array) ? "[" + v.join(", ") + "]" : String(v); }
    function ref(controlName) {
      if (names[controlName]) { return 'thisLayer.effect("' + _tmExprString(names[controlName]) + '")(1)'; }
      return lit(byName[controlName].value);          // control missing: keep the expression valid
    }

    // ---- 3. Link EVERY animator property to its control ----
    var linked = [], exprs = _tmLinkExpressions(ref), key;
    function link(prop, expr) {
      if (!prop) { return; }
      prop.expression = expr;
      linked.push(prop);
      links++;
    }
    for (i = 0; i < TM_ANIM_PROPS.length; i++) {
      key = TM_ANIM_PROPS[i][0];
      link(props[key], exprs[key]);
    }

    // ---- 4. Expression Selector: Strength read Delay-frames later per letter, in Direction order ----
    // If AE refuses the Expression Selector we keep the Range Selector and link its Amount to Strength.
    var amount = null, staggered = false, selectors = animator.property("ADBE Text Selectors"), expSel = null;
    try { expSel = selectors.addProperty("ADBE Text Expressible Selector"); } catch (eExp) { expSel = null; }
    if (expSel) {
      try { amount = expSel.property("ADBE Text Expressible Amount"); } catch (eAmt) { amount = null; }
      if (amount) {
        staggered = true;
        for (i = selectors.numProperties; i >= 1; i--) {
          if (selectors.property(i).matchName === "ADBE Text Selector") { selectors.property(i).remove(); }
        }
      }
    }
    if (!names["Strength"]) {
      if (amount) { link(amount, "100"); } else { skipped.push("Selector Amount"); }
    } else if (staggered) {
      link(amount, _tmAmountExpr(ref));
    } else {
      try { amount = _tmFind(selectors, ["ADBE Text Selector Max Amount"], "Amount"); } catch (eSel) { amount = null; }
      if (amount) { link(amount, ref("Strength")); } else { skipped.push("Selector Amount"); }
    }

    // ---- 5. Report links AE flagged as broken ----
    for (i = 0; i < linked.length; i++) {
      try { if (linked[i].expressionError) { broken++; } } catch (eErr) { /* property has no error state */ }
    }
  } catch (eFatal) {
    _tmRemoveExisting(layer);                        // never leave a half-linked rig behind
    throw new Error("TextMulti could not be built: " + eFatal.message);
  }

  return { controls: controls, links: links, skipped: skipped, notes: notes, broken: broken };
}

function TXT_applyTextMulti() {
  var undoOpen = false;
  try {
    var comp = _activeComp();
    var layers = comp.selectedLayers, targets = [], i;
    for (i = 0; i < layers.length; i++) { if (layers[i] instanceof TextLayer) { targets.push(layers[i]); } }
    if (targets.length === 0) { throw new Error("Select at least one text layer."); }

    var done = 0, controls = 0, links = 0, broken = 0, skipped = [], notes = [], r, j;
    app.beginUndoGroup("Add TextMulti");
    undoOpen = true;
    for (i = 0; i < targets.length; i++) {
      r = _tmBuildRig(targets[i]);
      done++; controls = r.controls; links = r.links; broken += r.broken;
      for (j = 0; j < r.skipped.length; j++) { if (skipped.length < 12) { skipped.push(r.skipped[j]); } }
      for (j = 0; j < r.notes.length; j++) { if (notes.length < 4) { notes.push(r.notes[j]); } }
    }
    app.endUndoGroup();
    undoOpen = false;

    var msg = "TextMulti added to " + done + " text layer" + (done === 1 ? "" : "s") + ": " + controls + " controls, " + links + " links.";
    if (notes.length) { msg += " " + notes.join("; ") + "."; }
    if (skipped.length) { msg += " Skipped: " + skipped.slice(0, 3).join(", ") + (skipped.length > 3 ? ", ..." : "") + "."; }
    if (broken) { msg += " " + broken + " link" + (broken === 1 ? "" : "s") + " reported an expression error."; }
    return _ok(msg, { layers: done, controls: controls, links: links, skipped: skipped, notes: notes, broken: broken });
  } catch (e) {
    return _err(e);
  } finally {
    if (undoOpen) { try { app.endUndoGroup(); } catch (eUndo) { /* nothing left to close */ } }
  }
}

// ============================================================================
// ---------- TextMulti: Copy / Paste and Save / Load of text animators ----------
// ============================================================================
// Called from JS as:
//   TXT_captureAnimators()   -> data.capture   (used by the Copy button and by Save)
//   TXT_applyCapture(cap)    -> Paste / Load onto every selected text layer
//
// A "capture" is a plain JSON copy of everything on the source layer that makes its text animators work:
//   * EVERY text animator (TextMulti or not), walked property by property: selectors (Range / Wiggly /
//     Expression), animator properties, values, EXPRESSIONS, keyframes (time, value, interpolation, ease),
//     enabled flags and names
//   * every effect those animators depend on: all "TextMulti . ..." controls plus any effect that an
//     expression reads through effect("name") (followed transitively), with values, expressions, keyframes
// EVERYTHING is stored, unpruned: AE's Property.isModified flag is not reliable enough to decide what to keep
// (a pruned slider value comes back as 0 - the "only the expression was loaded" bug).
// Keyframe times are stored relative to the layer's In point, so a paste starts at the new layer's In point.
//
// Applying is a rebuild, not a merge: a TextMulti rig on the target is replaced (never stacked); any other
// animator is added next to the target's own, and a same-named effect is renamed ("name 2") with the
// pasted expressions re-pointed to it.
// Limit: scripting cannot read the item names of a Dropdown Control, so only TextMulti's own Direction dropdown
// keeps its names ("Item 1..N" for any other dropdown; expressions read the index, so they still work).

// Any number in the capture must survive JSON (no NaN / Infinity).
function _cpClean(v) {
  var i, out;
  if (typeof v === "number") { return isFinite(v) ? v : 0; }
  if (v instanceof Array) { out = []; for (i = 0; i < v.length; i++) { out.push(_cpClean(v[i])); } return out; }
  return v;
}

function _cpInterpCode(t) {
  if (t === KeyframeInterpolationType.LINEAR) { return "L"; }
  if (t === KeyframeInterpolationType.HOLD) { return "H"; }
  return "B";
}
function _cpInterpEnum(c) {
  if (c === "L") { return KeyframeInterpolationType.LINEAR; }
  if (c === "H") { return KeyframeInterpolationType.HOLD; }
  return KeyframeInterpolationType.BEZIER;
}
function _cpEaseOut(list) {
  var out = [], i;
  for (i = 0; i < list.length; i++) { out.push({ s: _cpClean(list[i].speed), i: _cpClean(list[i].influence) }); }
  return out;
}
function _cpEaseIn(list) {
  var out = [], i, inf;
  for (i = 0; i < list.length; i++) {
    inf = Math.min(100, Math.max(0.1, list[i].i));
    out.push(new KeyframeEase(list[i].s, inf));
  }
  return out;
}

function _cpKeys(prop, ctx) {
  var out = [], k, o;
  for (k = 1; k <= prop.numKeys; k++) {
    o = { t: prop.keyTime(k) - ctx.base, v: _cpClean(prop.keyValue(k)) };
    try {
      o.ii = _cpInterpCode(prop.keyInInterpolationType(k));
      o.oi = _cpInterpCode(prop.keyOutInterpolationType(k));
      if (o.ii === "B" && o.oi === "B") {
        o.ie = _cpEaseOut(prop.keyInTemporalEase(k));
        o.oe = _cpEaseOut(prop.keyOutTemporalEase(k));
      }
    } catch (eKey) { /* keep the key with AE's default interpolation */ }
    out.push(o);
  }
  return out;
}

function _cpDropdownItems(prop, effectName) {
  if (effectName === TM_PREFIX + "Direction") { return TM_DIRECTION_ITEMS.slice(0); }
  var n = 0, i, out = [];
  try { n = Math.round(prop.maxValue); } catch (e1) { n = 0; }
  if (!(n >= 1 && n <= 64)) { try { n = Math.round(prop.value); } catch (e2) { n = 1; } }
  if (!(n >= 1 && n <= 64)) { n = 1; }
  for (i = 1; i <= n; i++) { out.push("Item " + i); }
  return out;
}

// One value property -> node, or null when there is nothing worth storing.
function _cpLeaf(prop, ctx, parentMatch) {
  var vt = prop.propertyValueType, expr = "", hasExpr = false, hasKeys = false, node;
  if (vt === PropertyValueType.NO_VALUE || vt === PropertyValueType.CUSTOM_VALUE || vt === PropertyValueType.MARKER ||
      vt === PropertyValueType.SHAPE || vt === PropertyValueType.TEXT_DOCUMENT) { return null; }
  try { hasKeys = prop.numKeys > 0; } catch (e1) {}
  try { expr = prop.expression; hasExpr = (expr !== undefined && expr !== null && String(expr) !== ""); } catch (e2) {}

  node = { m: prop.matchName, n: prop.name };
  try { node.v = _cpClean(prop.value); } catch (e4) {}
  if (hasKeys) { node.k = _cpKeys(prop, ctx); }
  if (hasExpr) {
    node.ex = String(expr);
    node.xe = prop.expressionEnabled ? 1 : 0;
    ctx.exprs.push(String(expr));
  }
  if (parentMatch === "ADBE Dropdown Control") { node.dd = _cpDropdownItems(prop, ctx.effect); }
  return node;
}

// Group (animator, selector, effect, ...) or value property -> node.
function _cpNode(prop, ctx, parentMatch) {
  var node, i, child, c, isEffect;
  if (prop.propertyType === PropertyType.PROPERTY) { return _cpLeaf(prop, ctx, parentMatch); }

  if (prop.matchName === "ADBE Effect Built In Params") { return null; }   // masks / blending: not part of a control
  node = { m: prop.matchName, n: prop.name, c: [] };
  try { if (prop.enabled === false) { node.off = 1; } } catch (e1) {}
  isEffect = (parentMatch === "ADBE Effect Parade");
  if (isEffect) { ctx.effect = prop.name; }
  for (i = 1; i <= prop.numProperties; i++) {
    child = prop.property(i);
    if (!child) { continue; }
    c = _cpNode(child, ctx, prop.matchName);
    if (c) { c.i = i; node.c.push(c); }
  }
  return node;
}

// Names used through effect("...") / effect('...') in a list of expressions -> {name: true}
function _cpEffectRefs(exprs) {
  var refs = {}, re = /effect\(\s*(["'])(.*?)\1\s*\)/g, m, i;
  for (i = 0; i < exprs.length; i++) {
    re.lastIndex = 0;
    while ((m = re.exec(exprs[i])) !== null) { refs[m[2]] = true; }
  }
  return refs;
}

function TXT_captureAnimators() {
  try {
    var comp = _activeComp();
    var sel = comp.selectedLayers, layer = null, i;
    for (i = 0; i < sel.length; i++) { if (sel[i] instanceof TextLayer) { layer = sel[i]; break; } }
    if (!layer) { throw new Error("Select a text layer first."); }

    var animators = layer.property("ADBE Text Properties").property("ADBE Text Animators");
    if (!animators || animators.numProperties === 0) {
      throw new Error("No text animator found on \"" + layer.name + "\".");
    }

    var ctx = { base: layer.inPoint, exprs: [], effect: "" };
    var cap = { v: 1, layer: layer.name, animators: [], effects: [] };
    for (i = 1; i <= animators.numProperties; i++) {
      cap.animators.push(_cpNode(animators.property(i), ctx, "ADBE Text Animators"));
    }

    // effects the animators depend on (TextMulti controls + anything an expression reads), transitively
    var parade = layer.property("ADBE Effect Parade"), taken = {}, found = [], changed = true, refs, fx, node;
    while (changed) {
      changed = false;
      refs = _cpEffectRefs(ctx.exprs);
      for (i = 1; i <= parade.numProperties; i++) {
        fx = parade.property(i);
        if (taken[i]) { continue; }
        if (fx.name.indexOf(TM_PREFIX) === 0 || refs.hasOwnProperty(fx.name)) {
          taken[i] = true;
          node = _cpNode(fx, ctx, "ADBE Effect Parade");
          if (node) { found.push({ idx: i, node: node }); }
          changed = true;
        }
      }
    }
    found.sort(function (a, b) { return a.idx - b.idx; });
    for (i = 0; i < found.length; i++) { cap.effects.push(found[i].node); }

    var na = cap.animators.length, ne = cap.effects.length;
    return _ok("Copied " + na + " text animator" + (na === 1 ? "" : "s") +
      (ne ? " + " + ne + " control" + (ne === 1 ? "" : "s") : "") + " from \"" + layer.name + "\".",
      { capture: cap, layer: layer.name, animators: na, effects: ne });
  } catch (e) {
    return _err(e);
  }
}

// ----- applying -----
function _cpFixExpr(expr, rename) {
  var k, out = String(expr);
  for (k in rename) {
    if (rename.hasOwnProperty(k)) {
      out = out.split('"' + k + '"').join('"' + rename[k] + '"').split("'" + k + "'").join("'" + rename[k] + "'");
    }
  }
  return out;
}

// Every failure is counted AND remembered by name, so the panel can say exactly what did not come back.
function _cpFail(ctx, label, why) {
  var who = String(ctx.cur || "").split(TM_PREFIX).join("");        // "Position Y > Slider", "TextMulti > Position 3D"
  ctx.failed++;
  if (ctx.log.length < 12) { ctx.log.push((who && who !== label ? who + " > " : "") + label + (why ? " (" + why + ")" : "")); }
}

function _cpSame(a, b) {
  var i;
  if (a instanceof Array && b instanceof Array) {
    if (a.length !== b.length) { return false; }
    for (i = 0; i < a.length; i++) { if (!_cpSame(a[i], b[i])) { return false; } }
    return true;
  }
  if (typeof a === "number" && typeof b === "number") { return Math.abs(a - b) <= 1e-4 * Math.max(1, Math.abs(b)); }
  return a === b;
}

function _cpApplyLeaf(p, c, ctx) {
  var i, k, idx, msg;
  if (c.dd) { try { p.setPropertyParameters(c.dd); } catch (e1) { /* not a dropdown */ } }

  if (c.k && c.k.length) {
    try {
      for (i = 0; i < c.k.length; i++) { p.setValueAtTime(ctx.base + c.k[i].t, c.k[i].v); }
      for (i = 0; i < c.k.length; i++) {
        k = c.k[i];
        idx = p.nearestKeyIndex(ctx.base + k.t);
        if (k.ii) { try { p.setInterpolationTypeAtKey(idx, _cpInterpEnum(k.ii), _cpInterpEnum(k.oi)); } catch (e2) {} }
        if (k.ie && k.oe) { try { p.setTemporalEaseAtKey(idx, _cpEaseIn(k.ie), _cpEaseIn(k.oe)); } catch (e3) {} }
      }
    } catch (eKeys) { _cpFail(ctx, c.n, "keyframes: " + eKeys.message); }
  } else if (c.v !== undefined) {
    // set, read back, retry once: a value that silently did not stick is the worst kind of failure
    try { p.setValue(c.v); } catch (e4) { msg = e4.message; }
    try {
      if (!_cpSame(p.value, c.v)) { p.setValue(c.v); }
      if (!_cpSame(p.value, c.v) && !(c.ex !== undefined && c.ex !== "")) { _cpFail(ctx, c.n, msg || "value did not stick"); }
    } catch (e5) { if (!(c.ex !== undefined && c.ex !== "")) { _cpFail(ctx, c.n, e5.message); } }
  }

  if (c.ex !== undefined && c.ex !== "") {
    try {
      p.expression = _cpFixExpr(c.ex, ctx.rename);
      ctx.reenable.push({ p: p, on: c.xe ? true : false });
    } catch (eEx) { _cpFail(ctx, c.n, "expression: " + eEx.message); }
  }
}

// Recreates one node inside `target` (a property group). Groups that are lists (selectors, animators,
// effects) always get a new child; fixed groups reuse the child AE already made.
function _cpApplyNode(target, c, ctx) {
  var indexed = (target.propertyType === PropertyType.INDEXED_GROUP), sub = null, i;
  if (!indexed) {
    try { sub = target.property(c.m); } catch (e0) { sub = null; }
    if (!sub && c.i) {                                    // matchName lookup failed: same slot by index
      try { sub = target.property(c.i); if (sub && sub.matchName !== c.m) { sub = null; } } catch (e00) { sub = null; }
    }
  }
  if (!sub) {
    if (!target.canAddProperty(c.m)) { throw new Error("cannot add " + c.m); }
    sub = target.addProperty(c.m);
  }

  if (c.c) {
    if (c.n && sub.name !== c.n) { try { sub.name = c.n; } catch (e1) { /* fixed name */ } }
    for (i = 0; i < c.c.length; i++) {
      try { _cpApplyNode(sub, c.c[i], ctx); } catch (e2) { _cpFail(ctx, c.c[i].n, e2.message); }
    }
    if (c.off) { try { sub.enabled = false; } catch (e3) {} }
  } else {
    _cpApplyLeaf(sub, c, ctx);
  }
  return sub;
}

function _cpRemoveNamed(group, name) {
  var i;
  for (i = group.numProperties; i >= 1; i--) { if (group.property(i).name === name) { group.property(i).remove(); } }
}

function _cpUniqueName(group, name) {
  var taken = {}, i, n = 2, out = name;
  for (i = 1; i <= group.numProperties; i++) { taken[group.property(i).name] = true; }
  while (taken.hasOwnProperty(out)) { out = name + " " + n; n++; }
  return out;
}

function _cpApplyToLayer(layer, cap, totals) {
  var ctx = { base: layer.inPoint, rename: {}, reenable: [], failed: 0, log: [] };
  var parade = layer.property("ADBE Effect Parade");
  var animators = layer.property("ADBE Text Properties").property("ADBE Text Animators");
  var effects = cap.effects || [], i, j, e, a, fx, an, name, sels;

  // 1. effects first, so the expressions of the animators find them
  for (i = 0; i < effects.length; i++) {
    e = effects[i];
    try {
      ctx.cur = e.n;
      name = e.n;
      if (String(name).indexOf(TM_PREFIX) === 0) { _cpRemoveNamed(parade, name); }
      else { name = _cpUniqueName(parade, name); if (name !== e.n) { ctx.rename[e.n] = name; } }
      fx = parade.addProperty(e.m);
      fx.name = name;
      for (j = 0; j < e.c.length; j++) {
        try { _cpApplyNode(fx, e.c[j], ctx); } catch (eP) { _cpFail(ctx, e.c[j].n, eP.message); }
      }
      if (e.off) { try { fx.enabled = false; } catch (eEn) {} }
      totals.effects++;
    } catch (eFx) { _cpFail(ctx, e.n, "effect: " + eFx.message); }
  }

  // 2. animators
  for (i = 0; i < cap.animators.length; i++) {
    a = cap.animators[i];
    try {
      ctx.cur = a.n;
      if (a.n === TM_ANIMATOR) { _cpRemoveNamed(animators, TM_ANIMATOR); }
      an = animators.addProperty("ADBE Text Animator");
      an.name = a.n;
      sels = an.property("ADBE Text Selectors");                  // drop the default Range Selector
      for (j = sels.numProperties; j >= 1; j--) { sels.property(j).remove(); }
      for (j = 0; j < a.c.length; j++) {
        try { _cpApplyNode(an, a.c[j], ctx); } catch (eA) { _cpFail(ctx, a.c[j].n, eA.message); }
      }
      if (a.off) { try { an.enabled = false; } catch (eEn2) {} }
      totals.animators++;
    } catch (eAn) { _cpFail(ctx, a.n, "animator: " + eAn.message); }
  }

  // 3. expressions AE disabled while a control was still missing are switched back on; count real errors
  for (i = 0; i < ctx.reenable.length; i++) {
    try { ctx.reenable[i].p.expressionEnabled = ctx.reenable[i].on; } catch (eX) {}
    try { if (ctx.reenable[i].p.expressionError) { totals.errors++; } } catch (eErr) {}
  }
  totals.failed += ctx.failed;
  for (i = 0; i < ctx.log.length && totals.log.length < 12; i++) { totals.log.push(ctx.log[i]); }
}

// =====================================================================================
// Power Workflow Boosters
// Called from JS as:
//   TOOLS_batchRename(opts)      - Batch Renamer & Prefix/Suffix Tool
//   TOOLS_autoColorCode(scope)   - Smart Layer Color Coder
//   TOOLS_projectCleanup(opts)   - Project Cleaner & Sanitizer
// Expression Power-Tools (ExpressFlex) reuse the existing EXPR_applyCode(code) bridge above -
// the JS side builds the finished expression string from the slider/control values and sends
// it straight through, so no dedicated host function is needed for those.
// =====================================================================================

// ---------- Batch Renamer & Prefix/Suffix Tool ----------
// opts: {
//   find, replace       literal (non-regex) search & replace, applied first when find is non-empty
//   prefix, suffix      always prepended/appended if non-empty
//   seq: {
//     enabled           when true, the layer's base name becomes "<base>_<padded number>"
//                       instead of the find/replace result (prefix/suffix still apply on top)
//     base              base text before the number, e.g. "Element"
//     start             first number used, e.g. 1
//     digits            zero-padding width, e.g. 2 -> "01"
//   }
// }
// Numbering follows the selected layers' current stacking order (top to bottom) so a re-run
// with the same settings is predictable.
function TOOLS_batchRename(opts) {
  try {
    var comp = _activeComp();
    var layers = comp.selectedLayers;
    if (!layers || !layers.length) { throw new Error("Select one or more layers first."); }

    layers = layers.slice().sort(function (a, b) { return a.index - b.index; });

    opts = opts || {};
    var find = opts.find || "";
    var replace = (opts.replace !== undefined && opts.replace !== null) ? String(opts.replace) : "";
    var prefix = opts.prefix || "";
    var suffix = opts.suffix || "";
    var seq = opts.seq || {};
    var digits = Math.max(1, Math.min(6, parseInt(seq.digits, 10) || 2));
    var start = parseInt(seq.start, 10);
    if (isNaN(start)) { start = 1; }

    var renamed = 0, i, layer, base, finalName;
    app.beginUndoGroup("Batch Rename Layers");
    try {
      for (i = 0; i < layers.length; i++) {
        layer = layers[i];
        base = layer.name;

        if (seq.enabled) {
          var num = String(start + i);
          while (num.length < digits) { num = "0" + num; }
          base = (seq.base || base) + "_" + num;
        } else if (find) {
          base = base.split(find).join(replace); // literal split/join - no regex injection risk
        }

        finalName = prefix + base + suffix;
        if (finalName !== layer.name && finalName !== "") {
          layer.name = finalName;
          renamed++;
        }
      }
    } finally {
      app.endUndoGroup();
    }

    if (!renamed) { return _notice("Nothing to rename - the result matched every layer's current name."); }
    return _ok(renamed + " layer" + (renamed === 1 ? "" : "s") + " renamed.");
  } catch (e) {
    return _err(e);
  }
}

// ---------- Smart Layer Color Coder ----------
// Called from JS as: TOOLS_autoColorCode("selected" | "all")
// Sets the AE Layer Label color by layer type: Shape = Blue(8), Text = Yellow(2),
// Audio-only = Green(9), Adjustment = Purple(10). Any other layer type (Solid, Null, Camera,
// Light, footage/precomp, etc.) is left untouched, so this can be run repeatedly and safely
// mixed with manual label colors on everything else.
function _colorCodeLabelFor(layer) {
  try {
    if (layer.adjustmentLayer) { return 10; }              // Purple
    if (layer instanceof TextLayer) { return 2; }           // Yellow
    if (layer instanceof ShapeLayer) { return 8; }          // Blue
    if (layer.hasAudio && layer.hasVideo === false) { return 9; } // Green (audio-only)
  } catch (e) { /* some layer types don't expose every property above - just skip them */ }
  return null;
}
function TOOLS_autoColorCode(scope) {
  try {
    var comp = _activeComp();
    var layers = (scope === "all") ? comp.layers : comp.selectedLayers;
    if (!layers || !layers.length) {
      throw new Error(scope === "all" ? "This composition has no layers." : "Select one or more layers first (or switch to \"Whole Comp\").");
    }

    var colored = 0, skipped = 0, i, layer, label;
    app.beginUndoGroup("Smart Layer Color Coder");
    try {
      for (i = 1; i <= layers.length; i++) {
        layer = (scope === "all") ? layers[i] : layers[i - 1];
        label = _colorCodeLabelFor(layer);
        if (label !== null) { layer.label = label; colored++; } else { skipped++; }
      }
    } finally {
      app.endUndoGroup();
    }

    if (!colored) { return _notice("No Shape, Text, Adjustment or audio-only layers found to color-code."); }
    return _ok(colored + " layer" + (colored === 1 ? "" : "s") + " color-coded." + (skipped ? " (" + skipped + " left as is)" : ""));
  } catch (e) {
    return _err(e);
  }
}

// ---------- Project Cleaner & Sanitizer ----------
// Recursively removes every empty FolderItem under (but not including) the given folder.
// Post-order: a subfolder's own children are cleaned first, so a folder that only contained
// now-deleted empty folders is correctly removed too.
function _deleteEmptyFolders(folder) {
  var count = 0, i, item;
  for (i = folder.numItems; i >= 1; i--) {
    item = folder.item(i);
    if (item instanceof FolderItem) {
      count += _deleteEmptyFolders(item);
      if (item.numItems === 0) { item.remove(); count++; }
    }
  }
  return count;
}
// Called from JS as: TOOLS_projectCleanup({ removeUnused, consolidateDuplicates, deleteEmptyFolders, purgeCache })
// Each step is optional and independent; results are reported together in one message.
// Note: removing unused footage and consolidating duplicates change the Project panel itself
// (not just a layer property), so - like any project-item edit - they're a normal Undo step,
// but purging cache can still clear AE's separate undo/cache history as usual.
function TOOLS_projectCleanup(opts) {
  try {
    opts = opts || {};
    var proj = app.project;
    if (!proj) { throw new Error("No project open."); }

    var parts = [], didAny = false;
    app.beginUndoGroup("Project Cleanup");
    try {
      if (opts.consolidateDuplicates) {
        var consolidated = proj.consolidateFootage();
        parts.push(consolidated + " duplicate footage item" + (consolidated === 1 ? "" : "s") + " consolidated.");
        didAny = true;
      }
      if (opts.removeUnused) {
        var removed = proj.removeUnusedFootage();
        parts.push(removed + " unused footage item" + (removed === 1 ? "" : "s") + " removed.");
        didAny = true;
      }
      if (opts.deleteEmptyFolders) {
        var deletedFolders = _deleteEmptyFolders(proj.rootFolder);
        parts.push(deletedFolders + " empty folder" + (deletedFolders === 1 ? "" : "s") + " deleted.");
        didAny = true;
      }
    } finally {
      app.endUndoGroup();
    }

    if (opts.purgeCache) {
      app.purge(PurgeTarget.ALL_CACHES);
      parts.unshift("Memory & disk cache purged.");
      didAny = true;
    }

    if (!didAny) { throw new Error("Select at least one cleanup action."); }
    return _ok(parts.join(" "));
  } catch (e) {
    return _err(e);
  }
}

function TXT_applyCapture(cap) {
  var undoOpen = false;
  try {
    if (!cap || !cap.animators || cap.animators.length === 0) { throw new Error("Nothing to apply."); }
    var comp = _activeComp();
    var sel = comp.selectedLayers, targets = [], i;
    for (i = 0; i < sel.length; i++) { if (sel[i] instanceof TextLayer) { targets.push(sel[i]); } }
    if (targets.length === 0) { throw new Error("Select at least one text layer."); }

    var totals = { animators: 0, effects: 0, failed: 0, errors: 0, log: [] };
    app.beginUndoGroup("Apply Text Animators");
    undoOpen = true;
    for (i = 0; i < targets.length; i++) { _cpApplyToLayer(targets[i], cap, totals); }
    app.endUndoGroup();
    undoOpen = false;

    var perLayer = totals.animators / targets.length, ctl = totals.effects / targets.length;
    var msg = "Added " + perLayer + " text animator" + (perLayer === 1 ? "" : "s") +
      (ctl ? " + " + ctl + " control" + (ctl === 1 ? "" : "s") : "") +
      " to " + targets.length + " text layer" + (targets.length === 1 ? "" : "s") + ".";
    if (totals.failed) {
      msg += " " + totals.failed + " item" + (totals.failed === 1 ? "" : "s") + " could not be restored: " +
        totals.log.slice(0, 3).join(", ") + (totals.log.length > 3 ? ", ..." : "") + ".";
    }
    if (totals.errors) { msg += " " + totals.errors + " expression" + (totals.errors === 1 ? "" : "s") + " report an error."; }
    return _ok(msg, totals);
  } catch (e) {
    return _err(e);
  } finally {
    if (undoOpen) { try { app.endUndoGroup(); } catch (eUndo) { /* nothing left to close */ } }
  }
}

// ---------------------------------------------------------
// Shortcutz tab: quick-effect / utility / custom-shortcut execution.
// (Expression shortcuts reuse EXPR_applyCode; pinned .ffx-from-library shortcuts reuse PRE_apply.)
// ---------------------------------------------------------

// Called from JS as: SHTZ_addEffect("ADBE Box Blur2", "Fast Box Blur"). Adds one native effect
// (by matchName) to the Effect Parade of every selected layer. `label` is only used for the undo
// group name / result message - matchName is what actually gets added.
function SHTZ_addEffect(matchName, label) {
  try {
    var comp = _activeComp();
    var sel = comp.selectedLayers;
    if (!sel || sel.length === 0) { throw new Error("Select a layer first."); }
    var niceName = label || matchName;
    var added = 0, failed = 0, i;

    app.beginUndoGroup("Add Effect: " + niceName);
    try {
      for (i = 0; i < sel.length; i++) {
        try { sel[i].property("ADBE Effect Parade").addProperty(matchName); added++; }
        catch (eAdd) { failed++; }
      }
    } finally {
      app.endUndoGroup();
    }

    var msg = "Added " + niceName + " to " + added + " layer" + (added === 1 ? "" : "s") + ".";
    if (failed) { msg += " (" + failed + " layer" + (failed === 1 ? "" : "s") + " skipped)"; }
    return _ok(msg);
  } catch (e) {
    return _err(e);
  }
}

// Called from JS as: SHTZ_autoParentToTop(). Parents every selected layer to the topmost
// (lowest layer-index) layer in the current selection - a one-click version of manually
// dragging every other selected layer's parent pick-whip onto the top one.
function SHTZ_autoParentToTop() {
  try {
    var comp = _activeComp();
    var sel = comp.selectedLayers;
    if (!sel || sel.length < 2) { throw new Error("Select at least two layers - the topmost one becomes the parent."); }

    var sorted = sel.slice().sort(function (a, b) { return a.index - b.index; });
    var parentLayer = sorted[0];
    var r = { parented: 0, locked: 0, failed: 0 }, i, child;

    app.beginUndoGroup("Auto Parent");
    try {
      for (i = 1; i < sorted.length; i++) {
        child = sorted[i];
        if (child.locked) { r.locked++; continue; }
        try { child.parent = parentLayer; r.parented++; } catch (eParent) { r.failed++; }
      }
    } finally {
      app.endUndoGroup();
    }

    var msg = "Parented " + r.parented + " layer" + (r.parented === 1 ? "" : "s") + ' to "' + parentLayer.name + '".';
    var skipped = r.locked + r.failed;
    if (skipped) { msg += " (" + skipped + " skipped)"; }
    return _ok(msg);
  } catch (e) {
    return _err(e);
  }
}

// Called from JS as: SHTZ_applyFfxPath("C:/.../MyPreset.ffx"). Same underlying call as PRE_apply
// (layer.applyPreset), but takes a standalone absolute path instead of a preset-folder + relative
// file name - for a custom shortcut whose .ffx doesn't live inside the Animation Presets folder.
function SHTZ_applyFfxPath(fullPath) {
  try {
    if (!fullPath) { throw new Error("No .ffx path set for this shortcut."); }
    var file = new File(fullPath);
    if (!file.exists) { throw new Error("Preset file not found:\n" + fullPath); }
    var comp = _activeComp();
    var sel = comp.selectedLayers;
    if (!sel || sel.length === 0) { throw new Error("Select a layer first."); }

    app.beginUndoGroup("Apply Preset: " + file.displayName);
    try {
      sel[0].applyPreset(file);
    } finally {
      app.endUndoGroup();
    }
    return _ok('Applied "' + file.displayName + '" to ' + sel.length + " layer" + (sel.length === 1 ? "" : "s") + ".");
  } catch (e) {
    return _err(e);
  }
}

// Called from JS as: SHTZ_pickFfxFile(). Opens a native "choose file" dialog filtered to .ffx,
// for the "+ Add Custom Shortcut" builder's ".ffx Path" Browse button. Returns { path } or
// { path: null } if the user cancelled.
function SHTZ_pickFfxFile() {
  try {
    var file = File.openDialog("Select an Animation Preset (.ffx)", "Animation Presets:*.ffx");
    return _ok("OK", { path: file ? file.fsName : null });
  } catch (e) {
    return _err(e);
  }
}

// Called from JS as: SHTZ_runCustomScript("code here"). Runs an arbitrary snippet of raw
// ExtendScript typed into a "JSX Script" custom shortcut, wrapped in its own undo group so it
// behaves like every other one-click action in this panel (and so it can be undone in one step).
function SHTZ_runCustomScript(code) {
  var undoOpen = false;
  try {
    if (!code || !String(code).replace(/^\s+|\s+$/g, "").length) { throw new Error("This shortcut has no script to run."); }
    app.beginUndoGroup("Custom Shortcut Script");
    undoOpen = true;
    var result = eval(code);
    app.endUndoGroup();
    undoOpen = false;
    return _ok("Script ran successfully." + (result !== undefined && result !== null ? " (" + String(result) + ")" : ""));
  } catch (e) {
    return _err(e);
  } finally {
    if (undoOpen) { try { app.endUndoGroup(); } catch (eUndo) { /* nothing left to close */ } }
  }
}

// Called from JS as: SHTZ_runCommandId(2265). Runs a native After Effects menu command by its
// numeric Command ID (the same id app.executeCommand() and the Keyboard Shortcut Editor use) -
// the "Native Menu Command ID" function type for a custom/overridden Shortcutz tile.
function SHTZ_runCommandId(id) {
  var undoOpen = false;
  try {
    var cmdId = parseInt(id, 10);
    if (!cmdId || cmdId <= 0) { throw new Error("Enter a valid numeric Command ID for this shortcut."); }
    app.beginUndoGroup("Shortcut: Command " + cmdId);
    undoOpen = true;
    app.executeCommand(cmdId);
    app.endUndoGroup();
    undoOpen = false;
    return _ok("Ran command " + cmdId + ".");
  } catch (e) {
    return _err(e);
  } finally {
    if (undoOpen) { try { app.endUndoGroup(); } catch (eUndo) { /* nothing left to close */ } }
  }
}


// ─────────────────────────────────────────────
// NEUCURVE LIVE AUTO APPLY
// Remembers the LAST keyframes you clicked in the timeline (survives deselecting / clicking elsewhere)
// and applies the NeuCurve graph to them live, so the After Effects Graph Editor follows every change.
//   NC_liveStatus()                  - polled by the panel: what is selected / remembered (also updates the memory)
//   NC_liveRun(fnName, jsonParams)   - runs one of the apply* functions on the current selection, or, when
//                                      nothing is selected, on the remembered keyframes (re-selecting them)
// ES3 only (ExtendScript): no let/const/forEach/trailing commas.
// ─────────────────────────────────────────────
if (!$.global.__NC_LIVE) { $.global.__NC_LIVE = { last: null, sig: "" }; }

function _ncPropPath(prop) {
    var path = [];
    var n = prop;
    var guard = 0;
    while (n && n.propertyDepth > 0 && guard < 40) {
        path.unshift(n.propertyIndex);
        n = n.parentProperty;
        guard++;
    }
    return path;
}

function _ncCollectSel(comp) {
    var items = [];
    var total = 0;
    var props = [];
    try { props = comp.selectedProperties; } catch (e0) { props = []; }
    for (var i = 0; i < props.length; i++) {
        var p = props[i];
        try {
            if (p.propertyType !== PropertyType.PROPERTY || p.numKeys < 1) { continue; }
            var keys = [];
            for (var k = 1; k <= p.numKeys; k++) {
                if (p.keySelected(k)) { keys.push({ i: k, t: p.keyTime(k) }); }
            }
            if (keys.length === 0) { continue; }
            var lyr = p.propertyGroup(p.propertyDepth);
            items.push({ layer: lyr.index, lname: lyr.name, path: _ncPropPath(p), name: p.name, keys: keys });
            total += keys.length;
        } catch (e1) { }
    }
    return { items: items, total: total };
}

function _ncSelSig(items) {
    var parts = [];
    for (var i = 0; i < items.length; i++) {
        var it = items[i];
        var ts = [];
        for (var k = 0; k < it.keys.length; k++) { ts.push(it.keys[k].i + "@" + it.keys[k].t); }
        parts.push(it.layer + ":" + it.path.join(".") + ":" + ts.join(","));
    }
    return parts.join("|");
}

function _ncLabel(items, total) {
    if (!items.length) { return ""; }
    var first = items[0];
    var s = first.name + " \u00b7 " + first.lname;
    if (items.length > 1) { s = first.name + " +" + (items.length - 1) + " prop \u00b7 " + first.lname; }
    s += " \u00b7 " + total + (total === 1 ? " key" : " keys");
    return s;
}

function _ncFindLayer(comp, it) {
    var lyr = null;
    try { lyr = comp.layer(it.layer); } catch (e) { lyr = null; }
    if (lyr && lyr.name === it.lname) { return lyr; }
    for (var i = 1; i <= comp.numLayers; i++) {
        if (comp.layer(i).name === it.lname) { return comp.layer(i); }
    }
    return lyr;
}

// Re-selects the remembered keyframes. Returns how many keyframes were selected again.
function _ncRestoreSel(comp, last) {
    var restored = 0;
    for (var a = 0; a < last.items.length; a++) {
        var it = last.items[a];
        try {
            var node = _ncFindLayer(comp, it);
            for (var j = 0; node && j < it.path.length; j++) { node = node.property(it.path[j]); }
            if (!node || node.numKeys < 1) { continue; }
            for (var b = 0; b < it.keys.length; b++) {
                var want = it.keys[b];
                var idx = want.i;
                if (idx > node.numKeys || Math.abs(node.keyTime(idx) - want.t) > 0.0005) {
                    idx = node.nearestKeyIndex(want.t);
                    if (Math.abs(node.keyTime(idx) - want.t) > 0.0005) { continue; }
                }
                node.setSelectedAtKey(idx, true);
                restored++;
            }
        } catch (e) { }
    }
    return restored;
}

function NC_liveStatus() {
    try {
        var comp = app.project.activeItem;
        if (!comp || !(comp instanceof CompItem)) { return _json({ ok: true, state: "nocomp" }); }
        var s = _ncCollectSel(comp);
        if (s.total > 0) {
            $.global.__NC_LIVE.last = { compId: comp.id, items: s.items, total: s.total };
            return _json({ ok: true, state: "selected", total: s.total, label: _ncLabel(s.items, s.total) });
        }
        var last = $.global.__NC_LIVE.last;
        if (last && last.compId === comp.id) {
            return _json({ ok: true, state: "remembered", total: last.total, label: _ncLabel(last.items, last.total) });
        }
        return _json({ ok: true, state: "none" });
    } catch (e) {
        return _json({ ok: false, message: e.toString() });
    }
}

function NC_liveRun(fnName, jsonParams) {
    try {
        if (!/^apply[A-Za-z]*$/.test(String(fnName))) { return JSON.stringify({ error: "Fungsi live tidak valid." }); }
        var comp = app.project.activeItem;
        if (!comp || !(comp instanceof CompItem)) { return JSON.stringify({ error: "Tidak ada komposisi aktif." }); }
        var live = $.global.__NC_LIVE;
        var s = _ncCollectSel(comp);
        var items = null;
        if (s.total > 0) {
            live.last = { compId: comp.id, items: s.items, total: s.total };
            items = s.items;
        } else if (fnName === "applyCubicBezier" && live.last && live.last.compId === comp.id) {
            // Nothing is selected right now: go back to the keyframes that were clicked last.
            if (_ncRestoreSel(comp, live.last) === 0) {
                live.last = null;
                return JSON.stringify({ error: "Keyframe terakhir yang dipilih sudah tidak ditemukan. Klik keyframe lagi." });
            }
            items = live.last.items;
        } else {
            return JSON.stringify({ error: "Klik sebuah keyframe di timeline dulu." });
        }
        // Identical request on identical keyframes: nothing to change, so skip it (no extra undo steps).
        var sig = fnName + "#" + jsonParams + "#" + comp.id + "#" + _ncSelSig(items);
        if (sig === live.sig) { return JSON.stringify({ success: true, keyframesModified: 1, unchanged: true }); }
        var res = eval(fnName + "(jsonParams)");
        try {
            var o = JSON.parse(res);
            if (o && !o.error) { live.sig = sig; }
        } catch (e2) { }
        return res;
    } catch (e) {
        return JSON.stringify({ error: e.toString() });
    }
}



// ======================================================================================================
// Auto Morph  (Tools tab)
// ------------------------------------------------------------------------------------------------------
// Select TWO shape layers. The upper one morphs into the lower one: its first Path is keyframed from its own
// shape (at the playhead) to the lower layer's shape (after <frames> frames). Different vertex counts are
// matched by splitting the longest curve segments of the shorter path (shape stays identical), the start vertex
// and direction are chosen to minimise travel, and the lower layer's shape is converted into the upper layer's
// space so it lands where the lower layer sits. Fill color, stroke color and stroke width are keyframed too
// when both layers have them. Limits: 2D layers, the FIRST Path in each layer, group transforms and parents
// are ignored; Rectangle / Ellipse / Star must be "Convert to Bezier Path" first.
// ======================================================================================================

function _amFind(group, matchName) {
  var i, p, r;
  for (i = 1; i <= group.numProperties; i++) {
    p = group.property(i);
    if (p.matchName === matchName) { return p; }
    if (p.propertyType === PropertyType.INDEXED_GROUP || p.propertyType === PropertyType.NAMED_GROUP) {
      r = _amFind(p, matchName);
      if (r) { return r; }
    }
  }
  return null;
}

function _amDist(a, b) { var dx = a[0] - b[0], dy = a[1] - b[1]; return Math.sqrt(dx * dx + dy * dy); }
function _amMid(a, b) { return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; }

// Plain-array copy of an AE Shape: v = vertices, i / o = in / out tangents (relative to the vertex).
function _amRead(shape) {
  var o = { v: [], i: [], o: [], closed: shape.closed }, k;
  for (k = 0; k < shape.vertices.length; k++) {
    o.v.push([shape.vertices[k][0], shape.vertices[k][1]]);
    o.i.push([shape.inTangents[k][0], shape.inTangents[k][1]]);
    o.o.push([shape.outTangents[k][0], shape.outTangents[k][1]]);
  }
  return o;
}

function _amToShape(o) {
  var s = new Shape();
  s.vertices = o.v; s.inTangents = o.i; s.outTangents = o.o; s.closed = o.closed;
  return s;
}

function _amSegPoints(o, idx) {
  var n = o.v.length, j = (idx + 1) % n, p0 = o.v[idx], p3 = o.v[j];
  return [p0, [p0[0] + o.o[idx][0], p0[1] + o.o[idx][1]], [p3[0] + o.i[j][0], p3[1] + o.i[j][1]], p3];
}

// Splits segment idx -> idx+1 at t = 0.5 (de Casteljau). The curve keeps exactly the same shape.
function _amSplit(o, idx) {
  var n = o.v.length, j = (idx + 1) % n, P = _amSegPoints(o, idx);
  var q0 = _amMid(P[0], P[1]), q1 = _amMid(P[1], P[2]), q2 = _amMid(P[2], P[3]);
  var r0 = _amMid(q0, q1), r1 = _amMid(q1, q2), m = _amMid(r0, r1);
  o.o[idx] = [q0[0] - P[0][0], q0[1] - P[0][1]];
  o.i[j] = [q2[0] - P[3][0], q2[1] - P[3][1]];
  o.v.splice(idx + 1, 0, m);
  o.i.splice(idx + 1, 0, [r0[0] - m[0], r0[1] - m[1]]);
  o.o.splice(idx + 1, 0, [r1[0] - m[0], r1[1] - m[1]]);
}

function _amGrow(o, target) {
  var n, segs, k, best, bestLen, P, len;
  while (o.v.length < target) {
    n = o.v.length;
    segs = o.closed ? n : n - 1;
    if (segs < 1) { throw new Error("A path needs at least two vertices to morph."); }
    best = 0; bestLen = -1;
    for (k = 0; k < segs; k++) {
      P = _amSegPoints(o, k);
      len = _amDist(P[0], P[1]) + _amDist(P[1], P[2]) + _amDist(P[2], P[3]);
      if (len > bestLen) { bestLen = len; best = k; }
    }
    _amSplit(o, best);
  }
}

// Same path, other start vertex and / or direction.
function _amReorder(o, shift, rev) {
  var n = o.v.length, r = { v: [], i: [], o: [], closed: o.closed }, k, src;
  for (k = 0; k < n; k++) {
    src = rev ? (n - 1 - k) : k;
    r.v.push(o.v[src]);
    r.i.push(rev ? o.o[src] : o.i[src]);
    r.o.push(rev ? o.i[src] : o.o[src]);
  }
  if (!shift) { return r; }
  var s = { v: [], i: [], o: [], closed: o.closed };
  for (k = 0; k < n; k++) {
    src = (k + shift) % n;
    s.v.push(r.v[src]); s.i.push(r.i[src]); s.o.push(r.o[src]);
  }
  return s;
}

function _amCost(a, b) {
  var c = 0, k, dx, dy;
  for (k = 0; k < a.v.length; k++) { dx = a.v[k][0] - b.v[k][0]; dy = a.v[k][1] - b.v[k][1]; c += dx * dx + dy * dy; }
  return c;
}

// Picks the start vertex / direction of b that sits closest to a, so the morph does not twist.
function _amAlign(a, b) {
  var n = b.v.length, best = b, bestCost = _amCost(a, b), rev, shift, cand, cost, maxShift;
  for (rev = 0; rev < 2; rev++) {
    maxShift = b.closed ? n : 1;
    for (shift = 0; shift < maxShift; shift++) {
      if (!rev && !shift) { continue; }
      cand = _amReorder(b, shift, rev === 1);
      cost = _amCost(a, cand);
      if (cost < bestCost) { bestCost = cost; best = cand; }
    }
  }
  return best;
}

function _amPos(layer, t) {
  var tg = layer.property("ADBE Transform Group"), p = tg.property("ADBE Position");
  if (p.dimensionsSeparated) {
    return [tg.property("ADBE Position_0").valueAtTime(t, false), tg.property("ADBE Position_1").valueAtTime(t, false)];
  }
  var v = p.valueAtTime(t, false);
  return [v[0], v[1]];
}

// 2x2 linear part of a layer transform (rotation * scale): [m00, m01, m10, m11]
function _amLinear(layer, t) {
  var tg = layer.property("ADBE Transform Group");
  var sc = tg.property("ADBE Scale").valueAtTime(t, false);
  var rad = tg.property("ADBE Rotate Z").valueAtTime(t, false) * Math.PI / 180;
  var c = Math.cos(rad), s = Math.sin(rad), sx = sc[0] / 100, sy = sc[1] / 100;
  return [c * sx, -s * sy, s * sx, c * sy];
}

function _amAnchor(layer, t) {
  var a = layer.property("ADBE Transform Group").property("ADBE Anchor Point").valueAtTime(t, false);
  return [a[0], a[1]];
}

// Shape b (in layer B space) -> layer A space.
function _amMap(b, layerA, layerB, t) {
  var LA = _amLinear(layerA, t), LB = _amLinear(layerB, t);
  var det = LA[0] * LA[3] - LA[1] * LA[2];
  if (Math.abs(det) < 1e-9) { throw new Error("The upper layer has a zero scale, so its shape cannot be matched."); }
  var inv = [LA[3] / det, -LA[1] / det, -LA[2] / det, LA[0] / det];
  var M = [inv[0] * LB[0] + inv[1] * LB[2], inv[0] * LB[1] + inv[1] * LB[3],
           inv[2] * LB[0] + inv[3] * LB[2], inv[2] * LB[1] + inv[3] * LB[3]];
  var pa = _amPos(layerA, t), pb = _amPos(layerB, t), aa = _amAnchor(layerA, t), ab = _amAnchor(layerB, t);
  var dx = pb[0] - pa[0], dy = pb[1] - pa[1];
  var out = { v: [], i: [], o: [], closed: b.closed }, k, v, x, y;
  for (k = 0; k < b.v.length; k++) {
    v = b.v[k];
    x = v[0] - ab[0]; y = v[1] - ab[1];                        // layer B local, relative to its anchor
    out.v.push([aa[0] + inv[0] * (dx + LB[0] * x + LB[1] * y) + inv[1] * (dy + LB[2] * x + LB[3] * y),
                aa[1] + inv[2] * (dx + LB[0] * x + LB[1] * y) + inv[3] * (dy + LB[2] * x + LB[3] * y)]);
    out.i.push([M[0] * b.i[k][0] + M[1] * b.i[k][1], M[2] * b.i[k][0] + M[3] * b.i[k][1]]);
    out.o.push([M[0] * b.o[k][0] + M[1] * b.o[k][1], M[2] * b.o[k][0] + M[3] * b.o[k][1]]);
  }
  return out;
}

function _amEase(prop, t0, t1, dims) {
  try {
    var k0 = prop.nearestKeyIndex(t0), k1 = prop.nearestKeyIndex(t1), e = [], d, ks = [k0, k1], q;
    for (d = 0; d < dims; d++) { e.push(new KeyframeEase(0, 33.33)); }
    for (q = 0; q < ks.length; q++) { prop.setTemporalEaseAtKey(ks[q], e, e); }
  } catch (err) { /* easing is a nicety - keep the keyframes if it is refused */ }
}

// Keyframes pa (top layer) from its own value to pb's value. Returns true when something was keyed.
function _amKeyPair(pa, pb, t0, t1, easy) {
  if (!pa || !pb) { return false; }
  try {
    if (pa.expressionEnabled || pa.numKeys > 0) { return false; }
    var va = pa.valueAtTime(t0, false), vb = pb.valueAtTime(t0, false), dims = (va instanceof Array) ? 1 : 1;
    pa.setValueAtTime(t0, va);
    pa.setValueAtTime(t1, vb);
    if (easy) { _amEase(pa, t0, t1, dims); }
    return true;
  } catch (err) { return false; }
}

function TOOLS_autoMorph(frames, easy, hideLower) {
  try {
    var comp = _activeComp();
    var sel = comp.selectedLayers, layers = [], i;
    if (!sel || sel.length !== 2) { throw new Error("Select exactly two shape layers. The upper one morphs into the lower one."); }
    for (i = 0; i < sel.length; i++) { layers.push(sel[i]); }
    layers.sort(function (a, b) { return a.index - b.index; });
    var A = layers[0], B = layers[1];
    for (i = 0; i < 2; i++) {
      if (layers[i].matchName !== "ADBE Vector Layer") { throw new Error("\"" + layers[i].name + "\" is not a shape layer."); }
      if (layers[i].locked) { throw new Error("\"" + layers[i].name + "\" is locked."); }
    }
    frames = Math.round(Number(frames));
    if (!isFinite(frames) || frames < 1) { frames = 20; }

    var pathA = _amFind(A.property("ADBE Root Vectors Group"), "ADBE Vector Shape");
    var pathB = _amFind(B.property("ADBE Root Vectors Group"), "ADBE Vector Shape");
    if (!pathA || !pathB) {
      throw new Error("Each layer needs a Path. Rectangle, Ellipse and Star shapes must be converted first (right-click the shape > Convert to Bezier Path).");
    }
    if (pathA.expressionEnabled) { throw new Error("The upper layer's Path has an expression. Remove it first."); }
    if (pathA.numKeys > 0) { throw new Error("The upper layer's Path already has keyframes. Delete them, or use a fresh shape layer."); }

    var t0 = comp.time, t1 = comp.time + frames * comp.frameDuration;
    var a = _amRead(pathA.valueAtTime(t0, false));
    var b = _amMap(_amRead(pathB.valueAtTime(t0, false)), A, B, t0);
    if (a.v.length < 2 || b.v.length < 2) { throw new Error("A path needs at least two vertices to morph."); }

    var target = Math.max(a.v.length, b.v.length);
    if (target > 1500) { throw new Error("These paths are too detailed to morph (over 1500 vertices)."); }
    _amGrow(a, target);
    _amGrow(b, target);
    b = _amAlign(a, b);

    app.beginUndoGroup("Auto Morph");
    var extras = 0;
    try {
      pathA.setValueAtTime(t0, _amToShape(a));
      pathA.setValueAtTime(t1, _amToShape(b));
      if (easy) { _amEase(pathA, t0, t1, 1); }

      var fa = _amFind(A.property("ADBE Root Vectors Group"), "ADBE Vector Graphic - Fill");
      var fb = _amFind(B.property("ADBE Root Vectors Group"), "ADBE Vector Graphic - Fill");
      if (fa && fb && _amKeyPair(fa.property("ADBE Vector Fill Color"), fb.property("ADBE Vector Fill Color"), t0, t1, easy)) { extras++; }
      var sa = _amFind(A.property("ADBE Root Vectors Group"), "ADBE Vector Graphic - Stroke");
      var sb = _amFind(B.property("ADBE Root Vectors Group"), "ADBE Vector Graphic - Stroke");
      if (sa && sb) {
        if (_amKeyPair(sa.property("ADBE Vector Stroke Color"), sb.property("ADBE Vector Stroke Color"), t0, t1, easy)) { extras++; }
        if (_amKeyPair(sa.property("ADBE Vector Stroke Width"), sb.property("ADBE Vector Stroke Width"), t0, t1, easy)) { extras++; }
      }
      if (hideLower) { B.enabled = false; }
    } finally {
      app.endUndoGroup();
    }

    return _ok("Morphed \"" + A.name + "\" into \"" + B.name + "\" over " + frames + " frames (" + target + " vertices" +
      (extras ? ", plus color/stroke" : "") + ").");
  } catch (e) {
    return _err(e);
  }
}
