/* Multi Tool - mt-shape-data.js
   The 103 shapes of the Shape tab, in 7 groups: Basic 24, Mograph 17, Typography 15, AMV 15, Device 14, UI 11, Frames 7.
   Every shape is { id, name, group, w, h, parts: [ { n: "Body", d: "<svg path>" | rect | ellipse, f: tone } ] } in its own unit box (w x h).
   A part becomes one named group in the AE shape layer ("Body", "Screen", "Island" ...), so it can be colored on its own in the Timeline.
   Part geometry (one of):
     rect     { t: "r", x, y, w, h, r }     top-left x, y, size w x h, corner radius r     (AE: Rectangle path)
     ellipse  { t: "e", x, y, w, h }        CENTER x, y, size w x h                       (AE: Ellipse path)
     path     { t: "p", d }                 SVG path: M L H V C Z, absolute; every M starts a new contour of the same group
   Part tone f (parts are listed bottom to top):
     "c" main color   "d" darker   "k" almost black   "l" lighter   "n" no fill: drawn as an outline in the main color (open paths are always "n")
   Exposes window.MTShapes = { groups, shapes, byId, toNodes, pathBounds, bounds }.   ES5, no dependencies. */
(function (w) {
  "use strict";
  var PI = Math.PI;
  function f(n) { return Math.round(n * 100) / 100; }

  /* ---------------- path builders ---------------- */
  function poly(cx, cy, r, n, rot) {
    var d = "", i, a;
    for (i = 0; i < n; i++) { a = (rot + 360 * i / n) * PI / 180; d += (i ? "L" : "M") + f(cx + r * Math.cos(a)) + " " + f(cy + r * Math.sin(a)); }
    return d + "Z";
  }
  function star(cx, cy, r1, r2, n, rot) {
    var d = "", i, a, r;
    for (i = 0; i < n * 2; i++) { a = (rot + 180 * i / n) * PI / 180; r = i % 2 ? r2 : r1; d += (i ? "L" : "M") + f(cx + r * Math.cos(a)) + " " + f(cy + r * Math.sin(a)); }
    return d + "Z";
  }
  // elliptical arc as cubic segments (<= 90 degrees each); a0 -> a1 in degrees, y down. mv: start with "M".
  function arc(cx, cy, rx, ry, a0, a1, mv) {
    var seg = Math.max(1, Math.ceil(Math.abs(a1 - a0) / 90)), da = (a1 - a0) / seg * PI / 180, k = 4 / 3 * Math.tan(da / 4), t0 = a0 * PI / 180, t1, i, d = "";
    var x0 = cx + rx * Math.cos(t0), y0 = cy + ry * Math.sin(t0);
    if (mv) { d += "M" + f(x0) + " " + f(y0); }
    for (i = 0; i < seg; i++) {
      t1 = t0 + da;
      var x1 = cx + rx * Math.cos(t1), y1 = cy + ry * Math.sin(t1);
      d += "C" + f(x0 - k * rx * Math.sin(t0)) + " " + f(y0 + k * ry * Math.cos(t0)) + " " + f(x1 + k * rx * Math.sin(t1)) + " " + f(y1 - k * ry * Math.cos(t1)) + " " + f(x1) + " " + f(y1);
      t0 = t1; x0 = x1; y0 = y1;
    }
    return d;
  }
  function circle(cx, cy, r, rev) { return arc(cx, cy, r, r, rev ? 360 : 0, rev ? 0 : 360, true) + "Z"; }
  // Catmull-Rom through points -> cubic path (open)
  function smooth(pts) {
    var d = "M" + f(pts[0][0]) + " " + f(pts[0][1]), i, p0, p1, p2, p3;
    for (i = 0; i < pts.length - 1; i++) {
      p0 = pts[i - 1] || pts[i]; p1 = pts[i]; p2 = pts[i + 1]; p3 = pts[i + 2] || p2;
      d += "C" + f(p1[0] + (p2[0] - p0[0]) / 6) + " " + f(p1[1] + (p2[1] - p0[1]) / 6) + " " + f(p2[0] - (p3[0] - p1[0]) / 6) + " " + f(p2[1] - (p3[1] - p1[1]) / 6) + " " + f(p2[0]) + " " + f(p2[1]);
    }
    return d;
  }
  function gear(cx, cy, ro, ri, n) {
    var d = "", i, b, s = 360 / n, pts = [[ri, -0.27], [ro, -0.17], [ro, 0.17], [ri, 0.27]], j, a, p;
    for (i = 0; i < n; i++) {
      b = i * s - 90;
      for (j = 0; j < 4; j++) { a = (b + pts[j][1] * s) * PI / 180; p = pts[j][0]; d += (i || j ? "L" : "M") + f(cx + p * Math.cos(a)) + " " + f(cy + p * Math.sin(a)); }
    }
    return d + "Z";
  }
  function rectD(x, y, w, h) { return "M" + x + " " + y + "H" + (x + w) + "V" + (y + h) + "H" + x + "Z"; }

  /* ---------------- shape constructors ---------------- */
  function R(x, y, w, h, r) { return { t: "r", x: x, y: y, w: w, h: h, r: r || 0 }; }
  function E(cx, cy, w, h) { return { t: "e", x: cx, y: cy, w: w, h: h }; }
  function P(d) { return { t: "p", d: d }; }
  function part(n, g, tone) { var o = { n: n, f: tone || "c" }, k; for (k in g) { if (g.hasOwnProperty(k)) { o[k] = g[k]; } } return o; }
  var shapes = [], idSeen = {};
  function add(group, name, W, H, parts) {
    var id = group.toLowerCase() + "-" + name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    if (idSeen[id]) { id += "-2"; }
    idSeen[id] = 1;
    var i, p;
    for (i = 0; i < parts.length; i++) {
      p = parts[i];
      if (p.t === "p" && !/Z\s*$/i.test(p.d.replace(/\s+$/, "")) && !/Z/i.test(p.d)) { p.f = "n"; }   // an open path can only be an outline
    }
    shapes.push({ id: id, name: name, group: group, w: W, h: H, parts: parts });
  }
  function one(group, name, W, H, g, tone) { add(group, name, W, H, [part(name, g, tone)]); }

  /* ================= BASIC (24) ================= */
  var B = "Basic";
  one(B, "Circle", 100, 100, E(50, 50, 100, 100));
  one(B, "Square", 100, 100, R(0, 0, 100, 100, 0));
  one(B, "Rounded", 100, 100, R(0, 0, 100, 100, 24));
  one(B, "Pill", 100, 56, R(0, 0, 100, 56, 28));
  one(B, "Triangle", 100, 92, P("M50 0L100 92H0Z"));
  one(B, "Pentagon", 100, 96, P(poly(50, 52, 50, 5, -90)));
  one(B, "Hexagon", 100, 100, P(poly(50, 50, 50, 6, -90)));
  one(B, "Octagon", 100, 100, P(poly(50, 50, 50, 8, -67.5)));
  one(B, "Diamond", 100, 100, P("M50 0L100 50L50 100L0 50Z"));
  one(B, "Star", 100, 96, P(star(50, 52, 50, 21, 5, -90)));
  one(B, "Sparkle", 100, 100, P("M50 0C54 34 66 46 100 50C66 54 54 66 50 100C46 66 34 54 0 50C34 46 46 34 50 0Z"));
  one(B, "Heart", 100, 92, P("M50 92C10 62 0 40 0 26C0 10 13 0 27 0C38 0 46 6 50 14C54 6 62 0 73 0C87 0 100 10 100 26C100 40 90 62 50 92Z"));
  one(B, "Plus", 100, 100, P("M36 0H64V36H100V64H64V100H36V64H0V36H36Z"));
  one(B, "Arrow", 100, 100, P("M0 36H56V8L100 50L56 92V64H0Z"));
  one(B, "Drop", 80, 100, P("M40 0C40 0 80 44 80 66C80 86 62 100 40 100C18 100 0 86 0 66C0 44 40 0 40 0Z"));
  one(B, "Crescent", 70, 100, P("M70 0C30 0 0 22 0 50C0 78 30 100 70 100C54 86 46 70 46 50C46 30 54 14 70 0Z"));
  one(B, "Ring", 100, 100, P(circle(50, 50, 50) + circle(50, 50, 32, true)));
  one(B, "Semicircle", 100, 50, P(arc(50, 50, 50, 50, 180, 360, true) + "Z"));
  one(B, "Quarter", 100, 100, P("M0 0H100C100 55.2 55.2 100 0 100Z"));
  one(B, "Right triangle", 100, 100, P("M0 0L0 100L100 100Z"));
  one(B, "Parallelogram", 100, 60, P("M24 0H100L76 60H0Z"));
  one(B, "Trapezoid", 100, 60, P("M22 0H78L100 60H0Z"));
  one(B, "Cross", 100, 100, P("M14 0L50 36L86 0L100 14L64 50L100 86L86 100L50 64L14 100L0 86L36 50L0 14Z"));
  one(B, "Check", 100, 90, P("M0 54L14 40L36 62L86 8L100 22L36 90Z"));

  /* ================= MOGRAPH (17) ================= */
  var M = "Mograph";
  one(M, "Line", 100, 10, P("M0 5H100"));
  one(M, "Arc", 100, 50, P(arc(50, 50, 50, 50, 180, 360, true)));
  one(M, "Zigzag", 100, 40, P("M0 40L20 0L40 40L60 0L80 40L100 0"));
  one(M, "Wave", 100, 50, P("M0 25C12 -5 38 -5 50 25C62 55 88 55 100 25"));
  one(M, "Squircle", 100, 100, P("M50 0C90 0 100 10 100 50C100 90 90 100 50 100C10 100 0 90 0 50C0 10 10 0 50 0Z"));
  one(M, "Blob", 100, 100, P("M52 2C78 -2 100 18 98 46C96 74 84 100 54 98C24 96 2 82 2 52C2 22 26 6 52 2Z"));
  one(M, "Burst 8", 100, 100, P(star(50, 50, 50, 34, 8, -90)));
  one(M, "Burst 12", 100, 100, P(star(50, 50, 50, 38, 12, -90)));
  add(M, "Gear", 100, 100, [part("Gear", P(gear(50, 50, 50, 38, 8))), part("Hole", E(50, 50, 30, 30), "d")]);
  add(M, "Target", 100, 100, [part("Outer", E(50, 50, 100, 100)), part("Middle", E(50, 50, 66, 66), "d"), part("Inner", E(50, 50, 32, 32))]);
  add(M, "Crosshair", 100, 100, [part("Ring", P(circle(50, 50, 38)), "n"), part("Ticks", P("M50 0V30M50 70V100M0 50H30M70 50H100"), "n")]);
  one(M, "Brackets", 100, 100, P("M0 28V0H28M72 0H100V28M100 72V100H72M28 100H0V72"));
  one(M, "Chevron", 70, 100, P("M0 0H30L70 50L30 100H0L40 50Z"));
  one(M, "Double chevron", 90, 100, P("M0 0H24L50 50L24 100H0L26 50ZM40 0H64L90 50L64 100H40L66 50Z"));
  one(M, "Bolt", 80, 100, P("M50 0L0 56H34L24 100L80 40H44Z"));
  (function () {
    var d = "", i, a;
    for (i = 0; i < 6; i++) { a = (i * 60 - 90) * PI / 180; d += circle(50 + 27 * Math.cos(a), 50 + 27 * Math.sin(a), 23); }
    add(M, "Flower", 100, 100, [part("Petals", P(d)), part("Center", E(50, 50, 26, 26), "d")]);
  })();
  (function () {
    var pts = [], i, t, r;
    for (i = 0; i <= 36; i++) { t = i / 12 * 2 * PI * 1; r = 4 + i * 1.28; pts.push([50 + r * Math.cos(t - PI / 2), 50 + r * Math.sin(t - PI / 2)]); }
    one(M, "Spiral", 100, 100, P(smooth(pts)));
  })();

  /* ================= TYPOGRAPHY (15) ================= */
  var T = "Typography";
  one(T, "Underline", 100, 8, R(0, 0, 100, 8, 4));
  one(T, "Highlight", 100, 34, R(0, 0, 100, 34, 6));
  one(T, "Double underline", 100, 22, P(rectD(0, 0, 100, 6) + rectD(0, 16, 100, 6)));
  add(T, "Text box", 100, 100, [part("Frame", P("M4 4H96V96H4Z"), "n"), part("Handles", P(rectD(0, 0, 8, 8) + rectD(92, 0, 8, 8) + rectD(92, 92, 8, 8) + rectD(0, 92, 8, 8)))]);
  one(T, "Caret", 40, 100, P("M0 0H40V8H24V92H40V100H0V92H16V8H0Z"));
  one(T, "Quote", 80, 56, P("M0 40C0 16 12 4 30 0L34 10C22 14 18 22 18 28H34V56H0ZM46 40C46 16 58 4 76 0L80 10C68 14 64 22 64 28H80V56H46Z"));
  one(T, "Brackets []", 100, 100, P("M24 0H0V100H24V90H10V10H24ZM76 0H100V100H76V90H90V10H76Z"));
  one(T, "Parentheses", 100, 100, P("M32 0C6 22 6 78 32 100L38 94C16 72 16 28 38 6ZM68 0C94 22 94 78 68 100L62 94C84 72 84 28 62 6Z"));
  add(T, "Lower third", 100, 26, [part("Accent", R(0, 0, 5, 26)), part("Name Bar", R(5, 0, 95, 15), "d"), part("Title Bar", R(5, 17, 70, 9))]);
  add(T, "Lower third angled", 100, 26, [part("Body", P("M8 0H100L92 26H0Z")), part("Slash", P("M0 26L8 0H14L6 26Z"), "d")]);
  add(T, "Title bar", 100, 18, [part("Bar", R(0, 0, 100, 18)), part("Edge", R(0, 14, 100, 4), "d")]);
  add(T, "Caption box", 100, 28, [part("Body", R(0, 0, 100, 28, 6)), part("Line 1", R(10, 6, 80, 5, 2.5), "d"), part("Line 2", R(25, 16, 50, 5, 2.5), "d")]);
  add(T, "Tag", 100, 28, [part("Body", P("M0 14L16 0H100V28H16Z")), part("Hole", E(15, 14, 8, 8), "d")]);
  one(T, "Ribbon", 100, 40, P("M0 0H100L88 20L100 40H0L12 20Z"));
  add(T, "Callout", 100, 80, [part("Body", R(0, 0, 100, 60, 10)), part("Tail", P("M16 56V80L42 56Z"))]);

  /* ================= AMV (15) ================= */
  var A = "AMV";
  one(A, "Equalizer", 94, 100, P("M0 40H14V100H0ZM20 10H34V100H20ZM40 0H54V100H40ZM60 30H74V100H60ZM80 50H94V100H80Z"));
  (function () {
    var hs = [20, 50, 30, 70, 100, 60, 80, 40, 24], d = "", i;
    for (i = 0; i < hs.length; i++) { d += rectD(i * 10, 50 - hs[i] / 2, 6, hs[i]); }
    one(A, "Waveform", 86, 100, P(d));
  })();
  add(A, "Vinyl", 100, 100, [part("Disc", E(50, 50, 100, 100)), part("Groove", P(circle(50, 50, 38)), "n"), part("Label", E(50, 50, 34, 34), "d"), part("Hole", E(50, 50, 8, 8), "k")]);
  add(A, "Music note", 64, 100, [part("Stem", P("M34 8L64 20V40L42 30V82H34Z")), part("Head", E(18, 84, 36, 26))]);
  one(A, "Speed lines", 100, 100, P("M0 10H80M20 30H100M10 50H90M30 70H100M0 90H70"));
  add(A, "Slash", 120, 100, [part("Main", P("M58 0H120L82 100H20Z")), part("Thin", P("M40 0H48L10 100H2Z"), "d")]);
  (function () {
    var d = "", i, a, r;
    for (i = 0; i < 32; i++) { a = (i * 11.25 - 90) * PI / 180; r = i % 2 ? 24 : (i % 4 === 0 ? 50 : 42); d += (i ? "L" : "M") + f(50 + r * Math.cos(a)) + " " + f(50 + r * Math.sin(a)); }
    one(A, "Manga burst", 100, 100, P(d + "Z"));
  })();
  add(A, "Lens flare", 100, 100, [part("Streak", P("M50 0C52 38 62 48 100 50C62 52 52 62 50 100C48 62 38 52 0 50C38 48 48 38 50 0Z")), part("Core", E(50, 50, 28, 28), "l")]);
  add(A, "Viewfinder", 100, 100, [part("Corners", P("M0 28V0H28M72 0H100V28M100 72V100H72M28 100H0V72"), "n"), part("Cross", P("M50 40V60M40 50H60"), "n")]);
  add(A, "REC", 100, 100, [part("Ring", P(circle(50, 50, 50)), "n"), part("Dot", E(50, 50, 56, 56))]);
  (function () {
    var holes = "", i;
    for (i = 0; i < 6; i++) { holes += rectD(8 + i * 15, 6, 7, 7) + rectD(8 + i * 15, 51, 7, 7); }
    add(A, "Film strip", 100, 64, [part("Body", R(0, 0, 100, 64, 6)), part("Holes", P(holes), "d"), part("Frame", R(8, 18, 84, 28, 2), "k")]);
  })();
  one(A, "Glitch bars", 100, 78, P("M0 0H70V10H0ZM30 18H100V28H30ZM10 36H80V44H10ZM40 52H100V60H40ZM0 68H60V78H0Z"));
  (function () {
    var d = "", x, y, r;
    for (y = 0; y < 5; y++) { for (x = 0; x < 5; x++) { r = 10 - (Math.abs(x - 2) + Math.abs(y - 2)) * 1.7; d += circle(10 + x * 20, 10 + y * 20, r); } }
    one(A, "Halftone", 100, 100, P(d));
  })();
  one(A, "Stripes", 100, 60, P("M20 0H44L24 60H0ZM50 0H74L54 60H30ZM80 0H100L100 20L84 60H60Z"));
  one(A, "Heartbeat", 100, 90, P("M0 50H26L36 20L50 84L62 6L72 50H100"));

  /* ================= DEVICE (14) ================= */
  var D = "Device";
  add(D, "Phone", 50, 100, [part("Body", R(0, 0, 50, 100, 9)), part("Screen", R(2.6, 2.6, 44.8, 94.8, 6.6), "d"), part("Island", R(17, 5.5, 16, 4.6, 2.3), "k")]);
  add(D, "Phone notch", 50, 100, [part("Body", R(0, 0, 50, 100, 9)), part("Screen", R(2.6, 2.6, 44.8, 94.8, 6.6), "d"), part("Notch", P("M16 2.6H34V4C34 7 32 9 29 9H21C18 9 16 7 16 4Z"), "k")]);
  add(D, "Punch hole", 50, 100, [part("Body", R(0, 0, 50, 100, 9)), part("Screen", R(2.6, 2.6, 44.8, 94.8, 6.6), "d"), part("Camera", E(25, 7.4, 3.8, 3.8), "k")]);
  add(D, "Home button", 50, 100, [part("Body", R(0, 0, 50, 100, 8)), part("Screen", R(3, 12, 44, 70, 1.5), "d"), part("Speaker", R(18, 5, 14, 2, 1), "d"), part("Button", E(25, 91, 11, 11), "d")]);
  add(D, "Phone wide", 100, 50, [part("Body", R(0, 0, 100, 50, 9)), part("Screen", R(2.6, 2.6, 94.8, 44.8, 6.6), "d"), part("Island", R(90.8, 17, 4.6, 16, 2.3), "k")]);
  add(D, "Foldable", 100, 76, [part("Body", R(0, 0, 100, 76, 8)), part("Screen Left", R(3, 3, 45, 70, 5), "d"), part("Screen Right", R(52, 3, 45, 70, 5), "d"), part("Hinge", R(48.5, 0, 3, 76), "k")]);
  add(D, "Tablet", 75, 100, [part("Body", R(0, 0, 75, 100, 7)), part("Screen", R(3.5, 3.5, 68, 93, 3.5), "d"), part("Camera", E(37.5, 1.75, 1.8, 1.8), "k")]);
  add(D, "Tablet wide", 100, 75, [part("Body", R(0, 0, 100, 75, 7)), part("Screen", R(3.5, 3.5, 93, 68, 3.5), "d"), part("Camera", E(1.75, 37.5, 1.8, 1.8), "k")]);
  add(D, "Laptop", 100, 62, [part("Lid", R(8, 0, 84, 54, 4)), part("Screen", R(10.5, 2.5, 79, 49, 2), "d"), part("Base", P("M0 55H100V57C100 60 98 62 95 62H5C2 62 0 60 0 57Z")), part("Groove", R(40, 55, 20, 2.2, 1.1), "d")]);
  add(D, "Monitor", 100, 82, [part("Neck", R(44, 60, 12, 18)), part("Stand", R(28, 77, 44, 5, 2.5)), part("Body", R(0, 0, 100, 64, 4)), part("Screen", R(3, 3, 94, 56, 2), "d")]);
  add(D, "TV", 100, 70, [part("Left Foot", P("M20 61H30L34 70H16Z")), part("Right Foot", P("M70 61H80L84 70H66Z")), part("Body", R(0, 0, 100, 62, 3)), part("Screen", R(2, 2, 96, 58, 2), "d")]);
  add(D, "Smartwatch", 60, 100, [part("Strap Top", R(14, 0, 32, 34, 8), "d"), part("Strap Bottom", R(14, 66, 32, 34, 8), "d"), part("Crown", R(54, 40, 6, 12, 2)), part("Body", R(2, 24, 52, 52, 14)), part("Screen", R(6.5, 28.5, 43, 43, 10), "k")]);
  add(D, "Camera", 100, 72, [part("Hump", P("M30 10L37 0H63L70 10Z")), part("Body", R(0, 10, 100, 62, 10)), part("Flash", R(8, 17, 14, 7, 2), "d"), part("Lens", E(50, 42, 44, 44), "d"), part("Lens Core", E(50, 42, 28, 28), "k")]);
  add(D, "Browser", 100, 70, [part("Window", R(0, 0, 100, 70, 6)), part("Content", R(3, 14, 94, 53, 3), "d"), part("Controls", P(circle(7, 7, 2.2) + circle(14, 7, 2.2) + circle(21, 7, 2.2)), "k"), part("Address Bar", R(30, 3, 62, 8, 4), "d")]);

  /* ================= UI (11) ================= */
  var U = "UI";
  one(U, "Cursor", 62, 96, P("M0 0L0 80L20 62L34 96L48 90L34 56L62 54Z"));
  add(U, "Button", 100, 36, [part("Body", R(0, 0, 100, 36, 18)), part("Label", R(30, 15, 40, 6, 3), "d")]);
  add(U, "Toggle", 100, 56, [part("Track", R(0, 0, 100, 56, 28)), part("Knob", E(72, 28, 44, 44), "l")]);
  add(U, "Slider", 100, 24, [part("Track", R(0, 9, 100, 6, 3), "d"), part("Fill", R(0, 9, 60, 6, 3)), part("Knob", E(60, 12, 24, 24), "l")]);
  add(U, "Progress bar", 100, 14, [part("Track", R(0, 0, 100, 14, 7), "d"), part("Fill", R(0, 0, 64, 14, 7))]);
  add(U, "Input field", 100, 40, [part("Body", R(0, 0, 100, 40, 8)), part("Field", R(2, 2, 96, 36, 6), "d"), part("Cursor", R(12, 11, 2.4, 18, 1.2), "l")]);
  add(U, "Notification", 100, 40, [part("Body", R(0, 0, 100, 40, 12)), part("Icon", R(8, 8, 24, 24, 7), "d"), part("Title", R(40, 11, 40, 6, 3), "d"), part("Text", R(40, 23, 26, 5, 2.5), "d")]);
  add(U, "Card", 80, 100, [part("Body", R(0, 0, 80, 100, 10)), part("Image", R(6, 6, 68, 46, 6), "d"), part("Title", R(6, 62, 44, 7, 3.5), "d"), part("Text", R(6, 78, 68, 5, 2.5), "d")]);
  add(U, "Chat", 100, 76, [part("Bubble In", R(0, 0, 70, 34, 12)), part("Bubble Out", R(30, 42, 70, 34, 12), "d")]);
  add(U, "Play button", 100, 100, [part("Disc", E(50, 50, 100, 100)), part("Triangle", P("M40 30L72 50L40 70Z"), "l")]);
  add(U, "Avatar", 100, 100, [part("Disc", E(50, 50, 100, 100)), part("Shoulders", P("M16 80C20 66 34 62 50 62C66 62 80 66 84 80C72 96 60 100 50 100C40 100 28 96 16 80Z"), "d"), part("Head", E(50, 38, 32, 32), "d")]);

  /* ================= FRAMES (7) ================= */
  var F = "Frames";
  one(F, "16:9", 160, 90, R(0, 0, 160, 90, 0));
  one(F, "9:16", 90, 160, R(0, 0, 90, 160, 0));
  one(F, "1:1", 100, 100, R(0, 0, 100, 100, 0));
  one(F, "4:5", 80, 100, R(0, 0, 80, 100, 0));
  one(F, "4:3", 120, 90, R(0, 0, 120, 90, 0));
  one(F, "21:9", 210, 90, R(0, 0, 210, 90, 0));
  add(F, "Safe zone", 160, 90, [part("Action Safe", P("M8 4.5H152V85.5H8Z"), "n"), part("Title Safe", P("M16 9H144V81H16Z"), "n"), part("Center Cross", P("M80 40V50M75 45H85"), "n")]);

  /* ---------------- groups ---------------- */
  var groups = [
    { id: "Basic", note: "Building blocks" },
    { id: "Mograph", note: "Lines, bursts and motion accents" },
    { id: "Typography", note: "Bars, boxes and marks for text" },
    { id: "AMV", note: "Music video accents and overlays" },
    { id: "Device", note: "Phones, tablets, laptops and screens" },
    { id: "UI", note: "Buttons, cards and cursors for interface motion" },
    { id: "Frames", note: "Aspect ratios and safe zones" }
  ];
  var byId = {}, i;
  for (i = 0; i < shapes.length; i++) { byId[shapes[i].id] = shapes[i]; }

  /* ---------------- SVG path -> nodes (M L H V C Z, absolute) ----------------
     Returns contours: [ { c: closed, v: [[x,y]...], i: [[dx,dy]...] (in tangent), o: [[dx,dy]...] (out tangent) } ] in the shape's units. */
  function toNodes(d) {
    var tok = String(d).match(/[MLHVCZ]|-?\d*\.?\d+(?:e-?\d+)?/gi) || [], k = 0, cmd = "", out = [], cur = null, x = 0, y = 0, n;
    function num() { return parseFloat(tok[k++]); }
    function start(px, py) { cur = { c: false, v: [[px, py]], i: [[0, 0]], o: [[0, 0]] }; out.push(cur); }
    function lineTo(px, py) { cur.v.push([px, py]); cur.i.push([0, 0]); cur.o.push([0, 0]); x = px; y = py; }
    while (k < tok.length) {
      if (/[MLHVCZ]/i.test(tok[k])) { cmd = tok[k++].toUpperCase(); if (cmd === "Z") { if (cur) { cur.c = true; } continue; } }
      if (cmd === "M") { x = num(); y = num(); start(x, y); cmd = "L"; }
      else if (cmd === "L") { n = num(); lineTo(n, num()); }
      else if (cmd === "H") { lineTo(num(), y); }
      else if (cmd === "V") { lineTo(x, num()); }
      else if (cmd === "C") {
        var c1x = num(), c1y = num(), c2x = num(), c2y = num(), ex = num(), ey = num();
        cur.o[cur.o.length - 1] = [c1x - x, c1y - y];
        cur.v.push([ex, ey]); cur.i.push([c2x - ex, c2y - ey]); cur.o.push([0, 0]);
        x = ex; y = ey;
      } else { k++; }
    }
    // closed contour whose last point repeats the first (arc circles): merge so the path has no doubled vertex
    for (n = 0; n < out.length; n++) {
      var c = out[n], L = c.v.length;
      if (c.c && L > 2 && Math.abs(c.v[0][0] - c.v[L - 1][0]) < 0.01 && Math.abs(c.v[0][1] - c.v[L - 1][1]) < 0.01) {
        c.i[0] = c.i[L - 1]; c.v.pop(); c.i.pop(); c.o.pop();
      }
    }
    return out;
  }
  function pathBounds(d) {
    var c = toNodes(d), a, b, x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9, p;
    for (a = 0; a < c.length; a++) {
      for (b = 0; b < c[a].v.length; b++) { p = c[a].v[b]; x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); }
    }
    return [x0, y0, x1, y1];
  }

  w.MTShapes = { groups: groups, shapes: shapes, byId: byId, toNodes: toNodes, pathBounds: pathBounds };
})(window);
