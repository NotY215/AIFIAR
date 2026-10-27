import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { parsePatchProposal } from "../dist/core/patchProposal.js";
import { executeAuthorizedPatchProposal } from "../dist/core/authorizedPatchWorkflow.js";
const hash = value => createHash("sha256").update(value).digest("hex");
function setup(overrides = {}) {
  const proposal = parsePatchProposal(JSON.stringify({ schemaVersion: 1, repositoryId: "repo-1", taskId: "task-1", baseCommit: "commit-a", changes: [{ path: "src/value.ts", operation: "modify", expectedHash: hash("before"), content: "export const value = 2;\n" }] })).proposal;
  const principal = { authenticated: true, subjectId: "operator-1", roles: ["developer"], repositoryIds: ["repo-1"], taskIds: ["task-1"], allowedPathPrefixes: ["src"] };
  return {
    proposal, principal, getCurrentCommit: async () => "commit-a",
    readFileStates: async paths => paths.map(path => ({ path, contentHash: hash("before") })),
    requestApproval: async ({ digest }) => ({ approved: true, digest, operatorId: "operator-1", decisionId: "decision-1", expiresAt: new Date(Date.now()+60000).toISOString() }),
    actionOptions: { trustedWorkspaceConfirmed: true, unresolvedInjectionRisk: "low" },
    createAdapter: () => ({ apply: async () => ({ changedPaths: ["src/value.ts"], evidence: ["applied"] }), verify: async () => ({ passed: true, evidence: ["verification passed"], blockers: [] }), rollback: async () => ({ success: true, evidence: ["rollback complete"] }) }),
    ...overrides
  };
}
test("authorized workflow applies only after scoped authorization and approval", async () => {
  const report = await executeAuthorizedPatchProposal(setup());
  assert.equal(report.authorization.allowed, true);
  assert.equal(report.status, "applied");
  assert.equal(report.transaction.verification.passed, true);
});
test("unauthorized paths are blocked before approval or mutation", async () => {
  let approvals = 0, applies = 0;
  const base = setup();
  const report = await executeAuthorizedPatchProposal({ ...base, principal: { ...base.principal, allowedPathPrefixes: ["docs"] }, requestApproval: async () => { approvals++; throw new Error("must not request"); }, createAdapter: () => ({ apply: async () => { applies++; return { changedPaths: [], evidence: [] }; }, verify: async () => ({ passed: true, evidence: [], blockers: [] }), rollback: async () => ({ success: true, evidence: [] }) }) });
  assert.equal(report.status, "blocked"); assert.equal(approvals, 0); assert.equal(applies, 0);
});
test("protected paths require security-admin before approval callback", async () => {
  const base = setup();
  const proposal = parsePatchProposal(JSON.stringify({ schemaVersion: 1, repositoryId: "repo-1", taskId: "task-1", baseCommit: "commit-a", changes: [{ path: ".github/workflows/ci.yml", operation: "modify", expectedHash: hash("before"), content: "safe: true\n" }] })).proposal;
  let approvals = 0;
  const report = await executeAuthorizedPatchProposal({ ...base, proposal, principal: { ...base.principal, allowedPathPrefixes: ["*"] }, requestApproval: async () => { approvals++; throw new Error("must not request"); } });
  assert.equal(report.status, "blocked"); assert.equal(approvals, 0); assert.ok(report.authorization.protectedPaths.includes(".github/workflows/ci.yml"));
});
