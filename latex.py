"""LaTeX template rendering and zero-dependency online PDF compilation.
Uses standard library urllib to send TeX source to free public compiler APIs.
"""
import json
import re
import urllib.error
import urllib.parse
import urllib.request
from typing import Any

from qr import make_qr


class LatexError(Exception):
    """Raised when LaTeX document generation or compilation fails."""
    pass


def _escape_latex(val: Any) -> str:
    """Escapes special LaTeX characters for plain text insertion."""
    if val is None:
        return ""
    text = str(val)
    chars = {
        "\\": r"\textbackslash{}",
        "&": r"\&",
        "%": r"\%",
        "$": r"\$",
        "#": r"\#",
        "_": r"\_",
        "{": r"\{",
        "}": r"\}",
        "~": r"\textasciitilde{}",
        "^": r"\textasciicircum{}",
    }
    pattern = re.compile("|".join(re.escape(k) for k in chars.keys()))
    return pattern.sub(lambda m: chars[m.group(0)], text)


def _qr_tikz(text: str, size_cm: float = 2.5) -> str:
    """Generates a pure TiKZ or pixel block representation of a QR code using qr.py."""
    try:
        matrix = make_qr(text)
    except Exception:
        return ""
    n = len(matrix)
    cell = size_cm / n
    lines = [r"\begin{tikzpicture}[x=1cm,y=1cm]"]
    for r_idx, row in enumerate(matrix):
        y = (n - 1 - r_idx) * cell
        for c_idx, val in enumerate(row):
            if val == "1":
                x = c_idx * cell
                lines.append(
                    f"\\fill[black] ({x:.4f},{y:.4f}) rectangle ({x + cell:.4f},{y + cell:.4f});"
                )
    lines.append(r"\end{tikzpicture}")
    return "\n".join(lines)


# Templates for experience letter and internship certificate
_EXP_TEMPLATE = r"""\documentclass[11pt,a4paper]{article}
\usepackage[utf8]{inputenc}
\usepackage[margin=1in]{geometry}
\usepackage{tikz}
\usepackage{parskip}

\begin{document}
\thispagestyle{empty}

\begin{center}
    {\LARGE \textbf{100X Club}}\\[4pt]
    {\small Agentic AI $\bullet$ Bengaluru, India}\\[2pt]
    {\footnotesize Ref: <<ref>>}
\end{center}

\vspace{1cm}
\begin{flushright}
    \textbf{Date:} <<issued_on>>
\end{flushright}

\vspace{0.5cm}
\begin{center}
    {\large \textbf{TO WHOMSOEVER IT MAY CONCERN}}
\end{center}

\vspace{0.5cm}
This is to certify that \textbf{<<name>>} has worked with \textbf{100X Club} in the role of \textbf{<<designation>>} from \textbf{<<start>>} to \textbf{<<end>>} (duration: <<span>>).

<<description_block>>

During their tenure, they actively demonstrated outstanding dedication, professionalism, and analytical skills.

\vspace{1.5cm}
\noindent
\begin{minipage}{0.5\textwidth}
    \textbf{Sagar Singh}\\
    Head of Human Resources\\
    100X Club\\
    \texttt{hr@100x.club}
\end{minipage}
\hfill
\begin{minipage}{0.4\textwidth}
    \begin{flushright}
        <<qr_code>>
    \end{flushright}
\end{minipage}

\end{document}
"""

_INT_TEMPLATE = r"""\documentclass[11pt,a4paper]{article}
\usepackage[utf8]{inputenc}
\usepackage[margin=1in]{geometry}
\usepackage{tikz}
\usepackage{parskip}

\begin{document}
\thispagestyle{empty}

\begin{center}
    {\LARGE \textbf{100X Club}}\\[4pt]
    {\small Agentic AI $\bullet$ Bengaluru, India}\\[2pt]
    {\footnotesize Ref: <<ref>>}
\end{center}

\vspace{1cm}
\begin{flushright}
    \textbf{Date:} <<issued_on>>
\end{flushright}

\vspace{0.5cm}
\begin{center}
    {\large \textbf{CERTIFICATE OF INTERNSHIP}}
\end{center}

\vspace{0.5cm}
This certificate is proudly presented to \textbf{<<name>>} for successfully completing their internship tenure as \textbf{<<designation>>} at \textbf{100X Club} from \textbf{<<start>>} to \textbf{<<end>>}.

During this period of <<span>>, they completed their assigned tasks and contributions with distinction.

\vspace{1.5cm}
\noindent
\begin{minipage}{0.5\textwidth}
    \textbf{Sagar Singh}\\
    Head of Human Resources\\
    100X Club\\
    \texttt{hr@100x.club}
\end{minipage}
\hfill
\begin{minipage}{0.4\textwidth}
    \begin{flushright}
        <<qr_code>>
    \end{flushright}
\end{minipage}

\end{document}
"""


def build_tex(doc_type: str, data: dict) -> str:
    """Renders LaTeX string with provided data."""
    template = _INT_TEMPLATE if doc_type == "internship_certificate" else _EXP_TEMPLATE
    
    qr_code = _qr_tikz(data.get("qr_text", ""))
    desc = data.get("description", "").strip()
    desc_block = f"\n{_escape_latex(desc)}\n" if desc else ""

    tex = template
    replacements = {
        "<<name>>": _escape_latex(data.get("name", "")),
        "<<designation>>": _escape_latex(data.get("designation", "")),
        "<<start>>": _escape_latex(data.get("start", "")),
        "<<end>>": _escape_latex(data.get("end", "")),
        "<<span>>": _escape_latex(data.get("span", "")),
        "<<ref>>": _escape_latex(data.get("ref", "")),
        "<<issued_on>>": _escape_latex(data.get("issued_on", "")),
        "<<description_block>>": desc_block,
        "<<qr_code>>": qr_code,
    }

    for placeholder, val in replacements.items():
        tex = tex.replace(placeholder, val)

    return tex


def compile_pdf(tex_source: str) -> bytes:
    """Compiles LaTeX to PDF using public web APIs without external local packages."""
    # API Endpoint 1: latexonline.cc
    try:
        url = "https://latexonline.cc/compile?text=" + urllib.parse.quote(tex_source)
        req = urllib.request.Request(
            url,
            headers={"User-Agent": "FastAPI-100x-ERP"},
            method="GET",
        )
        with urllib.request.urlopen(req, timeout=45) as resp:
            content = resp.read()
            if content.startswith(b"%PDF"):
                return content
    except Exception:
        pass

    # API Endpoint 2: Fallback public TeX online compiler service
    try:
        url = "https://texlive.net/cgi-bin/latexcgi"
        data = urllib.parse.urlencode({"filecontents[]": tex_source, "filename[]": "document.tex", "engine": "pdflatex"}).encode("utf-8")
        req = urllib.request.Request(
            url,
            data=data,
            headers={"User-Agent": "FastAPI-100x-ERP", "Content-Type": "application/x-www-form-urlencoded"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=45) as resp:
            content = resp.read()
            if content.startswith(b"%PDF"):
                return content
    except Exception:
        pass

    raise LatexError("All free online LaTeX compilation services failed or timed out. Please verify connectivity.")

