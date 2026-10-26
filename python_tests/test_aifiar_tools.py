from __future__ import annotations

import hashlib
import json
import os
import tempfile
import unittest
from pathlib import Path

import sys
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "python"))

from aifiar_tools.preflight import check_freshness, validate_patch_manifest
from aifiar_tools.scanner import scan_repository
from aifiar_tools.security import audit_text, redact_text


class ScannerTests(unittest.TestCase):
    def test_scanner_hashes_files_and_skips_symlinks(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            target = root / "a.txt"
            target.write_text("hello", encoding="utf-8")
            report = scan_repository(root)
            item = next(entry for entry in report["entries"] if entry["path"] == "a.txt")
            self.assertEqual(item["sha256"], hashlib.sha256(b"hello").hexdigest())
            self.assertTrue(report["complete"])
            if hasattr(os, "symlink"):
                link = root / "linked.txt"
                try:
                    link.symlink_to(target)
                except OSError:
                    pass
                else:
                    report = scan_repository(root)
                    self.assertTrue(any(entry["kind"] == "symlink-skipped" for entry in report["entries"]))

    def test_scanner_marks_limit_as_incomplete(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            (root / "a.txt").write_text("a", encoding="utf-8")
            (root / "b.txt").write_text("b", encoding="utf-8")
            report = scan_repository(root, max_files=1)
            self.assertFalse(report["complete"])


class SecurityTests(unittest.TestCase):
    def test_audit_reports_kind_and_line_without_secret_value(self) -> None:
        findings = audit_text("safe\napi_key=ABCDEFGHIJKLMNOPQRSTUVWX")
        self.assertTrue(findings)
        self.assertTrue(all("ABCDEFGHIJKLMNOPQRSTUVWX" not in str(item) for item in findings))
        self.assertEqual(findings[0]["line"], 2)

    def test_redaction_replaces_credentials_without_returning_original_value(self) -> None:
        source = "api_key=" + "ABCDEFGHIJKLMNOPQRSTUVWX"
        result = redact_text(source)
        self.assertTrue(result["changed"])
        self.assertEqual(result["redactions"], 1)
        self.assertIn("[REDACTED]", result["text"])
        self.assertNotIn("ABCDEFGHIJKLMNOPQRSTUVWX", result["text"])

    def test_normal_text_does_not_trigger(self) -> None:
        self.assertEqual(audit_text("A normal function returns a value."), [])


class PreflightTests(unittest.TestCase):
    def test_freshness_detects_change_and_path_traversal(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            (root / "source.txt").write_text("new", encoding="utf-8")
            report = check_freshness(root, {"planned_files": [
                {"path": "source.txt", "sha256": hashlib.sha256(b"old").hexdigest()},
                {"path": "../escape", "sha256": "0" * 64},
            ]})
            self.assertFalse(report["allowed"])
            self.assertTrue(any("changed since planning" in item for item in report["blockers"]))
            self.assertTrue(any("Unsafe relative path" in item for item in report["blockers"]))

    def test_patch_manifest_rejects_secret_and_sensitive_path(self) -> None:
        report = validate_patch_manifest({"changes": [
            {"path": ".env.production", "operation": "modify", "content": "api_key=ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ123456"},
        ]})
        self.assertFalse(report["allowed"])
        self.assertTrue(any("Sensitive paths" in item for item in report["errors"]))
        self.assertTrue(any("credential" in item.lower() for item in report["errors"]))

    def test_patch_manifest_detects_generic_api_key_assignment(self) -> None:
        report = validate_patch_manifest({"changes": [
            {"path": "config.txt", "operation": "create", "content": "api_key=" + "ABCDEFGHIJKLMNOPQRSTUVWX"},
        ]})
        self.assertFalse(report["allowed"])
        self.assertTrue(any("credential material" in item.lower() for item in report["errors"]))

    def test_patch_manifest_rejects_duplicate_and_delete(self) -> None:
        report = validate_patch_manifest({"changes": [
            {"path": "a.txt", "operation": "delete"},
            {"path": "a.txt", "operation": "modify", "content": "safe"},
        ]})
        self.assertFalse(report["allowed"])
        self.assertTrue(any("Duplicate" in item for item in report["errors"]))
        self.assertTrue(any("Deletion is not enabled" in item for item in report["errors"]))


if __name__ == "__main__":
    unittest.main()
