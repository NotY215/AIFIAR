# Phase 4: Safe execution hardening

This phase covers enforcement at the trusted host boundary, not merely instructions given to a model. AIFIAR's approval and patch helpers are policy components; the host remains responsible for real identity authentication, UI, operating-system permissions, and sandbox isolation.

## New host authorization policy

`core/approvalAuthorization.ts` provides a fail-closed authorization decision for a proposed patch. It checks that the host marked the principal authenticated, binds the request to an explicit repository and task scope, requires an approval-capable role, limits proposal size, rejects unsafe and duplicate paths, applies allowed path prefixes, and separately identifies protected and never-editable host-managed paths.

- Developers can approve ordinary add/modify operations only within their assigned repository, task, and path scopes.
- Deletes require a maintainer or security-admin role.
- Protected paths such as workflow configuration, security policy, environment files, credentials, and AIFIAR metadata require a security-admin role.
- Git metadata, recovery snapshots, and approval ledgers are denied.
- Authorization failure returns blockers and must be treated as a hard stop.

This module does not authenticate a human, prove that principal claims are genuine, render a diff, or issue a signed receipt. The caller must derive principal fields from a trusted identity system, display the exact proposal digest and diff, apply host authorization, and only then issue a short-lived signed receipt using the existing receipt module. Never construct the principal from model output or repository-controlled data.

## Docker sandbox hardening additions

The optional Docker runner supports two explicit hardening switches:

- `require_digest_pinned_image=True` refuses mutable tags and requires an image reference ending in `@sha256:<64 lowercase hex characters>`. The image must still be present locally and independently reviewed.
- `read_only_workspace=True` mounts the disposable workspace copy read-only. Use it for inspection and verification commands that do not need to write build outputs. The default remains writable for compatibility with build/test tasks, but the original workspace is never mounted.

Existing controls include no network, read-only container root, dropped capabilities, no-new-privileges, non-root UID, bounded CPU/memory/PIDs/time/output, filtered host environment, secret-path exclusion, and a disposable copy. These controls are defense in depth, not a claim of a complete OS security boundary.

## Required adversarial and host-integration work

The following remain open until implemented and tested in the actual target environments:

1. Windows-native handle-relative operations that prevent directory-rename and symlink-swap races. The portable Node fallback is not equivalent.
2. Authenticated operator identity, role assignment, secure key storage and rotation, revocation, and a user-facing exact-diff approval screen in a real host application.
3. OS-specific sandbox integration with verified filesystem, network, credential, process, and resource isolation.
4. Race-injection tests on Windows and POSIX, crash/power-loss recovery drills, and independent review of the filesystem boundary.

A green unit test or a successful local Docker run is not evidence that these deployment-level requirements are complete.

## Authorized execution and receipt-backed approval

`core/authorizedPatchWorkflow.ts` is the safer host entry point. It evaluates trusted principal claims against the proposal's repository, task, digest, operations, and target paths before invoking the approval callback. Only after authorization passes does it delegate to the existing approved-patch workflow, which retains revision/hash rechecks, action gating, transaction verification, and recovery behavior.

`core/receiptApprovalAdapter.ts` adapts a trusted host decision callback to the existing workflow by signing a short-lived receipt, verifying it against the exact proposal digest, and consuming its decision ID once in a host-owned ledger. This is defense in depth, not an identity provider: the callback must authenticate the operator and display the exact diff; the signing key and ledger must be outside any model-writable workspace.

The Docker runner now validates CPU and memory limit syntax, supports opt-in digest-pinned images, and supports a read-only bind mount for the disposable workspace. These options are tested without requiring a paid service or an actual Docker daemon. Docker execution itself remains optional and environment-dependent.

## Phase 4 exit criteria still open

The repository now has stronger host authorization and receipt plumbing, but Phase 4 is not fully production-complete until a real host application supplies authenticated identity, secure key storage/rotation/revocation, and an exact-diff approval interface. Native Windows race-resistant filesystem operations and adversarial race tests also remain open. Unit tests cannot prove those OS and deployment properties.
