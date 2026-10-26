import { authorizePatchProposal, type PatchApprovalDecision, type PatchApprovalReport, type PatchProposal } from "./patchProposal.js";
import type { ActionGateInput } from "./actionGate.js";
import type { CurrentFileState, PlannedFileState } from "./fileFreshnessGate.js";
import { executePatchTransaction, type PatchTransactionAdapter, type PatchTransactionReport } from "./patchTransaction.js";
import type { PatchValidationPolicy } from "./patchValidation.js";

export interface ApprovedPatchExecutionInput {
  proposal: PatchProposal;
  getCurrentCommit(): Promise<string>;
  readFileStates(paths: readonly string[]): Promise<CurrentFileState[]>;
  requestApproval(request: { digest: string; repositoryId: string; taskId: string; baseCommit: string; changes: readonly PatchProposal["changes"][number][] }): Promise<PatchApprovalDecision>;
  createAdapter(proposal: PatchProposal, approval: PatchApprovalReport): PatchTransactionAdapter;
  actionOptions: Omit<ActionGateInput, "action" | "explicitlyApproved" | "changes" | "patchPolicy" | "trustedWorkspaceConfirmed"> & { trustedWorkspaceConfirmed: true };
  patchPolicy?: PatchValidationPolicy;
}

export interface ApprovedPatchExecutionReport {
  status: "blocked" | PatchTransactionReport["status"];
  approval?: PatchApprovalReport;
  transaction?: PatchTransactionReport;
  blockers: string[];
}

/**
 * Connects a parsed model proposal to the existing preflight/transaction path.
 * All filesystem reads and actual writes remain host-provided. Rename operations
 * are blocked until source and destination hashes have a dedicated schema.
 */
export async function executeApprovedPatchProposal(
  input: ApprovedPatchExecutionInput
): Promise<ApprovedPatchExecutionReport> {
  const { proposal } = input;
  if (proposal.changes.some((change) => change.operation === "rename")) {
    return { status: "blocked", blockers: ["Rename proposals are not executable through this workflow until source-hash semantics are explicit."] };
  }

  let currentCommit: string;
  try {
    currentCommit = await input.getCurrentCommit();
  } catch {
    return { status: "blocked", blockers: ["Could not read the current repository commit."] };
  }
  if (!currentCommit || currentCommit !== proposal.baseCommit) {
    return { status: "blocked", blockers: ["Repository commit differs from the proposal base commit. Re-scan and regenerate the proposal."] };
  }

  const existingChanges = proposal.changes.filter((change) => change.operation !== "add");
  const targetPaths = [...new Set(proposal.changes.map((change) => change.path))];
  let currentFiles: CurrentFileState[];
  try {
    currentFiles = await input.readFileStates(targetPaths);
  } catch {
    return { status: "blocked", blockers: ["Could not read current file hashes for the proposed targets."] };
  }
  const currentByPath = new Map(currentFiles.map((file) => [file.path, file]));
  const plannedFiles: PlannedFileState[] = existingChanges.map((change) => ({
    path: change.path,
    contentHash: change.expectedHash
  }));
  const preflightBlockers: string[] = [];
  for (const change of proposal.changes) {
    const current = currentByPath.get(change.path);
    if (change.operation === "add" && current && current.contentHash !== null) {
      preflightBlockers.push("Add target already exists: " + change.path);
    }
    if (change.operation !== "add" && !current) {
      preflightBlockers.push("Existing target hash was not returned by the host: " + change.path);
    }
  }
  if (preflightBlockers.length) return { status: "blocked", blockers: preflightBlockers };

  const approval = await authorizePatchProposal(proposal, input.requestApproval);
  if (!approval.approved) return { status: "blocked", approval, blockers: approval.blockers };

  let commitAfterApproval: string;
  try {
    commitAfterApproval = await input.getCurrentCommit();
  } catch {
    return { status: "blocked", approval, blockers: ["Could not re-read repository commit after approval."] };
  }
  if (commitAfterApproval !== proposal.baseCommit) {
    return { status: "blocked", approval, blockers: ["Repository changed after approval. The proposal must be reviewed again."] };
  }

  let filesAfterApproval: CurrentFileState[];
  try {
    filesAfterApproval = await input.readFileStates(targetPaths);
  } catch {
    return { status: "blocked", approval, blockers: ["Could not re-read target file hashes after approval."] };
  }
  const afterByPath = new Map(filesAfterApproval.map((file) => [file.path, file]));
  const stale: string[] = [];
  for (const change of proposal.changes) {
    const current = afterByPath.get(change.path);
    if (change.operation === "add") {
      if (current && current.contentHash !== null) stale.push("Add target appeared after approval: " + change.path);
    } else if (!current || current.contentHash !== change.expectedHash) {
      stale.push("Target changed after approval: " + change.path);
    }
  }
  if (stale.length) return { status: "blocked", approval, blockers: stale };

  const transaction = await executePatchTransaction({
    preflight: {
      action: {
        ...input.actionOptions,
        action: "edit",
        explicitlyApproved: true,
        changes: proposal.changes,
        ...(input.patchPolicy ? { patchPolicy: input.patchPolicy } : {}),
        trustedWorkspaceConfirmed: true
      },
      plannedFiles,
      currentFiles: existingChanges.map((change) => ({ path: change.path, contentHash: afterByPath.get(change.path)?.contentHash ?? null })),
      requireExactFileSet: false
    },
    adapter: input.createAdapter(proposal, approval)
  });
  return { status: transaction.status, approval, transaction, blockers: transaction.blockers };
}
