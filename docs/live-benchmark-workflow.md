# Approved live provider benchmark workflow

`core/providerBenchmarkWorkflow.ts` coordinates a paid/live benchmark in a deliberate order:

1. Require explicit caller-provided consent.
2. Confirm the selected provider/model is registered and currently configured.
3. Validate per-trial token ceilings and the adapter's configured output cap.
4. Calculate a worst-case request count using corpus cases, repetitions, and the configured maximum adapter attempts.
5. Estimate worst-case input/output usage from host-supplied per-trial token ceilings and a matching, fresh, explicit rate card.
6. Require a complete estimate with every usage category priced, a matching budget currency, and an estimate at or below the user's approved budget.
7. Call the host's explicit cost-approval callback.
8. Only after approval, execute the benchmark.
9. Optionally persist the redacted report through the separately consent-gated BenchmarkEvidenceStore.

## Important limits

The estimate is only as conservative as the host-supplied token ceilings and rate card. It is not an invoice or spend guarantee. Actual provider tokenization, internal retries, billing rules, hidden fees, and provider usage accounting may differ. Use rate cards sourced from official provider pricing pages, record the source URL and verification timestamp, and refresh within the configured freshness window.

The workflow cannot obtain user consent by itself. The host must collect it in a clear UI and pass `consentGranted: true` only after the user opts in. The approval callback must represent an actual host approval, not a hard-coded `true` in production. Keep live tests opt-in and never put credentials in benchmark corpora.

If the evidence store is omitted or disabled, the report is returned to the caller but is not durably stored. If storage fails after a benchmark completes, the workflow returns the completed report plus a persistence blocker rather than hiding the completed spend.

## Example

```ts
const report = await runApprovedProviderBenchmark({
  runtime,
  corpus,
  provider: "openai",
  modelId: "configured-model-id",
  consentGranted: consentFromUserInterface,
  maxInputTokensPerTrial: hostInputTokenCeiling,
  maxOutputTokensPerTrial: 1024,
  rateCard: verifiedRateCard,
  approvedBudget: { amount: 0.25, currency: "USD" },
  approveCost: estimate => hostApprovalDialog(estimate),
  evidenceStore
});
```

Do not copy the example's values as universal defaults. Model IDs, token ceilings, prices, regions, and budgets must come from the host's real configuration and verified sources.
