import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const ruleFiles = [
  "AGENTS.md",
  "docs/ai-operating-rules.md",
  "models/PROVIDER_TEMPLATE.md",
  "models/gpt/INSTRUCTIONS.md",
  "models/grok/INSTRUCTIONS.md"
];

test("AI instruction files ban em dashes and excessive comments", async () => {
  for (const path of ruleFiles) {
    const content = await readFile(new URL(`../${path}`, import.meta.url), "utf8");
    assert.equal(content.includes("\u2014"), false, `${path} contains an em dash`);
    assert.match(content, /comments rare|comments short/i, `${path} must require concise comments`);
  }
});
