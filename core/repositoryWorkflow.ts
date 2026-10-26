import { runPlan, type OrchestrationReport, type OrchestratorOptions } from "./orchestrator.js";
import { RepositoryMemory } from "./repositoryMemory.js";
import { assembleRepositoryContext, type RepositoryContextOptions, type RepositoryContextReport } from "./repositoryContext.js";
import type { ModelRegistry } from "../models/registry.js";
import type { TaskExecutor } from "./orchestrator.js";
import type { WorkPlan } from "./types.js";

export interface RepositoryWorkflowOptions {
  repositoryId: string;
  rootPath: string;
  storeDirectory: string;
  commit?: string;
  context?: RepositoryContextOptions;
  orchestration?: OrchestratorOptions;
}
export interface RepositoryWorkflowReport {
  context: RepositoryContextReport;
  orchestration: OrchestrationReport;
}
export async function runRepositoryWorkflow(
  plan: WorkPlan,
  registry: ModelRegistry,
  executor: TaskExecutor,
  options: RepositoryWorkflowOptions
): Promise<RepositoryWorkflowReport> {
  const memory = new RepositoryMemory(options.storeDirectory);
  const context = await assembleRepositoryContext(memory, {
    repositoryId: options.repositoryId,
    rootPath: options.rootPath,
    plan,
    ...(options.commit ? { commit: options.commit } : {})
  }, options.context);
  const enrichedPlan: WorkPlan = {
    ...context.plan,
    warnings: [...context.plan.warnings, ...context.warnings]
  };
  const orchestration = await runPlan(enrichedPlan, registry, executor, options.orchestration);
  return { context, orchestration };
}
