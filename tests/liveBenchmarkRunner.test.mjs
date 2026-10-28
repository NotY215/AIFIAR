import test from "node:test";
import assert from "node:assert/strict";
import { runLiveBenchmark } from "../dist/core/liveBenchmarkRunner.js";
import { validateBenchmarkCorpus } from "../dist/core/benchmarkCorpus.js";

const corpus = validateBenchmarkCorpus({
  schemaVersion: 1,
  corpusId: "test-corpus",
  version: "1.0.0",
  description: "Deterministic mocked test corpus",
  cases: [
    {
      id: "case-one",
      taskKind: "general",
      prompt: "Return the word ready.",
      expectedCapabilities: ["general"],
      verifier: { kind: "contains-all", terms: ["ready"] }
    },
    {
      id: "case-two",
      taskKind: "testing",
      prompt: "Return invalid and failure.",
      expectedCapabilities: ["testing"],
      verifier: { kind: "contains-all", terms: ["invalid", "failure"] }
    }
  ]
});

test("live benchmark runner uses explicit provider/model, repeats cases, and retains redacted evidence", async () => {
  const calls = [];
  const executor = {
    async execute(task, provider, modelId) {
      calls.push({ task, provider, modelId });
      return {
        taskId: task.id,
        provider,
        modelId,
        status: "success",
        summary: task.description.includes("ready") ? "ready" : "invalid input; expected failure",
        evidence: ["mocked"],
        usage: { inputTokens: 12, outputTokens: 4, totalTokens: 16 }
      };
    }
  };
  const report = await runLiveBenchmark(corpus, executor, {
    provider: "openai",
    modelId: "mock-model",
    repetitions: 2,
    concurrency: 2,
    runId: "test-run",
    startedAt: "2026-10-28T00:00:00Z",
    statistics: { minimumTrials: 4, minimumCases: 2, minimumTrialsPerCase: 2 }
  });
  assert.equal(calls.length, 4);
  assert.ok(calls.every((call) => call.provider === "openai" && call.modelId === "mock-model"));
  assert.equal(report.attemptedTrials, 4);
  assert.equal(report.passedTrials, 4);
  assert.equal(report.failedTrials, 0);
  assert.equal(report.statistics[0].sampleAdequate, true);
  assert.equal(report.trials[0].usage.totalTokens, 16);
  assert.equal(report.trials[0].trialId, "test-run:1");
  assert.equal(report.startedAt, "2026-10-28T00:00:00.000Z");
  assert.ok(report.limitations.some((item) => item.includes("not persisted automatically")));
});

test("failed model executions fail verification and missing token usage stays unknown", async () => {
  const executor = {
    async execute(task) {
      return {
        taskId: task.id,
        provider: "mock",
        modelId: "broken",
        status: "failure",
        summary: "",
        evidence: [],
        errors: ["network failure"]
      };
    }
  };
  const report = await runLiveBenchmark(corpus, executor, {
    provider: "mock",
    modelId: "broken",
    runId: "failed-run"
  });
  assert.equal(report.failedTrials, 2);
  assert.ok(report.trials.every((trial) => trial.status === "failure" && !trial.passed));
  assert.ok(report.trials.every((trial) => trial.usage.inputTokens === undefined));
  assert.ok(report.statistics[0].sampleWarnings.includes("insufficient-trials"));
});

test("runner rejects invalid run limits and excessive trial counts before calling provider", async () => {
  let calls = 0;
  const executor = { async execute() { calls++; throw new Error("must not run"); } };
  await assert.rejects(runLiveBenchmark(corpus, executor, {
    provider: "mock", modelId: "m", repetitions: 0
  }), /repetitions/);
  await assert.rejects(runLiveBenchmark(corpus, executor, {
    provider: "mock", modelId: "m", concurrency: 9
  }), /concurrency/);
  const tooMany = {
    ...corpus,
    cases: Array.from({ length: 500 }, (_, index) => ({
      ...corpus.cases[0], id: "case-" + index
    }))
  };
  await assert.rejects(runLiveBenchmark(tooMany, executor, {
    provider: "mock", modelId: "m", repetitions: 10
  }), /5000-trial/);
  assert.equal(calls, 0);
});
