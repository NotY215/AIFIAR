import test from "node:test";
import assert from "node:assert/strict";
import { createOpenAIExecutor } from "../dist/models/openaiCompatibleAdapter.js";
import { createOpenAIResponsesExecutor } from "../dist/models/openAIResponsesAdapter.js";
import { createXAIExecutor } from "../dist/models/openaiCompatibleAdapter.js";

const enabled = process.env.AIFIAR_LIVE_TESTS === "1";
const task = { id: "LIVE-1", title: "Provider smoke test", description: "Reply with exactly AIFIAR_LIVE_OK. Do not perform any other action.", kind: "general", requirementIds: [], dependsOn: [], status: "ready" };
test("live OpenAI Chat Completions smoke test", { skip: !(enabled && process.env.OPENAI_API_KEY && process.env.AIFIAR_OPENAI_MODEL) }, async () => {
  const result = await createOpenAIExecutor(process.env.OPENAI_API_KEY, process.env.AIFIAR_OPENAI_MODEL, { maxOutputTokens: 32, maxAttempts: 1 }).execute(task, "openai", process.env.AIFIAR_OPENAI_MODEL);
  assert.equal(result.status, "success", JSON.stringify(result.errors));
  assert.match(result.summary, /AIFIAR_LIVE_OK/);
});
test("live OpenAI Responses API smoke test", { skip: !(enabled && process.env.OPENAI_API_KEY && process.env.AIFIAR_OPENAI_RESPONSES_MODEL) }, async () => {
  const model = process.env.AIFIAR_OPENAI_RESPONSES_MODEL;
  const result = await createOpenAIResponsesExecutor({ apiKey: process.env.OPENAI_API_KEY, modelId: model, maxOutputTokens: 32, maxAttempts: 1 }).execute(task, "openai", model);
  assert.equal(result.status, "success", JSON.stringify(result.errors));
  assert.match(result.summary, /AIFIAR_LIVE_OK/);
});
test("live xAI Chat Completions smoke test", { skip: !(enabled && process.env.XAI_API_KEY && process.env.AIFIAR_XAI_MODEL) }, async () => {
  const model = process.env.AIFIAR_XAI_MODEL;
  const result = await createXAIExecutor(process.env.XAI_API_KEY, model, { maxOutputTokens: 32, maxAttempts: 1 }).execute(task, "xai", model);
  assert.equal(result.status, "success", JSON.stringify(result.errors));
  assert.match(result.summary, /AIFIAR_LIVE_OK/);
});
