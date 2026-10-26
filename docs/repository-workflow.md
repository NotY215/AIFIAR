# Repository-to-provider workflow

`core/repositoryWorkflow.ts` connects repository understanding with the model runtime:

1. Scan the selected local repository using deterministic traversal and bounded file sizes.
2. Hash files and refresh durable repository memory only when the scan is complete.
3. Build a language-aware symbol and reference index.
4. Rank relevant files for each task and select a bounded context set.
5. Optionally load a saved project profile only after checking its timestamp and observed commit against the current revision.
6. Redact common secret patterns from source excerpts and attach relative paths plus SHA-256 references to each task.
7. Route the enriched plan through the configured provider runtime and orchestrator.
8. Return context warnings, incomplete-scan status, profile freshness, and task results.

## Example

```ts
import { runRepositoryWorkflow } from "./core/repositoryWorkflow.js";
import { createProviderRuntime } from "./models/providerRuntime.js";
import { JsonFileProjectProfileStore } from "./core/projectProfileStore.js";

const runtime = createProviderRuntime();
const report = await runRepositoryWorkflow(
  workPlan,
  runtime.registry,
  runtime.executor,
  {
    repositoryId: "owner/repository",
    rootPath: process.cwd(),
    storeDirectory: "./.aifiar/memory",
    commit: process.env.GIT_COMMIT,
    profileStore: new JsonFileProjectProfileStore("./.aifiar/project-profile.json")
  }
);
```

The host must provide a validated `WorkPlan`, a local repository path, and an explicit memory directory. A `ProjectProfileStore` can optionally be supplied. Its profile is included only when `assessProfileFreshness` returns `fresh`; stale or unknown profiles are excluded and a warning is added. Configure provider keys and model IDs using the environment variables in the provider integration guide.

## Safety and limitations

- Source context is transient. The durable memory stores hashes, short path-based summaries, and redacted symbol metadata, not raw source files.
- Sensitive paths are excluded from task context. Heuristic redaction is not a guarantee that all secrets are removed.
- Context is bounded per file, per task, and by selected file count.
- Incomplete scans produce warnings and do not overwrite the previously persisted memory record.
- The symbol index is lexical and approximate. Always inspect current source before editing.
- Provider output is analysis text. This workflow does not apply patches or execute repository commands.
- Before accepting a patch, the host must recheck context hashes and use the existing authorization, patch validation, digest approval, transaction, and verification controls.


## Structured patch proposal boundary

The module core/patchProposal.ts defines a strict JSON proposal format for untrusted model output. It rejects unknown fields, invalid operations, unsafe paths, missing expected file hashes, duplicate targets, oversized inputs, and patch-policy violations. Valid proposals receive a SHA-256 digest over canonicalized repository/task/base-revision metadata and every change. The digest is intended to bind review and approval to the exact proposal and base state.

The host can pass a valid proposal to authorizePatchProposal with an approval callback that authenticates the operator and displays the full change list, base revision, and digest for review. The framework passes a frozen copy of the proposed changes, checks that the returned decision references the exact digest, includes operator and decision identifiers, has a bounded expiry, and confirms the proposal was not mutated during approval. A model response or plain boolean is not approval.

This boundary does not itself authenticate an operator, persist approvals against replay, re-read the repository, apply files, or provide crash-safe filesystem operations. Those guarantees belong to the host approval service and the existing freshness gate and patch transaction. Recheck every expectedHash against the live workspace immediately before apply. Rename source handling and filesystem race resistance still need platform-specific transaction support.


The approvedPatchWorkflow.ts module now connects the proposal boundary to the existing transaction path. It checks the repository revision before approval and again afterward, asks the host to re-read target hashes, rejects targets that changed during review, requires a confirmed trusted workspace, and passes the proposal through the action gate and post-apply verification/rollback coordinator. The host still supplies the authenticated approval service, live filesystem hash reader, and actual apply/verify/rollback adapter. Rename proposals are deliberately blocked by this execution path until source and destination hash semantics are represented separately.
