import test from "node:test";
import assert from "node:assert/strict";
import {
  detectInstructionLanguage,
  resolveInstructionPathsForLanguages,
  resolveLanguageInstructionPaths
} from "../dist/core/languageInstructions.js";

test("detects common source languages including C++ and shell", () => {
  assert.equal(detectInstructionLanguage("src/main.cpp"), "cpp");
  assert.equal(detectInstructionLanguage("src/header.hpp"), "cpp");
  assert.equal(detectInstructionLanguage("src/header.h"), "c");
  assert.equal(detectInstructionLanguage("src/main.c"), "c");
  assert.equal(detectInstructionLanguage("tools/check.sh"), "bash");
  assert.equal(detectInstructionLanguage("src/App.tsx"), "typescript");
  assert.equal(detectInstructionLanguage("src/Main.java"), "java");
  assert.equal(detectInstructionLanguage("db/schema.sql"), "sql");
});

test("resolves common and provider-specific paths once per language", () => {
  assert.deepEqual(resolveLanguageInstructionPaths(
    ["src/a.cpp", "src/b.cpp", "src/main.py"], "anthropic"
  ), [
    "languages/cpp/common/AGENTS.md",
    "languages/cpp/anthropic/INSTRUCTIONS.md",
    "languages/python/common/AGENTS.md",
    "languages/python/anthropic/INSTRUCTIONS.md"
  ]);
});

test("supports an explicit language override for ambiguous source sets", () => {
  assert.deepEqual(resolveInstructionPathsForLanguages(["cpp"], "local", "rules"), [
    "rules/cpp/common/AGENTS.md",
    "rules/cpp/local/INSTRUCTIONS.md"
  ]);
});

test("rejects path traversal and unsafe instruction roots", () => {
  assert.equal(detectInstructionLanguage("../outside/main.cpp"), undefined);
  assert.equal(detectInstructionLanguage("src/../../main.py"), undefined);
  assert.throws(() => resolveInstructionPathsForLanguages(["cpp"], "openai", "../rules"), /safe relative path/);
  assert.throws(() => resolveInstructionPathsForLanguages(["cpp"], "openai", "C:\\\\rules"), /safe relative path/);
  assert.throws(() => resolveInstructionPathsForLanguages(["../../outside"], "openai"), /Unsupported instruction language/);
  assert.throws(() => resolveInstructionPathsForLanguages(["cpp"], "unknown"), /Unsupported AI instruction provider/);
  assert.throws(() => resolveInstructionPathsForLanguages(["cpp"], "openai", "rules\0escape"), /safe relative path/);
});
