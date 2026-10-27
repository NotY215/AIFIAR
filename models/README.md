# Model integrations and model-specific guidance

Provider instructions and model-family profiles are workflow guidance, not platform policies or proof of capabilities. The core must not assume all providers share context limits, tools, pricing, authentication, retention, or response formats.

## Current model/provider guidance

- `models/gpt/`: shared GPT workflow guidance plus advisory GPT-5, GPT-5.5, GPT-5.6, GPT-6, and Astra profiles.
- `models/grok/`: Grok-specific AIFIAR workflow guidance.
- `models/openai/`: OpenAI adapter workflow notes.
- `models/xai/`: xAI adapter workflow notes.
- `models/anthropic/`: Anthropic/Claude integration guidance.
- `models/gemini/`: Google Gemini integration guidance.
- `models/local/`: local and self-hosted runtime guidance.
- `models/PROVIDER_TEMPLATE.md`: starting point for future provider integrations.

## Runtime status

The implemented HTTP adapters currently cover OpenAI Chat Completions, OpenAI Responses, and xAI's OpenAI-compatible endpoint. Anthropic, Gemini, and generic local runtimes have guidance only until their adapters and tests exist. A provider's presence in documentation does not make it selectable in the runtime.

The runtime registry must use actual configured IDs and verified capabilities. Do not guess the active ChatGPT model family from plan, UI, or account assumptions. If the model is unknown, use the shared GPT profile only.