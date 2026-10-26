# Security and Rechecking Controls

## Persistent repository index

`JsonFileRepositoryIndexStore` stores repository snapshots as JSON with bounded size, schema validation, duplicate-path rejection, strict relative paths, and atomic temporary-file replacement. File permissions are restricted where supported. Repository identity is encoded into a filename rather than used as a path.

Snapshots store hashes and metadata, not source contents. Callers should store the index in a trusted directory and should not treat a local JSON file as tamper-proof. A hostile local process with write access can still alter the index.

## Patch validation

`validatePatch` checks paths for traversal and absolute paths, rejects duplicate targets, limits file count and content size, rejects deletion unless explicitly enabled, rejects binary changes by default, flags sensitive-looking paths, and detects several common credential formats.

This is a defense-in-depth helper, not a complete secret scanner or patch applier. False positives and false negatives are possible. Always review the complete diff, compare the base commit, run tests, and use a controlled patch application layer. A warning on protected or sensitive paths means approval is needed; the host must enforce that result.

## Prompt-injection audit

`auditUntrustedContent` flags common patterns that resemble instruction overrides, requests to disclose secrets, attempts to trigger tools, hidden prompt requests, and obfuscated instructions. It returns short excerpts and handling rules.

Pattern detection is not a complete prompt-injection defense. It can miss novel attacks and can flag harmless text. The primary defense is architectural: keep trusted policy separate from untrusted data, do not grant tools based on repository text, validate every proposed action, and require host-side permission checks.

## Rechecking checklist

Before modifying files:
1. Confirm repository identity and the current commit or ref.
2. Scan and record file hashes.
3. Read root and applicable nested instructions.
4. Audit untrusted repository and tool content.
5. Check target paths and protected-path policy.
6. Build a requirement-to-task map.

Before applying a patch:
1. Confirm the base files still match the hashes used during planning.
2. Validate all paths and patch limits.
3. Inspect the complete diff for accidental changes and sensitive material.
4. Require approval for protected paths, deletions, credentials, deployment, and other high-impact actions.
5. Apply in an isolated workspace where possible.

Before reporting completion:
1. Recheck hashes for changed files and ensure no unexpected files changed.
2. Run configured type checks, tests, and build steps.
3. Verify every mandatory requirement has evidence.
4. Confirm scan and verification completeness.
5. Report failures, warnings, and untested areas honestly.

## Limitations

These helpers do not provide operating-system sandboxing, process isolation, cryptographic signing, malware analysis, full Git ignore compatibility, a complete secret scanner, or a complete prompt-injection classifier. Production integrations must enforce the policies at the tool boundary.
