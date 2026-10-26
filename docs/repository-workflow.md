# Repository-to-provider workflow

`core/repositoryWorkflow.ts` connects repository understanding with the model runtime:

1. Scan the selected local repository using deterministic traversal and bounded file sizes.
2. Hash files and refresh durable repository memory only when the scan is complete.
3. Build a language-aware symbol and reference index.
4. Rank relevant files for each task and select a bounded context set.
5. Redact common secret patterns from source excerpts and attach relative paths plus SHA-256 references to each task.
6. Route the enriched plan through the configured provider runtime and orchestrator.
7. Return context warnings, incomplete-scan status, and task results.

## Example

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
```

The host must provide a validated `WorkPlan`, a local repository path, and an explicit memory directory. Configure provider keys and model IDs using the environment variables in the provider integration guide.

## Safety and limitations

- Source context is transient. The durable memory stores hashes, short path-based summaries, and redacted symbol metadata, not raw source files.
- Sensitive paths are excluded from task context. Heuristic redaction is not a guarantee that all secrets are removed.
- Context is bounded per file, per task, and by selected file count.
- Incomplete scans produce warnings and do not overwrite the previously persisted memory record.
- The symbol index is lexical and approximate. Always inspect current source before editing.
- Provider output is analysis text. This workflow does not apply patches or execute repository commands.
- Before accepting a patch, the host must recheck context hashes and use the existing authorization, patch validation, digest approval, transaction, and verification controls.
