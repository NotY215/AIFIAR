import { randomUUID } from "node:crypto";
import { redactPotentialSecrets } from "./secretRedaction.js";
import type { TaskExecutor } from "./orchestrator.js";
import type { Task } from "./types.js";
import { validateBenchmarkCorpus, verifyBenchmarkOutput, type BenchmarkCaseResult, type VersionedBenchmarkCorpus } from "./benchmarkCorpus.js";
import { summarizeBenchmarkTrials, type BenchmarkStatisticsOptions, type BenchmarkTrial, type ModelBenchmarkStatistics } from "./benchmarkStatistics.js";

export interface LiveBenchmarkOptions {
  provider: string;
  modelId: string;
  repetitions?: number;
  concurrency?: number;
  runId?: string;
  startedAt?: string;
  statistics?: BenchmarkStatisticsOptions;
}

export interface LiveBenchmarkTrialEvidence {
  trialId: string;
  caseId: string;
  provider: string;
  modelId: string;
  status: "success" | "failure" | "skipped";
  passed: boolean;
  verifier: string;
  reasons: string[];
  latencyMs: number;
  output: string;
  errors: string[];
  usage: { inputTokens?: number; outputTokens?: number; totalTokens?: number };
}

export interface LiveBenchmarkReport {
  schemaVersion: 1;
  runId: string;
  corpusId: string;
  corpusVersion: string;
  provider: string;
  modelId: string;
  startedAt: string;
  completedAt: string;
  repetitions: number;
  attemptedTrials: number;
  passedTrials: number;
  failedTrials: number;
  statistics: ModelBenchmarkStatistics[];
  trials: LiveBenchmarkTrialEvidence[];
  limitations: string[];
}

function requiredLabel(value: unknown, label: string, maxLength = 256): string {
  if (typeof value !== "string" || !value.trim() || value.length > maxLength) {
    throw new Error(label + " must be a non-empty string of at most " + maxLength + " characters.");
  }
  return value.trim();
}

function validTimestamp(value: string, label: string): string {
  if (!Number.isFinite(Date.parse(value))) throw new Error(label + " must be a valid timestamp.");
  return new Date(value).toISOString();
}

/**
 * Executes a versioned corpus against an explicitly selected configured model.
 * No provider is selected implicitly and no evidence is persisted automatically.
 */
export async function runLiveBenchmark(
  corpus: VersionedBenchmarkCorpus,
  executor: TaskExecutor,
  options: LiveBenchmarkOptions
): Promise<LiveBenchmarkReport> {
  const provider = requiredLabel(options.provider, "provider", 128);
  const modelId = requiredLabel(options.modelId, "modelId");
  const repetitions = options.repetitions ?? 1;
  const concurrency = options.concurrency ?? 1;
  if (!Number.isInteger(repetitions) || repetitions < 1 || repetitions > 10) {
    throw new Error("repetitions must be an integer between 1 and 10.");
  }
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 8) {
    throw new Error("concurrency must be an integer between 1 and 8.");
  }
  const validatedCorpus = validateBenchmarkCorpus(corpus);
  const total = validatedCorpus.cases.length * repetitions;
  if (total > 5000) throw new Error("Benchmark run exceeds the 5000-trial safety limit.");
  const runId = requiredLabel(options.runId ?? randomUUID(), "runId", 128);
  const startedAt = validTimestamp(options.startedAt ?? new Date().toISOString(), "startedAt");
  const completed = new Array<LiveBenchmarkTrialEvidence>(total);
  let nextIndex = 0;

  const worker = async (): Promise<void> => {
    while (true) {
      const index = nextIndex++;
      if (index >= total) return;
      const repetition = Math.floor(index / validatedCorpus.cases.length);
      const benchmarkCase = validatedCorpus.cases[index % validatedCorpus.cases.length]!;
      const trialId = runId + ":" + String(index + 1);
      const task: Task = {
        id: trialId,
        title: "Benchmark " + benchmarkCase.id,
        description: benchmarkCase.prompt,
        kind: benchmarkCase.taskKind,
        requirementIds: [],
        dependsOn: [],
        context: JSON.stringify({
          benchmark: { corpusId: validatedCorpus.corpusId, corpusVersion: validatedCorpus.version, caseId: benchmarkCase.id, repetition: repetition + 1 },
          prompt: benchmarkCase.prompt,
          expectedCapabilities: benchmarkCase.expectedCapabilities
        }),
        contextRefs: [],
        status: "ready"
      };
      const started = Date.now();
      let status: LiveBenchmarkTrialEvidence["status"] = "failure";
      let output = "";
      let errors: string[] = [];
      let usage: LiveBenchmarkTrialEvidence["usage"] = {};
      let checked: Omit<BenchmarkCaseResult, "caseId"> = {
        passed: false, verifier: benchmarkCase.verifier.kind, reasons: ["execution-not-completed"]
      };
      try {
        const result = await executor.execute(task, provider, modelId);
        status = result.status;
        const rawOutput = typeof result.summary === "string" ? result.summary : "";
        const outputOverLimit = Buffer.byteLength(rawOutput, "utf8") > 100_000;
        const boundedOutput = outputOverLimit ? Buffer.from(rawOutput, "utf8").subarray(0, 90_000).toString("utf8") : rawOutput;
        const safe = redactPotentialSecrets(boundedOutput, { maxInputBytes: 100_000 });
        output = safe.text.slice(0, 100_000);
        errors = (result.errors ?? []).slice(0, 20).map((item) =>
          redactPotentialSecrets(String(item), { maxInputBytes: 2048 }).text.slice(0, 2048));
        usage = {
          ...((result.usage?.inputTokens ?? result.inputTokens) !== undefined ? { inputTokens: result.usage?.inputTokens ?? result.inputTokens } : {}),
          ...((result.usage?.outputTokens ?? result.outputTokens) !== undefined ? { outputTokens: result.usage?.outputTokens ?? result.outputTokens } : {}),
          ...((result.usage?.totalTokens ?? result.totalTokens) !== undefined ? { totalTokens: result.usage?.totalTokens ?? result.totalTokens } : {})
        };
        checked = status === "success"
          ? verifyBenchmarkOutput(benchmarkCase.verifier, output)
          : { passed: false, verifier: benchmarkCase.verifier.kind, reasons: ["provider-execution-" + status] };
        if (safe.changed) errors.push("Potential secrets were redacted from benchmark output.");
        if (outputOverLimit) checked = { passed: false, verifier: benchmarkCase.verifier.kind, reasons: ["output-over-limit"] };
      } catch (error) {
        status = "failure";
        errors = [redactPotentialSecrets(error instanceof Error ? error.message : "Unknown benchmark execution error.", { maxInputBytes: 2048 }).text.slice(0, 2048)];
        checked = { passed: false, verifier: benchmarkCase.verifier.kind, reasons: ["provider-execution-threw"] };
      }
      const latencyMs = Date.now() - started;
      completed[index] = {
        trialId, caseId: benchmarkCase.id, provider, modelId, status,
        passed: status === "success" && checked.passed,
        verifier: checked.verifier, reasons: checked.reasons, latencyMs,
        output, errors, usage
      };
    }
  };

  await Promise.all(Array.from({ length: Math.min(concurrency, total) }, () => worker()));
  const trials: LiveBenchmarkTrialEvidence[] = completed.map((item) => {
    if (!item) throw new Error("Benchmark worker completed without recording every trial.");
    return item;
  });
  const statisticalTrials: BenchmarkTrial[] = trials.map((trial) => ({
    trialId: trial.trialId,
    caseId: trial.caseId,
    provider: trial.provider,
    modelId: trial.modelId,
    passed: trial.passed,
    latencyMs: trial.latencyMs,
    ...(trial.usage.inputTokens !== undefined ? { inputTokens: trial.usage.inputTokens } : {}),
    ...(trial.usage.outputTokens !== undefined ? { outputTokens: trial.usage.outputTokens } : {})
  }));
  return {
    schemaVersion: 1,
    runId,
    corpusId: validatedCorpus.corpusId,
    corpusVersion: validatedCorpus.version,
    provider,
    modelId,
    startedAt,
    completedAt: new Date().toISOString(),
    repetitions,
    attemptedTrials: trials.length,
    passedTrials: trials.filter((trial) => trial.passed).length,
    failedTrials: trials.filter((trial) => !trial.passed).length,
    statistics: summarizeBenchmarkTrials(statisticalTrials, options.statistics),
    trials,
    limitations: [
      "This run records the selected adapter's reported result; it does not prove tool execution or independent real-world task completion.",
      "Corpus verifiers are deterministic checks and may not measure semantic correctness for every domain.",
      "Token counts are recorded only when the adapter returns them; missing usage is unknown, not zero.",
      "Evidence is returned to the caller but is not persisted automatically. The host must choose a secure, consent-aware evidence store and retention policy.",
      "A single model's results do not establish parity or superiority; comparisons require matched settings, repeated trials, and independent review."
    ]
  };
}
