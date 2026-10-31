"""Tiny thread-safe JSON document store.

File layout:  { "<collection>": { "<key>": <value>, ... }, ... }
Reads return deep copies; every write is flushed atomically (temp file + rename).
Hold `db.lock` (re-entrant) around read-modify-write sequences.
"""
import copy
import json
import os
import tempfile
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from config import DB_PATH


def utcnow_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


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

