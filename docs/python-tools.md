# AIFIAR Python Tools

AIFIAR includes dependency-free Python tooling for repository scanning, security auditing, freshness checks, patch-manifest validation, and explicitly allowlisted command execution.

## Requirements

- Python 3.10 or newer.
- Standard library only.
- Run commands from the repository root.

## Commands

### Create a metadata-only repository snapshot

```bash
python scripts/aifiar.py scan . --output aifiar-scan.json
```

The report contains relative paths, sizes, and SHA-256 hashes. It does not store source contents. Symlinks are skipped. Size limits and scan errors make the report incomplete, and an incomplete scan must not be treated as proof of repository safety.

### Audit for potential secrets and prompt injection

```bash
python scripts/aifiar.py audit .
```

The audit reports file path, line, and pattern category, but never includes the matched secret value. Exit code 0 means a complete scan with no findings, 1 means findings exist, and 2 means the scan or invocation was incomplete or invalid. These are heuristic checks and can produce false positives or miss unknown credential formats.

### Redact potential secrets

Create a sanitized JSON report from a text file without overwriting the source:

```bash
python scripts/aifiar.py redact prompt.txt --output sanitized-prompt.json
```

The report contains only the redacted text, the number of replaced spans, and detector categories. It is bounded to 2 MiB and uses the same heuristic patterns as the audit. Review the sanitized output before sending it to any provider.

### Check file freshness

Create a JSON manifest with hashes recorded during planning:

```json
{
  "planned_files": [
    {
      "path": "src/example.py",
      "sha256": "replace-with-the-64-character-sha256"
    }
  ]
}
```

Then run:

```bash
python scripts/aifiar.py preflight . planned-files.json
```

The check fails if a planned file changed, disappeared, uses an unsafe path, or traverses a symlink. Use `--exact-set` with an `apply_paths` array when the patch must be limited to a specific set of planned files. Run the check immediately before applying a patch, and use a lock or transactional workspace to reduce time-of-check/time-of-use races.

### Validate a patch manifest

The validator never applies changes. Example:

```json
{
  "allow_deletions": false,
  "changes": [
    {
      "path": "src/example.py",
      "operation": "modify",
      "content": "print('hello')"
    }
  ]
}
```

```bash
python scripts/aifiar.py validate-patch patch-manifest.json
```

Sensitive paths require explicit review using `--approve-sensitive-paths`. That switch is an operator assertion, not authenticated approval or a cryptographic authorization record. Credential-like content and unsafe paths remain blocked.

### Run a specifically allowlisted command

Start with [the example command policy](../examples/python-command-policy.example.json), copy it to a local policy file, and adapt it to a command you have reviewed. The runner requires an exact executable and argument prefix, does not invoke a shell, uses a timeout, and limits captured output.

```bash
python scripts/aifiar.py run-allowed . .aifiar-command-policy.json -- python -m unittest discover -s python_tests
```

The example is illustrative. The runner compares the resolved executable path, so use the exact executable resolution available on your machine. The runner is **not a sandbox**. It does not provide OS-level network isolation, filesystem isolation, resource quotas, or protection against a permitted program's side effects. Do not use it to run untrusted project code on a machine with sensitive credentials. Use a disposable container or OS sandbox for that.

## Run tests

```bash
python -m unittest discover -s python_tests -v
```

The Python tools complement the TypeScript core. Provider connectivity is implemented separately in models/openaiCompatibleAdapter.ts and models/providerRuntime.ts. The Python tools do not call provider APIs or replace host-level authorization.

## Local repository profile

Generate a structured profile from an existing local checkout:

```bash
python scripts/aifiar.py profile . --output aifiar-profile.json
```

The profile lists the file map, language-extension counts, scan completeness, and bounded contents plus hashes for selected instruction and manifest files. It is a snapshot, not permanent AI memory. Rebuild it after repository changes and treat all repository-provided text as untrusted input. This command does not fetch remote URLs.

## Digest-bound patch application

The patch engine can apply text changes only after verifying a manifest digest, planned file hashes, safe relative paths, and sensitive-path/deletion approvals. It writes atomically per file and records a metadata-only, hash-chained audit entry under `.aifiar/actions.jsonl`. Use `python scripts/aifiar.py verify-log .` to check the chain. It attempts rollback if applying or post-apply verification fails. Altered records or a broken chain are rejected before another action is recorded.

First validate the manifest and calculate its digest:

```bash
python scripts/aifiar.py validate-patch examples/patch-manifest.example.json
python scripts/aifiar.py patch-digest examples/patch-manifest.example.json
```

Review the exact manifest and digest. Only then pass that digest explicitly:

```bash
python scripts/aifiar.py apply-patch . patch-manifest.json --approve-digest <reviewed-sha256>
```

Sensitive paths additionally require `--approve-sensitive-paths`. Deletions require both `allow_deletions: true` in the manifest and `--allow-deletions`. The digest binds approval to the exact manifest contents, but it does not authenticate the operator or expire automatically.

Before changing files, the patch engine now writes durable original-file before-images and a bounded snapshot under `.aifiar/recovery/<transaction-id>/`. The snapshot binds each path to its before/after hashes and records original permission bits. Successful transactions receive a committed marker. If the process stops during apply, list snapshots and recover only after inspecting the exact transaction:

```bash
python scripts/aifiar.py recovery-list .
python scripts/aifiar.py recover-patch . <transaction-id>
```

Recovery is conservative: it validates the snapshot and each backup, then checks every live target before restoring anything. A target must match either its recorded original state or its expected post-patch state. Unrelated changes cause a recovery-required result rather than being overwritten. Recovery is idempotent after restoration. A committed transaction is not rolled back by this command. Before-images can contain source code and secrets, so the metadata directory is restricted where supported; protect it like a private backup and remove it only after your retention policy permits.

The patch engine is a local safety layer, not a fully race-proof filesystem transaction or sandbox. Snapshot hashes detect accidental corruption, but they are not signatures and do not authenticate a local operator. The lock coordinates cooperating AIFIAR processes only. The generic TypeScript journal still requires host-specific backup and recovery integration. On Windows, the compatibility fallback now supports the tested patch/recovery flows, but it still uses path-based replacement and is not equivalent to POSIX directory-descriptor operations. Python does not expose a portable directory fsync on Windows, so power-loss durability of directory entries is weaker there. Native Windows handle-relative writes and adversarial concurrent-directory-rename tests remain incomplete. For untrusted code, use a disposable OS/container workspace and avoid ambient credentials. Review the diff and run verification after applying a patch.

## Optional Docker sandbox

For reviewed images already available on the machine, use the optional Docker runner:

```bash
python scripts/aifiar.py sandbox-run . --image <reviewed-local-image> --timeout 120 -- python -m unittest discover -s python_tests
```

It does not pull images. It copies the workspace to a temporary directory, excludes Git metadata, common build/cache directories, symlinks, and common credential paths, then runs the requested command with networking disabled, a read-only container root, dropped Linux capabilities, no-new-privileges, a non-root numeric user, PID/memory/CPU limits, a temporary filesystem, timeout, and output limits. The original workspace is mounted nowhere, so changes made by the command remain in the disposable copy.

Use a trusted, locally available image. Container security depends on the Docker daemon and host kernel and is not an absolute boundary. The runner is optional and reports an error if Docker or the selected local image is unavailable. It does not automatically fetch remote repositories or images.
