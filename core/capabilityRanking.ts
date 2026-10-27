import type { ModelCapabilities, TaskKind } from "../models/registry.js";

export interface ModelEvaluation {
  provider: string;
  modelId: string;
  qualityByTask?: Partial<Record<TaskKind, number>>;
  averageLatencyMs?: number;
  costPerMillionTokens?: number;
}

export interface RankingOptions {
  taskKind: TaskKind;
  requireTools?: boolean;
  estimatedInputTokens?: number;
  evaluations?: readonly ModelEvaluation[];
}

export interface RankedCandidate {
  provider: string;
  modelId: string;
  eligible: boolean;
  score: number;
  reasons: string[];
}

export function rankCandidates(models: readonly ModelCapabilities[], options: RankingOptions): RankedCandidate[] {
  const results = models.map((model) => {
    const evaluation = options.evaluations?.find((item) => item.provider === model.provider && item.modelId === model.modelId);
    const reasons: string[] = [];
    const kindMatch = model.taskKinds.includes(options.taskKind);
    const generalMatch = model.taskKinds.includes("general");
    const contextFits = options.estimatedInputTokens === undefined
      || model.contextWindowTokens === undefined
      || model.contextWindowTokens >= options.estimatedInputTokens;
    const eligible = model.availability === "available"
      && (kindMatch || generalMatch)
      && (!options.requireTools || model.supportsTools)
      && contextFits;

    if (model.availability !== "available") reasons.push("Model is not available");
    if (!kindMatch && !generalMatch) reasons.push("Task kind is not declared as supported");
    if (options.requireTools && !model.supportsTools) reasons.push("Required tools are unavailable");
    if (!contextFits) reasons.push("Declared context window is too small");

    let score = kindMatch ? 40 : generalMatch ? 15 : 0;
    const measuredQuality = evaluation?.qualityByTask?.[options.taskKind];
    if (typeof measuredQuality === "number" && Number.isFinite(measuredQuality)) {
      score += Math.max(0, Math.min(40, measuredQuality));
    }
    if (model.supportsStructuredOutput) score += 5;
    if (model.supportsTools) score += 5;
    if (typeof evaluation?.averageLatencyMs === "number" && Number.isFinite(evaluation.averageLatencyMs) && evaluation.averageLatencyMs > 0) {
      score += Math.max(0, 5 - evaluation.averageLatencyMs / 2000);
    }
    if (typeof evaluation?.costPerMillionTokens === "number" && Number.isFinite(evaluation.costPerMillionTokens) && evaluation.costPerMillionTokens >= 0) {
      score += Math.max(0, 5 - evaluation.costPerMillionTokens / 10);
    }

    return {
      provider: model.provider,
      modelId: model.modelId,
      eligible,
      score: eligible ? score : 0,
      reasons
    };
  });
  return results.sort((a, b) => b.score - a.score);
}
