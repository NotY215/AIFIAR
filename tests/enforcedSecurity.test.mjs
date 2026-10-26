import test from "node:test";
import assert from "node:assert/strict";
import { evaluateActionGate } from "../dist/core/actionGate.js";
import { checkPlannedFilesFresh } from "../dist/core/fileFreshnessGate.js";
import { evaluateCommandRequest } from "../dist/core/commandPolicy.js";
import { findPotentialSecrets, redactPotentialSecrets } from "../dist/core/secretRedaction.js";
import { runPreflight } from "../dist/core/recheckPipeline.js";

test("edit action fails closed without workspace confirmation", () => {
  const report = evaluateActionGate({ action: "edit" });
  assert.equal(report.allowed, false);
  assert.ok(report.blockers.some((item) => item.includes("trusted, bounded workspace")));
});

test("sensitive patch requires approval and blocks without it", () => {
  const report = evaluateActionGate({
    action: "edit",
    trustedWorkspaceConfirmed: true,
    changes: [{ path: ".env.production", operation: "modify", content: "safe=1" }]
  });
  assert.equal(report.allowed, false);
  assert.equal(report.requiresApproval, true);
});

test("file freshness gate blocks modified, missing, and unsafe planned files", () => {
  const report = checkPlannedFilesFresh(
    [{ path: "src/a.ts", contentHash: "old" }, { path: "src/gone.ts", contentHash: "gone" }, { path: "../bad", contentHash: null }],
    [{ path: "src/a.ts", contentHash: "new" }, { path: "src/extra.ts", contentHash: "extra" }]
  );
  assert.equal(report.fresh, false);
  assert.ok(report.changed.includes("src/a.ts"));
  assert.ok(report.missingFromCurrent.includes("src/gone.ts"));
  assert.ok(report.blockers.some((item) => item.includes("Unsafe planned path")));
});

test("command policy rejects unlisted executables, shell syntax, and oversized timeout", () => {
  const report = evaluateCommandRequest(
    { executable: "sh", args: ["-c", "echo hi"], shell: true, timeoutMs: 90_000 },
    { allowedExecutables: ["node"], maxTimeoutMs: 10_000, allowShell: false }
  );
  assert.equal(report.allowed, false);
  assert.ok(report.blockers.some((item) => item.includes("allowlist")));
  assert.ok(report.blockers.some((item) => item.includes("Shell execution")));
  assert.ok(report.blockers.some((item) => item.includes("timeout")));
});

test("secret detection and redaction protect outbound text", () => {
  const raw = "Authorization: Bearer abcdefghijklmnopqrstuvwxyz123456 and ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ123456";
  const findings = findPotentialSecrets(raw);
  assert.ok(findings.length >= 2);
  const redacted = redactPotentialSecrets(raw);
  assert.equal(redacted.changed, true);
  assert.ok(!redacted.text.includes("ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ123456"));
  assert.ok(!redacted.text.includes("abcdefghijklmnopqrstuvwxyz123456"));
});

test("preflight blocks stale files and refuses outbound secrets when configured", () => {
  const report = runPreflight({
    action: { action: "edit", trustedWorkspaceConfirmed: true },
    plannedFiles: [{ path: "src/a.ts", contentHash: "before" }],
    currentFiles: [{ path: "src/a.ts", contentHash: "after" }],
    outboundText: "api_key=ABCDEFGHIJKLMNOPQRSTUVWX",
    rejectOutboundSecrets: true
  });
  assert.equal(report.allowed, false);
  assert.ok(report.blockers.some((item) => item.includes("changed since planning")));
  assert.ok(report.blockers.some((item) => item.includes("Outbound content contains potential secrets")));
});

test("preflight redacts secrets by default and returns only the redacted text", () => {
  const report = runPreflight({
    action: { action: "read" },
    outboundText: "client_secret=ABCDEFGHIJKLMNOPQRSTUVWX"
  });
  assert.equal(report.allowed, true);
  assert.ok(report.outboundText?.includes("[REDACTED]"));
  assert.equal(report.redactedSecretCount, 1);
});
