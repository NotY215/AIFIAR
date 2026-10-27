import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DurableTelemetryStore } from "../dist/core/durableTelemetryStore.js";

const event = (overrides = {}) => ({
  provider: "openai", modelId: "configured-model", outcome: "success", elapsedMs: 12,
  attempt: 1, inputTokens: 4, outputTokens: 5, totalTokens: 9, ...overrides
});
const temporaryDirectory = () => mkdtemp(join(tmpdir(), "aifiar-telemetry-"));

test("durable telemetry requires explicit enablement and consent", async () => {
  const directory = await temporaryDirectory();
  try {
    const store = new DurableTelemetryStore({ enabled: true, consentGranted: false, directory, retentionMs: 60_000 });
    assert.equal(await store.append(event()), false);
    assert.deepEqual(await store.read(), []);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("durable telemetry persists allowlisted metadata, not arbitrary prompt/credential fields", async () => {
  const directory = await temporaryDirectory();
  try {
    const store = new DurableTelemetryStore({ enabled: true, consentGranted: true, directory, retentionMs: 60_000 });
    const unsafe = { ...event(), prompt: "private prompt", completion: "private completion", authorization: "Bearer secret" };
    assert.equal(await store.append(unsafe), true);
    const rows = await store.read();
    assert.equal(rows.length, 1);
    assert.equal(rows[0].event.provider, "openai");
    const raw = await readFile(join(directory, "provider-telemetry.jsonl"), "utf8");
    assert.ok(!raw.includes("private prompt"));
    assert.ok(!raw.includes("private completion"));
    assert.ok(!raw.includes("Bearer secret"));
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("durable telemetry bounds event count and prunes expired records", async () => {
  const directory = await temporaryDirectory();
  try {
    let now = Date.parse("2026-10-27T12:00:00.000Z");
    const store = new DurableTelemetryStore({ enabled: true, consentGranted: true, directory, retentionMs: 60_000, maxEvents: 2, maxBytes: 4096, now: () => now });
    await store.append(event({ modelId: "one" }));
    now += 1000; await store.append(event({ modelId: "two" }));
    now += 1000; await store.append(event({ modelId: "three" }));
    assert.deepEqual((await store.read()).map(row => row.event.modelId), ["two", "three"]);
    now += 120_000;
    assert.deepEqual(await store.read(), []);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("durable telemetry rejects invalid values and supports explicit deletion", async () => {
  const directory = await temporaryDirectory();
  try {
    const store = new DurableTelemetryStore({ enabled: true, consentGranted: true, directory, retentionMs: 60_000 });
    await assert.rejects(() => store.append(event({ elapsedMs: -1 })), /Invalid telemetry/);
    await store.append(event());
    assert.equal((await store.read()).length, 1);
    await store.clear();
    assert.deepEqual(await store.read(), []);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
