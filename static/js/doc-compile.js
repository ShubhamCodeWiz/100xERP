/* Fast local PDF rendering plus opt-in LaTeX HD compilation.
   Exposes window.DocCompile.renderFast(data) and compileHd(tex, options).

     1. renderFast() -> built-in renderer: immediate, offline and zero-network
     2. browser -> texlive.net, latex.ytotech.com and latexonline.cc, all at once; first valid PDF wins
        (needs those services to allow cross-origin reads, which they may not)
     3. browser -> this server (/api/latex/compile), which relays the same source to the services
        server-to-server, where CORS does not apply
     4. built-in renderer (doc-pdf.js): final fallback if an explicit HD request fails

   `exact` is true when the PDF was compiled from the LaTeX source (steps 1-2).
   Nothing is trusted until its first bytes read "%PDF-". */
(function (root) {
  'use strict';

  var DIRECT_TIMEOUT = 25000;
  var RELAY_TIMEOUT = 110000;
  var LATEXONLINE_MAX_QUERY = 5500;   // that service takes the source in the URL
  var cache = {};                      // tex source -> compiled bytes (kept for this page view)

  function isPdf(buffer) {
    var b = new Uint8Array(buffer, 0, Math.min(5, buffer.byteLength));
    return b.length === 5 && b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46 && b[4] === 0x2d;
  }

  /* fetch with a timeout; resolves with the PDF bytes or throws a readable Error. */
  async function fetchPdf(url, init, timeout, controllers) {
    var controller = new AbortController();
    controllers.push(controller);
    var timer = setTimeout(function () { controller.abort(); }, timeout);
    try {
      init.signal = controller.signal;
      var res = await fetch(url, init);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      var buffer = await res.arrayBuffer();
      if (!isPdf(buffer)) throw new Error('answered, but not with a PDF (LaTeX error)');
      return new Uint8Array(buffer);
    } catch (err) {
      if (err && err.name === 'AbortError') throw new Error('timed out');
      if (err instanceof TypeError) throw new Error('blocked or unreachable');   // CORS, offline, DNS
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  var DIRECT = [
    {
      name: 'texlive.net',
      run: function (tex, controllers) {
        var form = new FormData();
        form.append('filename[]', 'document.tex');
        form.append('filecontents[]', tex);
        form.append('engine', 'pdflatex');
        form.append('return', 'pdf');
        return fetchPdf('https://texlive.net/cgi-bin/latexcgi', { method: 'POST', body: form }, DIRECT_TIMEOUT, controllers);
      }
    },
    {
      name: 'latex.ytotech.com',
      run: function (tex, controllers) {
        return fetchPdf('https://latex.ytotech.com/builds/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ compiler: 'pdflatex', resources: [{ main: true, content: tex }] })
        }, DIRECT_TIMEOUT, controllers);
      }
    },
    {
      name: 'latexonline.cc',
      run: function (tex, controllers) {
        var query = 'text=' + encodeURIComponent(tex) + '&command=pdflatex';
        if (query.length > LATEXONLINE_MAX_QUERY) return Promise.reject(new Error('document too long for this service'));
        return fetchPdf('https://latexonline.cc/compile?' + query, { method: 'GET' }, DIRECT_TIMEOUT, controllers);
      }
    }
  ];

  /* Resolves with the first success {bytes, via}; rejects only when every candidate failed. */
  function firstSuccess(tex, problems) {
    var controllers = [];
    return new Promise(function (resolve, reject) {
      var left = DIRECT.length, done = false;
      DIRECT.forEach(function (service) {
        Promise.resolve().then(function () { return service.run(tex, controllers); }).then(function (bytes) {
          if (done) return;
          done = true;
          controllers.forEach(function (c) { try { c.abort(); } catch (e) { /* ignore */ } });
          resolve({ bytes: bytes, via: service.name });
        }, function (err) {
          problems.push(service.name + ': ' + (err && err.message ? err.message : err));
          if (!done && --left === 0) reject(new Error('all direct services failed'));
        });
      });
    });
  }

  async function viaServer(tex, token, problems) {
    var headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = 'Bearer ' + token;
    var lastError;
    for (var attempt = 0; attempt < 2; attempt++) {
      try {
        var bytes = await fetchPdf('/api/latex/compile', { method: 'POST', headers: headers, body: JSON.stringify({ tex: tex }) }, RELAY_TIMEOUT, []);
        return { bytes: bytes, via: 'the server (relay)' };
      } catch (err) {
        lastError = err;
        if (!/blocked or unreachable|HTTP 5\d\d|timed out/.test(err.message)) break;   // worth one retry only
      }
    }
    problems.push('server relay: ' + (lastError && lastError.message));
    throw lastError;
  }

  function renderFast(data) {
    if (!root.DocPdf || !data) throw new Error('built-in renderer is not available');
    return { bytes: root.DocPdf.build(data), via: 'the built-in renderer', exact: false, problems: [] };
  }

  async function compileHd(tex, options) {
    options = options || {};
    var say = options.onStatus || function () {};
    var problems = [];

    if (cache[tex]) return { bytes: cache[tex].bytes, via: cache[tex].via, exact: true, problems: [] };

    say('Compiling the LaTeX (trying several services at once)…');
    try {
      var direct = await firstSuccess(tex, problems);
      cache[tex] = direct;
      return { bytes: direct.bytes, via: direct.via, exact: true, problems: problems };
    } catch (e) { /* fall through */ }

    say('Direct compilers unavailable, compiling through the server…');
    try {
      var relayed = await viaServer(tex, options.token && options.token(), problems);
      cache[tex] = relayed;
      return { bytes: relayed.bytes, via: relayed.via, exact: true, problems: problems };
    } catch (e) { /* fall through */ }

    say('LaTeX services unreachable, using the built-in renderer…');
    try {
      var fast = renderFast(options.data);
      fast.problems = problems;
      return fast;
    } catch (err) {
      problems.push('built-in renderer: ' + (err && err.message));
      var failure = new Error('The PDF could not be produced.\n' + problems.join('\n'));
      failure.problems = problems;
      throw failure;
    }
  }

  // `compile` remains an alias for existing callers; startup uses renderFast instead.
  root.DocCompile = { renderFast: renderFast, compileHd: compileHd, compile: compileHd, isPdf: isPdf };
})(typeof window !== 'undefined' ? window : globalThis);
