#!/usr/bin/env python3
"""Validate language/provider packs and required language-specific safety depth."""
from __future__ import annotations
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
LANGUAGES = ("bash", "c", "cpp", "csharp", "go", "java", "javascript", "php", "python", "ruby", "rust", "sql", "typescript")
PROVIDERS = ("openai", "anthropic", "gemini", "xai", "local")
COMMON_RULE_MARKERS = {
    "bash": ("deep bash and posix shell rules", "mktemp", "cleanup"),
    "c": ("deep c-specific rules", "allocation-size", "fuzz"),
    "cpp": ("deep c++-specific rules", "raii", "iterator"),
    "csharp": ("deep c#-specific rules", "cancellation", "nullable"),
    "go": ("deep go-specific rules", "goroutine", "context.context"),
    "java": ("deep java-specific rules", "try-with-resources", "interruption"),
    "javascript": ("deep javascript-specific rules", "prototype-pollution", "promise"),
    "php": ("deep php-specific rules", "parameterized", "output"),
    "python": ("deep python-specific rules", "pickle", "subprocess"),
    "ruby": ("deep ruby-specific rules", "marshal.load", "shell"),
    "rust": ("deep rust-specific rules", "unsafe", "result"),
    "sql": ("deep sql-specific rules", "least-privilege", "transaction"),
    "typescript": ("deep typescript-specific rules", "runtime validation", "noUncheckedIndexedAccess")
}


def validate_language_packs(
    root: Path = ROOT,
    languages: tuple[str, ...] = LANGUAGES,
    providers: tuple[str, ...] = PROVIDERS
) -> list[str]:
    errors: list[str] = []
    for language in languages:
        common = root / "languages" / language / "common" / "AGENTS.md"
        if not common.is_file() or common.stat().st_size < 150:
            errors.append(f"missing or too-small common rules: {common.relative_to(root)}")
        else:
            common_text = common.read_text(encoding="utf-8").lower()
            for marker in COMMON_RULE_MARKERS[language]:
                if marker.lower() not in common_text:
                    errors.append(f"common rules missing required marker {marker!r}: {common.relative_to(root)}")
        for provider in providers:
            instruction = root / "languages" / language / provider / "INSTRUCTIONS.md"
            if not instruction.is_file() or instruction.stat().st_size < 150:
                errors.append(f"missing or too-small provider instructions: {instruction.relative_to(root)}")
                continue
            text = instruction.read_text(encoding="utf-8")
            if "../common/AGENTS.md" not in text:
                errors.append(f"provider instructions must link common rules: {instruction.relative_to(root)}")
            if "authorization" not in text.lower():
                errors.append(f"provider instructions must preserve host authorization: {instruction.relative_to(root)}")
    return errors


def main() -> int:
    errors = validate_language_packs()
    if errors:
        print("\n".join(errors), file=sys.stderr)
        return 1
    print(f"Validated {len(LANGUAGES)} deep language packs and {len(LANGUAGES) * len(PROVIDERS)} provider-specific instruction files.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
