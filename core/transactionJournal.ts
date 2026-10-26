import { createHash, randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { lstat, mkdir, open, readFile, unlink } from "node:fs/promises";
import { dirname, resolve } from "node:path";

export type TransactionPhase =
  | "prepared"
  | "applying"
  | "apply-failed"
  | "applied"
  | "verification-passed"
  | "verification-failed"
  | "rollback-started"
  | "rolled-back"
  | "committed"
  | "recovery-required";

export interface TransactionJournalEvent {
  transactionId: string;
  phase: TransactionPhase;
  at?: string;
  details?: Record<string, string | number | boolean | null | string[]>;
}

export interface TransactionJournalRecord extends TransactionJournalEvent {
  schemaVersion: 1;
  sequence: number;
  previousHash: string | null;
  hash: string;
}

export interface TransactionJournalReadReport {
  valid: boolean;
  records: TransactionJournalRecord[];
  warnings: string[];
  errors: string[];
  trailingPartialLine: boolean;
}

export interface RecoverableTransaction {
  transactionId: string;
  lastPhase: TransactionPhase;
  lastSequence: number;
  lastUpdatedAt: string;
  details: Record<string, string | number | boolean | null | string[]>;
  recoveryRequired: true;
}

export interface TransactionJournal {
  append(event: TransactionJournalEvent): Promise<TransactionJournalRecord>;
}

const GENESIS = null;
const MAX_JOURNAL_BYTES = 16 * 1024 * 1024;
const MAX_LINE_BYTES = 64 * 1024;
const MAX_RECORDS = 100_000;
const TERMINAL_PHASES = new Set<TransactionPhase>(["apply-failed", "rolled-back", "committed"]);
const PHASES = new Set<TransactionPhase>([
  "prepared", "applying", "apply-failed", "applied", "verification-passed",
  "verification-failed", "rollback-started", "rolled-back", "committed", "recovery-required"
]);

function canonical(value: unknown): string {
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  if (typeof value === "object" && value !== null) {
    const object = value as Record<string, unknown>;
    return "{" + Object.keys(object).sort().map((key) => JSON.stringify(key) + ":" + canonical(object[key])).join(",") + "}";
  }
  return JSON.stringify(value) ?? "null";
}

function hashRecord(record: Omit<TransactionJournalRecord, "hash">): string {
  return createHash("sha256").update(canonical(record), "utf8").digest("hex");
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isSafeEvent(event: TransactionJournalEvent): boolean {
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/.test(event.transactionId)) return false;
  if (!PHASES.has(event.phase)) return false;
  if (event.at !== undefined && (!Number.isFinite(Date.parse(event.at)) || event.at.length > 64)) return false;
  if (event.details === undefined) return true;
  if (!isObject(event.details) || Object.keys(event.details).length > 64) return false;
  for (const [key, value] of Object.entries(event.details)) {
    if (!/^[A-Za-z][A-Za-z0-9_.-]{0,63}$/.test(key)) return false;
    if (typeof value === "string" && Buffer.byteLength(value, "utf8") > 4096) return false;
    if (Array.isArray(value) && (value.length > 200 || value.some((item) => typeof item !== "string" || Buffer.byteLength(item, "utf8") > 1024))) return false;
    if (!(value === null || typeof value === "string" || typeof value === "number" && Number.isFinite(value) || typeof value === "boolean" || Array.isArray(value))) return false;
  }
  return true;
}

/**
 * Append-only, hash-chained JSONL journal. Store it in a trusted local metadata
 * directory, not in a model-writable workspace path. It records metadata only.
 * A hash chain detects accidental/tampered records but is not a signature.
 */
export class JsonlTransactionJournal implements TransactionJournal {
  readonly filePath: string;
  readonly lockPath: string;

  constructor(filePath: string) {
    this.filePath = resolve(filePath);
    this.lockPath = this.filePath + ".lock";
  }

  async append(event: TransactionJournalEvent): Promise<TransactionJournalRecord> {
    if (!isSafeEvent(event)) throw new Error("Invalid transaction journal event.");
    await mkdir(dirname(this.filePath), { recursive: true, mode: 0o700 });
    return this.withLock(async () => {
      const report = await this.readUnlocked(true);
      if (!report.valid) throw new Error("Transaction journal integrity check failed: " + report.errors.join("; "));
      if (report.records.length >= MAX_RECORDS) throw new Error("Transaction journal record limit reached.");
      const previous = report.records.at(-1);
      const base: Omit<TransactionJournalRecord, "hash"> = {
        schemaVersion: 1,
        sequence: (previous?.sequence ?? 0) + 1,
        transactionId: event.transactionId,
        phase: event.phase,
        at: event.at ?? new Date().toISOString(),
        details: event.details ? structuredClone(event.details) : {},
        previousHash: previous?.hash ?? GENESIS
      };
      const record: TransactionJournalRecord = { ...base, hash: hashRecord(base) };
      const line = JSON.stringify(record) + "\n";
      if (Buffer.byteLength(line, "utf8") > MAX_LINE_BYTES) throw new Error("Transaction journal record exceeds the line limit.");
      const existingBytes = await this.fileSize();
      if (existingBytes + Buffer.byteLength(line, "utf8") > MAX_JOURNAL_BYTES) throw new Error("Transaction journal size limit reached.");
      const flags = constants.O_WRONLY | constants.O_CREAT | constants.O_APPEND | (constants.O_NOFOLLOW ?? 0);
      const handle = await open(this.filePath, flags, 0o600);
      try {
        await handle.chmod(0o600).catch(() => undefined);
        await handle.writeFile(line, "utf8");
        await handle.sync();
      } finally {
        await handle.close();
      }
      return record;
    });
  }

  async read(): Promise<TransactionJournalReadReport> {
    return this.readUnlocked(false);
  }

  async listRecoverableTransactions(): Promise<{ valid: boolean; transactions: RecoverableTransaction[]; errors: string[]; warnings: string[] }> {
    const report = await this.read();
    if (!report.valid) return { valid: false, transactions: [], errors: report.errors, warnings: report.warnings };
    const latest = new Map<string, TransactionJournalRecord>();
    for (const record of report.records) latest.set(record.transactionId, record);
    const transactions = [...latest.values()]
      .filter((record) => !TERMINAL_PHASES.has(record.phase))
      .map((record) => ({
        transactionId: record.transactionId,
        lastPhase: record.phase,
        lastSequence: record.sequence,
        lastUpdatedAt: record.at ?? "",
        details: record.details ?? {},
        recoveryRequired: true as const
      }))
      .sort((a, b) => a.lastSequence - b.lastSequence);
    return { valid: true, transactions, errors: [], warnings: report.warnings };
  }

  private async fileSize(): Promise<number> {
    try {
      const stat = await lstat(this.filePath);
      if (stat.isSymbolicLink() || !stat.isFile()) throw new Error("Transaction journal path must be a regular non-symlink file.");
      return stat.size;
    } catch (error) {
      if (isObject(error) && error.code === "ENOENT") return 0;
      throw error;
    }
  }

  private async readUnlocked(repairTrailingPartial: boolean): Promise<TransactionJournalReadReport> {
    const warnings: string[] = [];
    const errors: string[] = [];
    let bytes: Buffer;
    try {
      const flags = constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0);
      const handle = await open(this.filePath, flags);
      try {
        const stat = await handle.stat();
        if (!stat.isFile()) {
          return { valid: false, records: [], warnings, errors: ["Journal path is not a regular file."], trailingPartialLine: false };
        }
        if (stat.size > MAX_JOURNAL_BYTES) {
          return { valid: false, records: [], warnings, errors: ["Journal exceeds the configured size limit."], trailingPartialLine: false };
        }
        bytes = await handle.readFile();
      } finally {
        await handle.close();
      }
    } catch (error) {
      if (isObject(error) && error.code === "ENOENT") return { valid: true, records: [], warnings, errors, trailingPartialLine: false };
      return { valid: false, records: [], warnings, errors: ["Could not safely read transaction journal."], trailingPartialLine: false };
    }
    const completeLength = bytes.lastIndexOf(10) + 1;
    const trailingPartialLine = completeLength !== bytes.length;
    if (trailingPartialLine) {
      warnings.push("Journal ends with an incomplete record; it was not treated as committed.");
      if (repairTrailingPartial) {
        const handle = await open(this.filePath, constants.O_RDWR | (constants.O_NOFOLLOW ?? 0));
        try { await handle.truncate(completeLength); await handle.sync(); } finally { await handle.close(); }
        bytes = bytes.subarray(0, completeLength);
      } else {
        bytes = bytes.subarray(0, completeLength);
      }
    }
    const lines = bytes.toString("utf8").split("\n").filter((line) => line.length > 0);
    if (lines.length > MAX_RECORDS) return { valid: false, records: [], warnings, errors: ["Journal exceeds the record count limit."], trailingPartialLine };
    const records: TransactionJournalRecord[] = [];
    let previousHash: string | null = GENESIS;
    for (let index = 0; index < lines.length; index++) {
      const line = lines[index]!;
      if (Buffer.byteLength(line, "utf8") > MAX_LINE_BYTES) {
        errors.push("Journal record " + (index + 1) + " exceeds the line limit.");
        break;
      }
      let value: unknown;
      try { value = JSON.parse(line); } catch {
        errors.push("Journal record " + (index + 1) + " is malformed JSON.");
        break;
      }
      if (!isObject(value) || value.schemaVersion !== 1 || value.sequence !== index + 1 ||
          typeof value.transactionId !== "string" || typeof value.phase !== "string" ||
          !PHASES.has(value.phase as TransactionPhase) || typeof value.at !== "string" ||
          !(value.previousHash === null || typeof value.previousHash === "string") ||
          typeof value.hash !== "string" || !/^[a-f0-9]{64}$/.test(value.hash)) {
        errors.push("Journal record " + (index + 1) + " has an invalid schema.");
        break;
      }
      const record = value as unknown as TransactionJournalRecord;
      if (record.previousHash !== previousHash) {
        errors.push("Journal hash chain is broken at record " + record.sequence + ".");
        break;
      }
      const { hash, ...base } = record;
      if (hashRecord(base) !== hash) {
        errors.push("Journal record hash mismatch at record " + record.sequence + ".");
        break;
      }
      if (!isSafeEvent(record)) {
        errors.push("Journal record " + record.sequence + " contains invalid event data.");
        break;
      }
      records.push(record);
      previousHash = record.hash;
    }
    return { valid: errors.length === 0, records, warnings, errors, trailingPartialLine };
  }

  private async withLock<T>(fn: () => Promise<T>): Promise<T> {
    const deadline = Date.now() + 2500;
    let lockHandle;
    while (!lockHandle) {
      try {
        lockHandle = await open(this.lockPath, "wx", 0o600);
        await lockHandle.writeFile(JSON.stringify({ pid: process.pid, hostname: process.env.HOSTNAME ?? process.env.COMPUTERNAME ?? "unknown", createdAt: new Date().toISOString() }));
        await lockHandle.sync();
      } catch (error) {
        if (!isObject(error) || error.code !== "EEXIST") throw error;
        await this.removeDeadLocalLock();
        if (Date.now() >= deadline) throw new Error("Transaction journal is locked by another writer.");
        await new Promise((resolveWait) => setTimeout(resolveWait, 40));
      }
    }
    try {
      return await fn();
    } finally {
      await lockHandle.close();
      try { await unlink(this.lockPath); } catch { /* Lock cleanup can be retried on next append. */ }
    }
  }

  private async removeDeadLocalLock(): Promise<void> {
    try {
      const raw = await readFile(this.lockPath, "utf8");
      const value: unknown = JSON.parse(raw);
      if (!isObject(value) || value.hostname !== (process.env.HOSTNAME ?? process.env.COMPUTERNAME ?? "unknown") ||
          !Number.isSafeInteger(value.pid) || (value.pid as number) < 1) return;
      try {
        process.kill(value.pid as number, 0);
      } catch (error) {
        if (isObject(error) && error.code === "ESRCH") await unlink(this.lockPath);
      }
    } catch {
      // A malformed or foreign lock is never removed automatically.
    }
  }
}

export function createTransactionId(): string {
  return randomUUID();
}
