import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { JsonlTransactionJournal } from "../dist/core/transactionJournal.js";
import { recoverInterruptedPatch } from "../dist/core/transactionRecovery.js";

async function withTempDir(fn) {
  const dir = await mkdtemp(join(tmpdir(), "aifiar-recovery-coordinator-"));
  try { await fn(dir); } finally { await rm(dir, { recursive: true, force: true }); }
}

test("recovery coordinator records a verified restoration as a terminal phase", async () => {
  await withTempDir(async (dir) => {
    const journal = new JsonlTransactionJournal(join(dir, "transactions.jsonl"));
    await journal.append({ transactionId: "tx-recover", phase: "prepared", details: { targetPaths: ["src/a.ts"] } });
    await journal.append({ transactionId: "tx-recover", phase: "applying", details: { targetPaths: ["src/a.ts"] } });
    await journal.append({ transactionId: "tx-recover", phase: "recovery-required", details: { reason: "interrupted" } });
    const adapter = {
      async prepare() { throw new Error("not used"); },
      async complete() { throw new Error("not used"); },
      async listPending() { return [{ transactionId: "tx-recover", snapshotId: "snap-1", manifestDigest: "a".repeat(64) }]; },
      async recover() { return { status: "restored", evidence: ["before-image restored", "content hash verified"], blockers: [] }; }
    };
    const result = await recoverInterruptedPatch(adapter, journal, "tx-recover");
    assert.equal(result.status, "restored");
    assert.deepEqual(result.blockers, []);
    const report = await journal.read();
    assert.equal(report.valid, true);
    assert.equal(report.records.at(-1).phase, "recovered");
    assert.equal((await journal.listRecoverableTransactions()).transactions.length, 0);
  });
});

test("recovery coordinator refuses evidence-free restoration claims", async () => {
  await withTempDir(async (dir) => {
    const journal = new JsonlTransactionJournal(join(dir, "transactions.jsonl"));
    await journal.append({ transactionId: "tx-no-evidence", phase: "prepared" });
    const adapter = {
      async prepare() { throw new Error("not used"); },
      async complete() { throw new Error("not used"); },
      async listPending() { return [{ transactionId: "tx-no-evidence", snapshotId: "snap-2", manifestDigest: "b".repeat(64) }]; },
      async recover() { return { status: "restored", evidence: [], blockers: [] }; }
    };
    const result = await recoverInterruptedPatch(adapter, journal, "tx-no-evidence");
    assert.equal(result.status, "failed");
    assert.match(result.blockers.join(" "), /evidence/);
    assert.equal((await journal.listRecoverableTransactions()).transactions.length, 1);
  });
});

test("recovery coordinator records conflicts without claiming restoration", async () => {
  await withTempDir(async (dir) => {
    const journal = new JsonlTransactionJournal(join(dir, "transactions.jsonl"));
    await journal.append({ transactionId: "tx-conflict", phase: "prepared" });
    const adapter = {
      async prepare() { throw new Error("not used"); },
      async complete() { throw new Error("not used"); },
      async listPending() { return [{ transactionId: "tx-conflict", snapshotId: "snap-3", manifestDigest: "c".repeat(64) }]; },
      async recover() { return { status: "conflict", evidence: ["target hash changed"], blockers: ["Manual review required."] }; }
    };
    const result = await recoverInterruptedPatch(adapter, journal, "tx-conflict");
    assert.equal(result.status, "conflict");
    assert.deepEqual(result.blockers, ["Manual review required."]);
    assert.equal((await journal.listRecoverableTransactions()).transactions[0].lastPhase, "recovery-required");
  });
});
