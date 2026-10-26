import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parsePatchProposal } from "../dist/core/patchProposal.js";
import { executeApprovedPatchProposal } from "../dist/core/approvedPatchWorkflow.js";
import { JsonlTransactionJournal } from "../dist/core/transactionJournal.js";
import { NodeWorkspaceRecoveryAdapter } from "../dist/core/nodeWorkspaceRecoveryAdapter.js";

const hash = (value) => createHash("sha256").update(value).digest("hex");
async function setup(fn) {
  const root = await mkdtemp(join(tmpdir(), "aifiar-e2e-recovery-"));
  const workspace = join(root, "workspace");
  const metadata = join(root, "metadata");
  await mkdir(join(workspace, "src"), { recursive: true });
  await mkdir(metadata);
  try {
    await writeFile(join(workspace, "src/value.ts"), "before");
    await fn({
      workspace,
      recovery: new NodeWorkspaceRecoveryAdapter(workspace, metadata),
      journal: new JsonlTransactionJournal(join(metadata, "transactions.jsonl"))
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}
function makeProposal() {
  const parsed = parsePatchProposal(JSON.stringify({
    schemaVersion: 1,
    repositoryId: "owner/repo",
    taskId: "durable-recovery-e2e",
    baseCommit: "commit-a",
    changes: [{
      path: "src/value.ts",
      operation: "modify",
      expectedHash: hash("before"),
      content: "after"
    }]
  }));
  assert.equal(parsed.valid, true);
  return parsed.proposal;
}
function makeInput({ workspace, recovery, journal, failVerification = false }) {
  const proposal = makeProposal();
  return {
    proposal,
    transactionId: failVerification ? "tx-e2e-rollback" : "tx-e2e-commit",
    getCurrentCommit: async () => "commit-a",
    readFileStates: async (paths) => Promise.all(paths.map(async (path) => {
      try { return { path, contentHash: hash(await readFile(join(workspace, path))) }; }
      catch (error) { if (error && error.code === "ENOENT") return { path, contentHash: null }; throw error; }
    })),
    requestApproval: async ({ digest }) => ({
      approved: true, digest, operatorId: "test-operator", decisionId: "decision-" + (failVerification ? "rollback" : "commit"),
      expiresAt: new Date(Date.now() + 60_000).toISOString()
    }),
    actionOptions: { trustedWorkspaceConfirmed: true, unresolvedInjectionRisk: "low" },
    recovery,
    journal,
    createAdapter: () => ({
      async apply() {
        await writeFile(join(workspace, "src/value.ts"), proposal.changes[0].content);
        return { changedPaths: ["src/value.ts"], evidence: ["file written by test host adapter"] };
      },
      async verify() {
        if (failVerification) return { passed: false, evidence: [], blockers: ["injected verification failure"] };
        const current = await readFile(join(workspace, "src/value.ts"), "utf8");
        return current === "after"
          ? { passed: true, evidence: ["content hash verified"], blockers: [] }
          : { passed: false, evidence: [], blockers: ["unexpected content"] };
      },
      async rollback() {
        const result = await recovery.recover({ transactionId: failVerification ? "tx-e2e-rollback" : "tx-e2e-commit" });
        return { success: result.status === "restored", evidence: result.evidence };
      }
    })
  };
}

test("approved workflow commits through real durable snapshots and a journal", async () => {
  await setup(async (context) => {
    const report = await executeApprovedPatchProposal(makeInput(context));
    assert.equal(report.status, "applied");
    assert.equal(await readFile(join(context.workspace, "src/value.ts"), "utf8"), "after");
    assert.equal((await context.recovery.listPending()).length, 0);
    const journal = await context.journal.read();
    assert.equal(journal.valid, true);
    assert.equal(journal.records.at(-1).phase, "committed");
  });
});

test("approved workflow restores real before-images when verification fails", async () => {
  await setup(async (context) => {
    const report = await executeApprovedPatchProposal(makeInput({ ...context, failVerification: true }));
    assert.equal(report.status, "rolled-back");
    assert.equal(await readFile(join(context.workspace, "src/value.ts"), "utf8"), "before");
    assert.equal((await context.recovery.listPending()).length, 0);
    const journal = await context.journal.read();
    assert.equal(journal.valid, true);
    assert.equal(journal.records.at(-1).phase, "rolled-back");
  });
});
