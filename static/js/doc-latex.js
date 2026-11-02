/* Modern PBC-Grade LaTeX generator for Experience Letters & Internship Certificates.
   Uses clean Swiss typography (Helvetica/Sans-serif), slate-black hierarchy, and structured grids. */
(function (root) {
  'use strict';

  var SPECIAL = {
    '\\': '\\textbackslash{}', '&': '\\&', '%': '\\%', '$': '\\$', '#': '\\#', '_': '\\_',
    '{': '\\{', '}': '\\}', '~': '\\textasciitilde{}', '^': '\\textasciicircum{}'
  };
  var EXTRA = '\u2013\u2014\u2018\u2019\u201c\u201d\u2022';

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

  function spaced(text) {
    return Array.from(String(text).toUpperCase()).map(function (ch) {
      return ch === ' ' ? '\\ \\ ' : esc(ch);
    }).join('\\,');
  }

  function fill(template, values) {
    return template.replace(/@@([A-Z_0-9]+)@@/g, function (m, key) {
      return Object.prototype.hasOwnProperty.call(values, key) ? values[key] : m;
    });
  }

  function plural(n, word) { return n + ' ' + word + (n === 1 ? '' : 's'); }

  var QUIET = 2;
  function qrTikz(rows, sizeCm, xCm, yCm) {
    if (!rows || !rows.length) return '';
    var n = rows.length, size = n + 2 * QUIET, out = [];
    for (var r = 0; r < n; r++) {
      var y = QUIET + n - 1 - r, c = 0;
      while (c < n) {
        if (rows[r].charAt(c) === '1') {
          var start = c;
          while (c < n && rows[r].charAt(c) === '1') c++;
          out.push('    \\fill[ink] (' + (QUIET + start) + ',' + y + ') rectangle (' + (QUIET + c) + ',' + (y + 1) + ');');
        } else c++;
      }
    }
    var unit = (sizeCm / size).toFixed(5);
    return '  \\begin{scope}[shift={(' + xCm + ',' + yCm + ')}, x=' + unit + 'cm, y=' + unit + 'cm]\n' +
      '    \\fill[white] (0,0) rectangle (' + size + ',' + size + ');\n' + out.join('\n') + '\n  \\end{scope}';
  }

  /* ================= PBC EXPERIENCE LETTER (A4 Portrait) ================= */
  var LETTER = String.raw`\documentclass[10pt]{article}
\usepackage[a4paper, top=2.0cm, bottom=2.2cm, left=2.2cm, right=2.2cm]{geometry}
\usepackage[T1]{fontenc}
\usepackage[utf8]{inputenc}
\usepackage{helvet}
\renewcommand{\familydefault}{\sfdefault}
\usepackage{xcolor}
\usepackage{parskip}
\usepackage{enumitem}
\usepackage{tikz}
\usepackage{url}
\pagestyle{empty}

\definecolor{ink}{HTML}{090D16}
\definecolor{slate}{HTML}{334155}
\definecolor{mute}{HTML}{64748B}
\definecolor{accent}{HTML}{2563EB}
\definecolor{line}{HTML}{E2E8F0}
\definecolor{bgsoft}{HTML}{F8FAFC}

\begin{document}
\color{ink}

% Top Accent Line
\noindent\begin{tikzpicture}[overlay]
  \fill[ink] (-2.2, 2.0) rectangle (18.8, 1.82);
  \fill[accent] (-2.2, 1.82) rectangle (3.5, 1.74);
\end{tikzpicture}

% Header
\noindent
\begin{minipage}[t]{0.58\textwidth}
  {\fontsize{20}{24}\selectfont\bfseries @@COMPANY_UPPER@@}\\[3pt]
  {\small\textcolor{mute}{@@ADDRESS@@ $\cdot$ Official Employment Record}}
\end{minipage}%
\hfill
\begin{minipage}[t]{0.40\textwidth}
  \raggedleft
  {\footnotesize\texttt{\textcolor{mute}{REF: @@REF@@}}}\\[2pt]
  {\footnotesize\texttt{\textcolor{mute}{DATE: @@ISSUED@@}}}
\end{minipage}

\vspace{0.35cm}
{\color{line}\hrule height 0.8pt}
\vspace{0.45cm}

\noindent{\fontsize{13}{16}\selectfont\bfseries STATEMENT OF EMPLOYMENT \& EXPERIENCE}

\vspace{0.2cm}

% Metadata Summary Table
\noindent\begin{tikzpicture}
  \node[fill=bgsoft, draw=line, line width=0.6pt, rounded corners=3pt, inner sep=10pt, text width=\dimexpr\textwidth-21pt\relax] {
    \begin{tabular}{@{}p{0.24\textwidth}p{0.24\textwidth}p{0.24\textwidth}p{0.20\textwidth}@{}}
      {\scriptsize\textcolor{mute}{EMPLOYEE NAME}} & {\scriptsize\textcolor{mute}{DESIGNATION}} & {\scriptsize\textcolor{mute}{TENURE PERIOD}} & {\scriptsize\textcolor{mute}{TOTAL DURATION}} \\[2pt]
      {\small\bfseries @@NAME@@} & {\small\bfseries @@DESIGNATION@@} & {\small\bfseries @@START@@ -- @@END@@} & {\small\bfseries @@SPAN@@}
    \end{tabular}
  };
\end{tikzpicture}

\vspace{0.35cm}

\noindent This record formally certifies that \textbf{@@NAME@@} was employed with \textbf{@@COMPANY@@} in the capacity of \textbf{@@DESIGNATION@@}@@DEPARTMENT@@ from \textbf{@@START@@} to \textbf{@@END@@}.

\noindent Throughout this engagement, @@NAME@@ contributed to core engineering and product initiatives within our Agentic AI division, demonstrating high technical ownership, reliability, and professional ethics.@@RESPONSIBILITIES@@

@@TASKS@@

\noindent We thank @@NAME@@ for their valuable contributions to \textbf{@@COMPANY@@} and wish them continued excellence in all future career endeavors.

\vfill

{\color{line}\hrule height 0.6pt}
\vspace{0.4cm}

\noindent
\begin{minipage}[b]{0.55\textwidth}
  \rule{5.2cm}{0.6pt}\\[4pt]
  {\bfseries @@SIGNATORY@@}\\
  {\small\textcolor{slate}{@@SIGNATORY_TITLE@@}}\\
  {\footnotesize\textcolor{mute}{@@COMPANY@@ $\cdot$ \texttt{@@HR@@}}}
\end{minipage}%
\hfill
\begin{minipage}[b]{0.42\textwidth}
  \raggedleft
  @@LETTER_QR@@
  {\scriptsize\textcolor{mute}{Scan QR or visit \url{@@VERIFY_URL@@}}}\\
  {\scriptsize\textcolor{mute}{to cryptographically verify this record.}}
\end{minipage}

\end{document}
`;

  function letter(d) {
    var items = String(d.description || '').split(/\r?\n/).map(function (s) { return s.trim(); }).filter(Boolean);
    var responsibilities = '';
    if (items.length) {
      responsibilities = '\n\n\\vspace{0.15cm}\\noindent{\\small\\bfseries\\textcolor{slate}{ROLE SCOPE \\& RESPONSIBILITIES}}\\nopagebreak\n' +
        '\\begin{itemize}[leftmargin=1.2cm, itemsep=2pt, topsep=3pt]\n' +
        items.map(function (i) { return '  \\item {\\small ' + esc(i) + '}\n'; }).join('') + '\\end{itemize}';
    }
    var department = d.department && d.role !== 'intern' ? ' (' + esc(d.department) + ' Department)' : '';

    var tasks = '';
    if (d.assigned_tasks && d.assigned_tasks.length) {
      tasks = '\\vspace{0.15cm}\\noindent{\\small\\bfseries\\textcolor{slate}{KEY DELIVERABLES \\& PROJECTS EXECUTED}}\\nopagebreak\n' +
        '\\begin{itemize}[leftmargin=1.2cm, itemsep=2pt, topsep=3pt]\n' +
        d.assigned_tasks.slice(0, 15).map(function (x) { return '  \\item {\\small ' + esc(x.title) + '}\n'; }).join('') +
        (d.assigned_more ? '  \\item[] {\\footnotesize\\itshape\\textcolor{mute}{+ ' + esc(plural(d.assigned_more, 'additional project')) + ' logged in ERP.}}\n' : '') +
        '\\end{itemize}\n';
    }

    var qrInline = '';
    if (d.qr && d.qr.length) {
      qrInline = '\\begin{tikzpicture}\n' + qrTikz(d.qr, 1.8, 0, 0) + '\n\\end{tikzpicture}\\\\[2pt]\n';
    }

    return fill(LETTER, {
      COMPANY_UPPER: esc(String(d.company_name).toUpperCase()),
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
      VERIFY_URL: String(d.verify_url || '').replace(/[\\{}%#\s]/g, ''),
      LETTER_QR: qrInline,
      SIGNATORY: esc(d.signatory_name),
      SIGNATORY_TITLE: esc(d.signatory_title)
    });
  }

  /* ================= PBC INTERNSHIP CERTIFICATE (A4 Landscape: 29.7cm x 21cm) ================= */
  var CERT = String.raw`\documentclass[11pt]{article}
\usepackage[a4paper, landscape, margin=0pt]{geometry}
\usepackage[T1]{fontenc}
\usepackage[utf8]{inputenc}
\usepackage{helvet}
\renewcommand{\familydefault}{\sfdefault}
\usepackage{xcolor}
\usepackage{tikz}
\pagestyle{empty}
\setlength{\parindent}{0pt}

\definecolor{ink}{HTML}{090D16}
\definecolor{panel}{HTML}{0F172A}
\definecolor{slate}{HTML}{334155}
\definecolor{mute}{HTML}{64748B}
\definecolor{accent}{HTML}{2563EB}
\definecolor{line}{HTML}{CBD5E1}
\definecolor{bgsoft}{HTML}{F8FAFC}

\begin{document}
\noindent\begin{tikzpicture}[overlay]
  % Page Canvas (29.7cm x 21.0cm)
  \fill[white] (0,0) rectangle (29.7,-21.0);

  % Left Architectural Dark Sidebar
  \fill[panel] (0,0) rectangle (7.2,-21.0);
  \fill[accent] (7.2,0) rectangle (7.32,-21.0);

  % Subtle Grid Accent in Sidebar Top
  \draw[slate!40!panel, line width=0.4pt] (0,-3.8) -- (7.2,-3.8);
  \draw[slate!40!panel, line width=0.4pt] (0,-14.2) -- (7.2,-14.2);

  % Company Brand in Sidebar
  \node[anchor=north west, text=white, align=left, text width=5.8cm] at (0.9,-1.3) {
    {\fontsize{22}{26}\selectfont\bfseries @@COMPANY_UPPER@@}\\[4pt]
    {\footnotesize\textcolor{line}{@@ADDRESS@@}}
  };

  % Credential Metadata in Sidebar
  \node[anchor=north west, text=line, align=left, text width=5.6cm] at (0.9,-4.5) {
    {\scriptsize\textcolor{mute}{CREDENTIAL ID}}\\[2pt]
    {\footnotesize\texttt{\textbf{@@REF@@}}}\\[12pt]
    {\scriptsize\textcolor{mute}{ISSUED DATE}}\\[2pt]
    {\footnotesize\texttt{@@ISSUED@@}}\\[12pt]
    {\scriptsize\textcolor{mute}{TENURE DURATION}}\\[2pt]
    {\footnotesize\textbf{@@SPAN@@}}\\[2pt]
    {\scriptsize\textcolor{mute}{@@START@@ -- @@END@@}}\\[12pt]
    {\scriptsize\textcolor{mute}{VERIFICATION STATUS}}\\[2pt]
    {\footnotesize\textcolor{accent!40!white}{\textbf{Verified Record}}}
  };

  % QR Code Box in Sidebar Bottom
@@QR_SIDEBAR@@
  \node[anchor=north west, text=line, align=left, text width=5.6cm] at (0.9,-18.6) {
    {\scriptsize\textbf{Cryptographic Verification}}\\[1pt]
    {\tiny\textcolor{mute}{Scan QR code to verify authenticity on the official @@COMPANY@@ portal.}}
  };

  % Outer Structural Frame on Main Area
  \draw[line, line width=0.8pt] (8.2,-1.1) rectangle (28.6,-19.9);
  \fill[ink] (8.2,-1.1) rectangle (12.5,-1.22);

  % Main Header Tag
  \node[anchor=north west, text=accent] at (9.2,-2.1) {
    {\footnotesize\bfseries\texttt{OFFICIAL INTERNSHIP CREDENTIAL}}
  };

  \node[anchor=north west, text=ink] at (9.2,-2.8) {
    {\fontsize{28}{32}\selectfont\bfseries @@TITLE@@}
  };

  \draw[line, line width=0.6pt] (9.2,-4.2) -- (27.6,-4.2);

  % Recipient Presentation
  \node[anchor=north west, text=mute] at (9.2,-4.8) {
    {\small This certifies that}
  };

  \node[anchor=north west, text=ink, text width=18.2cm] at (9.2,-5.5) {
    {\fontsize{@@NAME_SIZE@@}{@@NAME_LEAD@@}\selectfont\bfseries @@NAME@@}
  };

  % Role & Statement
  \node[anchor=north west, text=slate, text width=18.2cm] at (9.2,-7.3) {
    {\fontsize{11.5}{16}\selectfont has successfully completed an engineering and product internship as \textbf{\textcolor{ink}{@@DESIGNATION@@}} at \textbf{\textcolor{ink}{@@COMPANY@@}} from \textbf{@@START@@} to \textbf{@@END@@}.}
  };

  % Deliverables / Projects Box
  \fill[bgsoft] (9.2,-9.3) rectangle (27.6,-15.3);
  \draw[line, line width=0.6pt] (9.2,-9.3) rectangle (27.6,-15.3);
  \fill[accent] (9.2,-9.3) rectangle (9.32,-15.3);

  \node[anchor=north west, text=ink] at (9.7,-9.7) {
    {\footnotesize\bfseries KEY PROJECTS \& TECHNICAL CONTRIBUTIONS}
  };

  \node[anchor=north west, text=slate, text width=17.4cm] at (9.7,-10.4) {
    {\small @@CERT_TASKS@@}
  };

  % Footer / Signatory Area
  \draw[ink, line width=0.7pt] (9.2,-17.5) -- (15.2,-17.5);
  \node[anchor=north west, text=ink, align=left] at (9.2,-17.7) {
    {\normalsize\bfseries @@SIGNATORY@@}\\[2pt]
    {\footnotesize\textcolor{slate}{@@SIGNATORY_TITLE@@}}\\[1pt]
    {\scriptsize\textcolor{mute}{@@COMPANY@@ $\cdot$ \texttt{@@HR@@}}}
  };

  % Official Corporate Badge (Minimalist)
  \draw[line, line width=0.8pt] (22.2,-16.6) rectangle (27.6,-18.9);
  \node[anchor=north west, text=ink, align=left] at (22.6,-16.95) {
    {\scriptsize\bfseries\textcolor{mute}{ISSUING AUTHORITY}}\\[2pt]
    {\small\bfseries @@COMPANY_UPPER@@}\\[1pt]
    {\tiny\texttt{\textcolor{slate}{REF: @@REF@@}}}
  };
\end{tikzpicture}
\end{document}
`;

  function certificate(d) {
    var nameLen = String(d.name).length;
    var nameSize = nameLen <= 22 ? 26 : nameLen <= 32 ? 22 : 18;

    var qrSidebar = '';
    if (d.qr && d.qr.length) {
      qrSidebar = qrTikz(d.qr, 3.2, 0.9, -18.1);
    }

    var taskLines = [];
    if (d.assigned_tasks && d.assigned_tasks.length) {
      d.assigned_tasks.slice(0, 5).forEach(function (t) {
        taskLines.push('$\\bullet$\\enspace ' + esc(t.title));
      });
      if (d.assigned_tasks.length > 5 || d.assigned_more) {
        var extra = (d.assigned_tasks.length - 5) + (d.assigned_more || 0);
        taskLines.push('{\\footnotesize\\itshape\\textcolor{mute}{+ ' + esc(plural(extra, 'more verified deliverable')) + ' completed during tenure.}}');
      }
    } else {
      taskLines.push('Contributed to core engineering workflows, technical implementation, and team deliverables under senior supervision.');
    }

    return fill(CERT, {
      COMPANY_UPPER: esc(String(d.company_name).toUpperCase()),
      COMPANY: esc(d.company_name),
      ADDRESS: esc(d.company_address),
      REF: esc(d.ref),
      ISSUED: esc(d.issued_on),
      SPAN: esc(d.span),
      START: esc(d.start),
      END: esc(d.end),
      QR_SIDEBAR: qrSidebar,
      TITLE: 'CERTIFICATE OF INTERNSHIP',
      NAME: esc(d.name),
      NAME_SIZE: String(nameSize),
      NAME_LEAD: String(nameSize + 4),
      DESIGNATION: esc(d.designation),
      CERT_TASKS: taskLines.join('\\\\[4pt]\n    '),
      SIGNATORY: esc(d.signatory_name),
      SIGNATORY_TITLE: esc(d.signatory_title),
      HR: esc(d.hr_email)
    });
  }

  function build(d) {
    return d.kind === 'internship_certificate' ? certificate(d) : letter(d);
  }

  root.DocLatex = { build: build, esc: esc };
})(typeof window !== 'undefined' ? window : globalThis);