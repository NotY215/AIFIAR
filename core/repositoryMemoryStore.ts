import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import type { RepositorySnapshot } from "./freshnessEngine.js";
import type { ProjectFileSummary } from "./types.js";
import type { SymbolIndex } from "./symbolIndex.js";

export interface RepositoryMemoryRecord {
  schemaVersion: 1;
  repositoryId: string;
  updatedAt: string;
  snapshot: RepositorySnapshot;
  summaries: ProjectFileSummary[];
  symbolIndex: SymbolIndex;
}
export interface RepositoryMemoryStore {
  load(repositoryId: string): Promise<RepositoryMemoryRecord | null>;
  save(record: RepositoryMemoryRecord): Promise<void>;
}
const MAX_BYTES = 32 * 1024 * 1024;
const MAX_FILES = 200_000;
function validPath(path: unknown): path is string {
  return typeof path === "string" && !!path.trim() && !path.startsWith("/") && !path.includes("\\") && !path.split("/").some((part) => !part || part === "." || part === "..");
}
export function validateRepositoryMemory(value: unknown): value is RepositoryMemoryRecord {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  if (record.schemaVersion !== 1 || typeof record.repositoryId !== "string" || !record.repositoryId.trim() || typeof record.updatedAt !== "string" || !Number.isFinite(Date.parse(record.updatedAt))) return false;
  if (!record.snapshot || typeof record.snapshot !== "object" || !Array.isArray((record.snapshot as Record<string, unknown>).files) || (record.snapshot as RepositorySnapshot).repositoryId !== record.repositoryId) return false;
  const snapshot = record.snapshot as RepositorySnapshot;
  if (snapshot.files.length > MAX_FILES || !Number.isFinite(Date.parse(snapshot.scannedAt))) return false;
  const seen = new Set<string>();
  for (const file of snapshot.files) {
    if (!validPath(file.path) || !/^[a-f0-9]{64}$/i.test(file.contentHash) || !Number.isSafeInteger(file.sizeBytes) || file.sizeBytes < 0 || seen.has(file.path)) return false;
    seen.add(file.path);
  }
  if (!Array.isArray(record.summaries) || record.summaries.length > MAX_FILES) return false;
  for (const summary of record.summaries) {
    if (!summary || !validPath(summary.path) || typeof summary.purpose !== "string" || typeof summary.lastObservedAt !== "string" || (summary.generatedAt !== undefined && (typeof summary.generatedAt !== "string" || !Number.isFinite(Date.parse(summary.generatedAt)))) || (summary.contentHash !== undefined && !/^[a-f0-9]{64}$/i.test(summary.contentHash))) return false;
  }
  const index = record.symbolIndex as SymbolIndex;
  if (!index || index.schemaVersion !== 1 || !Array.isArray(index.symbols) || !Array.isArray(index.references) || !Array.isArray(index.unsupportedFiles) || index.symbols.length > 1_000_000 || index.references.length > 2_000_000) return false;
  for (const symbol of index.symbols) if (!validPath(symbol.path) || typeof symbol.name !== "string" || !Number.isSafeInteger(symbol.line) || symbol.line < 1) return false;
  for (const ref of index.references) if (!validPath(ref.path) || typeof ref.name !== "string" || !Number.isSafeInteger(ref.line) || ref.line < 1) return false;
  return true;
}
export class JsonFileRepositoryMemoryStore implements RepositoryMemoryStore {
  private readonly directory: string;
  constructor(directory: string) {
    if (!directory.trim()) throw new Error("An explicit repository memory directory is required.");
    this.directory = resolve(directory);
  }
  private path(repositoryId: string): string {
    if (!repositoryId.trim()) throw new Error("Repository identity is required.");
    const key = Buffer.from(repositoryId, "utf8").toString("hex");
    if (key.length > 1024) throw new Error("Repository identity is too long.");
    return resolve(this.directory, key + ".memory.json");
  }
  async load(repositoryId: string): Promise<RepositoryMemoryRecord | null> {
    const path = this.path(repositoryId);
    try {
      const metadata = await stat(path);
      if (metadata.size > MAX_BYTES) throw new Error("Repository memory exceeds the 32 MiB limit.");
      const raw = await readFile(path, "utf8");
      let parsed: unknown;
      try { parsed = JSON.parse(raw); } catch { throw new Error("Repository memory contains invalid JSON."); }
      if (!validateRepositoryMemory(parsed) || parsed.repositoryId !== repositoryId) throw new Error("Repository memory schema or identity is invalid.");
      return parsed;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  }
  async save(record: RepositoryMemoryRecord): Promise<void> {
    if (!validateRepositoryMemory(record)) throw new Error("Refusing to save invalid repository memory.");
    const raw = JSON.stringify(record, null, 2) + "\n";
    if (Buffer.byteLength(raw, "utf8") > MAX_BYTES) throw new Error("Repository memory exceeds the 32 MiB limit.");
    await mkdir(this.directory, { recursive: true });
    const target = this.path(record.repositoryId);
    const temp = resolve(dirname(target), "." + basename(target) + "." + randomUUID() + ".tmp");
    try {
      await writeFile(temp, raw, { encoding: "utf8", flag: "wx", mode: 0o600 });
      await rename(temp, target);
    } finally { await rm(temp, { force: true }).catch(() => undefined); }
  }
}
