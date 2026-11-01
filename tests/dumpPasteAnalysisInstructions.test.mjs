import test from "node:test";
import assert from "node:assert/strict";
import { buildDumpPasteAnalysisInstructions } from "../dist/core/dumpPasteAnalysisInstructions.js";

test("tracks dump artifacts separately from represented source files", () => {
  const p = buildDumpPasteAnalysisInstructions();
  assert.match(p, /dump artifacts/);
  assert.match(p, /distinct source files represented/);
  assert.match(p, /fragment count as file count/);
  assert.match(p, /coverage ledger/);
});

test("requires behavior reconstruction and a responsibility-based output design", () => {
  const p = buildDumpPasteAnalysisInstructions();
  assert.match(p, /RECONSTRUCT WHAT THE FRAGMENTS ACTUALLY DO/);
  assert.match(p, /single primary responsibility/);
  assert.match(p, /dependency diagram/);
  assert.match(p, /integrated cross-file changes/);
});

test("requires modernization, testing, docs, and source mapping", () => {
  const p = buildDumpPasteAnalysisInstructions();
  assert.match(p, /REDESIGN, DO NOT MERELY COPY/);
  assert.match(p, /TEST THE RECONSTRUCTION AND THE REDESIGN/);
  assert.match(p, /Update relevant Markdown documentation/);
  assert.match(p, /source-to-output ledger/);
});

test("preserves provenance and rejects concealment", () => {
  const p = buildDumpPasteAnalysisInstructions();
  assert.match(p, /preserve required copyright notices/i);
  assert.match(p, /Do not help disguise copied code/i);
  assert.match(p, /not to obscure authorship, provenance, review, or source origin/);
});
