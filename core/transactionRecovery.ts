import type { TransactionJournal } from "./transactionJournal.js";

export interface RecoverySnapshot {
  transactionId: string;
  snapshotId: string;
  manifestDigest: string;
  paths: string[];
  evidence: string[];
}

export interface RecoveryOutcome {
  status: "restored" | "conflict" | "failed" | "already-committed";
  evidence: string[];
  blockers: string[];
}

/**
 * Host-owned boundary for durable recovery. Implementations must persist
 * original bytes and metadata before returning from prepare(), bind the
 * snapshot to the exact approved manifest digest, and use race-resistant
 * filesystem primitives when inspecting or restoring targets.
 */
export interface DurablePatchRecoveryAdapter {
  prepare(input: {
    transactionId: string;
    manifestDigest: string;
    paths: readonly string[];
  }): Promise<RecoverySnapshot>;
  commit(input: { transactionId: string; snapshotId: string }): Promise<void>;
  recover(input: { transactionId: string }): Promise<RecoveryOutcome>;
  listPending(): Promise<Array<{ transactionId: string; snapshotId: string; manifestDigest: string }>>;
}

export interface RecoveryCoordinatorReport {
  transactionId: string;
  status: RecoveryOutcome["status"];
  evidence: string[];
  blockers: string[];
}

/**
 * Recovery is deliberately conservative. The coordinator never calls a
 * restore method itself: the trusted host adapter must inspect every target
 * against its before/after states and refuse conflicts before mutation.
 */
export async function recoverInterruptedPatch(
  adapter: DurablePatchRecoveryAdapter,
  journal: TransactionJournal,
  transactionId: string
): Promise<RecoveryCoordinatorReport> {
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/.test(transactionId)) {
    return { transactionId, status: "failed", evidence: [], blockers: ["Invalid transaction identifier."] };
  }
  let outcome: RecoveryOutcome;
  try {
    outcome = await adapter.recover({ transactionId });
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 300) : String(error).slice(0, 300);
    try {
      await journal.append({ transactionId, phase: "recovery-required", details: { reason: "recovery-adapter-threw", error: message } });
    } catch { /* Preserve the last durable journal state. */ }
    return { transactionId, status: "failed", evidence: [], blockers: ["Recovery adapter failed; manual recovery is required: " + message] };
  }

  if (outcome.status === "restored") {
    if (!outcome.evidence.some((item) => item.trim()) || outcome.blockers.length) {
      return {
        transactionId, status: "failed", evidence: outcome.evidence,
        blockers: [...outcome.blockers, "Recovery adapter did not provide clean restoration evidence."]
      };
    }
    try {
      await journal.append({
        transactionId,
        phase: "recovered",
        details: { recoveryEvidence: outcome.evidence.slice(0, 20) }
      });
    } catch (error) {
      const message = error instanceof Error ? error.message.slice(0, 300) : String(error).slice(0, 300);
      return { transactionId, status: "failed", evidence: outcome.evidence, blockers: ["Files may be restored, but the journal could not record recovery completion: " + message] };
    }
    return { transactionId, status: "restored", evidence: outcome.evidence, blockers: [] };
  }

  if (outcome.status === "already-committed") {
    return {
      transactionId, status: "already-committed", evidence: outcome.evidence,
      blockers: [...outcome.blockers, "Committed transactions must not be rolled back."]
    };
  }

  try {
    await journal.append({
      transactionId,
      phase: "recovery-required",
      details: { reason: outcome.status, blockers: outcome.blockers.slice(0, 20) }
    });
  } catch { /* Existing pending journal entry remains discoverable. */ }
  return {
    transactionId,
    status: outcome.status,
    evidence: outcome.evidence,
    blockers: outcome.blockers.length ? outcome.blockers : ["Recovery did not complete safely."]
  };
}
