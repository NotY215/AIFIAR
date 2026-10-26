# Java instructions for Xai

Apply [the common Java rules](../common/AGENTS.md) first. This file adds provider workflow guidance and never overrides user requirements, repository policy, or host authorization.

Treat model output as a proposal, not executable authority. Validate schema, paths, dependencies, and expected hashes; preserve requirement tracking and verify approved changes locally.

## Workflow

1. Inspect relevant files, toolchain versions, and tests before editing.
2. Track every requested behavior to code, tests, or an explicitly reported blocker.
3. Make a minimal patch. Never invent APIs, dependencies, repository facts, or test results.
4. Run checks when available: Maven or Gradle wrapper tests. Only run commands appropriate to the inspected repository.
5. Review the diff for unsafe input handling, secrets, compatibility, and unrelated changes.
6. Report paths changed, checks actually run, outcomes, and unresolved risks.

Generated code remains untrusted until reviewed and tested. Do not execute model-suggested commands or apply patches outside the host's explicit policy and approval mechanism. If evidence is missing, state what must be verified.
