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

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { JsonlTransactionJournal } from "../dist/core/transactionJournal.js";

test("journaled patch transaction reaches a durable committed phase", async () => {
  const dir = await mkdtemp(join(tmpdir(), "aifiar-tx-"));
  try {
    const journal = new JsonlTransactionJournal(join(dir, "transactions.jsonl"));
    const report = await executePatchTransaction({
      preflight: {
        ...freshEditPreflight,
        action: { action: "edit", trustedWorkspaceConfirmed: true, changes: [{ path: "src/a.ts", operation: "modify", content: "updated" }] }
      },
      journal,
      transactionId: "tx-success",
      adapter: {
        async apply() { return { changedPaths: ["src/a.ts"], evidence: ["workspace apply"] }; },
        async verify() { return { passed: true, evidence: ["hashes rechecked"], blockers: [] }; },
        async rollback() { return { success: true, evidence: ["not needed"] }; }
      }
    });
    assert.equal(report.status, "applied");
    assert.equal(report.transactionId, "tx-success");
    const journalReport = await journal.read();
    assert.equal(journalReport.valid, true);
    assert.equal(journalReport.records.at(-1).phase, "committed");
    assert.equal((await journal.listRecoverableTransactions()).transactions.length, 0);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("journaled adapter exceptions are marked recovery-required, not assumed clean", async () => {
  const dir = await mkdtemp(join(tmpdir(), "aifiar-tx-crash-"));
  try {
    const journal = new JsonlTransactionJournal(join(dir, "transactions.jsonl"));
    const report = await executePatchTransaction({
      preflight: freshEditPreflight,
      journal,
      transactionId: "tx-uncertain",
      adapter: {
        async apply() { throw new Error("adapter stopped after partial write"); },
        async verify() { return { passed: true, evidence: ["not reached"], blockers: [] }; },
        async rollback() { return { success: true, evidence: ["not reached"] }; }
      }
    });
    assert.equal(report.status, "recovery-required");
    const pending = await journal.listRecoverableTransactions();
    assert.equal(pending.transactions.length, 1);
    assert.equal(pending.transactions[0].lastPhase, "recovery-required");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});


test("patch transaction persists before-images before apply and marks snapshot committed", async () => {
  const events = [];
  const recovery = {
    async prepare(input) {
      events.push("prepare");
      return { transactionId: input.transactionId, snapshotId: "snapshot-1", manifestDigest: input.manifestDigest, paths: [...input.paths], evidence: ["before-images persisted"] };
    },
    async complete(input) { events.push("complete:" + input.outcome); },
    async recover() { return { status: "restored", evidence: ["restored"], blockers: [] }; },
    async listPending() { return []; }
  };
  const report = await executePatchTransaction({
    preflight: {
      ...freshEditPreflight,
      action: { action: "edit", trustedWorkspaceConfirmed: true, changes: [{ path: "src/a.ts", operation: "modify", content: "updated" }] }
    },
    recovery,
    manifestDigest: "a".repeat(64),
    recoveryChanges: [{ path: "src/a.ts", operation: "modify", expectedHash: "a".repeat(64), content: "updated" }],
    adapter: {
      async apply() { events.push("apply"); return { changedPaths: ["src/a.ts"], evidence: ["workspace apply"] }; },
      async verify() { return { passed: true, evidence: ["hashes rechecked"], blockers: [] }; },
      async rollback() { return { success: true, evidence: ["not needed"] }; }
    }
  });
  assert.equal(report.status, "applied");
  assert.deepEqual(events, ["prepare", "apply", "complete:committed"]);
});

test("patch transaction refuses recovery setup without an approved manifest digest", async () => {
  let applied = false;
  const recovery = {
    async prepare() { throw new Error("must not be called"); },
    async complete() {},
    async recover() { return { status: "failed", evidence: [], blockers: ["not used"] }; },
    async listPending() { return []; }
  };
  const report = await executePatchTransaction({
    preflight: freshEditPreflight,
    recovery,
    adapter: {
      async apply() { applied = true; return { changedPaths: [], evidence: ["apply"] }; },
      async verify() { return { passed: true, evidence: ["verified"], blockers: [] }; },
      async rollback() { return { success: true, evidence: ["rollback"] }; }
    }
  });
  assert.equal(report.status, "blocked");
  assert.equal(applied, false);
  assert.match(report.blockers.join(" "), /exact approved manifest/);
});

test("patch transaction rejects a recovery snapshot that includes unapproved paths", async () => {
  let applied = false;
  const recovery = {
    async prepare(input) {
      return { transactionId: input.transactionId, snapshotId: "snapshot-bad", manifestDigest: input.manifestDigest, paths: [...input.paths, "secrets.txt"], evidence: ["snapshot written"] };
    },
    async complete() {},
    async recover() { return { status: "failed", evidence: [], blockers: [] }; },
    async listPending() { return []; }
  };
  const report = await executePatchTransaction({
    preflight: {
      ...freshEditPreflight,
      action: { action: "edit", trustedWorkspaceConfirmed: true, changes: [{ path: "src/a.ts", operation: "modify", content: "updated" }] }
    },
    recovery,
    manifestDigest: "a".repeat(64),
    recoveryChanges: [{ path: "src/a.ts", operation: "modify", expectedHash: "a".repeat(64), content: "updated" }],
    adapter: {
      async apply() { applied = true; return { changedPaths: ["src/a.ts"], evidence: ["applied"] }; },
      async verify() { return { passed: true, evidence: ["verified"], blockers: [] }; },
      async rollback() { return { success: true, evidence: ["rollback"] }; }
    }
  });
  assert.equal(report.status, "blocked");
  assert.equal(applied, false);
  assert.match(report.blockers.join(" "), /does not exactly match/);
});
