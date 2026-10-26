from __future__ import annotations

import hashlib
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "python"))

from aifiar_tools.patch_engine import apply_patch_manifest, manifest_digest
from aifiar_tools.profile import build_local_profile
from aifiar_tools.runner import run_allowlisted
import sys as system


class PatchEngineTests(unittest.TestCase):
    def test_wrong_digest_blocks_without_modification(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            target = root / "a.txt"
            target.write_text("old", encoding="utf-8")
            manifest = {"changes": [{"path": "a.txt", "operation": "modify", "expected_sha256": hashlib.sha256(b"old").hexdigest(), "content": "new"}]}
            result = apply_patch_manifest(root, manifest, approved_digest="0" * 64)
            self.assertFalse(result["applied"])
            self.assertEqual(target.read_text(encoding="utf-8"), "old")

    def test_apply_requires_expected_hash_and_writes_audit_record(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            target = root / "a.txt"
            target.write_text("old", encoding="utf-8")
            manifest = {"changes": [{"path": "a.txt", "operation": "modify", "expected_sha256": hashlib.sha256(b"old").hexdigest(), "content": "new"}]}
            result = apply_patch_manifest(root, manifest, approved_digest=manifest_digest(manifest))
            self.assertTrue(result["applied"])
            self.assertEqual(target.read_text(encoding="utf-8"), "new")
            self.assertTrue((root / ".aifiar" / "actions.jsonl").is_file())

    def test_sensitive_paths_require_explicit_flag_and_deletions_need_two_permissions(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            env = root / ".env"
            env.write_text("x=1", encoding="utf-8")
            manifest = {"allow_deletions": True, "changes": [{"path": ".env", "operation": "delete", "expected_sha256": hashlib.sha256(b"x=1").hexdigest()}]}
            digest = manifest_digest(manifest)
            blocked = apply_patch_manifest(root, manifest, approved_digest=digest, allow_deletions=True)
            self.assertEqual(blocked["status"], "blocked")
            allowed = apply_patch_manifest(root, manifest, approved_digest=digest, approve_sensitive_paths=True, allow_deletions=True)
            self.assertTrue(allowed["applied"])
            self.assertFalse(env.exists())

    def test_allowlisted_runner_uses_exact_argv_and_no_shell(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            argv = [system.executable, "-c", "print('ok')"]
            policy = {"commands": [{
                "executable": system.executable,
                "args_prefix": argv[1:],
                "allow_extra_args": False,
                "timeout_seconds": 5,
                "max_output_bytes": 4096
            }]}
            result = run_allowlisted(root, policy, argv)
            self.assertTrue(result["allowed"])
            self.assertEqual(result["exit_code"], 0)
            self.assertEqual(result["output"].strip(), "ok")
            denied = run_allowlisted(root, {"commands": []}, argv)
            self.assertFalse(denied["allowed"])

    def test_profile_identifies_instruction_sources_and_hashes(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            (root / "AGENTS.md").write_text("Follow project instructions.", encoding="utf-8")
            (root / "main.py").write_text("print('hi')", encoding="utf-8")
            profile = build_local_profile(root)
            self.assertTrue(profile["scan_complete"])
            self.assertEqual(profile["instruction_sources"][0]["path"], "AGENTS.md")
            self.assertEqual(len(profile["instruction_sources"][0]["sha256"]), 64)


if __name__ == "__main__":
    unittest.main()
