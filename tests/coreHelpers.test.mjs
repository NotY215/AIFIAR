import test from "node:test";
import assert from "node:assert/strict";
import { formatProposal } from "../dist/core/summaryFormatter.js";
import { mergeTaskResults } from "../dist/core/resultMerger.js";
import { createWorkPlan, inferTaskKind } from "../dist/core/taskPlanner.js";
import { verifyWork } from "../dist/core/verificationEngine.js";
import { ProjectMemory } from "../dist/core/projectMemory.js";

const requirement = (overrides = {}) => ({
  id: "R1", text: "Keep behavior correct", mandatory: true, status: "verified", ...overrides
});
const task = (overrides = {}) => ({
  id: "T1", title: "Implement change", description: "Implement requested behavior", kind: "coding",
  requirementIds: ["R1"], dependsOn: [], status: "ready", ...overrides
});
const result = (overrides = {}) => ({
  taskId: "T1", provider: "openai", modelId: "configured-model", status: "success",
  summary: "Implemented", evidence: ["test:unit"], ...overrides
});

test("proposal formatting preserves approval and warning details across levels", () => {
  const proposal = {
    goal: "Update service",
    changes: [{ path: "src/service.ts", action: "edit", purpose: "Handle invalid input", risk: "high", requiresApproval: true }],
    checks: ["npm test"],
    warnings: ["External integration not tested"]
  };
  const beginner = formatProposal(proposal, "beginner");
  assert.match(beginner, /needs your approval/);
  assert.match(beginner, /External integration not tested/);
  const expert = JSON.parse(formatProposal(proposal, "expert"));
  assert.equal(expert.changes[0].requiresApproval, true);
  assert.deepEqual(expert.checks, ["npm test"]);
});

test("result merger scopes task IDs and deduplicates successful evidence", () => {
  const merged = mergeTaskResults("T1", [
    result({ evidence: ["test:unit", "review:diff"] }),
    result({ status: "failure", evidence: ["test:unit"] }),
    result({ taskId: "T2", evidence: ["unrelated"] })
  ]);
  assert.equal(merged.status, "partial");
  assert.equal(merged.successful.length, 1);
  assert.equal(merged.failed.length, 1);
  assert.deepEqual(merged.uniqueEvidence, ["test:unit", "review:diff"]);
});

test("planner sets initial readiness and warns about unresolved dependencies", () => {
  const plan = createWorkPlan({
    goal: "Complete feature",
    requirements: [requirement({ status: "pending" })],
    tasks: [
      { id: "T1", title: "First", description: "Start", kind: "coding", requirementIds: ["R1"], dependsOn: [] },
      { id: "T2", title: "Second", description: "Continue", kind: "testing", requirementIds: ["R1"], dependsOn: ["T1", "missing"] }
    ]
  });
  assert.equal(plan.tasks[0].status, "ready");
  assert.equal(plan.tasks[1].status, "pending");
  assert.ok(plan.warnings.some((warning) => warning.includes("depends on unknown task missing")));
});

test("task kind inference recognizes common intent categories", () => {
  assert.equal(inferTaskKind("Add a regression test"), "testing");
  assert.equal(inferTaskKind("Update the README guide"), "documentation");
  assert.equal(inferTaskKind("Review the security audit"), "review");
  assert.equal(inferTaskKind("Inspect the repository tree"), "review");
  assert.equal(inferTaskKind("Design a new architecture"), "planning");
});

test("verification fails closed for incomplete tasks and mandatory requirements", () => {
  const report = verifyWork(
    [requirement({ status: "pending" })],
    [task(), task({ id: "T2", requirementIds: [] })],
    [result()]
  );
  assert.equal(report.passed, false);
  assert.deepEqual(report.unresolvedRequirements, ["R1"]);
  assert.deepEqual(report.incompleteTasks, ["T2"]);
  assert.equal(report.warnings.length, 1);
});

test("project memory returns copies and supports remove and clear", () => {
  const memory = new ProjectMemory();
  const summary = { path: "src/main.ts", purpose: "Entry point", lastObservedAt: "2026-10-27T00:00:00Z" };
  memory.upsert(summary);
  const retrieved = memory.get("src/main.ts");
  assert.ok(retrieved);
  retrieved.purpose = "mutated copy";
  assert.equal(memory.get("src/main.ts").purpose, "Entry point");
  assert.equal(memory.remove("src/main.ts"), true);
  assert.equal(memory.remove("src/main.ts"), false);
  memory.upsert(summary);
  memory.clear();
  assert.deepEqual(memory.list(), []);
});
