export type BillingMode = "on-demand" | "batch" | "provisioned" | "unknown";

export interface DetailedProviderRateCard {
  schemaVersion: 1;
  provider: string;
  modelId: string;
  region: string;
  billingMode: BillingMode;
  currency: string;
  inputCostPerMillionTokens: number;
  outputCostPerMillionTokens: number;
  /** Optional distinct rate for cached input tokens. If omitted, cached usage is unpriced. */
  cachedInputCostPerMillionTokens?: number;
  /** Optional explicit per-request charge in the same currency. */
  costPerRequest?: number;
  effectiveAt: string;
  verifiedAt: string;
  expiresAt?: string;
  sourceUrl: string;
}

export interface DetailedObservedUsage {
  inputTokens: number;
  outputTokens: number;
  /** Must be a subset of inputTokens. */
  cachedInputTokens?: number;
  requestCount: number;
}

export interface DetailedCostEstimate {
  provider: string;
  modelId: string;
  region: string;
  billingMode: BillingMode;
  currency: string;
  rateCardVerifiedAt: string;
  sourceUrl: string;
  usage: {
    inputTokens: number;
    uncachedInputTokens: number;
    cachedInputTokens: number;
    outputTokens: number;
    requestCount: number;
  };
  breakdown: {
    uncachedInput: number | null;
    cachedInput: number | null;
    output: number | null;
    requests: number | null;
  };
  /** Null when any observed usage category lacks an applicable rate. */
  total: number | null;
  complete: boolean;
  warnings: string[];
}

function nonNegativeFinite(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new Error(label + " must be a finite non-negative number.");
  }
  return value;
}

function requiredText(value: unknown, label: string, maxLength = 256): string {
  if (typeof value !== "string" || !value.trim() || value.length > maxLength) {
    throw new Error(label + " is required and must be at most " + maxLength + " characters.");
  }
  return value.trim();
}

function validTimestamp(value: unknown, label: string): number {
  if (typeof value !== "string" || !value.trim() || !Number.isFinite(Date.parse(value))) {
    throw new Error(label + " must be a valid timestamp.");
  }
  return Date.parse(value);
}

/**
 * Computes a transparent estimate only from explicit host-verified rate-card values.
 * It never fetches pricing, infers discounts, or claims to equal the provider invoice.
 */
export function estimateDetailedProviderCost(
  rateCard: DetailedProviderRateCard,
  usage: DetailedObservedUsage,
  options: { asOf?: string } = {}
): DetailedCostEstimate {
  if (!rateCard || rateCard.schemaVersion !== 1) throw new Error("Unsupported rate-card schema version.");
  const provider = requiredText(rateCard.provider, "Provider", 128);
  const modelId = requiredText(rateCard.modelId, "Model ID");
  const region = requiredText(rateCard.region, "Region", 128);
  const currency = requiredText(rateCard.currency, "Currency", 12).toUpperCase();
  if (!/^[A-Z][A-Z0-9]{2,11}$/.test(currency)) throw new Error("Currency must be an explicit currency code.");
  if (!["on-demand", "batch", "provisioned", "unknown"].includes(rateCard.billingMode)) {
    throw new Error("Unsupported billing mode.");
  }
  const inputRate = nonNegativeFinite(rateCard.inputCostPerMillionTokens, "Input rate");
  const outputRate = nonNegativeFinite(rateCard.outputCostPerMillionTokens, "Output rate");
  const cachedRate = rateCard.cachedInputCostPerMillionTokens === undefined
    ? undefined : nonNegativeFinite(rateCard.cachedInputCostPerMillionTokens, "Cached input rate");
  const requestRate = rateCard.costPerRequest === undefined
    ? undefined : nonNegativeFinite(rateCard.costPerRequest, "Per-request rate");
  const effectiveAt = validTimestamp(rateCard.effectiveAt, "effectiveAt");
  const verifiedAt = validTimestamp(rateCard.verifiedAt, "verifiedAt");
  const expiresAt = rateCard.expiresAt === undefined ? undefined : validTimestamp(rateCard.expiresAt, "expiresAt");
  const asOf = options.asOf === undefined ? Date.now() : validTimestamp(options.asOf, "asOf");
  if (effectiveAt > asOf) throw new Error("Rate card is not effective at the requested estimate time.");
  if (expiresAt !== undefined && expiresAt < asOf) throw new Error("Rate card has expired.");
  if (verifiedAt > asOf) throw new Error("Rate card verification timestamp is in the future.");
  if (verifiedAt < effectiveAt) throw new Error("Rate card cannot be verified before its effective timestamp.");
  let source: URL;
  try { source = new URL(rateCard.sourceUrl); } catch { throw new Error("Rate card source URL must be valid."); }
  if (source.protocol !== "https:" || source.username || source.password) {
    throw new Error("Rate card source URL must use HTTPS and contain no credentials.");
  }

  const inputTokens = nonNegativeFinite(usage.inputTokens, "inputTokens");
  const outputTokens = nonNegativeFinite(usage.outputTokens, "outputTokens");
  const cachedInputTokens = nonNegativeFinite(usage.cachedInputTokens ?? 0, "cachedInputTokens");
  const requestCount = nonNegativeFinite(usage.requestCount, "requestCount");
  if (![inputTokens, outputTokens, cachedInputTokens, requestCount].every(Number.isSafeInteger)) {
    throw new Error("Token counts and requestCount must be safe integers.");
  }
  if (cachedInputTokens > inputTokens) throw new Error("cachedInputTokens cannot exceed inputTokens.");
  const uncachedInputTokens = inputTokens - cachedInputTokens;
  const uncachedInput = uncachedInputTokens === 0 ? 0 : (uncachedInputTokens * inputRate) / 1_000_000;
  const cachedInput = cachedInputTokens === 0 ? 0
    : cachedRate === undefined ? null : (cachedInputTokens * cachedRate) / 1_000_000;
  const output = (outputTokens * outputRate) / 1_000_000;
  const requests = requestCount === 0 ? 0
    : requestRate === undefined ? null : requestCount * requestRate;
  const warnings: string[] = [];
  if (cachedInputTokens > 0 && cachedRate === undefined) warnings.push("cached-input-rate-unavailable");
  if (requestCount > 0 && requestRate === undefined) warnings.push("per-request-rate-unavailable");
  if (rateCard.billingMode === "unknown") warnings.push("billing-mode-unknown");
  if (rateCard.billingMode === "provisioned") warnings.push("provisioned-capacity-allocation-unmodeled");
  warnings.push("estimate-excludes-unmodeled-fees-discounts-taxes-and-provider-rounding");
  const billingModeSupported = rateCard.billingMode === "on-demand" || rateCard.billingMode === "batch";
  const complete = cachedInput !== null && requests !== null && billingModeSupported;
  const total = complete ? uncachedInput + cachedInput + output + requests : null;
  return {
    provider, modelId, region, billingMode: rateCard.billingMode, currency,
    rateCardVerifiedAt: new Date(verifiedAt).toISOString(), sourceUrl: source.toString(),
    usage: { inputTokens, uncachedInputTokens, cachedInputTokens, outputTokens, requestCount },
    breakdown: { uncachedInput, cachedInput, output, requests },
    total, complete, warnings
  };
}
