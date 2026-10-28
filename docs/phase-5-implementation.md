# Phase 5 implementation: evaluation, efficiency, and observability

## Implemented in this branch

### Versioned routing corpus and independent verifiers
- `benchmarks/routing/v1.json` contains eight stable smoke cases for planning, review, documentation, coding/JSON contracts, testing, repository analysis, empty output, and forbidden credential-like output.
- `core/benchmarkCorpus.ts` validates imported corpora, rejects duplicate IDs/unsupported verifiers, and runs deterministic checks without calling a model.
- Results report coverage, success, weighted success, observed latency/tokens, known cost, missing cases, and invalid decisions through the existing evaluator.
- This is a regression/smoke suite, not a statistically meaningful benchmark or proof of live model quality. Real configured-model runs and domain-specific verifiers remain required.

### Repeated-run benchmark statistics
- `core/benchmarkStatistics.ts` groups recorded trials by provider/model and computes success rates, Wilson score confidence intervals at 90%, 95%, or 99%, per-case outcomes, and observed resource coverage.
- Duplicate trial IDs, invalid measurements, and invalid adequacy thresholds fail closed. Small samples and incomplete resource observations are explicitly reported.
- Default sample adequacy requires at least 30 trials across eight distinct cases, with at least three trials per case. This is an evaluation guardrail, not proof that trials are independent or representative.
- The helper does not execute providers or persist raw run evidence. A real benchmark still requires configured models, task-specific independent verifiers, stable corpus/configuration, and retained execution evidence.

### Opt-in live benchmark execution
- `core/liveBenchmarkRunner.ts` runs a validated versioned corpus against an explicitly selected provider/model, supports bounded repetitions and concurrency, invokes deterministic independent verifiers, and returns per-trial outcome, latency, redacted output, and provider-reported token usage.
- The runner refuses oversized runs, invalid options, and invalid corpora. It does not select a model implicitly or make paid calls during ordinary tests.
- `TaskResult.usage` now carries optional input/output/total token counts from OpenAI Chat Completions, OpenAI Responses, Anthropic Messages, and Gemini generateContent when those APIs return them. Missing usage stays unknown.
- Evidence is returned to the host but is not persisted automatically by the runner. Hosts may explicitly pass reports to `BenchmarkEvidenceStore` after consent/cost approval; independent review remains necessary. The deterministic smoke verifiers are not a substitute for domain-specific semantic evaluation.

### Durable benchmark evidence\n- `core/benchmarkEvidenceStore.ts` adds explicit enablement and consent gates, host-owned directory storage, redacted/bounded trial output, normalized token usage, digest checks, retention and byte/run caps, serialized writes, restrictive file modes, symlink rejection, and explicit deletion.\n- Stored reports omit caller-supplied aggregate statistics; consumers should recompute statistics from the retained trial evidence. Duplicate run IDs are rejected, and malformed or digest-invalid records are dropped during compaction.\n- The digest detects accidental or unsophisticated tampering but is not a signature or protection against an attacker who can rewrite the file and recompute hashes. Hosts still need OS access controls, backups/deletion policy, and encryption where the threat model requires it. This store is opt-in and does not execute models or grant approval.\n\n### Approval boundary hardening
- Rename approval checks now validate both source and destination against the user's allowed path scope and protected or host-managed paths.
- Missing destinations, same-path renames, and reused destinations are rejected.
- This helper evaluates authorization policy only. The host remains responsible for authentication, binding the decision to the exact proposal contents, and rechecking before applying changes.

### Adaptive model execution instructions
- `core/modelExecutionInstructions.ts` selects task-kind and provider-specific workflow guidance and derives short language reminders from scanned context references, including hash-suffixed file references.
- Model/provider instruction profiles now emphasize complete feasible work, full requirement coverage, available context/output-budget use, and honest verification for smaller model tiers as well as larger ones.
- This improves prompting discipline but cannot upgrade model weights, bypass plan/rate limits, grant tools, or guarantee parity with a more capable model. See [model performance guidance](model-performance-guidance.md).

### Dependency-aware cache invalidation
Every cache key requires fingerprints for environment, effective policy, toolchain, authorization scope, and external state, in addition to source/instruction hashes and configuration version. Hosts must hash stable, non-secret representations; never include raw credentials. The cache remains process-local, opt-in, and unsuitable for approvals, secrets, or user-specific sensitive output.

### Durable telemetry
- Persistence is opt-in and requires explicit consent.
- JSONL records use an allowlisted metadata schema and exclude prompts, completions, repository paths, raw headers, credentials, and user identifiers.
- Writes are serialized; file creation uses restrictive permissions and no-follow behavior where available; retention, event-count, and byte limits are enforced.
- Malformed/truncated records are discarded during compaction.
- This is a host-callable adapter, not automatically enabled provider-runtime behavior. Host-specific encryption, access controls, consent/legal review, and deletion procedures remain necessary.

### Detailed provider cost accounting
- `core/detailedCostEstimator.ts` supports explicit region and billing-mode identity, cached-input rates, per-request charges, rate-card effective/verified/expiry checks, and a line-item breakdown.
- Missing rates for observed cached tokens or requests produce an unknown total; an absent rate is never silently treated as free. Unknown billing mode and provisioned billing without capacity allocation also prevent a complete total.
- This remains a transparent estimate, not invoice reconciliation. Provider-specific discounts, taxes, rounding, provisioned-capacity allocation, and other unmodeled fees require verified host-supplied pricing semantics.

### Local/self-hosted runtime
The generic local provider uses the guarded OpenAI-compatible Chat Completions adapter. Loopback HTTP endpoints are allowed for a local process; non-loopback endpoints require HTTPS and an explicit key. Requests remain text-only and do not execute tools. Discovery only reports identifiers returned by the configured endpoint; context limits, tool support, quality, and pricing are not inferred.

## Validation boundaries

Unit tests use deterministic fixtures and mocked fetch responses. They do not prove live provider compatibility, billing correctness, sandbox isolation, Windows race resistance, human authentication, or production deployment readiness.
