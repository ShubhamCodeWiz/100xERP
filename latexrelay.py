"""Server-side relay for LaTeX -> PDF, used by the browser only when it cannot reach the public
compilers itself (for example when they do not allow cross-origin requests).

The source is written and sent by the browser; this module only forwards it to the same free
public services, server to server (standard library only). TeX is never run on this machine,
because LaTeX can read local files and the source comes from a user."""
import json
import threading
import urllib.error
import urllib.parse
import urllib.request
import uuid

TEXLIVE_URL = "https://texlive.net/cgi-bin/latexcgi"
YTOTECH_URL = "https://latex.ytotech.com/builds/sync"
LATEXONLINE_URL = "https://latexonline.cc/compile"
TIMEOUT = 30
LATEXONLINE_MAX_QUERY = 5500
_UA = {"User-Agent": "100x-ERP/1.0"}
_slots = threading.BoundedSemaphore(3)      # at most 3 compilations at once


class LatexError(Exception):
    pass


def _is_pdf(blob: bytes) -> bool:
    return blob[:5] == b"%PDF-"


def _send(request: urllib.request.Request) -> bytes:
    try:
        with urllib.request.urlopen(request, timeout=TIMEOUT) as response:
            return response.read()
    except urllib.error.HTTPError as err:
        body = err.read(200).decode("utf-8", "replace").strip().replace("\n", " ")
        raise LatexError(f"HTTP {err.code} {body}".strip())
    except (urllib.error.URLError, TimeoutError, OSError) as err:
        raise LatexError(str(getattr(err, "reason", err)))


def _multipart(fields: list) -> tuple:
    boundary = uuid.uuid4().hex
    parts = [
        f'--{boundary}\r\nContent-Disposition: form-data; name="{name}"\r\n\r\n{value}\r\n'.encode("utf-8")
        for name, value in fields
    ]
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


SERVICES = [
    ("texlive.net", _texlive_net),
    ("latex.ytotech.com", _ytotech),
    ("latexonline.cc", _latexonline),
]


def compile_remote(tex: str) -> bytes:
    """PDF bytes from the first service that returns a real PDF."""
    if not _slots.acquire(timeout=20):
        raise LatexError("The server is busy compiling other documents. Try again in a moment.")
    try:
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
            return pdf
        raise LatexError("No LaTeX service could build the PDF.\n" + "\n".join(problems))
    finally:
        _slots.release()
