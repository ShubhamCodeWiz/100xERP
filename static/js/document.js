/* Document page. The server only supplies the facts (/document-data); the LaTeX is written
   here (doc-latex.js) and turned into a PDF here (doc-compile.js), with fallbacks.
   The .tex and the .pdf downloads always come from the same generated source and data. */
(async function () {
  'use strict';
  var ERP = window.ERP;
  var $ = function (id) { return document.getElementById(id); };

  var me = await ERP.requireAuth();
  var userId = new URLSearchParams(location.search).get('user') || me.id;
  $('doc-back').href = '/performance?user=' + encodeURIComponent(userId);

  var els = {
    status: $('gen-status'), notice: $('gen-notice'), title: $('gen-title'), frame: $('viewer'),
    holder: $('gen-placeholder'), source: $('tex-source'),
    pdf: $('gen-pdf'), tex: $('gen-tex'), open: $('gen-open'), retry: $('gen-retry'), texlive: $('gen-texlive')
  };
  var buttons = [els.pdf, els.tex, els.open, els.retry];

  function setStatus(message, kind) {
    els.status.textContent = message;
    els.status.className = 'gen-status' + (kind ? ' ' + kind : '');
  }
  function lock(on) { buttons.forEach(function (b) { b.disabled = on; }); }

  /* ---------- facts from the backend (one retry on a dropped connection) ---------- */
  var data;
  try {
    try {
      data = await ERP.api('/api/performance/' + encodeURIComponent(userId) + '/document-data');
    } catch (err) {
      if (err.status !== 0) throw err;
      data = await ERP.api('/api/performance/' + encodeURIComponent(userId) + '/document-data');
    }
  } catch (err) {
    setStatus('Could not load the data for this document.', 'error');
    ERP.report(err, 'Could not prepare the document');
    return;
  }

  var isCert = data.kind === 'internship_certificate';
  var label = isCert ? 'Internship certificate' : 'Experience letter';
  var baseName = (isCert ? 'Internship-Certificate' : 'Experience-Letter') + '-' +
    (String(data.name).replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'document');
  els.title.textContent = label + ' · ' + data.name;
  document.title = els.title.textContent;

  var tex;
  try {
    tex = window.DocLatex.build(data);
  } catch (err) {
    setStatus('The document could not be written.', 'error');
    ERP.report(err, 'Could not prepare the document');
    return;
  }
  els.source.value = tex;

  /* ---------- helpers ---------- */
  function saveBlob(blob, filename) {
    var url = URL.createObjectURL(blob);
    var link = ERP.h('a', { href: url, download: filename });
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 15000);
  }

  var current = null;      // { bytes, via, exact, url }
  var running = null;

  function show(result) {
    if (current && current.url) URL.revokeObjectURL(current.url);
    result.url = URL.createObjectURL(new Blob([result.bytes], { type: 'application/pdf' }));
    current = result;
    els.holder.hidden = true;
    els.frame.hidden = false;
    els.frame.src = result.url;
    els.retry.textContent = result.exact ? 'Regenerate PDF' : 'Try LaTeX again';
    els.texlive.hidden = result.exact;
    els.notice.hidden = result.exact;
    if (result.exact) {
      setStatus('Ready. Compiled from the LaTeX source by ' + result.via + '.', 'ok');
    } else {
      els.notice.textContent = 'The online LaTeX compilers could not be reached, so this PDF was drawn by the built-in renderer. ' +
        'It has the same design and the same content. Press “Try LaTeX again” later, or “Open via texlive.net” to compile the source yourself.';
      setStatus('Ready (built-in renderer).', 'ok');
    }
  }

  /* One generation at a time; every caller gets the same result. */
  function generate() {
    if (running) return running;
    lock(true);
    setStatus('Preparing the PDF…');
    running = window.DocCompile.compile(tex, {
      data: data,
      token: ERP.token.get,
      onStatus: function (m) { setStatus(m); }
    }).then(function (result) {
      show(result);
      return result;
    }).catch(function (err) {
      setStatus('The PDF could not be produced. The .tex file can still be downloaded.', 'error');
      ERP.report(err, 'Could not produce the PDF');
      return null;
    }).then(function (result) {
      running = null;
      lock(false);
      els.open.disabled = !current;
      return result;
    });
    return running;
  }

  /* ---------- buttons ---------- */
  els.pdf.addEventListener('click', async function () {
    var result = current || await generate();
    if (result) saveBlob(new Blob([result.bytes], { type: 'application/pdf' }), baseName + '.pdf');
  });
  els.tex.addEventListener('click', function () {
    saveBlob(new Blob([tex], { type: 'text/plain;charset=utf-8' }), baseName + '.tex');
  });
  els.open.addEventListener('click', function () {
    if (current) window.open(current.url, '_blank');
  });
  els.retry.addEventListener('click', function () { generate(); });

  /* Manual route, same technique as the standalone page: POST the source to texlive.net in a new tab. */
  els.texlive.addEventListener('click', function () {
    var form = document.createElement('form');
    form.method = 'POST';
    form.action = 'https://texlive.net/cgi-bin/latexcgi';
    form.target = '_blank';
    form.enctype = 'multipart/form-data';
    form.hidden = true;
    [['filename[]', 'document.tex'], ['filecontents[]', tex], ['engine', 'pdflatex'], ['return', 'pdf']].forEach(function (pair) {
      var input = document.createElement('input');
      input.type = 'hidden';
      input.name = pair[0];
      input.value = pair[1];
      form.appendChild(input);
    });
    document.body.appendChild(form);
    form.submit();
    form.remove();
  });

  els.tex.disabled = false;
  generate();
})();
