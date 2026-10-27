import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("provider coverage distinguishes executable adapters from guidance-only providers", async () => {
  const matrix = JSON.parse(await readFile(new URL("../models/provider-coverage.json", import.meta.url), "utf8"));
  const providers = new Map(matrix.providers.map((item) => [item.provider, item]));
  assert.equal(providers.get("openai").runtimeAdapter, true);
  assert.deepEqual(providers.get("openai").apiModes, ["chat-completions", "responses"]);
  assert.equal(providers.get("xai").runtimeAdapter, true);
  assert.equal(providers.get("anthropic").runtimeAdapter, true);
  assert.deepEqual(providers.get("anthropic").apiModes, ["anthropic-messages"]);
  for (const provider of ["gemini", "local"]) {
    assert.equal(providers.get(provider).guidance, true);
    assert.equal(providers.get(provider).runtimeAdapter, false);
    assert.equal(providers.get(provider).availability, "unsupported");
  }
  assert.equal(providers.get("gpt").runtimeAdapter, false);
  assert.equal(providers.get("grok").runtimeAdapter, false);
});

test("each added provider guidance states that it does not prove runtime support", async () => {
  for (const provider of ["openai", "xai", "anthropic", "gemini", "local"]) {
    const text = await readFile(new URL(`../models/${provider}/INSTRUCTIONS.md`, import.meta.url), "utf8");
    assert.match(text, /Instruction files do not create provider connectivity/);
    assert.match(text, /Not allowed/i);
    assert.match(text, /Limits/i);
  }
});
