import test from "node:test";
import assert from "node:assert/strict";
import { estimateDetailedProviderCost } from "../dist/core/detailedCostEstimator.js";

const card = {
  schemaVersion: 1,
  provider: "sample",
  modelId: "model-a",
  region: "global",
  billingMode: "on-demand",
  currency: "USD",
  inputCostPerMillionTokens: 2,
  cachedInputCostPerMillionTokens: 0.5,
  outputCostPerMillionTokens: 8,
  costPerRequest: 0,
  effectiveAt: "2026-10-01T00:00:00Z",
  verifiedAt: "2026-10-10T00:00:00Z",
  expiresAt: "2026-12-31T23:59:59Z",
  sourceUrl: "https://provider.example/pricing"
};

test("detailed estimator separates cached input, uncached input, output, and request charges", () => {
  const result = estimateDetailedProviderCost(card, {
    inputTokens: 500_000, cachedInputTokens: 200_000, outputTokens: 100_000, requestCount: 2
  }, { asOf: "2026-10-28T00:00:00Z" });
  assert.equal(result.breakdown.uncachedInput, 0.6);
  assert.equal(result.breakdown.cachedInput, 0.1);
  assert.equal(result.breakdown.output, 0.8);
  assert.equal(result.breakdown.requests, 0);
  assert.equal(result.total, 1.5);
  assert.equal(result.complete, true);
  assert.equal(result.region, "global");
  assert.equal(result.currency, "USD");
});

test("missing cached-token or per-request rates produce incomplete cost, never a fabricated zero", () => {
  const noCachedRate = estimateDetailedProviderCost({ ...card, cachedInputCostPerMillionTokens: undefined }, {
    inputTokens: 100, cachedInputTokens: 50, outputTokens: 10, requestCount: 1
  }, { asOf: "2026-10-28T00:00:00Z" });
  assert.equal(noCachedRate.breakdown.cachedInput, null);
  assert.equal(noCachedRate.total, null);
  assert.equal(noCachedRate.complete, false);
  assert.ok(noCachedRate.warnings.includes("cached-input-rate-unavailable"));

  const noRequestRate = estimateDetailedProviderCost({ ...card, costPerRequest: undefined }, {
    inputTokens: 100, outputTokens: 10, requestCount: 1
  }, { asOf: "2026-10-28T00:00:00Z" });
  assert.equal(noRequestRate.breakdown.requests, null);
  assert.equal(noRequestRate.total, null);
  assert.ok(noRequestRate.warnings.includes("per-request-rate-unavailable"));
});

test("rejects inconsistent usage, unsafe counts, invalid provenance, and inactive cards", () => {
  const usage = { inputTokens: 10, outputTokens: 2, requestCount: 1 };
  assert.throws(() => estimateDetailedProviderCost(card, { ...usage, cachedInputTokens: 11 }, { asOf: "2026-10-28T00:00:00Z" }), /cannot exceed/);
  assert.throws(() => estimateDetailedProviderCost(card, { ...usage, inputTokens: 1.5 }, { asOf: "2026-10-28T00:00:00Z" }), /safe integers/);
  assert.throws(() => estimateDetailedProviderCost({ ...card, sourceUrl: "https://user:pass@example.com/pricing" }, usage, { asOf: "2026-10-28T00:00:00Z" }), /no credentials/);
  assert.throws(() => estimateDetailedProviderCost(card, usage, { asOf: "2026-09-01T00:00:00Z" }), /not effective/);
  assert.throws(() => estimateDetailedProviderCost(card, usage, { asOf: "2027-01-01T00:00:00Z" }), /expired/);
  assert.throws(() => estimateDetailedProviderCost({ ...card, verifiedAt: "2026-09-30T23:59:59Z" }, usage, { asOf: "2026-10-28T00:00:00Z" }), /verified before/);
});

test("unknown billing mode blocks a complete total even when token arithmetic is possible", () => {
  const result = estimateDetailedProviderCost({ ...card, billingMode: "unknown" }, {
    inputTokens: 100, outputTokens: 10, requestCount: 1
  }, { asOf: "2026-10-28T00:00:00Z" });
  assert.equal(result.total, null);
  assert.equal(result.complete, false);
  assert.ok(result.warnings.includes("billing-mode-unknown"));
});

test("provisioned billing does not claim a complete total without capacity allocation", () => {
  const result = estimateDetailedProviderCost({ ...card, billingMode: "provisioned" }, {
    inputTokens: 100, outputTokens: 10, requestCount: 1
  }, { asOf: "2026-10-28T00:00:00Z" });
  assert.equal(result.total, null);
  assert.equal(result.complete, false);
  assert.ok(result.warnings.includes("provisioned-capacity-allocation-unmodeled"));
});

test("rejects stale rate-card verification and validates freshness policy", () => {
  const asOf = "2026-10-28T00:00:00Z";
  assert.throws(() => estimateDetailedProviderCost({ ...card, effectiveAt: "2026-08-01T00:00:00Z", verifiedAt: "2026-09-01T00:00:00Z" }, {
    inputTokens: 10, outputTokens: 2, requestCount: 1
  }, { asOf }), /verification is stale/);
  const allowedByExplicitPolicy = estimateDetailedProviderCost({ ...card, verifiedAt: "2026-09-01T00:00:00Z" }, {
    inputTokens: 10, outputTokens: 2, requestCount: 1
  }, { asOf, maxVerificationAgeMs: 90 * 24 * 60 * 60 * 1000 });
  assert.equal(allowedByExplicitPolicy.provider, "sample");
  for (const maxVerificationAgeMs of [0, 1000, 366 * 24 * 60 * 60 * 1000, 1.5]) {
    assert.throws(() => estimateDetailedProviderCost(card, {
      inputTokens: 10, outputTokens: 2, requestCount: 1
    }, { asOf, maxVerificationAgeMs }), /between one hour and one year/);
  }
});
