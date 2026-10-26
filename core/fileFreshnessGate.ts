export interface PlannedFileState {
  path: string;
  contentHash: string | null;
}

export interface CurrentFileState {
  path: string;
  contentHash: string | null;
}

export interface FileFreshnessGateReport {
  fresh: boolean;
  changed: string[];
  missingFromCurrent: string[];
  unexpectedCurrent: string[];
  blockers: string[];
}

export function checkPlannedFilesFresh(
  planned: readonly PlannedFileState[],
  current: readonly CurrentFileState[],
  options: { requireExactSet?: boolean } = {}
): FileFreshnessGateReport {
  const blockers: string[] = [];
  const changed: string[] = [];
  const missingFromCurrent: string[] = [];
  const unexpectedCurrent: string[] = [];
  const plannedByPath = new Map<string, PlannedFileState>();
  const currentByPath = new Map<string, CurrentFileState>();

  for (const file of planned) {
    if (!isSafeRelativePath(file.path)) blockers.push("Unsafe planned path: " + file.path);
    if (plannedByPath.has(file.path)) blockers.push("Duplicate planned path: " + file.path);
    plannedByPath.set(file.path, file);
  }
  for (const file of current) {
    if (!isSafeRelativePath(file.path)) blockers.push("Unsafe current path: " + file.path);
    if (currentByPath.has(file.path)) blockers.push("Duplicate current path: " + file.path);
    currentByPath.set(file.path, file);
  }

  for (const [path, previous] of plannedByPath) {
    const now = currentByPath.get(path);
    if (!now) {
      missingFromCurrent.push(path);
      blockers.push("Planned file is missing or unreadable: " + path);
    } else if (previous.contentHash !== now.contentHash) {
      changed.push(path);
      blockers.push("File changed since planning; reassess before applying: " + path);
    }
  }
  for (const path of currentByPath.keys()) {
    if (!plannedByPath.has(path)) {
      unexpectedCurrent.push(path);
      if (options.requireExactSet) blockers.push("Unexpected file is present in the apply set: " + path);
    }
  }

  return {
    fresh: blockers.length === 0,
    changed: changed.sort(),
    missingFromCurrent: missingFromCurrent.sort(),
    unexpectedCurrent: unexpectedCurrent.sort(),
    blockers: [...new Set(blockers)]
  };
}

function isSafeRelativePath(path: string): boolean {
  if (!path.trim() || path.includes("\0")) return false;
  const normalized = path.replace(/\\/g, "/");
  return !normalized.startsWith("/") && !/^[A-Za-z]:/.test(normalized) &&
    normalized.split("/").every((part) => part !== "" && part !== "." && part !== "..");
}
