import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { signApprovalReceipt, verifyAndConsumeApprovalReceipt } from "../dist/core/approvalReceipt.js";

async function withTempDir(fn) {
  const dir = await mkdtemp(join(tmpdir(), "aifiar-approval-"));
  try { await fn(dir); } finally { await rm(dir, { recursive: true, force: true }); }
}

const key = Buffer.from("test-only-host-key-material-at-least-32-bytes", "utf8");
const digest = "a".repeat(64);

test("signed approval receipt is digest-bound and can be consumed only once", async () => {
  await withTempDir(async (dir) => {
    const receipt = signApprovalReceipt({
      decisionId: "decision-1",
      operatorId: "operator-1",
      proposalDigest: digest,
      decision: "approve",
      expiresAt: new Date(Date.now() + 60_000).toISOString()
    }, key);
    const input = { receipt, expectedProposalDigest: digest, signingKey: key, ledgerPath: join(dir, "approval-ledger.jsonl") };
    const result = await verifyAndConsumeApprovalReceipt(input);
    assert.equal(result.approved, true);
    assert.equal(result.operatorId, "operator-1");
    await assert.rejects(() => verifyAndConsumeApprovalReceipt(input), /already been consumed/);
  });
});

test("approval receipt rejects wrong proposal digest and tampered signatures", async () => {
  await withTempDir(async (dir) => {
    const receipt = signApprovalReceipt({
      decisionId: "decision-2",
      operatorId: "operator-1",
      proposalDigest: digest,
      decision: "approve",
      expiresAt: new Date(Date.now() + 60_000).toISOString()
    }, key);
    const base = { receipt, signingKey: key, ledgerPath: join(dir, "ledger.jsonl") };
    await assert.rejects(() => verifyAndConsumeApprovalReceipt({ ...base, expectedProposalDigest: "b".repeat(64) }), /different proposal/);
    await assert.rejects(() => verifyAndConsumeApprovalReceipt({
      ...base,
      expectedProposalDigest: digest,
      receipt: { ...receipt, operatorId: "operator-2" }
    }), /signature is invalid/);
  });
});

test("approval receipt limits expiry and refuses already-expired decisions", async () => {
  const now = Date.now();
  assert.throws(() => signApprovalReceipt({
    decisionId: "decision-long",
    operatorId: "operator-1",
    proposalDigest: digest,
    decision: "approve",
    issuedAt: new Date(now).toISOString(),
    expiresAt: new Date(now + 16 * 60_000).toISOString()
  }, key, now), /15-minute lifetime/);
  const receipt = signApprovalReceipt({
    decisionId: "decision-expired",
    operatorId: "operator-1",
    proposalDigest: digest,
    decision: "approve",
    issuedAt: new Date(now - 120_000).toISOString(),
    expiresAt: new Date(now - 60_000).toISOString()
  }, key, now - 120_000);
  await assert.rejects(() => verifyAndConsumeApprovalReceipt({
    receipt, expectedProposalDigest: digest, signingKey: key,
    ledgerPath: "/tmp/aifiar-unused-expired-ledger.jsonl", now
  }), /expired/);
});
