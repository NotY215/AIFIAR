import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, writeFile, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NodeWorkspaceRecoveryAdapter } from "../dist/core/nodeWorkspaceRecoveryAdapter.js";

const hash = (value) => createHash("sha256").update(value).digest("hex");
async function setup(fn) {
  const root = await mkdtemp(join(tmpdir(), "aifiar-node-recovery-"));
  const workspace = join(root, "workspace");
  const store = join(root, "metadata");
  await mkdir(join(workspace, "src"), { recursive: true });
  try { await fn({ root, workspace, store, adapter: new NodeWorkspaceRecoveryAdapter(workspace, store) }); }
  finally { await rm(root, { recursive: true, force: true }); }
}

test("durable adapter restores a modified file only from the approved after-state", async () => {
  await setup(async ({ workspace, adapter }) => {
    await writeFile(join(workspace, "src/a.ts"), "before");
    const snapshot = await adapter.prepare({
      transactionId: "tx-1", manifestDigest: "a".repeat(64), paths: ["src/a.ts"],
      changes: [{ path: "src/a.ts", operation: "modify", expectedHash: hash("before"), content: "after" }]
    });
    await writeFile(join(workspace, "src/a.ts"), "after");
    const outcome = await adapter.recover({ transactionId: "tx-1" });
    assert.equal(outcome.status, "restored");
    assert.equal(await readFile(join(workspace, "src/a.ts"), "utf8"), "before");
    assert.ok(outcome.evidence.some((line) => line.includes("Verified every target")));
    assert.equal((await adapter.listPending()).length, 0);
    assert.ok(snapshot.evidence.length);
  });
});

test("durable adapter refuses to overwrite a concurrently changed target", async () => {
  await setup(async ({ workspace, adapter }) => {
    await writeFile(join(workspace, "src/a.ts"), "before");
    await adapter.prepare({
      transactionId: "tx-2", manifestDigest: "b".repeat(64), paths: ["src/a.ts"],
      changes: [{ path: "src/a.ts", operation: "modify", expectedHash: hash("before"), content: "after" }]
    });
    await writeFile(join(workspace, "src/a.ts"), "human edit");
    const outcome = await adapter.recover({ transactionId: "tx-2" });
    assert.equal(outcome.status, "conflict");
    assert.equal(await readFile(join(workspace, "src/a.ts"), "utf8"), "human edit");
  });
});

test("durable adapter removes an approved added file during recovery", async () => {
  await setup(async ({ workspace, adapter }) => {
    const path = join(workspace, "src/new.ts");
    await adapter.prepare({
      transactionId: "tx-3", manifestDigest: "c".repeat(64), paths: ["src/new.ts"],
      changes: [{ path: "src/new.ts", operation: "add", expectedHash: null, content: "new file" }]
    });
    await writeFile(path, "new file");
    assert.equal((await adapter.recover({ transactionId: "tx-3" })).status, "restored");
    await assert.rejects(readFile(path));
  });
});

test("durable adapter refuses traversal and symlink targets", async () => {
  await setup(async ({ root, workspace, adapter }) => {
    await assert.rejects(adapter.prepare({
      transactionId: "tx-4", manifestDigest: "d".repeat(64), paths: ["../outside"],
      changes: [{ path: "../outside", operation: "add", expectedHash: null, content: "x" }]
    }));
    await writeFile(join(root, "outside.txt"), "outside");
    await symlink(join(root, "outside.txt"), join(workspace, "src/link.ts"));
    await assert.rejects(adapter.prepare({
      transactionId: "tx-5", manifestDigest: "e".repeat(64), paths: ["src/link.ts"],
      changes: [{ path: "src/link.ts", operation: "modify", expectedHash: hash("outside"), content: "changed" }]
    }));
  });
});

test("durable adapter restores a deleted file from its verified before-image", async () => {
  await setup(async ({ workspace, adapter }) => {
    const path = join(workspace, "src/deleted.ts");
    await writeFile(path, "keep me");
    await adapter.prepare({
      transactionId: "tx-delete", manifestDigest: "f".repeat(64), paths: ["src/deleted.ts"],
      changes: [{ path: "src/deleted.ts", operation: "delete", expectedHash: hash("keep me") }]
    });
    await rm(path);
    assert.equal((await adapter.recover({ transactionId: "tx-delete" })).status, "restored");
    assert.equal(await readFile(path, "utf8"), "keep me");
  });
});
