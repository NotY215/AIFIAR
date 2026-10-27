import test from "node:test";
import assert from "node:assert/strict";
import { createGeminiExecutor, discoverGeminiModels } from "../dist/models/geminiAdapter.js";

const task = { id: "G1", title: "Analyze", description: "Return the test marker", kind: "general", requirementIds: [], dependsOn: [], status: "ready" };
const response = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

test("Gemini adapter uses generateContent, API key header, text output and observed usage", async () => {
  const events = [];
  const executor = createGeminiExecutor({
    apiKey: "gemini-test-key",
    modelId: "gemini-test-model",
    onTelemetry: (event) => events.push(event),
    fetchImpl: async (url, init) => {
      assert.equal(String(url), "https://generativelanguage.googleapis.com/v1beta/models/gemini-test-model:generateContent");
      assert.equal(init.headers["x-goog-api-key"], "gemini-test-key");
      assert.equal(init.redirect, undefined);
      const body = JSON.parse(init.body);
      assert.equal(body.generationConfig.maxOutputTokens, 2048);
      assert.equal(body.contents[0].role, "user");
      return response({
        candidates: [{ content: { parts: [{ text: "AIFIAR Gemini works." }] }, finishReason: "STOP" }],
        usageMetadata: { promptTokenCount: 7, candidatesTokenCount: 4, totalTokenCount: 11 }
      });
    }
  });
  const result = await executor.execute(task, "gemini", "gemini-test-model");
  assert.equal(result.status, "success");
  assert.equal(result.summary, "AIFIAR Gemini works.");
  assert.equal(result.inputTokens, 7);
  assert.equal(result.outputTokens, 4);
  assert.equal(result.totalTokens, 11);
  assert.equal(events[0].totalTokens, 11);
  assert.ok(!JSON.stringify(events).includes("gemini-test-key"));
});

test("Gemini adapter rejects a mismatched provider or model", async () => {
  const executor = createGeminiExecutor({ apiKey: "test", modelId: "gemini-test", fetchImpl: async () => { throw new Error("must not call"); } });
  const result = await executor.execute(task, "openai", "gemini-test");
  assert.equal(result.status, "skipped");
  assert.equal(result.errors[0], "ADAPTER_MISMATCH");
});

test("Gemini adapter reports blocked prompts and safety-filtered candidates as failures", async () => {
  const blockedPrompt = createGeminiExecutor({
    apiKey: "test", modelId: "gemini-test",
    fetchImpl: async () => response({ promptFeedback: { blockReason: "SAFETY" }, candidates: [] })
  });
  const first = await blockedPrompt.execute(task, "gemini", "gemini-test");
  assert.equal(first.status, "failed");
  assert.equal(first.errors[0], "SAFETY_BLOCK");

  const blockedCandidate = createGeminiExecutor({
    apiKey: "test", modelId: "gemini-test",
    fetchImpl: async () => response({ candidates: [{ content: { parts: [{ text: "filtered" }] }, finishReason: "SAFETY" }] })
  });
  const second = await blockedCandidate.execute(task, "gemini", "gemini-test");
  assert.equal(second.status, "failed");
  assert.equal(second.errors[0], "SAFETY_BLOCK");
});

test("Gemini adapter fails closed on invalid response schemas and authentication errors", async () => {
  const invalid = createGeminiExecutor({ apiKey: "test", modelId: "gemini-test", fetchImpl: async () => response({ candidates: [] }) });
  const bad = await invalid.execute(task, "gemini", "gemini-test");
  assert.equal(bad.status, "failed");
  assert.equal(bad.errors[0], "INVALID_RESPONSE");

  const denied = createGeminiExecutor({ apiKey: "test", modelId: "gemini-test", fetchImpl: async () => response({ error: "denied" }, 403) });
  const auth = await denied.execute(task, "gemini", "gemini-test");
  assert.equal(auth.status, "failed");
  assert.equal(auth.errors[0], "AUTHENTICATION");
});

test("Gemini model discovery parses only generateContent-capable models", async () => {
  const result = await discoverGeminiModels({
    apiKey: "test",
    fetchImpl: async (url, init) => {
      const parsed = new URL(String(url));
      assert.equal(parsed.pathname, "/v1beta/models");
      assert.equal(init.headers["x-goog-api-key"], "test");
      return response({ models: [
        { name: "models/gemini-vision", supportedGenerationMethods: ["embedContent"] },
        { name: "models/gemini-flash", supportedGenerationMethods: ["generateContent"], version: "001" }
      ] });
    }
  });
  assert.deepEqual(result.models.map((model) => model.id), ["gemini-flash"]);
  assert.equal(result.provider, "gemini");
  assert.equal(result.models[0].ownedBy, "001");
});
