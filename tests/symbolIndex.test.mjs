import test from "node:test";
import assert from "node:assert/strict";
import { buildSymbolIndex, findSymbols } from "../dist/core/symbolIndex.js";

test("indexes TypeScript, Python, and Rust definitions with line numbers", () => {
  const index = buildSymbolIndex([
    { path: "src/service.ts", extension: ".ts", sizeBytes: 50, contentHash: "a".repeat(64), content: "export class Service {\n  run() {}\n}\nexport function createService() {}\n" },
    { path: "app/main.py", extension: ".py", sizeBytes: 35, contentHash: "b".repeat(64), content: "class App:\n    def start(self):\n        pass\n" },
    { path: "src/lib.rs", extension: ".rs", sizeBytes: 30, contentHash: "c".repeat(64), content: "pub struct State {}\npub fn run() {}\n" }
  ]);
  assert.ok(index.symbols.some((s) => s.name === "Service" && s.kind === "class" && s.line === 1));
  assert.ok(index.symbols.some((s) => s.name === "createService" && s.language === "typescript"));
  assert.ok(index.symbols.some((s) => s.name === "App" && s.language === "python"));
  assert.ok(index.symbols.some((s) => s.name === "State" && s.language === "rust"));
  assert.deepEqual(findSymbols(index, "createService").map((s) => s.name), ["createService"]);
});

test("indexes import and include references without executing source", () => {
  const index = buildSymbolIndex([
    { path: "src/main.ts", extension: ".ts", sizeBytes: 20, contentHash: "a".repeat(64), content: 'import { run } from "./run.js";\n' },
    { path: "native/main.c", extension: ".c", sizeBytes: 20, contentHash: "b".repeat(64), content: '#include "engine.h"\n' }
  ]);
  assert.ok(index.references.some((r) => r.name === "./run.js" && r.kind === "import"));
  assert.ok(index.references.some((r) => r.name === "engine.h" && r.kind === "import"));
});
