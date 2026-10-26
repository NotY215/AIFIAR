# Roadmap

## Phase 0: Foundation
- [x] Repository-wide agent rules and provider-specific instruction scaffolds.
- [x] Instruction authority, trust classification, and protected-action policy.
- [x] Requirement traceability audit with evidence checks.
- [x] Shared task, requirement, and result types.
- [x] Planning, routing, dependency scheduling, token accounting, patch policy, and verification helpers.

## Phase 1: Correctness and tests
- [x] Python standard-library scanner, heuristic security audit, freshness preflight, and patch manifest validator.
- [x] Local repository profile generator with instruction source hashes and scan completeness.
- [x] Digest-bound patch application with expected-hash checks, atomic per-file writes, rollback attempts, and metadata-only action records.
- [x] Opt-in allowlisted command runner with no shell, process-group termination, bounded timeout, and output cap.
- [x] Optional Docker execution with no network, read-only container root, dropped capabilities, resource limits, and disposable workspace copy.
- [x] Digest-bound patch approvals, expected-hash checks, rollback attempts, and hash-chained metadata-only action logs.
- [x] Python unit tests and separate CI workflow.\n- [x] Windows CI compatibility coverage for Python safety tools; native Windows race-resistant writes remain incomplete.
- [x] Scanner safety, snapshot freshness, stale summaries, and completion gate tests.
- [x] Persistent index, patch safety, and prompt-injection audit tests.
- [x] Central action gate, file freshness gate, command policy, and secret redaction tests.
- [x] Patch transaction and multi-stage verification tests.
- [ ] Tests for every remaining core module and scheduler edge case.
- [ ] Provider response schema validation and end-to-end integration tests.

## Phase 2: Provider adapters
- [x] Implement a guarded OpenAI Chat Completions-compatible adapter with OpenAI and xAI endpoint factories.
- [x] Add bounded requests/responses, HTTPS enforcement, redaction, response validation, timeout handling, and bounded retry behavior.
- [x] Add mocked provider adapter tests without paid API calls.
- [x] Add opt-in live integration tests using credentials supplied by the host, with strict output limits and no live calls in default CI.
- [x] Add OpenAI Responses API support alongside Chat Completions.
- [x] Add provider-specific API-mode capability metadata and environment-driven runtime selection.
- [x] Add bounded model discovery for OpenAI and xAI.
- [x] Add bounded latency, outcome, token-usage, and rate-limit telemetry.

## Phase 3: Project understanding
- [x] Repository URL intake and structured inspection brief.
- [x] Safe filesystem scanner with size limits, deterministic traversal, symlink avoidance, and configurable ignore patterns.
- [x] Durable structured project profile storage and stale-profile detection.
- [x] Repository index snapshots with schema validation and bounded storage.
- [x] Content hashes, stale-summary detection, and repository snapshot comparison.
- [x] Evidence-based completion gate for requirement coverage, task results, required checks, and unresolved conflicts.
- [x] Durable repository-aware memory with persisted snapshots, file summaries, hash-based invalidation, and atomic bounded storage.
- [x] Language-aware symbol and import/call/type-use indexing for common TypeScript/JavaScript, Python, C/C++, C#, Java, Go, Rust, PHP, and Ruby files.
- [x] Task-scoped source context assembly with hash references, bounded file/total sizes, secret redaction, and provider-orchestrator integration.

## Phase 4: Safe execution
- [x] Defensive patch validation for path traversal, duplicate targets, sensitive paths, credential patterns, deletion, and size limits.
- [x] Central action gate combining protected-action policy, patch checks, workspace confirmation, and injection risk.
- [x] Fail-closed file freshness checks before edits.
- [x] Command allowlist policy with shell/network restrictions, timeout bounds, and output caps.
- [x] Secret detection and outbound redaction helpers.
- [x] Patch transaction orchestration with post-apply verification and rollback coordination.
- [x] Strict model-output patch proposal parser with bounded input, closed schemas, expected file hashes, policy validation, and canonical SHA-256 proposal digests.
- [x] Host approval callback contract that binds decisions to the exact proposal digest, checks operator/decision identifiers, and rejects expired or overlong approvals.
- [x] Approved-proposal workflow connecting host approval, repository-commit rechecks, post-approval target-hash rechecks, action preflight, and transaction verification/rollback.
- [x] Add POSIX directory-descriptor-based no-follow reads, writes, deletes, atomic replacement, and parent-directory fsync to the local patch engine.
- [x] Recheck expected hashes immediately before mutation and prevent rollback from overwriting files that changed concurrently.
- [ ] Add Windows-native handle-based safe writes and adversarial concurrent directory-rename tests; the non-POSIX fallback remains best-effort.
- [x] Signed, expiring, digest-bound approval receipts with HMAC verification and one-time decision-ID consumption; host authentication and UI remain integration responsibilities.
- [ ] Host-enforced approval UX with authenticated operator identity, exact diff rendering, authorization policy, and secure key management.
- [ ] Stronger host-specific isolation, hardened Docker profiles, and platform-native sandbox backends beyond the optional Docker runner.
- [x] Metadata-only hash-chained action records and log integrity verification.
- [x] Durable append-only, hash-chained transaction journal with fsync, bounded records, incomplete-tail handling, and unfinished-transaction discovery.
- [x] Transaction integration records apply, verification, rollback, and completion phases; uncertain apply/rollback outcomes fail closed as recovery-required.
- [x] Journal integrity, interrupted-transaction discovery, and transaction integration tests.
- [x] Python patch-engine before-images stored durably before mutation, with bounded and hash-validated snapshots.
- [x] Restart recovery for the Python patch engine, including create/modify/delete restoration, before/after-state checks, conflict refusal, and recovery CLI.
- [x] Crash-injection tests for partial apply, concurrent modification conflicts, and committed transactions.
- [x] Add TypeScript recovery coordinator contracts, terminal recovered journal phase, and conservative restart-recovery orchestration tests.
- [ ] Supply and integrate a production host adapter that persists before-images and implements race-resistant state inspection/restoration for the TypeScript workflow.

## Phase 5: Evaluation and efficiency
- [x] Multi-stage verification gate with evidence requirements.
- [ ] Routing-quality benchmarks.
- [ ] Actual token, latency, and cost telemetry.
- [ ] Compare single-model and multi-model outcomes.
- [ ] Cache with freshness and privacy controls.

A checked item indicates that the framework helper or orchestration logic exists and has tests. It does not mean that host-level sandboxing, trusted patch application, or production security is complete.
