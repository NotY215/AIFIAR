import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import type { RepositorySnapshot } from "./freshnessEngine.js";

const MAX_INDEX_BYTES = 16 * 1024 * 1024;
const MAX_FILES = 200_000;

export interface RepositoryIndexStore {
  load(repositoryId: string): Promise<RepositorySnapshot | null>;
  save(snapshot: RepositorySnapshot): Promise<void>;
}

function validateSnapshot(value: unknown): value is RepositorySnapshot {
  if (!value || typeof value !== "object") return false;
  const snapshot = value as Record<string, unknown>;
  if (typeof snapshot.repositoryId !== "string" || !snapshot.repositoryId.trim()) return false;
  if (typeof snapshot.scannedAt !== "string" || !Number.isFinite(Date.parse(snapshot.scannedAt))) return false;
  if (snapshot.commit !== undefined && typeof snapshot.commit !== "string") return false;
  if (!Array.isArray(snapshot.files) || snapshot.files.length > MAX_FILES) return false;
  const seen = new Set<string>();
  for (const item of snapshot.files) {
    if (!item || typeof item !== "object") return false;
    const file = item as Record<string, unknown>;
    if (typeof file.path !== "string" || !file.path.trim() || file.path.startsWith("/") || file.path.includes("\\") || file.path.split("/").some((part) => part === ".." || part === "." || part === "")) return false;
    if (typeof file.contentHash !== "string" || !/^[a-f0-9]{64}$/i.test(file.contentHash)) return false;
    if (typeof file.sizeBytes !== "number" || !Number.isSafeInteger(file.sizeBytes) || file.sizeBytes < 0) return false;
    if (seen.has(file.path)) return false;
    seen.add(file.path);
  }
  return true;
}

export class JsonFileRepositoryIndexStore implements RepositoryIndexStore {
  private readonly directory: string;

  constructor(directory: string) {
    if (!directory.trim()) throw new Error("An explicit index directory is required.");
    this.directory = resolve(directory);
  }

  private filePath(repositoryId: string): string {
    if (!repositoryId.trim()) throw new Error("Repository identity is required.");
    const safeName = Buffer.from(repositoryId, "utf8").toString("hex");
    if (safeName.length > 1024) throw new Error("Repository identity is too long.");
    return resolve(this.directory, safeName + ".index.json");
  }

  async load(repositoryId: string): Promise<RepositorySnapshot | null> {
    const path = this.filePath(repositoryId);
    let data: string;
    try {
      const metadata = await stat(path);
      if (metadata.size > MAX_INDEX_BYTES) throw new Error("Repository index exceeds the 16 MiB size limit.");
      data = await readFile(path, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
    let parsed: unknown;
    try { parsed = JSON.parse(data); } catch { throw new Error("Repository index contains invalid JSON."); }
    if (!validateSnapshot(parsed)) throw new Error("Repository index schema is invalid.");
    if (parsed.repositoryId !== repositoryId) throw new Error("Repository index identity does not match the requested identity.");
    return parsed;
  }

  async save(snapshot: RepositorySnapshot): Promise<void> {
    if (!validateSnapshot(snapshot)) throw new Error("Refusing to save an invalid repository index.");
    const data = JSON.stringify(snapshot, null, 2) + "\n";
    if (Buffer.byteLength(data, "utf8") > MAX_INDEX_BYTES) throw new Error("Repository index exceeds the 16 MiB size limit.");
    await mkdir(this.directory, { recursive: true });
    const target = this.filePath(snapshot.repositoryId);
    const temp = resolve(dirname(target), "." + basename(target) + "." + randomUUID() + ".tmp");
    try {
      await writeFile(temp, data, { encoding: "utf8", flag: "wx", mode: 0o600 });
      await rename(temp, target);
    } finally {
      await rm(temp, { force: true }).catch(() => undefined);
    }
  }
}
