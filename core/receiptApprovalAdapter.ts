import { signApprovalReceipt, verifyAndConsumeApprovalReceipt } from "./approvalReceipt.js";
import type { ApprovedPatchExecutionInput } from "./approvedPatchWorkflow.js";

export interface HostApprovalDecision { approved: boolean; operatorId: string; decisionId: string; expiresAt: string; }
export interface ReceiptBackedApprovalOptions {
  /** Trusted host callback that authenticates the operator and presents the exact proposal diff. */
  requestDecision(request: Parameters<ApprovedPatchExecutionInput["requestApproval"]>[0]): Promise<HostApprovalDecision>;
  /** Load from a trusted secret store, never from a repository file or model output. */
  signingKey: Uint8Array;
  /** Store outside any workspace writable by model-generated code. */
  ledgerPath: string;
}

/** Signs, verifies, and consumes a short-lived receipt for the exact proposal digest. */
export function createReceiptBackedApprovalCallback(options: ReceiptBackedApprovalOptions): ApprovedPatchExecutionInput["requestApproval"] {
  return async request => {
    const decision = await options.requestDecision(request);
    if (!decision || typeof decision.approved !== "boolean") throw new Error("Host approval callback returned an invalid decision.");
    const receipt = signApprovalReceipt({
      decisionId: decision.decisionId, operatorId: decision.operatorId, proposalDigest: request.digest,
      decision: decision.approved ? "approve" : "deny", expiresAt: decision.expiresAt
    }, options.signingKey);
    const verified = await verifyAndConsumeApprovalReceipt({
      receipt, expectedProposalDigest: request.digest, signingKey: options.signingKey, ledgerPath: options.ledgerPath
    });
    return { approved: verified.approved, digest: request.digest, operatorId: verified.operatorId, decisionId: verified.decisionId, expiresAt: verified.expiresAt };
  };
}
