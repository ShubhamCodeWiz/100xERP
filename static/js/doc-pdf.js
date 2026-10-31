/* Built-in PDF renderer: the last link of the fallback chain. It needs no network, no library
   and no font download, so a PDF can always be produced, even when every LaTeX service is
   unreachable. It draws the same two documents as doc-latex.js from the same data:
     - internship certificate: 30 x 15 cm (2:1)
     - experience letter: A4, with every assigned duty / project listed
   Exposes window.DocPdf.build(d) -> Uint8Array. Standard Times fonts only (WinAnsi), so
   characters outside Latin-1 print as '?'. */
(function (root) {
  'use strict';

  /* ---------- font metrics: Times Roman / Bold / Italic / BoldItalic, WinAnsi codes 32..255, per 1000 units ---------- */
  var WIDTHS = {
    F1: [250,333,408,500,500,833,778,180,333,333,500,564,250,333,250,278,500,500,500,500,500,500,500,500,500,500,278,278,564,564,564,444,921,722,667,667,722,611,556,722,722,333,389,722,611,889,722,722,556,722,667,556,611,722,722,944,722,722,611,333,278,333,469,500,333,444,500,444,500,444,333,500,500,278,278,500,278,778,500,500,500,500,333,389,278,500,500,722,500,500,444,480,200,480,541,761,500,0,333,500,444,1000,500,500,333,1000,556,333,889,0,611,0,0,333,333,444,444,350,500,1000,333,980,389,333,722,0,444,722,250,333,500,500,500,500,200,500,333,760,276,500,564,333,760,333,400,564,300,300,333,500,453,250,333,300,310,500,750,750,750,444,722,722,722,722,722,722,889,667,611,611,611,611,333,333,333,333,722,722,722,722,722,722,722,564,722,722,722,722,722,722,556,500,444,444,444,444,444,444,667,444,444,444,444,444,278,278,278,278,500,500,500,500,500,500,500,564,500,500,500,500,500,500,500,500],
    F2: [250,333,555,500,500,1000,833,278,333,333,500,570,250,333,250,278,500,500,500,500,500,500,500,500,500,500,333,333,570,570,570,500,930,722,667,722,722,667,611,778,778,389,500,778,667,944,722,778,611,778,722,556,667,722,722,1000,722,722,667,333,278,333,581,500,333,500,556,444,556,444,333,500,556,278,333,556,278,833,556,500,556,556,444,389,333,556,500,722,500,500,444,394,220,394,520,761,500,0,333,500,500,1000,500,500,333,1000,556,333,1000,0,667,0,0,333,333,500,500,350,500,1000,333,1000,389,333,722,0,444,722,250,333,500,500,500,500,220,500,333,747,300,500,570,333,747,333,400,570,300,300,333,556,540,250,333,300,330,500,750,750,750,500,722,722,722,722,722,722,1000,722,667,667,667,667,389,389,389,389,722,722,778,778,778,778,778,570,778,722,722,722,722,722,611,556,500,500,500,500,500,500,722,444,444,444,444,444,278,278,278,278,500,556,500,500,500,500,500,570,500,556,556,556,556,500,556,500],
    F3: [250,333,420,500,500,833,778,214,333,333,500,675,250,333,250,278,500,500,500,500,500,500,500,500,500,500,333,333,675,675,675,500,920,611,611,667,722,611,611,722,722,333,444,667,556,833,667,722,611,722,611,500,556,722,611,833,611,556,556,389,278,389,422,500,333,500,500,444,500,444,278,500,500,278,278,444,278,722,500,500,500,500,389,389,278,500,444,667,444,444,389,400,275,400,541,761,500,0,333,500,556,889,500,500,333,1000,500,333,944,0,556,0,0,333,333,556,556,350,500,889,333,980,389,333,667,0,389,556,250,389,500,500,500,500,275,500,333,760,276,500,675,333,760,333,400,675,300,300,333,500,523,250,333,300,310,500,750,750,750,500,611,611,611,611,611,611,889,667,611,611,611,611,333,333,333,333,722,667,722,722,722,722,722,675,722,722,722,722,722,556,611,500,500,500,500,500,500,500,667,444,444,444,444,444,278,278,278,278,500,500,500,500,500,500,500,675,500,500,500,500,500,444,500,444],
    F4: [250,389,555,500,500,833,778,278,333,333,500,570,250,333,250,278,500,500,500,500,500,500,500,500,500,500,333,333,570,570,570,500,832,667,667,667,722,667,667,722,778,389,500,667,611,889,722,722,611,722,667,556,611,722,667,889,667,611,611,333,278,333,570,500,333,500,500,444,500,444,333,500,556,278,278,500,278,778,556,500,500,500,389,389,278,556,444,667,500,444,389,348,220,348,570,761,500,0,333,500,500,1000,500,500,333,1000,556,333,944,0,611,0,0,333,333,500,500,350,500,1000,333,1000,389,333,722,0,389,611,250,389,500,500,500,500,220,500,333,747,266,500,606,333,747,333,400,570,300,300,333,576,500,250,333,300,300,500,750,750,750,500,667,667,667,667,667,667,944,667,667,667,667,667,389,389,389,389,722,722,722,722,722,722,722,570,722,722,722,722,722,611,611,500,500,500,500,500,500,500,722,444,444,444,444,444,278,278,278,278,500,556,500,500,500,500,500,570,500,556,556,556,556,444,500,444]
  };
  var BASE_FONT = { F1: 'Times-Roman', F2: 'Times-Bold', F3: 'Times-Italic', F4: 'Times-BoldItalic' };
  var CP1252 = { 0x2018: 0x91, 0x2019: 0x92, 0x201c: 0x93, 0x201d: 0x94, 0x2013: 0x96, 0x2014: 0x97, 0x2022: 0x95, 0x2026: 0x85 };

  /* Text -> array of WinAnsi byte codes (unprintable / unsupported characters become '?'). */
  function codes(text) {
    var out = [];
    Array.from(String(text === null || text === undefined ? '' : text)).forEach(function (ch) {
      var c = ch.codePointAt(0);
      if (c === 9 || c === 10 || c === 13) c = 32;
      if (CP1252[c]) c = CP1252[c];
      else if (!((c >= 32 && c <= 126) || (c >= 160 && c <= 255))) c = 63;
      out.push(c);
    });
    return out;
  }

  function textWidth(text, font, size, spacing) {
    var list = codes(text), table = WIDTHS[font], total = 0;
    list.forEach(function (c) { total += (table[c - 32] || 0); });
    return total * size / 1000 + (list.length > 1 ? (list.length - 1) * (spacing || 0) : 0);
  }

  function pdfString(list) {
    return '(' + list.map(function (c) {
      if (c === 40 || c === 41 || c === 92) return '\\' + String.fromCharCode(c);
      if (c < 32 || c > 126) return '\\' + ('00' + c.toString(8)).slice(-3);
      return String.fromCharCode(c);
    }).join('') + ')';
  }

  function num(n) { return (Math.round(n * 1000) / 1000).toString(); }

  function rgb(hex) {
    var h = String(hex).replace('#', '');
    return [0, 2, 4].map(function (i) { return parseInt(h.substr(i, 2), 16) / 255; });
  }
  function colorOps(hex, stroke) {
    return rgb(hex).map(num).join(' ') + (stroke ? ' RG' : ' rg');
  }
  function mixWhite(hex, pct) {   /* xcolor "color!pct": pct% colour + rest white */
    var c = rgb(hex).map(function (v) { return Math.round((v * pct + (1 - pct)) * 255); });
    return '#' + c.map(function (v) { return ('0' + v.toString(16)).slice(-2); }).join('');
  }
  function mix(a, b, pct) {       /* pct% of a + rest b */
    var x = rgb(a), y = rgb(b);
    return '#' + x.map(function (v, i) {
      return ('0' + Math.round((v * pct + y[i] * (1 - pct)) * 255).toString(16)).slice(-2);
    }).join('');
  }

  /* ---------- tiny PDF writer (origin top-left, y grows downward) ---------- */
  function Writer() { this.pages = []; this.cur = null; }
  Writer.prototype.page = function (w, h) {
    this.cur = { w: w, h: h, ops: [] };
    this.pages.push(this.cur);
    return this;
  };
  Writer.prototype.op = function (s) { this.cur.ops.push(s); return this; };
  Writer.prototype.Y = function (y) { return this.cur.h - y; };
  Writer.prototype.fillColor = function (c) { return this.op(colorOps(c, false)); };
  Writer.prototype.strokeColor = function (c) { return this.op(colorOps(c, true)); };
  Writer.prototype.lineWidth = function (w) { return this.op(num(w) + ' w'); };
  function paint(mode) { return mode === 'FS' ? 'B' : mode === 'S' ? 'S' : 'f'; }
  Writer.prototype.rect = function (x, y, w, h, mode) {
    return this.op([x, this.Y(y + h), w, h].map(num).join(' ') + ' re ' + paint(mode));
  };
  Writer.prototype.rrect = function (x, y, w, h, r, mode) {
    var k = 0.5523 * r, X = x, Y1 = this.Y(y + h), Y2 = this.Y(y), x2 = x + w;
    var p = function () { return Array.prototype.map.call(arguments, num).join(' '); };
    return this.op([
      p(X + r, Y1) + ' m', p(x2 - r, Y1) + ' l',
      p(x2 - r + k, Y1, x2, Y1 + r - k, x2, Y1 + r) + ' c', p(x2, Y2 - r) + ' l',
      p(x2, Y2 - r + k, x2 - r + k, Y2, x2 - r, Y2) + ' c', p(X + r, Y2) + ' l',
      p(X + r - k, Y2, X, Y2 - r + k, X, Y2 - r) + ' c', p(X, Y1 + r) + ' l',
      p(X, Y1 + r - k, X + r - k, Y1, X + r, Y1) + ' c', 'h ' + paint(mode)
    ].join('\n'));
  };
  Writer.prototype.circle = function (cx, cy, r, mode) {
    var k = 0.5523 * r, y = this.Y(cy), p = function () { return Array.prototype.map.call(arguments, num).join(' '); };
    return this.op([
      p(cx + r, y) + ' m',
      p(cx + r, y + k, cx + k, y + r, cx, y + r) + ' c',
      p(cx - k, y + r, cx - r, y + k, cx - r, y) + ' c',
      p(cx - r, y - k, cx - k, y - r, cx, y - r) + ' c',
      p(cx + k, y - r, cx + r, y - k, cx + r, y) + ' c', 'h ' + paint(mode)
    ].join('\n'));
  };
  Writer.prototype.line = function (x1, y1, x2, y2) {
    return this.op([x1, this.Y(y1)].map(num).join(' ') + ' m ' + [x2, this.Y(y2)].map(num).join(' ') + ' l S');
  };
  Writer.prototype.poly = function (pts, mode) {
    var self = this;
    return this.op(pts.map(function (p, i) { return num(p[0]) + ' ' + num(self.Y(p[1])) + (i ? ' l' : ' m'); }).join(' ') + ' h ' + paint(mode));
  };
  Writer.prototype.save = function () { return this.op('q'); };
  Writer.prototype.restore = function () { return this.op('Q'); };
  Writer.prototype.clipRect = function (x, y, w, h) {
    return this.op([x, this.Y(y + h), w, h].map(num).join(' ') + ' re W n');
  };
  /* o: font (F1..F4), size, color, align (left|center|right), spacing (extra pt between letters) */
  Writer.prototype.text = function (str, x, y, o) {
    o = o || {};
    var list = codes(str);
    if (!list.length) return this;
    var w = textWidth(str, o.font, o.size, o.spacing);
    var left = o.align === 'center' ? x - w / 2 : o.align === 'right' ? x - w : x;
    return this.op('BT ' + colorOps(o.color || '#000000', false) + ' /' + o.font + ' ' + num(o.size) + ' Tf ' +
      num(o.spacing || 0) + ' Tc ' + num(left) + ' ' + num(this.Y(y)) + ' Td ' + pdfString(list) + ' Tj ET');
  };
  Writer.prototype.output = function (title) {
    var objs = [];
    function add(body) { objs.push(body); return objs.length; }
    add('<< /Type /Catalog /Pages 2 0 R >>');            // 1
    add('');                                              // 2 (pages, filled below)
    ['F1', 'F2', 'F3', 'F4'].forEach(function (key) {      // 3..6
      add('<< /Type /Font /Subtype /Type1 /BaseFont /' + BASE_FONT[key] + ' /Encoding /WinAnsiEncoding >>');
    });
    var fonts = '/Font << /F1 3 0 R /F2 4 0 R /F3 5 0 R /F4 6 0 R >>';
    var kids = [];
    this.pages.forEach(function (pg) {
      var content = pg.ops.join('\n');
      var contentId = objs.length + 2;
      kids.push(objs.length + 1);
      add('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + num(pg.w) + ' ' + num(pg.h) + '] /Resources << ' + fonts +
        ' >> /Contents ' + contentId + ' 0 R >>');
      add('<< /Length ' + content.length + ' >>\nstream\n' + content + '\nendstream');
    });
    objs[1] = '<< /Type /Pages /Kids [' + kids.map(function (k) { return k + ' 0 R'; }).join(' ') + '] /Count ' + kids.length + ' >>';
    var info = add('<< /Title ' + pdfString(codes(title || 'Document')) + ' /Producer (100x ERP) >>');

    var out = '%PDF-1.4\n%âãÏÓ\n', offsets = [];
    objs.forEach(function (body, i) {
      offsets.push(out.length);
      out += (i + 1) + ' 0 obj\n' + body + '\nendobj\n';
    });
    var xref = out.length;
    out += 'xref\n0 ' + (objs.length + 1) + '\n0000000000 65535 f \n' + offsets.map(function (o) {
      return ('0000000000' + o).slice(-10) + ' 00000 n \n';
    }).join('');
    out += 'trailer\n<< /Size ' + (objs.length + 1) + ' /Root 1 0 R /Info ' + info + ' 0 R >>\nstartxref\n' + xref + '\n%%EOF\n';
    var bytes = new Uint8Array(out.length);
    for (var i = 0; i < out.length; i++) bytes[i] = out.charCodeAt(i) & 0xff;
    return bytes;
  };

  /* ---------- shared helpers ---------- */
  var CM = 28.346457;
  function cm(v) { return v * CM; }
  var NAVY = '#14294F', MAIN = '#1F3B73', GOLD = '#C9A227', PAPER = '#FBF8EF', INK = '#26324D', MUTE = '#6B7690';

  function fitSize(text, font, size, min, maxWidth, spacing) {
    while (size > min && textWidth(text, font, size, spacing) > maxWidth) size -= 0.5;
    return size;
  }

  /* runs: [{t: text, f: 'F1'..'F4'}] -> lines of runs that fit `width` (word wrap, long words broken). */
  function wrapRuns(runs, width, size) {
    var lines = [[]], used = 0;
    function put(piece, font) {
      var w = textWidth(piece, font, size);
      var line = lines[lines.length - 1];
      if (used + w > width + 0.01 && used > 0) {
        if (/^\s+$/.test(piece)) return;                 // swallow the space at a wrap
        lines.push([]); used = 0; line = lines[lines.length - 1];
      }
      if (w > width) {                                    // a single over-long word: break by characters
        var buf = '';
        Array.from(piece).forEach(function (ch) {
          if (textWidth(buf + ch, font, size) > width && buf) { line.push({ t: buf, f: font }); lines.push([]); line = lines[lines.length - 1]; buf = ''; }
          buf += ch;
        });
        piece = buf; w = textWidth(buf, font, size);
        used = 0;
      }
      line.push({ t: piece, f: font }); used += w;
    }
    runs.forEach(function (run) {
      String(run.t).split(/(\s+)/).forEach(function (piece) { if (piece !== '') put(piece, run.f); });
    });
    return lines;
  }

  function drawRunLine(w, line, x, y, size, color, align, width) {
    var total = 0;
    line.forEach(function (r) { total += textWidth(r.t, r.f, size); });
    var cx = align === 'center' ? x + (width - total) / 2 : align === 'right' ? x + width - total : x;
    line.forEach(function (r) {
      w.text(r.t, cx, y, { font: r.f, size: size, color: color });
      cx += textWidth(r.t, r.f, size);
    });
  }

  function plural(n, word) { return n + ' ' + word + (n === 1 ? '' : 's'); }

  /* ================= internship certificate (30 x 15 cm) ================= */
  function certificate(d) {
    var W = cm(30), H = cm(15), w = new Writer().page(W, H);

    w.fillColor(PAPER).rect(0, 0, W, H, 'F');

    // left band with soft circles
    w.save().clipRect(0, 0, cm(6.4), H);
    w.fillColor(NAVY).rect(0, 0, cm(6.4), H, 'F');
    w.fillColor(MAIN).circle(0, H, cm(3.8), 'F');
    w.fillColor(mix(MAIN, NAVY, 0.6)).circle(cm(6.4), 0, cm(2.7), 'F');
    w.strokeColor(mixWhite(GOLD, 0.55)).lineWidth(0.5).circle(0, H, cm(4.6), 'S');
    w.strokeColor(mixWhite(GOLD, 0.4)).lineWidth(0.4).circle(cm(6.4), 0, cm(3.5), 'S');
    w.restore();
    w.fillColor(GOLD).rect(cm(6.4), 0, cm(0.18), H, 'F');

    // brand
    var words = String(d.company_name || '').split(' ');
    var big = words.shift() || '';
    var small = words.join(' ').toUpperCase();
    w.text(big, cm(3.2), cm(2.5) + 4, { font: 'F2', size: 36, color: '#FFFFFF', align: 'center' });
    if (small) w.text(small, cm(3.2), cm(2.5) + 24, { font: 'F2', size: 13, color: '#FFFFFF', align: 'center', spacing: 4.5 });
    w.strokeColor(GOLD).lineWidth(0.8).line(cm(1.7), cm(3.9), cm(4.7), cm(3.9));
    w.text(d.company_address, cm(3.2), cm(4.5) + 3, { font: 'F3', size: 7.5, color: '#D0D4DC', align: 'center' });

    // seal
    w.fillColor(GOLD).circle(cm(3.2), cm(7.1), cm(1.3), 'F');
    w.strokeColor(NAVY).lineWidth(1).circle(cm(3.2), cm(7.1), cm(1.17), 'S');
    w.lineWidth(0.4).circle(cm(3.2), cm(7.1), cm(1.03), 'S');
    w.text('100X', cm(3.2), cm(7.1) + 2, { font: 'F2', size: 17, color: NAVY, align: 'center' });
    w.text('CERTIFIED', cm(3.2), cm(7.1) + 14, { font: 'F2', size: 5, color: NAVY, align: 'center', spacing: 1.6 });

    // QR code (links to the verify page)
    var rows = d.qr || [];
    if (rows.length) {
      var n = rows.length, quiet = 3, size = n + 2 * quiet, box = cm(3.4), unit = box / size;
      var qx = cm(1.5), qy = cm(9.3);
      w.fillColor('#FFFFFF').rect(qx, qy, box, box, 'F').fillColor('#000000');
      for (var r = 0; r < n; r++) {
        var c = 0;
        while (c < n) {
          if (rows[r].charAt(c) === '1') {
            var start = c;
            while (c < n && rows[r].charAt(c) === '1') c++;
            w.rect(qx + (quiet + start) * unit, qy + (quiet + r) * unit, (c - start) * unit + 0.15, unit + 0.15, 'F');
          } else c++;
        }
      }
      w.text('Scan to verify', cm(3.2), cm(12.85) + 8, { font: 'F1', size: 7, color: '#FFFFFF', align: 'center' });
    }

    // frame
    w.strokeColor(GOLD).lineWidth(1.2).rect(cm(7.1), cm(0.7), cm(22.2), cm(13.6), 'S');
    w.strokeColor(mixWhite(GOLD, 0.6)).lineWidth(0.4).rect(cm(7.3), cm(0.9), cm(21.8), cm(13.2), 'S');
    w.fillColor(GOLD);
    [[7.1, 0.7], [29.3, 0.7], [7.1, 14.3], [29.3, 14.3]].forEach(function (p) { w.circle(cm(p[0]), cm(p[1]), cm(0.14), 'F'); });

    // heading
    var cx = cm(18.2);
    w.text('CERTIFICATE', cx, cm(2.3) + 14, { font: 'F2', size: 40, color: NAVY, align: 'center', spacing: 7 });
    w.text('OF INTERNSHIP COMPLETION', cx, cm(3.5) + 3.5, { font: 'F1', size: 10, color: GOLD, align: 'center', spacing: 1.8 });
    w.strokeColor(GOLD).lineWidth(0.8).line(cm(14.4), cm(4.1), cm(17.8), cm(4.1)).line(cm(18.6), cm(4.1), cm(22.0), cm(4.1));
    w.fillColor(GOLD).poly([[cx, cm(3.96)], [cm(18.34), cm(4.1)], [cx, cm(4.24)], [cm(18.06), cm(4.1)]], 'F');

    // recipient
    w.text('This certificate is proudly presented to', cx, cm(4.85) + 4, { font: 'F3', size: 11, color: MUTE, align: 'center' });
    var nameSize = fitSize(d.name, 'F4', 34, 14, cm(20));
    w.text(d.name, cx, cm(5.95) + nameSize * 0.32, { font: 'F4', size: nameSize, color: NAVY, align: 'center' });
    w.strokeColor(GOLD).lineWidth(0.8).line(cm(11.2), cm(6.75), cm(25.2), cm(6.75));

    // statement (designation and company in bold)
    var runs = [
      { t: 'for successfully completing an internship as ', f: 'F1' }, { t: d.designation, f: 'F2' },
      { t: ' at ', f: 'F1' }, { t: d.company_name, f: 'F2' }, { t: '.', f: 'F1' }
    ];
    var size = 12.5, maxW = cm(19.5);
    function runsWidth(s) { return runs.reduce(function (a, r) { return a + textWidth(r.t, r.f, s); }, 0); }
    while (size > 8 && runsWidth(size) > maxW) size -= 0.5;
    drawRunLine(w, runs, cm(18.2) - maxW / 2, cm(7.75) + 4, size, INK, 'center', maxW);

    // three boxes: duration, started, completed
    [[11.2, d.span, 'DURATION'], [18.2, d.start, 'STARTED'], [25.2, d.end, 'COMPLETED']].forEach(function (b) {
      var bx = cm(b[0]) - cm(3), by = cm(9.6) - cm(0.8);
      w.fillColor('#FFFFFF').strokeColor(GOLD).lineWidth(0.6).rrect(bx, by, cm(6), cm(1.6), 5, 'FS');
      var vs = fitSize(b[1], 'F2', 15, 8, cm(5.6));
      w.text(b[1], cm(b[0]), cm(9.6) - 1.5, { font: 'F2', size: vs, color: NAVY, align: 'center' });
      w.text(b[2], cm(b[0]), cm(9.6) + 12, { font: 'F1', size: 6.5, color: MUTE, align: 'center', spacing: 1.2 });
    });

    // closing line
    var closing = 'We are confident in ' + d.name + '’s continued success and wish them the very best.';
    var cs = fitSize(closing, 'F3', 11, 7, cm(19.5));
    w.text(closing, cx, cm(11.3) + 3.5, { font: 'F3', size: cs, color: MUTE, align: 'center' });

    // signature and certificate id
    w.strokeColor(INK).lineWidth(0.5).line(cm(8.7), cm(12.5), cm(13.7), cm(12.5)).line(cm(22.7), cm(12.5), cm(27.7), cm(12.5));
    w.text(d.signatory_name, cm(11.2), cm(12.6) + 11, { font: 'F2', size: 10, color: INK, align: 'center' });
    w.text(d.signatory_title, cm(11.2), cm(12.6) + 21, { font: 'F1', size: 7, color: INK, align: 'center' });
    w.text('Certificate ID', cm(25.2), cm(12.6) + 11, { font: 'F2', size: 10, color: INK, align: 'center' });
    w.text(d.ref, cm(25.2), cm(12.6) + 21, { font: 'F1', size: 7, color: INK, align: 'center' });
    w.text('Issued on ' + d.issued_on, cm(25.2), cm(12.6) + 29, { font: 'F1', size: 5.5, color: INK, align: 'center' });

    return w.output('Internship certificate - ' + d.name);
  }

  /* ================= experience letter (A4, every assigned duty listed) ================= */
  function letter(d) {
    var W = 595.276, H = 841.89, M = cm(2.2), width = W - 2 * M, bottom = H - M;
    var w = new Writer().page(W, H), y = M;
    var BODY = 11, LEAD = 13.6, GAP = 7;

    function ensure(h) {
      if (y + h > bottom) { w.page(W, H); y = M; }
    }
    function paragraph(runs, o) {
      o = o || {};
      var size = o.size || BODY, lead = o.lead || LEAD, indent = o.indent || 0;
      var lines = wrapRuns(runs, width - indent, size);
      lines.forEach(function (line, i) {
        ensure(lead);
        drawRunLine(w, line, M + indent, y + size * 0.8, size, o.color || '#000000', o.align || 'left', width - indent);
        y += lead;
        if (i === 0 && o.afterFirst) o.afterFirst(y - lead + size * 0.8);
      });
      y += o.gap === undefined ? GAP : o.gap;
    }
    function bullets(items, color) {
      items.forEach(function (text) {
        var lines = wrapRuns(Array.isArray(text) ? text : [{ t: text, f: 'F1' }], width - 40, BODY);
        ensure(LEAD * Math.min(lines.length, 2));
        w.fillColor('#000000').circle(M + 24, y + BODY * 0.55, 1.5, 'F');
        lines.forEach(function (line) {
          ensure(LEAD);
          drawRunLine(w, line, M + 40, y + BODY * 0.8, BODY, color || '#000000', 'left', width - 40);
          y += LEAD;
        });
        y += 2;
      });
      y += GAP - 2;
    }

    // letterhead
    w.text(String(d.company_name).toUpperCase(), W / 2, y + 20, { font: 'F2', size: 24, color: MAIN, align: 'center', spacing: 5 });
    y += 32;
    w.text(d.company_address, W / 2, y + 8, { font: 'F3', size: 10, color: '#000000', align: 'center' });
    y += 18;
    w.strokeColor(MAIN).lineWidth(0.8).line(M, y, W - M, y);
    y += 14;

    w.text(d.issued_on, W - M, y + 9, { font: 'F1', size: BODY, color: '#000000', align: 'right' });
    y += 28;

    w.text('To Whom It May Concern', M, y + 12, { font: 'F2', size: 14.4, color: '#000000' });
    y += 28;

    var dept = d.department && d.role !== 'intern' ? ', in the ' + d.department + ' department,' : '';
    paragraph([
      { t: 'This letter certifies that ', f: 'F1' }, { t: d.name, f: 'F2' }, { t: ' served at ', f: 'F1' },
      { t: d.company_name, f: 'F2' }, { t: ' as ', f: 'F1' }, { t: d.designation, f: 'F2' },
      { t: dept + ' from ' + d.start + ' to ' + d.end + ', a period of ' + d.span + '.', f: 'F1' }
    ]);

    var items = String(d.description || '').split(/\r?\n/).map(function (s) { return s.trim(); }).filter(Boolean);
    paragraph([{ t: 'During this tenure, ' + d.name + ' worked closely with our team on agentic AI systems.' +
      (items.length ? ' Key responsibilities included:' : ''), f: 'F1' }], { gap: items.length ? 3 : GAP });
    if (items.length) bullets(items);

    var tasks = d.assigned_tasks || [];
    if (tasks.length) {
      ensure(LEAD * 3);
      paragraph([{ t: 'Duties and projects assigned', f: 'F2' }], { color: MAIN, gap: 3 });
      bullets(tasks.map(function (t) { return t.title; }));
      if (d.assigned_more) {
        paragraph([{ t: 'and ' + plural(d.assigned_more, 'other assignment') + '.', f: 'F3' }], { indent: 40 });
      }
    }

    paragraph([{ t: 'We wish ' + d.name + ' every success in future endeavours.', f: 'F1' }], { gap: 12 });

    var note = 'For verification of this letter (reference ' + d.ref + '), please contact ' + d.hr_email +
      (d.verify_url ? ' or visit ' + d.verify_url : '') + '.';
    paragraph([{ t: note, f: 'F1' }], { size: 9, lead: 11.5, color: '#5B6478', gap: 8 });

    ensure(86);
    y += 28;
    w.strokeColor('#000000').lineWidth(0.4).line(M, y, M + cm(6), y);
    y += 14;
    w.text(d.signatory_name, M, y, { font: 'F2', size: BODY, color: '#000000' });
    w.text(d.signatory_title, M, y + LEAD, { font: 'F1', size: BODY, color: '#000000' });
    w.text(d.company_name, M, y + 2 * LEAD, { font: 'F1', size: BODY, color: '#000000' });

    return w.output('Experience letter - ' + d.name);
  }

  function build(d) {
    return d.kind === 'internship_certificate' ? certificate(d) : letter(d);
  }

  root.DocPdf = { build: build, textWidth: textWidth };
})(typeof window !== 'undefined' ? window : globalThis);
