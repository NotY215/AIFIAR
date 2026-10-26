import { compareRepositorySnapshots, type RepositorySnapshot, type FreshnessReport } from "./freshnessEngine.js";
import { scanRepository, type RepositoryScanOptions, type RepositoryScanResult } from "./repositoryScanner.js";
import { buildSymbolIndex, findSymbols, type SymbolIndex, type IndexedSymbol } from "./symbolIndex.js";
import { JsonFileRepositoryMemoryStore, type RepositoryMemoryRecord, type RepositoryMemoryStore } from "./repositoryMemoryStore.js";
import type { ProjectFileSummary } from "./types.js";

export interface RepositoryMemoryOptions {
  repositoryId: string;
  rootPath: string;
  storeDirectory: string;
  commit?: string;
  scan?: RepositoryScanOptions;
  maxSummaryAgeMs?: number;
  now?: number;
}
export interface RepositoryMemoryReport {
  record: RepositoryMemoryRecord;
  freshness: FreshnessReport;
  scan: RepositoryScanResult;
  reusedSummaryCount: number;
  regeneratedSummaryCount: number;
  incomplete: boolean;
  persisted: boolean;
}
function inferPurpose(path: string): string {
  const base = path.split("/").pop() ?? path;
  if (/^readme/i.test(base)) return "Project overview and usage instructions.";
  if (/^agents\.md$/i.test(base)) return "Repository instructions for coding agents.";
  if (/^package\.json$/i.test(base)) return "JavaScript package metadata, scripts, and dependencies.";
  if (/^(pyproject\.toml|requirements.*\.txt)$/i.test(base)) return "Python project metadata and dependencies.";
  if (/^(cmakelists\.txt|makefile)$/i.test(base)) return "Build configuration and target definitions.";
  if (/\.(test|spec)\.[^.]+$/i.test(base) || /(^|\/)(tests?|__tests__)\//i.test(path)) return "Automated tests and behavioral checks.";
  if (/\.(md|rst|txt)$/i.test(base)) return "Project documentation.";
  if (/\.(ya?ml|json|toml|ini)$/i.test(base)) return "Configuration or structured project metadata.";
  if (/\.(ts|tsx|js|jsx|py|c|h|cpp|hpp|cs|java|go|rs|php|rb)$/i.test(base)) {
    return "Source code; inspect indexed symbols and call sites for task-specific behavior.";
  }
  return "Repository file; purpose has not been inferred confidently.";
}
function createSnapshot(options: RepositoryMemoryOptions, scan: RepositoryScanResult): RepositorySnapshot {
  return {
    repositoryId: options.repositoryId,
    ...(options.commit ? { commit: options.commit } : {}),
    scannedAt: scan.scannedAt,
    files: scan.files.map(({ path, contentHash, sizeBytes }) => ({ path, contentHash, sizeBytes }))
  };
}
export class RepositoryMemory {
  private readonly store: RepositoryMemoryStore;
  constructor(storeDirectory: string, store?: RepositoryMemoryStore) {
    this.store = store ?? new JsonFileRepositoryMemoryStore(storeDirectory);
  }
  async refresh(options: RepositoryMemoryOptions): Promise<RepositoryMemoryReport> {
    if (!options.repositoryId.trim()) throw new Error("Repository identity is required.");
    const previous = await this.store.load(options.repositoryId);
    const scan = await scanRepository(options.rootPath, { ...options.scan, includeContent: true });
    const snapshot = createSnapshot(options, scan);
    const freshness = compareRepositorySnapshots(previous?.snapshot ?? null, snapshot, {
      expectedRepositoryId: options.repositoryId,
      ...(options.commit ? { expectedCommit: options.commit } : {})
    });
    const oldSummaries = new Map((previous?.summaries ?? []).map((item) => [item.path, item]));
    const summaries: ProjectFileSummary[] = [];
    let reusedSummaryCount = 0;
    let regeneratedSummaryCount = 0;
    const maxAge = options.maxSummaryAgeMs ?? 7 * 24 * 60 * 60 * 1000;
    const now = options.now ?? Date.now();
    for (const file of scan.files) {
      const old = oldSummaries.get(file.path);
      const generatedAt = old?.generatedAt ? Date.parse(old.generatedAt) : Number.NaN;
      if (old && old.contentHash === file.contentHash && Number.isFinite(generatedAt) && generatedAt <= now && now - generatedAt <= maxAge) {
        summaries.push({ ...old, lastObservedAt: new Date(now).toISOString() });
        reusedSummaryCount++;
      } else {
        summaries.push({ path: file.path, purpose: inferPurpose(file.path), contentHash: file.contentHash, lastObservedAt: new Date(now).toISOString(), generatedAt: new Date(now).toISOString() });
        regeneratedSummaryCount++;
      }
    }
    const symbolIndex: SymbolIndex = buildSymbolIndex(scan.files);
    const record: RepositoryMemoryRecord = {
      schemaVersion: 1,
      repositoryId: options.repositoryId,
      updatedAt: new Date(now).toISOString(),
      snapshot,
      summaries,
      symbolIndex
    };
    const incomplete = scan.truncated || scan.issues.length > 0;
    if (!incomplete) await this.store.save(record);
    return {
      record, freshness, scan, reusedSummaryCount, regeneratedSummaryCount,
      incomplete, persisted: !incomplete
    };
  }
  async load(repositoryId: string): Promise<RepositoryMemoryRecord | null> {
    return this.store.load(repositoryId);
  }
  async searchSymbols(repositoryId: string, query: string, limit = 50): Promise<IndexedSymbol[]> {
    const record = await this.store.load(repositoryId);
    return record ? findSymbols(record.symbolIndex, query, limit) : [];
  }
  async getFileSummary(repositoryId: string, path: string, currentHash?: string): Promise<{ summary: ProjectFileSummary; freshness: "fresh" | "stale" | "unknown" } | null> {
    const record = await this.store.load(repositoryId);
    const summary = record?.summaries.find((item) => item.path === path);
    if (!summary) return null;
    const snapshotFile = record?.snapshot.files.find((item) => item.path === path);
    const freshness = currentHash === undefined ? "unknown" : (currentHash === snapshotFile?.contentHash && currentHash === summary.contentHash ? "fresh" : "stale");
    return { summary: { ...summary }, freshness };
  }
}
