from __future__ import annotations

import re
from pathlib import Path
from typing import Any

SECRET_PATTERNS: tuple[tuple[str, re.Pattern[str]], ...] = (
    ("private-key", re.compile(r"-----BEGIN (?:[A-Z0-9 ]+ )?PRIVATE KEY-----")),
    ("github-token", re.compile(r"\bgh[pousr]_[A-Za-z0-9_]{20,}\b")),
    ("aws-access-key", re.compile(r"\bAKIA[0-9A-Z]{16}\b")),
    ("bearer-token", re.compile(r"\bBearer\s+[A-Za-z0-9._~+/-]{16,}=*", re.I)),
    ("credential-assignment", re.compile(
        r"\b(?:api[_-]?key|access[_-]?token|client[_-]?secret|password|pwd)\s*[:=]\s*['\"]?[^\s;,'\"]{16,}",
        re.I,
    )),
)
INJECTION_PATTERNS: tuple[tuple[str, re.Pattern[str]], ...] = (
    ("instruction-override", re.compile(r"ignore (?:all )?(?:previous|prior|above) instructions", re.I)),
    ("secret-exfiltration", re.compile(r"(?:reveal|print|send|exfiltrate|upload).{0,60}(?:secret|token|credential|system prompt)", re.I)),
    ("tool-manipulation", re.compile(r"(?:disable|bypass|override).{0,50}(?:security|approval|policy|permission)", re.I)),
    ("hidden-prompt-request", re.compile(r"(?:show|reveal|dump).{0,40}(?:hidden|system|developer) prompt", re.I)),
)
TEXT_SUFFIXES = {
    ".py", ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".json", ".yml",
    ".yaml", ".toml", ".ini", ".cfg", ".conf", ".md", ".txt", ".sh", ".ps1",
    ".bat", ".cmd", ".html", ".css", ".xml", ".env", ".example"
}
DEFAULT_IGNORES = {
    ".git", "node_modules", "dist", "build", ".venv", "venv", "__pycache__",
    "coverage", ".next", ".turbo"
}


def audit_text(text: str) -> list[dict[str, Any]]:
    findings: list[dict[str, Any]] = []
    for kind, pattern in SECRET_PATTERNS:
        for match in pattern.finditer(text):
            line = text.count("\n", 0, match.start()) + 1
            findings.append({"category": "potential-secret", "kind": kind, "line": line})
    for kind, pattern in INJECTION_PATTERNS:
        for match in pattern.finditer(text):
            line = text.count("\n", 0, match.start()) + 1
            findings.append({"category": "prompt-injection-signal", "kind": kind, "line": line})
    return findings


def audit_repository(root: str | Path, *, max_files: int = 100_000, max_file_bytes: int = 2 * 1024 * 1024) -> dict[str, Any]:
    base = Path(root).resolve(strict=True)
    if not base.is_dir():
        raise ValueError("Repository root must be a directory.")
    findings: list[dict[str, Any]] = []
    errors: list[dict[str, str]] = []
    scanned = 0
    complete = True

    for path in sorted(base.rglob("*"), key=lambda item: item.as_posix().casefold()):
        try:
            rel = path.relative_to(base)
            if any(part in DEFAULT_IGNORES for part in rel.parts):
                continue
            if path.is_symlink() or not path.is_file() or path.suffix.lower() not in TEXT_SUFFIXES:
                continue
            if scanned >= max_files:
                complete = False
                errors.append({"path": ".", "error": "max_files limit reached"})
                break
            size = path.stat(follow_symlinks=False).st_size
            if size > max_file_bytes:
                complete = False
                errors.append({"path": rel.as_posix(), "error": "oversize file skipped"})
                continue
            raw = path.read_bytes()
            text = raw.decode("utf-8", errors="replace")
            scanned += 1
            for item in audit_text(text):
                findings.append({"path": rel.as_posix(), **item})
        except OSError as exc:
            complete = False
            errors.append({"path": path.relative_to(base).as_posix(), "error": type(exc).__name__})

    findings.sort(key=lambda item: (item["path"].casefold(), item["line"], item["kind"]))
    return {
        "schema_version": 1,
        "root": str(base),
        "complete": complete,
        "files_scanned": scanned,
        "finding_count": len(findings),
        "findings": findings,
        "errors": errors,
        "note": "Pattern-based results can include false positives and cannot guarantee detection of every secret or injection.",
    }
