# Project inspection and memory

AIFIAR should map the repository before editing. A file record can include relative path, purpose, key symbols, content hash, last-inspected timestamp, dependencies, related requirement IDs, confidence, and source.

```mermaid
flowchart LR
 T[Tree scan] --> F[Inspect relevant files]
 F --> S[Summaries plus hashes]
 S --> M[Task-scoped project map]
 M --> Q[Retrieve needed context]
 Q --> C{Hash current?}
 C -->|Yes| U[Reuse summary]
 C -->|No| R[Re-read changed file]
 R --> S
```

The current `ProjectMemory` helper is in-process only. Durable memory requires a storage backend, freshness invalidation, privacy controls, and user-visible behavior. Do not claim persistent memory across sessions unless implemented. Reuse only current summaries and never omit requirements needed by the subtask.
