import { runPreflight, type PreflightInput, type PreflightReport } from "./recheckPipeline.js";
import { createTransactionId, type TransactionJournal } from "./transactionJournal.js";

export interface PatchApplyResult {
  changedPaths: string[];
  revision?: string;
  evidence: string[];
}

export interface PatchPostApplyCheck {
  passed: boolean;
  evidence: string[];
  blockers: string[];
}

export interface PatchTransactionAdapter {
  apply(): Promise<PatchApplyResult>;
  verify(result: PatchApplyResult): Promise<PatchPostApplyCheck>;
  rollback(result: PatchApplyResult): Promise<{ success: boolean; evidence: string[] }>;
}

export interface PatchTransactionInput {
  preflight: PreflightInput;
  adapter: PatchTransactionAdapter;
  journal?: TransactionJournal;
  transactionId?: string;
}

export interface PatchTransactionReport {
  transactionId?: string;
  status: "blocked" | "applied" | "rolled-back" | "recovery-required" | "apply-failed";
  preflight: PreflightReport;
  applyResult?: PatchApplyResult;
  verification?: PatchPostApplyCheck;
  rollbackEvidence?: string[];
  blockers: string[];
}

export async function executePatchTransaction(input: PatchTransactionInput): Promise<PatchTransactionReport> {
  const preflight = runPreflight(input.preflight);
  if (!preflight.allowed) {
    return { status: "blocked", preflight, blockers: [...preflight.blockers] };
  }
  if (input.preflight.action.action !== "edit") {
    return {
      status: "blocked",
      preflight,
      blockers: ["Patch transaction requires an edit action."]
    };
  }

  const transactionId = input.transactionId ?? createTransactionId();
  const targetPaths = [...new Set((input.preflight.action.changes ?? []).map((change) => change.path))];
  if (input.journal) {
    try {
      await input.journal.append({ transactionId, phase: "prepared", details: { targetPaths } });
      await input.journal.append({ transactionId, phase: "applying", details: { targetPaths } });
    } catch (error) {
      return { status: "blocked", transactionId, preflight, blockers: ["Could not durably journal the transaction before applying: " + safeError(error)] };
    }
  }

  let applyResult: PatchApplyResult;
  try {
    applyResult = await input.adapter.apply();
  } catch (error) {
    if (input.journal) {
      try { await input.journal.append({ transactionId, phase: "recovery-required", details: { reason: "apply-threw", error: safeError(error), targetPaths } }); } catch { /* The last durable phase remains recoverable. */ }
      return { status: "recovery-required", transactionId, preflight, blockers: ["Patch adapter threw while applying; partial writes cannot be ruled out. Manual recovery is required: " + safeError(error)] };
    }
    return { status: "apply-failed", preflight, blockers: ["Patch adapter failed before returning an apply result: " + safeError(error)] };
  }

  if (input.journal) {
    try {
      await input.journal.append({ transactionId, phase: "applied", details: { changedPaths: applyResult.changedPaths, ...(applyResult.revision ? { revision: applyResult.revision } : {}) } });
    } catch (error) {
      return { status: "recovery-required", transactionId, preflight, applyResult, blockers: ["Patch was applied but its result could not be durably journaled. Manual recovery is required: " + safeError(error)] };
    }
  }

  let verification: PatchPostApplyCheck;
  try {
    verification = await input.adapter.verify(applyResult);
  } catch (error) {
    verification = {
      passed: false,
      evidence: [],
      blockers: ["Post-apply verification threw an error: " + safeError(error)]
    };
  }

  if (verification.passed && verification.blockers.length === 0 && verification.evidence.some((item) => item.trim())) {
    if (input.journal) {
      try {
        await input.journal.append({ transactionId, phase: "verification-passed", details: { evidence: verification.evidence.slice(0, 20) } });
        await input.journal.append({ transactionId, phase: "committed", details: { changedPaths: applyResult.changedPaths } });
      } catch (error) {
        return { status: "recovery-required", transactionId, preflight, applyResult, verification, blockers: ["Verification passed but transaction completion could not be durably journaled. Manual recovery is required: " + safeError(error)] };
      }
    }
    return { status: "applied", ...(input.journal ? { transactionId } : {}), preflight, applyResult, verification, blockers: [] };
  }

  if (input.journal) {
    try { await input.journal.append({ transactionId, phase: "verification-failed", details: { blockers: verification.blockers.slice(0, 20) } }); }
    catch (error) { return { status: "recovery-required", transactionId, preflight, applyResult, verification, blockers: ["Verification failed and its outcome could not be durably journaled; no rollback was attempted. Manual recovery is required: " + safeError(error)] }; }
    try { await input.journal.append({ transactionId, phase: "rollback-started", details: { changedPaths: applyResult.changedPaths } }); }
    catch (error) { return { status: "recovery-required", transactionId, preflight, applyResult, verification, blockers: ["Could not durably record rollback intent. Manual recovery is required: " + safeError(error)] }; }
  }

  const blockers = [
    ...verification.blockers,
    ...(verification.passed && !verification.evidence.some((item) => item.trim())
      ? ["Post-apply verification reported success without evidence."]
      : [])
  ];
  try {
    const rollback = await input.adapter.rollback(applyResult);
    if (rollback.success) {
      if (input.journal) {
        try { await input.journal.append({ transactionId, phase: "rolled-back", details: { evidence: rollback.evidence.slice(0, 20) } }); }
        catch (error) { return { status: "recovery-required", transactionId, preflight, applyResult, verification, rollbackEvidence: rollback.evidence, blockers: [...blockers, "Rollback reported success but its completion could not be journaled: " + safeError(error)] }; }
      }
      return {
        status: "rolled-back",
        ...(input.journal ? { transactionId } : {}),
        preflight,
        applyResult,
        verification,
        rollbackEvidence: rollback.evidence,
        blockers: [...blockers, "Post-apply verification failed; rollback was reported successful."]
      };
    }
    if (input.journal) {
      try { await input.journal.append({ transactionId, phase: "recovery-required", details: { reason: "rollback-reported-failure", changedPaths: applyResult.changedPaths } }); } catch { /* Keep the prior rollback-started record recoverable. */ }
    }
    return {
      status: "recovery-required",
      ...(input.journal ? { transactionId } : {}),
      preflight,
      applyResult,
      verification,
      rollbackEvidence: rollback.evidence,
      blockers: [...blockers, "Rollback did not confirm success. Manual recovery is required."]
    };
  } catch (error) {
    if (input.journal) {
      try { await input.journal.append({ transactionId, phase: "recovery-required", details: { reason: "rollback-threw", error: safeError(error), changedPaths: applyResult.changedPaths } }); } catch { /* Keep the prior rollback-started record recoverable. */ }
    }
    return {
      status: "recovery-required",
      ...(input.journal ? { transactionId } : {}),
      preflight,
      applyResult,
      verification,
      blockers: [...blockers, "Rollback failed: " + safeError(error), "Manual recovery is required."]
    };
  }
}

function safeError(error: unknown): string {
  if (error instanceof Error) return error.message.slice(0, 500);
  return String(error).slice(0, 500);
}
