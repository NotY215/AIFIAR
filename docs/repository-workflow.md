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

## Whole-repository analysis protocol

When a task is classified as `repository-analysis`, `core/modelExecutionInstructions.ts` attaches both `core/repositoryAnalysisInstructions.ts` and `core/dumpPasteAnalysisInstructions.ts`.

The repository protocol requires an ordered process:

1. Confirm repository identity, branch/commit, access method, user intent, constraints, and permissions.
2. Read root and applicable nested project instructions.
3. Inventory the accessible tree and classify source, tests, documentation, configuration, generated files, vendored code, binaries, submodules, and unknown items.
4. Maintain a coverage ledger. Each path is recorded as read, metadata-only, excluded, inaccessible, truncated, pending, or not relevant, with a reason.
5. Read relevant source in bounded batches, trace imports/callers/data flow/state/concurrency/persistence/configuration, and cross-check behavior against tests and docs.
6. Build architecture, dependency, feature-to-file, and requirement-to-evidence maps.
7. Rank evidence-backed findings and distinguish confirmed defects from hypotheses.
8. Compare redesign options across complexity, allocations, I/O, caching, concurrency, memory, dependencies, compatibility, security, and maintainability.
9. Implement authorized improvements across all required integration points, tests, and documentation.
10. Run available verification, inspect the final diff, and report exact coverage, changes, results, and remaining gaps.

A whole-repository request means broad coverage of the accessible repository, not an unsupported promise that every byte or behavior was inspected. Inaccessible, binary, generated, secret-bearing, oversized, or truncated items must be reported honestly. The protocol does not itself grant clone, shell, filesystem, web, or write access.

## Dump-paste reconstruction and redesign

When users provide multiple pasted code dumps or partial files, the dedicated dump-paste protocol requires the agent to:

- Assign stable IDs to the supplied dumps and inventory their original paths, languages, completeness, overlaps, and uncertainties.
- Count dump artifacts, distinct source files represented, repository files inspected, existing files modified, new files created, removed/renamed files, and final total separately. A fragment is not automatically a complete file.
- Preserve the input snapshot when the host supports it and never overwrite the only copy of supplied material.
- Reconstruct behavior by tracing symbols, imports, callers, state, side effects, dependencies, error paths, and external contracts across all dumps.
- Compare the reconstructed code with the current repository so that existing modules, tests, and APIs are not duplicated or bypassed.
- Design the output tree before implementation. Each new file needs a clear responsibility, interface, dependencies, and tests.
- Map every output file and important symbol to the dump IDs/ranges that informed it. If an output file combines fragments with new integration logic, state that explicitly.
- Redesign the code for the current project style and supported language/runtime. Improve structure, safety, maintainability, and performance where evidence supports it; do not simply paste old code unchanged.
- Integrate the new files through imports, exports, registration, routing, dependency injection, configuration, and callers. A standalone file that is never used is not a completed implementation.
- Preserve applicable notices, attribution, and provenance. A refactor or multi-file layout does not remove license obligations. Unclear source origin or license compatibility must be flagged for review; no legal guarantee is made.
- Add regression tests, run the available build/type/lint/test checks, update Markdown docs, and inspect the complete diff.

### Example: five dumps become six output files

If the user supplies five artifacts named Dump A through Dump E and the implementation needs six new files, the agent must not assume that each dump maps one-to-one to one output file. A valid architecture could have:

| Output | Responsibility | Source mapping |
|---|---|---|
| `module-1` | Domain model and shared types | Relevant declarations from A, C, and E |
| `module-2` | Input parsing and validation | Parsing fragments from A and B |
| `module-3` | Core business logic | Behavior from B, C, and D, redesigned |
| `module-4` | Persistence or state handling | State-related fragments from C and E |
| `module-5` | Supporting utilities | Reusable helpers from A, D, and E |
| `module-6` | Integration/orchestration | Explicit imports and coordination across modules plus new glue code |

This is only an illustrative mapping; actual paths and responsibilities must come from source inspection. It is acceptable for modules to live in different directories when that reflects the architecture. It is not acceptable to scatter code to conceal origin, defeat review, or remove traceability. Keep the mapping in an engineering record so future maintainers can understand why each module exists.

## Safety and limitations

- Source context is transient. Durable memory stores hashes, short path-based summaries, and redacted symbol metadata, not raw source files.
- Sensitive paths are excluded from task context. Heuristic redaction is not a guarantee that all secrets are removed.
- Context is bounded per file, per task, and by selected file count.
- Incomplete scans produce warnings and do not overwrite the previously persisted memory record.
- The symbol index is lexical and approximate. Always inspect current source before editing.
- Provider output is analysis text. This workflow does not itself apply patches or execute repository commands.
- Before accepting a patch, the host must recheck context hashes and use the existing authorization, patch validation, digest approval, transaction, and verification controls.
- Repository scanning, cloning, source reading, writing, testing, benchmarking, and persistent memory are distinct capabilities. The host must provide each capability and the corresponding permissions.
