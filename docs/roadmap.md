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
- [x] Python unit tests and separate CI workflow.
- [x] Scanner safety, snapshot freshness, stale summaries, and completion gate tests.
- [x] Persistent index, patch safety, and prompt-injection audit tests.
- [x] Central action gate, file freshness gate, command policy, and secret redaction tests.
- [x] Patch transaction and multi-stage verification tests.
- [ ] Tests for every remaining core module and scheduler edge case.
- [ ] Provider response schema validation and end-to-end integration tests.

## Phase 2: Provider adapters
- [ ] Implement GPT adapter against a confirmed interface.
- [ ] Implement Grok adapter against a confirmed interface.
- [ ] Secure credentials and opt-in integration tests.
- [ ] Capability evaluations, availability checks, and rate-limit handling.

## Phase 3: Project understanding
- [x] Repository URL intake and structured inspection brief.
- [x] Safe filesystem scanner with size limits, deterministic traversal, symlink avoidance, and configurable ignore patterns.
- [x] Durable structured project profile storage and stale-profile detection.
- [x] Repository index snapshots with schema validation and bounded storage.
- [x] Content hashes, stale-summary detection, and repository snapshot comparison.
- [x] Evidence-based completion gate for requirement coverage, task results, required checks, and unresolved conflicts.
- [ ] Durable repository-aware memory with persisted index snapshots.
- [ ] Language-aware symbol indexing where practical.

## Phase 4: Safe execution
- [x] Defensive patch validation for path traversal, duplicate targets, sensitive paths, credential patterns, deletion, and size limits.
- [x] Central action gate combining protected-action policy, patch checks, workspace confirmation, and injection risk.
- [x] Fail-closed file freshness checks before edits.
- [x] Command allowlist policy with shell/network restrictions, timeout bounds, and output caps.
- [x] Secret detection and outbound redaction helpers.
- [x] Patch transaction orchestration with post-apply verification and rollback coordination.
- [ ] Trusted filesystem patch adapter with atomic writes, workspace containment, symlink protection, and concurrency controls.
- [ ] Host-enforced approval UX bound to exact patch digests.
- [ ] OS/container sandboxing, process-tree termination, network isolation, and resource limits.
- [ ] Auditable action records and recovery workflows.

## Phase 5: Evaluation and efficiency
- [x] Multi-stage verification gate with evidence requirements.
- [ ] Routing-quality benchmarks.
- [ ] Actual token, latency, and cost telemetry.
- [ ] Compare single-model and multi-model outcomes.
- [ ] Cache with freshness and privacy controls.

A checked item indicates that the framework helper or orchestration logic exists and has tests. It does not mean that host-level sandboxing, trusted patch application, or production security is complete.
