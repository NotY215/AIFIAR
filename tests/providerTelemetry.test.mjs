import test from "node:test";
import assert from "node:assert/strict";
import { InMemoryProviderTelemetry } from "../dist/models/providerTelemetry.js";
test("telemetry retains a bounded copy and summarizes observed usage", () => {
  const telemetry = new InMemoryProviderTelemetry(2);
  telemetry.record({ provider: "openai", modelId: "m", outcome: "success", elapsedMs: 10, attempt: 1, inputTokens: 3, outputTokens: 4, totalTokens: 7 });
  telemetry.record({ provider: "xai", modelId: "x", outcome: "failure", elapsedMs: 20, attempt: 2 });
  telemetry.record({ provider: "openai", modelId: "m", outcome: "success", elapsedMs: 30, attempt: 1, totalTokens: 5 });
  assert.equal(telemetry.snapshot().length, 2);
  assert.deepEqual(telemetry.summary(), { calls: 2, successes: 1, failures: 1, averageLatencyMs: 25, inputTokens: 0, outputTokens: 0, totalTokens: 5 });
});

test("cost telemetry requires traceable rate-card metadata and reports incomplete totals honestly", () => {
  const telemetry = new InMemoryProviderTelemetry(5);
  telemetry.record({ provider: "openai", modelId: "m", outcome: "success", elapsedMs: 5, attempt: 1, estimatedCost: 0.02, costCurrency: "USD", rateCardVerifiedAt: "2026-10-27T00:00:00Z" });
  telemetry.record({ provider: "xai", modelId: "x", outcome: "success", elapsedMs: 6, attempt: 1 });
  telemetry.record({ provider: "openai", modelId: "m", outcome: "success", elapsedMs: 7, attempt: 1, estimatedCost: 0.5 });
  assert.deepEqual(telemetry.costSummary(), {
    knownCalls: 1,
    unknownCalls: 1,
    complete: false,
    byCurrency: { USD: 0.02 }
  });
});

test("telemetry rejects negative token/cost values and cost without source verification metadata", () => {
  const telemetry = new InMemoryProviderTelemetry();
  telemetry.record({ provider: "openai", modelId: "m", outcome: "success", elapsedMs: 5, attempt: 1, inputTokens: -1 });
  telemetry.record({ provider: "openai", modelId: "m", outcome: "success", elapsedMs: 5, attempt: 1, estimatedCost: 1, costCurrency: "USD" });
  assert.equal(telemetry.snapshot().length, 0);
});
