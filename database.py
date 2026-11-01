"""PostgreSQL-backed document store (with local JSON fallback).
Keeps the exact same db.get / db.all / db.put / db.remove interface.
"""
import copy
import json
import os
import threading
from datetime import datetime, timezone
from typing import Any

from config import DB_PATH

DATABASE_URL = os.getenv("DATABASE_URL")


def utcnow_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


class PostgresDB:
    def __init__(self, dsn: str):
        import psycopg2
        self._psycopg2 = psycopg2
        self.dsn = dsn
        self.lock = threading.RLock()
        self._init_db()

    def _conn(self):
        return self._psycopg2.connect(self.dsn)

    def _init_db(self) -> None:
        with self._conn() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    CREATE TABLE IF NOT EXISTS kv_store (
                        collection TEXT NOT NULL,
                        key TEXT NOT NULL,
                        value JSONB NOT NULL,
                        PRIMARY KEY (collection, key)
                    )
                """)
            conn.commit()

    def get(self, collection: str, key: str, default: Any = None) -> Any:
        with self._conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT value FROM kv_store WHERE collection = %s AND key = %s",
                    (collection, key),
                )
                row = cur.fetchone()
                if row is None:
                    return copy.deepcopy(default)
                val = row[0]
                return json.loads(val) if isinstance(val, str) else copy.deepcopy(val)

    def all(self, collection: str) -> dict[str, Any]:
        with self._conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT key, value FROM kv_store WHERE collection = %s",
                    (collection,),
                )
                rows = cur.fetchall()
                result = {}
                for k, v in rows:
                    result[k] = json.loads(v) if isinstance(v, str) else v
                return result

    def put(self, collection: str, key: str, value: Any) -> None:
        payload = json.dumps(value, ensure_ascii=False)
        with self._conn() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    INSERT INTO kv_store (collection, key, value)
                    VALUES (%s, %s, %s::jsonb)
                    ON CONFLICT (collection, key)
                    DO UPDATE SET value = EXCLUDED.value
                """, (collection, key, payload))
            conn.commit()

    def remove(self, collection: str, key: str) -> bool:
        with self._conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "DELETE FROM kv_store WHERE collection = %s AND key = %s",
                    (collection, key),
                )
                deleted = cur.rowcount > 0
            conn.commit()
            return deleted


if DATABASE_URL:
    db = PostgresDB(DATABASE_URL)
else:
    from pathlib import Path
    import tempfile

    class JsonDB:
        def __init__(self, path: Path):
            self.path = Path(path)
            self.lock = threading.RLock()
            self._data: dict[str, dict[str, Any]] = {}
            self.path.parent.mkdir(parents=True, exist_ok=True)
            if self.path.exists():
                with self.path.open("r", encoding="utf-8") as fh:
                    self._data = json.load(fh)
            else:
                self._flush()

        def _flush(self) -> None:
            fd, tmp = tempfile.mkstemp(dir=self.path.parent, suffix=".tmp")
            try:
                with os.fdopen(fd, "w", encoding="utf-8") as fh:
                    json.dump(self._data, fh, indent=2, ensure_ascii=False)
                    fh.flush()
                    os.fsync(fh.fileno())
                os.replace(tmp, self.path)
            except BaseException:
                try:
                    os.unlink(tmp)
                except OSError:
                    pass
                raise

        def get(self, collection: str, key: str, default: Any = None) -> Any:
            with self.lock:
                return copy.deepcopy(self._data.get(collection, {}).get(key, default))

        def all(self, collection: str) -> dict[str, Any]:
            with self.lock:
                return copy.deepcopy(self._data.get(collection, {}))

        def put(self, collection: str, key: str, value: Any) -> None:
            with self.lock:
                self._data.setdefault(collection, {})[key] = copy.deepcopy(value)
                self._flush()

        def remove(self, collection: str, key: str) -> bool:
            with self.lock:
                existed = self._data.get(collection, {}).pop(key, None) is not None
                if existed:
                    self._flush()
                return existed

    db = JsonDB(DB_PATH)