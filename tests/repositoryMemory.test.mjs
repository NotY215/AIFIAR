import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RepositoryMemory } from "../dist/core/repositoryMemory.js";

test("repository memory persists snapshots, summaries, and symbols across instances", async () => {
  const root = await mkdtemp(join(tmpdir(), "aifiar-memory-root-"));
  const store = await mkdtemp(join(tmpdir(), "aifiar-memory-store-"));
  try {
    await mkdir(join(root, "src"));
    await writeFile(join(root, "README.md"), "# Demo\n");
    await writeFile(join(root, "src", "main.py"), "def start():\n    return 1\n");
    const first = new RepositoryMemory(store);
    const initial = await first.refresh({ repositoryId: "test/repo", rootPath: root, commit: "abc123" });
    assert.equal(initial.regeneratedSummaryCount, 2);
    assert.ok(initial.record.symbolIndex.symbols.some((symbol) => symbol.name === "start"));
    const second = new RepositoryMemory(store);
    const loaded = await second.load("test/repo");
    assert.equal(loaded?.snapshot.commit, "abc123");
    assert.equal((await second.searchSymbols("test/repo", "start")).length, 1);
    const refreshed = await second.refresh({ repositoryId: "test/repo", rootPath: root, commit: "abc123" });
    assert.equal(refreshed.reusedSummaryCount, 2);
    assert.equal((await second.getFileSummary("test/repo", "src/main.py", "bad-hash"))?.freshness, "stale");
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(store, { recursive: true, force: true });
  }
});

test("changed source regenerates its summary and updates snapshot hash", async () => {
  const root = await mkdtemp(join(tmpdir(), "aifiar-memory-root-"));
  const store = await mkdtemp(join(tmpdir(), "aifiar-memory-store-"));
  try {
    await writeFile(join(root, "index.ts"), "export function before() {}\n");
    const memory = new RepositoryMemory(store);
    await memory.refresh({ repositoryId: "test/changed", rootPath: root });
    await writeFile(join(root, "index.ts"), "export function after() {}\n");
    const updated = await memory.refresh({ repositoryId: "test/changed", rootPath: root });
    assert.equal(updated.regeneratedSummaryCount, 1);
    assert.equal((await memory.searchSymbols("test/changed", "after")).length, 1);
    assert.equal((await memory.searchSymbols("test/changed", "before")).length, 0);
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(store, { recursive: true, force: true });
  }
});
