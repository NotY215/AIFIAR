import { createHash, randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { mkdir, lstat, open, readFile, rename, unlink } from "node:fs/promises";
import { join, resolve } from "node:path";
import { redactPotentialSecrets } from "./secretRedaction.js";
import type { LiveBenchmarkReport, LiveBenchmarkTrialEvidence } from "./liveBenchmarkRunner.js";

export interface BenchmarkEvidenceStorePolicy {
  enabled: boolean;
  consentGranted: boolean;
  directory: string;
  retentionMs: number;
  maxRuns?: number;
  maxBytes?: number;
  now?: () => number;
}

export interface PersistedBenchmarkEvidence {
  recordedAt: string;
  digest: string;
  report: LiveBenchmarkReport;
}

const MAX_RUN_BYTES = 512 * 1024;
const DEFAULT_MAX_RUNS = 100;
const DEFAULT_MAX_BYTES = 10 * 1024 * 1024;
const HASH = /^[a-f0-9]{64}$/;

function boundedString(value: unknown, label: string, max = 256): string {
  if (typeof value !== "string" || !value.trim() || value.length > max) {
    throw new Error("Invalid benchmark evidence " + label + ".");
  }
  return value.trim();
}
function finiteNonNegative(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new Error("Invalid benchmark evidence " + label + ".");
  }
  return value;
}
function normalizeTrial(trial: LiveBenchmarkTrialEvidence): LiveBenchmarkTrialEvidence {
  if (!trial || typeof trial !== "object") throw new Error("Invalid benchmark trial.");
  if (!["success", "failure", "skipped"].includes(trial.status)) throw new Error("Invalid benchmark trial status.");
  if (typeof trial.passed !== "boolean") throw new Error("Invalid benchmark trial outcome.");
  const outputInput = typeof trial.output === "string" ? trial.output : "";
  const boundedOutput = Buffer.from(outputInput, "utf8").subarray(0, 50_000).toString("utf8");
  const output = redactPotentialSecrets(boundedOutput, { maxInputBytes: 200_000 }).text.slice(0, 20_000);
  const errors = Array.isArray(trial.errors) ? trial.errors.slice(0, 20).map((value) =>
    redactPotentialSecrets(String(value).slice(0, 2048), { maxInputBytes: 8192 }).text.slice(0, 1024)) : [];
  const usage: LiveBenchmarkTrialEvidence["usage"] = {};
  for (const field of ["inputTokens", "outputTokens", "totalTokens"] as const) {
    const value = trial.usage?.[field];
    if (value !== undefined) {
      if (!Number.isInteger(value) || value < 0 || value > 1_000_000_000) throw new Error("Invalid benchmark token usage.");
      usage[field] = value;
    }
  }
  return {
    trialId: boundedString(trial.trialId, "trial ID", 256),
    caseId: boundedString(trial.caseId, "case ID", 256),
    provider: boundedString(trial.provider, "provider", 128),
    modelId: boundedString(trial.modelId, "model ID", 256),
    status: trial.status,
    passed: trial.passed,
    verifier: boundedString(trial.verifier, "verifier", 128),
    reasons: Array.isArray(trial.reasons) ? trial.reasons.slice(0, 30).map(x => boundedString(String(x), "reason", 512)) : [],
    latencyMs: finiteNonNegative(trial.latencyMs, "latency"),
    output,
    errors,
    usage
  };
}

/** Creates a bounded, secret-redacted evidence snapshot; prompts and credentials are never persisted. */
export function normalizeBenchmarkReport(report: LiveBenchmarkReport): LiveBenchmarkReport {
  if (!report || typeof report !== "object" || report.schemaVersion !== 1) throw new Error("Unsupported benchmark report schema.");
  const trials = Array.isArray(report.trials) ? report.trials.map(normalizeTrial) : [];
  if (trials.length > 5000) throw new Error("Benchmark report exceeds the trial limit.");
  const runId = boundedString(report.runId, "run ID", 128);
  const provider = boundedString(report.provider, "provider", 128);
  const modelId = boundedString(report.modelId, "model ID", 256);
  const startedAt = new Date(report.startedAt);
  const completedAt = new Date(report.completedAt);
  if (!Number.isFinite(startedAt.getTime()) || !Number.isFinite(completedAt.getTime()) || completedAt < startedAt) {
    throw new Error("Invalid benchmark report timestamps.");
  }
  if (new Set(trials.map(t => t.trialId)).size !== trials.length) throw new Error("Benchmark report contains duplicate trial IDs.");
  if (trials.some(t => t.provider !== provider || t.modelId !== modelId)) throw new Error("Trial provider/model does not match report.");
  const passedTrials = trials.filter(t => t.passed).length;
  const failedTrials = trials.length - passedTrials;
  if (report.attemptedTrials !== trials.length || report.passedTrials !== passedTrials || report.failedTrials !== failedTrials) {
    throw new Error("Benchmark report counts do not match trial evidence.");
  }
  return {
    schemaVersion: 1,
    runId,
    corpusId: boundedString(report.corpusId, "corpus ID", 128),
    corpusVersion: boundedString(report.corpusVersion, "corpus version", 128),
    provider,
    modelId,
    startedAt: startedAt.toISOString(),
    completedAt: completedAt.toISOString(),
    repetitions: Number.isInteger(report.repetitions) && report.repetitions >= 1 && report.repetitions <= 10 ? report.repetitions : (() => { throw new Error("Invalid repetitions."); })(),
    attemptedTrials: trials.length,
    passedTrials,
    failedTrials,
    statistics: [],
    trials,
    limitations: [...(Array.isArray(report.limitations) ? report.limitations.slice(0, 29).map(x => boundedString(String(x), "limitation", 1024)) : []), "Stored statistical summaries are omitted; recompute them from the verified trial evidence."]
  };
}

function digestReport(recordedAt: string, report: LiveBenchmarkReport): string {
  return createHash("sha256").update(JSON.stringify({ recordedAt, report })).digest("hex");
}
function normalizePersisted(value: unknown): PersistedBenchmarkEvidence | null {
  try {
    if (!value || typeof value !== "object") return null;
    const item = value as PersistedBenchmarkEvidence;
    if (typeof item.recordedAt !== "string" || !Number.isFinite(Date.parse(item.recordedAt)) || typeof item.digest !== "string" || !HASH.test(item.digest)) return null;
    const report = normalizeBenchmarkReport(item.report);
    const recordedAt = new Date(item.recordedAt).toISOString();
    if (digestReport(recordedAt, report) !== item.digest) return null;
    return { recordedAt, digest: item.digest, report };
  } catch { return null; }
}

/**
 * Host-owned opt-in JSONL evidence store. Callers must obtain consent and approve provider costs
 * before running models; this store only persists bounded, redacted reports.
 */
export class BenchmarkEvidenceStore {
  private readonly directory: string;
  private readonly filePath: string;
  private readonly now: () => number;
  private readonly maxRuns: number;
  private readonly maxBytes: number;
  private tail: Promise<unknown> = Promise.resolve();

  constructor(private readonly policy: BenchmarkEvidenceStorePolicy) {
    if (!policy.directory?.trim()) throw new Error("A host-owned evidence directory is required.");
    if (!Number.isFinite(policy.retentionMs) || policy.retentionMs < 60_000 || policy.retentionMs > 365 * 24 * 60 * 60 * 1000) {
      throw new Error("retentionMs must be between one minute and one year.");
    }
    this.maxRuns = policy.maxRuns ?? DEFAULT_MAX_RUNS;
    this.maxBytes = policy.maxBytes ?? DEFAULT_MAX_BYTES;
    if (!Number.isInteger(this.maxRuns) || this.maxRuns < 1 || this.maxRuns > 10_000) throw new Error("maxRuns must be between 1 and 10000.");
    if (!Number.isInteger(this.maxBytes) || this.maxBytes < 4096 || this.maxBytes > 100 * 1024 * 1024) throw new Error("maxBytes must be between 4 KiB and 100 MiB.");
    this.now = policy.now ?? Date.now;
    this.directory = resolve(policy.directory);
    this.filePath = join(this.directory, "benchmark-evidence.jsonl");
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const current = this.tail.then(operation, operation);
    this.tail = current.then(() => undefined, () => undefined);
    return current;
  }

  append(report: LiveBenchmarkReport): Promise<boolean> {
    return this.enqueue(async () => {
      if (!this.policy.enabled || !this.policy.consentGranted) return false;
      const safeReport = normalizeBenchmarkReport(report);
      const recordedAt = new Date(this.now()).toISOString();
      const record: PersistedBenchmarkEvidence = {
        recordedAt,
        report: safeReport,
        digest: digestReport(recordedAt, safeReport)
      };
      const line = JSON.stringify(record) + "\n";
      if (Buffer.byteLength(line, "utf8") > MAX_RUN_BYTES) throw new Error("Normalized benchmark evidence exceeds the per-run storage limit.");
      await this.ensureDirectory();
      await this.compactUnlocked();
      const existing = (await this.readBoundedFile()).split("\\n").filter(Boolean);
      for (const line of existing) {
        try {
          const stored = normalizePersisted(JSON.parse(line));
          if (stored?.report.runId === safeReport.runId) throw new Error("Benchmark evidence run ID already exists.");
        } catch (error) {
          if (error instanceof Error && error.message === "Benchmark evidence run ID already exists.") throw error;
        }
      }
      const flags = constants.O_APPEND | constants.O_CREAT | constants.O_WRONLY | (constants.O_NOFOLLOW ?? 0);
      const handle = await open(this.filePath, flags, 0o600);
      try { await handle.writeFile(line, "utf8"); await handle.sync(); }
      finally { await handle.close(); }
      await this.compactUnlocked();
      return true;
    });
  }

  read(): Promise<PersistedBenchmarkEvidence[]> {
    return this.enqueue(async () => {
      if (!this.policy.enabled || !this.policy.consentGranted) return [];
      await this.ensureDirectory();
      await this.compactUnlocked();
      return (await this.readBoundedFile()).split("\n").filter(Boolean).flatMap(line => {
        try {
          const parsed = normalizePersisted(JSON.parse(line));
          return parsed ? [parsed] : [];
        } catch { return []; }
      });
    });
  }

  clear(): Promise<void> {
    return this.enqueue(async () => {
      await this.ensureDirectory();
      try {
        const info = await lstat(this.filePath);
        if (info.isSymbolicLink() || !info.isFile()) throw new Error("Evidence path must be a regular file, not a symlink.");
        await unlink(this.filePath);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
    });
  }

  private async ensureDirectory(): Promise<void> {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    const info = await lstat(this.directory);
    if (info.isSymbolicLink() || !info.isDirectory()) throw new Error("Evidence directory must be a real directory, not a symlink.");
  }

  private async readBoundedFile(): Promise<string> {
    try {
      const info = await lstat(this.filePath);
      if (info.isSymbolicLink() || !info.isFile()) throw new Error("Evidence path must be a regular file, not a symlink.");
      if (info.size > this.maxBytes + MAX_RUN_BYTES) throw new Error("Evidence file exceeds the bounded compaction window.");
      return await readFile(this.filePath, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return "";
      throw error;
    }
  }

  private async compactUnlocked(): Promise<void> {
    const raw = await this.readBoundedFile();
    if (!raw) return;
    const cutoff = this.now() - this.policy.retentionMs;
    const records: PersistedBenchmarkEvidence[] = [];
    for (const line of raw.split("\n").filter(Boolean)) {
      try {
        const item = normalizePersisted(JSON.parse(line));
        if (item && Date.parse(item.recordedAt) >= cutoff) records.push(item);
      } catch { /* Drop malformed, truncated, or digest-invalid records. */ }
    }
    const seen = new Set<string>();
    const unique = records.filter(item => {
      if (seen.has(item.report.runId)) return false;
      seen.add(item.report.runId);
      return true;
    }).slice(-this.maxRuns);
    let retained = unique;
    let bytes = retained.reduce((sum, item) => sum + Buffer.byteLength(JSON.stringify(item) + "\n", "utf8"), 0);
    while (retained.length && bytes > this.maxBytes) {
      const removed = retained.shift()!;
      bytes -= Buffer.byteLength(JSON.stringify(removed) + "\n", "utf8");
    }
    const content = retained.map(item => JSON.stringify(item) + "\n").join("");
    if (content === raw) return;
    const temporary = this.filePath + "." + randomUUID() + ".tmp";
    const handle = await open(temporary, "wx", 0o600);
    try { await handle.writeFile(content, "utf8"); await handle.sync(); }
    finally { await handle.close(); }
    await rename(temporary, this.filePath);
  }
}
