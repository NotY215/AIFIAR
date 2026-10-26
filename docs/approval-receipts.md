# Approval Receipt Contract

AIFIAR can validate a signed, expiring approval receipt and consume its decision ID exactly once. The implementation is in `core/approvalReceipt.ts`.

The host must authenticate the operator before issuing a receipt and must keep the HMAC key in a trusted secret store. The key must contain at least 32 bytes and must never be sent to a model, placed in repository-controlled files, or logged. A receipt binds the exact proposal SHA-256 digest, operator ID, decision ID, decision, issue time, and expiry time. The maximum receipt lifetime is 15 minutes.

The host approval callback can call `verifyAndConsumeApprovalReceipt` and translate the returned result into the existing `PatchApprovalDecision` contract. Use a ledger path in a host-owned metadata directory outside the model-writable workspace. The ledger uses a lock, rejects symlink paths, applies restrictive permissions where supported, fsyncs each consumption record, and rejects replayed decision IDs.

This helper is not a login system or a visual approval interface. It does not prove that an operator ID is genuine on its own. Authentication, authorization to edit the selected repository, key rotation, recovery from stale locks, operating-system access controls, and the user-facing diff/approval screen remain host responsibilities. A local process with write access to the trusted metadata directory can still tamper with the ledger; production hosts should use an OS-protected database or remote audit service where the threat model requires it.

Example integration shape:

```ts
const receipt = await trustedApprovalUi.requestSignedDecision({
  proposalDigest: request.digest,
  repositoryId: request.repositoryId,
  taskId: request.taskId,
  changes: request.changes
});

const decision = await verifyAndConsumeApprovalReceipt({
  receipt,
  expectedProposalDigest: request.digest,
  signingKey: hostApprovalKey,
  ledgerPath: hostOwnedApprovalLedger
});

return {
  approved: decision.approved,
  digest: request.digest,
  operatorId: decision.operatorId,
  decisionId: decision.decisionId,
  expiresAt: decision.expiresAt
};
```

The names `trustedApprovalUi`, `hostApprovalKey`, and `hostOwnedApprovalLedger` above represent host-provided values, not built-in AIFIAR APIs.
