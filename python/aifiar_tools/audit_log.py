from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
from typing import Any

GENESIS = "0" * 64
MAX_LOG_BYTES = 10 * 1024 * 1024


def _canonical(value: dict[str, Any]) -> bytes:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")


def verify_action_log(root: str | Path) -> dict[str, Any]:
    base = Path(root).resolve(strict=True)
    folder = base / ".aifiar"
    log_path = folder / "actions.jsonl"
    if not log_path.exists():
        return {"valid": True, "records": 0, "last_hash": GENESIS, "errors": []}
    if folder.is_symlink() or log_path.is_symlink():
        return {"valid": False, "records": 0, "last_hash": None, "errors": ["Audit log path may not contain symlinks."]}
    if log_path.stat(follow_symlinks=False).st_size > MAX_LOG_BYTES:
        return {"valid": False, "records": 0, "last_hash": None, "errors": ["Audit log exceeds size limit."]}

    previous = GENESIS
    errors: list[str] = []
    records = 0
    try:
        lines = log_path.read_text(encoding="utf-8").splitlines()
    except (OSError, UnicodeError):
        return {"valid": False, "records": 0, "last_hash": None, "errors": ["Audit log could not be read as UTF-8."]}
    for number, line in enumerate(lines, start=1):
        try:
            record = json.loads(line)
            if not isinstance(record, dict):
                raise ValueError("record is not an object")
            observed_hash = record.pop("record_hash", None)
            observed_previous = record.get("previous_hash")
            if observed_previous != previous:
                raise ValueError("previous hash does not match")
            expected_hash = hashlib.sha256(_canonical(record)).hexdigest()
            if observed_hash != expected_hash:
                raise ValueError("record hash does not match")
            previous = observed_hash
            records += 1
        except (json.JSONDecodeError, ValueError, TypeError) as exc:
            errors.append(f"Line {number}: {str(exc)[:160]}")
            break
    return {"valid": not errors, "records": records, "last_hash": previous if not errors else None, "errors": errors}


def append_action_record(root: str | Path, record: dict[str, Any]) -> dict[str, Any]:
    base = Path(root).resolve(strict=True)
    folder = base / ".aifiar"
    if folder.is_symlink():
        raise ValueError("Action log directory may not be a symlink.")
    folder.mkdir(mode=0o700, exist_ok=True)
    log_path = folder / "actions.jsonl"
    if log_path.is_symlink():
        raise ValueError("Action log may not be a symlink.")
    check = verify_action_log(base)
    if not check["valid"]:
        raise ValueError("Existing action log failed integrity verification.")
    entry = dict(record)
    entry["previous_hash"] = check["last_hash"]
    entry["record_hash"] = hashlib.sha256(_canonical(entry_without_hash(entry))).hexdigest()
    payload = (_canonical(entry).decode("utf-8") + "\n").encode("utf-8")
    if log_path.exists() and log_path.stat(follow_symlinks=False).st_size + len(payload) > MAX_LOG_BYTES:
        raise ValueError("Action log size limit reached.")
    flags = os.O_WRONLY | os.O_CREAT | os.O_APPEND
    if hasattr(os, "O_NOFOLLOW"):
        flags |= os.O_NOFOLLOW
    fd = os.open(log_path, flags, 0o600)
    try:
        written = os.write(fd, payload)
        if written != len(payload):
            raise OSError("Short write while appending action log.")
    finally:
        os.close(fd)
    return entry


def entry_without_hash(entry: dict[str, Any]) -> dict[str, Any]:
    return {key: value for key, value in entry.items() if key != "record_hash"}
