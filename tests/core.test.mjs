import test from "node:test";
import assert from "node:assert/strict";
import { createRequirementLedger, validateRequirementCoverage } from "../dist/core/requirementLedger.js";
import { assembleTaskContext } from "../dist/core/contextAssembler.js";
import { decideRetry } from "../dist/core/retryPolicy.js";
import { rankCandidates } from "../dist/core/capabilityRanking.js";
import { EvidenceLedger } from "../dist/core/evidenceLedger.js";

test("requirement ledger preserves text and reports uncovered requirements", () => {
  const ledger = createRequirementLedger([
    { text: "Do not rewrite API files" },
    { text: "Keep comments short" }
  ]);
  assert.equal(ledger[0].text, "Do not rewrite API files");
  assert.deepEqual(validateRequirementCoverage(ledger, ["R001"]), ["Mandatory requirement has no task: R002"]);
});

test("context assembler includes current relevant sources and excludes stale ones", () => {
  const result = assembleTaskContext(
    [{ id: "R001", text: "Preserve the complete request" }],
    [
      { id: "S1", text: "Current notes", requirementIds: ["R001"], current: true },
      { id: "S2", text: "Old notes", requirementIds: ["R001"], current: false }
    ],
    ["R001"]
  );
  assert.equal(result.requirementText.length, 1);
  assert.equal(result.sourceText.length, 1);
  assert.deepEqual(result.excludedStaleSourceIds, ["S2"]);
});

test("retry policy retries transient errors and stops for permanent errors", () => {
  assert.equal(decideRetry({ attempt: 1, errorCode: "TIMEOUT" }).retry, true);
  assert.equal(decideRetry({ attempt: 1, errorCode: "INVALID_REQUEST" }).retry, false);
  assert.equal(decideRetry({ attempt: 3, errorCode: "TIMEOUT" }).retry, false);
});

test("candidate ranking excludes unavailable models", () => {
  const ranked = rankCandidates([
    { provider: "sample", modelId: "ready", taskKinds: ["coding"], supportsTools: true, supportsStructuredOutput: true, availability: "available" },
    { provider: "sample", modelId: "offline", taskKinds: ["coding"], supportsTools: true, supportsStructuredOutput: true, availability: "unavailable" }
  ], { taskKind: "coding", requireTools: true });
  assert.equal(ranked[0].modelId, "ready");
  assert.equal(ranked[0].eligible, true);
  assert.equal(ranked[1].eligible, false);
});

test("evidence ledger rejects duplicate IDs and exposes claim confidence", () => {
  const ledger = new EvidenceLedger();
  ledger.add({
    id: "E001", claim: "The check passed", kind: "test", observedAt: "2026-10-26T00:00:00Z",
    supports: ["R001"], limitations: [], confidence: "confirmed"
  });
  assert.equal(ledger.confidenceFor("The check passed"), "confirmed");
  assert.throws(() => ledger.add({
    id: "E001", claim: "Duplicate", kind: "model-claim", observedAt: "2026-10-26T00:00:00Z",
    supports: [], limitations: [], confidence: "hypothesis"
  }));
});
