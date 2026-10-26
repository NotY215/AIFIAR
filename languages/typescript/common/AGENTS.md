# TypeScript common engineering rules

These rules apply regardless of which AI model produced the code. Repository-specific instructions and user requirements still apply, subject to the project's instruction-authority and safety policy.

## Engineering standards

- Keep strict typing, validate external data at runtime, use discriminated unions for state, and avoid any, unsafe casts, and unhandled promises. Preserve module conventions, explicit boundaries, deterministic tests, and dependency-lock consistency.
- Read the existing implementation, configuration, tests, and local conventions before editing. Extend the established design unless evidence supports a change.
- Make small, reviewable changes. Preserve public interfaces and backward compatibility unless the task explicitly authorizes a breaking change.
- Do not claim a build, test, benchmark, security property, or runtime behavior was verified unless it was actually run and its result inspected.
- Add regression tests for changed behavior, boundary conditions, failure paths, and security-relevant cases.
- Validate inputs at trust boundaries. Do not commit credentials, personal data, generated binaries, caches, or unrelated formatting churn.
- Prefer deterministic tests, explicit errors, bounded resource use, and observable failure states. Do not silently ignore failures.
- Explain required toolchains and report skipped checks with the reason. Never run destructive commands or modify production data without explicit authorization.

## Review checklist

- [ ] Requirements and existing instructions were inspected.
- [ ] Error paths and boundary cases were considered.
- [ ] Tests cover the change and relevant regressions.
- [ ] Formatting, lint, static analysis, and build checks were run where available.
- [ ] Dependencies, secrets, permissions, and compatibility were reviewed.
- [ ] Final report separates verified facts from remaining risks.
