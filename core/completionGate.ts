import type { Requirement, Task, TaskResult, WorkPlan } from "./types.js";
import { auditRequirementTraceability } from "./requirementAudit.js";
import { verifyWork } from "./verificationEngine.js";

export interface CompletionGateInput {
  plan: WorkPlan;
  results: readonly TaskResult[];
  requiredChecks?: string[];
  completedChecks?: string[];
  repositoryScanComplete?: boolean;
  unresolvedConflicts?: string[];
}

export interface CompletionGateReport {
  canClaimComplete: boolean;
  blockers: string[];
  warnings: string[];
  requirementAuditValid: boolean;
  verificationPassed: boolean;
  missingChecks: string[];
  taskResultIssues: string[];
}

export function evaluateCompletion(input: CompletionGateInput): CompletionGateReport {
  const blockers: string[] = [];
  const warnings: string[] = [];
  const taskResultIssues: string[] = [];
  const audit = auditRequirementTraceability(input.plan);
  const verification = verifyWork(input.plan.requirements as readonly Requirement[], input.plan.tasks as readonly Task[], input.results);
  const requiredChecks = [...new Set(input.requiredChecks ?? [])];
  const completedChecks = new Set(input.completedChecks ?? []);
  const missingChecks = requiredChecks.filter((check) => !completedChecks.has(check));

  blockers.push(...audit.errors);
  if (!verification.passed) {
    if (verification.unresolvedRequirements.length) blockers.push("Mandatory requirements remain unverified: " + verification.unresolvedRequirements.join(", "));
    if (verification.incompleteTasks.length) blockers.push("Tasks without successful results: " + verification.incompleteTasks.join(", "));
  }
  if (input.repositoryScanComplete === false) blockers.push("Repository scan was incomplete, so repository-wide conclusions are not permitted.");
  if (missingChecks.length) blockers.push("Required verification checks did not complete: " + missingChecks.join(", "));
  if (input.unresolvedConflicts?.length) blockers.push(...input.unresolvedConflicts.map((conflict) => "Unresolved conflict: " + conflict));

  const taskIds = new Set(input.plan.tasks.map((task: Task) => task.id));
  const resultByTask = new Map<string, TaskResult[]>();
  for (const result of input.results) {
    if (!taskIds.has(result.taskId)) taskResultIssues.push("Result references unknown task: " + result.taskId);
    const records = resultByTask.get(result.taskId) ?? [];
    records.push(result);
    resultByTask.set(result.taskId, records);
    if (result.status === "success" && !result.summary.trim()) {
      taskResultIssues.push("Successful task result has no summary: " + result.taskId);
    }
    if (result.status === "success" && result.evidence.filter((item) => item.trim()).length === 0) {
      taskResultIssues.push("Successful task result has no evidence: " + result.taskId);
    }
  }
  for (const [taskId, records] of resultByTask) {
    if (records.length > 1) taskResultIssues.push("Task has multiple result records; reconcile before completion: " + taskId);
  }
  blockers.push(...taskResultIssues);

  if (audit.warnings.length) warnings.push(...audit.warnings);
  if (verification.warnings.length) warnings.push(...verification.warnings);
  if (input.repositoryScanComplete === undefined) warnings.push("Repository scan completeness was not supplied.");
  if (!requiredChecks.length) warnings.push("No required verification checks were configured.");
  return {
    canClaimComplete: blockers.length === 0,
    blockers: [...new Set(blockers)],
    warnings: [...new Set(warnings)],
    requirementAuditValid: audit.valid,
    verificationPassed: verification.passed,
    missingChecks,
    taskResultIssues
  };
}
