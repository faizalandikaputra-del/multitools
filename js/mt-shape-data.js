/**
 * Multi Tool - mt-shape-data.js
 * Shape tab data + geometry (no DOM, no After Effects calls).
 *
 * Every shape lives in a 24 x 24 box and is written as SVG path text. A shape is a list of PARTS:
 *   r  role:  b = body (takes the chosen color), s = screen (dark), d = detail (grey), l = light (white)
 *   n  group name in After Effects (one shape group per part)
 *   d  SVG path (M L H V C S Q A Z, absolute and relative)
 * kind:  f = filled shape, s = outline / line only, d = dots (round dots drawn as zero length strokes)
 *
 * toPayload() turns a shape into plain numbers (vertices + tangents in pixels, centered on 0,0) that
 * jsx/host.jsx > SHAPE_insert() turns into real After Effects shape groups. One source feeds the panel
 * preview and the After Effects result, so they always match.
 */
(function (root) {
  "use strict";

  // ---------- path builders (return SVG path text) ----------
  function rr(x, y, w, h, r) {
    r = Math.max(0, Math.min(r, w / 2, h / 2));
    if (!r) { return "M" + x + " " + y + "H" + (x + w) + "V" + (y + h) + "H" + x + "Z"; }
    return "M" + (x + r) + " " + y + "H" + (x + w - r) + "A" + r + " " + r + " 0 0 1 " + (x + w) + " " + (y + r) +
      "V" + (y + h - r) + "A" + r + " " + r + " 0 0 1 " + (x + w - r) + " " + (y + h) +
      "H" + (x + r) + "A" + r + " " + r + " 0 0 1 " + x + " " + (y + h - r) +
      "V" + (y + r) + "A" + r + " " + r + " 0 0 1 " + (x + r) + " " + y + "Z";
  }
  function ci(cx, cy, r) {
    return "M" + (cx - r) + " " + cy + "A" + r + " " + r + " 0 1 0 " + (cx + r) + " " + cy +
      "A" + r + " " + r + " 0 1 0 " + (cx - r) + " " + cy + "Z";
  }

  // ---------- shape definitions ----------
  function F(id, name, d) { return { id: id, name: name, kind: "f", parts: [{ r: "b", n: name, d: d }] }; }
  function S(id, name, d, dash) { return { id: id, name: name, kind: "s", dash: dash || 0, parts: [{ r: "b", n: name, d: d }] }; }
  function D(id, name, d) { return { id: id, name: name, kind: "d", parts: [{ r: "b", n: name, d: d }] }; }
  // multi part device / UI shape: list of [role, group name, path]
  function M(id, name, list) {
    return { id: id, name: name, kind: "f", parts: list.map(function (p) { return { r: p[0], n: p[1], d: p[2] }; }) };
  }

  var GROUPS = [
    { key: "Basic", label: "Basic", hint: "Building blocks", items: [
      F("circle", "Circle", ci(12, 12, 9)),
      F("square", "Square", "M4 4h16v16H4Z"),
      F("rounded", "Rounded", rr(4, 4, 16, 16, 4)),
      F("pill", "Pill", rr(3, 7, 18, 10, 5)),
      F("triangle", "Triangle", "M12 3.5 21 20H3Z"),
      F("pentagon", "Pentagon", "M12 3l8.6 6.3-3.3 10.2H6.7L3.4 9.3Z"),
      F("hexagon", "Hexagon", "M12 3l7.8 4.5v9L12 21l-7.8-4.5v-9Z"),
      F("octagon", "Octagon", "M8.5 3h7L21 8.5v7L15.5 21h-7L3 15.5v-7Z"),
      F("diamond", "Diamond", "M12 2.5 21.5 12 12 21.5 2.5 12Z"),
      F("star", "Star", "M12 2.8l2.7 6 6.5.6-4.9 4.3 1.5 6.4L12 16.7 6.2 20.1l1.5-6.4L2.8 9.4l6.5-.6Z"),
      F("sparkle", "Sparkle", "M12 2c.8 5.5 4.5 9.2 10 10-5.5.8-9.2 4.5-10 10-.8-5.5-4.5-9.2-10-10 5.5-.8 9.2-4.5 10-10Z"),
      F("heart", "Heart", "M12 20s-8-4.8-8-10.5A4.5 4.5 0 0 1 12 7a4.5 4.5 0 0 1 8 2.5C20 15.2 12 20 12 20Z"),
      F("plus", "Plus", "M9.5 3h5v6.5H21v5h-6.5V21h-5v-6.5H3v-5h6.5Z"),
      F("arrow", "Arrow", "M3 10.5h10V5l8 7-8 7v-5.5H3Z"),
      F("drop", "Drop", "M12 3C12 3 5.5 10 5.5 14.5a6.5 6.5 0 0 0 13 0C18.5 10 12 3 12 3Z"),
      F("crescent", "Crescent", "M15.5 3.5A9 9 0 1 0 20.5 15 7 7 0 0 1 15.5 3.5Z"),
      F("semi", "Semicircle", "M3 17a9 9 0 0 1 18 0Z"),
      F("quarter", "Quarter", "M4 20V4a16 16 0 0 1 16 16Z"),
      F("bolt", "Bolt", "M13.5 2 5 13.5h6L10 22l9-12h-6.2Z"),
      F("blob", "Blob", "M12 3.5c4 0 8 2.5 8.5 6.7.5 4.3-2.5 9.3-7.5 10.2C8 21.3 3.5 18 3.5 13.2 3.5 8 7.5 3.5 12 3.5Z"),
      F("parallelogram", "Parallelogram", "M8 5h13l-5 14H3Z"),
      F("trapezoid", "Trapezoid", "M7 5h10l4.5 14h-19Z"),
      F("chevron", "Chevron", "M7 3l9 9-9 9-2.5-2.5L11 12 4.5 5.5Z"),
      F("play", "Play", "M7 4l13 8-13 8Z")
    ] },
    { key: "Mograph", label: "Mograph", hint: "Rings, bursts, loops", items: [
      S("ring", "Ring", ci(12, 12, 9)),
      S("dashring", "Dashed ring", ci(12, 12, 9), 1),
      S("crosshair", "Crosshair", ci(12, 12, 8) + "M12 1v6M12 17v6M1 12h6M17 12h6"),
      S("radial", "Radial lines", "M12 2v5M12 17v5M2 12h5M17 12h5M5 5l3.5 3.5M15.5 15.5 19 19M19 5l-3.5 3.5M8.5 15.5 5 19"),
      S("wave", "Wave", "M2 12c2.5-6 4.5-6 7 0s4.5 6 7 0 3-5 6-3"),
      S("spiral", "Spiral", "M12 12a1.5 1.5 0 0 1 3 0 3.5 3.5 0 0 1-7 0 5.5 5.5 0 0 1 11 0 7.5 7.5 0 0 1-15 0"),
      S("orbit", "Orbit", "M12 8c5.5 0 10 1.8 10 4s-4.5 4-10 4-10-1.8-10-4 4.5-4 10-4Z"),
      D("dotgrid", "Dot grid", "M6 6h.01M12 6h.01M18 6h.01M6 12h.01M12 12h.01M18 12h.01M6 18h.01M12 18h.01M18 18h.01"),
      D("dotline", "Dot line", "M3 12h.01M8 12h.01M13 12h.01M18 12h.01"),
      S("cross", "Cross", "M5 5l14 14M19 5 5 19"),
      S("slash", "Slash", "M16 3 8 21"),
      S("triring", "Tri ring", "M12 3.5 21 20H3Z"),
      S("hexring", "Hex ring", "M12 3l7.8 4.5v9L12 21l-7.8-4.5v-9Z"),
      S("squircle", "Squircle ring", "M12 3c7 0 9 2 9 9s-2 9-9 9-9-2-9-9 2-9 9-9Z"),
      S("arcring", "Arc", "M4.5 16A8.5 8.5 0 1 1 19.5 16"),
      S("loop", "Infinity", "M12 12c-2-3-3.5-4-5.5-4a4 4 0 0 0 0 8c2 0 3.5-1 5.5-4s3.5-4 5.5-4a4 4 0 0 1 0 8c-2 0-3.5-1-5.5-4Z")
    ] },
    { key: "Type", label: "Typography", hint: "Boxes, bars and brackets for text", items: [
      F("underline", "Underline bar", "M3 17h18v3H3Z"),
      F("highlight", "Highlight box", "M3 7h18v10H3Z"),
      S("bracket", "Brackets", "M8 4H5v16h3M16 4h3v16h-3"),
      S("strike", "Strike line", "M3 12h18"),
      F("lowerthird", "Lower third", "M3 15h12v5H3ZM3 9h7v4H3Z"),
      S("cornermarks", "Corner marks", "M3 8V3h5M16 3h5v5M21 16v5h-5M8 21H3v-5"),
      F("quote", "Quote", "M5 17v-4.5C5 9 6.5 7 9.5 6.5L10 8C8.5 8.7 8 9.8 8 11h3v6ZM14 17v-4.5c0-3.5 1.5-5.5 4.5-6L19 8c-1.5.7-2 1.8-2 3h3v6Z"),
      F("bubble", "Speech bubble", "M5 4h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-6l-5 4v-4H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z"),
      F("tag", "Label tag", "M3 4h11l7 8-7 8H3Z"),
      F("cutbox", "Cut corner", "M3 3h14l4 4v14H7l-4-4Z"),
      S("doubleline", "Double line", "M3 14h18M3 18h18"),
      S("callout", "Callout line", "M4 20 14 10M8 10h6v6"),
      S("divider", "Dash divider", "M3 12h4M10 12h4M17 12h4"),
      F("ribbon", "Ribbon", "M3 6h18l-3 5 3 5H3l3-5Z"),
      F("tab", "Tab", "M4 20V9a2 2 0 0 1 2-2h4l2 2h6a2 2 0 0 1 2 2v9Z"),
      S("textframe", "Text frame", "M4 5h16v14H4ZM8 10h8M8 14h5")
    ] },
    { key: "AMV", label: "AMV", hint: "Frames, cuts and flashes", items: [
      F("letterbox", "Letterbox", "M2 3h20v4H2ZM2 17h20v4H2Z"),
      S("viewfinder", "Viewfinder", "M3 8V3h5M16 3h5v5M21 16v5h-5M8 21H3v-5M12 9v6M9 12h6"),
      S("speed", "Speed lines", "M3 7h12M7 12h14M3 17h12"),
      F("wipe", "Diagonal wipe", "M3 3h14L8 21H3Z"),
      F("flash", "Flash burst", "M12 1l2.2 6.3L20.5 4l-3.3 6.3L23 12l-5.8 1.7 3.3 6.3-6.3-3.3L12 23l-1.8-6.3-6.3 3.3 3.3-6.3L1 12l5.8-1.7L3.5 4l6.3 3.3Z"),
      F("vignette", "Vignette", "M12 4c5 0 10 3.5 10 8s-5 8-10 8S2 16.5 2 12 7 4 12 4Z"),
      F("glitch", "Glitch bars", "M3 5h12v3H3ZM9 11h12v3H9ZM5 17h9v3H5Z"),
      S("scan", "Scan lines", "M3 5h18M3 9h18M3 13h18M3 17h18M3 21h18"),
      F("halfdisc", "Circle wipe", "M12 3a9 9 0 0 1 0 18Z"),
      F("bokeh", "Bokeh", ci(8, 13, 4) + ci(16.5, 8.5, 2.5) + ci(17, 17, 3)),
      S("beat", "Beat line", "M2 12h5l2-6 4 12 2-6h7"),
      S("slashes", "Slash cuts", "M7 4 3 20M13 4 9 20M19 4l-4 16"),
      F("shard", "Shard", "M4 4l16 5-8 4 4 8-12-7Z"),
      F("spike", "Spike", "M2 12l9-2 1-8 1 8 9 2-9 2-1 8-1-8Z"),
      S("target", "Target lock", ci(12, 12, 5) + "M3 3h4M17 3h4M3 21h4M17 21h4")
    ] },
    { key: "Device", label: "Device", hint: "Phones, tablets, laptops and screens", items: [
      M("phone-island", "Phone", [
        ["b", "Body", rr(7, 1.5, 10, 21, 2.6)],
        ["s", "Screen", rr(8, 2.7, 8, 18.6, 1.8)],
        ["d", "Island", rr(10.6, 3.7, 2.8, 0.9, 0.45)]]),
      M("phone-notch", "Phone notch", [
        ["b", "Body", rr(7, 1.5, 10, 21, 2.6)],
        ["s", "Screen", rr(8, 2.7, 8, 18.6, 1.8)],
        ["d", "Notch", "M10 2.7h4v.6a1.2 1.2 0 0 1-1.2 1.2h-1.6A1.2 1.2 0 0 1 10 3.3Z"]]),
      M("phone-punch", "Punch hole", [
        ["b", "Body", rr(7, 1.5, 10, 21, 2.2)],
        ["s", "Screen", rr(8, 2.7, 8, 18.6, 1.4)],
        ["d", "Camera", ci(12, 4.2, 0.55)]]),
      M("phone-home", "Home button", [
        ["b", "Body", rr(6.5, 1, 11, 22, 2)],
        ["s", "Screen", rr(7.6, 3.6, 8.8, 14.6, 0.6)],
        ["d", "Home button", ci(12, 20.7, 1.1)]]),
      M("phone-land", "Phone wide", [
        ["b", "Body", rr(1.5, 7, 21, 10, 2.6)],
        ["s", "Screen", rr(2.7, 8, 18.6, 8, 1.8)],
        ["d", "Camera", ci(4.2, 12, 0.55)]]),
      M("phone-fold", "Foldable", [
        ["b", "Body", rr(3, 4, 18, 16, 2)],
        ["s", "Screen", rr(4, 5, 16, 14, 1.2)],
        ["d", "Hinge", rr(11.7, 5, 0.6, 14, 0.3)]]),
      M("tablet", "Tablet", [
        ["b", "Body", rr(4.5, 1.5, 15, 21, 2)],
        ["s", "Screen", rr(5.7, 3, 12.6, 18, 0.8)],
        ["d", "Camera", ci(12, 2.3, 0.35)]]),
      M("tablet-land", "Tablet wide", [
        ["b", "Body", rr(1.5, 4.5, 21, 15, 2)],
        ["s", "Screen", rr(3, 5.7, 18, 12.6, 0.8)],
        ["d", "Camera", ci(2.3, 12, 0.35)]]),
      M("laptop", "Laptop", [
        ["b", "Lid", rr(4, 4, 16, 11, 1.2)],
        ["s", "Screen", rr(5.2, 5.2, 13.6, 8.6, 0.4)],
        ["b", "Base", "M2 17h20l-1.2 2.3a1 1 0 0 1-.9.5H4.1a1 1 0 0 1-.9-.5Z"]]),
      M("monitor", "Monitor", [
        ["b", "Frame", rr(2.5, 3.5, 19, 12.5, 1.5)],
        ["s", "Screen", rr(3.7, 4.7, 16.6, 10.1, 0.5)],
        ["b", "Neck", "M10 16h4l.8 4H9.2Z"],
        ["b", "Foot", rr(8, 20, 8, 1.3, 0.65)]]),
      M("tv", "TV", [
        ["b", "Frame", rr(1.5, 3.5, 21, 14, 1.5)],
        ["s", "Screen", rr(2.8, 4.8, 18.4, 11.4, 0.5)],
        ["b", "Neck", rr(11, 17.5, 2, 2.5, 0)],
        ["b", "Foot", rr(6, 20, 12, 1.2, 0.6)]]),
      M("watch", "Smartwatch", [
        ["b", "Strap top", "M8.5 5.5l.6-3a1 1 0 0 1 1-.8h3.8a1 1 0 0 1 1 .8l.6 3Z"],
        ["b", "Strap bottom", "M8.5 18.5l.6 3a1 1 0 0 0 1 .8h3.8a1 1 0 0 0 1-.8l.6-3Z"],
        ["b", "Body", rr(6.5, 5.5, 11, 13, 3.4)],
        ["s", "Screen", rr(7.8, 6.8, 8.4, 10.4, 2.2)],
        ["d", "Crown", rr(17.5, 10, 1, 2.4, 0.4)]]),
      M("camera", "Camera", [
        ["b", "Top", "M8 7l1.2-2.2a1 1 0 0 1 .9-.5h3.8a1 1 0 0 1 .9.5L16 7Z"],
        ["b", "Body", rr(2.5, 7, 19, 13, 2.5)],
        ["s", "Lens", ci(12, 13.5, 4.2)],
        ["d", "Glass", ci(12, 13.5, 2.4)]]),
      M("browser", "Browser", [
        ["b", "Window", rr(2, 3.5, 20, 17, 2)],
        ["s", "Page", rr(3, 7, 18, 12.5, 0.6)],
        ["d", "Dot 1", ci(5, 5.3, 0.55)],
        ["d", "Dot 2", ci(7.2, 5.3, 0.55)],
        ["d", "Dot 3", ci(9.4, 5.3, 0.55)]])
    ] },
    { key: "UI", label: "UI", hint: "Buttons, cards and cursors for interface motion", items: [
      F("cursor", "Cursor", "M5 3l14 7.5-6 1.7 3.3 6.3-2.6 1.4-3.4-6.4L5 17Z"),
      M("button", "Button", [
        ["b", "Button", rr(2.5, 7.5, 19, 9, 4.5)],
        ["l", "Label", rr(8, 11.3, 8, 1.4, 0.7)]]),
      M("toggle", "Toggle", [
        ["b", "Track", rr(3, 7.5, 18, 9, 4.5)],
        ["l", "Knob", ci(16.5, 12, 3)]]),
      M("slider", "Slider", [
        ["d", "Track", rr(3, 11, 18, 2, 1)],
        ["b", "Fill", rr(3, 11, 10, 2, 1)],
        ["l", "Knob", ci(13, 12, 3.2)]]),
      M("progress", "Progress bar", [
        ["d", "Track", rr(2.5, 10.2, 19, 3.6, 1.8)],
        ["b", "Fill", rr(2.5, 10.2, 12, 3.6, 1.8)]]),
      M("input", "Input field", [
        ["b", "Field", rr(2.5, 7.5, 19, 9, 2)],
        ["l", "Caret", rr(5, 9.7, 0.9, 4.6, 0.45)]]),
      M("notification", "Notification", [
        ["b", "Card", rr(2.5, 5, 19, 14, 4)],
        ["l", "Icon", ci(7.6, 12, 2.4)],
        ["d", "Line 1", rr(11.5, 9.3, 7.5, 1.4, 0.7)],
        ["d", "Line 2", rr(11.5, 13.1, 5, 1.4, 0.7)]]),
      M("card", "Card", [
        ["b", "Card", rr(4, 3.5, 16, 17, 2.5)],
        ["d", "Image", rr(6, 5.5, 12, 6.2, 1.2)],
        ["l", "Line 1", rr(6, 13.5, 8, 1.4, 0.7)],
        ["l", "Line 2", rr(6, 16.5, 5, 1.4, 0.7)]]),
      M("chat", "Chat", [
        ["b", "Bubble 1", rr(2.5, 4, 13, 7, 3.5)],
        ["d", "Bubble 2", rr(8.5, 13, 13, 7, 3.5)]]),
      M("play-button", "Play button", [
        ["b", "Disc", ci(12, 12, 9.5)],
        ["l", "Triangle", "M10 8.2l6 3.8-6 3.8Z"]]),
      M("avatar", "Avatar", [
        ["b", "Disc", ci(12, 12, 9.5)],
        ["l", "Head", ci(12, 9.5, 3)],
        ["l", "Shoulders", "M6.5 18.2c1-3 3.2-4.2 5.5-4.2s4.5 1.2 5.5 4.2a9.5 9.5 0 0 1-11 0Z"]])
    ] },
    { key: "Frame", label: "Frames", hint: "Aspect ratios and safe zones", items: [
      S("f169", "16:9", "M2 6.375h20v11.25H2Z"),
      S("f916", "9:16", "M6.375 2h11.25v20H6.375Z"),
      S("f11", "1:1", "M3 3h18v18H3Z"),
      S("f45", "4:5", "M4 2h16v20H4Z"),
      S("f43", "4:3", "M2 4.5h20v15H2Z"),
      S("f219", "21:9", "M1 7.29h22v9.43H1Z"),
      S("safe", "Safe zone", "M2 5h20v14H2ZM4.2 7h15.6v10H4.2Z")
    ] }
  ];

  var ROLE_COLOR = { s: "#16161a", d: "#2e2e36", l: "#ffffff" };

  // ---------- SVG path -> vertices and tangents ----------
  function arcToBez(x1, y1, rx, ry, phiDeg, fa, fs, x2, y2) {
    var i, out = [];
    if (rx === 0 || ry === 0) { return [[x1, y1, x2, y2, x2, y2]]; }
    var phi = phiDeg * Math.PI / 180, cp = Math.cos(phi), sp = Math.sin(phi);
    var dx = (x1 - x2) / 2, dy = (y1 - y2) / 2;
    var x1p = cp * dx + sp * dy, y1p = -sp * dx + cp * dy;
    rx = Math.abs(rx); ry = Math.abs(ry);
    var lam = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
    if (lam > 1) { var sq = Math.sqrt(lam); rx *= sq; ry *= sq; }
    var num = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p;
    var den = rx * rx * y1p * y1p + ry * ry * x1p * x1p;
    var co = Math.sqrt(Math.max(0, num / den));
    if (fa === fs) { co = -co; }
    var cxp = co * rx * y1p / ry, cyp = -co * ry * x1p / rx;
    var cx = cp * cxp - sp * cyp + (x1 + x2) / 2, cy = sp * cxp + cp * cyp + (y1 + y2) / 2;
    var th1 = Math.atan2((y1p - cyp) / ry, (x1p - cxp) / rx);
    var th2 = Math.atan2((-y1p - cyp) / ry, (-x1p - cxp) / rx);
    var dth = th2 - th1;
    if (fs === 0 && dth > 0) { dth -= 2 * Math.PI; } else if (fs === 1 && dth < 0) { dth += 2 * Math.PI; }
    var n = Math.max(1, Math.ceil(Math.abs(dth) / (Math.PI / 2) - 1e-9));
    var seg = dth / n, t = 4 / 3 * Math.tan(seg / 4), a = th1;
    function pt(ux, uy) { var X = rx * ux, Y = ry * uy; return [cp * X - sp * Y + cx, sp * X + cp * Y + cy]; }
    for (i = 0; i < n; i++) {
      var a2 = a + seg;
      var p1 = pt(Math.cos(a) - t * Math.sin(a), Math.sin(a) + t * Math.cos(a));
      var p2 = pt(Math.cos(a2) + t * Math.sin(a2), Math.sin(a2) - t * Math.cos(a2));
      var p3 = (i === n - 1) ? [x2, y2] : pt(Math.cos(a2), Math.sin(a2));
      out.push([p1[0], p1[1], p2[0], p2[1], p3[0], p3[1]]);
      a = a2;
    }
    return out;
  }

  // -> [{ pts: [{x,y,ix,iy,ox,oy}], closed }]   (tangents are offsets from the vertex)
  function parsePath(d) {
    var re = /([MmLlHhVvCcSsQqAaZz])|(-?\d*\.?\d+(?:[eE][-+]?\d+)?)/g, tok = [], m;
    while ((m = re.exec(d)) !== null) { tok.push(m[1] ? m[1] : parseFloat(m[2])); }
    var paths = [], cur = null, x = 0, y = 0, sx = 0, sy = 0, i = 0, cmd = "", lcx = 0, lcy = 0, lastC = "";
    function num() { return tok[i++]; }
    function begin(px, py) { cur = { pts: [{ x: px, y: py, ix: 0, iy: 0, ox: 0, oy: 0 }], closed: false }; paths.push(cur); }
    function ensure() { if (!cur) { begin(sx, sy); } }
    function line(px, py) { ensure(); cur.pts.push({ x: px, y: py, ix: 0, iy: 0, ox: 0, oy: 0 }); x = px; y = py; }
    function cubic(c1x, c1y, c2x, c2y, px, py) {
      ensure();
      var last = cur.pts[cur.pts.length - 1];
      last.ox = c1x - last.x; last.oy = c1y - last.y;
      cur.pts.push({ x: px, y: py, ix: c2x - px, iy: c2y - py, ox: 0, oy: 0 });
      lcx = c2x; lcy = c2y; x = px; y = py;
    }
    function close() {
      if (!cur) { return; }
      var f = cur.pts[0], l = cur.pts[cur.pts.length - 1];
      if (cur.pts.length > 1 && Math.abs(f.x - l.x) < 1e-6 && Math.abs(f.y - l.y) < 1e-6) {
        f.ix = l.ix; f.iy = l.iy; cur.pts.pop();
      }
      cur.closed = true; cur = null; x = sx; y = sy;
    }
    while (i < tok.length) {
      if (typeof tok[i] === "string") { cmd = tok[i++]; } else if (cmd === "M") { cmd = "L"; } else if (cmd === "m") { cmd = "l"; }
      var rel = cmd === cmd.toLowerCase(), C = cmd.toUpperCase(), a, b, c, dd, e, f2, p, q;
      if (C === "Z") { close(); lastC = "Z"; continue; }
      if (C === "M") { a = num(); b = num(); if (rel) { a += x; b += y; } x = sx = a; y = sy = b; cur = null; begin(x, y); }
      else if (C === "L") { a = num(); b = num(); if (rel) { a += x; b += y; } line(a, b); }
      else if (C === "H") { a = num(); line(rel ? x + a : a, y); }
      else if (C === "V") { a = num(); line(x, rel ? y + a : a); }
      else if (C === "C") {
        a = num(); b = num(); c = num(); dd = num(); e = num(); f2 = num();
        if (rel) { a += x; b += y; c += x; dd += y; e += x; f2 += y; }
        cubic(a, b, c, dd, e, f2);
      } else if (C === "S") {
        c = num(); dd = num(); e = num(); f2 = num();
        if (rel) { c += x; dd += y; e += x; f2 += y; }
        var rx1 = (lastC === "C" || lastC === "S") ? 2 * x - lcx : x, ry1 = (lastC === "C" || lastC === "S") ? 2 * y - lcy : y;
        cubic(rx1, ry1, c, dd, e, f2);
      } else if (C === "Q") {
        a = num(); b = num(); e = num(); f2 = num();
        if (rel) { a += x; b += y; e += x; f2 += y; }
        cubic(x + 2 / 3 * (a - x), y + 2 / 3 * (b - y), e + 2 / 3 * (a - e), f2 + 2 / 3 * (b - f2), e, f2);
      } else if (C === "A") {
        var rx = num(), ry = num(), rot = num(), fa = num(), fs = num(); e = num(); f2 = num();
        if (rel) { e += x; f2 += y; }
        var segs = arcToBez(x, y, rx, ry, rot, fa ? 1 : 0, fs ? 1 : 0, e, f2);
        for (p = 0; p < segs.length; p++) { q = segs[p]; cubic(q[0], q[1], q[2], q[3], q[4], q[5]); }
      } else { i++; }
      lastC = C;
    }
    return paths;
  }

  // ---------- shape -> numbers for After Effects ----------
  function r3(v) { return Math.round(v * 1000) / 1000; }

  /**
   * st: { size (px of the 24 unit box), center (shift so the shape's own bounding box is on 0,0) }
   * returns { name, kind, dash, parts:[{n,r,sp:[{v,i,o,c}]}], bw, bh }   bw/bh = bounding box in px
   */
  function toPayload(item, st) {
    var k = st.size / 24, minx = 1e9, miny = 1e9, maxx = -1e9, maxy = -1e9, parts = [], pi, si, vi;
    for (pi = 0; pi < item.parts.length; pi++) {
      var sps = parsePath(item.parts[pi].d), out = [];
      for (si = 0; si < sps.length; si++) {
        var pts = sps[si].pts, o = { v: [], i: [], o: [], c: sps[si].closed };
        for (vi = 0; vi < pts.length; vi++) {
          var px = (pts[vi].x - 12) * k, py = (pts[vi].y - 12) * k;
          if (px < minx) { minx = px; } if (px > maxx) { maxx = px; }
          if (py < miny) { miny = py; } if (py > maxy) { maxy = py; }
          o.v.push([px, py]); o.i.push([pts[vi].ix * k, pts[vi].iy * k]); o.o.push([pts[vi].ox * k, pts[vi].oy * k]);
        }
        out.push(o);
      }
      parts.push({ n: item.parts[pi].n, r: item.parts[pi].r, sp: out });
    }
    var cx = st.center ? (minx + maxx) / 2 : 0, cy = st.center ? (miny + maxy) / 2 : 0;
    for (pi = 0; pi < parts.length; pi++) {
      for (si = 0; si < parts[pi].sp.length; si++) {
        var s = parts[pi].sp[si];
        for (vi = 0; vi < s.v.length; vi++) {
          s.v[vi] = [r3(s.v[vi][0] - cx), r3(s.v[vi][1] - cy)];
          s.i[vi] = [r3(s.i[vi][0]), r3(s.i[vi][1])];
          s.o[vi] = [r3(s.o[vi][0]), r3(s.o[vi][1])];
        }
      }
    }
    return {
      name: item.name, kind: item.kind, dash: item.dash ? [2 * k, 2.4 * k] : null, dot: 3.2 * k,
      parts: parts, bw: Math.max(1, r3(maxx - minx)), bh: Math.max(1, r3(maxy - miny))
    };
  }

  function allItems() {
    var all = [];
    GROUPS.forEach(function (g) { g.items.forEach(function (it) { all.push({ item: it, group: g }); }); });
    return all;
  }

  var api = { GROUPS: GROUPS, ROLE_COLOR: ROLE_COLOR, parsePath: parsePath, toPayload: toPayload, allItems: allItems, rr: rr, ci: ci };
  if (typeof module !== "undefined" && module.exports) { module.exports = api; }
  root.MTShapeData = api;
})(typeof window !== "undefined" ? window : this);
