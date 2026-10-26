import { createHmac, timingSafeEqual } from "node:crypto";
import { constants } from "node:fs";
import { lstat, mkdir, open, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

export interface SignedApprovalReceipt {
  schemaVersion: 1;
  decisionId: string;
  operatorId: string;
  proposalDigest: string;
  decision: "approve" | "deny";
  issuedAt: string;
  expiresAt: string;
  signature: string;
}

export interface ApprovalReceiptInput {
  decisionId: string;
  operatorId: string;
  proposalDigest: string;
  decision: "approve" | "deny";
  issuedAt?: string;
  expiresAt: string;
}

const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/;
const HASH = /^[a-f0-9]{64}$/;
const MAX_RECEIPT_LIFETIME_MS = 15 * 60 * 1000;

function canonical(value: unknown): string {
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  if (typeof value === "object" && value !== null) {
    const object = value as Record<string, unknown>;
    return "{" + Object.keys(object).sort().map((key) => JSON.stringify(key) + ":" + canonical(object[key])).join(",") + "}";
  }
  return JSON.stringify(value) ?? "null";
}

function validateKey(key: Uint8Array): void {
  if (!(key instanceof Uint8Array) || key.byteLength < 32) {
    throw new Error("Approval signing key must contain at least 32 bytes from a trusted host secret store.");
  }
}

function signatureFor(body: Omit<SignedApprovalReceipt, "signature">, key: Uint8Array): string {
  return createHmac("sha256", key).update(canonical(body), "utf8").digest("hex");
}

export function signApprovalReceipt(input: ApprovalReceiptInput, key: Uint8Array, now = Date.now()): SignedApprovalReceipt {
  validateKey(key);
  const issuedAt = input.issuedAt ?? new Date(now).toISOString();
  const issued = Date.parse(issuedAt);
  const expires = Date.parse(input.expiresAt);
  if (!ID.test(input.decisionId) || !ID.test(input.operatorId) || !HASH.test(input.proposalDigest)) {
    throw new Error("Approval receipt has an invalid decision ID, operator ID, or proposal digest.");
  }
  if (!Number.isFinite(issued) || !Number.isFinite(expires) || issued > now + 30_000 ||
      expires <= now || expires <= issued || expires - issued > MAX_RECEIPT_LIFETIME_MS) {
    throw new Error("Approval receipt timestamps are invalid or exceed the 15-minute lifetime.");
  }
  const body = {
    schemaVersion: 1 as const,
    decisionId: input.decisionId,
    operatorId: input.operatorId,
    proposalDigest: input.proposalDigest,
    decision: input.decision,
    issuedAt,
    expiresAt: input.expiresAt
  };
  return { ...body, signature: signatureFor(body, key) };
}

/**
 * Verifies a host-signed receipt and consumes its decision ID exactly once.
 * Authentication of operatorId and protection of the signing key are host
 * responsibilities. The ledger directory must not be writable by model code.
 */
export async function verifyAndConsumeApprovalReceipt(input: {
  receipt: SignedApprovalReceipt;
  expectedProposalDigest: string;
  signingKey: Uint8Array;
  ledgerPath: string;
  now?: number;
}): Promise<{ approved: boolean; operatorId: string; decisionId: string; expiresAt: string }> {
  const { receipt, signingKey } = input;
  validateKey(signingKey);
  const now = input.now ?? Date.now();
  if (receipt.schemaVersion !== 1 || !ID.test(receipt.decisionId) || !ID.test(receipt.operatorId) ||
      !HASH.test(receipt.proposalDigest) || receipt.proposalDigest !== input.expectedProposalDigest ||
      !["approve", "deny"].includes(receipt.decision) ||
      !Number.isFinite(Date.parse(receipt.issuedAt)) || !Number.isFinite(Date.parse(receipt.expiresAt)) ||
      Date.parse(receipt.issuedAt) > now + 30_000 || Date.parse(receipt.expiresAt) <= now ||
      Date.parse(receipt.expiresAt) <= Date.parse(receipt.issuedAt) ||
      Date.parse(receipt.expiresAt) - Date.parse(receipt.issuedAt) > MAX_RECEIPT_LIFETIME_MS) {
    throw new Error("Approval receipt is invalid, expired, or bound to a different proposal.");
  }
  const { signature, ...body } = receipt;
  const expectedSignature = signatureFor(body, signingKey);
  const supplied = Buffer.from(signature, "hex");
  const expected = Buffer.from(expectedSignature, "hex");
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
    throw new Error("Approval receipt signature is invalid.");
  }

  const path = resolve(input.ledgerPath);
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const lockPath = path + ".lock";
  let lock;
  try {
    lock = await open(lockPath, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | (constants.O_NOFOLLOW ?? 0), 0o600);
  } catch {
    throw new Error("Approval receipt ledger is locked or unsafe; retry only after the host resolves the lock.");
  }
  try {
    await lock.writeFile(JSON.stringify({ pid: process.pid, createdAt: new Date(now).toISOString() }), "utf8");
    await lock.sync();
    let used = new Set<string>();
    try {
      const info = await lstat(path);
      if (info.isSymbolicLink() || !info.isFile() || info.size > 8 * 1024 * 1024) {
        throw new Error("Approval receipt ledger path is unsafe or exceeds its size limit.");
      }
      const raw = await readFile(path, "utf8");
      for (const [index, line] of raw.split("\n").filter(Boolean).entries()) {
        let record: unknown;
        try { record = JSON.parse(line); } catch { throw new Error("Approval receipt ledger is corrupt at record " + (index + 1) + "."); }
        if (typeof record !== "object" || record === null || typeof (record as { decisionId?: unknown }).decisionId !== "string") {
          throw new Error("Approval receipt ledger contains an invalid record.");
        }
        used.add((record as { decisionId: string }).decisionId);
      }
    } catch (error) {
      if (!(typeof error === "object" && error !== null && "code" in error && (error as { code?: string }).code === "ENOENT")) throw error;
    }
    if (used.has(receipt.decisionId)) throw new Error("Approval receipt has already been consumed.");
    const flags = constants.O_CREAT | constants.O_APPEND | constants.O_WRONLY | (constants.O_NOFOLLOW ?? 0);
    const handle = await open(path, flags, 0o600);
    try {
      await handle.chmod(0o600).catch(() => undefined);
      await handle.writeFile(JSON.stringify({ decisionId: receipt.decisionId, proposalDigest: receipt.proposalDigest, operatorId: receipt.operatorId, consumedAt: new Date(now).toISOString() }) + "\n", "utf8");
      await handle.sync();
    } finally {
      await handle.close();
    }
  } finally {
    await lock.close();
    const { unlink } = await import("node:fs/promises");
    await unlink(lockPath).catch(() => undefined);
  }
  return { approved: receipt.decision === "approve", operatorId: receipt.operatorId, decisionId: receipt.decisionId, expiresAt: receipt.expiresAt };
}
