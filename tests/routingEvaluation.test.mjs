import test from "node:test";
import assert from "node:assert/strict";
import { StaticModelRegistry } from "../dist/models/registry.js";
import { routeTask } from "../dist/core/taskRouter.js";

const task = {
  id: "T1", title: "Review patch", description: "Review source changes", kind: "review",
  requirementIds: [], dependsOn: [], status: "ready"
};

test("router ranks candidates using observed task-quality evaluations", () => {
  const registry = new StaticModelRegistry([
    { provider: "alpha", modelId: "reviewer", taskKinds: ["review"], supportsTools: false, supportsStructuredOutput: false, availability: "available" },
    { provider: "beta", modelId: "generalist", taskKinds: ["general"], supportsTools: false, supportsStructuredOutput: false, availability: "available" }
  ]);
  const models = routeTask(task, registry, {
    evaluations: [
      { provider: "alpha", modelId: "reviewer", qualityByTask: { review: 10 } },
      { provider: "beta", modelId: "generalist", qualityByTask: { review: 39 } }
    ]
  });
  assert.deepEqual(models.map((model) => model.provider), ["alpha", "beta"]);
});

test("router excludes candidates that violate context, provider, or tool constraints", () => {
  const registry = new StaticModelRegistry([
    { provider: "small", modelId: "m1", taskKinds: ["review"], contextWindowTokens: 100, supportsTools: true, supportsStructuredOutput: true, availability: "available" },
    { provider: "large", modelId: "m2", taskKinds: ["review"], contextWindowTokens: 10_000, supportsTools: false, supportsStructuredOutput: true, availability: "available" },
    { provider: "offline", modelId: "m3", taskKinds: ["review"], contextWindowTokens: 20_000, supportsTools: true, supportsStructuredOutput: true, availability: "unavailable" }
  ]);
  const models = routeTask(task, registry, { estimatedInputTokens: 500, requireTools: true, allowedProviders: ["small", "offline"] });
  assert.deepEqual(models, []);
});

test("router respects excluded providers and keeps deterministic tie ordering", () => {
  const registry = new StaticModelRegistry([
    { provider: "a", modelId: "1", taskKinds: ["review"], supportsTools: false, supportsStructuredOutput: false, availability: "available" },
    { provider: "b", modelId: "2", taskKinds: ["review"], supportsTools: false, supportsStructuredOutput: false, availability: "available" },
    { provider: "c", modelId: "3", taskKinds: ["review"], supportsTools: false, supportsStructuredOutput: false, availability: "available" }
  ]);
  const models = routeTask(task, registry, { excludedProviders: ["b"] });
  assert.deepEqual(models.map((model) => model.provider), ["a", "c"]);
});
