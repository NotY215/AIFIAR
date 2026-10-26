export interface PatchValidationPolicy {
  protectedPaths?: string[];
  maxFiles?: number;
  maxPatchBytes?: number;
  allowDeletes?: boolean;
  allowBinary?: boolean;
  rejectSensitivePaths?: boolean;
}

export interface PatchFileChange {
  path: string;
  operation: "add" | "modify" | "delete" | "rename";
  content?: string;
  previousPath?: string;
  binary?: boolean;
}

export interface PatchValidationReport {
  valid: boolean;
  requiresApproval: boolean;
  errors: string[];
  warnings: string[];
  normalizedPaths: string[];
}

const SENSITIVE_NAMES = /(^|\/)(\.env(\.|$)|id_rsa|id_ed25519|credentials(\.|$)|secrets?(\.|$)|[^/]*\.pem$|[^/]*\.p12$)/i;
const SECRET_PATTERNS = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\bgh[pousr]_[A-Za-z0-9_]{20,}\b/,
  /\bsk-[A-Za-z0-9]{20,}\b/
];

function normalizeSafePath(path: string): string | null {
  if (!path.trim() || path.includes("\0")) return null;
  const normalized = path.replace(/\\/g, "/");
  if (normalized.startsWith("/") || /^[A-Za-z]:/.test(normalized) || normalized.startsWith("//")) return null;
  const parts = normalized.split("/");
  if (parts.some((part) => !part || part === "." || part === "..")) return null;
  return parts.join("/");
}

function protectedMatch(path: string, rule: string): boolean {
  const safeRule = normalizeSafePath(rule);
  return safeRule !== null && (path === safeRule || path.startsWith(safeRule + "/"));
}

export function validatePatch(changes: readonly PatchFileChange[], policy: PatchValidationPolicy = {}): PatchValidationReport {
  const errors: string[] = [];
  const warnings: string[] = [];
  const normalizedPaths: string[] = [];
  let requiresApproval = false;
  const maxFiles = policy.maxFiles ?? 200;
  const maxPatchBytes = policy.maxPatchBytes ?? 2 * 1024 * 1024;

  if (!Number.isSafeInteger(maxFiles) || maxFiles < 1) errors.push("Configured file limit is invalid.");
  if (!Number.isSafeInteger(maxPatchBytes) || maxPatchBytes < 1) errors.push("Configured patch size limit is invalid.");
  if (changes.length > maxFiles) errors.push("Patch exceeds the maximum number of files.");
  const seen = new Set<string>();
  let totalBytes = 0;

  for (const change of changes) {
    const path = normalizeSafePath(change.path);
    if (!path) {
      errors.push("Patch contains an unsafe or invalid path: " + change.path);
      continue;
    }
    normalizedPaths.push(path);
    if (seen.has(path)) errors.push("Patch contains duplicate target paths: " + path);
    seen.add(path);
    if (policy.rejectSensitivePaths !== false && SENSITIVE_NAMES.test(path)) {
      requiresApproval = true;
      warnings.push("Patch touches a sensitive-looking path and requires explicit review: " + path);
    }
    if ((policy.protectedPaths ?? []).some((rule) => protectedMatch(path, rule))) {
      requiresApproval = true;
      warnings.push("Patch touches a protected path: " + path);
    }
    if (change.operation === "delete" && policy.allowDeletes !== true) {
      errors.push("Deletion is not allowed by patch policy: " + path);
    }
    if (change.binary && policy.allowBinary !== true) errors.push("Binary changes are not allowed: " + path);
    if (change.content !== undefined) {
      totalBytes += Buffer.byteLength(change.content, "utf8");
      if (SECRET_PATTERNS.some((pattern) => pattern.test(change.content!))) {
        errors.push("Potential credential or private-key material detected in patch content: " + path);
      }
    }
    if (change.operation === "rename") {
      const previousPath = change.previousPath ? normalizeSafePath(change.previousPath) : null;
      if (!previousPath) errors.push("Rename requires a safe previousPath: " + path);
      else if (previousPath !== path && seen.has(previousPath)) warnings.push("Rename source also appears as a patch target: " + previousPath);
    }
  }
  if (totalBytes > maxPatchBytes) errors.push("Patch content exceeds the configured byte limit.");
  return { valid: errors.length === 0, requiresApproval, errors, warnings, normalizedPaths };
}
