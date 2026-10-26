import test from "node:test";
import assert from "node:assert/strict";
import { parseRepositoryUrl, createRepositoryIntakeBrief } from "../dist/core/repositoryIntake.js";

test("parses a GitHub repository root", () => {
  const result = parseRepositoryUrl("https://github.com/NotY215/AIFIAR");
  assert.equal(result.owner, "NotY215");
  assert.equal(result.repository, "AIFIAR");
  assert.equal(result.canonicalUrl, "https://github.com/NotY215/AIFIAR");
  assert.equal(result.ref, undefined);
});

test("parses a folder URL with a branch containing slashes", () => {
  const result = parseRepositoryUrl("https://github.com/example/project/tree/feature/new-ui/src");
  assert.equal(result.ref, "feature");
  assert.equal(result.path, "new-ui/src");
});

test("accepts .git suffix and file URLs", () => {
  const result = parseRepositoryUrl("https://github.com/example/project.git/blob/main/README.md");
  assert.equal(result.repository, "project");
  assert.equal(result.ref, "main");
  assert.equal(result.path, "README.md");
});

test("rejects unsupported hosts, insecure links, and interface pages", () => {
  assert.throws(() => parseRepositoryUrl("http://github.com/example/project"), /HTTPS/);
  assert.throws(() => parseRepositoryUrl("https://example.com/example/project"), /GitHub/);
  assert.throws(() => parseRepositoryUrl("https://github.com/example/project/issues/1"), /interface page/);
  assert.throws(() => parseRepositoryUrl("https://user:pass@github.com/example/project"), /credentials/);
});

test("creates an actionable project understanding brief", () => {
  const brief = createRepositoryIntakeBrief("https://github.com/example/project", "Fix the build");
  assert.equal(brief.objective, "Fix the build");
  assert.ok(brief.inspectionSteps.some((step) => step.includes("AGENTS.md")));
  assert.ok(brief.memoryPolicy.some((step) => step.includes("dated cache")));
  assert.ok(brief.safetyRules.some((step) => step.includes("untrusted")));
  assert.ok(brief.completionCriteria.length >= 3);
});
