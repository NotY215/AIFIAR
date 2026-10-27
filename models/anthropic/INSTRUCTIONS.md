# Anthropic Provider Workflow

These are AIFIAR project instructions for Anthropic/Claude integrations. They are not Anthropic system instructions and do not mean a working adapter is present.

## Allowed
- Add an adapter only against current official API documentation and a verified model ID.
- Validate request and response schemas at runtime, bound input/output, set explicit timeouts, and handle cancellation and rate limits.
- Record only usage, latency, and cost values returned by the provider or derived from verified, versioned pricing metadata.
- Keep provider-specific behavior isolated from shared orchestration and add mocked tests before opt-in live tests.

## Not allowed / ignore
- Do not claim Anthropic connectivity, tool use, context limits, pricing, or model availability until implemented and tested.
- Do not silently translate Anthropic-specific response blocks into a success result if parsing is incomplete.
- Do not expose API keys, raw prompts, or sensitive telemetry.

## Limits
The instruction pack is not an adapter. Anthropic runtime support remains unimplemented until working code, tests, and configuration are present.