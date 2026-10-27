import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createReceiptBackedApprovalCallback } from "../dist/core/receiptApprovalAdapter.js";
const key = Buffer.from("test-only-host-key-material-at-least-32-bytes", "utf8");
test("receipt-backed callback returns a verified one-time decision bound to the proposal digest", async () => {
  const dir = await mkdtemp(join(tmpdir(), "aifiar-receipt-adapter-"));
  try {
    const callback = createReceiptBackedApprovalCallback({ signingKey: key, ledgerPath: join(dir, "ledger.jsonl"), requestDecision: async () => ({ approved: true, operatorId: "operator-1", decisionId: "decision-1", expiresAt: new Date(Date.now()+60000).toISOString() }) });
    const request = { digest: "a".repeat(64), repositoryId: "repo-1", taskId: "task-1", baseCommit: "commit-a", changes: [] };
    const result = await callback(request);
    assert.equal(result.approved, true); assert.equal(result.digest, request.digest); assert.equal(result.operatorId, "operator-1");
    await assert.rejects(() => callback(request), /already been consumed/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
test("receipt-backed callback preserves a trusted denial", async () => {
  const dir = await mkdtemp(join(tmpdir(), "aifiar-receipt-deny-"));
  try {
    const callback = createReceiptBackedApprovalCallback({ signingKey: key, ledgerPath: join(dir, "ledger.jsonl"), requestDecision: async () => ({ approved: false, operatorId: "operator-1", decisionId: "decision-deny", expiresAt: new Date(Date.now()+60000).toISOString() }) });
    const result = await callback({ digest: "b".repeat(64), repositoryId: "repo-1", taskId: "task-1", baseCommit: "commit-a", changes: [] });
    assert.equal(result.approved, false);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
