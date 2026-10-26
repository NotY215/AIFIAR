import { runPreflight, type PreflightInput, type PreflightReport } from "./recheckPipeline.js";

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
}

export interface PatchTransactionReport {
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

  let applyResult: PatchApplyResult;
  try {
    applyResult = await input.adapter.apply();
  } catch (error) {
    return {
      status: "apply-failed",
      preflight,
      blockers: ["Patch adapter failed before returning an apply result: " + safeError(error)]
    };
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
    return { status: "applied", preflight, applyResult, verification, blockers: [] };
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
      return {
        status: "rolled-back",
        preflight,
        applyResult,
        verification,
        rollbackEvidence: rollback.evidence,
        blockers: [...blockers, "Post-apply verification failed; rollback was reported successful."]
      };
    }
    return {
      status: "recovery-required",
      preflight,
      applyResult,
      verification,
      rollbackEvidence: rollback.evidence,
      blockers: [...blockers, "Rollback did not confirm success. Manual recovery is required."]
    };
  } catch (error) {
    return {
      status: "recovery-required",
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
