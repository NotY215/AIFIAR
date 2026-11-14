import { validateBenchmarkCorpus, type VersionedBenchmarkCorpus } from "./benchmarkCorpus.js";
import { runLiveBenchmark, type LiveBenchmarkOptions, type LiveBenchmarkReport } from "./liveBenchmarkRunner.js";
import { BenchmarkEvidenceStore } from "./benchmarkEvidenceStore.js";
import { estimateDetailedProviderCost, type DetailedProviderRateCard, type DetailedCostEstimate } from "./detailedCostEstimator.js";
import type { ProviderRuntime } from "../models/providerRuntime.js";

export interface ProviderBenchmarkWorkflowInput {
  runtime: ProviderRuntime;
  corpus: VersionedBenchmarkCorpus;
  provider: string;
  modelId: string;
  consentGranted: boolean;
  maxInputTokensPerTrial: number;
  maxOutputTokensPerTrial: number;
  rateCard: DetailedProviderRateCard;
  approvedBudget: { amount: number; currency: string };
  approveCost(estimate: DetailedCostEstimate): Promise<boolean>;
  evidenceStore?: BenchmarkEvidenceStore;
  benchmark?: Omit<LiveBenchmarkOptions, "provider" | "modelId">;
  asOf?: string;
}

export interface ProviderBenchmarkWorkflowReport {
  status: "blocked" | "completed";
  provider: string;
  modelId: string;
  costPreflight?: DetailedCostEstimate;
  benchmark?: LiveBenchmarkReport;
  evidencePersisted: boolean;
  blockers: string[];
}

/**
 * Coordinates explicit consent, configured-model validation, conservative
 * worst-case cost preflight, human budget approval, benchmark execution, and
 * optional durable evidence persistence. It never starts paid calls implicitly.
 */
export async function runApprovedProviderBenchmark(
  input: ProviderBenchmarkWorkflowInput
): Promise<ProviderBenchmarkWorkflowReport> {
  const blocked = (message: string, costPreflight?: DetailedCostEstimate): ProviderBenchmarkWorkflowReport => ({
    status: "blocked", provider: input.provider, modelId: input.modelId,
    ...(costPreflight ? { costPreflight } : {}), evidencePersisted: false, blockers: [message]
  });
  if (input.consentGranted !== true) return blocked("Explicit benchmark consent is required.");
  const model = input.runtime.registry.get(input.provider, input.modelId);
  if (!model || model.availability !== "available") return blocked("The selected provider/model is not configured and available in this runtime.");
  if (!Number.isSafeInteger(input.maxInputTokensPerTrial) || input.maxInputTokensPerTrial < 1 ||
      !Number.isSafeInteger(input.maxOutputTokensPerTrial) || input.maxOutputTokensPerTrial < 1) {
    return blocked("Per-trial input and output token ceilings must be positive safe integers.");
  }
  const settings = input.runtime.settings[input.provider as keyof ProviderRuntime["settings"]];
  if (!settings || input.maxOutputTokensPerTrial < settings.maxOutputTokens) {
    return blocked("The benchmark output-token ceiling must cover the selected provider adapter output limit.");
  }
  let validatedCorpus: VersionedBenchmarkCorpus;
  try { validatedCorpus = validateBenchmarkCorpus(input.corpus); }
  catch (error) { return blocked("Benchmark corpus validation failed: " + (error instanceof Error ? error.message : "invalid corpus")); }
  if (!Number.isFinite(input.approvedBudget.amount) || input.approvedBudget.amount < 0 ||
      !/^[A-Z][A-Z0-9]{2,11}$/.test(input.approvedBudget.currency)) {
    return blocked("An explicit non-negative budget and ISO-style currency code are required.");
  }
  const repetitions = input.benchmark?.repetitions ?? 1;
  const concurrency = input.benchmark?.concurrency ?? 1;
  if (!Number.isInteger(repetitions) || repetitions < 1 || repetitions > 10) return blocked("Benchmark repetitions are outside the supported range.");
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 8) return blocked("Benchmark concurrency is outside the supported range.");
  const caseCount = validatedCorpus.cases.length;
  const totalTrials = caseCount * repetitions;
  if (!Number.isSafeInteger(totalTrials) || totalTrials < 1 || totalTrials > 5000) return blocked("Benchmark trial count exceeds the runner safety limit.");
  const requestCount = totalTrials * settings.maxAttempts;
  const estimatedInputTokens = input.maxInputTokensPerTrial * requestCount;
  const estimatedOutputTokens = input.maxOutputTokensPerTrial * requestCount;
  if (![requestCount, estimatedInputTokens, estimatedOutputTokens].every(Number.isSafeInteger)) return blocked("Worst-case token or request count exceeds safe integer bounds.");
  if (input.rateCard.provider !== input.provider || input.rateCard.modelId !== input.modelId) {
    return blocked("The verified rate card does not match the selected provider and model.");
  }
  let estimate: DetailedCostEstimate;
  try {
    estimate = estimateDetailedProviderCost(input.rateCard, {
      inputTokens: estimatedInputTokens,
      outputTokens: estimatedOutputTokens,
      requestCount
    }, { ...(input.asOf ? { asOf: input.asOf } : {}) });
  } catch (error) {
    return blocked("Cost preflight failed: " + (error instanceof Error ? error.message : "invalid rate card"));
  }
  if (!estimate.complete || estimate.total === null) return blocked("Worst-case cost is incomplete; provide explicit rates for every usage category before running paid benchmarks.", estimate);
  if (estimate.currency !== input.approvedBudget.currency.toUpperCase() || estimate.total > input.approvedBudget.amount) {
    return blocked("Worst-case estimated cost exceeds or does not match the approved budget.", estimate);
  }
  let approved = false;
  try { approved = await input.approveCost(estimate); } catch { return blocked("Cost approval callback failed.", estimate); }
  if (approved !== true) return blocked("The estimated benchmark cost was not approved.", estimate);

  let report: LiveBenchmarkReport;
  try {
    report = await runLiveBenchmark(input.corpus, input.runtime.executor, {
      ...input.benchmark, provider: input.provider, modelId: input.modelId
    });
  } catch (error) {
    return blocked("Benchmark execution could not be completed: " + (error instanceof Error ? error.message : "unknown error"), estimate);
  }
  let evidencePersisted = false;
  if (input.evidenceStore) {
    try { evidencePersisted = await input.evidenceStore.append(report); }
    catch (error) {
      return {
        status: "completed", provider: input.provider, modelId: input.modelId,
        costPreflight: estimate, benchmark: report, evidencePersisted: false,
        blockers: ["Benchmark completed, but evidence persistence failed: " + (error instanceof Error ? error.message : "unknown storage error")]
      };
    }
  }
  return {
    status: "completed", provider: input.provider, modelId: input.modelId,
    costPreflight: estimate, benchmark: report, evidencePersisted,
    blockers: [
      "Cost preflight is a conservative estimate, not an invoice or guarantee of actual spend.",
      "Provider-side retries, tokenization, hidden fees, and usage accounting may differ from configured ceilings.",
      ...(input.evidenceStore && !evidencePersisted ? ["Evidence store was disabled or consent was not granted in its own policy."] : [])
    ]
  };
}
