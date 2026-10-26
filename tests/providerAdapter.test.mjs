import test from "node:test";
import assert from "node:assert/strict";
import {
  createOpenAICompatibleExecutor,
  createOpenAIExecutor,
  createXAIExecutor
} from "../dist/models/openaiCompatibleAdapter.js";

const task = {
  id: "T001",
  title: "Inspect source",
  description: "Analyze the project",
  kind: "repository-analysis",
  requirementIds: ["R001"],
  dependsOn: [],
  status: "ready"
};

function response(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" }
  });
}

test("OpenAI-compatible adapter validates response and normalizes usage", async () => {
  let request;
  const executor = createOpenAICompatibleExecutor({
    provider: "test-provider",
    modelId: "test-model",
    apiKey: "test-key",
    baseUrl: "https://provider.example/v1/",
    fetchImpl: async (url, init) => {
      request = { url: String(url), init, body: JSON.parse(String(init?.body)) };
      return response({
        choices: [{ message: { content: "Analysis complete." } }],
        usage: { prompt_tokens: 11, completion_tokens: 7, total_tokens: 18 }
      });
    }
  });
  const result = await executor.execute(task, "test-provider", "test-model");
  assert.equal(result.status, "success");
  assert.equal(result.summary, "Analysis complete.");
  assert.ok(result.evidence.some((item) => item.includes("18 total tokens")));
  assert.equal(request.url, "https://provider.example/v1/chat/completions");
  assert.equal(request.body.model, "test-model");
  assert.equal(request.init.redirect, "error");
});

test("adapter redacts secrets from outbound context and provider output", async () => {
  let outbound = "";
  const executor = createOpenAICompatibleExecutor({
    provider: "test-provider",
    modelId: "test-model",
    apiKey: "test-key",
    baseUrl: "https://provider.example/v1",
    fetchImpl: async (_url, init) => {
      outbound = String(init?.body);
      return response({ choices: [{ message: { content: "api_key=abcdefghijklmnopqrstuvwxyz123456" } }] });
    }
  });
  const secretTask = { ...task, description: "api_key=abcdefghijklmnopqrstuvwxyz123456" };
  const result = await executor.execute(secretTask, "test-provider", "test-model");
  assert.equal(result.status, "success");
  assert.ok(!outbound.includes("abcdefghijklmnopqrstuvwxyz123456"));
  assert.ok(!result.summary.includes("abcdefghijklmnopqrstuvwxyz123456"));
  assert.ok(result.evidence.some((item) => item.includes("redacted")));
});

test("adapter does not retry authentication failures and does not expose credentials", async () => {
  let calls = 0;
  const executor = createOpenAICompatibleExecutor({
    provider: "test-provider",
    modelId: "test-model",
    apiKey: "never-print-this-secret",
    baseUrl: "https://provider.example/v1",
    fetchImpl: async () => {
      calls++;
      return response({ error: "invalid" }, 401);
    }
  });
  const result = await executor.execute(task, "test-provider", "test-model");
  assert.equal(result.status, "failure");
  assert.equal(calls, 1);
  assert.ok(!JSON.stringify(result).includes("never-print-this-secret"));
});

test("adapter retries rate limits and succeeds when provider recovers", async () => {
  let calls = 0;
  const executor = createOpenAICompatibleExecutor({
    provider: "test-provider",
    modelId: "test-model",
    apiKey: "test-key",
    baseUrl: "https://provider.example/v1",
    maxAttempts: 2,
    fetchImpl: async () => {
      calls++;
      return calls === 1
        ? response({ error: "rate limit" }, 429)
        : response({ choices: [{ message: { content: "Recovered" } }] });
    }
  });
  const result = await executor.execute(task, "test-provider", "test-model");
  assert.equal(result.status, "success");
  assert.equal(calls, 2);
});

test("adapter rejects insecure remote endpoints and provider mismatch", async () => {
  assert.throws(() => createOpenAICompatibleExecutor({
    provider: "bad",
    modelId: "model",
    apiKey: "key",
    baseUrl: "http://provider.example/v1"
  }), /HTTPS/);
  const executor = createOpenAIExecutor("test-key", "test-model", {
    fetchImpl: async () => response({ choices: [{ message: { content: "unused" } }] })
  });
  const mismatch = await executor.execute(task, "xai", "test-model");
  assert.equal(mismatch.status, "skipped");
  assert.equal(mismatch.errors?.[0], "ADAPTER_MISMATCH");
});

test("xAI factory uses the official API endpoint", async () => {
  let endpoint = "";
  const executor = createXAIExecutor("test-key", "test-model", {
    fetchImpl: async (url) => {
      endpoint = String(url);
      return response({ choices: [{ message: { content: "ok" } }] });
    }
  });
  const result = await executor.execute(task, "xai", "test-model");
  assert.equal(result.status, "success");
  assert.equal(endpoint, "https://api.x.ai/v1/chat/completions");
});


test("chat adapter emits latency, token, and rate-limit telemetry", async () => {
  const events = [];
  const executor = createOpenAICompatibleExecutor({
    provider: "test-provider", modelId: "test-model", apiKey: "test-key", baseUrl: "https://provider.example/v1",
    onTelemetry: (event) => events.push(event),
    fetchImpl: async () => response({ choices: [{ message: { content: "ok" } }], usage: { prompt_tokens: 2, completion_tokens: 3, total_tokens: 5 } }, 200)
  });
  const result = await executor.execute(task, "test-provider", "test-model");
  assert.equal(result.status, "success");
  assert.equal(events[0].totalTokens, 5);
  assert.equal(events[0].outcome, "success");
  assert.ok(events[0].elapsedMs >= 0);
});
