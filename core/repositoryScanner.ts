import { createHash } from "node:crypto";
import { lstat, readFile, readdir, realpath } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";

export interface RepositoryScanOptions {
  ignoreDirectories?: string[];
  ignorePatterns?: string[];
  maxFiles?: number;
  maxFileBytes?: number;
  maxTotalBytes?: number;
  includeContent?: boolean;
  includeExtensions?: string[];
}

export interface ScannedFile {
  path: string;
  sizeBytes: number;
  contentHash: string;
  extension: string;
  content?: string;
}

export interface RepositoryScanIssue {
  path: string;
  reason: "symlink-skipped" | "outside-root" | "too-large" | "unreadable" | "file-limit" | "total-size-limit";
  message: string;
}

export interface RepositoryScanResult {
  root: string;
  files: ScannedFile[];
  issues: RepositoryScanIssue[];
  scannedAt: string;
  totalBytes: number;
  truncated: boolean;
}

const DEFAULT_IGNORED_DIRECTORIES = [
  ".git", "node_modules", "dist", "build", "coverage", ".next", ".cache",
  ".venv", "venv", "vendor", "target", "bin", "obj", ".aifiar"
];

function normalizePath(path: string): string {
  return path.split(sep).join("/");
}

function isWithinRoot(root: string, candidate: string): boolean {
  const rel = relative(root, candidate);
  return rel === "" || (!rel.startsWith(".." + sep) && rel !== ".." && !isAbsolute(rel));
}

function matchesPattern(path: string, pattern: string): boolean {
  const normalized = pattern.trim().replace(/\\/g, "/").replace(/^\.\//, "");
  if (!normalized || normalized.startsWith("#")) return false;
  const directoryOnly = normalized.endsWith("/");
  const value = directoryOnly ? normalized.slice(0, -1) : normalized;
  const escaped = value.replace(/[.+^$()|{}[\]\\]/g, "\\$&")
    .replace(/\*\*/g, "§§DOUBLESTAR§§")
    .replace(/\*/g, "[^/]*")
    .replace(/\?/g, "[^/]")
    .replace(/§§DOUBLESTAR§§/g, ".*");
  const expression = new RegExp((value.includes("/") ? "^" : "(^|/)") + escaped + (directoryOnly ? "(/.*)?$" : "$"));
  return expression.test(path);
}

export async function scanRepository(rootPath: string, options: RepositoryScanOptions = {}): Promise<RepositoryScanResult> {
  if (!rootPath.trim()) throw new Error("Repository root is required.");
  const root = await realpath(resolve(rootPath));
  const rootInfo = await lstat(root);
  if (!rootInfo.isDirectory()) throw new Error("Repository root must be a directory.");

  const maxFiles = options.maxFiles ?? 20_000;
  const maxFileBytes = options.maxFileBytes ?? 2 * 1024 * 1024;
  const maxTotalBytes = options.maxTotalBytes ?? 100 * 1024 * 1024;
  if (!Number.isSafeInteger(maxFiles) || maxFiles < 1) throw new Error("maxFiles must be a positive safe integer.");
  if (!Number.isSafeInteger(maxFileBytes) || maxFileBytes < 1) throw new Error("maxFileBytes must be a positive safe integer.");
  if (!Number.isSafeInteger(maxTotalBytes) || maxTotalBytes < 1) throw new Error("maxTotalBytes must be a positive safe integer.");

  const ignoredDirectories = new Set([...DEFAULT_IGNORED_DIRECTORIES, ...(options.ignoreDirectories ?? [])]);
  const patterns = options.ignorePatterns ?? [];
  const includeExtensions = options.includeExtensions ? new Set(options.includeExtensions.map((ext) => ext.toLowerCase())) : undefined;
  const files: ScannedFile[] = [];
  const issues: RepositoryScanIssue[] = [];
  let totalBytes = 0;
  let truncated = false;

  async function visit(directory: string): Promise<void> {
    if (truncated) return;
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch {
      issues.push({ path: normalizePath(relative(root, directory)), reason: "unreadable", message: "Directory could not be read." });
      return;
    }
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      if (truncated) return;
      const absolute = resolve(directory, entry.name);
      const rel = normalizePath(relative(root, absolute));
      if (!isWithinRoot(root, absolute)) {
        issues.push({ path: rel, reason: "outside-root", message: "Path resolved outside the repository root." });
        continue;
      }
      if (entry.isSymbolicLink()) {
        issues.push({ path: rel, reason: "symlink-skipped", message: "Symbolic links are not followed." });
        continue;
      }
      if (patterns.some((pattern) => matchesPattern(rel, pattern))) continue;
      if (entry.isDirectory()) {
        if (ignoredDirectories.has(entry.name)) continue;
        await visit(absolute);
        continue;
      }
      if (!entry.isFile()) continue;
      const extension = rel.includes(".") ? "." + rel.split(".").pop()!.toLowerCase() : "";
      if (includeExtensions && !includeExtensions.has(extension)) continue;
      if (files.length >= maxFiles) {
        issues.push({ path: rel, reason: "file-limit", message: "Maximum file count reached; scan was truncated." });
        truncated = true;
        return;
      }
      let metadata;
      try {
        metadata = await lstat(absolute);
      } catch {
        issues.push({ path: rel, reason: "unreadable", message: "File metadata could not be read." });
        continue;
      }
      if (!metadata.isFile() || metadata.isSymbolicLink()) {
        issues.push({ path: rel, reason: "symlink-skipped", message: "File changed to a non-regular file during scanning." });
        continue;
      }
      if (metadata.size > maxFileBytes) {
        issues.push({ path: rel, reason: "too-large", message: "File exceeds the per-file byte limit." });
        continue;
      }
      if (totalBytes + metadata.size > maxTotalBytes) {
        issues.push({ path: rel, reason: "total-size-limit", message: "Total byte budget reached; scan was truncated." });
        truncated = true;
        return;
      }
      try {
        const data = await readFile(absolute);
        const currentPath = await realpath(absolute);
        if (!isWithinRoot(root, currentPath)) {
          issues.push({ path: rel, reason: "outside-root", message: "Resolved file path escaped the repository root." });
          continue;
        }
        totalBytes += data.byteLength;
        const result: ScannedFile = {
          path: rel,
          sizeBytes: data.byteLength,
          contentHash: createHash("sha256").update(data).digest("hex"),
          extension
        };
        if (options.includeContent) result.content = data.toString("utf8");
        files.push(result);
      } catch {
        issues.push({ path: rel, reason: "unreadable", message: "File content could not be read." });
      }
    }
  }

  await visit(root);
  return { root, files, issues, scannedAt: new Date().toISOString(), totalBytes, truncated };
}
