# AIFIAR operations and release runbook

This runbook defines minimum operational behavior for a host integrating AIFIAR. It is a checklist, not evidence that a production deployment or independent review has occurred.

## Configuration and secret handling

- Keep provider credentials, approval signing keys, receipt ledgers, telemetry files, recovery snapshots, and repository credentials outside model-writable workspaces.
- Inject secrets through a host secret manager or process environment; never put secrets in prompts, task context, logs, fixtures, or committed files.
- Rotate provider credentials after suspected exposure, revoke old credentials, inspect audit events, and document incidents without copying secrets into reports.
- Use least-privileged provider and GitHub credentials. A successful model response does not imply permission to mutate a repository.

## Telemetry and privacy

- Persistence is disabled unless the host explicitly enables it and sets `consentGranted: true`.
- Use a host-owned directory not writable by generated code and restrict filesystem access to the service identity.
- Select retention and byte/event bounds appropriate to the deployment; verify pruning and deletion.
- Persist only allowlisted provider/model IDs, outcome, elapsed time, attempt/status, usage, rate-limit hints, and traceable cost-estimate metadata. Never persist prompts, completions, repository paths, raw headers, credentials, or user identifiers.
- Document purpose, access roles, retention, deletion, and consent before enabling persistence.
- Treat costs as estimates; reconcile against provider billing records before financial reporting.

## Recovery and backup drills

1. Back up host-owned configuration and recovery metadata using an approved encrypted backup mechanism.
2. Exclude transient prompts, provider outputs, credentials, and telemetry unless explicitly required by policy.
3. In a disposable staging workspace, simulate an interrupted transaction and restore from a known-good backup.
4. Verify hashes, journal continuity, recovery conflicts, and final repository state.
5. Record date, versions, failures, and reviewer. Do not claim a drill succeeded until it has actually been run.

## Incident response

1. Stop new execution and disable affected provider credentials or host authorization.
2. Preserve bounded metadata-only evidence without copying secrets or model-writable payloads.
3. Determine affected repository, task, provider/model, approval receipt IDs, and transaction IDs from trusted host records.
4. Revoke compromised credentials/keys, rotate them, and invalidate outstanding approvals.
5. Restore from trusted snapshots only after checking integrity and concurrent modifications.
6. Patch and test the issue, obtain independent review for boundary failures, and publish a non-sensitive incident summary.

## Release checklist

- [ ] Run TypeScript typecheck, build, all Node tests, Python safety tests, Windows compatibility tests, and CodeQL on the exact release commit.
- [ ] Confirm dependency review, lockfile integrity, supported runtime versions, and no committed secrets.
- [ ] Verify branch protection, required reviews/status checks, and restricted release permissions in GitHub settings.
- [ ] Generate reproducible release artifacts and verify checksums.
- [ ] Sign artifacts using a protected signing identity and verify signatures from a clean environment.
- [ ] Run recovery and restore drills against the release candidate.
- [ ] Review provider schema/retry/rate-limit behavior; run opt-in live tests only with scoped credentials and an approved budget.
- [ ] Test host sandbox boundaries against untrusted commands, network/filesystem escape attempts, and resource exhaustion.
- [ ] Obtain independent review of native filesystem safety and approval/authentication integration.
- [ ] Publish a release decision with evidence links and explicit unresolved limitations.

## Known blockers

This runbook does not implement native Windows handle-relative mutation, a real authenticated operator UI, a deployment-specific OS sandbox, release signing keys, GitHub branch protection settings, or independent security review. The portable filesystem fallbacks are not a hostile-process security boundary. These controls must be implemented and verified in the target host/deployment.
