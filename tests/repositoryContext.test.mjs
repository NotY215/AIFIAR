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
    const result = await assembleRepositoryContext(memory, { repositoryId: "ctx/repo", rootPath: root, plan });
    assert.ok(result.plan.tasks[0].context.includes("AGENTS.md"));
    assert.ok(result.plan.tasks[0].context.includes("auth.ts"));
    assert.ok(result.plan.tasks[0].context.includes("Deep TypeScript-specific rules"));
    assert.ok(!result.plan.tasks[0].context.includes("abcdefghijklmnopqrstuvwxyz123456"));
    assert.ok(!result.plan.tasks[0].context.includes(".env"));
    assert.ok(result.plan.tasks[0].contextRefs.some((ref) => ref.startsWith("src/auth.ts@")));
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(store, { recursive: true, force: true });
  }
});

test("explicit language overrides load mixed-language common rules within the configured budget", async () => {
  const root = await mkdtemp(join(tmpdir(), "aifiar-mixed-language-root-"));
  const store = await mkdtemp(join(tmpdir(), "aifiar-mixed-language-store-"));
  try {
    await mkdir(join(root, "languages", "typescript", "common"), { recursive: true });
    await mkdir(join(root, "languages", "sql", "common"), { recursive: true });
    await writeFile(join(root, "service.ts"), "export function runQuery() { return true; }\n");
    await writeFile(join(root, "migration.sql"), "SELECT 1;\n");
    await writeFile(join(root, "languages", "typescript", "common", "AGENTS.md"), "# TypeScript common rules\nRuntime validation is mandatory.\n");
    await writeFile(join(root, "languages", "sql", "common", "AGENTS.md"), "# SQL common rules\nUse parameterized queries and transactions.\n");
    const plan = { goal: "Review application query flow", skillLevel: "intermediate", requirements: [], tasks: [
      { id: "T-mixed", title: "Review query flow", description: "Review service and database migration", kind: "review", requirementIds: [], dependsOn: [], status: "ready" }
    ], warnings: [] };
    const memory = new RepositoryMemory(store);
    const result = await assembleRepositoryContext(memory, {
      repositoryId: "ctx/mixed-repo", rootPath: root, plan
    }, {
      explicitLanguagesByTask: { "T-mixed": ["typescript", "sql"] },
      maxTotalBytesPerTask: 16 * 1024,
      maxLanguageInstructionBytes: 4 * 1024,
      languageInstructionRootPath: root
    });
    const task = result.plan.tasks[0];
    assert.ok(task.context.includes("TypeScript common rules"));
    assert.ok(task.context.includes("SQL common rules"));
    assert.deepEqual(result.languageInstructionsByTask["T-mixed"].languages, ["typescript", "sql"]);
    assert.ok(task.contextRefs.some((ref) => ref.startsWith("languages/typescript/common/AGENTS.md@")));
    assert.ok(task.contextRefs.some((ref) => ref.startsWith("languages/sql/common/AGENTS.md@")));
    assert.ok(Buffer.byteLength(task.context, "utf8") <= 16 * 1024);
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(store, { recursive: true, force: true });
  }
});
