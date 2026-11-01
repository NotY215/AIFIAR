import test from "node:test";
import assert from "node:assert/strict";
import { buildRepositoryAnalysisInstructions } from "../dist/core/repositoryAnalysisInstructions.js";
import { buildDumpPasteAnalysisInstructions } from "../dist/core/dumpPasteAnalysisInstructions.js";
import { buildModelExecutionInstructions } from "../dist/core/modelExecutionInstructions.js";

test("repository protocol requires broad inventory, coverage and evidence", () => {
  const p = buildRepositoryAnalysisInstructions();
  for (const r of [/INVENTORY THE ENTIRE ACCESSIBLE PROJECT/, /coverage ledger/, /BUILD A REPOSITORY MODEL/i, /line\/symbol evidence/, /benchmarks/, /Never fabricate/, /untrusted data/i]) assert.match(p, r);
});

test("repository task receives repository and dump-paste instructions", () => {
  const p = buildModelExecutionInstructions("qwen-code", {
    id: "R-1", title: "Analyze repo", description: "Analyze and optimize",
    kind: "repository-analysis", requirementIds: [], dependsOn: [], status: "ready"
  });
  assert.match(p, /AIFIAR WHOLE-REPOSITORY ANALYSIS, REFACTORING, AND VERIFICATION PROTOCOL/);
  assert.match(p, /AIFIAR DUMP-PASTE RECONSTRUCTION, REDESIGN, AND INTEGRATION PROTOCOL/);
  assert.match(p, /implement appropriate high-confidence changes/);
});

test("report-only requests and clone claims are handled honestly", () => {
  const p = buildRepositoryAnalysisInstructions();
  assert.match(p, /do not modify files/);
  assert.match(p, /Do not imply that a URL has been cloned/);
  assert.match(p, /exact remaining unread ranges/);
});

test("dump-paste protocol separates dump artifacts from represented source files", () => {
  const p = buildDumpPasteAnalysisInstructions();
  assert.match(p, /Dump A/);
  assert.match(p, /fragment count as file count/);
  assert.match(p, /existing-file count, planned-new-file count/);
  assert.match(p, /source-to-output ledger/);
  assert.match(p, /output path and symbol/);
});

test("dump-paste protocol requires redesign, integration, verification and provenance", () => {
  const p = buildDumpPasteAnalysisInstructions();
  for (const r of [/REDESIGN, DO NOT MERELY COPY/, /IMPLEMENT IN CONTROLLED PASSES/, /TEST THE RECONSTRUCTION/, /Update relevant Markdown documentation/, /Preserve required copyright notices/i, /Do not help disguise copied code/i]) assert.match(p, r);
});

test("dump-paste output structure is based on responsibility, not concealment", () => {
  const p = buildDumpPasteAnalysisInstructions();
  assert.match(p, /single primary responsibility/);
  assert.match(p, /not obscure authorship, provenance, review, or source origin/);
  assert.match(p, /mapping table from each dump ID/);
});
