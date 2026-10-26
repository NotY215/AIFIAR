import { createHash, randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { lstat, mkdir, open, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import type { PatchFileChange } from "./patchValidation.js";
import type { DurablePatchRecoveryAdapter, RecoveryChange, RecoveryOutcome, RecoverySnapshot } from "./transactionRecovery.js";

type BeforeImage = {
  path: string;
  existed: boolean;
  beforeHash: string | null;
  beforeBase64: string | null;
  mode: number | null;
  afterHash: string | null;
};
type SnapshotFile = {
  schemaVersion: 1;
  transactionId: string;
  snapshotId: string;
  manifestDigest: string;
  createdAt: string;
  status: "pending" | "committed" | "rolled-back" | "recovered";
  images: BeforeImage[];
};
const HASH = /^[a-f0-9]{64}$/;
const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/;
const MAX_FILE_BYTES = 8 * 1024 * 1024;
const MAX_SNAPSHOT_BYTES = 64 * 1024 * 1024;

function sha(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}
function isMissing(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as {code?: unknown}).code === "ENOENT";
}
function safeRelativePath(value: string): string {
  if (!value || value.includes("\\0") || value.includes("\\") || isAbsolute(value)) throw new Error("Unsafe recovery target path.");
  const parts = value.split("/");
  if (parts.some((part) => !part || part === "." || part === ".." || part.startsWith(".aifiar-recovery"))) throw new Error("Unsafe recovery target path.");
  return parts.join("/");
}
function isInside(root: string, candidate: string): boolean {
  const rel = relative(root, candidate);
  return rel === "" || (!rel.startsWith(".." + sep) && rel !== ".." && !isAbsolute(rel));
}

/**
 * Host adapter for durable before-images and conservative restart recovery.
 *
 * This adapter is intended for a trusted, single-user local workspace. Node's
 * portable filesystem APIs do not provide Windows/POSIX handle-relative
 * operations for every step, so it is NOT a defense against a hostile process
 * racing directory renames. Use an OS-isolated worker and native safe-FS
 * backend for untrusted multi-user or production execution.
 */
export class NodeWorkspaceRecoveryAdapter implements DurablePatchRecoveryAdapter {
  readonly workspaceRoot: string;
  readonly storeRoot: string;

  constructor(workspaceRoot: string, storeRoot: string) {
    this.workspaceRoot = resolve(workspaceRoot);
    this.storeRoot = resolve(storeRoot);
    if (isInside(this.workspaceRoot, this.storeRoot) || isInside(this.storeRoot, this.workspaceRoot)) {
      throw new Error("Recovery store and workspace must be separate, non-nested directories.");
    }
  }

  async prepare(input: { transactionId: string; manifestDigest: string; paths: readonly string[]; changes?: readonly RecoveryChange[] }): Promise<RecoverySnapshot> {
    if (!ID.test(input.transactionId) || !HASH.test(input.manifestDigest)) throw new Error("Invalid transaction or manifest digest.");
    if (!input.changes || input.changes.length !== input.paths.length) throw new Error("Recovery preparation requires the exact approved changes.");
    const changeByPath = new Map(input.changes.map((change) => [safeRelativePath(change.path), change]));
    const paths = input.paths.map(safeRelativePath);
    if (new Set(paths).size !== paths.length || changeByPath.size !== paths.length || paths.some((path) => !changeByPath.has(path))) {
      throw new Error("Recovery paths do not exactly match the approved change list.");
    }
    await this.assertDirectory(this.workspaceRoot);
    await mkdir(this.storeRoot, { recursive: true, mode: 0o700 });
    await this.assertDirectory(this.storeRoot);
    const snapshotId = randomUUID();
    const images: BeforeImage[] = [];
    let totalBytes = 0;
    for (const path of paths) {
      const change = changeByPath.get(path)!;
      const target = this.target(path);
      await this.assertNoSymlinkParents(path);
      let before: Buffer | null = null;
      let mode: number | null = null;
      try {
        const statBefore = await lstat(target);
        if (statBefore.isSymbolicLink() || !statBefore.isFile() || statBefore.nlink > 1) throw new Error("Recovery target must be a regular file without hard links: " + path);
        if (statBefore.size > MAX_FILE_BYTES) throw new Error("Recovery target exceeds the per-file snapshot limit: " + path);
        before = await readFile(target);
        const statAfter = await lstat(target);
        if (statAfter.isSymbolicLink() || statBefore.dev !== statAfter.dev || statBefore.ino !== statAfter.ino || statBefore.size !== statAfter.size || statBefore.mtimeMs !== statAfter.mtimeMs) {
          throw new Error("Recovery target changed while its before-image was read: " + path);
        }
        mode = statBefore.mode & 0o777;
      } catch (error) {
        if (!isMissing(error)) throw error;
      }
      if (change.operation === "add" && before !== null) throw new Error("Add target already exists: " + path);
      if (change.operation !== "add" && before === null) throw new Error("Existing target is missing: " + path);
      if (before !== null && change.expectedHash !== sha(before)) throw new Error("Expected hash mismatch before snapshot: " + path);
      if (change.operation === "add" && change.expectedHash !== null) throw new Error("Add target must have a null expected hash.");
      const desired = change.operation === "delete" ? null : Buffer.from(change.content ?? "", "utf8");
      totalBytes += before?.byteLength ?? 0;
      totalBytes += desired?.byteLength ?? 0;
      if (totalBytes > MAX_SNAPSHOT_BYTES) throw new Error("Recovery snapshot exceeds the total byte limit.");
      images.push({
        path, existed: before !== null, beforeHash: before ? sha(before) : null,
        beforeBase64: before ? before.toString("base64") : null, mode,
        afterHash: desired === null ? null : sha(desired)
      });
    }
    const snapshot: SnapshotFile = {
      schemaVersion: 1, transactionId: input.transactionId, snapshotId, manifestDigest: input.manifestDigest,
      createdAt: new Date().toISOString(), status: "pending", images
    };
    const dir = this.snapshotDir(snapshotId);
    await mkdir(dir, { recursive: false, mode: 0o700 });
    const serialized = JSON.stringify(snapshot);
    if (Buffer.byteLength(serialized) > MAX_SNAPSHOT_BYTES) throw new Error("Recovery metadata exceeds the total byte limit.");
    const metadata = await open(resolve(dir, "snapshot.json"), constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL, 0o600);
    try { await metadata.writeFile(serialized, "utf8"); await metadata.sync(); } finally { await metadata.close(); }
    await this.syncDirectory(dir);
    await this.syncDirectory(this.storeRoot);
    return {
      transactionId: snapshot.transactionId, snapshotId, manifestDigest: snapshot.manifestDigest,
      paths: images.map((image) => image.path), evidence: ["Persisted and fsynced " + images.length + " before-image records."]
    };
  }

  async complete(input: { transactionId: string; snapshotId: string; outcome: "committed" | "rolled-back" }): Promise<void> {
    const snapshot = await this.readSnapshot(input.snapshotId);
    if (snapshot.transactionId !== input.transactionId) throw new Error("Recovery snapshot transaction mismatch.");
    if (snapshot.status !== "pending") {
      if ((input.outcome === "committed" && snapshot.status === "committed") || (input.outcome === "rolled-back" && ["rolled-back", "recovered"].includes(snapshot.status))) return;
      throw new Error("Recovery snapshot is already terminal.");
    }
    snapshot.status = input.outcome;
    await this.writeSnapshot(snapshot);
  }

  async listPending(): Promise<Array<{ transactionId: string; snapshotId: string; manifestDigest: string }>> {
    await mkdir(this.storeRoot, { recursive: true, mode: 0o700 });
    const result: Array<{ transactionId: string; snapshotId: string; manifestDigest: string }> = [];
    for (const name of await readdir(this.storeRoot)) {
      if (!/^[0-9a-f-]{36}$/.test(name)) continue;
      try {
        const snapshot = await this.readSnapshot(name);
        if (snapshot.status === "pending") result.push({ transactionId: snapshot.transactionId, snapshotId: snapshot.snapshotId, manifestDigest: snapshot.manifestDigest });
      } catch { /* Corrupt snapshots are surfaced by explicit recovery, never auto-restored. */ }
    }
    return result;
  }

  async recover(input: { transactionId: string }): Promise<RecoveryOutcome> {
    const matches: SnapshotFile[] = [];
    for (const pending of await this.listPending()) if (pending.transactionId === input.transactionId) matches.push(await this.readSnapshot(pending.snapshotId));
    if (matches.length !== 1) return { status: "conflict", evidence: [], blockers: ["Expected exactly one pending snapshot; found " + matches.length + "."] };
    const snapshot = matches[0]!;
    const actions: Array<{ image: BeforeImage; target: string; before: Buffer | null; current: Buffer | null }> = [];
    const evidence: string[] = [];
    for (const image of snapshot.images) {
      const target = this.target(image.path);
      try {
        await this.assertNoSymlinkParents(image.path);
        const stat = await lstat(target);
        if (stat.isSymbolicLink() || !stat.isFile() || stat.nlink > 1) return { status: "conflict", evidence, blockers: ["Target is no longer a safe regular file: " + image.path] };
        const current = await readFile(target);
        const before = image.beforeBase64 === null ? null : Buffer.from(image.beforeBase64, "base64");
        const currentHash = sha(current);
        if (image.existed && currentHash === image.beforeHash) {
          evidence.push("Already at before-image: " + image.path);
          continue;
        }
        if (!image.existed && currentHash === image.afterHash) {
          actions.push({ image, target, before, current });
          continue;
        }
        if (image.existed && currentHash === image.afterHash) {
          actions.push({ image, target, before, current });
          continue;
        }
        return { status: "conflict", evidence, blockers: ["Target differs from both approved before-image and expected after-image: " + image.path] };
      } catch (error) {
        if (!isMissing(error)) return { status: "failed", evidence, blockers: ["Could not inspect recovery target " + image.path + ": " + String(error).slice(0, 200)] };
        if (image.existed) {
          const before = image.beforeBase64 === null ? null : Buffer.from(image.beforeBase64, "base64");
          actions.push({ image, target, before, current: null });
        } else {
          evidence.push("New target is already absent: " + image.path);
        }
      }
    }
    for (const action of actions) {
      await this.assertNoSymlinkParents(action.image.path);
      if (action.image.existed) {
        const bytes = action.before!;
        const temp = resolve(dirname(action.target), ".aifiar-recovery-" + randomUUID() + ".tmp");
        const handle = await open(temp, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL, action.image.mode ?? 0o600);
        try { await handle.writeFile(bytes); await handle.sync(); } finally { await handle.close(); }
        try {
          const now = await this.readOptional(action.target);
          const nowHash = now === null ? null : sha(now);
          if (nowHash !== (action.current === null ? null : sha(action.current))) throw new Error("Target changed during recovery: " + action.image.path);
          await rename(temp, action.target);
          await this.syncDirectory(dirname(action.target));
        } finally { await rm(temp, { force: true }).catch(() => undefined); }
      } else {
        const now = await this.readOptional(action.target);
        if (now === null || sha(now) !== action.image.afterHash) throw new Error("New target changed during recovery: " + action.image.path);
        await rm(action.target);
        await this.syncDirectory(dirname(action.target));
      }
      evidence.push("Restored before-image: " + action.image.path);
    }
    for (const image of snapshot.images) {
      const current = await this.readOptional(this.target(image.path));
      if (image.existed ? current === null || sha(current) !== image.beforeHash : current !== null) {
        return { status: "failed", evidence, blockers: ["Post-recovery verification failed: " + image.path] };
      }
    }
    snapshot.status = "recovered";
    await this.writeSnapshot(snapshot);
    return { status: "restored", evidence: [...evidence, "Verified every target against its before-image."], blockers: [] };
  }

  private target(path: string): string {
    const target = resolve(this.workspaceRoot, ...safeRelativePath(path).split("/"));
    if (!isInside(this.workspaceRoot, target) || target === this.workspaceRoot) throw new Error("Recovery target escapes workspace.");
    return target;
  }
  private snapshotDir(id: string): string {
    if (!/^[0-9a-f-]{36}$/.test(id)) throw new Error("Invalid recovery snapshot identifier.");
    return resolve(this.storeRoot, id);
  }
  private async assertDirectory(path: string): Promise<void> {
    const stat = await lstat(path);
    if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error("Trusted directory must not be a symlink: " + path);
  }
  private async assertNoSymlinkParents(path: string): Promise<void> {
    const target = this.target(path);
    let current = this.workspaceRoot;
    for (const part of relative(this.workspaceRoot, dirname(target)).split(sep).filter(Boolean)) {
      current = resolve(current, part);
      try {
        const stat = await lstat(current);
        if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error("Recovery parent is not a regular directory: " + part);
      } catch (error) {
        if (isMissing(error)) throw new Error("Recovery parent directory does not exist: " + part);
        throw error;
      }
    }
  }
  private async readOptional(path: string): Promise<Buffer | null> {
    try {
      const stat = await lstat(path);
      if (stat.isSymbolicLink() || !stat.isFile() || stat.nlink > 1) throw new Error("Recovery target is not a safe regular file.");
      return await readFile(path);
    } catch (error) { if (isMissing(error)) return null; throw error; }
  }
  private async readSnapshot(id: string): Promise<SnapshotFile> {
    const dir = this.snapshotDir(id);
    await this.assertDirectory(dir);
    const path = resolve(dir, "snapshot.json");
    const stat = await lstat(path);
    if (stat.isSymbolicLink() || !stat.isFile() || stat.size > MAX_SNAPSHOT_BYTES) throw new Error("Invalid recovery snapshot file.");
    const parsed: unknown = JSON.parse(await readFile(path, "utf8"));
    if (!parsed || typeof parsed !== "object" || (parsed as SnapshotFile).schemaVersion !== 1 ||
      (parsed as SnapshotFile).snapshotId !== id || !ID.test((parsed as SnapshotFile).transactionId) ||
      !HASH.test((parsed as SnapshotFile).manifestDigest) || !Array.isArray((parsed as SnapshotFile).images)) {
      throw new Error("Recovery snapshot schema is invalid.");
    }
    const snapshot = parsed as SnapshotFile;
    for (const image of snapshot.images) {
      safeRelativePath(image.path);
      if (!(image.beforeBase64 === null || typeof image.beforeBase64 === "string") ||
        !(image.beforeHash === null || HASH.test(image.beforeHash)) ||
        !(image.afterHash === null || HASH.test(image.afterHash)) ||
        (image.existed && (image.beforeBase64 === null || image.beforeHash === null)) ||
        (!image.existed && (image.beforeBase64 !== null || image.beforeHash !== null))) throw new Error("Recovery snapshot image is invalid.");
      if (image.beforeBase64 !== null) {
        const bytes = Buffer.from(image.beforeBase64, "base64");
        if (bytes.toString("base64") !== image.beforeBase64 || sha(bytes) !== image.beforeHash) throw new Error("Recovery before-image integrity check failed.");
      }
    }
    return snapshot;
  }
  private async writeSnapshot(snapshot: SnapshotFile): Promise<void> {
    const dir = this.snapshotDir(snapshot.snapshotId);
    const temp = resolve(dir, "snapshot-" + randomUUID() + ".tmp");
    const target = resolve(dir, "snapshot.json");
    const handle = await open(temp, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL, 0o600);
    try { await handle.writeFile(JSON.stringify(snapshot), "utf8"); await handle.sync(); } finally { await handle.close(); }
    await rename(temp, target);
    await this.syncDirectory(dir);
  }
  private async syncDirectory(path: string): Promise<void> {
    if (process.platform === "win32") return;
    const handle = await open(path, constants.O_RDONLY);
    try { await handle.sync(); } finally { await handle.close(); }
  }
}
