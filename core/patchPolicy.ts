export interface PatchPolicy {
  protectedPaths: string[];
  allowNewFiles: boolean;
  requireApprovalForProtectedPaths: boolean;
}

export interface PatchAssessment {
  allowedToPropose: boolean;
  requiresApproval: boolean;
  matchedProtectedPaths: string[];
  reasons: string[];
}

function matches(path: string, rule: string): boolean {
  const normalizedPath = path.replace(/\\/g, "/").replace(/^\.\//, "");
  const normalizedRule = rule.replace(/\\/g, "/").replace(/^\.\//, "").replace(/\/$/, "");
  return normalizedPath === normalizedRule || normalizedPath.startsWith(`${normalizedRule}/`);
}

export function assessPatch(paths: string[], isNewFile: boolean, policy: PatchPolicy): PatchAssessment {
  const protectedPaths = paths.filter((path) => policy.protectedPaths.some((rule) => matches(path, rule)));
  const reasons: string[] = [];
  if (isNewFile && !policy.allowNewFiles) reasons.push("Policy does not allow creating new files");
  if (protectedPaths.length) reasons.push("Patch touches protected paths");
  return {
    allowedToPropose: !(isNewFile && !policy.allowNewFiles),
    requiresApproval: protectedPaths.length > 0 && policy.requireApprovalForProtectedPaths,
    matchedProtectedPaths: protectedPaths,
    reasons
  };
}
