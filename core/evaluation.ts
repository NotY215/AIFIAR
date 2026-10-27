import type { TaskKind } from "../models/registry.js";

export interface BenchmarkCase {
  id: string;
  taskKind: TaskKind;
  expectedCapabilities: string[];
  weight?: number;
}

export interface BenchmarkDecision {
  caseId: string;
  selectedProvider?: string;
  selectedModelId?: string;
  eligibleCandidates: Array<{ provider: string; modelId: string }>;
  success: boolean;
  latencyMs?: number;
  inputTokens?: number;
  outputTokens?: number;
  cost?: number;
}

export interface BenchmarkReport {
  cases: number;
  coverage: number;
  successRate: number;
  weightedSuccessRate: number;
  averageLatencyMs: number | null;
  observedInputTokens: number;
  observedOutputTokens: number;
  observedCost: number | null;
  missingCases: string[];
  invalidDecisions: string[];
}

function finiteNonNegative(value: number | undefined): number | undefined {
  return value !== undefined && Number.isFinite(value) && value >= 0 ? value : undefined;
}

/** Evaluates recorded routing outcomes only. It never calls a provider or fabricates measurements. */
export function evaluateRoutingBenchmark(
  cases: readonly BenchmarkCase[],
  decisions: readonly BenchmarkDecision[]
): BenchmarkReport {
  const ids = new Set<string>();
  const invalidDecisions: string[] = [];
  for (const item of decisions) {
    if (!item.caseId || ids.has(item.caseId)) invalidDecisions.push(item.caseId || "<empty-case-id>");
    ids.add(item.caseId);
    if (finiteNonNegative(item.latencyMs) === undefined && item.latencyMs !== undefined) invalidDecisions.push(`${item.caseId}:invalid-latency`);
    if (finiteNonNegative(item.inputTokens) === undefined && item.inputTokens !== undefined) invalidDecisions.push(`${item.caseId}:invalid-input-tokens`);
    if (finiteNonNegative(item.outputTokens) === undefined && item.outputTokens !== undefined) invalidDecisions.push(`${item.caseId}:invalid-output-tokens`);
    if (finiteNonNegative(item.cost) === undefined && item.cost !== undefined) invalidDecisions.push(`${item.caseId}:invalid-cost`);
  }

  const caseById = new Map(cases.map((item) => [item.id, item]));
  const decisionById = new Map(decisions.map((item) => [item.caseId, item]));
  const applicable = cases.filter((item) => decisionById.has(item.id));
  let totalWeight = 0;
  let successfulWeight = 0;
  for (const item of applicable) {
    const weight = Number.isFinite(item.weight) && (item.weight ?? 1) > 0 ? item.weight ?? 1 : 1;
    totalWeight += weight;
    if (decisionById.get(item.id)?.success) successfulWeight += weight;
  }
  const observedLatency = applicable.map((item) => finiteNonNegative(decisionById.get(item.id)?.latencyMs)).filter((value): value is number => value !== undefined);
  const costValues = applicable.map((item) => finiteNonNegative(decisionById.get(item.id)?.cost)).filter((value): value is number => value !== undefined);
  const tokenValues = applicable.map((item) => decisionById.get(item.id)!);
  return {
    cases: cases.length,
    coverage: cases.length ? applicable.length / cases.length : 1,
    successRate: applicable.length ? applicable.filter((item) => decisionById.get(item.id)?.success).length / applicable.length : 0,
    weightedSuccessRate: totalWeight ? successfulWeight / totalWeight : 0,
    averageLatencyMs: observedLatency.length ? observedLatency.reduce((sum, value) => sum + value, 0) / observedLatency.length : null,
    observedInputTokens: tokenValues.reduce((sum, item) => sum + (finiteNonNegative(item.inputTokens) ?? 0), 0),
    observedOutputTokens: tokenValues.reduce((sum, item) => sum + (finiteNonNegative(item.outputTokens) ?? 0), 0),
    observedCost: applicable.length === cases.length && costValues.length === applicable.length && applicable.length > 0
      ? costValues.reduce((sum, value) => sum + value, 0)
      : null,
    missingCases: cases.filter((item) => !decisionById.has(item.id)).map((item) => item.id),
    invalidDecisions: invalidDecisions.concat(decisions.filter((item) => !caseById.has(item.caseId)).map((item) => `${item.caseId}:unknown-case`))
  };
}

export interface OutcomeComparison {
  singleModel: BenchmarkReport;
  multiModel: BenchmarkReport;
  successRateDelta: number;
  weightedSuccessRateDelta: number;
  latencyDeltaMs: number | null;
  inputTokenDelta: number;
  outputTokenDelta: number;
  costDelta: number | null;
}

/** Positive deltas mean the multi-model run scored higher or used more resources. */
export function compareRoutingOutcomes(singleModel: BenchmarkReport, multiModel: BenchmarkReport): OutcomeComparison {
  return {
    singleModel,
    multiModel,
    successRateDelta: multiModel.successRate - singleModel.successRate,
    weightedSuccessRateDelta: multiModel.weightedSuccessRate - singleModel.weightedSuccessRate,
    latencyDeltaMs: singleModel.averageLatencyMs === null || multiModel.averageLatencyMs === null
      ? null : multiModel.averageLatencyMs - singleModel.averageLatencyMs,
    inputTokenDelta: multiModel.observedInputTokens - singleModel.observedInputTokens,
    outputTokenDelta: multiModel.observedOutputTokens - singleModel.observedOutputTokens,
    costDelta: singleModel.observedCost === null || multiModel.observedCost === null
      ? null : multiModel.observedCost - singleModel.observedCost
  };
}
