#!/usr/bin/env python3
"""Validate the language/provider instruction-pack layout without network access."""
from __future__ import annotations
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
LANGUAGES = ("bash", "c", "cpp", "csharp", "go", "java", "javascript", "php", "python", "ruby", "rust", "sql", "typescript")
PROVIDERS = ("openai", "anthropic", "gemini", "xai", "local")

def main() -> int:
    errors: list[str] = []
    for language in LANGUAGES:
        common = ROOT / "languages" / language / "common" / "AGENTS.md"
        if not common.is_file() or common.stat().st_size < 150:
            errors.append(f"missing or too-small common rules: {common.relative_to(ROOT)}")
        for provider in PROVIDERS:
            instruction = ROOT / "languages" / language / provider / "INSTRUCTIONS.md"
            if not instruction.is_file() or instruction.stat().st_size < 150:
                errors.append(f"missing or too-small provider instructions: {instruction.relative_to(ROOT)}")
                continue
            text = instruction.read_text(encoding="utf-8")
            if "../common/AGENTS.md" not in text:
                errors.append(f"provider instructions must link common rules: {instruction.relative_to(ROOT)}")
            if "authorization" not in text.lower():
                errors.append(f"provider instructions must preserve host authorization: {instruction.relative_to(ROOT)}")
    if errors:
        print("\n".join(errors), file=sys.stderr)
        return 1
    print(f"Validated {len(LANGUAGES)} language packs and {len(LANGUAGES) * len(PROVIDERS)} provider-specific instruction files.")
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
