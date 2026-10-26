from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "python"))

from aifiar_tools.patch_engine import apply_patch_manifest, manifest_digest
from aifiar_tools.preflight import check_freshness, validate_patch_manifest
from aifiar_tools.profile import build_local_profile, profile_digest
from aifiar_tools.runner import load_policy, run_allowlisted
from aifiar_tools.scanner import scan_repository
from aifiar_tools.security import audit_repository


def _load_json(path: str) -> dict[str, Any]:
    target = Path(path).resolve(strict=True)
    if target.stat().st_size > 10 * 1024 * 1024:
        raise ValueError("JSON input exceeds 10 MiB.")
    value = json.loads(target.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise ValueError("JSON input must be an object.")
    return value


def _write_report(report: dict[str, Any], output: str | None) -> None:
    rendered = json.dumps(report, indent=2, ensure_ascii=False) + "\n"
    if output:
        target = Path(output).resolve()
        target.parent.mkdir(parents=True, exist_ok=True)
        temporary = target.with_name(target.name + ".tmp")
        temporary.write_text(rendered, encoding="utf-8")
        temporary.replace(target)
    else:
        print(rendered, end="")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="AIFIAR local repository safety and verification tools.")
    sub = parser.add_subparsers(dest="command", required=True)

    scan = sub.add_parser("scan", help="Hash files without following symlinks.")
    scan.add_argument("root", nargs="?", default=".")
    scan.add_argument("--output")
    scan.add_argument("--max-files", type=int, default=100000)
    scan.add_argument("--max-file-bytes", type=int, default=2 * 1024 * 1024)
    scan.add_argument("--max-total-bytes", type=int, default=512 * 1024 * 1024)

    audit = sub.add_parser("audit", help="Scan text files for potential secrets and prompt-injection signals.")
    audit.add_argument("root", nargs="?", default=".")
    audit.add_argument("--output")
    audit.add_argument("--max-files", type=int, default=100000)
    audit.add_argument("--max-file-bytes", type=int, default=2 * 1024 * 1024)

    freshness = sub.add_parser("preflight", help="Compare current files against a SHA-256 planning manifest.")
    freshness.add_argument("root")
    freshness.add_argument("manifest")
    freshness.add_argument("--exact-set", action="store_true")
    freshness.add_argument("--output")

    patch = sub.add_parser("validate-patch", help="Validate a patch manifest without applying it.")
    patch.add_argument("manifest")
    patch.add_argument("--approve-sensitive-paths", action="store_true")
    patch.add_argument("--output")

    profile = sub.add_parser("profile", help="Build a local repository profile with instruction file hashes.")
    profile.add_argument("root", nargs="?", default=".")
    profile.add_argument("--output")

    digest = sub.add_parser("patch-digest", help="Print the digest that an explicit patch approval must match.")
    digest.add_argument("manifest")

    apply_patch = sub.add_parser("apply-patch", help="Apply a validated patch after digest-bound explicit approval.")
    apply_patch.add_argument("root")
    apply_patch.add_argument("manifest")
    apply_patch.add_argument("--approve-digest", required=True)
    apply_patch.add_argument("--approve-sensitive-paths", action="store_true")
    apply_patch.add_argument("--allow-deletions", action="store_true")
    apply_patch.add_argument("--output")

    runner = sub.add_parser("run-allowed", help="Run an exact command configured in a local JSON allowlist.")
    runner.add_argument("root")
    runner.add_argument("policy")
    runner.add_argument("argv", nargs=argparse.REMAINDER, help="Command and arguments after --")
    runner.add_argument("--output")

    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        if args.command == "scan":
            report = scan_repository(args.root, max_files=args.max_files, max_file_bytes=args.max_file_bytes, max_total_bytes=args.max_total_bytes)
            _write_report(report, args.output)
            return 0 if report["complete"] else 2
        if args.command == "audit":
            report = audit_repository(args.root, max_files=args.max_files, max_file_bytes=args.max_file_bytes)
            _write_report(report, args.output)
            return 0 if report["complete"] and report["finding_count"] == 0 else (2 if not report["complete"] else 1)
        if args.command == "preflight":
            report = check_freshness(args.root, _load_json(args.manifest), require_exact_set=args.exact_set)
            _write_report(report, args.output)
            return 0 if report["allowed"] else 1
        if args.command == "validate-patch":
            report = validate_patch_manifest(_load_json(args.manifest), approved_sensitive_paths=args.approve_sensitive_paths)
            _write_report(report, args.output)
            return 0 if report["allowed"] else 1
        if args.command == "profile":
            report = build_local_profile(args.root)
            report["profile_sha256"] = profile_digest(report)
            _write_report(report, args.output)
            return 0 if report["scan_complete"] else 2
        if args.command == "patch-digest":
            print(manifest_digest(_load_json(args.manifest)))
            return 0
        if args.command == "apply-patch":
            report = apply_patch_manifest(
                args.root,
                _load_json(args.manifest),
                approved_digest=args.approve_digest,
                approve_sensitive_paths=args.approve_sensitive_paths,
                allow_deletions=args.allow_deletions,
            )
            _write_report(report, args.output)
            return 0 if report.get("applied") else 1
        if args.command == "run-allowed":
            command = list(args.argv)
            if command and command[0] == "--":
                command.pop(0)
            if not command:
                raise ValueError("Provide the command after --.")
            report = run_allowlisted(args.root, load_policy(args.policy), command)
            _write_report(report, args.output)
            return 0 if report.get("allowed") and report.get("exit_code") == 0 and report.get("reason") is None else 1
    except (OSError, ValueError, json.JSONDecodeError) as exc:
        print(json.dumps({"error": type(exc).__name__, "message": str(exc)}), file=sys.stderr)
        return 2
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
