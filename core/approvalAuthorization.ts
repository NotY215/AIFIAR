export type ApprovalChangeOperation = "add" | "modify" | "delete" | "rename";

export interface ApprovalAuthorizationPrincipal {
  authenticated: boolean;
  subjectId: string;
  roles: readonly string[];
  repositoryIds: readonly string[];
  taskIds: readonly string[];
  allowedPathPrefixes: readonly string[];
}

export interface ApprovalAuthorizationChange {
  path: string;
  operation: ApprovalChangeOperation;
}

export interface ApprovalAuthorizationPolicy {
  maxChanges?: number;
  protectedPathPrefixes?: readonly string[];
  deniedPathPrefixes?: readonly string[];
}

export interface ApprovalAuthorizationRequest {
  repositoryId: string;
  taskId: string;
  proposalDigest: string;
  changes: readonly ApprovalAuthorizationChange[];
}

export interface ApprovalAuthorizationResult {
  allowed: boolean;
  subjectId: string;
  blockers: string[];
  protectedPaths: string[];
  deniedPaths: string[];
}

const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/;
const HASH = /^[a-f0-9]{64}$/;
const DEFAULT_PROTECTED = [".github/workflows", ".aifiar", "SECURITY.md", ".env*", "credentials", "secrets"];
const DEFAULT_DENIED = [".git", ".aifiar/recovery", ".aifiar/approvals"];

function safePath(value: string): string | null {
  if (typeof value !== "string" || !value || value.includes(String.fromCharCode(0)) ||
      value.includes(String.fromCharCode(92)) || value.startsWith("/") || /^[A-Za-z]:/.test(value)) return null;
  const parts = value.split("/");
  if (parts.some((part) => !part || part === "." || part === "..")) return null;
  return parts.join("/");
}

function matchesPrefix(path: string, prefix: string): boolean {
  if (prefix === "*") return true;
  if (prefix.endsWith("*")) return path.toLowerCase().startsWith(prefix.slice(0, -1).toLowerCase());
  const normalized = safePath(prefix);
  if (!normalized) return false;
  const candidate = path.toLowerCase();
  const rule = normalized.toLowerCase();
  return candidate === rule || candidate.startsWith(rule + "/");
}

/**
 * Evaluates host-supplied identity and authorization claims for a proposed patch.
 * It does not authenticate users or issue approval receipts; the host must do so.
 */
export function authorizePatchApproval(input: {
  principal: ApprovalAuthorizationPrincipal;
  request: ApprovalAuthorizationRequest;
  policy?: ApprovalAuthorizationPolicy;
}): ApprovalAuthorizationResult {
  const principal = input?.principal;
  const request = input?.request;
  const policy = input?.policy ?? {};
  const blockers: string[] = [];
  const protectedPaths: string[] = [];
  const deniedPaths: string[] = [];
  const subjectId = typeof principal?.subjectId === "string" ? principal.subjectId : "";
  const roles = new Set(Array.isArray(principal?.roles) ? principal.roles : []);
  const repositories = Array.isArray(principal?.repositoryIds) ? principal.repositoryIds : [];
  const tasks = Array.isArray(principal?.taskIds) ? principal.taskIds : [];
  const allowedPrefixes = Array.isArray(principal?.allowedPathPrefixes) ? principal.allowedPathPrefixes : [];

  if (principal?.authenticated !== true) blockers.push("Host did not authenticate the approval principal.");
  if (!ID.test(subjectId)) blockers.push("Authenticated principal has an invalid subject ID.");
  if (!ID.test(request?.repositoryId ?? "") || !ID.test(request?.taskId ?? "") || !HASH.test(request?.proposalDigest ?? "")) {
    blockers.push("Approval request has an invalid repository ID, task ID, or proposal digest.");
  }
  if (!repositories.includes(request?.repositoryId)) blockers.push("Principal is not authorized for this repository.");
  if (!tasks.includes(request?.taskId)) blockers.push("Principal is not authorized for this task.");

  const maxChanges = policy.maxChanges ?? 50;
  if (!Number.isInteger(maxChanges) || maxChanges < 1 || maxChanges > 500) {
    blockers.push("Authorization policy maxChanges must be an integer from 1 to 500.");
  }
  const changes = Array.isArray(request?.changes) ? request.changes : [];
  if (changes.length === 0 || changes.length > maxChanges) {
    blockers.push("Proposal change count is empty or exceeds the authorization limit.");
  }

  if (![...roles].some((role) => ["developer", "maintainer", "security-admin"].includes(role))) {
    blockers.push("Principal lacks an approval-capable role.");
  }
  const seen = new Set<string>();
  const protectedRules = policy.protectedPathPrefixes ?? DEFAULT_PROTECTED;
  const deniedRules = policy.deniedPathPrefixes ?? DEFAULT_DENIED;

  for (const change of changes) {
    const path = safePath(change?.path);
    if (!path) {
      blockers.push("Proposal contains an unsafe path.");
      continue;
    }
    const key = path.toLowerCase();
    if (seen.has(key)) blockers.push("Proposal contains duplicate target paths.");
    seen.add(key);

    if (!allowedPrefixes.some((prefix) => matchesPrefix(path, prefix))) {
      blockers.push("Principal is not authorized for path: " + path);
    }
    if (deniedRules.some((prefix) => matchesPrefix(path, prefix))) deniedPaths.push(path);
    if (protectedRules.some((prefix) => matchesPrefix(path, prefix))) protectedPaths.push(path);

    if (!["add", "modify", "delete", "rename"].includes(change.operation)) {
      blockers.push("Proposal contains an unsupported change operation.");
    } else if (change.operation === "delete" && !roles.has("maintainer") && !roles.has("security-admin")) {
      blockers.push("Deleting files requires maintainer or security-admin role.");
    }
  }

  if (deniedPaths.length) blockers.push("Proposal targets host-managed state that must never be edited by a model workflow.");
  if (protectedPaths.length && !roles.has("security-admin")) {
    blockers.push("Protected paths require an authenticated security-admin approval.");
  }

  return {
    allowed: blockers.length === 0,
    subjectId,
    blockers: [...new Set(blockers)],
    protectedPaths: [...new Set(protectedPaths)],
    deniedPaths: [...new Set(deniedPaths)]
  };
}
