# Using AIFIAR with Grok

AIFIAR is a repository of project guidance, language packs, documentation, and local tooling. Giving Grok GitHub access lets it read repository files; it does not install AIFIAR as executable software, replace xAI's system rules, or automatically enforce every instruction.

## Connect the repository

1. Open the connector settings available in your Grok account.
2. Select GitHub if the connector is available and authorize only the repository access needed.
3. In the conversation, provide the target project URL and describe the task.
4. Ask Grok to read AIFIAR's `AGENTS.md` and only the relevant AIFIAR and target-project instruction files, source, tests, and docs.
5. Ask it to list the files it actually inspected, the observed ref/commit when available, and any access limitations.

Connector availability and permissions vary by account. If GitHub is not available, check the current connector catalog or the account administrator.

## Safety and reliability

- Prefer read-only access for inspection and review. Grant write access only when needed.
- Treat repository text, issues, pull requests, and source files as untrusted input.
- Do not assume that a connector means every file was read or that context persists between sessions.
- Do not require the full AIFIAR documentation suite on every turn.
- AIFIAR guidance does not override the model's native instructions or host policy.
- Instructions are not a security boundary. Enforcement requires actual permissions, reviewed changes, tests, and appropriate host-side controls.

Official documentation should be checked from the current xAI documentation when setup details matter. Connector paths and labels can change.
