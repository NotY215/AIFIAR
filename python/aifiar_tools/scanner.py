from __future__ import annotations

import hashlib
import os
from pathlib import Path
from typing import Any

DEFAULT_IGNORES = {
    ".git", ".hg", ".svn", "node_modules", "dist", "build", "coverage",
    ".venv", "venv", "__pycache__", ".mypy_cache", ".pytest_cache",
    ".next", ".turbo"
}


def _safe_relative(path: Path, root: Path) -> str:
    return path.relative_to(root).as_posix()


def scan_repository(
    root: str | Path,
    *,
    max_files: int = 100_000,
    max_file_bytes: int = 2 * 1024 * 1024,
    max_total_bytes: int = 512 * 1024 * 1024,
    ignores: set[str] | None = None,
) -> dict[str, Any]:
    """Hash regular files without following symlinks or reading file contents into the report."""
    base = Path(root).resolve(strict=True)
    if not base.is_dir():
        raise ValueError("Repository root must be a directory.")
    if min(max_files, max_file_bytes, max_total_bytes) < 1:
        raise ValueError("Scan limits must be positive.")

    ignored = DEFAULT_IGNORES | (ignores or set())
    entries: list[dict[str, Any]] = []
    errors: list[dict[str, str]] = []
    total_bytes = 0
    complete = True
    stack = [base]

    while stack:
        directory = stack.pop()
        try:
            children = sorted(os.scandir(directory), key=lambda item: item.name.casefold(), reverse=True)
        except OSError as exc:
            errors.append({"path": _safe_relative(directory, base) or ".", "error": type(exc).__name__})
            complete = False
            continue

        for child in children:
            path = Path(child.path)
            rel = _safe_relative(path, base)
            if child.name in ignored:
                continue
            try:
                if child.is_symlink():
                    entries.append({"path": rel, "kind": "symlink-skipped"})
                    continue
                if child.is_dir(follow_symlinks=False):
                    stack.append(path)
                    continue
                if not child.is_file(follow_symlinks=False):
                    entries.append({"path": rel, "kind": "special-file-skipped"})
                    continue
                info = child.stat(follow_symlinks=False)
                size = info.st_size
                if size > max_file_bytes:
                    entries.append({"path": rel, "kind": "oversize-skipped", "size": size})
                    complete = False
                    continue
                if len(entries) >= max_files:
                    complete = False
                    errors.append({"path": rel, "error": "max_files limit reached"})
                    stack.clear()
                    break
                if total_bytes + size > max_total_bytes:
                    complete = False
                    errors.append({"path": rel, "error": "max_total_bytes limit reached"})
                    stack.clear()
                    break
                digest = hashlib.sha256()
                with path.open("rb") as stream:
                    while True:
                        chunk = stream.read(1024 * 1024)
                        if not chunk:
                            break
                        digest.update(chunk)
                after = path.stat(follow_symlinks=False)
                if after.st_size != size or after.st_mtime_ns != info.st_mtime_ns:
                    complete = False
                    errors.append({"path": rel, "error": "file changed during scan"})
                    continue
                total_bytes += size
                entries.append({
                    "path": rel,
                    "kind": "file",
                    "size": size,
                    "sha256": digest.hexdigest(),
                })
            except OSError as exc:
                errors.append({"path": rel, "error": type(exc).__name__})
                complete = False

    entries.sort(key=lambda item: item["path"].casefold())
    return {
        "schema_version": 1,
        "root": str(base),
        "complete": complete,
        "file_count": sum(item["kind"] == "file" for item in entries),
        "bytes_hashed": total_bytes,
        "entries": entries,
        "errors": errors,
    }
