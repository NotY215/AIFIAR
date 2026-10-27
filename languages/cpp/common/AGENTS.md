# C++ common engineering rules

These rules apply regardless of which AI model produced the code. Repository-specific instructions and user requirements still apply, subject to the project's instruction-authority and safety policy.

## Engineering standards

- Use RAII, value semantics, const-correctness, explicit ownership, and standard-library facilities. Avoid raw owning pointers, undefined behavior, data races, and global mutable state. Treat compiler warnings as defects. Use sanitizers in development and document supported compiler/standard versions.
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

## Deep C++-specific rules

- Prefer value semantics, RAII, standard containers, smart pointers, and explicit ownership. A raw pointer should normally express a non-owning view, not ambiguous ownership.
- Review object lifetime across references, iterators, spans, callbacks, coroutines, and asynchronous tasks. Do not retain views into temporaries or containers that may reallocate.
- Define exception guarantees for operations that mutate state. Keep invariants valid when constructors, moves, allocation, callbacks, or destructors fail.
- Treat narrowing conversions, signed/unsigned comparisons, invalidated iterators, use-after-move, uninitialized storage, and undefined behavior as defects.
- For concurrency, define synchronization and ownership rules. Avoid lock-order cycles, callbacks while holding locks, unbounded thread creation, and unsynchronized shared mutable state.
- Keep reinterpret_cast, placement new, manual lifetime management, and custom allocators narrowly scoped with documented invariants and targeted tests.
- Verify the declared C++ standard and supported compiler versions. Run CTest only when configured, and use sanitizers or fuzzing when compatible with the project.
