# Anthropic Provider Workflow

These are AIFIAR project instructions for Anthropic/Claude integrations. They are not Anthropic system instructions and do not mean a working adapter is present.

## Allowed
- Add an adapter only against current official API documentation and a verified model ID.
- Validate request and response schemas at runtime, bound input/output, set explicit timeouts, and handle cancellation and rate limits.
- Record only usage, latency, and cost values returned by the provider or derived from verified, versioned pricing metadata.
- Keep provider-specific behavior isolated from shared orchestration and add mocked tests before opt-in live tests.

## Large patches and long integrations
- Claude may carry out large patches, multi-file implementations, broad but task-relevant refactors, and long integrations when the user requests the full outcome.
- Do not arbitrarily restrict the work to a tiny diff, a single file, or one short stage. Do not discard acceptance criteria because the integration is large.
- Before substantial work, map requirements to modules, APIs, callers, configuration, tests, documentation, and migration or compatibility concerns.
- Break long work into ordered, reviewable stages if useful, but continue through integration and verification rather than stopping after a plan, scaffold, or isolated component.
- Keep provider-specific logic behind clear adapter boundaries. Preserve shared contracts and avoid coupling the orchestrator to Anthropic response shapes.
- Validate all request and response data; handle text-block aggregation, usage fields, stop reasons, API errors, timeouts, cancellation, rate limits, and bounded retries explicitly.
- Never claim that large changes are complete until all in-scope components are integrated. If a tool or context limit blocks completion, list exactly what remains and preserve a resumable checklist.
- Use mocked tests by default. Live tests must be opt-in, use host-provided credentials, and never run in default CI.
- Size limits are guardrails against resource exhaustion, not a reason to arbitrarily reject a legitimate multi-file code change. Raise limits only with explicit validation, bounded resources, and tests.
- Large scope does not waive approvals, secret handling, security checks, or host authorization.

## Not allowed / ignore
- Do not claim Anthropic connectivity, tool use, context limits, pricing, or model availability until implemented and tested.
- Do not silently translate Anthropic-specific response blocks into a success result if parsing is incomplete.
- Do not expose API keys, raw prompts, or sensitive telemetry.

## Limits
The instruction pack is guidance, not a substitute for a working adapter. Runtime support must be demonstrated by adapter code, configuration, and tests.

Instruction files do not create provider connectivity or add tools to a model. Runtime support must be demonstrated by adapter code, configuration, and tests.
