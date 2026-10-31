"""LaTeX sources for the experience letter and the internship certificate, plus PDF
compilation through free online services (standard library only).

Services tried in order: texlive.net, latex.ytotech.com, latexonline.cc. If the server has
pdflatex installed it is used as a last resort. Compiled PDFs are cached by source hash."""
import hashlib
import json
import os
import shutil
import subprocess
import tempfile
import urllib.error
import urllib.parse
import urllib.request
import uuid
from pathlib import Path

from config import COMPANY_ADDRESS, COMPANY_NAME, GENERATED_DIR, HR_EMAIL, SIGNATORY_NAME, SIGNATORY_TITLE
from qr import make_qr

TEXLIVE_URL = "https://texlive.net/cgi-bin/latexcgi"
YTOTECH_URL = "https://latex.ytotech.com/builds/sync"
LATEXONLINE_URL = "https://latexonline.cc/compile"
TIMEOUT = 60
LATEXONLINE_MAX_QUERY = 7000       # that service takes the source in the URL
_UA = {"User-Agent": "100x-ERP/1.0"}


class LatexError(Exception):
    pass


# ------------------------------------------------------------------ text helpers

_SPECIAL = {
    "\\": r"\textbackslash{}", "&": r"\&", "%": r"\%", "$": r"\$", "#": r"\#", "_": r"\_",
    "{": r"\{", "}": r"\}", "~": r"\textasciitilde{}", "^": r"\textasciicircum{}",
}


def esc(text) -> str:
    """Escape user text for LaTeX; characters pdflatex cannot print become '?'."""
    out = []
    for ch in str(text):
        if ch in _SPECIAL:
            out.append(_SPECIAL[ch])
        elif ch in "\r\n\t":
            out.append(" ")
        elif ch.isprintable() and (ord(ch) < 0x250 or ch in "\u2013\u2014\u2018\u2019\u201c\u201d\u2022"):
            out.append(ch)
        else:
            out.append("?")
    return "".join(out)


def _fill(template: str, values: dict) -> str:
    for key, value in values.items():
        template = template.replace(f"@@{key}@@", value)
    return template


def _performance_text(d: dict) -> str:
    n = esc(d["name"])
    if not d["tasks_total"]:
        return "No tasks were recorded on the ERP during this period."
    count = f"{d['tasks_total']} task" + ("" if d["tasks_total"] == 1 else "s")
    sentence = f"{n} was assigned {count} and completed {d['tasks_done']} of them ({d['percent']}\\%)."
    verdict = {
        "excellent": f"{n} showed exceptional dedication and ownership, and completed their responsibilities to our full satisfaction.",
        "good": f"{n} discharged their responsibilities reliably and kept a good standard of work.",
        "satisfactory": f"{n} completed a majority of the assigned responsibilities and conducted themselves professionally.",
        "limited": f"{n} was engaged on the tasks assigned during this period.",
    }[d["rating"]]
    return f"{sentence} {verdict}"


# ------------------------------------------------------------------ experience letter

_LETTER = r"""\documentclass[11pt]{article}
\usepackage[a4paper, margin=2.2cm]{geometry}
\usepackage[T1]{fontenc}
\usepackage[utf8]{inputenc}
\usepackage{lmodern}
\usepackage{xcolor}
\usepackage{microtype}
\usepackage{parskip}
\usepackage{enumitem}
\pagestyle{empty}
\definecolor{main}{HTML}{1F3B73}

\begin{document}

\begin{center}
  {\fontsize{24}{28}\selectfont\bfseries\textcolor{main}{100X C\hspace{1pt}L\hspace{1pt}U\hspace{1pt}B}}\\[3pt]
  {\small\itshape @@ADDRESS@@}\\[4pt]
  {\color{main}\rule{\textwidth}{0.8pt}}
\end{center}

\hfill @@ISSUED@@

\vspace{0.4cm}

\noindent{\large\bfseries \textsc{To Whom It May Concern}}

\vspace{0.3cm}

\noindent This letter certifies that \textbf{@@NAME@@} served at \textbf{@@COMPANY@@} as
\textbf{@@DESIGNATION@@}@@DEPARTMENT@@ from @@START@@ to @@END@@, a period of @@SPAN@@.

\vspace{0.2cm}

\noindent During this tenure, @@NAME@@ worked closely with our team on agentic AI systems.@@RESPONSIBILITIES@@

\vspace{0.2cm}

\noindent @@PERFORMANCE@@

\vspace{0.2cm}

\noindent We wish @@NAME@@ every success in future endeavours.

\vspace{0.4cm}

\noindent For any verification regarding this letter (reference @@REF@@), please contact
\texttt{@@HR@@}.

\vspace{1.4cm}

\noindent
\begin{minipage}{0.5\textwidth}
  \rule{6cm}{0.4pt}\\[3pt]
  {\bfseries @@SIGNATORY@@}\\
  @@SIGNATORY_TITLE@@\\
  @@COMPANY@@
\end{minipage}

\end{document}
"""


def letter_tex(d: dict) -> str:
    items = [line.strip() for line in str(d["description"]).splitlines() if line.strip()]
    responsibilities = ""
    if items:
        responsibilities = (
            " Key responsibilities included:\n\\begin{itemize}[leftmargin=1.4cm, itemsep=2pt]\n"
            + "".join(f"  \\item {esc(i)}\n" for i in items)
            + "\\end{itemize}"
        )
    department = f", in the {esc(d['department'])} department," if d["department"] and d["role"] != "intern" else ""
    return _fill(_LETTER, {
        "ADDRESS": esc(COMPANY_ADDRESS), "ISSUED": esc(d["issued_on"]), "NAME": esc(d["name"]),
        "COMPANY": esc(COMPANY_NAME), "DESIGNATION": esc(d["designation"]), "DEPARTMENT": department,
        "START": esc(d["start"]), "END": esc(d["end"]), "SPAN": esc(d["span"]),
        "RESPONSIBILITIES": responsibilities, "PERFORMANCE": _performance_text(d),
        "REF": esc(d["ref"]), "HR": esc(HR_EMAIL), "SIGNATORY": esc(SIGNATORY_NAME),
        "SIGNATORY_TITLE": esc(SIGNATORY_TITLE),
    })


# ------------------------------------------------------------------ internship certificate
# Drawn on one page with absolute coordinates (origin = top-left corner, y grows downward),
# so it needs a single compile pass. The QR code is drawn with TikZ, so no extra package.

_CERT = r"""\documentclass[11pt]{article}
\usepackage[paperwidth=30cm, paperheight=20cm, margin=0pt]{geometry}
\usepackage[T1]{fontenc}
\usepackage[utf8]{inputenc}
\usepackage{lmodern}
\usepackage{xcolor}
\usepackage{tikz}
\pagestyle{empty}
\setlength{\parindent}{0pt}
\setlength{\topskip}{0pt}
\definecolor{main}{HTML}{1F3B73}
\definecolor{accent}{HTML}{C9A227}
\definecolor{light}{HTML}{F5F7FB}

\begin{document}
\noindent\begin{tikzpicture}[overlay]
  \fill[light] (0,0) rectangle (30,-20);
  \draw[main, line width=2.5pt] (0.55,-0.55) rectangle (29.45,-19.45);
  \draw[accent, line width=1pt] (0.85,-0.85) rectangle (29.15,-19.15);
  \foreach \x/\y in {0.55/-0.55, 29.45/-0.55, 0.55/-19.45, 29.45/-19.45} { \fill[main] (\x,\y) circle (0.12); }
  \foreach \x/\y in {0.85/-0.85, 29.15/-0.85, 0.85/-19.15, 29.15/-19.15} { \fill[main] (\x,\y) circle (0.07); }

  \node[align=center, text=main] at (15,-2.0)
    {{\fontsize{30}{36}\selectfont\bfseries 100X C\hspace{1pt}L\hspace{1pt}U\hspace{1pt}B}\\[6pt]
     {\fontsize{11}{14}\selectfont\itshape @@ADDRESS@@}};
  \draw[accent, line width=1pt] (10.5,-2.85) -- (19.5,-2.85);
  \fill[accent] (15,-2.85) circle (0.06);

  \node[text=accent, font=\fontsize{40}{48}\selectfont\bfseries] at (15,-4.6) {CERTIFICATE};
  \node[font=\fontsize{16}{20}\selectfont\scshape] at (15,-5.9) {of internship completion};

  \node[align=center, text width=19cm] at (16.6,-10.0)
    {This is to certify that {\large\bfseries @@NAME@@}\\[2pt]
     has successfully completed an internship as {\bfseries @@DESIGNATION@@}\\[2pt]
     at @@COMPANY@@ for the duration @@START@@ -- @@END@@ (@@SPAN@@).\\[12pt]
     @@PERFORMANCE@@\\[14pt]
     {\itshape We are confident in @@NAME@@'s continued success and wish them the very best.}};

  % QR code (links to this ERP)
  \begin{scope}[shift={(1.8,-17.2)}, x=@@UNIT@@cm, y=@@UNIT@@cm]
    \fill[white] (0,0) rectangle (@@QRSIZE@@,@@QRSIZE@@);
@@QRCELLS@@
  \end{scope}
  \node[anchor=north west, align=center] at (1.8,-17.3) {\scriptsize Scan to open the ERP and verify};

  \node[anchor=south east, align=right] at (28.2,-17.6)
    {{\bfseries Certificate ID:} @@REF@@\\[3pt] {\scriptsize Issued on: @@ISSUED@@}};
  \node[anchor=south east, align=center] at (28.2,-15.4)
    {\rule{6.5cm}{0.4pt}\\[3pt] {\small\bfseries @@SIGNATORY@@}\\ {\scriptsize @@SIGNATORY_TITLE@@}};
\end{tikzpicture}
\end{document}
"""

_QUIET = 3
_QR_CM = 3.2


def _qr_cells(rows: list) -> str:
    n = len(rows)
    lines = []
    for r, row in enumerate(rows):
        y = _QUIET + n - 1 - r
        c = 0
        while c < n:
            if row[c] == "1":
                start = c
                while c < n and row[c] == "1":
                    c += 1
                lines.append(f"    \\fill[black] ({_QUIET + start},{y}) rectangle ({_QUIET + c},{y + 1});")
            else:
                c += 1
    return "\n".join(lines)


def certificate_tex(d: dict) -> str:
    rows = make_qr(d["qr_text"])
    size = len(rows) + 2 * _QUIET
    return _fill(_CERT, {
        "ADDRESS": esc(COMPANY_ADDRESS), "NAME": esc(d["name"]), "DESIGNATION": esc(d["designation"]),
        "COMPANY": esc(COMPANY_NAME), "START": esc(d["start"]), "END": esc(d["end"]), "SPAN": esc(d["span"]),
        "PERFORMANCE": _performance_text(d), "REF": esc(d["ref"]), "ISSUED": esc(d["issued_on"]),
        "SIGNATORY": esc(SIGNATORY_NAME), "SIGNATORY_TITLE": esc(SIGNATORY_TITLE),
        "UNIT": f"{_QR_CM / size:.5f}", "QRSIZE": str(size), "QRCELLS": _qr_cells(rows),
    })


def build_tex(kind: str, data: dict) -> str:
    return certificate_tex(data) if kind == "internship_certificate" else letter_tex(data)


# ------------------------------------------------------------------ compiling

def _is_pdf(blob: bytes) -> bool:
    return blob[:5] == b"%PDF-"


def _send(request: urllib.request.Request) -> bytes:
    try:
        with urllib.request.urlopen(request, timeout=TIMEOUT) as response:
            return response.read()
    except urllib.error.HTTPError as err:
        body = err.read(300).decode("utf-8", "replace").strip().replace("\n", " ")
        raise LatexError(f"HTTP {err.code} {body}".strip())
    except (urllib.error.URLError, TimeoutError, OSError) as err:
        raise LatexError(str(getattr(err, "reason", err)))


def _multipart(fields: list) -> tuple:
    boundary = uuid.uuid4().hex
    parts = []
    for name, value in fields:
        parts.append(
            f'--{boundary}\r\nContent-Disposition: form-data; name="{name}"\r\n\r\n{value}\r\n'.encode("utf-8")
        )
    parts.append(f"--{boundary}--\r\n".encode("ascii"))
    return b"".join(parts), f"multipart/form-data; boundary={boundary}"


def _texlive_net(tex: str) -> bytes:
    body, content_type = _multipart([
        ("filecontents[]", tex), ("filename[]", "document.tex"), ("engine", "pdflatex"), ("return", "pdf"),
    ])
    return _send(urllib.request.Request(
        TEXLIVE_URL, data=body, headers={"Content-Type": content_type, **_UA}, method="POST"))


def _ytotech(tex: str) -> bytes:
    payload = json.dumps({"compiler": "pdflatex", "resources": [{"main": True, "content": tex}]})
    return _send(urllib.request.Request(
        YTOTECH_URL, data=payload.encode("utf-8"),
        headers={"Content-Type": "application/json", **_UA}, method="POST"))


def _latexonline(tex: str) -> bytes:
    query = urllib.parse.urlencode({"text": tex, "command": "pdflatex"})
    if len(query) > LATEXONLINE_MAX_QUERY:
        raise LatexError("document is too long for this service")
    return _send(urllib.request.Request(f"{LATEXONLINE_URL}?{query}", headers=_UA))


def _local_pdflatex(tex: str) -> bytes:
    binary = shutil.which("pdflatex")
    if not binary:
        raise LatexError("pdflatex is not installed on this server")
    with tempfile.TemporaryDirectory() as folder:
        Path(folder, "document.tex").write_text(tex, encoding="utf-8")
        subprocess.run([binary, "-interaction=nonstopmode", "-halt-on-error", "document.tex"],
                       cwd=folder, capture_output=True, timeout=TIMEOUT, check=False)
        pdf = Path(folder, "document.pdf")
        if not pdf.exists():
            raise LatexError("pdflatex failed to build the document")
        return pdf.read_bytes()


SERVICES = [
    ("texlive.net", _texlive_net),
    ("latex.ytotech.com", _ytotech),
    ("latexonline.cc", _latexonline),
    ("local pdflatex", _local_pdflatex),
]


def compile_pdf(tex: str) -> bytes:
    """Return a PDF for this LaTeX source, trying each service in turn."""
    cache = GENERATED_DIR / (hashlib.sha256(tex.encode("utf-8")).hexdigest() + ".pdf")
    if cache.is_file():
        return cache.read_bytes()
    problems = []
    for name, build in SERVICES:
        try:
            pdf = build(tex)
        except LatexError as err:
            problems.append(f"{name}: {err}"[:160])
            continue
        if not _is_pdf(pdf):
            problems.append(f"{name}: did not return a PDF (LaTeX error)")
            continue
        temp = cache.with_suffix(f".{uuid.uuid4().hex}.tmp")
        temp.write_bytes(pdf)
        os.replace(temp, cache)
        return pdf
    raise LatexError("Could not build the PDF.\n" + "\n".join(problems))
