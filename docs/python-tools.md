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

The Python tools complement the TypeScript core. They do not connect to an AI provider, apply patches, or replace host-level authorization.
