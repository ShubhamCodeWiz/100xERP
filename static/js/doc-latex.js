/* LaTeX sources for the experience letter and the internship certificate.
   Pure functions (no DOM), so they can be tested in Node. Exposes window.DocLatex.build(d).
   `d` is the JSON returned by /api/performance/{id}/document-data. */
(function (root) {
  'use strict';

  /* ---------- text helpers ---------- */
  var SPECIAL = {
    '\\': '\\textbackslash{}', '&': '\\&', '%': '\\%', '$': '\\$', '#': '\\#', '_': '\\_',
    '{': '\\{', '}': '\\}', '~': '\\textasciitilde{}', '^': '\\textasciicircum{}'
  };
  var EXTRA = '\u2013\u2014\u2018\u2019\u201c\u201d\u2022';

  /* Escape user text for LaTeX; characters pdflatex cannot print become '?'. */
  function esc(text) {
    return Array.from(String(text === null || text === undefined ? '' : text)).map(function (ch) {
      if (Object.prototype.hasOwnProperty.call(SPECIAL, ch)) return SPECIAL[ch];
      if (/[\r\n\t]/.test(ch)) return ' ';
      var code = ch.codePointAt(0);
      if (code >= 32 && code < 0x250 && !(code >= 0x7f && code < 0xa0)) return ch;
      if (EXTRA.indexOf(ch) !== -1) return ch;
      return '?';
    }).join('');
  }

  /* Letter-spaced capitals for headings: "Club" -> C\,L\,U\,B */
  function spaced(text) {
    return Array.from(String(text).toUpperCase()).map(function (ch) {
      return ch === ' ' ? '\\ \\ ' : esc(ch);
    }).join('\\,');
  }

  /* One-pass placeholder replacement, so user text can never be re-substituted. */
  function fill(template, values) {
    return template.replace(/@@([A-Z_0-9]+)@@/g, function (m, key) {
      return Object.prototype.hasOwnProperty.call(values, key) ? values[key] : m;
    });
  }

  function plural(n, word) { return n + ' ' + word + (n === 1 ? '' : 's'); }

  /* ================= experience letter (A4) ================= */
  var LETTER = String.raw`\documentclass[11pt]{article}
\usepackage[a4paper, margin=2.2cm]{geometry}
\usepackage[T1]{fontenc}
\usepackage[utf8]{inputenc}
\usepackage{lmodern}
\usepackage{xcolor}
\usepackage{parskip}
\usepackage{enumitem}
\usepackage{url}
\pagestyle{empty}
\definecolor{main}{HTML}{1F3B73}
\definecolor{mute}{HTML}{5B6478}

\begin{document}

\begin{center}
  {\fontsize{24}{28}\selectfont\bfseries\textcolor{main}{@@BRAND@@}}\\[3pt]
  {\small\itshape @@ADDRESS@@}\\[4pt]
  {\color{main}\rule{\textwidth}{0.8pt}}
\end{center}

\hfill @@ISSUED@@

\vspace{0.3cm}

\noindent{\large\bfseries To Whom It May Concern}

\vspace{0.2cm}

\noindent This letter certifies that \textbf{@@NAME@@} served at \textbf{@@COMPANY@@} as
\textbf{@@DESIGNATION@@}@@DEPARTMENT@@ from @@START@@ to @@END@@, a period of @@SPAN@@.

\noindent During this tenure, @@NAME@@ worked closely with our team on agentic AI systems.@@RESPONSIBILITIES@@

@@TASKS@@

\noindent We wish @@NAME@@ every success in future endeavours.

\vspace{0.2cm}

\noindent{\small\textcolor{mute}{For verification of this letter (reference @@REF@@), please contact
\texttt{@@HR@@}@@VERIFY@@.}}

\vspace{1.2cm}

\noindent
\begin{minipage}{0.5\textwidth}
  \rule{6cm}{0.4pt}\\[3pt]
  {\bfseries @@SIGNATORY@@}\\
  @@SIGNATORY_TITLE@@\\
  @@COMPANY@@
\end{minipage}

\end{document}
`;

  function letter(d) {
    var items = String(d.description || '').split(/\r?\n/).map(function (s) { return s.trim(); }).filter(Boolean);
    var responsibilities = '';
    if (items.length) {
      responsibilities = ' Key responsibilities included:\n\\begin{itemize}[leftmargin=1.4cm, itemsep=2pt]\n' +
        items.map(function (i) { return '  \\item ' + esc(i) + '\n'; }).join('') + '\\end{itemize}';
    }
    var department = d.department && d.role !== 'intern' ? ', in the ' + esc(d.department) + ' department,' : '';

    var tasks = '';
    if (d.assigned_tasks && d.assigned_tasks.length) {
      tasks = '\\noindent{\\bfseries\\textcolor{main}{Duties and projects assigned}}\\nopagebreak\n' +
        '\\begin{itemize}[leftmargin=1.4cm, itemsep=2pt, topsep=3pt]\n' +
        d.assigned_tasks.map(function (x) { return '  \\item ' + esc(x.title) + '\n'; }).join('') +
        (d.assigned_more ? '  \\item[] \\textit{and ' + esc(plural(d.assigned_more, 'other assignment')) + '.}\n' : '') +
        '\\end{itemize}\n';
    }

    var url = String(d.verify_url || '').replace(/[\\{}%#\s]/g, '');
    var verify = url ? ' or visit {\\small\\url{' + url + '}}' : '';

    return fill(LETTER, {
      BRAND: spaced(d.company_name),
      ADDRESS: esc(d.company_address),
      ISSUED: esc(d.issued_on),
      NAME: esc(d.name),
      COMPANY: esc(d.company_name),
      DESIGNATION: esc(d.designation),
      DEPARTMENT: department,
      START: esc(d.start), END: esc(d.end), SPAN: esc(d.span),
      RESPONSIBILITIES: responsibilities,
      TASKS: tasks,
      REF: esc(d.ref),
      HR: esc(d.hr_email),
      VERIFY: verify,
      SIGNATORY: esc(d.signatory_name),
      SIGNATORY_TITLE: esc(d.signatory_title)
    });
  }

  /* ================= internship certificate (30cm x 15cm = 2:1) =================
     Drawn with absolute coordinates: origin = top-left corner, y grows downward (negative). */
  var CERT = String.raw`\documentclass[11pt]{article}
\usepackage[paperwidth=30cm, paperheight=15cm, margin=0pt]{geometry}
\usepackage[T1]{fontenc}
\usepackage[utf8]{inputenc}
\usepackage{lmodern}
\usepackage{xcolor}
\usepackage{tikz}
\pagestyle{empty}
\setlength{\parindent}{0pt}
\setlength{\topskip}{0pt}
\hyphenpenalty=10000 \exhyphenpenalty=10000 \tolerance=9999 \emergencystretch=3em
\definecolor{navy}{HTML}{14294F}
\definecolor{main}{HTML}{1F3B73}
\definecolor{gold}{HTML}{C9A227}
\definecolor{paper}{HTML}{FBF8EF}
\definecolor{ink}{HTML}{26324D}
\definecolor{mute}{HTML}{6B7690}

\begin{document}
\noindent\begin{tikzpicture}[overlay]
  % ---- background
  \fill[paper] (0,0) rectangle (30,-15);

  % ---- left band with soft circles
  \begin{scope}
    \clip (0,0) rectangle (6.4,-15);
    \fill[navy] (0,0) rectangle (6.4,-15);
    \fill[main] (0,-15) circle (3.8);
    \fill[main!60!navy] (6.4,0) circle (2.7);
    \draw[gold!55, line width=0.5pt] (0,-15) circle (4.6);
    \draw[gold!40, line width=0.4pt] (6.4,0) circle (3.5);
  \end{scope}
  \fill[gold] (6.4,0) rectangle (6.58,-15);

  % ---- brand
  \node[text=white, align=center, text width=5.4cm] at (3.2,-2.5)
    {{\fontsize{36}{40}\selectfont\bfseries @@BRAND_BIG@@}@@BRAND_SMALL@@};
  \draw[gold, line width=0.8pt] (1.7,-3.9) -- (4.7,-3.9);
  \node[text=white!80!navy, align=center, text width=5cm] at (3.2,-4.5) {\scriptsize\itshape @@ADDRESS@@};

  % ---- seal
  \fill[gold] (3.2,-7.1) circle (1.3);
  \draw[navy, line width=1pt] (3.2,-7.1) circle (1.17);
  \draw[navy, line width=0.4pt] (3.2,-7.1) circle (1.03);
  \node[text=navy, align=center] at (3.2,-7.1)
    {{\fontsize{17}{19}\selectfont\bfseries 100X}\\[1pt]{\tiny\bfseries C\,E\,R\,T\,I\,F\,I\,E\,D}};

  % ---- QR code
@@QR@@

  % ---- frame
  \draw[gold, line width=1.2pt] (7.1,-0.7) rectangle (29.3,-14.3);
  \draw[gold!60, line width=0.4pt] (7.3,-0.9) rectangle (29.1,-14.1);
  \fill[gold] (7.1,-0.7) circle (0.14);
  \fill[gold] (29.3,-0.7) circle (0.14);
  \fill[gold] (7.1,-14.3) circle (0.14);
  \fill[gold] (29.3,-14.3) circle (0.14);

  % ---- heading
  \node[text=navy] at (18.2,-2.3) {\fontsize{40}{44}\selectfont\bfseries @@TITLE@@};
  \node[text=gold] at (18.2,-3.5) {\fontsize{12}{15}\selectfont\scshape of internship completion};
  \draw[gold, line width=0.8pt] (14.4,-4.1) -- (17.8,-4.1);
  \draw[gold, line width=0.8pt] (18.6,-4.1) -- (22.0,-4.1);
  \fill[gold] (18.2,-3.96) -- (18.34,-4.1) -- (18.2,-4.24) -- (18.06,-4.1) -- cycle;

  % ---- recipient
  \node[text=mute] at (18.2,-4.85) {\fontsize{11}{14}\selectfont\itshape This certificate is proudly presented to};
  \node[text=navy, align=center, text width=20cm] at (18.2,-5.95)
    {\fontsize{@@NAME_SIZE@@}{@@NAME_LEAD@@}\selectfont\bfseries\itshape @@NAME@@};
  \draw[gold, line width=0.8pt] (11.2,-6.75) -- (25.2,-6.75);

  \node[text=ink, align=center, text width=19.5cm] at (18.2,-7.75)
    {\fontsize{@@STMT_SIZE@@}{@@STMT_LEAD@@}\selectfont for successfully completing an internship as \textbf{@@DESIGNATION@@}
     at \textbf{@@COMPANY@@}.};

  % ---- stats
@@STATS@@

  \node[text=mute, align=center, text width=19.5cm] at (18.2,-11.3)
    {\fontsize{@@CLOSE_SIZE@@}{@@CLOSE_LEAD@@}\selectfont\itshape @@CLOSING@@};

  % ---- signature and certificate id
  \draw[ink, line width=0.5pt] (8.7,-12.5) -- (13.7,-12.5);
  \node[anchor=north, text=ink, align=center] at (11.2,-12.6)
    {{\small\bfseries @@SIGNATORY@@}\\[1pt]{\scriptsize @@SIGNATORY_TITLE@@}};
  \draw[ink, line width=0.5pt] (22.7,-12.5) -- (27.7,-12.5);
  \node[anchor=north, text=ink, align=center] at (25.2,-12.6)
    {{\small\bfseries Certificate ID}\\[1pt]{\scriptsize @@REF@@}\\[1pt]{\tiny Issued on @@ISSUED@@}};
\end{tikzpicture}
\end{document}
`;

  var QUIET = 3;
  var QR_CM = 3.4;

  /* QR modules as merged horizontal runs: '1' = dark. */
  function qrBlock(rows) {
    if (!rows || !rows.length) return '';
    var n = rows.length, size = n + 2 * QUIET, out = [];
    for (var r = 0; r < n; r++) {
      var y = QUIET + n - 1 - r, c = 0;
      while (c < n) {
        if (rows[r].charAt(c) === '1') {
          var start = c;
          while (c < n && rows[r].charAt(c) === '1') c++;
          out.push('    \\fill[black] (' + (QUIET + start) + ',' + y + ') rectangle (' + (QUIET + c) + ',' + (y + 1) + ');');
        } else c++;
      }
    }
    var unit = (QR_CM / size).toFixed(5);
    return '  \\begin{scope}[shift={(1.5,-12.7)}, x=' + unit + 'cm, y=' + unit + 'cm]\n' +
      '    \\fill[white] (0,0) rectangle (' + size + ',' + size + ');\n' + out.join('\n') + '\n  \\end{scope}\n' +
      '  \\node[text=white, anchor=north] at (3.2,-12.85) {\\scriptsize Scan to verify};';
  }

  function statBox(x, value, label) {
    var len = String(value).length;
    var size = len > 18 ? 10.5 : len > 13 ? 12.5 : 15;
    return '  \\node[draw=gold, fill=white, rounded corners=5pt, line width=0.6pt, text width=6.0cm, ' +
      'minimum height=1.6cm, align=center] at (' + x + ',-9.6) ' +
      '{{\\fontsize{' + size + '}{' + (size + 3) + '}\\selectfont\\bfseries\\color{navy} ' + esc(value) + '}' +
      '\\\\[3pt]{\\scriptsize\\scshape\\color{mute} ' + esc(label) + '}};';
  }

  function certificate(d) {
    var words = String(d.company_name).split(' ');
    var big = words.shift();
    var small = words.length
      ? '\\\\[2pt]{\\fontsize{13}{16}\\selectfont\\bfseries ' + spaced(words.join(' ')) + '}'
      : '';

    var stats = [
      statBox(11.2, d.span, 'Duration'),
      statBox(18.2, d.start, 'Started'),
      statBox(25.2, d.end, 'Completed')
    ].join('\n');

    var nameLen = String(d.name).length;
    var nameSize = nameLen <= 20 ? 34 : nameLen <= 28 ? 28 : nameLen <= 38 ? 22 : 18;

    var stmtLen = String(d.designation).length + String(d.company_name).length;
    var stmtSize = stmtLen > 62 ? 10.5 : stmtLen > 48 ? 11.5 : 12.5;
    var closeSize = String(d.name).length > 30 ? 9 : String(d.name).length > 22 ? 10 : 11;

    return fill(CERT, {
      STMT_SIZE: String(stmtSize), STMT_LEAD: String(Math.round(stmtSize * 1.4)),
      CLOSE_SIZE: String(closeSize), CLOSE_LEAD: String(closeSize + 3),
      BRAND_BIG: esc(big),
      BRAND_SMALL: small,
      ADDRESS: esc(d.company_address),
      QR: qrBlock(d.qr),
      TITLE: spaced('Certificate'),
      NAME: esc(d.name),
      NAME_SIZE: String(nameSize),
      NAME_LEAD: String(nameSize + 4),
      DESIGNATION: esc(d.designation),
      COMPANY: esc(d.company_name),
      STATS: stats,
      CLOSING: esc('We are confident in ' + d.name + '\u2019s continued success and wish them the very best.'),
      SIGNATORY: esc(d.signatory_name),
      SIGNATORY_TITLE: esc(d.signatory_title),
      REF: esc(d.ref),
      ISSUED: esc(d.issued_on)
    });
  }

  function build(d) {
    return d.kind === 'internship_certificate' ? certificate(d) : letter(d);
  }

  root.DocLatex = { build: build, esc: esc };
})(typeof window !== 'undefined' ? window : globalThis);
