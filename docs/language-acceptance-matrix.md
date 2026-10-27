# Language-specific implementation and verification gates

This matrix supplements `languages/<language>/common/AGENTS.md`. It is an engineering checklist, not a substitute for host authorization, sandboxing, or code review. Select checks from the project's declared toolchain; never invent a build command or run a project script without the user's authorized execution policy.

## Universal acceptance gate

For every language-specific change:

1. Identify the supported language/runtime/compiler versions from repository configuration.
2. Validate all data crossing a trust boundary at runtime. Static types and prompt instructions do not validate hostile input.
3. Add tests for normal behavior, empty input, malformed input, limits, exceptions/failures, and regression cases.
4. Check dependency additions, license, lockfile, transitive risk, and secret exposure.
5. Use deterministic tests and bounded time, memory, output, and concurrency where applicable.
6. Review the final diff and verify that tests actually ran. Report skipped checks and unresolved risks.
7. Do not run generated code, database migrations, or repository-provided scripts outside the approved execution boundary.

## C

- Treat array lengths, allocation sizes, integer conversions, and arithmetic overflow as security boundaries.
- Prefer bounded APIs and explicit lengths; validate format strings and terminators.
- Document ownership, lifetime, aliasing, and error contracts for public functions.
- Test allocation failures and cleanup paths; run compiler warnings, ASan/UBSan, and fuzz targets where supported.
- Gate: tests cover boundary lengths, invalid pointers/arguments where contractually possible, arithmetic limits, and failure cleanup.

## C++

- Prefer RAII, standard containers, smart pointers, value semantics, and explicit ownership.
- Minimize raw owning pointers, global mutable state, implicit narrowing, and unbounded thread creation.
- Review iterator/reference invalidation, exception safety, data races, deadlocks, and lifetime extension.
- Build with the declared CMake/preset/toolchain; use CTest and ASan/UBSan/TSan where compatible.
- Gate: tests cover object lifetime, move/copy behavior where relevant, error paths, and concurrency invariants.

## Python

- Add type annotations to public interfaces and validate untrusted data at runtime.
- Avoid `eval`, `exec`, unsafe deserialization, `shell=True`, broad exception swallowing, and ambient credential inheritance.
- Use `pathlib`, context managers, bounded subprocess timeouts, and explicit dependency constraints.
- Test malformed input, exceptions, filesystem race assumptions, subprocess environment, and supported Python versions.
- Gate: unit tests plus static typing/lint/security tools declared by the project; do not run arbitrary files merely because they end in `.py`.

## TypeScript

- Keep strict compiler options enabled; model states with discriminated unions and narrow unknown values.
- Validate network, filesystem, configuration, model, and JSON inputs with runtime schemas at trust boundaries.
- Avoid `any`, unsafe casts, unawaited promises, unchecked indexing, and trusting compile-time types for parsed JSON.
- Test invalid schema, missing fields, excess input size, path traversal, and async rejection paths.
- Gate: typecheck, build, unit tests, and lockfile consistency.

## JavaScript

- Use explicit module boundaries and predictable async control flow.
- Avoid `eval`, dynamic code generation, prototype mutation, implicit coercion at trust boundaries, and unhandled rejections.
- Bound request/response sizes, recursion, retries, timers, and concurrent work.
- Test rejected promises, malformed JSON, missing configuration, and cancellation/timeout behavior.
- Gate: project-declared tests and lint/security checks; do not treat successful parsing as validation.

## C#

- Enable nullable reference types where feasible; use structured disposal and cancellation-aware async APIs.
- Avoid sync-over-async, unsafe deserialization, swallowed exceptions, and secrets in logs.
- Apply authorization at the service boundary; validate path and URI inputs before use.
- Test cancellation, disposal, permission failures, malformed input, and platform-specific behavior.
- Gate: `dotnet test`, analyzers, and supported target-framework builds where configured.

## Java

- Use try-with-resources, immutable data where practical, typed error handling, and bounded executors.
- Avoid unsafe deserialization, broad catch-and-ignore blocks, shared mutable state, and unbounded thread pools.
- Validate request DTOs and authorization independently of annotations or model-generated code.
- Test interruption, timeout, resource closure, malformed input, and dependency compatibility.
- Gate: Maven/Gradle tests and configured static analysis.

## Rust

- Keep `unsafe` blocks small, justified, documented, and tested against explicit invariants.
- Handle `Result` explicitly; reserve panics for violated internal invariants rather than recoverable input errors.
- Review feature flags, Send/Sync assumptions, lock ordering, FFI contracts, and resource bounds.
- Test parsers with fuzzing where useful and use Miri/sanitizers when supported by the project.
- Gate: `cargo test --workspace --all-targets`, formatting, and Clippy when configured.

## Go

- Propagate errors with context; close resources and bound goroutine lifetimes.
- Use context cancellation for I/O and long-running work; avoid data races, unbounded fan-out, and ignored errors.
- Validate decoded input and avoid trusting zero values to mean valid configuration.
- Test cancellation, concurrent access, timeouts, and cleanup; use the race detector where feasible.
- Gate: `go test ./...`, `go vet ./...`, and `go test -race ./...` where supported.

## PHP

- Use parameterized queries, context-appropriate output escaping, and explicit authorization checks.
- Avoid unsafe deserialization, dynamic code execution, interpolated SQL, and exposing exception details to users.
- Validate uploads, paths, headers, and request sizes; use Composer lockfiles and audit dependencies.
- Test authentication/authorization failures, encoding, malformed requests, and database error handling.
- Gate: Composer test scripts and configured static analysis/security checks.

## Ruby

- Avoid unsafe deserialization, `eval` on external content, shell interpolation, and unbounded background work.
- Validate request parameters, use parameterized database access, and handle exceptions without hiding failures.
- Keep dependency lockfiles current and test supported Ruby versions.
- Test timeout/cancellation, malformed input, filesystem permissions, and cleanup.
- Gate: RSpec or the repository's declared test task plus configured lint/security checks.

## Bash / POSIX shell

- Quote expansions, use arrays where available, validate positional arguments, and use explicit temporary-file handling.
- Avoid `eval`, unsafe command construction, unquoted globbing, and destructive commands with implicit defaults.
- Use traps and explicit error handling; consider `set -euo pipefail` carefully because its semantics have exceptions.
- Test paths containing spaces, empty variables, missing tools, non-zero subprocess exits, and interrupted cleanup.
- Gate: ShellCheck and syntax checks for the target shell; never execute an unknown script just to inspect it.

## SQL

- Parameterize values; allowlist dynamic identifiers because identifiers generally cannot be bound as values.
- Use least-privilege database roles, explicit transactions, bounded queries, and reversible migrations where feasible.
- Never run migrations or destructive queries against a non-disposable database without explicit approval and verified backups.
- Test rollback, concurrent updates, constraints, indexes, and representative query plans in isolated test databases.
- Gate: use the project's migration/test harness; do not guess a production database command from a `.sql` extension.

## Host execution boundary

The language check helper is a convenience detector, not a sandbox. Filtering environment variables reduces accidental credential exposure but does not make build scripts safe. A production host must enforce OS/container isolation, filesystem and network policy, resource quotas, approval, and audit outside these instruction files.
