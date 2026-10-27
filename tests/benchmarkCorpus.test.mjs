import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { evaluateBenchmarkOutputs, validateBenchmarkCorpus, verifyBenchmarkOutput } from "../dist/core/benchmarkCorpus.js";

test("versioned benchmark corpus validates and rejects duplicate IDs", async () => {
  const raw = JSON.parse(await readFile(new URL("../benchmarks/routing/v1.json", import.meta.url), "utf8"));
  const corpus = validateBenchmarkCorpus(raw);
  assert.equal(corpus.corpusId, "aifiar-routing-core");
  assert.equal(corpus.version, "1.0.0");
  assert.equal(corpus.cases.length, 8);
  assert.throws(() => validateBenchmarkCorpus({ ...raw, cases: [raw.cases[0], raw.cases[0]] }), /Duplicate benchmark case ID/);
  assert.throws(() => validateBenchmarkCorpus({ ...raw, schemaVersion: 99 }), /schema version/);
});

test("independent verifiers enforce required terms, forbidden terms, and JSON keys", () => {
  assert.equal(verifyBenchmarkOutput({ kind: "contains-all", terms: ["evidence", "unverified"] }, "Evidence, assumptions are unverified.").passed, true);
  assert.equal(verifyBenchmarkOutput({ kind: "contains-all", terms: ["evidence", "rollback"] }, "Evidence only.").passed, false);
  assert.equal(verifyBenchmarkOutput({ kind: "contains-none", terms: ["ghp_"] }, "credential ghp_secret").passed, false);
  assert.equal(verifyBenchmarkOutput({ kind: "json-keys", requiredKeys: ["implementation", "tests"] }, '{"implementation":"x","tests":[]}').passed, true);
  assert.equal(verifyBenchmarkOutput({ kind: "json-keys", requiredKeys: ["tests"] }, '{"implementation":"x"}').passed, false);
});

test("benchmark run reports coverage and missing cases without inventing measurements", async () => {
  const corpus = validateBenchmarkCorpus(JSON.parse(await readFile(new URL("../benchmarks/routing/v1.json", import.meta.url), "utf8")));
  const outputs = [
    { caseId: "planning-requirements-001", output: "No network access; bounded output; rollback on failure.", provider: "fixture", modelId: "deterministic", latencyMs: 3, inputTokens: 10, outputTokens: 9 },
    { caseId: "coding-json-contract-001", output: '{"implementation":"done","tests":[],"limitations":"none"}', provider: "fixture", modelId: "deterministic", latencyMs: 4, inputTokens: 8, outputTokens: 7 },
    { caseId: "general-empty-output-001", output: "" }
  ];
  const run = evaluateBenchmarkOutputs(corpus, outputs);
  assert.equal(run.report.coverage, 3 / 8);
  assert.equal(run.report.successRate, 2 / 3);
  assert.equal(run.report.missingCases.length, 5);
  assert.equal(run.results.find((item) => item.caseId === "general-empty-output-001")?.passed, false);
  assert.equal(run.report.observedCost, null);
});


test("duplicate outputs fail closed instead of retaining the last passing result", async () => {
  const raw = JSON.parse(await readFile(new URL("../benchmarks/routing/v1.json", import.meta.url), "utf8"));
  const corpus = validateBenchmarkCorpus(raw);
  const caseId = "general-empty-output-001";
  const run = evaluateBenchmarkOutputs(corpus, [
    { caseId, output: "first valid response" },
    { caseId, output: "second valid response" }
  ]);
  const result = run.results.find((item) => item.caseId === caseId);
  assert.equal(result?.passed, false);
  assert.deepEqual(result?.reasons, ["duplicate-output"]);
  assert.ok(run.report.invalidDecisions.some((item) => item.includes("duplicate")));
});
