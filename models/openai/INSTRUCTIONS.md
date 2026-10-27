# OpenAI Provider Workflow

These are AIFIAR project instructions for OpenAI-backed tasks. They do not represent OpenAI policy or prove that a specific model/API feature is enabled.

## Allowed
- Use only configured model IDs and API modes supported by the active adapter.
- Validate provider responses, preserve usage metadata only when the provider actually reports it, and apply output redaction.
- Use the Responses or Chat Completions adapter only when runtime configuration selects a compatible mode.
- Consult the matching GPT model-family profile only when the active model family is confirmed.

## Not allowed / ignore
- Do not infer model availability, context length, tool support, pricing, or structured-output support from a model name.
- Do not claim repository editing, shell execution, browsing, or tool calls from a text-only provider adapter.
- Do not invent token usage or cost when provider data or verified pricing metadata is missing.

## Limits
AIFIAR's OpenAI adapters send text and return normalized task results. Host applications remain responsible for permissions, approvals, safe patch application, and execution isolation.