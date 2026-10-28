import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runLiveBenchmark } from "../dist/core/liveBenchmarkRunner.js";
import { BenchmarkEvidenceStore } from "../dist/core/benchmarkEvidenceStore.js";

const corpus = {
  schemaVersion: 1,
  corpusId: "evidence-test",
  version: "1.0.0",
  description: "Deterministic evidence-store tests",
  cases: [{
    id: "case-ready", taskKind: "general", prompt: "Return ready.",
    expectedCapabilities: ["general"], verifier: { kind: "contains-all", terms: ["ready"] }
  }]
};
const temp = () => mkdtemp(join(tmpdir(), "aifiar-evidence-"));
const makeReport = async (runId = "run-1") => runLiveBenchmark(corpus, {
  async execute(task, provider, modelId) {
    return { taskId: task.id, provider, modelId, status: "success",
      summary: "ready api_key=abcdefghijklmnopqrstuvwxyz123456", evidence: [],
      usage: { inputTokens: 3, outputTokens: 2, totalTokens: 5 } };
  }
}, { provider: "mock-provider", modelId: "mock-model", runId, startedAt: "2026-10-28T08:00:00Z" });

test("benchmark evidence is opt-in and requires consent", async () => {
  const directory = await temp();
  try {
    const store = new BenchmarkEvidenceStore({ enabled: true, consentGranted: false, directory, retentionMs: 60_000 });
    assert.equal(await store.append(await makeReport()), false);
    assert.deepEqual(await store.read(), []);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("persists bounded redacted trial evidence and excludes arbitrary report fields", async () => {
  const directory = await temp();
  try {
    const store = new BenchmarkEvidenceStore({ enabled: true, consentGranted: true, directory, retentionMs: 60_000 });
    const report = await makeReport();
    report.trials[0].output += "\nBearer abcdefghijklmnopqrstuvwxyz1234567890";
    report.statistics = [{ provider: "leak", arbitrary: "should-not-persist" }];
    report.limitations.push("extra");
    assert.equal(await store.append(report), true);
    const rows = await store.read();
    assert.equal(rows.length, 1);
    assert.equal(rows[0].report.trials[0].usage.totalTokens, 5);
    assert.ok(!rows[0].report.trials[0].output.includes("abcdefghijklmnopqrstuvwxyz123456"));
    assert.deepEqual(rows[0].report.statistics, []);
    assert.ok(rows[0].report.limitations.some(x => x.includes("omitted")));
    const raw = await readFile(join(directory, "benchmark-evidence.jsonl"), "utf8");
    assert.ok(!raw.includes("should-not-persist"));
    assert.ok(!raw.includes("api_key=abcdefghijklmnopqrstuvwxyz123456"));
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("rejects duplicate run IDs and mismatched report counts", async () => {
  const directory = await temp();
  try {
    const store = new BenchmarkEvidenceStore({ enabled: true, consentGranted: true, directory, retentionMs: 60_000 });
    const report = await makeReport("duplicate");
    await store.append(report);
    await assert.rejects(() => store.append(report), /run ID already exists/i);
    const bad = await makeReport("bad-count");
    bad.passedTrials = 99;
    await assert.rejects(() => store.append(bad), /counts do not match/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("serializes concurrent writes, enforces retention, and clears evidence", async () => {
  const directory = await temp();
  try {
    let now = Date.parse("2026-10-28T10:00:00Z");
    const store = new BenchmarkEvidenceStore({ enabled: true, consentGranted: true, directory, retentionMs: 60_000, maxRuns: 2, maxBytes: 4096, now: () => now });
    await Promise.all([store.append(await makeReport("one")), store.append(await makeReport("two"))]);
    now += 1000;
    await store.append(await makeReport("three"));
    assert.deepEqual((await store.read()).map(x => x.report.runId), ["two", "three"]);
    now += 120_000;
    assert.deepEqual(await store.read(), []);
    await store.append(await makeReport("four"));
    await store.clear();
    assert.deepEqual(await store.read(), []);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("detects tampered evidence and rejects symlink evidence files", async () => {
  const directory = await temp();
  const outside = join(directory, "outside.txt");
  const linkDirectory = join(directory, "link");
  try {
    const store = new BenchmarkEvidenceStore({ enabled: true, consentGranted: true, directory, retentionMs: 60_000 });
    await store.append(await makeReport("tamper"));
    const path = join(directory, "benchmark-evidence.jsonl");
    const raw = await readFile(path, "utf8");
    await writeFile(path, raw.replace("mock-model", "fake-model"), "utf8");
    assert.deepEqual(await store.read(), []);
    await writeFile(outside, "do not overwrite");
    await rm(path);
    await symlink(outside, path);
    await assert.rejects(() => store.read(), /symlink/);
    assert.equal(await readFile(outside, "utf8"), "do not overwrite");
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("handles multibyte output within byte bounds and rejects inconsistent passed states", async () => {
  const directory = await temp();
  try {
    const store = new BenchmarkEvidenceStore({ enabled: true, consentGranted: true, directory, retentionMs: 60_000 });
    const report = await makeReport("unicode");
    report.trials[0].output = "ready " + "😀".repeat(20_000);
    assert.equal(await store.append(report), true);
    const rows = await store.read();
    assert.equal(rows.length, 1);
    assert.ok(Buffer.byteLength(rows[0].report.trials[0].output, "utf8") <= 50_000);
    const inconsistent = await makeReport("inconsistent");
    inconsistent.trials[0].status = "failure";
    await assert.rejects(() => store.append(inconsistent), /cannot be marked passed/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
