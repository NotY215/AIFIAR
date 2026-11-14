export interface SandboxRuntimeAttestation {
  runtimeId: string;
  isolation: "container" | "virtual-machine";
  filesystem: "workspace-only";
  network: "disabled";
  credentials: "unavailable";
  shell: false;
  resourceLimitsEnforced: true;
}

export interface SandboxCommandRequest {
  command: string;
  args: readonly string[];
  workingDirectory: string;
  environment?: Readonly<Record<string, string>>;
  timeoutMs: number;
  maxOutputBytes: number;
}

export interface SandboxCommandResult {
  exitCode: number | null;
  timedOut: boolean;
  stdout: string;
  stderr: string;
  durationMs: number;
}

export interface SandboxRuntime {
  readonly attestation: SandboxRuntimeAttestation;
  run(request: SandboxCommandRequest): Promise<SandboxCommandResult>;
}

export interface SandboxExecutionPolicy {
  allowedExecutables: readonly string[];
  maxTimeoutMs?: number;
  maxOutputBytes?: number;
}

const SHELL_NAMES = new Set(["sh", "bash", "dash", "zsh", "fish", "cmd", "cmd.exe", "powershell", "powershell.exe", "pwsh", "pwsh.exe"]);
const ENV_NAME = /^[A-Za-z_][A-Za-z0-9_]{0,127}$/;

function byteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function validateAttestation(attestation: SandboxRuntimeAttestation): void {
  if (!attestation || typeof attestation !== "object" ||
      !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(attestation.runtimeId) ||
      !["container", "virtual-machine"].includes(attestation.isolation) ||
      attestation.filesystem !== "workspace-only" ||
      attestation.network !== "disabled" ||
      attestation.credentials !== "unavailable" ||
      attestation.shell !== false ||
      attestation.resourceLimitsEnforced !== true) {
    throw new Error("Sandbox runtime does not meet the required isolation contract.");
  }
}

function validateRequest(request: SandboxCommandRequest, policy: SandboxExecutionPolicy): void {
  if (!request || typeof request !== "object") throw new Error("Sandbox request is required.");
  const allowed = new Set(policy.allowedExecutables);
  const executable = request.command.split(/[\\/]/).pop()?.toLowerCase() ?? "";
  if (!request.command || request.command.length > 512 || SHELL_NAMES.has(executable) || !allowed.has(request.command)) {
    throw new Error("Command is not in the trusted executable allowlist or attempts shell execution.");
  }
  if (!Array.isArray(request.args) || request.args.length > 128 ||
      request.args.some(arg => typeof arg !== "string" || arg.length > 8192 || arg.includes("\0"))) {
    throw new Error("Sandbox arguments are invalid or exceed their bounds.");
  }
  if (!request.workingDirectory || request.workingDirectory.startsWith("/") ||
      /^[A-Za-z]:/.test(request.workingDirectory) ||
      request.workingDirectory.split(/[\\/]/).some(part => part === ".." || part === "." || part === "")) {
    throw new Error("Sandbox working directory must be a normalized workspace-relative path.");
  }
  const maxTimeoutMs = policy.maxTimeoutMs ?? 10 * 60 * 1000;
  const maxOutputBytes = policy.maxOutputBytes ?? 1024 * 1024;
  if (!Number.isSafeInteger(request.timeoutMs) || request.timeoutMs < 1000 || request.timeoutMs > maxTimeoutMs) {
    throw new Error("Sandbox timeout is outside the configured policy.");
  }
  if (!Number.isSafeInteger(request.maxOutputBytes) || request.maxOutputBytes < 1024 || request.maxOutputBytes > maxOutputBytes) {
    throw new Error("Sandbox output limit is outside the configured policy.");
  }
  const environment = request.environment ?? {};
  if (Object.keys(environment).length > 64) throw new Error("Sandbox environment contains too many variables.");
  for (const [key, value] of Object.entries(environment)) {
    if (!ENV_NAME.test(key) || /TOKEN|SECRET|PASSWORD|API_KEY|CREDENTIAL|PRIVATE_KEY/i.test(key) ||
        typeof value !== "string" || value.length > 4096 || value.includes("\0")) {
      throw new Error("Sandbox environment contains an invalid or credential-like variable.");
    }
  }
}

/**
 * Calls only a host-supplied isolated runtime. This module never spawns a
 * process itself and fails closed when the host cannot attest the isolation
 * properties required by policy.
 */
export async function runSandboxedCommand(
  runtime: SandboxRuntime,
  request: SandboxCommandRequest,
  policy: SandboxExecutionPolicy
): Promise<SandboxCommandResult> {
  validateAttestation(runtime?.attestation);
  validateRequest(request, policy);
  const result = await runtime.run(request);
  if (!result || typeof result !== "object" ||
      !(result.exitCode === null || Number.isSafeInteger(result.exitCode)) ||
      typeof result.timedOut !== "boolean" ||
      typeof result.stdout !== "string" || typeof result.stderr !== "string" ||
      !Number.isFinite(result.durationMs) || result.durationMs < 0 ||
      byteLength(result.stdout) + byteLength(result.stderr) > request.maxOutputBytes) {
    throw new Error("Sandbox runtime returned an invalid or oversized result.");
  }
  return result;
}
