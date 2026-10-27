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

function validateUsage(usage: UsageRecord): void {
  if (!usage || typeof usage.provider !== "string" || !usage.provider.trim()
    || typeof usage.modelId !== "string" || !usage.modelId.trim()) {
    throw new Error("Usage provider and model ID are required.");
  }
  for (const [name, value] of [["inputTokens", usage.inputTokens], ["outputTokens", usage.outputTokens]] as const) {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new Error(`${name} must be a non-negative safe integer.`);
    }
  }
  if (usage.estimatedCost !== undefined && (!Number.isFinite(usage.estimatedCost) || usage.estimatedCost < 0)) {
    throw new Error("Estimated cost must be finite and non-negative.");
  }
}

function validateBudget(budget: TokenBudget): void {
  for (const [name, value] of Object.entries(budget)) {
    if (value === undefined) continue;
    if (name === "maxEstimatedCost") {
      if (!Number.isFinite(value) || value < 0) throw new Error("maxEstimatedCost must be finite and non-negative.");
    } else if (!Number.isSafeInteger(value) || value < 0) {
      throw new Error(`${name} must be a non-negative safe integer.`);
    }
  }
}

/**
 * Tracks usage and enforces declared budgets. It deliberately does not compress,
 * summarize, or delete user requirements. Token estimates are advisory unless
 * the provider returns authoritative usage metadata.
 */
export class TokenManager {
  private readonly records: UsageRecord[] = [];
  constructor(private readonly budget: TokenBudget = {}) {
    validateBudget(budget);
  }

  record(usage: UsageRecord): void {
    validateUsage(usage);
    this.records.push({ ...usage });
  }

  check(next: UsageRecord): BudgetCheck {
    validateUsage(next);
    const all = [...this.records, next];
    const input = all.reduce((sum, item) => sum + item.inputTokens, 0);
    const output = all.reduce((sum, item) => sum + item.outputTokens, 0);
    const total = input + output;
    const cost = all.reduce((sum, item) => sum + (item.estimatedCost ?? 0), 0);
    const reasons: string[] = [];
    if (!Number.isSafeInteger(input) || !Number.isSafeInteger(output) || !Number.isSafeInteger(total) || !Number.isFinite(cost)) {
      reasons.push("Usage totals exceed safe numeric bounds");
    }
    if (this.budget.maxInputTokens !== undefined && input > this.budget.maxInputTokens) reasons.push("Input token budget would be exceeded");
    if (this.budget.maxOutputTokens !== undefined && output > this.budget.maxOutputTokens) reasons.push("Output token budget would be exceeded");
    if (this.budget.maxTotalTokens !== undefined && total > this.budget.maxTotalTokens) reasons.push("Total token budget would be exceeded");
    if (this.budget.maxEstimatedCost !== undefined && cost > this.budget.maxEstimatedCost) reasons.push("Estimated cost budget would be exceeded");
    return { allowed: reasons.length === 0, reasons, totalObservedTokens: total, estimatedCost: cost };
  }

  snapshot(): readonly UsageRecord[] { return this.records.map((record) => ({ ...record })); }
}
