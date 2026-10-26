from __future__ import annotations

import hashlib
import re
from pathlib import Path, PurePosixPath
from typing import Any

SECRET_RE = re.compile(
    r"-----BEGIN (?:[A-Z0-9 ]+ )?PRIVATE KEY-----|\bgh[pousr]_[A-Za-z0-9_]{20,}\b|"
    r"\bAKIA[0-9A-Z]{16}\b|\bBearer\s+[A-Za-z0-9._~+/-]{16,}=*|"
    r"\b(?:api[_-]?key|access[_-]?token|client[_-]?secret|password|pwd)\s*[:=]\s*['\"]?[^\s;,'\"]{16,}",
    re.I,
)
SENSITIVE_PARTS = {".env", ".ssh", ".aws", ".gnupg", "secrets", "credentials"}
SENSITIVE_NAMES = {"id_rsa", "id_ed25519", "known_hosts", "credentials", "secrets.json"}


def _relative_safe(value: str) -> bool:
    if not value or "\x00" in value or "\\" in value:
        return False
    path = PurePosixPath(value)
    reserved = {"CON", "PRN", "AUX", "NUL", *(f"COM{i}" for i in range(1, 10)), *(f"LPT{i}" for i in range(1, 10))}
    if path.is_absolute() or re.match(r"^[A-Za-z]:", value):
        return False
    for part in path.parts:
        stem = part.split(".", 1)[0].upper()
        if part in {"", ".", ".."} or ":" in part or part.endswith((" ", ".")) or stem in reserved:
            return False
    return True


def _resolve_inside(root: Path, relative: str) -> Path:
    if not _relative_safe(relative):
        raise ValueError("Unsafe relative path: " + relative)
    candidate = root.joinpath(*PurePosixPath(relative).parts)
    current = root
    for part in PurePosixPath(relative).parts:
        current = current / part
        if current.is_symlink():
            raise ValueError("Symlink path is not permitted: " + relative)
    resolved = candidate.resolve(strict=False)
    if resolved != root and root not in resolved.parents:
        raise ValueError("Path escapes repository root: " + relative)
    return candidate


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def check_freshness(root: str | Path, manifest: dict[str, Any], *, require_exact_set: bool = False) -> dict[str, Any]:
    base = Path(root).resolve(strict=True)
    if not base.is_dir():
        raise ValueError("Repository root must be a directory.")
    planned = manifest.get("planned_files")
    if not isinstance(planned, list):
        raise ValueError("Manifest must contain a planned_files array.")

    blockers: list[str] = []
    changed: list[str] = []
    missing: list[str] = []
    seen: set[str] = set()
    for entry in planned:
        if not isinstance(entry, dict) or not isinstance(entry.get("path"), str) or not isinstance(entry.get("sha256"), str):
            blockers.append("Each planned file needs a path and sha256.")
            continue
        rel, expected = entry["path"], entry["sha256"].lower()
        if rel in seen:
            blockers.append("Duplicate planned path: " + rel)
            continue
        seen.add(rel)
        try:
            path = _resolve_inside(base, rel)
            if not path.is_file():
                missing.append(rel)
                blockers.append("Planned file is missing: " + rel)
            elif not re.fullmatch(r"[0-9a-f]{64}", expected):
                blockers.append("Invalid SHA-256 value for: " + rel)
            elif sha256_file(path) != expected:
                changed.append(rel)
                blockers.append("File changed since planning: " + rel)
        except (OSError, ValueError) as exc:
            blockers.append(str(exc))

    unexpected: list[str] = []
    if require_exact_set:
        for rel in manifest.get("apply_paths", []):
            if isinstance(rel, str) and rel not in seen:
                unexpected.append(rel)
                blockers.append("Apply path is not in planned file set: " + rel)

    return {
        "allowed": not blockers,
        "changed": sorted(changed),
        "missing": sorted(missing),
        "unexpected": sorted(unexpected),
        "blockers": sorted(set(blockers)),
    }


def validate_patch_manifest(manifest: dict[str, Any], *, approved_sensitive_paths: bool = False, max_files: int = 500, max_content_bytes: int = 5 * 1024 * 1024) -> dict[str, Any]:
    changes = manifest.get("changes")
    if not isinstance(changes, list):
        raise ValueError("Patch manifest must contain a changes array.")
    errors: list[str] = []
    warnings: list[str] = []
    seen: set[str] = set()
    total_bytes = 0
    if len(changes) > max_files:
        errors.append("Patch exceeds maximum file count.")
    for item in changes:
        if not isinstance(item, dict) or not isinstance(item.get("path"), str):
            errors.append("Each change must be an object with a path.")
            continue
        path = item["path"]
        operation = item.get("operation", "modify")
        if not _relative_safe(path):
            errors.append("Unsafe patch path: " + path)
            continue
        if path in seen:
            errors.append("Duplicate patch target: " + path)
        seen.add(path)
        if operation not in {"create", "modify", "delete"}:
            errors.append("Unsupported operation for: " + path)
        if operation == "delete" and manifest.get("allow_deletions") is not True:
            errors.append("Deletion is not enabled: " + path)
        parts = set(PurePosixPath(path).parts)
        basename = path.split("/")[-1].lower()
        if basename in SENSITIVE_NAMES or basename.startswith(".env") or any(part.lower() in SENSITIVE_PARTS for part in parts):
            warnings.append("Sensitive path requires review: " + path)
        content = item.get("content", "")
        if not isinstance(content, str):
            errors.append("Patch content must be text: " + path)
            continue
        total_bytes += len(content.encode("utf-8"))
        if SECRET_RE.search(content):
            errors.append("Potential credential material detected in patch content: " + path)
    if total_bytes > max_content_bytes:
        errors.append("Patch exceeds maximum content size.")
    if warnings and not approved_sensitive_paths:
        errors.append("Sensitive paths require explicit approval.")
    return {
        "allowed": not errors,
        "file_count": len(changes),
        "content_bytes": total_bytes,
        "errors": sorted(set(errors)),
        "warnings": sorted(set(warnings)),
    }
