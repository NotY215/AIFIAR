export type EvidenceKind = "source-code" | "official-docs" | "test" | "runtime" | "community" | "model-claim" | "user-provided";
export type ConfidenceLevel = "confirmed" | "likely" | "hypothesis" | "unknown";

export interface EvidenceItem {
  id: string;
  claim: string;
  kind: EvidenceKind;
  source?: string;
  observedAt: string;
  supports: string[];
  limitations: string[];
  confidence: ConfidenceLevel;
}

export class EvidenceLedger {
  private readonly items: EvidenceItem[] = [];

  add(item: EvidenceItem): void {
    if (!item.id.trim() || !item.claim.trim()) throw new Error("Evidence ID and claim are required");
    if (this.items.some((entry) => entry.id === item.id)) throw new Error(`Duplicate evidence ID: ${item.id}`);
    this.items.push({ ...item, supports: [...item.supports], limitations: [...item.limitations] });
  }

  get(id: string): EvidenceItem | undefined {
    const item = this.items.find((entry) => entry.id === id);
    return item ? { ...item, supports: [...item.supports], limitations: [...item.limitations] } : undefined;
  }

  forClaim(claim: string): EvidenceItem[] {
    const key = claim.trim().toLowerCase();
    return this.items.filter((item) => item.claim.trim().toLowerCase() === key)
      .map((item) => ({ ...item, supports: [...item.supports], limitations: [...item.limitations] }));
  }

  snapshot(): readonly EvidenceItem[] {
    return this.items.map((item) => ({ ...item, supports: [...item.supports], limitations: [...item.limitations] }));
  }

  confidenceFor(claim: string): ConfidenceLevel {
    const evidence = this.forClaim(claim);
    if (evidence.some((item) => item.confidence === "confirmed" && item.kind !== "model-claim")) return "confirmed";
    if (evidence.some((item) => item.confidence === "likely")) return "likely";
    if (evidence.some((item) => item.confidence === "hypothesis")) return "hypothesis";
    return "unknown";
  }
}
