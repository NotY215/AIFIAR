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
