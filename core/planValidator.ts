import type { WorkPlan } from "./types.js";

export interface PlanValidation {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export function validateWorkPlan(plan: WorkPlan): PlanValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  const taskIds = new Set<string>();
  const requirementIds = new Set(plan.requirements.map((item) => item.id));

  for (const requirement of plan.requirements) {
    if (!requirement.id.trim()) errors.push("Requirement ID cannot be empty");
    if (!requirement.text.trim()) errors.push(`Requirement ${requirement.id || "(missing ID)"} has no text`);
  }

  for (const task of plan.tasks) {
    if (!task.id.trim()) errors.push("Task ID cannot be empty");
    if (taskIds.has(task.id)) errors.push(`Duplicate task ID: ${task.id}`);
    taskIds.add(task.id);
    if (!task.title.trim()) errors.push(`Task ${task.id} has no title`);
    if (!task.description.trim()) warnings.push(`Task ${task.id} has no description`);
    for (const id of task.requirementIds) {
      if (!requirementIds.has(id)) errors.push(`Task ${task.id} references unknown requirement ${id}`);
    }
    if (task.dependsOn.includes(task.id)) errors.push(`Task ${task.id} depends on itself`);
  }

  for (const task of plan.tasks) {
    for (const dependency of task.dependsOn) {
      if (!taskIds.has(dependency)) errors.push(`Task ${task.id} depends on unknown task ${dependency}`);
    }
  }

  for (const requirement of plan.requirements) {
    if (requirement.mandatory && !plan.tasks.some((task) => task.requirementIds.includes(requirement.id))) {
      warnings.push(`Mandatory requirement ${requirement.id} is not mapped to a task`);
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}
