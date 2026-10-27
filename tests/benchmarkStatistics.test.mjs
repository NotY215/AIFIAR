import test from "node:test";
import assert from "node:assert/strict";
import { summarizeBenchmarkTrials } from "../dist/core/benchmarkStatistics.js";

function trial(trialId, caseId, passed, overrides = {}) {
  return {
    trialId,
    caseId,
    provider: "fixture",
    modelId: "model-a",
    passed,
    latencyMs: 10,
    inputTokens: 4,
    outputTokens: 3,
    ...overrides
  };
}

test("statistics group models and calculate success rate with a Wilson confidence interval", () => {
  const trials = [
    trial("t1", "case-b", true),
    trial("t2", "case-a", false),
    trial("t3", "case-a", true),
    trial("t4", "case-b", true, { provider: "other", modelId: "model-b" })
  ];
  const reports = summarizeBenchmarkTrials(trials, { minimumTrials: 2, minimumCases: 2, confidenceLevel: 0.95 });
  assert.equal(reports.length, 2);
  const first = reports.find((item) => item.provider === "fixture");
  assert.ok(first);
  assert.equal(first.trials, 3);
  assert.equal(first.successes, 2);
  assert.equal(first.failures, 1);
  assert.equal(first.successRate, 2 / 3);
  assert.ok(first.confidenceInterval.lower >= 0);
  assert.ok(first.confidenceInterval.lower < first.successRate);
  assert.ok(first.confidenceInterval.upper > first.successRate);
  assert.ok(first.confidenceInterval.upper <= 1);
  assert.equal(first.distinctCases, 2);
  assert.deepEqual(first.perCase.map((item) => item.caseId), ["case-a", "case-b"]);
  assert.equal(first.sampleAdequate, true);
  assert.equal(first.averageLatencyMs, 10);
});

test("small samples are explicitly flagged and incomplete observations stay visible", () => {
  const [report] = summarizeBenchmarkTrials([
    trial("t1", "case-a", true, { latencyMs: undefined, inputTokens: undefined, outputTokens: undefined })
  ]);
  assert.equal(report.sampleAdequate, false);
  assert.ok(report.sampleWarnings.includes("insufficient-trials"));
  assert.ok(report.sampleWarnings.includes("insufficient-distinct-cases"));
  assert.ok(report.sampleWarnings.includes("incomplete-resource-observations"));
  assert.equal(report.averageLatencyMs, null);
  assert.equal(report.observedInputTokenCount, 0);
  assert.equal(report.observedOutputTokenCount, 0);
});

test("statistics reject duplicate trial IDs, invalid metrics, and invalid thresholds", () => {
  assert.throws(() => summarizeBenchmarkTrials([
    trial("same", "case-a", true),
    trial("same", "case-b", false)
  ]), /Duplicate benchmark trial ID/);
  assert.throws(() => summarizeBenchmarkTrials([trial("t1", "case-a", true, { latencyMs: -1 })]), /Invalid latency/);
  assert.throws(() => summarizeBenchmarkTrials([], { minimumTrials: 0 }), /minimumTrials/);
  assert.throws(() => summarizeBenchmarkTrials([], { confidenceLevel: 0.97 }), /confidenceLevel/);
  assert.throws(() => summarizeBenchmarkTrials([trial("t1", "case-a", true, { passed: "yes" })]), /Invalid benchmark trial/);
});

test("empty trial input produces no model claims", () => {
  assert.deepEqual(summarizeBenchmarkTrials([]), []);
});
