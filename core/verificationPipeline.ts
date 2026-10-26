export type VerificationStage =
  | "requirements"
  | "diff-review"
  | "typecheck"
  | "unit-tests"
  | "integration-tests"
  | "security-checks"
  | "freshness"
  | "build";

export interface VerificationStageResult {
  stage: VerificationStage;
  status: "passed" | "failed" | "skipped" | "blocked";
  evidence: string[];
  details?: string[];
}

export interface VerificationPipelineReport {
  passed: boolean;
  requiredStages: VerificationStage[];
  missingStages: VerificationStage[];
  failedStages: VerificationStage[];
  invalidResults: string[];
  blockers: string[];
  evidence: string[];
}

const DEFAULT_REQUIRED: VerificationStage[] = [
  "requirements", "diff-review", "typecheck", "unit-tests", "security-checks", "freshness"
];

export function evaluateVerificationPipeline(
  results: readonly VerificationStageResult[],
  requiredStages: readonly VerificationStage[] = DEFAULT_REQUIRED
): VerificationPipelineReport {
  const blockers: string[] = [];
  const invalidResults: string[] = [];
  const evidence: string[] = [];
  const seen = new Map<VerificationStage, VerificationStageResult[]>();

  for (const result of results) {
    const records = seen.get(result.stage) ?? [];
    records.push(result);
    seen.set(result.stage, records);
    if (result.status === "passed" && !result.evidence.some((item) => item.trim())) {
      invalidResults.push("Stage reported passed without evidence: " + result.stage);
    }
    if (result.evidence.some((item) => item.trim())) {
      evidence.push(...result.evidence.filter((item) => item.trim()).map((item) => result.stage + ": " + item));
    }
  }
  for (const [stage, records] of seen) {
    if (records.length > 1) invalidResults.push("Stage has duplicate results that require reconciliation: " + stage);
  }

  const required = [...new Set(requiredStages)];
  const missingStages = required.filter((stage) => !seen.has(stage));
  const failedStages = required.filter((stage) => {
    const records = seen.get(stage);
    return records !== undefined && (records.length !== 1 || records[0]!.status !== "passed");
  });
  for (const stage of missingStages) blockers.push("Required verification stage is missing: " + stage);
  for (const stage of failedStages) blockers.push("Required verification stage did not pass cleanly: " + stage);
  blockers.push(...invalidResults);

  return {
    passed: blockers.length === 0,
    requiredStages: required,
    missingStages,
    failedStages,
    invalidResults,
    blockers: [...new Set(blockers)],
    evidence
  };
}
