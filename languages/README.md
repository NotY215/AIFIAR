# Language instruction packs

AIFIAR keeps language rules separate from AI-provider workflow instructions. This avoids mixing language semantics with provider behavior and lets a project select only the language and provider it uses.

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
    openai/INSTRUCTIONS.md
    ...
```

Each supported language has a `common/AGENTS.md` file. Provider-specific files link back to that common file and add only workflow guidance. Current packs cover C, C++, Python, TypeScript, JavaScript, C#, Java, Rust, Go, PHP, Ruby, shell, and SQL. Provider packs cover OpenAI, Anthropic, Gemini, xAI, and local/self-hosted models.

## Applying the rules

1. Identify the language(s) of the files being changed.
2. Read the relevant `languages/<language>/common/AGENTS.md`.
3. If a specific provider is orchestrating the task, read `languages/<language>/<provider>/INSTRUCTIONS.md`.
4. For mixed-language changes, apply each relevant language pack. Shared repository instructions and the host's security policy still apply.
5. Treat these files as guidance, not a substitute for sandboxing, authorization, code review, tests, or operating-system controls.

AI-specific files cannot override higher-authority user instructions or grant permission to execute code. Never claim production security solely because an instruction file exists.

## Language check helper

`python scripts/language_checks.py --language cpp --root .` prints detected checks without executing them. Add `--execute` only in a trusted checkout after reviewing the repository's test/build scripts. It uses explicit argument arrays without a shell, limits execution time, and does not run arbitrary files by extension.

The helper detects standard project conventions. It does not install compilers or dependencies, guarantee complete test coverage, or provide a security sandbox. Convenience wrappers are available under `scripts/languages/` for C, C++, Python, JavaScript, TypeScript, C#, Java, Rust, Go, PHP, Ruby, and shell. Run them from the AIFIAR checkout and pass the target project root as the first argument. Review the detected commands before use; wrappers opt into execution and are intended only for trusted checkouts.

See [the production readiness checklist](../docs/production-readiness.md) for controls that still block a production deployment.
