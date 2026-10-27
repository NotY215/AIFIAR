import { constants } from "node:fs";
import { mkdir, lstat, open, readFile, rename, unlink } from "node:fs/promises";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import type { ProviderTelemetryEvent } from "../models/providerTelemetry.js";

export interface DurableTelemetryPolicy {
  enabled: boolean;
  consentGranted: boolean;
  directory: string;
  retentionMs: number;
  maxEvents?: number;
  maxBytes?: number;
  now?: () => number;
}
export interface PersistedTelemetryRecord { recordedAt: string; event: ProviderTelemetryEvent; }
const MAX_RECORD_BYTES = 16 * 1024;
const DEFAULT_MAX_EVENTS = 10_000;
const DEFAULT_MAX_BYTES = 5 * 1024 * 1024;

function boundedText(value: unknown, label: string, max = 128): string {
  if (typeof value !== "string" || !value.trim() || value.length > max) throw new Error("Invalid telemetry " + label + ".");
  return value;
}
function nonNegative(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) throw new Error("Invalid telemetry " + label + ".");
  return value;
}

/** Allowlist-only serialization: arbitrary extra fields, prompts, outputs and credentials are never persisted. */
export function normalizeTelemetryEvent(event: ProviderTelemetryEvent): ProviderTelemetryEvent {
  if (!event || typeof event !== "object") throw new Error("Telemetry event must be an object.");
  if (event.outcome !== "success" && event.outcome !== "failure") throw new Error("Invalid telemetry outcome.");
  if (!Number.isInteger(event.attempt) || event.attempt < 1 || event.attempt > 1000) throw new Error("Invalid telemetry attempt.");
  const normalized: ProviderTelemetryEvent = {
    provider: boundedText(event.provider, "provider"),
    modelId: boundedText(event.modelId, "model ID"),
    outcome: event.outcome,
    elapsedMs: nonNegative(event.elapsedMs, "elapsed time"),
    attempt: event.attempt
  };
  if (event.status !== undefined) {
    if (!Number.isInteger(event.status) || event.status < 100 || event.status > 599) throw new Error("Invalid telemetry status.");
    normalized.status = event.status;
  }
  for (const field of ["inputTokens", "outputTokens", "totalTokens", "estimatedCost"] as const) {
    if (event[field] !== undefined) {
      const value = nonNegative(event[field], field);
      if (field === "inputTokens") normalized.inputTokens = value;
      else if (field === "outputTokens") normalized.outputTokens = value;
      else if (field === "totalTokens") normalized.totalTokens = value;
      else normalized.estimatedCost = value;
    }
  }
  if (event.estimatedCost !== undefined) {
    normalized.costCurrency = boundedText(event.costCurrency, "cost currency", 12);
    normalized.rateCardVerifiedAt = boundedText(event.rateCardVerifiedAt, "rate-card verification timestamp", 64);
    if (!Number.isFinite(Date.parse(normalized.rateCardVerifiedAt))) throw new Error("Invalid rate-card verification timestamp.");
  } else if (event.costCurrency !== undefined || event.rateCardVerifiedAt !== undefined) {
    throw new Error("Cost metadata requires an estimated cost.");
  }
  if (event.rateLimit !== undefined) {
    const source = event.rateLimit;
    const rateLimit: NonNullable<ProviderTelemetryEvent["rateLimit"]> = {};
    for (const field of ["limit", "remaining", "retryAfterMs"] as const) {
      if (source[field] !== undefined) rateLimit[field] = nonNegative(source[field], "rate-limit " + field);
    }
    if (source.reset !== undefined) rateLimit.reset = boundedText(source.reset, "rate-limit reset", 128);
    normalized.rateLimit = rateLimit;
  }
  return normalized;
}

/** Opt-in JSONL persistence with consent, retention, bounds, restrictive modes, and serialized writes. */
export class DurableTelemetryStore {
  private readonly directory: string;
  private readonly filePath: string;
  private readonly now: () => number;
  private readonly maxEvents: number;
  private readonly maxBytes: number;
  private tail: Promise<unknown> = Promise.resolve();

  constructor(private readonly policy: DurableTelemetryPolicy) {
    if (!policy.directory?.trim()) throw new Error("A host-owned telemetry directory is required.");
    if (!Number.isFinite(policy.retentionMs) || policy.retentionMs < 60_000 || policy.retentionMs > 365 * 24 * 60 * 60 * 1000) {
      throw new Error("retentionMs must be between one minute and one year.");
    }
    this.maxEvents = policy.maxEvents ?? DEFAULT_MAX_EVENTS;
    this.maxBytes = policy.maxBytes ?? DEFAULT_MAX_BYTES;
    if (!Number.isInteger(this.maxEvents) || this.maxEvents < 1 || this.maxEvents > 100_000) throw new Error("maxEvents must be between 1 and 100000.");
    if (!Number.isInteger(this.maxBytes) || this.maxBytes < 4096 || this.maxBytes > 50 * 1024 * 1024) throw new Error("maxBytes must be between 4 KiB and 50 MiB.");
    this.now = policy.now ?? Date.now;
    this.directory = resolve(policy.directory);
    this.filePath = join(this.directory, "provider-telemetry.jsonl");
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const current = this.tail.then(operation, operation);
    this.tail = current.then(() => undefined, () => undefined);
    return current;
  }

  append(event: ProviderTelemetryEvent): Promise<boolean> {
    return this.enqueue(async () => {
      if (!this.policy.enabled || !this.policy.consentGranted) return false;
      const safeEvent = normalizeTelemetryEvent(event);
      const line = JSON.stringify({ recordedAt: new Date(this.now()).toISOString(), event: safeEvent } satisfies PersistedTelemetryRecord) + "\n";
      if (Buffer.byteLength(line, "utf8") > MAX_RECORD_BYTES) return false;
      await this.ensureDirectory();
      await this.compactUnlocked();
      const flags = constants.O_APPEND | constants.O_CREAT | constants.O_WRONLY | (constants.O_NOFOLLOW ?? 0);
      const handle = await open(this.filePath, flags, 0o600);
      try { await handle.writeFile(line, { encoding: "utf8" }); await handle.sync(); }
      finally { await handle.close(); }
      await this.compactUnlocked();
      return true;
    });
  }

  read(): Promise<PersistedTelemetryRecord[]> {
    return this.enqueue(async () => {
      if (!this.policy.enabled || !this.policy.consentGranted) return [];
      await this.ensureDirectory();
      await this.compactUnlocked();
      return (await this.readBoundedFile()).split("\n").filter(Boolean).flatMap((line) => {
        try {
          const item = JSON.parse(line) as PersistedTelemetryRecord;
          if (!item || typeof item.recordedAt !== "string" || !item.event) return [];
          return [{ recordedAt: item.recordedAt, event: normalizeTelemetryEvent(item.event) }];
        } catch { return []; }
      });
    });
  }

  clear(): Promise<void> {
    return this.enqueue(async () => {
      await this.ensureDirectory();
      try {
        const info = await lstat(this.filePath);
        if (info.isSymbolicLink() || !info.isFile()) throw new Error("Telemetry path must be a regular file, not a symlink.");
        await unlink(this.filePath);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
    });
  }

  private async ensureDirectory(): Promise<void> {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    const info = await lstat(this.directory);
    if (info.isSymbolicLink() || !info.isDirectory()) throw new Error("Telemetry directory must be a real directory, not a symlink.");
  }

  private async readBoundedFile(): Promise<string> {
    try {
      const info = await lstat(this.filePath);
      if (info.isSymbolicLink() || !info.isFile()) throw new Error("Telemetry path must be a regular file, not a symlink.");
      if (info.size > this.maxBytes + MAX_RECORD_BYTES) throw new Error("Telemetry file exceeds the bounded compaction window.");
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
    const records: Array<{ line: string }> = [];
    for (const line of raw.split("\n").filter(Boolean)) {
      try {
        const parsed = JSON.parse(line) as PersistedTelemetryRecord;
        const time = Date.parse(parsed.recordedAt);
        if (!Number.isFinite(time) || time < cutoff || !parsed.event) continue;
        const event = normalizeTelemetryEvent(parsed.event);
        records.push({ line: JSON.stringify({ recordedAt: new Date(time).toISOString(), event }) + "\n" });
      } catch { /* Drop malformed/truncated records during compaction. */ }
    }
    let retained = records.slice(-this.maxEvents);
    let bytes = retained.reduce((sum, item) => sum + Buffer.byteLength(item.line, "utf8"), 0);
    while (retained.length && bytes > this.maxBytes) {
      const removed = retained.shift()!;
      bytes -= Buffer.byteLength(removed.line, "utf8");
    }
    const content = retained.map((item) => item.line).join("");
    if (content === raw) return;
    const temporary = this.filePath + "." + randomUUID() + ".tmp";
    const handle = await open(temporary, "wx", 0o600);
    try { await handle.writeFile(content, "utf8"); await handle.sync(); }
    finally { await handle.close(); }
    await rename(temporary, this.filePath);
  }
}
