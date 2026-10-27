# Routing evaluation, usage accounting, and result cache

This document describes the measurement helpers in `core/evaluation.ts`, `core/costEstimator.ts`, `core/tokenManager.ts`, `models/providerTelemetry.ts`, and `core/resultCache.ts`. These utilities report supplied observations; they do not independently call providers or prove model quality.

## Routing benchmark workflow

1. Build a versioned benchmark set with stable case IDs, task kinds, expected capabilities, and optional importance weights.
2. Run a fixed case set through the single-model baseline and the proposed multi-model strategy. Use the same task inputs, source revision, instruction hashes, verification policy, and output acceptance criteria.
3. Save the actual selected provider/model, eligibility candidates, pass/fail result from a defined verifier, elapsed time, provider-reported input/output tokens, and cost only where supported.
4. Call `evaluateRoutingBenchmark(cases, decisions)` for case coverage, success rate, weighted success rate, observed latency, observed token counts, known cost, missing cases, and malformed/unknown decisions.
5. Call `compareRoutingOutcomes(singleModel, multiModel)` to compare deltas. Positive resource deltas mean the multi-model run used more tokens/cost or took longer; success-rate deltas are positive when it scored better.
6. Preserve benchmark version, repository commit, provider/model IDs, runtime configuration, evaluator version, and failure reasons alongside the report. Do not compare runs whose test set or acceptance criteria changed without documenting the change.

The evaluator deliberately does not invent missing measurements. Average latency is `null` when none is observed. Cost is `null` unless every measured case has a known cost. A benchmark report is not evidence that a live provider call occurred; the caller must retain execution evidence.

## Token and latency telemetry

`InMemoryProviderTelemetry` holds a bounded process-local buffer of observed outcomes, elapsed time, attempts, provider-reported usage, rate-limit hints, and optional cost estimates with currency and rate-card verification timestamp. Its `costSummary()` reports known versus unknown calls and only aggregates values with traceable metadata. Missing token counts are unknown, not zero in any per-call claim. Token aggregates use zero only for summing known fields, so consumers should inspect raw event availability before claiming complete usage coverage.

`DurableTelemetryStore` is a separate opt-in JSONL persistence adapter. It requires both `enabled: true` and `consentGranted: true`, uses an allowlisted metadata-only schema, serialized writes, restrictive file permissions, retention pruning, and event/byte bounds. It does not persist prompts, completions, repository paths, credentials, or raw headers. The host must supply a trusted directory outside model-writable storage and define access, encryption, consent, and deletion policy. Persistence is not automatically enabled by the provider runtime.

## Cost estimates

`estimateProviderCost` accepts a host-supplied rate card with provider, exact model ID, currency, input/output rates, effective timestamp, verification timestamp, and HTTPS source URL. It uses supplied token counts and those rates. It does not fetch pricing, verify that the source is official, infer rates, account for discounts/cached tokens/region-specific fees, or prove the rate card remains current. Hosts must verify the source, version the rate card, and label results as estimates. Never use placeholder rates to report actual cost.

## Result cache policy

`FreshResultCache` is an opt-in, in-memory cache for small structured results:

- Disabled by default. The host must set `enabled: true` and `privacyMode: "local-only"`.
- Refuses entries when the host marks the request as sensitive.
- Does not persist entries to disk or include prompt/result content in logs.
- Uses a SHA-256 key over task kind/text, provider/model ID, instruction hashes, source paths/content hashes, and configuration version.
- Requires the host to provide current source and instruction hashes on every lookup. Any changed hash produces a cache miss.
- Expires entries by TTL, bounds entry count, defaults to a 64 KiB serialized result cap and 1 MiB total cache cap, and evicts least-recently-used entries when a bound is reached.
- Rejects oversized or invalid cache keys and values that cannot be serialized as JSON.
- Clones stored and returned values to prevent callers mutating cached state.

The cache cannot determine whether content is sensitive by itself. The host must classify it conservatively and set `containsSensitiveData`. Do not cache authentication decisions, approval receipts, secrets, user-specific private data, destructive-action authorization, or results whose validity depends on unrepresented external state. Every key now requires fingerprints for environment, effective policy, toolchain, authorization scope, and external state as well as source/instruction hashes and configuration version. Use stable non-secret fingerprints, never raw credentials. A matching key is not a substitute for final verification.

## Model/provider coverage

Instruction profiles cover GPT, Grok, OpenAI, xAI, Anthropic/Claude, Google Gemini, and local/self-hosted runtimes. Executable text-only adapters cover OpenAI Chat Completions and Responses, xAI's OpenAI-compatible endpoint, Anthropic Messages, Gemini generateContent, Qwen/Qwen Code compatible endpoints, and a generic local/self-hosted OpenAI-compatible endpoint. Tool execution is not enabled by these text adapters. Model discovery only reports provider-returned identifiers; context limits, tool support, quality, and pricing are not inferred.

## Limits and production blockers

These utilities do not implement host-authenticated approvals, Windows handle-based race-resistant filesystem mutation, hostile-process isolation, or production provider billing. See [production readiness](production-readiness.md). The framework must not be declared production-safe solely because its unit tests pass.
