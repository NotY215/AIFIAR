import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, basename, resolve } from "node:path";

export interface ProjectProfile {
  schemaVersion: 1;
  repositoryUrl: string;
  observedRef: string;
  observedCommit: string;
  projectPurpose: string;
  architectureNotes: string[];
  conventions: string[];
  protectedPaths: string[];
  verificationCommands: string[];
  knownLimitations: string[];
  unresolvedQuestions: string[];
  savedAt: string;
}

export interface ProjectProfileStore {
  load(): Promise<ProjectProfile | null>;
  save(profile: ProjectProfile): Promise<void>;
}

export type ProfileFreshness =
  | { status: "fresh"; reasons: [] }
  | { status: "stale"; reasons: string[] }
  | { status: "unknown"; reasons: string[] };

const MAX_PROFILE_BYTES = 2 * 1024 * 1024;

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

export function validateProjectProfile(value: unknown): value is ProjectProfile {
  if (!value || typeof value !== "object") return false;
  const profile = value as Record<string, unknown>;
  return profile.schemaVersion === 1
    && typeof profile.repositoryUrl === "string"
    && typeof profile.observedRef === "string"
    && typeof profile.observedCommit === "string"
    && typeof profile.projectPurpose === "string"
    && typeof profile.savedAt === "string"
    && Number.isFinite(Date.parse(profile.savedAt))
    && isStringArray(profile.architectureNotes)
    && isStringArray(profile.conventions)
    && isStringArray(profile.protectedPaths)
    && isStringArray(profile.verificationCommands)
    && isStringArray(profile.knownLimitations)
    && isStringArray(profile.unresolvedQuestions);
}

export function assessProfileFreshness(
  profile: ProjectProfile,
  options: { currentCommit?: string; maxAgeMs?: number; now?: number } = {}
): ProfileFreshness {
  const reasons: string[] = [];
  const savedAt = Date.parse(profile.savedAt);
  const now = options.now ?? Date.now();
  const maxAgeMs = options.maxAgeMs ?? 24 * 60 * 60 * 1000;

  if (!Number.isFinite(savedAt)) reasons.push("Saved timestamp is invalid.");
  else if (savedAt > now) reasons.push("Profile timestamp is in the future.");
  else if (now - savedAt > maxAgeMs) reasons.push("Profile is older than the configured freshness window.");

  if (options.currentCommit === undefined) {
    reasons.push("Current repository commit was not supplied, so revision freshness cannot be confirmed.");
  } else if (!profile.observedCommit || profile.observedCommit !== options.currentCommit) {
    reasons.push("Repository commit differs from the commit recorded in the profile.");
  }

  if (reasons.length === 0) return { status: "fresh", reasons: [] };
  if (reasons.some((reason) => reason.includes("not supplied"))) {
    return { status: "unknown", reasons };
  }
  return { status: "stale", reasons };
}

export class JsonFileProjectProfileStore implements ProjectProfileStore {
  private readonly filePath: string;

  constructor(filePath: string) {
    if (!filePath.trim()) throw new Error("An explicit profile file path is required.");
    this.filePath = resolve(filePath);
  }

  async load(): Promise<ProjectProfile | null> {
    let data: string;
    try {
      const fileStat = await stat(this.filePath);
      if (fileStat.size > MAX_PROFILE_BYTES) throw new Error("Project profile exceeds the 2 MiB size limit.");
      data = await readFile(this.filePath, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(data);
    } catch {
      throw new Error("Project profile contains invalid JSON.");
    }
    if (!validateProjectProfile(parsed)) throw new Error("Project profile schema is invalid or unsupported.");
    return parsed;
  }

  async save(profile: ProjectProfile): Promise<void> {
    if (!validateProjectProfile(profile)) throw new Error("Refusing to save an invalid project profile.");
    const data = JSON.stringify(profile, null, 2) + "\n";
    if (Buffer.byteLength(data, "utf8") > MAX_PROFILE_BYTES) {
      throw new Error("Project profile exceeds the 2 MiB size limit.");
    }

    const directory = dirname(this.filePath);
    await mkdir(directory, { recursive: true });
    const tempPath = resolve(directory, `.${basename(this.filePath)}.${randomUUID()}.tmp`);
    try {
      await writeFile(tempPath, data, { encoding: "utf8", flag: "wx", mode: 0o600 });
      await rename(tempPath, this.filePath);
    } finally {
      await rm(tempPath, { force: true }).catch(() => undefined);
    }
  }
}
