# Paste-a-Repository-Link Workflow

AIFIAR can describe a task-scoped workflow for when a user shares a repository URL. The workflow is guidance, not a claim that a model has repository access or durable memory.

## Workflow

1. Parse and validate the URL if the available tools support it.
2. Confirm the repository, ref, and observed commit when possible.
3. Read applicable root and nested instructions.
4. Inspect only the source, docs, manifests, tests, and release notes relevant to the requested task. Do not require the full documentation suite on every turn.
5. Preserve the user's requirements and constraints. Use a traceable checklist for multi-step or high-risk tasks.
6. Summarize conventions, protected paths, verification commands, known issues, and unknowns when a reusable project profile materially helps.
7. Persist a summary only when a real persistent storage mechanism is available. Record its source revision and check freshness before reuse.
8. Reinspect changed or uncertain source before making claims or edits.
9. Report what was actually read, what was saved, which checks ran, and what remains unknown.

## Memory contract

"Remember" means maintain a refreshable project profile only when storage exists. It does not imply permanent learning or cross-session recall. Without persistence, use current-session context or provide a reusable brief when useful.

## Current implementation boundary

`core/repositoryIntake.ts` validates supported GitHub URLs and creates an inspection/memory/safety checklist. It does not download repository files, authenticate to GitHub, scan local files, save persistent memory, or execute project commands. Those capabilities require separate adapters and explicit permission.
