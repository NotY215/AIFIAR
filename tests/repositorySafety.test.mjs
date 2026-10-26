import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, symlink, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { scanRepository } from "../dist/core/repositoryScanner.js";
import { compareRepositorySnapshots, isSummaryFresh } from "../dist/core/freshnessEngine.js";
import { evaluateCompletion } from "../dist/core/completionGate.js";

test("scanner hashes stable file content and skips generated directories", async () => {
  const root = await mkdtemp(join(tmpdir(), "aifiar-scan-"));
  try {
    await mkdir(join(root, "node_modules"));
    await writeFile(join(root, "main.ts"), "export const value = 1;");
    await writeFile(join(root, "node_modules", "ignored.js"), "ignored");
    const result = await scanRepository(root);
    assert.deepEqual(result.files.map((file) => file.path), ["main.ts"]);
    assert.equal(result.files[0].contentHash.length, 64);
    assert.equal(result.issues.length, 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("scanner enforces file-size limits and never follows symlinks", async () => {
  const root = await mkdtemp(join(tmpdir(), "aifiar-scan-"));
  const outside = await mkdtemp(join(tmpdir(), "aifiar-outside-"));
  try {
    await writeFile(join(root, "large.txt"), "0123456789");
    await writeFile(join(outside, "secret.txt"), "not in repo");
    try { await symlink(join(outside, "secret.txt"), join(root, "linked.txt")); } catch { }
    const result = await scanRepository(root, { maxFileBytes: 5 });
    assert.ok(result.issues.some((issue) => issue.reason === "too-large"));
    assert.ok(result.issues.every((issue) => issue.path !== "linked.txt" || issue.reason === "symlink-skipped"));
    assert.ok(!result.files.some((file) => file.path.includes("secret")));
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  }
});

test("freshness comparison reports additions, modifications and deletions", () => {
  const previous = { repositoryId: "repo", scannedAt: "2026-01-01T00:00:00.000Z", files: [
    { path: "a.ts", contentHash: "old", sizeBytes: 1 },
    { path: "gone.ts", contentHash: "gone", sizeBytes: 1 }
  ] };
  const current = { repositoryId: "repo", scannedAt: "2026-01-02T00:00:00.000Z", files: [
    { path: "a.ts", contentHash: "new", sizeBytes: 1 },
    { path: "b.ts", contentHash: "added", sizeBytes: 1 }
  ] };
  const report = compareRepositorySnapshots(previous, current);
  assert.equal(report.status, "changed");
  assert.deepEqual(report.modified, ["a.ts"]);
  assert.deepEqual(report.added, ["b.ts"]);
  assert.deepEqual(report.deleted, ["gone.ts"]);
});

test("freshness refuses cross-repository comparisons and detects stale summaries", () => {
  const report = compareRepositorySnapshots(
    { repositoryId: "one", scannedAt: "2026-01-01T00:00:00.000Z", files: [] },
    { repositoryId: "two", scannedAt: "2026-01-02T00:00:00.000Z", files: [] }
  );
  assert.equal(report.status, "unknown");
  const summary = isSummaryFresh({ sourceHashes: { "src/a.ts": "old" }, generatedAt: "2026-01-02T00:00:00.000Z" }, new Map([["src/a.ts", "new"]]), 1000, Date.parse("2026-01-02T00:00:02.000Z"));
  assert.equal(summary.fresh, false);
  assert.deepEqual(summary.stalePaths, ["src/a.ts"]);
});

test("completion gate blocks unverifiable success claims", () => {
  const plan = {
    goal: "complete feature",
    skillLevel: "intermediate",
    requirements: [{ id: "r1", text: "Feature works", mandatory: true, status: "verified", evidence: ["test output"] }],
    tasks: [{ id: "t1", title: "Implement", description: "Implement feature", kind: "coding", requirementIds: ["r1"], dependsOn: [], status: "completed" }],
    warnings: []
  };
  const blocked = evaluateCompletion({
    plan,
    results: [{ taskId: "t1", provider: "test", modelId: "mock", status: "success", summary: "Done", evidence: [] }],
    requiredChecks: ["typecheck", "tests"],
    completedChecks: ["typecheck"],
    repositoryScanComplete: true
  });
  assert.equal(blocked.canClaimComplete, false);
  assert.ok(blocked.blockers.some((item) => item.includes("no evidence")));
  assert.deepEqual(blocked.missingChecks, ["tests"]);
});

test("completion gate permits completion only when mandatory evidence and checks exist", () => {
  const plan = {
    goal: "complete feature",
    skillLevel: "intermediate",
    requirements: [{ id: "r1", text: "Feature works", mandatory: true, status: "verified", evidence: ["test output"] }],
    tasks: [{ id: "t1", title: "Implement", description: "Implement feature", kind: "coding", requirementIds: ["r1"], dependsOn: [], status: "completed" }],
    warnings: []
  };
  const report = evaluateCompletion({
    plan,
    results: [{ taskId: "t1", provider: "test", modelId: "mock", status: "success", summary: "Implemented", evidence: ["tests passed"] }],
    requiredChecks: ["typecheck", "tests"],
    completedChecks: ["typecheck", "tests"],
    repositoryScanComplete: true
  });
  assert.equal(report.canClaimComplete, true);
});
