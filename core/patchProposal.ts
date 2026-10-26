import { createHash } from "node:crypto";
import { validatePatch, type PatchFileChange, type PatchValidationPolicy } from "./patchValidation.js";

export interface ProposedChange extends PatchFileChange {
  expectedHash: string | null;
}

export interface PatchProposal {
  schemaVersion: 1;
  repositoryId: string;
  taskId: string;
  baseCommit: string;
  changes: ProposedChange[];
  digest: string;
}

export interface PatchProposalOptions {
  maxInputBytes?: number;
  maxChanges?: number;
  patchPolicy?: PatchValidationPolicy;
}

export interface PatchProposalParseReport {
  valid: boolean;
  errors: string[];
  warnings: string[];
  proposal?: PatchProposal;
}

export interface PatchApprovalDecision {
  approved: boolean;
  digest: string;
  operatorId: string;
  expiresAt: string;
  decisionId: string;
}

export interface PatchApprovalReport {
  approved: boolean;
  blockers: string[];
  proposalDigest: string;
  operatorId?: string;
  expiresAt?: string;
}

const HASH = /^[a-f0-9]{64}$/i;
const ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$/;
const TOP_KEYS = new Set(["schemaVersion", "repositoryId", "taskId", "baseCommit", "changes"]);
const CHANGE_KEYS = new Set(["path", "operation", "content", "previousPath", "binary", "expectedHash"]);

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  if (isObject(value)) {
    return "{" + Object.keys(value).sort().map((key) => JSON.stringify(key) + ":" + canonical(value[key])).join(",") + "}";
  }
  return JSON.stringify(value) ?? "null";
}
function digestFor(value: Omit<PatchProposal, "digest">): string {
  return createHash("sha256").update(canonical(value), "utf8").digest("hex");
}
function hasOnlyKeys(value: Record<string, unknown>, allowed: Set<string>): boolean {
  return Object.keys(value).every((key) => allowed.has(key));
}

/**
 * Parses untrusted model output into a digest-bound proposal. This function
 * validates a proposal only. It never writes files or grants approval.
 */
export function parsePatchProposal(
  raw: string,
  options: PatchProposalOptions = {}
): PatchProposalParseReport {
  const errors: string[] = [];
  const warnings: string[] = [];
  const maxInputBytes = options.maxInputBytes ?? 2 * 1024 * 1024;
  if (Buffer.byteLength(raw, "utf8") > maxInputBytes) {
    return { valid: false, errors: ["Patch proposal exceeds the input byte limit."], warnings };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { valid: false, errors: ["Patch proposal is not valid JSON."], warnings };
  }
  if (!isObject(parsed)) return { valid: false, errors: ["Patch proposal root must be a JSON object."], warnings };
  if (!hasOnlyKeys(parsed, TOP_KEYS)) errors.push("Patch proposal contains unknown top-level fields.");
  if (parsed.schemaVersion !== 1) errors.push("Unsupported patch proposal schemaVersion.");
  for (const field of ["repositoryId", "taskId", "baseCommit"] as const) {
    if (typeof parsed[field] !== "string" || !(parsed[field] as string).trim() || !ID.test(parsed[field] as string)) {
      errors.push("Patch proposal has an invalid " + field + ".");
    }
  }
  if (!Array.isArray(parsed.changes) || parsed.changes.length === 0) {
    errors.push("Patch proposal must contain at least one change.");
  }
  const maxChanges = options.maxChanges ?? 200;
  if (Array.isArray(parsed.changes) && parsed.changes.length > maxChanges) errors.push("Patch proposal exceeds the change count limit.");

  const changes: ProposedChange[] = [];
  if (Array.isArray(parsed.changes)) {
    for (let i = 0; i < parsed.changes.length; i++) {
      const rawChange: unknown = parsed.changes[i];
      if (!isObject(rawChange)) {
        errors.push("Change " + i + " must be an object.");
        continue;
      }
      if (!hasOnlyKeys(rawChange, CHANGE_KEYS)) errors.push("Change " + i + " contains unknown fields.");
      const path = rawChange.path;
      const operation = rawChange.operation;
      const expectedHash = rawChange.expectedHash;
      if (typeof path !== "string") {
        errors.push("Change " + i + " must specify a path.");
        continue;
      }
      if (!["add", "modify", "delete", "rename"].includes(String(operation))) {
        errors.push("Change " + i + " has an unsupported operation.");
        continue;
      }
      if (!(expectedHash === null || (typeof expectedHash === "string" && HASH.test(expectedHash)))) {
        errors.push("Change " + i + " must provide expectedHash as null or a SHA-256 hex digest.");
      }
      if (operation === "add" && expectedHash !== null) errors.push("Added files must use expectedHash: null.");
      if (operation !== "add" && (typeof expectedHash !== "string" || !HASH.test(expectedHash))) {
        errors.push("Existing-file changes require an expected SHA-256 hash.");
      }
      const content = rawChange.content;
      if (operation === "delete") {
        if (content !== undefined) errors.push("Delete changes must not include content.");
      } else if (typeof content !== "string") {
        errors.push("Non-delete changes must include string content.");
      }
      if (rawChange.binary !== undefined && typeof rawChange.binary !== "boolean") errors.push("Change " + i + " has an invalid binary flag.");
      if (rawChange.previousPath !== undefined && typeof rawChange.previousPath !== "string") errors.push("Change " + i + " has an invalid previousPath.");
      if (operation === "rename" && (typeof rawChange.previousPath !== "string" || !rawChange.previousPath.trim())) {
        errors.push("Rename changes require previousPath.");
      }
      if (operation !== "rename" && rawChange.previousPath !== undefined) errors.push("previousPath is only valid for rename changes.");
      changes.push({
        path,
        operation: operation as ProposedChange["operation"],
        expectedHash: expectedHash as string | null,
        ...(typeof content === "string" ? { content } : {}),
        ...(typeof rawChange.previousPath === "string" ? { previousPath: rawChange.previousPath } : {}),
        ...(typeof rawChange.binary === "boolean" ? { binary: rawChange.binary } : {})
      });
    }
  }
  const patchReport = validatePatch(changes, options.patchPolicy);
  errors.push(...patchReport.errors);
  warnings.push(...patchReport.warnings);
  const paths = patchReport.normalizedPaths;
  if (new Set(paths).size !== paths.length) errors.push("Patch proposal contains duplicate normalized target paths.");
  if (errors.length) return { valid: false, errors: [...new Set(errors)], warnings: [...new Set(warnings)] };

  const unsigned = {
    schemaVersion: 1 as const,
    repositoryId: parsed.repositoryId as string,
    taskId: parsed.taskId as string,
    baseCommit: parsed.baseCommit as string,
    changes: changes.map((change, index) => ({
      path: paths[index]!,
      operation: change.operation,
      expectedHash: change.expectedHash,
      ...(change.content !== undefined ? { content: change.content } : {}),
      ...(change.previousPath !== undefined ? { previousPath: change.previousPath.replace(/\\/g, "/") } : {}),
      ...(change.binary !== undefined ? { binary: change.binary } : {})
    }))
  };
  const proposal: PatchProposal = { ...unsigned, digest: digestFor(unsigned) };
  return { valid: true, errors: [], warnings: [...new Set(warnings)], proposal };
}

/**
 * Approval is delegated to a host callback that must authenticate its operator.
 * The framework checks that the decision binds to this exact proposal digest
 * and is not expired. A boolean from the model is never an approval.
 */
export async function authorizePatchProposal(
  proposal: PatchProposal,
  requestApproval: (request: { digest: string; repositoryId: string; taskId: string; baseCommit: string; changes: readonly ProposedChange[] }) => Promise<PatchApprovalDecision>,
  now = Date.now()
): Promise<PatchApprovalReport> {
  const blockers: string[] = [];
  const { digest, ...unsigned } = proposal;
  const calculated = digestFor(unsigned);
  const revalidated = parsePatchProposal(JSON.stringify(unsigned));
  if (!HASH.test(digest) || calculated !== digest || !revalidated.valid || revalidated.proposal?.digest !== digest) {
    return { approved: false, blockers: ["Proposal digest or proposal validation does not match its contents."], proposalDigest: digest };
  }
  let decision: PatchApprovalDecision;
  try {
    decision = await requestApproval({
      digest,
      repositoryId: proposal.repositoryId,
      taskId: proposal.taskId,
      baseCommit: proposal.baseCommit,
      changes: proposal.changes
    });
  } catch {
    return { approved: false, blockers: ["Host approval service failed or declined to provide a decision."], proposalDigest: digest };
  }
  if (!decision || decision.approved !== true) blockers.push("Host operator did not approve this proposal.");
  if (!decision || decision.digest !== digest) blockers.push("Approval is not bound to the exact proposal digest.");
  if (!decision || typeof decision.operatorId !== "string" || !decision.operatorId.trim()) blockers.push("Approval is missing an authenticated operator identity.");
  if (!decision || typeof decision.decisionId !== "string" || !decision.decisionId.trim()) blockers.push("Approval is missing a decision identifier.");
  const expiry = decision && typeof decision.expiresAt === "string" ? Date.parse(decision.expiresAt) : NaN;
  if (!Number.isFinite(expiry) || expiry <= now) blockers.push("Approval is expired or has an invalid expiry time.");
  if (Number.isFinite(expiry) && expiry > now + 24 * 60 * 60 * 1000) blockers.push("Approval expiry exceeds the 24-hour maximum.");
  const operatorId = decision && typeof decision.operatorId === "string" ? decision.operatorId : "";
  return {
    approved: blockers.length === 0,
    blockers: [...new Set(blockers)],
    proposalDigest: digest,
    ...(operatorId.trim() ? { operatorId } : {}),
    ...(Number.isFinite(expiry) ? { expiresAt: new Date(expiry).toISOString() } : {})
  };
}
