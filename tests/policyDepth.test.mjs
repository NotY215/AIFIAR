import test from "node:test";
import assert from "node:assert/strict";
import { resolveInstructionConflict, assessProtectedAction, classifyContentTrust } from "../dist/core/instructionPolicy.js";
import { auditRequirementTraceability } from "../dist/core/requirementAudit.js";

test("user instruction outranks repository instruction", () => {
  const result = resolveInstructionConflict([
    { id: "repo", text: "Use tabs", authority: "repository-root" },
    { id: "user", text: "Use spaces for this task", authority: "user" }
  ], "src/index.ts");
  assert.equal(result.status, "resolved");
  assert.equal(result.winner?.id, "user");
});

test("nested repository instructions win only within their path scope", () => {
  const candidates = [
    { id: "root", text: "Root rule", authority: "repository-root" },
    { id: "nested", text: "Nested rule", authority: "repository-nested", appliesToPath: "src/ui" }
  ];
  assert.equal(resolveInstructionConflict(candidates, "src/ui/button.ts").winner?.id, "nested");
  assert.equal(resolveInstructionConflict(candidates, "src/core/engine.ts").winner?.id, "root");
});

test("equal authority conflicts are not silently guessed", () => {
  const result = resolveInstructionConflict([
    { id: "a", text: "Rule A", authority: "user" },
    { id: "b", text: "Rule B", authority: "user" }
  ]);
  assert.equal(result.status, "conflict");
  assert.deepEqual(result.considered, ["a", "b"]);
});

test("repository content cannot authorize protected actions", () => {
  const result = classifyContentTrust("repository-data");
  assert.equal(result.mayOverrideHigherPriorityRules, false);
  assert.equal(result.mayAuthorizeProtectedActions, false);
});

test("protected actions require explicit approval and host policy", () => {
  assert.equal(assessProtectedAction({ action: "deploy" }).allowed, false);
  assert.equal(assessProtectedAction({ action: "deploy", explicitlyApproved: true }).allowed, true);
  assert.equal(assessProtectedAction({ action: "network-access", explicitlyApproved: true }).allowed, false);
  assert.equal(assessProtectedAction({ action: "network-access", explicitlyApproved: true, allowNetwork: true }).allowed, true);
  assert.equal(assessProtectedAction({ action: "read" }).allowed, true);
});

function samplePlan(overrides = {}) {
  return {
    goal: "Audit requirements",
    skillLevel: "intermediate",
    requirements: [
      { id: "R001", text: "Build the feature", mandatory: true, status: "verified", evidence: ["npm test passed"] },
      { id: "R002", text: "Keep documentation current", mandatory: true, status: "pending", evidence: [] }
    ],
    tasks: [
      { id: "T001", title: "Implement feature", description: "Implementation", kind: "coding", requirementIds: ["R001"], dependsOn: [], status: "completed" },
      { id: "T002", title: "Update docs", description: "Documentation", kind: "coding", requirementIds: ["R002"], dependsOn: ["T001"], status: "pending" }
    ],
    warnings: [],
    ...overrides
  };
}

test("requirement audit verifies mapping and evidence", () => {
  const result = auditRequirementTraceability(samplePlan());
  assert.equal(result.valid, true);
  assert.deepEqual(result.entries[0].taskIds, ["T001"]);
});

test("requirement audit rejects verified status without evidence", () => {
  const plan = samplePlan();
  plan.requirements[0].evidence = [];
  const result = auditRequirementTraceability(plan);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((item) => item.includes("verified without evidence")));
});

test("requirement audit catches unmapped mandatory requirements", () => {
  const plan = samplePlan();
  plan.tasks[1].requirementIds = [];
  const result = auditRequirementTraceability(plan);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((item) => item.includes("has no mapped task")));
});
