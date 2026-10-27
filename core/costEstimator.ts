export interface ProviderRateCard {
  provider: string;
  modelId: string;
  currency: string;
  inputUsdPerMillionTokens: number;
  outputUsdPerMillionTokens: number;
  effectiveAt: string;
  verifiedAt: string;
  sourceUrl: string;
}

export interface ObservedTokenUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface CostEstimate {
  amount: number;
  currency: string;
  provider: string;
  modelId: string;
  rateCardVerifiedAt: string;
  sourceUrl: string;
}

/**
 * Uses only a host-supplied, traceable rate card. This is an estimate based on
 * token counts and does not include provider-specific fees unless the rate card does.
 */
export function estimateProviderCost(rateCard: ProviderRateCard, usage: ObservedTokenUsage): CostEstimate {
  for (const [label, value] of [
    ["inputTokens", usage.inputTokens],
    ["outputTokens", usage.outputTokens],
    ["input rate", rateCard.inputUsdPerMillionTokens],
    ["output rate", rateCard.outputUsdPerMillionTokens]
  ] as const) {
    if (!Number.isFinite(value) || value < 0) throw new Error(`${label} must be a finite non-negative number.`);
  }
  if (!rateCard.provider.trim() || !rateCard.modelId.trim() || !rateCard.currency.trim()) {
    throw new Error("Rate card must declare provider, model ID, and currency.");
  }
  if (!Number.isFinite(Date.parse(rateCard.effectiveAt)) || !Number.isFinite(Date.parse(rateCard.verifiedAt))) {
    throw new Error("Rate card dates must be valid ISO-compatible timestamps.");
  }
  let source: URL;
  try {
    source = new URL(rateCard.sourceUrl);
  } catch {
    throw new Error("Rate card source URL must be valid.");
  }
  if (source.protocol !== "https:") throw new Error("Rate card source URL must use HTTPS.");
  const amount = (usage.inputTokens * rateCard.inputUsdPerMillionTokens
    + usage.outputTokens * rateCard.outputUsdPerMillionTokens) / 1_000_000;
  return {
    amount,
    currency: rateCard.currency,
    provider: rateCard.provider,
    modelId: rateCard.modelId,
    rateCardVerifiedAt: rateCard.verifiedAt,
    sourceUrl: source.toString()
  };
}
