import test from "node:test";
import assert from "node:assert/strict";
import { authorizePatchApproval } from "../dist/core/approvalAuthorization.js";
const request = { repositoryId: "repo-1", taskId: "task-1", proposalDigest: "a".repeat(64), changes: [{ path: "src/index.ts", operation: "modify" }] };
const principal = { authenticated: true, subjectId: "operator-1", roles: ["developer"], repositoryIds: ["repo-1"], taskIds: ["task-1"], allowedPathPrefixes: ["src"] };
test("permits scoped authenticated developer for ordinary source edits", () => {
 const result = authorizePatchApproval({ principal, request }); assert.equal(result.allowed, true); assert.deepEqual(result.blockers, []);
});
test("fails closed for unauthenticated or out-of-scope principals", () => {
 assert.equal(authorizePatchApproval({ principal: { ...principal, authenticated: false }, request }).allowed, false);
 assert.equal(authorizePatchApproval({ principal: { ...principal, repositoryIds: ["other"] }, request }).allowed, false);
 assert.equal(authorizePatchApproval({ principal: { ...principal, taskIds: ["other"] }, request }).allowed, false);
});
test("rejects traversal, duplicates, denied metadata, and oversized proposals", () => {
 for (const path of ["../outside.ts", "/etc/passwd", "src\\..\\outside.ts"]) assert.equal(authorizePatchApproval({ principal, request: { ...request, changes: [{ path, operation: "modify" }] } }).allowed, false);
 const duplicate = authorizePatchApproval({ principal, request: { ...request, changes: [{ path: "src/a.ts", operation: "modify" }, { path: "src/a.ts", operation: "modify" }] } });
 assert.ok(duplicate.blockers.some(x => x.includes("duplicate")));
 const denied = authorizePatchApproval({ principal: { ...principal, allowedPathPrefixes: ["*"] }, request: { ...request, changes: [{ path: ".aifiar/recovery/snapshot.json", operation: "modify" }] } });
 assert.equal(denied.allowed, false); assert.deepEqual(denied.deniedPaths, [".aifiar/recovery/snapshot.json"]);
 assert.equal(authorizePatchApproval({ principal, request: { ...request, changes: Array.from({ length: 51 }, (_, i) => ({ path: "src/" + i + ".ts", operation: "modify" })) } }).allowed, false);
});
test("protected paths and deletes require elevated roles", () => {
 const result = authorizePatchApproval({ principal: { ...principal, allowedPathPrefixes: ["*"] }, request: { ...request, changes: [{ path: ".github/workflows/ci.yml", operation: "modify" }] } });
 assert.equal(result.allowed, false); assert.deepEqual(result.protectedPaths, [".github/workflows/ci.yml"]);
 assert.equal(authorizePatchApproval({ principal, request: { ...request, changes: [{ path: "src/old.ts", operation: "delete" }] } }).allowed, false);
 assert.equal(authorizePatchApproval({ principal: { ...principal, roles: ["security-admin"], allowedPathPrefixes: ["*"] }, request: { ...request, changes: [{ path: ".github/workflows/ci.yml", operation: "modify" }] } }).allowed, true);
});
test("malformed authorization policy fails closed without throwing", () => {
 assert.equal(authorizePatchApproval({ principal: { ...principal, allowedPathPrefixes: [null] }, request }).allowed, false);
 assert.equal(authorizePatchApproval({ principal, request, policy: { protectedPathPrefixes: [null] } }).allowed, false);
 assert.equal(authorizePatchApproval({ principal, request, policy: { protectedPathPrefixes: "not-an-array" } }).allowed, false);
});
