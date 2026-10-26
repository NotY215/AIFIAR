import test from "node:test";
import assert from "node:assert/strict";
import { executePatchTransaction } from "../dist/core/patchTransaction.js";
import { evaluateVerificationPipeline } from "../dist/core/verificationPipeline.js";

const freshEditPreflight = {
  action: { action: "edit", trustedWorkspaceConfirmed: true },
  plannedFiles: [{ path: "src/a.ts", contentHash: "same" }],
  currentFiles: [{ path: "src/a.ts", contentHash: "same" }]
};

test("patch transaction blocks before apply when preflight fails", async () => {
  let applied = false;
  const report = await executePatchTransaction({
    preflight: { action: { action: "edit", trustedWorkspaceConfirmed: true } },
    adapter: {
      async apply() { applied = true; return { changedPaths: [], evidence: ["applied"] }; },
      async verify() { return { passed: true, evidence: ["verified"], blockers: [] }; },
      async rollback() { return { success: true, evidence: ["rollback"] }; }
    }
  });
  assert.equal(report.status, "blocked");
  assert.equal(applied, false);
});

test("patch transaction returns applied only with post-apply evidence", async () => {
  const report = await executePatchTransaction({
    preflight: freshEditPreflight,
    adapter: {
      async apply() { return { changedPaths: ["src/a.ts"], evidence: ["workspace apply"] }; },
      async verify() { return { passed: true, evidence: ["hashes rechecked"], blockers: [] }; },
      async rollback() { return { success: true, evidence: ["not needed"] }; }
    }
  });
  assert.equal(report.status, "applied");
});

test("patch transaction rolls back after failed post-apply verification", async () => {
  let rolledBack = false;
  const report = await executePatchTransaction({
    preflight: freshEditPreflight,
    adapter: {
      async apply() { return { changedPaths: ["src/a.ts"], evidence: ["workspace apply"] }; },
      async verify() { return { passed: false, evidence: [], blockers: ["unexpected file change"] }; },
      async rollback() { rolledBack = true; return { success: true, evidence: ["workspace restored"] }; }
    }
  });
  assert.equal(report.status, "rolled-back");
  assert.equal(rolledBack, true);
});

test("verification pipeline requires each stage and evidence", () => {
  const report = evaluateVerificationPipeline([
    { stage: "requirements", status: "passed", evidence: ["ledger complete"] },
    { stage: "diff-review", status: "passed", evidence: ["diff inspected"] },
    { stage: "typecheck", status: "passed", evidence: ["tsc exit 0"] },
    { stage: "unit-tests", status: "passed", evidence: ["tests exit 0"] },
    { stage: "security-checks", status: "passed", evidence: ["security tests exit 0"] },
    { stage: "freshness", status: "passed", evidence: ["hashes match"] }
  ]);
  assert.equal(report.passed, true);
});

test("verification pipeline rejects skipped stages, duplicates, and success without evidence", () => {
  const report = evaluateVerificationPipeline([
    { stage: "requirements", status: "passed", evidence: [] },
    { stage: "requirements", status: "passed", evidence: ["duplicate"] },
    { stage: "diff-review", status: "passed", evidence: ["reviewed"] },
    { stage: "typecheck", status: "passed", evidence: ["typecheck passed"] },
    { stage: "unit-tests", status: "skipped", evidence: ["skipped by config"] },
    { stage: "security-checks", status: "passed", evidence: ["security passed"] }
  ]);
  assert.equal(report.passed, false);
  assert.ok(report.missingStages.includes("freshness"));
  assert.ok(report.failedStages.includes("unit-tests"));
  assert.ok(report.invalidResults.some((item) => item.includes("without evidence")));
  assert.ok(report.invalidResults.some((item) => item.includes("duplicate")));
});
