import test from "node:test";
import assert from "node:assert/strict";
import { TokenManager } from "../dist/core/tokenManager.js";

const usage = (overrides = {}) => ({
  provider: "openai",
  modelId: "configured-model",
  inputTokens: 10,
  outputTokens: 5,
  estimatedCost: 0.002,
  ...overrides
});

test("tracks usage and checks combined budgets without mutating records", () => {
  const manager = new TokenManager({ maxInputTokens: 25, maxOutputTokens: 20, maxTotalTokens: 40, maxEstimatedCost: 0.01 });
  manager.record(usage());
  const result = manager.check(usage({ inputTokens: 12, outputTokens: 7, estimatedCost: 0.003 }));
  assert.equal(result.allowed, true);
  assert.equal(result.totalObservedTokens, 34);
  assert.equal(result.estimatedCost, 0.005);
  assert.equal(manager.snapshot().length, 1);
});

test("rejects non-finite, negative, fractional, and unsafe token counts when recording", () => {
  const manager = new TokenManager();
  for (const value of [Number.NaN, Number.POSITIVE_INFINITY, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => manager.record(usage({ inputTokens: value })), /inputTokens must be a non-negative safe integer/);
  }
});

test("validates the next usage before checking a budget", () => {
  const manager = new TokenManager({ maxTotalTokens: 100 });
  assert.throws(() => manager.check(usage({ outputTokens: Number.NaN })), /outputTokens must be a non-negative safe integer/);
  assert.throws(() => manager.check(usage({ estimatedCost: Number.POSITIVE_INFINITY })), /Estimated cost must be finite and non-negative/);
});

test("rejects malformed budget limits and missing provider identity", () => {
  assert.throws(() => new TokenManager({ maxInputTokens: Number.NaN }), /maxInputTokens must be a non-negative safe integer/);
  assert.throws(() => new TokenManager({ maxEstimatedCost: -1 }), /maxEstimatedCost must be finite and non-negative/);
  const manager = new TokenManager();
  assert.throws(() => manager.record(usage({ provider: " " })), /provider and model ID are required/);
});

test("fails closed when aggregate token counts exceed safe integer bounds", () => {
  const manager = new TokenManager();
  manager.record(usage({ inputTokens: Number.MAX_SAFE_INTEGER, outputTokens: 0, estimatedCost: 0 }));
  const result = manager.check(usage({ inputTokens: 1, outputTokens: 0, estimatedCost: 0 }));
  assert.equal(result.allowed, false);
  assert.ok(result.reasons.includes("Usage totals exceed safe numeric bounds"));
});
