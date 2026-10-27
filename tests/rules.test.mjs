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

test("AIFIAR instruction files keep comments concise and scope style preferences", async () => {
  for (const path of ruleFiles) {
    const content = await readFile(new URL(`../${path}`, import.meta.url), "utf8");
    assert.equal(content.includes("\u2014"), false, `${path} contains an em dash in AIFIAR-maintained guidance`);
    assert.match(content, /comments rare|comments short/i, `${path} must require concise comments`);
  }
  const gpt = await readFile(new URL("../models/gpt/INSTRUCTIONS.md", import.meta.url), "utf8");
  assert.match(gpt, /AIFIAR's house style applies to AIFIAR-maintained files/i);
});

const gptModelProfiles = [
  "models/gpt/5/INSTRUCTIONS.md",
  "models/gpt/5.5/INSTRUCTIONS.md",
  "models/gpt/5.6/INSTRUCTIONS.md",
  "models/gpt/6/INSTRUCTIONS.md",
  "models/gpt/astra/INSTRUCTIONS.md"
];

test("GPT model profiles define scope, allowed behavior, exclusions, and limits", async () => {
  for (const path of gptModelProfiles) {
    const content = await readFile(new URL(`../${path}`, import.meta.url), "utf8");
    assert.match(content, /^## Scope$/m, `${path} must define its scope`);
    assert.match(content, /^## Allowed$/m, `${path} must list allowed behavior`);
    assert.match(content, /^## Not allowed \/ ignore$/m, `${path} must list exclusions`);
    assert.match(content, /^## Limits$/m, `${path} must state limits`);
  }
});
