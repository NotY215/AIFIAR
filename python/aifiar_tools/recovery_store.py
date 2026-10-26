from __future__ import annotations

import hashlib
import json
import os
import re
import secrets
import stat
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from .safe_fs import SecureWorkspace

_TXID = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$")
_MAX_MANIFEST_BYTES = 2 * 1024 * 1024
_MAX_BACKUP_BYTES = 5 * 1024 * 1024


def _canonical(value: Any) -> bytes:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")


def _sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _metadata_root(root: Path) -> Path:
    folder = root / ".aifiar"
    if folder.is_symlink():
        raise ValueError("AIFIAR metadata directory may not be a symlink.")
    folder.mkdir(mode=0o700, exist_ok=True)
    if not folder.is_dir():
        raise ValueError("AIFIAR metadata path is not a directory.")
    recovery = folder / "recovery"
    if recovery.is_symlink():
        raise ValueError("Recovery directory may not be a symlink.")
    recovery.mkdir(mode=0o700, exist_ok=True)
    if not recovery.is_dir():
        raise ValueError("Recovery path is not a directory.")
    return recovery


def _write_new(path: Path, payload: bytes, mode: int = 0o600) -> None:
    flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL | getattr(os, "O_NOFOLLOW", 0)
    fd = os.open(path, flags, mode)
    try:
        view = memoryview(payload)
        while view:
            count = os.write(fd, view)
            if count <= 0:
                raise OSError("Short write while persisting recovery data.")
            view = view[count:]
        os.fsync(fd)
    finally:
        os.close(fd)


def prepare_recovery_snapshot(
    root: str | Path,
    transaction_id: str,
    manifest_digest: str,
    changes: list[dict[str, Any]],
) -> dict[str, Any]:
    """Persist original bytes and expected before/after states before any mutation."""
    base = Path(root).resolve(strict=True)
    if not _TXID.fullmatch(transaction_id):
        raise ValueError("Invalid recovery transaction identifier.")
    if not re.fullmatch(r"[a-f0-9]{64}", manifest_digest):
        raise ValueError("Invalid approved manifest digest.")
    recovery_root = _metadata_root(base)
    transaction_dir = recovery_root / transaction_id
    transaction_dir.mkdir(mode=0o700)
    entries: list[dict[str, Any]] = []
    total_backup_bytes = 0
    try:
        for index, change in enumerate(changes):
            old = change.get("old")
            operation = change["operation"]
            content = change["content"]
            relative = change["path"]
            backup_name = None
            before_hash = None
            before_mode = None
            if old is not None:
                if not isinstance(old, bytes):
                    raise ValueError("Recovery before-image must be bytes.")
                total_backup_bytes += len(old)
                if total_backup_bytes > _MAX_BACKUP_BYTES:
                    raise ValueError("Recovery before-images exceed the configured size limit.")
                backup_name = f"before-{index:04d}.bin"
                _write_new(transaction_dir / backup_name, old)
                before_hash = _sha(old)
                before_mode = int(change["mode"])
            after_present = operation != "delete"
            after_hash = _sha(content) if after_present else None
            entries.append({
                "path": relative,
                "operation": operation,
                "before_present": old is not None,
                "before_sha256": before_hash,
                "before_mode": before_mode,
                "backup_file": backup_name,
                "after_present": after_present,
                "after_sha256": after_hash,
                "after_mode": int(change["mode"]) if after_present else None,
            })
        payload: dict[str, Any] = {
            "schema_version": 1,
            "transaction_id": transaction_id,
            "manifest_digest": manifest_digest,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "entries": entries,
        }
        record = {**payload, "snapshot_sha256": _sha(_canonical(payload))}
        encoded = _canonical(record) + b"\n"
        if len(encoded) > _MAX_MANIFEST_BYTES:
            raise ValueError("Recovery manifest exceeds the configured size limit.")
        _write_new(transaction_dir / "snapshot.json", encoded)
        dir_fd = os.open(transaction_dir, os.O_RDONLY | getattr(os, "O_DIRECTORY", 0))
        try:
            os.fsync(dir_fd)
        finally:
            os.close(dir_fd)
        parent_fd = os.open(recovery_root, os.O_RDONLY | getattr(os, "O_DIRECTORY", 0))
        try:
            os.fsync(parent_fd)
        finally:
            os.close(parent_fd)
        return {"transaction_id": transaction_id, "snapshot_sha256": record["snapshot_sha256"], "file_count": len(entries)}
    except Exception:
        # Keep incomplete directories for diagnosis; without a complete snapshot they are never recoverable.
        raise


def _load_snapshot(base: Path, transaction_id: str) -> tuple[Path, dict[str, Any]]:
    if not _TXID.fullmatch(transaction_id):
        raise ValueError("Invalid recovery transaction identifier.")
    recovery_root = _metadata_root(base)
    transaction_dir = recovery_root / transaction_id
    if transaction_dir.is_symlink() or not transaction_dir.is_dir():
        raise ValueError("Recovery transaction directory is missing or unsafe.")
    snapshot_path = transaction_dir / "snapshot.json"
    if snapshot_path.is_symlink() or not snapshot_path.is_file():
        raise ValueError("Durable recovery snapshot is missing or unsafe.")
    if snapshot_path.stat(follow_symlinks=False).st_size > _MAX_MANIFEST_BYTES:
        raise ValueError("Recovery snapshot exceeds the configured size limit.")
    record = json.loads(snapshot_path.read_text(encoding="utf-8"))
    if not isinstance(record, dict):
        raise ValueError("Recovery snapshot must be an object.")
    observed = record.pop("snapshot_sha256", None)
    if not isinstance(observed, str) or observed != _sha(_canonical(record)):
        raise ValueError("Recovery snapshot integrity check failed.")
    if record.get("schema_version") != 1 or record.get("transaction_id") != transaction_id:
        raise ValueError("Recovery snapshot identity or schema is invalid.")
    if not re.fullmatch(r"[a-f0-9]{64}", str(record.get("manifest_digest", ""))):
        raise ValueError("Recovery snapshot manifest digest is invalid.")
    entries = record.get("entries")
    if not isinstance(entries, list) or not entries or len(entries) > 500:
        raise ValueError("Recovery snapshot entries are invalid.")
    seen: set[str] = set()
    for entry in entries:
        if not isinstance(entry, dict):
            raise ValueError("Recovery snapshot entry is invalid.")
        path = entry.get("path")
        if not isinstance(path, str) or not path or path in seen:
            raise ValueError("Recovery snapshot contains an invalid or duplicate path.")
        seen.add(path)
        # SecureWorkspace applies the canonical relative-path policy.
        with SecureWorkspace(base) as workspace:
            workspace._parts(path)
        if entry.get("operation") not in {"create", "modify", "delete"}:
            raise ValueError("Recovery snapshot operation is invalid.")
        for key in ("before_present", "after_present"):
            if not isinstance(entry.get(key), bool):
                raise ValueError("Recovery snapshot presence flags are invalid.")
        for key in ("before_sha256", "after_sha256"):
            value = entry.get(key)
            if value is not None and not re.fullmatch(r"[a-f0-9]{64}", str(value)):
                raise ValueError("Recovery snapshot hash is invalid.")
        backup = entry.get("backup_file")
        if entry["before_present"]:
            if not isinstance(backup, str) or not re.fullmatch(r"before-[0-9]{4}\.bin", backup):
                raise ValueError("Recovery snapshot before-image reference is invalid.")
        elif backup is not None or entry.get("before_sha256") is not None:
            raise ValueError("Absent original file must not reference a before-image.")
    return transaction_dir, record


def mark_transaction_committed(root: str | Path, transaction_id: str, snapshot_sha256: str) -> None:
    base = Path(root).resolve(strict=True)
    transaction_dir, snapshot = _load_snapshot(base, transaction_id)
    expected = _sha(_canonical(snapshot))
    if snapshot_sha256 != expected:
        raise ValueError("Recovery snapshot identity changed before commit.")
    _write_new(transaction_dir / "COMMITTED", (expected + "\n").encode("ascii"))
    dir_fd = os.open(transaction_dir, os.O_RDONLY | getattr(os, "O_DIRECTORY", 0))
    try:
        os.fsync(dir_fd)
    finally:
        os.close(dir_fd)

def recover_transaction(root: str | Path, transaction_id: str) -> dict[str, Any]:
    """Restore only when every target is either the recorded before-state or after-state."""
    base = Path(root).resolve(strict=True)
    transaction_dir, snapshot = _load_snapshot(base, transaction_id)
    expected_snapshot_hash = _sha(_canonical(snapshot))
    committed_marker = transaction_dir / "COMMITTED"
    if committed_marker.exists():
        if committed_marker.is_symlink() or committed_marker.read_text(encoding="ascii").strip() != expected_snapshot_hash:
            raise ValueError("Committed transaction marker is invalid.")
        return {"recovered": False, "status": "committed", "transaction_id": transaction_id, "blockers": ["Transaction is committed; recovery will not roll it back."]}
    recovered_marker = transaction_dir / "RECOVERED"
    if recovered_marker.exists():
        if recovered_marker.is_symlink() or recovered_marker.read_text(encoding="ascii").strip() != expected_snapshot_hash:
            raise ValueError("Recovered transaction marker is invalid.")
        return {"recovered": True, "status": "recovered", "transaction_id": transaction_id, "restored_paths": [], "snapshot_sha256": expected_snapshot_hash}
    entries = snapshot["entries"]
    before_images: dict[str, bytes] = {}
    for entry in entries:
        if not entry["before_present"]:
            continue
        backup_path = transaction_dir / entry["backup_file"]
        if backup_path.is_symlink() or not backup_path.is_file():
            return {"recovered": False, "status": "recovery-required", "transaction_id": transaction_id, "blockers": ["A trusted before-image is missing or unsafe: " + entry["path"]]}
        if backup_path.stat(follow_symlinks=False).st_size > _MAX_BACKUP_BYTES:
            raise ValueError("Recovery before-image exceeds the configured size limit.")
        content = backup_path.read_bytes()
        if _sha(content) != entry["before_sha256"]:
            return {"recovered": False, "status": "recovery-required", "transaction_id": transaction_id, "blockers": ["Before-image hash mismatch: " + entry["path"]]}
        before_images[entry["path"]] = content

    restore: list[dict[str, Any]] = []
    conflicts: list[str] = []
    with SecureWorkspace(base) as workspace:
        for entry in entries:
            path = entry["path"]
            try:
                exists = workspace.exists(path)
                if exists:
                    current, mode = workspace.read(path)
                    current_hash = _sha(current)
                else:
                    current, mode, current_hash = None, None, None
            except (OSError, ValueError):
                conflicts.append(path + " (unsafe or unreadable current state)")
                continue
            is_before = exists == entry["before_present"] and (
                not exists or (current_hash == entry["before_sha256"] and mode == entry["before_mode"])
            )
            is_after = exists == entry["after_present"] and (
                not exists or current_hash == entry["after_sha256"]
            )
            if is_before:
                continue
            if is_after:
                restore.append(entry)
            else:
                conflicts.append(path + " (current state matches neither before-image nor expected after-state)")
        if conflicts:
            return {"recovered": False, "status": "recovery-required", "transaction_id": transaction_id, "blockers": conflicts}

        restored: list[str] = []
        try:
            for entry in reversed(restore):
                path = entry["path"]
                if entry["before_present"]:
                    workspace.atomic_write(path, before_images[path], int(entry["before_mode"]))
                elif workspace.exists(path):
                    workspace.delete(path)
                restored.append(path)
            for entry in entries:
                path = entry["path"]
                if entry["before_present"]:
                    current, mode = workspace.read(path)
                    if _sha(current) != entry["before_sha256"] or mode != entry["before_mode"]:
                        raise OSError("Restoration verification failed: " + path)
                elif workspace.exists(path):
                    raise OSError("Restoration verification failed: " + path)
        except Exception as exc:
            return {"recovered": False, "status": "recovery-required", "transaction_id": transaction_id, "restored_paths": restored, "blockers": ["Recovery was interrupted or failed: " + type(exc).__name__ + ". Re-run recovery after inspecting the workspace."]}
    _write_new(transaction_dir / "RECOVERED", (expected_snapshot_hash + "\n").encode("ascii"))
    dir_fd = os.open(transaction_dir, os.O_RDONLY | getattr(os, "O_DIRECTORY", 0))
    try:
        os.fsync(dir_fd)
    finally:
        os.close(dir_fd)
    return {"recovered": True, "status": "recovered", "transaction_id": transaction_id, "restored_paths": restored, "snapshot_sha256": expected_snapshot_hash}



def list_recovery_transactions(root: str | Path) -> dict[str, Any]:
    base = Path(root).resolve(strict=True)
    recovery_root = _metadata_root(base)
    transactions: list[dict[str, Any]] = []
    warnings: list[str] = []
    for item in sorted(recovery_root.iterdir(), key=lambda path: path.name):
        if item.is_symlink() or not item.is_dir() or not _TXID.fullmatch(item.name):
            warnings.append("Skipped unsafe recovery entry: " + item.name[:100])
            continue
        try:
            _, snapshot = _load_snapshot(base, item.name)
            expected = _sha(_canonical(snapshot))
            states: list[bool] = []
            for name in ("COMMITTED", "RECOVERED"):
                marker = item / name
                if marker.exists():
                    if marker.is_symlink() or marker.read_text(encoding="ascii").strip() != expected:
                        raise ValueError("Transaction marker integrity check failed: " + name)
                    states.append(True)
                else:
                    states.append(False)
            transactions.append({
                "transaction_id": item.name,
                "manifest_digest": snapshot["manifest_digest"],
                "file_count": len(snapshot["entries"]),
                "recovery_recorded": any(states),
                "status": "committed" if states[0] else ("recovered" if states[1] else "pending"),
            })
        except (OSError, ValueError, json.JSONDecodeError) as exc:
            warnings.append("Recovery snapshot is incomplete or invalid: " + item.name + " (" + type(exc).__name__ + ": " + str(exc)[:160] + ")")
    return {"transactions": transactions, "warnings": warnings}
