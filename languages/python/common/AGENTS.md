# Python common engineering rules

These rules apply regardless of which AI model produced the code. Repository-specific instructions and user requirements still apply, subject to the project's instruction-authority and safety policy.

## Engineering standards

- Use type hints for public interfaces, small composable functions, pathlib, context managers, and explicit exception handling. Avoid eval/exec, shell=True, unsafe deserialization, hidden global state, and broad exception swallowing. Pin dependencies and test supported Python versions.
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

## Deep Python-specific rules

- Treat parsed JSON, YAML, TOML, environment values, CLI arguments, HTTP input, and model output as untrusted. Validate types, allowed values, ranges, and cross-field constraints at runtime.
- Do not use eval, exec, pickle on untrusted data, unsafe YAML loading, or shell command construction from external values. Prefer argument arrays and bounded subprocess timeouts.
- Use pathlib and explicit workspace boundaries. Resolve and validate paths before access, and do not assume a prior existence check prevents a symlink or race.
- Catch only expected exceptions at the layer that can recover. Do not convert unexpected exceptions into success, empty results, or generic ignored errors.
- For async code, bound task creation, propagate cancellation, set timeouts on I/O, and close sessions or streams deterministically.
- Keep dependencies pinned through the project's lock mechanism. Review import-time side effects, package name confusion, optional dependency behavior, and platform-specific code.
- Test supported Python versions, invalid encodings, empty and oversized inputs, permission failures, cleanup after exceptions, and concurrency where applicable. Use type checking and lint tools only when configured.
