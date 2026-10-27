from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "python"))

from aifiar_tools.sandbox import run_docker_sandbox


class SandboxHardeningTests(unittest.TestCase):
    def test_digest_pinning_rejects_mutable_tags_before_docker_lookup(self) -> None:
        with self.assertRaisesRegex(ValueError, "Digest-pinned image required"):
            run_docker_sandbox(".", "python:latest", ["python", "--version"], require_digest_pinned_image=True)

    def test_digest_pinning_accepts_digest_syntax(self) -> None:
        with patch("aifiar_tools.sandbox.shutil.which", return_value=None):
            result = run_docker_sandbox(".", "example/image@sha256:" + "a" * 64, ["python", "--version"], require_digest_pinned_image=True)
        self.assertFalse(result["allowed"])
        self.assertEqual(result["reason"], "Docker CLI was not found.")

    def test_read_only_workspace_uses_read_only_bind_mount(self) -> None:
        fake_process = SimpleNamespace(poll=lambda: 0, wait=lambda timeout=None: 0, returncode=0)
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            (root / "source.txt").write_text("safe", encoding="utf-8")
            with patch("aifiar_tools.sandbox.shutil.which", return_value="/usr/bin/docker"), \
                 patch("aifiar_tools.sandbox.subprocess.run", return_value=SimpleNamespace(returncode=0)), \
                 patch("aifiar_tools.sandbox.subprocess.Popen", return_value=fake_process) as popen:
                result = run_docker_sandbox(root, "reviewed:local", ["python", "--version"], read_only_workspace=True)
            self.assertTrue(result["allowed"])
            docker_args = popen.call_args.args[0]
            mount_index = docker_args.index("--mount") + 1
            self.assertTrue(docker_args[mount_index].endswith("dst=/workspace,ro"))
            self.assertIn("workspace bind mount is read-only", result["security_controls"])


if __name__ == "__main__":
    unittest.main()
