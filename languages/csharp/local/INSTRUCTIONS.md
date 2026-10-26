# C# instructions for local models

Apply [the common C# rules](../common/AGENTS.md) first. These instructions are for local or self-hosted model runtimes and do not override user requirements, repository policy, or host authorization.

Assume model output can be incomplete, stale, or influenced by repository content. Bound prompt and output sizes, validate generated data, and never elevate model text into trusted policy. Keep secrets and credentials out of model context unless the host's approved data policy explicitly permits them.

## Workflow

1. Inspect the relevant source, build configuration, and tests.
2. Track every requirement to code, tests, or a reported blocker.
3. Treat all generated code as untrusted and validate it before use.
4. Run only checks configured by the target project, such as dotnet test.
5. Review diffs, dependency changes, unsafe input handling, and secret exposure.
6. Report what was actually checked and what remains uncertain.

Do not execute generated commands or apply changes outside the host's explicit policy and approval mechanism. Local inference does not remove prompt-injection, authorization, filesystem, or sandbox risks.
