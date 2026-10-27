export interface BenchmarkTrial {
  trialId: string;
  caseId: string;
  provider: string;
  modelId: string;
  passed: boolean;
  latencyMs?: number;
  inputTokens?: number;
  outputTokens?: number;
}

export interface BenchmarkStatisticsOptions {
  minimumTrials?: number;
  minimumCases?: number;
  minimumTrialsPerCase?: number;
  confidenceLevel?: 0.9 | 0.95 | 0.99;
}

export interface BenchmarkCaseStatistics {
  caseId: string;
  trials: number;
  successes: number;
  successRate: number;
}

export interface ModelBenchmarkStatistics {
  provider: string;
  modelId: string;
  trials: number;
  successes: number;
  failures: number;
  successRate: number;
  confidenceLevel: number;
  confidenceInterval: { lower: number; upper: number };
  distinctCases: number;
  perCase: BenchmarkCaseStatistics[];
  observedLatencyCount: number;
  averageLatencyMs: number | null;
  observedInputTokenCount: number;
  observedInputTokens: number;
  observedOutputTokenCount: number;
  observedOutputTokens: number;
  sampleAdequate: boolean;
  sampleWarnings: string[];
}

const Z_SCORES: Record<NonNullable<BenchmarkStatisticsOptions["confidenceLevel"]>, number> = {
  0.9: 1.6448536269514722,
  0.95: 1.959963984540054,
  0.99: 2.5758293035489004
};

function requiredLabel(value: unknown, label: string, maxLength = 256): string {
  if (typeof value !== "string" || !value.trim() || value.length > maxLength) {
    throw new Error("Invalid benchmark trial " + label + ".");
  }
  return value.trim();
}

function validateObservation(value: number | undefined, label: string, trialId: string): void {
  if (value !== undefined && (!Number.isFinite(value) || value < 0)) {
    throw new Error("Invalid " + label + " for benchmark trial " + trialId + ".");
  }
}

function wilsonInterval(successes: number, trials: number, z: number): { lower: number; upper: number } {
  if (trials === 0) return { lower: 0, upper: 1 };
  const p = successes / trials;
  const z2 = z * z;
  const denominator = 1 + z2 / trials;
  const center = (p + z2 / (2 * trials)) / denominator;
  const margin = (z * Math.sqrt((p * (1 - p) / trials) + z2 / (4 * trials * trials))) / denominator;
  return { lower: Math.max(0, center - margin), upper: Math.min(1, center + margin) };
}

/**
 * Summarizes repeated, independently verified benchmark outcomes by provider/model.
 * It computes uncertainty from supplied trials; it does not execute models or prove
 * that trials are independent or representative of future workloads.
 */
export function summarizeBenchmarkTrials(
  input: readonly BenchmarkTrial[],
  options: BenchmarkStatisticsOptions = {}
): ModelBenchmarkStatistics[] {
  if (!Array.isArray(input) || input.length > 50_000) {
    throw new Error("Benchmark trials must contain no more than 50000 entries.");
  }
  const minimumTrials = options.minimumTrials ?? 30;
  const minimumCases = options.minimumCases ?? 8;
  const minimumTrialsPerCase = options.minimumTrialsPerCase ?? 3;
  const confidenceLevel = options.confidenceLevel ?? 0.95;
  if (!Number.isInteger(minimumTrials) || minimumTrials < 1 || minimumTrials > 50_000) {
    throw new Error("minimumTrials must be an integer between 1 and 50000.");
  }
  if (!Number.isInteger(minimumCases) || minimumCases < 1 || minimumCases > 500) {
    throw new Error("minimumCases must be an integer between 1 and 500.");
  }
  if (!Number.isInteger(minimumTrialsPerCase) || minimumTrialsPerCase < 1 || minimumTrialsPerCase > 5000) {
    throw new Error("minimumTrialsPerCase must be an integer between 1 and 5000.");
  }
  const z = Z_SCORES[confidenceLevel];
  if (z === undefined) throw new Error("confidenceLevel must be 0.9, 0.95, or 0.99.");

  const seenTrialIds = new Set<string>();
  const groups = new Map<string, { provider: string; modelId: string; trials: BenchmarkTrial[] }>();
  for (const raw of input) {
    if (!raw || typeof raw !== "object" || typeof raw.passed !== "boolean") {
      throw new Error("Invalid benchmark trial record.");
    }
    const trialId = requiredLabel(raw.trialId, "ID");
    const caseId = requiredLabel(raw.caseId, "case ID");
    const provider = requiredLabel(raw.provider, "provider", 128);
    const modelId = requiredLabel(raw.modelId, "model ID", 256);
    if (seenTrialIds.has(trialId)) throw new Error("Duplicate benchmark trial ID: " + trialId);
    seenTrialIds.add(trialId);
    validateObservation(raw.latencyMs, "latency", trialId);
    validateObservation(raw.inputTokens, "input tokens", trialId);
    validateObservation(raw.outputTokens, "output tokens", trialId);
    const key = JSON.stringify([provider, modelId]);
    const group = groups.get(key) ?? { provider, modelId, trials: [] };
    group.trials.push({ ...raw, trialId, caseId, provider, modelId });
    groups.set(key, group);
  }

  return [...groups.values()].map((group) => {
    const trials = group.trials;
    const successes = trials.filter((trial) => trial.passed).length;
    const caseMap = new Map<string, BenchmarkTrial[]>();
    for (const trial of trials) {
      const items = caseMap.get(trial.caseId) ?? [];
      items.push(trial);
      caseMap.set(trial.caseId, items);
    }
    const perCase = [...caseMap.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([caseId, items]) => {
      const passed = items.filter((trial) => trial.passed).length;
      return { caseId, trials: items.length, successes: passed, successRate: passed / items.length };
    });
    const latencies = trials.map((trial) => trial.latencyMs).filter((value): value is number => value !== undefined);
    const inputTokens = trials.map((trial) => trial.inputTokens).filter((value): value is number => value !== undefined);
    const outputTokens = trials.map((trial) => trial.outputTokens).filter((value): value is number => value !== undefined);
    const sampleWarnings: string[] = [];
    if (trials.length < minimumTrials) sampleWarnings.push("insufficient-trials");
    if (caseMap.size < minimumCases) sampleWarnings.push("insufficient-distinct-cases");
    if ([...caseMap.values()].some((items) => items.length < minimumTrialsPerCase)) sampleWarnings.push("insufficient-repeats-per-case");
    if (latencies.length < trials.length || inputTokens.length < trials.length || outputTokens.length < trials.length) {
      sampleWarnings.push("incomplete-resource-observations");
    }
    return {
      provider: group.provider,
      modelId: group.modelId,
      trials: trials.length,
      successes,
      failures: trials.length - successes,
      successRate: trials.length ? successes / trials.length : 0,
      confidenceLevel,
      confidenceInterval: wilsonInterval(successes, trials.length, z),
      distinctCases: caseMap.size,
      perCase,
      observedLatencyCount: latencies.length,
      averageLatencyMs: latencies.length ? latencies.reduce((sum, value) => sum + value, 0) / latencies.length : null,
      observedInputTokenCount: inputTokens.length,
      observedInputTokens: inputTokens.reduce((sum, value) => sum + value, 0),
      observedOutputTokenCount: outputTokens.length,
      observedOutputTokens: outputTokens.reduce((sum, value) => sum + value, 0),
      sampleAdequate: trials.length >= minimumTrials && caseMap.size >= minimumCases
        && [...caseMap.values()].every((items) => items.length >= minimumTrialsPerCase),
      sampleWarnings
    };
  }).sort((a, b) => a.provider.localeCompare(b.provider) || a.modelId.localeCompare(b.modelId));
}
