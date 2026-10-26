import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { parsePatchProposal } from "../dist/core/patchProposal.js";
import { executeApprovedPatchProposal } from "../dist/core/approvedPatchWorkflow.js";

const hash = (value) => createHash("sha256").update(value).digest("hex");
function proposal() {
  return parsePatchProposal(JSON.stringify({
    schemaVersion: 1,
    repositoryId: "owner/repo",
    taskId: "change-one-file",
    baseCommit: "commit-a",
    changes: [{
      path: "src/value.ts",
      operation: "modify",
      expectedHash: hash("before"),
      content: "export const value = 2;\n"
    }]
  })).proposal;
}
function input(overrides = {}) {
  return {
    proposal: proposal(),
    getCurrentCommit: async () => "commit-a",
    readFileStates: async (paths) => paths.map((path) => ({ path, contentHash: hash("before") })),
    requestApproval: async ({ digest }) => ({
      approved: true, digest, operatorId: "operator-1", decisionId: "decision-1",
      expiresAt: new Date(Date.now() + 60_000).toISOString()
    }),
    actionOptions: { trustedWorkspaceConfirmed: true, unresolvedInjectionRisk: "low" },
    createAdapter: () => ({
      apply: async () => ({ changedPaths: ["src/value.ts"], evidence: ["applied"] }),
      verify: async () => ({ passed: true, evidence: ["typecheck passed"], blockers: [] }),
      rollback: async () => ({ success: true, evidence: ["rolled back"] })
    }),
    ...overrides
  };
}

test("approved proposal goes through freshness preflight and transaction verification", async () => {
  const report = await executeApprovedPatchProposal(input());
  assert.equal(report.status, "applied");
  assert.equal(report.approval.approved, true);
  assert.equal(report.transaction.verification.passed, true);
});

test("blocks if repository revision changed before approval", async () => {
  const report = await executeApprovedPatchProposal(input({ getCurrentCommit: async () => "commit-b" }));
  assert.equal(report.status, "blocked");
  assert.match(report.blockers[0], /base commit/);
});

test("blocks if file hash changes after approval", async () => {
  let reads = 0;
  const report = await executeApprovedPatchProposal(input({
    readFileStates: async (paths) => {
      reads++;
      return paths.map((path) => ({ path, contentHash: reads === 1 ? hash("before") : hash("after") }));
    }
  }));
  assert.equal(report.status, "blocked");
  assert.match(report.blockers[0], /changed after approval/);
});

test("blocks rename until source hash semantics are supported", async () => {
  const parsed = parsePatchProposal(JSON.stringify({
    schemaVersion: 1, repositoryId: "owner/repo", taskId: "rename", baseCommit: "commit-a",
    changes: [{ path: "src/new.ts", previousPath: "src/old.ts", operation: "rename", expectedHash: hash("old"), content: "new" }]
  })).proposal;
  const report = await executeApprovedPatchProposal(input({ proposal: parsed }));
  assert.equal(report.status, "blocked");
  assert.match(report.blockers[0], /Rename proposals/);
});
