import test from "node:test";
import assert from "node:assert/strict";
import { authorizePatchProposal, parsePatchProposal } from "../dist/core/patchProposal.js";
import { createHash } from "node:crypto";

const hash = (value) => createHash("sha256").update(value).digest("hex");
const input = () => JSON.stringify({
  schemaVersion: 1,
  repositoryId: "NotY215/AIFIAR",
  taskId: "fix-tests",
  baseCommit: "abc123",
  changes: [
    { path: "core/new.ts", operation: "add", expectedHash: null, content: "export const answer = 42;\n" },
    { path: "core/types.ts", operation: "modify", expectedHash: hash("old"), content: "export type Answer = number;\n" }
  ]
});

test("parses a strict proposal and binds digest to complete contents", () => {
  const parsed = parsePatchProposal(input());
  assert.equal(parsed.valid, true);
  assert.equal(parsed.proposal.changes.length, 2);
  assert.match(parsed.proposal.digest, /^[a-f0-9]{64}$/);
  const changed = parsePatchProposal(input().replace("answer = 42", "answer = 43"));
  assert.notEqual(changed.proposal.digest, parsed.proposal.digest);
});

test("rejects unknown fields, missing expected hashes, unsafe paths, and invalid JSON", () => {
  assert.equal(parsePatchProposal("{").valid, false);
  assert.equal(parsePatchProposal(JSON.stringify({ schemaVersion: 1, repositoryId: "r", taskId: "t", baseCommit: "c", extra: true, changes: [] })).valid, false);
  const noHash = input().replace('"expectedHash":"'+hash("old")+'"', '"expectedHash":null');
  assert.equal(parsePatchProposal(noHash).valid, false);
  const unsafe = input().replace("core/new.ts", "../new.ts");
  assert.equal(parsePatchProposal(unsafe).valid, false);
});

test("approval requires exact digest, operator, decision id, and unexpired bounded expiry", async () => {
  const proposal = parsePatchProposal(input()).proposal;
  const now = Date.now();
  const request = async ({ digest }) => ({
    approved: true, digest, operatorId: "authenticated-operator",
    decisionId: "decision-1", expiresAt: new Date(now + 60_000).toISOString()
  });
  const approved = await authorizePatchProposal(proposal, request, now);
  assert.equal(approved.approved, true);
  const wrongDigest = await authorizePatchProposal(proposal, async () => ({ ...(await request({ digest: "0".repeat(64) })), digest: "0".repeat(64) }), now);
  assert.equal(wrongDigest.approved, false);
  const expired = await authorizePatchProposal(proposal, async ({ digest }) => ({
    approved: true, digest, operatorId: "operator", decisionId: "decision-2",
    expiresAt: new Date(now - 1).toISOString()
  }), now);
  assert.equal(expired.approved, false);
});

test("rejects proposal mutation after digest creation", async () => {
  const proposal = parsePatchProposal(input()).proposal;
  proposal.changes[0].content = "tampered";
  const result = await authorizePatchProposal(proposal, async () => {
    throw new Error("must not ask for approval when digest is invalid");
  });
  assert.equal(result.approved, false);
  assert.match(result.blockers[0], /digest/);
});

test("rejects proposal mutation while the host approval callback is running", async () => {
  const proposal = parsePatchProposal(input()).proposal;
  const result = await authorizePatchProposal(proposal, async ({ digest }) => {
    proposal.changes[0].content = "mutated during approval";
    return {
      approved: true, digest, operatorId: "operator", decisionId: "decision-3",
      expiresAt: new Date(Date.now() + 60_000).toISOString()
    };
  });
  assert.equal(result.approved, false);
  assert.match(result.blockers.join(" "), /changed while approval/);
});
