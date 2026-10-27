# C common engineering rules

These rules apply regardless of which AI model produced the code. Repository-specific instructions and user requirements still apply, subject to the project's instruction-authority and safety policy.

## Engineering standards

- Use explicit ownership contracts, checked allocation and arithmetic, bounds-safe APIs, and a single cleanup path where appropriate. Avoid undefined behavior, unchecked format strings, unsafe string operations, data races, and silent truncation. Enable strong compiler warnings and sanitizers.
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

## Deep C-specific rules

- Check every allocation-size expression before multiplication or addition. Reject values that exceed SIZE_MAX, destination capacity, protocol limits, or documented application limits.
- Track pointer ownership and lifetime at every API boundary. Document whether pointers may be null, whether buffers are borrowed or transferred, and who releases each allocation.
- Treat signed overflow, invalid shifts, misaligned access, use-after-free, out-of-bounds pointer arithmetic, uninitialized reads, and data races as correctness defects, not merely compiler warnings.
- Prefer length-aware APIs over implicit NUL termination. Validate format strings, variadic argument types, integer narrowing, encoding assumptions, and truncation behavior.
- On every error path, release acquired resources exactly once and preserve the original error where possible. Test allocation failures and partial initialization.
- For parsers and binary formats, validate length, offset, count, version, and nested-size fields before dereferencing or allocating. Add fuzz targets for complex parsers.
- Where toolchains support them, use strict warnings, ASan, UBSan, static analysis, and fuzzing. Record unsupported tools rather than silently skipping them.
