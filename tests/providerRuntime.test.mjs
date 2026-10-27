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


test("provider runtime configures Gemini and exposes bounded model discovery", async () => {
  const calls = [];
  const runtime = createProviderRuntime({
    env: { GEMINI_API_KEY: "gemini-test-key", AIFIAR_GEMINI_MODEL: "gemini-test-model" },
    fetchImpl: async (url, init) => {
      calls.push({ url: String(url), init, body: init?.body ? JSON.parse(init.body) : undefined });
      if (String(url).endsWith("/models")) {
        return new Response(JSON.stringify({ models: [{ name: "models/gemini-test-model", supportedGenerationMethods: ["generateContent"] }] }), { status: 200 });
      }
      return new Response(JSON.stringify({
        candidates: [{ content: { parts: [{ text: "Gemini runtime response" }] }, finishReason: "STOP" }],
        usageMetadata: { promptTokenCount: 3, candidatesTokenCount: 5, totalTokenCount: 8 }
      }), { status: 200 });
    }
  });
  assert.deepEqual(runtime.configuredProviders, ["gemini"]);
  assert.equal(runtime.registry.get("gemini", "gemini-test-model")?.availability, "available");
  assert.equal(runtime.registry.get("gemini", "gemini-test-model")?.supportsTools, false);
  const result = await runtime.executor.execute({ id: "G2", title: "Analyze", description: "Return test marker", kind: "general", requirementIds: [], dependsOn: [], status: "ready" }, "gemini", "gemini-test-model");
  assert.equal(result.status, "success");
  assert.equal(result.summary, "Gemini runtime response");
  assert.equal(runtime.telemetry.summary().totalTokens, 8);
  assert.equal(calls[0].url, "https://generativelanguage.googleapis.com/v1beta/models/gemini-test-model:generateContent");
  assert.equal(calls[0].init.headers["x-goog-api-key"], "gemini-test-key");
  assert.deepEqual((await runtime.discoverModels("gemini")).models.map((model) => model.id), ["gemini-test-model"]);
  assert.ok(!JSON.stringify(runtime.telemetry.snapshot()).includes("gemini-test-key"));
});

test("Gemini remains unconfigured without credentials or a model ID", () => {
  const missingKey = createProviderRuntime({ env: { AIFIAR_GEMINI_MODEL: "gemini-test" } });
  assert.equal(missingKey.registry.get("gemini", "gemini-test")?.availability, "unconfigured");
  const missingModel = createProviderRuntime({ env: { GEMINI_API_KEY: "test" } });
  assert.equal(missingModel.registry.get("gemini", "unconfigured")?.availability, "unconfigured");
  assert.throws(() => missingKey.discoverModels("gemini"), /credentials/);
});

test("provider runtime configures separate Qwen research and Qwen Code profiles through the compatible endpoint", async () => {
  const calls = [];
  const runtime = createProviderRuntime({
    env: {
      DASHSCOPE_API_KEY: "qwen-test-key",
      AIFIAR_QWEN_BASE_URL: "https://workspace.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1",
      AIFIAR_QWEN_MODEL: "qwen-research-test",
      AIFIAR_QWEN_CODE_MODEL: "qwen-coder-test"
    },
    fetchImpl: async (url, init) => {
      calls.push({ url: String(url), init, body: init?.body ? JSON.parse(init.body) : undefined });
      if (String(url).endsWith("/models")) {
        return new Response(JSON.stringify({ data: [{ id: "qwen-research-test" }, { id: "qwen-coder-test" }] }), { status: 200 });
      }
      return new Response(JSON.stringify({
        choices: [{ message: { role: "assistant", content: "verified mocked response" }, finish_reason: "stop" }],
        usage: { prompt_tokens: 5, completion_tokens: 8, total_tokens: 13 }
      }), { status: 200 });
    }
  });
  assert.deepEqual(runtime.configuredProviders, ["qwen", "qwen-code"]);
  assert.equal(runtime.registry.get("qwen", "qwen-research-test")?.availability, "available");
  assert.equal(runtime.registry.get("qwen-code", "qwen-coder-test")?.availability, "available");
  assert.equal(runtime.registry.get("qwen", "qwen-research-test")?.supportsTools, false);
  const task = { id: "Q1", title: "Analyze", description: "Analyze sources", kind: "research", requirementIds: [], dependsOn: [], status: "ready" };
  const research = await runtime.executor.execute(task, "qwen", "qwen-research-test");
  const coding = await runtime.executor.execute({ ...task, id: "Q2", kind: "coding" }, "qwen-code", "qwen-coder-test");
  assert.equal(research.status, "success");
  assert.equal(coding.status, "success");
  assert.equal(research.provider, "qwen");
  assert.equal(coding.provider, "qwen-code");
  assert.equal(calls[0].url, "https://workspace.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1/chat/completions");
  assert.equal(calls[0].init.headers.authorization, "Bearer qwen-test-key");
  assert.equal(calls[0].body.model, "qwen-research-test");
  assert.equal(calls[1].body.model, "qwen-coder-test");
  assert.equal(runtime.telemetry.summary().totalTokens, 26);
  assert.ok(!JSON.stringify(runtime.telemetry.snapshot()).includes("qwen-test-key"));
  const discovered = await runtime.discoverModels("qwen");
  assert.deepEqual(discovered.models.map((model) => model.id), ["qwen-coder-test", "qwen-research-test"]);
});

test("Qwen profiles remain unconfigured unless key, base URL, and their own model IDs are present", () => {
  const noBaseUrl = createProviderRuntime({
    env: { DASHSCOPE_API_KEY: "test-key", AIFIAR_QWEN_MODEL: "qwen-test" }
  });
  assert.equal(noBaseUrl.registry.get("qwen", "qwen-test")?.availability, "unconfigured");
  const noCoder = createProviderRuntime({
    env: {
      DASHSCOPE_API_KEY: "test-key",
      AIFIAR_QWEN_BASE_URL: "https://workspace.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1",
      AIFIAR_QWEN_MODEL: "qwen-test"
    }
  });
  assert.equal(noCoder.registry.get("qwen", "qwen-test")?.availability, "available");
  assert.equal(noCoder.registry.get("qwen-code", "unconfigured")?.availability, "unconfigured");
});
