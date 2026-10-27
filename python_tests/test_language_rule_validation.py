import tempfile
import unittest
from pathlib import Path

from scripts.check_language_rules import validate_language_packs


class LanguageRuleValidationTests(unittest.TestCase):
    def _write_pack(self, root: Path, common: str) -> None:
        common_path = root / "languages" / "typescript" / "common" / "AGENTS.md"
        common_path.parent.mkdir(parents=True, exist_ok=True)
        common_path.write_text(common, encoding="utf-8")
        provider_path = root / "languages" / "typescript" / "openai" / "INSTRUCTIONS.md"
        provider_path.parent.mkdir(parents=True, exist_ok=True)
        provider_path.write_text(
            "# Provider instructions\n"
            "Apply ../common/AGENTS.md first. Preserve host authorization. "
            "Validate generated output, review the diff, and run configured checks. Keep requests bounded, preserve user requirements, and never claim checks passed without inspecting their results.\n",
            encoding="utf-8",
        )

    def test_accepts_deep_common_rules_and_provider_link(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            self._write_pack(
                root,
                "# Deep TypeScript-specific rules\n"
                "Runtime validation is mandatory. Keep noUncheckedIndexedAccess enabled.\n",
            )
            self.assertEqual(validate_language_packs(root, ("typescript",), ("openai",)), [])

    def test_rejects_common_pack_without_depth_markers(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            self._write_pack(root, "# TypeScript rules\nGeneral rules only.\n")
            errors = validate_language_packs(root, ("typescript",), ("openai",))
            self.assertTrue(any("missing required marker" in error for error in errors))


if __name__ == "__main__":
    unittest.main()
