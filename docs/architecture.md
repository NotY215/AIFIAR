# Architecture

AIFIAR is split into small, replaceable modules.

```mermaid
flowchart LR
 U[User or coding agent] --> O[Orchestrator]
 O --> R[Requirement ledger]
 O --> P[Project map and memory]
 P --> T[Task planner]
 T --> X[Capability router]
 X --> G[Model registry]
 T --> D[Dependency scheduler]
 D --> A[Provider adapters]
 A --> M[Result integration]
 M --> V[Verification engine]
 V --> F[Human-readable report]
 Q[Permission and patch policy] -. gates .-> A
 B[Token and cost manager] -. budgets .-> X
```

## Module boundaries
- `core/types.ts`: shared task and result types.
- `requirementLedger.ts`: stable requirement IDs and coverage checks.
- `taskPlanner.ts`: task graph construction and basic classification.
- `taskRouter.ts`: capability-based candidate filtering.
- `dependencyScheduler.ts`: readiness and cycle detection.
- `tokenManager.ts`: usage accounting, not prompt rewriting.
- `projectMemory.ts`: in-process file summaries with freshness metadata.
- `patchPolicy.ts`: protected-path assessment.
- `resultMerger.ts`: evidence aggregation, not majority-vote truth.
- `verificationEngine.ts`: requirement/task status checks.
- `orchestrator.ts`: scheduling loop; does not execute shell commands.

Model output is untrusted input. The host must enforce permissions, validate paths, inspect patches, and isolate execution outside model prompts. Provider adapters, sandboxing, durable storage, and end-to-end tests remain future work.
