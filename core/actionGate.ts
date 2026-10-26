import { assessProtectedAction, type ProtectedAction } from "./instructionPolicy.js";
import { validatePatch, type PatchFileChange, type PatchValidationPolicy } from "./patchValidation.js";

export interface ActionGateInput {
  action: ProtectedAction;
  explicitlyApproved?: boolean;
  allowNetwork?: boolean;
  allowDependencyInstall?: boolean;
  changes?: readonly PatchFileChange[];
  patchPolicy?: PatchValidationPolicy;
  unresolvedInjectionRisk?: "low" | "medium" | "high";
  trustedWorkspaceConfirmed?: boolean;
}

export interface ActionGateReport {
  allowed: boolean;
  requiresApproval: boolean;
  blockers: string[];
  warnings: string[];
  patchReport?: ReturnType<typeof validatePatch>;
}

export function evaluateActionGate(input: ActionGateInput): ActionGateReport {
  const policy = assessProtectedAction({
    action: input.action,
    explicitlyApproved: input.explicitlyApproved,
    allowNetwork: input.allowNetwork,
    allowDependencyInstall: input.allowDependencyInstall
  });
  const blockers = [...policy.reasons];
  const warnings: string[] = [];
  let requiresApproval = policy.requiresApproval;
  let patchReport: ReturnType<typeof validatePatch> | undefined;

  if (input.unresolvedInjectionRisk === "high") blockers.push("High-risk untrusted-content signals must be reviewed before action.");
  else if (input.unresolvedInjectionRisk === "medium") {
    requiresApproval = true;
    warnings.push("Medium-risk untrusted-content signals require human review.");
  }
  if (input.action === "edit" && input.trustedWorkspaceConfirmed !== true) {
    blockers.push("The host has not confirmed a trusted, bounded workspace for edits.");
  }
  if (input.changes) {
    patchReport = validatePatch(input.changes, input.patchPolicy);
    blockers.push(...patchReport.errors);
    warnings.push(...patchReport.warnings);
    if (patchReport.requiresApproval) requiresApproval = true;
  }
  if (requiresApproval && input.explicitlyApproved !== true) {
    blockers.push("This action or patch requires explicit approval.");
  }
  return {
    allowed: blockers.length === 0,
    requiresApproval,
    blockers: [...new Set(blockers)],
    warnings: [...new Set(warnings)],
    ...(patchReport ? { patchReport } : {})
  };
}
