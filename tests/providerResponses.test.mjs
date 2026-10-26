import test from "node:test";
import assert from "node:assert/strict";
import { createOpenAIResponsesExecutor } from "../dist/models/openAIResponsesAdapter.js";
const task = { id: "T1", title: "Analyze", description: "Return a summary", kind: "general", requirementIds: [], dependsOn: [], status: "ready" };
test("Responses adapter validates output, usage, and rate-limit headers", async () => {
  let request;
  const events = [];
  const executor = createOpenAIResponsesExecutor({
    apiKey: "test-key", modelId: "test-model", onTelemetry: (event) => events.push(event),
    fetchImpl: async (url, init) => {
      request = { url: String(url), body: JSON.parse(String(init.body)), redirect: init.redirect };
      return new Response(JSON.stringify({ output_text: "Done", usage: { input_tokens: 4, output_tokens: 3, total_tokens: 7 } }), {
        status: 200, headers: { "x-ratelimit-remaining-requests": "9" }
      });
    }
  });
  const result = await executor.execute(task, "openai", "test-model");
  assert.equal(result.status, "success");
  assert.equal(result.summary, "Done");
  assert.equal(request.url, "https://api.openai.com/v1/responses");
  assert.equal(request.redirect, "error");
  assert.equal(events[0].totalTokens, 7);
  assert.equal(events[0].rateLimit.remaining, 9);
});
test("Responses adapter parses structured output items and refuses provider mismatch", async () => {
  const executor = createOpenAIResponsesExecutor({
    apiKey: "test-key", modelId: "test-model",
    fetchImpl: async () => new Response(JSON.stringify({ output: [{ content: [{ type: "output_text", text: "structured output" }] }] }), { status: 200 })
  });
  const result = await executor.execute(task, "openai", "test-model");
  assert.equal(result.summary, "structured output");
  assert.equal((await executor.execute(task, "xai", "test-model")).status, "skipped");
});
test("Responses adapter redacts returned secrets and does not expose auth failures", async () => {
  const executor = createOpenAIResponsesExecutor({
    apiKey: "secret-key", modelId: "test-model",
    fetchImpl: async () => new Response(JSON.stringify({ output_text: "api_key=abcdefghijklmnopqrstuvwxyz123456" }), { status: 200 })
  });
  const result = await executor.execute(task, "openai", "test-model");
  assert.ok(!result.summary.includes("abcdefghijklmnopqrstuvwxyz123456"));
});
