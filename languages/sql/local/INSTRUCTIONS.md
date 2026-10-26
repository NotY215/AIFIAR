# SQL instructions for local models

Apply [the common SQL rules](../common/AGENTS.md) first. Local model output is untrusted and cannot authorize database actions.

Use parameterized queries, explicit transactions, least-privilege roles, and reversible migrations. Never run generated SQL against production or a non-disposable database without explicit host authorization and human review. Validate schema assumptions and inspect query plans where relevant. Use synthetic fixtures and redact personal data.

Only run project-defined migration or test commands against an explicitly disposable test database. Report the database engine/version and tests actually run. If database safety cannot be established, stop and explain the blocker.
