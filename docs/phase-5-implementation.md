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

### Dependency-aware cache invalidation
Every cache key requires fingerprints for environment, effective policy, toolchain, authorization scope, and external state, in addition to source/instruction hashes and configuration version. Hosts must hash stable, non-secret representations; never include raw credentials. The cache remains process-local, opt-in, and unsuitable for approvals, secrets, or user-specific sensitive output.

### Durable telemetry
- Persistence is opt-in and requires explicit consent.
- JSONL records use an allowlisted metadata schema and exclude prompts, completions, repository paths, raw headers, credentials, and user identifiers.
- Writes are serialized; file creation uses restrictive permissions and no-follow behavior where available; retention, event-count, and byte limits are enforced.
- Malformed/truncated records are discarded during compaction.
- This is a host-callable adapter, not automatically enabled provider-runtime behavior. Host-specific encryption, access controls, consent/legal review, and deletion procedures remain necessary.

### Local/self-hosted runtime
The generic local provider uses the guarded OpenAI-compatible Chat Completions adapter. Loopback HTTP endpoints are allowed for a local process; non-loopback endpoints require HTTPS and an explicit key. Requests remain text-only and do not execute tools. Discovery only reports identifiers returned by the configured endpoint; context limits, tool support, quality, and pricing are not inferred.

## Validation boundaries

Unit tests use deterministic fixtures and mocked fetch responses. They do not prove live provider compatibility, billing correctness, sandbox isolation, Windows race resistance, human authentication, or production deployment readiness.
