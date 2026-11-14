import test from "node:test";
import assert from "node:assert/strict";
import { createProviderRuntime } from "../dist/models/providerRuntime.js";
import { runApprovedProviderBenchmark } from "../dist/core/providerBenchmarkWorkflow.js";

const corpus = {
  schemaVersion: 1,
  corpusId: "smoke",
  version: "1",
  description: "A single deterministic response check",
  cases: [{
    id: "nonempty",
    taskKind: "general",
    prompt: "Return a short result",
    expectedCapabilities: ["text"],
    verifier: { kind: "non-empty" }
  }]
};
const rateCard = {
  schemaVersion: 1,
  provider: "openai",
  modelId: "test-model",
  region: "test",
  billingMode: "on-demand",
  currency: "USD",
  inputCostPerMillionTokens: 1,
  outputCostPerMillionTokens: 2,
  costPerRequest: 0,
  effectiveAt: "2026-01-01T00:00:00Z",
  verifiedAt: "2026-11-14T00:00:00Z",
  expiresAt: "2027-01-01T00:00:00Z",
  sourceUrl: "https://pricing.example.test/rate-card"
};
function runtime() {
  return createProviderRuntime({
    env: { OPENAI_API_KEY: "test-key", AIFIAR_OPENAI_MODEL: "test-model" },
    fetchImpl: async () => new Response(JSON.stringify({
      choices: [{ message: { role: "assistant", content: "verified response" } }],
      usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 }
    }), { status: 200 })
  });
}
function input(overrides = {}) {
  return {
    runtime: runtime(),
    corpus,
    provider: "openai",
    modelId: "test-model",
    consentGranted: true,
    maxInputTokensPerTrial: 100,
    maxOutputTokensPerTrial: 2048,
    rateCard,
    approvedBudget: { amount: 1, currency: "USD" },
    approveCost: async () => true,
    ...overrides
  };
}

test("benchmark workflow requires explicit consent before any provider call", async () => {
  let approved = false;
  const result = await runApprovedProviderBenchmark(input({
    consentGranted: false,
    approveCost: async () => { approved = true; return true; }
  }));
  assert.equal(result.status, "blocked");
  assert.equal(approved, false);
});

test("benchmark workflow blocks a cost estimate above the approved budget", async () => {
  let approved = false;
  const result = await runApprovedProviderBenchmark(input({
    approvedBudget: { amount: 0, currency: "USD" },
    approveCost: async () => { approved = true; return true; }
  }));
  assert.equal(result.status, "blocked");
  assert.equal(approved, false);
  assert.ok(result.costPreflight?.total !== null);
});

test("benchmark workflow runs only after cost approval and returns verified trial evidence", async () => {
  let approvedEstimate;
  const result = await runApprovedProviderBenchmark(input({
    approveCost: async estimate => { approvedEstimate = estimate; return true; },
    benchmark: { repetitions: 2, concurrency: 1 }
  }));
  assert.equal(result.status, "completed");
  assert.equal(approvedEstimate.provider, "openai");
  assert.equal(result.benchmark.attemptedTrials, 2);
  assert.equal(result.benchmark.passedTrials, 2);
  assert.equal(result.evidencePersisted, false);
});

test("benchmark workflow rejects stale or mismatched rate cards", async () => {
  const stale = { ...rateCard, verifiedAt: "2026-01-01T00:00:00Z" };
  const result = await runApprovedProviderBenchmark(input({ rateCard: stale }));
  assert.equal(result.status, "blocked");
  assert.match(result.blockers[0], /Cost preflight failed/);
});
