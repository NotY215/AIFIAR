import test from "node:test";
import assert from "node:assert/strict";
import { authorizePatchApproval } from "../dist/core/approvalAuthorization.js";

const request = {
  repositoryId: "repo-1",
  taskId: "task-1",
  proposalDigest: "a".repeat(64),
  changes: [{ path: "src/index.ts", operation: "modify" }]
};
const principal = {
  authenticated: true,
  subjectId: "operator-1",
  roles: ["developer"],
  repositoryIds: ["repo-1"],
  taskIds: ["task-1"],
  allowedPathPrefixes: ["src"]
};

test("authorization permits a scoped authenticated developer for ordinary source edits", () => {
  const result = authorizePatchApproval({ principal, request });
  assert.equal(result.allowed, true);
  assert.deepEqual(result.blockers, []);
});

test("authorization fails closed for unauthenticated or out-of-scope principals", () => {
  const unauthenticated = authorizePatchApproval({ principal: { ...principal, authenticated: false }, request });
  assert.equal(unauthenticated.allowed, false);
  assert.ok(unauthenticated.blockers.some((item) => item.includes("authenticate")));
  const wrongRepo = authorizePatchApproval({ principal: { ...principal, repositoryIds: ["other"] }, request });
  assert.equal(wrongRepo.allowed, false);
  assert.ok(wrongRepo.blockers.some((item) => item.includes("repository")));
});

test("authorization rejects traversal, duplicate paths, denied metadata and oversized proposals", () => {
  for (const path of ["../outside.ts", "/etc/passwd", "src\\..\\outside.ts"]) {
    const result = authorizePatchApproval({ principal, request: { ...request, changes: [{ path, operation: "modify" }] } });
    assert.equal(result.allowed, false);
  }
  const duplicate = authorizePatchApproval({ principal, request: { ...request, changes: [
    { path: "src/a.ts", operation: "modify" }, { path: "src/a.ts", operation: "modify" }
  ] } });
  assert.ok(duplicate.blockers.some((item) => item.includes("duplicate")));
  const denied = authorizePatchApproval({ principal: { ...principal, allowedPathPrefixes: ["*"] }, request: {
    ...request, changes: [{ path: ".aifiar/recovery/snapshot.json", operation: "modify" }]
  } });
  assert.equal(denied.allowed, false);
  assert.deepEqual(denied.deniedPaths, [".aifiar/recovery/snapshot.json"]);
  const tooLarge = authorizePatchApproval({ principal, request: { ...request, changes: Array.from({ length: 51 }, (_, i) => ({ path: "src/" + i + ".ts", operation: "modify" })) } });
  assert.equal(tooLarge.allowed, false);
});

test("protected paths and destructive operations require elevated roles", () => {
  const protectedResult = authorizePatchApproval({ principal: { ...principal, allowedPathPrefixes: ["*"] }, request: {
    ...request, changes: [{ path: ".github/workflows/ci.yml", operation: "modify" }]
  } });
  assert.equal(protectedResult.allowed, false);
  assert.deepEqual(protectedResult.protectedPaths, [".github/workflows/ci.yml"]);
  const deleteResult = authorizePatchApproval({ principal, request: {
    ...request, changes: [{ path: "src/old.ts", operation: "delete" }]
  } });
  assert.equal(deleteResult.allowed, false);
  const elevated = authorizePatchApproval({ principal: { ...principal, roles: ["security-admin"], allowedPathPrefixes: ["*"] }, request: {
    ...request, changes: [{ path: ".github/workflows/ci.yml", operation: "modify" }]
  } });
  assert.equal(elevated.allowed, true);
});
