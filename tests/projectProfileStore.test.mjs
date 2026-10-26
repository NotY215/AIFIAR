import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { JsonFileProjectProfileStore, assessProfileFreshness, validateProjectProfile } from "../dist/core/projectProfileStore.js";

function sampleProfile(overrides = {}) {
  return {
    schemaVersion: 1,
    repositoryUrl: "https://github.com/example/project",
    observedRef: "main",
    observedCommit: "abc123",
    projectPurpose: "Example project",
    architectureNotes: ["Core modules are separated by responsibility."],
    conventions: ["Keep changes targeted."],
    protectedPaths: ["secrets/"],
    verificationCommands: ["npm test"],
    knownLimitations: [],
    unresolvedQuestions: [],
    savedAt: "2026-10-26T12:00:00.000Z",
    ...overrides
  };
}

test("profile schema requires all structured sections", () => {
  assert.equal(validateProjectProfile(sampleProfile()), true);
  assert.equal(validateProjectProfile({ ...sampleProfile(), conventions: "not-an-array" }), false);
});

test("freshness detects commit mismatch and missing revision evidence", () => {
  const profile = sampleProfile();
  assert.equal(assessProfileFreshness(profile, { currentCommit: "abc123", now: Date.parse(profile.savedAt) + 1000 }).status, "fresh");
  assert.equal(assessProfileFreshness(profile, { currentCommit: "def456", now: Date.parse(profile.savedAt) + 1000 }).status, "stale");
  assert.equal(assessProfileFreshness(profile, { now: Date.parse(profile.savedAt) + 1000 }).status, "unknown");
});

test("file store persists and reloads a profile", async () => {
  const dir = await mkdtemp(join(tmpdir(), "aifiar-profile-"));
  try {
    const store = new JsonFileProjectProfileStore(join(dir, "memory", "profile.json"));
    assert.equal(await store.load(), null);
    const profile = sampleProfile();
    await store.save(profile);
    assert.deepEqual(await store.load(), profile);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("file store rejects malformed profile data", async () => {
  const dir = await mkdtemp(join(tmpdir(), "aifiar-profile-invalid-"));
  try {
    const store = new JsonFileProjectProfileStore(join(dir, "profile.json"));
    await assert.rejects(() => store.save({ schemaVersion: 99 }), /invalid project profile/i);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
