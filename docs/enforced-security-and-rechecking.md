# Enforced Security and Rechecking

## Central action gate

Use `evaluateActionGate` at the action boundary, not only as a planning hint. It combines protected-action policy, patch validation, workspace confirmation, and unresolved prompt-injection risk. The host must deny execution whenever `allowed` is false and require explicit approval whenever `requiresApproval` is true.

The gate is not an authorization system by itself. Callers must authenticate the approving user, bind approval to the exact action and patch digest, expire approvals, and record the decision. Never reuse approval for a different patch.

## File freshness

`checkPlannedFilesFresh` compares the exact relative paths and hashes used during planning with current observed state. Missing files, changed hashes, duplicate paths, and unsafe paths block application. Set `requireExactSet` when the operation must not include unexpected files.

Run the check immediately before applying the patch. A separate host-side lock or transactional filesystem operation is needed to avoid a time-of-check/time-of-use race between checking and writing. Recheck after application as well.

## Command policy

`evaluateCommandRequest` checks executable allowlists, shell use, network permission, argument limits, timeout bounds, and high-impact command patterns. It returns a policy report only. It does not start a process and does not create a sandbox.

A host command runner must additionally:
- Resolve the executable to a trusted absolute path and verify it has not changed.
- Use argument arrays, never concatenate untrusted strings into a shell command.
- Enforce the workspace root using canonical paths and reject symlink escapes.
- Apply process-group termination, wall-clock deadlines, output caps, and resource limits.
- Use OS/container isolation, a restricted identity, minimal environment variables, and denied network access by default.
- Record the command, policy decision, exit status, timeout, and bounded output without logging secrets.

A timeout or output cap must terminate or stop reading from the process, not merely truncate the displayed result.

## Secret scanning and redaction

`findPotentialSecrets` identifies several common token, key, and connection-string formats. `redactPotentialSecrets` replaces detected ranges before text is sent to another provider. This is defense in depth, not a complete scanner. It can miss custom credentials and may flag ordinary examples.

Prefer rejecting outbound data containing secrets for high-assurance workflows. If redaction is enabled, only the returned redacted text should be passed to the provider. Never log the original content. Keep credentials out of prompts and repository files whenever possible.

## Unified preflight

`runPreflight` combines action permission, patch validation, planned-file freshness, command policy, and outbound secret handling. The caller should use the returned `allowed` value as a hard gate, show warnings to the operator, and avoid continuing when a blocker exists.

## Required verification sequence

1. Pin repository identity, commit, and instruction sources.
2. Scan files and record hashes. Treat incomplete scans as incomplete evidence.
3. Classify repository, tool, and model content as untrusted data.
4. Audit prompt-injection signals before tool planning.
5. Check the action gate and require approval for protected operations.
6. Compare current file hashes immediately before patch application.
7. Validate all patch paths, limits, protected paths, and credential patterns.
8. Apply changes in a disposable isolated workspace with no ambient credentials.
9. Re-scan changed files and inspect the complete diff.
10. Run allowlisted checks under time, output, and resource limits.
11. Re-run freshness checks and completion verification.
12. Report evidence, failed checks, incomplete scans, and untested areas.

## Limits

These modules provide policy decisions and checks. They do not provide OS sandboxing, container isolation, safe patch application, Git transactions, cryptographic approval records, provider API integration, or a complete prompt-injection or secret detector. Those capabilities must be implemented and enforced by the runtime host before describing AIFIAR as production-secure.
