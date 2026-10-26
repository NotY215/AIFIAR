# Patch Transactions and Multi-Stage Verification

## Patch transaction adapter

`executePatchTransaction` runs the unified preflight, calls a host-provided patch adapter only when preflight passes, then requires post-apply verification evidence. If verification fails or throws, it invokes the adapter's rollback method. It distinguishes blocked, failed, applied, rolled-back, and recovery-required outcomes.

The adapter is a trust boundary. Its `apply` implementation must use a disposable workspace, enforce canonical path containment, refuse symlink escapes, compare expected hashes immediately before writing, use atomic file replacement where possible, and avoid writing to the user's original workspace until the change has been validated. Its rollback implementation must verify restoration rather than simply report success.

The transaction coordinator cannot guarantee rollback if the adapter lies, the host crashes, or the filesystem is modified concurrently. For stronger guarantees, use filesystem snapshots, a temporary Git worktree, a container, or another host-managed disposable workspace.

## Verification pipeline

`evaluateVerificationPipeline` requires explicit results and evidence for requirements coverage, diff review, type checking, unit tests, security checks, and freshness by default. Integration tests and build checks can be added to the required stage list for projects that support them.

A stage must be marked passed and include evidence. Missing, skipped, blocked, failed, duplicated, or evidence-free stages prevent a clean verification result. Evidence should identify the command or check, exit status, revision, and relevant output reference. A label such as "passed" alone is not evidence.

## Suggested runtime sequence

1. Build a plan and requirement ledger.
2. Scan and hash all relevant files.
3. Run instruction and prompt-injection audits.
4. Construct a minimal patch and validate it.
5. Require user approval for sensitive or protected changes.
6. Recheck planned hashes and call `executePatchTransaction`.
7. Apply only in a disposable workspace through a trusted adapter.
8. Run the verification stages under host-enforced resource limits.
9. Recheck the diff, hashes, and repository state.
10. Accept only if the transaction and verification pipeline both pass.
11. Record rollback or recovery evidence on failure.

This layer orchestrates checks. It does not itself provide an OS sandbox, container, trusted patch engine, or command executor. Those are host responsibilities and must be implemented before enabling untrusted repository code execution.


## Local patch engine filesystem boundary

The Python patch engine now uses SecureWorkspace. On POSIX platforms with the required directory-descriptor APIs, it traverses parent directories with no-follow flags, opens regular files through parent descriptors, uses exclusive temporary files, replaces targets relative to the already-open parent directory, fsyncs file and parent directory state, and rechecks expected hashes immediately before each mutation. Rollback compares the current content with the transaction's expected before/after state and refuses to overwrite a third-party change.

The engine reports whether directory-descriptor operations were available. On platforms without those APIs, it uses a best-effort path-based fallback that rechecks symlinks but cannot eliminate every TOCTOU race. Use a disposable workspace and host-level isolation for untrusted or concurrently modified repositories. POSIX descriptor-relative operations also do not protect against every possible concurrent directory rename or a malicious process with equivalent filesystem permissions. Windows-native handle-based safe writes and adversarial concurrent-rename testing remain open work.

The JSONL transaction journal records phase transitions and identifies unfinished work after restart. It does not restore files automatically: adapter-specific recovery must verify current file state and trusted before-images before any rollback. A hash chain is not a signed tamper-proof log.
