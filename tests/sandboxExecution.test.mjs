import test from "node:test";
import assert from "node:assert/strict";
import { runSandboxedCommand } from "../dist/core/sandboxExecution.js";

const attestation = {
  runtimeId: "test-container",
  isolation: "container",
  filesystem: "workspace-only",
  network: "disabled",
  credentials: "unavailable",
  shell: false,
  resourceLimitsEnforced: true
};
const request = {
  command: "npm",
  args: ["test", "--", "--runInBand"],
  workingDirectory: "workspace/project",
  environment: { CI: "true" },
  timeoutMs: 60_000,
  maxOutputBytes: 16_384
};
const policy = { allowedExecutables: ["npm"] };

test("sandbox wrapper delegates only after validating the host isolation contract", async () => {
  let invoked = 0;
  const result = await runSandboxedCommand({
    attestation,
    run: async input => {
      invoked++;
      assert.equal(input.command, "npm");
      return { exitCode: 0, timedOut: false, stdout: "passed", stderr: "", durationMs: 120 };
    }
  }, request, policy);
  assert.equal(invoked, 1);
  assert.equal(result.exitCode, 0);
});

test("sandbox wrapper fails closed for missing isolation guarantees", async () => {
  await assert.rejects(() => runSandboxedCommand({
    attestation: { ...attestation, network: "enabled" },
    run: async () => { throw new Error("must not run"); }
  }, request, policy), /isolation contract/);
});

test("sandbox wrapper rejects shell commands and non-allowlisted executables", async () => {
  const runtime = { attestation, run: async () => ({ exitCode: 0, timedOut: false, stdout: "", stderr: "", durationMs: 1 }) };
  await assert.rejects(() => runSandboxedCommand(runtime, { ...request, command: "bash" }, { allowedExecutables: ["bash"] }), /allowlist or attempts shell/);
  await assert.rejects(() => runSandboxedCommand(runtime, { ...request, command: "python" }, policy), /allowlist/);
});

test("sandbox wrapper rejects traversal, credential environment variables, and unbounded output", async () => {
  const runtime = { attestation, run: async () => ({ exitCode: 0, timedOut: false, stdout: "x".repeat(20_000), stderr: "", durationMs: 1 }) };
  await assert.rejects(() => runSandboxedCommand(runtime, { ...request, workingDirectory: "../outside" }, policy), /workspace-relative/);
  await assert.rejects(() => runSandboxedCommand(runtime, { ...request, environment: { API_KEY: "secret" } }, policy), /credential-like/);
  await assert.rejects(() => runSandboxedCommand(runtime, request, policy), /oversized result/);
});
