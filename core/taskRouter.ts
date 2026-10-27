import type { ModelRegistry, ModelCapabilities } from "../models/registry.js";
import { rankCandidates, type ModelEvaluation } from "./capabilityRanking.js";
import type { Task } from "./types.js";

export interface RoutingConstraints {
  allowedProviders?: string[];
  excludedProviders?: string[];
  requireTools?: boolean;
  estimatedInputTokens?: number;
  evaluations?: readonly ModelEvaluation[];
}

export function routeTask(task: Task, registry: ModelRegistry, constraints: RoutingConstraints = {}): ModelCapabilities[] {
  const eligibleModels = registry.list()
    .filter((model) => model.availability === "available")
    .filter((model) => model.taskKinds.includes(task.kind) || model.taskKinds.includes("general"))
    .filter((model) => !constraints.allowedProviders || constraints.allowedProviders.includes(model.provider))
    .filter((model) => !constraints.excludedProviders?.includes(model.provider))
    .filter((model) => !constraints.requireTools || model.supportsTools);

  const ranking = rankCandidates(eligibleModels, {
    taskKind: task.kind,
    requireTools: constraints.requireTools,
    estimatedInputTokens: constraints.estimatedInputTokens,
    evaluations: constraints.evaluations
  });
  const rankByIdentity = new Map(ranking.filter((item) => item.eligible)
    .map((item, index) => [`${item.provider}\0${item.modelId}`, { score: item.score, index }] as const));
  return eligibleModels
    .filter((model) => rankByIdentity.has(`${model.provider}\0${model.modelId}`))
    .sort((a, b) => {
      const left = rankByIdentity.get(`${a.provider}\0${a.modelId}`)!;
      const right = rankByIdentity.get(`${b.provider}\0${b.modelId}`)!;
      return right.score - left.score || left.index - right.index;
    });
}
