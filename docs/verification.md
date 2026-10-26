# Patch integration and verification

```mermaid
flowchart TD
 A[Model proposes patch] --> B[Validate schema and paths]
 B --> C[Check permissions]
 C --> D[Apply in isolated workspace]
 D --> E[Review diff and conflicts]
 E --> F[Run targeted tests]
 F --> G[Run broader checks when practical]
 G --> H[Map evidence to requirement IDs]
 H --> I{All required checks satisfied?}
 I -->|Yes| J[Report verified result]
 I -->|No| K[Report failures or blockers]
```

Use deterministic tests and static checks where possible. Compare behavior before/after for risky changes. Generated tests are useful but not automatically sufficient. Validate against the original requirements, not just a model's summary. Preserve failure output and explain environment limitations. Never report success based only on a plausible diff.
