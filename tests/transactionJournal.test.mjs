import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { JsonlTransactionJournal } from "../dist/core/transactionJournal.js";

async function withTempDir(fn) {
  const dir = await mkdtemp(join(tmpdir(), "aifiar-journal-"));
  try { await fn(dir); } finally { await rm(dir, { recursive: true, force: true }); }
}

test("journal appends a verifiable hash chain and reports unfinished transactions", async () => {
  await withTempDir(async (dir) => {
    const journal = new JsonlTransactionJournal(join(dir, "transactions.jsonl"));
    await journal.append({ transactionId: "tx-1", phase: "prepared", details: { targetPaths: ["src/a.ts"] } });
    await journal.append({ transactionId: "tx-1", phase: "applying", details: { targetPaths: ["src/a.ts"] } });
    const read = await journal.read();
    assert.equal(read.valid, true);
    assert.equal(read.records.length, 2);
    assert.equal(read.records[1].previousHash, read.records[0].hash);
    const pending = await journal.listRecoverableTransactions();
    assert.equal(pending.valid, true);
    assert.equal(pending.transactions.length, 1);
    assert.equal(pending.transactions[0].lastPhase, "applying");
  });
});

test("journal rejects a modified record", async () => {
  await withTempDir(async (dir) => {
    const path = join(dir, "transactions.jsonl");
    const journal = new JsonlTransactionJournal(path);
    await journal.append({ transactionId: "tx-2", phase: "prepared", details: { targetPaths: ["src/a.ts"] } });
    const original = await readFile(path, "utf8");
    await writeFile(path, original.replace("src/a.ts", "src/b.ts"), "utf8");
    const read = await journal.read();
    assert.equal(read.valid, false);
    assert.match(read.errors.join(" "), /hash mismatch/);
  });
});

test("append repairs only an incomplete final line before continuing the chain", async () => {
  await withTempDir(async (dir) => {
    const path = join(dir, "transactions.jsonl");
    const journal = new JsonlTransactionJournal(path);
    await journal.append({ transactionId: "tx-3", phase: "prepared" });
    await writeFile(path, (await readFile(path, "utf8")) + '{"schemaVersion":', "utf8");
    const before = await journal.read();
    assert.equal(before.valid, true);
    assert.equal(before.trailingPartialLine, true);
    await journal.append({ transactionId: "tx-3", phase: "applying" });
    const after = await journal.read();
    assert.equal(after.valid, true);
    assert.equal(after.records.length, 2);
    assert.equal(after.records[1].sequence, 2);
    assert.equal(after.trailingPartialLine, false);
  });
});

test("completed transactions are not listed as recoverable", async () => {
  await withTempDir(async (dir) => {
    const journal = new JsonlTransactionJournal(join(dir, "transactions.jsonl"));
    await journal.append({ transactionId: "tx-4", phase: "prepared" });
    await journal.append({ transactionId: "tx-4", phase: "committed" });
    const pending = await journal.listRecoverableTransactions();
    assert.equal(pending.transactions.length, 0);
  });
});
