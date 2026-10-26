# Node workspace recovery adapter

`NodeWorkspaceRecoveryAdapter` provides a concrete host implementation for local development and trusted single-user workspaces.

It persists a snapshot before mutation, including each target's original bytes, SHA-256 digest, mode, and expected post-patch digest. The adapter refuses path traversal, symlink targets and parents, hard-linked targets, mismatched expected hashes, oversized snapshots, ambiguous recovery states, and unexpected concurrent changes. Recovery only restores a file when its current content matches the recorded before-state or expected after-state. It verifies all targets after restoration.

## Setup

Keep the snapshot store outside the workspace and protect it with operating-system permissions. For example:

```ts
import { JsonlTransactionJournal } from "./transactionJournal.js";
import { NodeWorkspaceRecoveryAdapter } from "./nodeWorkspaceRecoveryAdapter.js";

const recovery = new NodeWorkspaceRecoveryAdapter(
  "/trusted/workspaces/project",
  "/trusted/aifiar-metadata/project"
);
const journal = new JsonlTransactionJournal(
  "/trusted/aifiar-metadata/project/transactions.jsonl"
);
```

Pass the adapter and the exact approved proposal through `executeApprovedPatchProposal`. Do not construct `recoveryChanges` from untrusted model output after approval. The approved workflow supplies the parsed, digest-bound proposal.

## Security boundary

This adapter is a practical recovery implementation, not a complete hostile-process filesystem boundary. Node's portable filesystem API does not expose a uniform set of handle-relative operations that can eliminate every directory-rename race on Windows and POSIX. Metadata-directory permissions are assumed trusted; a local attacker who can modify snapshots can undermine recovery decisions. Directory fsync is skipped on Windows because portable directory fsync is unavailable.

Use a dedicated OS account, a disposable workspace, a platform-native safe filesystem backend, and a sandbox for untrusted code. Do not use this adapter alone as a security boundary for multi-user services or hostile local processes. Native Windows handle-relative writes, race-injection tests, signed snapshot metadata, and production host authentication remain separate hardening tasks.
