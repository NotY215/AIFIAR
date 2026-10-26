import type { ModelRegistry } from "../models/registry.js";
import type { Task, TaskResult, WorkPlan } from "./types.js";
import { findDependencyCycles, getReadyTasks } from "./dependencyScheduler.js";
import { routeTask } from "./taskRouter.js";

export interface TaskExecutor {
  execute(task: Task, provider: string, modelId: string): Promise<TaskResult>;
}

export interface OrchestratorOptions {
  maxParallelTasks?: number;
  allowedProviders?: string[];
}

export interface OrchestrationReport {
  results: TaskResult[];
  blockedTasks: string[];
  warnings: string[];
}

/**
 * Minimal orchestration loop. Provider adapters and safe execution backends must
 * be supplied by the host application; this module never executes shell commands.
 */
export async function runPlan(
  plan: WorkPlan,
  registry: ModelRegistry,
  executor: TaskExecutor,
  options: OrchestratorOptions = {}
): Promise<OrchestrationReport> {
  const maxParallel = Math.max(1, options.maxParallelTasks ?? 2);
  const results: TaskResult[] = [];
  const completed = new Set<string>();
  const warnings = [...plan.warnings];
  const cycles = findDependencyCycles(plan.tasks);
  if (cycles.length) return { results, blockedTasks: [...new Set(cycles.flat())], warnings: [...warnings, "Dependency cycle detected; no tasks were executed."] };

  const remaining = new Map(plan.tasks.map((task) => [task.id, task]));
  while (remaining.size) {
    const ready = getReadyTasks([...remaining.values()], completed).slice(0, maxParallel);
    if (!ready.length) {
      const blockedTasks = [...remaining.keys()];
      warnings.push("No runnable tasks remain. Check missing dependencies or failed prerequisites.");
      return { results, blockedTasks, warnings };
    }

    const batch = await Promise.all(ready.map(async (task) => {
      const candidates = routeTask(task, registry, { allowedProviders: options.allowedProviders });
      const model = candidates[0];
      if (!model) {
        return { task, result: null, warning: `No available model supports task ${task.id}` };
      }
      try {
        const result = await executor.execute(task, model.provider, model.modelId);
        return { task, result, warning: null };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          task,
          result: {
            taskId: task.id, provider: model.provider, modelId: model.modelId,
            status: "failure" as const, summary: "Executor threw an error",
            evidence: [], errors: [message]
          },
          warning: null
        };
      }
    }));

    for (const item of batch) {
      if (item.warning) warnings.push(item.warning);
      if (item.result) {
        results.push(item.result);
        if (item.result.status === "success") {
          completed.add(item.task.id);
          remaining.delete(item.task.id);
        } else {
          item.task.status = "failed";
          remaining.delete(item.task.id);
          for (const task of remaining.values()) {
            if (task.dependsOn.includes(item.task.id)) task.status = "blocked";
          }
        }
      } else {
        item.task.status = "blocked";
        remaining.delete(item.task.id);
      }
    }
  }
  return { results, blockedTasks: plan.tasks.filter((task) => task.status === "blocked").map((task) => task.id), warnings };
}
