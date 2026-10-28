# Runtime language-rule integration

AIFIAR keeps language engineering rules separate from provider workflow rules. The runtime repository workflow now loads the applicable common rules while assembling task context, then attaches only the selected model provider's workflow pack after model routing.

## Resolution pipeline

1. Scan the target workspace using the existing bounded repository scanner. Scan the framework's language-rule root separately, defaulting to the package root inferred from the compiled module location. Hosts can override this trusted root with RepositoryContextOptions.languageInstructionRootPath. Rule text is read from scanned snapshots, not by following arbitrary paths supplied by a model.
2. Infer languages from selected source paths, task context references, and protected paths. Hosts can make ambiguous cases explicit with RepositoryContextOptions.explicitLanguagesByTask.
3. Resolve each language through core/languageInstructions.ts. The resolver validates supported language and provider identifiers, rejects unsafe roots, and returns the common and provider-specific rule paths.
4. Attach each language's common AGENTS.md rules to the task context. Common rules apply regardless of provider.
5. After routing selects a model, runPlan calls the optional prepareTask hook. runRepositoryWorkflow uses this hook to append only the matching provider's INSTRUCTIONS.md pack and its scanned content references.
6. Add the selected rule-file paths and hashes to task contextRefs so downstream freshness checks can recheck the same versions before editing.
7. Bound source and language-rule context by the configured context byte budget. Secret redaction is applied before rule content is passed to the executor.

## Host configuration

A host may explicitly identify languages when extensions are ambiguous or when a task is primarily about generated code, templates, embedded SQL, or a language not obvious from source files:

```ts
const context = await assembleRepositoryContext(memory, input, {\n  languageInstructionRootPath: "/trusted/path/to/AIFIAR",
  explicitLanguagesByTask: {
    "T-042": ["typescript", "sql"]
  },
  maxTotalBytesPerTask: 64 * 1024,
  maxLanguageInstructionBytes: 16 * 1024
});
```

The language names must be members of the supported runtime allowlist. An invalid runtime value is rejected by the resolver rather than converted into a path.

## Adaptive model execution guidance

The text adapters also call `core/modelExecutionInstructions.ts`. It adds task-kind-specific workflow guidance, a style for the selected provider only, and short language reminders inferred from context references. Since source references can include a trailing `@<sha256>` marker, the resolver strips only a recognized hash suffix before inferring the extension. Mixed-language tasks can receive multiple deduplicated reminders. Existing scanned common and provider-specific language packs remain the deeper rules; this helper does not replace them.

This prompt protocol encourages full requirement coverage and use of the available context/output budget, but it cannot add tools, permissions, model capabilities, context size, or plan entitlements. The text adapters still return proposals and do not execute commands or apply patches.

## Provider behavior

The provider identifier passed to the orchestration layer determines which provider pack is appended. The text adapter additionally applies the selected provider's concise execution style from `core/modelExecutionInstructions.ts`; it does not load other provider packs. If the provider is not one of openai, anthropic, gemini, xai, qwen, qwen-code, or local, the workflow does not pretend that another provider's pack is equivalent. It records a context note and retains the common rules.

If a rule file is missing from the scanned repository, the common pack cannot be loaded and a warning is emitted. Provider-specific instructions are optional at runtime, but the repository validator requires all configured language/provider packs to exist in this repository.

## Trust and enforcement boundaries

- Repository instructions are guidance, not system authority. They cannot override system, developer, or user requirements, authorize protected actions, or replace the host action gate.
- A model may ignore or misinterpret a rule. Critical constraints must also be enforced in trusted code, including path validation, approvals, command policy, isolation, resource limits, and verification.
- Hash references identify the scanned version. The host must recheck freshness before using a proposed patch.
- The language check helper remains dry-run by default. A detected command is not proof that the command is safe, and environment filtering is not a sandbox.
- Language inference is best-effort. Use explicitLanguagesByTask for mixed-language tasks, SQL embedded in application strings, generated sources, extensionless scripts, and ambiguous C/C++ headers.

## Acceptance criteria

- Mixed-language tasks load one common pack per detected language without duplicate language entries.
- The selected provider pack is appended only after routing and matches the selected provider.
- Unselected provider packs are not sent to the executor.
- Every injected rule file has a path and scanned content hash in contextRefs.
- Invalid language/provider identifiers and unsafe instruction roots fail closed.
- Missing packs produce a warning or an explicit provider-pack fallback note rather than silently claiming the rules were applied.
- Context remains bounded, secrets are redacted, and repository text remains subordinate to the host's trusted policy.
- Tests cover provider selection, mixed-language selection, explicit overrides, missing packs, byte budgets, and rule-file freshness references.
