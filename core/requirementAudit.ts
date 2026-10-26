import type { Requirement, WorkPlan } from "./types.js";

export interface RequirementAuditEntry {
  requirementId: string;
  taskIds: string[];
  status: Requirement["status"];
  evidenceCount: number;
  issues: string[];
}

export interface RequirementAudit {
  valid: boolean;
  entries: RequirementAuditEntry[];
  errors: string[];
  warnings: string[];
}

export function auditRequirementTraceability(plan: WorkPlan): RequirementAudit {
  const errors: string[] = [];
  const warnings: string[] = [];
  const seen = new Set<string>();
  const taskIds = new Set(plan.tasks.map((task) => task.id));
  const entries: RequirementAuditEntry[] = [];

  for (const requirement of plan.requirements) {
    const issues: string[] = [];
    if (seen.has(requirement.id)) {
      errors.push("Duplicate requirement ID: " + requirement.id);
      issues.push("Requirement ID is duplicated.");
    }
    seen.add(requirement.id);

    const taskIdsForRequirement = plan.tasks
      .filter((task) => task.requirementIds.includes(requirement.id))
      .map((task) => task.id);

    for (const taskId of taskIdsForRequirement) {
      if (!taskIds.has(taskId)) errors.push("Requirement " + requirement.id + " maps to unknown task " + taskId);
    }

    const evidenceCount = requirement.evidence?.filter((item) => item.trim().length > 0).length ?? 0;
    if (requirement.mandatory && taskIdsForRequirement.length === 0) {
      const message = "Mandatory requirement " + requirement.id + " has no mapped task.";
      errors.push(message);
      issues.push(message);
    }

    if (requirement.status === "verified" && evidenceCount === 0) {
      const message = "Requirement " + requirement.id + " is marked verified without evidence.";
      errors.push(message);
      issues.push(message);
    } else if (requirement.status === "addressed" && evidenceCount === 0) {
      const message = "Requirement " + requirement.id + " is addressed but has no evidence.";
      warnings.push(message);
      issues.push(message);
    }

    if (requirement.status === "blocked" && requirement.mandatory) {
      warnings.push("Mandatory requirement " + requirement.id + " remains blocked.");
    }

    entries.push({
      requirementId: requirement.id,
      taskIds: taskIdsForRequirement,
      status: requirement.status,
      evidenceCount,
      issues
    });
  }

  for (const task of plan.tasks) {
    for (const requirementId of task.requirementIds) {
      if (!seen.has(requirementId)) {
        errors.push("Task " + task.id + " references unknown requirement " + requirementId);
      }
    }
  }

  return { valid: errors.length === 0, entries, errors, warnings };
}
