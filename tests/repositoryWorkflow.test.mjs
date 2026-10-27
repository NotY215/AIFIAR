import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runRepositoryWorkflow } from "../dist/core/repositoryWorkflow.js";
import { JsonFileProjectProfileStore } from "../dist/core/projectProfileStore.js";
import { StaticModelRegistry } from "../dist/models/registry.js";

test("repository workflow passes indexed source and provider-matched language rules into execution", async () => {
  const root = await mkdtemp(join(tmpdir(), "aifiar-workflow-root-"));
  const store = await mkdtemp(join(tmpdir(), "aifiar-workflow-store-"));
  try {
    await writeFile(join(root, "README.md"), "# Sample project\n");
    await writeFile(join(root, "service.ts"), "export function refreshSession() { return true; }\n");
    await mkdir(join(root, "languages", "typescript", "common"), { recursive: true });
    await mkdir(join(root, "languages", "typescript", "openai"), { recursive: true });
    await mkdir(join(root, "languages", "typescript", "anthropic"), { recursive: true });
    await writeFile(join(root, "languages", "typescript", "common", "AGENTS.md"), "# TypeScript common rules\nValidate external data at runtime.\n");
    await writeFile(join(root, "languages", "typescript", "openai", "INSTRUCTIONS.md"), "# OpenAI workflow\nReview typecheck and tests.\n");
    await writeFile(join(root, "languages", "typescript", "anthropic", "INSTRUCTIONS.md"), "# Anthropic workflow\nDo not inject this into OpenAI tasks.\n");
    const plan = {
      goal: "Review session refresh", skillLevel: "intermediate", requirements: [],
      tasks: [{ id: "T1", title: "Review refreshSession", description: "Review refreshSession implementation", kind: "review", requirementIds: [], dependsOn: [], status: "ready" }],
      warnings: []
    };
    const registry = new StaticModelRegistry([{
      provider: "openai", modelId: "mock", taskKinds: ["review"], supportsTools: false,
      supportsStructuredOutput: false, availability: "available"
    }]);
    let captured;
    const report = await runRepositoryWorkflow(plan, registry, {
      async execute(task, provider, modelId) {
        captured = task;
        return { taskId: task.id, provider, modelId, status: "success", summary: "Reviewed", evidence: ["Mock executor received task context."] };
      }
    }, { repositoryId: "sample/project", rootPath: root, storeDirectory: store });
    assert.ok(captured.context.includes("service.ts"));
    assert.ok(captured.contextRefs.some((ref) => ref.startsWith("service.ts@")));
    assert.ok(captured.context.includes("TypeScript common rules"));
    assert.ok(captured.context.includes("OpenAI workflow"));
    assert.ok(!captured.context.includes("Do not inject this into OpenAI tasks"));
    assert.ok(captured.contextRefs.some((ref) => ref.startsWith("languages/typescript/common/AGENTS.md@")));
    assert.ok(captured.contextRefs.some((ref) => ref.startsWith("languages/typescript/openai/INSTRUCTIONS.md@")));
    assert.equal(report.orchestration.results[0].status, "success");
    assert.equal(report.context.incompleteScan, false);
    assert.deepEqual(report.context.languageInstructionsByTask.T1.languages, ["typescript"]);
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(store, { recursive: true, force: true });
  }
});


test("repository workflow reuses only a fresh saved project profile", async () => {
  const root = await mkdtemp(join(tmpdir(), "aifiar-profile-root-"));
  const store = await mkdtemp(join(tmpdir(), "aifiar-profile-memory-"));
  try {
    await writeFile(join(root, "README.md"), "# Profile demo\n");
    const profileStore = new JsonFileProjectProfileStore(join(store, "profile.json"));
    await profileStore.save({
      schemaVersion: 1, repositoryUrl: "https://github.com/example/demo", observedRef: "main",
      observedCommit: "commit-123", projectPurpose: "A profile purpose",
      architectureNotes: ["Layered architecture"], conventions: ["Use strict TypeScript"],
      protectedPaths: ["deploy/"], verificationCommands: ["npm test"],
      knownLimitations: [], unresolvedQuestions: [], savedAt: new Date().toISOString()
    });
    const plan = { goal: "Inspect", skillLevel: "beginner", requirements: [], tasks: [
      { id: "T1", title: "Inspect project", description: "Review README", kind: "review", requirementIds: [], dependsOn: [], status: "ready" }
    ], warnings: [] };
    const registry = new StaticModelRegistry([{ provider: "test", modelId: "mock", taskKinds: ["review"], supportsTools: false, supportsStructuredOutput: false, availability: "available" }]);
    let captured;
    const result = await runRepositoryWorkflow(plan, registry, {
      async execute(task, provider, modelId) {
        captured = task;
        return { taskId: task.id, provider, modelId, status: "success", summary: "ok", evidence: [] };
      }
    }, { repositoryId: "example/demo", rootPath: root, storeDirectory: join(store, "memory"), commit: "commit-123", profileStore });
    assert.equal(result.profileFreshness.status, "fresh");
    assert.ok(captured.context.includes("A profile purpose"));
    assert.ok(captured.contextRefs.includes("project-profile@commit-123"));
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(store, { recursive: true, force: true });
  }
});

test("repository workflow does not reuse a stale saved project profile", async () => {
  const root = await mkdtemp(join(tmpdir(), "aifiar-profile-root-"));
  const store = await mkdtemp(join(tmpdir(), "aifiar-profile-memory-"));
  try {
    await writeFile(join(root, "README.md"), "# Profile demo\n");
    const profileStore = new JsonFileProjectProfileStore(join(store, "profile.json"));
    await profileStore.save({
      schemaVersion: 1, repositoryUrl: "https://github.com/example/demo", observedRef: "main",
      observedCommit: "old-commit", projectPurpose: "Old profile purpose",
      architectureNotes: [], conventions: [], protectedPaths: [],
      verificationCommands: [], knownLimitations: [], unresolvedQuestions: [],
      savedAt: new Date().toISOString()
    });
    const plan = { goal: "Inspect", skillLevel: "beginner", requirements: [], tasks: [
      { id: "T1", title: "Inspect project", description: "Review README", kind: "review", requirementIds: [], dependsOn: [], status: "ready" }
    ], warnings: [] };
    const registry = new StaticModelRegistry([{ provider: "test", modelId: "mock", taskKinds: ["review"], supportsTools: false, supportsStructuredOutput: false, availability: "available" }]);
    let captured;
    const result = await runRepositoryWorkflow(plan, registry, {
      async execute(task, provider, modelId) {
        captured = task;
        return { taskId: task.id, provider, modelId, status: "success", summary: "ok", evidence: [] };
      }
    }, { repositoryId: "example/demo", rootPath: root, storeDirectory: join(store, "memory"), commit: "new-commit", profileStore });
    assert.equal(result.profileFreshness.status, "stale");
    assert.ok(!captured.context.includes("Old profile purpose"));
    assert.ok(result.orchestration.warnings.some((warning) => warning.includes("profile was not reused")));
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(store, { recursive: true, force: true });
  }
});
