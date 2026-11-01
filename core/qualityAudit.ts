export type QualityAuditDimension = "requirementCoverage" | "evidenceQuality" | "uncertaintyHandling" | "contradictionDetection" | "unresolvedGaps" | "verification";
export type QualityAuditSeverity = "critical" | "high" | "medium" | "low";
export interface QualityAuditFinding { id: string; dimension: QualityAuditDimension; severity: QualityAuditSeverity; message: string; evidence?: string[]; resolved: boolean }
export interface QualityAuditInput {
  requirements: { total: number; addressed: number; verified: number; blocked?: number };
  evidence: { claimsRequiringEvidence: number; claimsWithEvidence: number; primarySourceClaims?: number };
  uncertainty: { materialClaims: number; claimsWithCalibratedConfidence: number; unsupportedCertaintyFlags?: number };
  contradictions: { detected: number; resolved: number };
  verification: { checksRequired: number; checksPassed: number; checksFailed?: number; checksNotRun?: number };
  findings?: QualityAuditFinding[];
}
export interface QualityAuditResult {
  schemaVersion: 1; score: number; status: "pass" | "needs-review" | "fail";
  dimensions: Record<QualityAuditDimension, { score: number; weight: number; issues: number }>;
  unresolvedCritical: number; unresolvedHigh: number; missingRequirements: number; unverifiedRequirements: number;
  unsupportedEvidenceClaims: number; uncalibratedMaterialClaims: number; unresolvedContradictions: number;
  failedChecks: number; unrunChecks: number; recommendations: string[];
}
/** Deterministic triage over host-observed counts, not a semantic proof of correctness. */
export function evaluateQualityAudit(input: QualityAuditInput): QualityAuditResult {
  const values = [
    input.requirements.total, input.requirements.addressed, input.requirements.verified, input.requirements.blocked ?? 0,
    input.evidence.claimsRequiringEvidence, input.evidence.claimsWithEvidence, input.evidence.primarySourceClaims ?? 0,
    input.uncertainty.materialClaims, input.uncertainty.claimsWithCalibratedConfidence, input.uncertainty.unsupportedCertaintyFlags ?? 0,
    input.contradictions.detected, input.contradictions.resolved, input.verification.checksRequired, input.verification.checksPassed,
    input.verification.checksFailed ?? 0, input.verification.checksNotRun ?? 0
  ];
  if (values.some(v => !Number.isSafeInteger(v) || v < 0)) throw new Error("Quality audit counts must be non-negative safe integers.");
  if (input.requirements.addressed > input.requirements.total || input.requirements.verified > input.requirements.addressed ||
      (input.requirements.blocked ?? 0) > input.requirements.total ||
      input.evidence.claimsWithEvidence > input.evidence.claimsRequiringEvidence ||
      (input.evidence.primarySourceClaims ?? 0) > input.evidence.claimsWithEvidence ||
      input.uncertainty.claimsWithCalibratedConfidence > input.uncertainty.materialClaims ||
      input.contradictions.resolved > input.contradictions.detected ||
      input.verification.checksPassed + (input.verification.checksFailed ?? 0) + (input.verification.checksNotRun ?? 0) > input.verification.checksRequired) {
    throw new Error("Quality audit counts are inconsistent.");
  }
  const missingRequirements = input.requirements.total - input.requirements.addressed;
  const unverifiedRequirements = input.requirements.addressed - input.requirements.verified;
  const unsupportedEvidenceClaims = input.evidence.claimsRequiringEvidence - input.evidence.claimsWithEvidence;
  const uncalibratedMaterialClaims = input.uncertainty.materialClaims - input.uncertainty.claimsWithCalibratedConfidence;
  const unresolvedContradictions = input.contradictions.detected - input.contradictions.resolved;
  const failedChecks = input.verification.checksFailed ?? 0, unrunChecks = input.verification.checksNotRun ?? 0;
  const findings = input.findings ?? [];
  const unresolvedCritical = findings.filter(f => !f.resolved && f.severity === "critical").length;
  const unresolvedHigh = findings.filter(f => !f.resolved && f.severity === "high").length;
  const ratio = (n: number, d: number) => d === 0 ? 1 : n / d;
  const dimensions: QualityAuditResult["dimensions"] = {
    requirementCoverage: { score: ratio(input.requirements.verified, input.requirements.total), weight: .25, issues: missingRequirements + unverifiedRequirements },
    evidenceQuality: { score: ratio(input.evidence.claimsWithEvidence, input.evidence.claimsRequiringEvidence), weight: .2, issues: unsupportedEvidenceClaims },
    uncertaintyHandling: { score: Math.max(0, ratio(input.uncertainty.claimsWithCalibratedConfidence, input.uncertainty.materialClaims) - Math.min(1, (input.uncertainty.unsupportedCertaintyFlags ?? 0) / Math.max(1, input.uncertainty.materialClaims))), weight: .1, issues: uncalibratedMaterialClaims + (input.uncertainty.unsupportedCertaintyFlags ?? 0) },
    contradictionDetection: { score: ratio(input.contradictions.resolved, input.contradictions.detected), weight: .15, issues: unresolvedContradictions },
    unresolvedGaps: { score: Math.max(0, 1 - Math.min(1, (missingRequirements + unverifiedRequirements + unresolvedCritical * 3 + unresolvedHigh * 2) / Math.max(1, input.requirements.total + 3))), weight: .15, issues: missingRequirements + unverifiedRequirements + unresolvedCritical + unresolvedHigh },
    verification: { score: ratio(input.verification.checksPassed, input.verification.checksRequired), weight: .15, issues: failedChecks + unrunChecks }
  };
  const score = Math.round(Object.values(dimensions).reduce((s, d) => s + d.score * d.weight, 0) * 100);
  const recommendations: string[] = [];
  if (missingRequirements || unverifiedRequirements) recommendations.push("Address every requirement and attach observable evidence before marking it verified.");
  if (unsupportedEvidenceClaims) recommendations.push("Add traceable evidence for consequential claims or label them as assumptions.");
  if (uncalibratedMaterialClaims || (input.uncertainty.unsupportedCertaintyFlags ?? 0)) recommendations.push("Calibrate uncertainty and remove certainty claims that exceed the evidence.");
  if (unresolvedContradictions) recommendations.push("Resolve contradictions or document why evidence cannot distinguish alternatives.");
  if (failedChecks || unrunChecks) recommendations.push("Investigate failed checks and run or explicitly waive remaining checks with a reason.");
  if (unresolvedCritical || unresolvedHigh) recommendations.push("Resolve critical/high-severity findings before treating the result as ready.");
  if (!recommendations.length) recommendations.push("No count-based gaps detected; domain-specific semantic review is still required.");
  const status = unresolvedCritical > 0 || failedChecks > 0 ? "fail" :
    score >= 90 && unresolvedHigh === 0 && unrunChecks === 0 && missingRequirements === 0 && unverifiedRequirements === 0 ? "pass" : "needs-review";
  return { schemaVersion: 1, score, status, dimensions, unresolvedCritical, unresolvedHigh, missingRequirements, unverifiedRequirements,
    unsupportedEvidenceClaims, uncalibratedMaterialClaims, unresolvedContradictions, failedChecks, unrunChecks, recommendations };
}
