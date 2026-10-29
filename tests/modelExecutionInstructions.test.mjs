import test from "node:test";
import assert from "node:assert/strict";
import { buildModelExecutionInstructions } from "../dist/core/modelExecutionInstructions.js";

function task(overrides = {}) {
  return {
    id: "T-1",
    title: "Implement safe parser",
    description: "Implement the parser and verify failure cases.",
    kind: "coding",
    requirementIds: ["R-1", "R-2"],
    dependsOn: [],
    contextRefs: ["src/parser.ts", "tests/parser.test.ts", "README.md"],
    status: "ready",
    ...overrides
  };
}

test("execution instructions preserve full-scope implementation and honest capability boundaries", () => {
  const prompt = buildModelExecutionInstructions("openai", task());
  assert.match(prompt, /complete requested scope/);
  assert.match(prompt, /Do not arbitrarily shrink/);
  assert.match(prompt, /do not unlock premium features/);
  assert.match(prompt, /Do not expose private hidden chain-of-thought/);
  assert.match(prompt, /TypeScript:/);
  assert.match(prompt, /Output contract:/);
  assert.match(prompt, /PREDICTION AND FORECASTING/);
  assert.match(prompt, /FACT-CHECKING/);
  assert.match(prompt, /DEPTH FIXING \\/ SELF-AUDIT/);
});

test("task kind changes guidance to match the requested work", () => {
  const research = buildModelExecutionInstructions("gemini", task({ kind: "research" }));
  const review = buildModelExecutionInstructions("xai", task({ kind: "review" }));
  assert.match(research, /primary sources/);
  assert.match(review, /Prioritize actionable defects/);
  assert.match(research, /Google|Gemini|verifiable subproblems/i);
  assert.match(review, /xai/i);
});

test("provider workflow guidance is selected without loading unrelated provider instructions", () => {
  const anthropic = buildModelExecutionInstructions("anthropic", task());
  const qwenCode = buildModelExecutionInstructions("qwen-code", task());
  const local = buildModelExecutionInstructions("local", task());
  assert.match(anthropic, /structured pass/);
  assert.match(qwenCode, /end-to-end engineering/);
  assert.match(local, /do not assume tools/);
  assert.doesNotMatch(anthropic, /Qwen research guidance/);
});

test("mixed-language tasks receive language-specific reminders once per language", () => {
  const hash = "a".repeat(64);
  const prompt = buildModelExecutionInstructions("openai", task({
    contextRefs: ["src/index.ts@" + hash, "scripts/build.py@" + hash, "queries/schema.sql@" + hash, "src/index.ts@" + hash]
  }));
  assert.equal((prompt.match(/TypeScript:/g) ?? []).length, 1);
  assert.equal((prompt.match(/Python:/g) ?? []).length, 1);
  assert.equal((prompt.match(/SQL:/g) ?? []).length, 1);
  assert.match(prompt, /parameterize values/);
  assert.match(prompt, /validate external data at runtime/);
});

test("unknown languages and providers use safe generic defaults", () => {
  const prompt = buildModelExecutionInstructions("unregistered-provider", task({
    contextRefs: ["README.md", "assets/data.bin"]
  }));
  assert.match(prompt, /Provider workflow preference for unregistered-provider/);
  assert.match(prompt, /simple, robust solutions/);
  assert.doesNotMatch(prompt, /TypeScript:|Python:|SQL:/);
});
