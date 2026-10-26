# Repository Scanning and Freshness

## Safe repository scanner

`scanRepository(root, options)` creates a deterministic, SHA-256-backed file inventory. It sorts directory entries, skips common generated/dependency folders, never follows symbolic links, checks resolved paths remain inside the root, and enforces file-count, per-file-size, and total-byte limits.

The scanner returns file hashes and metadata by default. Set `includeContent: true` only when the caller needs file contents. Prefer metadata-only scans when generating a repository map. Issues and truncation are explicit so callers cannot silently treat a partial scan as complete.

Ignore patterns are caller-provided. The initial matcher is intentionally small and is not a complete implementation of every Git ignore rule. A production integration should document this limitation or use a tested gitignore-compatible parser.

## Freshness engine

`compareRepositorySnapshots` compares snapshots only when repository identity matches. It reports added, modified, deleted, and unchanged paths. It does not claim a snapshot is fresh when there is no baseline, when identity changes, or when an expected commit does not match.

`isSummaryFresh` checks summary age and verifies every recorded source hash against the current hash map. Missing files count as stale.

Persist snapshots with a repository identifier, commit SHA when available, scan timestamp, and hashes. Never identify a repository solely by its display name. Avoid persisting source content unless required and approved.

## Evidence-based completion gate

`evaluateCompletion` combines requirement traceability, task verification, task-result integrity, configured checks, scan completeness, and unresolved conflicts. It blocks completion claims when mandatory requirements remain unverified, tasks lack successful results, success records lack evidence, task results are duplicated or unknown, required checks are missing, the scan is incomplete, or conflicts remain unresolved.

A completion gate is a decision helper, not a security boundary by itself. The host application must call it before presenting completion and must obtain trustworthy check results from the actual execution environment. A model-generated statement that a test passed is not equivalent to a test runner result.

## Limitations

- The scanner is a local filesystem helper. It does not clone remote repositories or execute Git commands.
- It does not parse language symbols yet.
- Ignore behavior is not fully Git-compatible.
- Hashes establish content identity, not correctness or safety.
- The completion gate only validates supplied records. It cannot prove that evidence is authentic unless the host binds evidence to actual tool output.
