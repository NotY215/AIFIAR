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


## Executable repository workflow

The `runRepositoryWorkflow` helper in `core/repositoryWorkflow.ts` connects repository scanning, persistent memory, symbol indexing, task-scoped context assembly, model routing, and task execution.

```ts
import { runRepositoryWorkflow } from "./core/repositoryWorkflow.js";
import { createProviderRuntime } from "./models/providerRuntime.js";

const runtime = createProviderRuntime();
const report = await runRepositoryWorkflow(
  workPlan,
  runtime.registry,
  runtime.executor,
  {
    repositoryId: "owner/repository",
    rootPath: process.cwd(),
    storeDirectory: "./.aifiar/memory",
    commit: process.env.GIT_COMMIT
  }
);

console.log(report.context.warnings);
console.log(report.orchestration.results);
```

Supply a real, validated `WorkPlan` as `workPlan`. This helper performs analysis-task orchestration only. It does not apply model-proposed edits or run arbitrary repository commands. Changes still need the patch policy, exact-digest approval, freshness checks, safe patch transaction, and multi-stage verification before they can be accepted.

Context is selected per task and bounded by file count, per-file size, and total size. It includes source hashes as references and redacts common secret patterns. The repository scanner never follows symlinks. If a scan is incomplete, the report includes a warning and the partial snapshot is not persisted.
