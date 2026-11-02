"""PostgreSQL-backed document store (with local JSON fallback).
Keeps the exact same db.get / db.all / db.put / db.remove interface.
"""
import copy
import json
import os
import threading
import time
from datetime import datetime, timezone
from typing import Any

from config import DB_PATH

DATABASE_URL = os.getenv("DATABASE_URL")


def utcnow_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


class PostgresDB:
    """Small PostgreSQL document store with pooled connections and read-through cache."""

    CACHE_TTL_SECONDS = 3.0

    def __init__(self, dsn: str):
        import psycopg2
        from psycopg2.pool import ThreadedConnectionPool

        self._psycopg2 = psycopg2
        self.dsn = dsn
        # `lock` remains public because callers use it to compose read-modify-write work.
        self.lock = threading.RLock()
        self._cache_lock = threading.RLock()
        self._cache: dict[tuple[str, str], tuple[float, Any]] = {}
        self._all_cache: dict[str, tuple[float, dict[str, Any]]] = {}
        self._pool = ThreadedConnectionPool(1, 5, dsn, connect_timeout=5)
        self._initialized = False
        self._init_db()

    def _checkout(self):
        """Return a live pooled connection, discarding one Neon has closed while idle."""
        conn = self._pool.getconn()
        if conn.closed:
            self._pool.putconn(conn, close=True)
            conn = self._pool.getconn()
        conn.autocommit = True
        return conn

    def _release(self, conn, broken: bool = False) -> None:
        if conn is not None:
            self._pool.putconn(conn, close=broken or bool(conn.closed))

    def _query(self, statement: str, params: tuple = (), fetch: str | None = None):
        """Execute once more after a stale pooled connection is detected."""
        errors = (self._psycopg2.OperationalError, self._psycopg2.InterfaceError)
        last_error = None
        for attempt in range(2):
            conn = None
            broken = False
            try:
                conn = self._checkout()
                with conn.cursor() as cur:
                    cur.execute(statement, params)
                    if fetch == "one":
                        return cur.fetchone()
                    if fetch == "all":
                        return cur.fetchall()
                    return cur.rowcount
            except errors as exc:
                last_error = exc
                broken = True
                if attempt:
                    raise
            finally:
                self._release(conn, broken)
        raise last_error  # pragma: no cover - the second attempt always raises

    @staticmethod
    def _copy(value: Any) -> Any:
        return copy.deepcopy(value)

    def _cached(self, key: tuple[str, str]):
        with self._cache_lock:
            item = self._cache.get(key)
            if item and item[0] > time.monotonic():
                return self._copy(item[1])
            self._cache.pop(key, None)
        return None

    def _cache_get(self, collection: str, key: str, value: Any) -> None:
        with self._cache_lock:
            self._cache[(collection, key)] = (
                time.monotonic() + self.CACHE_TTL_SECONDS,
                self._copy(value),
            )

    def _invalidate_all(self, collection: str) -> None:
        with self._cache_lock:
            self._all_cache.pop(collection, None)

    def _init_db(self) -> None:
        with self.lock:
            if self._initialized:
                return
            self._query("""
                CREATE TABLE IF NOT EXISTS kv_store (
                    collection TEXT NOT NULL,
                    key TEXT NOT NULL,
                    value JSONB NOT NULL,
                    PRIMARY KEY (collection, key)
                )
            """)
            self._initialized = True

    def get(self, collection: str, key: str, default: Any = None) -> Any:
        cached = self._cached((collection, key))
        if cached is not None:
            return cached
        with self._cache_lock:
            listed = self._all_cache.get(collection)
            if listed and listed[0] > time.monotonic():
                return self._copy(listed[1].get(key, default))
        row = self._query(
            "SELECT value FROM kv_store WHERE collection = %s AND key = %s",
            (collection, key), fetch="one",
        )
        if row is None:
            return self._copy(default)
        val = json.loads(row[0]) if isinstance(row[0], str) else row[0]
        self._cache_get(collection, key, val)
        return self._copy(val)

    def all(self, collection: str) -> dict[str, Any]:
        with self._cache_lock:
            cached = self._all_cache.get(collection)
            if cached and cached[0] > time.monotonic():
                return self._copy(cached[1])
        rows = self._query(
            "SELECT key, value FROM kv_store WHERE collection = %s",
            (collection,), fetch="all",
        )
        result = {k: json.loads(v) if isinstance(v, str) else v for k, v in rows}
        expires = time.monotonic() + self.CACHE_TTL_SECONDS
        with self._cache_lock:
            self._all_cache[collection] = (expires, self._copy(result))
            for key, value in result.items():
                self._cache[(collection, key)] = (expires, self._copy(value))
        return self._copy(result)

    def put(self, collection: str, key: str, value: Any) -> None:
        payload = json.dumps(value, ensure_ascii=False)
        self._query("""
            INSERT INTO kv_store (collection, key, value)
            VALUES (%s, %s, %s::jsonb)
            ON CONFLICT (collection, key)
            DO UPDATE SET value = EXCLUDED.value
        """, (collection, key, payload))
        self._cache_get(collection, key, value)
        self._invalidate_all(collection)

    def remove(self, collection: str, key: str) -> bool:
        deleted = self._query(
            "DELETE FROM kv_store WHERE collection = %s AND key = %s",
            (collection, key),
        ) > 0
        with self._cache_lock:
            self._cache.pop((collection, key), None)
        self._invalidate_all(collection)
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
