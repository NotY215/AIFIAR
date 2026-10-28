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
- [x] Python unit tests and separate CI workflow.
- [x] Windows CI compatibility coverage for Python safety tools; native Windows race-resistant writes remain incomplete.
- [x] Scanner safety, snapshot freshness, stale summaries, and completion gate tests.
- [x] Persistent index, patch safety, and prompt-injection audit tests.
- [x] Central action gate, file freshness gate, command policy, and secret redaction tests.
- [x] Patch transaction and multi-stage verification tests.
- [x] Add explicit dependency-scheduler regression tests for ready-task filtering, running-task exclusion, unresolved dependencies, self-cycles, and multi-node cycles.
- [ ] Tests for every remaining core module and scheduler edge case.
- [ ] Broaden provider response schema validation and end-to-end integration tests across all adapters.

## Phase 2: Provider adapters
- [x] Implement a guarded OpenAI Chat Completions-compatible adapter with OpenAI and xAI endpoint factories.
- [x] Add bounded requests/responses, HTTPS enforcement, redaction, response validation, timeout handling, and bounded retry behavior.
- [x] Add mocked provider adapter tests without paid API calls.
- [x] Add opt-in live integration tests using credentials supplied by the host, with strict output limits and no live calls in default CI.
- [x] Add OpenAI Responses API support alongside Chat Completions.
- [x] Add provider-specific API-mode capability metadata and environment-driven runtime selection.
- [x] Add bounded model discovery for OpenAI and xAI.
- [x] Add bounded latency, outcome, token-usage, and rate-limit telemetry.
- [x] Register Qwen general analysis and Qwen Code as separate model profiles through the guarded OpenAI-compatible adapter, with region-specific endpoint configuration, model discovery, mocked runtime tests, and coverage metadata.
- [x] Add a native text-only Gemini generateContent adapter with bounded input/output, API-key header authentication, response safety/finish-reason handling, usage telemetry, bounded model discovery, runtime configuration, mocked tests, and an opt-in live smoke test.

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
- [ ] Add Windows-native handle-based safe writes and adversarial concurrent directory-rename tests; the non-POSIX fallback remains best-effort. This is the next core security milestone after the Qwen provider integration.
- [x] Signed, expiring, digest-bound approval receipts with HMAC verification and one-time decision-ID consumption; host authentication and UI remain integration responsibilities.
- [x] Add a fail-closed host authorization policy for authenticated-principal claims, repository/task/path scope, role-based delete restrictions, protected paths, denied host metadata, duplicate targets, and bounded proposal size.
- [x] Add opt-in digest-pinned Docker image enforcement, read-only disposable-workspace mounts, and strict CPU/memory input validation with regression tests.
- [x] Add an authorized patch-workflow entry point that enforces trusted host identity claims and repository/task/path/role scope before approval, then delegates to existing digest, freshness, action-gate, transaction, and recovery checks.
- [x] Add a signed-receipt approval callback adapter that verifies and consumes one-time, digest-bound receipts in a host-owned ledger.
- [ ] Build a real host approval UI with authenticated operator identity, exact diff rendering, secure key management, key rotation, and revocation.
- [ ] Complete Windows-native handle-based operations and adversarial concurrent directory-rename/symlink-swap tests; portable fallbacks remain best-effort.
- [ ] Validate stronger host-specific isolation and platform-native sandbox backends beyond the optional Docker runner.
- [x] Metadata-only hash-chained action records and log integrity verification.
- [x] Durable append-only, hash-chained transaction journal with fsync, bounded records, incomplete-tail handling, and unfinished-transaction discovery.
- [x] Transaction integration records apply, verification, rollback, and completion phases; uncertain apply/rollback outcomes fail closed as recovery-required.
- [x] Journal integrity, interrupted-transaction discovery, and transaction integration tests.
- [x] Python patch-engine before-images stored durably before mutation, with bounded and hash-validated snapshots.
- [x] Restart recovery for the Python patch engine, including create/modify/delete restoration, before/after-state checks, conflict refusal, and recovery CLI.
- [x] Crash-injection tests for partial apply, concurrent modification conflicts, and committed transactions.
- [x] Add TypeScript recovery coordinator contracts, terminal recovered journal phase, and conservative restart-recovery orchestration tests.
- [x] Add a concrete Node workspace recovery adapter with durable before-images, expected-after hashes, conflict refusal, create/modify/delete recovery, and tests. This adapter is for trusted local workspaces and is not race-resistant against a hostile process.
- [ ] Supply and integrate a production host adapter with native race-resistant filesystem operations, trusted snapshot integrity, and OS-specific crash-safety guarantees.

## Phase 5: Evaluation and efficiency
- [x] Multi-stage verification gate with evidence requirements.
- [x] Connect task routing to capability ranking and optional recorded task-quality, latency, cost, and estimated-input-token signals; expose these signals through the orchestrator.
- [x] Add routing tests for measured-quality ranking, context eligibility, provider constraints, and deterministic tie ordering.
- [x] Add a deterministic routing benchmark evaluator for case coverage, success/weighted success, observed latency/tokens, missing cases, and invalid decisions. This is an evaluation API, not a claim that a live benchmark suite has been run.
- [x] Add repeated-run benchmark statistics with Wilson confidence intervals, per-case outcomes, strict trial/measurement validation, and explicit minimum-sample warnings. This summarizes supplied observations only; it does not satisfy the live configured-model benchmark requirement below.
- [x] Add single-model versus multi-model outcome comparison with success, latency, token, and known-cost deltas.
- [x] Add an opt-in, process-local result cache with TTL, bounded LRU capacity, source/instruction/configuration hashes, defensive cloning, and sensitive-data refusal.
- [x] Add a cost calculator that requires host-supplied rate cards with model IDs, currency, effective/verification timestamps, and HTTPS source references.\n- [x] Add detailed cost accounting with explicit region/billing-mode identity, cached-input rates, per-request charges, rate-card validity checks, line-item breakdown, and fail-closed unknown totals for unpriced usage. This is an estimate, not invoice reconciliation.
- [x] Extend bounded in-memory provider telemetry to retain traceable cost estimates and report known/unknown cost coverage by currency; reject negative usage and cost without rate-card verification metadata.
- [x] Document observed provider telemetry and explicit limits around unknown token usage and estimated cost.
- [x] Add a curated, versioned routing smoke corpus with deterministic independent verifiers and regression tests; this validates the harness, not live-model quality.
- [ ] Build and run a statistically meaningful benchmark corpus against real configured models with independent task-specific verifiers and retained execution evidence.
- [x] Add an opt-in durable metadata-only telemetry store with explicit consent, retention, byte/event bounds, and deletion tests.
- [ ] Integrate the store into a deployment host, review its privacy/legal basis, and verify provider-reported token completeness across supported API modes.
- [ ] Integrate verified, current pricing sources and account for provider-specific discounts, taxes, rounding, provisioned-capacity allocation, and billing semantics before claiming actual cost.
- [x] Require cache-key fingerprints for environment, policy, toolchain, authorization scope, and external state, with invalidation tests.
- [ ] Verify every production host supplies correct current dependency fingerprints and conservative sensitivity classification.


## Phase 6: Task-scoped agent and model guidance
- [x] Scope root agent rules to AIFIAR work or explicitly requested AIFIAR guidance, rather than unrelated conversations.
- [x] Make repository onboarding load relevant instructions and task-specific files instead of requiring every documentation file on every turn.
- [x] Clarify that AIFIAR memory, recovery stores, provider adapters, Python tools, and transaction workflows are product features, not assumptions about external agents or target repositories.
- [x] Remove mandatory skill-level and formal-plan ceremony from simple tasks while preserving requirement tracking for complex work.
- [x] Add shared GPT guidance plus separate GPT-5, GPT-5.5, GPT-5.6, GPT-6, and Astra workflow profiles with explicit allowed and not-allowed guidance.
- [x] State that model profiles are advisory, must not guess the active model, and cannot claim undocumented capabilities or override platform instructions.

A checked item indicates that the framework helper or orchestration logic exists and has tests. It does not mean that host-level sandboxing, trusted patch application, or production security is complete.


## Phase 5B: Language packs and developer checks
- [x] Add separate common engineering rules for C, C++, Python, TypeScript, JavaScript, C#, Java, Rust, Go, PHP, Ruby, shell, and SQL.
- [x] Add provider-specific workflow instructions for OpenAI, Anthropic, Gemini, and xAI under each language.
- [x] Add a language instruction-pack validator and CI coverage.
- [x] Add an opt-in, no-shell language check detector and convenience wrappers for commonly used languages.
- [x] Add a TypeScript resolver that maps source extensions to common and provider-specific instruction paths, with tests for mixed languages and traversal rejection.
- [x] Add CodeQL workflow for the implemented TypeScript/JavaScript and Python code and Dependabot configuration.
- [x] Document per-language implementation, security, and verification gates in `docs/language-acceptance-matrix.md`.
- [x] Add runtime rejection for unsupported language identifiers in the instruction path resolver, with regression tests.
- [x] Filter inherited environment variables for opt-in language-check subprocesses, with a regression test.
- [x] Expand all 13 common language packs with deeper language-specific safety, correctness, and testing gates.
- [x] Add distinct Qwen analysis and Qwen Code implementation instruction packs for every supported language and resolve them through the runtime language-instruction selector.
- [x] Inject common language rules from a separately scanned framework rules root and provider-specific rules after model routing.
- [x] Track rule-file hashes in task context references and test provider-matched injection.
- [x] Validate required depth markers for each common language pack in CI.

## Model/provider coverage expansion
- [x] Add OpenAI and xAI provider-specific workflow guidance alongside existing GPT/Grok family guidance.
- [x] Add a cross-provider AIFIAR onboarding guide with a reusable bootstrap prompt, setup steps, permission boundaries, and provider-specific notes; link setup instructions from each model/provider profile.
- [x] Add Anthropic/Claude, Google Gemini, and local/self-hosted workflow guidance with explicit not-allowed and limitation sections.
- [x] Add `models/provider-coverage.json` to distinguish guidance-only providers from implemented adapters and supported API modes.
- [x] Implement and test the Anthropic and Gemini runtime adapters before advertising those providers as selectable.
- [x] Implement a text-only generic local/self-hosted OpenAI-compatible runtime adapter with loopback HTTP restriction, HTTPS for remote endpoints, explicit remote key, mocked tests, and bounded model discovery.
- [x] Add bounded Gemini model discovery and capability tests for models advertising generateContent support.
- [ ] Add verified model metadata discovery and capability tests for every remaining runtime, including schema, context, tools, limits, and usage behavior.

## Remaining Phase 0-5 work that needs a real host or external evidence

The unchecked Phase 1, Phase 4, Phase 5, model-discovery, and production-release items above are intentionally not marked complete by repository-only edits. In particular, native Windows race resistance requires platform-specific implementation and adversarial testing; authenticated approval requires a real host identity provider and UI; production isolation requires a deployment boundary; live model benchmarking requires configured models, independent task verifiers, and retained evidence; pricing and telemetry claims require verified provider/host data. Unit tests and instruction packs cannot satisfy these external gates.

## Production release gate
- [ ] Implement and independently review native race-resistant filesystem operations for supported operating systems, including adversarial race-injection tests.
- [x] Run the resolver and environment-filter regression tests in CI; TypeScript checks and Python safety-tool tests passed on the integration branch. Reconfirm required checks on the final merged commit.
- [ ] Integrate real authenticated operator identity, trusted role mapping, key rotation, revocation, and a human approval UI into a real host application. The new authorization helper evaluates trusted claims but does not authenticate users.
- [ ] Validate production-grade isolation for untrusted code and generated build/test commands.
- [ ] Complete provider schema, reliability, privacy, telemetry, and live integration validation.
- [x] Define an operations/release runbook for secret handling, telemetry privacy, recovery drills, incident response, and release evidence.
- [ ] Execute backup/restore drills, configure monitoring and branch protection, implement release signing, and validate vulnerability response in the target deployment.
- [ ] Obtain independent security review and link evidence for every release gate item.

See [Production readiness](production-readiness.md). Instruction files and passing CI are not substitutes for enforced security controls.
