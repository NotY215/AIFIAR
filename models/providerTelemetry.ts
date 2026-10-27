export interface ProviderTelemetryEvent {
  provider: string;
  modelId: string;
  outcome: "success" | "failure";
  elapsedMs: number;
  attempt: number;
  status?: number;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  estimatedCost?: number;
  costCurrency?: string;
  rateCardVerifiedAt?: string;
  rateLimit?: { limit?: number; remaining?: number; reset?: string; retryAfterMs?: number };
}

export interface ProviderTelemetrySink {
  record(event: ProviderTelemetryEvent): void;
}

export interface CostTelemetrySummary {
  knownCalls: number;
  unknownCalls: number;
  complete: boolean;
  byCurrency: Record<string, number>;
}

export class InMemoryProviderTelemetry implements ProviderTelemetrySink {
  private readonly events: ProviderTelemetryEvent[] = [];

  constructor(private readonly maxEvents = 1000) {
    if (!Number.isInteger(maxEvents) || maxEvents < 1 || maxEvents > 100_000) {
      throw new Error("maxEvents must be between 1 and 100000.");
    }
  }

  record(event: ProviderTelemetryEvent): void {
    if (!Number.isFinite(event.elapsedMs) || event.elapsedMs < 0 || !Number.isInteger(event.attempt) || event.attempt < 1) return;
    for (const value of [event.inputTokens, event.outputTokens, event.totalTokens, event.estimatedCost]) {
      if (value !== undefined && (!Number.isFinite(value) || value < 0)) return;
    }
    if (event.estimatedCost !== undefined) {
      if (!event.costCurrency?.trim() || !event.rateCardVerifiedAt || !Number.isFinite(Date.parse(event.rateCardVerifiedAt))) return;
    } else if (event.costCurrency !== undefined || event.rateCardVerifiedAt !== undefined) {
      return;
    }
    this.events.push({
      ...event,
      ...(event.rateLimit ? { rateLimit: { ...event.rateLimit } } : {})
    });
    if (this.events.length > this.maxEvents) this.events.splice(0, this.events.length - this.maxEvents);
  }

  snapshot(): ProviderTelemetryEvent[] {
    return this.events.map((event) => ({ ...event, ...(event.rateLimit ? { rateLimit: { ...event.rateLimit } } : {}) }));
  }

  summary(): {
    calls: number;
    successes: number;
    failures: number;
    averageLatencyMs: number;
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  } {
    const calls = this.events.length;
    return {
      calls,
      successes: this.events.filter((event) => event.outcome === "success").length,
      failures: this.events.filter((event) => event.outcome === "failure").length,
      averageLatencyMs: calls ? this.events.reduce((sum, event) => sum + event.elapsedMs, 0) / calls : 0,
      inputTokens: this.events.reduce((sum, event) => sum + (event.inputTokens ?? 0), 0),
      outputTokens: this.events.reduce((sum, event) => sum + (event.outputTokens ?? 0), 0),
      totalTokens: this.events.reduce((sum, event) => sum + (event.totalTokens ?? 0), 0)
    };
  }

  costSummary(): CostTelemetrySummary {
    const known = this.events.filter((event) => event.estimatedCost !== undefined && event.costCurrency !== undefined);
    const byCurrency: Record<string, number> = {};
    for (const event of known) {
      const currency = event.costCurrency!;
      byCurrency[currency] = (byCurrency[currency] ?? 0) + event.estimatedCost!;
    }
    return {
      knownCalls: known.length,
      unknownCalls: this.events.length - known.length,
      complete: this.events.length > 0 && known.length === this.events.length,
      byCurrency
    };
  }
}
