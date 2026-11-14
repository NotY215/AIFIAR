# Provider runtime configuration

AIFIAR resolves resource limits independently for each configured provider. These settings control the adapter's request budget. They do not describe the model's context window, guarantee a maximum completion length, or enable provider features.

## Supported settings

Each provider supports the same four host-controlled limits:

| Setting | Default | Allowed range | Meaning |
|---|---:|---:|---|
| `TIMEOUT_MS` | 45,000 | 1,000–180,000 | Maximum request duration before abort |
| `MAX_OUTPUT_TOKENS` | 2,048 | 1–32,768 | Adapter request output cap, interpreted by the provider API |
| `MAX_INPUT_BYTES` | 131,072 | 1,024–2,097,152 | Maximum serialized task payload before redaction/transmission |
| `MAX_ATTEMPTS` | 2 | 1–3 | Total attempts including the first request |

Provider-specific environment variables use this pattern:

```text
AIFIAR_<PROVIDER>_TIMEOUT_MS
AIFIAR_<PROVIDER>_MAX_OUTPUT_TOKENS
AIFIAR_<PROVIDER>_MAX_INPUT_BYTES
AIFIAR_<PROVIDER>_MAX_ATTEMPTS
```

Supported provider names are `OPENAI`, `XAI`, `ANTHROPIC`, `GEMINI`, `QWEN`, `QWEN_CODE`, and `LOCAL`. A global `AIFIAR_DEFAULT_<SETTING>` value can set a fallback for providers without an override. Qwen Code inherits Qwen's setting when no Qwen Code-specific value exists. Precedence is provider-specific, family fallback, global fallback, then built-in default.

Invalid values fail runtime construction. Values are parsed as decimal integers and are never silently clamped.

## Examples

OpenAI Responses API with a longer bounded output:

```bash
export OPENAI_API_KEY='from-your-secret-manager'
export AIFIAR_OPENAI_API_MODE='responses'
export AIFIAR_OPENAI_RESPONSES_MODEL='your-enabled-model-id'
export AIFIAR_OPENAI_TIMEOUT_MS='90000'
export AIFIAR_OPENAI_MAX_OUTPUT_TOKENS='4096'
```

Anthropic Claude with a tighter request budget:

```bash
export ANTHROPIC_API_KEY='from-your-secret-manager'
export AIFIAR_ANTHROPIC_MODEL='your-enabled-model-id'
export AIFIAR_ANTHROPIC_TIMEOUT_MS='60000'
export AIFIAR_ANTHROPIC_MAX_ATTEMPTS='1'
```

Gemini:

```bash
export GEMINI_API_KEY='from-your-secret-manager'
export AIFIAR_GEMINI_MODEL='your-enabled-model-id'
export AIFIAR_GEMINI_MAX_OUTPUT_TOKENS='4096'
```

Qwen research and Qwen Code share the configured DashScope endpoint and credential but may use independent resource settings:

```bash
export DASHSCOPE_API_KEY='from-your-secret-manager'
export AIFIAR_QWEN_BASE_URL='https://your-region-compatible-endpoint/v1'
export AIFIAR_QWEN_MODEL='your-research-model-id'
export AIFIAR_QWEN_CODE_MODEL='your-coding-model-id'
export AIFIAR_QWEN_MAX_OUTPUT_TOKENS='4096'
export AIFIAR_QWEN_CODE_MAX_OUTPUT_TOKENS='8192'
```

xAI and local endpoints use the same limits. Local endpoints still require HTTPS unless the endpoint is loopback; remote local endpoints require an explicit API key.

## API-specific interpretation

- OpenAI Chat Completions and xAI/Qwen/local compatible adapters send `max_tokens`.
- OpenAI Responses sends `max_output_tokens`.
- Anthropic Messages sends `max_tokens`.
- Gemini generateContent sends `generationConfig.maxOutputTokens`.
- Timeout, input-byte, and attempt limits are enforced in the adapter/runtime independently of the provider's own quotas.
- The runtime currently uses conservative text-only request parameters. Reasoning effort, tools, multimodal input, structured outputs, streaming, and provider-specific search are not enabled merely by setting these limits.

See [provider-settings.schema.json](../models/provider-settings.schema.json) for the machine-readable bounds and [providerSettings.ts](../models/providerSettings.ts) for resolution and validation.
