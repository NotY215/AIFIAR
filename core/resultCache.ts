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
  privacyMode: "local-only" | "standard";
  containsSensitiveData?: boolean;
  now?: () => number;
}

interface CacheEntry<T> {
  value: T;
  createdAt: number;
  expiresAt: number;
  sourceFingerprint: string;
}

/**
 * Process-local cache. Disabled by default, never persists data, and refuses
 * sensitive payloads. Hosts must supply current source hashes in every key.
 */
export class FreshResultCache<T> {
  private readonly entries = new Map<string, CacheEntry<T>>();
  private readonly now: () => number;

  constructor(private readonly policy: CachePolicy) {
    if (!Number.isFinite(policy.ttlMs) || policy.ttlMs <= 0) throw new Error("ttlMs must be positive.");
    if (!Number.isInteger(policy.maxEntries) || policy.maxEntries < 1 || policy.maxEntries > 10_000) {
      throw new Error("maxEntries must be between 1 and 10000.");
    }
    this.now = policy.now ?? Date.now;
  }

  private allowed(): boolean {
    return this.policy.enabled && this.policy.privacyMode === "local-only" && !this.policy.containsSensitiveData;
  }

  private fingerprint(key: ResultCacheKey): string {
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
    const now = this.now();
    const id = this.fingerprint(key);
    this.entries.delete(id);
    this.entries.set(id, {
      value: structuredClone(value),
      createdAt: now,
      expiresAt: now + this.policy.ttlMs,
      sourceFingerprint: this.sourceFingerprint(key)
    });
    while (this.entries.size > this.policy.maxEntries) {
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

  private pruneExpired(): void {
    const now = this.now();
    for (const [key, entry] of this.entries) if (entry.expiresAt <= now) this.entries.delete(key);
  }
}
