import type { TaskKind } from "../models/registry.js";
import { evaluateRoutingBenchmark, type BenchmarkCase, type BenchmarkDecision, type BenchmarkReport } from "./evaluation.js";

export type BenchmarkVerifier =
  | { kind: "non-empty" }
  | { kind: "contains-all"; terms: string[] }
  | { kind: "contains-none"; terms: string[] }
  | { kind: "json-keys"; requiredKeys: string[] };
export interface VersionedBenchmarkCase extends BenchmarkCase { prompt: string; verifier: BenchmarkVerifier; }
export interface VersionedBenchmarkCorpus {
  schemaVersion: 1; corpusId: string; version: string; description: string; cases: VersionedBenchmarkCase[];
}
export interface BenchmarkOutput {
  caseId: string; output: string; provider?: string; modelId?: string;
  latencyMs?: number; inputTokens?: number; outputTokens?: number; cost?: number;
}
export interface BenchmarkCaseResult { caseId: string; passed: boolean; verifier: string; reasons: string[]; }
export interface BenchmarkRunReport { corpusId: string; corpusVersion: string; report: BenchmarkReport; results: BenchmarkCaseResult[]; }

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
function requireText(value: unknown, label: string, max: number): string {
  if (typeof value !== "string" || !value.trim() || value.length > max) throw new Error("Invalid benchmark " + label + ".");
  return value;
}

/** Validate a corpus before execution; duplicate IDs and unsupported verifier kinds fail closed. */
export function validateBenchmarkCorpus(value: unknown): VersionedBenchmarkCorpus {
  if (!isRecord(value) || value.schemaVersion !== 1 || !Array.isArray(value.cases) || value.cases.length < 1 || value.cases.length > 500) {
    throw new Error("Benchmark corpus must use schema version 1 and contain 1 to 500 cases.");
  }
  const corpusId = requireText(value.corpusId, "corpus ID", 128);
  const version = requireText(value.version, "version", 64);
  const description = requireText(value.description, "description", 2000);
  const ids = new Set<string>();
  const taskKinds: TaskKind[] = ["repository-analysis", "research", "planning", "coding", "review", "testing", "documentation", "general"];
  const cases: VersionedBenchmarkCase[] = value.cases.map((raw, index) => {
    if (!isRecord(raw)) throw new Error("Invalid benchmark case at index " + index + ".");
    const id = requireText(raw.id, "case ID", 128);
    if (ids.has(id)) throw new Error("Duplicate benchmark case ID: " + id);
    ids.add(id);
    if (!taskKinds.includes(raw.taskKind as TaskKind)) throw new Error("Unsupported task kind for case " + id + ".");
    if (!Array.isArray(raw.expectedCapabilities) || raw.expectedCapabilities.length > 64
      || raw.expectedCapabilities.some((item) => typeof item !== "string" || !item.trim() || item.length > 128)) {
      throw new Error("Invalid expected capabilities for case " + id + ".");
    }
    const prompt = requireText(raw.prompt, "prompt", 20_000);
    const weight = raw.weight === undefined ? 1 : raw.weight;
    if (typeof weight !== "number" || !Number.isFinite(weight) || weight <= 0 || weight > 1000) throw new Error("Invalid benchmark weight for case " + id + ".");
    if (!isRecord(raw.verifier) || typeof raw.verifier.kind !== "string") throw new Error("Missing verifier for case " + id + ".");
    let verifier: BenchmarkVerifier;
    if (raw.verifier.kind === "non-empty") verifier = { kind: "non-empty" };
    else if (raw.verifier.kind === "contains-all" || raw.verifier.kind === "contains-none") {
      if (!Array.isArray(raw.verifier.terms) || raw.verifier.terms.length < 1 || raw.verifier.terms.length > 64
        || raw.verifier.terms.some((term) => typeof term !== "string" || !term.trim() || term.length > 512)) {
        throw new Error("Invalid verifier terms for case " + id + ".");
      }
      verifier = { kind: raw.verifier.kind, terms: [...raw.verifier.terms] as string[] };
    } else if (raw.verifier.kind === "json-keys") {
      if (!Array.isArray(raw.verifier.requiredKeys) || raw.verifier.requiredKeys.length < 1 || raw.verifier.requiredKeys.length > 64
        || raw.verifier.requiredKeys.some((key) => typeof key !== "string" || !key.trim() || key.length > 128)) {
        throw new Error("Invalid JSON key verifier for case " + id + ".");
      }
      verifier = { kind: "json-keys", requiredKeys: [...raw.verifier.requiredKeys] as string[] };
    } else throw new Error("Unsupported verifier kind for case " + id + ".");
    return { id, taskKind: raw.taskKind as TaskKind, prompt, expectedCapabilities: [...raw.expectedCapabilities] as string[], weight, verifier };
  });
  return { schemaVersion: 1, corpusId, version, description, cases };
}

/** Deterministic verifier. It does not call a model or treat prose claims as execution evidence. */
export function verifyBenchmarkOutput(verifier: BenchmarkVerifier, output: string): Omit<BenchmarkCaseResult, "caseId"> {
  const reasons: string[] = [];
  if (typeof output !== "string" || output.length > 100_000) {
    return { passed: false, verifier: verifier.kind, reasons: ["output-missing-or-over-limit"] };
  }
  if (verifier.kind === "non-empty") {
    if (!output.trim()) reasons.push("output-is-empty");
  } else if (verifier.kind === "contains-all") {
    for (const term of verifier.terms) if (!output.toLocaleLowerCase().includes(term.toLocaleLowerCase())) reasons.push("missing-required-term:" + term);
  } else if (verifier.kind === "contains-none") {
    for (const term of verifier.terms) if (output.toLocaleLowerCase().includes(term.toLocaleLowerCase())) reasons.push("contains-forbidden-term:" + term);
  } else {
    let parsed: unknown;
    try { parsed = JSON.parse(output); } catch { reasons.push("output-is-not-valid-json"); }
    if (isRecord(parsed)) {
      for (const key of verifier.requiredKeys) if (!Object.hasOwn(parsed, key)) reasons.push("missing-json-key:" + key);
    } else if (parsed !== undefined) reasons.push("json-root-is-not-an-object");
  }
  return { passed: reasons.length === 0, verifier: verifier.kind, reasons };
}

export function evaluateBenchmarkOutputs(corpus: VersionedBenchmarkCorpus, outputs: readonly BenchmarkOutput[]): BenchmarkRunReport {
  const caseById = new Map(corpus.cases.map((item) => [item.id, item] as const));
  const decisions: BenchmarkDecision[] = [];
  const resultById = new Map<string, BenchmarkCaseResult>();
  const seenOutputIds = new Set<string>();
  for (const item of outputs) {
    const benchmarkCase = caseById.get(item.caseId);
    if (seenOutputIds.has(item.caseId)) {
      if (benchmarkCase) resultById.set(item.caseId, { caseId: item.caseId, passed: false,
        verifier: benchmarkCase.verifier.kind, reasons: ["duplicate-output"] });
      decisions.push({ caseId: item.caseId, eligibleCandidates: [], success: false,
        ...(item.latencyMs !== undefined ? { latencyMs: item.latencyMs } : {}),
        ...(item.inputTokens !== undefined ? { inputTokens: item.inputTokens } : {}),
        ...(item.outputTokens !== undefined ? { outputTokens: item.outputTokens } : {}),
        ...(item.cost !== undefined ? { cost: item.cost } : {}) });
      continue;
    }
    seenOutputIds.add(item.caseId);
    if (!benchmarkCase) {
      decisions.push({ caseId: item.caseId, eligibleCandidates: [], success: false,
        ...(item.latencyMs !== undefined ? { latencyMs: item.latencyMs } : {}),
        ...(item.inputTokens !== undefined ? { inputTokens: item.inputTokens } : {}),
        ...(item.outputTokens !== undefined ? { outputTokens: item.outputTokens } : {}),
        ...(item.cost !== undefined ? { cost: item.cost } : {}) });
      continue;
    }
    const checked = verifyBenchmarkOutput(benchmarkCase.verifier, item.output);
    resultById.set(item.caseId, { ...checked, caseId: item.caseId });
    decisions.push({ caseId: item.caseId, ...(item.provider ? { selectedProvider: item.provider } : {}),
      ...(item.modelId ? { selectedModelId: item.modelId } : {}), eligibleCandidates: [], success: checked.passed,
      ...(item.latencyMs !== undefined ? { latencyMs: item.latencyMs } : {}),
      ...(item.inputTokens !== undefined ? { inputTokens: item.inputTokens } : {}),
      ...(item.outputTokens !== undefined ? { outputTokens: item.outputTokens } : {}),
      ...(item.cost !== undefined ? { cost: item.cost } : {}) });
  }
  return { corpusId: corpus.corpusId, corpusVersion: corpus.version, report: evaluateRoutingBenchmark(corpus.cases, decisions),
    results: corpus.cases.map((item) => resultById.get(item.id) ?? { caseId: item.id, passed: false, verifier: item.verifier.kind, reasons: ["missing-output"] }) };
}
