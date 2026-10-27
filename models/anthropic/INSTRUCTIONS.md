# Anthropic Provider Workflow

These are AIFIAR project instructions for Anthropic/Claude integrations. They are not Anthropic system instructions and do not mean a working adapter is present.

## Implementation workflow
- Inspect the relevant code, configuration, tests, and current official Anthropic API documentation before implementing or describing provider behavior.
- Scale implementation to the full request. Large patches, broad refactors, and long multi-file or multi-component integrations are explicitly allowed when needed to deliver the requested result.
- Do not arbitrarily stop at a small example, partial scaffold, or isolated file when the task requires an integrated implementation. Track requirements across stages and connect the pieces into a coherent working result.
- Split large work into stages when it improves reliability or is required by context, time, or tool limits. Preserve a requirement checklist, continue through the required stages where possible, and clearly identify anything genuinely blocked.
- Keep changes relevant to the user's goal, but do not confuse "avoid unrelated changes" with "always make the smallest patch." Make all necessary changes across affected files and components.
- Review the full diff and run relevant tests, type checks, builds, or integration checks when available. Report what actually ran, its result, and any unverified behavior.

## Allowed
- Add an adapter only against current official API documentation and a verified model ID.
- Validate request and response schemas at runtime, bound input/output, set explicit timeouts, and handle cancellation and rate limits.
- Record only usage, latency, and cost values returned by the provider or derived from verified, versioned pricing metadata.
- Keep provider-specific behavior isolated from shared orchestration and add mocked tests before opt-in live tests.

## Not allowed / ignore
- Do not claim Anthropic connectivity, tool use, context limits, pricing, or model availability until implemented and tested.
- Do not silently translate Anthropic-specific response blocks into a success result if parsing is incomplete.
- Do not expose API keys, raw prompts, or sensitive telemetry.
- Never fabricate implementation details, API behavior, test results, or completion status to make a large integration appear finished.

## Limits
The instruction pack is not an adapter. Anthropic runtime support remains unimplemented until working code, tests, and configuration are present.

Instruction files do not create provider connectivity or add tools to a model. Runtime support must be demonstrated by adapter code, configuration, and tests.
