import type { ScannedFile } from "./repositoryScanner.js";

export interface RepositorySnapshot {
  repositoryId: string;
  commit?: string;
  scannedAt: string;
  files: Array<Pick<ScannedFile, "path" | "contentHash" | "sizeBytes">>;
}

export interface FreshnessChange {
  path: string;
  kind: "added" | "modified" | "deleted" | "unchanged";
  previousHash?: string;
  currentHash?: string;
}

export interface FreshnessReport {
  status: "fresh" | "changed" | "unknown";
  added: string[];
  modified: string[];
  deleted: string[];
  unchanged: string[];
  changes: FreshnessChange[];
  reasons: string[];
}

export function compareRepositorySnapshots(
  previous: RepositorySnapshot | null,
  current: RepositorySnapshot,
  options: { expectedRepositoryId?: string; expectedCommit?: string } = {}
): FreshnessReport {
  const reasons: string[] = [];
  if (!current.repositoryId.trim()) reasons.push("Current snapshot has no repository identity.");
  if (!Number.isFinite(Date.parse(current.scannedAt))) reasons.push("Current snapshot timestamp is invalid.");
  if (options.expectedRepositoryId && current.repositoryId !== options.expectedRepositoryId) {
    reasons.push("Current snapshot belongs to a different repository.");
  }
  if (options.expectedCommit && current.commit !== options.expectedCommit) {
    reasons.push("Current snapshot commit does not match the expected commit.");
  }
  if (!previous) {
    return { status: reasons.length ? "unknown" : "unknown", added: current.files.map((file) => file.path), modified: [], deleted: [], unchanged: [], changes: current.files.map((file) => ({ path: file.path, kind: "added", currentHash: file.contentHash })), reasons: [...reasons, "No previous snapshot exists for comparison."] };
  }
  if (previous.repositoryId !== current.repositoryId) {
    return { status: "unknown", added: [], modified: [], deleted: [], unchanged: [], changes: [], reasons: [...reasons, "Snapshot repository identity changed; refusing cross-repository comparison."] };
  }
  const oldFiles = new Map(previous.files.map((file) => [file.path, file]));
  const newFiles = new Map(current.files.map((file) => [file.path, file]));
  const changes: FreshnessChange[] = [];
  for (const [path, file] of newFiles) {
    const old = oldFiles.get(path);
    if (!old) changes.push({ path, kind: "added", currentHash: file.contentHash });
    else if (old.contentHash !== file.contentHash) changes.push({ path, kind: "modified", previousHash: old.contentHash, currentHash: file.contentHash });
    else changes.push({ path, kind: "unchanged", previousHash: old.contentHash, currentHash: file.contentHash });
  }
  for (const [path, file] of oldFiles) {
    if (!newFiles.has(path)) changes.push({ path, kind: "deleted", previousHash: file.contentHash });
  }
  changes.sort((a, b) => a.path.localeCompare(b.path));
  const added = changes.filter((item) => item.kind === "added").map((item) => item.path);
  const modified = changes.filter((item) => item.kind === "modified").map((item) => item.path);
  const deleted = changes.filter((item) => item.kind === "deleted").map((item) => item.path);
  const unchanged = changes.filter((item) => item.kind === "unchanged").map((item) => item.path);
  return {
    status: reasons.length ? "unknown" : (added.length || modified.length || deleted.length ? "changed" : "fresh"),
    added, modified, deleted, unchanged, changes, reasons
  };
}

export function isSummaryFresh(
  summary: { sourceHashes: Record<string, string>; generatedAt: string },
  currentHashes: ReadonlyMap<string, string>,
  maxAgeMs = 24 * 60 * 60 * 1000,
  now = Date.now()
): { fresh: boolean; stalePaths: string[]; reasons: string[] } {
  const reasons: string[] = [];
  const generatedAt = Date.parse(summary.generatedAt);
  if (!Number.isFinite(generatedAt)) reasons.push("Summary generation timestamp is invalid.");
  else if (generatedAt > now) reasons.push("Summary generation timestamp is in the future.");
  else if (now - generatedAt > maxAgeMs) reasons.push("Summary exceeded the configured age limit.");
  const stalePaths = Object.entries(summary.sourceHashes)
    .filter(([path, hash]) => currentHashes.get(path) !== hash)
    .map(([path]) => path)
    .sort();
  if (stalePaths.length) reasons.push("One or more source files changed or are no longer present.");
  return { fresh: reasons.length === 0, stalePaths, reasons };
}
