import test from "node:test";
import assert from "node:assert/strict";
import { estimateProviderCost } from "../dist/core/costEstimator.js";

const rateCard = {
  provider: "sample",
  modelId: "configured-model",
  currency: "USD",
  inputCostPerMillionTokens: 2,
  outputCostPerMillionTokens: 8,
  effectiveAt: "2026-10-01T00:00:00Z",
  verifiedAt: "2026-10-27T00:00:00Z",
  sourceUrl: "https://provider.example/pricing"
};

test("cost estimate uses observed tokens and explicit versioned rate metadata", () => {
  const result = estimateProviderCost(rateCard, { inputTokens: 500_000, outputTokens: 100_000 });
  assert.equal(result.amount, 1.8);
  assert.equal(result.currency, "USD");
  assert.equal(result.rateCardVerifiedAt, rateCard.verifiedAt);
});

test("cost estimate rejects invalid counts, missing rate metadata, and insecure source URLs", () => {
  assert.throws(() => estimateProviderCost(rateCard, { inputTokens: -1, outputTokens: 1 }), /non-negative/);
  assert.throws(() => estimateProviderCost({ ...rateCard, sourceUrl: "http://provider.example/pricing" }, { inputTokens: 1, outputTokens: 1 }), /HTTPS/);
  assert.throws(() => estimateProviderCost({ ...rateCard, verifiedAt: "not-a-date" }, { inputTokens: 1, outputTokens: 1 }), /dates/);
});
