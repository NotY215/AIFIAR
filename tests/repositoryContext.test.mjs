import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RepositoryMemory } from "../dist/core/repositoryMemory.js";
import { assembleRepositoryContext } from "../dist/core/repositoryContext.js";

test("assembles task-specific context with instructions and relevant source", async () => {
  const root = await mkdtemp(join(tmpdir(), "aifiar-context-root-"));
  const store = await mkdtemp(join(tmpdir(), "aifiar-context-store-"));
  try {
    await mkdir(join(root, "src"));
    await writeFile(join(root, "AGENTS.md"), "Follow repository instructions.\n");
    await writeFile(join(root, "src", "auth.ts"), "export function refreshSession() { return true; }\n");
    await writeFile(join(root, "src", "unrelated.py"), "def calculate_weather(): return 4\n");
    await writeFile(join(root, ".env"), "api_key=abcdefghijklmnopqrstuvwxyz123456\n");
    const plan = { goal: "Refresh a session", skillLevel: "intermediate", requirements: [], tasks: [
      { id: "T1", title: "Refresh session", description: "Fix refreshSession behavior", kind: "coding", requirementIds: [], dependsOn: [], status: "ready" }
    ], warnings: [] };
    const memory = new RepositoryMemory(store);
    const result = await assembleRepositoryContext(memory, { repositoryId: "ctx/repo", rootPath: root, tasks: plan.tasks, plan });
    assert.ok(result.plan.tasks[0].context.includes("AGENTS.md"));
    assert.ok(result.plan.tasks[0].context.includes("auth.ts"));
    assert.ok(!result.plan.tasks[0].context.includes("abcdefghijklmnopqrstuvwxyz123456"));
    assert.ok(!result.plan.tasks[0].context.includes(".env"));
    assert.ok(result.plan.tasks[0].contextRefs.some((ref) => ref.startsWith("src/auth.ts@")));
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(store, { recursive: true, force: true });
  }
});
