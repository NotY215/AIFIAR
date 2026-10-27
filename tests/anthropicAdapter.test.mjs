import test from "node:test";
import assert from "node:assert/strict";
import { createAnthropicExecutor } from "../dist/models/anthropicAdapter.js";

const task = {
  id: "A1", title: "Review change", description: "Review a small change",
  kind: "review", requirementIds: ["R1"], dependsOn: [], status: "ready"
};

test("Anthropic adapter uses Messages API, aggregates text blocks, and reports provider usage", async () => {
  let request;
  const events = [];
  const executor = createAnthropicExecutor({
    apiKey: "secret-test-key",
    modelId: "claude-test-model",
    fetchImpl: async (url, init) => {
      request = { url: String(url), init, body: JSON.parse(init.body) };
      return new Response(JSON.stringify({
        type: "message",
        content: [{ type: "text", text: "first" }, { type: "tool_use", id: "ignored", name: "not-run", input: {} }, { type: "text", text: "second" }],
        stop_reason: "end_turn",
        usage: { input_tokens: 12, output_tokens: 7 }
      }), {
        status: 200,
        headers: {
          "content-type": "application/json",
          "anthropic-ratelimit-requests-limit": "100",
          "anthropic-ratelimit-requests-remaining": "95"
        }
      });
    },
    onTelemetry: (event) => events.push(event)
  });
  const result = await executor.execute(task, "anthropic", "claude-test-model");
  assert.equal(request.url, "https://api.anthropic.com/v1/messages");
  assert.equal(request.init.headers["x-api-key"], "secret-test-key");
  assert.equal(request.init.headers["anthropic-version"], "2023-06-01");
  assert.equal(request.body.model, "claude-test-model");
  assert.equal(request.body.max_tokens, 2048);
  assert.equal(result.status, "success");
  assert.equal(result.summary, "first\nsecond");
  assert.ok(result.evidence.some((line) => line.includes("12 input tokens")));
  assert.equal(events[0].inputTokens, 12);
  assert.equal(events[0].outputTokens, 7);
  assert.equal(events[0].totalTokens, 19);
  assert.ok(!JSON.stringify(result).includes("secret-test-key"));
});

test("Anthropic adapter refuses success responses without usable text blocks", async () => {
  const executor = createAnthropicExecutor({
    apiKey: "test-key",
    modelId: "claude-test-model",
    fetchImpl: async () => new Response(JSON.stringify({
      type: "message", content: [{ type: "image", source: {} }], usage: { input_tokens: 1, output_tokens: 1 }
    }), { status: 200 })
  });
  const result = await executor.execute(task, "anthropic", "claude-test-model");
  assert.equal(result.status, "failure");
  assert.match(result.errors[0], /INVALID_RESPONSE/);
});

test("Anthropic adapter does not retry authentication failures or leak credentials", async () => {
  let calls = 0;
  const executor = createAnthropicExecutor({
    apiKey: "private-key",
    modelId: "claude-test-model",
    maxAttempts: 3,
    fetchImpl: async () => {
      calls++;
      return new Response("{}", { status: 401 });
    }
  });
  const result = await executor.execute(task, "anthropic", "claude-test-model");
  assert.equal(calls, 1);
  assert.equal(result.status, "failure");
  assert.match(result.errors[0], /AUTHENTICATION HTTP 401/);
  assert.ok(!JSON.stringify(result).includes("private-key"));
});

test("Anthropic adapter rejects mismatched provider/model selections without making requests", async () => {
  let calls = 0;
  const executor = createAnthropicExecutor({
    apiKey: "test-key",
    modelId: "claude-test-model",
    fetchImpl: async () => { calls++; return new Response("{}", { status: 200 }); }
  });
  const result = await executor.execute(task, "openai", "claude-test-model");
  assert.equal(result.status, "skipped");
  assert.equal(result.errors[0], "ADAPTER_MISMATCH");
  assert.equal(calls, 0);
});
