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

test("provider runtime selects the OpenAI Responses API when explicitly configured", async () => {
  const events = [];
  const runtime = createProviderRuntime({
    env: { OPENAI_API_KEY: "test-key", AIFIAR_OPENAI_API_MODE: "responses", AIFIAR_OPENAI_RESPONSES_MODEL: "responses-model" },
    onTelemetry: (event) => events.push(event),
    fetchImpl: async (url) => {
      assert.equal(String(url), "https://api.openai.com/v1/responses");
      return new Response(JSON.stringify({ output_text: "response mode", usage: { input_tokens: 2, output_tokens: 2, total_tokens: 4 } }), { status: 200 });
    }
  });
  assert.equal(runtime.registry.get("openai", "responses-model")?.supportedApiModes?.[0], "responses");
  const result = await runtime.executor.execute({ id: "T2", title: "T", description: "D", kind: "general", requirementIds: [], dependsOn: [], status: "ready" }, "openai", "responses-model");
  assert.equal(result.status, "success");
  assert.equal(events[0].totalTokens, 4);
});

test("provider runtime rejects unknown OpenAI API modes", () => {
  assert.throws(() => createProviderRuntime({ env: { AIFIAR_OPENAI_API_MODE: "unknown" } }), /must be/);
});


test("runtime exposes discovery and aggregates telemetry without storing credentials", async () => {
  const runtime = createProviderRuntime({
    env: { OPENAI_API_KEY: "test-key", AIFIAR_OPENAI_MODEL: "test-model" },
    fetchImpl: async (url) => {
      if (String(url).endsWith("/models")) return new Response(JSON.stringify({ data: [{ id: "test-model" }] }), { status: 200 });
      return new Response(JSON.stringify({ choices: [{ message: { content: "ok" } }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } }), { status: 200 });
    }
  });
  const found = await runtime.discoverModels("openai");
  assert.equal(found.models[0].id, "test-model");
  await runtime.executor.execute({ id: "T3", title: "T", description: "D", kind: "general", requirementIds: [], dependsOn: [], status: "ready" }, "openai", "test-model");
  assert.equal(runtime.telemetry.summary().totalTokens, 2);
  assert.ok(!JSON.stringify(runtime.telemetry.snapshot()).includes("test-key"));
});

test("provider runtime configures Anthropic only when key and model ID are present", async () => {
  const unconfigured = createProviderRuntime({ env: {} });
  assert.equal(unconfigured.registry.get("anthropic", "unconfigured")?.availability, "unconfigured");
  const runtime = createProviderRuntime({
    env: { ANTHROPIC_API_KEY: "anthropic-test-key", AIFIAR_ANTHROPIC_MODEL: "claude-test-model" },
    fetchImpl: async (url, init) => {
      assert.equal(String(url), "https://api.anthropic.com/v1/messages");
      assert.equal(init.headers["anthropic-version"], "2023-06-01");
      return new Response(JSON.stringify({
        type: "message", content: [{ type: "text", text: "Claude response" }],
        stop_reason: "end_turn", usage: { input_tokens: 3, output_tokens: 4 }
      }), { status: 200 });
    }
  });
  assert.deepEqual(runtime.configuredProviders, ["anthropic"]);
  assert.equal(runtime.registry.get("anthropic", "claude-test-model")?.supportedApiModes?.[0], "anthropic-messages");
  const result = await runtime.executor.execute({
    id: "T4", title: "T", description: "D", kind: "general",
    requirementIds: [], dependsOn: [], status: "ready"
  }, "anthropic", "claude-test-model");
  assert.equal(result.status, "success");
  assert.equal(result.summary, "Claude response");
  assert.equal(runtime.telemetry.summary().totalTokens, 7);
  assert.ok(!JSON.stringify(runtime.telemetry.snapshot()).includes("anthropic-test-key"));
});
