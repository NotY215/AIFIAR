# Language instruction packs

AIFIAR separates language engineering rules from AI-provider workflow guidance. These packs are AIFIAR features, not universal rules that automatically apply to every model conversation or every target repository.

## Layout

```text
languages/
  cpp/
    common/AGENTS.md
    openai/INSTRUCTIONS.md
    anthropic/INSTRUCTIONS.md
    gemini/INSTRUCTIONS.md
    xai/INSTRUCTIONS.md
  python/
    common/AGENTS.md
    ...
```

Each supported language has a `common/AGENTS.md` file. Provider-specific files add workflow guidance. Current packs cover C, C++, Python, TypeScript, JavaScript, C#, Java, Rust, Go, PHP, Ruby, shell, and SQL. Provider packs cover OpenAI, Anthropic, Gemini, xAI, Qwen general analysis, Qwen Code coding, and local/self-hosted models. Qwen and Qwen Code have separate language-specific files because their task profiles differ.

## Shared AI coding checklist

Use [AI-CODING-RULES.md](AI-CODING-RULES.md) for cross-language guidance on inspecting code, preserving requirements, making focused changes, testing, and reporting evidence. Each language's `common/AGENTS.md` links to this checklist. Provider-specific instructions must be limited to the active AI provider/model family and must not be substituted with another model's instructions. Qwen general analysis and Qwen Code use separate packs.

## Runtime integration

The AIFIAR repository workflow injects detected language rules during context assembly, then adds only the selected provider's workflow rules after routing. See the [runtime integration guide](../docs/language-rules-integration.md). Hosts can use explicit per-task language overrides for mixed or ambiguous files.

## Language acceptance criteria

Use [the language acceptance matrix](../docs/language-acceptance-matrix.md) alongside relevant common rules for language-specific security, testing, and release gates. The matrix is a checklist, not evidence that a check ran or that a host execution boundary is secure.

## Applying the rules

1. Use these packs when developing AIFIAR, when the host workflow explicitly injects them, or when the user asks to apply them to a target project.
2. Identify the languages actually in scope and read only the relevant common and provider packs.
3. For mixed-language changes, apply each relevant pack. Project instructions and host security policy still apply.
4. Treat these files as guidance, not a substitute for sandboxing, authorization, code review, tests, or operating-system controls.

AI-specific files cannot override higher-priority instructions or grant permission to execute code. Never claim production security solely because an instruction file exists.

## Language check helper

`python scripts/language_checks.py --language cpp --root .` prints detected checks without executing them. Add `--execute` only in a trusted checkout after reviewing the project's test/build scripts. It uses explicit argument arrays without a shell, limits execution time, and does not run arbitrary files by extension.

The helper detects standard project conventions. It does not install compilers or dependencies, guarantee complete test coverage, or provide a security sandbox. Wrappers are available under `scripts/languages/` for common languages. Run them from the AIFIAR checkout and pass the target project root as the first argument. Review detected commands before execution.

See [the production readiness checklist](../docs/production-readiness.md) for controls that still block a production deployment.
