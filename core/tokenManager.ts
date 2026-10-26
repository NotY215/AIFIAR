export interface TokenBudget {
  maxInputTokens?: number;
  maxOutputTokens?: number;
  maxTotalTokens?: number;
  maxEstimatedCost?: number;
}

export interface UsageRecord {
  provider: string;
  modelId: string;
  inputTokens: number;
  outputTokens: number;
  estimatedCost?: number;
}

export interface BudgetCheck {
  allowed: boolean;
  reasons: string[];
  totalObservedTokens: number;
  estimatedCost: number;
}

/**
 * Tracks usage and enforces declared budgets. It deliberately does not compress,
 * summarize, or delete user requirements. Token estimates are advisory unless
 * the provider returns authoritative usage metadata.
 */
export class TokenManager {
  private readonly records: UsageRecord[] = [];
  constructor(private readonly budget: TokenBudget = {}) {}

  record(usage: UsageRecord): void {
    if (usage.inputTokens < 0 || usage.outputTokens < 0) throw new Error("Token counts cannot be negative");
    this.records.push({ ...usage });
  }

  check(next: UsageRecord): BudgetCheck {
    const all = [...this.records, next];
    const input = all.reduce((sum, item) => sum + item.inputTokens, 0);
    const output = all.reduce((sum, item) => sum + item.outputTokens, 0);
    const total = input + output;
    const cost = all.reduce((sum, item) => sum + (item.estimatedCost ?? 0), 0);
    const reasons: string[] = [];
    if (this.budget.maxInputTokens !== undefined && input > this.budget.maxInputTokens) reasons.push("Input token budget would be exceeded");
    if (this.budget.maxOutputTokens !== undefined && output > this.budget.maxOutputTokens) reasons.push("Output token budget would be exceeded");
    if (this.budget.maxTotalTokens !== undefined && total > this.budget.maxTotalTokens) reasons.push("Total token budget would be exceeded");
    if (this.budget.maxEstimatedCost !== undefined && cost > this.budget.maxEstimatedCost) reasons.push("Estimated cost budget would be exceeded");
    return { allowed: reasons.length === 0, reasons, totalObservedTokens: total, estimatedCost: cost };
  }

  snapshot(): readonly UsageRecord[] { return this.records.map((record) => ({ ...record })); }
}
