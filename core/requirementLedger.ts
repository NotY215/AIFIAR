import type { Requirement } from "./types.js";

export function createRequirementLedger(items: Array<{ text: string; mandatory?: boolean }>): Requirement[] {
  return items.map((item, index) => ({
    id: `R${String(index + 1).padStart(3, "0")}`,
    text: item.text,
    mandatory: item.mandatory ?? true,
    status: "pending",
    evidence: []
  }));
}

export function validateRequirementCoverage(requirements: readonly Requirement[], referencedIds: readonly string[]): string[] {
  const known = new Set(requirements.map((r) => r.id));
  const unknown = referencedIds.filter((id) => !known.has(id));
  const uncovered = requirements.filter((r) => r.mandatory && !referencedIds.includes(r.id)).map((r) => r.id);
  return [...unknown.map((id) => `Unknown requirement reference: ${id}`), ...uncovered.map((id) => `Mandatory requirement has no task: ${id}`)];
}
