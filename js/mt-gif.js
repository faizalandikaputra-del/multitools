/* Multi Tool - mt-gif.js : GIF encoder for the Tools > Export GIF feature.
   After Effects renders a PNG sequence into a temp folder (host.jsx: TOOLS_gifRender). This file turns that
   folder into ONE animated .gif entirely inside the panel (Node.js + <canvas>), so no ffmpeg / Media Encoder
   / plug-in is needed.

   Public API (window.MTGif):
     MTGif.available()                      -> true when Node.js (fs / path) is usable in this panel
     MTGif.exportFolder(opts)               -> { promise, cancel() }
        opts.dir        temp folder with the rendered PNG files
        opts.files      array of file names inside dir (sorted)
        opts.duration   seconds the frames cover (sets the real playback speed)
        opts.fps        requested frame rate
        opts.width      target width in px (height follows the aspect ratio, never upscaled)
        opts.colors     64 | 128 | 256
        opts.background "transparent" | "white" | "black"
        opts.dither     true = Floyd-Steinberg dithering
        opts.optimize   true = only store the pixels that changed between frames (not used with transparency)
        opts.loop       true = loop forever, false = play once
        opts.outPath    full path of the .gif to write
        opts.onProgress function ({ stage: "analyze" | "encode" | "write", done, total })
        resolves { path, bytes, frames, width, height }, rejects Error("Cancelled") when cancel() was called.

   Palette index 0 is always reserved as the transparent index (transparent background, or "pixel unchanged
   since the previous frame"), so real colours live in indices 1..N-1. Plain ES5 + Promises for old CEP hosts. */
(function (global) {
  "use strict";

  var fs = null, pathMod = null, BufferCtor = null;
  try {
    var req = (typeof global.require === "function") ? global.require : (global.cep_node && global.cep_node.require);
    if (req) { fs = req("fs"); pathMod = req("path"); BufferCtor = req("buffer").Buffer; }
  } catch (e) { fs = null; pathMod = null; BufferCtor = null; }

  // ---------------------------------------------------------------- byte sink
  function ByteSink() { this.chunks = []; this.cur = new Uint8Array(65536); this.n = 0; this.total = 0; }
  ByteSink.prototype.byte = function (b) {
    if (this.n === this.cur.length) { this.chunks.push(this.cur); this.cur = new Uint8Array(65536); this.n = 0; }
    this.cur[this.n++] = b & 255; this.total++;
  };
  ByteSink.prototype.word = function (w) { this.byte(w & 255); this.byte((w >> 8) & 255); };
  ByteSink.prototype.ascii = function (s) { for (var i = 0; i < s.length; i++) { this.byte(s.charCodeAt(i)); } };
  ByteSink.prototype.toBuffer = function () {
    var out = new Uint8Array(this.total), off = 0, i;
    for (i = 0; i < this.chunks.length; i++) { out.set(this.chunks[i], off); off += this.chunks[i].length; }
    out.set(this.cur.subarray(0, this.n), off);
    return BufferCtor.from(out.buffer, out.byteOffset, out.length);
  };

  // ---------------------------------------------------------------- median-cut palette
  // px: Uint8Array of r,g,b triples (count pixels). Returns an array of [r, g, b] (at most maxColors).
  function medianCut(px, count, maxColors) {
    var idx = new Uint32Array(count), i;
    for (i = 0; i < count; i++) { idx[i] = i; }
    var boxes = [makeBox(0, count)];

    function makeBox(lo, hi) {
      var rMin = 255, gMin = 255, bMin = 255, rMax = 0, gMax = 0, bMax = 0, k, p, r, g, b;
      for (k = lo; k < hi; k++) {
        p = idx[k] * 3; r = px[p]; g = px[p + 1]; b = px[p + 2];
        if (r < rMin) { rMin = r; } if (r > rMax) { rMax = r; }
        if (g < gMin) { gMin = g; } if (g > gMax) { gMax = g; }
        if (b < bMin) { bMin = b; } if (b > bMax) { bMax = b; }
      }
      var dr = rMax - rMin, dg = gMax - gMin, db = bMax - bMin;
      var ch = 0, range = dr;
      if (dg > range) { ch = 1; range = dg; }
      if (db > range) { ch = 2; range = db; }
      return { lo: lo, hi: hi, ch: ch, range: range, score: range * Math.sqrt(hi - lo) };
    }

    while (boxes.length < maxColors) {
      var best = -1, bestScore = 0, b2;
      for (i = 0; i < boxes.length; i++) {
        b2 = boxes[i];
        if (b2.hi - b2.lo > 1 && b2.range > 0 && b2.score > bestScore) { bestScore = b2.score; best = i; }
      }
      if (best < 0) { break; }
      var box = boxes[best], ch = box.ch;
      var view = idx.subarray(box.lo, box.hi);
      view.sort(function (a, b) { return px[a * 3 + ch] - px[b * 3 + ch]; });
      var mid = box.lo + ((box.hi - box.lo) >> 1);
      boxes.splice(best, 1, makeBox(box.lo, mid), makeBox(mid, box.hi));
    }

    var pal = [], k2, q, sr, sg, sb, c;
    for (i = 0; i < boxes.length; i++) {
      sr = 0; sg = 0; sb = 0; c = boxes[i].hi - boxes[i].lo;
      for (k2 = boxes[i].lo; k2 < boxes[i].hi; k2++) { q = idx[k2] * 3; sr += px[q]; sg += px[q + 1]; sb += px[q + 2]; }
      pal.push([Math.round(sr / c), Math.round(sg / c), Math.round(sb / c)]);
    }
    return pal;
  }

  // ---------------------------------------------------------------- LZW (GIF flavour)
  var lzwTable = null;   // reused between frames: value 0 = empty, otherwise the code (always >= 6)

  function lzwEncode(pixels, minCodeSize, sink) {
    if (!lzwTable) { lzwTable = new Int32Array(1 << 20); } else { lzwTable.fill(0); }
    var table = lzwTable;
    var clearCode = 1 << minCodeSize, eoiCode = clearCode + 1;
    var nextCode = eoiCode + 1, codeSize = minCodeSize + 1;
    var cur = 0, bits = 0;
    var block = new Uint8Array(255), blockLen = 0;

    function flushBlock() {
      if (!blockLen) { return; }
      sink.byte(blockLen);
      for (var i = 0; i < blockLen; i++) { sink.byte(block[i]); }
      blockLen = 0;
    }
    function putByte(b) { block[blockLen++] = b; if (blockLen === 255) { flushBlock(); } }
    function emit(code) {
      cur |= code << bits; bits += codeSize;
      while (bits >= 8) { putByte(cur & 255); cur >>>= 8; bits -= 8; }
    }

    sink.byte(minCodeSize);
    emit(clearCode);

    var n = pixels.length, code = pixels[0], i, k, key, found;
    for (i = 1; i < n; i++) {
      k = pixels[i];
      key = (code << 8) | k;
      found = table[key];
      if (found) {
        code = found;
      } else {
        emit(code);
        if (nextCode === 4096) {
          emit(clearCode);
          nextCode = eoiCode + 1; codeSize = minCodeSize + 1;
          table.fill(0);
        } else {
          if (nextCode >= (1 << codeSize)) { codeSize++; }
          table[key] = nextCode++;
        }
        code = k;
      }
    }
    emit(code);
    emit(eoiCode);
    if (bits > 0) { putByte(cur & 255); }
    flushBlock();
    sink.byte(0);          // block terminator
  }

  // ---------------------------------------------------------------- colour mapping
  // Nearest palette entry with a 6-bit-per-channel cache. palette: array of [r,g,b] where entry 0 is unused.
  function Mapper(palette) {
    this.pal = palette;
    this.cache = new Int16Array(1 << 18);
    this.cache.fill(-1);
  }
  Mapper.prototype.nearest = function (r, g, b) {
    var key = ((r >> 2) << 12) | ((g >> 2) << 6) | (b >> 2);
    var hit = this.cache[key];
    if (hit >= 0) { return hit; }
    var cr = (r & 0xFC) + 2, cg = (g & 0xFC) + 2, cb = (b & 0xFC) + 2;
    var pal = this.pal, best = 1, bestD = 1e9, i, p, dr, dg, db, d;
    for (i = 1; i < pal.length; i++) {
      p = pal[i]; dr = p[0] - cr; dg = p[1] - cg; db = p[2] - cb;
      d = dr * dr * 2 + dg * dg * 4 + db * db * 3;     // weighted: the eye is most sensitive to green
      if (d < bestD) { bestD = d; best = i; if (d === 0) { break; } }
    }
    this.cache[key] = best;
    return best;
  };

  // ---------------------------------------------------------------- image helpers
  function loadImage(filePath) {
    return new Promise(function (resolve, reject) {
      fs.readFile(filePath, function (err, data) {
        if (err) { reject(err); return; }
        var url = URL.createObjectURL(new Blob([data], { type: "image/png" }));
        var img = new Image();
        img.onload = function () { URL.revokeObjectURL(url); resolve(img); };
        img.onerror = function () { URL.revokeObjectURL(url); reject(new Error("Could not read the rendered frame \"" + pathMod.basename(filePath) + "\".")); };
        img.src = url;
      });
    });
  }

  function nextTick() { return new Promise(function (r) { setTimeout(r, 0); }); }

  function pad2(n) { return (n < 10 ? "0" : "") + n; }

  // ---------------------------------------------------------------- the export
  function exportFolder(opts) {
    var cancelled = false;
    function cancel() { cancelled = true; }
    function check() { if (cancelled) { throw new Error("Cancelled"); } }

    var promise = Promise.resolve().then(function () {
      if (!fs) { throw new Error("Node.js is not available in this panel, so the GIF cannot be written."); }
      var files = opts.files || [];
      if (!files.length) { throw new Error("After Effects did not render any frames."); }

      // Some AE builds ignore the custom render frame rate and write every comp frame. Keep every n-th frame
      // so the GIF still has the requested frame rate (the duration stays the same).
      var wanted = Math.max(1, Math.round((opts.duration || 0) * (opts.fps || 0)));
      if (opts.duration && opts.fps && files.length > wanted * 1.25) {
        var picked = [], seen = {}, q, at;
        for (q = 0; q < wanted; q++) {
          at = Math.min(files.length - 1, Math.round(q * files.length / wanted));
          if (!seen[at]) { seen[at] = true; picked.push(files[at]); }
        }
        files = picked;
      }

      var onProgress = opts.onProgress || function () {};
      var transparentBg = opts.background === "transparent";
      var bgRGB = opts.background === "black" ? [0, 0, 0] : [255, 255, 255];
      var useDiff = !!opts.optimize && !transparentBg;
      var colors = opts.colors === 64 || opts.colors === 128 ? opts.colors : 256;
      var canvas = document.createElement("canvas");
      var ctx = canvas.getContext("2d", { willReadFrequently: true }) || canvas.getContext("2d");
      var W = 0, H = 0;

      // Reads one frame as RGBA at the target size. Pixels are composited over the chosen background when it is opaque.
      function readFrame(i) {
        return loadImage(pathMod.join(opts.dir, files[i])).then(function (img) {
          if (!W) {
            W = Math.max(1, Math.min(Math.round(opts.width) || img.naturalWidth, img.naturalWidth));
            H = Math.max(1, Math.round(W * img.naturalHeight / img.naturalWidth));
            canvas.width = W; canvas.height = H;
          }
          ctx.clearRect(0, 0, W, H);
          try { ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = "high"; } catch (e) { }
          ctx.drawImage(img, 0, 0, W, H);
          return ctx.getImageData(0, 0, W, H).data;
        });
      }

      // ---- pass 1: sample colours from up to 24 frames spread over the whole range ----
      var sampleFrames = [], step = Math.max(1, files.length / 24), s;
      for (s = 0; s < files.length; s += step) { sampleFrames.push(Math.floor(s)); }
      var samples = [], sampled = 0, perFrame = Math.floor(65536 / sampleFrames.length);

      function analyze(j) {
        if (j >= sampleFrames.length) { return Promise.resolve(); }
        check();
        return readFrame(sampleFrames[j]).then(function (rgba) {
          var total = W * H, stride = Math.max(1, Math.floor(total / perFrame)), p, a, r, g, b, inv;
          for (p = 0; p < total; p += stride) {
            a = rgba[p * 4 + 3];
            if (transparentBg && a < 128) { continue; }
            r = rgba[p * 4]; g = rgba[p * 4 + 1]; b = rgba[p * 4 + 2];
            if (a < 255) { inv = (255 - a) / 255; r = r * (a / 255) + bgRGB[0] * inv; g = g * (a / 255) + bgRGB[1] * inv; b = b * (a / 255) + bgRGB[2] * inv; }
            samples.push(r, g, b); sampled++;
          }
          onProgress({ stage: "analyze", done: j + 1, total: sampleFrames.length });
          return nextTick();
        }).then(function () { return analyze(j + 1); });
      }

      var mapper, palette, minCodeSize, tableSize, sink, prev = null, delaySoFar = 0, totalCs;
      var wrote = 0;

      // delay of frame i in 1/100 s so that the whole GIF lasts exactly `duration` (GIF can only store 1/100 s steps)
      totalCs = Math.max(files.length * 2, Math.round((opts.duration || files.length / (opts.fps || 15)) * 100));
      function delayFor(i) { return Math.max(2, Math.round((i + 1) * totalCs / files.length) - Math.round(i * totalCs / files.length)); }

      function buildPalette() {
        var real = new Uint8Array(samples.length);
        for (var q = 0; q < samples.length; q++) { real[q] = samples[q]; }
        var pal = sampled ? medianCut(real, sampled, colors - 1) : [[0, 0, 0]];
        samples = null;
        palette = [[0, 0, 0]].concat(pal);               // index 0 = reserved transparent entry
        var size = 4; while (size < palette.length) { size <<= 1; }
        tableSize = size;
        while (palette.length < tableSize) { palette.push([0, 0, 0]); }
        minCodeSize = Math.max(2, Math.round(Math.log(tableSize) / Math.LN2));
        mapper = new Mapper(palette.slice(0, pal.length + 1));
      }

      function writeHeader() {
        sink = new ByteSink();
        sink.ascii("GIF89a");
        sink.word(W); sink.word(H);
        var sizeBits = Math.round(Math.log(tableSize) / Math.LN2) - 1;
        sink.byte(0x80 | (7 << 4) | sizeBits);            // global colour table present, 8 bits per channel
        sink.byte(0);                                      // background index
        sink.byte(0);                                      // pixel aspect ratio
        for (var c = 0; c < tableSize; c++) { sink.byte(palette[c][0]); sink.byte(palette[c][1]); sink.byte(palette[c][2]); }
        if (opts.loop) {                                   // Netscape 2.0 looping extension: 0 = forever
          sink.byte(0x21); sink.byte(0xFF); sink.byte(11); sink.ascii("NETSCAPE2.0");
          sink.byte(3); sink.byte(1); sink.word(0); sink.byte(0);
        }
      }

      // RGBA -> palette indices for one frame (Floyd-Steinberg when dithering)
      function quantize(rgba) {
        var out = new Uint8Array(W * H), x, y, p, a, r, g, b, inv, idx, pr, pg, pb, er, eg, eb;
        var dither = !!opts.dither, errCur, errNext, tmp, i3;
        if (dither) { errCur = new Float32Array((W + 2) * 3); errNext = new Float32Array((W + 2) * 3); }
        for (y = 0; y < H; y++) {
          for (x = 0; x < W; x++) {
            p = y * W + x; a = rgba[p * 4 + 3];
            if (transparentBg && a < 128) { out[p] = 0; continue; }
            r = rgba[p * 4]; g = rgba[p * 4 + 1]; b = rgba[p * 4 + 2];
            if (a < 255) { inv = (255 - a) / 255; r = r * (a / 255) + bgRGB[0] * inv; g = g * (a / 255) + bgRGB[1] * inv; b = b * (a / 255) + bgRGB[2] * inv; }
            if (dither) {
              i3 = (x + 1) * 3;
              r += errCur[i3]; g += errCur[i3 + 1]; b += errCur[i3 + 2];
              r = r < 0 ? 0 : (r > 255 ? 255 : r); g = g < 0 ? 0 : (g > 255 ? 255 : g); b = b < 0 ? 0 : (b > 255 ? 255 : b);
            }
            pr = r | 0; pg = g | 0; pb = b | 0;
            idx = mapper.nearest(pr, pg, pb);
            out[p] = idx;
            if (dither) {
              er = r - palette[idx][0]; eg = g - palette[idx][1]; eb = b - palette[idx][2];
              errCur[i3 + 3] += er * 0.4375; errCur[i3 + 4] += eg * 0.4375; errCur[i3 + 5] += eb * 0.4375;
              errNext[i3 - 3] += er * 0.1875; errNext[i3 - 2] += eg * 0.1875; errNext[i3 - 1] += eb * 0.1875;
              errNext[i3] += er * 0.3125; errNext[i3 + 1] += eg * 0.3125; errNext[i3 + 2] += eb * 0.3125;
              errNext[i3 + 3] += er * 0.0625; errNext[i3 + 4] += eg * 0.0625; errNext[i3 + 5] += eb * 0.0625;
            }
          }
          if (dither) { tmp = errCur; errCur = errNext; errNext = tmp; errNext.fill(0); }
        }
        return out;
      }

      function writeFrame(i, indices) {
        var x0 = 0, y0 = 0, w = W, h = H, disposal = transparentBg ? 2 : 1, data = indices;

        if (useDiff && prev) {
          // bounding box of the pixels that differ from what the viewer already sees
          var minX = W, minY = H, maxX = -1, maxY = -1, x, y, p;
          for (y = 0; y < H; y++) {
            for (x = 0; x < W; x++) {
              p = y * W + x;
              if (indices[p] !== prev[p]) { if (x < minX) { minX = x; } if (x > maxX) { maxX = x; } if (y < minY) { minY = y; } if (y > maxY) { maxY = y; } }
            }
          }
          if (maxX < 0) { minX = 0; minY = 0; maxX = 0; maxY = 0; }
          x0 = minX; y0 = minY; w = maxX - minX + 1; h = maxY - minY + 1;
          data = new Uint8Array(w * h);
          for (y = 0; y < h; y++) {
            for (x = 0; x < w; x++) {
              p = (y + y0) * W + (x + x0);
              data[y * w + x] = (indices[p] === prev[p]) ? 0 : indices[p];   // 0 = transparent = keep the previous pixel
            }
          }
        }
        if (useDiff) {                                      // remember what is on screen now
          if (!prev) { prev = new Uint8Array(indices); }
          else {
            for (y = 0; y < h; y++) { for (x = 0; x < w; x++) { var v = data[y * w + x]; if (v) { prev[(y + y0) * W + (x + x0)] = v; } } }
          }
        }

        // Graphic Control Extension (delay + transparent index 0 + disposal)
        sink.byte(0x21); sink.byte(0xF9); sink.byte(4);
        sink.byte((disposal << 2) | 1);
        sink.word(delayFor(i));
        sink.byte(0); sink.byte(0);
        // Image Descriptor (no local colour table)
        sink.byte(0x2C); sink.word(x0); sink.word(y0); sink.word(w); sink.word(h); sink.byte(0);
        lzwEncode(data, minCodeSize, sink);
        wrote++;
      }

      function encode(i) {
        if (i >= files.length) { return Promise.resolve(); }
        check();
        return readFrame(i).then(function (rgba) {
          writeFrame(i, quantize(rgba));
          onProgress({ stage: "encode", done: i + 1, total: files.length });
          return nextTick();
        }).then(function () { return encode(i + 1); });
      }

      return analyze(0).then(function () {
        check();
        buildPalette();
        writeHeader();
        return encode(0);
      }).then(function () {
        check();
        sink.byte(0x3B);                                    // trailer
        onProgress({ stage: "write", done: 1, total: 1 });
        var buf = sink.toBuffer();
        // never overwrite an existing file: name.gif -> name_2.gif ...
        var out = opts.outPath, n = 2, ext = pathMod.extname(out), stem = out.slice(0, out.length - ext.length);
        while (fs.existsSync(out) && n < 1000) { out = stem + "_" + n + ext; n++; }
        fs.writeFileSync(out, buf);
        return { path: out, bytes: buf.length, frames: wrote, width: W, height: H };
      });
    });

    return { promise: promise, cancel: cancel };
  }

  // Deletes the temp folder the render went into (best effort, never throws).
  function removeDir(dir) {
    try {
      if (!fs || !dir) { return; }
      var list = fs.readdirSync(dir), i;
      for (i = 0; i < list.length; i++) { try { fs.unlinkSync(pathMod.join(dir, list[i])); } catch (e) { } }
      fs.rmdirSync(dir);
    } catch (e) { /* temp cleanup is best effort */ }
  }

  global.MTGif = {
    available: function () { return !!(fs && pathMod && BufferCtor); },
    exportFolder: exportFolder,
    removeDir: removeDir,
    joinPath: function (dir, name) { return pathMod.join(dir, name); },
    dirExists: function (dir) { try { return !!(fs && dir && fs.statSync(dir).isDirectory()); } catch (e) { return false; } }
  };
})(window);
