from __future__ import annotations

import hashlib
import json
import os
import tempfile
from datetime import datetime, timezone
from pathlib import Path, PurePosixPath
from typing import Any

from .preflight import SECRET_RE, SENSITIVE_NAMES, SENSITIVE_PARTS, _relative_safe, _resolve_inside, sha256_file


def manifest_digest(manifest: dict[str, Any]) -> str:
    canonical = json.dumps(manifest, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    return hashlib.sha256(canonical).hexdigest()


def _sensitive_path(relative: str) -> bool:
    basename = relative.split("/")[-1].lower()
    parts = {part.lower() for part in PurePosixPath(relative).parts}
    return basename in SENSITIVE_NAMES or basename.startswith(".env") or bool(parts & SENSITIVE_PARTS)


def _atomic_write(path: Path, content: bytes, mode: int) -> None:
    descriptor, temporary_name = tempfile.mkstemp(prefix=".aifiar-", suffix=".tmp", dir=str(path.parent))
    temporary = Path(temporary_name)
    try:
        with os.fdopen(descriptor, "wb") as stream:
            stream.write(content)
            stream.flush()
            os.fsync(stream.fileno())
        os.chmod(temporary, mode)
        os.replace(temporary, path)
    finally:
        try:
            temporary.unlink()
        except FileNotFoundError:
            pass


def _write_action_record(root: Path, record: dict[str, Any]) -> None:
    folder = root / ".aifiar"
    if folder.is_symlink():
        raise ValueError("Action log directory may not be a symlink.")
    folder.mkdir(mode=0o700, exist_ok=True)
    log_path = folder / "actions.jsonl"
    if log_path.is_symlink():
        raise ValueError("Action log may not be a symlink.")
    payload = (json.dumps(record, sort_keys=True, ensure_ascii=False) + "\n").encode("utf-8")
    flags = os.O_WRONLY | os.O_CREAT | os.O_APPEND
    if hasattr(os, "O_NOFOLLOW"):
        flags |= os.O_NOFOLLOW
    fd = os.open(log_path, flags, 0o600)
    try:
        os.write(fd, payload)
    finally:
        os.close(fd)


def apply_patch_manifest(
    root: str | Path,
    manifest: dict[str, Any],
    *,
    approved_digest: str,
    approve_sensitive_paths: bool = False,
    allow_deletions: bool = False,
    max_files: int = 500,
    max_content_bytes: int = 5 * 1024 * 1024,
) -> dict[str, Any]:
    base = Path(root).resolve(strict=True)
    if not base.is_dir():
        raise ValueError("Workspace root must be a directory.")
    digest = manifest_digest(manifest)
    if not approved_digest or approved_digest.lower() != digest:
        return {"applied": False, "status": "blocked", "digest": digest, "blockers": ["Approval digest does not match the exact manifest."]}

    changes = manifest.get("changes")
    if not isinstance(changes, list) or not changes:
        raise ValueError("Manifest must contain a non-empty changes array.")
    if len(changes) > max_files:
        raise ValueError("Patch exceeds maximum file count.")

    blockers: list[str] = []
    prepared: list[dict[str, Any]] = []
    seen: set[str] = set()
    total_bytes = 0
    for item in changes:
        if not isinstance(item, dict) or not isinstance(item.get("path"), str):
            blockers.append("Each change must contain a string path.")
            continue
        relative = item["path"]
        operation = item.get("operation", "modify")
        if not _relative_safe(relative):
            blockers.append("Unsafe patch path: " + relative)
            continue
        if relative in seen:
            blockers.append("Duplicate patch target: " + relative)
            continue
        seen.add(relative)
        if _sensitive_path(relative) and not approve_sensitive_paths:
            blockers.append("Sensitive path requires explicit approval: " + relative)
        if operation not in {"create", "modify", "delete"}:
            blockers.append("Unsupported operation: " + relative)
            continue
        if operation == "delete" and not (allow_deletions and manifest.get("allow_deletions") is True):
            blockers.append("Deletion requires both manifest permission and explicit CLI approval: " + relative)
        try:
            target = _resolve_inside(base, relative)
        except (OSError, ValueError) as exc:
            blockers.append(str(exc))
            continue
        exists = target.exists()
        expected = item.get("expected_sha256")
        if operation == "create":
            if exists:
                blockers.append("Create target already exists: " + relative)
            if expected is not None:
                blockers.append("Create operation must not specify expected_sha256: " + relative)
            old = None
            mode = 0o644
        else:
            if not exists or not target.is_file():
                blockers.append("Modify/delete target is missing or not a regular file: " + relative)
                continue
            if not isinstance(expected, str) or len(expected) != 64:
                blockers.append("Modify/delete requires expected_sha256: " + relative)
                continue
            if sha256_file(target) != expected.lower():
                blockers.append("Target changed since planning: " + relative)
                continue
            old = target.read_bytes()
            mode = target.stat(follow_symlinks=False).st_mode & 0o777
        content = item.get("content", "")
        if operation != "delete":
            if not isinstance(content, str):
                blockers.append("Patch content must be text: " + relative)
                continue
            encoded = content.encode("utf-8")
            total_bytes += len(encoded)
            if SECRET_RE.search(content):
                blockers.append("Potential credential material detected: " + relative)
                continue
        else:
            encoded = b""
        prepared.append({"path": relative, "target": target, "operation": operation, "old": old, "mode": mode, "content": encoded})

    if total_bytes > max_content_bytes:
        blockers.append("Patch exceeds maximum content size.")
    if blockers:
        return {"applied": False, "status": "blocked", "digest": digest, "blockers": sorted(set(blockers))}

    lock_path = base / ".aifiar-apply.lock"
    lock_fd: int | None = None
    applied: list[dict[str, Any]] = []
    record_base = {
        "schema_version": 1,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "manifest_digest": digest,
        "paths": [{"path": item["path"], "operation": item["operation"]} for item in prepared],
    }
    try:
        lock_fd = os.open(lock_path, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
        os.write(lock_fd, (digest + "\n").encode("ascii"))
        os.close(lock_fd)
        lock_fd = None
        for item in prepared:
            target: Path = item["target"]
            if target.is_symlink():
                raise ValueError("Target became a symlink before apply: " + item["path"])
            if item["operation"] == "delete":
                target.unlink()
            else:
                _atomic_write(target, item["content"], item["mode"])
            applied.append(item)
        for item in applied:
            target = item["target"]
            if item["operation"] == "delete":
                if target.exists():
                    raise ValueError("Delete verification failed: " + item["path"])
            elif not target.is_file() or hashlib.sha256(target.read_bytes()).hexdigest() != hashlib.sha256(item["content"]).hexdigest():
                raise ValueError("Post-apply hash verification failed: " + item["path"])
        record = {**record_base, "status": "applied", "verified": True}
        _write_action_record(base, record)
        return {"applied": True, "status": "applied", "digest": digest, "changed_paths": [item["path"] for item in applied], "action_log": ".aifiar/actions.jsonl"}
    except Exception as exc:
        rollback_errors: list[str] = []
        for item in reversed(applied):
            try:
                target = item["target"]
                if item["old"] is None:
                    if target.exists():
                        target.unlink()
                else:
                    _atomic_write(target, item["old"], item["mode"])
                    if hashlib.sha256(target.read_bytes()).hexdigest() != hashlib.sha256(item["old"]).hexdigest():
                        rollback_errors.append("Rollback verification failed: " + item["path"])
            except Exception:
                rollback_errors.append("Rollback failed: " + item["path"])
        status = "rolled-back" if not rollback_errors else "recovery-required"
        try:
            _write_action_record(base, {**record_base, "status": status, "error_type": type(exc).__name__, "rollback_errors": rollback_errors})
        except Exception:
            rollback_errors.append("Could not write the action audit record.")
            status = "recovery-required"
        return {
            "applied": False,
            "status": status,
            "digest": digest,
            "blockers": ["Patch transaction failed: " + type(exc).__name__],
            "rollback_errors": rollback_errors,
        }
    finally:
        if lock_fd is not None:
            os.close(lock_fd)
        try:
            lock_path.unlink()
        except FileNotFoundError:
            pass
