# End-to-end workflow

```mermaid
flowchart TD
 A[Receive request] --> B[Preserve original request]
 B --> C[Create requirement ledger]
 C --> D[Inspect project tree and docs]
 D --> E[Map relevant files and risks]
 E --> F[Plan tasks and dependencies]
 F --> G{Protected or high-impact action?}
 G -->|Yes| H[Explain impact and request approval]
 H -->|Approved| I[Schedule eligible tasks]
 H -->|Declined| X[Stop or revise plan]
 G -->|No| I
 I --> J[Run scoped tasks]
 J --> K[Collect findings and patches]
 K --> L[Review policy and conflicts]
 L --> M[Run checks]
 M --> N{Requirements satisfied?}
 N -->|No| O[Report blockers or follow-up]
 N -->|Yes| P[Final report]
```

The final report should state the outcome, files changed, requirements addressed or blocked, checks actually run, risks, and unverified items. A report must never claim success without evidence.
