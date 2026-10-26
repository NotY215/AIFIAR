import test from "node:test";
import assert from "node:assert/strict";
import { createProviderRuntime } from "../dist/models/providerRuntime.js";

test("provider runtime leaves providers unconfigured when credentials or model IDs are absent", () => {
  const runtime = createProviderRuntime({ env: {} });
  assert.deepEqual(runtime.configuredProviders, []);
  assert.ok(runtime.registry.list().every((model) => model.availability === "unconfigured"));
});

test("provider runtime registers only fully configured providers", async () => {
  const runtime = createProviderRuntime({
    env: { OPENAI_API_KEY: "test-key", AIFIAR_OPENAI_MODEL: "test-model" },
    fetchImpl: async () => new Response(JSON.stringify({ choices: [{ message: { content: "ok" } }] }), { status: 200 })
  });
  assert.deepEqual(runtime.configuredProviders, ["openai"]);
  assert.equal(runtime.registry.get("openai", "test-model")?.availability, "available");
  assert.equal(runtime.registry.get("xai", "unconfigured")?.availability, "unconfigured");
  const result = await runtime.executor.execute({
    id: "T1", title: "Test", description: "Test task", kind: "general",
    requirementIds: [], dependsOn: [], status: "ready"
  }, "openai", "test-model");
  assert.equal(result.status, "success");
});

test("provider runtime does not expose credentials through unconfigured dispatch", async () => {
  const runtime = createProviderRuntime({ env: {} });
  const result = await runtime.executor.execute({
    id: "T1", title: "Test", description: "Test task", kind: "general",
    requirementIds: [], dependsOn: [], status: "ready"
  }, "openai", "missing-model");
  assert.equal(result.status, "skipped");
  assert.equal(result.errors?.[0], "PROVIDER_NOT_CONFIGURED");
});