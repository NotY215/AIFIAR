# Production readiness and release blockers

AIFIAR is a framework and library, not a hosted service with a complete production deployment. Passing CI is evidence for the tested checks only. It does not certify the framework as production-safe.

## Implemented and continuously checked

- TypeScript build and automated test suite.
- Python safety-tool tests, static compilation, scanner/audit smoke checks, and Windows compatibility tests.
- Digest-bound patch proposals, approval callbacks, transaction journal, durable before-images, conservative conflict-aware local recovery, and end-to-end workflow tests.
- Language-specific common engineering rules and provider-specific workflow instructions for C, C++, Python, TypeScript, JavaScript, C#, Java, Rust, Go, PHP, Ruby, shell, and SQL.
- OpenAI, Anthropic, Gemini, and xAI instruction variants that remain subordinate to repository/user authority and host authorization.
- Opt-in language check detection and wrappers. The detector uses argument arrays without a shell, runs nothing by default, applies timeouts, and filters inherited environment variables when execution is explicitly requested. Regression tests cover the environment filter. Verify the required CI checks on the merged commit before treating the change as continuously validated.
- CodeQL analysis workflow for the implemented TypeScript/JavaScript and Python code, plus Dependabot configuration.

## Required before a production deployment

These are not solved by documentation, a successful unit-test run, or a local adapter:

1. **Filesystem security boundary:** implement and independently review native, handle-relative, race-resistant operations on supported operating systems. Add adversarial directory-rename, symlink-swap, hard-link, permission, crash, and power-loss tests. The portable Node adapter is for trusted local workspaces and is not a hostile-process boundary.
2. **Host identity and approvals:** integrate authenticated operator identity, role-based authorization, secure key management, receipt issuance, revocation/rotation, and an auditable human review interface in the actual host application.
3. **Execution isolation:** run untrusted build/test/model-generated code under a tested OS sandbox or disposable container/VM with restricted filesystem, network, credentials, CPU, memory, process count, and wall-clock limits. Verify the isolation boundary rather than trusting configuration alone.
4. **Provider reliability and privacy:** validate all provider response schemas, test timeout/retry/rate-limit behavior, redact sensitive outbound context, and document retention/consent controls. Add live integration tests as opt-in jobs with scoped credentials.
5. **Operational controls:** define a supported deployment model, secret rotation, backups and recovery drills, incident response, audit retention, dependency update policy, release signing, rollback, monitoring, and a security contact process.
6. **Release gate:** establish coverage thresholds, required branch protection and review, vulnerability triage SLAs, reproducible release artifacts, and independent security review.

## Language instruction packs

The detailed [`language acceptance matrix`](language-acceptance-matrix.md) adds per-language implementation and verification gates for C, C++, Python, TypeScript, JavaScript, C#, Java, Rust, Go, PHP, Ruby, shell, and SQL. These are review criteria, not proof of test execution.

The runtime workflow now attaches common language rules and the selected provider-specific pack to each applicable task, with rule-file hashes recorded in context references. The language rule files improve consistency but are not a security boundary. A model can ignore them. Enforce permissions, input validation, patch authorization, sandboxing, and verification in trusted code.

## Release decision

Do not advertise AIFIAR as production-ready until the blocking controls above are implemented, exercised in the deployment environment, and reviewed. Mark each item complete only with a linked test, implementation, or operational evidence.
