import type { Requirement, Task, WorkPlan } from "./types.js";
import type { SkillLevel, TaskKind } from "../models/registry.js";

export function createWorkPlan(input: {
  goal: string;
  skillLevel?: SkillLevel;
  requirements: Requirement[];
  tasks: Array<Omit<Task, "status">>;
}): WorkPlan {
  const ids = new Set(input.tasks.map((task) => task.id));
  const warnings: string[] = [];
  for (const task of input.tasks) {
    for (const dependency of task.dependsOn) {
      if (!ids.has(dependency)) warnings.push(`Task ${task.id} depends on unknown task ${dependency}`);
      if (dependency === task.id) warnings.push(`Task ${task.id} cannot depend on itself`);
    }
  }
  const tasks: Task[] = input.tasks.map((task) => ({ ...task, status: task.dependsOn.length ? "pending" : "ready" }));
  return { goal: input.goal, skillLevel: input.skillLevel ?? "intermediate", requirements: input.requirements, tasks, warnings };
}

export function inferTaskKind(text: string): TaskKind {
  const value = text.toLowerCase();
  if (/test|verify|regression/.test(value)) return "testing";
  if (/document|readme|guide/.test(value)) return "documentation";
  if (/review|audit|inspect/.test(value)) return "review";
  if (/implement|fix|code|refactor/.test(value)) return "coding";
  if (/plan|architecture|design/.test(value)) return "planning";
  if (/research|search|reference/.test(value)) return "research";
  if (/repository|repo|tree|files/.test(value)) return "repository-analysis";
  return "general";
}
