export interface CommandPolicy {
  allowedExecutables: string[];
  maxTimeoutMs?: number;
  maxOutputBytes?: number;
  maxArguments?: number;
  allowNetwork?: boolean;
  allowShell?: boolean;
  deniedArgumentPatterns?: RegExp[];
}

export interface CommandRequest {
  executable: string;
  args: string[];
  timeoutMs?: number;
  cwd?: string;
  shell?: boolean;
  networkRequired?: boolean;
}

export interface CommandPolicyReport {
  allowed: boolean;
  executable?: string;
  timeoutMs: number;
  maxOutputBytes: number;
  blockers: string[];
  warnings: string[];
}

const DEFAULT_DENIED = [
  /(^|[\\s/])rm(\.exe)?[\\s]+.*-[^\\s]*r[^\\s]*f/i,
  /(^|[\\s/])format(\.com|\.exe)?([\\s]|$)/i,
  /(^|[\\s/])diskpart(\.exe)?([\\s]|$)/i,
  /(^|[\\s/])shutdown(\.exe)?([\\s]|$)/i,
  /(^|[\\s/])reg(\.exe)?[\\s]+(delete|add)/i,
  /(?:curl|wget)[\\s]+[^\\n]*(?:\\||&&|;)/i
];

export function evaluateCommandRequest(request: CommandRequest, policy: CommandPolicy): CommandPolicyReport {
  const blockers: string[] = [];
  const warnings: string[] = [];
  const executable = request.executable.trim().replace(/\\\\/g, "/").split("/").pop()?.toLowerCase() ?? "";
  const allowed = new Set(policy.allowedExecutables.map((item) => item.trim().replace(/\\\\/g, "/").split("/").pop()?.toLowerCase()).filter(Boolean));
  const timeoutMs = request.timeoutMs ?? Math.min(policy.maxTimeoutMs ?? 30_000, 30_000);
  const maxTimeoutMs = policy.maxTimeoutMs ?? 30_000;
  const maxOutputBytes = policy.maxOutputBytes ?? 1_000_000;
  const maxArguments = policy.maxArguments ?? 100;

  if (!executable) blockers.push("Command executable is required.");
  if (/[\\s;&|<>$\x60]/.test(request.executable)) blockers.push("Executable must be a single executable name or path, not a shell expression.");
  if (!allowed.has(executable)) blockers.push("Executable is not on the configured allowlist: " + executable);
  if (request.shell === true && policy.allowShell !== true) blockers.push("Shell execution is disabled by policy.");
  if (request.networkRequired === true && policy.allowNetwork !== true) blockers.push("Network-dependent command is disabled by policy.");
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > maxTimeoutMs) blockers.push("Requested timeout is outside the configured limit.");
  if (request.args.length > maxArguments) blockers.push("Argument count exceeds the configured limit.");
  if (request.args.some((arg) => arg.includes("\\0"))) blockers.push("Arguments may not contain NUL characters.");
  const deniedPatterns = [...DEFAULT_DENIED, ...(policy.deniedArgumentPatterns ?? [])];
  const joinedArgs = request.args.join(" ");
  if (deniedPatterns.some((pattern) => pattern.test(executable + " " + joinedArgs))) {
    blockers.push("Command matches a denied high-impact command pattern.");
  }
  if (request.cwd && (request.cwd.includes("\\0") || request.cwd.trim() === "")) blockers.push("Working directory is invalid.");
  warnings.push("This report is policy evaluation only. The host must enforce workspace containment, process isolation, timeout termination, and output limits.");
  return {
    allowed: blockers.length === 0,
    ...(executable ? { executable } : {}),
    timeoutMs,
    maxOutputBytes,
    blockers: [...new Set(blockers)],
    warnings
  };
}
