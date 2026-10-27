# Model integrations and model-specific guidance

Provider instructions and model-family profiles are workflow guidance, not platform policies or proof of capabilities. See [the cross-provider onboarding guide](INTEGRATE_AIFIAR.md) for instructions to add AIFIAR to an AI product or model workflow. The core must not assume all providers share context limits, tools, pricing, authentication, retention, or response formats.

## Current model/provider guidance

- `models/gpt/`: shared GPT workflow guidance plus advisory GPT-5, GPT-5.5, GPT-5.6, GPT-6, and Astra profiles.
- `models/grok/`: Grok-specific AIFIAR workflow guidance.
- `models/qwen/`: general Qwen workflow for deep analysis, reading, research, online source checking when tools are available, and evidence synthesis.
- `models/qwen-code/`: Qwen Code/Qwen-Coder workflow for coding, large patches, testing, and long multi-file integrations.\n- `languages/<language>/qwen/` and `languages/<language>/qwen-code/`: separate language-specific workflows for Qwen analysis and Qwen Code implementation across all supported languages.
- `models/openai/`: OpenAI adapter workflow notes.
- `models/xai/`: xAI adapter workflow notes.
- `models/anthropic/`: Anthropic/Claude integration guidance.
- `models/gemini/`: Google Gemini integration guidance.
- `models/local/`: local and self-hosted runtime guidance.
- `models/PROVIDER_TEMPLATE.md`: starting point for future provider integrations.

## Runtime status

The implemented HTTP adapters cover OpenAI Chat Completions, OpenAI Responses, xAI's OpenAI-compatible endpoint, Anthropic Messages, Gemini generateContent, and Qwen-compatible Chat Completions. Qwen and Qwen Code use separate configured model IDs against the same host-configured compatible endpoint. Generic local runtimes still have guidance only. Gemini has a native text-only generateContent adapter with safety-aware response parsing and bounded model discovery. A provider's presence in documentation does not make it selectable in the runtime. Qwen's text-only adapter does not enable web search, browser access, provider tools, or code execution.

The language instruction resolver supports separate `qwen` and `qwen-code` identifiers. This injects the matching language rules; it does not add a new runtime API mode or change provider capabilities.\n\nThe runtime registry must use actual configured IDs and verified capabilities. Do not guess the active ChatGPT model family from plan, UI, or account assumptions. If the model is unknown, use the shared GPT profile only.