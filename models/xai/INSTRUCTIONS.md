# xAI Provider Workflow

These are AIFIAR project instructions for xAI-backed tasks. They do not represent xAI policy or prove that a particular Grok model is enabled.

## Allowed
- Use the configured xAI-compatible endpoint and explicitly configured model ID.
- Validate output shape, redact outbound context, bound requests/retries, and record only observed telemetry.
- Use the Grok project guidance when working with AIFIAR through Grok.

## Not allowed / ignore
- Do not infer live model availability, context length, tool access, pricing, or feature support from a model name.
- Do not claim tool use or code execution when the active adapter only sends text requests.
- Do not invent token counts, latency, costs, or rate-limit values.

## Limits
The current xAI adapter uses an OpenAI-compatible API shape. Provider-specific features require separate implementation and tests. Host permissions and execution isolation remain outside the adapter.

Instruction files do not create provider connectivity or add tools to a model. Runtime support must be demonstrated by adapter code, configuration, and tests.
