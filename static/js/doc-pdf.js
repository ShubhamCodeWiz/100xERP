/* Built-in PBC-Grade PDF renderer (Zero-dependency fallback).
   Uses Helvetica / Helvetica-Bold for a crisp modern tech look matching doc-latex.js. */
(function (root) {
  'use strict';

  var WIDTHS = {
    F1: [278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584,750,556,750,222,556,333,1000,556,556,333,1000,667,333,1000,750,611,750,750,222,222,333,333,350,556,1000,333,1000,500,333,944,750,500,667,278,333,556,556,556,556,260,556,333,737,370,556,584,333,737,552,400,549,333,333,333,576,537,278,333,333,365,556,834,834,834,611,667,667,667,667,667,667,1000,722,667,667,667,667,278,278,278,278,722,722,778,778,778,778,778,584,778,722,722,722,722,667,667,611,556,556,556,556,556,556,889,500,556,556,556,556,278,278,278,278,556,556,556,556,556,556,556,549,611,556,556,556,556,500,556,500],
    F2: [278,333,474,556,556,889,722,238,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,333,333,584,584,584,611,975,722,722,722,722,667,611,778,722,278,556,722,611,833,722,778,667,778,722,667,611,722,667,944,667,667,611,333,278,333,584,556,333,556,611,556,611,556,333,611,611,278,278,556,278,889,611,611,611,611,389,556,333,611,556,778,556,556,500,389,280,389,584,750,556,750,278,556,500,1000,556,556,333,1000,667,333,1000,750,611,750,750,278,278,500,500,350,556,1000,333,1000,556,333,944,750,500,667,278,333,556,556,556,556,280,556,333,737,370,556,584,333,737,552,400,549,333,333,333,576,556,278,333,333,365,556,834,834,834,611,722,722,722,722,722,722,1000,722,667,667,667,667,278,278,278,278,722,722,778,778,778,778,778,584,778,722,722,722,722,667,667,611,556,556,556,556,556,556,889,556,556,556,556,556,278,278,278,278,611,611,611,611,611,611,611,549,611,611,611,611,611,556,611,556]
  };
  WIDTHS.F3 = WIDTHS.F1;
  WIDTHS.F4 = WIDTHS.F2;
  var BASE_FONT = { F1: 'Helvetica', F2: 'Helvetica-Bold', F3: 'Helvetica-Oblique', F4: 'Helvetica-BoldOblique' };
  var CP1252 = { 0x2018: 0x91, 0x2019: 0x92, 0x201c: 0x93, 0x201d: 0x94, 0x2013: 0x96, 0x2014: 0x97, 0x2022: 0x95, 0x2026: 0x85 };

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
    var list = codes(text), table = WIDTHS[font] || WIDTHS.F1, total = 0;
    list.forEach(function (c) { total += (table[c - 32] || 500); });
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
  function colorOps(hex, stroke) { return rgb(hex).map(num).join(' ') + (stroke ? ' RG' : ' rg'); }
  function paint(mode) { return mode === 'FS' ? 'B' : mode === 'S' ? 'S' : 'f'; }

  function Writer() { this.pages = []; this.cur = null; }
  Writer.prototype.page = function (w, h) { this.cur = { w: w, h: h, ops: [] }; this.pages.push(this.cur); return this; };
  Writer.prototype.op = function (s) { this.cur.ops.push(s); return this; };
  Writer.prototype.Y = function (y) { return this.cur.h - y; };
  Writer.prototype.fillColor = function (c) { return this.op(colorOps(c, false)); };
  Writer.prototype.strokeColor = function (c) { return this.op(colorOps(c, true)); };
  Writer.prototype.lineWidth = function (w) { return this.op(num(w) + ' w'); };
  Writer.prototype.rect = function (x, y, w, h, mode) {
    return this.op([x, this.Y(y + h), w, h].map(num).join(' ') + ' re ' + paint(mode));
  };
  Writer.prototype.line = function (x1, y1, x2, y2) {
    return this.op([x1, this.Y(y1)].map(num).join(' ') + ' m ' + [x2, this.Y(y2)].map(num).join(' ') + ' l S');
  };
  Writer.prototype.text = function (str, x, y, o) {
    o = o || {};
    var list = codes(str);
    if (!list.length) return this;
    var w = textWidth(str, o.font || 'F1', o.size || 10, o.spacing);
    var left = o.align === 'center' ? x - w / 2 : o.align === 'right' ? x - w : x;
    return this.op('BT ' + colorOps(o.color || '#090D16', false) + ' /' + (o.font || 'F1') + ' ' + num(o.size || 10) + ' Tf ' +
      num(o.spacing || 0) + ' Tc ' + num(left) + ' ' + num(this.Y(y)) + ' Td ' + pdfString(list) + ' Tj ET');
  };
  Writer.prototype.output = function (title) {
    var objs = [];
    function add(body) { objs.push(body); return objs.length; }
    add('<< /Type /Catalog /Pages 2 0 R >>');
    add('');
    ['F1', 'F2', 'F3', 'F4'].forEach(function (key) {
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
    objs.forEach(function (body, i) { offsets.push(out.length); out += (i + 1) + ' 0 obj\n' + body + '\nendobj\n'; });
    var xref = out.length;
    out += 'xref\n0 ' + (objs.length + 1) + '\n0000000000 65535 f \n' + offsets.map(function (o) {
      return ('0000000000' + o).slice(-10) + ' 00000 n \n';
    }).join('');
    out += 'trailer\n<< /Size ' + (objs.length + 1) + ' /Root 1 0 R /Info ' + info + ' 0 R >>\nstartxref\n' + xref + '\n%%EOF\n';
    var bytes = new Uint8Array(out.length);
    for (var i = 0; i < out.length; i++) bytes[i] = out.charCodeAt(i) & 0xff;
    return bytes;
  };

  var CM = 28.346457;
  function cm(v) { return v * CM; }
  var INK = '#090D16', PANEL = '#0F172A', SLATE = '#334155', MUTE = '#64748B', ACCENT = '#2563EB', LINE = '#CBD5E1', BGSOFT = '#F8FAFC';

  function drawQr(w, rows, qx, qy, boxSize) {
    if (!rows || !rows.length) return;
    var n = rows.length, quiet = 2, size = n + 2 * quiet, unit = boxSize / size;
    w.fillColor('#FFFFFF').rect(qx, qy, boxSize, boxSize, 'F').fillColor(INK);
    for (var r = 0; r < n; r++) {
      var c = 0;
      while (c < n) {
        if (rows[r].charAt(c) === '1') {
          var start = c;
          while (c < n && rows[r].charAt(c) === '1') c++;
          w.rect(qx + (quiet + start) * unit, qy + (quiet + r) * unit, (c - start) * unit + 0.12, unit + 0.12, 'F');
        } else c++;
      }
    }
  }

  function wrapRuns(runs, width, size) {
    var lines = [[]], used = 0;
    function put(piece, font) {
      var w = textWidth(piece, font, size);
      var line = lines[lines.length - 1];
      if (used + w > width + 0.01 && used > 0) {
        if (/^\s+$/.test(piece)) return;
        lines.push([]); used = 0; line = lines[lines.length - 1];
      }
      line.push({ t: piece, f: font }); used += w;
    }
    runs.forEach(function (run) {
      String(run.t).split(/(\s+)/).forEach(function (piece) { if (piece !== '') put(piece, run.f); });
    });
    return lines;
  }

  function drawRunLine(w, line, x, y, size, color) {
    var cx = x;
    line.forEach(function (r) {
      w.text(r.t, cx, y, { font: r.f, size: size, color: color });
      cx += textWidth(r.t, r.f, size);
    });
  }

  /* ================= PBC INTERNSHIP CERTIFICATE (A4 Landscape: 29.7 x 21.0 cm) ================= */
  function certificate(d) {
    var W = cm(29.7), H = cm(21.0), w = new Writer().page(W, H);

    w.fillColor('#FFFFFF').rect(0, 0, W, H, 'F');
    w.fillColor(PANEL).rect(0, 0, cm(7.2), H, 'F');
    w.fillColor(ACCENT).rect(cm(7.2), 0, cm(0.12), H, 'F');

    w.text(String(d.company_name).toUpperCase(), cm(0.9), cm(2.1), { font: 'F2', size: 20, color: '#FFFFFF', spacing: 1.2 });
    w.text(d.company_address, cm(0.9), cm(2.7), { font: 'F1', size: 9, color: LINE });
    w.strokeColor('#1E293B').lineWidth(0.6).line(0, cm(3.6), cm(7.2), cm(3.6));

    var meta = [
      ['CREDENTIAL ID', d.ref],
      ['ISSUED DATE', d.issued_on],
      ['TENURE DURATION', d.span],
      ['PERIOD', d.start + ' - ' + d.end],
      ['STATUS', 'Verified Record']
    ];
    var my = cm(4.6);
    meta.forEach(function (m) {
      w.text(m[0], cm(0.9), my, { font: 'F2', size: 7, color: MUTE, spacing: 0.8 });
      w.text(m[1], cm(0.9), my + 12, { font: 'F2', size: 9.5, color: '#F8FAFC' });
      my += cm(1.65);
    });

    drawQr(w, d.qr, cm(0.9), cm(14.5), cm(3.1));
    w.text('Cryptographic Verification', cm(0.9), cm(18.2), { font: 'F2', size: 7.5, color: '#FFFFFF' });
    w.text('Scan QR to verify authenticity.', cm(0.9), cm(18.6), { font: 'F1', size: 7, color: MUTE });

    // Right Main Content Area
    w.strokeColor(LINE).lineWidth(0.8).rect(cm(8.2), cm(1.1), cm(20.4), cm(18.8), 'S');
    w.fillColor(INK).rect(cm(8.2), cm(1.1), cm(4.3), cm(0.12), 'F');

    w.text('OFFICIAL INTERNSHIP CREDENTIAL', cm(9.2), cm(2.4), { font: 'F2', size: 8.5, color: ACCENT, spacing: 1.5 });
    w.text('CERTIFICATE OF INTERNSHIP', cm(9.2), cm(3.5), { font: 'F2', size: 25, color: INK, spacing: 1 });
    w.strokeColor(LINE).lineWidth(0.6).line(cm(9.2), cm(4.1), cm(27.6), cm(4.1));

    w.text('This certifies that', cm(9.2), cm(4.9), { font: 'F1', size: 10.5, color: MUTE });
    w.text(d.name, cm(9.2), cm(6.1), { font: 'F2', size: 24, color: INK });

    var stmt = wrapRuns([
      { t: 'has successfully completed an engineering and product internship as ', f: 'F1' },
      { t: d.designation, f: 'F2' },
      { t: ' at ', f: 'F1' },
      { t: d.company_name, f: 'F2' },
      { t: ' from ' + d.start + ' to ' + d.end + '.', f: 'F1' }
    ], cm(18.2), 11);
    var sy = cm(7.2);
    stmt.forEach(function (line) { drawRunLine(w, line, cm(9.2), sy, 11, SLATE); sy += 15; });

    // Deliverables Box
    w.fillColor(BGSOFT).strokeColor(LINE).lineWidth(0.6).rect(cm(9.2), cm(9.0), cm(18.4), cm(6.0), 'FS');
    w.fillColor(ACCENT).rect(cm(9.2), cm(9.0), cm(0.12), cm(6.0), 'F');
    w.text('KEY PROJECTS & TECHNICAL CONTRIBUTIONS', cm(9.7), cm(9.7), { font: 'F2', size: 8, color: INK, spacing: 0.8 });

    var ty = cm(10.5);
    var tasks = (d.assigned_tasks || []).slice(0, 5);
    if (tasks.length) {
      tasks.forEach(function (t) {
        w.text('•  ' + t.title, cm(9.8), ty, { font: 'F1', size: 9.5, color: SLATE });
        ty += 15;
      });
    } else {
      w.text('•  Contributed to core engineering workflows and product deliverables.', cm(9.8), ty, { font: 'F1', size: 9.5, color: SLATE });
    }

    // Signatory
    w.strokeColor(INK).lineWidth(0.7).line(cm(9.2), cm(17.4), cm(15.2), cm(17.4));
    w.text(d.signatory_name, cm(9.2), cm(18.0), { font: 'F2', size: 10.5, color: INK });
    w.text(d.signatory_title, cm(9.2), cm(18.5), { font: 'F1', size: 8.5, color: SLATE });
    w.text(d.company_name + '  ·  ' + d.hr_email, cm(9.2), cm(19.0), { font: 'F1', size: 7.5, color: MUTE });

    w.strokeColor(LINE).lineWidth(0.8).rect(cm(22.2), cm(16.6), cm(5.4), cm(2.3), 'S');
    w.text('ISSUING AUTHORITY', cm(22.6), cm(17.2), { font: 'F2', size: 6.5, color: MUTE, spacing: 0.8 });
    w.text(String(d.company_name).toUpperCase(), cm(22.6), cm(17.8), { font: 'F2', size: 10, color: INK });
    w.text('REF: ' + d.ref, cm(22.6), cm(18.4), { font: 'F1', size: 7.5, color: SLATE });

    return w.output('Internship Certificate - ' + d.name);
  }

  /* ================= PBC EXPERIENCE LETTER (A4 Portrait) ================= */
  function letter(d) {
    var W = 595.276, H = 841.89, M = cm(2.2), width = W - 2 * M;
    var w = new Writer().page(W, H), y = cm(2.0);

    w.fillColor(INK).rect(0, 0, W, cm(0.22), 'F');
    w.fillColor(ACCENT).rect(0, cm(0.22), cm(6.0), cm(0.1), 'F');

    w.text(String(d.company_name).toUpperCase(), M, y, { font: 'F2', size: 19, color: INK, spacing: 1 });
    w.text('REF: ' + d.ref, W - M, y - 4, { font: 'F2', size: 8, color: MUTE, align: 'right' });
    y += 14;
    w.text(d.company_address + '  ·  Official Employment Record', M, y, { font: 'F1', size: 9, color: MUTE });
    w.text('DATE: ' + d.issued_on, W - M, y, { font: 'F1', size: 8, color: MUTE, align: 'right' });
    y += 14;
    w.strokeColor(LINE).lineWidth(0.8).line(M, y, W - M, y);
    y += 26;

    w.text('STATEMENT OF EMPLOYMENT & EXPERIENCE', M, y, { font: 'F2', size: 13, color: INK, spacing: 0.5 });
    y += 20;

    // Compact identity and tenure summary.
    var cols = [M, M + width * .27, M + width * .53, M + width * .78];
    var labels = ['EMPLOYEE NAME', 'DESIGNATION', 'TENURE PERIOD', 'TOTAL DURATION'];
    var values = [d.name, d.designation, d.start + ' - ' + d.end, d.span];
    w.fillColor(BGSOFT).strokeColor(LINE).lineWidth(.6).rect(M, y, width, 58, 'FS');
    for (var i = 0; i < labels.length; i++) {
      w.text(labels[i], cols[i] + 10, y + 16, { font: 'F2', size: 6.5, color: MUTE, spacing: .65 });
      w.text(values[i], cols[i] + 10, y + 34, { font: 'F2', size: i === 0 ? 10 : 8.5, color: INK });
      if (i) w.strokeColor(LINE).lineWidth(.45).line(cols[i], y + 10, cols[i], y + 48);
    }
    y += 84;

    function paragraph(text, font, size, color, gap) {
      var lines = wrapRuns([{ t: text, f: font || 'F1' }], width, size || 10.5);
      lines.forEach(function (line) { drawRunLine(w, line, M, y, size || 10.5, color || SLATE); y += (size || 10.5) * 1.55; });
      y += gap || 8;
    }

    paragraph('This record formally certifies that ' + d.name + ' was employed with ' + d.company_name +
      ' in the capacity of ' + d.designation + (d.department ? ' (' + d.department + ' Department)' : '') +
      ' from ' + d.start + ' to ' + d.end + '.', 'F1', 10.5, SLATE, 10);
    paragraph('Throughout this engagement, ' + d.name + ' contributed to core engineering and product initiatives within our Agentic AI division, demonstrating high technical ownership, reliability, and professional ethics.', 'F1', 10.5, SLATE, 12);

    var responsibilities = String(d.description || '').split(/\r?\n/).map(function (item) { return item.trim(); }).filter(Boolean);
    if (responsibilities.length) {
      w.text('ROLE SCOPE & RESPONSIBILITIES', M, y, { font: 'F2', size: 8, color: SLATE, spacing: .7 });
      y += 17;
      responsibilities.slice(0, 7).forEach(function (item) {
        paragraph('•  ' + item, 'F1', 9.5, SLATE, 2);
      });
      y += 6;
    }

    var tasks = d.assigned_tasks || [];
    if (tasks.length && y < H - 190) {
      w.text('KEY DELIVERABLES & PROJECTS EXECUTED', M, y, { font: 'F2', size: 8, color: SLATE, spacing: .7 });
      y += 17;
      tasks.slice(0, 10).forEach(function (task) {
        paragraph('•  ' + task.title, 'F1', 9.5, SLATE, 2);
      });
      if (d.assigned_more) paragraph('+ ' + d.assigned_more + ' additional project' + (d.assigned_more === 1 ? '' : 's') + ' logged in ERP.', 'F3', 8.5, MUTE, 4);
    }

    var footerY = Math.max(y + 18, H - 135);
    w.strokeColor(LINE).lineWidth(.6).line(M, footerY, W - M, footerY);
    w.strokeColor(INK).lineWidth(.65).line(M, footerY + 45, M + 148, footerY + 45);
    w.text(d.signatory_name, M, footerY + 62, { font: 'F2', size: 10, color: INK });
    w.text(d.signatory_title, M, footerY + 77, { font: 'F1', size: 8.5, color: SLATE });
    w.text(d.company_name + '  ·  ' + d.hr_email, M, footerY + 91, { font: 'F1', size: 7.5, color: MUTE });
    if (d.qr && d.qr.length) {
      drawQr(w, d.qr, W - M - 58, footerY + 18, 52);
      w.text('Scan to verify this record', W - M, footerY + 82, { font: 'F1', size: 6.5, color: MUTE, align: 'right' });
    }
    return w.output('Experience Letter - ' + d.name);
  }

  function build(d) {
    return d.kind === 'internship_certificate' ? certificate(d) : letter(d);
  }

  root.DocPdf = { build: build };
})(typeof window !== 'undefined' ? window : globalThis);
