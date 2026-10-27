import test from "node:test";
import assert from "node:assert/strict";
import { evaluateRoutingBenchmark, compareRoutingOutcomes } from "../dist/core/evaluation.js";
import { FreshResultCache } from "../dist/core/resultCache.js";

const benchmark = [
  { id: "review-1", taskKind: "review", expectedCapabilities: ["reasoning"], weight: 2 },
  { id: "code-1", taskKind: "coding", expectedCapabilities: ["coding"] },
  { id: "test-1", taskKind: "testing", expectedCapabilities: ["testing"] }
];

const key = (overrides = {}) => ({
  taskKind: "review",
  taskText: "Review a small change",
  provider: "openai",
  modelId: "configured-model",
  instructionHashes: ["rule-a"],
  sources: [{ path: "src/a.ts", contentHash: "hash-1" }],
  configurationVersion: "v1",
  ...overrides
});

test("routing benchmark reports coverage, weighted success, and observed metrics", () => {
  const report = evaluateRoutingBenchmark(benchmark, [
    { caseId: "review-1", selectedProvider: "openai", selectedModelId: "m", eligibleCandidates: [], success: true, latencyMs: 100, inputTokens: 10, outputTokens: 5, cost: 0.01 },
    { caseId: "code-1", eligibleCandidates: [], success: false, latencyMs: 300, inputTokens: 20, outputTokens: 2, cost: 0.02 }
  ]);
  assert.equal(report.coverage, 2 / 3);
  assert.equal(report.successRate, 0.5);
  assert.equal(report.weightedSuccessRate, 2 / 3);
  assert.equal(report.averageLatencyMs, 200);
  assert.equal(report.observedInputTokens, 30);
  assert.equal(report.observedOutputTokens, 7);
  assert.equal(report.observedCost, null);
  assert.deepEqual(report.missingCases, ["test-1"]);
});

test("comparison keeps cost unknown unless both runs report cost for every measured case", () => {
  const single = evaluateRoutingBenchmark(benchmark.slice(0, 1), [
    { caseId: "review-1", eligibleCandidates: [], success: false, inputTokens: 10, outputTokens: 3, cost: 0.02 }
  ]);
  const multi = evaluateRoutingBenchmark(benchmark.slice(0, 1), [
    { caseId: "review-1", eligibleCandidates: [], success: true, inputTokens: 20, outputTokens: 5, cost: 0.04 }
  ]);
  const comparison = compareRoutingOutcomes(single, multi);
  assert.equal(comparison.successRateDelta, 1);
  assert.equal(comparison.inputTokenDelta, 10);
  assert.equal(comparison.costDelta, 0.02);
});

test("cache is disabled unless explicitly enabled in private mode", () => {
  const disabled = new FreshResultCache({ enabled: false, ttlMs: 1000, maxEntries: 5, privacyMode: "private" });
  assert.equal(disabled.set(key(), { answer: "x" }), false);
  assert.equal(disabled.get(key()), undefined);
  const standard = new FreshResultCache({ enabled: true, ttlMs: 1000, maxEntries: 5, privacyMode: "standard" });
  assert.equal(standard.set(key(), { answer: "x" }), false);
});

test("cache clones values and misses when source or instruction hashes change", () => {
  let now = 100;
  const cache = new FreshResultCache({ enabled: true, ttlMs: 50, maxEntries: 2, privacyMode: "private", now: () => now });
  const original = { answer: "safe", nested: { count: 1 } };
  assert.equal(cache.set(key(), original), true);
  original.nested.count = 7;
  const value = cache.get(key());
  assert.equal(value.nested.count, 1);
  assert.equal(cache.get(key({ sources: [{ path: "src/a.ts", contentHash: "changed" }] })), undefined);
  assert.equal(cache.get(key({ instructionHashes: ["rule-b"] })), undefined);
  now = 151;
  assert.equal(cache.get(key()), undefined);
});

test("cache refuses sensitive payloads and evicts least-recently-used entries", () => {
  const sensitive = new FreshResultCache({ enabled: true, ttlMs: 1000, maxEntries: 2, privacyMode: "private", containsSensitiveData: true });
  assert.equal(sensitive.set(key(), "secret"), false);
  const cache = new FreshResultCache({ enabled: true, ttlMs: 1000, maxEntries: 2, privacyMode: "private" });
  cache.set(key(), "one");
  cache.set(key({ taskText: "second" }), "two");
  assert.equal(cache.get(key()), "one");
  cache.set(key({ taskText: "third" }), "three");
  assert.equal(cache.size, 2);
  assert.equal(cache.get(key({ taskText: "second" })), undefined);
});
