import type { ProjectFileSummary } from "./types.js";

export class ProjectMemory {
  private readonly files = new Map<string, ProjectFileSummary>();
  upsert(summary: ProjectFileSummary): void { this.files.set(summary.path, { ...summary }); }
  get(path: string): ProjectFileSummary | undefined {
    const value = this.files.get(path);
    return value ? { ...value } : undefined;
  }
  list(): ProjectFileSummary[] { return [...this.files.values()].map((value) => ({ ...value })); }
  remove(path: string): boolean { return this.files.delete(path); }
  clear(): void { this.files.clear(); }
}

/** This is in-process task memory, not durable cross-session storage. */
