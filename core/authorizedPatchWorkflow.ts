import { authorizePatchApproval, type ApprovalAuthorizationPolicy, type ApprovalAuthorizationPrincipal, type ApprovalAuthorizationResult } from "./approvalAuthorization.js";
import { executeApprovedPatchProposal, type ApprovedPatchExecutionInput, type ApprovedPatchExecutionReport } from "./approvedPatchWorkflow.js";

export interface AuthorizedPatchExecutionInput extends Omit<ApprovedPatchExecutionInput, "requestApproval"> {
  /** Must come from a trusted host identity provider, never model output. */
  principal: ApprovalAuthorizationPrincipal;
  authorizationPolicy?: ApprovalAuthorizationPolicy;
  requestApproval: ApprovedPatchExecutionInput["requestApproval"];
}
export interface AuthorizedPatchExecutionReport extends ApprovedPatchExecutionReport {
  authorization: ApprovalAuthorizationResult;
}

/** Enforces host authorization before human approval, then delegates to the existing checked transaction workflow. */
export async function executeAuthorizedPatchProposal(input: AuthorizedPatchExecutionInput): Promise<AuthorizedPatchExecutionReport> {
  const changes = input.proposal.changes.flatMap(change => {
    const entries: Array<{ path: string; operation: "add" | "modify" | "delete" | "rename" }> = [{ path: change.path, operation: change.operation }];
    if (change.operation === "rename" && change.previousPath) entries.push({ path: change.previousPath, operation: "delete" });
    return entries;
  });
  const authorization = authorizePatchApproval({
    principal: input.principal,
    request: { repositoryId: input.proposal.repositoryId, taskId: input.proposal.taskId, proposalDigest: input.proposal.digest, changes },
    ...(input.authorizationPolicy ? { policy: input.authorizationPolicy } : {})
  });
  if (!authorization.allowed) return { status: "blocked", authorization, blockers: ["Host authorization denied this proposal.", ...authorization.blockers] };
  const { principal: _principal, authorizationPolicy: _policy, ...executionInput } = input;
  return { ...(await executeApprovedPatchProposal(executionInput)), authorization };
}
