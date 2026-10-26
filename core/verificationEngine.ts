import type { Requirement, Task, TaskResult } from "./types.js";

export interface VerificationReport {
  passed: boolean;
  unresolvedRequirements: string[];
  incompleteTasks: string[];
  failedTasks: string[];
  warnings: string[];
}

export function verifyWork(requirements: readonly Requirement[], tasks: readonly Task[], results: readonly TaskResult[]): VerificationReport {
  const successfulTaskIds = new Set(results.filter((result) => result.status === "success").map((result) => result.taskId));
  const failedTaskIds = new Set(results.filter((result) => result.status === "failure").map((result) => result.taskId));
  const incompleteTasks = tasks.filter((task) => !successfulTaskIds.has(task.id)).map((task) => task.id);
  const failedTasks = tasks.filter((task) => failedTaskIds.has(task.id)).map((task) => task.id);
  const unresolvedRequirements = requirements.filter((requirement) => requirement.mandatory && requirement.status !== "verified").map((requirement) => requirement.id);
  const warnings = incompleteTasks.length ? ["A task may have no result or may not have succeeded; inspect task result records."] : [];
  return {
    passed: unresolvedRequirements.length === 0 && incompleteTasks.length === 0,
    unresolvedRequirements, incompleteTasks, failedTasks, warnings
  };
}
