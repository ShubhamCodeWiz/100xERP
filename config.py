"""Central configuration: paths, the built-in admin account and secrets."""
import os
import secrets
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
TEMPLATES_DIR = BASE_DIR / "templates"
STATIC_DIR = BASE_DIR / "static"

# All persistent data lives in one folder so it is easy to back up.
# Override with the ERP_DATA_DIR environment variable.
DATA_DIR = Path(os.getenv("ERP_DATA_DIR", "/tmp/erpba_data" if os.getenv("VERCEL") else BASE_DIR / "data")).resolve()
DB_PATH = DATA_DIR / "db.json"
UPLOAD_DIR = DATA_DIR / "uploads"          # files attached to dashboards
SECRET_PATH = DATA_DIR / "jwt_secret.key"
PASSWORD_KEY_PATH = DATA_DIR / "password.key"

DATA_DIR.mkdir(parents=True, exist_ok=True)
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

# Uploads (matches the "up to 5 MB" hint on the dashboard).
MAX_UPLOAD_BYTES = 5 * 1024 * 1024
ALLOWED_UPLOAD_EXTENSIONS = {".pdf", ".doc", ".docx", ".png", ".jpg", ".jpeg"}

# Built-in administrator. Defined in code on purpose (it is not stored in db.json).
# Change these before any real deployment.
ADMIN_ID = "admin"
ADMIN_PASSWORD = "admin"
ADMIN_NAME = "Administrator"

# JWT
JWT_ALGORITHM = "HS256"
JWT_EXPIRE_MINUTES = int(os.getenv("ERP_JWT_EXPIRE_MINUTES", "480"))

# Company details printed on the experience letters / internship certificates.
COMPANY_NAME = "100X Club"
COMPANY_ADDRESS = "Agentic AI"   # tagline / address line printed under the company name; set a real address if you want one
SIGNATORY_NAME = "Sagar Singh"
SIGNATORY_TITLE = "Head of Human Resources"
HR_EMAIL = "hr@100x.club"

# Public address of this ERP, used in the QR code / verify link on documents.
# Set ERP_PUBLIC_URL (e.g. https://erp.100x.club) when running behind a proxy;
# otherwise the address the browser used is taken from the request.
PUBLIC_BASE_URL = os.getenv("ERP_PUBLIC_URL", "").rstrip("/")

# Shown in the page footer so you can tell which version of the files is running.
BUILD = "2026.10.30-r5"

# Login throttling (per client IP + user id)
LOGIN_MAX_FAILURES = 5
LOGIN_WINDOW_SECONDS = 300


def _load_secret(env_name: str, path: Path) -> str:
    """Use the environment variable if set, otherwise generate a secret once and
    keep it on disk so it survives restarts."""
    from_env = os.getenv(env_name)
    if from_env:
        return from_env
    if path.exists():
        return path.read_text(encoding="utf-8").strip()
    secret = secrets.token_urlsafe(48)
    path.write_text(secret, encoding="utf-8")
    try:
        os.chmod(path, 0o600)
    except OSError:
        pass
    return secret


JWT_SECRET = _load_secret("ERP_JWT_SECRET", SECRET_PATH)
# Key for the reversible (encrypted) password copy that admins/executives may view.
PASSWORD_SECRET = _load_secret("ERP_PASSWORD_KEY", PASSWORD_KEY_PATH)
