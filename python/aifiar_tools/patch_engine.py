from __future__ import annotations

import hashlib
import json
import os
import uuid
from datetime import datetime, timezone
from pathlib import Path, PurePosixPath
from typing import Any

from .audit_log import append_action_record
from .preflight import SECRET_RE, SENSITIVE_NAMES, SENSITIVE_PARTS, _relative_safe
from .recovery_store import mark_transaction_committed, prepare_recovery_snapshot
from .safe_fs import SecureWorkspace


def manifest_digest(manifest: dict[str, Any]) -> str:
    canonical = json.dumps(manifest, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    return hashlib.sha256(canonical).hexdigest()


def _sensitive_path(relative: str) -> bool:
    basename = relative.split("/")[-1].lower()
    parts = {part.lower() for part in PurePosixPath(relative).parts}
    return basename in SENSITIVE_NAMES or basename.startswith(".env") or bool(parts & SENSITIVE_PARTS)


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

    with SecureWorkspace(base) as workspace:
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
            if relative == ".aifiar-apply.lock" or relative == ".aifiar" or relative.startswith(".aifiar/"):
                blockers.append("Patch targets AIFIAR's reserved lock or audit metadata: " + relative)
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
                exists = workspace.exists(relative)
                expected = item.get("expected_sha256")
                if operation == "create":
                    if exists:
                        blockers.append("Create target already exists: " + relative)
                    if expected is not None:
                        blockers.append("Create operation must not specify expected_sha256: " + relative)
                    old = None
                    mode = 0o644
                else:
                    if not exists:
                        blockers.append("Modify/delete target is missing or not a regular file: " + relative)
                        continue
                    old, mode = workspace.read(relative)
                    if not isinstance(expected, str) or len(expected) != 64 or any(ch not in "0123456789abcdefABCDEF" for ch in expected):
                        blockers.append("Modify/delete requires expected_sha256: " + relative)
                        continue
                    if hashlib.sha256(old).hexdigest() != expected.lower():
                        blockers.append("Target changed since planning: " + relative)
                        continue
            except (OSError, ValueError) as exc:
                blockers.append("Could not safely inspect " + relative + ": " + type(exc).__name__)
                continue

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
            prepared.append({
                "path": relative, "operation": operation, "old": old, "mode": mode,
                "content": encoded, "expected": expected.lower() if isinstance(expected, str) else None,
            })

        if total_bytes > max_content_bytes:
            blockers.append("Patch exceeds maximum content size.")
        if blockers:
            return {"applied": False, "status": "blocked", "digest": digest, "blockers": sorted(set(blockers))}

        lock_path = base / ".aifiar-apply.lock"
        lock_fd: int | None = None
        applied: list[dict[str, Any]] = []
        transaction_id = uuid.uuid4().hex
        record_base = {
            "schema_version": 1,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "manifest_digest": digest,
            "transaction_id": transaction_id,
            "paths": [{"path": item["path"], "operation": item["operation"]} for item in prepared],
        }
        try:
            flags = os.O_CREAT | os.O_EXCL | os.O_WRONLY | getattr(os, "O_NOFOLLOW", 0)
            lock_fd = os.open(lock_path, flags, 0o600)
            os.write(lock_fd, (digest + "\n").encode("ascii"))
            os.fsync(lock_fd)
            os.close(lock_fd)
            lock_fd = None

            snapshot = prepare_recovery_snapshot(base, transaction_id, digest, prepared)

            for item in prepared:
                relative = item["path"]
                operation = item["operation"]
                # Recheck the expected state immediately before each mutation.
                exists = workspace.exists(relative)
                if operation == "create":
                    if exists:
                        raise ValueError("Create target appeared before apply: " + relative)
                else:
                    if not exists:
                        raise ValueError("Target disappeared before apply: " + relative)
                    current, _ = workspace.read(relative)
                    if hashlib.sha256(current).hexdigest() != item["expected"]:
                        raise ValueError("Target changed immediately before apply: " + relative)

                # Track intent before the mutation so a partial operation can be inspected during rollback.
                applied.append(item)
                if operation == "delete":
                    workspace.delete(relative)
                else:
                    workspace.atomic_write(relative, item["content"], item["mode"])

            for item in applied:
                relative = item["path"]
                if item["operation"] == "delete":
                    if workspace.exists(relative):
                        raise ValueError("Delete verification failed: " + relative)
                else:
                    current, _ = workspace.read(relative)
                    if hashlib.sha256(current).digest() != hashlib.sha256(item["content"]).digest():
                        raise ValueError("Post-apply hash verification failed: " + relative)

            record = {**record_base, "status": "applied", "verified": True}
            append_action_record(base, record)
            mark_transaction_committed(base, transaction_id, snapshot["snapshot_sha256"])
            return {
                "applied": True, "status": "applied", "digest": digest, "transaction_id": transaction_id, "recovery_snapshot": snapshot,
                "changed_paths": [item["path"] for item in applied],
                "action_log": ".aifiar/actions.jsonl",
                "race_resistant_file_ops": workspace.race_resistant,
                "note": None if workspace.race_resistant else "Platform lacks required directory-descriptor APIs; use a disposable workspace because path-based fallback cannot eliminate all races.",
            }
        except Exception as exc:
            rollback_errors: list[str] = []
            for item in reversed(applied):
                relative = item["path"]
                try:
                    exists = workspace.exists(relative)
                    operation = item["operation"]
                    if operation == "create":
                        if not exists:
                            continue
                        current, _ = workspace.read(relative)
                        if current != item["content"]:
                            rollback_errors.append("Rollback conflict, target changed after apply: " + relative)
                            continue
                        workspace.delete(relative)
                    elif operation == "modify":
                        if not exists:
                            rollback_errors.append("Rollback conflict, modified target disappeared: " + relative)
                            continue
                        current, _ = workspace.read(relative)
                        if current == item["old"]:
                            continue
                        if current != item["content"]:
                            rollback_errors.append("Rollback conflict, target changed after apply: " + relative)
                            continue
                        workspace.atomic_write(relative, item["old"], item["mode"])
                    else:
                        if exists:
                            current, _ = workspace.read(relative)
                            if current == item["old"]:
                                continue
                            rollback_errors.append("Rollback conflict, deleted target path was recreated: " + relative)
                            continue
                        workspace.atomic_write(relative, item["old"], item["mode"])

                    if item["old"] is None:
                        if workspace.exists(relative):
                            rollback_errors.append("Rollback verification failed: " + relative)
                    else:
                        restored, _ = workspace.read(relative)
                        if hashlib.sha256(restored).hexdigest() != hashlib.sha256(item["old"]).hexdigest():
                            rollback_errors.append("Rollback verification failed: " + relative)
                except Exception:
                    rollback_errors.append("Rollback failed: " + relative)

            status = "rolled-back" if not rollback_errors else "recovery-required"
            try:
                append_action_record(base, {**record_base, "status": status, "error_type": type(exc).__name__, "rollback_errors": rollback_errors})
            except Exception:
                rollback_errors.append("Could not write the action audit record.")
                status = "recovery-required"
            return {
                "applied": False, "status": status, "digest": digest, "transaction_id": transaction_id,
                "blockers": ["Patch transaction failed: " + type(exc).__name__],
                "rollback_errors": rollback_errors,
                "race_resistant_file_ops": workspace.race_resistant,
            }
        finally:
            if lock_fd is not None:
                os.close(lock_fd)
            try:
                lock_path.unlink()
            except FileNotFoundError:
                pass
