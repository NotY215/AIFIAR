import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runRepositoryWorkflow } from "../dist/core/repositoryWorkflow.js";
import { StaticModelRegistry } from "../dist/models/registry.js";

test("repository workflow passes indexed source context into provider execution", async () => {
  const root = await mkdtemp(join(tmpdir(), "aifiar-workflow-root-"));
  const store = await mkdtemp(join(tmpdir(), "aifiar-workflow-store-"));
  try {
    await writeFile(join(root, "README.md"), "# Sample project\n");
    await writeFile(join(root, "service.ts"), "export function refreshSession() { return true; }\n");
    const plan = {
      goal: "Review session refresh", skillLevel: "intermediate", requirements: [],
      tasks: [{ id: "T1", title: "Review refreshSession", description: "Review refreshSession implementation", kind: "review", requirementIds: [], dependsOn: [], status: "ready" }],
      warnings: []
    };
    const registry = new StaticModelRegistry([{
      provider: "test", modelId: "mock", taskKinds: ["review"], supportsTools: false,
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
    assert.equal(report.orchestration.results[0].status, "success");
    assert.equal(report.context.incompleteScan, false);
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(store, { recursive: true, force: true });
  }
});
