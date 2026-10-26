# Roadmap

## Phase 0: Foundation
- [x] Repository-wide agent rules.
- [x] Instruction authority, trust classification, and protected-action policy helpers.
- [x] Requirement traceability audit with evidence checks.
- [x] Shared task, requirement, and result types.
- [x] Basic planning, routing, dependency scheduling, token accounting, patch policy, and verification helpers.
- [x] Mermaid architecture documentation.
- [x] Initial GPT and Grok instructions.

## Phase 1: Correctness and tests
- [ ] Unit tests for every core module and scheduler edge case.
- [ ] Robust state transitions and scheduler edge-case tests.
- [ ] Schema validation for plans and provider responses.
- [ ] CI for typecheck, tests, and formatting.

## Phase 2: Provider adapters
- [ ] Implement GPT adapter against a confirmed interface.
- [ ] Implement Grok adapter against a confirmed interface.
- [ ] Secure credentials and opt-in integration tests.
- [ ] Capability evaluations, availability checks, and rate-limit handling.

## Phase 3: Project understanding
- [x] Repository URL intake and structured inspection brief.
- [ ] Safe filesystem scanner and ignore rules.
- [x] Durable structured project profile storage and stale-profile detection.
- [ ] Content hashes, stale-summary detection, and repository-aware durable memory.
- [ ] Language-aware symbol indexing where practical.

## Phase 4: Safe execution
- [ ] Isolated workspaces and patch validation.
- [ ] Command allowlists, sandboxing, timeouts, and resource limits.
- [ ] Human approval UX and auditable action records.

## Phase 5: Evaluation and efficiency
- [ ] Routing-quality benchmarks.
- [ ] Actual token, latency, and cost telemetry.
- [ ] Compare single-model and multi-model outcomes.
- [ ] Cache with freshness and privacy controls.

A checked item indicates scaffold-level implementation, not that a production-ready capability is complete.
