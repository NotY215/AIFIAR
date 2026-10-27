import { createHash } from "node:crypto";

export interface CacheSourceVersion {
  path: string;
  contentHash: string;
}

export interface ResultCacheKey {
  taskKind: string;
  taskText: string;
  provider: string;
  modelId: string;
  instructionHashes: readonly string[];
  sources: readonly CacheSourceVersion[];
  configurationVersion: string;
}

export interface CachePolicy {
  enabled: boolean;
  ttlMs: number;
  maxEntries: number;
  maxEntryBytes?: number;
  maxTotalBytes?: number;
  privacyMode: "local-only" | "standard";
  containsSensitiveData?: boolean;
  now?: () => number;
}

interface CacheEntry<T> {
  value: T;
  createdAt: number;
  expiresAt: number;
  sourceFingerprint: string;
  bytes: number;
}

/**
 * Process-local cache. Disabled by default, never persists data, and refuses
 * sensitive payloads. Hosts must supply current source hashes in every key.
 */
export class FreshResultCache<T> {
  private readonly entries = new Map<string, CacheEntry<T>>();
  private readonly now: () => number;
  private readonly maxEntryBytes: number;
  private readonly maxTotalBytes: number;

  constructor(private readonly policy: CachePolicy) {
    if (!Number.isFinite(policy.ttlMs) || policy.ttlMs <= 0) throw new Error("ttlMs must be positive.");
    if (!Number.isInteger(policy.maxEntries) || policy.maxEntries < 1 || policy.maxEntries > 10_000) {
      throw new Error("maxEntries must be between 1 and 10000.");
    }
    this.now = policy.now ?? Date.now;
    this.maxEntryBytes = policy.maxEntryBytes ?? 64 * 1024;
    this.maxTotalBytes = policy.maxTotalBytes ?? 1024 * 1024;
    if (!Number.isInteger(this.maxEntryBytes) || this.maxEntryBytes < 1 || this.maxEntryBytes > 10 * 1024 * 1024) {
      throw new Error("maxEntryBytes must be between 1 byte and 10 MiB.");
    }
    if (!Number.isInteger(this.maxTotalBytes) || this.maxTotalBytes < this.maxEntryBytes || this.maxTotalBytes > 50 * 1024 * 1024) {
      throw new Error("maxTotalBytes must be at least maxEntryBytes and at most 50 MiB.");
    }
  }

  private allowed(): boolean {
    return this.policy.enabled && this.policy.privacyMode === "local-only" && !this.policy.containsSensitiveData;
  }

  private fingerprint(key: ResultCacheKey): string {
    if (!key || !key.taskKind?.trim() || !key.taskText || key.taskText.length > 200_000
      || !key.provider?.trim() || !key.modelId?.trim() || !key.configurationVersion?.trim()
      || !Array.isArray(key.instructionHashes) || key.instructionHashes.length > 500
      || !Array.isArray(key.sources) || key.sources.length > 5_000) {
      throw new Error("Cache key is incomplete or exceeds configured safety bounds.");
    }
    if (key.instructionHashes.some((hash) => typeof hash !== "string" || hash.length > 512)
      || key.sources.some((source) => !source || typeof source.path !== "string" || source.path.length > 4096
        || typeof source.contentHash !== "string" || source.contentHash.length > 512)) {
      throw new Error("Cache key contains invalid source or instruction metadata.");
    }
    const normalized = {
      taskKind: key.taskKind,
      taskText: key.taskText,
      provider: key.provider,
      modelId: key.modelId,
      instructionHashes: [...key.instructionHashes].sort(),
      sources: [...key.sources].map((item) => ({ path: item.path, contentHash: item.contentHash }))
        .sort((a, b) => a.path.localeCompare(b.path)),
      configurationVersion: key.configurationVersion
    };
    return createHash("sha256").update(JSON.stringify(normalized)).digest("hex");
  }

  get(key: ResultCacheKey): T | undefined {
    if (!this.allowed()) return undefined;
    const id = this.fingerprint(key);
    const entry = this.entries.get(id);
    if (!entry) return undefined;
    if (entry.expiresAt <= this.now() || entry.sourceFingerprint !== this.sourceFingerprint(key)) {
      this.entries.delete(id);
      return undefined;
    }
    this.entries.delete(id);
    this.entries.set(id, entry);
    return structuredClone(entry.value);
  }

  set(key: ResultCacheKey, value: T): boolean {
    if (!this.allowed()) return false;
    const id = this.fingerprint(key);
    let serialized: string | undefined;
    try {
      serialized = JSON.stringify(value);
    } catch {
      return false;
    }
    if (serialized === undefined) return false;
    const bytes = Buffer.byteLength(serialized, "utf8");
    if (bytes > this.maxEntryBytes) return false;
    let cloned: T;
    try {
      cloned = structuredClone(value);
    } catch {
      return false;
    }
    const now = this.now();
    this.entries.delete(id);
    this.entries.set(id, {
      value: cloned,
      createdAt: now,
      expiresAt: now + this.policy.ttlMs,
      sourceFingerprint: this.sourceFingerprint(key),
      bytes
    });
    while (this.entries.size > this.policy.maxEntries || this.totalBytes() > this.maxTotalBytes) {
      const oldest = this.entries.keys().next().value as string | undefined;
      if (oldest === undefined) break;
      this.entries.delete(oldest);
    }
    return true;
  }

  clear(): void {
    this.entries.clear();
  }

  get size(): number {
    this.pruneExpired();
    return this.entries.size;
  }

  private sourceFingerprint(key: ResultCacheKey): string {
    return createHash("sha256")
      .update(JSON.stringify({
        instructions: [...key.instructionHashes].sort(),
        sources: [...key.sources].map((item) => [item.path, item.contentHash]).sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
        configurationVersion: key.configurationVersion,
        provider: key.provider,
        modelId: key.modelId
      }))
      .digest("hex");
  }

  private totalBytes(): number {
    return [...this.entries.values()].reduce((sum, entry) => sum + entry.bytes, 0);
  }

  private pruneExpired(): void {
    const now = this.now();
    for (const [key, entry] of this.entries) if (entry.expiresAt <= now) this.entries.delete(key);
  }
}
