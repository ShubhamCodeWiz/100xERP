import os
import secrets
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

BASE_DIR = Path(__file__).resolve().parent
TEMPLATES_DIR = BASE_DIR / "templates"
STATIC_DIR = BASE_DIR / "static"

DATA_DIR = Path(os.getenv("ERP_DATA_DIR", "/tmp/erpba_data" if os.getenv("VERCEL") else BASE_DIR / "data")).resolve()
DB_PATH = DATA_DIR / "db.json"
UPLOAD_DIR = DATA_DIR / "uploads"
SECRET_PATH = DATA_DIR / "jwt_secret.key"
PASSWORD_KEY_PATH = DATA_DIR / "password.key"

DATA_DIR.mkdir(parents=True, exist_ok=True)
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

MAX_UPLOAD_BYTES = 5 * 1024 * 1024
ALLOWED_UPLOAD_EXTENSIONS = {".pdf", ".doc", ".docx", ".png", ".jpg", ".jpeg"}

ADMIN_ID = os.getenv("ADMIN_ID", "admin")
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "admin")
ADMIN_NAME = os.getenv("ADMIN_NAME", "Administrator")

JWT_ALGORITHM = "HS256"
JWT_EXPIRE_MINUTES = int(os.getenv("ERP_JWT_EXPIRE_MINUTES", "480"))

COMPANY_NAME = "100X Club"
COMPANY_ADDRESS = "Agentic AI Division · Uttarakhand, India"
SIGNATORY_NAME = "Sagar Singh"
SIGNATORY_TITLE = "Head of Human Resources"
HR_EMAIL = "hr@100x.club"

PUBLIC_BASE_URL = os.getenv("ERP_PUBLIC_URL", "").rstrip("/")
BUILD = "2026.11.02-perf1"

LOGIN_MAX_FAILURES = 5
LOGIN_WINDOW_SECONDS = 300

def _load_secret(env_name: str, path: Path) -> str:
    from_env = os.getenv(env_name)
    if from_env:
        return from_env
    if path.exists():
        return path.read_text(encoding="utf-8").strip()
    secret = secrets.token_urlsafe(48)
    try:
        path.write_text(secret, encoding="utf-8")
        os.chmod(path, 0o600)
    except OSError:
        pass
    return secret

JWT_SECRET = _load_secret("ERP_JWT_SECRET", SECRET_PATH)
PASSWORD_SECRET = _load_secret("ERP_PASSWORD_KEY", PASSWORD_KEY_PATH)
